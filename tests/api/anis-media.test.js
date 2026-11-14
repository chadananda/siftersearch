// Talks on the Anís host (worker/anis/talks.js): /media + /media/<slug>, remaster-only audio, 301/404, sitemap, edge cache.
import { describe, it, expect } from 'vitest';
import { MEDIA_PATH, mediaUrl, mediaSlug, listeningAudio, talkPage, mediaResponse, mediaSitemapUrls } from '../../worker/anis/talks.js';
import { policyFor, cacheKey, anisCacheKey } from '../../worker/edge-cache.js';

const API = 'https://api.test';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
// a fake origin: path → body (a number = that status)
const origin = (routes) => async (u) => { const p = u.slice(API.length), v = routes[p]; return v === undefined ? json({ error: 'not found' }, 404) : typeof v === 'number' ? json({}, v) : json(v); };

const TALK = {
  slug: 'dunbar-a-talk', title: 'A Talk', speaker: 'Hooper Dunbar', year: 1990, duration_s: 600,
  audio: { remastered: true, ready: true,
    ogg: '/api/media/dunbar-a-talk/file/web/dunbar-a-talk.ogg?v=1', m4a: '/api/media/dunbar-a-talk/file/web/dunbar-a-talk.m4a?v=1',
    original_url: '/api/media/dunbar-a-talk/file/web/dunbar-a-talk.original.m4a?v=1', original_ogg: '/api/media/dunbar-a-talk/file/web/dunbar-a-talk.original.ogg?v=1' },
  chapters: [{ t: 65, title: 'Opening' }],
  paragraphs: [{ n: 1, t0: 0, words: [['Welcome', 0], ['friends', 1]] }],
  links: [{ kind: 'person', name: 'Hooper Dunbar', url: '/biography/hooper-dunbar' }],
};

describe('/media', () => {
  it('matches the Anís paths', () => {
    expect(MEDIA_PATH.exec('/media/some-talk-1')[1]).toBe('some-talk-1');
    expect(MEDIA_PATH.test('/media/x/m/abc')).toBe(false);   // clips and moments stay where they are
    expect(mediaUrl('a-talk')).toBe('https://anis.oceanlibrary.com/media/a-talk');
    expect(mediaSlug('/media/a-talk')).toBe('a-talk');
  });
  it('is edge-cached under its own key, apart from the siftersearch.com page at the same path', () => {
    expect(policyFor(new URL('https://anis.oceanlibrary.com/media/x'), 'GET', new Headers()).mode).toBe('cache');
    const a = anisCacheKey(new URL('https://anis.oceanlibrary.com/media/x'), 'html', '1.0.0');
    expect(a).not.toBe(cacheKey(new URL('https://siftersearch.com/media/x'), 'html', '1.0.0'));
    expect(a).toContain('/@anis/media/x');
  });
  const routes = {
    '/api/media/dunbar-a-talk': TALK,
    '/api/media/index': { items: [{ s: 'dunbar-a-talk', t: 'A Talk', sp: 'Hooper Dunbar', k: 'hooper-dunbar', y: 1990, pb: 'full', at: '2026-11-01T00:00:00' }, { s: 'hidden', t: 'Hidden', pb: 'none' }], speakers: [{ k: 'hooper-dunbar', n: 'Hooper Dunbar', c: 1 }] },
  };
  it('renders a talk: remaster sources only, AudioObject, speaker → /bio, time links, ask link', async () => {
    const { res } = await mediaResponse('dunbar-a-talk', { api: API, fetchFn: origin(routes) });
    expect(res.status).toBe(200);
    const h = await res.text();
    expect(h).toContain('<link rel="canonical" href="https://anis.oceanlibrary.com/media/dunbar-a-talk"');
    expect(h).toMatch(/"@type":"AudioObject"/);
    expect(h).toContain('dunbar-a-talk.ogg?v=1');
    expect(h).not.toMatch(/\.original\./);
    expect(h).not.toContain('original_url');
    expect(h).toContain('href="/bio/hooper-dunbar"');
    expect(h).toMatch(/href="#t=65"/);
    expect(h).toMatch(/Ask Anís about this talk/);
    expect(h).toContain('data-report="media-dunbar-a-talk"');   // Report an error (anonymous readers → the Anís feedback store)
  });
  it('never plays a talk that is not a finished remaster', () => {
    expect(listeningAudio({ audio: { ...TALK.audio, remastered: false } })).toBe(null);
    expect(listeningAudio({ audio: { ...TALK.audio, ready: false } })).toBe(null);
    expect(listeningAudio({ audio: { remastered: true, ready: true, ogg: TALK.audio.original_ogg } })).toBe(null);
    expect(talkPage({ ...TALK, audio: { ...TALK.audio, remastered: false } })).not.toContain('<audio');
  });
  it('301s a duplicate to the group best, 404s an unknown slug, renders the index', async () => {
    const f = async (u) => (u.endsWith('/api/media/dup-copy') ? json({ error: 'gone', moved_to: 'dunbar-a-talk' }, 404) : origin(routes)(u));
    const m = await mediaResponse('dup-copy', { api: API, fetchFn: f });
    expect(m.res.status).toBe(301);
    expect(m.res.headers.get('location')).toBe('/media/dunbar-a-talk');
    expect((await mediaResponse('nope', { api: API, fetchFn: origin(routes) })).res.status).toBe(404);
    const i = await mediaResponse('', { api: API, fetchFn: origin(routes) });
    expect(i.res.status).toBe(200);
    expect(await i.res.text()).toContain('href="/media/dunbar-a-talk"');
  });
  it('the sitemap lists every published talk', async () => {
    const t = await mediaSitemapUrls({ api: API, fetchFn: origin(routes) });
    expect(t.map((x) => x.loc)).toEqual(['https://anis.oceanlibrary.com/media', 'https://anis.oceanlibrary.com/media/dunbar-a-talk']);
  });
});

