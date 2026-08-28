#!/usr/bin/env node
/**
 * LIVE PAGE CONTRACT for /who-was-at/badasht.
 *
 * The page must BE the query: the intersection of two node rosters, rendered as people with citable
 * evidence. This checks the shipped HTML, not a module — a passing unit test proves the rule, this proves
 * the page. Run before claiming the page works:
 *
 *   node scripts/check-who-was-at-live.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'https://siftersearch.com';
const URL_PATH = '/who-was-at/badasht';

const MUST_INCLUDE = ['Quddús', 'Ṭáhirih', 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', 'Mírzá Hádí'];
// Each is excluded for a DIFFERENT reason — that is why all four are checked.
const MUST_EXCLUDE_AS_ATTENDEE = [
  ['Mullá Báqir-i-Tabrízí', 'a Letter, but absent from the Badasht node'],
  ["Bahá'u'lláh", 'participated-in, but not a Letter'],
  ['Shoghi Effendi', 'neither'],
];

const fail = [], pass = [];
const t0 = Date.now();
const res = await fetch(BASE + URL_PATH, { signal: AbortSignal.timeout(20000) });
const ms = Date.now() - t0;
const html = await res.text();

const check = (ok, msg) => (ok ? pass : fail).push(msg);

check(res.status === 200, `GET ${URL_PATH} → ${res.status} (want 200)`);
check(ms < 20000, `latency ${(ms / 1000).toFixed(1)}s (agent client budget 20s)`);

// The attendee list. Read the NAMES the page marks, not the block's raw text: a source book is titled
// "Mullá Ḥusayn" and is cited under Quddús, so a substring search over the block reported him as an
// attendee when he is correctly absent. Assert on the page's own machine-readable claim instead.
const block = (html.match(/<!--attendees:start-->([\s\S]*?)<!--attendees:end-->/) || [])[1] || '';
check(block.length > 0, 'page marks its attendee block');
const attendees = [...block.matchAll(/data-attendee="([^"]+)"/g)].map((m) => m[1]);
check(attendees.length > 0, `page marks each attendee by name (found ${attendees.length})`);

for (const n of MUST_INCLUDE) check(attendees.some((a) => a.includes(n)), `attendee present: ${n}`);
for (const [n, why] of MUST_EXCLUDE_AS_ATTENDEE) check(!attendees.some((a) => a.includes(n)), `NOT an attendee: ${n} (${why})`);
// Mullá Ḥusayn must not be an attendee, but MUST appear on the page labelled `visited`.
check(!attendees.some((a) => a === 'Mullá Ḥusayn'), 'NOT an attendee: Mullá Ḥusayn (visited ≠ attended)');
check(/Mullá Ḥusayn[\s\S]{0,400}visited/.test(html), 'Mullá Ḥusayn shown elsewhere, labelled visited');

// Evidence must be on the page, per person.
check(/participated-in/.test(block), 'evidence relation rendered');
check(/paraId=/.test(html), 'paraId citation links rendered');
check(/God Passes By|Dawn-Breakers|Revelation|Ẓuhúr/.test(block), 'source book rendered');

// Crawlable and unique — not a docs dump.
check(/<title>[^<]*Badasht[^<]*<\/title>/i.test(html), 'unique <title> naming Badasht');
check(/Letters of the Living/.test(html), 'names the group');
check(!/openapi|OpenAPI|X-API-Key|curl -/.test(html), 'NOT an OpenAPI/connector dump');
check(!/sifter_search|\/docs\/entity-search/.test(html), 'no "try this search" links');

console.log(`\n${BASE}${URL_PATH}  →  ${res.status}  ${(ms / 1000).toFixed(1)}s\n`);
for (const p of pass) console.log('  ✓', p);
for (const f of fail) console.log('  ✗', f);
console.log(`\n${pass.length} passed, ${fail.length} failed\n`);
process.exit(fail.length ? 1 : 0);
