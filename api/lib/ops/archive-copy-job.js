// archive-copy ops job (planning/donor-intake-plan-20261030.md step 1): register a donor + drive and copy the drive whole into /tank/archives/<drive>.
// The source must be mounted READ-ONLY (or already be a folder on /tank). rsync at idle I/O priority, detached (a drain never stops it; the
// requeued job adopts it). Verified by file count + bytes. Then archive-sifter catalogues the copy and archive-adopt reads it. Lane 'copy'.
import { spawn } from 'child_process';
import { readFile, readdir, lstat, mkdir, writeFile, rm } from 'fs/promises';
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

// rsync runs DETACHED (own session, outlives the service; 10-31: a drain used to kill it and a 2.8 TB NTFS drive's file list alone takes 30+ min).
// <dest>.copy/ (beside the copy, not inside it) holds pid, log and status (the wrapper writes the exit code there). A drain leaves rsync running;
// the requeued job adopts the live rsync, or reads the status it left, and starts a new one only when none is alive.
const SCRIPT = 'ionice -c3 nice -n19 rsync -a --partial "$1/" "$2/" >"$3/log" 2>&1; echo $? >"$3/status.tmp" && mv "$3/status.tmp" "$3/status"';
const startRsync = (src, dest, ctl) => { const p = spawn('sh', ['-c', SCRIPT, 'sh', src.replace(/\/+$/, ''), dest, ctl], { detached: true, stdio: 'ignore' }); p.unref(); return p.pid; };
// the recorded pid is ours only while /proc/<pid>/cmdline still names rsync and this ctl dir (pids get reused)
const isOurs = async (pid, ctl) => { if (!pid) return false; const c = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0').join(' '); return c.includes('rsync') && c.includes(ctl); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'done' (rsync exit 0), 'stopped' (service draining; rsync keeps running), or throws on a failed rsync. */
export async function runRsync(src, dest, draining, io = {}) {
  const { start = startRsync, alive = isOurs, wait = sleep, pollMs = 5000 } = io;
  const ctl = `${dest}.copy`;
  await mkdir(ctl, { recursive: true });
  const text = (f) => readFile(join(ctl, f), 'utf8').catch(() => null);
  const pidOf = async () => Number((await text('pid'))?.trim()) || 0;
  // none alive and none finished while we were away: start a new one
  if (!(await alive(await pidOf(), ctl)) && await text('status') === null) {
    await rm(join(ctl, 'status.tmp'), { force: true });
    await writeFile(join(ctl, 'pid'), String(await start(src, dest, ctl)));
  }
  // adopt (or watch the one just started) until its status file appears; a drain only stops WATCHING
  for (;;) {
    const st = await text('status');
    if (st !== null) {
      const code = Number(st.trim()), tail = ((await text('log')) || '').trim().slice(-400);
      await Promise.all([rm(join(ctl, 'status'), { force: true }), rm(join(ctl, 'pid'), { force: true })]);
      if (code === 0) return 'done';
      throw new Error(`rsync exit ${code}: ${tail}`);
    }
    // it vanished without a status (killed): forget it so the retry starts a new one
    if (!(await alive(await pidOf(), ctl))) { await rm(join(ctl, 'pid'), { force: true }); throw new Error(`rsync died without an exit status: ${((await text('log')) || '').trim().slice(-400)}`); }
    if (draining()) return 'stopped';
    await wait(pollMs);
  }
}
const rsync = (src, dest, draining) => runRsync(src, dest, draining);

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
