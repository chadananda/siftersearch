#!/usr/bin/env bash
# Run the REAL image locally the way a pod runs it, BEFORE any paid pod (Chad 10-25). Needs docker (boss: `sudo -n docker`; NEVER aorus until its
# docker data-root is on /data: a 64 GB image filled its 234 GB root).  Usage: scripts/media/local-image-test.sh [image] [--gpu]
# Watches free space before / after, tests sshd + the gate verbs (df, encode with a trim window, grade, dfn, probe) + the image selftest, then
# removes only its own container. Exit non-zero with the failing step.
set -uo pipefail
IMG=${1:-}; GPU="";
[ -n "$IMG" ] && [[ "$IMG" == *@sha256:* || "${IMG##*/}" == *:* && "${IMG##*:}" != latest ]] || {
  echo 'FAIL: provide an explicit version tag or sha256 digest (latest is not a validation identity)'; exit 2;
}
[[ "${2:-}" == "--gpu" ]] && GPU="--gpus all"
D="docker"; docker ps >/dev/null 2>&1 || D="sudo -n docker"
ROOT=$($D info 2>/dev/null | awk -F': ' '/Docker Root Dir/{print $2}'); ROOT=${ROOT:-/var/lib/docker}
free() { df -Pk "$ROOT" | awk 'NR==2{printf "%d", $4/1048576}'; }
F0=$(free); echo "docker data-root $ROOT: ${F0} GB free"
[ "$F0" -lt 80 ] && { echo "FAIL: less than 80 GB free where docker keeps images ($ROOT) — refusing to pull a 25+ GB image"; exit 3; }
TEST_DIR=$(mktemp -d /tmp/sifter-image-test.XXXXXX)
CONTAINER="sifter-image-test-$(date +%s)-$$"
CREATED=0
cleanup() {
  [ "$CREATED" = 0 ] || $D rm -f "$CONTAINER" >/dev/null 2>&1
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT
fail() { echo "FAIL: $1"; exit 1; }
# Pull first so the recorded identity is exactly what this test starts.
$D pull "$IMG" || fail "image pull"
IMAGE_ID=$($D image inspect --format '{{.Id}}' "$IMG") || fail "image identity"
echo "Testing $IMG ($IMAGE_ID)"
ssh-keygen -q -t ed25519 -N '' -f "$TEST_DIR/key" || fail "test SSH key"
T0=$(date +%s)
$D run -d --name "$CONTAINER" $GPU -p 127.0.0.1::22 -e PUBLIC_KEY="$(cat "$TEST_DIR/key.pub")" -e RUNPOD_POD_ID=test "$IMAGE_ID" >/dev/null || fail "docker run"
CREATED=1
PORT=$($D port "$CONTAINER" 22/tcp | awk -F: 'NR==1{print $NF}')
[ -n "$PORT" ] || fail "SSH port was not published"
S="ssh -i $TEST_DIR/key -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o LogLevel=ERROR -p $PORT root@127.0.0.1"
for i in $(seq 1 90); do $S true 2>/dev/null && break; sleep 1; done; $S true 2>/dev/null || fail "sshd not reachable in 90 s"
echo "sshd ready after $(( $(date +%s) - T0 )) s"
G='SSH_ORIGINAL_COMMAND'
$S "$G=df /opt/gate/asr-gate.sh" | grep -q free_gb || fail "gate df"
$D exec "$CONTAINER" ffmpeg -nostdin -v error -f lavfi -i "sine=frequency=300:duration=30" -ac 1 -ar 48000 -f mp3 pipe:1 > "$TEST_DIR/t.mp3" || fail "test audio"
cat "$TEST_DIR/t.mp3" | $S "$G='start mp3 pt-enc-1 --verb encode --recipe oggR --af anull --ss 5.00 --t 10.00 --threads 2' /opt/gate/asr-gate.sh" | grep -q started || fail "gate encode start"
wait_job() {
  local job=$1 status deadline=$(( $(date +%s) + 600 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    status=$($S "$G='poll $job' /opt/gate/asr-gate.sh") || fail "poll $job"
    case "$status" in
      *'"done"'*) return 0 ;;
      *'"running"'*) sleep 2 ;;
      *) fail "$job: $status" ;;
    esac
  done
  fail "$job timed out after 600 s"
}
wait_job pt-enc-1
# Cold model loads vary; serial checks also fit the 8 GB validation GPU.
for v in grade dfn; do
  cat "$TEST_DIR/t.mp3" | $S "$G='start mp3 pt-$v-1 --verb $v --threads 4' /opt/gate/asr-gate.sh" | grep -q started || fail "gate $v start"
  wait_job "pt-$v-1"
done
$S "$G='fetch-file pt-enc-1' /opt/gate/asr-gate.sh" > "$TEST_DIR/o.ogg" || fail "fetch encode"
$D cp "$TEST_DIR/o.ogg" "$CONTAINER:/tmp/validation.ogg" || fail "copy encode for probe"
$D exec "$CONTAINER" ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/validation.ogg | awk '$1>9.9 && $1<10.2{ok=1} END{exit !ok}' || fail "trim-window encode is not 10 s"
cat "$TEST_DIR/t.mp3" | $S "$G='probe mp3 --starts 2 --len 20' /opt/gate/asr-gate.sh" | grep -q large-v3-turbo || fail "gate probe"
$D exec "$CONTAINER" python /opt/sifter/media/worker/selftest.py | tail -1 | grep -q '"ok": true' || fail "selftest"
echo "ALL OK in $(( $(date +%s) - T0 )) s"
cleanup
CREATED=0
F1=$(free); echo "docker data-root free: ${F0} -> ${F1} GB (the image stays cached; 'docker rmi $IMG' to free it)"
