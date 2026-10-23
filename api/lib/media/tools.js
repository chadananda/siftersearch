// Process runners for the media pipeline: the Python worker (scripts/media/media_tool.py in the user-space venvs), ffmpeg,
// ffprobe and yt-dlp — every one at nice 19 with a thread cap, so a transcription never costs a reader their search. The
// thread cap follows measured search latency on the gateway (MEDIA_THREADS default; halved while search is slow).
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// the 16 kHz conversions sent to the ASR hosts: 3 at once × 2 threads (with item.js towerLight's 4 × 2, prep stays ≤ 14 cores)
let convBusy = 0;
const convWait = [];
export async function convSlot(fn) {
  if (convBusy >= 3) await new Promise((r) => convWait.push(r));
  convBusy++;
  try { return await fn(); } finally { convBusy--; convWait.shift()?.(); }
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
export function run(cmd, args, { timeoutMs = 6 * 3600_000, env = {}, threads = null, input = null, onStdout = null, stop = null, pollMs = 2000 } = {}) {
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
    if (input != null) p.stdin.end(input); else p.stdin.end();
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
export const asrHost = () => (process.env.MEDIA_ASR_HOST ?? 'boss') || null;
/** The ASR HOSTS and their slots, fastest first: MEDIA_ASR_HOSTS="aorus:2,boss:4" (default: MEDIA_ASR_HOST with mediaParallel()
 *  slots). Measured 10-22 on a 46-min talk: aorus (RTX 3070, fp16) 26.6 audio-min per wall-min for ONE job; boss 14.4 for
 *  four jobs together. */
export function asrHosts() {
  const spec = process.env.MEDIA_ASR_HOSTS ?? 'aorus:2,boss:4';   // '' → MEDIA_ASR_HOST alone
  if (!spec) return asrHost() ? [{ host: asrHost(), slots: mediaParallel() }] : [];
  return spec.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [host, n] = x.split(':'); return { host, slots: Math.max(1, Number(n) || 1) }; });
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
export async function withProbeHost(fn, { long = false, hosts = (long ? [[asrHost(), 3]] : [[gpuHost(), 4], [asrHost(), 2]]).filter(([h]) => h) } = {}) {
  // long: a recording over 90 min is probed on boss only (128 GB) — decoding it whole beside two transcriptions ran aorus's
  // 15 GB out (10-23: Taherzadeh's 2½-hour talks failed enhance three times)
  const uniq = hosts.filter(([h], i) => hosts.findIndex(([x]) => x === h) === i);
  if (!uniq.length) return fn(null);
  let host = null;
  for (;;) {
    host = uniq.find(([h, n]) => (probeBusy.get(h) || 0) < n)?.[0] || null;
    if (host) break;
    await new Promise((r) => probeWaiters.push(r));
  }
  probeBusy.set(host, (probeBusy.get(host) || 0) + 1);
  try { return await fn(host); } finally { probeBusy.set(host, probeBusy.get(host) - 1); probeWaiters.shift()?.(); }
}
/** Why pickAsrHost chose a host (the dispatch log line). */
export function asrPickReason(host, hosts = asrHosts(), busy = asrBusy) {
  return hosts.map((h) => `${h.host} ${busy.get(h.host) || 0}/${h.slots}`).join(', ') + ` → ${host}`;
}
export const asrLoad = () => Object.fromEntries(asrHosts().map((h) => [h.host, { busy: asrBusy.get(h.host) || 0, slots: h.slots }]));

/** A host whose sshd is bypassed by Tailscale SSH (aorus: tower's key lands in a shell, not the forced command) runs the gate
 *  explicitly: MEDIA_GATE_<HOST>=<path to asr-gate.sh>. The gate still checks every verb and argument (its charset has no quote). */
const GATES = { aorus: '~/media-gpu/asr-gate.sh' };   // (10-22) aorus: Tailscale SSH → a shell, so the gate by path
export function gateWrap(host, cmd) {
  const gate = process.env[`MEDIA_GATE_${String(host || '').toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] ?? GATES[host];
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
    if (err.code !== 'DRAIN' && /ssh exit 255|Connection|timed out|No route/i.test(err.message)) return local(sub, input, opts, { timeoutMs, stop });   // host unreachable → tower
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
function releaseAsr(host) { asrBusy.set(host, Math.max(0, (asrBusy.get(host) || 1) - 1)); asrWaiters.shift()?.(); }
/** A host with a FREE transcription slot (fastest first), the slot taken at once — waits while every host is full, so new
 *  transcriptions queue here instead of piling onto a busy host. release() if the job is never started. */
export async function acquireAsrHost(hosts = asrHosts()) {
  if (!hosts.length) return { host: null, release: () => {} };
  for (;;) {
    const h = hosts.find((x) => (asrBusy.get(x.host) || 0) < x.slots);
    if (h) { asrBusy.set(h.host, (asrBusy.get(h.host) || 0) + 1); let done = false; return { host: h.host, release: () => { if (!done) { done = true; releaseAsr(h.host); } } }; }
    await new Promise((r) => asrWaiters.push(r));
  }
}
const diarBusy = new Map();
const diarWait = new Map();
// per host: aorus 2 (≈1.5 GB RAM each on a 15 GB box beside two transcriptions; 10-23 watch: 6 at once, load 55, 3 GB free)
// aorus diarizes on its GPU (venv-diar: sherpa-onnx built for CUDA; 600 s of audio in ~100 s at ONE CPU thread, vs boss's
// CPU 112 s at 4 threads under load) — 2 at a time, ≥ 1.5 GB free or its CPU; boss is the overflow at 3 (10-23)
const DIAR_SLOTS = { aorus: 2, boss: 3 };
export async function diarSlot(host, fn, slots = DIAR_SLOTS[host] || 3) {
  if (!diarWait.has(host)) diarWait.set(host, []);
  if ((diarBusy.get(host) || 0) >= slots) await new Promise((r) => diarWait.get(host).push(r));
  diarBusy.set(host, (diarBusy.get(host) || 0) + 1);
  try { return await fn(); } finally { diarBusy.set(host, diarBusy.get(host) - 1); diarWait.get(host).shift()?.(); }
}
async function countDiar(host, fn) { diarBusy.set(host, (diarBusy.get(host) || 0) + 1); try { return await fn(); } finally { diarBusy.set(host, diarBusy.get(host) - 1); diarWait.get(host)?.shift()?.(); } }
/** A diarization's host when it is DISPATCHED: aorus while it has a free diarization slot, else boss (its CPU) — the rest
 *  stay on boss (10-23 watch). */
export function pickDiarHost(busy = diarBusy) {
  const order = [gpuHost(), asrHost()].filter(Boolean).filter((h, i, a) => a.indexOf(h) === i);   // the GPU host first
  return order.find((h) => (busy.get(h) || 0) < (DIAR_SLOTS[h] || 3)) || order[0] || null;
}
/** Where diarizations run: aorus's CPU (24 threads, idle beside its GPU transcriptions) unless set (MEDIA_DIAR_HOST). */
export const diarHost = () => process.env.MEDIA_DIAR_HOST ?? asrHost();
async function asrJobOn(input, opts = {}, { host, threads = asrThreads(), job, stop = null, pollMs = 15000, onStart = async () => {}, exec = run } = {}) {
  const ssh = (cmd, o = {}) => exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, gateWrap(host, cmd)], { timeoutMs: 600_000, ...o });
  const state = async () => { const { stdout } = await ssh(`poll ${job}`); return JSON.parse(stdout.trim().split('\n').pop()); };
  let st = await state().catch(() => ({ state: 'missing' }));
  const reattached = st.state === 'running' || st.state === 'done';
  if (!reattached) {
    const { tmpdir } = await import('os');
    const { readFile, unlink } = await import('fs/promises');
    if (installedOn !== host) { await ssh('install-tool', { timeoutMs: 60_000, input: await readFile(TOOL) }); installedOn = host; }
    const flac = tempFlac(tmpdir());
    try {
      await convSlot(() => exec('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '2', '-i', input, '-threads', '2', '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-c:a', 'flac', flac], { timeoutMs: 1800_000, stop }));
      await ssh(`start flac ${job} ${gateCommand('x', 'flac', { ...opts, threads }).split(' ').slice(2).join(' ')}`, { input: await readFile(flac).catch(() => Buffer.alloc(0)) });
    } finally { await unlink(flac).catch(() => {}); }
    await onStart();
    st = { state: 'running' };
  }
  for (;;) {
    if (st.state === 'done') break;
    if (st.state === 'failed' || st.state === 'missing') throw new Error(`asr job ${job} ${st.state}: ${String(st.error || '').slice(-300)}`);
    for (let waited = 0; waited < pollMs; waited += 1000) { if (stop?.()) throw new DrainAbort(`asr job ${job} (left running on ${host})`); await pause(1000); }
    st = await state().catch(() => ({ state: 'running' }));   // a blip on the network is not a failure
  }
  const { stdout } = await ssh(`fetch ${job}`, { timeoutMs: 300_000 });
  const { writeFile } = await import('fs/promises');
  await writeFile(opts.output, stdout);
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
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { timeoutMs: 120_000 });
  const j = JSON.parse(stdout);
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const v = (j.streams || []).find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  return { duration_s: Number(j.format?.duration) || null, format: j.format?.format_name, bit_rate: Number(j.format?.bit_rate) || null,
    sample_rate: Number(a?.sample_rate) || null, channels: a?.channels || null, codec: a?.codec_name || null, has_video: !!v,
    tags: Object.fromEntries(Object.entries({ ...(j.format?.tags || {}) }).map(([k, x]) => [k.toLowerCase(), String(x).slice(0, 300)])) };
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
      const go = () => (deps.asrJob || asrJob)(input, { verb: 'diarize', output }, { host, job, threads, stop, count: false });
      // a re-attached job does not wait for a slot, but it COUNTS (12:29: after a restart two re-attached jobs plus a new one
      // ran on aorus, whose cap is 1) — pickDiarHost sees it
      const r = live === 'running' || live === 'done' ? await countDiar(host, go) : await diarSlot(host, go);
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
export const gpuHost = () => (process.env.MEDIA_GPU_HOST ?? 'aorus') || null;   // MEDIA_GPU_HOST='' → the tower does grade + dfn
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
    return { output: opts.output, host, job };
  }
  const { stdout } = await ssh(`fetch ${job}`, { timeoutMs: 120_000 });
  return { ...JSON.parse(stdout.trim().split('\n').pop()), host, job };
}
/** A fixed ENCODE recipe (light chain · ogg · m4a: media_tool.py encode) on the ASR host's spare CPU — measured 10-23 on a
 *  66-min talk: boss 49 / 28 / 19 s (+ ~3 s transfer) vs tower 129 / 91 / 68 s at tower's lowest priority — else on tower.
 *  local() runs it on tower (the caller's ffmpeg in its slot). Re-attaches by job id after a restart. */
let encBusy = 0;
const encWait = [];
export async function encodeRemote(recipe, input, output, { af = '', job, stop, local, slots = Number(process.env.MEDIA_ENCODE_SLOTS) || 4 } = {}) {   // boss prep 4 at a time (10-23 06:09: boss at load 9, prep the limit)
  const host = process.env.MEDIA_ENCODE_HOST ?? asrHost();
  if (host && job) {
    // at most 2 encodes on the ASR host at once (10-23: 5 encodes beside its transcriptions took boss to load 56)
    if (encBusy >= slots) await new Promise((r) => encWait.push(r));
    encBusy++;
    try { return await remoteJob('encode', input, { recipe, ...(af ? { af } : {}), output, threads: 2 }, { host, job, stop, file: true }); }   // 2 threads each (was 8)
    catch (err) { if (err instanceof DrainAbort) throw err; console.warn(`[media] encode ${recipe} on ${host} failed — tower: ${String(err.message).slice(0, 300)}`); }
    finally { encBusy--; encWait.shift()?.(); }
  }
  return local();
}

/** grade / dfn on the GPU host when it answers, else the tower's detached process (re-attached by pid file). */
const offBusy = new Map();
const offWait = [];
/** The hosts a GPU-host tool may run on, in order, with their slots: DeepFilterNet goes to aorus (1 at a time beside its
 *  transcriptions) and OVERFLOWS to boss's CPU venv (2 at a time; Chad 10-23: "free to use boss"); the grade to aorus only. */
// boss's CPU DeepFilterNet (venv-dfn, installed 10-23) is OFF by default: on a loaded boss it took 20+ min for a 66-min talk
// that aorus's GPU does in under a minute — MEDIA_DFN_OVERFLOW=boss uses it (1 at a time)
export const offloadHosts = (sub) => (sub === 'dfn' ? [[gpuHost(), 2], [process.env.MEDIA_DFN_OVERFLOW || null, 1]] : [[gpuHost(), 3]]).filter(([h]) => h)
  .filter(([h], i, a) => a.findIndex(([x]) => x === h) === i);
export async function gpuOrTower(sub, input, opts, { job, pidFile, stop, python = null, file = false, slot = (fn) => fn(), hosts = offloadHosts(sub), exec, pollMs } = {}) {
  if (hosts.length && job) {
    // a job already started on one of the hosts (before a restart) is re-attached THERE (the job id carries the host)
    const idOf = (h) => `${job}-${h.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 120);
    let host = null;
    for (const [h] of hosts) {
      const st = await remoteJob('poll-only', input, {}, { host: h, job: idOf(h), probeOnly: true, exec }).catch(() => null);
      if (st === 'running' || st === 'done') { host = h; break; }
    }
    let took = false;
    if (!host) {
      for (;;) {
        host = hosts.find(([h, n]) => (offBusy.get(h) || 0) < n)?.[0] || null;
        if (host) break;
        await new Promise((r) => offWait.push(r));
      }
      offBusy.set(host, (offBusy.get(host) || 0) + 1); took = true;
    }
    try { return await remoteJob(sub, input, { ...opts, ...(sub === 'dfn' && host !== gpuHost() ? { threads: 6 } : {}) }, { host, job: idOf(host), stop, file, exec, ...(pollMs != null ? { pollMs } : {}) }); }
    // a drain leaves the remote job running (re-attached next time); anything else → the tower does it
    catch (err) { if (err instanceof DrainAbort) throw err; console.warn(`[media] ${sub} on ${host} failed — tower fallback: ${String(err.message).slice(0, 300)}`); }
    finally { if (took) { offBusy.set(host, offBusy.get(host) - 1); offWait.shift()?.(); } }
  }
  return slot(() => detachedTool(sub, input, opts, { pidFile, threads: 4, stop, python }));   // the tower's 8-thread budget (towerSlot)
}
