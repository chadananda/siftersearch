// The `whole` job: one input recording, one job directory, every audio stage local to this image (prep → gpu → finish, phases.mjs).
// No production credentials, databases, remote hosts or per-stage SSH dispatch. The typed jobs run the same phases one per host: cpu-prep.mjs, gpu.mjs, cpu-finish.mjs.
import {resolve} from 'node:path';
import {open,whole} from './phases.mjs';
await whole(await open(resolve(process.argv[2]||'.'),'whole'));
