// Library-wide docs-table aggregates (totals, per-religion/collection/language counts, eras, top authors) as a SNAPSHOT:
// built out of process by siftersearch-reports (pipeline-snapshot-job → data/library-stats.json, every run) and only READ
// on the request path. better-sqlite3 is synchronous: a whole-docs GROUP BY in a handler froze the API 5-6 s (10-23).
// shapeLibraryStats is pure; readLibraryStats re-reads the file only when its mtime changes.
import { readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const LIBRARY_STATS_FILE = 'library-stats.json';
const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', LIBRARY_STATS_FILE);

const EMPTY = Object.freeze({
  generated_at: null, missing: true,
  totals: { documents: 0, docs_with_content: 0, paragraphs: 0, authors: 0, languages: 0, recently_updated: 0, people: 0 },
  religionCounts: {}, religionParagraphs: {}, collectionCounts: {}, languageCounts: {}, facets: [], byEra: [], topAuthors: [],
});

/** rows from pipeline-snapshot-repo.libraryStatsRows() → the published snapshot. */
export function shapeLibraryStats({ facets = [], authors = 0, byEra = [], topAuthors = [], recentlyUpdated = 0, people = 0 }, now = Date.now()) {
  const religionCounts = {}, religionParagraphs = {}, collectionCounts = {}, languageCounts = {};
  let documents = 0, withContent = 0, paragraphs = 0;
  for (const r of facets) {
    const n = Number(r.n) || 0, p = Number(r.paras) || 0;
    documents += n; paragraphs += p; withContent += Number(r.with_content) || 0;
    if (r.religion) { religionCounts[r.religion] = (religionCounts[r.religion] || 0) + n; religionParagraphs[r.religion] = (religionParagraphs[r.religion] || 0) + p; }
    if (r.collection) collectionCounts[r.collection] = (collectionCounts[r.collection] || 0) + n;
    if (r.language) languageCounts[r.language] = (languageCounts[r.language] || 0) + n;
  }
  return {
    generated_at: new Date(now).toISOString(),
    totals: { documents, docs_with_content: withContent, paragraphs, authors: Number(authors) || 0,
      languages: new Set(facets.map((r) => r.language).filter((l) => l != null)).size, recently_updated: Number(recentlyUpdated) || 0, people: Number(people) || 0 },
    religionCounts, religionParagraphs, collectionCounts, languageCounts,
    facets: facets.map((r) => ({ religion: r.religion ?? null, collection: r.collection ?? null, language: r.language ?? null, n: Number(r.n) || 0 })),
    byEra, topAuthors,
  };
}

/** Bootstrap before the first library-stats.json exists (fresh deploy, the updater's smoke server): the pipeline
 *  snapshot's corpus section (docs/paras by religion, also built by siftersearch-reports). No collections/languages. */
function fromCorpus(statusPath) {
  try {
    const c = JSON.parse(readFileSync(statusPath, 'utf8'))?.corpus;
    if (!c?.byReligion?.length) return null;
    const facets = c.byReligion.map((r) => ({ religion: r.religion, collection: null, language: null, n: r.docs, paras: r.paras, with_content: r.docs }));
    return { ...shapeLibraryStats({ facets }, Date.parse(c.generated_at) || Date.now()), fallback: 'pipeline-status.corpus' };
  } catch { return null; }
}

let cache = { path: null, mtime: -1, data: EMPTY };
/** The latest snapshot (never queries). Missing file → the corpus bootstrap, else an empty snapshot with missing:true. */
export function readLibraryStats(path = DEFAULT_PATH) {
  try {
    const m = statSync(path).mtimeMs;
    if (cache.path !== path || m !== cache.mtime) cache = { path, mtime: m, data: JSON.parse(readFileSync(path, 'utf8')) };
    return cache.data;
  } catch {
    if (cache.path === path && cache.data !== EMPTY && !cache.data.fallback) return cache.data;
    const boot = fromCorpus(join(dirname(path), 'pipeline-status.json'));
    if (boot) { cache = { path, mtime: -1, data: boot }; return boot; }
    return EMPTY;
  }
}

/** Sorted [{name, documents}] from a counts map. */
export const countList = (map, limit = Infinity) =>
  Object.entries(map || {}).map(([name, documents]) => ({ name, documents })).sort((a, b) => b.documents - a.documents).slice(0, limit);

/** [{religion, collection, count}] — the religion×collection rollup of the snapshot's facets (languages summed). */
export function religionCollectionCounts(snap = readLibraryStats()) {
  const m = new Map();
  for (const r of snap.facets || []) {
    const k = JSON.stringify([r.religion ?? null, r.collection ?? null]);
    m.set(k, (m.get(k) || 0) + (r.n || 0));
  }
  return [...m].map(([k, count]) => { const [religion, collection] = JSON.parse(k); return { religion, collection, count }; });
}

/** A greeting's live facts: {paragraphs} → "10.2 million", {people} → "41,000" (rounded down), from the snapshot. A fact
 *  the snapshot lacks drops its whole sentence rather than show a zero. */
export function fillFacts(text, totals = readLibraryStats().totals) {
  const round = (n) => (n >= 1e6 ? `${Math.floor(n / 1e5) / 10} million` : n >= 1000 ? (Math.floor(n / 1000) * 1000).toLocaleString('en-US') : String(n));
  const facts = { paragraphs: totals?.paragraphs, people: totals?.people, documents: totals?.documents, languages: totals?.languages };
  return String(text || '').split(/(?<=[.!?])\s+/).filter((s) => [...s.matchAll(/\{(\w+)\}/g)].every(([, k]) => facts[k] > 0))
    .map((s) => s.replace(/\{(\w+)\}/g, (_, k) => round(facts[k]))).join(' ');
}
