# Remaster R&D step 2f: AudioSR ('speech' latent-diffusion super-resolution → 48 kHz) WET output on aorus's GPU; used by
# build_cands only ABOVE the original's bandwidth (hf_blend), so the words stay the original's. 10.24 s chunks (its native
# 5.12 s grid), 1 s overlap-add. Venv: ~/media-gpu/venv-audiosr. Usage: python run_audiosr.py <root> [clip ...]
import json, os, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources, chunked

ROOT = sys.argv[1]
CLIPS = sys.argv[2:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
STEPS, GUIDE = int(os.environ.get('AUDIOSR_STEPS', '50')), float(os.environ.get('AUDIOSR_GUIDE', '3.5'))
wait_resources(5.0, 5.0)
import torch
from audiosr import build_model, super_resolution
model = build_model(model_name='speech', device='cuda')
tmp = tempfile.mkdtemp(dir=f'{ROOT}/work')


def fn(seg):
    p = f'{tmp}/in.wav'
    write(p, seg)
    y = super_resolution(model, p, seed=42, guidance_scale=GUIDE, ddim_steps=STEPS, latent_t_per_second=12.8)
    y = np.asarray(y, dtype=np.float32).reshape(-1)
    return y[: len(seg)] if len(y) >= len(seg) else np.pad(y, (0, len(seg) - len(y)))


log = {'steps': STEPS, 'guidance': GUIDE}
for c in CLIPS:
    t = time.time()
    y = chunked(read(f'{ROOT}/clips/{c}.wav'), SR, fn, chunk_s=10.24, overlap_s=1.0)
    write(f'{ROOT}/wet/audiosr/{c}.wav', y)
    log[c] = round(time.time() - t, 1)
    print('audiosr', c, log[c], flush=True)
log['_peak_vram_gb'] = round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)
json.dump(log, open(f'{ROOT}/wet/audiosr/_run.json', 'w'))
print(log)
