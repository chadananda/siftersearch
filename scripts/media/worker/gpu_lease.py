"""Atomic per-stage GPU reservations shared by all recording processes in a worker."""
import contextlib, fcntl, json, os, shutil, subprocess, time, threading

NEEDS = {'transcribe':4.5,'probe':2.5,'langid':2.5,'dfn':1.2,'realign':2.0,'unipase':8.0,'grade':1.0,'guard':0.0}
RAM_NEEDS={'transcribe':3.5,'probe':2.5,'langid':2.0,'dfn':2.0,'realign':2.5,'unipase':3.5,'grade':3.0,'guard':3.0}

def fits(free, total, reserved, need, margin=.25):
    return free >= need+margin and reserved+need+margin <= total*.9


def identity(pid):
    try:return open(f'/proc/{pid}/stat').read().split(') ',1)[1].split()[19]
    except (OSError,IndexError):return None


def live_reservations(state, namespace, now):
    # Docker containers may each have PID 1. Never inspect another namespace's
    # PID through our /proc or discard its live reservation as a stale process.
    return {k:v for k,v in state.items() if
            (v.get('namespace') == namespace and identity(v['pid']) == v['identity']) or
            (v.get('namespace') != namespace and now-v.get('at',0) < 60)}


def sample():
    r=subprocess.run(['nvidia-smi','--query-gpu=memory.free,memory.total,temperature.gpu','--format=csv,noheader,nounits'],capture_output=True,text=True,check=True,timeout=5)
    free,total,temp=map(float,r.stdout.splitlines()[0].split(','));return free/1024,total/1024,temp


@contextlib.contextmanager
def lease(stage, need=None, timeout=1800):
    if os.environ.get('SIFTER_GPU_LEASES')!='1':
        yield;return
    root=os.environ.get('SIFTER_GPU_LEASE_DIR','/workspace/.gpu-admission');os.makedirs(root,exist_ok=True)
    pid=os.getpid();token=identity(pid);namespace=os.readlink('/proc/self/ns/pid')
    key=namespace+':'+str(pid);path=root+'/leases.json';started=time.monotonic()
    need=NEEDS[stage] if need is None else need
    gpu_enabled=os.environ.get('CUDA_VISIBLE_DEVICES')!='' and os.environ.get('MEDIA_DEVICE')!='cpu' and bool(shutil.which('nvidia-smi'))
    if not gpu_enabled:need=0
    ram=float(os.environ.get('MEDIA_STAGE_RAM_GB') or RAM_NEEDS[stage])
    try:from .controller import read_system
    except ImportError:from controller import read_system
    # Home workers cooperate with the pre-existing GPU gate during migration.
    # Rentals omit this lock and admit multiple stages by measured headroom.
    with contextlib.ExitStack() as outer:
        legacy = os.environ.get('SIFTER_LEGACY_GPU_LOCK')
        if gpu_enabled and need and legacy:
            old_lock = outer.enter_context(open(legacy, 'a'))
            fcntl.flock(old_lock, fcntl.LOCK_EX)
        lock = outer.enter_context(open(root+'/lock','a'))
        while True:
            with contextlib.ExitStack() as stack:
                fcntl.flock(lock,fcntl.LOCK_EX);stack.callback(fcntl.flock,lock,fcntl.LOCK_UN)
                try:state=json.load(open(path))
                except (OSError,ValueError):state={}
                state=live_reservations(state,namespace,time.time())
                free,total,temp=sample() if gpu_enabled else (0,0,0)
                mem=read_system()
                if stage=='unipase' and gpu_enabled and total<12:need=6.5
                gpu_ok=not need or (fits(free,total,sum(v['need'] for v in state.values()),need) and temp<87)
                ram_ok=mem['ram_avail_gb']>=ram+.25 and sum(v.get('ram',0) for v in state.values())+ram+.25<=mem['ram_total_gb']*.9
                if gpu_ok and ram_ok:
                    state[key]={'pid':pid,'namespace':namespace,'identity':token,'need':need,'ram':ram,'stage':stage,'at':time.time()}
                    with open(path+'.tmp','w') as f:json.dump(state,f)
                    os.replace(path+'.tmp',path);break
            if time.monotonic()-started>timeout:raise RuntimeError(f'GPU admission timeout for {stage}')
            time.sleep(1)
        ended=threading.Event()
        def renew():
            while not ended.wait(10):
                # A separate fd prevents a renewal unlock from releasing the
                # main thread's admission/release lock.
                with open(root+'/lock','a') as refresh:
                    fcntl.flock(refresh,fcntl.LOCK_EX)
                    try:
                        state=json.load(open(path))
                        if state.get(key,{}).get('identity')!=token:return
                        state[key]['at']=time.time()
                        with open(path+'.tmp','w') as f:json.dump(state,f)
                        os.replace(path+'.tmp',path)
                    finally:fcntl.flock(refresh,fcntl.LOCK_UN)
        heartbeat=threading.Thread(target=renew,daemon=True);heartbeat.start()
        try:yield
        finally:
            ended.set();heartbeat.join()
            fcntl.flock(lock,fcntl.LOCK_EX)
            try:
                try:state=json.load(open(path))
                except (OSError,ValueError):state={}
                if state.get(key,{}).get('identity')==token:state.pop(key,None)
                with open(path+'.tmp','w') as f:json.dump(state,f)
                os.replace(path+'.tmp',path)
            finally:fcntl.flock(lock,fcntl.LOCK_UN)
