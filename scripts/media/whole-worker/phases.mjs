// The whole-recording job in three phases on (possibly) three hosts — typed jobs, scripts/media/worker/job-types.json. Moved from recording.mjs.
// prep (CPU): original, probe, grade, enhance up to DFN, waveform. gpu: DFN + probes, transcribe, diarize, UniPASE + re-ASR, guard measurement, realign
// (split_restore.py gpu). finish (CPU): verdict, assessment, quiet, encodes (split_restore.py finish), item.js remaster..trim, whole-format result.json.
// Every phase: jobDir/{job.json, in.<ext>, item/**} → item/** + result.json. No credentials, DB or remote hosts. Never splices (post.py measures only).
import {readFile,writeFile,mkdir,copyFile,readdir,cp,link,rm} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,extname,resolve} from 'node:path';
import {runItem,finishQuality} from '../../../api/lib/media/item.js';
import * as local from '../../../api/lib/media/tools.js';
import {toParagraphs,paragraphText,flattenWords} from '../../../api/lib/media/paragraphs.js';
import {safeChain,OGG_ARGS,OGG_ARGS_REMASTER,M4A_BITRATE_REMASTER} from '../../../api/lib/media/enhance.js';
import {buildVocab,CORE_TERMS} from '../../../api/lib/media/vocab.js';
import {computePeaks,normalizePeaks} from '../../../api/lib/media/peaks.js';
import {trimPlan,peaksOf} from '../../../api/lib/media/trim.js';
import {wordsKey} from '../../../api/lib/media/words-key.js';

export const CONTRACT=1;   // scripts/media/worker/job-types.json `contract`
export const GPU_SUBS=new Set(['dfn','probe','transcribe','diarize','realign']);   // media_tool subcommands a CPU phase never runs (they yield to the gpu job)
const SPLIT='/opt/sifter/media/worker/split_restore.py';
export const sha=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const drain=what=>Object.assign(Error(`${what}: the gpu job runs this`),{code:'DRAIN'});   // item.js saves the checkpoint and yields on DRAIN

/** Read job.json, set the image environment, build item.js's injected tools. type: 'cpu-prep' | 'gpu' | 'cpu-finish' | 'whole'. */
export async function open(jobDir,type){
 const job=JSON.parse(await readFile(join(jobDir,'job.json'),'utf8'));
 if(job.v!==1 || !/^in\.[a-z0-9]{2,5}$/.test(job.input||''))throw Error('Invalid recording job');
 if(type!=='whole' && (job.type!==type || job.contract!==CONTRACT))throw Error(`job is ${job.type} contract ${job.contract}; this entrypoint runs ${type} contract ${CONTRACT}`);
 if((type==='whole'||type==='cpu-prep') && !job.meta?.slug)throw Error('Invalid recording job: no meta');
 const threads=Math.max(1,Math.min(8,job.threads||2));
 // device: 'cuda' (default, NVIDIA), 'rocm' (AMD: whisper.cpp HIP ASR + ROCm torch; diarization via torch_diar), 'cpu' (the CPU phases; never restores)
 const device=type==='cpu-prep'||type==='cpu-finish'?'cpu':job.device||'cuda';
 const rocm=device==='rocm';
 process.env.SIFTER_GPU_LEASES='1';process.env.HF_HUB_OFFLINE='1';process.env.TRANSFORMERS_OFFLINE='1';process.env.TORCH_HOME='/root/.cache/torch';
 process.env.MEDIA_TOWER_HEAVY='1'; // this executable runs ONLY inside the worker
 process.env.NLTK_DATA='/opt/models/nltk_data';process.env.PYTHONPATH=(device==='cpu'||rocm?'':'/opt/worker-cuda:')+'/opt/worker-extras';process.env.PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True';
 process.env.MEDIA_DIAR_PROVIDER=device==='cpu'?'cpu':'torch'; // torch_diar: the whole diarization on the GPU (NVIDIA + AMD)
 process.env.MEDIA_DIAR_NO_CPU='1';
 process.env.MEDIA_PYTHON='/opt/gate/venv/bin/python';
 process.env.MEDIA_DFN_PYTHON='/opt/gate/venv/bin/python'; // DeepFilterNet in the GPU torch venv (venv-dfn = CPU torch, held GPUs idle 10-30)
 process.env.MEDIA_REMASTER_STRICT='0';process.env.MEDIA_REMASTER_GRADES='A,B,C,D,E';
 process.env.MEDIA_SPK_PRESCREEN='1';
 const languageData=await local.run(process.env.MEDIA_PYTHON,['-c',"import sys;sys.path.insert(0,'/opt/sifter/media/worker');from language_data import prepare;print(prepare())"],{threads,timeoutMs:30000});
 process.env.NLTK_DATA=languageData.stdout.trim().split('\n').at(-1);
 const dir=join(jobDir,'item');await mkdir(join(dir,'original'),{recursive:true});
 const state=async stage=>writeFile(join(jobDir,'progress.json'),JSON.stringify({at:Date.now(),stage}));
 const tool=async(sub,input,opts={},ctl={})=>{
  if(device==='cpu'&&GPU_SUBS.has(sub))throw drain(`media_tool ${sub}`);
  await state(sub);
  const args=['/opt/sifter/media/media_tool.py',sub,input,'--threads',String(sub==='diarize'&&device!=='cpu'?1:threads),'--models','/opt/gate/models'];
  for(const [k,v] of Object.entries(opts)){if(v===true)args.push('--'+k);else if(v!==null&&v!==undefined&&v!==false&&v!=='')args.push('--'+k,String(v));}
  const python=sub==='dfn'?process.env.MEDIA_DFN_PYTHON:process.env.MEDIA_PYTHON;
  const env={...(device==='cpu'?{CUDA_VISIBLE_DEVICES:'',MEDIA_DEVICE:'cpu'}:{}),...(ctl.needGb?{MEDIA_STAGE_RAM_GB:String(ctl.needGb)}:{})};
  const {stdout}=await local.run(python,args,{threads,timeoutMs:ctl.timeoutMs,env});
  return JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1));
 };
 const tools={...local,tool,searchLatency:async()=>0,threadsFor:()=>threads,
  // a CPU phase enters the DFN branch (so enhance never completes without it) and yields there: the gpu job resumes from enh_ck
  ...(device==='cpu'?{PY_DFN:()=>process.execPath}:{}),
  gpuOrTower:(sub,input,opts,ctl)=>tool(sub,input,opts,ctl),
  withProbeHost:fn=>fn(null),gpuHost:()=>null,probeHost:()=>null,
  asr:(sub,input,opts,ctl)=>tool(sub,input,opts,ctl),
  asrJob:(input,opts,ctl)=>tool('transcribe',input,opts,ctl),
  acquireAsrHost:undefined,pickAsrHost:()=> 'container',asrPickReason:()=> 'container local',asrHost:()=>null,pickDiarHost:()=>null,
  diarize:(input,output,ctl)=>tool('diarize',input,{output},ctl),
  encodeRemote:(recipe,input,output,opts={})=>tool('encode',input,{recipe,output,...(opts.af?{af:opts.af}:{}),...(opts.window?{ss:opts.window.ss,t:opts.window.t}:{})})};
 const ctx={job,jobDir,dir,threads,device,state,tools};
 ctx.deps=meta=>({detachedWorker:true,tools,llm:{},repo:{getMediaItem:async()=>ctx.item,updateMediaItem:async()=>{}},cbPeople:async()=>job.people||[],loadVocab:async()=>buildVocab([CORE_TERMS,job.vocab||[]]),now:()=>new Date().toISOString(),draining:async()=>false,drainingNow:()=>false});
 return ctx;
}

/** The original in item/original (hard link to in.<ext>), checked against job.input_sha and, after cpu-prep, the meta's own stamp. */
async function original(ctx,meta){
 const {job,jobDir,dir}=ctx;
 const rel='original/in'+extname(job.input),src=resolve(jobDir,job.input),dst=join(dir,rel);
 ctx.inputSha=await sha(src);
 if(job.input_sha && ctx.inputSha!==job.input_sha)throw Error('Original input hash mismatch');
 if(meta?.worker_source_sha && meta.worker_source_sha!==ctx.inputSha)throw Error('Checkpoint belongs to another original');
 if(existsSync(dst)){if(await sha(dst)!==ctx.inputSha)throw Error('Checkpoint belongs to another original');}
 else await link(src,dst).catch(()=>copyFile(src,dst));
 return rel;
}
const readMeta=dir=>readFile(join(dir,'meta.json'),'utf8').then(JSON.parse).catch(()=>null);
const itemOf=(ctx,meta)=>(ctx.item={id:ctx.job.id||1,slug:meta.slug,dir:ctx.dir,state:'running',speaker:meta.speaker,source_kind:'file'});

/** cpu-prep: original + probe + grade + enhance up to DFN (metrics, light chain) + waveform. */
export async function prep(ctx){
 const {job,dir}=ctx;
 const previous=await readMeta(dir);
 const rel=await original(ctx,previous);
 const probe=previous?.source?.probe||await local.ffprobe(join(dir,rel));
 const meta=previous||{...job.meta,original:rel,duration_s:probe.duration_s,source:{...job.meta.source,probe},stages:{archive:{at:new Date().toISOString()}}};
 meta.worker_source_sha=ctx.inputSha;
 delete meta.asr_job;delete meta.diar_job;
 await writeFile(join(dir,'meta.json'),JSON.stringify(meta));
 const result=await runItem(itemOf(ctx,meta),{only:['grade','enhance'],threads:ctx.threads},ctx.deps(meta));
 const after=await readMeta(dir);
 if(!after?.stages?.grade?.at)throw Error('cpu-prep: grade did not finish');
 // a CPU host yields at DFN with enh_ck {m0, light, m1}; a GPU host (the `whole` job) finishes enhance (item.js then drops enh_ck)
 if(!after.stages.enhance?.at && !(result.yielded && after.enh_ck?.m1 && existsSync(join(dir,'enhanced/light.flac'))))throw Error('cpu-prep: enhance did not reach its DFN checkpoint');
 await ctx.state('waveform');
 await waveform(ctx,after);
 return after;
}
async function waveform(ctx,meta){
 const parts=[];await local.pcmStream(join(ctx.dir,meta.original),8000,f=>parts.push(f));
 const pcm=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
 for(const p of parts){pcm.set(p,offset);offset+=p.length;}
 const wave=normalizePeaks(computePeaks(pcm,8000,{pixelsPerSecond:20}));
 await writeFile(join(ctx.dir,'waveform.json'),JSON.stringify(wave));
 return wave;
}

/** gpu: enhance (DFN + probes), transcribe, diarize, quality; then UniPASE + re-ASR + guard measurement + realign (split_restore.py gpu). */
export async function gpu(ctx){
 const {job,jobDir,dir}=ctx;
 const meta0=await readMeta(dir);
 if(!meta0?.slug)throw Error('gpu: no cpu-prep meta.json');
 await original(ctx,meta0);
 const item=itemOf(ctx,meta0),deps=ctx.deps(meta0);
 let result=await runItem(item,{only:['grade','enhance','transcribe','diarize'],threads:ctx.threads},deps);
 if(result.yielded||result.excluded||result.held)throw Error('Recording did not finish audio processing');
 await finishQuality(result.meta,dir,deps,item);
 await writeFile(join(dir,'meta.json'),JSON.stringify(result.meta));
 const meta=result.meta;
 if(job.restore===false || meta.stages.remaster?.at)return meta;
 if(ctx.device==='cpu')throw Error('Restoration requires a GPU-capable worker');
 const raw=JSON.parse(await readFile(join(dir,'transcript.raw.json'),'utf8'));
 // the cut from speech AND source energy (waveform from cpu-prep), without encoding throwaway listening copies
 const wave=existsSync(join(dir,'waveform.json'))?JSON.parse(await readFile(join(dir,'waveform.json'),'utf8')):await waveform(ctx,meta);
 const {peaks,pps}=peaksOf(wave),trim=trimPlan({words:flattenWords(raw.segments||[]),peaks,pps,duration:meta.duration_s});
 const paragraphs=toParagraphs(raw.segments||[]);
 if(!paragraphs.length)return meta;
 const restore=join(dir,'restore');await mkdir(restore,{recursive:true});
 await linkOriginal(ctx,meta,restore);
 const work=JSON.stringify({paragraphs});await writeFile(join(dir,'transcript.work.json'),work);await writeFile(join(restore,'work.json'),work);
 const metrics=meta.enhancement.variants.find(v=>v.name==='original')||{};
 const cfg={mode:'restore',cleanup:false,assess_quality:true,trim,slug:meta.slug,audio_s:meta.duration_s,af:safeChain(metrics),bw_khz:meta.quality.raw?.bandwidth_khz??null,
  max_fallback_pct:15,work_sha:createHash('sha256').update(work).digest('hex'),words_key:wordsKey({paragraphs}),
  ogg:['-ac','1','-ar','48000',...OGG_ARGS_REMASTER],m4a:['-ac','1','-ar','48000','-c:a','aac','-b:a',M4A_BITRATE_REMASTER,'-movflags','+faststart'],
  orig_ogg:['-ac','1','-ar','48000',...OGG_ARGS],orig_m4a:['-ac','1','-ar','44100','-c:a','aac','-b:a','64k','-movflags','+faststart']};
 const runs=raw.language==='multi'?(raw.segments||[]).filter(x=>x.lang).map(x=>({s:x.s,e:x.e,lang:x.lang})):undefined;
 await writeFile(join(restore,'job.json'),JSON.stringify({kind:'restore',post:cfg,...(runs?{runs}:{})}));
 await split(ctx,'gpu',restore,3*3600000);
 await rm(join(restore,'in'+extname(meta.original)),{force:true});   // the original travels once, from R2
 return meta;
}
async function linkOriginal(ctx,meta,restore){
 const src=join(ctx.dir,meta.original),input=join(restore,'in'+extname(meta.original));
 if(!existsSync(input))await link(src,input).catch(()=>copyFile(src,input));
}
async function split(ctx,mode,restore,timeoutMs){
 await ctx.state(mode==='gpu'?'unipase':'guard');
 const timer=setInterval(()=>readFile(join(restore,'progress.json'),'utf8').then(JSON.parse).then(p=>ctx.state(p.stage)).catch(()=>{}),2000);
 try{await local.run('python',[SPLIT,mode,restore],{threads:ctx.threads,timeoutMs});}finally{clearInterval(timer);}
}

/** cpu-finish: post.py (verdict, assessment, quiet, encodes) with the gpu job's measurements replayed, then item.js records it; whole-format result.json. */
export async function finish(ctx){
 const {jobDir,dir}=ctx;
 const meta0=await readMeta(dir);
 if(!meta0?.slug)throw Error('cpu-finish: no gpu meta.json');
 await original(ctx,meta0);
 const item=itemOf(ctx,meta0),deps=ctx.deps(meta0);
 let result={meta:meta0,slug:meta0.slug};
 const restore=join(dir,'restore');
 if(existsSync(join(restore,'job.json'))){
  await linkOriginal(ctx,meta0,restore);
  await split(ctx,'finish',restore,3600000);
  result=await adoptPost(ctx,item,deps,restore);
 }
 if(!result.meta.stages.web?.at){result=await runItem(item,{only:['web','trim'],threads:ctx.threads},deps);if(result.yielded)throw Error('web/trim yielded');}
 await writeFile(join(dir,'meta.json'),JSON.stringify(result.meta));
 await rm(restore,{recursive:true,force:true});   // the hand-off between hosts; tower adopts item/ as a whole job's
 return manifest(ctx,result);
}
/** The restore dir's outputs into item/ (as recording.mjs did after single_restore.py), then item.js remaster..trim. */
async function adoptPost(ctx,item,deps,restore){
 const {dir}=ctx;
 const raw=JSON.parse(await readFile(join(dir,'transcript.raw.json'),'utf8'));
 await mkdir(join(dir,'enhanced/pod'),{recursive:true});
 await cp(join(restore,'post'),join(dir,'enhanced/pod'),{recursive:true});
 await copyFile(join(restore,'post.json'),join(dir,'enhanced/pod/post.json'));
 const post=JSON.parse(await readFile(join(restore,'post.json'),'utf8'));
 if(post.web){await mkdir(join(dir,'enhanced/pod/web'),{recursive:true});for(const f of Object.values(post.web))await copyFile(join(restore,'post',f),join(dir,'enhanced/pod/web',f));}
 for(const [a,b] of [['out.flac','unipase.cloud.flac'],['asr.json','unipase.asr.json'],['asr_orig.json','unipase.asr_orig.json'],['done.json','unipase.done.json']])await copyFile(join(restore,a),join(dir,'enhanced',b));
 const result=await runItem(item,{only:['remaster','verify','realign','web','trim'],redo:['remaster','verify','realign','web','trim'],remaster:true,threads:ctx.threads},deps);
 if(result.yielded)throw Error(`${ctx.device==='cpu'?'cpu-finish':'whole'}: stage ${result.resume?.stage} needs a GPU step the gpu job did not record (no CPU fallback)`);
 if(result.meta.aligned_to==='unipase'){
  const aligned=JSON.parse(await readFile(join(dir,'transcript.work.json'),'utf8')).paragraphs;
  const originalWords=flattenWords(raw.segments);let index=0;
  raw.original_segments=raw.segments;
  raw.segments=aligned.map(p=>({s:p.t0,e:p.t1,spk:p.spk,lang:p.lang||raw.language,text:paragraphText(p),words:p.words.map(w=>({...w,p:originalWords[index++]?.p??null}))}));
  raw.aligned_to='unipase';await writeFile(join(dir,'transcript.raw.json'),JSON.stringify(raw));
 }
 return result;
}

/** The single run on one host (the `whole` job): prep → gpu → finish in one directory. */
export async function whole(ctx){
 const meta=await readMeta(ctx.dir);
 if(!meta?.stages?.transcribe?.at)await prep(ctx);
 await gpu(ctx);
 return finish(ctx);
}

/** result.json: what the agent uploads and the next job (or tower) takes. cpu-finish writes the complete whole-recording result (whole-result.js). */
export async function manifest(ctx,result,{type='cpu-finish',skip=[]}={}){
 const {jobDir,dir}=ctx;
 const meta=result.meta||await readMeta(dir);
 if(type==='cpu-finish'){
  await ctx.state('complete');
  // working copies stay here (10-31: ~0.9 GB of a 1.45 GB result for a 94-min talk): the probe variants chose the method and the raw AI copy was guarded
  // into enhanced/unipase.flac; tower keeps the empty raw-copy placeholder like every other lane
  for(const f of ['enhanced/light.flac','enhanced/dfn.flac'])await rm(join(dir,f),{force:true});
  if(existsSync(join(dir,'enhanced/unipase.cloud.flac')))await writeFile(join(dir,'enhanced/unipase.cloud.flac'),'');
 }
 const files=[];
 const collect=async rel=>{for(const ent of await readdir(join(dir,rel),{withFileTypes:true})){
  const path=join(rel,ent.name);if(path==='original'||skip.some(s=>path===s||path.startsWith(s+'/')))continue;
  if(ent.isSymbolicLink())throw Error('Symlink in worker output');
  if(ent.isDirectory())await collect(path);else if(ent.isFile())files.push({path,sha256:await sha(join(dir,path))});
 }};
 await collect('');
 const out={v:1,type,contract:CONTRACT,ok:true,input_sha:ctx.inputSha,slug:meta.slug,stages:Object.keys(meta.stages),files,meta};
 await writeFile(join(jobDir,'result.json'),JSON.stringify(out));
 return out;
}
