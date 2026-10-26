// Complete worker result on a home host; Tower transfers and validates only.
import {join,extname} from 'node:path';
import * as fs from 'node:fs/promises';
import {sha256File,podComplete} from './pod-post.js';
import {safeChain,OGG_ARGS,OGG_ARGS_REMASTER,M4A_BITRATE_REMASTER} from './enhance.js';
const q=s=>"'"+String(s).replaceAll("'", "'\\''")+"'";
export async function homeRecording(host,it,m,{T,image,mode='restore',stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 if(host!=='aorus'&&!(host==='boss'&&mode==='post'))throw Error('Restoration requires Aorus; Boss accepts cached CPU tails');
 const root=host==='boss'?'/home/chad/sifter-whole-home':'/data/sifter-whole-home',docker=host==='boss'?'sudo -n docker':'docker';
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,stop,...opts});
 const put=(file,to)=>T.run('rsync',['-a','--partial','--protect-args',file,`${host}:${to}`],{timeoutMs:600000,stop});
 const get=(from,to)=>T.run('rsync',['-a','--partial','--protect-args',`${host}:${from}`,to],{timeoutMs:600000,stop});
 const work=join(it.dir,'transcript.work.json'), workSha=await sha256File(work);
 const job=`recording-${it.id}-${workSha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${job}`;
 const original=(m.enhancement?.variants||[]).find(v=>v.name==='original')||{};
 const cfg={mode,cleanup:false,assess_quality:true,trim:m.trim,slug:m.slug,audio_s:m.duration_s,work_sha:workSha,af:safeChain(original),bw_khz:m.quality?.raw?.bandwidth_khz,
  ogg:['-ac','1','-ar','48000',...OGG_ARGS_REMASTER],m4a:['-ac','1','-ar','48000','-c:a','aac','-b:a',M4A_BITRATE_REMASTER,'-movflags','+faststart'],
  orig_ogg:['-ac','1','-ar','48000',...OGG_ARGS],orig_m4a:['-ac','1','-ar','44100','-c:a','aac','-b:a','64k','-movflags','+faststart']};
 if(host==='boss')return (await import('./boss-recording.js')).bossPostRecording(it,m,{T,job,cfg,stop,nap});
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; ${docker} image inspect ${q(image)} >/dev/null`);
 const state=JSON.parse((await run(`${docker} inspect ${q(job)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 if(!state){
  await put(join(it.dir,m.original),remote+'/in'+extname(m.original));await put(work,remote+'/work.json');
  if(mode==='post')for(const [a,b] of [['unipase.cloud.flac','out.flac'],['unipase.asr.json','asr.json'],['unipase.asr_orig.json','asr_orig.json']]){
    const file=join(it.dir,'enhanced',a);if(b==='asr_orig.json'&&!await fs.stat(file).catch(()=>null))continue;
    await put(file,remote+'/'+b);
  }
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
export async function homeWholeRecording(it,m,{T,image,legacyLock=true,stop=()=>false,nap=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const {fileSha,adoptWholeResult,wholeJob}=await import('./whole-result.js');
 const input=join(it.dir,m.original),sha=await fileSha(input),root='/data/sifter-whole-home';
 if(m.worker_result?.input_sha===sha)return m;
 const name=`whole-${it.id}-${sha.slice(0,8)}-${image.slice(-8)}`,remote=`${root}/${name}`,host='aorus';
 const run=(cmd,opts={})=>T.run('ssh',[host,cmd],{timeoutMs:120000,stop,...opts});
 const state=async()=>JSON.parse((await run(`docker inspect ${q(name)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
 await run(`mkdir -p ${q(remote)} ${q(root+'/leases')}; docker image inspect ${q(image)} >/dev/null`);
 if(!await state()){
  await T.run('rsync',['-a','--protect-args',input,`${host}:${remote+'/in'+extname(m.original).toLowerCase()}`],{timeoutMs:600000,stop});
  await run(`cat > ${q(remote+'/job.json')}`,{input:JSON.stringify({...wholeJob(it,m,sha),threads:6})});
  while(!await state()){
   if(stop()){const e=Error('Awaiting home slot');e.code='DRAIN';throw e;}
   // A short dispatch lock closes the race between concurrent API jobs. GPU/RAM
   // stages additionally share the process reservation registry inside the image.
   const legacy=legacyLock?'-v /home/chad/media-gpu/.gpu.lock:/gpu.lock -e SIFTER_LEGACY_GPU_LOCK=/gpu.lock':'';
   const launch=`if [ "$(docker ps --filter 'name=^/whole-[0-9]+-' --format '{{.Names}}' | wc -l)" -lt 2 ]; then docker run -d --name ${q(name)} --gpus all --network none --cpus 8 --memory 10g -v ${q(remote+':/job')} -v ${q(root+'/leases:/workspace/.gpu-admission')} ${legacy} -e SIFTER_GPU_LEASES=1 --entrypoint /usr/local/bin/node ${q(image)} /opt/sifter/api/lib/media/whole-recording.mjs /job; fi`;
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
 return adoptWholeResult(staging,it.dir,m,sha);
}
