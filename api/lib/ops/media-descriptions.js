// Text-only, resumable editorial backfill. No audio stages, title changes or DB access outside named repos.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
const read=path=>readFile(path,'utf8').then(JSON.parse).catch(()=>null);
export async function mediaDescriptionsJob({write=false,ids=null,speaker=null,limit=12,maxUsd=1}={},deps={}) {
 const repo=deps.repo||await import('../repos/media-repo.js'),ops=deps.ops||await import('../repos/ops-report-repo.js');
 const llm=deps.llm||await import('../media/llm.js');
 const rows=(await repo.mediaIndexRows()).filter(r=>(!ids||ids.includes(r.id))&&(!speaker||r.speaker_key===speaker));
 const out={write,eligible:0,changed:[],skipped:[],failed:[],spend:{usd:0,calls:0},stopped:null};
 const pending=(await Promise.all(['media-item','media-llm','media-compute','media-asr','media-diar'].map(n=>ops.pendingRuns(n)))).flat();
 const busy=new Set(pending.filter(r=>r.status==='running').map(r=>Number(r.params?.id)));
 const auditDir=deps.auditDir||join(process.cwd(),'data/run/media-descriptions');
 if(write)await mkdir(auditDir,{recursive:true});
 for(const row of rows){
  if(out.changed.length+out.failed.length>=Math.max(1,Math.min(200,Number(limit)||12)))break;
  if(out.spend.usd>=Math.max(0.01,Number(maxUsd)||1)){out.stopped='spend cap';break;}
  if(busy.has(row.id)){out.skipped.push({id:row.id,why:'busy'});continue;}
  const meta=row.dir?await read(join(row.dir,'meta.json')):null;
  if(!meta||meta.description_version>=2)continue;
  out.eligible++;
  if(!write){out.changed.push({id:row.id,slug:row.slug,title:meta.title,summary:meta.summary});continue;}
  try{
   const work=await read(join(row.dir,'transcript.work.json'))||await read(join(row.dir,'transcript.json'));
   if(!work?.paragraphs?.length){out.skipped.push({id:row.id,why:'no transcript'});continue;}
   const result=await llm.rewriteDescription(work.paragraphs,{title:meta.title,speaker:meta.speaker,previous_summary:meta.summary,topics:meta.topics,headings:(meta.headings||[]).map(h=>h.text)},{spend:out.spend});
   // A pipeline stage may have started while the model was writing. Never replace its metadata.
   const fresh=await repo.getMediaItem(row.id),current=await read(join(row.dir,'meta.json'));
   if(fresh?.state!=='done'||!current||current.summary!==meta.summary){out.skipped.push({id:row.id,why:'changed while describing'});continue;}
   const audit=join(auditDir,`${row.id}-${Date.now()}.json`);
   await writeFile(audit,JSON.stringify({id:row.id,slug:row.slug,before:current.summary,after:result.summary,evidence:result.evidence,at:new Date().toISOString()},null,2));
   current.summary=result.summary;current.description_version=2;current.description_evidence=result.evidence;
   const file=join(row.dir,'meta.json'),temp=file+'.description.tmp';await writeFile(temp,JSON.stringify(current,null,2));await rename(temp,file);
   await repo.updateMediaItem(row.id,{}); // invalidates listing cache without changing its title or attribution
   await ops.enqueue('media-item',{id:row.id,only:['render','ingest'],redo:['render','ingest']},'media-descriptions');
   out.changed.push({id:row.id,slug:row.slug,title:current.title,before:meta.summary,summary:result.summary,evidence:result.evidence,audit});
  }catch(error){out.failed.push({id:row.id,why:String(error.message).slice(0,300)});}
 }
 return out;
}
