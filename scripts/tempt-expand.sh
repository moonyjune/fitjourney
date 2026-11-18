#!/usr/bin/env bash
# Drive the temptation pool's expand job after a deploy of tempt-me (1.5):
#   tempt-me {action:"expand"}  — tags for untagged items, new tagged items up to ~500, then a verified photo for each new item
#   tempt-me {action:"rephoto"} — reported-wrong photos first, then the photo audit (same as scripts/photo-repair.sh tempt)
# Usage: scripts/tempt-expand.sh [expand|tag|generate|photos|rephoto]   (default expand: all phases in order until done)
# Needs: supabase CLI logged in (linked project), .env with EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY.
# The cron secret is read from Vault (push_cron_secret) unless PUSH_CRON_SECRET is set, and never printed.
# The photo phase shares one lock with rephoto: while another picture job runs the step answers busy and this waits a minute.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-expand}"
URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"')
ANON=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
if [ -z "${PUSH_CRON_SECRET:-}" ]; then
  PUSH_CRON_SECRET=$(npx -y supabase@3.2.0 db query --linked --read-only -o json \
    "select decrypted_secret as s from vault.decrypted_secrets where name='push_cron_secret'" 2>/dev/null \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); r=d if isinstance(d,list) else d.get("rows",d.get("result",[])); print(r[0]["s"])')
fi
[ -n "$PUSH_CRON_SECRET" ] || { echo "no cron secret"; exit 1; }

call() { curl -sS -m 160 -X POST "$URL/functions/v1/tempt-me" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "x-cron-secret: $PUSH_CRON_SECRET" -H "content-type: application/json" -d "$1"; }
summ() { python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print("bad response"); sys.exit(0)
keys=("step","total","target","untagged","needPhoto","flagged","tagged","added","decided","processed","replaced","removed","remaining","busy","done","costUsd","poolCostUsd","error")
print({k:d.get(k) for k in keys if k in d})'; }

case "$MODE" in
  expand) BODY='{"action":"expand"}' ;;
  tag|generate|photos) BODY='{"action":"expand","phase":"'"$MODE"'"}' ;;
  rephoto) BODY='{"action":"rephoto","limit":6}' ;;
  *) echo "unknown mode $MODE"; exit 1 ;;
esac

echo "== tempt-me $MODE"
for i in $(seq 1 200); do
  R=$(call "$BODY") || { sleep 5; continue; }
  echo "$R" | summ
  echo "$R" | grep -q '"busy":true' && { sleep 60; continue; }
  echo "$R" | grep -q '"done":true' && break
  # A forced phase is done when its own count reaches 0.
  case "$MODE" in
    tag) echo "$R" | grep -q '"untagged":0' && break ;;
    photos) echo "$R" | grep -q '"needPhoto":0' && break ;;
    generate) echo "$R" | grep -q '"added":0' && break ;;
  esac
  echo "$R" | grep -q '"step":"none"' && break
  sleep 2
done
