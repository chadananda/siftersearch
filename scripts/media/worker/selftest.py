# SELFTEST for the media worker image (Chad 10-25: "we have been debugging on paid pods — test it locally first").
# Same entrypoint, same env as a pod: python /opt/sifter/media/worker/selftest.py [--skip-net] [--json]
# Checks every baked weight's checksum, the imports of each venv, ffmpeg, HF_HOME / offline, the clock, disk, outbound reachability to tower's
# edge and R2, then runs a 20-second CPU job end to end through post.py's non-GPU stages (word guard -> web encodes). GPU stages are skipped when no GPU.
# Exit 0 only when everything passed; otherwise exit 1 with the reasons (JSON on the last line). The pod bootstrap runs it BEFORE the worker starts.
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.dirname(HERE)
GATE = os.environ.get('SIFTER_GATE', '/opt/gate')
MODELS = os.environ.get('SIFTER_MODELS', '/opt/models')
results = []


def check(name, fn):
    t0 = time.time()
    try:
        r = fn()
        results.append({'name': name, 'ok': True, 'detail': (str(r) if r is not None else '')[:200], 's': round(time.time() - t0, 1)})
    except Exception as err:
        results.append({'name': name, 'ok': False, 'detail': f'{type(err).__name__}: {err}'[:400], 's': round(time.time() - t0, 1)})


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, check=True, **kw).stdout


def weights():
    mf = os.path.join(MODELS, 'weights.sha256')
    if not os.path.exists(mf):
        return 'skipped: this image predates the checksum manifest'
    import hashlib
    n = 0
    for line in open(mf):
        sha, path = line.split(None, 1)
        path = path.strip()
        h = hashlib.sha256()
        with open(os.path.join(MODELS, path) if not path.startswith('/') else path, 'rb') as f:
            for b in iter(lambda: f.read(1 << 22), b''):
                h.update(b)
        if h.hexdigest() != sha:
            raise RuntimeError(f'checksum mismatch: {path}')
        n += 1
    return f'{n} files verified'


def imports(py, mods):
    out = sh([py, '-c', f'import {",".join(mods)}; print("ok")'], timeout=300).strip()
    if out != 'ok':
        raise RuntimeError(out)
    return ','.join(mods)


def env_ok():
    hf = os.environ.get('HF_HOME', '')
    if not hf or not os.path.isdir(hf):
        raise RuntimeError(f'HF_HOME unset or missing ({hf!r}) — the baked aligners / Whisper cache are not found')
    hub = os.path.join(hf, 'hub')
    have = os.listdir(hub) if os.path.isdir(hub) else []
    for want in ('whisper', 'wav2vec2'):
        if not any(want in d.lower() for d in have):
            raise RuntimeError(f'no {want} model under {hub}: {have[:6]}')
    return f'{len(have)} cached model repos'


def clock():
    req = urllib.request.Request('https://siftersearch.com/', method='HEAD', headers={'User-Agent': 'sifter-selftest'})
    d = urllib.request.urlopen(req, timeout=20).headers.get('Date')
    from email.utils import parsedate_to_datetime
    skew = abs(time.time() - parsedate_to_datetime(d).timestamp())
    if skew > 120:
        raise RuntimeError(f'clock skew {skew:.0f} s')
    return f'skew {skew:.1f} s'


def reach(url):
    def f():
        req = urllib.request.Request(url, method='GET', headers={'User-Agent': 'sifter-selftest', 'Range': 'bytes=0-0'})
        try:
            return urllib.request.urlopen(req, timeout=20).status
        except urllib.error.HTTPError as e:   # an answer of any kind proves the route
            return e.code
    return f


def disk():
    for p in ('/', '/workspace'):
        if os.path.exists(p):
            free = shutil.disk_usage(p).free / 1e9
            if free < 15:
                raise RuntimeError(f'{p}: {free:.0f} GB free (< 15)')
    return f'{shutil.disk_usage("/").free / 1e9:.0f} GB free'


def gpu():
    if not shutil.which('nvidia-smi'):
        return 'no GPU here (GPU stages skipped)'
    return sh(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader']).strip()


def e2e():
    """20 s of synthetic speech-like audio through post.py's guard -> encodes; the 'transcript' is identical for both copies, so the guard must keep everything."""
    import hashlib
    d = tempfile.mkdtemp(prefix='selftest-')
    try:
        sh(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=20', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=pink:a=0.02', '-filter_complex', 'amix=inputs=2', '-ac', '1', '-ar', '48000', os.path.join(d, 'in.mp3')])
        shutil.copy(os.path.join(d, 'in.mp3'), os.path.join(d, 'out.flac')) if False else sh(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', os.path.join(d, 'in.mp3'), '-ar', '48000', os.path.join(d, 'out.flac')])
        words = [{'w': f'word{i}', 's': 1 + i * 0.9, 'e': 1.7 + i * 0.9, 'p': 0.95} for i in range(20)]
        asr = {'segments': [{'start': 1, 'end': 19, 'text': ' '.join(w['w'] for w in words), 'words': words}], 'language': 'en'}
        json.dump(asr, open(os.path.join(d, 'asr.json'), 'w')); json.dump(asr, open(os.path.join(d, 'asr_orig.json'), 'w'))
        work = {'paragraphs': [{'n': 1, 't0': 1.0, 't1': 18.7, 'lang': 'en', 'words': [{'w': w['w'], 's': w['s'], 'e': w['e']} for w in words], 'sentences': [[0, 10], [10, 20]]}]}
        json.dump(work, open(os.path.join(d, 'work.json'), 'w'))
        sha = hashlib.sha256(open(os.path.join(d, 'work.json'), 'rb').read()).hexdigest()
        json.dump({'post': {'af': 'highpass=f=70', 'max_fallback_pct': 15, 'slug': 'selftest', 'work_sha': sha, 'selftest': True, 'bw_khz': 8,
                            'ogg': ['-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-application', 'audio'], 'm4a': ['-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
                            'orig_ogg': ['-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '56k', '-application', 'audio'], 'orig_m4a': ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart']}},
                  open(os.path.join(d, 'job.json'), 'w'))
        sys.path.insert(0, HERE)
        import post
        r = post.process(d, tools=MEDIA)
        if not r.get('web'):
            raise RuntimeError(f'post.py produced no web files: {json.dumps({k: v for k, v in r.items() if k != "guard"})[:300]}')
        for k, f in r['web'].items():
            sz = os.path.getsize(os.path.join(d, 'post', f))
            if sz < 2000:
                raise RuntimeError(f'{f} is {sz} bytes')
        return f'guard {r["guard"].get("fallback_sent_pct")} % fallback, 4 web files, {r["seconds"]} s'
    finally:
        shutil.rmtree(d, ignore_errors=True)


def main():
    skip_net = '--skip-net' in sys.argv
    check('disk', disk)
    check('gpu', gpu)
    check('ffmpeg', lambda: sh(['ffmpeg', '-hide_banner', '-encoders']).count('libopus') and 'libopus ok' or (_ for _ in ()).throw(RuntimeError('ffmpeg has no libopus')))
    check('env HF_HOME / aligners / whisper cache', env_ok)
    check('weights', weights)
    check('imports (system python)', lambda: imports(sys.executable, ['torch', 'whisperx', 'faster_whisper', 'soundfile', 'scipy', 'numpy', 'einops', 'omegaconf']))
    if os.path.exists(f'{GATE}/venv/bin/python'):
        check('imports (gate venv)', lambda: imports(f'{GATE}/venv/bin/python', ['torchmetrics', 'librosa', 'onnxruntime', 'soundfile', 'faster_whisper']))
    if os.path.exists(f'{GATE}/venv-dfn/bin/python'):
        check('imports (DeepFilterNet venv)', lambda: imports(f'{GATE}/venv-dfn/bin/python', ['torch', 'df']))
    if os.path.exists('/opt/cv/bin/python'):
        check('imports (cleanup venv)', lambda: imports('/opt/cv/bin/python', ['clearvoice', 'nara_wpe', 'scipy']))
    if not skip_net:
        check('clock', clock)
        check('reach tower edge', reach('https://siftersearch.com/api/health'))
        check('reach R2', reach('https://pub-e57ab96621a24ba18bcce728b4c51de2.r2.dev/'))
    check('e2e: 20 s job through post.py (guard -> 4 encodes)', e2e)
    bad = [r for r in results if not r['ok']]
    print(json.dumps({'ok': not bad, 'failed': [f'{r["name"]}: {r["detail"]}' for r in bad], 'checks': results}))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
