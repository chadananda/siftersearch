import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
it('a transcript disagreement never substitutes original audio into the listening copy', () => {
 const r=execFileSync('python3',['-c',`
import sys, tempfile, os, json, types, numpy as np
sys.path.insert(0,'scripts/media')
import remaster_guard as g
p=tempfile.mkdtemp()
for name in ['work','asr']:
 json.dump({'segments':[]},open(p+'/'+name,'w'))
wet=np.full(48000,.2,dtype=np.float32);dry=np.full(48000,.8,dtype=np.float32)
g.decode=lambda path,af=None: dry if path=='original' else wet
g.env_lag=lambda *a:0
g.sentences_of=lambda w:[]
g.decide=lambda *a,**k:[{'s':0,'e':1,'swap':True,'lost':['Shoghi'],'unguardable':False}]
def forbid(*a):raise AssertionError('source splicing is forbidden')
g.splice=forbid
saved=[]
sys.modules['soundfile']=types.SimpleNamespace(write=lambda path,a,*args,**kw:saved.append(a.copy()))
sys.argv=['guard','--original','original','--unipase','wet','--work',p+'/work','--asr',p+'/asr','--output',p+'/audio','--report',p+'/report']
g.main()
assert np.array_equal(saved[0],wet)
r=json.load(open(p+'/report'));assert r['swapped']==0 and r['flagged_sentences']==1 and r['mode']=='audit'
print('continuous')`],{encoding:'utf8'});
 expect(r.trim().endsWith('continuous')).toBe(true);
});
