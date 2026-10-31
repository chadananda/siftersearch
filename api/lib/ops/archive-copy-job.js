// archive-copy ops job (planning/donor-intake-plan-20261030.md step 1): register a donor + drive and copy the drive whole into /tank/archives/<drive>.
// The source must be mounted READ-ONLY (or already be a folder on /tank). rsync at idle I/O priority; resumable (rsync skips what is there, a drain
// stops it and the job resumes). Verified by file count + bytes. Then archive-sifter catalogues the copy and archive-adopt reads it. Lane 'copy'.
import { spawn } from 'child_process';
import { readFile, readdir, lstat } from 'fs/promises';
import { join } from 'path';
import { upsertDonor, upsertDrive, getDrive, setCustody } from '../repos/archives-repo.js';

export const ARCHIVES = '/tank/archives';
const unesc = (s) => s.replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

/** The mount holding `path` (longest mount-point prefix) → { mount, ro }. `mounts` is /proc/mounts text. */
export function mountOf(path, mounts) {
  let best = null;
  for (const line of String(mounts).split('\n')) {
    const [, at, , opts] = line.split(' ');
    if (!at) continue;
    const m = unesc(at);
    if ((path === m || path.startsWith(m.endsWith('/') ? m : `${m}/`)) && (!best || m.length > best.mount.length)) best = { mount: m, ro: opts.split(',').includes('ro') };
  }
  return best;
}

/** Why this source may not be copied, or null. A donor's drive is never written: mounted read-only, or a folder already on /tank. */
export function sourceRefusal(source, mounts) {
  if (!source?.startsWith('/')) return 'source must be an absolute path';
  if (source.startsWith(`${ARCHIVES}/`)) return 'source is already inside /tank/archives';
  if (source.startsWith('/tank/')) return null;
  const m = mountOf(source, mounts);
  if (!m || m.mount === '/') return `${source} is not a mounted drive — mount it read-only (mount -o ro) first`;
  if (!m.ro) return `${m.mount} is mounted read-write — remount it read-only (mount -o remount,ro ${m.mount})`;
  return null;
}

/** Files and bytes under a folder (symlinks counted, not followed). */
export async function tally(dir) {
  let files = 0, bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const t = await tally(p); files += t.files; bytes += t.bytes; } else { files++; bytes += (await lstat(p)).size; }
  }
  return { files, bytes };
}

// rsync at idle I/O + lowest CPU priority; a drain stops it (it resumes where it left off)
function rsync(src, dest, draining) {
  return new Promise((res, rej) => {
    const p = spawn('ionice', ['-c3', 'nice', '-n19', 'rsync', '-a', '--partial', '--no-inc-recursive', `${src.replace(/\/+$/, '')}/`, `${dest}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '', stopped = false;
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    const tick = setInterval(() => { if (draining()) { stopped = true; p.kill('SIGTERM'); } }, 10_000);
    p.on('error', (e) => { clearInterval(tick); rej(e); });
    p.on('close', (code) => { clearInterval(tick); if (stopped) res('stopped'); else if (code === 0) res('done'); else rej(new Error(`rsync exit ${code}: ${err.trim().slice(-400)}`)); });
  });
}

export async function archiveCopyJob(params = {}, deps = {}) {
  const { drive, donor, donorName, label, source } = params;
  const { mounts = () => readFile('/proc/mounts', 'utf8').catch(() => ''), copy = rsync, count = tally, now = () => new Date().toISOString(),
    draining = (await import('../drain.js')).isDraining, root = ARCHIVES } = deps;
  if (!drive || !donor || !source) throw new Error('archive-copy needs drive, donor and source');
  const why = sourceRefusal(source, await mounts());
  if (why) throw new Error(why);
  const dest = join(root, drive);
  await upsertDonor({ id: donor, name: donorName || donor });
  const prev = await getDrive(drive);
  await upsertDrive({ id: drive, donor_id: donor, label, source, root: dest, status: 'copying' });
  if (!prev?.received_at) await setCustody(drive, { received_at: now() });
  if (await copy(source, dest, draining) === 'stopped') return { drive, yielded: true, resume: params };
  const [a, b] = [await count(source), await count(dest)];
  // the copy may hold MORE (earlier runs, sidecars), never less
  if (b.files < a.files || b.bytes < a.bytes) throw new Error(`copy short: source ${a.files} files / ${a.bytes} B, copy ${b.files} / ${b.bytes}`);
  const t = now();
  await setCustody(drive, { copied_at: t, verified_at: t, status: 'cataloged' });
  return { drive, dest, files: a.files, bytes: a.bytes, verified: true,
    next: `archive-sifter catalogues ${dest} within 10 min → then: ops.mjs report archive-adopt --params '{"drive":"${drive}","donor":"${donor}"}'` };
}
