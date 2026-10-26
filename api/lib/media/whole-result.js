// Validate a complete recording before adopting any derived files.
import {join,resolve,sep} from 'node:path';
import {readFile,writeFile,rename,mkdir,copyFile,lstat} from 'node:fs/promises';
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
export async function adoptWholeResult(root,dir,oldMeta,inputSha){
 const r=await validateWholeResult(root,inputSha,oldMeta.slug);
 if(await fileSha(join(dir,oldMeta.original))!==inputSha)throw Error('Original changed while processing');
 const workerOriginal='original/in'+oldMeta.original.slice(oldMeta.original.lastIndexOf('.')).toLowerCase();
 const rewrite=v=>typeof v==='string'?(v===workerOriginal?oldMeta.original:v.replaceAll('/job/item/'+workerOriginal,join(dir,oldMeta.original)).replaceAll('/job/item/',dir+'/')):Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v;
 const meta=rewrite(r.meta);meta.original=oldMeta.original;meta.source=oldMeta.source;meta.worker_result={input_sha:inputSha,adopted_at:new Date().toISOString()};
 for(const f of r.files){if(f.path==='meta.json')continue;const to=join(dir,f.path);await mkdir(resolve(to,'..'),{recursive:true});await copyFile(join(root,'item',f.path),to+'.worker-part');await rename(to+'.worker-part',to);}
 await writeFile(join(dir,'meta.json.worker-part'),JSON.stringify(meta,null,2));await rename(join(dir,'meta.json.worker-part'),join(dir,'meta.json'));
 return meta;
}
