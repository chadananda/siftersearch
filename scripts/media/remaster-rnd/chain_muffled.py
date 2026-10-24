# Remaster pilot step 2: the MUFFLED-source chains Chad has picked between (Ioas rounds 2–3), applied to any clip whose
# MossFormer2-SE wet output exists. Every recipe = gentle denoise (MF2SE wet/dry) → corrective EQ from the clip's own voice
# spectrum (crossover at the grade bandwidth) → WPE dereverb (wet/dry) → optional split-band de-esser → -18 LUFS.
# The FALLBACK rungs (same chain at MF2SE 35 %, then the original) are built too, so the veto can step down and the
# published copy is never worse than the original. CPU (boss). Usage: python chain_muffled.py <root> [recipe ...]
#   <root>/clips/<key>.wav + <root>/wet/mf2se/<key>.wav + <root>/clips/clips.json (bw_khz) → <root>/cands/<key>/<recipe>.wav
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tube, tube3
from rnd_common import read, write, align, mix
from build_cands import finish

RECIPES = {   # name: (mf2se wet share, EQ, mud dB, WPE wet share, de-ess)
    't2-deres-wpe': (0.6, 'deres', None, 0.5, False),
    't3-mud4-wpe': (0.6, 'deres2', -4, 0.5, False),
    't3-mud4-wpe-deess': (0.6, 'deres2', -4, 0.5, True),
    't3-mud7-wpe-deess': (0.6, 'deres2', -7, 0.5, True),
    't3-mud7-wpe80-deess': (0.6, 'deres2', -7, 0.8, True),
}


def apply(dry, wet, bw_khz, recipe, mf_share=None):
    w, eq, mud, wpe_w, de = RECIPES[recipe]
    tube.set_fc(bw_khz)
    base = mix(dry, wet, w if mf_share is None else mf_share)
    y = tube.deresonance(base)[0] if eq == 'deres' else tube3.deres2(base, mud)[0]
    y = mix(y, tube.wpe(y), wpe_w)
    return tube3.deess(y)[0] if de else y


def main():
    root = sys.argv[1]
    recipes = sys.argv[2:] or list(RECIPES)
    meta = json.load(open(f'{root}/clips/clips.json'))
    os.makedirs(f'{root}/work', exist_ok=True)
    for key, m in meta.items():
        dry = read(f'{root}/clips/{key}.wav')
        wp = f'{root}/wet/mf2se/{key}.wav'
        if not os.path.exists(wp):
            print(key, 'no MF2SE wet output yet', flush=True)
            continue
        wet = align(dry, read(wp))[0]
        od = f'{root}/cands/{key}'
        os.makedirs(od, exist_ok=True)
        if not os.path.exists(f'{od}/original.wav'):
            write(f'{od}/original.wav', finish(dry))
        for r in recipes:
            for name, share in ((r, None), (f'{r}@mf35', 0.35)):
                if not os.path.exists(f'{od}/{name}.wav'):
                    write(f'{od}/{name}.wav', finish(apply(dry, wet, m['bw_khz'], r, share)))
        print(key, 'done', flush=True)


if __name__ == '__main__':
    main()
