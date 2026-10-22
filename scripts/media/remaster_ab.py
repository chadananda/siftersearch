# Remastering A/B (Chad 10-22: pick by ear before production enhancement changes). One excerpt of an original →
# original / smart EQ / Resemble Enhance / VoiceFixer, each loudness-matched (-18 LUFS) and encoded to Opus, each measured
# with media_tool.py grade. Runs in ~/sifter/venvs/remaster (torch CPU, resemble-enhance, voicefixer); never touches the
# archive (reads the original, writes only into --out). Usage: python remaster_ab.py <original> --start 600 --len 45 --out DIR
import argparse, json, os, shutil, subprocess, sys, time

MEDIA_PY = os.path.expanduser('~/sifter/venvs/media/bin/python')
TOOL = next((t for t in (os.path.join(os.path.dirname(os.path.abspath(__file__)), 'media_tool.py'),
             os.path.expanduser('~/sifter/siftersearch/scripts/media/media_tool.py')) if os.path.exists(t)), 'media_tool.py')
# resemble-enhance weights (HF ResembleAI/resemble-enhance; fetched with `hf download`, no git-lfs needed)
RESEMBLE_DIR = os.environ.get('RESEMBLE_DIR', os.path.expanduser('~/sifter/remaster/resemble-model/enhancer_stage2'))
# speech EQ for a muffled recording: rumble cut, less mud, presence + air lifted (a shelf only raises what is there), gentle
# compression; no denoise (that is a separate decision)
SMART_EQ = ('highpass=f=80,equalizer=f=250:t=q:w=1.0:g=-3,equalizer=f=3000:t=o:w=1.5:g=5,'
            'highshelf=f=6000:g=4,acompressor=threshold=-24dB:ratio=2.5:attack=15:release=200')


def sh(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f"{args[0]} failed: {r.stderr[-600:]}")
    return r.stdout


def wav(src, dst, start=None, dur=None, sr=44100, af=None):
    args = ['ffmpeg', '-y', '-v', 'error']
    if start is not None:
        args += ['-ss', str(start)]
    args += ['-i', src]
    if dur is not None:
        args += ['-t', str(dur)]
    if af:
        args += ['-af', af]
    sh(args + ['-ac', '1', '-ar', str(sr), dst])


def publish(src, dst):
    # loudness-matched (two variants at different levels would be judged by level, not quality), Opus 64k mono
    sh(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '64k', dst])


def grade(path):
    try:
        return json.loads(sh([MEDIA_PY, TOOL, 'grade', path]).strip().splitlines()[-1])
    except Exception as e:  # a measurement failure must not lose the listening files
        return {'error': str(e)[:200]}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('input')
    p.add_argument('--start', type=float, default=600)
    p.add_argument('--len', type=float, default=45)
    p.add_argument('--out', required=True)
    p.add_argument('--threads', type=int, default=8)
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    import torch
    torch.set_num_threads(a.threads)
    res = {'input': a.input, 'start': a.start, 'len': a.len, 'variants': {}}
    base = os.path.join(a.out, 'original.wav')
    wav(a.input, base, a.start, a.len)
    jobs = {'original': lambda o: shutil.copy(base, o),
            'smart-eq': lambda o: wav(base, o, af=SMART_EQ)}

    def resemble(o):
        # resemble-enhance imports deepspeed for TRAINING only; inference loads a plain state dict — stub it
        import types
        from pathlib import Path
        for m in ('deepspeed', 'deepspeed.accelerator', 'deepspeed.runtime', 'deepspeed.runtime.engine', 'deepspeed.runtime.utils'):
            sys.modules.setdefault(m, types.ModuleType(m))
        sys.modules['deepspeed'].DeepSpeedConfig = object
        sys.modules['deepspeed.accelerator'].get_accelerator = lambda: None
        sys.modules['deepspeed.runtime.engine'].DeepSpeedEngine = object
        sys.modules['deepspeed.runtime.utils'].clip_grad_norm_ = None
        from resemble_enhance.enhancer.inference import enhance
        import torchaudio
        x, sr = torchaudio.load(base)
        y, sr2 = enhance(x.mean(0), sr, 'cpu', nfe=64, solver='midpoint', lambd=0.9, tau=0.5, run_dir=Path(RESEMBLE_DIR))
        torchaudio.save(o, y.unsqueeze(0).cpu(), sr2)

    def voicefixer(o):
        from voicefixer import VoiceFixer
        VoiceFixer().restore(input=base, output=o, cuda=False, mode=0)

    jobs['resemble-enhance'] = resemble
    jobs['voicefixer'] = voicefixer
    for name, fn in jobs.items():
        t0 = time.time()
        raw = os.path.join(a.out, f'{name}.raw.wav')
        try:
            fn(raw)
            publish(raw, os.path.join(a.out, f'{name}.opus'))
            res['variants'][name] = {'cpu_s': round(time.time() - t0, 1), 'file': f'{name}.opus', 'grade': grade(raw)}
        except Exception as e:
            res['variants'][name] = {'error': str(e)[:300], 'cpu_s': round(time.time() - t0, 1)}
        print(json.dumps({'variant': name, **res['variants'][name]})[:300], file=sys.stderr, flush=True)
    with open(os.path.join(a.out, 'ab.json'), 'w') as f:
        json.dump(res, f, indent=1)
    print(json.dumps(res))


if __name__ == '__main__':
    main()
