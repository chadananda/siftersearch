// UNIPASE ON RUNPOD (Chad 10-23: "fire up three runpods and reprocess every audio that is B or worse"). The pods do
// inference ONLY (scripts/media/runpod_worker.py: the UniPASE copy + a Whisper transcript of it); tower uploads the
// original, downloads the copy into the talk's folder and queues the talk's remaster run (word guard, realign, encode,
// publish happen on tower). Pods never touch production. COST: our pods only, capped (MEDIA_CLOUD_CAP_USD, 60), stop when
// the account balance would fall below MEDIA_CLOUD_KEEP_BALANCE (90 — the balance is shared with SearchLayerPDF); every pod
// is terminated when the queue is empty, on any fatal error, or by its own idle watchdog (15 min) if tower disappears.
// State (pods, jobs in flight, spend) lives in a file, so a restart re-attaches instead of losing work. Deps injectable.
import { readFile, writeFile, mkdir, rename, rm } from 'fs/promises';
import { readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const STATE_FILE = join(ROOT, 'data', 'run', 'cloud-remaster.json');
export const RENTAL_PAUSE_FILE = join(ROOT, 'data', 'run', 'cloud-rentals.pause');
export const RENTAL_CAPACITY_FILE = join(ROOT, 'data', 'run', 'cloud-capacity.json');
export const ACCEPTED_WORKER_FILE = join(ROOT, 'data', 'run', 'media-worker-accepted.json');
export async function acceptedWorker(file = ACCEPTED_WORKER_FILE) {
  try {
    const a = JSON.parse(await readFile(file, 'utf8'));
    if (!/^ghcr\.io\/chadananda\/sifter-media-worker@sha256:[a-f0-9]{64}$/.test(a.image || '') || !a.aorus_accepted_at) throw Error('Invalid accepted worker image');
    return a;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
/** Promote a newly accepted worker image (ops route POST /ops/media/worker-image — never an ssh edit on tower). Keeps the other
 *  settings, records the image it replaces; `home_image` / `quiet_hosts` replace theirs when given (a home build is keyed by digest). */
export async function promoteWorker({ image, evidence, home_image, quiet_hosts, by = 'ops' } = {}, file = ACCEPTED_WORKER_FILE, now = new Date()) {
  if (!/^ghcr\.io\/chadananda\/sifter-media-worker@sha256:[a-f0-9]{64}$/.test(image || '')) return { error: 'image must be ghcr.io/chadananda/sifter-media-worker@sha256:<64 hex>' };
  if (!evidence || String(evidence).length < 20) return { error: 'evidence required: what the Aorus acceptance run proved' };
  const cur = await acceptedWorker(file) || {};
  const next = { ...cur, image, aorus_accepted_at: now.toISOString(), evidence: String(evidence).slice(0, 2000), promoted_by: String(by).slice(0, 60),
    previous_image: cur.image && cur.image !== image ? cur.image : cur.previous_image || null };
  if (home_image && typeof home_image === 'object') next.home_image = home_image; else if (cur.image !== image) delete next.home_image;
  if (Array.isArray(quiet_hosts)) next.quiet_hosts = quiet_hosts.map(String);
  await writeFile(file + '.tmp', JSON.stringify(next, null, 1));
  await rename(file + '.tmp', file);
  return { ok: true, accepted: next };
}
/** Runtime capacity survives deploys and can change without draining all media lanes. */
export async function rentalCapacity(requested, file = RENTAL_CAPACITY_FILE) {
  let cap = Number(process.env.MEDIA_CLOUD_MAX_PODS);
  try {
    const settings = JSON.parse(await readFile(file, 'utf8'));
    // the operator's live setting wins both ways (10-30: a lane launched with maxPods 2 could never be raised to 3 by the capacity report)
    if (Number.isInteger(settings.maxPods) && settings.maxPods > 0) return settings.maxPods;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return Number.isInteger(cap) && cap > 0 ? Math.min(requested, cap) : requested;
}
export async function rentalPauseReason(file = RENTAL_PAUSE_FILE) {
  try { return (await readFile(file, 'utf8')).trim() || 'operator pause'; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
/** The operator valve: a reason pauses new rentals and staging (running pods finish what they hold, then go); null lifts it. */
export async function setRentalPause(reason, file = RENTAL_PAUSE_FILE) {
  if (!reason) { await rm(file, { force: true }); return null; }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, String(reason).slice(0, 300)); await rename(`${file}.tmp`, file);
  return rentalPauseReason(file);
}
/** The spend cap: the capacity file's capUsd (set by the media-cloud-capacity job) wins over MEDIA_CLOUD_CAP_USD. */
export function capFromFile(file = RENTAL_CAPACITY_FILE) {
  try { const c = Number(JSON.parse(readFileSync(file, 'utf8')).capUsd); return c > 0 ? c : null; } catch { return null; }
}
/** media-cloud-capacity: merge { maxPods?, capUsd? } into the runtime capacity file; the lane reads it every tick. */
export async function setRentalCapacity({ maxPods, capUsd } = {}, file = RENTAL_CAPACITY_FILE) {
  let cur = {};
  try { cur = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (maxPods != null) { if (!(Number.isInteger(maxPods) && maxPods > 0 && maxPods <= 6)) throw Error('maxPods must be 1-6'); cur.maxPods = maxPods; }
  if (capUsd != null) { if (!(Number(capUsd) > 0 && Number(capUsd) <= 500)) throw Error('capUsd must be 0-500'); cur.capUsd = Number(capUsd); }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(cur)); await rename(`${file}.tmp`, file);
  return cur;
}
export const CLOUD = {
  maxPods: 3,
  capUsd: () => capFromFile() ?? (Number(process.env.MEDIA_CLOUD_CAP_USD) || 60),
  keepBalance: () => Number(process.env.MEDIA_CLOUD_KEEP_BALANCE ?? 90),
  // best $ / throughput with ≥ 16 GB (UniPASE peaks at ~4 GB; Whisper turbo ~2 GB): community first
  gpuTypes: ['NVIDIA GeForce RTX 4090', 'NVIDIA RTX A5000', 'NVIDIA GeForce RTX 3090', 'NVIDIA RTX A4500', 'NVIDIA A40', 'NVIDIA RTX A6000'],
  image: 'runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04',
  minVcpu: 32,          // rent this many vCPUs per GPU first (10-30: #349 had 18 → 7 jobs in CPU post steps, GPU at 0 %); any vCPU count if none is free
  stageAhead: 4,        // Chad 10-30: talks staged on a pod beyond its worker's slots, so a finished slot never waits on tower
  stageBatch: 2,        // uploads running at once per pod — in the background, the pass never waits on them
  stageGlobal: 4,       // uploads running at once in all: tower's real uplink is ~18 Mbit/s (10-30: 9 at once each crawled, a pass took 10 min)
  resultsPerPod: 2,     // finished talks downloading at once per pod — in the background; a finished talk no longer holds a pod slot
  resultsGlobal: 4,     // ... and in all: tower's downlink is per-stream bound (10-30: 45 Mbit/s one stream, ~120 three)
  perPod: 6,            // prefetch only: match the worker's six post slots so four long CPU tails cannot starve its GPU; live controller still admits work
  bootTimeoutMs: 15 * 60_000,     // no SSH after this → terminate and replace (the 23 GB baked image takes 5-12 min to pull on a cold host; 10-24 measured)
  warmTimeoutMs: 20 * 60_000,     // the bootstrap (pip + the verified weights) must finish in this
  deadAfterMs: 4 * 60_000,
  agentDeadAfterMs: 10 * 60_000,   // an agent pod heartbeats each job every 2 min; ssh is only the watch channel
  maxPodFailures: 3,
};

// ── RunPod API ──
const key = () => process.env.RUNPOD_API_KEY;
/** fetch with a hard timeout and retries on network errors / 5xx / 429 (10-24: a RunPod call that never answered froze the whole lane for 10 min). */
export async function fetchRetry(url, init, { fetchFn = fetch, tries = 4, timeoutMs = 30_000, backoffMs = 1500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status < 500 && r.status !== 429) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (err) { last = err; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, backoffMs * (i + 1)));
  }
  throw last;
}
async function rest(method, path, body, { fetchFn = fetch } = {}) {
  const r = await fetchRetry(`https://rest.runpod.io/v1${path}`, { method, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { fetchFn });
  const t = await r.text();
  if (!r.ok) throw new Error(`runpod ${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
export async function accountBalance({ fetchFn = fetch } = {}) {
  const r = await fetchRetry('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { myself { clientBalance currentSpendPerHr } }' }) }, { fetchFn });
  const j = await r.json();
  return { balance: j?.data?.myself?.clientBalance ?? null, spendPerHr: j?.data?.myself?.currentSpendPerHr ?? null };
}
export async function createPod(name, publicKey, deps = {}) {
  const pause = await rentalPauseReason(deps.pauseFile);
  if (pause) throw new Error(`RunPod rentals paused: ${pause}`);
  let lastErr = null;
  const accepted = await acceptedWorker(deps.acceptedWorkerFile);
  // a network volume (weights fetched once) pins the pods to its data centre and to Secure Cloud; without one, community first
  const vol = process.env.MEDIA_CLOUD_VOLUME_ID;
  // a 4090 FIRST (10-24 measured GPU-min per audio hour: 4090 2.4-3.2 · 3090 4.4 · A40 5.4 · A4500 6.1 — about the same $ per
  // audio hour, twice the speed), community then secure; only then any card on the list
  const tries = [];
  // deps.prefer = { cloud: 'SECURE' | 'COMMUNITY', dcs: [data-centre ids that booted fast] } learned from the ledger (st.hosts); secure first after the breaker has tripped
  const order = vol ? ['SECURE'] : deps.prefer?.cloud === 'SECURE' ? ['SECURE', 'COMMUNITY'] : ['COMMUNITY', 'SECURE'];
  for (const vcpu of [CLOUD.minVcpu, 0]) for (const types of [CLOUD.gpuTypes.slice(0, 1), CLOUD.gpuTypes]) for (const cloudType of order) tries.push([types, cloudType, vcpu]);
  for (const [types, cloudType, vcpu] of tries) {
    try {
      const pause = await rentalPauseReason(deps.pauseFile);
      if (pause) throw Object.assign(new Error(`RunPod rentals paused: ${pause}`), { rentalsPaused: true });
      return await rest('POST', '/pods', { name, cloudType, computeType: 'GPU', gpuTypeIds: types, gpuCount: 1, imageName: accepted?.image || process.env.MEDIA_CLOUD_IMAGE || CLOUD.image, ...(process.env.MEDIA_CLOUD_IMAGE && process.env.MEDIA_CLOUD_REGISTRY_AUTH ? { containerRegistryAuthId: process.env.MEDIA_CLOUD_REGISTRY_AUTH } : {}),
        containerDiskInGb: 60, ...(deps.prefer?.dcs?.length ? { dataCenterIds: deps.prefer.dcs } : {}), ...(vol ? { networkVolumeId: vol, volumeMountPath: '/workspace' } : { volumeInGb: 0 }), ports: ['22/tcp'], supportPublicIp: true, ...(vcpu ? { minVCPUPerGPU: vcpu } : {}),
        env: { PUBLIC_KEY: publicKey, RP_TERMINATE_KEY: key() } }, deps);
    } catch (err) { if (err.rentalsPaused) throw err; lastErr = err; }
  }
  throw lastErr;
}
/** Concurrent recordings for a rented pod: the worker runs min(max_jobs, vCPU / 2), so scale with vCPU (6..12); RAM decides when vCPU is unknown. */
export function maxJobsFor(g) {
  const cpu = Number(g?.vcpuCount) || 0;
  if (cpu) return Math.max(6, Math.min(12, Math.floor(cpu / 2)));
  return Number(g?.memoryInGb) >= 32 ? 8 : 6;
}
export const listPods = (deps) => rest('GET', '/pods', null, deps);
export const getPod = (id, deps) => rest('GET', `/pods/${id}`, null, deps);
/** REST can report RUNNING with empty networking after the pod is already up.
 * Runtime ports are authoritative; otherwise a healthy GPU bills while we wait. */
export async function getPodConnection(id,{fetchFn=fetch}={}){
  const query='query { myself { pods { id runtime { ports { ip isIpPublic privatePort publicPort type } } machine { gpuDisplayName dataCenterId } } } }';
  const r=await fetchRetry('https://api.runpod.io/graphql',{method:'POST',headers:{Authorization:`Bearer ${key()}`,'Content-Type':'application/json'},body:JSON.stringify({query})},{fetchFn});
  const j=await r.json();if(j.errors)throw Error('RunPod runtime lookup failed: '+j.errors.map(e=>e.message).join(';'));
  const p=j.data?.myself?.pods?.find(p=>p.id===id),port=p?.runtime?.ports?.find(x=>x.isIpPublic&&Number(x.privatePort)===22&&x.type==='tcp');
  return port?{publicIp:port.ip,portMappings:{22:port.publicPort},machine:p.machine||{}}:{};
}
export const terminatePod = (id, deps) => rest('DELETE', `/pods/${id}`, null, deps).catch((err) => (/404/.test(err.message) ? {} : Promise.reject(err)));

/** Per data-centre boot statistics (the ledger's host table): { dc: { n, boot_s, fails } }. Pure. */
export function hostStats(st) {
  const out = {};
  for (const p of Object.values(st.pods || {})) {
    const dc = p.dc || p.host_key; if (!dc) continue;
    const e = (out[dc] ||= { n: 0, boot_s: 0, ok: 0, fails: 0 });
    e.n++;
    if (p.ready_at) { e.ok++; e.boot_s += (p.ready_at - p.created) / 1000; }
    if ((!(p.jobs_assigned > 0) || p.gpu_broken) && p.terminated) e.fails++;
  }
  for (const e of Object.values(out)) { e.avg_boot_s = e.ok ? Math.round(e.boot_s / e.ok) : null; delete e.boot_s; }
  return out;
}
/** Machines whose GPU failed the CUDA proof: never worth booting again. Pure. */
export const brokenHosts = (st) => new Set(Object.values(st.pods || {}).filter((p) => p.gpu_broken && p.host_key).map((p) => p.host_key));
/** The rental preference learned so far: data centres with >= 2 boots, none wasted, average boot < 7 min; SECURE once the breaker has tripped. */
export function rentalPrefer(st) {
  const good = Object.entries(hostStats(st)).filter(([, e]) => e.ok >= 2 && e.fails === 0 && e.avg_boot_s != null && e.avg_boot_s < 420).sort((a, b) => a[1].avg_boot_s - b[1].avg_boot_s).map(([dc]) => dc);
  return { dcs: good.slice(0, 3), cloud: (st.breaker_trips || 0) >= 1 ? 'SECURE' : 'COMMUNITY' };
}

/** Our spend so far: closed pods' cost + each live pod's cost per hour × its age. */
export function spendOf(state, now = Date.now()) {
  let usd = state.spent_closed || 0;
  for (const p of Object.values(state.pods || {})) if (!p.terminated) usd += (p.costPerHr || 0) * Math.max(0, now - p.created) / 3600_000;
  return Math.round(usd * 100) / 100;
}
/** Stop for money? → reason or null */
export function budgetStop(state, balance, now = Date.now()) {
  const spent = spendOf(state, now);
  if (spent >= CLOUD.capUsd()) return `cap $${CLOUD.capUsd()} reached ($${spent})`;
  if (balance != null && balance < CLOUD.keepBalance()) return `account balance $${Math.round(balance)} < $${CLOUD.keepBalance()} kept for SearchLayerPDF`;
  // the live pods' next 10 minutes must still fit under the cap
  const perHr = Object.values(state.pods || {}).filter((p) => !p.terminated).reduce((a, p) => a + (p.costPerHr || 0), 0);
  if (spent + perHr / 6 > CLOUD.capUsd()) return `the next 10 min would pass the $${CLOUD.capUsd()} cap`;
  return null;
}

// ── state ──
export async function loadState(file = STATE_FILE) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return { pods: {}, jobs: {}, queue: [], attempts: {}, done: [], failed: [], spent_closed: 0, started: null }; }
}
let saveSeq = 0;
export async function saveState(state, file = STATE_FILE) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++saveSeq}.tmp`;   // concurrent stagings save at once: one tmp each
  await writeFile(tmp, JSON.stringify(state, null, 1));
  await rename(tmp, file);
}

// ── work orders for the running lane (media-cloud-order writes, the lane takes them in) ──
export const ORDERS_FILE = join(dirname(STATE_FILE), 'cloud-orders.json');
async function orderOperation(operation, orders, file) {
  // Kernel flock releases on exit, including crashes. Both producers and the
  // consumer use it, so concurrent imports cannot overwrite each other's jobs.
  const {run}=await import('./tools.js');
  const r=await run('python3',[join(ROOT,'scripts/media/worker_orders.py'),operation,file],{input:JSON.stringify(orders),timeoutMs:15000});
  return JSON.parse(r.stdout);
}
export async function addOrders(orders, file = ORDERS_FILE) {
  if(orders.length)await orderOperation('add',orders,file);
}
export async function takeOrders(file = ORDERS_FILE) {return orderOperation('take',[],file);}
export async function peekOrders(file = ORDERS_FILE) {return orderOperation('peek',[],file);}
export async function ackOrders(orders,file = ORDERS_FILE) {return orderOperation('ack',orders,file);}

// ── ssh / scp to a pod ──
const sshOpts = (p) => ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', '-o', 'LogLevel=ERROR'];
// every successful transfer proves the pod is alive: lastOk moves with it (10-24: a 10-minute upload queue left lastOk stale and the reaper killed three healthy pods mid-work)
const alive = (p) => (r) => { p.lastOk = Date.now(); return r; };
/** Run on a pod before it is 'ready': torch must open the GPU and do arithmetic on it. Prints CUDA_OK or the error. */
export const CUDA_PROBE = `python -c "import torch; x = torch.ones(256, 256, device='cuda'); assert float((x @ x).sum()) > 0; print('CUDA_OK', torch.cuda.get_device_name(0))" 2>&1 | tail -3`;
export const podSsh = (run, p, cmd, o = {}) => run('ssh', [...sshOpts(p), '-p', String(p.port), `root@${p.ip}`, cmd], { timeoutMs: 600_000, ...o }).then(alive(p));
export const podPut = (run, p, local, remote) => run('scp', [...sshOpts(p), '-P', String(p.port), local, `root@${p.ip}:${remote}`], { timeoutMs: 3600_000 }).then(alive(p));
export const podGet = (run, p, remote, local) => run('scp', [...sshOpts(p), '-P', String(p.port), `root@${p.ip}:${remote}`, local], { timeoutMs: 3600_000 }).then(alive(p));

// PINNED (R&D spec 10-23): weights Xiaobin-Rong/unipase @ f0b4d4c4 (each file sha256-verified, Vocoder_WavLM-L24 skipped),
// code github Xiaobin-Rong/unipase @ 857b60ad (git archive, shipped from tower), Whisper turbo (CTranslate2) pinned the same way.
export const UNIPASE_REV = 'f0b4d4c4411fe08fc2dddbf2d9f33260c27ac4a0';
export const UNIPASE_COMMIT = '857b60ad05d37a2cf6d7a89883ec9fc4fc164b45';
export const WEIGHTS = [
  ['unipase', `Xiaobin-Rong/unipase/resolve/${UNIPASE_REV}`, 'DeWavLM-Omni.pt', '16c94d05ff6ef2bdf08b0be2853826afda687c2d63c833382198db7682476689'],
  ['unipase', `Xiaobin-Rong/unipase/resolve/${UNIPASE_REV}`, 'Adapter.pt', '3f3f9f8076e304bc740fef5496f91528ca9ea6be7f5a63deec71cdc33471c8c7'],
  ['unipase', `Xiaobin-Rong/unipase/resolve/${UNIPASE_REV}`, 'Vocoder_DWO-L1.pt', '7595d48962c296bab2f7cb307f299acf5a02ec6a972d9ab7da3ed71b4a54a3d5'],
  ['unipase', `Xiaobin-Rong/unipase/resolve/${UNIPASE_REV}`, 'PostNet.pt', '1bf950dd2432e3cd2ef7055226b259bb3ac3fba8d7ce1f5f2424581a3d19cf63'],
  ['unipase', `Xiaobin-Rong/unipase/resolve/${UNIPASE_REV}`, 'config.json', '4c11a811af333dd8e93db110b08d1277623e906df549c8c8d5ecac9ffc633136'],
  // the word guard's transcript of the remastered copy (not UniPASE): faster-whisper large-v3-turbo, loaded from a path
  ['whisper', 'dropbox-dash/faster-whisper-large-v3-turbo/resolve/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', 'model.bin', 'e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da'],
  ['whisper', 'dropbox-dash/faster-whisper-large-v3-turbo/resolve/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', 'config.json', 'b0253ea6c0d3bea6b1e19e91a02acfd3b53f4467362efcb5a3e6b16c9b3a9b7e'],
  ['whisper', 'dropbox-dash/faster-whisper-large-v3-turbo/resolve/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', 'preprocessor_config.json', '7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711'],
  ['whisper', 'dropbox-dash/faster-whisper-large-v3-turbo/resolve/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', 'tokenizer.json', '297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd'],
  ['whisper', 'dropbox-dash/faster-whisper-large-v3-turbo/resolve/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', 'vocabulary.json', 'c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1'],
];

// The deterministic cleanup's one model (Chad 10-24; scripts/media/worker/cleanup.py): MossFormer2-SE 48 kHz via ClearVoice, revision + checksums pinned.
// Baked into the image under /opt/models/clearvoice/checkpoints/MossFormer2_SE_48K/ (the dir is relative to ClearVoice's cwd).
export const CLEANUP_WEIGHTS = [
  ['clearvoice/checkpoints/MossFormer2_SE_48K', 'alibabasglab/MossFormer2_SE_48K/resolve/eff8c97925c8bec812af707814b3e5d777fd4503', 'last_best_checkpoint.pt', '03692b9f773bbd6bb43b9c5a41f96b1e28affd66e13796b7bec66ad3d8b227c6'],
  ['clearvoice/checkpoints/MossFormer2_SE_48K', 'alibabasglab/MossFormer2_SE_48K/resolve/eff8c97925c8bec812af707814b3e5d777fd4503', 'last_best_checkpoint', '315744c841441f8831cb2f896e06102b4d864776bf272febaa30c639c903e1c0'],
];

/** The pod's one-time setup. Weights go to /workspace/weights — the network volume when MEDIA_CLOUD_VOLUME_ID is set
 *  (fetched once, shared by every pod, flock-guarded), else the pod's own disk (~2 GB fetch, about a minute). Every file is
 *  sha256-checked; a mismatch deletes it and fails the boot. pip: the spec's three (einops omegaconf soundfile) + faster-whisper
 *  (the guard's transcript) + imageio-ffmpeg only if the image has no ffmpeg (decoding the original to mono 48 kHz). */
export const BOOTSTRAP = `set -e
cd /workspace
W=/workspace/weights; mkdir -p $W/unipase $W/whisper
pip install -q einops omegaconf soundfile faster-whisper >/workspace/pip.log 2>&1
command -v ffmpeg >/dev/null || { pip install -q imageio-ffmpeg >>/workspace/pip.log 2>&1; ln -sf "$(python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" /usr/local/bin/ffmpeg; }
fetch() { # dir url-base file sha
  f=$W/$1/$3
  [ -f $f.ok ] && [ "$(cat $f.ok)" = "$4" ] && return 0
  curl -fsSL --retry 5 -o $f.part "https://huggingface.co/$2/$3"
  got=$(sha256sum $f.part | cut -d' ' -f1)
  [ "$got" = "$4" ] || { rm -f $f.part; echo "SHA MISMATCH $1/$3 $got" >&2; exit 3; }
  mv $f.part $f && echo $4 > $f.ok
}
(
flock 9
${WEIGHTS.map(([d, u, f, h]) => `fetch ${d} ${u} ${f} ${h}`).join('\n')}
) 9>$W/.lock
rm -rf /workspace/unipase && mkdir -p /workspace/unipase && tar xzf /workspace/unipase-repo.tgz -C /workspace/unipase --strip-components=1
CUDNN=$(python -c 'import os, nvidia.cudnn; print(os.path.dirname(nvidia.cudnn.__file__) + "/lib")' 2>/dev/null || true)
CUBLAS=$(python -c 'import os, nvidia.cublas; print(os.path.dirname(nvidia.cublas.__file__) + "/lib")' 2>/dev/null || true)
export LD_LIBRARY_PATH="$CUDNN:$CUBLAS:\${LD_LIBRARY_PATH:-}" HF_HUB_OFFLINE=1
pkill -f runpod_worker.py || true
touch /workspace/spool/.tower-hb
mkdir -p /workspace/scripts/media && [ -f /workspace/media-scripts.tgz ] && tar xzf /workspace/media-scripts.tgz -C /workspace/scripts/media
W_PY=/workspace/runpod_worker.py; [ -f /workspace/scripts/media/runpod_worker.py ] && W_PY=/workspace/scripts/media/runpod_worker.py
nohup bash -c 'while true; do python '$W_PY' --repo /workspace/unipase --weights '$W' --spool /workspace/spool --idle-min 10 --hb-min 10 --max-hours 24 >> /workspace/worker.log 2>&1; [ $? -eq 75 ] || break; done' > /dev/null 2>&1 < /dev/null &
echo started`;

export const MEDIA_SCRIPTS = ['runpod_worker.py', 'remaster_guard.py', 'media_tool.py', 'worker/post.py', 'worker/controller.py', 'worker/cleanup.py', 'worker/selftest.py', 'worker/quiet.py'];   // shipped to the pod beside the worker (guard, realign, encodes run there)
/** Start of a pod from the BAKED image (ghcr.io/chadananda/sifter-media-worker): code, UniPASE, whisper and aligners are already inside — seconds, no downloads. */
export const BOOTSTRAP_BAKED = `set -e
mkdir -p /workspace/spool && touch /workspace/spool/.tower-hb /workspace/.lane-seen   # (the entrypoint ends a pod no lane ever reached within 25 min)
# the image's ENV is not in an ssh session: without HF_HOME the BAKED aligners are not found and whisperx downloads (and fails) at run time (10-24: every Persian talk 'placed 0 words')
export HF_HOME=/opt/models/hf TORCH_HOME=/root/.cache/torch SIFTER_WEIGHTS=/opt/models/weights
# the container's own env (RUNPOD_POD_ID, the terminate key) is not in an ssh session: the dead-man switch needs it to end the pod
for v in RUNPOD_POD_ID RP_TERMINATE_KEY; do val=$(tr '\\0' '\\n' < /proc/1/environ | grep "^$v=" | head -1 | cut -d= -f2-); [ -n "$val" ] && export $v="$val"; done
# the image carries a pinned copy of the job code; the lane ships the current one (small) on top, so a code fix needs no image rebuild
[ -f /workspace/media-scripts.tgz ] && tar xzf /workspace/media-scripts.tgz -C /opt/sifter/media
# SELFTEST before anything is rented against: a pod that cannot pass it says why (boot.log) and the lane retires it — no job is ever sent to it
export HF_HUB_OFFLINE=0
python /opt/sifter/media/worker/selftest.py > /workspace/selftest.json 2>&1 || { echo 'SELFTEST FAILED'; tail -c 900 /workspace/selftest.json; exit 3; }
pkill -f runpod_worker.py || true
nohup bash -c 'while true; do python /opt/sifter/media/runpod_worker.py --repo /opt/unipase --weights /opt/models/weights --spool /workspace/spool --idle-min 10 --hb-min 10 --max-hours 24 >> /workspace/worker.log 2>&1; [ $? -eq 75 ] || break; done' > /dev/null 2>&1 < /dev/null &
echo started`;
/** Immutable, Aorus-accepted image: no runtime code overlays or model downloads. */
export const BOOTSTRAP_WHOLE = `set -e
mkdir -p /workspace/spool
touch /workspace/spool/.tower-hb /workspace/.lane-seen
export HF_HOME=/opt/models/hf TORCH_HOME=/root/.cache/torch SIFTER_WEIGHTS=/opt/models/weights
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH=/opt/worker-extras:/opt/sifter/media NLTK_DATA=/opt/models/nltk_data
for v in RUNPOD_POD_ID RP_TERMINATE_KEY; do val=$(tr '\\0' '\\n' < /proc/1/environ | grep "^$v=" | head -1 | cut -d= -f2-); [ -n "$val" ] && export $v="$val"; done
# 10-30: the image's LD_LIBRARY_PATH (cublas/cudnn wheels) is not in an ssh session either — sherpa's CUDA provider then can't load
# libcublasLt.so.12 and every 'unsure' talk failed at diarize, after its GPU remaster (~30 failures / 30 min on 3 pods)
val=$(tr '\\0' '\\n' < /proc/1/environ | grep '^LD_LIBRARY_PATH=' | head -1 | cut -d= -f2-); [ -n "$val" ] && export LD_LIBRARY_PATH="$val"
test -f /opt/sifter/media/worker/farm_worker.py
# 10-30: the image's worker ended its own pod after 120 s idle or 3 min without a tower heartbeat; tower's first look at a warming pod
# comes one lane tick (~3.5 min) later, so pods 351-353 died before their first talk. The worker runs without RUNPOD_POD_ID (no self-end);
# this keeper holds the real safety nets: tower silent 30 min, or 24 h of life. Idle pods are closed by tower's ledger (10 min).
cat > /workspace/keeper.sh <<'KEEP'
born=$(date +%s)
while sleep 60; do
  now=$(date +%s); hb=$(stat -c %Y /workspace/spool/.tower-hb 2>/dev/null || echo $born); [ "$hb" -lt "$born" ] && hb=$born
  why=''; [ $((now-hb)) -gt 1800 ] && why='no heartbeat from tower for 30 min'; [ $((now-born)) -gt 86400 ] && why='maximum lifetime 24 h'
  [ -n "$why" ] && cd /opt/sifter/media && python -c 'import sys; from runpod_worker import terminate_self; terminate_self(sys.argv[1])' "$why"
done
KEEP
pgrep -f 'bash /workspace/keeper.sh' >/dev/null || nohup bash /workspace/keeper.sh >> /workspace/keeper.log 2>&1 < /dev/null &
if ! pgrep -f '^python /opt/sifter/media/worker/farm_worker.py' >/dev/null; then
  nohup env -u RUNPOD_POD_ID python /opt/sifter/media/worker/farm_worker.py --spool /workspace/spool --max-jobs 6 >> /workspace/worker.log 2>&1 < /dev/null &
fi
echo started`;
/** AGENT pod (step 6, Chad 10-31): the image's queue agent pulls from the edge queue (/_q + R2) like every other machine — inputs come
 * from R2, results go to R2, so a pod never waits on tower's downloads and a busy tower loses no work. Tower only rents, proves the GPU
 * and closes. The pod ends ITSELF when the agent exits (idle on an empty queue, or drained), or after 24 h. Tower prepends
 * MEDIA_QUEUE_KEY + POD_HOST + AGENT_SLOTS at run time (never baked into the image or BOOT_V). */
export const BOOTSTRAP_AGENT = `set -e
mkdir -p /workspace/spool /workspace/q && touch /workspace/.lane-seen   # (10-31: without it the entrypoint's 25-min zombie guard ended pods 367, 368, 371, 372 mid-work)
export HF_HOME=/opt/models/hf TORCH_HOME=/root/.cache/torch SIFTER_WEIGHTS=/opt/models/weights
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH=/opt/worker-extras:/opt/sifter/media NLTK_DATA=/opt/models/nltk_data
for v in RUNPOD_POD_ID RP_TERMINATE_KEY LD_LIBRARY_PATH PATH; do val=$(tr '\\0' '\\n' < /proc/1/environ | grep "^$v=" | head -1 | cut -d= -f2-); [ -n "$val" ] && export $v="$val"; done
test -f /opt/sifter/media/worker/queue-agent.mjs
cat > /workspace/agent.sh <<'AGENT'
cd /workspace/q
node /opt/sifter/media/worker/queue-agent.mjs --host "$POD_HOST" --slots "$AGENT_SLOTS" --root /workspace/q --run local --device cuda --can whole --idle-exit-min 15 >> /workspace/agent.log 2>&1
echo "agent exit $? $(date -u +%FT%TZ)" >> /workspace/agent.log
cd /opt/sifter/media && python -c 'import sys; from runpod_worker import terminate_self; terminate_self(sys.argv[1])' 'queue agent exited (idle or drained)'
AGENT
cat > /workspace/keeper.sh <<'KEEP'
born=$(date +%s)
while sleep 60; do [ $(( $(date +%s) - born )) -gt 86400 ] && cd /opt/sifter/media && python -c 'import sys; from runpod_worker import terminate_self; terminate_self(sys.argv[1])' 'maximum lifetime 24 h'; done
KEEP
pgrep -f 'bash /workspace/keeper.sh' >/dev/null || nohup bash /workspace/keeper.sh >> /workspace/keeper.log 2>&1 < /dev/null &
pgrep -f 'queue-agent.mjs' >/dev/null || nohup env SIFTER_GPU_LEASE_DIR=/workspace/q/leases bash /workspace/agent.sh > /dev/null 2>&1 < /dev/null &
touch /workspace/spool/.worker-ready
echo started`;
/** Which BOOTSTRAP_WHOLE a pod was started with: a pod booted with an older one drains like a stale image (10-30: the LD_LIBRARY_PATH fix). */
export const BOOT_V = createHash('sha256').update(BOOTSTRAP_WHOLE).digest('hex').slice(0, 12);
export const BOOT_V_AGENT = createHash('sha256').update(BOOTSTRAP_AGENT).digest('hex').slice(0, 12);
export const agentEnv = (key, host, slots) => `export MEDIA_QUEUE_KEY='${String(key).replace(/'/g, '')}' POD_HOST='${String(host).replace(/[^\w.-]/g, '')}' AGENT_SLOTS=${Number(slots) || 4}\n`;
export const WORKER_FILE = join(ROOT, 'scripts', 'media', 'runpod_worker.py');
export const REPO_TGZ = () => process.env.MEDIA_UNIPASE_REPO_TGZ || join(homedir(), 'sifter', 'remaster', 'cloud', `unipase-${UNIPASE_COMMIT.slice(0, 8)}.tgz`);
export const jobIdOf = (item) => `${String(item.slug || item.id).replace(/[^a-z0-9-]/gi, '').slice(0, 80)}-${item.id}`;
