// Explicit, user-approved identity decisions. Read-only configuration; no DB.
import {readFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const FILE=join(dirname(fileURLToPath(import.meta.url)),'../../../data/media-speaker-decisions.json');
let cached={},stamp=-1;
export function speakerDecisions(file=FILE){
 try{const at=statSync(file).mtimeMs;if(file===FILE&&stamp===at)return cached;const d=JSON.parse(readFileSync(file,'utf8'));if(file===FILE){cached=d;stamp=at;}return d;}
 catch(e){if(e.code==='ENOENT')return {};throw e;}
}
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function approvedSpeakerLabel(label,decisions=speakerDecisions()){
 if((decisions.non_person_labels||[]).some(x=>fold(x)===fold(label)))return {name:null,key:null,notPerson:true};
 return (decisions.aliases||[]).find(x=>fold(x.label)===fold(label))||null;
}
export function canonicalSpeakerKey(key,decisions=speakerDecisions()){
 const seen=new Set();let cur=key;
 while(cur&&!seen.has(cur)){seen.add(cur);const r=(decisions.profile_merges||[]).find(x=>x.from===cur);if(!r)return cur;cur=r.to;}
 if(cur&&seen.has(cur))throw Error('Cyclic speaker profile decision');return cur;
}
export function peopleWithDecisions(people,decisions=speakerDecisions()){
 const out=people.map(p=>({...p,confirmed:[...(p.confirmed||[])]}));
 for(const a of decisions.aliases||[]){if(a.kind==='joint')continue;let p=out.find(p=>p.key===a.key);if(!p){p={key:a.key,name:a.name,aliases:[],confirmed:[]};out.push(p);}if(!p.confirmed.includes(a.label))p.confirmed.push(a.label);}
 out.reviewedHolds=decisions.hold_labels||[];
 out.notSpeakers=[...(people.notSpeakers||[]),...(decisions.non_person_labels||[])];
 return out;
}
