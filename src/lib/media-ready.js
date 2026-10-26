// Start only the audio copy the listener requested; a cancelled page warm must
// not leave playback polling forever without restarting its transfer.
export function audioWarmPath(path) {
 const url=new URL(path,'https://siftersearch.com');
 const m=/^\/api\/media\/([a-z0-9-]+)\/file\/web\/[^/]+\.(ogg|m4a)$/.exec(url.pathname),v=url.searchParams.get('v');
 if(!m||!v)return null;
 return `/_media/warm?${new URLSearchParams({slug:m[1],v,fmt:m[2],copy:/\.original\./.test(url.pathname)?'original':'main'})}`;
}
export async function audioReady(path,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,onWaiting=()=>{},maxWaitMs=180000}={}) {
 const start=now();let lastWarm=-Infinity;
 for(;;){
  const r=await fetcher(path,{headers:{range:'bytes=0-0'}});
  if(r.status!==202)return r.ok;
  const at=now(),warm=audioWarmPath(path);
  if(warm && at-lastWarm>=15000){lastWarm=at;fetcher(warm,{method:'POST'}).catch(()=>{});}
  if(at-start>3000)onWaiting();
  if(at-start>=maxWaitMs)return false;
  await sleep(Math.min(10000,Math.max(1000,(Number(r.headers.get('retry-after'))||4)*1000)));
 }
}
