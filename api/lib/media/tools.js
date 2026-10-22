// Process runners for the media pipeline: the Python worker (scripts/media/media_tool.py in the user-space venvs), ffmpeg,
// ffprobe and yt-dlp — every one at nice 19 with a thread cap, so a transcription never costs a reader their search. The
// thread cap follows measured search latency on the gateway (MEDIA_THREADS default; halved while search is slow).
import { spawn } from 'child_process';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const TOOL = join(ROOT, 'scripts', 'media', 'media_tool.py');
export const PY = () => process.env.MEDIA_PYTHON || join(homedir(), 'sifter', 'venvs', 'media', 'bin', 'python');
export const PY_DFN = () => process.env.MEDIA_DFN_PYTHON || join(homedir(), 'sifter', 'venvs', 'media-dfn', 'bin', 'python');
export const YTDLP = () => process.env.MEDIA_YTDLP || join(homedir(), 'sifter', 'venvs', 'media', 'bin', 'yt-dlp');
export const defaultThreads = () => Math.max(2, Number(process.env.MEDIA_THREADS) || 12);

/** Run a command at nice 19 → { code, stdout, stderr }; rejects on a non-zero exit with the stderr tail. */
export function run(cmd, args, { timeoutMs = 6 * 3600_000, env = {}, threads = null, input = null, onStdout = null } = {}) {
  return new Promise((resolve, reject) => {
    const tenv = threads ? { OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads), OPENBLAS_NUM_THREADS: String(threads) } : {};
    const p = spawn('nice', ['-n', '19', cmd, ...args], { env: { ...process.env, ...tenv, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => { if (onStdout) onStdout(d); else out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code, sig) => {
      clearTimeout(timer);
      if (code === 0) resolve({ code, stdout: out, stderr: err });
      else reject(new Error(`${cmd.split('/').pop()} exit ${code ?? sig}: ${err.trim().split('\n').slice(-4).join(' | ').slice(0, 600)}`));
    });
    if (input != null) p.stdin.end(input); else p.stdin.end();
  });
}

/** The Python worker: one subcommand → its JSON (the last stdout line). */
export async function tool(sub, input, opts = {}, { python = PY(), threads = defaultThreads(), timeoutMs } = {}) {
  const args = [TOOL, sub, input, '--threads', String(threads)];
  for (const [k, v] of Object.entries(opts)) {
    if (v === true) args.push(`--${k}`);
    else if (v != null && v !== false && v !== '') args.push(`--${k}`, String(v));
  }
  const { stdout } = await run(python, args, { threads, timeoutMs });
  const line = stdout.trim().split('\n').filter(Boolean).pop();
  try { return JSON.parse(line); } catch { throw new Error(`media_tool ${sub}: no JSON result (${String(line).slice(0, 200)})`); }
}

// ── ASR on boss (measured 10-21: Zen 5 runs Whisper turbo at RTF 0.06 vs 0.36 on tower's Xeons; tower's search stays
// untouched). Through a forced-command key (scripts/media/boss-asr-gate.sh): audio on stdin, JSON on stdout. ──
export const asrHost = () => (process.env.MEDIA_ASR_HOST ?? 'boss') || null;
export const asrThreads = () => Number(process.env.MEDIA_ASR_THREADS) || 24;

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
export async function asr(sub, input, opts = {}, { host = asrHost(), threads = asrThreads(), timeoutMs = 6 * 3600_000, local = tool } = {}) {
  if (!host) return local(sub, input, opts, { timeoutMs });
  const { tmpdir } = await import('os');
  const { readFile, writeFile, unlink } = await import('fs/promises');
  const flac = join(tmpdir(), `media-asr-${process.pid}-${Date.now()}.flac`);
  try {
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', flac], { timeoutMs: 1800_000 });
    const cmd = gateCommand(sub, 'flac', { ...opts, threads });
    const { stdout } = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=60', host, cmd], { timeoutMs, input: await readFile(flac) });
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
    if (/ssh exit 255|Connection|timed out|No route/i.test(err.message)) return local(sub, input, opts, { timeoutMs });   // host unreachable → tower
    throw err;
  } finally { await unlink(flac).catch(() => {}); }
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

export const ffmpeg = (args, opts = {}) => run('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { timeoutMs: 3 * 3600_000, ...opts });

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
