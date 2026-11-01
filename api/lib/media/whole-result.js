// Validate a complete recording before adopting any derived files.
import {join,resolve,sep} from 'node:path';
import {readFile,writeFile,rename,mkdir,copyFile,link,rm,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
export async function fileSha(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export function wholeJob(item,meta,sha){
 const fresh={...meta,stages:{archive:meta.stages.archive}};
 for(const k of ['enhancement','quality','qa','remaster','aligned_to','trim','enh_ck','asr_job','diar_job','dfn_job','enc_jobs'])delete fresh[k];
 return {v:1,id:item.id,input:'in'+meta.original.slice(meta.original.lastIndexOf('.')).toLowerCase(),input_sha:sha,threads:2,meta:fresh};
}
export async function validateWholeResult(root,inputSha,slug){
 const r=JSON.parse(await readFile(join(root,'result.json'),'utf8'));
 if(r.v!==1||!r.ok||r.input_sha!==inputSha||r.slug!==slug||r.meta?.slug!==slug)throw Error('Worker recording identity mismatch');
 if((await lstat(join(root,'item'))).isSymbolicLink())throw Error('Symlink in worker output');
 for(const s of ['archive','grade','enhance','transcribe','diarize','remaster','web','trim'])if(!r.meta.stages?.[s]?.at)throw Error('Missing worker stage '+s);
 const files=new Set();
 for(const f of r.files||[]){
  if(!f.path||f.path.includes('\\')||f.path.split('/').some(x=>!x||x==='.'||x==='..')||f.path.startsWith('original/'))throw Error('Unsafe worker output path');
  const p=resolve(root,'item',f.path);if(!p.startsWith(resolve(root,'item')+sep)||files.has(f.path))throw Error('Invalid worker output path');
  for(let part=p;part!==resolve(root,'item');part=resolve(part,'..'))if((await lstat(part)).isSymbolicLink())throw Error('Symlink in worker output');
  if(!(await lstat(p)).isFile()||await fileSha(p)!==f.sha256)throw Error('Worker output checksum mismatch: '+f.path);
  files.add(f.path);
 }
 for(const f of ['meta.json','transcript.raw.json','transcript.work.json','diarization.json','waveform.json',`web/${slug}.ogg`,`web/${slug}.m4a`])if(!files.has(f))throw Error('Missing worker output '+f);
 if(JSON.stringify(JSON.parse(await readFile(join(root,'item/meta.json'),'utf8')))!==JSON.stringify(r.meta))throw Error('Worker metadata manifest mismatch');
 if(r.meta.remaster?.status==='done'&&r.meta.qa?.remaster?.output_assessment?.passed!==true)throw Error('Remaster has no passing paired assessment');
 return r;
}
// a hardlink when both paths share a filesystem (no bytes move: the 400 MB unipase.flac), a copy across filesystems
// The row write after a worker result is adopted. The adoption replaced meta.json with the worker's stages, so a row that was
// already 'done' (a redo, or a re-delivered step) must go back to 'transcribed' too, or it stays done with its later stages gone
// and nothing ever runs them (2664/2665/2702, 11-01). A held verdict stays where it is: Chad decides those. alreadyAdopted = the
// same step was adopted before; then only a row still waiting on it moves.
export const ADOPT_FROM=['whole_queued','scheduled','queued','running'];
export const HELD_VERDICTS=['review','unrepairable','archived'];
export function adoptedState(row,stages,{alreadyAdopted=false}={}){
 const s=row?.state;
 const ok=ADOPT_FROM.includes(s)||(!alreadyAdopted&&s==='done'&&!HELD_VERDICTS.includes(row?.verdict));
 return ok?{state:'transcribed',stage:null,stages_done:','+Object.keys(stages||{}).join(',')+','}:null;
}
export async function linkOrCopy(from,to){await rm(to,{force:true});try{await link(from,to);}catch(e){if(!['EXDEV','EPERM','ENOTSUP'].includes(e.code))throw e;await copyFile(from,to);}}
export async function adoptWholeResult(root,dir,oldMeta,inputSha,itemId=null,T=(k,f)=>f(),shaOf=fileSha){
 const r=await T('validate',()=>validateWholeResult(root,inputSha,oldMeta.slug));
 if(await T('hash_original',()=>shaOf(join(dir,oldMeta.original)))!==inputSha)throw Error('Original changed while processing');
 const workerOriginal='original/in'+oldMeta.original.slice(oldMeta.original.lastIndexOf('.')).toLowerCase();
 const rewrite=v=>typeof v==='string'?(v===workerOriginal?oldMeta.original:v.replaceAll('/job/item/'+workerOriginal,join(dir,oldMeta.original)).replaceAll('/job/item/',dir+'/')):Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v;
 const meta=rewrite(r.meta);meta.original=oldMeta.original;meta.source=oldMeta.source;meta.worker_result={input_sha:inputSha,adopted_at:new Date().toISOString()};
 await T('place',async()=>{for(const f of r.files){if(f.path==='meta.json')continue;const to=join(dir,f.path);await mkdir(resolve(to,'..'),{recursive:true});await linkOrCopy(join(root,'item',f.path),to+'.worker-part');await rename(to+'.worker-part',to);}});
 await writeFile(join(dir,'meta.json.worker-part'),JSON.stringify(meta,null,2));await rename(join(dir,'meta.json.worker-part'),join(dir,'meta.json'));
 if(itemId!=null)await (await import('../repos/media-ledger-repo.js')).syncItemStages(itemId,meta.stages).catch(()=>{});   // the stage ledger
 return meta;
}
