#!/bin/bash
# Remaster R&D, generative models on aorus (install-time downloads only; runs are offline). One venv per model family
# because their torch pins conflict. Weights/repos live on /data/remaster-rnd (never root). Usage: bash install2.sh [part ...]
set -uo pipefail
UV=~/.local/bin/uv
# DISK RULE (10-23): nothing on aorus's root disk — caches, weights and venvs live on /data (venvs symlinked from ~/media-gpu)
export UV_CACHE_DIR=/data/.cache/uv PIP_CACHE_DIR=/data/.cache/pip TORCH_HOME=/data/.cache/torch-rnd XDG_CACHE_HOME=/data/.cache
mkvenv() { local n=$1 py=$2; mkdir -p /data/remaster-rnd/venvs; $UV venv --python $py /data/remaster-rnd/venvs/$n && ln -sfn /data/remaster-rnd/venvs/$n ~/media-gpu/$n; }
D=/data/remaster-rnd
export HF_HOME=$D/models/hf
mkdir -p $D/repos $D/models
CU121="--index-url https://download.pytorch.org/whl/cu121"
parts=${*:-"sidon resemble sgmse audiosr vr"}

for p in $parts; do case $p in
sidon)   # Sidon (2025, w2v-BERT 2.0 feature cleanser + 48 kHz vocoder; TorchScript) — in venv-rnd
  $UV pip install --python ~/media-gpu/venv-rnd/bin/python transformers huggingface_hub
  ~/media-gpu/venv-rnd/bin/python - <<'EOF'
from huggingface_hub import hf_hub_download
import transformers
for f in ('feature_extractor_cuda.pt', 'decoder_cuda.pt'):
    print(hf_hub_download('sarulab-speech/sidon-v0.1', filename=f))
transformers.SeamlessM4TFeatureExtractor.from_pretrained('facebook/w2v-bert-2.0')
print('sidon ok')
EOF
  ;;
resemble)   # Resemble Enhance (denoiser + CFM enhancer); deepspeed is training-only and stubbed at run time
  mkvenv venv-resemble 3.11
  P=~/media-gpu/venv-resemble/bin/python
  $UV pip install --python $P $CU121 torch==2.1.2 torchaudio==2.1.2
  $UV pip install --python $P --no-deps resemble-enhance
  $UV pip install --python $P celluloid librosa matplotlib "numpy<2" omegaconf pandas ptflops rich resampy scipy soundfile tabulate tqdm
  $P -c "import resemble_enhance; print('resemble ok')"
  ;;
sgmse)   # SGMSE+ 48 kHz (EARS-WHAM enhancement, EARS-Reverb dereverb) — score-based diffusion
  [ -d $D/repos/sgmse ] || git clone --depth 1 https://github.com/sp-uhh/sgmse $D/repos/sgmse
  mkvenv venv-sgmse 3.11
  P=~/media-gpu/venv-sgmse/bin/python
  $UV pip install --python $P $CU121 torch==2.1.2 torchaudio==2.1.2
  $UV pip install --python $P "numpy<2" scipy soundfile librosa "pytorch-lightning<2.3" torch-ema ninja gdown einops tqdm pesq pystoi wandb h5py
  mkdir -p $D/models/sgmse && cd $D/models/sgmse
  [ -s ears_wham.ckpt ] || ~/media-gpu/venv-sgmse/bin/gdown 1t_DLLk8iPH6nj8M5wGeOP3jFPaz3i7K5 -O ears_wham.ckpt
  [ -s ears_reverb.ckpt ] || ~/media-gpu/venv-sgmse/bin/gdown 1PunXuLbuyGkknQCn_y-RCV2dTZBhyE3V -O ears_reverb.ckpt
  ls -la $D/models/sgmse
  ;;
audiosr)   # AudioSR (latent diffusion super-resolution, 'speech' checkpoint)
  mkvenv venv-audiosr 3.10
  P=~/media-gpu/venv-audiosr/bin/python
  $UV pip install --python $P $CU121 torch==2.1.2 torchaudio==2.1.2 torchvision==0.16.2
  $UV pip install --python $P audiosr==0.0.7 "numpy<=1.23.5"
  $P - <<'EOF'
from huggingface_hub import hf_hub_download
print(hf_hub_download('haoheliu/audiosr_speech', 'pytorch_model.bin'))
EOF
  ;;
vr)   # VoiceRestore (flow-matching transformer + BigVGAN 24 kHz)
  [ -d $D/repos/VoiceRestore ] || (cd $D/repos && GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/jadechoghari/VoiceRestore)
  mkvenv venv-vr 3.11
  P=~/media-gpu/venv-vr/bin/python
  $UV pip install --python $P $CU121 torch==2.4.1 torchaudio==2.4.1
  $UV pip install --python $P librosa torchdiffeq==0.2.4 jaxtyping==0.2.34 x-transformers==1.34.0 gateloop-transformer==0.2.5 rotary-embedding-torch==0.8.3 soundfile einops scipy huggingface_hub "numpy<2" tqdm matplotlib
  $P - <<'EOF'
from huggingface_hub import hf_hub_download, snapshot_download
print(hf_hub_download('jadechoghari/VoiceRestore', 'pytorch_model_v2.bin'))
print(snapshot_download('nvidia/bigvgan_v2_24khz_100band_256x'))
EOF
  ;;
esac; echo "== $p done"; done
echo INSTALL2_DONE
