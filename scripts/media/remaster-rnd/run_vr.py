# Remaster R&D step 2g: VoiceRestore (flow-matching transformer on BigVGAN-24k mels; fully generative, 24 kHz) WET output on
# aorus's GPU, as in the authors' inference_long.py (16 steps, cfg 0.5) but with our 10 s / 1 s overlap-add chunks.
# Venv: ~/media-gpu/venv-vr; repo /data/remaster-rnd/repos/VoiceRestore. Usage: python run_vr.py <root> [clip ...]
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources, chunked

ROOT = sys.argv[1]
CLIPS = sys.argv[2:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
REPO = f'{ROOT}/repos/VoiceRestore'
sys.path[:0] = [REPO]
wait_resources(4.0, 5.0)
import torch
from scipy.signal import resample_poly
from huggingface_hub import hf_hub_download
from BigVGAN import bigvgan
from BigVGAN.meldataset import get_mel_spectrogram
from model import OptimizedAudioRestorationModel

voc = bigvgan.BigVGAN.from_pretrained('nvidia/bigvgan_v2_24khz_100band_256x', use_cuda_kernel=False).to('cuda')
voc.remove_weight_norm()
m = OptimizedAudioRestorationModel(device='cuda', bigvgan_model=voc)
sd = torch.load(hf_hub_download('jadechoghari/VoiceRestore', 'pytorch_model_v2.bin'), map_location='cuda')
m.voice_restore.load_state_dict(sd.get('model_state_dict', sd), strict=True)
m.bfloat16().eval().to('cuda')


@torch.no_grad()
def fn(seg):
    x24 = torch.from_numpy(resample_poly(seg, 1, 2).astype(np.float32)).unsqueeze(0).to('cuda')
    with torch.autocast('cuda'):
        mel = get_mel_spectrogram(x24, voc.h).to('cuda')
        rm = m.voice_restore.sample(mel.transpose(1, 2), steps=16, cfg_strength=0.5).squeeze(0).transpose(0, 1)
        y = voc(rm.unsqueeze(0)).squeeze().float().cpu().numpy()
    y = resample_poly(y, 2, 1).astype(np.float32)
    return y[: len(seg)] if len(y) >= len(seg) else np.pad(y, (0, len(seg) - len(y)))


log = {}
for c in CLIPS:
    t = time.time()
    write(f'{ROOT}/wet/vr/{c}.wav', chunked(read(f'{ROOT}/clips/{c}.wav'), SR, fn, chunk_s=10.0, overlap_s=1.0))
    log[c] = round(time.time() - t, 1)
log['_peak_vram_gb'] = round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)
json.dump(log, open(f'{ROOT}/wet/vr/_run.json', 'w'))
print('vr', log)
