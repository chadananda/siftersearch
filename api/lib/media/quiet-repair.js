// Silence-only repair of a PUBLISHED remaster (Chad 10-30: "no way to repair the already processed audio without full reprocessing?"): the kept master
// (enhanced/unipase.flac) + its word timings go to a home host over the LAN, quiet.py fades the word-free stretches there, the silenced master comes back
// (the old one kept as unipase.prequiet.flac). Tower only moves files; the web copies are re-encoded by the media-item redo (worker pool). Deps: tools.js
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { hostProfile } from './tools.js';

export const QUIET_REPAIR_VERSION = 1;
const q = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";
const QUIET_PY = '/opt/sifter/media/worker/quiet.py';
// the container script: silence, then measure both files' (rate, channels, duration) with quiet.probe so tower can check the copy is the same length
export const RUN_SH = `set -e
python ${QUIET_PY} /job/in.flac /job/work.json /job/realign.json /job/out.flac > /job/report.json.tmp
python -c "import sys,json,os;sys.path.insert(0,'/opt/sifter/media/worker');import quiet;print(json.dumps({'in':quiet.probe('/job/in.flac'),'out':quiet.probe('/job/out.flac') if os.path.exists('/job/out.flac') else None}))" > /job/probe.json
mv /job/report.json.tmp /job/report.json
`;

/** The meta.remaster.quiet record from a quiet.py report. Pure. */
export function quietRecord(rep, extra = {}) {
  return { v: QUIET_REPAIR_VERSION, quiet_s: rep.quiet_s ?? 0, stretches: rep.stretches ?? 0, noise_silenced_s: rep.loud_s ?? 0,
    voiced_kept_s: Math.round((rep.voiced_kept || []).reduce((a, [s, e]) => a + (e - s), 0) * 10) / 10, ...extra };
}

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
  const prof = hostProfile(host), root = prof.root, docker = prof.docker;
  if (prof.transport === 'gate') throw Error(`${host}: gate transport takes no quiet jobs; use a docker host`);
  const name = `quiet-${it.id}-${s0.size.toString(36)}-${Math.round(s0.mtimeMs).toString(36)}`, remote = `${root}/${name}`;
  const run = (cmd, opts = {}) => T.run('ssh', [host, cmd], { timeoutMs: 120000, stop, ...opts });
  const put = (file, to) => T.run('rsync', ['-a', '--partial', '--protect-args', file, `${host}:${to}`], { timeoutMs: 900000, stop });
  const get = (from, to) => T.run('rsync', ['-a', '--partial', '--protect-args', `${host}:${from}`, to], { timeoutMs: 900000, stop });
  const state = async () => JSON.parse((await run(`${docker} inspect ${q(name)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
  await run(`mkdir -p ${q(remote)}; ${docker} image inspect ${q(image)} >/dev/null`);
  if (!await state()) {
    await put(master, remote + '/in.flac'); await put(work, remote + '/work.json'); await put(realign, remote + '/realign.json');
    await run(`cat > ${q(remote + '/run.sh')}`, { input: RUN_SH });
    // CPU only, small: started only while the host keeps 4 GB free (aorus runs the restore containers beside it)
    const launch = `if [ "$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)" -ge 4 ]; then ${docker} run -d --name ${q(name)} --network none --cpus 2 --memory 3g -e CUDA_VISIBLE_DEVICES= -v ${q(remote + ':/job')} --entrypoint sh ${q(image)} /job/run.sh; fi`;
    while (!await state()) {
      if (stop()) { const e = Error('Awaiting quiet slot'); e.code = 'DRAIN'; throw e; }
      await run(`flock -x ${q(root + '/dispatch.lock')} bash -c ${q(launch)}`);
      if (!await state()) await nap(15000);
    }
  }
  while (true) {
    if (stop()) { const e = Error('quiet continues on the host'); e.code = 'DRAIN'; throw e; }
    const s = await state(); if (!s) throw Error('quiet container disappeared');
    if (!s.Running) { if (s.ExitCode) throw Error(`quiet exited ${s.ExitCode}: ` + (await run(`${docker} logs --tail 6 ${q(name)} 2>&1`)).stdout.slice(-600)); break; }
    await nap(5000);
  }
  const report = JSON.parse((await run(`cat ${q(remote + '/report.json')}`)).stdout);
  const probe = JSON.parse((await run(`cat ${q(remote + '/probe.json')}`)).stdout);
  const cleanup = () => run(`${docker} rm -f ${q(name)} >/dev/null 2>&1; rm -rf ${q(remote)}`).catch(() => {});
  if (!report.stretches || !probe.out) { await cleanup(); return { changed: false, report, record: quietRecord(report) }; }
  const bad = probeMismatch(probe);
  if (bad) throw Error(`quiet output rejected: ${bad}`);
  const staged = join(enh, 'unipase.quiet.flac');
  await get(remote + '/out.flac', staged);
  const s1 = await fs.stat(master);
  if (s1.size !== s0.size || s1.mtimeMs !== s0.mtimeMs) { await fs.rm(staged, { force: true }); throw Error('master changed while it was being silenced'); }
  if ((await fs.stat(staged)).size < 1e4) throw Error('silenced copy came back empty');
  await fs.rename(master, join(enh, 'unipase.prequiet.flac'));   // rollback: rename it back and redo web/trim/update
  await fs.rename(staged, master);
  await cleanup();
  return { changed: true, report, record: quietRecord(report) };
}
