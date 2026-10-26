import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileSha,validateWholeResult,adoptWholeResult} from '../../api/lib/media/whole-result.js';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'whole-result-')),dir=join(root,'destination');
 await mkdir(join(root,'item/web'),{recursive:true});await mkdir(join(dir,'original'),{recursive:true});
 await writeFile(join(dir,'original/archive.mp3'),'untouched original');const sha=await fileSha(join(dir,'original/archive.mp3'));
 const meta={slug:'test',original:'original/in.mp3',stages:Object.fromEntries(['archive','grade','enhance','transcribe','diarize','remaster','web','trim'].map(s=>[s,{at:'2026-10-26'}])),remaster:{status:'review'},enhancement:{variants:[{file:'original/in.mp3'},{file:'/job/item/enhanced/light.flac'}]}};
 const paths=['meta.json','transcript.raw.json','transcript.work.json','diarization.json','waveform.json','web/test.ogg','web/test.m4a'];
 const files=[];for(const path of paths){await writeFile(join(root,'item',path),path==='meta.json'?JSON.stringify(meta):'fixture');files.push({path,sha256:await fileSha(join(root,'item',path))});}
 const r={v:1,ok:true,input_sha:sha,slug:'test',meta,files};await writeFile(join(root,'result.json'),JSON.stringify(r));return {root,dir,sha,r};
}
it('adopts a verified whole result while retaining the archived original and rewriting worker paths',async()=>{
 const {root,dir,sha}=await fixture();const m=await adoptWholeResult(root,dir,{slug:'test',original:'original/archive.mp3',source:{kind:'file'}},sha);
 expect(m.original).toBe('original/archive.mp3');expect(m.enhancement.variants.map(v=>v.file)).toEqual(['original/archive.mp3',dir+'/enhanced/light.flac']);
 expect(await readFile(join(dir,'original/archive.mp3'),'utf8')).toBe('untouched original');
});
it('rejects damaged, stale, unsafe and unassessed results before adoption',async()=>{
 for(const mutate of [r=>r.input_sha='stale',r=>r.files[0].sha256='bad',r=>r.files[0].path='../escape',r=>r.meta.remaster.status='done']){
  const {root,sha,r}=await fixture();mutate(r);await writeFile(join(root,'result.json'),JSON.stringify(r));await expect(validateWholeResult(root,sha,'test')).rejects.toThrow();
 }
});
