// The API's audio block (remastered + original URLs, per-paragraph s0) and the player's rule that the original never
// plays (Chad 10-29/10-31, both hosts): no Original switch, no original URL rendered, loaded or warmed.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { render } from 'svelte/server';
import { talkAudio, isRemastered, originalStarts, originalField } from '../../api/lib/media/talk-audio.js';
import { remasterOnly } from '../../src/lib/media.js';
import { readFileSync as rf } from 'fs';
import MediaPlayer from '../../src/components/media/MediaPlayer.svelte';

const base = JSON.parse(readFileSync(new URL('../fixtures/media-item.json', import.meta.url), 'utf8'));
const remasteredMeta = { version: 3, trim: { start_s: 1.5, end_s: 90 }, aligned_to: 'unipase', web_original: { ogg: 'web/talk.original.ogg', m4a: 'web/talk.original.m4a' } };

describe('talkAudio (GET /api/media/:slug audio block)', () => {
  it('a remastered talk carries original_url (m4a) + original_ogg with the same ?v=, and remastered: true', () => {
    const a = talkAudio({ slug: 'talk', level: 'full', meta: remasteredMeta });
    expect(a).toMatchObject({ remastered: true, offset_s: 1.5, end_s: 90, m4a: '/api/media/talk/file/web/talk.m4a?v=3',
      original_url: '/api/media/talk/file/web/talk.original.m4a?v=3', original_ogg: '/api/media/talk/file/web/talk.original.ogg?v=3' });
  });
  it('still on the transparent copy (aligned_to safe, or no web_original) → remastered: false, no original URLs', () => {
    for (const meta of [{ ...remasteredMeta, aligned_to: 'safe' }, { version: 2 }, { aligned_to: 'unipase' }]) {
      const a = talkAudio({ slug: 'talk', level: 'full', meta });
      expect(a.remastered).toBe(false);
      expect(a.original_url).toBeUndefined();
      expect(isRemastered(meta)).toBe(false);
    }
  });
  it('no full playback → no audio block', () => expect(talkAudio({ slug: 'talk', level: 'clips', meta: remasteredMeta })).toBeNull());
  it('s0 per paragraph only when remastered and the words carry it (a missing s0 falls back to s)', () => {
    const words = [{ w: 'a', s: 1, e: 2, s0: 1.04 }, { w: 'b', s: 2, e: 3 }];
    expect(originalStarts(words, true)).toEqual([1.04, 2]);
    expect(originalStarts(words, false)).toBeNull();
    expect(originalField([{ w: 'a', s: 1, e: 2 }], true)).toEqual({});
    expect(originalField(words, true)).toEqual({ s0: [1.04, 2] });
  });
});

describe('the player never offers or loads the original (Chad 10-29/10-31)', () => {
  const full = (audio) => ({ ...base, rights: { ...base.rights, playback: 'full' }, audio });
  const rem = { ogg: '/a.ogg', m4a: '/a.m4a', offset_s: 0, remastered: true, original_url: '/o.m4a', original_ogg: '/o.ogg' };
  const src = rf(new URL('../../src/components/media/MediaPlayer.svelte', import.meta.url), 'utf8');
  it('remasterOnly drops both original URLs and keeps the rest', () => {
    expect(remasterOnly(rem)).toEqual({ ogg: '/a.ogg', m4a: '/a.m4a', offset_s: 0, remastered: true });
    expect(remasterOnly(null)).toBe(null);
  });
  it('a remastered talk whose audio still carries original URLs renders no switch and no original URL', () => {
    const { body } = render(MediaPlayer, { props: { item: full(rem) } });
    expect(body).not.toMatch(/radiogroup|Audio version|data-original-slot|>Orig/);
    expect(body).not.toMatch(/\/o\.(m4a|ogg)/);
  });
  it('the SSR data and every refreshed payload pass through remasterOnly; no code path names an original URL', () => {
    expect(src).toMatch(/audioInfo = \$state\(remasterOnly\(item\.audio\)\)/);
    expect(src).toMatch(/audioInfo = remasterOnly\(d\.audio\)/);
    expect(src).not.toMatch(/audioInfo = (item|d)\.audio\b/);
    expect(src).not.toMatch(/original_url|original_ogg|switchCopy|hasOriginal|originals/);
  });
  it('the source played and the copy warmed are the remastered ogg or m4a only', () => {
    expect(src.match(/const (want|main) = ogg && audioInfo\.ogg \? audioInfo\.ogg : audioInfo\.m4a \|\| audioInfo\.ogg;/g)).toHaveLength(2);
    expect(src).not.toMatch(/canPlayType[^\n]*original/);
  });
  it('the talk page strips the original before render, on both hosts', () => {
    const page = rf(new URL('../../src/pages/media/[slug].astro', import.meta.url), 'utf8');
    expect(page).toMatch(/^if \(item\?\.audio\) item\.audio = remasterOnly\(item\.audio\)/m);
    expect(page).not.toMatch(/originals=/);
  });
});

// Chad 10-24: photos are never shown. TalkHero: drawing only (no caption, no toggle/rotation), else initials.
describe('TalkHero portrait', () => {
  it('a photo thumb renders no image and no attribution; a drawing renders the drawing with no caption', async () => {
    const { default: TalkHero } = await import('../../src/components/media/TalkHero.svelte');
    const photo = render(TalkHero, { props: { item: { ...base, speaker: 'Peter Khan', thumb: { kind: 'photo', url: 'https://x/p.jpg', credit: 'Bahaipedia (bahai.media)' } } } }).body;
    expect(photo).not.toMatch(/p\.jpg|Photo of|figcaption|data-photos-toggle|data-rotate/);
    const sk = render(TalkHero, { props: { item: { ...base, speaker: 'Peter Khan', thumb: { kind: 'sketch', url: 'https://x/sq.jpg', sketch: { square: 'https://x/sq.jpg', url: 'https://x/t.jpg' } } } } }).body;
    expect(sk).toMatch(/sq\.jpg/);
    expect(sk).not.toMatch(/figcaption|Photos \(/);
  });
  it('the public rights rule serves only the generated tile, never a stored photo file', async () => {
    const { canServeFile } = await import('../../api/lib/media/rights.js');
    expect(canServeFile('full', 'thumb.svg')).toBe(true);
    expect(canServeFile('full', 'thumb.jpg')).toBe(false);
  });
});

describe('edge purge on publish', () => {
  it('purgeTalk POSTs the slug with the internal key (and is off under test by default)', async () => {
    const { purgeTalk } = await import('../../api/lib/media/edge-purge.js');
    expect(await purgeTalk('a-talk', { key: 'k' })).toBe(false);
    const saved = process.env.VITEST, savedEnv = process.env.NODE_ENV; delete process.env.VITEST; delete process.env.NODE_ENV;
    try {
      const calls = [];
      const ok = await purgeTalk('a-talk', { key: 'k', fetchImpl: async (u, o) => (calls.push([u, o.method, o.headers['x-internal-key']]), { ok: true }) });
      expect(ok).toBe(true);
      expect(calls[0]).toEqual(['https://siftersearch.com/_edge/purge?slug=a-talk', 'POST', 'k']);
    } finally { process.env.VITEST = saved; if (savedEnv !== undefined) process.env.NODE_ENV = savedEnv; }
  });
  it('the worker route is keyed and evicts the talk page + API entry', () => {
    const w = rf(new URL('../../worker/index.js', import.meta.url), 'utf8');
    expect(w).toContain("'/_edge/purge'");
    expect(w).toContain('evict(k, env)');
    expect(w).toMatch(/_edge\/purge[^]*?S1_KEY/);
  });
});

describe('R2-first web audio (worker/media.js)', () => {
  it('a web-audio miss starts the copy into R2; when the tower cannot give it, a quick 202, never tower bytes to the listener', async () => {
    const { mediaFile, isWebAudio } = await import('../../worker/media.js');
    const env = { MEDIA_BUCKET: { get: async () => null, head: async () => null, put: async () => {} } };
    const origin = vi.fn(async () => new Response('pending', { status: 503 }));
    const orig = globalThis.fetch; globalThis.fetch = origin;
    try {
      const t0 = Date.now();
      const r = await mediaFile(new Request('https://siftersearch.com/api/media/a-talk/file/web/a-talk.ogg?v=3'), env, { waitUntil() {} }, 'https://api.example');
      expect(r.status).toBe(202);
      expect(r.headers.get('retry-after')).toBe('2');
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(origin.mock.calls.map(([, o]) => o.headers.range)).toEqual(['bytes=0-524287']);   // the copy's first piece only
    } finally { globalThis.fetch = orig; }
    expect(isWebAudio('/api/media/a-talk/file/web/a-talk.original.m4a')).toBe(true);
    expect(isWebAudio('/api/media/a-talk/file/waveform.json')).toBe(false);
  });
  it('warm: present objects are never fetched again; a lock makes concurrent page loads one fill', async () => {
    const { warmMedia } = await import('../../worker/media.js');
    const store = new Set(['a-talk/web/a-talk.ogg@3']), locks = new Map(), puts = [];
    const env = { MEDIA_BUCKET: { head: async (k) => (store.has(k) ? {} : null), get: async () => null, put: async (k) => puts.push(k) },
      EDGE_CACHE: { get: async (k) => locks.get(k) || null, put: async (k, v) => locks.set(k, v), delete: async (k) => locks.delete(k) } };
    const orig = globalThis.fetch; globalThis.fetch = vi.fn();
    try {
      const j = await (await warmMedia(new URL('https://x/_media/warm?slug=a-talk&v=3&fmt=ogg&copy=both'), { ...env, EDGE_CACHE: { ...env.EDGE_CACHE, get: async (k) => (k.includes('original') ? String(Date.now()) : null) } }, 'https://api.example')).json();
      expect(j.files).toEqual({ 'web/a-talk.ogg': 'present', 'web/a-talk.original.ogg': 'busy' });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect((await warmMedia(new URL('https://x/_media/warm?slug=../x&v=3'), env, 'https://api.example')).status).toBe(400);
    } finally { globalThis.fetch = orig; }
  });
});

describe('hover prefetch', () => {
  it('only talk-page links count; slow / save-data connections never prefetch', async () => {
    const { talkSlug, slowLink } = await import('../../src/lib/hover-prefetch.js');
    expect(talkSlug('/media/grossmann-convergence-ends-beginnings-9-2000?t=12')).toBe('grossmann-convergence-ends-beginnings-9-2000');
    for (const h of ['/media', '/media/remaster', '/media/a/m/key', '/library/x', 'https://x.org/media/a']) expect(talkSlug(h)).toBeNull();
    expect(slowLink({ saveData: true })).toBe(true);
    expect(slowLink({ effectiveType: '3g' })).toBe(true);
    expect(slowLink({ effectiveType: '4g' })).toBe(false);
  });
});

describe('parallel multipart fill + ensure', () => {
  it('fillParallel copies in 8 MB parts, several at once, and completes in order', async () => {
    const { fillParallel } = await import('../../worker/media.js');
    const total = 40 * 1024 * 1024, got = [], parts = [];
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u, { headers }) => {
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(headers.range).map(Number);
      return new Response(new Uint8Array(b - a + 1), { status: 206, headers: { 'content-range': `bytes ${a}-${b}/${total}`, 'content-type': 'audio/ogg' } });
    });
    const env = { MEDIA_BUCKET: { createMultipartUpload: async () => ({ uploadPart: async (n, buf) => (parts.push(n), got.push(buf.byteLength), { partNumber: n }), complete: async (p) => got.push(p.map((x) => x.partNumber).join()), abort: async () => {} }) } };
    try {
      const r = await fillParallel(env, 'k', 'https://o/x');
      expect(r.bytes).toBe(total);
      expect(got.slice(-1)[0]).toBe('1,2,3,4,5');
      expect(got.slice(0, 5).every((n) => n === 8 * 1024 * 1024)).toBe(true);
    } finally { globalThis.fetch = orig; }
  });
  it('ensure answers present for an existing object and rejects bad kinds', async () => {
    const { ensureMedia } = await import('../../worker/media.js');
    const env = { MEDIA_BUCKET: { head: async () => ({}) } };
    const ok = await (await ensureMedia(new URL('https://x/_media/ensure?slug=a-talk&v=3&kind=src&ext=wav'), env, 'https://o')).json();
    expect(ok).toMatchObject({ present: true, key: 'a-talk/src/original.wav@3' });
    expect((await ensureMedia(new URL('https://x/_media/ensure?slug=a-talk&v=3&kind=zip'), env, 'https://o')).status).toBe(400);
  });
});

describe('abandoned edge audio transfers',()=>{
 it('reclaims an expired transfer lease and fills the requested copy without fetching the other one',async()=>{
  const {warmMedia}=await import('../../worker/media.js');
  const key='a-talk/web/a-talk.m4a@3',locks=new Map([[`fill:${key}`,String(Date.now()-180000)]]),store=new Set();
  const env={EDGE_CACHE:{get:async k=>locks.get(k)||null,put:async(k,v)=>locks.set(k,v),delete:async k=>locks.delete(k)},MEDIA_BUCKET:{head:async k=>store.has(k)?{}:null,get:async()=>null,put:async k=>store.add(k)}};
  const original=globalThis.fetch;globalThis.fetch=vi.fn(async()=>new Response(new Uint8Array(32),{status:206,headers:{'content-range':'bytes 0-31/32','content-type':'audio/mp4'}}));
  try{
   const result=await(await warmMedia(new URL('https://x/_media/warm?slug=a-talk&v=3&fmt=m4a&copy=main'),env,'https://origin')).json();
   expect(result.files).toEqual({'web/a-talk.m4a':'filled'});expect([...store]).toEqual([`${key}~0`,`${key}~m`]);expect(locks.has(`fill:${key}`)).toBe(false);
  }finally{globalThis.fetch=original;}
 });
});

// Chad 10-28 (Liliane): no CD spin. Portraits stay still; playing = a quiet pulsing ring; reduced motion = none.
describe('no portrait rotation', () => {
  const files = ['MomentView', 'TalkHero', 'MediaPlayer', 'listening/OnAir', 'listening/MiniPlayer', 'listening/Voices', 'listening/Jukebox'];
  it('no continuous or hover rotation on portraits; reduced motion switches the ring off', () => {
    for (const f of files) {
      const src = rf(new URL(`../../src/components/media/${f}.svelte`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/animation:\s*(spin|wobble)\b/);
      expect(src, f).not.toMatch(/\.(disc|record|rel-disc|disc-wave)[^{]*\{[^}]*rotate\(/);
    }
    for (const f of ['MomentView', 'TalkHero', 'MediaPlayer', 'listening/OnAir']) expect(rf(new URL(`../../src/components/media/${f}.svelte`, import.meta.url), 'utf8')).toMatch(/prefers-reduced-motion[^]*\.record\.spinning/);
  });
});
