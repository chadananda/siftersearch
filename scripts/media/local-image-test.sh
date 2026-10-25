#!/usr/bin/env bash
# Run the REAL image locally the way a pod runs it, BEFORE any paid pod (Chad 10-25). Needs docker (boss: `sudo -n docker`; NEVER aorus until its
# docker data-root is on /data: a 64 GB image filled its 234 GB root).  Usage: scripts/media/local-image-test.sh [image] [--gpu]
# Watches free space before / after, tests sshd + the gate verbs (df, encode with a trim window, grade, dfn, probe) + the image selftest, then
# removes the container and prunes. Exit non-zero with the failing step.
set -uo pipefail
IMG=${1:-ghcr.io/chadananda/sifter-media-worker:latest}; GPU=""; [[ "${2:-}" == "--gpu" ]] && GPU="--gpus all"
D="docker"; docker ps >/dev/null 2>&1 || D="sudo -n docker"
ROOT=$($D info 2>/dev/null | awk -F': ' '/Docker Root Dir/{print $2}'); ROOT=${ROOT:-/var/lib/docker}
free() { df -Pk "$ROOT" | awk 'NR==2{printf "%d", $4/1048576}'; }
F0=$(free); echo "docker data-root $ROOT: ${F0} GB free"
[ "$F0" -lt 80 ] && { echo "FAIL: less than 80 GB free where docker keeps images ($ROOT) — refusing to pull a 25+ GB image"; exit 3; }
fail() { echo "FAIL: $1"; $D rm -f podtest >/dev/null 2>&1; exit 1; }
$D rm -f podtest >/dev/null 2>&1
T0=$(date +%s)
$D run -d --name podtest $GPU -p 2299:22 -e PUBLIC_KEY="$(cat ~/.ssh/id_ed25519.pub)" -e RUNPOD_POD_ID=test "$IMG" >/dev/null || fail "docker run"
S="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -p 2299 root@127.0.0.1"
for i in $(seq 1 90); do $S true 2>/dev/null && break; sleep 1; done; $S true 2>/dev/null || fail "sshd not reachable in 90 s"
echo "sshd ready after $(( $(date +%s) - T0 )) s"
G='SSH_ORIGINAL_COMMAND'
$S "$G=df /opt/gate/asr-gate.sh" | grep -q free_gb || fail "gate df"
ffmpeg -nostdin -v error -y -f lavfi -i "sine=frequency=300:duration=30" -ac 1 -ar 48000 /tmp/t.mp3
cat /tmp/t.mp3 | $S "$G='start mp3 pt-enc-1 --verb encode --recipe oggR --af anull --ss 5.00 --t 10.00 --threads 2' /opt/gate/asr-gate.sh" | grep -q started || fail "gate encode start"
for v in grade dfn; do cat /tmp/t.mp3 | $S "$G='start mp3 pt-$v-1 --verb $v --threads 4' /opt/gate/asr-gate.sh" | grep -q started || fail "gate $v start"; done
sleep 45
for j in enc grade dfn; do $S "$G='poll pt-$j-1' /opt/gate/asr-gate.sh" | grep -q '"done"' || fail "gate $j did not finish"; done
$S "$G='fetch-file pt-enc-1' /opt/gate/asr-gate.sh" > /tmp/o.ogg; ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/o.ogg | awk '$1>9.9 && $1<10.2{ok=1} END{exit !ok}' || fail "trim-window encode is not 10 s"
cat /tmp/t.mp3 | $S "$G='probe mp3 --starts 2 --len 20' /opt/gate/asr-gate.sh" | grep -q large-v3-turbo || fail "gate probe"
$D cp scripts/media/worker/selftest.py podtest:/tmp/selftest.py 2>/dev/null || true
$D exec podtest python /opt/sifter/media/worker/selftest.py $([[ -z "$GPU" ]] && echo "") | tail -1 | grep -q '"ok": true' || fail "selftest"
echo "ALL OK in $(( $(date +%s) - T0 )) s"
$D rm -f podtest >/dev/null; $D system prune -f >/dev/null 2>&1
F1=$(free); echo "docker data-root free: ${F0} -> ${F1} GB (the image stays cached; 'docker rmi $IMG' to free it)"
