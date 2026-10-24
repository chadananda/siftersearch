# Remaster R&D step 2d: Resemble Enhance WET outputs on aorus's GPU. resden = its denoiser only (UNet mask, keeps the voice);
# resenh = the CFM enhancer with denoise-before (lambd) and a LOW prior temperature (tau) — "low strength"; its value is the
# regenerated top band, used only above the original's bandwidth by build_cands. Venv: ~/media-gpu/venv-resemble.
# Usage: python run_resemble.py <root> resden|resenh [clip ...] → <root>/wet/<name>/<clip>.wav (48 kHz)
import json, os, sys, time, types
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources, chunked

ROOT, NAME = sys.argv[1], sys.argv[2]
CLIPS = sys.argv[3:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
RUN_DIR = os.path.expanduser(os.environ.get('RESEMBLE_DIR', '~/media-gpu/models/resemble/enhancer_stage2'))
LAMBD, TAU, NFE = float(os.environ.get('RES_LAMBD', '0.5')), float(os.environ.get('RES_TAU', '0.1')), int(os.environ.get('RES_NFE', '64'))

for m in ('deepspeed', 'deepspeed.accelerator', 'deepspeed.runtime', 'deepspeed.runtime.engine', 'deepspeed.runtime.utils'):
    sys.modules.setdefault(m, types.ModuleType(m))   # training-only import; inference loads a plain state dict
sys.modules['deepspeed'].DeepSpeedConfig = object
sys.modules['deepspeed.accelerator'].get_accelerator = lambda: None
sys.modules['deepspeed.runtime.engine'].DeepSpeedEngine = object
sys.modules['deepspeed.runtime.utils'].clip_grad_norm_ = None

wait_resources(5.0 if NAME == 'resenh' else 3.0, 4.0)   # the enhancer peaks ~3.6 GB at 10 s chunks; 5 s chunks + headroom
import torch
from pathlib import Path
from scipy.signal import resample_poly
from resemble_enhance.enhancer.inference import denoise, enhance


def fn(seg):
    x = torch.from_numpy(seg.copy())
    if NAME == 'resden':
        y, sr2 = denoise(x, SR, 'cuda', run_dir=Path(RUN_DIR))
    else:
        y, sr2 = enhance(x, SR, 'cuda', nfe=NFE, solver='midpoint', lambd=LAMBD, tau=TAU, run_dir=Path(RUN_DIR))
    y = y.detach().cpu().numpy().reshape(-1).astype(np.float32)
    if int(sr2) != SR:
        g = np.gcd(int(sr2), SR)
        y = resample_poly(y, SR // g, int(sr2) // g).astype(np.float32)
    return y


log = {'lambd': LAMBD, 'tau': TAU, 'nfe': NFE}
for c in CLIPS:
    t = time.time()
    y = chunked(read(f'{ROOT}/clips/{c}.wav'), SR, fn, chunk_s=5.0 if NAME == 'resenh' else 10.0, overlap_s=1.0)
    write(f'{ROOT}/wet/{NAME}/{c}.wav', y)
    log[c] = round(time.time() - t, 1)
log['_peak_vram_gb'] = round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)
json.dump(log, open(f'{ROOT}/wet/{NAME}/_run.json', 'w'))
print(NAME, log)
