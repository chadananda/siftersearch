#!/usr/bin/env node
// corpus-status — print the AUTHORITATIVE state of the library from production.
//
// Exists because a local `data/sifter.db` looks like the library and is not. In one session that
// mistake produced five wrong conclusions: "the corpus isn't interfaith", "extraction is 57%
// incomplete", "Bahá'u'lláh has no in-corpus originals", "6.6M paragraphs is really 1.39M", and a
// non-existent ingestion defect. Every one would have been prevented by this single request.
//
// Run this BEFORE making any claim about corpus size, coverage, languages or ingestion health.
// Deps: none (global fetch). Read-only, public endpoint, no auth.
const URL_ = process.env.SIFTER_URL || 'https://siftersearch.com';
const r = await fetch(`${URL_}/api/library/stats`, { signal: AbortSignal.timeout(30000) });
if (!r.ok) {
  console.error(`stats endpoint returned ${r.status} — do NOT fall back to the local db; say you could not determine it`);
  process.exit(1);
}
const d = await r.json();
const n = (x) => Number(x || 0).toLocaleString();
const pct = (o) => (o && o.percentComplete != null ? `${o.percentComplete}%` : '?');

console.log(`\nLIBRARY (authoritative — ${URL_})`);
console.log(`  documents ${n(d.totalDocuments)}   paragraphs ${n(d.totalParagraphs)}`);
console.log(`  religions ${d.religions}   collections ${d.collections}   languages ${d.languages}`);

console.log('\nBY RELIGION');
for (const [k, v] of Object.entries(d.religionCounts || {}).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(14)}${n(v)}`);

console.log('\nBY LANGUAGE (top 10)');
const langs = Object.entries(d.languageCounts || {}).sort((a, b) => b[1] - a[1]);
for (const [k, v] of langs.slice(0, 10)) console.log(`  ${k.padEnd(8)}${n(v)}`);

// Language codes are not normalised in the corpus (en/En/Eng, es/Es, fr/Fr, de/Ger). A language
// filter therefore undercounts silently, so surface it rather than letting a caller trust a count.
const seen = new Map();
for (const [k, v] of langs) {
  const key = k.toLowerCase().slice(0, 2);
  seen.set(key, (seen.get(key) || []).concat([[k, v]]));
}
const dupes = [...seen.values()].filter((g) => g.length > 1);
if (dupes.length) {
  console.log('\n⚠ LANGUAGE CODES NOT NORMALISED — filtering by language undercounts:');
  for (const g of dupes) console.log(`  ${g.map(([k, v]) => `${k}=${n(v)}`).join('  ')}`);
}

console.log('\nPIPELINE');
console.log(`  ingestion  ${pct(d.ingestionProgress)}  (pending ${n(d.ingestionProgress?.docsPending)})`);
console.log(`  indexing   ${pct(d.indexingProgress)}  (pending ${n(d.indexingProgress?.pending)})`);
const kg = d.pipelineStatus?.knowledgeGraph;
if (kg) console.log(`  knowledge graph  ${kg.percent}%  (${n(kg.extracted)} of ${n(kg.total)})`);
if (d.pipelineStatus?.paragraphsNeedingEmbeddings)
  console.log(`  paragraphs needing embeddings  ${n(d.pipelineStatus.paragraphsNeedingEmbeddings)}`);
console.log('');
