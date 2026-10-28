#!/bin/bash
# Read-only host resource snapshot for system-checks (10-23: aorus's disk filled and nothing alerted). Sections '@@name'.
# Usage: host-stat.sh <since-epoch>  (OOM / Xid events since then). Tower runs it locally, aorus over ssh (bash -s), boss via
# its gate verb 'hoststat' (a copy beside asr-gate.sh). Bump HOST_STAT_VERSION on change: system-checks flags a stale copy.
HOST_STAT_VERSION=2
since="${1:-0}"; [[ "$since" =~ ^[0-9]{1,12}$ ]] || since=0
(( since > 0 )) || since=$(( $(date +%s) - 1800 ))
echo "@@version $HOST_STAT_VERSION"
echo "@@host $(hostname)"
echo "@@nproc $(nproc)"
echo "@@loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
if command -v docker >/dev/null 2>&1; then echo "@@dockerroot $(docker info --format '{{.DockerRootDir}}' 2>/dev/null || sudo -n docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"; fi
# memory, the whole picture (Chad 10-28: boss is TWO pools — ~31 GB system RAM + a 96 GB GPU carve-out; `free` shows only the first)
echo "@@psi"; grep -E '^(some|full)' /proc/pressure/memory 2>/dev/null
echo "@@zram"; (zramctl --noheadings --bytes -o NAME,DISKSIZE,DATA,TOTAL 2>/dev/null || true)
for c in /sys/class/drm/card*/device; do
  [[ -r "$c/mem_info_vram_total" ]] || continue
  echo "@@amd"; for f in mem_info_vram_total mem_info_vram_used mem_info_gtt_total mem_info_gtt_used gpu_busy_percent; do echo "$f $(cat "$c/$f" 2>/dev/null)"; done
  for h in "$c"/hwmon/hwmon*; do [[ -r "$h/temp1_input" ]] && echo "edge_temp_mc $(cat "$h/temp1_input")"; done
  echo "@@vramproc"   # per-process VRAM / GTT from the amdgpu fdinfo (KiB): who holds the 96 GB
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    v=0; g=0; for f in /proc/$p/fdinfo/*; do a=$(grep -E '^drm-memory-vram:' "$f" 2>/dev/null | awk '{print $2}'); b=$(grep -E '^drm-memory-gtt:' "$f" 2>/dev/null | awk '{print $2}'); [[ -n "$a" ]] && v=$((v+a)); [[ -n "$b" ]] && g=$((g+b)); done 2>/dev/null
    (( v + g > 262144 )) && echo "$p $v $g $(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null) $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-70)"
  done | sort -k2 -n -r | head -6
  break
done
echo "@@svc"   # Chad's long-running services and our cgroups: current / peak system memory (bytes)
for u in llama-coder laya vllm ollama; do
  systemctl --user cat "$u.service" >/dev/null 2>&1 && echo "$u $(systemctl --user show "$u.service" -p MemoryCurrent --value 2>/dev/null) $(systemctl --user show "$u.service" -p MemoryPeak --value 2>/dev/null)"
done
ours=0; for f in /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/run-*.scope/memory.current; do [[ -r "$f" ]] && ours=$((ours + $(cat "$f"))); done 2>/dev/null
echo "ours-capped-scopes $ours -"
command -v docker >/dev/null 2>&1 && echo "ours-containers $( (docker stats --no-stream --format '{{.MemUsage}}' 2>/dev/null || sudo -n docker stats --no-stream --format '{{.MemUsage}}' 2>/dev/null) | awk '{print $1}' | tr '\n' ',' )" 
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
