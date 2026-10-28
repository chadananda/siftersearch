#!/bin/bash
# capped.sh <GB> cmd args... — run OUR job in its own memory cgroup, and make it the first thing the kernel kills (Chad 10-28: boss has 31 GB of RAM;
# our restoration + CPU tails beside llama-coder (22 GB peak) and laya overran it, tailscaled was OOM-killed and the box left the network).
# MemoryMax is a hard wall (MemorySwapMax=0: no thrashing on the 62 GB of swap); oom_score_adj 900 makes it the kernel's first victim.
# Without a usable user systemd manager the job still runs, with the oom score only.
G=${1:-5}; shift
echo 900 > /proc/self/oom_score_adj 2>/dev/null
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
if [ -S "$XDG_RUNTIME_DIR/bus" ] && command -v systemd-run >/dev/null 2>&1; then
  exec systemd-run --user --scope --quiet -p "MemoryMax=${G}G" -p MemorySwapMax=0 "$@"
fi
echo "capped.sh: no user systemd manager, running with oom_score_adj only" >&2
exec "$@"
