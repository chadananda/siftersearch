// Anís voice edge routes (worker/anis/voice.js, wired in worker/anis/index.js): transcribe + speak with fake AI / R2 / tower;
// every paid call metered (one ledger row), cache hits free, limits and bad input answered without a model call.
import { describe, it, expect } from 'vitest';
import worker, { usageLog } from '../../worker/anis/index.js';
import { transcribeRoute, speakRoute, toBase64, ttsKey, speakText, echoesHint, HINT, MAX_AUDIO, MAX_SPEAK, DEFAULT_VOICE } from '../../worker/anis/voice.js';
import { MODEL_ROLES } from '../../api/lib/model-roles.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';

const r2 = () => {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? { body: new Blob([m.get(k)]).stream() } : null), put: async (k, v) => { m.set(k, v); } };
};
const ai = (out) => { const calls = []; return { calls, run: async (model, input, opts) => { calls.push({ model, input, opts }); return typeof out === 'function' ? out(model, input) : out; } }; };
const ctx = () => { const waits = []; return { waits, waitUntil: (p) => waits.push(p) }; };
const logs = () => { const rows = []; return { rows, log: (r) => rows.push(...r) }; };
const audioReq = (bytes, url = 'https://anis.test/api/chat/transcribe') => new Request(url, { method: 'POST', headers: { 'content-type': 'audio/webm', 'content-length': String(bytes.byteLength) }, body: bytes });
const speakReq = (body) => new Request('https://anis.test/api/chat/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('voice roles + prices', () => {
  it('both models have a role and a registry price (ledger cost is never $0)', () => {
    for (const role of ['anis-transcribe', 'anis-speak']) {
      const r = MODEL_ROLES[role];
      expect(r.provider).toBe('cloudflare');
      expect(MODEL_REGISTRY[r.model]?.pricing?.input).toBeGreaterThan(0);
    }
  });
});

describe('transcribe', () => {
  it('runs Whisper with the names hint and meters audio seconds', async () => {
    const A = ai({ text: ' Who was Ṭáhirih? ', transcription_info: { duration: 3.21 } }), L = logs();
    const res = await transcribeRoute(audioReq(new Uint8Array([1, 2, 3, 4])), { AI: A }, ctx(), { log: L.log });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'Who was Ṭáhirih?', seconds: 3.2 });
    expect(A.calls[0].model).toBe(MODEL_ROLES['anis-transcribe'].model);
    expect(A.calls[0].input).toMatchObject({ audio: toBase64(new Uint8Array([1, 2, 3, 4])), initial_prompt: HINT, vad_filter: true });
    expect(A.calls[0].input.language).toBeUndefined();
    expect(L.rows).toEqual([{ provider: 'cloudflare', service_type: 'transcription', model: MODEL_ROLES['anis-transcribe'].model, caller: 'anis-transcribe-edge', prompt_tokens: 3.2, completion_tokens: 0 }]);
  });
  it('passes a two-letter language; estimates seconds when Whisper gives none', async () => {
    const A = ai({ text: 'Bonjour' }), L = logs();
    const res = await transcribeRoute(audioReq(new Uint8Array(8000), 'https://anis.test/api/chat/transcribe?lang=fr'), { AI: A }, ctx(), { log: L.log });
    expect((await res.json()).seconds).toBe(2);
    expect(A.calls[0].input.language).toBe('fr');
    expect(L.rows[0].prompt_tokens).toBe(2);
  });
  it('the hint echoed back on silence is no question', async () => {
    expect(echoesHint(HINT)).toBe(true);
    expect(echoesHint('Who wrote the Kitáb-i-Aqdas?')).toBe(false);
    const res = await transcribeRoute(audioReq(new Uint8Array(10)), { AI: ai({ text: HINT }) }, ctx(), {});
    expect((await res.json()).text).toBe('');
  });
  it('empty, too long, no AI, model failure, rate limit', async () => {
    const A = ai({ text: 'x' });
    expect((await transcribeRoute(audioReq(new Uint8Array(0)), { AI: A }, ctx(), {})).status).toBe(400);
    const big = new Request('https://anis.test/api/chat/transcribe', { method: 'POST', headers: { 'content-length': String(MAX_AUDIO + 1) }, body: new Uint8Array(4) });
    expect((await transcribeRoute(big, { AI: A }, ctx(), {})).status).toBe(413);
    expect((await transcribeRoute(audioReq(new Uint8Array(4)), {}, ctx(), {})).status).toBe(503);
    const L = logs();
    const fail = await transcribeRoute(audioReq(new Uint8Array(4)), { AI: { run: async () => { throw new Error('boom'); } } }, ctx(), { log: L.log });
    expect(fail.status).toBe(502); expect(L.rows).toEqual([]);
    const lim = await transcribeRoute(audioReq(new Uint8Array(4)), { AI: A, VOICE_LIMIT: { limit: async () => ({ success: false }) } }, ctx(), {});
    expect(lim.status).toBe(429);
    expect(A.calls).toEqual([]);
  });
});

describe('speak', () => {
  const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2]);
  it('miss → aura-1 mp3, stored in R2, metered by characters; hit → served free', async () => {
    const A = ai(() => new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } })), R = r2(), L = logs(), c = ctx();
    const env = { AI: A, ANIS_CACHE: R };
    const res = await speakRoute(speakReq({ text: '  The Báb   was born in 1819. ' }), env, c, { log: L.log });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('x-anis-tts')).toBe('miss');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3);
    expect(A.calls[0]).toMatchObject({ model: MODEL_ROLES['anis-speak'].model, input: { text: 'The Báb was born in 1819.', speaker: DEFAULT_VOICE, encoding: 'mp3' }, opts: { returnRawResponse: true } });
    expect(L.rows).toEqual([{ provider: 'cloudflare', service_type: 'tts', model: MODEL_ROLES['anis-speak'].model, caller: 'anis-speak-edge', prompt_tokens: 25, completion_tokens: 0 }]);
    await Promise.all(c.waits);
    expect(R.m.has(await ttsKey(MODEL_ROLES['anis-speak'].model, DEFAULT_VOICE, 'The Báb was born in 1819.'))).toBe(true);
    const again = await speakRoute(speakReq({ text: 'The Báb was born in 1819.' }), env, ctx(), { log: L.log });
    expect(again.headers.get('x-anis-tts')).toBe('hit');
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(mp3);
    expect(A.calls.length).toBe(1); expect(L.rows.length).toBe(1);
  });
  it('accepts a stream or base64 result; a known voice is honoured, an unknown one is not', async () => {
    const A = ai(() => new Blob([mp3]).stream());
    const res = await speakRoute(speakReq({ text: 'Hello there.', voice: 'luna' }), { AI: A }, ctx(), {});
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3);
    expect(A.calls[0].input.speaker).toBe('luna');
    const B = ai({ audio: btoa(String.fromCharCode(...mp3)) });
    const r2b = await speakRoute(speakReq({ text: 'Hello there.', voice: 'darth' }), { AI: B }, ctx(), {});
    expect(new Uint8Array(await r2b.arrayBuffer())).toEqual(mp3);
    expect(B.calls[0].input.speaker).toBe(DEFAULT_VOICE);
  });
  it('bad input, too long, failure, limit: no charge', async () => {
    const A = ai(() => new Response(mp3)), L = logs();
    expect((await speakRoute(speakReq({}), { AI: A }, ctx(), { log: L.log })).status).toBe(400);
    expect((await speakRoute(speakReq({ text: 'x'.repeat(MAX_SPEAK + 1) }), { AI: A }, ctx(), { log: L.log })).status).toBe(413);
    expect((await speakRoute(speakReq({ text: 'hi' }), {}, ctx(), {})).status).toBe(503);
    expect((await speakRoute(speakReq({ text: 'hi' }), { AI: ai(() => new Response('no', { status: 500 })) }, ctx(), { log: L.log })).status).toBe(502);
    expect((await speakRoute(speakReq({ text: 'hi' }), { AI: A, VOICE_LIMIT: { limit: async () => ({ success: false }) } }, ctx(), {})).status).toBe(429);
    expect(A.calls).toEqual([]); expect(L.rows).toEqual([]);
  });
  it('same words, same key; spacing does not matter', async () => {
    expect(speakText('  a \n b ')).toBe('a b');
    expect(await ttsKey('@cf/deepgram/aura-1', 'athena', 'a b')).toMatch(/^tts\/_cf_deepgram_aura-1\/athena\/[0-9a-f]{40}\.mp3$/);
  });
});

describe('wiring', () => {
  it('index routes both with CORS; usage goes to tower logUsage', async () => {
    const tower = [];
    const fetchFn = async (url, init) => { tower.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ out: 1 })); };
    const env = { AI: ai({ text: 'hello', transcription_info: { duration: 1 } }), TOWER_URL: 'https://tower.test', TOWER_KEY: 'k' };
    const res = await worker.fetch(new Request('https://anis.test/api/chat/transcribe', { method: 'POST', headers: { origin: 'https://anis.oceanlibrary.com' }, body: new Uint8Array(4) }), env, ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://anis.oceanlibrary.com');
    const sp = await worker.fetch(speakReq({}), env, ctx());
    expect(sp.status).toBe(400);
    const c = ctx();
    await usageLog(env, fetchFn)([{ model: 'm', prompt_tokens: 1 }], c);
    expect(c.waits.length).toBe(1);
    expect(tower[0].url).toBe('https://tower.test/api/v1/anis/tool/logUsage');
    expect(tower[0].body.args).toEqual([[{ model: 'm', prompt_tokens: 1 }]]);
  });
});
