#!/usr/bin/env node
// Donor-intake sampler (planning/donor-intake-plan-20261030.md step 5): claims type-'intake' jobs from tower's LAN queue on a HOME host and runs
// intake_sample.py. intake-talk → inside the worker image (ffmpeg + media_tool transcribe on the GPU, through the host's admission leases;
// the script is mounted, so no image rebuild); intake-book → on the host (pdftoppm/pdftotext/tesseract). Outputs → results/<job id>/.
// Env MEDIA_QUEUE_URL + MEDIA_QUEUE_KEY (the same env-lan as queue-agent.mjs).
// Args: --host aorus-intake --root /data/sifter-queue --image <ref> [--can intake-talk,intake-book] [--talks 1] [--books 2] [--device cuda|rocm] [--once]
import { spawn, spawnSync } from 'node:child_process';
import dns from 'node:dns';
import net from 'node:net';
dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily(false);
import { readFileSync, existsSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const { queueClient } = await import('./queue-client.mjs').catch(() => import('../../../api/lib/media/queue-client.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOST = arg('host'), ROOT = arg('root', '/data/sifter-queue'), IMAGE = arg('image'), ONCE = process.argv.includes('--once');
const CAN = arg('can', 'intake-talk,intake-book').split(',').filter(Boolean);
const SLOTS = { 'intake-talk': Number(arg('talks', 1)), 'intake-book': Number(arg('books', 2)) };
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'intake_sample.py');
const DEVICE = arg('device') || (existsSync('/dev/kfd') ? 'rocm' : spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0 ? 'cuda' : null);
const devGids = () => [...new Set(['/dev/kfd', '/dev/dri/renderD128'].filter(existsSync).map((p) => String(statSync(p).gid)))].flatMap((g) => ['--group-add', g]);
// the same GPU flags and env as queue-agent.mjs / whole-worker recording.mjs (rocm's image ENV already carries PYTHONPATH and whisper.cpp)
const ACCEL = { cuda: () => ['--gpus', 'all', '-e', 'PYTHONPATH=/opt/worker-cuda:/opt/worker-extras'], rocm: () => ['--device', '/dev/kfd', '--device', '/dev/dri', ...devGids(), '-v', `${ROOT}/cache:/cache`] };
const DOCKER = spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0 ? ['sudo', '-n', 'docker'] : ['docker'];
if (!HOST || !CAN.every((k) => k in SLOTS)) { console.error('usage: intake-agent.mjs --host <name> --image <ref> [--can intake-talk,intake-book]'); process.exit(2); }
// a talk's transcript is a GPU stage: no GPU (or no image) → this host takes books only (never ASR on CPU)
if (CAN.includes('intake-talk') && (!ACCEL[DEVICE] || !IMAGE)) { console.error(`intake-talk needs a GPU and --image (device ${DEVICE})`); process.exit(2); }
const q = queueClient({ key: process.env.MEDIA_QUEUE_KEY });
const log = (msg, x = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), host: HOST, msg, ...x }));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Map();   // job id → stage
let stopping = false;
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopping = true; log('stopping — finishing jobs in hand', { running: running.size }); });

function runner(job, dir) {
  if (job.stages[0] === 'intake-book') return spawn('python3', [SCRIPT, dir], { stdio: ['ignore', 'ignore', 'pipe'] });
  return spawn(DOCKER[0], [...DOCKER.slice(1), 'run', '--rm', '--name', `q-${job.id}`, ...ACCEL[DEVICE](), '--network', 'none', '--cpus', '4', '--memory', '8g',
    '-v', `${dir}:/job`, '-v', `${SCRIPT}:/opt/intake_sample.py:ro`, '-v', `${ROOT}/leases:/workspace/.gpu-admission`,
    '-e', 'SIFTER_GPU_LEASES=1', '-e', 'HF_HUB_OFFLINE=1', '-e', 'TRANSFORMERS_OFFLINE=1', '-e', 'NLTK_DATA=/opt/models/nltk_data', '-e', 'MEDIA_PYTHON=/opt/gate/venv/bin/python',
    '--entrypoint', '/opt/gate/venv/bin/python', IMAGE, '/opt/intake_sample.py', '/job'], { stdio: ['ignore', 'ignore', 'pipe'] });
}
// the container writes as root: docker removes what a plain rm cannot
async function scrub(dir) {
  try { await rm(dir, { recursive: true, force: true }); } catch (e) {
    if (e.code !== 'EACCES' || !IMAGE) throw e;
    await new Promise((r) => spawn(DOCKER[0], [...DOCKER.slice(1), 'run', '--rm', '--network', 'none', '-v', `${dirname(dir)}:/r`, '--entrypoint', 'rm', IMAGE, '-rf', `/r/${basename(dir)}`], { stdio: 'ignore' }).on('close', r));
  }
}

async function work(job) {
  const dir = join(ROOT, `q-${job.id}`), t0 = Date.now();
  let lost = false, child = null;
  const beat = setInterval(() => q.heartbeat({ id: job.id, lease: job.lease }).catch((e) => { if (e.status === 409 || e.status === 404) { lost = true; child?.kill('SIGTERM'); } }), 120_000);
  try {
    await scrub(dir); await mkdir(join(ROOT, 'leases'), { recursive: true }); await mkdir(join(ROOT, 'cache', 'miopen'), { recursive: true });
    for (const f of await q.list('files', job.file_id)) await q.get('files', job.file_id, f.name, join(dir, f.name));
    await writeFile(join(dir, 'job.json'), JSON.stringify(job.body));
    child = runner(job, dir);
    let tail = '';
    child.stderr.on('data', (b) => { tail = (tail + b).slice(-4000); });
    const code = await new Promise((r) => child.on('close', r));
    if (lost) throw new Error('lease lost');
    if (code || !existsSync(join(dir, 'sample.json'))) throw new Error(`exit ${code}: ${tail.slice(-2000)}`);
    const s = JSON.parse(readFileSync(join(dir, 'sample.json'), 'utf8'));
    const outputs = [];
    for (const name of ['sample.json', ...(s.files || []).filter((f) => existsSync(join(dir, f)))]) outputs.push({ name, ...(await q.put('results', job.id, name, join(dir, name), { lease: job.lease })) });
    await q.done({ id: job.id, lease: job.lease, result: { stages: { [job.stages[0]]: { ok: true, seconds: Math.round((Date.now() - t0) / 1000) } }, outputs } });
    log('done', { job: job.id, s: Math.round((Date.now() - t0) / 1000), chars: s.text?.length ?? 0 });
  } catch (e) {
    log('failed', { job: job.id, error: String(e.message).slice(-1000) });
    if (!lost) await q.fail({ id: job.id, lease: job.lease, error: `${HOST}: ${String(e.message).slice(-2000)}` }).catch(() => {});
  } finally {
    clearInterval(beat);
    await scrub(dir).catch((e) => log('cleanup failed', { job: job.id, error: e.message }));
  }
}

log('start', { can: CAN, slots: SLOTS, device: DEVICE, image: IMAGE, base: q.base });
while (!stopping || running.size) {
  const free = CAN.filter((k) => [...running.values()].filter((s) => s === k).length < SLOTS[k]);
  if (!stopping && free.length) {
    const job = await q.claim({ host: HOST, can: free, types: ['intake'] }).catch((e) => { log('claim error', { error: e.message }); return null; });
    if (job) { running.set(job.id, job.stages[0]); work(job).finally(() => running.delete(job.id)); continue; }
    if (ONCE && !running.size) break;
  }
  await nap(running.size ? 3_000 : 30_000);
}
log('exit');
