#!/usr/bin/env bash
# Drive the server photo repairs after a deploy (1.4.0+):
#   tempt-me {action:"rephoto"}  — re-find / check the challenge pool photos (Sonnet 5.5, system cost)
#   dish-photo {action:"repair"} — re-check cached dish photos, web search + save to dish_photos
# Usage: scripts/photo-repair.sh [tempt|dish|both]   (default both)
# Needs: supabase CLI logged in (linked project), .env with EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY.
# The cron secret is read from Vault (push_cron_secret) and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
WHAT="${1:-both}"
REF=gngwfqgmhainhcfwzreq
URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"')
ANON=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
if [ -z "${PUSH_CRON_SECRET:-}" ]; then
  PUSH_CRON_SECRET=$(npx -y supabase@3.2.0 db query --linked --yes -o json \
    "select decrypted_secret as s from vault.decrypted_secrets where name='push_cron_secret'" 2>/dev/null \
    | python3 -c 'import sys,json; t=sys.stdin.read(); d=json.loads(t[t.index("{"):]); print(d["rows"][0]["s"])')
fi
[ -n "$PUSH_CRON_SECRET" ] || { echo "no cron secret"; exit 1; }

call() { curl -sS -m 160 -X POST "$URL/functions/v1/$1" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "x-cron-secret: $PUSH_CRON_SECRET" -H "content-type: application/json" -d "$2"; }
summ() { python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print("bad response"); sys.exit(0)
print({k:d.get(k) for k in ("processed","kept","replaced","removed","stillNone","failed","remaining","done","costUsd","error")})'; }

if [ "$WHAT" != dish ]; then
  echo "== tempt-me rephoto"
  for i in $(seq 1 80); do
    R=$(call tempt-me '{"action":"rephoto","limit":6}') || { sleep 5; continue; }
    echo "$R" | summ
    echo "$R" | grep -q '"busy"' && { sleep 60; continue; }
    echo "$R" | grep -q '"done":true' && break
    sleep 2
  done
fi
if [ "$WHAT" != tempt ]; then
  echo "== dish-photo repair"
  AFTER=""
  for i in $(seq 1 200); do
    BODY='{"action":"repair","limit":6'"${AFTER:+,\"after\":\"$AFTER\"}"'}'
    R=$(call dish-photo "$BODY") || { sleep 5; continue; }
    echo "$R" | summ
    echo "$R" | grep -q '"done":true' && break
    AFTER=$(echo "$R" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("next") or "")' 2>/dev/null || true)
    sleep 2
  done
fi
