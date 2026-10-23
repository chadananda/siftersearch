// Pipeline snapshot → data/pipeline-status.json (admin dashboard, analytics, missing books, health checks). Runs inside
// siftersearch-reports every 10 min (reports-worker loop) and on demand as ops report 'pipeline-snapshot'. Cheap every
// run; anything that reads a whole table carries a TTL and reuses the last result. ai_usage spend is a rowid-incremental
// hourly rollup kept in data/pipeline-snapshot-state.json. Deps: pipeline-snapshot-repo, docs-repo, entity-review.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { shapeLibraryStats, LIBRARY_STATS_FILE } from '../library/library-stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIN = 60_000, HOUR = 60 * MIN;
// 10-22: the old cron re-ran every whole-table probe hourly (live paragraphs, graph_enriched, month-wide ai_usage) — ~70 s
// and ~30 GB of reads per run, which tripled search latency. Each section now refreshes on its own clock.
export const TTL = {
  integrity: 3 * HOUR,      // live-paragraph count: a covering-index pass over every content row
  library: 6 * HOUR,        // by-language rollup + embedding totals
  bottlenecks: HOUR,
  missingBooks: 6 * HOUR,   // LIKE scan over low-¶ docs
  corpus: HOUR,             // docs-table pass
  activity: 30 * MIN,       // search_log windows
  shelves: 30 * MIN,        // /library index (data/library-shelves.json)
  libraryStats: 5 * MIN,    // docs-table aggregates the API serves (data/library-stats.json) — i.e. every run
  entityReview: HOUR,       // data/entity-review-model.json
  cloudflare: 20 * MIN,     // external API
  answerCache: 30 * MIN,
};
export const USAGE_CHUNK = 50_000;            // rowids per delta read
export const USAGE_MAX_ROWS_PER_RUN = 400_000; // first-run back-fill is spread over runs
const USAGE_KEEP_MS = 31 * 24 * HOUR;
const MISSING_SHAPE = 4;

const fresh = (section, ttl, now) => section?.generated_at && now - Date.parse(section.generated_at) < ttl;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v, pretty) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(`${f}.tmp`, JSON.stringify(v, null, pretty ? 2 : 0)); renameSync(`${f}.tmp`, f); };
export const fmtTs = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);

// ── ai_usage hourly rollup (pure) ────────────────────────────────────────────────────────────────────────────────────
const hourMs = (h) => Date.parse(`${h.replace(' ', 'T')}:00:00Z`);
/** Fold delta rows ({hour, model, provider, caller, n, tokens, cost, failed}) into state.buckets; drop hours > 31 days. */
export function foldUsage(state, rows, now) {
  const b = (state.buckets ||= {});
  const models = new Set(state.models || []), callers = new Set(state.callers || []);
  for (const r of rows) {
    const k = JSON.stringify([r.hour, r.model ?? null, r.provider ?? null, r.caller ?? null]);
    const c = (b[k] ||= [0, 0, 0, 0]);
    c[0] += Number(r.n) || 0; c[1] += Number(r.tokens) || 0; c[2] += Number(r.cost) || 0; c[3] += Number(r.failed) || 0;
    models.add(r.model ?? null); if (r.caller != null) callers.add(r.caller);
  }
  for (const k of Object.keys(b)) if (now - hourMs(JSON.parse(k)[0]) > USAGE_KEEP_MS) delete b[k];
  state.models = [...models].sort((x, y) => String(x).localeCompare(String(y)));
  state.callers = [...callers].sort();
  return state;
}
/** The published aiUsage section from the buckets: today (since local midnight), 7 d, 30 d — to the hour. */
export function usageSection(state, now, dayStart) {
  const weekFrom = now - 7 * 24 * HOUR, monthFrom = now - 30 * 24 * HOUR;
  const floorH = (t) => t - (t % HOUR);
  const c = { today_calls: 0, today_tokens: 0, today_cost: 0, week_calls: 0, week_tokens: 0, week_cost: 0,
    month_calls: 0, month_tokens: 0, month_cost: 0, failed_week: 0 };
  const by = { model: new Map(), provider: new Map(), caller: new Map(), today: new Map() };
  const add = (m, key, v) => { const x = m.get(key) || { calls: 0, tokens: 0, cost: 0 }; x.calls += v[0]; x.tokens += v[1]; x.cost += v[2]; m.set(key, x); };
  for (const [k, v] of Object.entries(state.buckets || {})) {
    const [hour, model, provider, caller] = JSON.parse(k);
    const t = hourMs(hour);
    if (t < floorH(monthFrom)) continue;
    c.month_calls += v[0]; c.month_tokens += v[1]; c.month_cost += v[2];
    add(by.model, model, v); add(by.provider, provider, v); add(by.caller, caller ?? 'unknown', v);
    if (t >= floorH(weekFrom)) { c.week_calls += v[0]; c.week_tokens += v[1]; c.week_cost += v[2]; c.failed_week += v[3]; }
    if (t >= dayStart) { c.today_calls += v[0]; c.today_tokens += v[1]; c.today_cost += v[2]; add(by.today, caller ?? 'unknown', v); }
  }
  const list = (m, name) => [...m].map(([key, v]) => ({ [name]: key, ...v })).sort((a, b) => b.cost - a.cost);
  return {
    generated_at: new Date(now).toISOString(),
    today_since: new Date(dayStart).toISOString(),   // local midnight on tower (America/Phoenix) — the page labels "today" with it
    window_note: 'hourly buckets: week/month include the whole boundary hour',
    combined: c,
    byModel: list(by.model, 'model'), byProvider: list(by.provider, 'provider'),
    byCaller: list(by.caller, 'caller'), byCallerToday: list(by.today, 'caller'),
    filters: { models: state.models || [], callers: state.callers || [] },
  };
}

/** Read ai_usage rows added since the last run. → { done } (false while the first-run back-fill is still catching up). */
export async function advanceUsage(state, repo, now, { maxRows = USAGE_MAX_ROWS_PER_RUN, pause = () => new Promise((r) => setImmediate(r)) } = {}) {
  const top = await repo.usageTop();
  if (state.lastId == null) {
    const first = await repo.usageFirstSince(fmtTs(now - USAGE_KEEP_MS));
    state.lastId = (first ?? top + 1) - 1;
    state.backfillTo = top;
    const names = await repo.usageNames();
    state.models = names.models; state.callers = names.callers;
  }
  let budget = maxRows;
  while (state.lastId < top && budget > 0) {
    const hi = Math.min(top, state.lastId + Math.min(USAGE_CHUNK, budget));
    foldUsage(state, await repo.usageDelta(state.lastId, hi), now);
    budget -= hi - state.lastId;
    state.lastId = hi;
    await pause();
  }
  foldUsage(state, [], now);   // prune
  const done = state.backfillTo == null || state.lastId >= state.backfillTo;
  if (done) delete state.backfillTo;
  return { done };
}

// ── the snapshot ─────────────────────────────────────────────────────────────────────────────────────────────────────
const LABELS = {
  'grounding:disambiguate': 'Disambiguation', 'grounding:hype': 'HyPE question generation',
  'grounding:claims': 'Entity claim extraction', 'grounding:mentions': 'Entity mention extraction',
  'grounding:reconcile': 'Concept reconciliation', 'grounding:merge': 'Entity reconciliation',
  'grounding:project': 'Entity projection', 'grounding:link': 'Concept linking', embedding: 'Embedding generation',
};
const pm2List = () => new Promise((resolve) => execFile('pm2', ['jlist'], { timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
  (err, out) => { try { resolve(err ? { error: err.message } : JSON.parse(out)); } catch (e) { resolve({ error: e.message }); } }));

async function defaultDeps() {
  const { config } = await import('../config.js');
  return {
    repo: await import('../repos/pipeline-snapshot-repo.js'),
    pm2List,
    meili: async () => {
      const get = (p) => fetch(`${config.search.host}${p}`, { headers: { Authorization: `Bearer ${config.search.apiKey}` }, signal: AbortSignal.timeout(5000) }).then((r) => r.json());
      const [enq, proc, failed, ps] = await Promise.all([get('/tasks?statuses=enqueued&limit=0'), get('/tasks?statuses=processing&limit=0'),
        get('/tasks?statuses=failed&limit=0'), get('/indexes/paragraphs/stats')]);
      const em = await get('/indexes/entity_mentions_idx/stats').catch(() => ({}));
      return { enqueued: enq.total ?? null, processing: proc.total ?? null, failed: failed.total ?? null, paragraphs_docs: ps.numberOfDocuments ?? null,
        embedded_docs: ps.numberOfEmbeddings ?? null, indexing: ps.isIndexing ?? null, entity_idx_docs: em.numberOfDocuments ?? null };
    },
    answerCache: async () => (await import('../answer-cache.js')).cacheStats(),
    entityReview: async () => (await import('../../routes/entity-review.js')).buildModel(),
    shelves: buildShelvesIndex,
    missingHelpers: async () => ({ cleanTitle: (await import('../text/clean-title.js')).cleanTitle, buildHeldIndex: (await import('../text/already-held.js')).buildHeldIndex }),
  };
}

async function buildShelvesIndex() {
  const { listDocs, groupCounts } = await import('../docs-repo.js');
  const { buildShelves, SPLIT_BY_AUTHOR, smallMoreShelves, inlineAuthorWorks, LIBRARY_WORKS } = await import('../library/shelves.js');
  const { olWeight } = await import('../library/ol-works.js');
  const { docs } = await listDocs({ sourceSite: 'oceanlibrary.com', limit: 5000,
    fields: ['id', 'title', 'author', 'religion', 'collection', 'cover_url', 'year', 'paragraph_count', 'slug', 'file_path', 'language', 'frontmatter'] });
  const olDocs = docs.map(({ frontmatter, ...d }) => ({ ...d, weight: olWeight(frontmatter) }));
  const shelves = buildShelves({ hidden: (await import('../authority.js')).hiddenReligions(), olDocs, authorCounts: await groupCounts(['religion', 'author']),
    collectionCounts: await groupCounts(['religion', 'collection', 'source_site']),
    splitCounts: await groupCounts(['religion', 'collection', 'author'], { collections: SPLIT_BY_AUTHOR }),
    workDocs: (await listDocs({ ids: LIBRARY_WORKS.flatMap((w) => w.ids), count: false, limit: 500,
      fields: ['id', 'title', 'author', 'religion', 'collection', 'cover_url', 'year', 'paragraph_count', 'slug'] })).docs });
  const docsByShelf = new Map();
  for (const sh of smallMoreShelves(shelves)) {
    const list = [];
    for (const author of sh.authors.slice(0, 8)) {
      list.push(...(await listDocs({ religion: sh.religion, author, limit: 60,
        fields: ['id', 'title', 'author', 'religion', 'collection', 'cover_url', 'year', 'paragraph_count', 'slug', 'source_site'] })).docs);
    }
    docsByShelf.set(`${sh.religion}|${sh.key}`, list);
  }
  inlineAuthorWorks(shelves, docsByShelf);
  return shelves;
}

async function missingBooksSection(repo, { cleanTitle, buildHeldIndex }, now) {
  const SRC_FILE_RE = /\.(?:pdf|doc|docx|html|htm|txt|rtf|epub|md)$/i;
  const SHOW_CAP = 600;
  const stubs = await repo.stubDocs();
  const { heldMatch } = buildHeldIndex(await repo.heldDocs());
  const notHeld = (r) => !heldMatch(r.title, r.author);
  const stubsWithSrc = stubs.filter((s) => s.doclinks > 0).filter(notHeld);
  const stubsNoSrc = stubs.filter((s) => s.doclinks === 0).filter(notHeld);
  const heldOut = stubs.filter((r) => !notHeld(r));
  const shownStubs = stubsWithSrc.slice(0, SHOW_CAP);
  for (const s of shownStubs) {
    const t = String(await repo.stubLinkText(s.id) || '');
    const m = t.match(/https?:\/\/[^\s()[\]"']+\.(?:pdf|docx?)\b/i) || t.match(/https?:\/\/bahai-library\.com\/docs\/[^\s()[\]"']+/i);
    if (m) s.file_url = m[0].replace(/[),.;]+$/, '');
  }
  const toRow = (r, kind) => ({ id: r.id, kind, title: cleanTitle(r.title) || `#${r.id}`, author: cleanTitle(r.author), paras: r.paras ?? 0,
    religion: r.religion, collection: r.collection, source_url: r.source_url,
    file_url: r.file_url || (SRC_FILE_RE.test(r.source_url || '') ? r.source_url : null) });
  const allHusks = await repo.huskDocs();
  const husksMissing = allHusks.filter(notHeld);
  const huskWithFile = husksMissing.filter((h) => SRC_FILE_RE.test(h.source_url || ''));
  const huskNoFile = husksMissing.filter((h) => !SRC_FILE_RE.test(h.source_url || ''));
  return {
    generated_at: new Date(now).toISOString(), shape: MISSING_SHAPE,
    haveSourceTotal: stubsWithSrc.length + huskWithFile.length,
    noSourceTotal: stubsNoSrc.length + huskNoFile.length,
    haveSource: [...shownStubs.map((s) => toRow(s, 'stub')), ...huskWithFile.slice(0, Math.max(0, SHOW_CAP - shownStubs.length)).map((h) => toRow(h, 'husk'))],
    noSource: [...stubsNoSrc.slice(0, SHOW_CAP).map((s) => toRow(s, 'stub')), ...huskNoFile.slice(0, Math.max(0, SHOW_CAP - Math.min(stubsNoSrc.length, SHOW_CAP))).map((h) => toRow(h, 'husk'))],
    stubTotal: stubs.length, huskTotal: allHusks.length,
    alreadyHeld: heldOut.length + (allHusks.length - husksMissing.length),
    alreadyHeldSample: [...heldOut, ...allHusks.filter((h) => !notHeld(h))].slice(0, 60).map((r) => {
      const m = heldMatch(r.title, r.author);
      return { id: r.id, title: cleanTitle(r.title), author: cleanTitle(r.author), matched: m ? { id: m.id, title: cleanTitle(m.title), paras: m.paras } : null };
    }),
  };
}

let inFlight = null;
/** Build and write the snapshot. params: { rebaseIntegrity?, force? (ignore every TTL) }. One at a time per process. */
export function pipelineSnapshotJob(params = {}, deps = null) {
  if (inFlight) return inFlight;
  inFlight = buildPipelineSnapshot(params, deps).finally(() => { inFlight = null; });
  return inFlight;
}

export async function buildPipelineSnapshot({ rebaseIntegrity = false, force = false } = {}, injected = null) {
  const d = injected || await defaultDeps();
  const { repo } = d;
  const now = d.now ? d.now() : Date.now();
  const dataDir = d.dataDir || join(ROOT, 'data');
  const outPath = join(dataDir, 'pipeline-status.json');
  const statePath = join(dataDir, 'pipeline-snapshot-state.json');
  const prev = readJson(outPath) || {};
  const state = readJson(statePath) || {};
  const t0 = Date.now();
  const probeErrors = [], ran = [], sectionMs = {};
  const probe = async (name, fn, fallback) => {
    const t = Date.now();
    try { return await fn(); } catch (err) { probeErrors.push({ probe: name, error: String(err?.message || err).slice(0, 300) }); return fallback; }
    finally { sectionMs[name] = Date.now() - t; ran.push(name); }
  };
  const due = (section, ttl) => force || !fresh(section, ttl, now);
  const stamp = (o) => ({ generated_at: new Date(now).toISOString(), ...o });

  // ── every run: partial-index counts, pm2, Meili, the last 15 min of AI calls ──
  const books = (await probe('priority-books', () => repo.priorityBooks(), [])).map((b) => ({
    title: b.title, priority: b.priority, mentions: b.mentions, synced: b.synced, fully_synced: b.mentions > 0 && b.synced === b.mentions }));
  const backlog = await probe('sync-backlog', () => repo.syncBacklog(), null);
  const embMissing = await probe('embedding-missing', () => repo.embeddingMissing(), null);
  const emUnsynced = await probe('mentions-unsynced', () => repo.mentionsUnsynced(), null);
  const meiliAll = await probe('meili', () => d.meili(), { error: 'unavailable' });
  const { entity_idx_docs: entityIdxDocs = null, ...meili } = meiliAll || {};
  let workers = {};
  const list = await d.pm2List();
  if (Array.isArray(list)) {
    for (const p of list) if (p.name?.startsWith('siftersearch-')) workers[p.name.replace('siftersearch-', '')] = { status: p.pm2_env?.status ?? null, restarts: p.pm2_env?.restart_time ?? null };
  } else workers = { error: list?.error || 'pm2 jlist failed' };

  // ── content-integrity tripwire (3 h): live paragraphs against a high-water baseline ──
  const prevInt = prev.integrity || {};
  let integrity = prevInt;
  if (rebaseIntegrity || due(prevInt.measured_at && { generated_at: prevInt.measured_at }, TTL.integrity)) {
    const live = await probe('live-paragraphs', () => repo.liveParagraphs(), null);
    if (live != null) {
      const baseline = rebaseIntegrity ? live : Math.max(prevInt.baseline_live_paras ?? 0, live);
      const threshold = Math.max(5000, Math.floor(baseline * 0.02));
      const drop = baseline - live;
      integrity = {
        live_paras: live, baseline_live_paras: baseline, drop_from_baseline: drop, measured_at: new Date(now).toISOString(),
        rebased_at: rebaseIntegrity ? new Date(now).toISOString() : (prevInt.rebased_at ?? null),
        rebased_from: rebaseIntegrity ? (prevInt.baseline_live_paras ?? null) : (prevInt.rebased_from ?? null),
        alert: drop > threshold
          ? `CONTENT DROP: live paragraphs ${live} is ${drop} below baseline ${baseline} (>${threshold}) — possible gutting. Explain with: node scripts/ops/ops.mjs report deletions --wait; once explained, rebase with: node scripts/ops/ops.mjs report pipeline-snapshot --params '{"rebaseIntegrity":true}'`
          : null,
      };
    }
  }

  // ── library rollups (6 h) ──
  let library = prev.library ?? null;
  if (due(library, TTL.library)) {
    const byLanguage = await probe('by-language', () => repo.byLanguage(), []);
    const total = integrity.live_paras ?? null;
    const missing = embMissing;
    library = stamp({ byLanguage, embeddingStats: total == null ? null : {
      total, with_embedding: Math.max(0, total - (missing || 0)), missing_embeddings: missing || 0, dirty: backlog || 0 } });
  }

  // ── bottleneck lists (1 h) ──
  let bottlenecks = prev.bottlenecks ?? null;
  if (due(bottlenecks, TTL.bottlenecks)) {
    bottlenecks = stamp({ pendingEmbedding: await probe('pending-embedding', () => repo.pendingEmbeddingByDoc(), []),
      pendingSync: await probe('pending-sync', () => repo.pendingSyncByDoc(), []) });
  }

  // ── AI spend: incremental by rowid ──
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  let aiUsage = prev.aiUsage ?? null;
  const usage = await probe('ai-usage', () => advanceUsage(state, repo, now, d.usageOpts), null);
  if (usage?.done) aiUsage = usageSection(state, now, dayStart.getTime());
  else if (usage) aiUsage = { ...(aiUsage || {}), backfill: { at_id: state.lastId, to_id: state.backfillTo } };

  // ── what is running right now ──
  const since15 = fmtTs(now - 15 * MIN);
  const recent = await probe('current-activity', () => repo.usageByServiceSince(since15), []);
  const activities = recent.map((r) => ({
    service: r.service_type,
    label: LABELS[r.service_type] || (r.service_type?.startsWith('grounding:') ? 'Grounding · ' + r.service_type.replace('grounding:', '') : (r.service_type || 'AI')),
    calls: r.calls, cost: r.cost, last_at: r.last_at,
    kind: r.service_type?.startsWith('grounding:') ? 'enrichment' : (r.service_type === 'embedding' ? 'indexing' : 'serving'),
  }));
  const currentActivity = stamp({ window_min: 15, activities, idle: activities.length === 0,
    meili_processing: meili.processing ?? null, meili_enqueued: meili.enqueued ?? null, watcher: workers['library-watcher']?.status ?? null });

  // ── site activity (30 min), corpus (1 h) ──
  let activity = prev.activity ?? null;
  if (due(activity, TTL.activity)) {
    const a = await probe('search-activity', () => repo.searchActivity({ day1: fmtTs(now - 24 * HOUR), day7: fmtTs(now - 7 * 24 * HOUR), day14: fmtTs(now - 14 * 24 * HOUR) }), null);
    activity = a ? stamp(a) : { ...(activity || {}), error: 'search activity probe failed' };
  }
  let corpus = prev.corpus ?? null;
  if (due(corpus, TTL.corpus)) {
    const c = await probe('corpus', () => repo.corpusSummary(), null);
    if (c) corpus = stamp({ docs: c.docs, paras: c.paras, traditions: c.byReligion.filter((r) => r.religion !== 'General').length, byReligion: c.byReligion });
  }

  // ── Cloudflare traffic (20 min, external) ──
  let cloudflare = prev.cloudflare ?? null;
  if (d.cloudflare !== false && due(cloudflare, TTL.cloudflare) && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID) {
    cloudflare = await probe('cloudflare', () => cloudflareTraffic(now), cloudflare);
  }

  let answerCache = prev.answer_cache ?? null;
  if (due(answerCache, TTL.answerCache)) {
    const s = await probe('answer-cache', () => d.answerCache(), null);
    answerCache = s ? stamp(s) : answerCache;
  }

  // ── missing books (6 h) ──
  let missingBooks = prev.missingBooks ?? null;
  if (due(missingBooks, TTL.missingBooks) || missingBooks?.shape !== MISSING_SHAPE) {
    missingBooks = await probe('missing-books', async () => missingBooksSection(repo, await d.missingHelpers(), now), missingBooks);
  }

  // ── side files: entity-review model (1 h), /library shelves (30 min) ──
  const erPath = join(dataDir, 'entity-review-model.json');
  let erAt = prev.entity_review_model_at ?? null;
  if (force || !fresh({ generated_at: erAt }, TTL.entityReview, now)) {
    await probe('entity-review-model', async () => {
      const ents = await d.entityReview();
      const at = new Date(now).toISOString();
      writeJson(erPath, { generated_at: at, entities: ents.map((e) => ({ ...e, books: [...e.books] })) });
      erAt = at;
    }, null);
  }
  const shelvesPath = join(dataDir, 'library-shelves.json');
  if (force || !fresh({ generated_at: state.shelves_at }, TTL.shelves, now)) {
    await probe('library-shelves', async () => { writeJson(shelvesPath, await d.shelves()); state.shelves_at = new Date(now).toISOString(); }, null);
  }

  // The API's library counts (search/library stats, /v1/collections, progress) — never computed in a request handler.
  const statsPath = join(dataDir, LIBRARY_STATS_FILE);
  if (force || !fresh({ generated_at: state.library_stats_at }, TTL.libraryStats, now)) {
    await probe('library-stats', async () => {
      writeJson(statsPath, shapeLibraryStats(await repo.libraryStatsRows({ recentSince: fmtTs(now - 4 * HOUR) }), now));
      state.library_stats_at = new Date(now).toISOString();
    }, null);
  }

  const snapshot = {
    generated_at: new Date(now).toISOString(),
    computed_in_ms: Date.now() - t0,
    ran, section_ms: sectionMs,
    integrity, library, missingBooks, bottlenecks, aiUsage, activity, corpus,
    current_activity: currentActivity, cloudflare, answer_cache: answerCache,
    entity_review_model_at: erAt,
    priority_books: books,
    summary: { books_total: books.length, books_fully_synced: books.filter((b) => b.fully_synced).length,
      books_pending: books.filter((b) => !b.fully_synced).map((b) => ({ title: b.title, mentions: b.mentions, synced: b.synced })) },
    embeddings: { db_missing: embMissing, meili_embedded: meili.embedded_docs ?? null, meili_docs: meili.paragraphs_docs ?? null },
    // extraction_remaining was COUNT(graph_enriched=0): the retired enrichment's flag, unset on ~all 9.3M rows, so the
    // count was a full read of the content table (~10 s, most of the hourly I/O burst) for a meaningless number. Gone 10-22.
    entity_pipeline: { extraction_remaining: null, mentions_unsynced: emUnsynced, sidecar_idx_docs: entityIdxDocs },
    content_sync_backlog: backlog,
    meili, workers,
    pm2_apps: readJson(join(dataDir, 'pm2-apps-check.json')),
    probe_errors: probeErrors, probe_error_count: probeErrors.length,
  };
  writeJson(statePath, state);
  writeJson(outPath, snapshot, true);
  return { written: outPath, computed_in_ms: snapshot.computed_in_ms, ran, section_ms: sectionMs, probe_errors: probeErrors };
}

async function cloudflareTraffic(now) {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const gql = `query { viewer { zones(filter: { zoneTag: "${process.env.CLOUDFLARE_ZONE_ID}" }) {
      httpRequests1dGroups(limit: 14, orderBy: [date_ASC], filter: { date_geq: "${iso(now - 13 * 24 * HOUR)}", date_lt: "${iso(now + 24 * HOUR)}" }) {
        dimensions { date }
        sum { requests pageViews bytes threats countryMap { clientCountryName requests } contentTypeMap { edgeResponseContentTypeName requests } }
        uniq { uniques } } } } }`;
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql }), signal: AbortSignal.timeout(12000) });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    const groups = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    const daily = groups.map((g) => ({ date: g.dimensions.date, requests: g.sum.requests ?? 0, pageViews: g.sum.pageViews ?? 0,
      uniques: g.uniq?.uniques ?? 0, bytes: g.sum.bytes ?? 0, threats: g.sum.threats ?? 0 }));
    const countries = {};
    for (const g of groups) for (const c of g.sum.countryMap ?? []) countries[c.clientCountryName] = (countries[c.clientCountryName] ?? 0) + (c.requests ?? 0);
    const topCountries = Object.entries(countries).map(([country, requests]) => ({ country, requests })).sort((a, b) => b.requests - a.requests).slice(0, 12);
    return { generated_at: new Date(now).toISOString(), daily, topCountries };
  } catch (err) {
    return { generated_at: new Date(now).toISOString(), error: err.message };
  }
}
