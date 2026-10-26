import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
export async function mediaWorkerAudit({ids=null,language=null,after=0,limit=20}={},deps={}){
 const repo=deps.repo||await import('../repos/media-repo.js');
 const rows=(await repo.mediaIndexRows()).filter(r=>r.id>after&&(!ids||ids.includes(r.id))&&(!language||String(r.language||'').toLowerCase().startsWith(language))).sort((a,b)=>a.id-b.id).slice(0,Math.max(1,Math.min(100,limit)));
 const recordings=[];
 for(const r of rows){if(!r.dir)continue;const m=JSON.parse(await readFile(join(r.dir,'meta.json'),'utf8').catch(()=>'null'));if(!m)continue;
 recordings.push({id:r.id,slug:r.slug,language:r.language,dir:r.dir,original:m.original,duration_s:m.duration_s,grade:m.quality?.overall,remaster:m.remaster,raw_ai_bytes:await stat(join(r.dir,'enhanced/unipase.cloud.flac')).then(s=>s.size).catch(()=>0),assessment:m.qa?.remaster?.output_assessment?.passed??null});}
 return {recordings,next_after:rows.at(-1)?.id??after};
}
