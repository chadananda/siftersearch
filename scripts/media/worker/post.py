# The WORKER's half of a remaster (Chad 10-24: tower does only Dewey, orchestration and publishing — it never reprocesses audio).
# Everything that decides the outcome runs here: transcript diagnostics (which never splice listening audio), the
# deterministic cleanup for talks the guard holds, the forced re-alignment, the four web encodes, and the quality VERDICT. Tower
# validates the manifest (post.json), records the verdict, places the files and publishes.
#   job.json['post'] = { af, max_fallback_pct, slug, work_sha, ogg, m4a, orig_ogg, orig_m4a, bw_khz, hum_hz, cleanup: bool, mode }
#   mode 'restore' (default) / 'post': out.flac is the generative copy and asr.json its transcript ('post' = finishing a result tower holds).
#   mode 'cleanup': no generative copy at all.
import glob, hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)          # scripts/media
UNREPAIRABLE_BW_KHZ = 2.5
CV_PYTHON = os.environ.get('SIFTER_CV_PYTHON', '/opt/cv/bin/python')
CV_DIR = os.environ.get('SIFTER_CV_DIR', '/opt/models/clearvoice')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def sh(cmd, runner=subprocess.run):
    return runner(cmd, capture_output=True, text=True, check=True).stdout


def waveform(pcm, sr=8000, pps=20):
    """Same normalized BBC peak format as api/lib/media/peaks.js, on the worker."""
    import numpy as np
    x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
    spp = max(1, round(sr / pps)); data = []
    q = lambda v: max(-128, min(127, int(np.floor(v * 127 + 0.5))))
    for start in range(0, len(x), spp):
        part = x[start:start+spp]
        data += [q(min(0, float(part.min()))), q(max(0, float(part.max())))]
    peak = max([1] + [abs(v) for v in data]); k = 127 / peak
    data = [max(-128, min(127, int(np.floor(v * k + 0.5)))) for v in data]
    return dict(version=2, channels=1, sample_rate=sr, samples_per_pixel=spp, bits=8, length=len(data)//2, data=data)


def pct_of(g):
    return g.get('fallback_sent_pct') if g.get('fallback_sent_pct') is not None else g.get('swapped_pct')


def verdict(method, g, g_first, bw, max_pct, why=None):
    """usable (pure generative copy published) · spliced (any sentence from the original: NEVER published, Chad 10-29) · cleaned (deterministic cleanup published) · review · unrepairable. Mirrors api/lib/media/remaster-quality.js."""
    fb = pct_of(g) if g else None
    first = pct_of(g_first) if g_first else None
    metrics = {'source_bandwidth_khz': bw, 'fallback_pct': fb, 'restored_fallback_pct': first, 'sentences': (g or {}).get('sentences'), 'sentences_from_original': (g or {}).get('swapped'),
               'unguardable_s': (g or {}).get('unguardable_s'), 'method': method}
    if method == 'restored':
        v, r = ('spliced', f'{fb} % of sentences are the original: never published') if (fb or 0) > 0 or ((g or {}).get('swapped') or 0) > 0 else ('usable', 'continuous restored audio; transcript differences are review notes' if (g or {}).get('mode') == 'audit' else 'passed the word guard')
    elif method == 'cleaned':
        v, r = 'cleaned', f'deterministic cleanup (the generative copy fell back on {first} % of sentences)'
    elif bw is not None and bw <= UNREPAIRABLE_BW_KHZ and first is not None and first > max_pct:
        v, r = 'unrepairable', f'source bandwidth {bw} kHz and {first} % of sentences fell back: real word damage'
    else:
        v, r = 'review', why or f'{first} % of sentences fell back (> {max_pct} %)'
    return {'verdict': v, 'reason': r, 'metrics': metrics}


def guard(py, tools, src, copy, work, asr, ref, af, out_flac, out_json, runner):
    cmd = [py, os.path.join(tools, 'remaster_guard.py'), '--original', src, '--unipase', copy, '--work', work, '--asr', asr, '--af', af or '',
           '--output', out_flac, '--report', out_json] + (['--ref', ref] if os.path.exists(ref) else [])
    return json.loads(cpu_phase(sh,cmd,runner).strip().split('\n')[-1])

def cpu_phase(fn,*args,**kwargs):
    from gpu_lease import lease
    with lease('guard'):return fn(*args,**kwargs)


def process(d, runner=subprocess.run, py=sys.executable, tools=TOOLS, transcribe=None, cv_python=None):
    job = json.load(open(os.path.join(d, 'job.json')))
    cfg = job.get('post')
    out = {'ok': False, 'steps': {}}
    t0 = time.time()
    if not cfg:
        return out
    cv_python = cv_python or CV_PYTHON
    work = os.path.join(d, 'work.json')
    src = sorted(glob.glob(os.path.join(d, 'in.*')))[0]
    if not os.path.exists(work) or sha256(work) != cfg.get('work_sha'):
        out['why'] = 'work.json missing or changed'
        return out
    post = os.path.join(d, 'post'); os.makedirs(post, exist_ok=True)
    flac, gjson = os.path.join(post, 'unipase.flac'), os.path.join(post, 'unipase.guard.json')
    ref, af, maxp, bw = os.path.join(d, 'asr_orig.json'), cfg.get('af'), cfg.get('max_fallback_pct', 15), cfg.get('bw_khz')
    out['work_sha'] = cfg['work_sha']
    g_first, g, method, why = None, None, None, None
    # 1. the generative copy through the word guard
    if cfg.get('mode', 'restore') in ('restore', 'post') and os.path.exists(os.path.join(d, 'out.flac')):
        g_first = guard(py, tools, src, os.path.join(d, 'out.flac'), work, os.path.join(d, 'asr.json'), ref, af, flac, os.path.join(post, 'restored.guard.json'), runner)
        out['steps']['guard'] = round(time.time() - t0, 1)
        pct = pct_of(g_first)
        if pct is not None and pct <= maxp:
            g, method = g_first, 'restored'
            rg = os.path.join(post, 'restored.guard.json')
            if os.path.exists(rg): os.replace(rg, gjson)
            else: json.dump(g_first, open(gjson, 'w'))
    # 2. held (or no generative copy): the deterministic, non-generative cleanup — same guard, so no word can change
    if method is None and cfg.get('cleanup') and transcribe and os.path.exists(cv_python):
        t1 = time.time()
        cleaned, casr = os.path.join(post, 'cleaned.flac'), os.path.join(d, 'asr_cleaned.json')
        try:
            cmd = [py, os.path.join(HERE, 'cleanup.py'), '--input', src, '--output', cleaned, '--bw', str(bw or 3.0), '--cv-python', cv_python, '--cv-dir', CV_DIR] + (['--hum', str(cfg['hum_hz'])] if cfg.get('hum_hz') else [])
            out['cleanup'] = json.loads(sh(cmd, runner).strip().split('\n')[-1])
            json.dump(transcribe(cleaned), open(casr, 'w'), ensure_ascii=False)
            g2 = guard(py, tools, src, cleaned, work, casr, ref, af, flac, gjson, runner)
            out['steps']['cleanup'] = round(time.time() - t1, 1)
            p2 = pct_of(g2)
            if p2 is not None and p2 <= maxp:
                g, method = g2, 'cleaned'
            else:
                why = f'the cleaned copy fell back on {p2} % of sentences too'
        except Exception as err:
            why = f'cleanup unavailable here: {str(err)[-160:]}'
            out['cleanup_error'] = why
    out['guard'] = g or g_first or {}
    out['method'] = method
    out['qa'] = verdict(method, g, g_first, bw, maxp, why)
    if method is None:
        out['ok'] = True; out['held'] = True       # tower records the verdict; no realign / encode is wasted on a held talk
        return out
    # Quality is measured on both copies; uncertain/worse results keep the existing listening copy.
    if cfg.get('assess_quality'):
        try:
            # The gate environment owns the pinned quality-model dependencies;
            # the restoration environment has a different torchmetrics version.
            python = os.environ.get('MEDIA_QUALITY_PYTHON', '/opt/gate/venv/bin/python')
            quality = os.path.join(os.path.dirname(__file__), 'quality.py')
            assessment = json.loads(cpu_phase(subprocess.check_output,[python, quality, src, flac, af or '', str(cfg.get('threads', 2))], text=True))
        except Exception as err:
            assessment = {'version': 1, 'status': 'failed', 'passed': False, 'error': str(err)[-500:]}
        out['qa']['output_assessment'] = assessment
        json.dump(assessment, open(os.path.join(d, 'output-assessment.json'), 'w'))
        if not assessment.get('passed'):
            out['ok'] = True; out['held'] = True
            out['qa']['verdict'] = 'review'
            out['qa']['reason'] = 'paired listening-quality assessment did not demonstrate reliable improvement'
            out['why'] = out['qa']['reason']
            return out
    # 3. forced re-alignment of the final transcript on the chosen copy
    t2 = time.time()
    rj = os.path.join(post, 'realign.json')
    if cfg.get('selftest'):      # the image selftest: no speech to align, the stages around it still run
        out['realign'] = {'placed': 1, 'total': 1}
        rj = None
    def run_realign(cpu=False):
        env = {**os.environ, 'CUDA_VISIBLE_DEVICES': ''} if cpu else None
        cp = runner([py, os.path.join(tools, 'media_tool.py'), 'realign', flac, '--threads', str(cfg.get('threads', 4)), '--segments', work, '--output', rj],
                    capture_output=True, text=True, check=True, **({'env': env} if env else {}))
        out['realign_err'] = (getattr(cp, 'stderr', '') or '')[-300:]
        return json.loads(cp.stdout.strip().split('\n')[-1])
    try:
        r = {'placed': 1, 'total': 1} if rj is None else run_realign()
        if not r.get('total') or r['placed'] / r['total'] < 0.98:     # 10-24: 0 of 1672 placed on a pod's GPU while aorus placed all — retry on the CPU before giving up
            out['realign_gpu'] = {'placed': r.get('placed'), 'total': r.get('total')}
            r = run_realign(cpu=True)
    except Exception as err:     # no aligner on this machine: the guard result stands (tower aligns itself only in non-strict mode)
        out['ok'] = True; out['why'] = f'realign unavailable here: {str(err)[-160:]}'; out['work_sha'] = cfg['work_sha']
        return out
    out['realign'] = {'placed': r.get('placed'), 'total': r.get('total')}; out['steps']['realign'] = round(time.time() - t2, 1)
    out['qa']['metrics']['realign_unplaced_pct'] = round((1 - r['placed'] / r['total']) * 100, 2) if r.get('total') else None
    if not r.get('total') or 1 - r['placed'] / r['total'] > 0.02:
        out['ok'] = True; out['held'] = True; out['why'] = 'realign placed too few words'
        out['qa'] = verdict(None, None, g_first or g, bw, maxp, 'realign placed too few words on the restored copy')
        return out
    # 4. the four web copies
    t3 = time.time()
    slug = cfg['slug']
    trim = cfg.get('trim')
    window = ['-ss', str(trim.get('start_s', 0))] if trim else []
    if trim and trim.get('end_s') is not None: window += ['-t', str(trim['end_s'] - trim.get('start_s', 0))]
    ff = lambda inp, a, args, dst: sh(['ffmpeg', '-nostdin', '-v', 'error', '-y'] + window + ['-i', inp] + (['-af', a] if a else []) + args + [dst], runner)
    web = {'ogg': f'{slug}.ogg', 'm4a': f'{slug}.m4a', 'orig_ogg': f'{slug}.original.ogg', 'orig_m4a': f'{slug}.original.m4a'}
    try:
        ff(flac, None, cfg['ogg'], os.path.join(post, web['ogg']))
        ff(flac, None, cfg['m4a'], os.path.join(post, web['m4a']))
        # Decode and normalize the original once, then split to both unchanged
        # output recipes. Loudnorm was the same expensive pass in two processes.
        if not (cfg.get('reuse_original_web') and all(os.path.getsize(os.path.join(post, web[k])) > 0 for k in ['orig_ogg', 'orig_m4a'])):
            graph = '[0:a]' + ((af + ',') if af else '') + 'asplit=2[ogg][aac]'
            sh(['ffmpeg', '-nostdin', '-v', 'error', '-y'] + window + ['-i', src,
                '-filter_complex', graph, '-map', '[ogg]'] + cfg['orig_ogg'] + [os.path.join(post, web['orig_ogg']),
                '-map', '[aac]'] + cfg['orig_m4a'] + [os.path.join(post, web['orig_m4a'])], runner)
    except Exception as err:
        out['ok'] = True; out['why'] = f'encode failed here: {str(err)[-160:]}'
        return out
    if trim: out['trim'] = trim
    out['web'] = web; out['steps']['encode'] = round(time.time() - t3, 1)
    pcm = runner(['ffmpeg', '-nostdin', '-v', 'error', '-i', flac if trim else os.path.join(post, web['ogg']),
                  '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    peaks = waveform(pcm.encode() if isinstance(pcm, str) else pcm)
    json.dump(peaks, open(os.path.join(post, 'waveform.json'), 'w'))
    out['waveform_file'] = 'waveform.json'
    probe = sh(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', flac if trim else os.path.join(post, web['m4a'])], runner)
    out['duration_s'] = float((json.loads(probe or '{}').get('format') or {}).get('duration') or cfg.get('audio_s') or 0)
    out['ok'] = True; out['seconds'] = round(time.time() - t0, 1)
    return out


if __name__ == '__main__':
    d = sys.argv[1]
    res = process(d)
    json.dump(res, open(os.path.join(d, 'post.json.tmp'), 'w'))
    os.replace(os.path.join(d, 'post.json.tmp'), os.path.join(d, 'post.json'))
    print(json.dumps({k: v for k, v in res.items() if k != 'guard'}))
