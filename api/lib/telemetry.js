// Library telemetry — what the home-page Observatory shows (Chad 10-16: "a super impressive and dynamic dashboard of facts
// about the library, constantly moving and updating based on index and testing going on … a powerful machine ingesting
// and studying the library and gaining capability by the minute"). buildSnapshot() runs in the reports worker every 5
// minutes (telemetry-repo + Qdrant counts); the public route serves the latest + a compact series. Pure parts exported.

// The rings, centre outward — the enhancement process in order. `of(row)` → [done, total] paragraphs (sections: documents).
export const RINGS = [
  // Meilisearch is legacy, being replaced by Qdrant (Chad 10-16): the first ring is the paragraph store, not Meili sync
  { id: 'text', label: 'Paragraph store', short: 'STORE', of: (r) => [r.generated, r.total] },
  // BM25 right after ingestion, BEFORE vectors (Chad 10-16: "the first thing to be completed after initial paragraph
  // ingestion … it does not even depend on external vector generation")
  { id: 'keyword', label: 'Keyword index', short: 'BM25', of: (r) => [Math.min(r.indexed, r.total), r.total] },
  // document structure next (Chad 10-17): sub-documents and the TOC are metadata disambiguation and retrieval lean on;
  // documents whose structure was FOUND / documents (read ≠ found: most books mark none — inference comes next)
  { id: 'sections', label: 'Sub-documents', short: 'SECT', of: (r, docs) => [r.generated, docs] },
  // references (Chad 10-17): traditional numbering (verse, section, saying) or a print page — what a citation resolves to
  { id: 'refs', label: 'References', short: 'REF', of: (r) => [r.current, r.total] },
  { id: 'embedding', label: 'Paragraph vectors', short: 'VEC', of: (r) => [r.generated, r.total] },
  { id: 'phrase', label: 'Phrase vectors', short: 'PHRASE', of: (r) => [r.reached, r.total] },
  { id: 'context', label: 'Disambiguation', short: 'DISAMB', of: (r) => [r.generated, r.total] },
  { id: 'hype', label: 'Questions (HyPE)', short: 'HYPE', of: (r) => [r.generated, r.total] },
  { id: 'entities', label: 'Historical entities', short: 'ENTITY', of: (r) => [r.generated, r.total] },
  { id: 'concepts', label: 'Concepts', short: 'CONCEPT', of: (r) => [r.generated, r.total] },
  { id: 'alignment', label: 'Language links', short: 'LINK', of: (r) => [r.generated, r.total] },
  { id: 'translation', label: 'Translations', short: 'XLAT', of: (r) => [r.generated, r.total], planned: true },
];
// Developed in public (Chad 10-16): what is being built now and next — edited here, shipped with the code.
export const ROADMAP = [
  { state: 'now', text: 'Findability: every paragraph found from a few remembered words — tested continuously below' },
  { state: 'now', text: 'Book structure — parts, chapters and headings — read for every document, then kept current as books arrive' },
  { state: 'now', text: 'Phrase vectors for the Islamic, Arabic and secondary literature' },
  { state: 'next', text: 'Indexing stores move from a hard disk to a 4 TB NVMe (~Oct 24)' },
  { state: 'next', text: 'Questions (HyPE) for the doctrinal core of every tradition' },
  { state: 'later', text: 'Concept and historical extraction across the core, for scholarship' },
];
const TRADITION_ORDER = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Zoroastrian', 'Hindu', 'Buddhist', 'Jain', 'Sikh', 'Tao', 'Confucian', 'Other'];

/** Ledger rollup rows → { traditions, rings, cells } (pure). */
export function shapeCoverage(rows) {
  const by = new Map();
  for (const r of rows) {
    const t = TRADITION_ORDER.includes(r.religion) ? r.religion : 'Other';
    const m = by.get(t) || new Map();
    const cur = m.get(r.layer);
    if (cur) for (const k of Object.keys(r)) { if (typeof r[k] === 'number') cur[k] = (cur[k] || 0) + r[k]; } else m.set(r.layer, { ...r, religion: t });
    by.set(t, m);
  }
  const traditions = TRADITION_ORDER.filter((t) => by.has(t)).map((t) => {
    const text = by.get(t).get('text') || {};
    return { id: t, paragraphs: text.total || 0, documents: text.docs || 0 };
  });
  const docsOf = Object.fromEntries(traditions.map((t) => [t.id, t.documents]));
  const cells = [];
  for (const t of traditions) for (const ring of RINGS) {
    const row = by.get(t.id).get(ring.id);
    const [done, total] = row ? ring.of(row, docsOf[t.id]) : [0, ring.id === 'sections' ? docsOf[t.id] : t.paragraphs];
    cells.push({ tradition: t.id, ring: ring.id, done: done || 0, total: total || 0 });
  }
  const rings = RINGS.map((ring) => {
    const cs = cells.filter((c) => c.ring === ring.id);
    const done = cs.reduce((n, c) => n + c.done, 0), total = cs.reduce((n, c) => n + c.total, 0);
    const units = [...by.values()].reduce((n, m) => n + (m.get(ring.id)?.indexed || 0), 0);
    const core = [...by.values()].reduce((a, m) => { const r = m.get(ring.id); if (r) { a[0] += ring.id === 'phrase' || ring.id === 'text' ? r.core_reached || 0 : ring.id === 'keyword' ? Math.min(r.core_indexed || 0, r.core_total || 0) : r.core_generated || 0; a[1] += r.core_total || 0; } return a; }, [0, 0]);
    return { id: ring.id, label: ring.label, short: ring.short, planned: !!ring.planned, done, total, units, core_done: core[0], core_total: core[1] };
  });
  return { traditions, rings, cells };
}

/** Cells (tradition × ring) that grew since the previous snapshot — what is being built right now (Chad 10-16: "some
 *  part of the circular graph is being built at all times … throb that part"). Pure. */
export function growingCells(cells = [], prevCells = []) {
  const before = new Map(prevCells.map((c) => [`${c.tradition}|${c.ring}`, c.done]));
  return cells.filter((c) => before.has(`${c.tradition}|${c.ring}`) && c.done > before.get(`${c.tradition}|${c.ring}`))
    .map((c) => ({ tradition: c.tradition, ring: c.ring, delta: c.done - before.get(`${c.tradition}|${c.ring}`) }))
    .sort((a, b) => b.delta - a.delta);
}

/** Per-cell growth per hour since an older snapshot (key 'tradition|ring', growing cells only) — lets the Observatory
 *  move each tradition's sub-progress between snapshots, as the stage totals already do. A cell that read 0 then (the
 *  totals were still filling) has no rate. Pure. */
export function cellRates(cells = [], thenCells = [], hours = 0) {
  if (!(hours > 0)) return {};
  const then = new Map(thenCells.map((c) => [`${c.tradition}|${c.ring}`, c.done]));
  return Object.fromEntries(cells.map((c) => [`${c.tradition}|${c.ring}`, then.get(`${c.tradition}|${c.ring}`) > 0 ? (c.done - then.get(`${c.tradition}|${c.ring}`)) / hours : 0])
    .filter(([, r]) => r > 0).map(([k, r]) => [k, Math.round(r)]));
}

/** The compact row kept for sparklines and rates. */
export const seriesOf = (snap) => ({ ...Object.fromEntries(snap.rings.map((r) => [r.id, r.done])), ...Object.fromEntries(Object.entries(snap.vectors || {}).map(([k, v]) => [`v_${k}`, v])),
  people: snap.counts?.people ?? null, claims: snap.counts?.concept_claims ?? null, sections: snap.counts?.sections ?? null,
  // per drive: TB written and % life left — their rates give TB/day and a wear-out projection on the Observatory
  ...Object.fromEntries((snap.health?.drives || []).flatMap((d) => [[`wtb_${d.dev}`, d.written_tb], [`life_${d.dev}`, d.life_left_pct]]).filter(([, v]) => typeof v === 'number')) });

/** Per-hour rate of each series key from the points of the last ~`hours` (pure). */
export function ratesOf(points, hours = 1) {
  if (points.length < 2) return {};
  const last = points[points.length - 1];
  const from = points.find((p) => p.at >= last.at - hours * 3600) || points[0];
  const dt = (last.at - from.at) / 3600;
  if (dt <= 0) return {};
  return Object.fromEntries(Object.keys(last.series).filter((k) => typeof last.series[k] === 'number' && typeof from.series[k] === 'number')
    .map((k) => [k, Math.round((last.series[k] - from.series[k]) / dt)]));
}

/** Job rows → what the Observatory shows: running (with elapsed) and the last day's finishes (pure). */
export function shapeJobs(rows, now = Date.now()) {
  const label = (r) => {
    let p = {}; try { p = JSON.parse(r.params || '{}') || {}; } catch { /* none */ }
    const what = p.budgetKey || p.field || (p.docs ? `${p.docs.length} documents` : p.ids ? `${p.ids.length} documents` : p.religion || '');
    return what ? `${r.name} · ${what}` : r.name;
  };
  return {
    running: rows.filter((r) => r.status === 'running').map((r) => ({ id: r.id, name: r.name, label: label(r), elapsed_s: r.started_at ? Math.round((now - Date.parse(r.started_at)) / 1000) : null })),
    finished: rows.filter((r) => r.status !== 'running').slice(0, 15).map((r) => ({ id: r.id, name: r.name, label: label(r), status: r.status, finished_at: r.finished_at, ms: r.ms })),
  };
}

/** The latest known-item test → per variant, the production and engine numbers (pure). */
export function shapeCapability(row) {
  if (!row?.result) return null;
  let res; try { res = typeof row.result === 'string' ? JSON.parse(row.result) : row.result; } catch { return null; }
  const pick = (layers) => layers && Object.fromEntries(['production', 'engine', 'qdrant_keyword', 'meili_keyword', 'qdrant_phrase'].filter((l) => layers[l])
    .map((l) => [l, { at1: layers[l].recall_at_1, at10: layers[l].recall_at_10, at30: layers[l].recall_at_30 ?? null, ms: layers[l].avg_ms }]));
  const variants = res.overall ? Object.fromEntries(Object.entries(res.overall).map(([v, ls]) => [v, pick(ls)])) : null;
  return { run: row.id, finished_at: row.finished_at, paragraphs: res.paragraphs ?? res.queries ?? null, variants };
}

async function qdrantCounts() {
  const base = process.env.QDRANT_URL || 'http://127.0.0.1:6333', out = {};
  for (const c of ['phrases', 'paragraphs_kw', 'hype', 'concepts']) {
    try {
      const r = await fetch(`${base}/collections/${c}`, { headers: { 'api-key': process.env.QDRANT_KEY || '' }, signal: AbortSignal.timeout(5000) });
      out[c] = (await r.json())?.result?.points_count ?? null;
    } catch { out[c] = null; }
  }
  return out;
}

let peopleMemo = { at: 0, value: null };
/** One snapshot (reports worker). */
export async function buildSnapshot() {
  const repo = await import('./repos/telemetry-repo.js');
  const [rows, counts, vectors, ops, ki] = await Promise.all([repo.coverageRollup(), repo.libraryCounts(), qdrantCounts(), repo.opsActivity(), repo.latestKnownItem()]);
  // people change slowly and the count is not cheap: measured at most hourly
  if (!peopleMemo.value || Date.now() - peopleMemo.at > 3600000) {
    // through the API (its contract and cache — Chad 10-16), not by calling bio.js in this worker: there it returned
    // nothing and the home page showed People as '—'
    const v = await fetch(`${process.env.INTERNAL_API_URL || 'http://127.0.0.1:7839'}/api/admin/grounding/status`, {
      headers: { 'x-internal-key': process.env.DEPLOY_SECRET || '' }, signal: AbortSignal.timeout(20000) })
      .then((r) => (r.ok ? r.json() : null)).then((p) => p?.cumulativeUnique ?? null).catch(() => null);
    if (v != null) peopleMemo = { at: Date.now(), value: v };
  }
  const people = peopleMemo.value ?? null;
  const { systemHealth } = await import('./system-health.js');
  const { slowQueryCount } = await import('./repos/query-health-repo.js');
  const health = await systemHealth({ slowCount: () => slowQueryCount() }).catch(() => null);
  const shaped = shapeCoverage(rows);
  const prev = await repo.latestSnapshot().then((p) => (p ? JSON.parse(p.data) : null)).catch(() => null);
  const growing = growingCells(shaped.cells, prev?.cells || []);
  const nowSec = Math.floor(Date.now() / 1000);
  const dayAgo = await repo.snapshotSince(nowSec - 86400).catch(() => null);
  const cell_rates = dayAgo && nowSec - dayAgo.at >= 1800 ? cellRates(shaped.cells, JSON.parse(dayAgo.data).cells || [], (nowSec - dayAgo.at) / 3600) : {};
  const paragraphs = shaped.traditions.reduce((n, t) => n + t.paragraphs, 0);
  return { at: Math.floor(Date.now() / 1000), corpus: { documents: counts.documents, paragraphs, traditions: shaped.traditions.filter((t) => t.id !== 'Other').length },
    ...shaped, vectors, counts: { ...counts, people }, jobs: shapeJobs(ops), capability: shapeCapability(ki), health, roadmap: ROADMAP, growing, cell_rates };
}
