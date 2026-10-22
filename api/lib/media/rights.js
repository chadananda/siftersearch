// Playback rights per media item: 'full' (stream + download) · 'clips' (ranges ≤ CLIP_CAP s, cut on demand, no full file,
// no download) · 'search' (text only). Defaults (planning/media-library-plan.md §6, Chad to confirm): YouTube without the
// channel owner's permission → clips (with the YouTube link prominent); a channel with permission → full; local archive
// talks → clips, except Chad Jones's own → full. Clip URLs carry an HMAC token valid for an hour. Pure (node:crypto).
import { createHmac, timingSafeEqual } from 'crypto';

export const LEVELS = ['full', 'clips', 'search'];
export const CLIP_CAP = 180;
const OWN_SPEAKERS = /^chad jones$/i;

/** The default playback level for a new item. channel: the media_channels row for a YouTube item ({ playback }). */
export function defaultPlayback({ sourceKind = 'file', speaker = '', channel = null } = {}) {
  if (sourceKind === 'youtube') return LEVELS.includes(channel?.playback) ? channel.playback : 'clips';
  if (OWN_SPEAKERS.test(String(speaker).trim())) return 'full';
  return 'clips';
}

/** Which published files a level may serve whole. page.html is served for every level: it plays clips when it must. */
export function canServeFile(level, name) {
  const n = String(name || '');
  if (/^(waveform\.json|thumb\.(jpg|png|svg)|page\.html|transcript\.(json|md))$/.test(n)) return true;
  if (/^web\/[^/]+\.(ogg|opus|m4a|mp3)$/.test(n)) return level === 'full';
  return false;
}

const keyOf = (secret) => String(secret || process.env.MEDIA_SIGNING_KEY || process.env.INTERNAL_API_KEY || 'dev-media-key');

/** Token for a clip of one item: hex HMAC over slug|start|end|exp. */
export function signClip({ slug, start, end, exp }, secret) {
  return createHmac('sha256', keyOf(secret)).update(`${slug}|${Number(start).toFixed(1)}|${Number(end).toFixed(1)}|${exp}`).digest('hex').slice(0, 32);
}

/** A signed clip query string valid for `ttl` seconds: "t=754-812&exp=…&sig=…". */
export function clipQuery({ slug, start, end, ttl = 3600, now = Date.now() }, secret) {
  const exp = Math.floor(now / 1000) + ttl;
  return `t=${Number(start).toFixed(1)}-${Number(end).toFixed(1)}&exp=${exp}&sig=${signClip({ slug, start, end, exp }, secret)}`;
}

export function verifyClip({ slug, start, end, exp, sig }, secret, now = Date.now()) {
  if (!sig || !exp || Number(exp) * 1000 < now) return false;
  const want = Buffer.from(signClip({ slug, start, end, exp }, secret));
  const got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got);
}
