"""single_restore.py split in two hosts (typed jobs, scripts/media/worker/job-types.json).
  gpu <dir>:    UniPASE + the re-ASR of BOTH copies (runpod_worker.run_job), the word guard's MEASUREMENT (post.guard: remaster_guard.py, measures only,
                never splices) and the forced realign on the guarded copy — audio and models loaded once, on the GPU host.
  finish <dir>: post.py on a CPU host with those two measurements replayed (identical commands, recorded outputs): verdict, assessment, quiet, encodes.
Files: <dir>/{in.*, work.json, job.json{post}} → gpu adds out.flac (emptied: the guard consumed it), asr.json, asr_orig.json, restore-result.json,
post/{unipase.flac, restored.guard.json, guard.out.json, realign.json, realign.out.json} → finish adds post.json, done.json, post/** (web copies)."""
import contextlib, gc, glob, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import post as postmod

GUARD_OUT, REALIGN_OUT = 'post/guard.out.json', 'post/realign.out.json'


def stage(d, name):
    tmp = os.path.join(d, 'progress.json.tmp')
    with open(tmp, 'w') as f: json.dump({'stage': name, 'at': time.time()}, f)
    os.replace(tmp, os.path.join(d, 'progress.json'))


def paths(d):
    cfg = json.load(open(os.path.join(d, 'job.json'))).get('post') or {}
    src = sorted(glob.glob(os.path.join(d, 'in.*')))[0]
    p = os.path.join(d, 'post')
    return cfg, src, {'flac': os.path.join(p, 'unipase.flac'), 'report': os.path.join(p, 'restored.guard.json'), 'realign': os.path.join(p, 'realign.json'),
                      'work': os.path.join(d, 'work.json'), 'out': os.path.join(d, 'out.flac'), 'asr': os.path.join(d, 'asr.json'), 'ref': os.path.join(d, 'asr_orig.json')}


def realign_cmd(py, flac, threads, work, out):
    """post.py run_realign's command, exactly (the replay matches on it)."""
    return [py, os.path.join(postmod.TOOLS, 'media_tool.py'), 'realign', flac, '--threads', str(threads), '--segments', work, '--output', out]


def gpu(d):
    import torch
    import runpod_worker as worker
    from worker.gpu_lease import lease
    from worker.language_data import prepare
    os.environ['HF_HUB_OFFLINE'] = '1'; os.environ['TRANSFORMERS_OFFLINE'] = '1'
    prepare()
    os.environ['TORCH_HOME'] = '/root/.cache/torch'; torch.set_num_threads(2)
    cfg, src, f = paths(d)
    if not postmod.words_match(f['work'], cfg): raise RuntimeError('work.json does not match the job words_key')
    stage(d, 'unipase')
    with contextlib.ExitStack() as phase:     # single_restore.py main, GPU half
        phase.enter_context(lease('unipase'))
        up, inference, asr = worker.load_models('/opt/unipase', '/opt/models/weights', asr_device='deferred')
        worker.ASR_MODEL['asr'] = asr
        def restore_finished():
            phase.close(); stage(d, 'restore_asr'); phase.enter_context(lease('restore_asr'))
        done = worker.run_job(d, up, inference, asr, release_restore=restore_finished)
        worker.ASR_MODEL.clear(); del asr, up; gc.collect(); torch.cuda.empty_cache()
    with open(os.path.join(d, 'restore-result.json'), 'w') as fh: json.dump(done, fh)
    os.makedirs(os.path.join(d, 'post'), exist_ok=True)
    stage(d, 'guard_measure')
    py = sys.executable
    g =postmod.guard(py, postmod.TOOLS, src, f['out'], f['work'], f['asr'], f['ref'], cfg.get('af'), f['flac'], f['report'], subprocess.run)
    json.dump(g, open(os.path.join(d, GUARD_OUT), 'w'))
    if not cfg.get('selftest'):      # post.py skips the realign on the image selftest
        stage(d, 'realign')
        try:
            cp = subprocess.run(realign_cmd(py, f['flac'], cfg.get('threads', 4), f['work'], f['realign']), capture_output=True, text=True, check=True)
            rec = {'stdout': cp.stdout, 'stderr': (cp.stderr or '')[-300:]}
        except Exception as err:     # recorded: post.py on the finishing host gets the same failure (its "realign unavailable" path), not a crash here
            rec = {'error': (str(err) + ' ' + (getattr(err, 'stderr', '') or ''))[-500:]}
        json.dump(rec, open(os.path.join(d, REALIGN_OUT), 'w'))
    open(f['out'], 'w').close()      # the raw copy was guarded into post/unipase.flac; its bytes do not travel (whole jobs empty it too)
    stage(d, 'complete')


class Replay:
    """post.py's runner on the finishing host: the guard and the realign that ran on the GPU host return their recorded output; all else runs."""
    def __init__(self, d, run=subprocess.run):
        self.d, self.run = d, run
        self.used = set()

    def __call__(self, cmd, **kw):
        name = os.path.basename(str(cmd[1])) if len(cmd) > 1 else ''
        if name == 'remaster_guard.py':
            rec = os.path.join(self.d, GUARD_OUT)
            if not os.path.exists(rec): raise RuntimeError('no recorded guard measurement from the gpu job')
            out = cmd[cmd.index('--output') + 1]
            if not os.path.exists(out): raise RuntimeError('recorded guard has no output copy ' + out)
            self.used.add('guard')
            return subprocess.CompletedProcess(cmd, 0, json.dumps(json.load(open(rec))) + '\n', '')
        if name == 'media_tool.py' and len(cmd) > 2 and cmd[2] == 'realign':
            rec = os.path.join(self.d, REALIGN_OUT)
            if not os.path.exists(rec): raise RuntimeError('no recorded realign from the gpu job')
            r = json.load(open(rec)); self.used.add('realign')
            if r.get('error'): raise RuntimeError('realign failed on the gpu host: ' + r['error'])
            out = cmd[cmd.index('--output') + 1]
            if not os.path.exists(out): raise RuntimeError('recorded realign has no output ' + out)
            return subprocess.CompletedProcess(cmd, 0, r['stdout'], r.get('stderr', ''))
        return self.run(cmd, **kw)


def finish(d, run=subprocess.run, silence=None):
    """runpod_worker.finalize + single_restore.post_only, with the replaying runner."""
    stage(d, 'guard')
    done = json.load(open(os.path.join(d, 'restore-result.json')))
    try:
        res = postmod.process(d, runner=Replay(d, run), silence=silence)
        json.dump(res, open(os.path.join(d, 'post.json'), 'w'))
        done['post_s'] = res.get('seconds')
    except Exception:
        import traceback
        open(os.path.join(d, 'post.error.txt'), 'w').write(traceback.format_exc()[-2000:])
        res = None
    json.dump(done, open(os.path.join(d, 'done.json.tmp'), 'w')); os.replace(os.path.join(d, 'done.json.tmp'), os.path.join(d, 'done.json'))
    if not res or not res.get('ok') or not (res.get('held') or res.get('web')):
        err = os.path.join(d, 'post.error.txt')
        why = open(err).read()[-1200:] if os.path.exists(err) else json.dumps({k: (res or {}).get(k) for k in ('ok', 'held', 'web', 'why')})
        raise RuntimeError('Incomplete restoration result; no publication: ' + why)
    stage(d, 'complete')
    return res


if __name__ == '__main__':
    mode, d = sys.argv[1], os.path.abspath(sys.argv[2])
    {'gpu': gpu, 'finish': finish}[mode](d)
