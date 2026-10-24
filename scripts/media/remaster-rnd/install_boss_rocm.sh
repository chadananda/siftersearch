#!/bin/bash
# Boss (Strix Halo, Radeon 8060S gfx1151) ROCm PyTorch venv for the generative restorers. AMD TheRock gfx1151 wheels carry
# their own ROCm runtime (rocm-sdk-*), so nothing links the split Ubuntu /usr + /opt/rocm stack (bossllm SETUP.md: a mixed
# stack segfaults in libhsa). Everything on /mnt/data4tb (never root). Install-time downloads only; runs are offline.
set -euo pipefail
UV=~/.local/bin/uv
export UV_CACHE_DIR=/mnt/data4tb/.cache/uv PIP_CACHE_DIR=/mnt/data4tb/.cache/pip XDG_CACHE_HOME=/mnt/data4tb/.cache
D=/mnt/data4tb/remaster-rnd
V=$D/venvs/rocm
P=$V/bin/python
IDX=https://rocm.nightlies.amd.com/v2/gfx1151/
[ -x $P ] || $UV venv --python 3.11 $V
$UV pip install --python $P --index-url $IDX --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match "torch==2.9.1+rocm7.13.0a20260501" "torchaudio==2.9.0+rocm7.13.0a20260501"
$UV pip install --python $P "numpy<2" scipy soundfile librosa pyloudnorm huggingface_hub
$P - <<'PY'
import torch, time
print('torch', torch.__version__, 'hip', torch.version.hip, 'gpu', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)
x = torch.randn(4096, 4096, device='cuda'); torch.cuda.synchronize(); t = time.time()
for _ in range(10): y = x @ x
torch.cuda.synchronize(); print('matmul TFLOPS ~', round(10 * 2 * 4096 ** 3 / (time.time() - t) / 1e12, 1))
PY
echo ROCM_DONE
