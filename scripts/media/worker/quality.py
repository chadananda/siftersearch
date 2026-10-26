"""Paired listening-quality assessment; ASR disagreement never edits audio."""
import json, math, os, subprocess, time


def probe_duration(path):
    p = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',path],capture_output=True,text=True,check=True)
    return float(json.loads(p.stdout)['format']['duration'])


def assess(reference, candidate, af='', threads=2):
    import numpy as np
    import torch
    from torchmetrics.functional.audio import deep_noise_suppression_mean_opinion_score as dnsmos, non_intrusive_speech_quality_assessment as nisqa
    torch.set_num_threads(threads)
    started=time.time(); duration=probe_duration(candidate)
    rows=[]
    for fraction in (.2,.5,.8):
        start=max(0,min(duration-20,duration*fraction)); row={'start_s':round(start,3)}
        for key,path,chain in [('reference',reference,af),('restored',candidate,'')]:
            cmd=['ffmpeg','-nostdin','-v','error','-threads',str(threads),'-ss',str(start),'-t','20','-i',path]
            if chain:cmd+=['-af',chain]
            cmd+=['-ac','1','-ar','16000','-f','f32le','-']
            x=np.frombuffer(subprocess.check_output(cmd),dtype='<f4').copy()
            if len(x)<80000 or not np.isfinite(x).all():raise ValueError('invalid quality sample')
            t=torch.from_numpy(x)
            row[key]={'dnsmos':dnsmos(t,16000,False,num_threads=threads).tolist(),'nisqa':nisqa(t,16000).tolist()}
        rows.append(row)
    out={'version':1,'status':'complete','samples':rows}
    for key in ['reference','restored']:
        out[key]={m:np.mean([r[key][m] for r in rows],axis=0).tolist() for m in ['dnsmos','nisqa']}
    # A streaming pass bounds RAM and catches duration damage and widespread clipping.
    cmd=['ffmpeg','-nostdin','-v','error','-threads',str(threads),'-i',candidate,'-ac','1','-ar','48000','-f','f32le','-']
    proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE); samples=clipped=0
    while True:
        block=proc.stdout.read(65536)
        if not block:break
        x=np.frombuffer(block,dtype='<f4')
        if not np.isfinite(x).all():raise ValueError('non-finite restored samples')
        samples+=len(x);clipped+=int(np.count_nonzero(np.abs(x)>=.999))
    stderr=proc.stderr.read();code=proc.wait()
    if code:raise RuntimeError('quality decode failed: '+stderr.decode(errors='replace')[-300:])
    out['technical']={'duration_s':samples/48000,'clip_pct':100*clipped/max(1,samples)}
    before,after=out['reference'],out['restored'];gain=after['nisqa'][0]-before['nisqa'][0]
    out['checks']={
        'finite_scores':all(math.isfinite(v) for k in ['reference','restored'] for m in ['nisqa','dnsmos'] for v in out[k][m]),
        'quality_gain':gain>=.15,
        'overall_no_regression':after['dnsmos'][3]>=before['dnsmos'][3]-.10,
        'speech_no_material_regression':after['dnsmos'][1]>=before['dnsmos'][1]-.15,
        'consistent_gain':sum(r['restored']['nisqa'][0]>r['reference']['nisqa'][0] for r in rows)>=2,
        'no_bad_excerpt':all(r['restored']['nisqa'][0]>=r['reference']['nisqa'][0]-.3 for r in rows),
        'no_material_clipping':out['technical']['clip_pct']<.01,
        'duration_preserved':abs(samples/48000-probe_duration(reference))<1,
    }
    out['passed']=all(out['checks'].values());out['seconds']=round(time.time()-started,1)
    return out


if __name__ == '__main__':
    import sys
    print(json.dumps(assess(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]))))
