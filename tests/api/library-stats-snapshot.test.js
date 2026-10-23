// Whole-docs aggregates never run on the API request path (10-23). better-sqlite3 is synchronous, so a
// `GROUP BY collection` / `SUM(paragraph_count)` over every docs row inside a handler froze siftersearch-api 5.6-6.2 s
// four times in three hours. Those numbers are built by siftersearch-reports into data/library-stats.json
// (pipeline-snapshot-job → shapeLibraryStats) and handlers only read the file (readLibraryStats).
//
// RATCHET: an unparameterised docs aggregate (GROUP BY / SUM(paragraph_count) with no `= ?` narrowing) in a request-path
// file fails here. Lists only shrink. Need a new library-wide number? Add it to libraryStatsRows + shapeLibraryStats.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { tmpdir } from 'os';
import { shapeLibraryStats, readLibraryStats, countList } from '../../api/lib/library/library-stats.js';

const ROOT = join(import.meta.dirname, '..', '..');
const REQUEST_PATH = ['api/routes', 'api/services/progress.js', 'api/lib/search.js'];
// Legacy unparameterised docs aggregates on the request path, file → allowed count. MEASURED 2026-10-23; only shrinks.
//   admin.js       — admin-only dashboards/verification (docs ⋈ content rollups), operator actions.
//   public-api.js  — /v1 authors listing + its count: `FROM docs ${where}` is narrowed only when a filter is passed.
const LEGACY = new Map([['api/routes/admin.js', 8], ['api/routes/public-api.js', 2]]);

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const walk = (p, out = []) => {
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), out); }
  else if (/\.(js|mjs)$/.test(p)) out.push(p);
  return out;
};
/** The SQL literal enclosing position i: a quoted string on that line, else the surrounding template literal. (Indexing
 *  each `FROM docs` and widening to its literal stays correct where whole-file string tokenising desyncs on regexes.) */
function enclosingLiteral(src, i) {
  const ls = src.lastIndexOf('\n', i) + 1, le = src.indexOf('\n', i);
  const line = src.slice(ls, le < 0 ? undefined : le), col = i - ls;
  for (const q of ["'", '"']) {
    const a = line.lastIndexOf(q, col), b = line.indexOf(q, col);
    if (a >= 0 && b >= 0 && !line.slice(a, b).includes('`')) return line.slice(a, b + 1);
  }
  const a = src.lastIndexOf('`', i), b = src.indexOf('`', i);
  return a >= 0 && b >= 0 ? src.slice(a, b + 1) : line;
}
/** SQL literals that aggregate the whole docs table (no `= ?` / `IN (...)` narrowing). */
function wholeDocsAggregates(src) {
  const code = codeOnly(src), out = [];
  for (const m of code.matchAll(/\bFROM\s+docs\b/gi)) {
    const q = enclosingLiteral(code, m.index);
    if ((/\bGROUP\s+BY\b/i.test(q) || /SUM\s*\(\s*paragraph_count\s*\)/i.test(q) || /COUNT\s*\(\s*DISTINCT/i.test(q))
      && !/=\s*\?|\bIN\s*\(\s*\?|\bIN\s*\(\$\{/i.test(q) && !out.includes(q)) out.push(q);
  }
  return out;
}

describe('request path never aggregates the whole docs table', () => {
  it('detector catches the 10-23 offenders and spares narrowed queries', () => {
    expect(wholeDocsAggregates("queryAll(`SELECT collection, COUNT(*) as count FROM docs WHERE deleted_at IS NULL AND collection IS NOT NULL GROUP BY collection`)")).toHaveLength(1);
    expect(wholeDocsAggregates('queryOne(`SELECT SUM(paragraph_count) AS total FROM docs WHERE deleted_at IS NULL`)')).toHaveLength(1);
    expect(wholeDocsAggregates('queryAll(`SELECT collection, COUNT(*) FROM docs WHERE religion = ? GROUP BY collection`, [r])')).toHaveLength(0);
  });

  it('no handler file runs one (outside the shrinking legacy list)', () => {
    const offenders = [];
    for (const base of REQUEST_PATH) {
      for (const f of walk(join(ROOT, base))) {
        const rel = relative(ROOT, f);
        const hits = wholeDocsAggregates(readFileSync(f, 'utf8'));
        if (hits.length > (LEGACY.get(rel) ?? 0)) offenders.push(`${rel}: ${hits[0].replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the stats handlers read the snapshot', () => {
    for (const f of ['api/lib/search.js', 'api/services/progress.js', 'api/routes/library.js', 'api/routes/public-api.js']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/readLibraryStats\(\)/);
    }
  });
});

describe('library-stats snapshot', () => {
  const rows = {
    facets: [
      { religion: 'Bahá’í', collection: 'Core Tablets', language: 'en', n: 10, paras: 500, with_content: 9 },
      { religion: 'Bahá’í', collection: 'Core Tablets', language: 'ar', n: 5, paras: 100, with_content: 5 },
      { religion: 'Islam', collection: null, language: 'en', n: 2, paras: 0, with_content: 0 },
    ],
    authors: 7, byEra: [{ era: 'unknown', documents: 17 }], topAuthors: [{ name: 'A', documents: 3 }], recentlyUpdated: 4,
  };
  it('shapes totals and facet maps from one facet pass', () => {
    const s = shapeLibraryStats(rows, Date.parse('2026-10-23T12:00:00Z'));
    expect(s.totals).toEqual({ documents: 17, docs_with_content: 14, paragraphs: 600, authors: 7, languages: 2, recently_updated: 4 });
    expect(s.religionCounts).toEqual({ 'Bahá’í': 15, Islam: 2 });
    expect(s.religionParagraphs['Bahá’í']).toBe(600);
    expect(s.collectionCounts).toEqual({ 'Core Tablets': 15 });
    expect(s.languageCounts).toEqual({ en: 12, ar: 5 });
    expect(countList(s.languageCounts, 1)).toEqual([{ name: 'en', documents: 12 }]);
  });
  it('reads the file, and returns an empty snapshot (never a query) when it is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'libstats-'));
    expect(readLibraryStats(join(dir, 'nope.json')).missing).toBe(true);
    const p = join(dir, 'library-stats.json');
    writeFileSync(p, JSON.stringify(shapeLibraryStats(rows)));
    expect(readLibraryStats(p).totals.documents).toBe(17);
  });
});
