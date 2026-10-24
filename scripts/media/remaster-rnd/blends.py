# Remaster lab: blends of generative outputs Chad singled out (ElevenLabs = realistic, Sidon = clearest). All envelope-aligned
# to the original (generative timing offsets are 5–60 ms), level-matched, then -18 LUFS. CPU. Usage: python blends.py <root> <clip>
#   lab-eleven+sidon-70-30 / -50-50   time-aligned parallel mixes
#   lab-eleven-lo+sidon-hi            ElevenLabs below 3.5 kHz (realism), Sidon's regenerated band above (clarity)
#   lab-eleven>sidon                  Sidon run ON ElevenLabs' output (wet/eleven+sidon, boss GPU)
#   lab-eleven>lavasr                 LavaSR v2 bandwidth extension of ElevenLabs' output (wet/eleven+lavasr, boss GPU)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rnd_common import read, write, env_align, mix, hf_blend
from build_cands import finish

root, clip = sys.argv[1], sys.argv[2]
d = read(f'{root}/clips/{clip}.wav')
A = lambda m: env_align(d, read(f'{root}/wet/{m}/{clip}.wav'))
e, le, ce = A('eleven')
s, ls_, cs = A('sidon')
out = {'lab-eleven+sidon-70-30': mix(e, s, 0.3), 'lab-eleven+sidon-50-50': mix(e, s, 0.5), 'lab-eleven-lo+sidon-hi': hf_blend(e, s, 3500)}
for m, n in (('eleven+sidon', 'lab-eleven>sidon'), ('eleven+lavasr', 'lab-eleven>lavasr'), ('sidon-boss', 'lab-sidon-boss')):
    if os.path.exists(f'{root}/wet/{m}/{clip}.wav'):
        out[n] = A(m)[0]
for n, y in out.items():
    write(f'{root}/cands/{clip}/{n}.wav', finish(y))
    print(n)
