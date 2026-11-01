// Silence-only repair of a PUBLISHED remaster (Chad 10-30: "no way to repair the already processed audio without full reprocessing?"): the kept master
// (enhanced/unipase.flac) + its word timings go to a home host over the LAN, quiet.py fades the word-free stretches there, the silenced master comes back
// (the old one kept as unipase.prequiet.flac). Tower only moves files; the web copies are re-encoded by the media-item redo (worker pool). Deps: tools.js
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { hostJob } from './host-job.js';

import { QUIET_REPAIR_VERSION, quietRecord } from './quiet-record.js';
export { QUIET_REPAIR_VERSION, quietRecord };
const QUIET_PY = '/opt/sifter/media/worker/quiet.py';
// the container script: silence, then measure both files' (rate, channels, duration) with quiet.probe so tower can check the copy is the same length
export const RUN_SH = `set -e
python ${QUIET_PY} /job/in.flac /job/work.json /job/realign.json /job/out.flac > /job/report.json.tmp
python -c "import sys,json,os;sys.path.insert(0,'/opt/sifter/media/worker');import quiet;print(json.dumps({'in':quiet.probe('/job/in.flac'),'out':quiet.probe('/job/out.flac') if os.path.exists('/job/out.flac') else None}))" > /job/probe.json
mv /job/report.json.tmp /job/report.json
`;

/** Is the silenced copy safe to swap in? Same rate, channels and length (±50 ms: silencing never moves time). Pure → null | reason. */
export function probeMismatch(p) {
  if (!p?.in || !p?.out) return 'no output probe';
  const [ri, ci, di] = p.in, [ro, co, dout] = p.out;
  if (ri !== ro || ci !== co) return `format changed (${ri}/${ci} → ${ro}/${co})`;
  if (Math.abs(di - dout) > 0.05) return `length changed (${di} → ${dout} s)`;
  return null;
}

/** One talk: master → host → quiet.py → back. → { changed, report, record } (changed=false: nothing word-free to silence). Throws on any doubt; the master is untouched then. */
export async function quietMaster(it, { T, host, image, stop = () => false, nap = (ms) => new Promise((r) => setTimeout(r, ms)), fs = fsp } = {}) {
  const enh = join(it.dir, 'enhanced'), master = join(enh, 'unipase.flac'), work = join(it.dir, 'transcript.work.json'), realign = join(enh, 'realign.json');
  if (!existsSync(realign)) throw Error('no realign.json on the master: needs a full redo');
  const s0 = await fs.stat(master);
  if (s0.size < 1e4) throw Error('master missing or empty');   // 10 KB, not more: a 37 s talk's master is 159 KB
  const name = `quiet-${it.id}-${s0.size.toString(36)}-${Math.round(s0.mtimeMs).toString(36)}`;
  // CPU only, small (2 cores, 3 GB): started only while the host keeps 4 GB free (aorus runs the restore containers beside it)
  const job = await hostJob({ T, host, image, name, label: 'quiet', stop, nap, script: RUN_SH, inputs: [[master, 'in.flac'], [work, 'work.json'], [realign, 'realign.json']] });
  const report = JSON.parse(await job.read('report.json'));
  const probe = JSON.parse(await job.read('probe.json'));
  const cleanup = job.cleanup;
  if (!report.stretches || !probe.out) { await cleanup(); return { changed: false, report, record: quietRecord(report) }; }
  const bad = probeMismatch(probe);
  if (bad) throw Error(`quiet output rejected: ${bad}`);
  const staged = join(enh, 'unipase.quiet.flac');
  await job.get('out.flac', staged);
  const s1 = await fs.stat(master);
  if (s1.size !== s0.size || s1.mtimeMs !== s0.mtimeMs) { await fs.rm(staged, { force: true }); throw Error('master changed while it was being silenced'); }
  if ((await fs.stat(staged)).size < 1e4) throw Error('silenced copy came back empty');
  await fs.rename(master, join(enh, 'unipase.prequiet.flac'));   // rollback: rename it back and redo web/trim/update
  await fs.rename(staged, master);
  await cleanup();
  return { changed: true, report, record: quietRecord(report) };
}

/** The quiet STAGE for one talk (called by runItem): quietMaster on a home host (default aorus; gate hosts and tower are refused), → { changed, quiet } where quiet is the meta.remaster.quiet record
 *  (tool/settings/version + host + when + the backup of the unsilenced master). Throws code DRAIN when the service drains. */
export async function quietStep(it, meta, { T, stop, host = process.env.MEDIA_QUIET_HOST || 'aorus', image = null } = {}) {
  const { HOME_BUILDS } = await import('../ops/media-jobs.js');
  const img = image || Object.values(HOME_BUILDS).at(-1)?.[String(host).replace(/-\d+$/, '')];
  if (!img) throw Error(`quiet: no image for ${host}`);
  const r = await quietMaster(it, { T, host, image: img, stop });
  return { changed: r.changed, quiet: { ...r.record, host, at: new Date().toISOString(), ...(r.changed ? { backup: 'enhanced/unipase.prequiet.flac' } : {}) } };
}
