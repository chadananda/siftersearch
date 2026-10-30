"""One whole-recording worker per container; each recording is a resumable local job.

No production credentials/DB. Tower stages originals once and consumes manifests.
GPU admission uses the same live feedback controller as remaster workers. CPU
stages overlap other recordings; subprocess exit releases all GPU reservations.
"""
import argparse, glob, json, os, subprocess, sys, time
sys.path.insert(0, '/opt/sifter/media/worker')
from controller import Controller, sample, STAGES, network_bytes, useful_activity

GPU_STAGE = {'transcribe': 'asr', 'restore_asr':'asr', 'probe': 'asr', 'langid': 'asr', 'unipase': 'unipase', 'grade': 'grade', 'realign': 'realign'}

def atomic(path, value):
    with open(path + '.tmp', 'w') as f: json.dump(value, f)
    os.replace(path + '.tmp', path)

def progress(path):
    try: return json.load(open(os.path.join(path, 'progress.json')))
    except (OSError, ValueError): return {}

def main():
    p = argparse.ArgumentParser(); p.add_argument('--spool', default='/workspace/spool'); p.add_argument('--max-jobs', type=int, default=6)
    p.add_argument('--exit-when-done', action='store_true')
    a = p.parse_args(); os.makedirs(a.spool, exist_ok=True)
    stages = {k: dict(v) for k, v in STAGES.items()}
    stages['unipase']['vram'] = 6.5 if sample()['vram_total_gb'] < 12 else 7.5
    os.environ['SIFTER_GPU_LEASES']='1'
    os.environ['PYTHONPATH']='/opt/worker-extras:/opt/sifter/media'
    ctl = Controller(max_jobs=a.max_jobs, stages=stages, stable_s=60); active = {}; born = last_busy = time.time(); work_seen = False; network=network_bytes()
    open(os.path.join(a.spool, '.worker-ready'), 'w').write(str(os.getpid()))
    while True:
        for d, child in list(active.items()):
            code = child.poll()
            if code is not None:
                active.pop(d); ctl.job_finished(d)
                if code:
                    ctl.job_failed(d, 'recording process exit %s' % code)
                    open(os.path.join(d, 'failed'), 'w').close()
                else: open(os.path.join(d, 'complete'), 'w').close()
                try: os.remove(os.path.join(d, 'running'))
                except OSError: pass
            else:
                stage = progress(d).get('stage')
                if stage: ctl.running[d]['stage'] = GPU_STAGE.get(stage, 'guard')
        ctl.tick()
        ready = sorted(glob.glob(os.path.join(a.spool, '*', 'ready')), key=os.path.getmtime)
        current_network=network_bytes()
        if useful_activity(active,ready,current_network-network):last_busy=time.time()
        network=current_network
        if active or ready:work_seen=True
        if a.exit_when_done and work_seen and not active and not ready: return 0
        if os.environ.get('RUNPOD_POD_ID'):
            from runpod_worker import deadman, terminate_self
            hb = os.path.join(a.spool, '.tower-hb')
            why = deadman(time.time(), born, os.path.getmtime(hb) if os.path.exists(hb) else born, 3, 24)   # 24 h hard cap: tower's reaper retires unproductive pods at 8 h
            pending=glob.glob(os.path.join(a.spool,'*','complete'))+glob.glob(os.path.join(a.spool,'*','done.json'))
            idle_seconds=300 if pending else 120
            if not why and not active and not ready and time.time()-last_busy > idle_seconds:
                why = 'no computation or transfer progress for %s minutes' % (idle_seconds//60)
            if why:
                terminate_self(why)
                return 0
        status = {**ctl.heartbeat(), 'at': time.time(), 'ready_jobs': len(ready),
                  'cpu_jobs': sum(1 for d in active if ctl.running[d]['stage'] == 'guard'),
                  'jobs': [{'id': os.path.basename(d), **progress(d)} for d in active]}
        atomic(os.path.join(a.spool, '.worker-status.json'), status)
        if ctl.state == 'drain' and not active: return 75
        # At most two CPU threads per recording; the live GPU limit is independent
        # so postprocessing never consumes a GPU slot.
        cpu_cap = max(1, min(a.max_jobs, int(ctl.last.get('cpus', 2)) // 2))
        if ready and len(active) < cpu_cap:
            d = os.path.dirname(ready[0]); job = json.load(open(os.path.join(d, 'job.json')))
            restoring = job.get('kind') == 'restore' or bool(job.get('post'))
            if not ctl.admit('unipase' if restoring else 'guard'):
                time.sleep(2); continue
            cmd = ['/usr/local/bin/node', '/opt/sifter/api/lib/media/whole-recording.mjs', d]
            if restoring: cmd = ['python', '/opt/sifter/media/worker/single_restore.py', d]
            os.rename(ready[0], os.path.join(d, 'running'))
            ctl.job_started(d, 'unipase' if restoring else 'guard')
            with open(os.path.join(d, 'worker.log'), 'a') as log:
                active[d] = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
        time.sleep(2)

if __name__ == '__main__': sys.exit(main())
