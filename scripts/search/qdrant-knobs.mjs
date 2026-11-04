// Read-only Qdrant knob bench: app request shapes, one knob at a time, server ms (response .time) + top-k overlap vs a
// high-recall reference. Run on tower, light (conc 1-3). Phases: embed (caches vectors in ~/q10) | dense <coll> | kw | kw2 |
// concepts-exact | shapes | docids | payload | fanout <conc> [ef] | filtered-recall. Plan: planning/qdrant-10ms-plan-20261104.md
import fs from 'fs';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const env = {};
for (const f of ['.env-secrets', '.env-public']) for (const l of fs.readFileSync(`${ROOT}/${f}`, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const { bm25Query, tokens } = await import(`${ROOT}/api/lib/keyword-tokens.js`);
const MAIN = env.QDRANT_URL, HOT = env.QDRANT_HOT_URL, KEY = env.QDRANT_KEY;
const QUERIES = [
  'progressive revelation and the unity of the prophets', 'the station of the Bab as the Gate', 'life after death and the progress of the soul',
  "consultation in Baha'i administration", 'the equality of women and men', 'tithing and Huququllah', 'the oneness of mankind and world peace',
  'prayer and fasting as spiritual obligations', 'the covenant and the appointment of Abdul-Baha', 'science and religion in harmony',
  'detachment from the world', 'the lesser peace and the most great peace', 'education of children', 'the purpose of creation knowing God',
  'martyrdom of the Bab in Tabriz', 'the Guardian and the Universal House of Justice',
  'Who were the Seven Martyrs of Tehran?', 'Who were the Hands of the Cause?', 'Which Letters of the Living participated in Badasht?',
  'Who accompanied the Bab to Maku?', 'Who met Bahaullah in Baghdad?', 'Who was imprisoned with Bahaullah in the Siyah-Chal?',
  'Who died at the fort of Shaykh Tabarsi?', 'Who were the Letters of the Living?',
  'the meaning of the clouds in the return of Christ', 'Mulla Husayn and the declaration in Shiraz', 'the Most Great Name',
  'independent investigation of truth', 'the Tablet of Ahmad', 'what happens to the soul in dreams',
];
const VF = `${process.env.HOME}/q10/vecs.json`;
let vecs = fs.existsSync(VF) ? JSON.parse(fs.readFileSync(VF)) : {};
async function embed(q) {
  if (vecs[q]) return vecs[q];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text: `task: search result | query: ${q}` }] }, outputDimensionality: 3072 }) });
  if (!r.ok) throw new Error(`gemini ${r.status} ${await r.text()}`);
  vecs[q] = (await r.json()).embedding.values; fs.writeFileSync(VF, JSON.stringify(vecs)); return vecs[q];
}
async function qd(base, coll, body, path = 'points/query') {
  const t = performance.now();
  const r = await fetch(`${base}/collections/${coll}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'api-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${coll} ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return { srv: j.time * 1000, wall: performance.now() - t, points: j.result.points || [] };
}
const RANK = ['author_fold', 'scope', 'collection'];
const PRIMARY = { must_not: [{ key: 'scope', match: { value: 'supplemental' } }, { key: 'doc_id', match: { any: [8746] } }] };
const params = (rescore, os, ef) => ({ quantization: { rescore, oversampling: os }, ...(ef ? { hnsw_ef: ef } : {}) });
const APP = {
  phrases: { base: MAIN, coll: 'phrases', payload: ['paragraph_id', 'doc_id', 'start', 'end', ...RANK], os: 1 },
  phrases_hot: { base: HOT, coll: 'phrases_hot', payload: ['paragraph_id', 'doc_id', 'start', 'end', ...RANK], os: 1 },
  hype: { base: MAIN, coll: 'hype', payload: ['paragraph_id', 'doc_id', 'k', ...RANK], os: 1 },
  concepts: { base: MAIN, coll: 'concepts', payload: ['paragraph_id', 'doc_id', ...RANK], os: 4 },
};
const dense = (c, vec, o = {}) => qd(APP[c].base, APP[c].coll, { query: vec, using: 'literal', limit: o.limit ?? 60,
  with_payload: o.payload === false ? false : (o.payload ?? APP[c].payload), filter: o.filter === undefined ? PRIMARY : (o.filter || undefined),
  params: { ...params(o.rescore ?? true, o.os ?? APP[c].os, o.ef), ...(o.indexed_only ? { indexed_only: true } : {}), ...(o.exact ? { exact: true } : {}), ...(o.ignoreQ ? { quantization: { ignore: true } } : {}) } });
const best = (pts, n = 30) => { const s = new Set(), out = []; for (const p of pts) { const k = p.payload?.paragraph_id ?? p.id; if (s.has(k)) continue; s.add(k); out.push(k); if (out.length >= n) break; } return out; };
const overlap = (a, b, n) => { const B = new Set(b.slice(0, n)); return a.slice(0, n).filter((x) => B.has(x)).length / Math.max(1, Math.min(n, b.length)); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
const stat = (a) => `p50 ${pct(a, 0.5)} p95 ${pct(a, 0.95)} max ${pct(a, 1)} (n ${a.length})`;
const out = (k, v) => console.log(`${k.padEnd(48)} ${v}`);
const phase = process.argv[2];

if (phase === 'embed') { for (const q of QUERIES) await embed(q); console.log('vectors', Object.keys(vecs).length); }

// Dense collection: cold (first touch), then warm variants; recall vs a reference.
if (phase === 'dense') {
  const c = process.argv[3]; const qs = QUERIES.map((q) => vecs[q]);
  const half = qs.length / 2; const R = {};
  const add = (k, v) => (R[k] ||= []).push(v);
  const recall = {};
  const addR = (k, v) => (recall[k] ||= []).push(v);
  for (let i = 0; i < qs.length; i++) {
    const v = qs[i];
    if (i < half) { const r = await dense(c, v); add('A cold app-shape', r.srv); }
    else { const r0 = await dense(c, v, { rescore: false }); add('B cold no-rescore', r0.srv); const r1 = await dense(c, v); add('B app-shape after no-rescore (rescore IO cold)', r1.srv); }
    const ref = await dense(c, v, { os: 4, ef: 512 });
    const refIds = best(ref.points);
    const variants = { 'warm app-shape': {}, 'warm no-rescore': { rescore: false }, 'warm with_payload:false': { payload: false }, 'warm no filter': { filter: null },
      'warm limit 30': { limit: 30 }, 'warm ef 32': { ef: 32 }, 'warm ef 64': { ef: 64 }, 'warm ef 128': { ef: 128 }, 'warm indexed_only': { indexed_only: true },
      'warm os 2': { os: 2 }, 'warm os 1': { os: 1 } };
    for (const [k, o] of Object.entries(variants)) { const r = await dense(c, v, o); add(k, r.srv); if (o.payload !== false && o.filter !== null) addR(k, overlap(best(r.points), refIds, 30)); }
    add('ref os4 ef512', ref.srv);
  }
  console.log(`== ${c}`); for (const [k, a] of Object.entries(R)) out(k, `${stat(a)}${recall[k] ? `  overlap@30 vs ref ${(recall[k].reduce((x, y) => x + y, 0) / recall[k].length).toFixed(3)}` : ''}`);
}

// paragraphs_kw BM25
const STOP = new Set('the of and a an in to is was for as by with his he her that which who were what how on at from it its be are this or into their they them did does do s'.split(' '));
const sparse = (q, o = {}) => { const s = bm25Query(q); if (!o.stop) return s; const keep = [...new Set(tokens(q))].filter((w) => !STOP.has(w)); const S = bm25Query(keep.join(' ')); return S.indices.length ? S : s; };
const kw = (q, o = {}) => qd(MAIN, 'paragraphs_kw', { query: sparse(q, o), using: 'bm25', limit: o.limit ?? 30, with_payload: o.payload === false ? false : ['paragraph_id', 'doc_id', ...RANK], filter: o.filter === undefined ? PRIMARY : (o.filter || undefined) });
if (phase === 'kw') {
  const R = {}, rec = {};
  const add = (k, v) => (R[k] ||= []).push(v);
  for (const q of QUERIES) {
    const ref = await kw(q); add('cold app-shape', ref.srv);
    const refIds = ref.points.map((p) => p.id);
    const V = { 'warm app-shape': {}, 'warm no filter': { filter: null }, 'warm filter scope only': { filter: { must_not: [PRIMARY.must_not[0]] } },
      'warm filter doc_id only': { filter: { must_not: [PRIMARY.must_not[1]] } }, 'warm with_payload:false': { payload: false }, 'warm limit 10': { limit: 10 },
      'warm stopwords dropped': { stop: true }, 'warm stopwords dropped + no filter': { stop: true, filter: null } };
    for (const [k, o] of Object.entries(V)) { const r = await kw(q, o); add(k, r.srv); if (o.limit == null) (rec[k] ||= []).push(overlap(r.points.map((p) => p.id), refIds, 30)); }
  }
  console.log('== paragraphs_kw'); for (const [k, a] of Object.entries(R)) out(k, `${stat(a)}${rec[k] ? `  overlap@30 vs app ${(rec[k].reduce((x, y) => x + y, 0) / rec[k].length).toFixed(3)}` : ''}`);
  // per-query token count vs time
  for (const q of QUERIES.slice(0, 30)) { const a = await kw(q), b = await kw(q, { stop: true }); console.log(`  ${String(sparse(q).indices.length).padStart(2)}→${String(sparse(q, { stop: true }).indices.length).padStart(2)} tok  ${a.srv.toFixed(1).padStart(6)} → ${b.srv.toFixed(1).padStart(6)} ms  ${q}`); }
}

// concepts exact reference (104k points, in RAM) + doctrinal/canon shapes on phrases
if (phase === 'concepts-exact') {
  const rec = {}, T = {};
  for (const q of QUERIES) { const v = vecs[q];
    const ex = await dense('concepts', v, { exact: true, ignoreQ: true }); (T.exact ||= []).push(ex.srv); const ids = best(ex.points);
    for (const [k, o] of Object.entries({ app: {}, 'os 1': { os: 1 }, 'os 2': { os: 2 }, 'no filter': { filter: null }, 'no filter os1': { filter: null, os: 1 }, 'exact binary+rescore': { exact: true } })) { const r = await dense('concepts', v, o); (T[k] ||= []).push(r.srv); (rec[k] ||= []).push(overlap(best(r.points), ids, 30)); } }
  for (const k of Object.keys(T)) out(`concepts ${k}`, `${stat(T[k])}${rec[k] ? `  overlap@30 vs exact ${(rec[k].reduce((x, y) => x + y, 0) / rec[k].length).toFixed(3)}` : ''}`);
}
if (phase === 'shapes') {
  // doctrinal (author_fold any, writerOnly) on phrases + hype; canon (doc_id any N) on phrases
  const DOC = { must: [{ key: 'author_fold', match: { any: ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'] } }], must_not: PRIMARY.must_not };
  const ids = JSON.parse(fs.readFileSync(`${process.env.HOME}/q10/docids.json`));
  const T = {};
  for (const q of QUERIES.slice(0, 16)) { const v = vecs[q];
    for (const [k, c, o] of [['phrases doctrinal lim30', 'phrases', { limit: 30, filter: DOC }], ['hype doctrinal lim30', 'hype', { limit: 30, filter: DOC }],
      [`phrases canon doc_id any ${ids.length} lim24`, 'phrases', { limit: 24, filter: { must: [{ key: 'doc_id', match: { any: ids } }] } }],
      ['phrases canon doc_id any 500 lim24', 'phrases', { limit: 24, filter: { must: [{ key: 'doc_id', match: { any: ids.slice(0, 500) } }] } }]]) {
      const r = await dense(c, v, o); (T[k] ||= []).push(r.srv); const r2 = await dense(c, v, o); (T[k + ' (warm)'] ||= []).push(r2.srv); } }
  for (const k of Object.keys(T)) out(k, stat(T[k]));
}
if (phase === 'docids') {
  // distinct doc_ids of Baha'i primary paragraphs (scroll, payload doc_id only) — stand-in for the canon id list
  const s = new Set(); let off = null;
  for (let i = 0; i < 6 && s.size < 4000; i++) {
    const r = await fetch(`${MAIN}/collections/paragraphs_kw/points/scroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': KEY }, body: JSON.stringify({ limit: 20000, with_payload: ['doc_id'], filter: { must: [{ key: 'religion', match: { value: "Baha'i" } }], must_not: PRIMARY.must_not }, ...(off != null ? { offset: off } : {}) }) });
    const j = (await r.json()).result; for (const p of j.points) s.add(p.payload.doc_id); off = j.next_page_offset; if (off == null) break;
  }
  fs.writeFileSync(`${process.env.HOME}/q10/docids.json`, JSON.stringify([...s])); console.log('doc ids', s.size);
}
if (phase === 'kw2') {
  const R = {}, rec = {};
  for (const q of QUERIES) {
    const ref = await kw(q); const refIds = ref.points.map((p) => p.id);
    const full = sparse(q), lite = sparse(q, { stop: true });
    for (const N of [100, 300, 1000]) {
      const r = await qd(MAIN, 'paragraphs_kw', { prefetch: [{ query: lite, using: 'bm25', limit: N, filter: PRIMARY }], query: full, using: 'bm25', limit: 30, with_payload: ['paragraph_id', 'doc_id', ...RANK] });
      const k = `prefetch nostop ${N} → rescore full`; (R[k] ||= []).push(r.srv); (rec[k] ||= []).push(overlap(r.points.map((p) => p.id), refIds, 30));
      const k10 = k + ' top10'; (rec[k10] ||= []).push(overlap(r.points.map((p) => p.id), refIds, 10));
    }
  }
  for (const k of Object.keys(rec)) out(k, `${R[k] ? stat(R[k]) : ''}  overlap vs app ${(rec[k].reduce((x, y) => x + y, 0) / rec[k].length).toFixed(3)}`);
}
if (phase === 'payload') {
  const T = {};
  for (const q of QUERIES) { const v = vecs[q];
    for (const c of ['phrases', 'hype']) for (const [k, o] of [['all app fields', {}], ['paragraph_id only', { payload: ['paragraph_id'] }], ['none', { payload: false }], ['ef64 + app fields', { ef: 64 }]]) {
      const r = await dense(c, v, o); (T[`${c} ${k}`] ||= []).push(r.srv); } }
  for (const k of Object.keys(T)) out(k, stat(T[k]));
}
if (phase === 'fanout') {
  // one "engine call" = all layers at once (as multiIndexSearch does); conc = engine calls in flight. Warm vectors.
  const conc = Number(process.argv[3] || 1), ef = process.argv[4] ? Number(process.argv[4]) : undefined;
  const T = {};
  const engine = async (q) => { const v = vecs[q];
    const P = process.env.NOPAY ? { payload: false } : {}; const calls = [['phrases', dense('phrases', v, { ef, ...P })], ['phrases_hot', dense('phrases_hot', v, { ef, ...P })], ['hype', dense('hype', v, { ef, ...P })], ['concepts', dense('concepts', v, P)], ...(process.env.NOKW ? [] : [['paragraphs_kw', kw(q, P)]])];
    for (const [k, p] of calls) { const r = await p; (T[k] ||= []).push(r.srv); } };
  for (let i = 0; i < QUERIES.length; i += conc) await Promise.all(QUERIES.slice(i, i + conc).map(engine));
  console.log(`== fanout conc ${conc}${ef ? ` ef ${ef}` : ''}`); for (const k of Object.keys(T)) out(k, stat(T[k]));
}
if (phase === 'filtered-recall') {
  const DOC = { must: [{ key: 'author_fold', match: { any: ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'] } }], must_not: PRIMARY.must_not };
  const BAHAI = { must: [{ key: 'religion', match: { value: "Baha'i" } }], must_not: PRIMARY.must_not };
  const T = {}, rec = {};
  for (const q of QUERIES) { const v = vecs[q];
    for (const [shape, c, lim, filter] of [['doctrinal', 'phrases', 30, DOC], ['doctrinal', 'hype', 30, DOC], ['bahai', 'phrases', 60, BAHAI], ['bahai', 'hype', 60, BAHAI], ['doctrinal', 'phrases_hot', 30, DOC]]) {
      const ref = await dense(c, v, { limit: lim, filter, os: 4, ef: 512 }); const ids = best(ref.points, lim / 2);
      for (const [k, o] of [['default ef', {}], ['ef 64', { ef: 64 }]]) { const r = await dense(c, v, { limit: lim, filter, ...o }); const key = `${c} ${shape} lim${lim} ${k}`; (T[key] ||= []).push(r.srv); (rec[key] ||= []).push(overlap(best(r.points, lim / 2), ids, lim / 2)); } } }
  for (const k of Object.keys(T)) out(k, `${stat(T[k])}  overlap@top vs os4/ef512 ${(rec[k].reduce((x, y) => x + y, 0) / rec[k].length).toFixed(3)}`);
}
process.exit(0);
