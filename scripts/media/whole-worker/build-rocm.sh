#!/usr/bin/env bash
# Build the AMD image on a host that already holds the accepted CUDA image (boss). Usage: build-rocm.sh <context-dir> <tag>
# context = output of: node scripts/media/whole-worker/prepare-image.mjs <dir>  (then Dockerfile.rocm replaces its Dockerfile)
set -euo pipefail
ctx=${1:?context}; tag=${2:?tag}
[[ "$tag" != *:latest ]] || { echo 'explicit candidate tag'; exit 2; }
cp docker/media-worker/Dockerfile.rocm "$ctx/Dockerfile"
sudo -n docker build -t "$tag" "$ctx"
