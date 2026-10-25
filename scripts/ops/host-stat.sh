#!/bin/bash
# Read-only host resource snapshot for system-checks (10-23: aorus's disk filled and nothing alerted). Sections '@@name'.
# Usage: host-stat.sh <since-epoch>  (OOM / Xid events since then). Tower runs it locally, aorus over ssh (bash -s), boss via
# its gate verb 'hoststat' (a copy beside asr-gate.sh). Bump HOST_STAT_VERSION on change: system-checks flags a stale copy.
HOST_STAT_VERSION=1
since="${1:-0}"; [[ "$since" =~ ^[0-9]{1,12}$ ]] || since=0
(( since > 0 )) || since=$(( $(date +%s) - 1800 ))
echo "@@version $HOST_STAT_VERSION"
echo "@@host $(hostname)"
echo "@@nproc $(nproc)"
echo "@@loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
if command -v docker >/dev/null 2>&1; then echo "@@dockerroot $(docker info --format '{{.DockerRootDir}}' 2>/dev/null || sudo -n docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"; fi
echo "@@meminfo"; grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
echo "@@df"; df -PkT 2>/dev/null | tail -n +2
if command -v zpool >/dev/null 2>&1; then
  echo "@@zpool"; zpool list -Hp -o name,size,alloc,free 2>/dev/null
  echo "@@zfs"; zfs list -Hp -t filesystem -o name,used 2>/dev/null
fi
echo "@@du"; for d in "$HOME/media-gpu/jobs" "$HOME/media-gpu/tmp" "$HOME/media-asr/jobs" "$HOME/media-asr/tmp" /srv/qram/*; do
  [[ -d "$d" ]] && timeout 20 du -sk "$(readlink -f "$d")" 2>/dev/null; done   # resolved: jobs/ may link to a data volume
j=$(timeout 15 journalctl -k --since "@$since" -q --no-pager 2>&1); jrc=$?
[[ $jrc -ne 0 || "$j" == *"insufficient permissions"* ]] && echo "@@journal_err rc=$jrc $(printf '%s' "$j" | head -1 | cut -c1-120)"
oom=$( { printf '%s\n' "$j" | grep 'Out of memory: Killed process'; timeout 10 journalctl -u systemd-oomd --since "@$since" -q --no-pager 2>/dev/null | grep -i 'killed'; } )
echo "@@oomcount $(printf '%s' "$oom" | grep -c .)"
echo "@@oom"; printf '%s\n' "$oom" | grep . | tail -3
echo "@@xid"; printf '%s\n' "$j" | grep -E 'NVRM: Xid' | tail -5
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "@@nvsmi"; timeout 15 nvidia-smi --query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu,ecc.errors.uncorrected.volatile.total --format=csv,noheader,nounits 2>&1 | head -4
fi
if compgen -G '/dev/nvidia*' >/dev/null; then
  # who holds the GPU device (all users when passwordless sudo exists; else this user's processes)
  echo "@@nvdev"; { sudo -n lsof -F c /dev/nvidia* 2>/dev/null || lsof -F c /dev/nvidia* 2>/dev/null; } | sed -n 's/^c//p' | sort -u
fi
echo "@@end"
