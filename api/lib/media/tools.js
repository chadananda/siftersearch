// Process runners for the media pipeline: the Python worker (scripts/media/media_tool.py in the user-space venvs), ffmpeg,
// ffprobe and yt-dlp — every one at nice 19 with a thread cap, so a transcription never costs a reader their search. The
// thread cap follows measured search latency on the gateway (MEDIA_THREADS default; halved while search is slow).
import { spawn } from 'child_process';
import { readFileSync, createReadStream } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isDraining } from '../drain.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const TOOL = join(ROOT, 'scripts', 'media', 'media_tool.py');
export const PY = () => process.env.MEDIA_PYTHON || join(homedir(), 'sifter', 'venvs', 'media', 'bin', 'python');
export const PY_DFN = () => process.env.MEDIA_DFN_PYTHON || join(homedir(), 'sifter', 'venvs', 'media-dfn', 'bin', 'python');
export const YTDLP = () => process.env.MEDIA_YTDLP || join(homedir(), 'sifter', 'venvs', 'media', 'bin', 'yt-dlp');
// 8: measured 10-21 23:55 (12 fresh queries each, POST /api/search/multi): tower diarization at 12 threads → p90 3.8 s, max 5.3 s;
// at 8 → median 1.6 s, p90 2.1 s; idle → 1.8–2.2 s, p90 2.4–3.0 s. Search stays in its usual range at 8.
// N items are processed at once (MEDIA_PARALLEL); tower's share stays ≤ 8 threads in total (plan §12), boss's ~30
export const BOSS_THREADS = 32;   // boss: 16 cores / 32 threads
// measured on boss 10-22 (10 min of audio, large-v3-turbo): 1 job × 24 threads 5.3 audio-min per wall-min · 2 × 12: 8.3 ·
// 3 × 8: 9.4 · 4 × 6: 14.4 → four items at once, 6 ASR threads each (+ diarization beside them)
export const mediaParallel = () => Math.max(1, Math.min(6, Number(process.env.MEDIA_PARALLEL) || 4));
export const defaultThreads = () => Math.max(2, Number(process.env.MEDIA_THREADS) || Math.floor(8 / mediaParallel()));

// every live child, killed when this process exits — a drained service exits as soon as its job yields, and a sibling
// child whose own stop-poll had not fired yet (the ssh beside a killed diarization, 10-22 00:13) was left orphaned
const live = new Set();
process.once('exit', () => { for (const c of live) { try { c.kill('SIGTERM'); } catch { /* gone */ } } });

/** The error a child process ends with when the service drains mid-stage: the stage is redone after the restart. */
export class DrainAbort extends Error { constructor(what) { super(`${what}: stopped for an update drain — redone after the restart`); this.code = 'DRAIN'; } }
import { poolHosts, isPod, GATE_PATH, POD_SLOTS } from './pool.js';

// ── TOWER PLACEMENT (Chad 10-24: "tower must stay responsive … what happens when we have 300?") ──────────────────────────────
// Every media process tower starts passes THIS gate. HEAVY work never runs here: it waits for a worker (WorkerWait — the item is put
// back in the queue and retried), whatever fallback code asked for it. What is left is bounded: web encodes (libopus / aac: the
// trim stage and the encode fallback — no worker recipe yet) ONE at a time; light analysis (metrics, probe, 16 kHz conversions,
// waveform decode) TWO at a time. CLAUDE.md "Tower placement"; tests/api/tower-guard.test.js. MEDIA_TOWER_HEAVY=1 lifts it (maintenance only).
export class WorkerWait extends Error { constructor(what) { super(`${what}: waiting for a worker (aorus, boss or a pod) — never run on tower`); this.code = 'WORKER_WAIT'; } }
const HEAVY_SUBS = new Set(['dfn', 'grade', 'diarize', 'transcribe', 'realign', 'langid', 'unipase', 'encode', 'probe']);
/** 'refuse' | 'encode' | 'light' for a command tower is about to spawn. Pure. */
export function towerClass(cmd, args = []) {
  const name = String(cmd).split('/').pop();
  const a = args.map(String);
  if (/^python/.test(name) || name === 'python3') {
    const script = a.find((x) => /media_tool\.py$|remaster_guard\.py$|unipase_job\.py$|cleanup\.py$/.test(x));
    if (!script) return 'light';
    if (/remaster_guard|unipase_job|cleanup/.test(script)) return 'refuse';
    const sub = a[a.indexOf(script) + 1];
    return HEAVY_SUBS.has(sub) ? 'refuse' : 'light';
  }
  if (name === 'ffmpeg') {
    const j = a.join(' ');
    if (/libopus|\baac\b|libmp3lame|-c:a flac/.test(j) && !/-f s16le|-f f32le/.test(j)) return 'encode';
    if (/loudnorm|highpass|dynaudnorm|equalizer|compand/.test(j) && !/-f s16le|-f f32le|-f null/.test(j)) return 'refuse';   // the prep 'light'/'safe chain' file: a worker recipe exists
    return 'light';
  }
  return 'free';
}
const towerSlots = { encode: [Number(process.env.MEDIA_TOWER_ENCODE_SLOTS) || 1, 0, []], light: [Number(process.env.MEDIA_TOWER_LIGHT_SLOTS) || 2, 0, []] };
async function towerAdmit(kind, label) {
  const t = towerSlots[kind];
  if (!t) return () => {};
  while (t[1] >= t[0]) await slotWait(t[2], `a tower ${kind} slot (${label})`);
  t[1]++;
  return () => { t[1]--; t[2].shift()?.(); };
}
export const towerGuardState = () => Object.fromEntries(Object.entries(towerSlots).map(([k, v]) => [k, { running: v[1], limit: v[0], waiting: v[2].length }]));

/** A SLOT WAIT that a drain never hangs on (10-23: a diarization at 17:59 and two compute jobs at 19:44 held the media drain
 *  in plain slot waits): resolves when woken or after `ms` (the caller re-checks its condition), and throws DrainAbort when
 *  the service is draining. queue: the array of wakers. */
export async function slotWait(queue, label = 'a slot', { ms = 5_000, draining = isDraining } = {}) {
  if (draining()) throw new DrainAbort(`waiting for ${label}`);
  await new Promise((r) => { const t = setTimeout(() => { const i = queue.indexOf(go); if (i >= 0) queue.splice(i, 1); r(); }, ms); const go = () => { clearTimeout(t); r(); }; queue.push(go); });
  if (draining()) throw new DrainAbort(`waiting for ${label}`);
}

// the 16 kHz conversions sent to the ASR hosts: 3 at once × 2 threads (with item.js towerLight's 4 × 2, prep stays ≤ 14 cores)
let convBusy = 0;
const convWait = [];
export async function convSlot(fn) {
  while (convBusy >= 3) await slotWait(convWait, 'a conversion slot');
  convBusy++;
  try { return await fn(); } finally { convBusy--; convWait.shift()?.(); }
}
// a TRANSCRIPTION's conversion has its own two slots: it holds an ASR host's slot while it converts, and behind 16 prep
// runs' probe conversions it waited half an hour (13:13 → 13:43: aorus's two slots 'taken', nothing running there)
let asrConvBusy = 0;
const asrConvWait = [];
export async function asrConvSlot(fn) {
  while (asrConvBusy >= 2) await slotWait(asrConvWait, 'a transcription conversion slot');
  asrConvBusy++;
  try { return await fn(); } finally { asrConvBusy--; asrConvWait.shift()?.(); }
}

// every tower-side media process runs at the LOWEST priority, CPU and disk (10-23: prep took API reads from ms to 1.5 s):
// nice 19 + ionice idle class on Linux
const LOW = process.platform === 'linux' ? ['ionice', '-c3', 'nice', '-n', '19'] : ['nice', '-n', '19'];

/** A temp file name no other call can share: pid + time alone collided when the three variant probes started in the same
 *  millisecond (10-23: three conversions wrote ONE file, the probe got a cut file and ffmpeg failed to seek in it). */
let tempSeq = 0;
export const tempFlac = (dir) => join(dir, `media-asr-${process.pid}-${Date.now()}-${++tempSeq}-${Math.random().toString(36).slice(2, 8)}.flac`);

/** A child's stderr for a reason line: the lines that NAME the failure (the failing command, the error, a kill) first, then
 *  the tail — a Python traceback's tail alone hid the command (10-23 watchdog). */
export function errSummary(err = '') {
  const lines = String(err).split('\n').map((l) => l.trim()).filter((l) => l && !/^\^+$/.test(l));
  const named = lines.filter((l) => /Command '|returned non-zero|Error:|error:|Killed|out of memory|No such file|Invalid data|signal/i.test(l)).slice(0, 3);
  const tail = lines.slice(-2).filter((l) => !named.includes(l));
  return [...named, ...tail].join(' | ').slice(0, 600);
}

/** Run a command at nice 19 → { code, stdout, stderr }; rejects on a non-zero exit with the stderr tail.
 *  stop: () => boolean, polled every pollMs — true (the service is draining) kills the child and rejects with DrainAbort, so a
 *  long transcription never holds a drain (10-21: a 37-minute stage parked every reports lane). */
export const liveChildren = () => live.size;
export async function run(cmd, args, o = {}) {
  const cls = process.env.MEDIA_TOWER_HEAVY === '1' ? 'free' : towerClass(cmd, args);
  if (cls === 'refuse') throw new WorkerWait(`${String(cmd).split('/').pop()} ${(args.find((x) => /media_tool\.py$/.test(String(x))) ? args[args.indexOf(args.find((x) => /media_tool\.py$/.test(String(x)))) + 1] : '')}`.trim());
  const release = await towerAdmit(cls, String(cmd).split('/').pop());
  try { return await runNow(cmd, args, o); } finally { release(); }
}
function runNow(cmd, args, { timeoutMs = 6 * 3600_000, env = {}, threads = null, input = null, inputFile = null, onStdout = null, stop = null, pollMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const tenv = threads ? { OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads), OPENBLAS_NUM_THREADS: String(threads) } : {};
    const p = spawn(LOW[0], [...LOW.slice(1), cmd, ...args], { env: { ...process.env, ...tenv, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    live.add(p);
    p.on('exit', () => live.delete(p));
    let out = '', err = '', stopped = false;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    const poll = stop ? setInterval(() => { if (!stopped && stop()) { stopped = true; p.kill('SIGTERM'); setTimeout(() => p.kill('SIGKILL'), 5000).unref?.(); } }, pollMs) : null;
    p.stdout.on('data', (d) => { if (onStdout) onStdout(d); else out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
    p.on('error', (e) => { clearTimeout(timer); if (poll) clearInterval(poll); reject(e); });
    p.on('close', (code, sig) => {
      clearTimeout(timer); if (poll) clearInterval(poll);
      if (stopped) reject(new DrainAbort(cmd.split('/').pop()));
      else if (code === 0) resolve({ code, stdout: out, stderr: err });
      else reject(new Error(`${cmd.split('/').pop()} exit ${code ?? sig}: ${errSummary(err)}`));
    });
    p.stdin.on('error', () => {});   // a killed child closes its stdin under us
    if (inputFile) {
      const source=createReadStream(inputFile);
      source.on('error',e=>{p.stdin.destroy();reject(e);});p.on('close',()=>source.destroy());source.pipe(p.stdin);
    } else if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

/** The Python worker: one subcommand → its JSON (the last stdout line). */
export async function tool(sub, input, opts = {}, { python = PY(), threads = defaultThreads(), timeoutMs, stop = null } = {}) {
  const args = [TOOL, sub, input, '--threads', String(threads)];
  for (const [k, v] of Object.entries(opts)) {
    if (v === true) args.push(`--${k}`);
    else if (v != null && v !== false && v !== '') args.push(`--${k}`, String(v));
  }
  const { stdout } = await run(python, args, { threads, timeoutMs, stop, env: { CUDA_VISIBLE_DEVICES: '' } });   // tower's CUDA driver is mismatched: CPU only
  const line = stdout.trim().split('\n').filter(Boolean).pop();
  try { return JSON.parse(line); } catch { throw new Error(`media_tool ${sub}: no JSON result (${String(line).slice(0, 200)})`); }
}

// ── ASR on boss (measured 10-21: Zen 5 runs Whisper turbo at RTF 0.06 vs 0.36 on tower's Xeons; tower's search stays
// untouched). Through a forced-command key (scripts/media/boss-asr-gate.sh): audio on stdin, JSON on stdout. ──
/** The machines that may run media work: config/media-hosts.json (or MEDIA_HOSTS="name[=gate path],…"). Names only — what each one
 *  can do (cores, RAM, GPU vendor and free memory, heat) is read from the machine itself (the gate's 'df'), and roles follow from that. */
let registryFile = null;
export function hostRegistry(env = process.env) {
  if (env.MEDIA_HOSTS != null) return env.MEDIA_HOSTS.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [name, gate] = x.split('='); return { name, gate }; });
  registryFile ??= (() => { try { return JSON.parse(readFileSync(new URL('../../../config/media-hosts.json', import.meta.url), 'utf8')).hosts || []; } catch { return []; } })();
  return registryFile;
}
/** A host's profile: how to reach it ('ssh-docker' = ssh + docker; 'gate' = the restricted forced-command gate), where its job folders live,
 *  how it runs docker, its legacy GPU lock. The GPU vendor is NOT here: it is read from the machine (hostVendor). */
export function hostProfile(name) {
  const h = hostRegistry().find((x) => x.name === name) || {};
  return { name, transport: h.transport || 'ssh-docker', root: h.root || '/data/sifter-whole-home', docker: h.docker || 'docker', gpu_lock: h.gpu_lock || null, gate: h.gate };
}
export const hostCores = (name) => diskInfo.get(name)?.cpu_cores || null;
/** 'nvidia' | 'amd' | 'cpu', from the telemetry the machine reports. */
export const hostVendor = (name) => { const d = diskInfo.get(name); return d?.gpu_free_mb != null ? 'nvidia' : d?.vram_free_mb != null ? 'amd' : 'cpu'; };
const hasGpu = (d) => d && (d.gpu_free_mb != null || d.vram_free_mb != null);
const gpuRoom = (d) => d?.gpu_free_mb ?? d?.vram_free_mb ?? 0;
/** Registered hosts, most capable first: GPU hosts by free GPU memory, then by cores. */
export function rankedRegistry() {
  return hostRegistry().map((h) => h.name).sort((a, b) => { const x = diskInfo.get(a), y = diskInfo.get(b); return (hasGpu(y) - hasGpu(x)) || (gpuRoom(y) - gpuRoom(x)) || ((y?.cpu_cores || 0) - (x?.cpu_cores || 0)); });
}
/** The host for CPU-side work (render, encode, long probes): the registered host with the most cores (MEDIA_ASR_HOST overrides; '' → none). */
export const asrHost = () => {
  if (process.env.MEDIA_ASR_HOST != null) return process.env.MEDIA_ASR_HOST || null;
  const names = hostRegistry().map((h) => h.name);
  return names.sort((a, b) => ((diskInfo.get(b)?.cpu_cores || 0) - (diskInfo.get(a)?.cpu_cores || 0)))[0] || null;
};
// ── REMOTE DISK (10-23 16:09: aorus's disk filled with job folders — 28 failures "No space left on device", the GPU idle):
// a host with < MEDIA_HOST_MIN_FREE_GB (20) free takes no NEW job; its free space (gate 'df') is re-read at most every
// minute, in the background — a picker never waits on it. Unknown → OK (an unreachable host fails on its own).
// + RAM (10-23 host monitor: boss — 31 GB of system RAM, the rest is its iGPU's — at 8 % free and 16 GB of swap with six
// transcriptions; aorus — 15 GB — OOM-killed python six times): a NEW job goes to a host only when MemAvailable covers the
// job's budget plus the host's reserve. Both read from the gate's 'df' at most every 30 s, in the background.
const diskInfo = new Map();   // host → { free_gb, used_pct, mem_avail_gb, at, warnedAt }
const diskMinGb = () => Number(process.env.MEDIA_HOST_MIN_FREE_GB) || 20;
/** RAM a job of each kind needs on a compute host (GB, measured RSS + headroom). */
export const PSI_ADMIT_MAX = Number(process.env.MEDIA_PSI_ADMIT_MAX ?? 3);   // % of the last 10 s some task stalled on memory: above this no NEW job is admitted
// measured 10-28 on boss: a UniPASE job = ~2.2 GB RSS (system RAM), 5-6 GB VRAM, 8 MB GTT
export const MEM_BUDGET = { unipase: 3, post: 6, whole: 8, transcribe: 3, diarize: 2, dfn: 2, grade: 2, probe: 1.5, encode: 0.5 };
/** RAM kept free on a host whatever runs (GB): a share of ITS OWN measured total (no per-machine table), so a 15 GB box keeps ~2 GB and a
 *  128 GB box ~15 GB. Other tenants (a coding model, services) are already out of MemAvailable and memory pressure (PSI) is checked
 *  separately; every remote job is also capped by its own cgroup (scripts/media/capped.sh). MEDIA_MEM_RESERVE_FRAC / _MIN_GB tune ALL hosts. */
export const memReserveFor = (totalGb) => Math.max(Number(process.env.MEDIA_MEM_RESERVE_MIN_GB) || 2, (Number(totalGb) || 0) * (Number(process.env.MEDIA_MEM_RESERVE_FRAC) || 0.12));
const memReserve = (host) => memReserveFor(diskInfo.get(host)?.mem_total_gb);
/** GPU memory each kind needs on the GPU host (MiB; measured resident + load peak). */
export const VRAM_NEED_MB = { whole: 8000, unipase: 6000, transcribe: 3500, probe: 2000, dfn: 1500, grade: 1200, diarize: 1536 };
const gpuReserved = new Map();   // host → [{ mb, at }] dispatched, maybe not resident yet
/** Count a job just dispatched to the GPU host against its free memory until the next readings show it. */
// A reservation ends when its job ENDS (release → the reading is re-taken at once) or when a reading taken ≥ 30 s after the
// dispatch shows it resident (20:50: a 3.5 GB hold outlived its short job by a minute and aorus sat idle between talks).
export function reserveGpu(host, kind, now = Date.now()) {
  if (!VRAM_NEED_MB[kind]) return () => {};   // diskOk reads telemetry, not host names
  const r = { mb: VRAM_NEED_MB[kind], at: now };
  gpuReserved.set(host, [...(gpuReserved.get(host) || []).filter((x) => now - x.at < 90_000), r]);
  return () => { gpuReserved.set(host, (gpuReserved.get(host) || []).filter((x) => x !== r)); staleDisk(host); };
}
/** A job ended on this host: the next check re-reads its memory instead of trusting a reading taken while it ran. */
export function staleDisk(host) { const d = diskInfo.get(host); if (d) d.at = 0; }
const pendingVram = (host, d, now) => (gpuReserved.get(host) || []).filter((x) => now - x.at < 90_000 && !(d.at && d.at - x.at >= 30_000)).reduce((n, x) => n + x.mb, 0);
export function noteDisk(host, info, now = Date.now()) { diskInfo.set(host, { ...(diskInfo.get(host) || {}), ...info, at: now }); }
/** May a NEW job of `kind` go to this host now? (disk ≥ 20 GB free; RAM ≥ the kind's budget + the host's reserve) */
export function diskOk(host, { now = Date.now(), refresh = refreshDisk, kind = null, needGb = null } = {}) {
  if (!host) return true;
  const d = diskInfo.get(host);
  if ((!d || now - d.at > 30_000) && !d?.pending) { noteDisk(host, { pending: true }, d?.at ?? 0); refresh(host).catch(() => {}).finally(() => { const x = diskInfo.get(host); if (x) x.pending = false; }); }
  if (!d) return true;
  const why = [];
  if (d.free_gb != null && d.free_gb < diskMinGb()) why.push(`${d.free_gb} GB disk free (< ${diskMinGb()} GB)`);
  // VRAM on the GPU host (10-23 20:12: a DFN job OOM'd beside two transcriptions): free − what this process dispatched
  // there in the last 90 s (not resident yet) must cover the kind's need
  const vneed = d.gpu_free_mb != null ? VRAM_NEED_MB[kind] : null;   // NVIDIA: nvidia-smi free memory
  if (vneed && d.gpu_free_mb != null) {
    const pending = pendingVram(host, d, now);
    if (d.gpu_free_mb - pending < vneed + 300) why.push(`${d.gpu_free_mb - pending} MiB GPU memory free (< ${vneed + 300} for a ${kind})`);
  }
  // a unified-memory host (boss: 31 GB system RAM + a 96 GB GPU carve-out): the GPU pool is admitted by VRAM FREE, system RAM by MemAvailable AND by pressure
  // (PSI some avg10 — the best early-OOM signal; Chad 10-28). `free` alone would call a box with 63 GB of VRAM in use "idle".
  if (kind && d.vram_free_mb != null && d.gpu_free_mb == null && VRAM_NEED_MB[kind]) {   // AMD: amdgpu sysfs (unified memory shares system RAM)
    const pendingV = pendingVram(host, d, now);
    if (d.vram_free_mb - pendingV < VRAM_NEED_MB[kind] + 1500) why.push(`${d.vram_free_mb - pendingV} MiB VRAM free of ${Math.round((d.vram_total_gb || 0) * 1024)} (< ${VRAM_NEED_MB[kind] + 1500} for a ${kind})`);
  }
  if (kind && d.psi_some10 != null && d.psi_some10 > PSI_ADMIT_MAX) why.push(`memory pressure ${d.psi_some10} % (> ${PSI_ADMIT_MAX} %)`);
  const need = (needGb ?? MEM_BUDGET[kind] ?? 0) + memReserve(host);
  if (kind && d.mem_avail_gb != null && d.mem_avail_gb < need) why.push(`${d.mem_avail_gb} GB RAM available (< ${Math.round(need * 10) / 10} GB for a ${kind})`);
  if (why.length && (!d.warnedAt || now - d.warnedAt > 10 * 60_000)) { d.warnedAt = now; console.warn(`[media] WARN ${host}: ${why.join(', ')} — no new jobs there`); }
  return !why.length;
}
async function refreshDisk(host, { exec = run } = {}) {
  const { stdout } = await exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, 'df')], { timeoutMs: 30_000 });
  const j = JSON.parse(stdout.trim().split('\n').pop());
  setImmediate(() => { for (const w of asrWaiters.splice(0)) w(); });   // a fresh reading may admit a waiting transcription
  if (j.free_gb != null) noteDisk(host, { free_gb: j.free_gb, used_pct: j.used_pct, mem_avail_gb: j.mem_avail_gb ?? null, gpu_temp: j.gpu_temp ?? null, cpu_tctl: j.cpu_tctl ?? null, gpu_free_mb: j.gpu_free_mb ?? null, mem_total_gb: j.mem_total_gb ?? null, psi_some10: j.psi_some10 ?? null, psi_full10: j.psi_full10 ?? null, vram_total_gb: j.vram_total_gb ?? null, vram_used_gb: j.vram_used_gb ?? null, vram_free_mb: j.vram_free_mb ?? null, gtt_total_gb: j.gtt_total_gb ?? null, gtt_used_gb: j.gtt_used_gb ?? null, gpu_busy: j.gpu_busy ?? null, cpu_cores: j.cpu_cores ?? null, pending: false });
  return j;
}
/** HEAT: one policy for every machine, applied to whichever sensors it reports. GPU ≥ 83 °C → 1 job; CPU (measured 10-28: a 70 s full
 *  load holds Tctl at 90-92 °C with no throttling) halves the slots at 96 °C, pauses new jobs at 99 °C, resumes below 93 °C (hysteresis). */
export const HEAT = { gpu: 83, slots: 96, pause: 99, resume: 93 };
/** How many jobs of one kind this host can take AT THIS MOMENT. `configured` is only the floor used while the host reports nothing; with a
 *  fresh reading the ceiling is its own core count (CORES_PER_JOB each) and the real limit is live admission (diskOk: free RAM, VRAM,
 *  memory pressure, disk) plus heat. A GPU already saturated (busy ≥ 95 %) takes no more than it is running. */
export const CORES_PER_JOB = 2;
export function slotCeiling(host, configured, busyNow = 0, { now = Date.now() } = {}) {
  const d = diskInfo.get(host);
  if (!d?.cpu_cores || now - (d.at || 0) > 5 * 60_000) return configured;
  if (d.gpu_busy != null && d.gpu_busy >= 95 && busyNow >= 1) return Math.max(1, busyNow);
  return Math.max(configured, Math.floor(d.cpu_cores / CORES_PER_JOB));
}
export function thermalSlots(host, base, { now = Date.now() } = {}) {
  const d = diskInfo.get(host);
  if (!d || now - (d.at || 0) > 5 * 60_000) return base;   // no fresh reading: as configured
  let n = base;
  if (d.gpu_temp != null && d.gpu_temp >= HEAT.gpu) n = Math.min(n, 1);
  const t = d.cpu_tctl;
  if (t != null) { if (t >= HEAT.pause) d.heatPaused = true; else if (t < HEAT.resume) d.heatPaused = false; }
  if (d.heatPaused) n = 0;
  else if (t != null && t >= HEAT.slots) n = Math.min(n, Math.max(1, Math.floor(base / 2)));
  if (n < base && (!d.heatWarnedAt || now - d.heatWarnedAt > 10 * 60_000)) { d.heatWarnedAt = now; console.warn(`[media] WARN ${host} hot (GPU ${d.gpu_temp} °C, CPU ${d.cpu_tctl} °C): ${n} of ${base} slots`); }
  return n;
}
/** May a host take CPU-side work (probes) now? Not when warm (GPU ≥ 80 °C or CPU ≥ 96 °C). */
export const coolEnough = (host) => { const d = diskInfo.get(host); if (!d) return true; return !d.heatPaused && (d.gpu_temp ?? 0) < 80 && (d.cpu_tctl ?? 0) < HEAT.slots; };
/** A GRADE's RAM: it decodes the whole recording at its native rate (several float32 copies) besides DNSMOS/NISQA —
 *  10-23 19:15 the OOM killer took one on aorus at 7.7 GB. → GB */
export const gradeNeedGb = (durationS = 3600, sampleRate = 48000) => Math.round((1.5 + (durationS || 3600) * (sampleRate || 48000) * 4 * 4 / 1e9) * 10) / 10;
/** The REMASTER word guard on tower (scripts/media/remaster_guard.py; CPU, numpy): the UniPASE copy with every sentence
 *  whose words it lost replaced by the original. opts: { original, unipase, work, asr, ref, af, output, report } → its JSON */
export const GUARD = join(ROOT, 'scripts', 'media', 'remaster_guard.py');
export async function remasterGuard(opts, { stop = null, python = PY() } = {}) {
  const args = [GUARD];
  for (const [k, v] of Object.entries(opts)) if (v != null && v !== '') args.push(`--${k}`, String(v));
  const { stdout } = await run(python, args, { timeoutMs: 3 * 3600_000, stop, threads: 2 });
  return JSON.parse(stdout.trim().split('\n').filter(Boolean).pop());
}
/** Remove a finished job's folder on its host (best effort; the gate refuses a running one and its janitor sweeps the rest). */
export async function cleanRemote(host, job, { exec = run } = {}) {
  const { stdout } = await exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, `clean ${job}`)], { timeoutMs: 60_000 });
  return /"cleaned":true/.test(stdout);
}

export function asrHosts() {
  // slots here are only the FLOOR used before a host has reported; slotCeiling() grows them from the host's live capacity
  if (process.env.MEDIA_ASR_HOSTS) return process.env.MEDIA_ASR_HOSTS.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [host, n] = x.split(':'); return { host, slots: Math.max(1, Number(n) || 1) }; });
  return rankedRegistry().map((host) => ({ host, slots: 1 }));
}
const asrBusy = new Map();   // host → jobs this process has in hand there
/** The host for a NEW transcription: the first (fastest) with a free slot, else the least loaded. Re-attached jobs keep
 *  their own host (meta.asr_job.host). */
export function pickAsrHost(hosts = asrHosts(), busy = asrBusy) {
  if (!hosts.length) return null;
  const free = hosts.find((h) => (busy.get(h.host) || 0) < h.slots);
  if (free) return free.host;
  return hosts.slice().sort((a, b) => (busy.get(a.host) || 0) / a.slots - (busy.get(b.host) || 0) / b.slots)[0].host;
}
/** Where the ENHANCE probes go (three 1-minute excerpts × each variant): the GPU host when there is one — on a loaded boss they
 *  took most of enhance's 270–720 s (10-22) — else the ASR host. */
export const probeHost = () => gpuHost() || asrHost();
/** PROBE SLOTS per host (10-23: up to 24 probes at once filled aorus's 15 GB of RAM — its /tmp is RAM — and ffmpeg died with
 *  CalledProcessError): the GPU host takes 2 at a time, the ASR host 3; a probe goes where a slot is free, the GPU host first.
 *  fn(host) → its result. */
const probeBusy = new Map();
const probeWaiters = [];
// probes: aorus 4 (its GPU memory lock paces them; ~10 s each) before boss 2 (~80 s each on CPU) — 07:37: 16 prep runs all
// waiting in enhance on probes queued for boss
export async function withProbeHost(fn, { long = false, hosts = [...(long ? [[asrHost(), 3]] : [[gpuHost(), 4], [asrHost(), 2]]), ...(long ? [] : poolHosts().map((h) => [h, POD_SLOTS.probe]))].filter(([h]) => h) } = {}) {
  // long: a recording over 90 min is probed on boss only (128 GB) — decoding it whole beside two transcriptions ran aorus's
  // 15 GB out (10-23: Taherzadeh's 2½-hour talks failed enhance three times)
  const uniq0 = hosts.filter(([h], i) => hosts.findIndex(([x]) => x === h) === i);
  const okHost = ([h]) => diskOk(h, { kind: 'probe' }) && coolEnough(h);   // no probes on a warm aorus (10-23 heat)
  const uniq = uniq0.filter(okHost).length ? uniq0.filter(okHost) : uniq0.filter(([h]) => coolEnough(h));
  if (!uniq.length) return fn(null);
  let host = null;
  for (;;) {
    host = uniq.find(([h, n]) => (probeBusy.get(h) || 0) < slotCeiling(h, n, probeBusy.get(h) || 0))?.[0] || null;
    if (host) break;
    await slotWait(probeWaiters, 'a probe host');
  }
  probeBusy.set(host, (probeBusy.get(host) || 0) + 1); const unreserve = reserveGpu(host, 'probe');
  try { return await fn(host); } finally { unreserve(); probeBusy.set(host, probeBusy.get(host) - 1); probeWaiters.shift()?.(); }
}
/** Why pickAsrHost chose a host (the dispatch log line). */
export function asrPickReason(host, hosts = asrHosts(), busy = asrBusy) {
  return hosts.map((h) => `${h.host} ${busy.get(h.host) || 0}/${h.slots}`).join(', ') + ` → ${host}`;
}
export const asrLoad = () => Object.fromEntries(asrHosts().map((h) => [h.host, { busy: asrBusy.get(h.host) || 0, slots: h.slots }]));

/** A host whose sshd is bypassed by Tailscale SSH (aorus: tower's key lands in a shell, not the forced command) runs the gate
 *  explicitly: MEDIA_GATE_<HOST>=<path to asr-gate.sh>. The gate still checks every verb and argument (its charset has no quote). */
export function gateWrap(host, cmd) {
  const gate = process.env[`MEDIA_GATE_${String(host || '').toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? hostRegistry().find((h) => h.name === host)?.gate ?? (isPod(host) ? GATE_PATH : undefined);   // a pod's ssh lands in a shell: the gate by path
  return gate ? `SSH_ORIGINAL_COMMAND='${String(cmd).replace(/'/g, '')}' ${gate}` : cmd;
}
export const asrThreads = () => Number(process.env.MEDIA_ASR_THREADS) || Math.max(4, Math.floor(BOSS_THREADS / mediaParallel()) - 2);
let installedOn = null;

/** The remote command line for the gate (one token per option; the prompt travels base64). Pure. */
export function gateCommand(sub, ext, opts = {}) {
  const parts = [sub, ext];
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'prompt') { if (v) parts.push(`--prompt-b64=${Buffer.from(String(v)).toString('base64')}`); continue; }
    if (k === 'output' || k === 'models') continue;
    if (v === true) parts.push(`--${k}`);
    else if (v != null && v !== false && v !== '') parts.push(`--${k}`, String(v));
  }
  return parts.join(' ');
}

/** probe / langid / transcribe on the ASR host: the audio is sent as 16 kHz mono FLAC (all Whisper uses). A transcribe
 *  result is written to opts.output. Falls back to tower when the host is unreachable. */
export async function asr(sub, input, opts = {}, { host = asrHost(), threads = asrThreads(), timeoutMs = 6 * 3600_000, local = tool, stop = null } = {}) {
  if (!host) return local(sub, input, opts, { timeoutMs, stop });
  const { tmpdir } = await import('os');
  const { readFile, writeFile, unlink } = await import('fs/promises');
  const flac = tempFlac(tmpdir());
  try {
    // the ASR host runs THIS checkout's media_tool.py: installed through the gate once per process (and after a deploy)
    if (installedOn !== host) { await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, 'install-tool')], { timeoutMs: 60_000, input: await readFile(TOOL) }); installedOn = host; }
    await convSlot(() => run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '2', '-i', input, '-threads', '2', '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-c:a', 'flac', flac], { timeoutMs: 1800_000, stop }));
    const cmd = gateCommand(sub, 'flac', { ...opts, threads });
    const { stdout } = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, gateWrap(host, cmd)], { timeoutMs, stop, input: await readFile(flac) });
    if (sub === 'transcribe') {
      const j = JSON.parse(stdout);
      await writeFile(opts.output, stdout);
      return { output: opts.output, language: j.language, segments: j.segments.length, timings: j.timings, duration_s: j.duration_s, host,
        seconds: Object.values(j.timings || {}).reduce((a, b) => a + b, 0) };
    }
    const r = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop());
    if (r.error) throw new Error(`asr gate: ${r.error}`);
    return { ...r, host };
  } catch (err) {
    if (err.code !== 'DRAIN' && /ssh exit 255|Connection|timed out|No route/i.test(err.message)) return await local(sub, input, opts, { timeoutMs, stop });   // host unreachable → tower
    throw err;
  } finally { await unlink(flac).catch(() => {}); }
}

// ── DETACHED long work (survives this service's drains and restarts; 10-22: deploys every few minutes kept killing a
// 15-minute transcription, so a 92-minute talk might never finish). The stage records the job; a resumed stage re-attaches.

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** A transcription on the ASR host as a detached job: start (unless `job` is already known there), poll every pollMs,
 *  fetch. A drain (stop()) leaves the remote job RUNNING and throws DrainAbort — the resumed stage picks it up.
 *  → { output, host, job, reattached } */
// count: a TRANSCRIPTION holds one of its host's ASR slots; a diarization does not (10-23: boss's four diarizations filled
// the ASR pool and nothing went to aorus). reserved: the slot was taken by acquireAsrHost already.
export async function asrJob(input, opts = {}, { host = asrHost(), count = true, reserved = false, ...rest } = {}) {
  if (count && !reserved) asrBusy.set(host, (asrBusy.get(host) || 0) + 1);
  try { return await asrJobOn(input, opts, { host, ...rest }); } finally { if (count && !reserved) releaseAsr(host); }   // a reserved slot: the caller releases it
}
const asrWaiters = [];
function releaseAsr(host) { asrBusy.set(host, Math.max(0, (asrBusy.get(host) || 1) - 1)); staleDisk(host); asrWaiters.shift()?.(); }
/** A host with a FREE transcription slot (fastest first), the slot taken at once — waits while every host is full, so new
 *  transcriptions queue here instead of piling onto a busy host. release() if the job is never started. */
// the HOST's own count of live transcriptions (gate 'running transcribe'), at most every 15 s per host: after a restart,
// jobs started before it are re-attached only when their lane run is claimed, and a new dispatch could take their slot
// first (10-23 16:4x: three transcriptions on aorus, cap 2 — the diarization cap's twin)
const asrRemote = new Map();   // host → { n, at }
async function remoteAsrCount(host, { now = Date.now(), running = runningOn } = {}) {
  const c = asrRemote.get(host);
  if (c && now - c.at < 15_000) return c.n;
  const ids = await running(host, 'transcribe').catch(() => null);
  const n = Array.isArray(ids) ? ids.length : null;
  asrRemote.set(host, { n, at: now });
  return n;
}
export async function acquireAsrHost(hosts = asrHosts(), { running = runningOn, stop = null } = {}) {
  if (!hosts.length) return { host: null, release: () => {} };
  for (;;) {
    if (stop?.()) throw new DrainAbort('transcription waiting for a host slot');   // a drain never waits on a slot
    let h = null;
    for (const x of hosts) {
      const slots = thermalSlots(x.host, slotCeiling(x.host, x.slots, asrBusy.get(x.host) || 0));   // as many as it can take now; fewer when hot
      if ((asrBusy.get(x.host) || 0) >= slots || !diskOk(x.host, { kind: 'transcribe' })) continue;
      const remote = await remoteAsrCount(x.host, { running });
      if (remote != null && Math.max(remote, asrBusy.get(x.host) || 0) >= slots) continue;
      if ((asrBusy.get(x.host) || 0) < slots) { h = x; break; }   // re-checked after the await
    }
    if (h) { const unreserve = reserveGpu(h.host, 'transcribe'); asrBusy.set(h.host, (asrBusy.get(h.host) || 0) + 1); let done = false; return { host: h.host, release: () => { if (!done) { done = true; unreserve(); releaseAsr(h.host); } } }; }
    // a slot frees here, or 20 s pass (a job of a previous process finished on its host; a host low on disk was cleaned)
    await new Promise((r) => { const t = setTimeout(() => { const i = asrWaiters.indexOf(go); if (i >= 0) asrWaiters.splice(i, 1); r(); }, 5_000); const go = () => { clearTimeout(t); r(); }; asrWaiters.push(go); });
  }
}
const diarBusy = new Map();
const diarWait = new Map();
// per host: aorus 2 (≈1.5 GB RAM each on a 15 GB box beside two transcriptions; 10-23 watch: 6 at once, load 55, 3 GB free)
// aorus diarizes on its GPU (venv-diar: sherpa-onnx built for CUDA; 600 s of audio in ~100 s at ONE CPU thread, vs boss's
// CPU 112 s at 4 threads under load) — 2 at a time, ≥ 1.5 GB free or its CPU; boss is the overflow at 3 (10-23)
// a slot is a JOB ID held on its host; a new diarization starts only while BOTH this process's ids and the ids the host
// reports running (gate verb 'running diarize') stay under the cap. 10-23 14:30: after a restart four re-attached jobs sat
// on aorus (cap 2); each one that finished woke a waiter that never re-checked the cap, so aorus ran 3 all afternoon.
const diarIds = new Map();
const idsOn = (h) => diarIds.get(h) || diarIds.set(h, new Set()).get(h);
const syncBusy = (h) => diarBusy.set(h, idsOn(h).size);
const wakeDiar = (h) => diarWait.get(h)?.shift()?.();
const waitDiar = (h, ms) => new Promise((r) => {
  if (!diarWait.has(h)) diarWait.set(h, []);
  const q = diarWait.get(h); let t = null;
  const go = () => { clearTimeout(t); const i = q.indexOf(go); if (i >= 0) q.splice(i, 1); r(); };
  q.push(go); if (ms) t = setTimeout(go, ms);
});
let diarSeq = 0;
export async function diarSlot(host, fn, slots0 = 1, { job = `local-${++diarSeq}`, running = null, recheckMs = 30_000, stop = null } = {}) {
  for (;;) {
    const slots = slotCeiling(host, slots0, idsOn(host).size);
    // a drain must never wait on a slot (10-23 18:00: one diarization waiting here held the media drain 12+ min)
    while (idsOn(host).size >= slots) { if (stop?.()) throw new DrainAbort(`diarize waiting for a slot on ${host}`); await waitDiar(host, Math.min(5_000, recheckMs)); }   // a WHILE: whoever woke us, the cap is checked again
    if (stop?.()) throw new DrainAbort(`diarize waiting for a slot on ${host}`);
    const remote = running ? await running().catch(() => null) : null;
    const all = new Set([...idsOn(host), ...(remote || [])]);
    all.delete(job);
    if (all.size < slots && idsOn(host).size < Math.min(slots, Math.max(1, thermalSlots(host, slots))) && diskOk(host, { kind: 'diarize' }) && thermalSlots(host, slots) > 0) break;
    await waitDiar(host, recheckMs);   // full with jobs this process does not hold, or short of RAM / disk: look again shortly
  }
  idsOn(host).add(job); syncBusy(host); const unreserve = reserveGpu(host, 'diarize');
  try { return await fn(); } finally { unreserve(); idsOn(host).delete(job); syncBusy(host); wakeDiar(host); }
}
async function countDiar(host, fn, job = `local-${++diarSeq}`) { idsOn(host).add(job); syncBusy(host); try { return await fn(); } finally { idsOn(host).delete(job); syncBusy(host); wakeDiar(host); } }
/** Stop a detached job on its host (gate 'cancel <job>'): an excluded talk's transcription / diarization / DFN. */
export async function cancelRemote(host, job, { exec = run } = {}) {
  const { stdout } = await exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, `cancel ${job}`)], { timeoutMs: 30_000 });
  return /cancelled/.test(stdout);
}
/** The ids of the diarizations a host is running (gate 'running diarize'); null when it cannot say. */
export async function runningOn(host, verb = 'diarize', { exec = run } = {}) {
  const { stdout } = await exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, `running ${verb}`)], { timeoutMs: 30_000 });
  const j = JSON.parse(stdout.trim().split('\n').pop());
  return Array.isArray(j.running) ? j.running : null;
}
/** A diarization's host when it is DISPATCHED: aorus while it has a free diarization slot, else boss (its CPU) — the rest
 *  stay on boss (10-23 watch). */
export function pickDiarHost(busy = diarBusy) {
  const all = [gpuHost(), asrHost()].filter(Boolean).filter((h, i, a) => a.indexOf(h) === i);   // the GPU host first
  const order = all.filter((h) => diskOk(h, { kind: 'diarize' }));   // never onto a full disk or a host short of RAM
  if (!order.length) return all[0] || null;   // every host short: the first (its slot wait paces it)
  return order.find((h) => (busy.get(h) || 0) < slotCeiling(h, 1, busy.get(h) || 0)) || order[0] || null;
}
/** Where diarizations run: aorus's CPU (24 threads, idle beside its GPU transcriptions) unless set (MEDIA_DIAR_HOST). */
export const diarHost = () => process.env.MEDIA_DIAR_HOST ?? asrHost();
async function asrJobOn(input, opts = {}, { host, threads = asrThreads(), job, stop = null, pollMs = null, onStart = async () => {}, exec = run } = {}) {
  const ssh = (cmd, o = {}) => exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, gateWrap(host, cmd)], { timeoutMs: 600_000, ...o });
  const state = async () => { const { stdout } = await ssh(`poll ${job}`); return JSON.parse(stdout.trim().split('\n').pop()); };
  let st = await state().catch(() => ({ state: 'missing' }));
  const reattached = st.state === 'running' || st.state === 'done';
  if (!reattached) {
    const { tmpdir } = await import('os');
    const { readFile, unlink } = await import('fs/promises');
    if (installedOn !== host) { await ssh('install-tool', { timeoutMs: 60_000, input: await readFile(TOOL) }); installedOn = host; }
    // the audio file AS IS (the ASR host decodes it; media_tool loads through ffmpeg): no tower conversion at the lowest IO
    // priority in the way (13:48 dispatch → still not started 13:57, while the ASR slot was held). A file over 800 MB is
    // converted to 16 kHz first (a LAN upload of that size would take longer than the decode)
    const { stat } = await import('fs/promises');
    const ext = (input.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const size = (await stat(input).catch(() => null))?.size || 0;
    const direct = /^(flac|wav|mp3|m4a|ogg|opus|webm|aac|wma|mp4|mka)$/.test(ext) && size > 0 && size < 800 * 2 ** 20;
    const flac = direct ? input : tempFlac(tmpdir());
    try {
      if (!direct) await asrConvSlot(() => exec('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '2', '-i', input, '-threads', '2', '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-c:a', 'flac', flac], { timeoutMs: 1800_000, stop }));
      const e = direct ? ext : 'flac';
      await ssh(`start ${e} ${job} ${gateCommand('x', e, { ...opts, threads }).split(' ').slice(2).join(' ')}`, { input: await readFile(flac).catch(() => Buffer.alloc(0)) });
    } finally { if (!direct) await unlink(flac).catch(() => {}); }
    await onStart();
    st = { state: 'running' };
  }
  // poll 2 s, growing to 8 s (21:05: a 15 s poll held a finished short talk's slot up to 15 s — aorus ran 1 of 2 slots)
  let every = pollMs ?? 2000;
  for (;;) {
    if (st.state === 'done') break;
    if (st.state === 'failed' || st.state === 'missing') throw new Error(`asr job ${job} ${st.state}: ${String(st.error || '').slice(-300)}`);
    for (let waited = 0; waited < every; waited += Math.min(1000, every)) { if (stop?.()) throw new DrainAbort(`asr job ${job} (left running on ${host})`); await pause(Math.min(1000, every)); }
    if (pollMs == null) every = Math.min(8000, Math.round(every * 1.5));
    st = await state().catch(() => ({ state: 'running' }));   // a blip on the network is not a failure
  }
  const { stdout } = await ssh(`fetch ${job}`, { timeoutMs: 300_000 });
  const { writeFile } = await import('fs/promises');
  await writeFile(opts.output, stdout);
  await cleanRemote(host, job, { exec }).catch(() => {});   // the result is on tower: the job folder goes (10-23 disk leak)
  return { output: opts.output, host, job, reattached };
}

/** A tower-side tool as a DETACHED process (its pid in pidFile): a drain leaves it running; a resumed stage waits for it.
 *  → the tool's JSON (from its stdout file) */
export async function detachedTool(sub, input, opts = {}, { pidFile, threads = defaultThreads(), stop = null, pollMs = 2000, python = null } = {}) {
  const { readFile, writeFile } = await import('fs/promises');
  const { openSync, closeSync, existsSync } = await import('fs');
  const outFile = `${pidFile}.out`;
  // alive = that pid exists AND is our tool (a recycled pid must not be waited on)
  const alive = (pid) => { try { process.kill(pid, 0); } catch { return false; } try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('media_tool'); } catch { return true; } };
  let pid = Number(await readFile(pidFile, 'utf8').catch(() => 0)) || 0;
  if (!pid || !alive(pid)) {
    if (process.env.MEDIA_TOWER_HEAVY !== '1' && HEAVY_SUBS.has(sub)) throw new WorkerWait(`media_tool ${sub}`);   // (a job already running on tower is still re-attached above)
    if (pid && existsSync(outFile) && (await readFile(outFile, 'utf8')).trim()) return JSON.parse((await readFile(outFile, 'utf8')).trim().split('\n').pop());
    const args = [TOOL, sub, input, '--threads', String(threads)];
    for (const [k, v] of Object.entries(opts)) { if (v === true) args.push(`--${k}`); else if (v != null && v !== false && v !== '') args.push(`--${k}`, String(v)); }
    const out = openSync(outFile, 'w'), err = openSync(`${pidFile}.err`, 'w');
    const tenv = { OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads), OPENBLAS_NUM_THREADS: String(threads), CUDA_VISIBLE_DEVICES: '' };
    // through sh so the err file always ends with the EXIT STATUS (10-22: run 2584 'grade ended without a result: ' — no
    // stdout, no stderr; a kill leaves nothing else behind: 137 = SIGKILL / out of memory)
    const p = spawn('sh', ['-c', `${LOW.join(' ')} "$@"; echo "[exit $?]" >&2`, 'sh', python || PY(), ...args], { detached: true, stdio: ['ignore', out, err], env: { ...process.env, ...tenv } });
    p.unref(); closeSync(out); closeSync(err);
    pid = p.pid;
    await writeFile(pidFile, String(pid));
  }
  while (alive(pid)) { if (stop?.()) throw new DrainAbort(`${sub} (left running, pid ${pid})`); await pause(pollMs); }
  const text = (await readFile(outFile, 'utf8').catch(() => '')).trim();
  if (!text) {
    const err = (await readFile(`${pidFile}.err`, 'utf8').catch(() => '')).trim();
    throw new Error(`${sub} ended without a result: ${err ? err.split('\n').slice(-3).join(' | ').slice(0, 400) : `no stderr, no exit line (pid ${pid}; another run on this item truncated the files?)`}`);
  }
  return JSON.parse(text.split('\n').pop());
}

export async function ffprobe(path) {
  // WAV/ID3-wrapped mp3s: the first look can fail or give no duration — retry with a deeper probe before giving up
  let j;
  for (const extra of [[], ['-probesize', '100M', '-analyzeduration', '100M']]) {
    try { const { stdout } = await run('ffprobe', ['-v', 'error', ...extra, '-show_format', '-show_streams', '-of', 'json', path], { timeoutMs: 120_000 }); j = JSON.parse(stdout); if (Number(j.format?.duration) > 0) break; }
    catch (err) { if (extra.length) throw err; }
  }
  if (!j) throw new Error('ffprobe could not read the file');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const v = (j.streams || []).find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  return { duration_s: Number(j.format?.duration) || null, format: j.format?.format_name, bit_rate: Number(j.format?.bit_rate) || null,
    sample_rate: Number(a?.sample_rate) || null, channels: a?.channels || null, codec: a?.codec_name || null, has_video: !!v,
    tags: Object.fromEntries(Object.entries({ ...(j.format?.tags || {}) }).map(([k, x]) => [k.toLowerCase(), String(x).slice(0, 300)])) };
}

/** Tags + duration only, for the backfill: format-only look, deeper retry, never throws. → { ok, tags, duration_s, bit_rate, error? } */
export async function ffprobeTags(path) {
  let last = null;
  for (const extra of [[], ['-probesize', '100M', '-analyzeduration', '100M']]) {
    try {
      const { stdout } = await run('ffprobe', ['-v', 'error', ...extra, '-show_entries', 'format=duration,bit_rate:format_tags', '-of', 'json', path], { timeoutMs: 60_000 });
      const f = JSON.parse(stdout).format || {};
      return { ok: true, duration_s: Number(f.duration) || null, bit_rate: Number(f.bit_rate) || null,
        tags: Object.fromEntries(Object.entries(f.tags || {}).map(([k, x]) => [k.toLowerCase(), String(x).slice(0, 300)])) };
    } catch (err) { last = err; }
  }
  return { ok: false, tags: {}, duration_s: null, bit_rate: null, error: String(last?.message || last).slice(0, 160) };
}

/** An image's pixel size (ffprobe's first video stream). → { w, h } */
export async function imageSize(path) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path], { timeoutMs: 60_000 });
  const st = JSON.parse(stdout).streams?.[0] || {};
  return { w: Number(st.width) || 0, h: Number(st.height) || 0 };
}

// two threads per ffmpeg (10-23: unbounded ffmpeg took ~7 cores); towerLight runs 4 at once → ≤ 8 cores for prep
export const ffmpeg = (args, opts = {}) => run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '2', ...args.slice(0, -1), '-threads', '2', args.at(-1)], { timeoutMs: 3 * 3600_000, ...opts });   // opts.stop: drain-aware

/** Mono PCM (Float32 from s16le) at `sr`, streamed to onChunk — memory stays flat on long talks. */
export function pcmStream(path, sr, onChunk) {
  let rest = Buffer.alloc(0);
  return run('ffmpeg', ['-nostdin', '-v', 'error', '-i', path, '-ac', '1', '-ar', String(sr), '-f', 's16le', '-'], {
    timeoutMs: 3600_000,
    onStdout: (d) => {
      const buf = rest.length ? Buffer.concat([rest, d]) : d;
      const n = Math.floor(buf.length / 2);
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = buf.readInt16LE(i * 2) / 32768;
      rest = buf.subarray(n * 2);
      onChunk(f);
    },
  });
}

// ── search-latency governor ──
const PROBES = ['the purpose of life', 'station of the guardian', 'most great peace', 'the covenant', 'oneness of mankind', 'the soul after death',
  'prayer and meditation', 'the lesser peace', 'nineteen day feast', 'the house of justice', 'independent investigation of truth', 'the promised one'];
let probeN = 0;
/** One search through the gateway (first-party referer) → seconds, or null when unreachable. */
export async function searchLatency({ base = process.env.SIFTER_API || 'http://127.0.0.1:7839', fetchImpl = fetch } = {}) {
  const q = PROBES[probeN++ % PROBES.length];
  const t0 = Date.now();
  try {
    const r = await fetchImpl(`${base}/api/search/quick?q=${encodeURIComponent(q)}&limit=10`, { headers: { Referer: 'https://siftersearch.com/' }, signal: AbortSignal.timeout(20000) });
    await r.arrayBuffer();
    return r.ok ? (Date.now() - t0) / 1000 : null;
  } catch { return null; }
}

/** Threads for the next heavy stage: the default, halved (min 4) when search is slow (> slowS), quartered when very slow. */
export function threadsFor(latencies, { base = defaultThreads(), slowS = 3, verySlowS = 6 } = {}) {
  const xs = latencies.filter((x) => x != null).sort((a, b) => a - b);
  if (!xs.length) return base;
  const med = xs[Math.floor(xs.length / 2)];
  if (med > verySlowS) return Math.max(2, Math.floor(base / 4));
  if (med > slowS) return Math.max(4, Math.floor(base / 2));
  return base;
}

let rendererOn = null;
export const SHORT_TOOL = join(ROOT, 'scripts', 'media', 'render_short.py');
/** Render a short on the ASR host (boss CPU): the input dir goes as a tar, the MP4 comes back on stdout (binary). */
export async function renderShort(dir, { host = asrHost(), timeoutMs = 900_000, stop = null } = {}) {
  if (!host) throw new Error('no render host (MEDIA_ASR_HOST)');
  const { readFile } = await import('fs/promises');
  if (rendererOn !== host) { await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, 'install-renderer')], { timeoutMs: 60_000, input: await readFile(SHORT_TOOL) }); rendererOn = host; }
  const tar = [];
  await run('tar', ['-C', dir, '-cf', '-', '.'], { timeoutMs: 60_000, onStdout: (d) => tar.push(d), env: { COPYFILE_DISABLE: '1' } });
  const out = [];
  await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30', host, gateWrap(host, 'short')], { timeoutMs, stop, input: Buffer.concat(tar), onStdout: (d) => out.push(d) });
  const mp4 = Buffer.concat(out);
  if (mp4.length < 1000 || mp4.slice(4, 8).toString() !== 'ftyp') throw new Error(`render failed (${mp4.length} bytes)`);
  return mp4;
}

/** Search p90 on tower over n fresh probes (seconds; null when none answered). */
export async function searchP90(n = 5, { probe = searchLatency } = {}) {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(await probe());
  const ok = xs.filter((x) => x != null).sort((a, b) => a - b);
  return ok.length ? ok[Math.min(ok.length - 1, Math.floor(ok.length * 0.9))] : null;
}

/**
 * DIARIZATION ON BOSS (10-22 watch: pyannote on tower at ~630 % CPU took on-tower search to 6.6–8.6 s): the audio goes to
 * boss through the gate, the turns come back and are written to `output`. Only when boss cannot be reached does it run on
 * tower — detached, ≤ 4 threads, nice 19 — and never while search p90 is above 4 s (it waits, then gives up).
 */
export async function diarize(input, output, { host = asrHost(), job = null, deps = {}, threads = Math.max(2, Math.floor(BOSS_THREADS / (2 * mediaParallel()))), stop = null, pidFile = `${output}.pid`, towerThreads = 4,
  p90 = searchP90, maxWaitMs = 30 * 60_000, remote = asr, detached = detachedTool, pause: wait = pause } = {}) {
  const { writeFile } = await import('fs/promises');
  // DETACHED on boss (10-22: the attached call died with every service restart, so a diarization never finished)
  if (host && job) {
    try {
      // at most MEDIA_DIAR_SLOTS (3) diarizations per host at once (10-23: five at 8 threads on aorus's 24 cores)
      // a job ALREADY running (or done) on its host is re-attached outside the slots — the slots limit what we START
      // (10-23: re-attached aorus jobs held the diar lane in aorus's single slot while boss sat idle)
      const live = deps.live ? await deps.live() : deps.asrJob ? null : await remoteJob('poll-only', input, {}, { host, job, probeOnly: true }).catch(() => null);
      // a re-attached job does not wait for a slot, but it COUNTS (12:29: after a restart two re-attached jobs plus a new one
      // ran on aorus, whose cap is 1) — pickDiarHost sees it
      // NOT started yet and its host is full while another has a free slot → move there before it starts (10-23 19:41: five
      // diarizations kept aorus — host chosen before a restart — and queued for its single slot while boss had room)
      if (live !== 'running' && live !== 'done' && idsOn(host).size >= (1)) {
        const alt = pickDiarHost();
        if (alt && alt !== host && idsOn(alt).size < 1) { host = alt; await deps.onHost?.(alt); }
      }
      const go = () => (deps.asrJob || asrJob)(input, { verb: 'diarize', output }, { host, job, threads, stop, count: false });
      const r = live === 'running' || live === 'done' ? await countDiar(host, go, job) : await diarSlot(host, go, undefined, { job, stop, running: deps.running || (deps.asrJob ? null : () => runningOn(host)) });
      const j = JSON.parse(await (await import('fs/promises')).readFile(output, 'utf8'));
      return { speakers: new Set((j.turns || []).map((t) => t.speaker)).size, turns: (j.turns || []).length, host, job, reattached: r.reattached };
    } catch (err) { if (err.code === 'DRAIN' || !/ssh exit 255|Connection|timed out|No route/i.test(err.message)) throw err; }
  }
  if (host && !job) {
    const unreachable = new Error('unreachable');
    try {
      const r = await remote('diarize', input, { 'emit-turns': true }, { host, threads, stop, timeoutMs: 3 * 3600_000, local: async () => { throw unreachable; } });
      await writeFile(output, JSON.stringify({ turns: r.turn_list || [], threshold: r.threshold, emb: r.emb, host }));
      const { turn_list, ...summary } = r;
      return { ...summary, host };
    } catch (err) { if (err !== unreachable) throw err; }
  }
  // tower fallback: guarded by search latency
  const t0 = Date.now();
  for (;;) {
    const p = await p90();
    if (p == null || p <= 4) break;
    if (Date.now() - t0 > maxWaitMs) throw new Error(`diarization deferred: boss unreachable and tower search p90 ${p.toFixed(1)} s > 4 s`);
    if (stop?.()) throw new DrainAbort('diarize (deferred)');
    await wait(60_000);
  }
  return { ...(await detached('diarize', input, { output }, { pidFile, threads: Math.min(4, towerThreads), stop })), host: 'tower' };
}

// ── the GPU compute host (aorus: RTX 3070, CUDA): grade (DNSMOS/NISQA) and DeepFilterNet as DETACHED jobs through the same
// gate as boss (start … --verb grade|dfn, re-attached by job id after a restart; the original audio staged over the tailnet)
/** The GPU host: the registered machine reporting the most free GPU memory (NVIDIA or AMD alike); MEDIA_GPU_HOST overrides ('' → none). */
export const gpuHost = () => {
  if (process.env.MEDIA_GPU_HOST != null) return process.env.MEDIA_GPU_HOST || null;
  const r = rankedRegistry();
  return r.find((h) => hasGpu(diskInfo.get(h))) ?? r[0] ?? null;
};
const installedGpu = new Set();   // hosts this process has sent media_tool.py to
/** A detached job on a compute host: the input file is sent as-is; → the JSON result, or (file) writes opts.output. */
export async function remoteJob(sub, input, opts = {}, { host = gpuHost(), job, stop = null, pollMs = 5000, file = false, exec = run, probeOnly = false } = {}) {
  const ssh = (cmd, o = {}) => exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, gateWrap(host, cmd)], { timeoutMs: 600_000, ...o });
  const state = async () => { const { stdout } = await ssh(`poll ${job}`); return JSON.parse(stdout.trim().split('\n').pop()); };
  let st = await state().catch(() => ({ state: 'missing' }));
  if (probeOnly) return st.state;
  if (st.state !== 'running' && st.state !== 'done') {
    const { readFile } = await import('fs/promises');
    if (!installedGpu.has(host)) { await ssh('install-tool', { timeoutMs: 60_000, input: await readFile(TOOL) }); installedGpu.add(host); }
    const ext = (input.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const { output, ...rest } = opts;
    await ssh(`start ${ext} ${job} ${gateCommand('x', ext, { ...rest, verb: sub }).split(' ').slice(2).join(' ')}`, { input: await readFile(input) });
    st = { state: 'running' };
  }
  for (;;) {
    if (st.state === 'done') break;
    if (st.state === 'failed' || st.state === 'missing') throw new Error(`${sub} job ${job} on ${host} ${st.state}: ${String(st.error || '').slice(-300)}`);
    for (let waited = 0; waited < pollMs; waited += 1000) { if (stop?.()) throw new DrainAbort(`${sub} job ${job} (left running on ${host})`); await pause(1000); }
    st = await state().catch(() => ({ state: 'running' }));
  }
  if (file) {
    const chunks = [];
    await exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, gateWrap(host, `fetch-file ${job}`)], { timeoutMs: 600_000, onStdout: (d) => chunks.push(d) });
    const { writeFile } = await import('fs/promises');
    await writeFile(opts.output, Buffer.concat(chunks));
    await cleanRemote(host, job, { exec }).catch(() => {});
    return { output: opts.output, host, job };
  }
  const { stdout } = await ssh(`fetch ${job}`, { timeoutMs: 120_000 });
  const res = { ...JSON.parse(stdout.trim().split('\n').pop()), host, job };
  await cleanRemote(host, job, { exec }).catch(() => {});
  return res;
}
/** A fixed ENCODE recipe (light chain · ogg · m4a: media_tool.py encode) on the ASR host's spare CPU — measured 10-23 on a
 *  66-min talk: boss 49 / 28 / 19 s (+ ~3 s transfer) vs tower 129 / 91 / 68 s at tower's lowest priority — else on tower.
 *  local() runs it on tower (the caller's ffmpeg in its slot). Re-attaches by job id after a restart. */
let encBusy = 0;
const encWait = [];
const overflowOff = () => process.env.MEDIA_ENCODE_OVERFLOW === '0';
const encBusyBy = new Map();
export async function encodeRemote(recipe, input, output, { af = '', job, stop, local, slots = Number(process.env.MEDIA_ENCODE_SLOTS) || 4, window = null } = {}) {   // boss prep 4 at a time (10-23 06:09: boss at load 9, prep the limit)
  // the hosts that may encode: the ASR host (boss) and every rented pod. A pod is preferred (it is rented for exactly this and is idle between
  // GPU stages); boss takes at most `slots` beside its transcriptions. No host free → WAIT (the old tower fallback is gone: the tower gate
  // lets only a bounded local() through, and only when there is no pool at all).
  const bossHost = process.env.MEDIA_ENCODE_HOST ?? asrHost();
  const hostsNow = () => [...poolHosts().map((h) => [h, POD_SLOTS.encode]), ...(bossHost ? [[bossHost, slots]] : [])];
  if (!job || !hostsNow().length) return local();
  let failures = 0;
  for (;;) {
    const pick = hostsNow().find(([h, n]) => (encBusyBy.get(h) || 0) < n && diskOk(h, { kind: 'encode' }));
    if (!pick) {
      if (!poolHosts().length && local && !overflowOff() && [...encBusyBy.values()].reduce((a, b) => a + b, 0) >= slots) return local();   // no pool and boss is full: the tower's bounded slot
      if (stop?.()) throw new DrainAbort('encode (waiting for a host)');
      await slotWait(encWait, 'an encode host');
      continue;
    }
    const host = pick[0];
    encBusyBy.set(host, (encBusyBy.get(host) || 0) + 1);
    try { return await remoteJob('encode', input, { recipe, ...(af ? { af } : {}), ...(window ? { ss: window.ss, t: window.t } : {}), output, threads: 2 }, { host, job: `${job}`.slice(0, 100), stop, file: true }); }   // 2 threads each (was 8)
    catch (err) {
      if (err instanceof DrainAbort) throw err;
      console.warn(`[media] encode ${recipe} on ${host} failed: ${String(err.message).slice(0, 300)}`);
      if (++failures >= 4) throw err;
      if (isPod(host)) continue;   // that pod is going or gone: another host
      if (local) return local();
    } finally { encBusyBy.set(host, encBusyBy.get(host) - 1); encWait.shift()?.(); }
  }
}

/** grade / dfn on the GPU host when it answers, else the tower's detached process (re-attached by pid file). */
const offBusy = new Map();
const offWait = [];
/** The hosts a GPU-host tool may run on, in order, with their slots: DeepFilterNet goes to aorus (1 at a time beside its
 *  transcriptions) and OVERFLOWS to boss's CPU venv (2 at a time; Chad 10-23: "free to use boss"); the grade to aorus only. */
// boss's CPU DeepFilterNet (venv-dfn, installed 10-23) is OFF by default: on a loaded boss it took 20+ min for a 66-min talk
// that aorus's GPU does in under a minute — MEDIA_DFN_OVERFLOW=boss uses it (1 at a time)
export const offloadHosts = (sub) => [...(sub === 'dfn' ? [[gpuHost(), 2], [process.env.MEDIA_DFN_OVERFLOW || null, 1]] : [[gpuHost(), 3]]), ...poolHosts().map((h) => [h, POD_SLOTS[sub === 'dfn' ? 'dfn' : 'grade']])].filter(([h]) => h)
  .filter(([h], i, a) => a.findIndex(([x]) => x === h) === i);   // + the rented pods (pool.js)
export async function gpuOrTower(sub, input, opts, { job, pidFile, stop, python = null, file = false, slot = (fn) => fn(), hosts = offloadHosts(sub), exec, pollMs, needGb = null } = {}) {
  if (hosts.length && job) {
    // a job already started on one of the hosts (before a restart) is re-attached THERE (the job id carries the host)
    const idOf = (h) => `${job}-${h.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 120);
    let host = null;
    for (const [h] of hosts) {
      const st = await remoteJob('poll-only', input, {}, { host: h, job: idOf(h), probeOnly: true, exec }).catch(() => null);
      if (st === 'running' || st === 'done') { host = h; break; }
    }
    let took = false, unreserve = () => {};
    if (!host) {
      for (;;) {
        const usable = hosts.filter(([h]) => diskOk(h, { kind: sub === 'dfn' ? 'dfn' : 'grade', needGb }));
        if (!usable.length) break;   // every offload host is low on disk → the tower does it
        host = usable.find(([h, n]) => (offBusy.get(h) || 0) < n)?.[0] || null;
        if (host) break;
        await slotWait(offWait, `a ${sub} host`);
      }
      if (host) { offBusy.set(host, (offBusy.get(host) || 0) + 1); took = true; unreserve = reserveGpu(host, sub === 'dfn' ? 'dfn' : 'grade'); }
    }
    if (host) try { return await remoteJob(sub, input, { ...opts, ...(sub === 'dfn' && host !== gpuHost() ? { threads: 6 } : {}) }, { host, job: idOf(host), stop, file, exec, ...(pollMs != null ? { pollMs } : {}) }); }
    // a drain leaves the remote job running (re-attached next time); anything else → the tower does it
    catch (err) { if (err instanceof DrainAbort) throw err; console.warn(`[media] ${sub} on ${host} failed — tower fallback: ${String(err.message).slice(0, 300)}`); }
    finally { unreserve(); if (took) { offBusy.set(host, offBusy.get(host) - 1); offWait.shift()?.(); } }
  }
  return slot(() => detachedTool(sub, input, opts, { pidFile, threads: 4, stop, python }));   // the tower's 8-thread budget (towerSlot)
}

/** The memory picture of each compute host, labelled for people ("boss system RAM 17 of 31 GB free, pressure 0 %, GPU VRAM 13 of 96 GB used, GTT 0.1 of 15.5 GB"). */
export function hostMemoryLabel(host, d = diskInfo.get(host)) {
  if (!d) return null;
  const parts = [];
  if (d.mem_total_gb != null) parts.push(`system RAM ${d.mem_avail_gb} of ${d.mem_total_gb} GB available`);
  else if (d.mem_avail_gb != null) parts.push(`system RAM ${d.mem_avail_gb} GB available`);
  if (d.psi_some10 != null) parts.push(`memory pressure ${d.psi_some10} %`);
  if (d.vram_total_gb != null) parts.push(`GPU VRAM ${d.vram_used_gb} of ${d.vram_total_gb} GB used`, `GTT ${d.gtt_used_gb} of ${d.gtt_total_gb} GB used`);
  else if (d.gpu_free_mb != null) parts.push(`GPU memory ${d.gpu_free_mb} MiB free`);
  if (d.gpu_busy != null) parts.push(`GPU busy ${d.gpu_busy} %`);
  if (d.gpu_temp != null) parts.push(`GPU ${d.gpu_temp} °C`);
  if (d.cpu_tctl != null) parts.push(`CPU Tctl ${d.cpu_tctl} °C`);
  return `${host}: ${parts.join(' · ')}`;
}
export async function hostMemorySnapshot(hosts = [gpuHost(), asrHost()].filter(Boolean)) {
  const out = {};
  for (const h of [...new Set(hosts)]) { try { await refreshDisk(h); } catch { /* unreachable: keep the last reading */ } out[h] = { label: hostMemoryLabel(h), at: diskInfo.get(h)?.at ?? null }; }
  return out;
}
