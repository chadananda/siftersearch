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
RUN set -eo pipefail; python --version; python -m pip freeze | grep -iE '^(torch|torchvision|torchaudio|numpy|triton)==' | tee /tmp/base-pins.txt; \
    python -m pip install -r /tmp/requirements.lock 2>&1 | tail -25; \
    python -c "import torch, whisperx, faster_whisper, soundfile, einops, omegaconf; print('deps ok, torch', torch.__version__)"; \
    (python -m pip freeze | grep -iE '^(torch|torchvision|torchaudio)==' | diff /tmp/base-pins.txt - && echo 'torch family unchanged') || echo 'NOTE: torch family differs from the base image'

# UniPASE code (pinned commit) + checksummed weights
ARG UNIPASE_COMMIT=857b60ad05d37a2cf6d7a89883ec9fc4fc164b45
RUN git clone -q https://github.com/Xiaobin-Rong/unipase /opt/unipase && git -C /opt/unipase checkout -q $UNIPASE_COMMIT && rm -rf /opt/unipase/.git
COPY weights.tsv fetch-weights.sh /tmp/
RUN bash /tmp/fetch-weights.sh /tmp/weights.tsv $SIFTER_WEIGHTS && du -sh $SIFTER_WEIGHTS

# Deterministic cleanup (the fallback for talks the word guard holds): MossFormer2-SE via ClearVoice in its own venv (it may pin other
# versions than whisperx), the SE checkpoint sha-pinned. Deterministic: fixed seeds, no sampling (scripts/media/worker/cleanup.py).
COPY weights-cleanup.tsv /tmp/
RUN python -m venv --system-site-packages /opt/cv && /opt/cv/bin/pip install clearvoice scipy nara_wpe soundfile 2>&1 | tail -5 \
    && /opt/cv/bin/python -c "import clearvoice, nara_wpe, scipy, torch; print('cleanup deps ok')" \
    && bash /tmp/fetch-weights.sh /tmp/weights-cleanup.tsv /opt/models && ls -la /opt/models/clearvoice/checkpoints/MossFormer2_SE_48K

# Alignment models (whisperx forced alignment): the languages the library is mostly in; any other is fetched on demand
COPY preload-aligners.py /tmp/
RUN python /tmp/preload-aligners.py en fa ar && du -sh $HF_HOME

# THE GATE: a pod is a HOST of the same gate as boss / aorus (scripts/media/boss-asr-gate.sh runs from its own directory with venv/, venv-dfn/ and
# models/). Tower dispatches probe / langid / grade / dfn / encode jobs here over ssh — prep leaves tower (Chad 10-24). Everything baked, offline.
COPY gate/ /opt/gate/
RUN chmod +x /opt/gate/*.sh && mkdir -p /opt/gate/jobs /opt/gate/tmp /opt/gate/models /root/.cache \
 && ln -sfn /opt/models/hf /root/.cache/huggingface \
 && python -m venv --system-site-packages /opt/gate/venv \
 && /opt/gate/venv/bin/pip install torchmetrics librosa onnxruntime requests pyloudnorm 2>&1 | tail -3 \
 && /opt/gate/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu'); print('whisper cached')" \
 && ffmpeg -nostdin -v error -f lavfi -i "sine=frequency=300:duration=8" -ac 1 -ar 16000 /tmp/t.wav \
 && /opt/gate/venv/bin/python /opt/gate/media_tool.py grade /tmp/t.wav --models /opt/gate/models --threads 2 | tail -c 300
# DeepFilterNet needs its own old torch (0.5.6 / torch 2.0.1, CPU wheels: small) and its model cached
RUN python -m venv /opt/gate/venv-dfn \
 && /opt/gate/venv-dfn/bin/pip install "numpy<2" torch==2.0.1 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu 2>&1 | tail -2 \
 && /opt/gate/venv-dfn/bin/pip install deepfilternet==0.5.6 soundfile 2>&1 | tail -2 \
 && /opt/gate/venv-dfn/bin/python -c "from df.enhance import init_df; init_df(); print('dfn model cached')" \
 && du -sh /opt/gate /root/.cache /root/.torchmetrics 2>/dev/null

# the checksum manifest the selftest re-verifies on every boot (a truncated pull or a bad layer is caught before a paid job runs)
RUN cd /opt/models && find weights clearvoice -type f ! -name '*.ok' ! -name '.lock' -print0 | xargs -0 sha256sum > weights.sha256 && wc -l weights.sha256

# Job code, pinned by the image tag
COPY media/ /opt/sifter/media/
RUN python -m py_compile /opt/sifter/media/runpod_worker.py /opt/sifter/media/worker/*.py \
    && echo "sifter-media-worker $(date -u +%Y-%m-%d) ${GITHUB_SHA:-local}" > /opt/sifter-image-version
