#!/bin/bash
# NIGHT SCHEMA MAINTENANCE (10-24, Chad: dead indexes/triggers/tables go, "safely"). Runs the named steps of
# api/lib/repos/maintenance-repo.js (GET/POST /api/admin/ops/maintenance on siftersearch-ops) ONE AT A TIME, each inside a
# writer drain: power-mode flag `draining` (writes still land, no new work starts), runService apps SIGHUP-drained (they
# park until the flag clears), the other writers pm2-stopped, wait for the writer to go quiet → the step → flag cleared,
# writers started → a pause → the next. A DROP frees a whole b-tree inside the single writer (10-23: 17 s and 68 s).
#   db-maintenance.sh [--dry] [--only step1,step2] [--gap S] [--deadline HH:MM]   (--dry: print the plan, touch nothing)      results: logs/db-maintenance-<date>.jsonl
# Never starts while a power flag exists (a real UPS event wins). The trap clears its own flag on any exit.
set -u
ROOT=${SIFTER_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
cd "$ROOT" || exit 1
POWER_FILE=${SIFTER_POWER_FILE:-/dev/shm/sifter-power.json}
OPS=${SIFTER_OPS_URL:-http://127.0.0.1:7843}       # siftersearch-ops directly: a long DROP must not ride the gateway's timeouts
WRITER=${SIFTER_WRITER_URL:-http://127.0.0.1:7849}
PM2=${SIFTER_PM2:-pm2}
DRAIN_APPS="siftersearch-indexer siftersearch-media siftersearch-reports siftersearch-reports-carry"
STOP_APPS="siftersearch-embedding siftersearch-deep-research siftersearch-audit siftersearch-library-watcher"
GRACE=90 QUIET_MS=5000 GAP=120 LIGHT_GAP=20 ONLY="" DEADLINE="04:45" DRY=0
while [ $# -gt 0 ]; do case "$1" in --only) ONLY=$2; shift 2;; --gap) GAP=$2; shift 2;; --deadline) DEADLINE=$2; shift 2;; --dry) DRY=1; shift;; *) echo "unknown $1" >&2; exit 2;; esac; done
KEY=$(grep -h '^DEPLOY_SECRET=' .env-secrets 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
LOG="$ROOT/logs/db-maintenance-$(date +%Y%m%d).jsonl"
mkdir -p "$ROOT/logs"
note() { echo "$(date -u +%FT%TZ) db-maintenance: $*" >&2; logger -t db-maintenance "$*" 2>/dev/null || true; }
jl() { echo "$1" >> "$LOG"; }   # one JSON object per line
api() { curl -s -m "${3:-900}" -X "$1" -H "X-Internal-Key: $KEY" -H 'content-type: application/json' "$OPS/api/admin$2"; }
online_apps() { "$PM2" jlist 2>/dev/null | node -e 'const want=new Set(process.argv.slice(1));let a=[];try{a=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{}
  console.log([...new Set(a.filter(p=>want.has(p.name)&&p.pm2_env?.status==="online").map(p=>p.name))].join(" "))' $1; }
quiet_ms() { curl -s -m 5 "$WRITER/power" | node -e 'try{console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).quiet_ms??0)}catch{console.log(0)}'; }
flag() {   # mode reason stopped — the same file and shape ups-power.sh writes, so every service honours it
  node -e 'const [f,mode,reason,stopped]=process.argv.slice(1);require("fs").writeFileSync(f+".tmp",JSON.stringify({mode,reason,since:new Date().toISOString(),stopped:stopped.split(" ").filter(Boolean),maintenance:true})+"\n");require("fs").renameSync(f+".tmp",f)' \
    "$POWER_FILE" "$1" "$2" "$3"; chmod 644 "$POWER_FILE" 2>/dev/null || true; }
OURS=0 STOPPED=""
release() {
  [ "$OURS" = 1 ] || return 0
  # only our own flag: a UPS event that took over the file mid-step (ups-power.sh rewrites it without the marker) wins
  if grep -q '"maintenance":true' "$POWER_FILE" 2>/dev/null; then rm -f "$POWER_FILE"; else note "power flag is no longer ours — left in place"; fi
  OURS=0
  for a in $STOPPED; do "$PM2" start "$a" >/dev/null 2>&1 && note "started $a"; done
  STOPPED=""
}
trap 'release; note "exit"' EXIT
trap 'note "interrupted"; exit 130' INT TERM

drain() {   # step-name → 0 when drained (or the grace ran out; writes still land while draining)
  [ -f "$POWER_FILE" ] && { note "power flag present ($(cat "$POWER_FILE")) — not touching it"; return 1; }
  OURS=1
  flag draining "maintenance window: $1 (scripts/ops/db-maintenance.sh)" ""
  local d s; d=$(online_apps "$DRAIN_APPS"); s=$(online_apps "$STOP_APPS")
  for a in $d; do "$PM2" sendSignal SIGHUP "$a" >/dev/null 2>&1; done
  for a in $s; do "$PM2" stop "$a" >/dev/null 2>&1; done
  STOPPED=$s
  flag draining "maintenance window: $1 (scripts/ops/db-maintenance.sh)" "$STOPPED"
  local t0=$SECONDS
  while [ $((SECONDS - t0)) -lt "$GRACE" ]; do
    [ $((SECONDS - t0)) -ge 5 ] && [ "$(quiet_ms)" -ge "$QUIET_MS" ] && break
    sleep 1
  done
  DRAIN_S=$((SECONDS - t0))
  return 0
}

past_deadline() { [ "$(date +%H:%M)" \> "$DEADLINE" ] && [ "$(date +%H:%M)" \< "12:00" ]; }

[ -n "$KEY" ] || { note "no DEPLOY_SECRET"; exit 1; }
PLAN=$(api GET /ops/maintenance 30) || { note "ops service not answering"; exit 1; }
STEPS=$(echo "$PLAN" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const s of p.steps) console.log(`${s.name} ${s.kind} ${s.exists===false?"gone":"todo"}`)')
[ -n "$STEPS" ] || { note "empty plan: $PLAN"; exit 1; }
[ "$DRY" = 1 ] && { echo "$STEPS"; exit 0; }
jl "{\"event\":\"start\",\"at\":\"$(date -u +%FT%TZ)\",\"host_load\":\"$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)\"}"
note "start: $(echo "$STEPS" | wc -l) steps → $LOG"
while read -r name kind state; do
  [ -n "$ONLY" ] && ! grep -qw "$name" <<<"${ONLY//,/ }" && continue
  [ "$state" = gone ] && { jl "{\"step\":\"$name\",\"skipped\":\"already gone\"}"; continue; }
  if past_deadline && [ "$kind" != probe ] && [ "$kind" != analyze ]; then jl "{\"step\":\"$name\",\"skipped\":\"past deadline $DEADLINE\"}"; continue; fi
  drain "$name" || { jl "{\"step\":\"$name\",\"skipped\":\"power flag present\"}"; break; }
  t0=$(date +%s%3N)
  R=$(api POST "/ops/maintenance/$name" 1000); RC=$?
  ms=$(( $(date +%s%3N) - t0 ))
  release
  [ $RC -eq 0 ] && [ -n "$R" ] || R="{\"error\":\"curl rc=$RC\"}"
  jl "{\"at\":\"$(date -u +%FT%TZ)\",\"step\":\"$name\",\"kind\":\"$kind\",\"drain_s\":$DRAIN_S,\"wall_ms\":$ms,\"load\":\"$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)\",\"result\":$R}"
  note "$name: ${ms} ms (drain ${DRAIN_S}s) → $(echo "$R" | cut -c1-200)"
  case "$kind" in index|table) sleep "$GAP";; *) sleep "$LIGHT_GAP";; esac
done <<<"$STEPS"
jl "{\"event\":\"done\",\"at\":\"$(date -u +%FT%TZ)\"}"
note "done"
