#!/usr/bin/env bash
# Build a code+deps delta (Dockerfile.delta) of an accepted worker image — CUDA on aorus, ROCm on boss: the same recipe. Run from the repo on the Mac.
# Usage: build-delta.sh <base image@sha256:…> <tag> [host=aorus]   → <host> has sifter-media-worker:<tag>; push + accept are separate steps.
set -euo pipefail
base=${1:?base digest}; tag=${2:?tag}; host=${3:-aorus}
[[ "$base" == *@sha256:* ]] || { echo 'base must be a digest'; exit 2; }
ctx=tmp/delta-ctx; rm -rf "$ctx"
node scripts/media/whole-worker/prepare-image.mjs "$ctx" >/dev/null
cp docker/media-worker/Dockerfile.delta "$ctx/Dockerfile"
remote=/data/media-gpu/tmp/delta-ctx; [[ "$host" == aorus ]] || remote='~/sifter-build/delta-ctx'
ssh "$host" "mkdir -p $remote"
rsync -a --delete "$ctx/" "$host:$remote/"
# boss's docker needs sudo; aorus's user is in the docker group. The classic builder resolves a local base (BuildKit pulls even a local digest)
ssh "$host" "D=docker; docker info >/dev/null 2>&1 || D='sudo -n env DOCKER_BUILDKIT=0 docker'; DOCKER_BUILDKIT=0 \$D build --build-arg BASE='$base' -t 'sifter-media-worker:$tag' $remote 2>&1 | tail -8"
