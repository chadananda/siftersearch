#!/usr/bin/env bash
# On Aorus: context, pinned Linux Node binary, existing verified model dir,
# Silero Torch Hub cache dir, explicit candidate tag. No global Docker cleanup.
set -euo pipefail
context=${1:?context}; nodebin=${2:?node binary}; models=${3:?speaker models}; silero=${4:?Silero repository}; tag=${5:?explicit tag}; extras=${6:?sherpa runtime}; nltk=${7:?NLTK data}
[[ "$tag" != *:latest ]] || { echo 'Use an explicit candidate tag'; exit 2; }
(cd "$models" && sha256sum -c "$context/speaker-models.sha256")
root="$context/rootfs"
mkdir -p "$root/usr/local/bin" "$root/opt/gate/models" "$root/root/.cache/torch/hub"
cp "$nodebin" "$root/usr/local/bin/node"
while read -r digest filename; do mkdir -p "$root/opt/gate/models/$(dirname "$filename")"; cp "$models/$filename" "$root/opt/gate/models/$filename"; done < "$context/speaker-models.sha256"
cp -a "$silero" "$root/root/.cache/torch/hub/snakers4_silero-vad_master"
mkdir -p "$root/opt/worker-extras" "$root/opt/models/nltk_data"
cp -a "$extras/." "$root/opt/worker-extras/"
cp -a "$nltk/." "$root/opt/models/nltk_data/"
if [[ -n "${BUILDX_BIN:-}" ]]; then
  "$BUILDX_BIN" build --builder default --load -t "$tag" "$context"
else
  docker build -t "$tag" "$context"
fi
