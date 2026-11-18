#!/usr/bin/env bash
# Drive the server photo repairs after a deploy (1.4.0+):
#   tempt-me {action:"rephoto"}  — re-find / check the challenge pool photos (Sonnet 5.5, system cost)
#   dish-photo {action:"repair"} — re-check cached dish photos, web search + save to dish_photos
#   photo-review {action:"review-submit"} / {action:"review-collect"} — the nightly batched review of reported photos (pg_cron runs
#     it at 02:00 Asia/Ho_Chi_Minh; these modes run it by hand):
#       review         gather + submit tonight's batch (reported photos), then wait for the results and apply them
#       review-new     the same, also pool items that never had a photo (include needPhoto); caps from MAX_DISHES / MAX_USD
#                      (e.g. MAX_DISHES=300 MAX_USD=3 scripts/photo-repair.sh review-new); AGAIN=1 for a second run the same night
#       review-collect only wait for / apply the submitted batches (hourly by cron anyway)
#       review-status  the last batches
# Usage: scripts/photo-repair.sh [tempt|dish|both|review|review-new|review-collect|review-status]   (default both)
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

review_body() {
  local extra=""
  [ "$1" = new ] && extra="$extra,\"include\":\"needPhoto\""
  [ -n "${MAX_DISHES:-}" ] && extra="$extra,\"maxDishes\":$MAX_DISHES"
  [ -n "${MAX_USD:-}" ] && extra="$extra,\"maxUsd\":$MAX_USD"
  [ "${AGAIN:-}" = 1 ] && extra="$extra,\"again\":true"
  echo "{\"action\":\"review-submit\"$extra}"
}
rsumm() { python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print("bad response"); sys.exit(0)
print({k:d.get(k) for k in ("step","night","gathered","noPhoto","failed","webRequests","webCostUsd","inDraft","remaining","submitted","batchId","estUsd","already","busy","pending","batches","done","error") if k in d})'; }
case "$WHAT" in
  review|review-new)
    echo "== photo-review submit"
    BODY=$(review_body "${WHAT#review-}")
    for i in $(seq 1 60); do
      R=$(call photo-review "$BODY") || { sleep 5; continue; }
      echo "$R" | rsumm
      echo "$R" | grep -q '"busy"' && { sleep 30; continue; }
      echo "$R" | grep -q '"done":true' && break
      AGAIN=""; BODY=$(review_body "${WHAT#review-}")
      sleep 2
    done
    WHAT=review-collect ;;
esac
case "$WHAT" in
  review-collect)
    echo "== photo-review collect (every 5 min until no batch is pending, at most 26 h)"
    for i in $(seq 1 312); do
      R=$(call photo-review '{"action":"review-collect"}') || { sleep 30; continue; }
      echo "$R" | rsumm
      echo "$R" | grep -q '"done":true' && break
      sleep 300
    done
    exit 0 ;;
  review-status)
    call photo-review '{"action":"review-status"}'; echo; exit 0 ;;
esac

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
