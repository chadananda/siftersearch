/**
 * Search Authority Ranking — End-to-end quality evaluation.
 *
 * Hits the real hybridSearch path and asserts two behavioural properties
 * using a curated quote-to-source dataset plus a broad aggregate set:
 *
 *  1. Primary-source retrieval: given a distinctive phrase from a known
 *     primary source, the top hit must be a primary/authoritative source
 *     (authority >= 7) — NOT a secondary work that cites or commentates
 *     on the original. This is the core user-facing guarantee.
 *
 *  2. Exact-source retrieval (stricter): ideally the top hit matches
 *     the specific expected document (via title or author substring
 *     patterns in the dataset). Measured as a rate, not a hard per-
 *     query assertion, because hybrid-vector over-fetch windows don't
 *     always surface the exact paragraph for short quotes.
 *
 *  3. Aggregate authority: over ~240 broad theological queries, the
 *     top-1 authority distribution should be dominated by canonical
 *     (auth >=9) and authoritative (auth >=7) sources.
 *
 * Dataset lives in tests/fixtures/authority-ranking-dataset.json and is
 * curated by hand. Add entries to the JSON — no code changes needed.
 *
 * Run live:
 *   LIVE_SEARCH=true npm run test:api -- search-authority-ranking
 *
 * Without LIVE_SEARCH every case is skipped so CI isn't blocked on
 * having a populated Meilisearch index.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isLive = process.env.LIVE_SEARCH === 'true';

const dataset = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'authority-ranking-dataset.json'), 'utf8')
);

// ---- Helpers ---------------------------------------------------------------

/**
 * Normalize a string for loose substring comparison across the dataset.
 * Without this, `Bahá'u'lláh` in the dataset (straight apostrophe) never
 * matches the corpus's `Bahá'u'lláh` (curly apostrophe) even though they
 * refer to the same author.
 */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019\u02BC\u0060\u00B4]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsCi(haystack, needle) {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

/**
 * Strict match: hit matches an expected title OR author pattern from
 * the dataset entry. Used for the exact-source retrieval rate.
 */
function strictlyMatches(hit, test) {
  if (!hit) return false;
  for (const pat of (test.titles || [])) if (containsCi(hit.title, pat)) return true;
  for (const pat of (test.authors || [])) if (containsCi(hit.author, pat)) return true;
  return false;
}

/**
 * Authoritative match: hit is a primary/authoritative source (auth >= 7).
 * Authority band per data/authority-config.yml:
 *  10 Central Figure revelation
 *   9 Authoritative interpretation
 *   8 Institutional guidance
 *   7 Official compilations
 *   6 Reference works
 *   5 Published books
 *   4 Historical documents
 *   3 Research papers
 *   2 News/essays
 *   1 Pilgrim notes
 * Anything >=7 is a primary-source presentation; <=6 is commentary or
 * secondary literature.
 */
function isAuthoritative(hit) {
  return typeof hit?.authority === 'number' && hit.authority >= 7;
}

// ---- Shared evaluation (runs once in beforeAll) ---------------------------

let quoteResults = [];
let aggregateResults = [];

beforeAll(async () => {
  if (!isLive) return;
  const search = await import('../../api/lib/search.js');
  const { hybridSearch } = search;

  for (const test of dataset.quote_tests) {
    const r = await hybridSearch(test.q, { limit: 5, semanticRatio: 0.5 });
    const top = r?.hits?.[0] || null;
    quoteResults.push({
      test,
      top,
      strict: strictlyMatches(top, test),
      authoritative: isAuthoritative(top)
    });
  }

  for (const q of dataset.authority_queries) {
    const r = await hybridSearch(q, { limit: 5, semanticRatio: 0.5 });
    const top = r?.hits?.[0] || null;
    aggregateResults.push({ query: q, top });
  }
}, 20 * 60 * 1000); // 20 min budget — ~372 hybrid searches with embeddings

// ---- Test 1: primary-source retrieval --------------------------------------

describe('Primary-source retrieval (auth >= 7)', () => {
  const PASS_RATE = 0.90;

  it.skipIf(!isLive)('at least 90% of quote queries return an authoritative source', () => {
    expect(quoteResults.length, 'no quote results recorded').toBeGreaterThan(0);

    const pass = quoteResults.filter(r => r.authoritative).length;
    const rate = pass / quoteResults.length;

    const secondary = quoteResults.filter(r => !r.authoritative);

    /* eslint-disable no-console */
    console.log('');
    console.log('Primary-source retrieval:');
    console.log(`  ${pass}/${quoteResults.length} quotes (${(rate * 100).toFixed(1)}%) returned a primary/authoritative top hit (auth >= 7)`);

    if (secondary.length > 0) {
      console.log(`  ${secondary.length} quotes fell to a secondary source (auth <= 6):`);
      for (const r of secondary) {
        const author = (r.top?.author || '?').slice(0, 35);
        const title = (r.top?.title || '?').slice(0, 55);
        const auth = r.top?.authority ?? 'n/a';
        console.log(`    [auth ${auth}] "${r.test.q}" -> ${author} / ${title}`);
      }
    }
    /* eslint-enable no-console */

    expect(rate, `primary-source retrieval rate ${(rate * 100).toFixed(1)}% is below ${PASS_RATE * 100}% threshold`).toBeGreaterThanOrEqual(PASS_RATE);
  });
});

// ---- Test 2: exact-source retrieval (stricter) -----------------------------

describe('Exact-source retrieval (specific document match)', () => {
  const PASS_RATE = 0.60;

  it.skipIf(!isLive)('at least 60% of quote queries return the specific expected document', () => {
    expect(quoteResults.length, 'no quote results recorded').toBeGreaterThan(0);

    const pass = quoteResults.filter(r => r.strict).length;
    const rate = pass / quoteResults.length;

    const missed = quoteResults.filter(r => !r.strict);

    /* eslint-disable no-console */
    console.log('');
    console.log('Exact-source retrieval:');
    console.log(`  ${pass}/${quoteResults.length} quotes (${(rate * 100).toFixed(1)}%) returned the specific expected document by title or author`);
    console.log(`  ${missed.length} quotes returned a different document (these still count as primary-source passes if auth >= 7).`);

    // Sample the top 20 missed queries for diagnostic visibility without
    // flooding the log.
    if (missed.length > 0) {
      console.log('  first 20 misses:');
      for (const r of missed.slice(0, 20)) {
        const wantTitles = (r.test.titles || []).join(' | ') || '(none)';
        const wantAuthors = (r.test.authors || []).join(' | ') || '(none)';
        const author = (r.top?.author || '?').slice(0, 30);
        const title = (r.top?.title || '?').slice(0, 45);
        const auth = r.top?.authority ?? 'n/a';
        console.log(`    "${r.test.q}"`);
        console.log(`       want:  title in [${wantTitles}]  or  author in [${wantAuthors}]`);
        console.log(`       got:   ${author} / ${title} (auth ${auth})`);
      }
    }
    /* eslint-enable no-console */

    expect(rate, `exact-source retrieval rate ${(rate * 100).toFixed(1)}% is below ${PASS_RATE * 100}% threshold`).toBeGreaterThanOrEqual(PASS_RATE);
  });
});

// ---- Test 3: aggregate authority distribution ------------------------------

describe('Aggregate authority distribution', () => {
  const THRESHOLD_CANONICAL = 0.70;      // >= 70% top-1 at authority >= 9
  const THRESHOLD_AUTHORITATIVE = 0.90;  // >= 90% top-1 at authority >= 7
  const THRESHOLD_LOW = 0.03;            // <= 3% top-1 at authority <= 3

  it.skipIf(!isLive)('broad theological queries meet canonical-first thresholds', () => {
    const results = aggregateResults.filter(r => typeof r.top?.authority === 'number');
    expect(results.length, 'no aggregate results with authority data').toBeGreaterThan(0);

    const total = results.length;
    const canonical = results.filter(r => r.top.authority >= 9).length;
    const authoritative = results.filter(r => r.top.authority >= 7).length;
    const low = results.filter(r => r.top.authority <= 3).length;
    const midtier = results.filter(r => r.top.authority >= 4 && r.top.authority <= 6).length;

    const canonicalRate = canonical / total;
    const authoritativeRate = authoritative / total;
    const lowRate = low / total;
    const meanTop1 = results.reduce((s, r) => s + r.top.authority, 0) / total;

    // Histogram for diagnostic output.
    const dist = {};
    for (const r of results) dist[r.top.authority] = (dist[r.top.authority] || 0) + 1;
    const histogram = Object.keys(dist)
      .map(Number)
      .sort((a, b) => b - a)
      .map(a => {
        const pct = (dist[a] / total) * 100;
        const bar = '\u2588'.repeat(Math.floor(pct / 2));
        return `    auth ${String(a).padStart(2)}: ${String(dist[a]).padStart(3)} (${pct.toFixed(1).padStart(5)}%) ${bar}`;
      })
      .join('\n');

    /* eslint-disable no-console */
    console.log('');
    console.log('Aggregate authority distribution over ' + total + ' queries:');
    console.log('  mean top-1 authority: ' + meanTop1.toFixed(2));
    console.log('  canonical (>=9):      ' + (canonicalRate * 100).toFixed(1) + '%');
    console.log('  authoritative (>=7):  ' + (authoritativeRate * 100).toFixed(1) + '%');
    console.log('  mid-tier (4-6):       ' + ((midtier / total) * 100).toFixed(1) + '%');
    console.log('  low (<=3):            ' + (lowRate * 100).toFixed(1) + '%');
    console.log(histogram);
    /* eslint-enable no-console */

    expect(canonicalRate, `canonical rate ${(canonicalRate * 100).toFixed(1)}% below threshold`).toBeGreaterThanOrEqual(THRESHOLD_CANONICAL);
    expect(authoritativeRate, `authoritative rate ${(authoritativeRate * 100).toFixed(1)}% below threshold`).toBeGreaterThanOrEqual(THRESHOLD_AUTHORITATIVE);
    expect(lowRate, `low-authority rate ${(lowRate * 100).toFixed(1)}% exceeds tolerance`).toBeLessThanOrEqual(THRESHOLD_LOW);
  });
});
