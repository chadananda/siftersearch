import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
it('does not spend the same pending GPU headroom twice, while allowing safe concurrent stages', () => {
 const j=JSON.parse(execFileSync('python3',['-c',`
import json
from scripts.media.worker.gpu_lease import fits
print(json.dumps([fits(20,24,0,8),fits(20,24,16,8),fits(12,24,8,4.5),fits(3,8,0,6.5)]))`],{encoding:'utf8'}));
 expect(j).toEqual([true,false,true,false]);
});
it('serializes actual competing processes until a reserved slot is released', () => {
 const r=execFileSync('python3',['-c',`
import multiprocessing as mp, tempfile, os, time
from scripts.media.worker import gpu_lease as g
from scripts.media.worker import controller as c
root=tempfile.mkdtemp();ctx=mp.get_context('fork');q=ctx.Queue();release=ctx.Event()
def worker(n):
 os.environ.update(SIFTER_GPU_LEASES='1',SIFTER_GPU_LEASE_DIR=root,CUDA_VISIBLE_DEVICES='0')
 g.shutil.which=lambda x:'/bin/true';g.sample=lambda:(20,24,60)
 g.os.readlink=lambda x:'test-pid-namespace'
 c.read_system=lambda:{'ram_total_gb':64,'ram_avail_gb':40}
 with g.lease('unipase',need=8,timeout=5):
  q.put(n)
  if n<3:release.wait(4)
ps=[ctx.Process(target=worker,args=(n,)) for n in [1,2]]
for p in ps:p.start()
assert {q.get(timeout=3),q.get(timeout=3)}=={1,2}
p=ctx.Process(target=worker,args=(3,));p.start();ps.append(p)
import queue
try:q.get(timeout=.3);raise AssertionError('oversubscribed pending VRAM')
except queue.Empty:pass
release.set();assert q.get(timeout=3)==3
for p in ps:p.join(3);assert p.exitcode==0
print('serialized')`],{encoding:'utf8',timeout:10000});
 expect(r.trim()).toBe('serialized');
});
it('keeps a live reservation from another container with the same PID',()=>{
 const r=JSON.parse(execFileSync('python3',['-c',`
import json
from scripts.media.worker.gpu_lease import live_reservations
s={'other:1':{'namespace':'other','pid':1,'identity':'different','at':100,'need':6.5}}
print(json.dumps([list(live_reservations(s,'mine',110)),list(live_reservations(s,'mine',161))]))`],{encoding:'utf8'}));
 expect(r).toEqual([['other:1'],[]]);
});
