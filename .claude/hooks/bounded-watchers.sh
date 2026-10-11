#!/bin/bash
# PreToolUse(Bash) guard: an agent's polling loop (`until …; do sleep …`, `while … sleep …`) must go through
# scripts/ops/wait-until.sh, which has a hard deadline and dies with its session. Open-ended watchers ran for 9 h on
# 10-10 polling tower every 15 s until noticed by hand (Chad 10-11: "controlled automatically").
# Exit 2 = block the call; the message goes back to the agent.
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
[ -z "$cmd" ] && exit 0
case "$cmd" in *wait-until.sh*) exit 0;; esac
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(until|while)[[:space:]].*(;|[[:space:]])do[[:space:]].*sleep[[:space:]]'; then
  echo "Blocked: polling loops must use scripts/ops/wait-until.sh (hard deadline, ends with the session). Example: scripts/ops/wait-until.sh --max 2h --every 60 --then 'cat log' -- ssh tower-nas 'grep -q DONE /tank/x.log'" >&2
  exit 2
fi
exit 0
