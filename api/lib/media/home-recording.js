// Complete worker result on a home host; Tower transfers and validates only.
import {join,extname} from 'node:path';
import * as fs from 'node:fs/promises';
import {sha256File,podComplete} from './pod-post.js';
import {safeChain,OGG_ARGS,OGG_ARGS_REMASTER,M4A_BITRATE_REMASTER} from './enhance.js';
const q=s=>"'"+String(s).replaceAll("'", "'\\''")+"'";
export async function homeRecording(host,it,m,{T,image,mode='restore',stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 if(host!=='aorus'&&!(host==='boss'&&mode==='post'))throw Error('Restoration requires Aorus; Boss accepts cached CPU tails');
 const root=host==='boss'?'/home/chad/sifter-whole-home':'/data/sifter-whole-home',docker=host==='boss'?'sudo -n docker':'docker';
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,...opts});
 const put=(file,to)=>T.run('rsync',['-a',file,`${host}:${q(to)}`],{timeoutMs:600000});
 const get=(from,to)=>T.run('rsync',['-a',`${host}:${q(from)}`,to],{timeoutMs:600000});
 const work=join(it.dir,'transcript.work.json'), workSha=await sha256File(work);
 const job=`recording-${it.id}-${workSha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${job}`;
 const original=(m.enhancement?.variants||[]).find(v=>v.name==='original')||{};
 const cfg={mode,cleanup:false,assess_quality:true,trim:m.trim,slug:m.slug,audio_s:m.duration_s,work_sha:workSha,af:safeChain(original),bw_khz:m.quality?.raw?.bandwidth_khz,
  ogg:['-ac','1','-ar','48000',...OGG_ARGS_REMASTER],m4a:['-ac','1','-ar','48000','-c:a','aac','-b:a',M4A_BITRATE_REMASTER,'-movflags','+faststart'],
  orig_ogg:['-ac','1','-ar','48000',...OGG_ARGS],orig_m4a:['-ac','1','-ar','44100','-c:a','aac','-b:a','64k','-movflags','+faststart']};
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; ${docker} image inspect ${q(image)} >/dev/null`);
 const state=JSON.parse((await run(`${docker} inspect ${q(job)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 if(!state){
  await put(join(it.dir,m.original),remote+'/in'+extname(m.original));await put(work,remote+'/work.json');
  if(mode==='post')for(const [a,b] of [['unipase.cloud.flac','out.flac'],['unipase.asr.json','asr.json'],['unipase.asr_orig.json','asr_orig.json']])await put(join(it.dir,'enhanced',a),remote+'/'+b);
  await run(`cat > ${q(remote+'/job.json')}`,{input:JSON.stringify({post:cfg})});
  const accelerator=host==='aorus'?'--gpus all -v /home/chad/media-gpu/.gpu.lock:/gpu.lock -e SIFTER_LEGACY_GPU_LOCK=/gpu.lock':'-e MEDIA_DEVICE=cpu -e CUDA_VISIBLE_DEVICES=';
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
 const post=JSON.parse(await fs.readFile(join(stage,'post.json'),'utf8'));
 if(!post.ok||post.work_sha!==await sha256File(work))throw Error('Stale or incomplete home result');
 await fs.mkdir(join(stage,'web'),{recursive:true});
 for(const f of Object.values(post.web||{})){if(!/^[a-z0-9_.-]+$/i.test(f))throw Error('Invalid worker output path');await fs.rename(join(stage,f),join(stage,'web',f));}
 const pd=join(enh,'pod');await fs.rm(pd,{recursive:true,force:true});await fs.rename(stage,pd);
 if(!await podComplete(it.dir))throw Error('Home result is missing required output');
 await get(remote+'/done.json',join(enh,'unipase.done.json'));
 // Keep the raw AI copy on the home host for cheap future reassessment.
 await fs.writeFile(join(enh,'unipase.cloud.flac'),'');await fs.writeFile(join(enh,'unipase.asr.json'),'{}');
 return JSON.parse(await fs.readFile(join(enh,'unipase.done.json'),'utf8'));
}

/** New imports return every audio stage; only metadata/text publishing remains. */
export async function homeWholeRecording(it,m,{T,image,stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const {fileSha,adoptWholeResult}=await import('./whole-result.js');
 const input=join(it.dir,m.original),sha=await fileSha(input),root='/data/sifter-whole-home';
 const name=`whole-${it.id}-${sha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${name}`,host='aorus';
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,...opts});
 const state=async()=>JSON.parse((await run(`docker inspect ${q(name)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; docker image inspect ${q(image)} >/dev/null`);
 if(!await state()){
  await T.run('rsync',['-a',input,`${host}:${q(remote+'/in'+extname(m.original))}`],{timeoutMs:600000});
  const fresh={...m,stages:{archive:m.stages.archive}};
  for(const k of ['enhancement','quality','qa','remaster','aligned_to','trim','enh_ck','asr_job','diar_job','dfn_job','enc_jobs'])delete fresh[k];
  await run(`cat > ${q(remote+'/job.json')}`,{input:JSON.stringify({v:1,id:it.id,input:'in'+extname(m.original),input_sha:sha,threads:2,meta:fresh})});
  while(!await state()){
   if(stop()){const e=Error('Awaiting home slot');e.code='DRAIN';throw e;}
   // A short dispatch lock closes the race between concurrent API jobs. GPU/RAM
   // stages additionally share the process reservation registry inside the image.
   const launch=`if [ "$(docker ps --filter name=whole- --format '{{.Names}}' | wc -l)" -lt 2 ]; then docker run -d --name ${q(name)} --gpus all --network none --cpus 4 --memory 10g -v ${q(remote+':/job')} -v ${q(root+'/leases:/workspace/.gpu-admission')} -v /home/chad/media-gpu/.gpu.lock:/gpu.lock -e SIFTER_GPU_LEASES=1 -e SIFTER_LEGACY_GPU_LOCK=/gpu.lock --entrypoint /usr/local/bin/node ${q(image)} /opt/sifter/api/lib/media/whole-recording.mjs /job; fi`;
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
 await T.run('rsync',['-a','--exclude','original',`${host}:${q(remote+'/item')}`,staging+'/'],{timeoutMs:600000});
 await T.run('rsync',['-a',`${host}:${q(remote+'/result.json')}`,staging+'/result.json'],{timeoutMs:600000});
 return adoptWholeResult(staging,it.dir,m,sha);
}
