// Typed job cpu-prep (scripts/media/worker/job-types.json): original, probe, grade, enhance to its DFN checkpoint, waveform. CPU only; never a GPU stage.
import {resolve} from 'node:path';
import {open,prep,manifest} from './phases.mjs';
const ctx=await open(resolve(process.argv[2]||'.'),'cpu-prep');
await manifest(ctx,{meta:await prep(ctx)},{type:'cpu-prep'});
