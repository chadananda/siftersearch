import {it,expect} from 'vitest';import {execFileSync} from 'node:child_process';
it('rejects traversal, arbitrary input/output names, and arbitrary job identities',()=>{
 const r=execFileSync('python3',['-c',`
from scripts.media.whole_gate import job_dir,INPUT,OUTPUT
for s in ['../escape','anything','recording-../escape','recording-a;id']:
 try:job_dir(s);raise AssertionError(s)
 except ValueError:pass
assert not INPUT.fullmatch('../job.json') and not INPUT.fullmatch('script.py')
assert not OUTPUT.fullmatch('post/../../key') and not OUTPUT.fullmatch('post/script.py')
assert INPUT.fullmatch('in.mp3') and OUTPUT.fullmatch('post/unipase.flac')
print('restricted')`],{encoding:'utf8'});expect(r.trim()).toBe('restricted');
});
