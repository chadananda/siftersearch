#!/usr/bin/env node
// ONE-TIME generator of search-reformulation-fixtures.json (FROZEN, committed). Haiku rewrites each seed query in several styles;
// every variant INHERITS the seed's gate (ocean: match_words = seed query words; types: expected_text_contains; xl: expected_xl_target).
// Pattern from gen-anis-wordings.mjs. Usage: node tests/quality/gen-search-reformulations.mjs [--estimate] [--max-usd 3] [--xl 200]
// Run with: score-search.mjs --fixtures=tests/quality/search-reformulation-fixtures.json [--sample=N] [--category=reform-xl]
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
const DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(DIR, '..', '..', '.env-secrets'), quiet: true });
const OUT = join(DIR, 'search-reformulation-fixtures.json'), CACHE = join(DIR, '..', '..', 'tmp', 'search-reform-cache.json');
const MODEL = 'claude-haiku-4-5-20251001', PRICE = { in: 1 / 1e6, out: 5 / 1e6 };
const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MAX_USD = +flag('max-usd', 3), XL_N = +flag('xl', 200), ESTIMATE = args.includes('--estimate');
const STYLES = {
  question: 'a natural question a curious reader would type ("What does ... say about ...?")',
  paraphrase: 'the same request in different words, no word from the original reused where a synonym exists',
  longwinded: 'a long-winded 2-3 sentence message with the real request buried in it',
  misspelled: 'sloppy typing: misspellings, missing diacritics, wrong or alternate transliterations of names and terms',
  cross_religion: 'a question framed as asking what a specific religious tradition\'s scriptures teach on this (name the tradition)',
  original_language: 'asks for the original Arabic or Persian wording of this exact text ("the Persian original of ...", "show me the Arabic for ...")',
};
const J = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
// ---- seeds
const seeds = [];
for (const f of J('ocean-fixtures.json')) {
  const styles = ['question', 'paraphrase', 'longwinded', 'misspelled', ...(f.tradition && !/baha/i.test(f.tradition) ? ['cross_religion'] : [])];
  seeds.push({ src: 'ocean', id: f.id, query: f.query, styles, ctx: f.context || '', carry: { category: `reform-${f.category}`, tradition: f.tradition, expected_match: 'all_words', match_words: f.query, ...(f.regression_doc_id ? { regression_doc_id: f.regression_doc_id } : {}) } });
}
for (const f of J('search-type-fixtures.json').fixtures) {
  const t = f.expect?.hit?.text; if (f.endpoint !== 'search' || !t || !f.query) continue;
  seeds.push({ src: 'type', id: f.id, query: f.query, styles: ['question', 'paraphrase', 'longwinded', 'misspelled'], ctx: '', carry: { category: 'reform-types', expected_text_contains: [t] } });
}
const xl = J('crosslingual-fixtures.json').cases.filter((c) => ['phrase', 'sentence'].includes(c.kind) && c.query.length > 30 && c.query.length < 300);
for (let i = 0; i < Math.min(XL_N, xl.length); i++) { const c = xl[Math.floor((i * xl.length) / XL_N)];
  seeds.push({ src: 'xl', id: c.id, query: c.query, styles: ['question', 'paraphrase', 'misspelled', 'original_language'], ctx: '', carry: { category: 'reform-xl', expected_xl_target: c.target } }); }
// ---- estimate (chars/4; ~8 output tokens of JSON scaffolding per style, ~30 per query, longwinded ~90)
const prompt = (s) => `Rewrite this search request in each style below. The rewrites must ask for the SAME thing (same passage/answer); never add new topics.
Seed request: ${JSON.stringify(s.query)}${s.ctx ? `\nContext: ${s.ctx}` : ''}
Styles:\n${s.styles.map((k) => `- ${k}: ${STYLES[k]}`).join('\n')}
Reply with ONLY a JSON object mapping each style name to the rewritten request string.`;
const estIn = seeds.reduce((a, s) => a + prompt(s).length / 4 + 20, 0), estOut = seeds.reduce((a, s) => a + s.styles.reduce((b, k) => b + (k === 'longwinded' ? 100 : 45), 20), 0);
const est = estIn * PRICE.in + estOut * PRICE.out;
console.log(`seeds ${seeds.length} (ocean ${seeds.filter((s) => s.src === 'ocean').length}, types ${seeds.filter((s) => s.src === 'type').length}, xl ${seeds.filter((s) => s.src === 'xl').length}); variants ${seeds.reduce((a, s) => a + s.styles.length, 0)}; est in ${Math.round(estIn)} out ${Math.round(estOut)} tokens = $${est.toFixed(2)}`);
if (ESTIMATE) process.exit(0);
if (est > MAX_USD) { console.error(`estimate $${est.toFixed(2)} > cap $${MAX_USD}; stopping`); process.exit(1); }
// ---- generate (resumable via tmp cache)
const client = new Anthropic(), cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
let tin = 0, tout = 0, spent = 0, i = 0;
async function gen(s) {
  const key = `${s.src}:${s.id}`; if (cache[key]) return;
  for (let a = 0; a < 3; a++) try {
    const r = await client.messages.create({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt(s) }] });
    tin += r.usage.input_tokens; tout += r.usage.output_tokens; spent = tin * PRICE.in + tout * PRICE.out;
    cache[key] = JSON.parse(r.content[0].text.slice(r.content[0].text.indexOf('{'), r.content[0].text.lastIndexOf('}') + 1)); return;
  } catch (e) { if (a === 2) console.error(`skip ${key}: ${e.message.slice(0, 80)}`); }
}
const queue = seeds.filter((s) => !cache[`${s.src}:${s.id}`]);
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { if (spent > MAX_USD) return; await gen(queue.shift()); if (++i % 50 === 0) { writeFileSync(CACHE, JSON.stringify(cache)); console.log(`${i} seeds, $${spent.toFixed(3)}`); } } }));
writeFileSync(CACHE, JSON.stringify(cache));
// ---- freeze
const fixtures = [];
for (const s of seeds) for (const st of s.styles) {
  const q = cache[`${s.src}:${s.id}`]?.[st]; if (typeof q !== 'string' || q.trim().length < 3 || q.trim().toLowerCase() === s.query.trim().toLowerCase()) continue;
  fixtures.push({ id: `${s.src}-${s.id}--${st}`, query: q.trim(), seed: s.id, seed_query: s.query, style: st, ...s.carry });
}
writeFileSync(OUT, JSON.stringify(fixtures, null, 1));
console.log(`froze ${fixtures.length} fixtures -> ${OUT}; this run: ${tin} in + ${tout} out tokens = $${spent.toFixed(3)} (cache may hold earlier runs)`);
