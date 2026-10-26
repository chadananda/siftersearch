// Read-only decision evidence for Chad. Existing named repositories only;
// includes unpublished items so an unresolved intake name is not hidden.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {resolveSpeaker} from '../media/identity.js';

export async function mediaPersonReviewJob(params={},deps={}) {
 const repo=deps.repo||await import('../repos/media-repo.js');
 const data=deps.data||JSON.parse(await readFile(join(process.cwd(),'data/media-speaker-people.json'),'utf8'));
 const [rows,profiles,published]=await Promise.all([repo.rankRows(),repo.listSpeakers(),repo.mediaIndexRows()]);
 const links=new Map(published.map(x=>[x.id,x.slug]));
 const forms=new Map();
 for(const row of rows){
  const label=String(row.speaker||'').trim();if(!label)continue;
  const r=resolveSpeaker(label,data.people,{title:row.title||'',collection:row.collection||'',source_kind:row.source_kind,recorded_year:row.source_kind==='youtube'?null:row.year},{notSpeakers:data.not_speakers||[]});
  if(!forms.has(label))forms.set(label,{label,count:0,states:{},resolutions:{},unresolved:[],examples:[]});
  const f=forms.get(label);f.count++;f.states[row.state]=(f.states[row.state]||0)+1;
  const evidence={id:row.id,slug:links.get(row.id)||null,title:row.title||null,year:row.year||null,collection:row.collection||null,state:row.state,
   source:row.youtube_id?`https://www.youtube.com/watch?v=${row.youtube_id}`:String(row.source_ref||'').replace(/^\/tank\/media\//,''),
   ...(r.key?{resolved_key:r.key,basis:r.basis}:{reason:r.review||(r.not_speaker?'Not a speaker label':'No known person matched'),candidates:r.candidates||[]})};
  if(r.key){const v=f.resolutions[r.key]||={key:r.key,name:r.display,count:0,bases:[]};v.count++;if(!v.bases.includes(r.basis))v.bases.push(r.basis);}
  else f.unresolved.push(evidence);
  if(f.examples.length<12)f.examples.push(evidence);
 }
 return {at:new Date().toISOString(),scope:'All non-duplicate audio items with speaker labels, plus existing speaker profiles',items_scanned:rows.length,
  items_with_speaker:[...forms.values()].reduce((a,f)=>a+f.count,0),forms:[...forms.values()].sort((a,b)=>b.count-a.count),
  profiles:profiles.map(p=>({key:p.key,name:p.name,entity_id:p.entity_id||null})),
  people:data.people.map(p=>({key:p.key,name:p.name,aliases:p.aliases||[],confirmed:p.confirmed||[],confirmed_basis:p.confirmed_basis||null,role:p.role||null,born:p.born||null,died:p.died||null,works:p.works||[]}))};
}
