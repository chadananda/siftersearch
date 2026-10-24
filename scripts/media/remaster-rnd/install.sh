#!/bin/bash
# Remaster R&D venv on aorus (~/media-gpu/venv-rnd): install-time downloads only; every run after this is offline.
# Torch matches venv-dfn (2.1.2+cu121) so the wheels come from the uv cache. Never touches the production venvs.
set -euo pipefail
UV=~/.local/bin/uv
# DISK RULE (10-23): nothing on aorus's root disk — caches, weights and venvs live on /data (venvs symlinked from ~/media-gpu)
export UV_CACHE_DIR=/data/.cache/uv PIP_CACHE_DIR=/data/.cache/pip TORCH_HOME=/data/.cache/torch-rnd XDG_CACHE_HOME=/data/.cache
mkvenv() { local n=$1 py=$2; mkdir -p /data/remaster-rnd/venvs; $UV venv --python $py /data/remaster-rnd/venvs/$n && ln -sfn /data/remaster-rnd/venvs/$n ~/media-gpu/$n; }
V=~/media-gpu/venv-rnd
PY=$V/bin/python
mkvenv venv-rnd 3.11
$UV pip install --python $PY --index-url https://download.pytorch.org/whl/cu121 "torch==2.1.2" "torchaudio==2.1.2"
$UV pip install --python $PY "numpy<2" scipy soundfile pyloudnorm noisereduce denoiser deepfilternet
$UV pip install --python $PY clearvoice || echo "clearvoice install FAILED"
$UV pip install --python $PY voicefixer || echo "voicefixer install FAILED"
$PY -c "import denoiser, noisereduce, df; print('core ok')"
echo INSTALL_DONE
