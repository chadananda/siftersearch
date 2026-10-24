# Remaster R&D step 2e: SGMSE+ 48 kHz (score-based diffusion) WET outputs on aorus's GPU — sgmse = EARS-WHAM enhancement
# checkpoint, sgmserev = EARS-Reverb dereverberation checkpoint. The repo's JIT CUDA op (upfirdn2d; needs nvcc) is replaced by
# its own pure-torch path. PC sampler, N=30 (README defaults). Venv: ~/media-gpu/venv-sgmse; repo /data/remaster-rnd/repos/sgmse.
# Usage: python run_sgmse.py <root> sgmse|sgmserev [clip ...] → <root>/wet/<name>/<clip>.wav
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources, chunked

ROOT, NAME = sys.argv[1], sys.argv[2]
CLIPS = sys.argv[3:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
CKPT = {'sgmse': f'{ROOT}/models/sgmse/ears_wham.ckpt', 'sgmserev': f'{ROOT}/models/sgmse/ears_reverb.ckpt'}[NAME]
N, SNR = int(os.environ.get('SGMSE_N', '30')), float(os.environ.get('SGMSE_SNR', '0.5'))
CHUNK = float(os.environ.get('SGMSE_CHUNK', '4'))
sys.path.insert(0, f'{ROOT}/repos/sgmse')

wait_resources(4.0, 5.0)
import torch
import torch.utils.cpp_extension as cpp
cpp.load = lambda *a, **k: None                      # no nvcc here: skip the JIT op …
import sgmse.backbones.ncsnpp_utils.op  # noqa: F401 (registers the submodule)
ufd = sys.modules['sgmse.backbones.ncsnpp_utils.op.upfirdn2d']   # the package re-exports a function of the same name
import sgmse.backbones.ncsnpp_utils.up_or_down_sampling as uds
uds.upfirdn2d = lambda input, kernel, up=1, down=1, pad=(0, 0): ufd.upfirdn2d_native(input, kernel, up, up, down, down, pad[0], pad[1], pad[0], pad[1])   # … and use its torch path
from sgmse.model import ScoreModel
from sgmse.util.other import pad_spec

model = ScoreModel.load_from_checkpoint(CKPT, map_location='cuda')
model.t_eps = 0.03
model.eval()
assert model.backbone == 'ncsnpp_48k', model.backbone


@torch.inference_mode()
def fn(seg):
    y = torch.from_numpy(seg.copy()).view(1, -1).cuda()
    T = y.size(1)
    nf = y.abs().max() + 1e-9
    y = y / nf
    Y = pad_spec(torch.unsqueeze(model._forward_transform(model._stft(y)), 0), mode='reflection')
    sampler = model.get_pc_sampler('reverse_diffusion', 'ald', Y, N=N, corrector_steps=1, snr=SNR)
    sample, _ = sampler()
    return (model.to_audio(sample.squeeze(), T) * nf).float().cpu().numpy().reshape(-1)


log = {'N': N, 'snr': SNR, 'chunk_s': CHUNK}
for c in CLIPS:
    t = time.time()
    y = chunked(read(f'{ROOT}/clips/{c}.wav'), SR, fn, chunk_s=CHUNK, overlap_s=1.0)
    write(f'{ROOT}/wet/{NAME}/{c}.wav', y)
    log[c] = round(time.time() - t, 1)
    print(NAME, c, log[c], flush=True)
log['_peak_vram_gb'] = round(torch.cuda.max_memory_allocated() / 2 ** 30, 2)
json.dump(log, open(f'{ROOT}/wet/{NAME}/_run.json', 'w'))
print(NAME, log)
