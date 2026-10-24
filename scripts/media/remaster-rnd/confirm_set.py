# UniPASE confirmation set: per clip the original and UniPASE (both -18 LUFS; UniPASE envelope-aligned) for the 5 defect
# clips + the 10 muffled pilot talks, laid out as a root that screen.py / make_page.py read. CPU. Usage: python confirm_set.py <root>
# → <root>/confirm/{clips/clips.json, cands/<clip>/{original,unipase}.wav}
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rnd_common import read, write, env_align
from build_cands import finish

R = sys.argv[1]
C = f'{R}/confirm'
meta = {}
for k, m in json.load(open(f'{R}/clips/clips.json')).items():
    meta[k] = {**m, 'src_clip': f'{R}/clips/{k}.wav', 'wet': f'{R}/wet/unipase/{k}.wav'}
for k, m in json.load(open(f'{R}/pilot/clips/clips.json')).items():
    meta[k] = {**m, 'defect': f"muffled (pilot, bandwidth {m['bw_khz']} kHz)", 'grade': f"{m['speaker']} · bw {m['bw_khz']} kHz",
               'src_clip': f'{R}/pilot/clips/{k}.wav', 'wet': f'{R}/wet/unipase-pilot/{k}.wav'}
if os.path.exists(f'{R}/ml/clips/clips.json'):   # multilingual section (Chad 10-23: does UniPASE hold up beyond English?)
    for k, m in json.load(open(f'{R}/ml/clips/clips.json')).items():
        meta[k] = {**m, 'grade': m['speaker'], 'src_clip': f'{R}/ml/clips/{k}.wav', 'wet': f'{R}/wet/unipase-ml/{k}.wav'}
os.makedirs(f'{C}/clips', exist_ok=True)
os.makedirs(f'{C}/work', exist_ok=True)
for k, m in meta.items():
    if not os.path.exists(m['wet']):
        print(k, 'no UniPASE output yet')
        continue
    d = read(m['src_clip'])
    od = f'{C}/cands/{k}'
    os.makedirs(od, exist_ok=True)
    if not os.path.exists(f'{od}/original.wav'):   # keep files (and their cached screening) stable on re-runs
        write(f'{od}/original.wav', finish(d))
    if os.path.exists(f'{od}/unipase.wav'):
        m['asr_lang'] = m.get('asr_lang', 'en')
        continue
    w, lag, corr = env_align(d, read(m['wet']))
    write(f'{od}/unipase.wav', finish(w))
    m['unipase_lag_ms'], m['unipase_env_corr'] = round(lag / 48), round(corr, 3)
    m.setdefault('asr_lang', 'en')
    print(k, m['unipase_lag_ms'], 'ms', m['unipase_env_corr'])
json.dump(meta, open(f'{C}/clips/clips.json', 'w'), indent=1)
