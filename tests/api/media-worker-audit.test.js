import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {mediaWorkerAudit} from '../../api/lib/ops/media-worker-audit.js';
it('bounds an audit, filters languages and distinguishes missing AI data from a real cached copy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'media-worker-audit-'));await mkdir(join(dir,'enhanced'));
 await writeFile(join(dir,'meta.json'),JSON.stringify({original:'original/a.mp3',remaster:{status:'done',swapped:2},qa:{remaster:{output_assessment:{passed:true}}}}));
 await writeFile(join(dir,'enhanced/unipase.cloud.flac'),'cached');
 const r=await mediaWorkerAudit({language:'fa',limit:1},{repo:{mediaIndexRows:async()=>[{id:1,language:'en',dir},{id:2,language:'Fa',dir},{id:3,language:'fa',dir}]}});
 expect(r.recordings.map(x=>x.id)).toEqual([2]);expect(r.recordings[0].raw_ai_bytes).toBe(6);expect(r.next_after).toBe(2);
});
