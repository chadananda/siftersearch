// /api/media — the media library (planning/media-library-plan.md §5). Public: the listing (filters + transcript search),
// one item (meta + aligned transcript + quotes + cross-references), its published files (Range, immutable per version),
// and signed clips for 'clips'-level items (≤ 180 s, cut on demand). Admin (X-Internal-Key or admin): pipeline status,
// YouTube channel permissions, add media by URL/path (Dewey's "add media"). Deps: media-repo, media/*.
import { createReadStream, existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, normalize, extname } from 'path';
import { listMedia, mediaFacets, getMediaBySlug, mediaStates, listChannels, upsertChannel, mediaParagraphs, mediaByDocIds, speakersByKeys, getSpeaker, listSpeakers } from '../lib/repos/media-repo.js';
import { enqueue } from '../lib/repos/ops-report-repo.js';
import { requireInternal } from '../lib/auth.js';
import { canServeFile, clipQuery, verifyClip, CLIP_CAP, LEVELS } from '../lib/media/rights.js';
import { parseRange, clampClip } from '../lib/media/range.js';
import { run } from '../lib/media/tools.js';
import { youtubeAt } from '../lib/media/render.js';

const TYPES = { '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const readJson = async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };

/** "bytes=a-b" → { start, end } inside size, or null (whole file) / 'bad'. Pure. */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return null;
  let start = m[1] === '' ? null : Number(m[1]), end = m[2] === '' ? null : Number(m[2]);
  if (start == null && end == null) return 'bad';
  if (start == null) { start = Math.max(0, size - end); end = size - 1; } else if (end == null || end >= size) end = size - 1;
  return start > end || start >= size ? 'bad' : { start, end };
}

/** Per-IP clip budget (a clip at a time is the right; stitching a whole talk by script is not): n per window. */
const budgets = new Map();
export function clipBudget(ip, { n = 40, windowMs = 10 * 60_000, now = Date.now() } = {}) {
  const b = budgets.get(ip) || { at: now, used: 0 };
  if (now - b.at > windowMs) { b.at = now; b.used = 0; }
  b.used++; budgets.set(ip, b);
  if (budgets.size > 50000) budgets.clear();
  return b.used <= n;
}

/** A speaker's portrait as the page uses it: the image worker URL (face-centred crops by `tr=`), versioned by the master's
 *  hash, with its credit. null without a portrait. Pure. */
export function speakerThumb(s) {
  if (!s?.file || !s.sha) return null;
  // the master lives in the cdn-assets R2 bucket (biography/<id>.<ext> or media-speakers/<key>.<ext>): the image worker
  // serves it at /img/cdn/siftersearch.com/<file>; the page asks for each size with fo-face (src/lib/imagekit.js helpers)
  return { url: `https://siftersearch.com/img/cdn/siftersearch.com/${s.file}?v=${s.sha.slice(0, 16)}`, kind: 'photo', service: true, name: s.name, credit: s.credit || null, licence: s.licence || null,
    source_url: s.source_url || null, page_url: s.page_url || null, fetched_at: s.fetched_at || null };
}

const pub = (reply, s = 60) => reply.header('Cache-Control', `public, max-age=${s}, s-maxage=${s}`);

export default async function mediaRoutes(fastify) {
  // the listing: filters, facets, and (q) a search across all transcripts
  fastify.get('/', async (req, reply) => {
    const q = req.query || {};
    let hits = null, ids = null;
    if (q.q && String(q.q).trim().length >= 2) {
      const { searchKeywordQdrant, searchPhrases } = await import('../lib/search/qdrant-layers.js');
      const opts = { limit: 60, filters: { collection: 'Media' }, timeoutMs: 8000 };
      const [kw, ph] = await Promise.all([searchKeywordQdrant(String(q.q), opts).catch(() => ({ hits: [] })), searchPhrases(String(q.q), opts).catch(() => ({ hits: [] }))]);
      const order = [...new Set([...kw.hits, ...ph.hits].map((h) => h.paragraph_id))].slice(0, 80);
      const rows = await mediaParagraphs(order);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = await mediaByDocIds([...new Set(rows.map((r) => r.doc_id))]);
      const byDoc = new Map(items.map((i) => [i.doc_id, i]));
      hits = [];
      for (const id of order) {
        const r = byId.get(id); const it = r && byDoc.get(r.doc_id);
        if (!it || it.state !== 'done') continue;
        let a = {}; try { a = JSON.parse(r.block_attrs || '{}'); } catch { /* none */ }
        if (a.t0 == null) continue;   // a chapter heading or the summary line: not a moment in the recording
        hits.push({ slug: it.slug, item_id: it.id, t0: Number(a.t0) || 0, t1: Number(a.t1) || null, text: String(r.text).slice(0, 400) });
      }
      ids = [...new Set(hits.map((h) => h.item_id))];
    }
    const list = await listMedia({ ...q, ids, limit: q.limit, offset: q.offset });
    // every card's picture: the speaker's portrait (image worker) where there is one, else the item's generated tile
    const spk = new Map((await speakersByKeys([...new Set(list.items.map((i) => i.speaker_key).filter(Boolean))])).map((s) => [s.key, speakerThumb(s)]));
    for (const it of list.items) {
      const t = spk.get(it.speaker_key);
      it.thumb_url = t?.url || (it.thumb ? `/api/media/${it.slug}/file/${it.thumb}` : null);
      it.thumb_kind = t ? 'photo' : (it.thumb ? 'tile' : null);
    }
    const facets = q.facets === '0' ? null : await mediaFacets();
    pub(reply, 60);
    return { ...list, facets, hits };
  });

  // one item: what the player needs (no audio bytes)
  fastify.get('/:slug', async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    if (!it || it.state !== 'done' || !it.dir) { reply.header('Cache-Control', 'public, max-age=60, s-maxage=60'); return reply.code(404).send({ error: 'NotFound' }); }
    const [meta, tr, spk] = await Promise.all([readJson(join(it.dir, 'meta.json')), readJson(join(it.dir, 'transcript.json')), it.speaker_key ? getSpeaker(it.speaker_key) : null]);
    const portrait = speakerThumb(spk);
    if (!meta || !tr) return reply.code(404).send({ error: 'NotFound' });
    const v = meta.version || 1, base = `/api/media/${it.slug}`;
    const level = LEVELS.includes(it.playback) ? it.playback : 'clips';
    pub(reply, 300);
    return {
      slug: it.slug, title: meta.title, speaker: meta.speaker, speakers: meta.speakers || {}, date: meta.date, year: meta.year, place: meta.place, event: meta.event,
      language: meta.language, duration_s: meta.duration_s, has_video: meta.has_video, summary: meta.summary, topics: meta.topics || [], chapters: meta.chapters || [],
      tradition: meta.tradition, collection: meta.collection, doc_id: it.doc_id,
      source: meta.source?.kind === 'youtube' ? { kind: 'youtube', url: meta.source.url, youtube_id: meta.source.youtube_id, channel: meta.source.channel, upload_date: meta.source.upload_date } : { kind: 'archive' },
      youtube: youtubeAt(meta),
      rights: { playback: level, download: level === 'full' && !!meta.rights?.download, clip_cap: CLIP_CAP, basis: meta.rights?.basis || null },
      audio: level === 'full' ? { ogg: `${base}/file/web/${it.slug}.ogg?v=${v}`, m4a: `${base}/file/web/${it.slug}.m4a?v=${v}` } : null,
      clip_url: level === 'clips' ? `${base}/clip-url` : null,
      waveform: `${base}/file/waveform.json?v=${v}`, page: `${base}/file/page.html?v=${v}`,
      thumb: portrait || (meta.thumb?.file ? { url: `${base}/file/${meta.thumb.file}?v=${v}`, kind: meta.thumb.kind, licence: meta.thumb.licence || null, artist: meta.thumb.artist || null, source_url: meta.thumb.source_url || null } : null),
      // compact transcript: words as [text, start, end]
      paragraphs: tr.paragraphs.map((p) => ({ n: p.n, pi: meta.pi?.[p.n] ?? null, t0: p.t0, t1: p.t1, spk: p.spk, sentences: p.sentences, words: p.words.map((w) => [w.w, w.s, w.e]) })),
      quotes: (tr.quotes || []).map((q) => ({ para: q.para, i0: q.i0, i1: q.i1, t0: q.t0, t1: q.t1, url: q.url, cite: q.cite, writer: q.writer, excerpt: q.excerpt, basis: q.basis, gate: q.gate })),
      cross_references: (tr.cross_references || []).map((c) => ({ para: c.para, i0: c.i0, i1: c.i1, t0: c.t0, url: c.url, cite: c.cite, writer: c.writer, claim: c.claim, excerpt: c.excerpt, confidence: c.confidence })),
      corrections: (tr.corrections || []).length, version: v,
    };
  });

  // a published file (Range; immutable per ?v=). Full audio only for 'full' items; page/transcript/waveform/thumb for all.
  fastify.get('/:slug/file/*', async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    const name = normalize(String(req.params['*'] || '')).replace(/^(\.\.(\/|$))+/, '');
    if (!it || it.state !== 'done' || !it.dir || name.includes('..')) return reply.code(404).send({ error: 'NotFound' });
    if (!canServeFile(it.playback, name)) return reply.code(403).send({ error: 'Forbidden', why: `playback level '${it.playback}'` });
    const path = join(it.dir, name);
    if (!existsSync(path)) return reply.code(404).send({ error: 'NotFound' });
    const size = statSync(path).size;
    reply.header('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', req.query?.v ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'public, max-age=300, s-maxage=300');
    if (name === 'page.html') reply.header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob:; connect-src 'self'");
    const r = byteRange(req.headers.range, size);
    if (r === 'bad') { reply.header('Content-Range', `bytes */${size}`); return reply.code(416).send(); }
    if (r) {
      reply.code(206).header('Content-Range', `bytes ${r.start}-${r.end}/${size}`).header('Content-Length', r.end - r.start + 1);
      return reply.send(createReadStream(path, { start: r.start, end: r.end }));
    }
    reply.header('Content-Length', size);
    return reply.send(createReadStream(path));
  });

  // a signed clip URL for a range of a 'clips' item (the player asks per paragraph / range)
  fastify.get('/:slug/clip-url', async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    if (!it || it.state !== 'done') return reply.code(404).send({ error: 'NotFound' });
    if (it.playback === 'search') return reply.code(403).send({ error: 'Forbidden', why: 'text only' });
    if (!clipBudget(req.ip)) return reply.code(429).send({ error: 'TooManyClips' });
    const r = parseRange(req.query?.t);
    if (!r) return reply.code(400).send({ error: 't=start-end required' });
    const c = clampClip(r, it.duration_s, CLIP_CAP);
    reply.header('Cache-Control', 'private, no-store');
    const fmt = req.query?.fmt === 'm4a' ? '&fmt=m4a' : '';   // older Safari plays no Ogg Opus: an AAC cut from the .m4a
    return { url: `/api/media/${it.slug}/clip?${clipQuery({ slug: it.slug, start: c.start, end: c.end })}${fmt}`, start: Number(c.start.toFixed(1)), end: Number(c.end.toFixed(1)) };
  });

  // the clip itself: ≤ 180 s of the web rendition, stream-copied (no re-encode)
  fastify.get('/:slug/clip', async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    const q = req.query || {};
    const r = parseRange(q.t);
    if (!it || it.state !== 'done' || !r || r.end == null) return reply.code(404).send({ error: 'NotFound' });
    if (!verifyClip({ slug: it.slug, start: r.start, end: r.end, exp: q.exp, sig: q.sig })) return reply.code(403).send({ error: 'Forbidden', why: 'expired or unsigned clip' });
    if (r.end - r.start > CLIP_CAP + 0.5) return reply.code(400).send({ error: 'clip too long' });
    const m4a = q.fmt === 'm4a';
    const src = join(it.dir, 'web', `${it.slug}.${m4a ? 'm4a' : 'ogg'}`);
    const chunks = [];
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(r.start), '-to', String(r.end), '-i', src, '-c', 'copy',
      ...(m4a ? ['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov'] : ['-f', 'ogg']), '-'], { timeoutMs: 30_000, onStdout: (d) => chunks.push(d) });
    reply.header('Content-Type', m4a ? 'audio/mp4' : 'audio/ogg').header('Cache-Control', 'private, max-age=3600');
    return reply.send(Buffer.concat(chunks));
  });

  // ── admin ──
  fastify.get('/admin/status', { preHandler: requireInternal }, async () => ({ states: await mediaStates(), channels: await listChannels() }));
  fastify.post('/admin/channels', { preHandler: requireInternal }, async (req, reply) => {
    const b = req.body || {};
    if (!b.channel_id || !LEVELS.includes(b.playback)) return reply.code(400).send({ error: 'channel_id and playback (full|clips|search) required' });
    return upsertChannel({ channel_id: b.channel_id, name: b.name || null, playback: b.playback, granted_by: b.granted_by || null, note: b.note || null });
  });
  // Dewey's "add media": URLs (YouTube) or server paths → a media-scan run
  fastify.post('/admin/add', { preHandler: requireInternal }, async (req, reply) => {
    const b = req.body || {};
    const urls = [].concat(b.urls || b.url || []).filter(Boolean), paths = [].concat(b.paths || b.path || []).filter(Boolean);
    if (!urls.length && !paths.length) return reply.code(400).send({ error: 'urls or paths required' });
    const run = await enqueue('media-scan', { urls, paths, roots: [], batch: Number(b.batch) || 1 }, req.user?.email || 'internal');
    return { queued: run };
  });
}

/** /api/speakers — the speakers and their canonical portraits (coverage). */
export async function speakerRoutes(fastify) {
  fastify.get('/', async (req, reply) => { pub(reply, 300); return { speakers: (await listSpeakers()).map((s) => ({ key: s.key, name: s.name, entity_id: s.entity_id, photo: speakerThumb(s) })) }; });
}
