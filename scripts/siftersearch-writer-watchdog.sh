#!/bin/bash
# Writer watchdog — restarts the single-writer (siftersearch-worker) only when it is genuinely HUNG (event loop
# deadlocked: pm2 shows "online" but /write/​/health never answer). The 2026-07-18 incident ran 40 min wedged
# because pm2 can't see a frozen loop.
#
# IMPORTANT (2026-07-19 fix): the worker's /health touches the DB, and right after boot that is SLOW (6-12s: DB
# connection init + startup sync cycles) before it warms to ~2ms. An earlier 5s timeout + no grace period killed
# a healthy-but-warming worker every minute (52 restarts in a loop). So: (1) skip a worker that (re)started in the
# last GRACE seconds — it's still warming up; (2) use a generous per-probe timeout so a slow-but-working /health
# passes; only a worker that truly never answers (3 × long timeout) gets restarted. Run by cron every minute.
set -u
URL="http://127.0.0.1:7849/health"
LOG="$HOME/sifter/siftersearch/logs/writer-watchdog.log"
GRACE=240      # don't touch a worker up < 4 min (warming up / just restarted → avoids the loop)
TIMEOUT=15     # a real hang never answers in 15s; a slow-startup /health answers within it
mkdir -p "$(dirname "$LOG")"

# Uptime (seconds) of the ONLINE worker; -1 if not online (let pm2 handle a crash/boot).
UP=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys,time
w=[p for p in json.load(sys.stdin) if p['name']=='siftersearch-worker']
print(int((time.time()*1000-w[0]['pm2_env']['pm_uptime'])/1000) if w and w[0]['pm2_env']['status']=='online' else -1)" 2>/dev/null)
UP=${UP:--1}
[ "$UP" -lt 0 ] && exit 0            # not online → pm2 is already (re)starting it
[ "$UP" -lt "$GRACE" ] && exit 0     # still warming up → don't probe/restart yet

fails=0
for i in 1 2 3; do
  if curl -sf --max-time "$TIMEOUT" "$URL" >/dev/null 2>&1; then fails=0; break; fi
  fails=$((fails + 1)); [ "$i" -lt 3 ] && sleep 12
done

if [ "$fails" -ge 3 ]; then
  echo "$(date -u +%FT%TZ) writer /health unresponsive x3 (${TIMEOUT}s each, up ${UP}s) → pm2 restart siftersearch-worker" >> "$LOG"
  pm2 restart siftersearch-worker >> "$LOG" 2>&1
  echo "$(date -u +%FT%TZ) restart issued (exit $?)" >> "$LOG"
fi
