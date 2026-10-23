// The /library landing's live numbers (Chad 10-22: "a real library … with a similar import process explanation and
// counter"). shapeLanding() is PURE: the Observatory telemetry snapshot + Dewey's import-board counts + the newest books
// → one small public payload (GET /api/library/landing, edge-cached). Hidden traditions (meta.yaml hidden: true) never
// appear: not in the counts, not in the arrivals. Deps: shelves.js docUrl only.
import { docUrl } from './shelves.js';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const ring = (rings, id) => (Array.isArray(rings) ? rings.find((r) => r?.id === id) : null) || null;

/**
 * @param snapshot  telemetry snapshot ({ corpus, traditions:[{id,documents,paragraphs}], rings:[{id,done,total,units}] }) or null
 * @param imports   import board ({ counts: { imported_24h, imported_7d, in_progress, ocr, waiting } }) or null
 * @param arrivals  newest live docs (id,title,author,religion,collection,year,cover_url,paragraph_count,slug,created_at)
 * @param hidden    Set of hidden tradition names
 */
export function shapeLanding({ snapshot = null, imports = null, arrivals = [], hidden = new Set(), now = new Date(), limit = 18 } = {}) {
  const trads = (snapshot?.traditions || []).filter((t) => t?.id && !hidden.has(t.id) && n(t.documents) > 0)
    .map((t) => ({ name: t.id, documents: n(t.documents), paragraphs: n(t.paragraphs) }))
    .sort((a, b) => b.documents - a.documents);
  const sum = (k) => trads.reduce((s, t) => s + (t[k] || 0), 0);
  const rings = snapshot?.rings;
  const r = (id) => ring(rings, id);
  const c = imports?.counts || {};
  const process = {
    acquire: { week: n(c.imported_7d), today: n(c.imported_24h), waiting: n(c.waiting), working: (n(c.in_progress) || 0) + (n(c.ocr) || 0) },
    restore: { paragraphs: n(r('text')?.done) },
    structure: { sections: n(r('sections')?.units), documents: n(r('sections')?.done) },
    attribute: { paragraphs: n(r('context')?.done), entities: n(r('entities')?.units) },
    link: { references: n(r('refs')?.units), paragraphs: n(r('refs')?.done) },
    pair: { paragraphs: n(r('alignment')?.done) },
    index: { vectors: n(r('embedding')?.done), phrases: n(r('phrase')?.units), questions: n(r('hype')?.units) },
  };
  const seen = new Set();
  const books = [];
  for (const d of arrivals) {
    if (!d?.id || !d.title || !d.religion || hidden.has(d.religion)) continue;
    const k = `${d.title}|${d.author || ''}`.toLowerCase();
    if (seen.has(k)) continue;                      // a book re-ingested in parts shows once
    seen.add(k);
    books.push({ id: d.id, title: d.title, author: d.author || null, religion: d.religion, collection: d.collection || null,
      year: d.year || null, cover: d.cover_url || null, paras: d.paragraph_count || 0, added: d.created_at || null, url: docUrl(d) });
    if (books.length >= limit) break;
  }
  return {
    generated_at: new Date(now).toISOString(),
    snapshot_at: snapshot?.at ? new Date(snapshot.at * 1000).toISOString() : null,
    totals: snapshot ? { documents: sum('documents'), paragraphs: sum('paragraphs'), traditions: trads.length } : null,
    traditions: trads,
    week: n(c.imported_7d),
    working: process.acquire.working > 0,
    process,
    arrivals: books,
  };
}
