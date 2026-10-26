import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {audioVersion,talkAudio} from '../../api/lib/media/talk-audio.js';
import {runItem} from '../../api/lib/media/item.js';
it('uses the audio revision for both listening copies while page metadata changes',()=>{
 const meta={version:40,audio_version:12,aligned_to:'unipase',web_original:{ogg:'web/test.original.ogg',m4a:'web/test.original.m4a'}};
 const a=talkAudio({slug:'test',level:'full',meta});
 expect(a.ogg).toContain('?v=12');expect(a.m4a).toContain('?v=12');expect(a.original_ogg).toContain('?v=12');expect(a.original_url).toContain('?v=12');
 expect(audioVersion({version:9})).toBe(9);
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
 expect(await readFile(join(dir,'page.html'),'utf8')).toContain('web/test.ogg?v=12');
});
