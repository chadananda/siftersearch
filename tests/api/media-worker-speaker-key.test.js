import {it,expect} from 'vitest';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {finishQuality} from '../../api/lib/media/item.js';
import {speakerKey} from '../../api/lib/media/speaker-key.js';
it('finishes worker quality for imported recordings without a precomputed speaker key',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worker-speaker-'));
 await writeFile(join(dir,'transcript.raw.json'),JSON.stringify({segments:[]}));
 const meta={speaker:'Dr. Hooper C. Dunbar',original:'in.wav',enhancement:{variants:[]},quality:{raw:{}}};
 await finishQuality(meta,dir,{tools:{tool:async()=>({speakers:[]})},repo:{}},{});
 expect(speakerKey(meta.speaker)).toBe('hooper-dunbar');expect(meta.quality.final).toBe(true);
});
