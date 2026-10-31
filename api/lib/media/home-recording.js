// Complete worker result on a home host; Tower transfers and validates only.
import {join,extname} from 'node:path';
import * as fs from 'node:fs/promises';
import {sha256File} from './pod-post.js';
import {restoreCfg,restoreInputs,adoptRestoreResult} from './restore-job.js';
import {hostProfile,hostVendor} from './tools.js';
// A 15 GB host (aorus) cannot hold 4 x 10 GB container caps: a container starts only while the HOST has this much MemAvailable (VRAM is admitted by the in-container GPU leases)
export const WHOLE_HOST_MIN_AVAIL_GB=5;
const q=s=>"'"+String(s).replaceAll("'", "'\\''")+"'";
export async function homeRecording(host,it,m,{T,image,mode='restore',stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const prof=hostProfile(host);
 if(prof.transport==='gate'&&mode!=='post')throw Error(`${host} takes only cached CPU tails (gate transport); restoration runs on a docker host`);
 const root=prof.root,docker=prof.docker;
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,stop,...opts});
 const put=(file,to)=>T.run('rsync',['-a','--partial','--protect-args',file,`${host}:${to}`],{timeoutMs:600000,stop});
 const get=(from,to)=>T.run('rsync',['-a','--partial','--protect-args',`${host}:${from}`,to],{timeoutMs:600000,stop});
 const work=join(it.dir,'transcript.work.json'), workSha=await sha256File(work);
 const job=`recording-${it.id}-${workSha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${job}`;
 const cfg=await restoreCfg(it,m,{mode});
 if(prof.transport==='gate')return (await import('./gate-recording.js')).gatePostRecording(it,m,{T,host,job,cfg,stop,nap});
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; ${docker} image inspect ${q(image)} >/dev/null`);
 const state=JSON.parse((await run(`${docker} inspect ${q(job)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 if(!state){
  for(const [file,name] of restoreInputs(it,m,mode))await put(file,remote+'/'+name);
  await run(`cat > ${q(remote+'/job.json')}`,{input:JSON.stringify({post:cfg})});
  const accelerator=hostVendor(host)==='nvidia'?'--gpus all'+(prof.gpu_lock?` -v ${prof.gpu_lock}:/gpu.lock -e SIFTER_LEGACY_GPU_LOCK=/gpu.lock`:''):'-e MEDIA_DEVICE=cpu -e CUDA_VISIBLE_DEVICES=';
  await run(`${docker} run -d --name ${q(job)} ${accelerator} --network none --cpus 4 --memory 10g -v ${q(remote+':/job')} -v ${q(root+'/leases:/workspace/.gpu-admission')} -e SIFTER_GPU_LEASES=1 --entrypoint python ${q(image)} /opt/sifter/media/worker/single_restore.py /job`);
 }
 while(true){
  if(stop()){const e=Error('Worker continues; coordinator will reattach');e.code='DRAIN';throw e;}
  const state=JSON.parse((await run(`${docker} inspect ${q(job)} --format '{{json .State}}'`)).stdout.trim());
  if(!state.Running){if(state.ExitCode)throw Error(`Worker exited ${state.ExitCode}: `+(await run(`${docker} logs --tail 8 ${q(job)}`)).stdout.slice(-700));break;}
  await nap(10000);
 }
 const enh=join(it.dir,'enhanced'),stage=join(enh,'pod-stage');await fs.mkdir(stage,{recursive:true});
 await get(remote+'/post/',stage+'/');await get(remote+'/post.json',join(stage,'post.json'));
 await adoptRestoreResult(it.dir,stage);
 await get(remote+'/done.json',join(enh,'unipase.done.json'));
 // Keep the raw AI copy on the home host for cheap future reassessment.
 await fs.writeFile(join(enh,'unipase.cloud.flac'),'');await fs.writeFile(join(enh,'unipase.asr.json'),'{}');
 return JSON.parse(await fs.readFile(join(enh,'unipase.done.json'),'utf8'));
}

/** New imports return every audio stage; only metadata/text publishing remains. */
export async function homeWholeRecording(it,m,{T,host,image,legacyLock=true,stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const {fileSha,adoptWholeResult,wholeJob}=await import('./whole-result.js');
 const prof=hostProfile(host),input=join(it.dir,m.original),sha=await fileSha(input),root=prof.root;
 if(m.worker_result?.input_sha===sha)return m;
 // gate transport: the same whole job through the host's restricted gate — every stage on that one host, the audio uploaded once
 if(prof.transport==='gate')return (await import('./gate-recording.js')).gateWholeRecording(it,m,{T,host,image,stop,nap,sha});
 const name=`whole-${it.id}-${sha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${name}`;
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,stop,...opts});
 const state=async()=>JSON.parse((await run(`docker inspect ${q(name)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; docker image inspect ${q(image)} >/dev/null`);
 if(!await state()){
  await T.run('rsync',['-a','--protect-args',input,`${host}:${remote+'/in'+extname(m.original).toLowerCase()}`],{timeoutMs:600000,stop});
  await run(`cat > ${q(remote+'/job.json')}`,{input:JSON.stringify({...wholeJob(it,m,sha),threads:4})});
  while(!await state()){
   if(stop()){const e=Error('Awaiting home slot');e.code='DRAIN';throw e;}
   // A short dispatch lock closes the race between concurrent API jobs. GPU/RAM
   // stages additionally share the process reservation registry inside the image.
   const legacy=legacyLock&&prof.gpu_lock?`-v ${prof.gpu_lock}:/gpu.lock -e SIFTER_LEGACY_GPU_LOCK=/gpu.lock`:'';
   const launch=`if [ "$(docker ps --filter 'name=^/whole-[0-9]+-' --format '{{.Names}}' | wc -l)" -lt 4 ] && [ "$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)" -ge ${WHOLE_HOST_MIN_AVAIL_GB} ]; then docker run -d --name ${q(name)} --gpus all --network none --cpus 6 --memory 10g -v ${q(remote+':/job')} -v ${q(root+'/leases:/workspace/.gpu-admission')} ${legacy} -e SIFTER_GPU_LEASES=1 --entrypoint /usr/local/bin/node ${q(image)} /opt/sifter/api/lib/media/whole-recording.mjs /job; fi`;
   await run(`flock -x ${q(root+'/dispatch.lock')} bash -c ${q(launch)}`);
   if(!await state())await nap(10000);
  }
 }
 while(true){
  if(stop()){const e=Error('Whole recording continues on worker');e.code='DRAIN';throw e;}
  const s=await state();if(!s)throw Error('Whole recording worker disappeared');
  if(!s.Running){if(s.ExitCode)throw Error('Whole recording failed: '+(await run(`docker logs --tail 6 ${q(name)}`)).stdout.slice(-800));break;}
  await nap(10000);
 }
 const staging=join(it.dir,'.whole-worker');await fs.mkdir(staging,{recursive:true});
 await T.run('rsync',['-a','--protect-args','--exclude','original',`${host}:${remote+'/item'}`,staging+'/'],{timeoutMs:600000,stop});
 await T.run('rsync',['-a','--protect-args',`${host}:${remote+'/result.json'}`,staging+'/result.json'],{timeoutMs:600000,stop});
 return adoptWholeResult(staging,it.dir,m,sha,it.id);
}
