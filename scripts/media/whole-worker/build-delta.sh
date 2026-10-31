#!/usr/bin/env bash
# Build a code+deps delta of the accepted whole-recording image on Aorus (Dockerfile.delta). Run from the repo on the Mac.
# Usage: build-delta.sh <base image@sha256:…> <tag>   → aorus has sifter-media-worker:<tag>; push + accept are separate steps.
set -euo pipefail
base=${1:?base digest}; tag=${2:?tag}
[[ "$base" == *@sha256:* ]] || { echo 'base must be a digest'; exit 2; }
ctx=tmp/delta-ctx; rm -rf "$ctx"
node scripts/media/whole-worker/prepare-image.mjs "$ctx" >/dev/null
cp docker/media-worker/Dockerfile.delta "$ctx/Dockerfile"
rsync -a --delete "$ctx/" aorus:/data/media-gpu/tmp/delta-ctx/
ssh aorus "docker build --build-arg BASE='$base' -t 'sifter-media-worker:$tag' /data/media-gpu/tmp/delta-ctx 2>&1 | tail -8"
