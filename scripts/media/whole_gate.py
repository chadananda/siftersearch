"""Restricted home CPU worker protocol; no arbitrary commands or image names."""
import fcntl,json,os,re,shutil,subprocess,sys
from pathlib import Path
ROOT=Path.home()/'sifter-whole-home'
INPUT=re.compile(r'^(in\.[a-z0-9]{2,5}|out\.flac|asr\.json|asr_orig\.json|work\.json|job\.json)$')
OUTPUT=re.compile(r'^(post\.json|done\.json|post/(unipase\.flac|[a-zA-Z0-9_.-]+\.(json|ogg|m4a)))$')

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
        cfg=json.load(open(d/'job.json')).get('post',{})
        if cfg.get('mode')!='post' or cfg.get('cleanup') is not False or not cfg.get('assess_quality'):raise ValueError('Only assessed cached restorations are accepted')
        image=(Path(__file__).parent/'whole-image.txt').read_text().strip()
        if not re.fullmatch(r'ghcr.io/chadananda/sifter-media-worker@sha256:[a-f0-9]{64}',image):raise ValueError('No accepted image')
        with open(ROOT/'dispatch.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            existing=state(job)
            if existing:print(json.dumps(existing));return
            busy=docker('ps','--filter','label=io.sifter.cpu-post=1','--format','{{.Names}}').stdout.splitlines()
            if len(busy)>=2:print('{"waiting":true}');return
            (ROOT/'leases').mkdir(exist_ok=True)
            docker('run','-d','--name',job,'--label','io.sifter.cpu-post=1','--network','none','--cpus','4','--memory','10g','--pids-limit','256','-v',str(d)+':/job','-v',str(ROOT/'leases')+':/workspace/.gpu-admission','-e','SIFTER_GPU_LEASES=1','-e','MEDIA_DEVICE=cpu','-e','CUDA_VISIBLE_DEVICES=','--entrypoint','python',image,'/opt/sifter/media/worker/single_restore.py','/job')
        print('{"started":true}');return
    if verb=='whole-poll':print(json.dumps(state(job)));return
    if verb=='whole-fetch':
        name=args[2]
        if not OUTPUT.fullmatch(name):raise ValueError('Unexpected output')
        p=d/name
        if p.is_symlink() or p.parent.is_symlink():raise ValueError('Symlink output')
        with open(p,'rb') as f:shutil.copyfileobj(f,sys.stdout.buffer,1024*1024)
        return
    raise ValueError('Verb not allowed')

if __name__=='__main__':
    try:main(sys.argv[1:])
    except Exception as e:print(json.dumps({'error':str(e)[-400:]}),file=sys.stderr);sys.exit(2)
