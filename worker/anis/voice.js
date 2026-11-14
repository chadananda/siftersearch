// Anís voice routes at the edge (P5): POST /api/chat/transcribe (recorded question → text, Workers AI Whisper with Bahá'í
// names as the hint) and POST /api/chat/speak ({text} → mp3, Workers AI aura-1, cached in R2 ANIS_CACHE by text hash).
// Both are paid Workers AI calls: rate-limited per visitor (VOICE_LIMIT) and metered to tower's ledger (logUsage rows).
import { modelFor } from '../../api/lib/model-roles.js';

export const MAX_AUDIO = 4 * 1024 * 1024;   // ~2 min of opus/aac; a spoken question is seconds
export const MAX_SPEAK = 1500;              // one sentence or a few; the client speaks a reply sentence by sentence
export const VOICES = ['athena', 'asteria', 'luna', 'stella', 'hera', 'orion', 'arcas', 'perseus', 'angus', 'orpheus', 'helios', 'zeus'];
export const DEFAULT_VOICE = 'athena';
// Names and terms Whisper otherwise mangles (prompt hint, not a vocabulary lock)
export const HINT = "Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi, Bahá'í, Universal House of Justice, Kitáb-i-Aqdas, Kitáb-i-Íqán, "
  + "Hidden Words, Seven Valleys, Ṭáhirih, Quddús, Mullá Ḥusayn, Nabíl, Dawn-Breakers, Badasht, Shiraz, Tihrán, Baghdad, Adrianople, Akká, Haifa, Ridván, Naw-Rúz, Mashriqu'l-Adhkár.";
const json = (o, status, h) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });

export function toBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
/** Text normalised for speech and for the cache key (same words → same audio). */
export const speakText = (t) => String(t || '').replace(/\s+/g, ' ').trim();
export const ttsKey = async (model, voice, text) => `tts/${model.replace(/[^\w.-]+/g, '_')}/${voice}/${(await sha256(text)).slice(0, 40)}.mp3`;
/** Whisper sometimes "hears" its own prompt hint in silence: that is no question. */
export const echoesHint = (text) => { const t = String(text || ''); return /Kitáb-i-Aqdas, Kitáb-i-Íqán|Universal House of Justice, Kitáb/.test(t); };

async function limited(request, env, h) {
  if (!env.VOICE_LIMIT) return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ok = (await env.VOICE_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success;
  return ok ? null : json({ error: 'Too many requests — please wait a minute.' }, 429, { ...h, 'retry-after': '60' });
}

/** POST /api/chat/transcribe — body = the recorded audio (any browser recorder format). → {text, seconds}. */
export async function transcribeRoute(request, env, ctx, { headers: h = {}, log } = {}) {
  if (!env.AI) return json({ error: 'voice unavailable' }, 503, h);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_AUDIO) return json({ error: 'recording too long' }, 413, h);
  const lim = await limited(request, env, h); if (lim) return lim;
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ error: 'no audio' }, 400, h);
  if (buf.byteLength > MAX_AUDIO) return json({ error: 'recording too long' }, 413, h);
  const lang = new URL(request.url).searchParams.get('lang');
  const { model } = modelFor('anis-transcribe');
  let r;
  try {
    r = await env.AI.run(model, { audio: toBase64(buf), task: 'transcribe', vad_filter: true, initial_prompt: HINT, ...(lang && /^[a-z]{2}$/.test(lang) ? { language: lang } : {}) });
  } catch (err) {
    console.warn(`[anis] transcribe failed: ${err?.message}`);
    return json({ error: 'could not transcribe' }, 502, h);
  }
  // billed per audio second: Whisper's own measure, else an opus-rate estimate (~4 KB/s)
  const seconds = Math.round(10 * (Number(r?.transcription_info?.duration) || buf.byteLength / 4000)) / 10;
  log?.([{ provider: 'cloudflare', service_type: 'transcription', model, caller: 'anis-transcribe-edge', prompt_tokens: seconds, completion_tokens: 0 }], ctx);
  const text = String(r?.text || '').trim();
  return json({ text: echoesHint(text) ? '' : text, seconds }, 200, { ...h, 'cache-control': 'no-store' });
}

async function audioBytes(out) {
  if (out instanceof Response) { if (!out.ok) throw new Error(`tts ${out.status}`); return out.arrayBuffer(); }
  if (out instanceof ReadableStream) return new Response(out).arrayBuffer();
  if (out instanceof ArrayBuffer) return out;
  if (ArrayBuffer.isView(out)) return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  if (typeof out?.audio === 'string') return Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)).buffer;
  throw new Error('tts: no audio');
}

/** POST /api/chat/speak — {text, voice?} → audio/mpeg. Same text + voice → served from R2 (no charge). */
export async function speakRoute(request, env, ctx, { headers: h = {}, log } = {}) {
  const body = await request.json().catch(() => null);
  const text = speakText(body?.text);
  if (!text) return json({ error: 'text required' }, 400, h);
  if (text.length > MAX_SPEAK) return json({ error: 'text too long' }, 413, h);
  const voice = VOICES.includes(body?.voice) ? body.voice : DEFAULT_VOICE;
  const { model } = modelFor('anis-speak');
  const key = await ttsKey(model, voice, text);
  const audioHeaders = { ...h, 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' };
  const hit = env.ANIS_CACHE ? await env.ANIS_CACHE.get(key).catch(() => null) : null;
  if (hit) return new Response(hit.body, { status: 200, headers: { ...audioHeaders, 'x-anis-tts': 'hit' } });
  if (!env.AI) return json({ error: 'voice unavailable' }, 503, h);
  const lim = await limited(request, env, h); if (lim) return lim;
  let bytes;
  try {
    bytes = await audioBytes(await env.AI.run(model, { text, speaker: voice, encoding: 'mp3' }, { returnRawResponse: true }));
  } catch (err) {
    console.warn(`[anis] speak failed: ${err?.message}`);
    return json({ error: 'could not speak' }, 502, h);
  }
  log?.([{ provider: 'cloudflare', service_type: 'tts', model, caller: 'anis-speak-edge', prompt_tokens: text.length, completion_tokens: 0 }], ctx);
  if (env.ANIS_CACHE && bytes.byteLength) ctx?.waitUntil?.(env.ANIS_CACHE.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { at: String(Date.now()), chars: String(text.length) } }).catch(() => {}));
  return new Response(bytes, { status: 200, headers: { ...audioHeaders, 'x-anis-tts': 'miss' } });
}
