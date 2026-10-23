#!/bin/bash
# UPS POWER MODE (Chad 10-23: the battery is for an EMERGENCY; on battery, make it SAFE TO LOSE POWER and keep serving reads).
# Called by NUT's upssched (deploy/nut/upssched-cmd, as chad via sudoers). Runbook: planning/db-write-path-20261023.md § UPS.
#   enter   [--grace S]  on battery ≥ 10 s (upssched debounce): drain writers → read-only → flush everything held in RAM
#   resume               mains back and stable 60 s: RAM state reloaded if lost → flag cleared → writers resume
#   status               the flag + the UPS status
# INERT until a UPS is detected: no `upsc`, or `upsc` cannot read the UPS → exit 0, nothing done. Each action re-checks the
# live UPS status (enter needs OB, resume needs OL — a second debounce). SIFTER_UPS_FORCE=1 skips both checks (drills).
# The flag is power-mode.js's file: every service honours it (api/lib/power-mode.js). Env overrides exist for tests only.
set -u
ROOT=${SIFTER_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
POWER_FILE=${SIFTER_POWER_FILE:-/dev/shm/sifter-power.json}
UPS=${SIFTER_UPS:-tower@localhost}
UPSC=${SIFTER_UPSC:-upsc}
PM2=${SIFTER_PM2:-pm2}
WRITER=${SIFTER_WRITER_URL:-http://127.0.0.1:7849}
GRACE=${SIFTER_UPS_GRACE:-60}            # longest wait for the drain before writes are refused
QUIET_MS=${SIFTER_UPS_QUIET_MS:-5000}    # …or sooner, once content writes have been quiet this long
DB_SHIP=${SIFTER_DB_SHIP:-$ROOT/scripts/ops/db-ship.sh}
MAIL=${SIFTER_UPS_MAIL:-$ROOT/scripts/ops/ups-mail.mjs}
QRAM_URL=${QRAM_URL:-http://127.0.0.1:6335}
# runService services drain + park on the flag by themselves; SIGHUP makes the drain immediate (the deploy drain)
DRAIN_APPS=${SIFTER_UPS_DRAIN_APPS:-"siftersearch-indexer siftersearch-media siftersearch-reports siftersearch-reports-carry"}
# writers without the park: stopped (SIGINT drain, their kill_timeout) and started again on resume
STOP_APPS=${SIFTER_UPS_STOP_APPS:-"siftersearch-embedding siftersearch-deep-research siftersearch-audit siftersearch-library-watcher"}
SLEEP=${SIFTER_UPS_SLEEP:-sleep}

log() { echo "$(date -u +%FT%TZ) ups-power: $*" >&2; logger -t ups-power "$*" 2>/dev/null || true; }
mail() { [ -f "$MAIL" ] && ( node "$MAIL" "$@" >/dev/null 2>&1 || true ) & }
ups_status() { command -v "$UPSC" >/dev/null 2>&1 || return 1; "$UPSC" "$UPS" ups.status 2>/dev/null; }
mode() { [ -f "$POWER_FILE" ] && node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).mode||"")}catch{}' "$POWER_FILE"; }
field() { node -e 'try{const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]];console.log(Array.isArray(v)?v.join(" "):v??"")}catch{}' "$POWER_FILE" "$1"; }
# write the flag atomically: mode, reason, since (kept), stopped apps, flushed_at
write_flag() {   # mode reason stopped flushed_at
  local tmp="$POWER_FILE.tmp.$$" since
  since=$(field since 2>/dev/null); [ -n "$since" ] || since=$(date -u +%FT%TZ)
  node -e 'const [f,mode,reason,since,stopped,flushed]=process.argv.slice(1);require("fs").writeFileSync(f,JSON.stringify({mode,reason,since,stopped:stopped?stopped.split(" ").filter(Boolean):[],...(flushed?{flushed_at:flushed}:{})})+"\n")' \
    "$tmp" "$1" "$2" "$since" "$3" "${4:-}" && chmod 644 "$tmp" && mv -f "$tmp" "$POWER_FILE"
}
online_apps() {   # the given apps that pm2 shows online
  "$PM2" jlist 2>/dev/null | node -e 'const want=new Set(process.argv.slice(1));let a=[];try{a=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{}
    console.log([...new Set(a.filter(p=>want.has(p.name)&&p.pm2_env?.status==="online").map(p=>p.name))].join(" "))' $1
}
writer_quiet_ms() { curl -s -m 5 "$WRITER/power" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(j.quiet_ms??999999)}catch{console.log(999999)}'; }

detect() {   # → 0 when a UPS answers (or forced); prints its status
  [ "${SIFTER_UPS_FORCE:-0}" = 1 ] && { echo "FORCED"; return 0; }
  local st; st=$(ups_status) || { log "no UPS detected ($UPSC $UPS) — inert"; return 1; }
  echo "$st"
}

cmd_enter() {
  local st; st=$(detect) || exit 0
  if [ "$st" != FORCED ] && ! grep -qw OB <<<"$st"; then log "enter: UPS reads '$st' (not on battery) — power came back before the debounce; nothing to do"; exit 0; fi
  if [ "$(mode)" = readonly ] && [ -n "$(field flushed_at)" ]; then log "enter: already read-only and flushed at $(field flushed_at)"; exit 0; fi
  log "enter: on battery ($st) — draining writers"
  mail readonly "tower ON BATTERY — read-only mode" "Mains lost for 10 s. Writers draining, RAM state being flushed to disk; search keeps serving."
  local stopped; stopped=$( [ "$(mode)" = "" ] || field stopped )
  write_flag draining "UPS on battery ($st)" "$stopped"
  # 1. stop all write activity, cleanly
  local drain; drain=$(online_apps "$DRAIN_APPS")
  for a in $drain; do "$PM2" sendSignal SIGHUP "$a" >/dev/null 2>&1 && log "SIGHUP $a (drain)"; done
  local stop; stop=$(online_apps "$STOP_APPS")
  for a in $stop; do "$PM2" stop "$a" >/dev/null 2>&1 && log "stopped $a"; done
  stopped=$(echo "$stopped $stop" | xargs -n1 2>/dev/null | sort -u | xargs)
  write_flag draining "UPS on battery ($st)" "$stopped"
  # 2. let the jobs in hand save their resume points: until content writes go quiet, at most GRACE s
  local waited=0
  while [ "$waited" -lt "$GRACE" ]; do
    [ "$waited" -ge 3 ] && [ "$(writer_quiet_ms)" -ge "$QUIET_MS" ] && break
    $SLEEP 1; waited=$((waited + 1))
  done
  log "drain: ${waited}s"
  # 3. writes refused from here on
  write_flag readonly "UPS on battery ($st)" "$stopped"
  # 4. flush everything held in RAM to disk
  local ok=1 r
  r=$(curl -s -m 120 -X POST "$WRITER/power/flush") && log "writer flush: $r" || { log "writer flush FAILED: $r"; ok=0; }
  if systemctl cat qram-flush.service >/dev/null 2>&1 || [ -n "${SIFTER_UPS_FORCE_QRAM:-}" ]; then
    sudo -n systemctl start qram-flush.service && log "qdrant-hot flushed (RAM disk → snapshots)" || { log "qram flush FAILED"; ok=0; }
  fi
  sudo -n zpool sync && log "zpool sync" || log "zpool sync failed (txg commits within 10 s anyway)"
  "$DB_SHIP" && log "db-ship done" || { log "db-ship FAILED"; ok=0; }
  [ "$ok" = 1 ] || mail readonly-flush "tower read-only: a flush step FAILED" "See journalctl -t ups-power. Reads keep serving."
  write_flag readonly "UPS on battery ($st)" "$stopped" "$(date -u +%FT%TZ)"
  log "read-only; flushed (ok=$ok). Losing power now loses nothing."
}

cmd_resume() {
  local st; st=$(detect) || exit 0
  if [ "$st" != FORCED ] && { grep -qw OB <<<"$st" || ! grep -qw OL <<<"$st"; }; then log "resume: UPS reads '$st' — not stable on mains; staying read-only"; exit 0; fi
  [ -f "$POWER_FILE" ] || { log "resume: not in power mode"; exit 0; }
  local stopped; stopped=$(field stopped)
  # RAM state: qdrant-hot keeps its RAM disk while we stay up; if it is not answering (restarted, RAM lost) restart it —
  # its start restores from the newest snapshot (qram-restore)
  if systemctl cat qdrant-hot.service >/dev/null 2>&1; then
    curl -s -m 5 "$QRAM_URL/healthz" >/dev/null || { log "qdrant-hot not answering — restarting (restores from snapshot)"; sudo -n systemctl restart qdrant-hot.service; }
  fi
  rm -f "$POWER_FILE" && log "resume: flag cleared — writes accepted, parked services starting"
  for a in $stopped; do "$PM2" start "$a" >/dev/null 2>&1 && log "started $a"; done
  mail online "tower back on mains — writers resumed" "Read-only mode ended; stopped services restarted: ${stopped:-none}."
}

cmd_status() { echo "flag: $(cat "$POWER_FILE" 2>/dev/null || echo 'none (normal)')"; echo "ups: $(ups_status || echo 'not detected')"; }

case "${1:-}" in
  enter) shift; [ "${1:-}" = --grace ] && GRACE=$2; cmd_enter ;;
  resume) cmd_resume ;;
  status) cmd_status ;;
  *) echo "usage: ups-power.sh enter [--grace S] | resume | status" >&2; exit 2 ;;
esac
