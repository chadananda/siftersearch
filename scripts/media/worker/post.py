# The POD's half of a remaster (Chad 10-24: tower does only Dewey, orchestration and publishing). After UniPASE + the two Whisper
# transcripts, the pod runs what used to cost tower minutes of CPU per talk: the word guard, the forced re-alignment on the guarded copy,
# and the four web encodes (remaster + original, Opus and m4a). Tower validates (work.json hash, files present), places the files and
# publishes. Any step that cannot run here is simply absent from post.json and tower computes it itself (the old path stays as the fallback).
#   python post.py <job-dir>        job.json['post'] = { af, max_fallback_pct, ogg, m4a, orig_ogg, orig_m4a, slug, work_sha }
import glob, hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)          # scripts/media


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def sh(cmd, runner=subprocess.run):
    return runner(cmd, capture_output=True, text=True, check=True).stdout


def process(d, runner=subprocess.run, py=sys.executable, tools=TOOLS):
    job = json.load(open(os.path.join(d, 'job.json')))
    cfg = job.get('post')
    out = {'ok': False, 'steps': {}}
    t0 = time.time()
    if not cfg:
        return out
    work = os.path.join(d, 'work.json')
    src = sorted(glob.glob(os.path.join(d, 'in.*')))[0]
    if not os.path.exists(work) or sha256(work) != cfg.get('work_sha'):
        out['why'] = 'work.json missing or changed'
        return out
    post = os.path.join(d, 'post'); os.makedirs(post, exist_ok=True)
    flac, guard_json = os.path.join(post, 'unipase.flac'), os.path.join(post, 'unipase.guard.json')
    # 1. the word guard (original spliced back for every sentence the copy lost)
    ref = os.path.join(d, 'asr_orig.json')
    cmd = [py, os.path.join(tools, 'remaster_guard.py'), '--original', src, '--unipase', os.path.join(d, 'out.flac'), '--work', work, '--asr', os.path.join(d, 'asr.json'),
           '--af', cfg.get('af') or '', '--output', flac, '--report', guard_json] + (['--ref', ref] if os.path.exists(ref) else [])
    g = json.loads(sh(cmd, runner).strip().split('\n')[-1])
    out['guard'] = g; out['steps']['guard'] = round(time.time() - t0, 1)
    pct = g.get('fallback_sent_pct') if g.get('fallback_sent_pct') is not None else g.get('swapped_pct')
    if pct is None or pct > cfg.get('max_fallback_pct', 15):
        out['ok'] = True; out['held'] = True; out['work_sha'] = cfg['work_sha']       # tower records the review; no realign / encode is wasted on a held talk
        return out
    # 2. forced re-alignment of the final transcript on the guarded copy
    t1 = time.time()
    rj = os.path.join(post, 'realign.json')
    try:
        r = json.loads(sh([py, os.path.join(tools, 'media_tool.py'), 'realign', flac, '--threads', str(cfg.get('threads', 4)), '--segments', work, '--output', rj], runner).strip().split('\n')[-1])
    except Exception as err:     # no aligner on this machine: the guard result still stands, tower aligns and encodes itself
        out['ok'] = True; out['why'] = f'realign unavailable here: {str(err)[-160:]}'; out['work_sha'] = cfg['work_sha']
        return out
    out['realign'] = {'placed': r.get('placed'), 'total': r.get('total')}; out['steps']['realign'] = round(time.time() - t1, 1)
    if not r.get('total') or 1 - r['placed'] / r['total'] > 0.02:
        out['ok'] = True; out['held'] = True; out['why'] = 'realign placed too few words'
        return out
    # 3. the four web copies
    t2 = time.time()
    slug = cfg['slug']
    ff = lambda inp, af, args, dst: sh(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', inp] + (['-af', af] if af else []) + args + [dst], runner)
    web = {'ogg': f'{slug}.ogg', 'm4a': f'{slug}.m4a', 'orig_ogg': f'{slug}.original.ogg', 'orig_m4a': f'{slug}.original.m4a'}
    out['work_sha'] = cfg['work_sha']
    try:
        ff(flac, None, cfg['ogg'], os.path.join(post, web['ogg']))
        ff(flac, None, cfg['m4a'], os.path.join(post, web['m4a']))
        ff(src, cfg.get('af'), cfg['orig_ogg'], os.path.join(post, web['orig_ogg']))
        ff(src, cfg.get('af'), cfg['orig_m4a'], os.path.join(post, web['orig_m4a']))
    except Exception as err:
        out['ok'] = True; out['why'] = f'encode failed here: {str(err)[-160:]}'
        return out
    out['web'] = web; out['steps']['encode'] = round(time.time() - t2, 1)
    out['ok'] = True; out['seconds'] = round(time.time() - t0, 1)
    return out


if __name__ == '__main__':
    d = sys.argv[1]
    res = process(d)
    json.dump(res, open(os.path.join(d, 'post.json.tmp'), 'w'))
    os.replace(os.path.join(d, 'post.json.tmp'), os.path.join(d, 'post.json'))
    print(json.dumps({k: v for k, v in res.items() if k != 'guard'}))
