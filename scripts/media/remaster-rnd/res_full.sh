#!/bin/bash
# Full-strength Resemble Enhance on a clip at λ (denoise-before) 0.5 and 0.9, τ 0.5 (the model's standard setting); aorus GPU,
# guarded by run_resemble's VRAM/RAM/thermal checks. Usage: res_full.sh <clip ...>  → wet/resenh-l05, wet/resenh-l09
cd ~/media-gpu/rnd
export PATH=$HOME/.local/bin:$PATH HF_HUB_OFFLINE=1 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
for L in 0.5 0.9; do
  RES_OUT=resenh-l0${L#0.} RES_LAMBD=$L RES_TAU=0.5 nice -n 10 ~/media-gpu/venv-resemble/bin/python run_resemble.py /data/remaster-rnd resenh "$@" 2>&1 | tr '\r' '\n' | grep -vE 'it/s|Warning|^\s*$' | tail -2
  sleep 90
done
echo RES_DONE
