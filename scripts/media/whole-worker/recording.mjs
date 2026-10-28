// One input recording, one job directory, all audio stages local to this image.
// No production credentials, databases, remote hosts or per-stage SSH dispatch.
import {readFile,writeFile,mkdir,copyFile,readdir,cp,link} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,extname,resolve} from 'node:path';
import {runItem,finishQuality} from '../../../api/lib/media/item.js';
import * as local from '../../../api/lib/media/tools.js';
import {toParagraphs,paragraphText,flattenWords} from '../../../api/lib/media/paragraphs.js';
import {safeChain,OGG_ARGS,OGG_ARGS_REMASTER,M4A_BITRATE_REMASTER} from '../../../api/lib/media/enhance.js';
import {buildVocab,CORE_TERMS} from '../../../api/lib/media/vocab.js';
import {computePeaks,normalizePeaks} from '../../../api/lib/media/peaks.js';
import {trimPlan,peaksOf} from '../../../api/lib/media/trim.js';

const jobDir=resolve(process.argv[2]||'.');
const job=JSON.parse(await readFile(join(jobDir,'job.json'),'utf8'));
if(job.v!==1 || !/^in\.[a-z0-9]{2,5}$/.test(job.input||'') || !job.meta?.slug)throw Error('Invalid whole-recording job');
const threads=Math.max(1,Math.min(8,job.threads||2));
// job.device: 'cuda' (default, NVIDIA), 'rocm' (AMD: whisper.cpp HIP ASR + ROCm torch; sherpa diarization has no ROCm build so it runs on the CPU), 'cpu' (legacy, never restores)
const rocm=job.device==='rocm';
process.env.SIFTER_GPU_LEASES='1';process.env.HF_HUB_OFFLINE='1';process.env.TRANSFORMERS_OFFLINE='1';process.env.TORCH_HOME='/root/.cache/torch';
process.env.MEDIA_TOWER_HEAVY='1'; // this executable runs ONLY inside the worker
process.env.NLTK_DATA='/opt/models/nltk_data';process.env.PYTHONPATH=(job.device==='cpu'||rocm?'':'/opt/worker-cuda:')+'/opt/worker-extras';process.env.PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True';
process.env.MEDIA_DIAR_PROVIDER=job.device==='cpu'||rocm?'cpu':'cuda';process.env.MEDIA_DIAR_NO_CPU='1';
process.env.MEDIA_PYTHON='/opt/gate/venv/bin/python';
process.env.MEDIA_DFN_PYTHON='/opt/gate/venv-dfn/bin/python';
process.env.MEDIA_REMASTER_STRICT='0';process.env.MEDIA_REMASTER_GRADES='A,B,C,D,E';
process.env.MEDIA_SPK_PRESCREEN='1';
const languageData=await local.run(process.env.MEDIA_PYTHON,['-c',"import sys;sys.path.insert(0,'/opt/sifter/media/worker');from language_data import prepare;print(prepare())"],{threads,timeoutMs:30000});
process.env.NLTK_DATA=languageData.stdout.trim().split('\n').at(-1);
const dir=join(jobDir,'item');await mkdir(join(dir,'original'),{recursive:true});
const original='original/in'+extname(job.input);
const sha=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const inputSha=await sha(resolve(jobDir,job.input));
if(job.input_sha && inputSha!==job.input_sha)throw Error('Original input hash mismatch');
let previous=await readFile(join(dir,'meta.json'),'utf8').then(JSON.parse).catch(()=>null);
if(previous){
 if(await sha(join(dir,previous.original))!==inputSha)throw Error('Checkpoint belongs to another original');
}else await copyFile(resolve(jobDir,job.input),join(dir,original));
const probe=previous?.source?.probe||await local.ffprobe(join(dir,original));
const meta=previous||{...job.meta,original,duration_s:probe.duration_s,source:{...job.meta.source,probe},stages:{archive:{at:new Date().toISOString()}}};
meta.worker_source_sha=inputSha;
delete meta.asr_job;delete meta.diar_job;
await writeFile(join(dir,'meta.json'),JSON.stringify(meta));
const state=async stage=>writeFile(join(jobDir,'progress.json'),JSON.stringify({at:Date.now(),stage}));
const tool=async(sub,input,opts={},ctl={})=>{
 await state(sub);
 const args=['/opt/sifter/media/media_tool.py',sub,input,'--threads',String(sub==='diarize'&&job.device!=='cpu'&&!rocm?1:threads),'--models','/opt/gate/models'];
 for(const [k,v] of Object.entries(opts)){if(v===true)args.push('--'+k);else if(v!==null&&v!==undefined&&v!==false&&v!=='')args.push('--'+k,String(v));}
 const python=sub==='dfn'?process.env.MEDIA_DFN_PYTHON:process.env.MEDIA_PYTHON;
 const env={...(job.device==='cpu'?{CUDA_VISIBLE_DEVICES:'',MEDIA_DEVICE:'cpu'}:{}),...(ctl.needGb?{MEDIA_STAGE_RAM_GB:String(ctl.needGb)}:{})};
 const {stdout}=await local.run(python,args,{threads,timeoutMs:ctl.timeoutMs,env});
 return JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1));
};
const tools={...local,tool,searchLatency:async()=>0,threadsFor:()=>threads,
 gpuOrTower:(sub,input,opts,ctl)=>tool(sub,input,opts,ctl),
 withProbeHost:fn=>fn(null),gpuHost:()=>null,probeHost:()=>null,
 asr:(sub,input,opts,ctl)=>tool(sub,input,opts,ctl),
 asrJob:(input,opts,ctl)=>tool('transcribe',input,opts,ctl),
 acquireAsrHost:undefined,pickAsrHost:()=> 'container',asrPickReason:()=> 'container local',asrHost:()=>null,pickDiarHost:()=>null,
 diarize:(input,output,ctl)=>tool('diarize',input,{output},ctl),
 encodeRemote:(recipe,input,output,opts={})=>tool('encode',input,{recipe,output,...(opts.af?{af:opts.af}:{}),...(opts.window?{ss:opts.window.ss,t:opts.window.t}:{})})};
const item={id:job.id||1,slug:meta.slug,dir,state:'running',speaker:meta.speaker,source_kind:'file'};
const deps={detachedWorker:true,tools,llm:{},repo:{getMediaItem:async()=>item,updateMediaItem:async()=>{}},cbPeople:async()=>job.people||[],loadVocab:async()=>buildVocab([CORE_TERMS,job.vocab||[]]),now:()=>new Date().toISOString(),draining:async()=>false,drainingNow:()=>false};
let result=await runItem(item,{only:['grade','enhance','transcribe','diarize'],threads},deps);
if(result.yielded||result.excluded||result.held)throw Error('Recording did not finish audio processing');
await finishQuality(result.meta,dir,deps,item);
await writeFile(join(dir,'meta.json'),JSON.stringify(result.meta));
// Restore eligible recordings while the original and every intermediate remain
// on this worker. Tower receives final timings, guard verdict and all encodes.
if(job.restore!==false && !result.meta.stages.remaster?.at){
 if(job.device==='cpu')throw Error('Restoration requires a GPU-capable worker');
 const raw=JSON.parse(await readFile(join(dir,'transcript.raw.json'),'utf8'));
  // Determine the cut from speech AND source energy without encoding throwaway
  // listening copies. The final selected copy is encoded only after assessment.
  const parts=[];await local.pcmStream(join(dir,original),8000,f=>parts.push(f));
  const pcm=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
  for(const p of parts){pcm.set(p,offset);offset+=p.length;}
  const wave=normalizePeaks(computePeaks(pcm,8000,{pixelsPerSecond:20}));
  await writeFile(join(dir,'waveform.json'),JSON.stringify(wave));
  const {peaks,pps}=peaksOf(wave),trim=trimPlan({words:flattenWords(raw.segments||[]),peaks,pps,duration:meta.duration_s});
 const paragraphs=toParagraphs(raw.segments||[]);
 if(paragraphs.length){
  const restore=join(jobDir,'restore');await mkdir(restore,{recursive:true});
  const src=join(dir,original),input=join(restore,'in'+extname(original));
  await link(src,input).catch(()=>copyFile(src,input));
  const work=JSON.stringify({paragraphs});await writeFile(join(dir,'transcript.work.json'),work);await writeFile(join(restore,'work.json'),work);
  const metrics=result.meta.enhancement.variants.find(v=>v.name==='original')||{};
  const cfg={mode:'restore',cleanup:false,assess_quality:true,trim,slug:meta.slug,audio_s:meta.duration_s,af:safeChain(metrics),bw_khz:result.meta.quality.raw?.bandwidth_khz??null,
   max_fallback_pct:15,work_sha:createHash('sha256').update(work).digest('hex'),
   ogg:['-ac','1','-ar','48000',...OGG_ARGS_REMASTER],m4a:['-ac','1','-ar','48000','-c:a','aac','-b:a',M4A_BITRATE_REMASTER,'-movflags','+faststart'],
   orig_ogg:['-ac','1','-ar','48000',...OGG_ARGS],orig_m4a:['-ac','1','-ar','44100','-c:a','aac','-b:a','64k','-movflags','+faststart']};
  const runs=raw.language==='multi'?(raw.segments||[]).filter(x=>x.lang).map(x=>({s:x.s,e:x.e,lang:x.lang})):undefined;
  await writeFile(join(restore,'job.json'),JSON.stringify({kind:'restore',post:cfg,...(runs?{runs}:{})}));
  await state('unipase');
  const timer=setInterval(()=>readFile(join(restore,'progress.json'),'utf8').then(JSON.parse).then(p=>state(p.stage)).catch(()=>{}),2000);
  try{await local.run('python',['/opt/sifter/media/worker/single_restore.py',restore],{threads,timeoutMs:3*3600000});}finally{clearInterval(timer);}
  await mkdir(join(dir,'enhanced/pod'),{recursive:true});
  await cp(join(restore,'post'),join(dir,'enhanced/pod'),{recursive:true});
  await copyFile(join(restore,'post.json'),join(dir,'enhanced/pod/post.json'));
  const post=JSON.parse(await readFile(join(restore,'post.json'),'utf8'));
  if(post.web){await mkdir(join(dir,'enhanced/pod/web'),{recursive:true});for(const f of Object.values(post.web))await copyFile(join(restore,'post',f),join(dir,'enhanced/pod/web',f));}
  for(const [a,b] of [['out.flac','unipase.cloud.flac'],['asr.json','unipase.asr.json'],['asr_orig.json','unipase.asr_orig.json'],['done.json','unipase.done.json']])await copyFile(join(restore,a),join(dir,'enhanced',b));
  result=await runItem(item,{only:['remaster','realign','web','trim'],redo:['remaster','realign','web','trim'],remaster:true,threads},deps);
  if(result.meta.aligned_to==='unipase'){
   const aligned=JSON.parse(await readFile(join(dir,'transcript.work.json'),'utf8')).paragraphs;
   const originalWords=flattenWords(raw.segments);let index=0;
   raw.original_segments=raw.segments;
   raw.segments=aligned.map(p=>({s:p.t0,e:p.t1,spk:p.spk,lang:p.lang||raw.language,text:paragraphText(p),words:p.words.map(w=>({...w,p:originalWords[index++]?.p??null}))}));
   raw.aligned_to='unipase';await writeFile(join(dir,'transcript.raw.json'),JSON.stringify(raw));
  }
 }
}
if(!result.meta.stages.web?.at)result=await runItem(item,{only:['web','trim'],threads},deps);
await writeFile(join(dir,'meta.json'),JSON.stringify(result.meta));
await state('complete');
const files=[];
const collect=async rel=>{for(const ent of await readdir(join(dir,rel),{withFileTypes:true})){
 const path=join(rel,ent.name);if(path==='original')continue;
 if(ent.isSymbolicLink())throw Error('Symlink in worker output');
 if(ent.isDirectory())await collect(path);else if(ent.isFile())files.push({path,sha256:await sha(join(dir,path))});
}};
await collect('');
await writeFile(join(jobDir,'result.json'),JSON.stringify({v:1,ok:true,input_sha:inputSha,slug:result.slug,stages:Object.keys(result.meta.stages),files,meta:result.meta}));
