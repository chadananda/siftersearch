// RETIRED (Chad 11-01): quiet v1 silenced the kept FLAC master in place and cut real speech. Quiet v2 is data decided on the GPU job (scripts/media/worker/quiet.py → quiet.json); a talk with a v1 pass is redone
// as a stale remaster (stages.js, ops media rerun --stage remaster). Kept as a shim so media-quiet-repair / old imports fail loudly instead of touching audio.
import { QUIET_REPAIR_VERSION, quietRecord } from './quiet-record.js';
export { QUIET_REPAIR_VERSION, quietRecord };
const RETIRED = 'quiet repair is retired: quiet v2 is decided in the gpu job (whisper + VAD); redo the remaster (ops media rerun --stage remaster)';
export async function quietMaster() { throw Error(RETIRED); }
export async function quietStep() { throw Error(RETIRED); }
