// Typed job cpu-finish (scripts/media/worker/job-types.json): guard verdict, assessment, quiet, encodes, item.js remaster..trim → a complete whole-recording result.
import {resolve} from 'node:path';
import {open,finish} from './phases.mjs';
await finish(await open(resolve(process.argv[2]||'.'),'cpu-finish'));
