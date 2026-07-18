#!/bin/bash
# Writer watchdog — the durable half of the 2026-07-18 fix.
#
# The single-writer (siftersearch-worker) can DEADLOCK with its event loop frozen: pm2 still reports "online"
# (the process is alive), but its /write endpoint never responds. pm2 cannot see this, so it never restarts —
# the incident ran 40 min with the writer wedged, the grounding queue frozen, DeepSeek calls wasted.
#
# This probes the writer's /health (added to unified-worker.js: touches the DB, so a frozen loop or wedged
# connection both fail to answer). Three consecutive unresponsive checks ~12s apart → the writer is hung →
# pm2-restart it. Run by cron every minute; independent of both API and worker so a hang in either can't
# disable the watchdog. Pairs with the db.js fail-fast (books abort→auto-retry on writer-down), so a restart
# here lets the requeued books resume automatically — no operator, no waste.
set -u
URL="http://127.0.0.1:7849/health"
LOG="$HOME/sifter/siftersearch/logs/writer-watchdog.log"
mkdir -p "$(dirname "$LOG")"

fails=0
for i in 1 2 3; do
  if curl -sf --max-time 5 "$URL" >/dev/null 2>&1; then
    fails=0
    break
  fi
  fails=$((fails + 1))
  [ "$i" -lt 3 ] && sleep 12
done

if [ "$fails" -ge 3 ]; then
  echo "$(date -u +%FT%TZ) writer /health unresponsive x3 → pm2 restart siftersearch-worker" >> "$LOG"
  pm2 restart siftersearch-worker >> "$LOG" 2>&1
  echo "$(date -u +%FT%TZ) restart issued (exit $?)" >> "$LOG"
fi
