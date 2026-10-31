# GPU STAGE MATRIX (Chad 10-30: "get every stage working on every platform"). Runs each GPU stage of media_tool.py on a real speech clip
# inside the worker image and PROVES the GPU did the work, per process tree: NVIDIA via nvidia-smi compute-apps (container needs --pid=host),
# AMD via DRM fdinfo (drm-memory-vram / drm-engine-gfx). A stage passes only if it exits 0 AND used the GPU. Last stdout line = JSON table.
# Usage (in the image): python gpu_matrix.py <speech.mp3> [--ss 1800 --t 120] [--only transcribe,diarize] [--out /job/matrix.json]
import argparse, glob, json, os, re, shutil, subprocess, sys, tempfile, threading, time

MEDIA = os.environ.get('SIFTER_MEDIA', '/opt/sifter/media')
MODELS = os.environ.get('SIFTER_GATE_MODELS', '/opt/gate/models')
PY = os.environ.get('MEDIA_PYTHON', sys.executable)
DFN_PY = os.environ.get('MEDIA_DFN_PYTHON', '/opt/gate/venv/bin/python')
STAGES = ['probe', 'langid', 'transcribe', 'diarize', 'spkscreen', 'realign', 'dfn', 'grade']


def vendor():
    if shutil.which('nvidia-smi'):
        return 'nvidia'
    if os.path.exists('/dev/kfd'):
        return 'amd'
    return None


def tree(root):
    """root pid + every descendant (from /proc)."""
    kids = {}
    for st in glob.glob('/proc/[0-9]*/stat'):
        try:
            parts = open(st).read().rsplit(')', 1)[1].split()
            kids.setdefault(int(parts[1]), []).append(int(st.split('/')[2]))
        except Exception:
            pass
    out, todo = set(), [root]
    while todo:
        p = todo.pop()
        if p not in out:
            out.add(p); todo += kids.get(p, [])
    return out


def amd_usage(pids):
    """(vram MiB, gfx engine ns) summed over the DRM fds of these processes (one fd per client; dedup by drm-client-id)."""
    seen, vram, gfx = set(), 0, 0
    for p in pids:
        for f in glob.glob(f'/proc/{p}/fdinfo/*'):
            try:
                t = open(f).read()
            except Exception:
                continue
            if 'drm-driver:\tamdgpu' not in t and 'drm-driver: amdgpu' not in t:
                continue
            cid = re.search(r'drm-client-id:\s*(\d+)', t)
            if not cid or cid.group(1) in seen:
                continue
            seen.add(cid.group(1))
            m = re.search(r'drm-memory-vram:\s*(\d+)\s*KiB', t)
            vram += int(m.group(1)) // 1024 if m else 0
            g = re.search(r'drm-engine-gfx:\s*(\d+)\s*ns', t)
            gfx += int(g.group(1)) if g else 0
    return vram, gfx


def nvidia_usage(pids):
    try:
        out = subprocess.run(['nvidia-smi', '--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return 0, 0
    mem = sum(int(m) for p, m in (l.split(', ') for l in out.strip().splitlines() if ', ' in l) if int(p) in pids)
    return mem, 0


def run(name, cmd, v, timeout=1800):
    """Run one stage; sample its process tree's GPU use every 0.5 s."""
    t0 = time.time(); r0 = os.times()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    peak = {'vram_mb': 0, 'gfx_ms': 0}
    gfx_by_pid_max = 0

    def sample():
        nonlocal gfx_by_pid_max
        while proc.poll() is None:
            pids = tree(proc.pid)
            mb, gfx = (amd_usage if v == 'amd' else nvidia_usage)(pids)
            peak['vram_mb'] = max(peak['vram_mb'], mb)
            gfx_by_pid_max = max(gfx_by_pid_max, gfx)
            time.sleep(0.5)
    th = threading.Thread(target=sample, daemon=True); th.start()
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill(); out, err = proc.communicate()
    th.join(2)
    r1 = os.times()
    peak['gfx_ms'] = round(gfx_by_pid_max / 1e6)
    gpu = peak['vram_mb'] >= 64 or peak['gfx_ms'] > 0
    ok = proc.returncode == 0
    return {'stage': name, 'ok': ok and gpu, 'exit': proc.returncode, 'gpu_used': gpu, **peak,
            'wall_s': round(time.time() - t0, 1), 'cpu_s': round((r1.children_user + r1.children_system) - (r0.children_user + r0.children_system), 1),
            'why': '' if ok and gpu else ('ran on the CPU: no GPU use observed' if ok else (err or out).strip()[-400:]),
            'stdout': (out.strip().splitlines() or [''])[-1][:300]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('--ss', type=float, default=0); ap.add_argument('--t', type=float, default=120)
    ap.add_argument('--only', default=''); ap.add_argument('--out', default=''); ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()
    v = vendor()
    if not v:
        print(json.dumps({'ok': False, 'why': 'no GPU visible in this container'})); sys.exit(1)
    d = tempfile.mkdtemp(prefix='gpumatrix-')
    clip = os.path.join(d, 'clip.mp3')
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(a.ss), '-t', str(a.t), '-i', a.input, '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '2', clip], check=True)
    tool = [PY, os.path.join(MEDIA, 'media_tool.py')]
    common = ['--threads', str(a.threads), '--models', MODELS]
    tr, dz = os.path.join(d, 'asr.json'), os.path.join(d, 'diar.json')
    only = set(filter(None, a.only.split(','))) or set(STAGES)
    rows = []

    def work_json():
        """the transcript as one paragraph per segment — realign's input"""
        segs = json.load(open(tr)).get('segments', [])
        g = lambda o, *k: next((o[x] for x in k if o.get(x) is not None), None)   # transcribe writes s/e + w; whisper start/end + word
        ps = [{'n': i + 1, 't0': g(s, 's', 'start'), 't1': g(s, 'e', 'end'), 'lang': 'en', 'words': [{'w': (g(w, 'w', 'word') or '').strip(), 's': g(w, 's', 'start'), 'e': g(w, 'e', 'end')} for w in s.get('words', []) if g(w, 's', 'start') is not None]}
              for i, s in enumerate(segs)]
        p = os.path.join(d, 'work.json'); json.dump({'paragraphs': [x for x in ps if x['words']]}, open(p, 'w')); return p

    plan = {
        'probe': lambda: tool + ['probe', clip, '--starts', '0,40', '--len', '30'] + common,
        'langid': lambda: tool + ['langid', clip] + common,
        'transcribe': lambda: tool + ['transcribe', clip, '--lang', 'en', '--output', tr] + common,
        'diarize': lambda: tool + ['diarize', clip, '--output', dz] + common,
        'spkscreen': lambda: tool + ['spkscreen', clip, '--segments', tr] + common,
        'realign': lambda: tool + ['realign', clip, '--segments', work_json(), '--output', os.path.join(d, 'realign.json')] + common,
        'dfn': lambda: [DFN_PY, os.path.join(MEDIA, 'media_tool.py'), 'dfn', clip, '--output', os.path.join(d, 'dfn.flac')] + common,
        'grade': lambda: tool + ['grade', clip] + common,
    }
    for s in STAGES:
        if s not in only:
            continue
        if s in ('spkscreen', 'realign') and not os.path.exists(tr):
            rows.append({'stage': s, 'ok': False, 'why': 'needs transcribe output'}); continue
        try:
            rows.append(run(s, plan[s](), v))
        except Exception as err:
            rows.append({'stage': s, 'ok': False, 'why': f'{type(err).__name__}: {err}'[:300]})
        r = rows[-1]
        print(f"{r['stage']:<11} {'PASS' if r['ok'] else 'FAIL'}  gpu={r.get('gpu_used')} vram={r.get('vram_mb')}MB wall={r.get('wall_s')}s cpu={r.get('cpu_s')}s  {r.get('why', '')[:160]}", file=sys.stderr, flush=True)
    res = {'vendor': v, 'clip_s': a.t, 'ok': all(r['ok'] for r in rows), 'stages': rows}
    if a.out:
        json.dump(res, open(a.out, 'w'), indent=1)
    shutil.rmtree(d, ignore_errors=True)
    print(json.dumps(res))
    sys.exit(0 if res['ok'] else 1)


if __name__ == '__main__':
    main()
