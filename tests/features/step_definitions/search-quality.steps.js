/**
 * Search Quality Step Definitions
 *
 * BDD steps for the search quality battery (tests/features/search-quality.feature).
 * Calls the production search API and asserts relevance + authority criteria.
 * Adapted from ocean-search-testing (dnotes/ocean-search-testing).
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

const API_BASE = process.env.API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY || '';
const TOP_K = 10;

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Background ───────────────────────────────────────────────────────────────

Given('the search API is reachable', async function () {
  const res = await fetch(`${API_BASE}/api/health`);
  expect(res.ok, `Search API at ${API_BASE} should respond`).to.be.true;
});

// ── When ─────────────────────────────────────────────────────────────────────

When('I search for {string}', async function (query) {
  await doSearch.call(this, query, {});
});

When('I search for {string} filtered by religion {string}', async function (query, religion) {
  await doSearch.call(this, query, { religion });
});

async function doSearch(query, filters) {
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
    },
    body: JSON.stringify({ query, limit: TOP_K, filters }),
    signal: AbortSignal.timeout(20000)
  });
  this.searchLatency = Date.now() - t0;
  expect(res.ok, `Search API returned HTTP ${res.status} for query "${query}"`).to.be.true;
  const body = await res.json();
  this.searchHits = body.results || body.hits || body.passages || [];
  this.searchQuery = query;
}

// ── Then ─────────────────────────────────────────────────────────────────────

Then('I should receive at least {int} search result(s)', function (n) {
  expect(this.searchHits.length, `Expected ≥${n} results for "${this.searchQuery}"`).to.be.at.least(n);
});

Then('document {int} should appear in the top {int} results', function (docId, k) {
  const hits = (this.searchHits || []).slice(0, k);
  const found = hits.some(h => (h.documentId ?? h.document_id ?? h.doc_id) === docId);
  const topTitles = hits.slice(0, 3).map(h => h.title).join(', ');
  expect(found, `Doc ${docId} not found in top ${k} for "${this.searchQuery}". Top: [${topTitles}]`).to.be.true;
  // Store matched hit for subsequent Then steps
  this.matchedHit = hits.find(h => (h.documentId ?? h.document_id ?? h.doc_id) === docId);
});

Then('the matching passage should contain {string}', function (phrase) {
  const hit = this.matchedHit || this.searchHits?.[0];
  expect(hit, 'No hit available for text check').to.exist;
  const text = normalize(hit.text || '');
  expect(
    text.includes(normalize(phrase)),
    `Expected passage to contain "${phrase}" but got: "${(hit.text || '').slice(0, 120)}"`
  ).to.be.true;
});

Then('the top result author should contain {string}', function (authorFrag) {
  const hit = this.searchHits?.[0];
  expect(hit, 'No results returned').to.exist;
  const author = normalize(hit.author || '');
  expect(
    author.includes(normalize(authorFrag)),
    `Expected top author to contain "${authorFrag}" but got: "${hit.author}"`
  ).to.be.true;
});

Then('the top result author should not contain {string}', function (authorFrag) {
  const hit = this.searchHits?.[0];
  expect(hit, 'No results returned').to.exist;
  const author = normalize(hit.author || '');
  expect(
    !author.includes(normalize(authorFrag)),
    `Expected top author NOT to contain "${authorFrag}" but got: "${hit.author}"`
  ).to.be.true;
});

Then('the top result authority should be at least {int}', function (minAuth) {
  const hit = this.searchHits?.[0];
  expect(hit, 'No results returned').to.exist;
  const auth = hit.authority ?? hit.authorityTier ?? hit.tier ?? 0;
  expect(
    auth >= minAuth,
    `Expected top result authority ≥${minAuth} but got ${auth} (${hit.author} — ${hit.title})`
  ).to.be.true;
});

Then('the top result text should contain {string}', function (phrase) {
  const hit = this.searchHits?.[0];
  expect(hit, 'No results returned').to.exist;
  const text = normalize(hit.text || '');
  expect(
    text.includes(normalize(phrase)),
    `Expected top result to contain "${phrase}" but got: "${(hit.text || '').slice(0, 120)}"`
  ).to.be.true;
});

Then('the search should complete within {int}ms', function (ms) {
  expect(this.searchLatency, `Search took ${this.searchLatency}ms, expected <${ms}ms`).to.be.at.most(ms);
});
