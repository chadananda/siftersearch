import {it,expect} from 'vitest';import {execFileSync} from 'node:child_process';
it('bounds long paragraph alignment and preserves every word through pauses',()=>{
 const r=JSON.parse(execFileSync('python3',['-c',`
import json
from scripts.media.worker.alignment_windows import windows
words=[{'w':str(i),'s':i*2+(300 if i>80 else 0),'e':i*2+1+(300 if i>80 else 0)} for i in range(170)]
r=list(windows({'words':words}));print(json.dumps({'max':max(s['end']-s['start'] for s in r),'words':' '.join(s['text'] for s in r).split(),'chunks':len(r)}))`],{encoding:'utf8'}));
 expect(r.max).toBeLessThanOrEqual(27);expect(r.words).toEqual(Array.from({length:170},(_,i)=>String(i)));expect(r.chunks).toBeGreaterThan(10);
});
