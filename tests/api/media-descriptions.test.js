import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {descriptionEvidence,validDescription} from '../../api/lib/media/descriptions.js';
import {mediaDescriptionsJob} from '../../api/lib/ops/media-descriptions.js';
import {shapeRow} from '../../api/lib/media/listing-index.js';

describe('concept-first talk descriptions',()=>{
 it('rejects boilerplate leads and preserves a substantive description',()=>{
  const text='The speaker discusses the World Order and introduces its historical comparisons with the Roman Empire.';
  expect(validDescription('Part seven moves from institutional history to individual duty. The account examines several conditions that shaped the succession.')).toBe(false);
  expect(validDescription('Religious truth is relative, and this session examines that doctrine. A schooling analogy illustrates the relationship.')).toBe(false);
  expect(validDescription(text)).toBe(false);expect(validDescription(text.replace('The speaker','Hooper Dunbar'),'Hooper Dunbar')).toBe(false);
  expect(validDescription('Political unity can outlast the institutions that first establish it. The comparison with the Roman Empire distinguishes administrative continuity from religious authority.')).toBe(true);
 });
 it('samples the entire transcript and supports public word tuples',()=>{
  const ps=Array.from({length:100},(_,n)=>({n,words:[{w:`Paragraph ${n} ${'word '.repeat(100)}`}]}));
  const evidence=descriptionEvidence(ps,500);expect(evidence[0].n).toBe(0);expect(evidence.at(-1).n).toBe(99);expect(evidence.reduce((n,p)=>n+p.text.length,0)).toBeLessThanOrEqual(500);
  expect(descriptionEvidence([{n:3,words:[['The',0,1],['idea',1,2]]}])[0].text).toBe('The idea');
 });
 it('keeps the key concept beyond 150 characters in the listing',()=>{
  const summary='A study of institutional continuity asks what survives when an established political order breaks down, and why its legal traditions persist after its governing structures change. The Roman Empire provides the central comparison.';
  expect(shapeRow({slug:'world-order',title:'World Order Part 2'},{meta:{summary}}).sum).toBe(summary);
 });
 it('backfills only the description, keeps titles and recordings, and queues text-only publishing',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'descriptions-'));try{
   const meta={title:'World Order Part 2',speaker:'Hooper Dunbar',summary:'The speaker discusses the World Order.',stages:{catalog:{at:'yesterday'}}};
   await writeFile(join(dir,'meta.json'),JSON.stringify(meta));await writeFile(join(dir,'transcript.work.json'),JSON.stringify({paragraphs:[{n:0,words:[{w:'Rome'}]}]}));
   const repo={mediaIndexRows:vi.fn(async()=>[{id:1,slug:'world-order',dir}]),getMediaItem:vi.fn(async()=>({state:'done'})),updateMediaItem:vi.fn()},ops={pendingRuns:vi.fn(async()=>[]),enqueue:vi.fn()},llm={rewriteDescription:vi.fn(async()=>({summary:'Institutions can preserve forms of unity after their political foundation changes. Rome supplies a historical example of this distinction.',evidence:[0]}))};
   const result=await mediaDescriptionsJob({write:true},{repo,ops,llm,auditDir:join(dir,'audit')});const after=JSON.parse(await readFile(join(dir,'meta.json')));
   expect(result.changed).toHaveLength(1);expect(after).toMatchObject({title:meta.title,speaker:meta.speaker,description_version:2,stages:meta.stages});expect(repo.updateMediaItem).toHaveBeenCalledWith(1,{});expect(ops.enqueue).toHaveBeenCalledWith('media-item',{id:1,only:['render','ingest'],redo:['render','ingest']},'media-descriptions');expect(JSON.parse(await readFile(result.changed[0].audit)).before).toBe(meta.summary);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
