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
