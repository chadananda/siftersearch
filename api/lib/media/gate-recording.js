// Restricted gate transport (forced-command ssh) for any host registered with transport 'gate'.
import {join,extname} from 'node:path';
import {mkdir,readFile,rename,rm,writeFile,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {sha256File,podComplete} from './pod-post.js';
import {hostVendor,hostCores} from './tools.js';
export async function gatePostRecording(it,m,{T,host,job,cfg,stop,nap}){
 const call=(verb,opts={})=>T.run('ssh',['-o','BatchMode=yes',host,verb],{timeoutMs:600000,stop,...opts});
 const poll=async()=>JSON.parse((await call(`whole-poll ${job}`)).stdout);
 let s=await poll();
 if(!s){
  for(const [file,name] of [[join(it.dir,m.original),'in'+extname(m.original).toLowerCase()],[join(it.dir,'transcript.work.json'),'work.json'],...['unipase.cloud.flac','unipase.asr.json','unipase.asr_orig.json'].map((f,i)=>[join(it.dir,'enhanced',f),['out.flac','asr.json','asr_orig.json'][i]])]){
    if(name==='asr_orig.json'&&!await stat(file).catch(()=>null))continue;
    await call(`whole-put ${job} ${name}`,{inputFile:file});
  }
  await call(`whole-put ${job} job.json`,{input:JSON.stringify({post:cfg})});
  while(!s){if(stop()){const e=Error('Host job staged for reattachment');e.code='DRAIN';throw e;}await call(`whole-start ${job}`);s=await poll();if(!s)await nap(10000);}
 }
 while(s.Running){if(stop()){const e=Error('Host recording continues');e.code='DRAIN';throw e;}await nap(10000);s=await poll();}
 if(s.ExitCode)throw Error('Host CPU recording failed with exit '+s.ExitCode);
 const stage=join(it.dir,'enhanced/pod-stage');await mkdir(join(stage,'web'),{recursive:true});
 const get=async(name,to)=>{const output=createWriteStream(to);try{await call(`whole-fetch ${job} ${name}`,{onStdout:b=>output.write(b)});output.end();await finished(output);}catch(e){output.destroy();throw e;}};
 await get('post.json',join(stage,'post.json'));const post=JSON.parse(await readFile(join(stage,'post.json'),'utf8'));
 if(!post.ok||post.work_sha!==await sha256File(join(it.dir,'transcript.work.json')))throw Error('Stale Host transcript result');
 for(const f of ['unipase.flac','unipase.guard.json',...(post.realign?['realign.json']:[]),...(post.waveform_file?[post.waveform_file]:[])]){if(!/^[a-z0-9_.-]+$/i.test(f))throw Error('Unsafe output path');await get('post/'+f,join(stage,f));}
 for(const f of Object.values(post.web||{})){if(!/^[a-z0-9_.-]+$/i.test(f))throw Error('Unsafe output path');await get('post/'+f,join(stage,'web',f));}
 const pd=join(it.dir,'enhanced/pod');await rm(pd,{recursive:true,force:true});await rename(stage,pd);
 if(!await podComplete(it.dir))throw Error('Incomplete Host result');
 await get('done.json',join(it.dir,'enhanced/unipase.done.json'));
 await writeFile(join(it.dir,'enhanced/unipase.cloud.flac'),'');await writeFile(join(it.dir,'enhanced/unipase.asr.json'),'{}');
 return JSON.parse(await readFile(join(it.dir,'enhanced/unipase.done.json'),'utf8'));
}

/** A WHOLE order on a gate host (e.g. AMD ROCm): every stage of one recording on this one host (grade, enhance, ASR on whisper.cpp HIP, diarize, UniPASE,
 *  guard, encodes), through the restricted gate. The original is uploaded once; results are fetched file by file and verified by sha256 on tower. */
export async function gateWholeRecording(it,m,{T,host,stop,nap,sha}) {
 const {wholeJob,adoptWholeResult}=await import('./whole-result.js');
 const {createHash}=await import('node:crypto');
 const job=`recording-w${it.id}-${sha.slice(0,8)}`;
 const call=(verb,opts={})=>T.run('ssh',['-o','BatchMode=yes',host,verb],{timeoutMs:600000,stop,...opts});
 const poll=async()=>JSON.parse((await call(`whole-poll ${job}`)).stdout);
 let s=await poll();
 if(!s){
  await call(`whole-put ${job} in${extname(m.original).toLowerCase()}`,{inputFile:join(it.dir,m.original)});
  await call(`whole-put ${job} job.json`,{input:JSON.stringify({...wholeJob(it,m,sha),device:hostVendor(host)==='amd'?'rocm':hostVendor(host)==='nvidia'?'cuda':'cpu',threads:Math.max(2,Math.min(8,Math.floor((hostCores(host)||8)*0.75)))})});
  while(!s){if(stop()){const e=Error('Host whole job staged for reattachment');e.code='DRAIN';throw e;}await call(`whole-start ${job}`);s=await poll();if(!s)await nap(15000);}
 }
 while(s.Running){if(stop()){const e=Error('Host whole recording continues');e.code='DRAIN';throw e;}await nap(15000);s=await poll();}
 if(s.ExitCode)throw Error('Host whole recording failed with exit '+s.ExitCode);
 const staging=join(it.dir,'.whole-worker');await rm(staging,{recursive:true,force:true});await mkdir(join(staging,'item'),{recursive:true});
 const get=async(name,to)=>{await mkdir(join(to,'..'),{recursive:true});const output=createWriteStream(to);const h=createHash('sha256');try{await call(`whole-fetch ${job} ${name}`,{onStdout:b=>{h.update(b);output.write(b);}});output.end();await finished(output);return h.digest('hex');}catch(e){output.destroy();throw e;}};
 await get('result.json',join(staging,'result.json'));
 const r=JSON.parse(await readFile(join(staging,'result.json'),'utf8'));
 for(const f of r.files||[]){
  if(!f.path||f.path.split('/').some(x=>!x||x==='.'||x==='..')||!/^[A-Za-z0-9_.\-\/]+$/.test(f.path))throw Error('Unsafe worker output path');
  if(await get('item/'+f.path,join(staging,'item',f.path))!==f.sha256)throw Error('Worker output checksum mismatch: '+f.path);
 }
 return adoptWholeResult(staging,it.dir,m,sha,it.id);
}
