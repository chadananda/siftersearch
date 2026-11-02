// Regenerates questions/*.jsonl + families.json from the survey and the legacy fixture files (read-only). Idempotent. Run: node tests/quality/questions/import.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DIR, validate } from './registry.mjs';
const Q = path.resolve(DIR, '..'), ROOT = path.resolve(DIR, '../../..');
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8')), qj = (f) => rd(path.join(Q, f));
const TR = { "baha'i": 'bahai', bahai: 'bahai', "bahá'í": 'bahai', islamic: 'islam', islam: 'islam', jewish: 'judaism', judaism: 'judaism', buddhist: 'buddhism', buddhism: 'buddhism',
  christian: 'christianity', christianity: 'christianity', hindu: 'hindu' + 'ism', hinduism: 'hinduism', zoroastrian: 'zoroastrianism', zoroastrianism: 'zoroastrianism',
  taoist: 'taoism', taoism: 'taoism', confucian: 'confucianism', confucianism: 'confucianism', sikh: 'sikhism', sikhism: 'sikhism', jain: 'jainism', jainism: 'jainism' };
const trs = (...a) => [...new Set(a.flat().filter(Boolean).map((t) => TR[String(t).toLowerCase()]).filter(Boolean))];
const scopeOf = (t) => (t.length > 1 ? 'cross' : t.length === 1 ? 'tradition' : 'universal');
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const h8 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const arr = (v) => (v == null ? undefined : Array.isArray(v) ? v : [v]);
// build expect: mapped fields + everything else unmapped in extra
const mkExpect = (src, map, drop = []) => {
  const x = {}, extra = {}, used = new Set([...Object.values(map).flat(), ...drop]);
  for (const [k, v] of Object.entries(map)) { const val = typeof v === 'function' ? v(src) : arr(src[v]); if (val !== undefined && val.length !== 0 && val !== null) x[k] = val; }
  for (const [k, v] of Object.entries(src)) if (!used.has(k)) extra[k] = v;
  if (Object.keys(extra).length) x.extra = extra;
  return x;
};
const mk = (o) => ({ family: null, type: null, traditions: [], lang: 'en', origin: 'seed', source_url: null, expect: {}, wordings: [], layers: ['search'], ...o, scope: o.scope ?? scopeOf(o.traditions || []) });
const out = {};
const add = (file, q) => (out[file] ||= []).push(q);

// --- survey
const sv = rd(path.join(ROOT, 'planning/question-survey-interfaith-20261102.json'));
const families = sv.families.map(({ id, intent, scope, kind, traditions, relative_frequency, hype_relevant }) => ({ id, intent, scope, kind, traditions, relative_frequency, hype_relevant }));
for (const f of sv.families) {
  const seen = new Set(), ft = trs(f.traditions);
  for (const e of f.examples) {
    const id = `survey:${f.id}:${h8(e.text + '|' + e.lang)}`; if (seen.has(id)) continue; seen.add(id);
    let t = trs(e.traditions), inferred = false;
    if (f.scope === 'cross' && t.length < 2) { t = ft; inferred = true; }
    const q = mk({ id, text: e.text, family: f.id, type: f.kind, traditions: t, lang: e.lang || 'en', origin: e.via === 'google_autocomplete' ? 'seo' : 'survey',
      source_url: e.source_url || null, layers: f.hype_relevant ? ['hype', 'search'] : ['search'], legacy: { file: 'planning/question-survey-interfaith-20261102.json', id: f.id } });
    if (!e.source_url) q.invented = true;
    if (inferred) q.inferred_traditions = true;
    if (e.rank != null) q.rank = e.rank;
    add('survey.jsonl', q);
  }
}

// --- ocean (+ reformulation wordings)
const byLegacy = {};
const reg = (file, key, q) => { (byLegacy[`${file}`] ||= {})[key] = q; };
for (const x of qj('ocean-fixtures.json')) {
  const q = mk({ id: `ocean:${x.id}`, text: x.query, type: x.category, traditions: trs(x.tradition, x.religion_filter), origin: x.regression_doc_id ? 'regression' : 'seed',
    expect: mkExpect(x, { docs: (s) => arr(s.expected_doc_ids ?? s.expected_doc_id), text_contains: 'expected_text_contains', author: 'expected_author_contains' }, ['id', 'query', 'category', 'tradition']),
    legacy: { file: 'ocean-fixtures.json', id: x.id } });
  if (q.expect.author) q.expect.author = [].concat(q.expect.author).join('|');
  reg('ocean', x.id, q); add('ocean.jsonl', q);
}
// --- search-fixtures
for (const x of qj('search-fixtures.json')) {
  const q = mk({ id: `search:${x.id}`, text: x.query, type: x.category, traditions: trs(x.religion_filter),
    expect: mkExpect(x, { docs: (s) => arr(s.expected_doc_ids ?? s.expected_doc_id), text_contains: 'expected_text_contains', author: 'expected_author_contains' }, ['id', 'query', 'category']),
    legacy: { file: 'search-fixtures.json', id: x.id } });
  if (q.expect.author) q.expect.author = [].concat(q.expect.author).join('|');
  reg('search', x.id, q); add('search.jsonl', q);
}
// --- search-type-fixtures
const typeById = {};
for (const x of qj('search-type-fixtures.json').fixtures) {
  const tc = [x.expect?.hit?.text, x.expect?.link?.text].filter((s) => typeof s === 'string');
  const q = mk({ id: `type:${x.id}`, text: x.query, type: x.type, origin: 'log', layers: ['search'], legacy: { file: 'search-type-fixtures.json', id: x.id },
    expect: { ...(tc.length ? { text_contains: tc } : {}), extra: { expect: x.expect, truth: x.truth, persona: x.persona, endpoint: x.endpoint, params: x.params, known_gap: x.known_gap, should: x.should } } });
  for (const k of Object.keys(q.expect.extra)) if (q.expect.extra[k] === undefined) delete q.expect.extra[k];
  typeById[x.id] = q; reg('type', x.id, q); add('search-type.jsonl', q);
}
// --- anis wordings: canonical question + frozen variants
for (const x of qj('anis-wording-fixtures.json').fixtures) {
  const q = mk({ id: `anis:${x.id}`, text: x.canonical, type: x.type, origin: x.incident ? 'regression' : 'log', layers: ['anis'], legacy: { file: 'anis-wording-fixtures.json', id: x.id },
    expect: { extra: { truth: x.truth, incident: x.incident, expected_strategy: x.expected_strategy, cite: x.cite, persona: x.persona, source_endpoint: x.source_endpoint, params: x.params, dropped: x.dropped } },
    wordings: x.variants.map((v) => ({ id: v.id, style: v.style, text: [...v.messages].reverse().find((m) => m.role === 'user')?.content ?? '', messages: v.messages })) });
  for (const k of Object.keys(q.expect.extra)) if (q.expect.extra[k] === undefined) delete q.expect.extra[k];
  add('anis-wording.jsonl', q);
}
// --- routing
for (const x of qj('routing-fixtures.json').cases) {
  const t = trs(x.tradition), ex = { shapes: x.shapes, comparative: x.comparative, author: x.author }; Object.keys(ex).forEach((k) => ex[k] === undefined && delete ex[k]);
  add('routing.jsonl', mk({ id: `route:${x.id}`, text: x.query, type: 'routing', traditions: t, layers: ['anis'], legacy: { file: 'routing-fixtures.json', id: x.id }, expect: { extra: ex } }));
}
// --- bio-search
for (const x of qj('bio-search-fixtures.json')) {
  add('bio-search.jsonl', mk({ id: `bio:${x.id}`, text: x.query, type: x.category, legacy: { file: 'bio-search-fixtures.json', id: x.id },
    expect: mkExpect(x, {}, ['id', 'query', 'category']) }));
}
// --- library
for (const x of qj('library-fixtures.json')) {
  add('library.jsonl', mk({ id: `lib:${x.id}`, text: x.args?.title ?? JSON.stringify(x.args), type: x.method, traditions: trs(x.args?.religion), legacy: { file: 'library-fixtures.json', id: x.id },
    expect: { docs: [x.expected_top_doc_id], extra: mkExpect(x, {}, ['id', 'expected_top_doc_id']).extra } }));
}
// --- concept senses (concept extraction gold; hype layer is the closest)
qj('concept-senses.fixtures.json').fixtures.forEach((x, i) => {
  const { symbol, ...rest } = x;
  add('concept-senses.jsonl', mk({ id: `senses:${slug(symbol) || i}-${i}`, text: symbol, type: 'concept-senses', layers: ['hype'], legacy: { file: 'concept-senses.fixtures.json', id: symbol }, expect: { extra: rest } }));
});
// --- answer-decisions
for (const x of qj('answer-decisions.json')) {
  add('answer-decisions.jsonl', mk({ id: `ans:${x.id}`, text: x.question, type: 'answer-decision', origin: 'regression', layers: ['anis'], legacy: { file: 'answer-decisions.json', id: x.id },
    expect: { extra: { why: x.why, span: x.span, confidence: x.confidence, candidates: x.candidates, expect: x.expect } } }));
}
// --- seeker battery (Google Keyword questions)
for (const t of qj('seeker-battery.json').queries) {
  const text = typeof t === 'string' ? t : t.query;
  add('seeker.jsonl', mk({ id: `seeker:${slug(text)}`, text, type: 'seeker', origin: 'seo', layers: ['hype', 'search'], legacy: { file: 'seeker-battery.json', id: text } }));
}
// --- crosslingual
for (const x of qj('crosslingual-fixtures.json').cases) {
  const xq = mk({ id: `xl:${x.id}`, text: x.query, type: `crosslingual-${x.kind}`, legacy: { file: 'crosslingual-fixtures.json', id: x.id },
    expect: { ...(x.book_docs ? { docs: x.book_docs } : {}), original_lang: x.lang, extra: { target: x.target, source: x.source, work: x.work, pair: x.pair, kind: x.kind } } });
  reg('xl', x.id, xq); add('crosslingual.jsonl', xq);
}
// --- reformulations -> wordings on the seed
const unmatched = [];
let attached = 0;
const seedMaps = [['ocean', 'ocean'], ['search', 'search'], ['type', 'type']];
const seedOf = (id) => seedMaps.map(([f]) => byLegacy[f]?.[id]).find(Boolean) ?? byLegacy.xl?.[id];
for (const w of qj('search-reformulation-fixtures.json')) {
  const q = seedOf(w.seed);
  if (!q) { unmatched.push(w.id); continue; }
  const { id, query, style, seed, seed_query, category, tradition, expected_match, match_words, regression_doc_id, expected_text_contains, ...rest } = w;
  q.wordings.push({ id, text: query, style, ...rest }); attached++;
}

// --- write
for (const f of fs.readdirSync(DIR)) if (f.endsWith('.jsonl') && !(f in out) && fs.readFileSync(path.join(DIR, f), 'utf8').includes('"legacy"')) { /* leave hand-added files alone */ }
const generated = Object.keys(out);
for (const f of generated) { out[f].sort((a, b) => (a.id < b.id ? -1 : 1)); fs.writeFileSync(path.join(DIR, f), out[f].map((q) => JSON.stringify(q)).join('\n') + '\n'); }
fs.writeFileSync(path.join(DIR, 'families.json'), JSON.stringify(families, null, 1) + '\n');
// --- summary
const all = generated.flatMap((f) => out[f]), bad = all.filter((q) => validate(q).length);
const tab = {}; for (const q of all) { const r = (tab[q.origin] ||= {}); for (const t of q.traditions.length ? q.traditions : ['(none)']) r[t] = (r[t] || 0) + 1; r._total = (r._total || 0) + 1; }
console.table(tab);
console.log('files:', generated.map((f) => `${f}=${out[f].length}`).join(' '));
console.log(`questions=${all.length} families=${families.length} wordings=${all.reduce((n, q) => n + q.wordings.length, 0)} (reformulations attached=${attached}, unmatched=${unmatched.length}) invalid=${bad.length}`);
if (unmatched.length) console.log('unmatched reformulation ids (sample):', unmatched.slice(0, 5));
if (bad.length) console.log('invalid sample:', bad.slice(0, 3).map((q) => [q.id, validate(q)]));
const ids = new Map(); for (const q of all) ids.set(q.id, (ids.get(q.id) || 0) + 1); const dup = [...ids].filter(([, n]) => n > 1); if (dup.length) console.log('DUPLICATE IDS', dup.slice(0, 5));
