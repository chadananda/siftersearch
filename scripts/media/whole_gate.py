"""Restricted home CPU worker protocol; no arbitrary commands or image names."""
import fcntl,json,os,re,shutil,subprocess,sys
MEM_NEED_GB=6   # a CPU tail needs 6 GB; the reserve is a share of this machine's own RAM (mem_reserve), not a per-host number
from pathlib import Path
ROOT=Path.home()/'sifter-whole-home'
INPUT=re.compile(r'^(in\.[a-z0-9]{2,5}|out\.flac|asr\.json|asr_orig\.json|work\.json|job\.json)$')
OUTPUT=re.compile(r'^(post\.json|done\.json|post/(unipase\.flac|[a-zA-Z0-9_.-]+\.(json|ogg|m4a)))$')
WHOLE_OUT=re.compile(r'^(result\.json|item/[A-Za-z0-9_.\-]+(/[A-Za-z0-9_.\-]+)*)$')   # a whole recording's manifest + files (tower verifies every sha256)
WHOLE_MEM_GB=10   # container cap (whole = ASR + alignment + UniPASE + encodes in ONE container on the GPU)
WHOLE_ADMIT_GB=8  # admission need: measured cgroup peak 7.5 GB incl. reclaimable page cache (10-28, memory.peak); the cap + oom_score_adj 900 + the floor are the guard rails
IMAGE_RE=re.compile(r'^(ghcr\.io/chadananda/sifter-media-worker@sha256:[a-f0-9]{64}|sifter-media-worker:rocm-[a-z0-9-]{1,40})$')

def mem_reserve():
    """Floor of 2 GB or 12 % of this host's MemTotal (same rule as api/lib/media/tools.js memReserveFor)."""
    tot=next((int(l.split()[1])/1048576 for l in open('/proc/meminfo') if l.startswith('MemTotal:')),0)
    return max(2,tot*.12)

def admit(busy,need):
    """Capacity-driven: another job starts when measured free RAM covers its need and no job is still loading (its memory is not yet visible)."""
    avail=next((int(l.split()[1])/1048576 for l in open('/proc/meminfo') if l.startswith('MemAvailable:')),0)
    loading=any('second' in x or x.startswith('Less') for x in docker('ps','--filter','label=io.sifter.cpu-post=1','--format','{{.RunningFor}}').stdout.splitlines())
    return not loading and avail>=need+mem_reserve()

def job_dir(job):
    if not re.fullmatch(r'recording-[a-z0-9-]{1,100}',job):raise ValueError('Invalid job identity')
    d=ROOT/job
    if d.is_symlink():raise ValueError('Invalid job path')
    return d

def docker(*args,check=True):
    return subprocess.run(['sudo','-n','docker',*args],capture_output=True,text=True,check=check)

def state(job):
    r=docker('inspect',job,'--format','{{json .State}}',check=False)
    return json.loads(r.stdout) if r.returncode==0 else None

def start_whole(job,d):
    """A whole recording on the AMD GPU: the accepted :rocm image, no network, memory/pids bounded, first thing the kernel kills. ONE at a time."""
    image=(Path(__file__).parent/'whole-image-rocm.txt').read_text().strip()
    if not IMAGE_RE.fullmatch(image):raise ValueError('No accepted rocm image')
    with open(ROOT/'dispatch.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        existing=state(job)
        if existing:print(json.dumps(existing));return
        busy=docker('ps','--filter','label=io.sifter.cpu-post=1','--format','{{.Names}}').stdout.splitlines()
        avail=next((int(l.split()[1])/1048576 for l in open('/proc/meminfo') if l.startswith('MemAvailable:')),0)
        if not admit(busy,WHOLE_ADMIT_GB):print('{"waiting":true}');return
        (ROOT/'leases').mkdir(exist_ok=True);(ROOT/'cache').mkdir(exist_ok=True)
        gids=[str(os.stat(p).st_gid) for p in ('/dev/kfd','/dev/dri/renderD128') if os.path.exists(p)]
        grp=[x for g in dict.fromkeys(gids) for x in ('--group-add',g)]
        docker('run','-d','--name',job,'--label','io.sifter.cpu-post=1','--device','/dev/kfd','--device','/dev/dri',*grp,'--network','none','--cpus','8','--memory',f'{WHOLE_MEM_GB}g','--memory-swap',f'{WHOLE_MEM_GB}g','--oom-score-adj','900','--pids-limit','512','-v',str(d)+':/job','-v',str(ROOT/'leases')+':/workspace/.gpu-admission','-v',str(ROOT/'cache')+':/cache','-e','SIFTER_GPU_LEASES=1','--entrypoint','/usr/local/bin/node',image,'/opt/sifter/api/lib/media/whole-recording.mjs','/job')
    print('{"started":true}')

def main(args):
    verb,job=args[:2];d=job_dir(job);ROOT.mkdir(exist_ok=True)
    if verb=='whole-put':
        name=args[2]
        if not INPUT.fullmatch(name):raise ValueError('Unexpected input')
        if (state(job)or{}).get('Running'):raise ValueError('Job already running')
        d.mkdir(exist_ok=True)
        if (d/name).is_symlink():raise ValueError('Symlink input')
        with open(d/(name+'.part'),'wb') as f:
            total=0
            while True:
                b=sys.stdin.buffer.read(1024*1024)
                if not b:break
                total+=len(b)
                if total>8*1024**3:raise ValueError('Input too large')
                f.write(b)
        os.replace(d/(name+'.part'),d/name);print('{"staged":true}');return
    if verb=='whole-start':
        jj=json.load(open(d/'job.json'))
        if jj.get('v')==1 and jj.get('device')=='rocm' and not jj.get('post'):return start_whole(job,d)
        cfg=jj.get('post',{})
        if cfg.get('mode')!='post' or cfg.get('cleanup') is not False or not cfg.get('assess_quality'):raise ValueError('Only assessed cached restorations are accepted')
        image=(Path(__file__).parent/'whole-image.txt').read_text().strip()
        if not re.fullmatch(r'ghcr.io/chadananda/sifter-media-worker@sha256:[a-f0-9]{64}',image):raise ValueError('No accepted image')
        with open(ROOT/'dispatch.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            existing=state(job)
            if existing:print(json.dumps(existing));return
            busy=docker('ps','--filter','label=io.sifter.cpu-post=1','--format','{{.Names}}').stdout.splitlines()
            # ONE container at a time, and only with RAM to spare: boss has 31 GB and Chad's own services (llama-coder 22 GB peak, laya) come first
            # (10-28: our jobs overran it, tailscaled was OOM-killed and the box left the network)
            avail=next((int(l.split()[1])/1048576 for l in open('/proc/meminfo') if l.startswith('MemAvailable:')),0)
            if not admit(busy,MEM_NEED_GB):print('{"waiting":true}');return
            (ROOT/'leases').mkdir(exist_ok=True)
            docker('run','-d','--name',job,'--label','io.sifter.cpu-post=1','--network','none','--cpus','4','--memory','6g','--memory-swap','6g','--oom-score-adj','900','--pids-limit','256','-v',str(d)+':/job','-v',str(ROOT/'leases')+':/workspace/.gpu-admission','-e','SIFTER_GPU_LEASES=1','-e','MEDIA_DEVICE=cpu','-e','CUDA_VISIBLE_DEVICES=','--entrypoint','python',image,'/opt/sifter/media/worker/single_restore.py','/job')
        print('{"started":true}');return
    if verb=='whole-poll':print(json.dumps(state(job)));return
    if verb=='whole-fetch':
        name=args[2]
        if not (OUTPUT.fullmatch(name) or WHOLE_OUT.fullmatch(name)) or '..' in name.split('/'):raise ValueError('Unexpected output')
        p=d/name
        if p.is_symlink() or p.parent.is_symlink():raise ValueError('Symlink output')
        with open(p,'rb') as f:shutil.copyfileobj(f,sys.stdout.buffer,1024*1024)
        return
    raise ValueError('Verb not allowed')

if __name__=='__main__':
    try:main(sys.argv[1:])
    except Exception as e:print(json.dumps({'error':str(e)[-400:]}),file=sys.stderr);sys.exit(2)
