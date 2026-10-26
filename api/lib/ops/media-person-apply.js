// Apply exactly the reviewed, versioned speaker decisions. Metadata only:
// no audio processing, no graph-entity deletion, no recording deletion.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {speakerDecisions,approvedSpeakerLabel,canonicalSpeakerKey} from '../media/speaker-decisions.js';

export async function mediaPersonApplyJob({write=false}={},deps={}){
 const repo=deps.repo||await import('../repos/media-repo.js');
 const ops=deps.ops||await import('../repos/ops-report-repo.js');
 const decisions=deps.decisions||speakerDecisions();
 if(!decisions.source_page||!decisions.approved_at)throw Error('No reviewed speaker decisions');
 const profiles=await repo.listSpeakers(),rows=await repo.rankRows();
 const originals=new Map(profiles.map(p=>[p.key,p]));
 const sourceKeys=decisions.profile_merges.map(x=>x.from);
 const keyed=await repo.itemsBySpeakerKeys(sourceKeys),affected=new Map(keyed.map(x=>[x.id,x]));
 for(const row of rows){if(approvedSpeakerLabel(row.speaker,decisions)||/khamsi[- ]dunbar/i.test(row.source_ref||''))affected.set(row.id,{...affected.get(row.id),...row});}
 const pending=(await Promise.all(['media-item','media-llm','media-compute','media-asr','media-diar'].map(n=>ops.pendingRuns(n)))).flat();
 const busy=new Set(pending.filter(r=>r.status==='running').map(r=>Number(r.params?.id)));
 const out={source_page:decisions.source_page,write,profile_merges:[],items:[],pending_metadata:[],missing:[],audit_file:null,rerenders_queued:0};
 if(write){const dir=deps.auditDir||join(process.cwd(),'data/run/person-decisions');await mkdir(dir,{recursive:true});out.audit_file=join(dir,`speaker-merge-${Date.now()}.json`);await writeFile(out.audit_file,JSON.stringify({decisions,profiles,created_at:new Date().toISOString()},null,2));}
 for(const m of decisions.profile_merges){
  if(!originals.has(m.from)){out.profile_merges.push({...m,already_merged:true});continue;}
  out.profile_merges.push(write?await repo.mergeSpeakerProfiles(m,decisions):{...m,planned:true});
 }
 for(const row of affected.values()){
  const it=await repo.getMediaItem(row.id);if(!it)continue;
  const meta=it.dir?await readFile(join(it.dir,'meta.json'),'utf8').then(JSON.parse).catch(()=>null):null;
  const said=meta?.speaker||row.speaker||it.speaker;
  let decision=approvedSpeakerLabel(said,decisions)||approvedSpeakerLabel(row.speaker,decisions);
  const fromKey=meta?.speaker_key||keyed.find(x=>x.id===it.id)?.speaker_key||it.speaker_key;
  const target=canonicalSpeakerKey(fromKey,decisions);
  if(!decision&&target&&target!==fromKey){const m=decisions.profile_merges.find(x=>x.from===fromKey);decision={key:target,name:m?.name||said};}
  if(/khamsi[- ]dunbar/i.test(row.source_ref||''))decision={name:'Mas‘úd Khamsí and Hooper Dunbar',key:'khamsi-dunbar-m',joint:true};
  if(!decision)continue;
  const fix={speaker:decision.name,speaker_key:decision.key};
  if(write)await repo.updateMediaItem(it.id,fix);
  out.items.push({id:it.id,slug:it.slug,from:said,...fix,joint:!!decision.joint,subject:decision.subject||null});
  if(!meta)continue;
  if(busy.has(it.id)){out.pending_metadata.push(it.id);continue;}
  if(write){
   if(decision.notPerson){meta.source_speaker_label=meta.source_speaker_label||said;meta.speaker_review='Event or collection label; speaker attribution pending';}
   Object.assign(meta,fix);
   meta.identity_decision={source_page:decisions.source_page,at:new Date().toISOString(),basis:decision.joint?'Chad: Khamsi-Dunbar is two people':'Chad approved identity checklist'};
   if(decision.subject)meta.subject=decision.subject;
   if(decision.joint){meta.joint_speakers=[{key:'masud-khamsi',name:'Mas‘úd Khamsí'},{key:'hooper-dunbar',name:'Hooper Dunbar'}];meta.speaker_credit_kind='joint';}
   const file=join(it.dir,'meta.json'),temp=file+'.identity.tmp';await writeFile(temp,JSON.stringify(meta,null,2));await rename(temp,file);
   if(it.state==='done'||meta.stages?.catalog?.at){await ops.enqueue('media-item',{id:it.id,only:['render','ingest'],redo:['render','ingest']},'speaker-decisions');out.rerenders_queued++;}
  }
 }
 return out;
}
