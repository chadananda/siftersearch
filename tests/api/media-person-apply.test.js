import {it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {mediaPersonApplyJob} from '../../api/lib/ops/media-person-apply.js';
import {peopleWithDecisions,canonicalSpeakerKey,approvedSpeakerLabel} from '../../api/lib/media/speaker-decisions.js';
import {resolveSpeaker} from '../../api/lib/media/identity.js';
const d={source_page:'approved-page',approved_at:'2026-10-26',profile_merges:[{from:'short',to:'full',name:'Full Name'}],aliases:[{label:'Short',key:'full',name:'Full Name'}],hold_labels:['Joint Name'],non_person_labels:['Event']};
it('approved aliases resolve while joint-credit holds remain distinct',()=>{
 const ps=peopleWithDecisions([{key:'full',name:'Full Name'}],d);
 expect(resolveSpeaker('Short',ps)).toMatchObject({key:'full'});expect(resolveSpeaker('Joint Name',ps).review).toMatch(/Chad/);
 expect(approvedSpeakerLabel('Event',d)).toMatchObject({notPerson:true,key:null});expect(canonicalSpeakerKey('short',d)).toBe('full');
});
it('updates metadata and catalogue through repos, queues text-only rendering, and skips busy metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'person-apply-'));writeFileSync(join(dir,'meta.json'),JSON.stringify({speaker:'Short',speaker_key:'short',stages:{catalog:{at:'x'}}}));
 const repo={listSpeakers:async()=>[{key:'short',name:'Short'}],rankRows:async()=>[{id:1,speaker:'Short'}],itemsBySpeakerKeys:async()=>[{id:1,speaker_key:'short'}],getMediaItem:async()=>({id:1,dir,state:'done'}),mergeSpeakerProfiles:vi.fn(async()=>({merged:true})),updateMediaItem:vi.fn(async()=>{})};
 const ops={pendingRuns:async()=>[],enqueue:vi.fn(async()=>{})};
 try{const r=await mediaPersonApplyJob({write:true},{repo,ops,decisions:d,auditDir:join(dir,'audit')});expect(r.items).toHaveLength(1);expect(JSON.parse(readFileSync(join(dir,'meta.json'))).speaker).toBe('Full Name');expect(ops.enqueue).toHaveBeenCalledWith('media-item',{id:1,only:['render','ingest'],redo:['render','ingest']},'speaker-decisions');
  writeFileSync(join(dir,'meta.json'),JSON.stringify({speaker:'Short'}));ops.pendingRuns=async()=>[{status:'running',params:{id:1}}];
  const busy=await mediaPersonApplyJob({write:true},{repo,ops,decisions:d,auditDir:join(dir,'audit')});expect(busy.pending_metadata).toEqual([1]);expect(JSON.parse(readFileSync(join(dir,'meta.json'))).speaker).toBe('Short');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('the reviewed data preserves Khamsi-Dunbar as two people and treats Iqan as a subject',async()=>{
 const {speakerDecisions}=await import('../../api/lib/media/speaker-decisions.js');const actual=speakerDecisions();
 expect(actual.profile_merges.some(x=>x.from==='khamsi-dunbar-m')).toBe(false);
 expect(actual.hold_labels).toContain('Khamsi-Dunbar, M.');expect(approvedSpeakerLabel('Sabri Iqan',actual)).toMatchObject({key:'hasan-sabri',subject:'Kitáb-i-Íqán'});
});
