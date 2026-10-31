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
