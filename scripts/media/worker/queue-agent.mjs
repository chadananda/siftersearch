#!/usr/bin/env node
// Queue agent: claims media jobs from the edge queue (worker/queue) and runs them on THIS host — the same file on pods and home hosts (Chad 10-30:
// every machine pulls, no per-machine feed). Tower ships it beside queue-client.mjs. Env MEDIA_QUEUE_KEY (+ MEDIA_QUEUE_URL for a LAN base).
// Stage 'whole' = the image's whole-recording.mjs over a job dir (in.<ext> + job.json → item/ + result.json); outputs go back under results/<job id>/.
// Args: --host aorus --slots 4 --root /data/sifter-queue --run docker|local --image <ref> [--gpu-lock /path] [--min-avail-gb 5] [--once]
import { spawn } from 'node:child_process';
import dns from 'node:dns';
import net from 'node:net';
// Node's happy-eyeballs gives each address 250 ms — too short from home links (aorus: every fetch UND_ERR_CONNECT_TIMEOUT while curl -4 worked)
dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily(false);
import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';

const { queueClient } = await import('./queue-client.mjs').catch(() => import('../../../api/lib/media/queue-client.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOST = arg('host'), SLOTS = Number(arg('slots', 1)), ROOT = arg('root', '/data/sifter-queue'), RUN = arg('run', 'local'), IMAGE = arg('image');
const GPU_LOCK = arg('gpu-lock'), MIN_AVAIL_GB = Number(arg('min-avail-gb', 5)), ONCE = process.argv.includes('--once');
const WHOLE = '/opt/sifter/api/lib/media/whole-recording.mjs';
if (!HOST || (RUN === 'docker' && !IMAGE)) { console.error('usage: queue-agent.mjs --host <name> [--slots N] [--run docker --image <ref>|--run local]'); process.exit(2); }
const q = queueClient({ key: process.env.MEDIA_QUEUE_KEY });
const log = (msg, x = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), host: HOST, msg, ...x }));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const memAvailGb = () => { try { return Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return Infinity; } };
const running = new Map();
let stopping = false;
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopping = true; log('stopping — finishing jobs in hand', { running: running.size }); });

function runner(job, dir) {
  if (RUN === 'local') return spawn(process.execPath, [WHOLE, dir], { env: { ...process.env, SIFTER_GPU_LEASES: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  const lock = GPU_LOCK ? ['-v', `${GPU_LOCK}:/gpu.lock`, '-e', 'SIFTER_LEGACY_GPU_LOCK=/gpu.lock'] : [];
  return spawn('docker', ['run', '--rm', '--name', `q-${job.id}`, '--gpus', 'all', '--network', 'none', '--cpus', '6', '--memory', '10g', '-v', `${dir}:/job`,
    '-v', `${ROOT}/leases:/workspace/.gpu-admission`, '-e', 'SIFTER_GPU_LEASES=1', ...lock, '--entrypoint', '/usr/local/bin/node', IMAGE, WHOLE, '/job'], { stdio: ['ignore', 'ignore', 'pipe'] });
}
// the container writes as root: a plain rm then fails with EACCES (10-30: #1915 failed every retry on its own leftovers), so docker removes it
async function scrub(dir) {
  try { await rm(dir, { recursive: true, force: true }); } catch (e) {
    if (RUN !== 'docker' || e.code !== 'EACCES') throw e;
    await new Promise((r) => spawn('docker', ['run', '--rm', '--network', 'none', '-v', `${dirname(dir)}:/r`, '--entrypoint', 'rm', IMAGE, '-rf', `/r/${basename(dir)}`], { stdio: 'ignore' }).on('close', r));
    await rm(dir, { recursive: true, force: true });
  }
}
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else if (e.isFile()) out.push(p);
  }
  return out;
}

async function work(job) {
  const dir = join(ROOT, `q-${job.id}`), t0 = Date.now();
  let lost = false, child = null;
  const beat = setInterval(() => q.heartbeat({ id: job.id, lease: job.lease }).catch((e) => {
    if (e.status === 409 || e.status === 404) { lost = true; child?.kill('SIGTERM'); if (RUN === 'docker') spawn('docker', ['rm', '-f', `q-${job.id}`]); }
  }), 120_000);
  try {
    if (!job.stages.every((s) => s === 'whole')) throw new Error(`stages ${job.stages} not runnable here`);
    await scrub(dir); await mkdir(join(ROOT, 'leases'), { recursive: true });
    for (const f of await q.list('files', job.file_id)) await q.get('files', job.file_id, f.name, join(dir, f.name));
    child = runner(job, dir);
    let tail = '';
    child.stderr.on('data', (b) => { tail = (tail + b).slice(-2000); });
    const code = await new Promise((r) => child.on('close', r));
    if (lost) throw new Error('lease lost');
    if (code) throw new Error(`exit ${code}: ${tail.slice(-700)}`);
    // only what the stage produced: result.json + item/** (never the original — tower holds it)
    const files = [join(dir, 'result.json'), ...(await walk(join(dir, 'item'))).filter((p) => !relative(join(dir, 'item'), p).startsWith('original/'))];
    const outputs = [];
    for (const p of files) outputs.push({ name: relative(dir, p), ...(await q.put('results', job.id, relative(dir, p), p, { lease: job.lease })) });
    await q.done({ id: job.id, lease: job.lease, result: { stages: { whole: { ok: true, seconds: Math.round((Date.now() - t0) / 1000) } }, outputs } });
    log('done', { job: job.id, s: Math.round((Date.now() - t0) / 1000), outputs: outputs.length });
  } catch (e) {
    log('failed', { job: job.id, error: String(e.message).slice(-500) });
    if (!lost) await q.fail({ id: job.id, lease: job.lease, error: `${HOST}: ${String(e.message).slice(-900)}` }).catch(() => {});
  } finally {
    clearInterval(beat);
    await scrub(dir).catch((e) => log('cleanup failed', { job: job.id, error: e.message }));
  }
}

log('start', { slots: SLOTS, run: RUN, image: IMAGE, base: q.base });
while (!stopping || running.size) {
  if (!stopping && running.size < SLOTS && memAvailGb() >= MIN_AVAIL_GB) {
    const job = await q.claim({ host: HOST, can: ['whole'], ram_gb: memAvailGb() }).catch((e) => { log('claim error', { error: e.message }); return null; });
    if (job) { log('claimed', { job: job.id, audio_s: job.body?.invoice?.audio_s }); running.set(job.id, work(job).finally(() => running.delete(job.id))); continue; }
    if (ONCE && !running.size) break;
  }
  await nap(running.size >= SLOTS ? 10_000 : 30_000);
}
await Promise.allSettled(running.values());
log('exit');
