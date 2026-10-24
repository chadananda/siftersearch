# Remaster R&D step 2b: DeepFilterNet3 WET outputs at a capped attenuation (atten_lim dB; 0 = uncapped), 48 kHz.
# Venv: ~/media-gpu/venv-dfn (production's DFN venv, read-only use). Usage: python run_dfn.py <root> <atten> [clip ...]
# → <root>/wet/dfn<atten>/<clip>.wav
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from rnd_common import SR, read, write, wait_resources

ROOT, ATT = sys.argv[1], float(sys.argv[2])
CLIPS = sys.argv[3:] or [f[:-4] for f in sorted(os.listdir(f'{ROOT}/clips')) if f.endswith('.wav')]
wait_resources(3.0, 4.0)
import torch
from df.enhance import enhance, init_df
model, state, _ = init_df(log_level='ERROR')
assert state.sr() == SR
name = f'dfn{int(ATT)}'
log = {}
for c in CLIPS:
    t = time.time()
    x = torch.from_numpy(read(f'{ROOT}/clips/{c}.wav')).unsqueeze(0)
    y = enhance(model, state, x, atten_lim_db=ATT or None).squeeze(0).numpy()
    write(f'{ROOT}/wet/{name}/{c}.wav', y)
    log[c] = round(time.time() - t, 1)
json.dump(log, open(f'{ROOT}/wet/{name}/_run.json', 'w'))
print(name, log)
