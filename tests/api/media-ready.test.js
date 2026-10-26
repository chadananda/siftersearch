import {it,expect,vi} from 'vitest';
import {audioReady,audioWarmPath} from '../../src/lib/media-ready.js';
it('requests only the format and copy the listener chose',()=>{
 expect(audioWarmPath('/api/media/a/file/web/a.original.m4a?v=4')).toBe('/_media/warm?slug=a&v=4&fmt=m4a&copy=original');
 expect(audioWarmPath('/api/media/a/file/web/a.ogg?v=4')).toBe('/_media/warm?slug=a&v=4&fmt=ogg&copy=main');
});
it('restarts a missing transfer and waits for playable bytes',async()=>{
 let t=0,n=0;const fetcher=vi.fn(async(path,opts)=>opts?.method==='POST'?new Response('{}'):new Response('',{status:++n<3?202:206}));
 expect(await audioReady('/api/media/a/file/web/a.ogg?v=4',{fetcher,now:()=>t,sleep:async ms=>{t+=ms;}})).toBe(true);
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
});
it('can be retried after timing out without mistaking a preparing response for audio',async()=>{
 let t=0,ready=false;const fetcher=vi.fn(async(path,opts)=>new Response('',{status:opts?.method==='POST'?200:ready?206:202}));
 const opts={fetcher,now:()=>t,sleep:async ms=>{t+=ms;},maxWaitMs:4000};
 expect(await audioReady('/api/media/a/file/web/a.ogg?v=4',opts)).toBe(false);ready=true;expect(await audioReady('/api/media/a/file/web/a.ogg?v=4',opts)).toBe(true);
});
