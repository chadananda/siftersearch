#!/bin/bash
# Daily DeepSeek budget reset — $100/day, off-peak-only. Re-captures the spend baseline at local midnight so each
# calendar day allows up to $100 of grounding spend, concentrated in DeepSeek's cheap off-peak hours (offpeakOnly
# pauses the run during the peak-price windows). Cron: 0 7 * * * = 00:00 America/Phoenix (UTC-7, no DST).
set -u
cd "$HOME/sifter/siftersearch" || exit 0
SEC=$(grep -hoP "^DEPLOY_SECRET=\K.*" .env-secrets .env-public 2>/dev/null | head -1)
LOG="$HOME/sifter/siftersearch/logs/budget-daily.log"
mkdir -p "$(dirname "$LOG")"
RESP=$(curl -s --max-time 20 -X POST -H "X-Internal-Key: $SEC" -H "content-type: application/json" \
  -d '{"provider":"deepseek","ceilingUsd":100,"offpeakOnly":true}' \
  http://127.0.0.1:7839/api/admin/grounding/budget 2>/dev/null)
echo "$(date -u +%FT%TZ) reset -> $RESP" >> "$LOG"
