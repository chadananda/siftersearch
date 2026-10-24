#!/bin/bash
# aorus GPU queue for the R&D models: ONE job at a time, a 2-minute pause between jobs (the card runs hot beside production
# transcription); each runner also waits for >= 83 °C to clear and for free VRAM/RAM (rnd_common.wait_resources / cool).
# Usage: gpu_queue.sh "<venv> <script> <args...>" ...   (venv = rnd | resemble | sgmse | audiosr | vr | dfn)
cd ~/media-gpu/rnd
export PATH=$HOME/.local/bin:$PATH HF_HUB_OFFLINE=1 HF_HOME=/data/remaster-rnd/models/hf PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True XDG_CACHE_HOME=/data/.cache
for job in "$@"; do
  set -- $job; v=$1; shift
  echo "== $(date +%T) $v $*"
  nice -n 10 ~/media-gpu/venv-$v/bin/python "$@" 2>&1 | tr '\r' '\n' | grep -vE 'it/s|Warning|warn\(|^\s*$' | tail -5
  sleep 120
done
echo QUEUE_DONE
