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
export const defaultThreads = () => Math.max(2, Number(process.env.MEDIA_THREADS) || 8);

// every live child, killed when this process exits — a drained service exits as soon as its job yields, and a sibling
// child whose own stop-poll had not fired yet (the ssh beside a killed diarization, 10-22 00:13) was left orphaned
const live = new Set();
process.once('exit', () => { for (const c of live) { try { c.kill('SIGTERM'); } catch { /* gone */ } } });

/** The error a child process ends with when the service drains mid-stage: the stage is redone after the restart. */
export class DrainAbort extends Error { constructor(what) { super(`${what}: stopped for an update drain — redone after the restart`); this.code = 'DRAIN'; } }

/** Run a command at nice 19 → { code, stdout, stderr }; rejects on a non-zero exit with the stderr tail.
 *  stop: () => boolean, polled every pollMs — true (the service is draining) kills the child and rejects with DrainAbort, so a
 *  long transcription never holds a drain (10-21: a 37-minute stage parked every reports lane). */
export const liveChildren = () => live.size;
export function run(cmd, args, { timeoutMs = 6 * 3600_000, env = {}, threads = null, input = null, onStdout = null, stop = null, pollMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const tenv = threads ? { OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads), OPENBLAS_NUM_THREADS: String(threads) } : {};
    const p = spawn('nice', ['-n', '19', cmd, ...args], { env: { ...process.env, ...tenv, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
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
      else reject(new Error(`${cmd.split('/').pop()} exit ${code ?? sig}: ${err.trim().split('\n').slice(-4).join(' | ').slice(0, 600)}`));
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
export const asrThreads = () => Number(process.env.MEDIA_ASR_THREADS) || 24;
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
  const flac = join(tmpdir(), `media-asr-${process.pid}-${Date.now()}.flac`);
  try {
    // the ASR host runs THIS checkout's media_tool.py: installed through the gate once per process (and after a deploy)
    if (installedOn !== host) { await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'install-tool'], { timeoutMs: 60_000, input: await readFile(TOOL) }); installedOn = host; }
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', flac], { timeoutMs: 1800_000, stop });
    const cmd = gateCommand(sub, 'flac', { ...opts, threads });
    const { stdout } = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, cmd], { timeoutMs, stop, input: await readFile(flac) });
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
export async function asrJob(input, opts = {}, { host = asrHost(), threads = asrThreads(), job, stop = null, pollMs = 15000, onStart = async () => {}, exec = run } = {}) {
  const ssh = (cmd, o = {}) => exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, cmd], { timeoutMs: 600_000, ...o });
  const state = async () => { const { stdout } = await ssh(`poll ${job}`); return JSON.parse(stdout.trim().split('\n').pop()); };
  let st = await state().catch(() => ({ state: 'missing' }));
  const reattached = st.state === 'running' || st.state === 'done';
  if (!reattached) {
    const { tmpdir } = await import('os');
    const { readFile, unlink } = await import('fs/promises');
    if (installedOn !== host) { await ssh('install-tool', { timeoutMs: 60_000, input: await readFile(TOOL) }); installedOn = host; }
    const flac = join(tmpdir(), `media-asr-${process.pid}-${Date.now()}.flac`);
    try {
      await exec('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', flac], { timeoutMs: 1800_000, stop });
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
export async function detachedTool(sub, input, opts = {}, { pidFile, threads = defaultThreads(), stop = null, pollMs = 2000 } = {}) {
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
    const p = spawn('nice', ['-n', '19', PY(), ...args], { detached: true, stdio: ['ignore', out, err], env: { ...process.env, ...tenv } });
    p.unref(); closeSync(out); closeSync(err);
    pid = p.pid;
    await writeFile(pidFile, String(pid));
  }
  while (alive(pid)) { if (stop?.()) throw new DrainAbort(`${sub} (left running, pid ${pid})`); await pause(pollMs); }
  const text = (await readFile(outFile, 'utf8').catch(() => '')).trim();
  if (!text) throw new Error(`${sub} ended without a result: ${(await readFile(`${pidFile}.err`, 'utf8').catch(() => '')).trim().split('\n').slice(-3).join(' | ').slice(0, 400)}`);
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

export const ffmpeg = (args, opts = {}) => run('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { timeoutMs: 3 * 3600_000, ...opts });   // opts.stop: drain-aware

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
  if (rendererOn !== host) { await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'install-renderer'], { timeoutMs: 60_000, input: await readFile(SHORT_TOOL) }); rendererOn = host; }
  const tar = [];
  await run('tar', ['-C', dir, '-cf', '-', '.'], { timeoutMs: 60_000, onStdout: (d) => tar.push(d), env: { COPYFILE_DISABLE: '1' } });
  const out = [];
  await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30', host, 'short'], { timeoutMs, stop, input: Buffer.concat(tar), onStdout: (d) => out.push(d) });
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
export async function diarize(input, output, { host = asrHost(), threads = 16, stop = null, pidFile = `${output}.pid`, towerThreads = 4,
  p90 = searchP90, maxWaitMs = 30 * 60_000, remote = asr, detached = detachedTool, pause: wait = pause } = {}) {
  const { writeFile } = await import('fs/promises');
  if (host) {
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
