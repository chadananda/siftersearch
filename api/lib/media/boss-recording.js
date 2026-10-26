// Restricted gate transport for Boss: fixed image, cached restoration, CPU only.
import {join,extname} from 'node:path';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {sha256File,podComplete} from './pod-post.js';
export async function bossPostRecording(it,m,{T,job,cfg,stop,nap}){
 const call=(verb,opts={})=>T.run('ssh',['-o','BatchMode=yes','boss',verb],{timeoutMs:600000,...opts});
 const poll=async()=>JSON.parse((await call(`whole-poll ${job}`)).stdout);
 let s=await poll();
 if(!s){
  for(const [file,name] of [[join(it.dir,m.original),'in'+extname(m.original).toLowerCase()],[join(it.dir,'transcript.work.json'),'work.json'],...['unipase.cloud.flac','unipase.asr.json','unipase.asr_orig.json'].map((f,i)=>[join(it.dir,'enhanced',f),['out.flac','asr.json','asr_orig.json'][i]])])await call(`whole-put ${job} ${name}`,{inputFile:file});
  await call(`whole-put ${job} job.json`,{input:JSON.stringify({post:cfg})});
  while(!s){if(stop()){const e=Error('Boss job staged for reattachment');e.code='DRAIN';throw e;}await call(`whole-start ${job}`);s=await poll();if(!s)await nap(10000);}
 }
 while(s.Running){if(stop()){const e=Error('Boss recording continues');e.code='DRAIN';throw e;}await nap(10000);s=await poll();}
 if(s.ExitCode)throw Error('Boss CPU recording failed with exit '+s.ExitCode);
 const stage=join(it.dir,'enhanced/pod-stage');await mkdir(join(stage,'web'),{recursive:true});
 const get=async(name,to)=>{const output=createWriteStream(to);try{await call(`whole-fetch ${job} ${name}`,{onStdout:b=>output.write(b)});output.end();await finished(output);}catch(e){output.destroy();throw e;}};
 await get('post.json',join(stage,'post.json'));const post=JSON.parse(await readFile(join(stage,'post.json'),'utf8'));
 if(!post.ok||post.work_sha!==await sha256File(join(it.dir,'transcript.work.json')))throw Error('Stale Boss transcript result');
 for(const f of ['unipase.flac','unipase.guard.json',...(post.realign?['realign.json']:[]),...(post.waveform_file?[post.waveform_file]:[])]){if(!/^[a-z0-9_.-]+$/i.test(f))throw Error('Unsafe output path');await get('post/'+f,join(stage,f));}
 for(const f of Object.values(post.web||{})){if(!/^[a-z0-9_.-]+$/i.test(f))throw Error('Unsafe output path');await get('post/'+f,join(stage,'web',f));}
 const pd=join(it.dir,'enhanced/pod');await rm(pd,{recursive:true,force:true});await rename(stage,pd);
 if(!await podComplete(it.dir))throw Error('Incomplete Boss result');
 await get('done.json',join(it.dir,'enhanced/unipase.done.json'));
 await writeFile(join(it.dir,'enhanced/unipase.cloud.flac'),'');await writeFile(join(it.dir,'enhanced/unipase.asr.json'),'{}');
 return JSON.parse(await readFile(join(it.dir,'enhanced/unipase.done.json'),'utf8'));
}
