#!/usr/bin/env node
// Seed the behaviour suite from the older fixtures: tests/quality/routing-fixtures.json (question classes → ROUTING_OUTCOME) and answer-decisions.json
// (quote found vs genuinely absent) → tests/behavior/scenarios/{routing,answer-decisions}.json, grouped by CLASS (same expectation)
// into scenarios of 2-3 examples. A class with one case cannot form a scenario (not converted; counted). Per-case tradition /
// author / comparative expectations are not checks here (counted as dropped details). Pure core; the CLI writes with --write.
//   node tests/behavior/seed.mjs [--write]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');

/** n cases → chunk sizes of 2-3 (n ≥ 2): 4 → 2+2, 5 → 3+2, 7 → 3+2+2. */
export function chunkSizes(n) {
  if (n < 2) return [];
  const k = Math.ceil(n / 3), base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}
const chunk = (xs) => { let i = 0; return chunkSizes(xs.length).map((n) => xs.slice(i, i += n)); };
const NEW_READER = 'a reader with no earlier conversation';

// What Anís must DO for each planner class (11-05): the old `shape` check tested an internal planner label that newer fast
// paths pre-empt (quote examples answer via the source hunt, shape 'source') — planner routing is covered by tests/quality.
// These run on the production default path (no draft override) and judge the reply a reader gets.
const NO_SEARCH = 'fused_search, combined_search, document_search, web_search, quotation_trace';
export const ROUTING_OUTCOME = {
  quote: [{ check: 'judge', expect: 'Names the source of the quoted words (work and author) from a passage the library holds and links that work; when the library does not hold them, says so instead of guessing' }],
  topic: [{ check: 'judge', expect: "Answers from the primary texts of the tradition asked about, quoting them with citations; for a Bahá'í question the Writings and Shoghi Effendi come before commentary, and the House of Justice is never presented as doctrine" }],
  'quote | topic': [{ check: 'judge', expect: 'Recognises the words as a known teaching, says where it comes from, and quotes the primary text with a citation' }],
  fact: [{ check: 'judge', expect: 'States the fact in the first sentence with a library source for it; a short question gets a short answer, not an essay' }],
  define: [{ check: 'judge', expect: 'Gives the meaning in the first sentence (with the word\'s origin when it is a loan word) from a source the library holds' }],
  enumerate: [{ check: 'judge', expect: 'Lists the members by name with a library source for the list, and says so where the sources disagree' }],
  lookup: [{ check: 'judge', expect: 'Resolves the name, spelling variants included, to the book or person meant: a book is linked in the library, a person gets a short sourced identification' }],
  converse: [{ check: 'tool_not_called', expect: NO_SEARCH }, { check: 'judge', expect: 'A short, natural reply with no search results or citations' }],
};

/** routing-fixtures.json → { scenarios, counts } */
export function seedRouting(fx) {
  const groups = new Map();
  for (const c of fx?.cases || []) { const k = [...(c.shapes || [])].sort().join(' | '); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
  const scenarios = [], notConverted = [];
  for (const [shapes, cases] of groups) {
    const then = ROUTING_OUTCOME[shapes];
    if (cases.length < 2 || !then) { notConverted.push(...cases.map((c) => ({ id: c.id, reason: then ? `only case of class "${shapes}"` : `no outcome for class "${shapes}"` }))); continue; }
    chunk(cases).forEach((cs, i) => scenarios.push({ title: `Answer: ${shapes.split(' | ').join(' or ')} question (${i + 1})`, source: { fixture: 'routing-fixtures.json', ids: cs.map((c) => c.id) },
      given: { reader: NEW_READER, history: [] }, when: { asks: `a ${shapes.split(' | ').join(' or ')} question`, examples: cs.map((c) => c.query) },
      then }));
  }
  const dropped = (fx?.cases || []).filter((c) => !notConverted.some((n) => n.id === c.id) && (c.tradition || c.author || c.comparative != null)).length;
  return { scenarios, counts: { cases: (fx?.cases || []).length, converted: (fx?.cases || []).length - notConverted.length, not_converted: notConverted.length,
    not_converted_ids: notConverted, details_dropped: dropped } };
}

const FOUND = [{ check: 'tool_not_called', expect: 'web_search' }, { check: 'source_tier', expect: 'writings' },
  { check: 'judge', expect: "Points the reader to the passage the library holds (Some Answered Questions: justice is rendering to each his due) — never says it was not found" }];
const ABSENT = [{ check: 'judge', expect: 'Says plainly that the library holds no such passage and attributes the words to no source it cannot show' }];

/** answer-decisions.json → { scenarios, counts } (expect.quote_miss false = we hold it; true = genuinely absent) */
export function seedDecisions(fx) {
  const rows = Array.isArray(fx) ? fx : [];
  const scenarios = [], notConverted = [];
  for (const [miss, then, title] of [[false, FOUND, 'A described or paraphrased passage we hold is found in the library'], [true, ABSENT, 'Words the library does not hold are reported as absent']]) {
    const cases = rows.filter((r) => r.expect?.quote_miss === miss && r.question);
    if (cases.length < 2) { notConverted.push(...cases.map((c) => ({ id: c.id, reason: 'only case of its class' }))); continue; }
    chunk(cases).forEach((cs, i) => scenarios.push({ title: `${title} (${i + 1})`, source: { fixture: 'answer-decisions.json', ids: cs.map((c) => c.id) },
      given: { reader: NEW_READER, history: [] }, when: { asks: miss ? 'where some words are, when the library does not hold them' : 'where a passage is, by paraphrase or description', examples: cs.map((c) => c.question) },
      then }));
  }
  const skipped = rows.filter((r) => typeof r.expect?.quote_miss !== 'boolean' || !r.question).map((r) => ({ id: r.id, reason: 'no quote_miss expectation' }));
  return { scenarios, counts: { cases: rows.length, converted: rows.length - notConverted.length - skipped.length, not_converted: notConverted.length + skipped.length,
    not_converted_ids: [...notConverted, ...skipped] } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/quality', f), 'utf8'));
  const r = seedRouting(read('routing-fixtures.json')), d = seedDecisions(read('answer-decisions.json'));
  console.log(JSON.stringify({ routing: { scenarios: r.scenarios.length, ...r.counts }, answer_decisions: { scenarios: d.scenarios.length, ...d.counts } }, null, 1));
  if (process.argv.includes('--write')) {
    mkdirSync(join(DIR, 'scenarios'), { recursive: true });
    writeFileSync(join(DIR, 'scenarios/routing.json'), `${JSON.stringify({ seeded_from: 'tests/quality/routing-fixtures.json', scenarios: r.scenarios }, null, 2)}\n`);
    writeFileSync(join(DIR, 'scenarios/answer-decisions.json'), `${JSON.stringify({ seeded_from: 'tests/quality/answer-decisions.json', scenarios: d.scenarios }, null, 2)}\n`);
    console.log('wrote tests/behavior/scenarios/routing.json, answer-decisions.json');
  }
}
