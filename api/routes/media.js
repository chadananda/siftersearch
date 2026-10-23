// /api/media — the media library (planning/media-library-plan.md §5). Public: the listing (filters + transcript search),
// one item (meta + aligned transcript + quotes + cross-references), its published files (Range, immutable per version),
// and signed clips for 'clips'-level items (≤ 180 s, cut on demand). Admin (X-Internal-Key or admin): pipeline status,
// YouTube channel permissions, add media by URL/path (Dewey's "add media"). Deps: media-repo, media/*.
import { createReadStream, existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, normalize, extname } from 'path';
import { mediaIndexRows, momentByKey, listMoments, introClips, repairList, gradeCounts, listMedia, mediaFacets, getMediaBySlug, mediaStates, listChannels, upsertChannel, mediaParagraphs, mediaByDocIds, speakersByKeys, getSpeaker, listSpeakers } from '../lib/repos/media-repo.js';
import { enqueue } from '../lib/repos/ops-report-repo.js';
import { requireInternal } from '../lib/auth.js';
import { canServeFile, clipQuery, verifyClip, CLIP_CAP, LEVELS } from '../lib/media/rights.js';
import { parseRange, clampClip } from '../lib/media/range.js';
import { run } from '../lib/media/tools.js';
import { youtubeAt } from '../lib/media/render.js';
import { buildIndex, shapeSpeakers } from '../lib/media/listing-index.js';
import { speakerGallery, compactGallery } from '../lib/media/gallery.js';
import { parseClipRange, clipText } from '../lib/media/clip-text.js';
import { stripMdLinks } from '../lib/media/render.js';
import { tmpdir } from 'os';
import { writeFile, rename } from 'fs/promises';

const TYPES = { '.mp4': 'video/mp4', '.srt': 'application/x-subrip; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8',
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
  // extended: the 9:16 master with AI-extended margins (original pixels untouched) — crop THIS for tall or wide boxes
  const extended = s.ext_file && s.ext_sha && s.ext_of === s.sha ? { url: `https://siftersearch.com/img/cdn/siftersearch.com/${s.ext_file}?v=${s.ext_sha.slice(0, 16)}`,
    width: 1152, height: 2048, ai_extended: true, model: s.ext_model || null } : null;
  return { extended, url: `https://siftersearch.com/img/cdn/siftersearch.com/${s.file}?v=${s.sha.slice(0, 16)}`, kind: 'photo', service: true, name: s.name, credit: s.credit || null, licence: s.licence || null,
    source_url: s.source_url || null, page_url: s.page_url || null, fetched_at: s.fetched_at || null };
}

/** Speaker GALLERIES (Chad 10-23: several photos per person, rotated by the pages): key → [photo] (primary first; the
 *  media_speakers portrait leads when the gallery does not hold it). speakerRows: their media_speakers rows when at hand. */
export async function galleriesFor(keys, speakerRows = null) {
  const ks = [...new Set(keys.filter(Boolean))];
  if (!ks.length) return new Map();
  const { galleryRows } = await import('../lib/repos/media-repo.js');
  const [rows, spk] = await Promise.all([galleryRows(ks).catch(() => []), speakerRows || speakersByKeys(ks)]);
  const prim = new Map(spk.map((s) => [s.key, speakerThumb(s)]));
  const by = new Map();
  for (const r of rows) { if (!by.has(r.speaker_key)) by.set(r.speaker_key, []); by.get(r.speaker_key).push(r); }
  return new Map(ks.map((k) => [k, speakerGallery(by.get(k) || [], prim.get(k))]).filter(([, g]) => g.length));
}

// ── the listing index cache (GET /api/media/index): per item, keyed by updated_at; persisted so a restart reads one file
// instead of every transcript. A request re-reads at most INDEX_BUDGET changed items; the rest continue in the background.
const INDEX_FILE = process.env.MEDIA_INDEX_CACHE || join(tmpdir(), 'siftersearch-media-index.json');
const INDEX_BUDGET = 25;
let indexCache = null, indexBuilding = null;
const momentCards = new Map();   // moment key → rendered quote card (JPEG)
const heardCache = new Map();    // query → transcript hits (2 min)
async function loadIndexCache() {
  if (indexCache) return indexCache;
  const saved = await readJson(INDEX_FILE);
  indexCache = new Map(saved?.v === 1 ? saved.rows.map((x) => [x.id, { at: x.at, row: x.row }]) : []);
  return indexCache;
}
async function readIndexFiles(r) {
  if (!r.dir) return {};
  const [meta, tr, wave] = await Promise.all([readJson(join(r.dir, 'meta.json')), readJson(join(r.dir, 'transcript.json')), readJson(join(r.dir, 'waveform.json'))]);
  const tStart = new Map((tr?.paragraphs || []).map((p) => [p.n, p.t0]));
  if (meta?.headings) meta.headings = meta.headings.filter((h) => tStart.has(h.p)).map((h) => ({ ...h, t: tStart.get(h.p) }));
  return { meta, quotes: tr?.quotes || [], wave };
}
async function mediaIndex(budget) {
  const cache = await loadIndexCache();
  const rows = await mediaIndexRows();
  // while the background pass runs, a request serves what is cached instead of re-reading the same files
  const built = await buildIndex(rows, { readItem: readIndexFiles, cache, budget: indexBuilding && budget !== Infinity ? 0 : budget });
  if (built.read) {
    const tmp = `${INDEX_FILE}.${process.pid}.tmp`;
    writeFile(tmp, JSON.stringify({ v: 1, rows: [...cache].map(([id, x]) => ({ id, at: x.at, row: x.row })) })).then(() => rename(tmp, INDEX_FILE)).catch(() => {});
  }
  if (built.pending && !indexBuilding) indexBuilding = mediaIndex(Infinity).catch(() => null).finally(() => { indexBuilding = null; });
  return built;
}

/** A moment's canonical page (the design agent's /media/<slug>/m/<key>; /m/<key> and ?m=<key> redirect there). */
export const momentUrl = (slug, key) => `/media/${encodeURIComponent(slug)}/m/${encodeURIComponent(key)}`;

let progressMemo = null, liveMemo = null;
// the pipeline's stages as people read them (the public live view): internal stages → named steps
export const STEPS = [['download', ['archive']], ['grade', ['grade']], ['enhance', ['enhance', 'web']], ['transcribe', ['transcribe']], ['align', ['transcribe']],
  ['diarize', ['transcribe']], ['cleanup', ['correct', 'clean']], ['faithfulness', ['correct', 'clean']], ['publish', ['describe', 'thumb', 'render', 'ingest', 'catalog']],
  ['subheaders', ['headings']], ['crossref', ['quotes']], ['links', ['links']], ['assess', ['assess']], ['moments', ['assess']]];
/** One item's steps from its meta.stages, current stage and state. Pure. */
export function stepsOf(stages = {}, current = null, state = 'running') {
  return STEPS.map(([name, inner]) => {
    const done = inner.every((s) => stages[s]?.at);
    const ms = inner.reduce((a, s) => a + (stages[s]?.ms || 0), 0);
    const st = done ? 'done' : inner.includes(current) ? (state === 'failed' ? 'failed' : 'running') : 'pending';
    return { name, state: st, ...(done && ms ? { ms } : {}) };
  });
}
// the process strip (design agent): which talks are in which stage now
export const STRIP = [['import', ['archive']], ['enhance', ['grade', 'enhance', 'web']], ['transcribe', ['transcribe']], ['correct', ['correct', 'clean']],
  ['publish', ['describe', 'thumb', 'render', 'ingest', 'catalog', 'update']], ['subheaders', ['headings']], ['quotes', ['quotes']], ['links', ['links']], ['moments', ['assess']]];
/** Live items grouped by strip stage (most recent first, ≤ cap each). Pure. */
export function byStage(items = [], cap = 12) {
  const out = Object.fromEntries(STRIP.map(([k]) => [k, { count: 0, items: [] }]));
  for (const it of [...items].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))) {
    const k = STRIP.find(([, inner]) => inner.includes(it.stage))?.[0];
    if (!k) continue;
    out[k].count++;
    if (out[k].items.length < cap) out[k].items.push({ slug: it.slug, title: it.title, speaker: it.speaker, thumb: it.thumb, started_at: it.started_at });
  }
  return out;
}
/** A source key from a queue rank (the progress buckets). */
export const sourceOfRank = (rank) => ([null, 'historic', 'hands', 'uhj', 'historic-speakers', 'scholars'][Math.floor((rank ?? 5e7) / 1e7)] || 'scholars');
/** The public progress shape. Pure (exported for tests). */
export function shapeProgress({ rows = [], published_6h = 0 }, sources, now = Date.now()) {
  const by = sources.map(([source, label]) => { const r = rows.find((x) => x.source === source) || {};
    return { source, label, total: r.total || 0, downloaded: r.downloaded || 0, enhanced: r.enhanced || 0, remastered: r.remastered || 0, transcribed: r.transcribed || 0,
      aligned: r.aligned || 0, cross_referenced: r.cross_referenced || 0, published: r.published || 0, failed: r.failed || 0, quote_links: r.quote_links || 0, concept_crs: r.concept_crs || 0 }; })
    .filter((x) => x.total > 0);
  const sum = (k) => by.reduce((a, x) => a + x[k], 0);
  const perHour = Math.round((published_6h / 6) * 10) / 10;
  const remaining = sum('total') - sum('published') - sum('failed');
  return { total_targets: sum('total'), downloaded: sum('downloaded'), enhanced: sum('enhanced'), remastered: sum('remastered'), transcribed: sum('transcribed'),
    aligned: sum('aligned'), cross_referenced: sum('cross_referenced'), published: sum('published'), failed: sum('failed'), quote_links: sum('quote_links'), concept_crs: sum('concept_crs'),
    by_source: by, items_per_hour: perHour, eta_iso: perHour > 0 && remaining > 0 ? new Date(now + (remaining / perHour) * 3600_000).toISOString() : null, updated_at: new Date(now).toISOString() };
}

/** Health with the RUNNING counts taken from the ops runs (10-23: an 'update' re-run of a published talk keeps state 'done',
 *  so counting items by state said "LLM idle" while the LLM lane was busy). */
export async function liveHealth(pipelineHealth, runningRuns) {
  const h = await pipelineHealth();
  const runs = await runningRuns(['media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-item']);
  const n = (name) => runs.filter((r) => r.name === name).length;
  // (the LLM gates live in the media service, not here: their state is in its log — 'llm gates' every feed pass)
  return { ...h, compute_running: n('media-compute'), asr_running: n('media-asr'), diar_running: n('media-diar'), llm_running: n('media-llm') + n('media-item') };
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
        hits.push({ slug: it.slug, item_id: it.id, t0: Number(a.t0) || 0, t1: Number(a.t1) || null, text: stripMdLinks(r.text).slice(0, 400) });
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

  // the LISTING INDEX: every published talk as one compact row + one row per speaker (the /media page filters it in the
  // browser as you type). Edge-cached; a partial build (items still being read) is cached briefly.
  fastify.get('/index', async (req, reply) => {
    const { items, pending } = await mediaIndex(INDEX_BUDGET);
    const spkRows = await listSpeakers();
    const speakers = shapeSpeakers(items, spkRows, speakerThumb);
    // each speaker's gallery (the pages rotate through it); a person without a media_speakers portrait gets the gallery's first
    const gal = await galleriesFor(speakers.map((s) => s.k), spkRows);
    for (const s of speakers) {
      const g = gal.get(s.k);
      if (!g) continue;
      s.g = compactGallery(g);
      if (!s.p) { s.p = g[0].url; s.px = g[0].extended; s.cr = g[0].credit; }
    }
    reply.header('Cache-Control', pending ? 'public, max-age=15, s-maxage=15' : 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600');
    return { v: 1, generated_at: new Date().toISOString(), pending, total: items.length, hours: Math.round(items.reduce((a, i) => a + i.d, 0) / 360) / 10, items, speakers };
  });

  // ── AUDIOGRAM SHORTS: POST { slug, start, end, format?, template? } → the files when already rendered (public, cached per
  // talk version × range × format × template), else a queued render. Anyone may ask for a talk's MOMENTS (a fixed, small set:
  // shared links reuse one file); any other range needs the internal key or an admin. At most SHORT_QUEUE renders wait.
  fastify.post('/shorts', async (req, reply) => {
    const b = req.body || {};
    const it = await getMediaBySlug(b.slug);
    const { planShort } = await import('../lib/media/short-job.js');
    let plan;
    try { plan = await planShort(it, b); } catch (err) { return reply.code(400).send({ error: err.message }); }
    const { existsSync: ex } = await import('fs');
    const files = { mp4: plan.files.mp4, srt: plan.files.srt, vtt: plan.files.vtt, post: plan.files.post };
    const internal = req.headers['x-internal-key'] && req.headers['x-internal-key'] === process.env.DEPLOY_SECRET;
    if (!(internal && b.force) && ex(join(it.dir, 'shorts', `${plan.key}.mp4`))) return { status: 'done', key: plan.key, template: plan.template, ...files };
    if (!plan.moment && !internal) return reply.code(403).send({ error: 'only a talk\'s moments can be rendered on request', moments: `/api/media/${it.slug}` });
    const { pendingRuns, enqueue } = await import('../lib/repos/ops-report-repo.js');
    const pending = await pendingRuns('media-short');
    if (!internal && pending.length >= Number(process.env.SHORT_QUEUE || 10)) return reply.code(429).send({ error: 'busy — try again in a few minutes' });
    const run = await enqueue('media-short', { slug: it.slug, start: plan.range.start, end: plan.range.end, format: plan.range.format, ...(b.template ? { template: b.template } : {}), ...(internal && b.force ? { force: true } : {}) }, internal ? 'internal' : 'public');
    return reply.code(202).send({ status: run.status, run: run.id, poll: `/api/media/shorts/run/${run.id}`, key: plan.key, template: plan.template, ...files });
  });
  fastify.get('/shorts/run/:id', async (req, reply) => {
    const { getRun } = await import('../lib/repos/ops-report-repo.js');
    const r = await getRun(Number(req.params.id));
    if (!r || r.name !== 'media-short') return reply.code(404).send({ error: 'NotFound' });
    reply.header('Cache-Control', 'no-store');
    return { status: r.status, result: r.result || null, error: r.error ? String(r.error).slice(0, 300) : null };
  });

  // a MOMENT by its short key (shareable: the moment page and its social card draw from this)
  fastify.get('/moments/:key', async (req, reply) => {
    const m = await momentByKey(req.params.key);
    if (!m) return reply.code(404).send({ error: 'NotFound' });
    pub(reply, 300);
    return { ...m, url: momentUrl(m.slug, m.key), range: `?t=${(m.t0_ms / 1000).toFixed(1)}-${(m.t1_ms / 1000).toFixed(1)}` };
  });
  // its QUOTE CARD (og:image): 1200×630 JPEG, rendered once per process and edge-cached for a week
  fastify.get('/moments/:key/card.jpg', async (req, reply) => {
    const m = await momentByKey(req.params.key);
    if (!m) return reply.code(404).send({ error: 'NotFound' });
    let buf = momentCards.get(m.key);
    if (!buf) {
      const thumb = m.speaker_key ? speakerThumb(await getSpeaker(m.speaker_key)) : null;
      let photo = null;
      if (thumb?.url) { try { const r = await fetch(`${thumb.url}&tr=w-360,h-360,fo-face,q-85,f-jpeg`, { signal: AbortSignal.timeout(8000) }); if (r.ok) photo = Buffer.from(await r.arrayBuffer()); } catch { /* the initials label */ } }
      const { renderMomentCard } = await import('../lib/media/moment-card.js');
      buf = await renderMomentCard({ text: m.text, speaker: m.speaker, title: m.title, year: m.year }, photo);
      if (momentCards.size > 300) momentCards.clear();
      momentCards.set(m.key, buf);
    }
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return reply.send(buf);
  });
  // moments across the library (the ticker): ?limit, ?audience=newcomers|community|internal (upper bound), ?kind
  fastify.get('/moments', async (req, reply) => {
    const q = req.query || {};
    const max = { newcomers: 2, community: 4, internal: 5 }[q.audience] || null;
    pub(reply, 300);
    return { moments: await listMoments({ limit: q.limit, maxAudience: max, kind: q.kind || null }) };
  });
  // introductory clips: the best section-level ranges (rated open / seeker-friendly) across the library
  fastify.get('/intro-clips', async (req, reply) => { pub(reply, 300); return { clips: await introClips({ limit: Number(req.query?.limit) || 40 }) }; });

  // HEARD IN THE TRANSCRIPTS (the /media tuner): the site's own search engine — semantic + keyword + phrase layers, no
  // planner call — restricted to the Media collection, mapped back to talks and timestamps through the paragraph block
  // attributes. Concepts match, not just words. Cached 2 min per query; edge-cached 60 s.
  fastify.get('/heard', async (req, reply) => {
    const q = String(req.query?.q || '').trim().slice(0, 200);
    if (q.length < 2) return { hits: [] };
    const key = q.toLowerCase();
    const c = heardCache.get(key);
    if (c && Date.now() - c.at < 120_000) { pub(reply, 60); return c.value; }
    const t0 = Date.now();
    // three layers, fused by reciprocal rank (the eval of 10-22: the engine alone found the right talk for 12 of 34 tuner
    // queries, BM25 + phrases alone 26 — together they cover names, words and concepts)
    const { multiIndexSearch } = await import('../lib/search.js');
    const { searchKeywordQdrant, searchPhrases } = await import('../lib/search/qdrant-layers.js');
    const opts = { limit: 60, filters: { collection: 'Media' }, timeoutMs: 8000 };
    const [res, kw, ph] = await Promise.all([
      multiIndexSearch(q, { limit: 40, filters: { collection: 'Media' }, diversify: false, phraseLayer: true, qdrantKeyword: true }).catch(() => ({ hits: [] })),
      searchKeywordQdrant(q, opts).catch(() => ({ hits: [] })), searchPhrases(q, opts).catch(() => ({ hits: [] }))]);
    const fused = new Map();
    for (const [list, w] of [[res.hits || [], 1], [kw.hits || [], 1.2], [ph.hits || [], 1]]) {
      list.forEach((h, i) => { const id = h.paragraph_id ?? h.id; if (id) fused.set(id, (fused.get(id) || 0) + w / (60 + i)); });
    }
    const order = [...fused].sort((x, y) => y[1] - x[1]).map(([id]) => id).slice(0, 80);
    const terms = new Map((res.hits || []).map((h) => [h.paragraph_id ?? h.id,
      [...new Set([...String(h._formatted?.text || '').matchAll(/<em>(.*?)<\/em>/g)].map((m) => m[1]))].slice(0, 12)]));
    const rows = await mediaParagraphs(order);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = await mediaByDocIds([...new Set(rows.map((r) => r.doc_id))]);
    const byDoc = new Map(items.map((i) => [i.doc_id, i]));
    const hits = [];
    for (const id of order) {
      const r = byId.get(id); const it = r && byDoc.get(r.doc_id);
      if (!it || it.state !== 'done') continue;
      let a = {}; try { a = JSON.parse(r.block_attrs || '{}'); } catch { /* none */ }
      if (a.t0 == null) continue;   // a heading or the summary line: not a moment in the recording
      hits.push({ slug: it.slug, title: it.title, speaker: it.speaker, speaker_key: it.speaker_key, year: it.year, t0: Number(a.t0) || 0, t1: Number(a.t1) || null,
        text: String(r.text).slice(0, 900), terms: terms.get(id) || [] });
    }
    // per talk: talks in the order of their best passage, each talk's passages together (the page groups them)
    const firstAt = new Map(); hits.forEach((h, i) => { if (!firstAt.has(h.slug)) firstAt.set(h.slug, i); });
    hits.sort((x, y) => firstAt.get(x.slug) - firstAt.get(y.slug));
    const value = { hits, ms: Date.now() - t0 };
    if (heardCache.size > 500) heardCache.clear();
    heardCache.set(key, { at: Date.now(), value });
    pub(reply, 60);
    return value;
  });

  // one item: what the player needs (no audio bytes)
  fastify.get('/:slug', async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    if (!it || it.state !== 'done' || !it.dir) { reply.header('Cache-Control', 'public, max-age=60, s-maxage=60'); return reply.code(404).send({ error: 'NotFound' }); }
    const [meta, tr, spk] = await Promise.all([readJson(join(it.dir, 'meta.json')), readJson(join(it.dir, 'transcript.json')), it.speaker_key ? getSpeaker(it.speaker_key) : null]);
    const gallery = it.speaker_key ? (await galleriesFor([it.speaker_key], spk ? [spk] : [])).get(it.speaker_key) || [] : [];
    const portrait = speakerThumb(spk) || (gallery[0] ? { ...gallery[0], kind: 'photo', service: true, name: it.speaker } : null);
    if (portrait && gallery.length > 1) portrait.gallery = gallery;
    if (!meta || !tr) return reply.code(404).send({ error: 'NotFound' });
    const v = meta.version || 1, base = `/api/media/${it.slug}`;
    const level = LEVELS.includes(it.playback) ? it.playback : 'clips';
    const tStart = new Map(tr.paragraphs.map((p) => [p.n, p.t0]));
    pub(reply, 300);
    return {
      slug: it.slug, title: meta.title, speaker: meta.speaker, speakers: meta.speakers || {}, date: meta.date, year: meta.year, uploaded_year: meta.uploaded_year ?? null, date_flag: meta.date_flag ?? null, place: meta.place, event: meta.event,
      language: meta.language, duration_s: meta.duration_s, has_video: meta.has_video, summary: meta.summary, topics: meta.topics || [], chapters: meta.chapters || [],
      // topic subheaders: structure only (no audio of their own); t = the paragraph they open, for the contents list
      headings: (meta.headings || []).filter((h) => tStart.has(h.p)).map((h) => ({ p: h.p, t: tStart.get(h.p), text: h.text, form: h.form, slug: h.slug })),
      tradition: meta.tradition, collection: meta.collection, doc_id: it.doc_id,
      source: meta.source?.kind === 'youtube' ? { kind: 'youtube', url: meta.source.url, youtube_id: meta.source.youtube_id, channel: meta.source.channel, upload_date: meta.source.upload_date } : { kind: 'archive' },
      youtube: youtubeAt(meta),
      rights: { playback: level, download: level === 'full' && !!meta.rights?.download, clip_cap: CLIP_CAP, basis: meta.rights?.basis || null },
      // offset_s: the web copy starts this many seconds into the recording (silence trimmed; every other time here is the
      // recording's own): the player seeks to t − offset_s. skips: dead gaps (a tape flip) the player jumps over
      audio: level === 'full' ? { ogg: `${base}/file/web/${it.slug}.ogg?v=${v}`, m4a: `${base}/file/web/${it.slug}.m4a?v=${v}`, offset_s: meta.trim?.start_s || 0, end_s: meta.trim?.end_s ?? null } : null,
      skips: meta.trim?.gaps || [],
      clip_url: level === 'clips' ? `${base}/clip-url` : null,
      waveform: `${base}/file/waveform.json?v=${v}`, page: `${base}/file/page.html?v=${v}`,
      thumb: portrait || (meta.thumb?.file ? { url: `${base}/file/${meta.thumb.file}?v=${v}`, kind: meta.thumb.kind, licence: meta.thumb.licence || null, artist: meta.thumb.artist || null, source_url: meta.thumb.source_url || null } : null),
      // compact transcript: words as [text, start, end]
      paragraphs: tr.paragraphs.map((p) => ({ n: p.n, pi: meta.pi?.[p.n] ?? null, t0: p.t0, t1: p.t1, spk: p.spk, sentences: p.sentences, words: p.words.map((w) => (w.hide ? [w.w, w.s, w.e, 1] : [w.w, w.s, w.e])) })),
      quotes: (tr.quotes || []).map((q) => ({ para: q.para, i0: q.i0, i1: q.i1, t0: q.t0, t1: q.t1, url: q.url, cite: q.cite, writer: q.writer, excerpt: q.excerpt, basis: q.basis, gate: q.gate })),
      cross_references: (tr.cross_references || []).map((c) => ({ para: c.para, i0: c.i0, i1: c.i1, t0: c.t0, url: c.url, cite: c.cite, writer: c.writer, claim: c.claim, excerpt: c.excerpt, confidence: c.confidence })),
      // named people → /biography/<id>; named works → their canonical copy (the spoken words are the anchor)
      links: (tr.links || []).map((l) => ({ para: l.para, i0: l.i0, i1: l.i1, kind: l.kind, url: l.url, name: l.name || null, title: l.title || null, section: l.section || null })),
      // audience (1 open … 5 internal) with its sections and introductory ranges; moments (verbatim, verified; no internal note)
      audience: meta.audience ? { score: meta.audience.score, label: meta.audience.label, rationale: meta.audience.rationale, tradition: meta.audience.tradition,
        sections: (meta.audience.sections || []).map(({ k, t0, t1, score, title, slug, intro }) => ({ k, t0, t1, score, title, slug, intro })), intro: meta.audience.intro || [] } : null,
      moments: (meta.moments || []).map(({ key, para, i0, i1, t0_ms, t1_ms, text, context, kind, topics, rank }) => ({ key, para, i0, i1, t0_ms, t1_ms, text, context, kind, topics, rank, url: momentUrl(it.slug, key) })),
      corrections: (tr.corrections || []).length, cleanup: tr.cleanup_stats || null, version: v,
      // the quality report, compact: overall grade, issues, and each dimension's grade + its headline value
      quality: meta.quality ? { overall: meta.quality.overall, primary_issue: meta.quality.primary_issue, secondary_issues: meta.quality.secondary_issues,
        chain: meta.quality.chain_key, dimensions: Object.fromEntries(Object.entries(meta.quality.dimensions || {}).map(([k, x]) => [k, { grade: x.grade,
          value: x.kHz ?? x.snr_db ?? x.c50_db ?? x.pct ?? x.per_hour ?? x.lufs ?? x.f0_median_hz ?? x.asr_logprob ?? null, type: x.type }])),
        perceived: meta.quality.perceived || null, insertions_reverted: meta.quality.insertions_reverted ?? null } : null,
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
  // a CLIP's quote card (og:image for /media/<slug>/clip/<startMs>-<endMs>): the words of that span from the clean
  // transcript, set like a moment card; stateless, edge-cached for a week
  fastify.get('/:slug/card/:range', async (req, reply) => {
    const r = parseClipRange(req.params.range);
    const it = r && await getMediaBySlug(req.params.slug);
    if (!r || !it || it.state !== 'done' || !it.dir) return reply.code(404).send({ error: 'NotFound' });
    const ck = `${it.slug}:${r.startMs}-${r.endMs}:${it.updated_at}`;
    let buf = momentCards.get(ck);
    if (!buf) {
      const tr = await readJson(join(it.dir, 'transcript.json'));
      const text = clipText(tr?.paragraphs || [], r.startMs, r.endMs);
      if (!text) return reply.code(404).send({ error: 'NotFound' });
      const thumb = it.speaker_key ? speakerThumb(await getSpeaker(it.speaker_key)) : null;
      let photo = null;
      if (thumb?.url) { try { const f = await fetch(`${thumb.url}&tr=w-360,h-360,fo-face,q-85,f-jpeg`, { signal: AbortSignal.timeout(8000) }); if (f.ok) photo = Buffer.from(await f.arrayBuffer()); } catch { /* initials */ } }
      const { renderMomentCard } = await import('../lib/media/moment-card.js');
      buf = await renderMomentCard({ text, speaker: it.speaker, title: it.title, year: it.year }, photo);
      if (momentCards.size > 300) momentCards.clear();
      momentCards.set(ck, buf);
    }
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return reply.send(buf);
  });

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
    // the web copy may start later than the recording (silence trimmed): cut at web time (trim.js), the clip keeps its range
    const meta = await readJson(join(it.dir, 'meta.json')).catch(() => null);
    const { webTime } = await import('../lib/media/trim.js');
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-ss', String(webTime(r.start, meta?.trim)), '-to', String(webTime(r.end, meta?.trim)), '-i', src, '-c', 'copy',
      ...(m4a ? ['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov'] : ['-f', 'ogg']), '-'], { timeoutMs: 30_000, onStdout: (d) => chunks.push(d) });
    reply.header('Content-Type', m4a ? 'audio/mp4' : 'audio/ogg').header('Cache-Control', 'private, max-age=3600');
    return reply.send(Buffer.concat(chunks));
  });

  // ── admin ──
  // the REPAIR LIST: graded items at C or worse, grouped by their recommended fix chain (a batch gets one treatment)
  // THE IMPORT, public (Chad 10-22: "the total number being imported and their progress"): totals and per source, the
  // publishing rate over the last 6 h and an ETA. One group-by, memoised 60 s, edge-cached 60 s.
  fastify.get('/progress', async (req, reply) => {
    if (!progressMemo || Date.now() - progressMemo.at > 60_000) {
      const { importProgress, SOURCES } = await import('../lib/repos/media-repo.js');
      progressMemo = { at: Date.now(), value: shapeProgress(await importProgress(), SOURCES) };
    }
    pub(reply, 60);
    return progressMemo.value;
  });

  // WHAT IS BEING WORKED ON NOW (Chad 10-22: "the talks being processed right now and their steps") + the latest published;
  // a handful of rows and their meta.json files, memoised 10 s, edge-cached 10 s
  fastify.get('/progress/live', async (req, reply) => {
    if (!liveMemo || Date.now() - liveMemo.at > 10_000) {
      const { recentlyPublished, queuedCount, pipelineHealth, speakersByKeys: spk } = await import('../lib/repos/media-repo.js');
      // what is RUNNING NOW: the media runs in progress → their items (a stopped re-run leaves no 'in progress' ghost)
      const { runningRuns } = await import('../lib/repos/ops-report-repo.js');
      const { liveItemsByIds } = await import('../lib/repos/media-repo.js');
      const ids = [...new Set((await runningRuns(['media-compute', 'media-asr', 'media-diar', 'media-llm', 'media-item', 'media-fetch'])).flatMap((r) => [].concat(r.params?.id ?? r.params?.ids ?? [])).map(Number).filter(Boolean))];
      const rows = (await liveItemsByIds(ids.slice(0, 60))).slice(0, 40);
      const recent = await recentlyPublished(6);
      const people = new Map((await spk([...new Set([...rows, ...recent].map((r) => r.speaker_key).filter(Boolean))])).map((s) => [s.key, speakerThumb(s)?.url || null]));
      const in_progress = await Promise.all(rows.map(async (r) => {
        const meta = r.dir ? await readJson(join(r.dir, 'meta.json')) : null;
        const stages = meta?.stages || {};
        const startedAt = Object.values(stages).map((x) => x?.at).filter(Boolean).sort()[0] || r.updated_at;
        return { slug: r.slug, title: r.title || meta?.title || null, speaker: r.speaker || meta?.speaker || null, source: sourceOfRank(r.queue_rank), thumb: people.get(r.speaker_key) || null,
          duration_s: r.duration_s || meta?.duration_s || null, started_at: startedAt, stage: r.stage, stage_started_at: r.updated_at, stages: stepsOf(stages, r.stage, r.state) };
      }));
      const by_stage = byStage(in_progress.map((x) => ({ ...x, started_at: x.stage_started_at })));
      liveMemo = { at: Date.now(), value: { in_progress, by_stage, queued: await queuedCount(), recently_published: recent.map((x) => ({ slug: x.slug, title: x.title, speaker: x.speaker, thumb: people.get(x.speaker_key) || null,
        duration_s: x.duration_s, published_at: x.published_at })), health: await liveHealth(pipelineHealth, runningRuns), updated_at: new Date().toISOString() } };
    }
    pub(reply, 10);
    return liveMemo.value;
  });

  // PROGRESS by source (downloaded / in progress / published / failed / held / waiting) + throughput over the last 24 h
  fastify.get('/admin/progress', { preHandler: requireInternal }, async () => {
    const { progressCounts, publishedSince } = await import('../lib/repos/media-repo.js');
    const day = await publishedSince(new Date(Date.now() - 24 * 3600_000).toISOString());
    return { by_source: await progressCounts(), last_24h: { published: day.n || 0, audio_hours: Math.round(((day.secs || 0) / 3600) * 10) / 10 } };
  });
  fastify.get('/admin/repairs', { preHandler: requireInternal }, async (req) => ({ groups: await repairList({ minGrade: /^[A-E]$/.test(req.query?.min || '') ? req.query.min : 'C' }), counts: await gradeCounts() }));
  // one item's full quality report (every dimension, the chain with costs)
  fastify.get('/admin/quality/:slug', { preHandler: requireInternal }, async (req, reply) => {
    const it = await getMediaBySlug(req.params.slug);
    const meta = it?.dir ? await readJson(join(it.dir, 'meta.json')) : null;
    if (!meta?.quality) return reply.code(404).send({ error: 'not graded yet' });
    return { slug: it.slug, title: meta.title, speaker: meta.speaker, quality: meta.quality };
  });
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
  fastify.get('/', async (req, reply) => {
    pub(reply, 300);
    const rows = await listSpeakers();
    const gal = await galleriesFor(rows.map((s) => s.key), rows);
    return { speakers: rows.map((s) => ({ key: s.key, name: s.name, entity_id: s.entity_id, photo: speakerThumb(s), photos: gal.get(s.key)?.length || 0 })) };
  });
  // one person's gallery, primary first, with every photo's credit, licence, year and source
  fastify.get('/:key/gallery', async (req, reply) => {
    const g = (await galleriesFor([String(req.params.key)])).get(String(req.params.key));
    if (!g) return reply.code(404).send({ error: 'NotFound' });
    pub(reply, 300);
    return { key: req.params.key, gallery: g };
  });
}
