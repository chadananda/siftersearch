#!/bin/bash
# Bounded wait for agent sessions (Chad 10-11: "background watchers are controlled automatically … we do not want you to
# have to intervene"). Polls a condition until it passes, a hard deadline passes (max 12 h), or the Claude session that
# started it is gone. Never an open-ended loop. Enforced by .claude/hooks/bounded-watchers.sh.
#   scripts/ops/wait-until.sh [--max 2h] [--every 60] [--then '<cmd>'] -- <condition command…>
# exit 0 = condition met (then runs --then) · 124 = deadline passed · 125 = owning session gone
max=7200; every=60; then_cmd=""
secs() { case "$1" in *h) echo $(( ${1%h} * 3600 ));; *m) echo $(( ${1%m} * 60 ));; *s) echo "${1%s}";; *) echo "$1";; esac; }
while [ $# -gt 0 ]; do
  case "$1" in
    --max) max=$(secs "$2"); shift 2;;
    --every) every=$(secs "$2"); shift 2;;
    --then) then_cmd="$2"; shift 2;;
    --) shift; break;;
    *) break;;
  esac
done
[ $# -gt 0 ] || { echo "wait-until: no condition given" >&2; exit 2; }
[ "$max" -gt 43200 ] && max=43200                     # 12 h ceiling, whatever was asked
[ "$every" -lt 5 ] && every=5
# the Claude process that owns this wait: first ancestor whose command is `claude` (none found → deadline only)
owner=""; p=$PPID
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -z "$p" ] || [ "$p" -le 1 ] && break
  c=$(ps -o comm= -p "$p" 2>/dev/null | awk -F/ '{print $NF}')
  [ "$c" = "claude" ] && { owner=$p; break; }
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
done
deadline=$(( $(date +%s) + max ))
while :; do
  if "$@" >/dev/null 2>&1; then
    [ -n "$then_cmd" ] && bash -c "$then_cmd"
    exit 0
  fi
  [ "$(date +%s)" -ge "$deadline" ] && { echo "wait-until: deadline (${max}s) passed: $*" >&2; exit 124; }
  [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null && { echo "wait-until: owning session $owner gone" >&2; exit 125; }
  sleep "$every"
done
