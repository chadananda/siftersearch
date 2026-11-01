// REALIGN on a home host (11-01: 2680/2530/2692 waited for a worker forever — no worker ever takes a lone realign). The listening copy + the transcript go
// to aorus over the LAN (never R2), media_tool realign runs in the worker image (CPU, the stage's declared class), realign.json comes back. Deps: host-job.js
import { join, dirname } from 'node:path';
import * as fsp from 'node:fs/promises';
import { hostJob } from './host-job.js';

export const RUN_SH = `set -e
python /opt/sifter/media/media_tool.py realign /job/in.flac --threads 4 --segments /job/work.json --output /job/realign.json > /job/out.json.tmp
mv /job/out.json.tmp /job/out.json
`;

/** realign `audio` (the listening copy) against the talk's transcript.work.json on `host`; realign.json lands at `out`. → media_tool's { placed, total }.
 *  Same name = same inputs, so a drained run re-attaches to the container still running. Throws code DRAIN when the service drains. */
export async function realignStep(it, { T, audio, out, stop = () => false, host = process.env.MEDIA_REALIGN_HOST || process.env.MEDIA_QUIET_HOST || 'aorus', image = null, nap, fs = fsp } = {}) {
  const { HOME_BUILDS } = await import('../ops/media-jobs.js');
  const img = image || Object.values(HOME_BUILDS).at(-1)?.[String(host).replace(/-\d+$/, '')];
  if (!img) throw Error(`realign: no image for ${host}`);
  const work = join(it.dir, 'transcript.work.json');
  const [a, w] = await Promise.all([fs.stat(audio), fs.stat(work)]);
  const name = `realign-${it.id}-${a.size.toString(36)}-${Math.round(a.mtimeMs).toString(36)}-${Math.round(w.mtimeMs).toString(36)}`;
  // CPU (the registry's class for realign), offline (--network none: the alignment models are in the image)
  const job = await hostJob({ T, host, image: img, name, label: 'realign', stop, nap, script: RUN_SH, cpus: 4, memGb: 6, freeGb: 8,
    env: { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }, inputs: [[audio, 'in.flac'], [work, 'work.json']] });
  const r = JSON.parse((await job.read('out.json')).trim().split('\n').filter(Boolean).pop());
  await fs.mkdir(dirname(out), { recursive: true });
  const staged = `${out}.remote`;
  await job.get('realign.json', staged);
  JSON.parse(await fs.readFile(staged, 'utf8'));   // a cut transfer throws here, the old realign.json stays
  await fs.rename(staged, out);
  await job.cleanup();
  return { placed: r.placed, total: r.total, host };
}
