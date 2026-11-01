import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {audioVersion,talkAudio,timingSignature} from '../../api/lib/media/talk-audio.js';
import {runItem} from '../../api/lib/media/item.js';
it('uses the audio revision for both listening copies while page metadata changes',()=>{
 const meta={version:40,audio_version:12,aligned_to:'unipase',web_original:{ogg:'web/test.original.ogg',m4a:'web/test.original.m4a'}};
 const a=talkAudio({slug:'test',level:'full',meta});
 expect(a.ogg).toContain('?v=12');expect(a.m4a).toContain('?v=12');expect(a.original_ogg).toContain('?v=12');expect(a.original_url).toContain('?v=12');
 expect(a.sync_ready).toBe(true); // metadata-only page revisions keep the same known audio timebase
 expect(audioVersion({version:9})).toBe(9);
});
it('withholds audio when its cached asset revision or listening variant cannot match the transcript alignment',()=>{
 const base={version:18,audio_version:12,enhancement:{listening:'unipase'},web_listening:'unipase',aligned_to:'unipase',audio_alignment_version:12};
 expect(talkAudio({slug:'x',level:'full',meta:base}).sync_ready).toBe(true);
 expect(talkAudio({slug:'x',level:'full',meta:{...base,audio_alignment_version:11}}).sync_ready).toBe(false);
 expect(talkAudio({slug:'x',level:'full',meta:{...base,web_listening:'safe'}}).sync_ready).toBe(false);
 expect(talkAudio({slug:'x',level:'full',meta:{...base,audio_publish_pending:true}}).sync_ready).toBe(false);
});
it('signs timing structure so an edited alignment cannot silently keep its previous signature',()=>{
 const words=[{w:'one',s:0,e:0.3},{w:'two',s:0.3,e:0.8}];
 expect(timingSignature([{n:1,words}])).not.toBe(timingSignature([{n:1,words:[...words,{w:'three',s:0.8,e:1}]}]));
 expect(timingSignature([{n:1,words}])).not.toBe(timingSignature([{n:1,words:[{...words[0],s:0.1},words[1]]}]));
});
it('keeps existing audio cache URLs through repeated real metadata-only publication',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'audio-version-'));
 await writeFile(join(dir,'meta.json'),JSON.stringify({slug:'test',title:'Test',version:12,rights:{playback:'full'},stages:{render:{at:'old'},catalog:{at:'old'}}}));
 const words='A garden has many different flowers.'.split(' ').map((w,i)=>({w,s:i,e:i+1}));
 await writeFile(join(dir,'transcript.work.json'),JSON.stringify({paragraphs:[{n:1,t0:0,t1:6,spk:'S1',words,sentences:[[0,6]]}]}));
 const deps={detachedWorker:true,tools:{},llm:{},repo:{updateMediaItem:vi.fn(async()=>{})},quotes:{breakoutsOf:()=>[]},ingest:async()=>({documentId:1}),loadVocab:async()=>[],now:()=>new Date().toISOString(),draining:async()=>false};
 for(let i=0;i<2;i++)await runItem({id:1,dir,state:'done',published_at:'old'},{only:['update'],redo:['update']},deps);
 const meta=JSON.parse(await readFile(join(dir,'meta.json')));
 expect(meta.version).toBe(14);expect(meta.audio_version).toBe(12);
 expect(talkAudio({slug:'test',level:'full',meta}).ogg).toContain('?v=12');
 expect(talkAudio({slug:'test',level:'full',meta}).sync_ready).toBe(true);
 expect(await readFile(join(dir,'page.html'),'utf8')).toContain('web/test.ogg?v=12');
});
it('a text pass over transcript.raw.json re-stamps the alignment only when raw carries the aligned timings',async()=>{
 const {restampAlignment}=await import('../../api/lib/media/item.js');
 const words=[{w:'one',s:0,e:0.3},{w:'two',s:0.3,e:0.8}],edited=[{n:1,words:[{w:'one two',s:0,e:0.8}]}];
 const old=timingSignature([{n:1,words}]);
 for(const [meta,raw,moves] of [[{audio_alignment_hash:old},{},true],[{audio_alignment_hash:old,aligned_to:'safe'},{},true],
  [{audio_alignment_hash:old,aligned_to:'unipase'},{aligned_to:'unipase'},true],[{audio_alignment_hash:old,aligned_to:'unipase'},{},false],[{},{},false]]){
  restampAlignment(meta,raw,edited);
  expect(meta.audio_alignment_hash===timingSignature(edited)).toBe(moves);
 }
});
it('a whole result realigned before correct still passes the render gate after the text passes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'restamp-'));
 const words=['A','garden','has','many','flowers.'].map((w,i)=>({w,s:i,e:i+1,p:0.9}));
 const raw={language:'en',segments:[{s:0,e:5,spk:'S1',text:words.map((x)=>x.w).join(' '),words}]};
 await writeFile(join(dir,'transcript.raw.json'),JSON.stringify(raw));
 const work={paragraphs:[{n:1,t0:0,t1:5,spk:'S1',words}]};
 await writeFile(join(dir,'transcript.work.json'),JSON.stringify(work));
 await writeFile(join(dir,'meta.json'),JSON.stringify({slug:'t',title:'T',audio_alignment_hash:timingSignature(work.paragraphs),stages:{}}));
 // the correction merges two words: the word list (and so the timing signature) changes
 const correctParagraphs=async(ps)=>({paragraphs:ps.map((p)=>({...p,words:[{...p.words[0],w:'A garden',e:p.words[1].e},...p.words.slice(2)]})),diff:[],refused:[]});
 const deps={detachedWorker:true,tools:{},llm:{correctParagraphs},repo:{updateMediaItem:vi.fn(async()=>{})},loadVocab:async()=>[],now:()=>new Date().toISOString(),draining:async()=>false};
 await runItem({id:1,dir,state:'running'},{only:['correct'],redo:['correct']},deps);
 const meta=JSON.parse(await readFile(join(dir,'meta.json'))),after=JSON.parse(await readFile(join(dir,'transcript.work.json')));
 expect(timingSignature(after.paragraphs)).not.toBe(timingSignature(work.paragraphs));
 expect(meta.audio_alignment_hash).toBe(timingSignature(after.paragraphs));
});
// 11-01 (2680 failed for good; 2530/2692 every update; then 2680 sat 'scheduled' 1.5 h on a WORKER_WAIT loop that no worker ever answered): the transcript's
// timings drifted from the realign stamp after the text passes. The gate marks realign + its dependents stale and the SAME run re-does them —
// realign on a home host when tower's gate refuses it — then publishes. Never WORKER_WAIT, never a dead end, never a re-stamp of the drift.
const driftSetup=async(name,{withRealign=false}={})=>{
 const dir=await mkdtemp(join(tmpdir(),name));
 const words='A garden has many different flowers.'.split(' ').map((w,i)=>({w,s:i,e:i+1}));
 const stamped=timingSignature([{n:1,words:words.map((w)=>({...w,s:w.s+0.05}))}]);
 await writeFile(join(dir,'transcript.work.json'),JSON.stringify({paragraphs:[{n:1,t0:0,t1:6,spk:'S1',words,sentences:[[0,6]]}]}));
 const at={at:'old'};
 await writeFile(join(dir,'meta.json'),JSON.stringify({slug:'drift',title:'Drift',version:3,audio_version:2,aligned_to:'unipase',audio_alignment_hash:stamped,rights:{playback:'full'},
  ...(withRealign?{remaster:{status:'done'},enhancement:{listening:'unipase',variants:[{name:'unipase',file:'enhanced/unipase.flac',shifts_time:true}]}}:{}),
  stages:{remaster:at,realign:at,quiet:at,web:at,trim:at,correct:at,clean:at,render:at,ingest:at,catalog:at,update:at}}));
 return {dir,words,stamped};
};
const towerGate=()=>vi.fn(async(sub)=>{const e=new Error(`${sub}: waiting for a worker`);e.code='WORKER_WAIT';throw e;});   // tower's tools gate
// realign on the home host: writes realign.json (the remaster's times, 20 ms later) where runItem asked
const homeRealign=()=>vi.fn(async(it,{out})=>{const {mkdir}=await import('node:fs/promises');await mkdir(join(it.dir,'enhanced'),{recursive:true});
 await writeFile(out,JSON.stringify({times:{1:[0,1,2,3,4,5].map((i)=>[i+0.02,i+1.02])}}));return {placed:6,total:6,host:'aorus'};});
it('alignment drift at the publish gate marks realign + dependents stale and re-runs them in the same run, never a WORKER_WAIT',async()=>{
 const {dir,stamped}=await driftSetup('drift-');
 const {buildRegistry,STAGE_DEFS}=await import('../../api/lib/media/stages.js');
 // a two-stage registry (realign → update) keeps the test to the drift path; the real `after` edges are covered by markStale's own tests
 const reg=buildRegistry(STAGE_DEFS.filter((x)=>['remaster','realign','update'].includes(x.name)).map((x)=>x.name==='update'?{...x,after:['realign']}:x));
 const deps={detachedWorker:true,reg,tools:{},llm:{},repo:{updateMediaItem:vi.fn(async()=>{})},quotes:{breakoutsOf:()=>[]},ingest:async()=>({documentId:1}),loadVocab:async()=>[],now:()=>'2026-11-01T00:00:00Z',draining:async()=>false};
 // no remaster here (no enhancement): realign re-runs but cannot re-align → the second drift in the same run is a plain publish block, not a loop
 await expect(runItem({id:1,dir,state:'done',published_at:'old'},{only:['update'],redo:['update']},deps)).rejects.toThrow(/publish blocked: .*again after realign re-ran/);
 const meta=JSON.parse(await readFile(join(dir,'meta.json')));
 expect(meta.stages.realign.stale).toBeUndefined();   // realign DID re-run in this run (past only:['update'])
 expect(meta.stages.realign.at).toBe('2026-11-01T00:00:00Z');
 expect(meta.audio_alignment_hash).toBe(stamped);   // the gate never re-stamps a drifted transcript as aligned
});
it('a drifted published talk re-aligns on a home host when tower refuses realign, then publishes in the same run',async()=>{
 const {dir,stamped}=await driftSetup('drift-home-',{withRealign:true});
 const {buildRegistry,STAGE_DEFS}=await import('../../api/lib/media/stages.js');
 const reg=buildRegistry(STAGE_DEFS.filter((x)=>['remaster','realign','update'].includes(x.name)).map((x)=>x.name==='update'?{...x,after:['realign']}:x));
 const tool=towerGate(),realignStep=homeRealign();
 const deps={detachedWorker:true,reg,realignStep,tools:{tool},llm:{},repo:{updateMediaItem:vi.fn(async()=>{})},quotes:{breakoutsOf:()=>[]},ingest:async()=>({documentId:1}),loadVocab:async()=>[],now:()=>'2026-11-01T00:00:00Z',draining:async()=>false};
 const r=await runItem({id:1,dir,state:'done',published_at:'old'},{only:['update'],redo:['update']},deps);
 expect(r.done).toEqual(['realign','update']);
 expect(tool).toHaveBeenCalledWith('realign',expect.anything(),expect.anything(),expect.anything());
 expect(realignStep).toHaveBeenCalledWith(expect.objectContaining({dir}),expect.objectContaining({audio:join(dir,'enhanced/unipase.flac'),out:join(dir,'enhanced','realign.json')}));
 const meta=JSON.parse(await readFile(join(dir,'meta.json'))),work=JSON.parse(await readFile(join(dir,'transcript.work.json')));
 expect(meta.stages.realign).toMatchObject({host:'aorus'});expect(meta.stages.realign.stale).toBeUndefined();
 expect(work.paragraphs[0].words[0]).toMatchObject({s:0.02,s0:0});   // the remaster's times, the original kept
 expect(meta.audio_alignment_hash).toBe(timingSignature(work.paragraphs));expect(meta.audio_alignment_hash).not.toBe(stamped);
});
it('a stale realign over drifted timings: tower refuses the tool → the home host re-aligns, never a WORKER_WAIT, never a re-stamp of the drift',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drift-realign-'));
 const words=['A','garden','grows.'].map((w,i)=>({w,s:i,e:i+1}));
 const stamped=timingSignature([{n:1,words:words.map((w)=>({...w,e:w.e+0.2}))}]);
 await writeFile(join(dir,'transcript.work.json'),JSON.stringify({paragraphs:[{n:1,t0:0,t1:3,spk:'S1',words}]}));
 await writeFile(join(dir,'meta.json'),JSON.stringify({slug:'d',title:'D',aligned_to:'unipase',audio_alignment_hash:stamped,
  enhancement:{listening:'unipase',variants:[{name:'unipase',file:'enhanced/unipase.flac',shifts_time:true}]},stages:{realign:{at:'old',stale:{at:'x',campaign:'alignment-drift'}}}}));
 const tool=towerGate();
 const realignStep=vi.fn(async(it,{out})=>{const {mkdir}=await import('node:fs/promises');await mkdir(join(it.dir,'enhanced'),{recursive:true});await writeFile(out,JSON.stringify({times:{1:[[0.1,1],[1.1,2],[2.1,3]]}}));return {placed:3,total:3,host:'aorus'};});
 const deps={detachedWorker:true,realignStep,tools:{tool},llm:{},repo:{updateMediaItem:vi.fn(async()=>{})},loadVocab:async()=>[],now:()=>'2026-11-01T00:00:00Z',draining:async()=>false};
 await runItem({id:1,dir,state:'failed'},{only:['realign'],redo:['realign']},deps);
 expect(tool).toHaveBeenCalledWith('realign',expect.anything(),expect.anything(),expect.anything());
 expect(realignStep).toHaveBeenCalledTimes(1);
 const meta=JSON.parse(await readFile(join(dir,'meta.json'))),work=JSON.parse(await readFile(join(dir,'transcript.work.json')));
 expect(work.paragraphs[0].words.map((w)=>w.s)).toEqual([0.1,1.1,2.1]);
 expect(meta.audio_alignment_hash).toBe(timingSignature(work.paragraphs));
 expect(meta.stages.realign).toMatchObject({host:'aorus'});
});
it('a realign failure that is not the tower gate is not hidden behind the home host',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drift-fail-'));
 const words=['A','b.'].map((w,i)=>({w,s:i,e:i+1}));
 await writeFile(join(dir,'transcript.work.json'),JSON.stringify({paragraphs:[{n:1,t0:0,t1:2,spk:'S1',words}]}));
 await writeFile(join(dir,'meta.json'),JSON.stringify({slug:'f',title:'F',aligned_to:'safe',enhancement:{listening:'unipase',variants:[{name:'unipase',file:'enhanced/unipase.flac',shifts_time:true}]},stages:{}}));
 const tool=vi.fn(async()=>{throw new Error('aligner crashed');}),realignStep=vi.fn();
 const deps={detachedWorker:true,realignStep,tools:{tool},llm:{},repo:{updateMediaItem:vi.fn(async()=>{})},loadVocab:async()=>[],now:()=>'x',draining:async()=>false};
 await expect(runItem({id:1,dir,state:'running'},{only:['realign']},deps)).rejects.toThrow(/aligner crashed/);
 expect(realignStep).not.toHaveBeenCalled();
});
