import {join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {adoptWholeResult} from './whole-result.js';
export async function takeCloudRecording({C,run,p,job,item,meta,inputSha}){
 if(meta.worker_result?.input_sha===inputSha)return meta;
 const stage=join(item.dir,'.whole-worker',job);await mkdir(join(stage,'item'),{recursive:true});
 const remote='/workspace/spool/'+job;
 await C.podGet(run,p,remote+'/result.json',join(stage,'result.json'));
 const result=JSON.parse(await readFile(join(stage,'result.json'),'utf8'));
 if(result.input_sha!==inputSha||result.slug!==item.slug||!Array.isArray(result.files)||result.files.length>200)throw Error('Cloud recording identity mismatch');
 for(const f of result.files){
  if(!/^[a-zA-Z0-9_.\/-]+$/.test(f.path)||f.path.split('/').some(x=>!x||x==='.'||x==='..')||f.path==='original'||f.path.startsWith('original/'))throw Error('Unsafe cloud recording path');
  const to=join(stage,'item',f.path);await mkdir(join(to,'..'),{recursive:true});await C.podGet(run,p,remote+'/item/'+f.path,to);
 }
 return adoptWholeResult(stage,item.dir,meta,inputSha,item.id);
}
