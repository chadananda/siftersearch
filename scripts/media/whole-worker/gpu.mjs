// Typed job gpu (scripts/media/worker/job-types.json): DFN + probes, transcribe, diarize, UniPASE + re-ASR, the guard's measurement, realign. Audio loaded once.
import {resolve} from 'node:path';
import {open,gpu,manifest} from './phases.mjs';
const ctx=await open(resolve(process.argv[2]||'.'),'gpu');
await manifest(ctx,{meta:await gpu(ctx)},{type:'gpu',skip:['enhanced/light.flac','enhanced/dfn.flac']});
