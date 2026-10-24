#!/bin/bash
# Generative restorers into boss's ROCm venv WITHOUT their torch pins (--no-deps, then their pure-python deps), so the
# gfx1151 TheRock torch stays. Weights cached on /mnt/data4tb (HF_HOME). Usage: install_boss_models.sh [audiosr voicefixer resemble sidon sgmse]
set -uo pipefail
UV=~/.local/bin/uv
export UV_CACHE_DIR=/mnt/data4tb/.cache/uv XDG_CACHE_HOME=/mnt/data4tb/.cache HF_HOME=/mnt/data4tb/remaster-rnd/models/hf TORCH_HOME=/mnt/data4tb/remaster-rnd/torch
D=/mnt/data4tb/remaster-rnd
P=$D/venvs/rocm/bin/python
pin() { $UV pip install --python $P "$@" "torch==2.9.1+rocm7.13.0a20260501" "torchaudio==2.9.0+rocm7.13.0a20260501" --index-url https://rocm.nightlies.amd.com/v2/gfx1151/ --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match; }
for p in ${*:-audiosr voicefixer resemble sidon sgmse}; do case $p in
audiosr)
  $UV pip install --python $P --no-deps audiosr==0.0.7 torchlibrosa
  pin "transformers<4.45" "huggingface_hub<0.26" einops timm ftfy regex tqdm phonemizer progressbar unidecode chardet pandas matplotlib "setuptools<70" omegaconf h5py
  $P -c "from huggingface_hub import hf_hub_download as h, snapshot_download as s; print(h('haoheliu/audiosr_speech','pytorch_model.bin')); [s(r, allow_patterns=['*.json','*.txt','*.model','merges.txt','vocab*']) for r in ('roberta-base','bert-base-uncased','facebook/bart-base','t5-base')]"
  ;;
voicefixer)
  $UV pip install --python $P --no-deps voicefixer==0.1.3 torchlibrosa
  pin progressbar
  $P -c "from voicefixer import VoiceFixer; VoiceFixer(); print('voicefixer weights ok')"
  ;;
resemble)
  $UV pip install --python $P --no-deps resemble-enhance
  pin celluloid omegaconf pandas ptflops rich resampy tabulate tqdm matplotlib
  ;;
sidon)
  pin transformers
  ;;
sgmse)
  pin "pytorch-lightning<2.3" torch-ema einops torchsde sdeint torchinfo torch-pesq pesq pystoi "setuptools<70" ninja
  ;;
esac; echo "== $p done"; done
echo MODELS_DONE
