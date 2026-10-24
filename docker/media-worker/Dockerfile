# SIFTER MEDIA WORKER image (ghcr.io/chadananda/sifter-media-worker, PRIVATE: pyannote-class weights have licence terms; no secrets inside).
# One image for every worker (RunPod pod; the same entrypoint runs from a venv on aorus / boss): UniPASE + faster-whisper + whisperx aligners
# + the pinned job code, all baked, so a pod starts in seconds and downloads nothing. Built by .github/workflows/build-media-worker.yml.
# Weights come from weights.tsv (generated from api/lib/media/cloud.js WEIGHTS, sha256-checked): ONE source of truth for the pins.
FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

SHELL ["/bin/bash", "-c"]
ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 HF_HOME=/opt/models/hf HF_HUB_OFFLINE=0 SIFTER_WEIGHTS=/opt/models/weights

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools git curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*

# Python deps (torch family comes from the base image; whisperx 3.8.6 matches torch 2.8 — the tower venv's pin)
COPY requirements.lock /tmp/requirements.lock
RUN python -m pip install -q -c <(python -m pip freeze | grep -iE '^(torch|torchvision|torchaudio|numpy)==') -r /tmp/requirements.lock \
    && python -c "import torch, whisperx, faster_whisper, soundfile, einops, omegaconf; print('deps ok, torch', torch.__version__)"

# UniPASE code (pinned commit) + checksummed weights
ARG UNIPASE_COMMIT=857b60ad05d37a2cf6d7a89883ec9fc4fc164b45
RUN git clone -q https://github.com/Xiaobin-Rong/unipase /opt/unipase && git -C /opt/unipase checkout -q $UNIPASE_COMMIT && rm -rf /opt/unipase/.git
COPY weights.tsv fetch-weights.sh /tmp/
RUN bash /tmp/fetch-weights.sh /tmp/weights.tsv $SIFTER_WEIGHTS && du -sh $SIFTER_WEIGHTS

# Alignment models (whisperx forced alignment): the languages the library is mostly in; any other is fetched on demand
COPY preload-aligners.py /tmp/
RUN python /tmp/preload-aligners.py en fa ar && du -sh $HF_HOME

# Job code, pinned by the image tag
COPY media/ /opt/sifter/media/
RUN python -m py_compile /opt/sifter/media/runpod_worker.py /opt/sifter/media/worker/*.py \
    && echo "sifter-media-worker $(date -u +%Y-%m-%d) ${GITHUB_SHA:-local}" > /opt/sifter-image-version
