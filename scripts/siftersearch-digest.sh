#!/bin/bash
# Hourly grounding-progress digest. Emails what fully grounded in the last window (author/title/description +
# people grounded + net-new people + plan position). Tracks the window upper bound in a state file so windows are
# CONTIGUOUS across API restarts — no gaps, no double-reporting. POSTs the internal endpoint, which only sends when
# ≥1 book finished. Cron: 0 * * * * (hourly). Independent of the API/worker.
set -u
cd "$HOME/sifter/siftersearch" || exit 0
SEC=$(grep -hoP "^DEPLOY_SECRET=\K.*" .env-secrets .env-public 2>/dev/null | head -1)
STATE="$HOME/sifter/siftersearch/logs/digest-last.txt"
LOG="$HOME/sifter/siftersearch/logs/digest.log"
mkdir -p "$(dirname "$LOG")"

SINCE=$(cat "$STATE" 2>/dev/null)
[ -z "$SINCE" ] && SINCE=$(( $(date +%s) - 3600 ))   # first run → cover the last hour

RESP=$(curl -s --max-time 90 -X POST -H "X-Internal-Key: $SEC" -H "content-type: application/json" \
  -d "{\"since\":$SINCE}" http://127.0.0.1:7839/api/admin/grounding/digest 2>/dev/null)
NOW=$(echo "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('now',''))" 2>/dev/null)

# Advance the window ONLY on a successful response, so a transient API outage retries the same window next hour.
[ -n "$NOW" ] && echo "$NOW" > "$STATE"
echo "$(date -u +%FT%TZ) since=$SINCE -> $RESP" >> "$LOG"
