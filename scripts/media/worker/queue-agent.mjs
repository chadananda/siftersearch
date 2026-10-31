#!/usr/bin/env node
// Queue agent: claims media jobs from the edge queue (worker/queue) and runs them on THIS host — the same file on pods and home hosts (Chad 10-30:
// every machine pulls, no per-machine feed). Tower ships it beside queue-client.mjs. Env MEDIA_QUEUE_KEY (+ MEDIA_QUEUE_URL for a LAN base).
// KINDS (one stage per job): 'whole' = whole-recording.mjs (in.<ext> + job.json → item/ + result.json);
// restore|post|cleanup = single_restore.py (in.<ext> + work.json [+ out.flac/asr*.json] + job.json {post} → post.json + post/** + done.json).
// Device detected ONCE (/dev/kfd → rocm, nvidia-smi → cuda); no GPU → refuse to start (a GPU stage never runs on CPU). Outputs → results/<job id>/.
// Args: --host aorus --slots 4 --root /data/sifter-queue --run docker|local --image <ref> [--can whole,restore,post,cleanup] [--device cuda|rocm]
//       [--gpu-lock /path] [--min-avail-gb 5] [--once] [--idle-exit-min N]  (N min with nothing claimed or running → exit: a pod then ends itself)
// TYPED jobs (planning/stage-queue-20261031.md; contract job-types.json): --types cpu-prep,cpu-finish (preference order) claims typed jobs,
// whose cmd/outputs come from the contract. --device none is allowed only when no listed type needs a GPU (Boss: CPU work only).
// --spill cpu-prep,cpu-finish: a GPU host whose deck is full offers spare cores to those types, and the queue gives them only while that
// type's backlog is over 1 h (Aorus). --vram-mb overrides the detected VRAM (typed gpu jobs need 12 GB). Pods: --types gpu --idle-exit-min 10.
// Slots = the machine's capacity. One talk is kept on deck for the GPU (gpu-pace.mjs): the next is claimed the moment no stage is queued at GPU
// admission and no talk is still downloading/prepping toward it, so the GPU never waits on CPU stages or the network, and a GPU backlog holds claims.
import { spawn, spawnSync } from 'node:child_process';
import dns from 'node:dns';
import net from 'node:net';
// Node's happy-eyeballs gives each address 250 ms — too short from home links (aorus: every fetch UND_ERR_CONNECT_TIMEOUT while curl -4 worked)
dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily(false);
import { readFileSync, existsSync, statSync, statfsSync, readdirSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';

const { queueClient } = await import('./queue-client.mjs').catch(() => import('../../../api/lib/media/queue-client.mjs'));
import { gpuUtil, gpuLedger, reachedGpu, descends, wantAnother, cgroupMemGb, cpuSample, cpuBusy, STALL_MS, GPU_IDLE } from './gpu-pace.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOST = arg('host'), SLOTS = Number(arg('slots', 1)), ROOT = arg('root', '/data/sifter-queue'), RUN = arg('run', 'local'), IMAGE = arg('image');
const GPU_LOCK = arg('gpu-lock'), MIN_AVAIL_GB = Number(arg('min-avail-gb', 5)), GB_PER_TALK = Number(arg('gb-per-talk', 6)), DISK_PER_TALK = Number(arg('disk-gb-per-talk', 8)), ONCE = process.argv.includes('--once'), IDLE_EXIT_MS = Number(arg('idle-exit-min', 0)) * 60_000;
const CAN = arg('can', 'whole,restore,post,cleanup').split(',').filter(Boolean);
const list = (k) => (arg(k, '') || '').split(',').filter(Boolean);
const TYPES = list('types'), SPILL = list('spill'), CPUS = String(arg('cpus', 6));
const CONTRACT = (() => { for (const u of ['./job-types.json', '../../../scripts/media/worker/job-types.json']) try { return JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8')); } catch {} return null; })();
// the one place a job kind maps to what runs in the image, and what it hands back (relative to the job dir)
export const KINDS = {
  whole: { cmd: ['/usr/local/bin/node', '/opt/sifter/api/lib/media/whole-recording.mjs'], outputs: ['result.json'], tree: 'item', skip: 'original/', manifest: true },
  restore: { cmd: ['python', '/opt/sifter/media/worker/single_restore.py'], outputs: ['post.json', 'done.json'], tree: 'post' },
};
KINDS.post = KINDS.cleanup = KINDS.restore;
// a typed job's kind comes from the contract: job.json + in.<ext> + item/** in, item/** + result.json (manifest) out
export const typedKind = (type, contract = CONTRACT) => {
  const t = contract?.types?.[type];
  return t && { cmd: t.cmd, outputs: [t.outputs.result], tree: t.outputs.tree, manifest: true, needs: t.needs, typed: true };
};
const kindOf = (job) => (job.type && job.type !== 'media' ? typedKind(job.type) : KINDS[job.stages[0]]);
const NEEDS_GPU = [...TYPES, ...SPILL].some((t) => typedKind(t)?.needs === 'gpu') || !TYPES.length;   // legacy kinds all need the GPU
const DEVICE = arg('device') || (existsSync('/dev/kfd') ? 'rocm' : spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0 ? 'cuda' : null);
// rocm as the boss gate runs it (whole_gate.py): the device files' own gids (a name like 'video' resolves to another gid inside the image)
// and a host MIOpen kernel cache at /cache, so each container does not recompile
const devGids = () => [...new Set(['/dev/kfd', '/dev/dri/renderD128'].filter(existsSync).map((p) => String(statSync(p).gid)))].flatMap((g) => ['--group-add', g]);
export const ACCEL = { none: () => [], cuda: () => ['--gpus', 'all'], rocm: () => ['--device', '/dev/kfd', '--device', '/dev/dri', ...devGids(), '-v', `${ROOT}/cache:/cache`] };
// docker as this user, or through sudo -n where the user is not in the docker group (boss)
const DOCKER = RUN === 'docker' && spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0 ? ['sudo', '-n', 'docker'] : ['docker'];
const docker = (args, o) => spawn(DOCKER[0], [...DOCKER.slice(1), ...args], o);
if (!HOST || (RUN === 'docker' && !IMAGE) || CAN.some((k) => !KINDS[k]) || [...TYPES, ...SPILL].some((t) => !typedKind(t))) {
  console.error(`usage: queue-agent.mjs --host <name> [--slots N] [--can whole,restore,post,cleanup | --types ${Object.keys(CONTRACT?.types || {}).join(',')} [--spill …]] [--run docker --image <ref>|--run local] [--device cuda|rocm|none]`); process.exit(2);
}
if (!ACCEL[DEVICE] || (DEVICE === 'none' && NEEDS_GPU)) { console.error(`no GPU (device ${DEVICE}): GPU stages never run on CPU — pass --device cuda|rocm, or --device none with --types that need only CPU`); process.exit(2); }
// VRAM for the claim (typed gpu jobs declare need.vram_mb): nvidia total, or amdgpu VRAM/GTT (unified memory on Strix Halo); --vram-mb overrides
const VRAM_MB = Number(arg('vram-mb', 0)) || (() => {
  if (DEVICE === 'none') return 0;
  try {
    if (DEVICE === 'cuda') return Math.max(0, ...String(spawnSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 }).stdout).split('\n').filter(Boolean).map(Number));
    return Math.max(0, ...readdirSync('/sys/class/drm').flatMap((c) => ['mem_info_vram_total', 'mem_info_gtt_total'].map((f) => `/sys/class/drm/${c}/device/${f}`)).filter(existsSync).map((f) => Number(readFileSync(f, 'utf8')) / 1048576));
  } catch { return 0; }
})();
const q = queueClient({ key: process.env.MEDIA_QUEUE_KEY });
const log = (msg, x = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), host: HOST, msg, ...x }));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
// RAM = the smaller of /proc/meminfo and this process's cgroup (a pod's meminfo is the host's)
const meminfo = (k, d) => { try { return Number(new RegExp(`${k}:\\s+(\\d+)`).exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return d; } };
const memTotalGb = () => Math.min(meminfo('MemTotal', 10), cgroupMemGb()?.limitGb ?? Infinity);
// Each container's memory cap is the host's (85 %), not a fixed 10 GB: gpu_lease.py sums the RAM every talk's stages reserve against the
// container's own limit, so 10 GB let only one talk hold a stage at a time (10-31: boss's 2nd talk sat 8 min at grade, 92 GB VRAM free).
export const containerMemGb = (totalGb) => Math.max(10, Math.floor(totalGb * 0.85));
const memAvailGb = () => Math.min(meminfo('MemAvailable', Infinity), cgroupMemGb()?.availGb ?? Infinity);
// slots never exceed what the RAM holds: a talk's stages peak near 6 GB (grade 5.5 GB lease + process); --gb-per-talk overrides
const CAP = Math.max(1, Math.min(SLOTS, Math.floor(memTotalGb() / GB_PER_TALK)));
const running = new Map();
let stopping = false, busyAt = Date.now();
const toGpu = new Map();   // job id → { t, ns, child } for talks that have not yet reached the GPU (the deck)
// the host's shared GPU admission ledger: containers mount ROOT/leases; local runs (pods) use SIFTER_GPU_LEASE_DIR
const LEASE_DIR = RUN === 'local' && process.env.SIFTER_GPU_LEASE_DIR || join(ROOT, 'leases');
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopping = true; log('stopping — finishing jobs in hand', { running: running.size }); });

function runner(job, dir) {
  const [bin, script] = kindOf(job).cmd;
  if (RUN === 'local') return spawn(bin === 'python' || bin.endsWith('/python') ? 'python' : process.execPath, [script, dir], { env: { ...process.env, SIFTER_GPU_LEASES: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  const lock = GPU_LOCK ? ['-v', `${GPU_LOCK}:/gpu.lock`, '-e', 'SIFTER_LEGACY_GPU_LOCK=/gpu.lock'] : [];
  return docker(['run', '--rm', '--name', `q-${job.id}`, ...ACCEL[DEVICE](), '--network', 'none', '--cpus', CPUS, '--memory', `${containerMemGb(memTotalGb())}g`, '-v', `${dir}:/job`,
    '-v', `${ROOT}/leases:/workspace/.gpu-admission`, '-e', 'SIFTER_GPU_LEASES=1', ...lock, '--entrypoint', bin, IMAGE, script, '/job'], { stdio: ['ignore', 'ignore', 'pipe'] });
}
// the container writes as root: a plain rm then fails with EACCES (10-30: #1915 failed every retry on its own leftovers), so docker removes it
async function scrub(dir) {
  try { await rm(dir, { recursive: true, force: true }); } catch (e) {
    if (RUN !== 'docker' || e.code !== 'EACCES') throw e;
    await new Promise((r) => docker(['run', '--rm', '--network', 'none', '-v', `${dirname(dir)}:/r`, '--entrypoint', 'rm', IMAGE, '-rf', `/r/${basename(dir)}`], { stdio: 'ignore' }).on('close', r));
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
    if (e.status === 409 || e.status === 404) { lost = true; child?.kill('SIGTERM'); if (RUN === 'docker') docker(['rm', '-f', `q-${job.id}`]); }
  }), 120_000);
  try {
    const kind = kindOf(job);
    if (kind?.typed ? ![...TYPES, ...SPILL].includes(job.type) : job.stages.length !== 1 || !CAN.includes(job.stages[0])) throw new Error(`${job.type} ${job.stages} not runnable here`);
    await scrub(dir); await mkdir(join(ROOT, 'leases'), { recursive: true }); await mkdir(join(ROOT, 'cache', 'miopen'), { recursive: true });
    for (const f of await q.list('files', job.file_id)) await q.get('files', job.file_id, f.name, join(dir, f.name));
    if (kind.typed) {   // job.json from the job itself; the previous step's item/** from its results (inputs built by tower from its result.json)
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'job.json'), JSON.stringify({ ...job.body.job, ...(kind.needs === 'gpu' ? { device: DEVICE } : {}) }));
      for (const i of job.body.inputs || []) await q.get(i.store, i.id, i.path, join(dir, i.name));
    }
    child = runner(job, dir);
    if (toGpu.has(job.id)) toGpu.get(job.id).child = child;
    let tail = '';
    child.stderr.on('data', (b) => { tail = (tail + b).slice(-4000); });
    const code = await new Promise((r) => child.on('close', r));
    if (lost) throw new Error('lease lost');
    if (code) throw new Error(`exit ${code}: ${tail.slice(-2500)}`);
    // only what the stage produced (never the original — tower holds it); a declared output that is absent fails the job here, not at tower
    const absent = kind.outputs.filter((f) => !existsSync(join(dir, f)));
    if (absent.length) throw new Error(`stage left no ${absent.join(', ')}: ${tail.slice(-500)}`);
    // a manifest kind hands back exactly what result.json lists (tower adopts only those): working copies left in the tree never travel
    const tree = join(dir, kind.tree), files = [...kind.outputs.map((f) => join(dir, f)), ...(kind.manifest
      ? (JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')).files || []).map((f) => join(tree, f.path))
      : (await walk(tree)).filter((p) => !kind.skip || !relative(tree, p).startsWith(kind.skip)))];
    const outputs = [];
    for (const p of files) outputs.push({ name: relative(dir, p), ...(await q.put('results', job.id, relative(dir, p), p, { lease: job.lease })) });
    await q.done({ id: job.id, lease: job.lease, result: { type: job.type, host: HOST, stages: { [kind.typed ? job.type : job.stages[0]]: { ok: true, seconds: Math.round((Date.now() - t0) / 1000) } }, outputs } });
    log('done', { job: job.id, s: Math.round((Date.now() - t0) / 1000), outputs: outputs.length });
  } catch (e) {
    log('failed', { job: job.id, error: String(e.message).slice(-2500) });
    if (!lost) await q.fail({ id: job.id, lease: job.lease, error: `${HOST}: ${String(e.message).slice(-2500)}` }).catch(() => {});
  } finally {
    clearInterval(beat); toGpu.delete(job.id);
    await scrub(dir).catch((e) => log('cleanup failed', { job: job.id, error: e.message }));
  }
}

// does a ledger key belong to this talk? docker: the container's pid namespace (asked once it runs); local: a pid under the talk's process
function owner(id, d) {
  if (RUN === 'docker') {
    d.ns ||= spawnSync(DOCKER[0], [...DOCKER.slice(1), 'exec', `q-${id}`, 'readlink', '/proc/1/ns/pid'], { encoding: 'utf8', timeout: 5000 }).stdout?.trim() || null;
    return (k) => !!d.ns && k.startsWith(`${d.ns}:`);
  }
  return (k) => !!d.child?.pid && descends(k.split(':').pop(), d.child.pid);
}
function onDeck() {
  const ledger = gpuLedger(LEASE_DIR);
  for (const [id, d] of toGpu) {
    if (reachedGpu(ledger, owner(id, d))) toGpu.delete(id);
    else if (Date.now() - d.t > STALL_MS) { toGpu.delete(id); log('never reached the GPU — off the deck', { job: id, min: Math.round((Date.now() - d.t) / 60_000) }); }
  }
  return { waiting: ledger.waiting.length, heading: toGpu.size };
}

const diskFreeGb = () => { try { const f = statfsSync(ROOT); return f.bavail * f.bsize / 1073741824; } catch { return Infinity; } };
log('start', { slots: CAP, asked: SLOTS, ram_gb: Math.round(memTotalGb()), disk_gb: Math.round(diskFreeGb()), run: RUN, image: IMAGE, device: DEVICE, vram_mb: VRAM_MB,
  ...(TYPES.length ? { types: TYPES, spill: SPILL, contract: CONTRACT?.contract } : { can: CAN }), base: q.base });
const claimArgs = (spillOnly = false) => ({ host: HOST, ram_gb: memAvailGb(), vram_mb: VRAM_MB,
  ...(TYPES.length ? { types: TYPES, spill: SPILL, spill_only: spillOnly, contract: CONTRACT?.contract } : { can: CAN }) });
let spillAt = 0;
const gpuSeen = [];   // GPU utilisation over the last minute: idle + nothing queued at it → ramp one more talk into CPU prep
let claimedAt = 0;
const cpuSeen = [];   // CPU samples over the last ~2 min: a full CPU holds claims (the GPU-feeding stages would only slow)
while (!stopping || running.size) {
  const deck = onDeck(), c = cpuSample();
  if (c) { cpuSeen.push({ t: Date.now(), ...c }); while (cpuSeen.length > 2 && Date.now() - cpuSeen[1].t > 120_000) cpuSeen.shift(); }
  const cpu = cpuSeen.length > 1 ? cpuBusy(cpuSeen) : null, util = running.size && DEVICE !== 'none' ? gpuUtil(DEVICE) : null;
  if (util != null) { gpuSeen.push({ t: Date.now(), util }); while (gpuSeen.length && Date.now() - gpuSeen[0].t > 60_000) gpuSeen.shift(); }
  const gpuIdle = gpuSeen.length >= 6 && Date.now() - gpuSeen[0].t >= 50_000 && gpuSeen.every((g) => g.util < GPU_IDLE);
  const want = !stopping && wantAnother({ running: running.size, cap: CAP, onDeck: deck.waiting + deck.heading, waiting: deck.waiting, memGb: memAvailGb(), minGb: MIN_AVAIL_GB, cpu,
    gpuIdle, sinceClaimMs: Date.now() - claimedAt, diskGb: diskFreeGb(), minDiskGb: DISK_PER_TALK })
    // CPU-only work: one claim a minute while busy, so the CPU sample sees each job's load before the next
    && (NEEDS_GPU || !running.size || Date.now() - claimedAt >= 60_000);
  // the GPU deck is full but cores are spare: offer them to the spill types (the queue gives one only while that backlog is over 1 h)
  const spare = !want && !stopping && SPILL.length && running.size < CAP && memAvailGb() >= MIN_AVAIL_GB + GB_PER_TALK && diskFreeGb() >= DISK_PER_TALK
    && cpu != null && cpu < 0.6 && Date.now() - spillAt >= 60_000;
  if (want || spare) {
    if (spare) spillAt = Date.now();
    const job = await q.claim(claimArgs(!!spare)).catch((e) => { log('claim error', { error: e.message }); return null; });
    if (job) {
      if (kindOf(job)?.needs !== 'cpu') toGpu.set(job.id, { t: Date.now() });   // only GPU-bound work sits on the GPU deck
      claimedAt = Date.now();
      log('claimed', { job: job.id, type: job.type, spill: !!spare, audio_s: job.body?.invoice?.audio_s, running: running.size, gpu_waiting: deck.waiting, gpu_util: util, gpu_idle: gpuIdle, disk_gb: Math.round(diskFreeGb()), cpu: cpu == null ? null : Math.round(cpu * 100) });
      running.set(job.id, work(job).finally(() => { running.delete(job.id); busyAt = Date.now(); }));
      continue;
    }
    if (ONCE && !running.size) break;
    if (IDLE_EXIT_MS && !running.size && Date.now() - busyAt > IDLE_EXIT_MS) { log('idle — exiting', { idle_min: IDLE_EXIT_MS / 60_000 }); break; }
  }
  await nap(running.size ? 5_000 : 30_000);   // while working, look at the GPU deck every 5 s
}
await Promise.allSettled(running.values());
log('exit');
