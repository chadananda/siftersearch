#!/usr/bin/env node
// Term-study battery (live CTAI + the one-word resolver; no answer model): which questions trigger a term study,
// whether Latin spellings resolve to the right Arabic word, and whether CTAI's per-word counts put the expected
// rendering on top (and never a different word on the same root, like ʿarf "fragrance" for ʿirfán).
//   node tests/quality/term-study-battery.mjs
import dotenv from 'dotenv';
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: f, quiet: true });
const { termQuestion, resolveTerm, ctaiTerm } = await import('../../api/lib/anis/ctai-term.js');

const TERMS = [   // question → the Arabic word, renderings that may lead, and one that must not appear
  { q: 'I would like to understand the meaning of the word Irfan in the Bahá’í writings', word: 'عرفان', top: ['knowledge', 'recogni'], never: 'fragrance' },
  { q: 'What does ʿirfán mean?', word: 'عرفان', top: ['knowledge', 'recogni'], never: 'fragrance' },
  { q: 'How did Shoghi Effendi translate the term inṣáf?', word: 'انصاف', top: ['fair', 'equity', 'justice'] },
  { q: 'What does Riḍván mean?', word: 'رضوان', top: ['paradise', 'ridvan', 'riḍván', 'ridván', 'good-pleasure', 'garden'] },
  { q: 'What is the meaning of the word maẓhar?', word: 'مظهر', top: ['manifestation', 'revealer', 'exponent'] },
  { q: 'What does the word Íqán mean?', word: 'ایقان', top: ['certitude', 'certainty', 'assurance'] },
  { q: 'What does عدل mean in the Writings?', word: 'عدل', top: ['justice', 'equity'] },
  { q: 'Explain the term tawḥíd', word: 'توحید', top: ['unity', 'oneness', 'divine unity'] },
  { q: 'What does ایقان mean?', word: 'ایقان', top: ['certitude'], min: 20 },   // Persian ی: must still find the Arabic-spelled passages
];
const NOT_TERMS = [
  'What does Bahá’u’lláh say about the oneness of humanity?', 'What does ‘Abdu’l-Bahá mean by the Most Great Peace?',
  'What is the meaning of sacrifice in the Writings?', 'What is the meaning of life?', 'Who was Ṭáhirih?',
  'Where is this quote from: "The earth is but one country"?', 'Compare Buddhist and Bahá’í teachings on detachment',
  'What did the Báb write about the Promised One?', 'What does Gleanings say about justice?', 'Tell me about the Kitáb-i-Íqán',
];
const norm = (w) => String(w || '').replace(/[\u064B-\u0652\u0670]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[إأآ]/g, 'ا');
let pass = 0, fail = 0; const out = [];
const ok = (cond, msg) => { (cond ? pass++ : fail++); out.push(`${cond ? '✓' : '✗'} ${msg}`); };

for (const q of NOT_TERMS) ok(termQuestion(q) === null, `no term study: ${q}${termQuestion(q) ? `  → ${JSON.stringify(termQuestion(q))}` : ''}`);
for (const t of TERMS) {
  const tq = termQuestion(t.q);
  if (!tq) { ok(false, `detected: ${t.q}`); continue; }
  const t0 = Date.now();
  const word = tq.script === 'arabic' ? tq.term : await resolveTerm(tq.term).catch(() => null);
  ok(norm(word) === norm(t.word), `resolve ${tq.term} → ${word} (want ${t.word})`);
  const s = word ? await ctaiTerm(word).catch((e) => ({ error: e.message })) : null;
  if (!s || s.error) { ok(false, `CTAI study for ${word}: ${s?.error || 'nothing'}`); continue; }
  const top = s.renderings[0]?.en || '';
  if (t.min) ok(s.total >= t.min, `${word}: ${s.total} passages in CTAI (want ≥ ${t.min}: both spellings searched)`);
  ok(s.passages.length >= 3, `${word}: ${s.passages.length} passages shown, ${s.total} in CTAI, counts from ${s.counted || 'ROOT (fallback)'} passages`);
  ok(t.top.some((k) => top.includes(k)), `${word}: top rendering "${top}" (want one of ${t.top.join(', ')}) · ${s.renderings.slice(0, 5).map((r) => `${r.en} ${r.count}`).join(' · ')}`);
  if (t.never) ok(!s.renderings.some((r) => r.en.includes(t.never)), `${word}: never "${t.never}"`);
  ok(s.passages.every((p) => /^https:\/\/ctai\.info\//.test(p.url)), `${word}: every passage links to ctai.info · ${Date.now() - t0} ms`);
}
console.log(out.join('\n'));
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
