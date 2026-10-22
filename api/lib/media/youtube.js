// YouTube sources (Chad 10-21): the AUDIO track is downloaded (yt-dlp, audio only) and processed like any other item; the
// page links back to the video at each timestamp. Politely: one at a time, no cookies or login, and a bot check STOPS the
// run (never bypassed). The id, URL, channel and upload metadata are kept in meta.json.
import { readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { run, YTDLP } from './tools.js';

// yt-dlp needs a JavaScript runtime for YouTube's player now (deno, user space ~/.deno)
const POT_SCRIPT = () => process.env.MEDIA_POT_SCRIPT || join(homedir(), 'sifter', 'bgutil', 'server', 'build', 'generate_once.js');
const DENO = () => process.env.MEDIA_DENO || join(homedir(), '.deno', 'bin', 'deno');

/** The video id in a YouTube URL (watch, youtu.be, shorts, embed, live), or null. */
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** A bot check / rate limit in yt-dlp's output → stop the run, do not retry around it. */
export const isBotCheck = (text) => /sign in to confirm|not a bot|captcha|http error 429|too many requests|unusual traffic/i.test(String(text || ''));

/** After a bot check / 429, no YouTube item is started for COOL_HOURS (one polite retry per cool-down, never a bypass). */
export const COOL_HOURS = Number(process.env.MEDIA_YOUTUBE_COOL_HOURS) || 6;

export class BotCheckError extends Error { constructor(msg) { super(msg); this.code = 'BOT_CHECK'; this.fatal = true; } }

const BASE = ['--no-playlist', '--no-warnings', '--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--socket-timeout', '30', '--sleep-requests', '2'];

async function ytdlp(args, opts) {
  const js = existsSync(DENO()) ? ['--js-runtimes', `deno:${DENO()}`] : [];
  // a PO token (bgutil-ytdlp-pot-provider, script mode — no server, nothing listening) for YouTube's "not a bot" check;
  // never cookies or an account (Chad 10-22)
  if (existsSync(POT_SCRIPT())) js.push('--extractor-args', `youtubepot-bgutilscript:script_path=${POT_SCRIPT()}`);
  try { return await run(YTDLP(), [...BASE, ...js, ...args], opts); }
  catch (err) { if (isBotCheck(err.message)) throw new BotCheckError(`YouTube asked for a bot check — stopping (not bypassed): ${err.message.slice(0, 200)}`); throw err; }
}

/** Metadata only (no download). */
export async function youtubeInfo(url) {
  const { stdout } = await ytdlp(['-J', '--skip-download', url], { timeoutMs: 120_000 });
  const j = JSON.parse(stdout);
  return { youtube_id: j.id, url: j.webpage_url || url, title: j.title, channel: j.channel || j.uploader, channel_id: j.channel_id, channel_url: j.channel_url,
    upload_date: j.upload_date ? `${j.upload_date.slice(0, 4)}-${j.upload_date.slice(4, 6)}-${j.upload_date.slice(6, 8)}` : null,
    duration_s: j.duration || null, description: String(j.description || '').slice(0, 3000), license: j.license || null, tags: (j.tags || []).slice(0, 20) };
}

/** Best audio only, into dir as <id>.<ext> → the file path. */
export async function youtubeAudio(url, dir) {
  await ytdlp(['-f', 'bestaudio/best', '-x', '--limit-rate', '3M', '-o', join(dir, '%(id)s.%(ext)s'), url], { timeoutMs: 3600_000 });
  const id = youtubeId(url);
  const f = (await readdir(dir)).find((n) => !id || n.startsWith(id));
  if (!f) throw new Error('yt-dlp finished but no audio file was written');
  return join(dir, f);
}

// ── when YouTube refuses our address: the oEmbed metadata and a paid audio service (Chad 10-22: "the paid API is fine,
// especially if it means someone else takes the responsibility of providing the account"; "go ahead with the full YouTube
// run") — free yt-dlp first, then Titan Network, then Seemuapps (Apify actors; APIFI_API in .env-secrets, never logged).

/** Title / channel from YouTube's public oEmbed endpoint (no player, no bot check). */
export async function youtubeOembed(url, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`oembed ${r.status}`);
  const j = await r.json();
  const handle = /youtube\.com\/(@[^/?#]+|channel\/[^/?#]+)/.exec(j.author_url || '')?.[1] || null;
  return { youtube_id: youtubeId(url), url, title: j.title, channel: j.author_name, channel_id: handle ? handle.replace(/^channel\//, '') : null, channel_url: j.author_url || null,
    upload_date: null, duration_s: null, description: '', license: null, tags: [], via: 'oembed' };
}

/** Metadata: yt-dlp when YouTube lets us, else oEmbed. */
export async function youtubeInfoAny(url, deps = {}) {
  try { return await (deps.info || youtubeInfo)(url); } catch (err) { return { ...(await (deps.oembed || youtubeOembed)(url, deps)), info_error: String(err.message).slice(0, 160) }; }
}

export const APIFY_ACTORS = {
  titan: { id: 'titan_network~titan-youtube-audio', input: (u) => ({ startUrls: [u], storageType: 'apify', maxConcurrency: 1 }) },
  seemu: { id: 'seemuapps~youtube-to-mp3', input: (u) => ({ videoUrls: [u], audioQuality: '128', maxDurationSeconds: 14400 }) },
};

/** The file URL in an actor's dataset item (Titan: downloadFiles[].downloadedFileUrl; Seemuapps: fileUrl). Pure. */
export function audioUrlOf(item) {
  if (!item || item.error) return null;
  const f = (item.downloadFiles || []).find((x) => x.kind === 'audio' && x.downloadedFileUrl);
  return f?.downloadedFileUrl || item.downloadedFileUrl || item.fileUrl || item.audioFileUrl || null;
}

/** One video through an Apify actor: run, wait, take the file AT ONCE (its storage link is not kept), checksum it.
 *  → { path, sha256, bytes, route, run_id, usd } */
export async function apifyAudio(url, dir, actorKey, { token = process.env.APIFI_API, fetchImpl = fetch, pollMs = 15000, maxUsd = 0.5, timeoutS = 5400 } = {}) {
  if (!token) throw new Error('no Apify token (APIFI_API)');
  const a = APIFY_ACTORS[actorKey];
  const API = 'https://api.apify.com/v2';
  const j = async (u, o) => { const r = await fetchImpl(u, o); const t = await r.text(); try { return JSON.parse(t); } catch { return { error: { message: t.slice(0, 160) } }; } };
  const started = await j(`${API}/acts/${a.id}/runs?token=${token}&maxTotalChargeUsd=${maxUsd}&timeout=${timeoutS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.input(url)) });
  if (started.error) throw new Error(`${actorKey}: ${String(started.error.message).replaceAll(token, '<token>').slice(0, 160)}`);
  let run = started.data;
  for (let t = 0; !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status); t += pollMs) {
    if (t > timeoutS * 1000) throw new Error(`${actorKey}: run did not finish`);
    await new Promise((r) => setTimeout(r, pollMs));
    run = (await j(`${API}/actor-runs/${run.id}?token=${token}`)).data || run;
  }
  const items = await j(`${API}/datasets/${run.defaultDatasetId}/items?token=${token}&clean=1`);
  const item = Array.isArray(items) ? items[0] : null;
  const fileUrl = audioUrlOf(item);
  if (!fileUrl) throw new Error(`${actorKey}: no audio (${run.status}${item?.error ? `: ${String(item.error).slice(0, 100)}` : ''})`);
  const res = await fetchImpl(/api\.apify\.com/.test(fileUrl) ? `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}token=${token}` : fileUrl, { signal: AbortSignal.timeout(1800_000) });
  if (!res.ok) throw new Error(`${actorKey}: file ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 100_000) throw new Error(`${actorKey}: file too small (${bytes.length} B)`);
  const { createHash } = await import('crypto');
  const { writeFile } = await import('fs/promises');
  const ext = /\.(m4a|mp3|webm|opus|ogg|wav)(\?|$)/i.exec(fileUrl)?.[1]?.toLowerCase() || (/(mp4|m4a)/.test(res.headers.get('content-type') || '') ? 'm4a' : 'mp3');
  const path = join(dir, `${youtubeId(url) || 'audio'}.${ext}`);
  await writeFile(path, bytes);
  const usd = Number(run.usageTotalUsd || 0) + Object.entries(run.chargedEventCounts || {}).reduce((s, [k, n]) => s + n * Number(run.pricingInfo?.pricingPerEvent?.actorChargeEvents?.[k]?.eventPriceUsd || 0), 0);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, route: actorKey, run_id: run.id, usd: Math.round(usd * 10000) / 10000 };
}

/** The audio by the first route that works: free yt-dlp (PO token) → Titan → Seemuapps. → { path, route, sha256?, usd?, tried: [...] } */
export async function fetchAudio(url, dir, deps = {}) {
  const tried = [];
  try { const path = await (deps.ytdlp || youtubeAudio)(url, dir); return { path, route: 'yt-dlp', usd: 0, tried }; }
  catch (err) { tried.push({ route: 'yt-dlp', error: String(err.message).slice(0, 160) }); }
  for (const k of deps.order || ['titan', 'seemu']) {
    try { return { ...(await (deps.apify || apifyAudio)(url, dir, k, deps)), tried }; }
    catch (err) { tried.push({ route: k, error: String(err.message).slice(0, 160) }); }
  }
  const e = new BotCheckError(`no route could fetch the audio: ${tried.map((t) => `${t.route}: ${t.error}`).join(' | ')}`);
  e.tried = tried;
  throw e;
}
