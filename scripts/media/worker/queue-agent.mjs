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
import { readFileSync, existsSync, statSync, statfsSync, readdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';

const { queueClient } = await import('./queue-client.mjs').catch(() => import('../../../api/lib/media/queue-client.mjs'));
import { gpuUtil, gpuLedger, reachedGpu, descends, wantAnother, cgroupMemGb, cpuSample, cpuBusy, nextDepth, STALL_MS, GPU_IDLE } from './gpu-pace.mjs';
import { cgroupOf, slicePath, readCgroup, track, summary, loadProfiles, saveProfiles, record, profileOf, memPressure, admitCpu, cpuAllowed, stallOf, windowCores, busyWindow } from './cpu-pace.mjs';
import { gpuStats, jobProgress, snapshot, compact, serveHealth, ringPush, ringSave, ringLoad, lastWords, holdAgentLock } from './health.mjs';
import { cpus } from 'node:os';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOST = arg('host'), SLOTS = Number(arg('slots', 1)), ROOT = arg('root', '/data/sifter-queue'), RUN = arg('run', 'local'), IMAGE = arg('image');
const GPU_LOCK = arg('gpu-lock'), MIN_AVAIL_GB = Number(arg('min-avail-gb', 5)), GB_PER_TALK = Number(arg('gb-per-talk', 6)), DISK_PER_TALK = Number(arg('disk-gb-per-talk', 8)), ONCE = process.argv.includes('--once'), IDLE_EXIT_MS = Number(arg('idle-exit-min', 0)) * 60_000;
const CAN = arg('can', 'whole,restore,post,cleanup').split(',').filter(Boolean);
const list = (k) => (arg(k, '') || '').split(',').filter(Boolean);
const SPILL = list('spill'), CPUS = String(arg('cpus', 6)), PROFILE = arg('profile');
// --cpu-slots N: a hard ceiling on CPU-typed jobs at once, whatever the measurement admits. 11-03 aorus ran 9 cpu-prep (6 cores each, 24-core box)
// beside 2 UniPASE jobs; the RTX 3070 fell off the bus (Xid 79) and the box needed a reboot. A shared desktop gets a ceiling.
const CPU_SLOTS = Number(arg('cpu-slots', Infinity));
// --cgroup-parent <system slice>: dockerd starts containers outside the agent's own cgroup, so a host that caps its bulk work (tower: Chad 10-31,
// cpu-finish only, in sifter-bulk.slice) names the slice and every job container lands in it
export const CGROUP = arg('cgroup-parent');
const CONTRACT = (() => { for (const u of ['./job-types.json', '../../../scripts/media/worker/job-types.json']) try { return JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8')); } catch {} return null; })();
// --profile gpu | cpu+llm | llm (contract `profiles`, = PROFILES in api/lib/media/stages.js): the claim types are the contract's types whose
// `needs` (class) the profile takes, in contract order. --types is the explicit alias and wins when given.
export const profileTypes = (p, contract = CONTRACT) => (contract?.profiles?.[p] ? Object.keys(contract.types || {}).filter((t) => contract.profiles[p].includes(contract.types[t].needs)) : null);
const TYPES = list('types').length ? list('types') : PROFILE ? profileTypes(PROFILE) || [] : [];
if (PROFILE && !list('types').length && !TYPES.length) { console.error(`--profile ${PROFILE}: ${CONTRACT?.profiles?.[PROFILE] ? 'no queued job type takes it (llm jobs run in tower\'s feed pool)' : `unknown (${Object.keys(CONTRACT?.profiles || {}).filter((k) => k !== '_').join(' | ')})`}`); process.exit(2); }
// --types/--profile with an explicit --can = the switch-over: typed jobs first, legacy whole jobs ('media') when none is queued
const MIXED = TYPES.length > 0 && process.argv.includes('--can');
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
const NEEDS_GPU = [...TYPES, ...SPILL].some((t) => typedKind(t)?.needs === 'gpu') || !TYPES.length || MIXED;   // legacy kinds all need the GPU
const DEVICE = arg('device') || (existsSync('/dev/kfd') ? 'rocm' : spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0 ? 'cuda' : null);
// rocm as the boss gate runs it (whole_gate.py): the device files' own gids (a name like 'video' resolves to another gid inside the image)
// and a host MIOpen kernel cache at /cache, so each container does not recompile
const devGids = () => [...new Set(['/dev/kfd', '/dev/dri/renderD128'].filter(existsSync).map((p) => String(statSync(p).gid)))].flatMap((g) => ['--group-add', g]);
export const ACCEL = { none: () => [], cuda: () => ['--gpus', 'all'], rocm: () => ['--device', '/dev/kfd', '--device', '/dev/dri', ...devGids(), '-v', `${ROOT}/cache:/cache`] };
// docker as this user, or through sudo -n where the user is not in the docker group (boss)
const DOCKER = RUN === 'docker' && spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0 ? ['sudo', '-n', 'docker'] : ['docker'];
const docker = (args, o) => spawn(DOCKER[0], [...DOCKER.slice(1), ...args], o);
if (!HOST || (RUN === 'docker' && !IMAGE) || CAN.some((k) => !KINDS[k]) || [...TYPES, ...SPILL].some((t) => !typedKind(t))) {
  console.error(`usage: queue-agent.mjs --host <name> [--slots N] [--can whole,restore,post,cleanup | --profile gpu|cpu+llm|llm | --types ${Object.keys(CONTRACT?.types || {}).join(',')} [--spill …]] [--run docker --image <ref>|--run local] [--device cuda|rocm|none]`); process.exit(2);
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
// on the cloud queue (R2) no FLAC/WAV is ever stored (Chad 10-31): a listed decoded file stays on the worker; the next step rebuilds it
// (enhanced/light.flac from enh_ck.m0; stage-jobs REBUILT, the only one validateTyped lets go missing)
const cloudSkips = (path, base = q.base) => /^https:/.test(base || '') && /\.(flac|wav)$/i.test(path);
const T = await import('./transit.mjs').catch(() => null);   // cloudManifest: listed FLAC/WAV → Opus transit
const logTail = [];   // the last log lines, for the last words
const log = (msg, x = {}) => { const l = JSON.stringify({ at: new Date().toISOString(), host: HOST, msg, ...x }); console.log(l); logTail.push(l); if (logTail.length > 100) logTail.shift(); };
let wake = null;   // a stop signal ends the current nap: the drain starts at once
const nap = (ms) => new Promise((r) => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
// RAM = the smaller of /proc/meminfo and this process's cgroup (a pod's meminfo is the host's)
const meminfo = (k, d) => { try { return Number(new RegExp(`${k}:\\s+(\\d+)`).exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1048576; } catch { return d; } };
// --cgroup-parent: the slice the job containers share is the scope measured (tower: sifter-bulk.slice, 16 cores, 20 GB), not the whole box
const SCOPE = CGROUP ? (f) => readFileSync(f.replace(/^\/sys\/fs\/cgroup\//, `${slicePath(CGROUP)}/`), 'utf8') : () => { throw new Error('no scope'); };
const memTotalGb = () => Math.min(meminfo('MemTotal', 10), cgroupMemGb()?.limitGb ?? Infinity, cgroupMemGb(SCOPE)?.limitGb ?? Infinity);
// Each container's memory cap is the host's (85 %), not a fixed 10 GB: gpu_lease.py sums the RAM every talk's stages reserve against the
// container's own limit, so 10 GB let only one talk hold a stage at a time (10-31: boss's 2nd talk sat 8 min at grade, 92 GB VRAM free).
export const containerMemGb = (totalGb) => Math.max(10, Math.floor(totalGb * 0.85));
const memAvailGb = () => Math.min(meminfo('MemAvailable', Infinity), cgroupMemGb()?.availGb ?? Infinity, cgroupMemGb(SCOPE)?.availGb ?? Infinity);
// slots never exceed what the RAM holds: a talk's stages peak near 6 GB (grade 5.5 GB lease + process); --gb-per-talk overrides
const CAP = Math.max(1, Math.min(SLOTS, Math.floor(memTotalGb() / GB_PER_TALK)));
const running = new Map();
// what each job in hand is doing (for /health and the CPU admission): { type, item, needs, started_at, phase fetch|run|put, dir, cg, m }
const jobs = new Map();
// CPU job types are admitted by measurement (cpu-pace.mjs) where each job runs in its own container cgroup (docker); local runs keep --slots
const CPU_TYPES = TYPES.filter((t) => typedKind(t)?.needs === 'cpu');
const ADAPT = RUN === 'docker' && CPU_TYPES.length > 0;
const PROFILE_FILE = join(ROOT, 'cpu-profile.json');
let profiles = loadProfiles(PROFILE_FILE), lastError = null;
const prof = (t) => profileOf(profiles, t, { peakGb: GB_PER_TALK, cores: Number(CPUS) });
const pressure = () => memPressure(CGROUP ? SCOPE : undefined, CGROUP ? '/sys/fs/cgroup/memory.pressure' : undefined);
let stopping = false, busyAt = Date.now();
const toGpu = new Map();   // job id → { t, ns, child } for talks that have not yet reached the GPU (the deck)
// the host's shared GPU admission ledger: containers mount ROOT/leases; local runs (pods) use SIFTER_GPU_LEASE_DIR
const LEASE_DIR = RUN === 'local' && process.env.SIFTER_GPU_LEASE_DIR || join(ROOT, 'leases');
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopping = true; log('stopping — finishing jobs in hand', { running: running.size }); wake?.(); });

function runner(job, dir) {
  const [bin, script] = kindOf(job).cmd;
  if (RUN === 'local') return spawn(bin === 'python' || bin.endsWith('/python') ? 'python' : process.execPath, [script, dir], { env: { ...process.env, SIFTER_GPU_LEASES: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  // CPU jobs get no GPU flags: a wedged driver (aorus 11-03, nvml error) must not fail cpu-prep in docker's prestart hook
  const lock = GPU_LOCK ? ['-v', `${GPU_LOCK}:/gpu.lock`, '-e', 'SIFTER_LEGACY_GPU_LOCK=/gpu.lock'] : [];
  return docker(['run', '--rm', '--name', `q-${job.id}`, ...(CGROUP ? ['--cgroup-parent', CGROUP] : []), ...(kindOf(job).needs === 'gpu' ? ACCEL[DEVICE]() : []), '--network', 'none', '--cpus', CPUS, '--memory', `${containerMemGb(memTotalGb())}g`, '-v', `${dir}:/job`,
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
// ffmpeg where the job ran (the image on a docker host, the pod's own on a local run); paths relative to the job dir
function ffmpegIn(dir, args) {
  const p = RUN === 'docker'
    ? docker(['run', '--rm', '--network', 'none', '-v', `${dir}:/job`, '--entrypoint', 'ffmpeg', IMAGE, ...args.map((a) => a.startsWith('item/') ? `/job/${a}` : a)], { stdio: ['ignore', 'ignore', 'pipe'] })
    : spawn('ffmpeg', args.map((a) => a.startsWith('item/') ? join(dir, a) : a), { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (b) => { err = (err + b).slice(-1000); });
  return new Promise((ok, no) => p.on('close', (c) => (c ? no(new Error(`transit ffmpeg exit ${c}: ${err}`)) : ok())));
}
// the paths (under item/) a manifest result hands back. Cloud base: no FLAC/WAV ever (Chad 10-31) — a REBUILT file stays here, any other
// decoded file goes as an Opus transit listed { path: <x>.transit.ogg, sha256, transit_of: <x> }; result.json is rewritten to match.
async function cloudManifest(dir, tree) {
  const rf = join(dir, 'result.json'), r = JSON.parse(readFileSync(rf, 'utf8')), files = r.files || [];
  const cloud = cloudSkips('x.flac');
  if (!cloud) return files.map((f) => f.path);
  if (!T) throw new Error('transit.mjs missing beside queue-agent.mjs: refusing to send a decoded file to the cloud');
  const { send, transit } = T.cloudPlan(files, { cloud });
  for (const t of transit) {
    await ffmpegIn(dir, T.transitArgs(`item/${t.of}`, `item/${t.path}`));
    const i = files.findIndex((f) => f.path === t.of);
    files[i] = { path: t.path, sha256: await sha256(join(tree, t.path)), transit_of: t.of, transit: T.TRANSIT };
  }
  if (transit.length) await writeFile(rf, JSON.stringify({ ...r, files }));
  return send;
}
async function sha256(file) { const h = createHash('sha256'); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); }
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
  const info = { type: job.type && job.type !== 'media' ? job.type : job.stages?.[0], item: job.body?.job?.id ?? job.item_id ?? null, needs: kindOf(job)?.needs || 'gpu',
    started_at: t0, phase: 'fetch', dir, cg: null, m: null, audio_s: job.body?.invoice?.audio_s ?? null };
  jobs.set(job.id, info);
  const at = {};   // phase timings: where a job's time goes (fetch = inputs in, run = the container, put = outputs out)
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
    at.run = Date.now(); info.phase = 'run';
    child = runner(job, dir);
    if (toGpu.has(job.id)) toGpu.get(job.id).child = child;
    let tail = '';
    child.stderr.on('data', (b) => { tail = (tail + b).slice(-4000); });
    const code = await new Promise((r) => child.on('close', r));
    at.put = Date.now(); info.phase = 'put';
    sampleJob(job.id, info);   // the last reading before docker removes the container (--rm)
    const meas = summary(info.m);
    if (lost) throw new Error('lease lost');
    if (code) throw new Error(`exit ${code}: ${tail.slice(-2500)}`);
    if (meas) { profiles = record(profiles, info.type, meas); saveProfiles(PROFILE_FILE, profiles); }
    // only what the stage produced (never the original — tower holds it); a declared output that is absent fails the job here, not at tower
    const absent = kind.outputs.filter((f) => !existsSync(join(dir, f)));
    if (absent.length) throw new Error(`stage left no ${absent.join(', ')}: ${tail.slice(-500)}`);
    // a manifest kind hands back exactly what result.json lists (tower adopts only those): working copies left in the tree never travel
    const tree = join(dir, kind.tree), files = [...kind.outputs.map((f) => join(dir, f)), ...(kind.manifest
      ? (await cloudManifest(dir, tree)).map((p) => join(tree, p))
      : (await walk(tree)).filter((p) => (!kind.skip || !relative(tree, p).startsWith(kind.skip)) && !cloudSkips(p)))];
    const outputs = [];
    for (const p of files) outputs.push({ name: relative(dir, p), ...(await q.put('results', job.id, relative(dir, p), p, { lease: job.lease })) });
    const s = (a, b) => Math.round((b - a) / 1000);
    const timing = { fetch_s: s(t0, at.run), run_s: s(at.run, at.put), put_s: s(at.put, Date.now()), ...(meas ? { peak_gb: +meas.peakGb.toFixed(2), cores: +meas.cores.toFixed(2) } : {}) };
    await q.done({ id: job.id, lease: job.lease, result: { type: job.type, host: HOST, stages: { [kind.typed ? job.type : job.stages[0]]: { ok: true, seconds: Math.round((Date.now() - t0) / 1000), ...timing } }, outputs } });
    log('done', { job: job.id, type: info.type, s: Math.round((Date.now() - t0) / 1000), ...timing, audio_s: info.audio_s, outputs: outputs.length });
  } catch (e) {
    log('failed', { job: job.id, error: String(e.message).slice(-2500) });
    if (kindOf(job)?.needs === 'gpu' && GPU_GONE.test(e.message) && !gpuLostAt) { gpuLostAt = Date.now(); log('gpu lost — no GPU claims until nvidia-smi answers', { error: String(e.message).slice(-300) }); }
    lastError = { at: Date.now(), job: job.id, msg: String(e.message).slice(-500) };
    if (!lost) await q.fail({ id: job.id, lease: job.lease, error: `${HOST}: ${String(e.message).slice(-2500)}` }).catch(() => {});
  } finally {
    clearInterval(beat); toGpu.delete(job.id); jobs.delete(job.id);
    await scrub(dir).catch((e) => log('cleanup failed', { job: job.id, error: e.message }));
  }
}

// a running docker job's own cgroup, read every loop pass: its RAM peak and cores (cpu-pace.mjs). The container's pid comes from docker once it runs.
function sampleJob(id, info) {
  if (RUN !== 'docker' || info.phase !== 'run' && info.phase !== 'put') return;
  if (!info.cg && info.phase === 'run') {
    const pid = Number(spawnSync(DOCKER[0], [...DOCKER.slice(1), 'inspect', '-f', '{{.State.Pid}}', `q-${id}`], { encoding: 'utf8', timeout: 5000 }).stdout?.trim());
    info.cg = pid > 0 ? cgroupOf(pid) : null;
  }
  const now = Date.now();
  info.m = track(info.m, readCgroup(info.cg), now);
  if (info.phase !== 'run') { info.stall = null; return; }
  // a stalled job: ~0 CPU over a full window and no progress (stallOf) — reported on /health and logged once, never killed here
  const pr = jobProgress(info.dir, info.type, CONTRACT), was = info.stall?.since;
  info.stall = stallOf(info.stall, { cores: windowCores(info.m, now), progress: `${pr.stage}|${pr.stage_at}` }, now);
  if (info.stall.since && !was) { lastError = { at: now, msg: `job ${id} stalled: ~0 CPU, no progress at ${pr.stage || 'start'}` }; log('job stalled', { id, type: info.type, stage: pr.stage, stage_at: pr.stage_at }); }
  if (!info.stall.since && was) log('job moving again', { id, stalled_s: Math.round((now - was) / 1000) });
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
  ...(TYPES.length ? { types: TYPES, spill: SPILL, contract: CONTRACT?.contract } : {}), ...(!TYPES.length || MIXED ? { can: CAN } : {}), base: q.base });
// types: the subset this claim may take (adaptive CPU admission + the GPU deck), in --types order
const claimArgs = (spillOnly = false, types = TYPES) => ({ host: HOST, ram_gb: memAvailGb(), vram_mb: VRAM_MB,
  ...(TYPES.length ? { types: MIXED ? [...types, 'media'] : types, spill: SPILL, spill_only: spillOnly, contract: CONTRACT?.contract } : {}),
  ...(!TYPES.length || MIXED ? { can: CAN } : {}) });
let spillAt = 0, fitWhy = null;
// the CPU jobs in hand as the admission sees them: a job still fetching counts at its full profile (it has not started to load the CPU yet)
// and a running one counts in busy only for the share of busy's window it has run (seen), so a claim need not wait for the window to catch up
const cpuInputs = (cpu, c) => { const bw = busyWindow(cpuSeen); return { prof, running: [...jobs.values()].filter((j) => j.needs === 'cpu').map((j) => ({ type: j.type, memGb: j.m?.memGb ?? 0, cores: j.m?.cores ?? null, seen: bw ? bw.seen(j.m?.t0) : 0, done: j.phase === 'put' })),
  busy: cpu, allowed: c?.cores ?? cpus().length, availGb: memAvailGb(), marginGb: MIN_AVAIL_GB, slots: SLOTS, pressure: pressure() }; };
/** The CPU types one more job of which fits now; each change of the reasons for holding is logged. */
function fitCpu(cpu, c) {
  const a = cpuInputs(cpu, c), out = [], why = {};
  for (const t of CPU_TYPES) { const r = admitCpu({ ...a, type: t }); if (r.ok) out.push(t); else why[t] = r.why; }
  const w = JSON.stringify(why);
  if (w !== fitWhy) { fitWhy = w; if (Object.keys(why).length) log('cpu hold', { ...why, running: a.running.length }); }
  return out;
}
// GET /health (health.mjs) + the snapshot ring + the last words. --health-port N (default env MEDIA_HEALTH_PORT or 8788; 0 = off; never with --once)
function startHealth() {
  const port = ONCE ? 0 : Number(arg('health-port', process.env.MEDIA_HEALTH_PORT || 8788)), startedAt = Date.now(), ringFile = join(ROOT, 'health-ring.jsonl');
  const version = createHash('sha256').update(['queue-agent.mjs', 'gpu-pace.mjs', 'cpu-pace.mjs', 'health.mjs'].map((f) => { try { return readFileSync(new URL(`./${f}`, import.meta.url)); } catch { return ''; } }).join('|')).digest('hex').slice(0, 12);
  // the image this machine runs: pods are told by tower (SIFTER_IMAGE, the accepted ref@digest); a docker host asks docker once
  const image = process.env.SIFTER_IMAGE || (RUN === 'docker' && IMAGE ? (spawnSync(DOCKER[0], [...DOCKER.slice(1), 'image', 'inspect', '-f', '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}', IMAGE], { encoding: 'utf8', timeout: 10_000 }).stdout?.trim() || IMAGE) : null);
  const role = /^pod-/.test(HOST) ? 'pod' : /^cpupod-/.test(HOST) ? 'cpupod' : HOST === 'tower' ? 'tower' : 'home';
  let ring = ringLoad(ringFile), ringAt = 0;
  const get = () => {
    const now = Date.now(), c = cpuSeen.at(-1), cpu = cpuSeen.length > 1 ? cpuBusy(cpuSeen) : null, ji = [...jobs.entries()];
    const allowed = ADAPT ? cpuAllowed(CPU_TYPES, cpuInputs(cpu, c)) : {};
    const types = TYPES.length ? [...new Set([...TYPES, ...SPILL])] : CAN;
    const slots = Object.fromEntries(types.map((t) => [t, { used: ji.filter(([, j]) => j.type === t).length, allowed: allowed[t] ?? CAP }]));
    let df = null; try { const f = statfsSync(ROOT); df = { free: f.bavail * f.bsize / 1073741824, total: f.blocks * f.bsize / 1073741824 }; } catch {}
    return snapshot({ now, host: HOST, role, image, version, pid: process.pid, startedAt, stopping, queue: q.base,
      cpu, cores: c?.cores ?? cpus().length, cpuScope: CGROUP ? `slice ${CGROUP}` : 'host', ramTotalGb: memTotalGb(), ramAvailGb: memAvailGb(), pressure: pressure(),
      gpu: DEVICE === 'none' ? null : gpuStats(DEVICE), diskFreeGb: df?.free, diskTotalGb: df?.total, diskPath: ROOT, slots,
      jobs: ji.map(([id, j]) => ({ id, item: j.item, type: j.type, phase: j.phase, ...(j.phase === 'run' ? jobProgress(j.dir, j.type, CONTRACT) : { stage: null, pct: null }),
        started_at: j.started_at, audio_s: j.audio_s, stalled_s: j.stall?.since ? Math.round((now - j.stall.since) / 1000) : null, rss_gb: j.m ? +j.m.memGb.toFixed(2) : null, peak_gb: j.m ? +j.m.peakGb.toFixed(2) : null, cores: j.m?.cores == null ? null : +j.m.cores.toFixed(2) })),
      profiles: Object.fromEntries(types.filter((t) => typedKind(t)).map((t) => { const p = prof(t); return [t, { peak_gb: +p.peakGb.toFixed(2), cores: +p.cores.toFixed(2), runs: p.n, measured: p.measured }]; })),
      lastError });
  };
  const srv = port > 0 && process.env.MEDIA_QUEUE_KEY ? serveHealth({ port, key: process.env.MEDIA_QUEUE_KEY, get, onError: (e) => log('health port error', { port, error: e.message }) }) : null;
  srv?.unref();
  if (srv) log('health', { port });
  return {
    get,
    tick() { if (Date.now() - ringAt < 60_000) return; ringAt = Date.now(); try { ring = ringPush(ring, compact(get())); ringSave(ringFile, ring); } catch (e) { log('health ring error', { error: e.message }); } },
    // the last words (Chad 10-31: "log the health polls so we can reconstruct what went wrong"): pushed to the queue as the agent exits
    async last(reason) {
      try { ring = ringPush(ring, compact(get())); ringSave(ringFile, ring); } catch {}
      const words = lastWords({ host: HOST, reason, now: Date.now(), ring, lines: logTail });
      await Promise.race([q.call('last-words', words), nap(10_000)]).catch((e) => console.log(JSON.stringify({ msg: 'last words not sent', error: e.message })));
      srv?.close();
    },
  };
}
const gpuSeen = [];   // GPU utilisation over the last minute: idle + nothing queued at it → ramp one more talk into CPU prep
// a lost GPU (driver error, Xid 79 'fallen off the bus') claims no GPU work — every claim would fail and requeue — until the probe answers again
const GPU_GONE = /nvml error|fallen off the bus|NVIDIA-SMI has failed|no CUDA-capable device|CUDA error: unknown error|hipErrorNoDevice/i;
let gpuLostAt = 0, gpuProbeAt = 0;
const gpuBack = () => DEVICE !== 'cuda' || spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore', timeout: 20_000 }).status === 0;
let claimedAt = 0, depth = 1, depthAt = 0;   // depth: talks kept on the GPU deck, learned from starvation (gpu-pace nextDepth)
const cpuSeen = [];   // CPU samples over the last ~2 min: a full CPU holds claims (the GPU-feeding stages would only slow)
// one agent per root: a second start refuses (a swap drains the old agent first, so the lock is free by then)
const lock = ONCE ? null : (await mkdir(ROOT, { recursive: true }).catch(() => {}), holdAgentLock(join(ROOT, 'queue-agent.pid')));
if (lock && !lock.ok) { console.error(`another queue agent (pid ${lock.pid}) already runs on ${ROOT}: refusing to start a second`); process.exit(3); }
process.on('exit', () => lock?.release());
const health = startHealth();
process.on('uncaughtException', async (e) => { log('crash', { error: String(e.stack || e).slice(0, 2000) }); await health.last(`crash: ${e.message}`); process.exit(1); });
while (!stopping || running.size) {
  for (const [id, info] of jobs) sampleJob(id, info);
  const deck = onDeck(), c = CGROUP ? cpuSample(SCOPE) : cpuSample();
  if (c) { cpuSeen.push({ t: Date.now(), ...c }); while (cpuSeen.length > 2 && Date.now() - cpuSeen[1].t > 120_000) cpuSeen.shift(); }
  const cpu = cpuSeen.length > 1 ? cpuBusy(cpuSeen) : null, util = running.size && DEVICE !== 'none' ? gpuUtil(DEVICE) : null;
  if (util != null) { gpuSeen.push({ t: Date.now(), util }); while (gpuSeen.length && Date.now() - gpuSeen[0].t > 60_000) gpuSeen.shift(); }
  const gpuIdle = gpuSeen.length >= 6 && Date.now() - gpuSeen[0].t >= 50_000 && gpuSeen.every((g) => g.util < GPU_IDLE);
  const onDeckN = deck.waiting + deck.heading, shallower = nextDepth(depth, { onDeck: onDeckN, waiting: deck.waiting, sinceChangeMs: Date.now() - depthAt });
  if (shallower !== depth) { depth = shallower; depthAt = Date.now(); log('deck depth', { depth, gpu_waiting: deck.waiting }); }
  // ADAPT: CPU types are admitted by measurement (fitCpu), the GPU deck counts GPU jobs only; otherwise every job counts against --slots
  const gpuRunning = ADAPT ? [...jobs.values()].filter((j) => j.needs !== 'cpu').length : running.size;
  if (gpuLostAt && Date.now() - gpuProbeAt >= 600_000) { gpuProbeAt = Date.now(); if (gpuBack()) { log('gpu back', { lost_min: Math.round((Date.now() - gpuLostAt) / 60_000) }); gpuLostAt = 0; } }
  const want = !stopping && !gpuLostAt && (!ADAPT || NEEDS_GPU) && wantAnother({ running: gpuRunning, cap: CAP, onDeck: onDeckN, depth, waiting: deck.waiting, memGb: memAvailGb(), minGb: MIN_AVAIL_GB, cpu,
    gpuIdle, sinceClaimMs: Date.now() - claimedAt, diskGb: diskFreeGb(), minDiskGb: DISK_PER_TALK })
    // CPU-only work: one claim a minute while busy, so the CPU sample sees each job's load before the next
    && (NEEDS_GPU || !running.size || Date.now() - claimedAt >= 60_000);
  // CPU types: admitted by the projection (each young job counted at its profile less the share busy already holds), no claim timer —
  // 11-01: one claim a minute held boss at 1–2 cpu-finish jobs (each ~1–4 min) with 36 queued and 14 allowed. The next claim waits for the
  // job in fetch to have its inputs (a progress gate, not a timer): 11-01 06:02 aorus took 7 at once and all 7 fetches timed out on the link
  const fetching = [...jobs.values()].some((j) => j.phase === 'fetch');
  const cpuJobs = [...jobs.values()].filter((j) => j.needs === 'cpu').length;
  const fit = ADAPT && !stopping && !fetching && cpuJobs < CPU_SLOTS && diskFreeGb() >= DISK_PER_TALK ? fitCpu(cpu, c) : [];
  const cpuReady = fit.length > 0;
  // the GPU deck is full but cores are spare: offer them to the spill types (the queue gives one only while that backlog is over 1 h)
  const spare = !want && !stopping && SPILL.length && running.size < CAP && memAvailGb() >= MIN_AVAIL_GB + GB_PER_TALK && diskFreeGb() >= DISK_PER_TALK
    && cpu != null && cpu < 0.6 && Date.now() - spillAt >= 60_000;
  if (want || spare || cpuReady) {
    if (spare) spillAt = Date.now();
    const types = !ADAPT || spare ? TYPES : TYPES.filter((t) => (want && typedKind(t)?.needs !== 'cpu') || fit.includes(t));
    const job = await q.claim(claimArgs(!!spare, types)).catch((e) => { log('claim error', { error: e.message }); lastError = { at: Date.now(), msg: `claim: ${e.message}`.slice(0, 500) }; return null; });
    if (job) {
      if (kindOf(job)?.needs !== 'cpu') toGpu.set(job.id, { t: Date.now() });   // only GPU-bound work sits on the GPU deck
      claimedAt = Date.now();
      const deeper = NEEDS_GPU && kindOf(job)?.needs !== 'cpu' ? nextDepth(depth, { onDeck: onDeckN, rampClaim: onDeckN >= depth }) : depth;
      if (deeper !== depth) { depth = deeper; depthAt = Date.now(); log('deck depth', { depth, gpu_idle: gpuIdle }); }
      log('claimed', { job: job.id, type: job.type, spill: !!spare, ...(ADAPT ? { fit } : {}), audio_s: job.body?.invoice?.audio_s, running: running.size, deck: onDeckN, depth, gpu_waiting: deck.waiting, gpu_util: util, gpu_idle: gpuIdle, disk_gb: Math.round(diskFreeGb()), cpu: cpu == null ? null : Math.round(cpu * 100) });
      running.set(job.id, work(job).finally(() => { running.delete(job.id); busyAt = Date.now(); }));
      continue;
    }
    if (ONCE && !running.size) break;
    if (IDLE_EXIT_MS && !running.size && Date.now() - busyAt > IDLE_EXIT_MS) { log('idle — exiting', { idle_min: IDLE_EXIT_MS / 60_000 }); break; }
  }
  health.tick();
  await nap(running.size ? 5_000 : 30_000);   // while working, look at the GPU deck every 5 s
}
await Promise.allSettled(running.values());
log('exit');
await health.last(stopping ? 'stopped (signal)' : IDLE_EXIT_MS && Date.now() - busyAt > IDLE_EXIT_MS ? 'idle exit' : ONCE ? 'once' : 'loop ended');
