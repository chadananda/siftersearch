#!/usr/bin/env node
// ONE-TIME generator of anis-wording-fixtures.json (the output is FROZEN and committed; re-run only to add fixtures).
// Haiku writes 10-15 natural wordings per search-type fixture, a second Haiku pass drops any that change the meaning/answer.
// Usage: node tests/quality/gen-anis-wordings.mjs [--only id,id] [--merge]   (--merge keeps already-frozen fixtures untouched)
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first'); import net from 'node:net'; net.setDefaultAutoSelectFamilyAttemptTimeout(2000);
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
const DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(DIR, '..', '..', '.env-secrets'), quiet: true });
const OUT = join(DIR, 'anis-wording-fixtures.json');
const MODEL = 'claude-haiku-5-5';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('only')?.split(',');
const client = new Anthropic();

// style matrix (fixed). `for`: which fixture groups it makes sense for.
export const STYLES = {
  bare: 'just the words, nothing else, no question mark or request',
  polite: 'a polite request ("Could you please help me find...", "I wonder if you could...")',
  find: '"find / where does it say / where can I read" phrasing',
  source_of: 'asks who said it / who wrote it / where it is from',
  misquoted: 'half-remembered: a word or two WRONG or the word order shifted, still clearly the same thing asked for',
  fragment: 'only a mid-sentence piece of the wording (as in "can you find the quote including \'...\'"), not the start',
  typo: 'typos, no diacritics, all lowercase, sloppy typing',
  embedded: 'buried inside a longer personal message or short story (2-4 sentences) with the real request in it',
  followup: 'a 2-turn conversation: a short related first user message, a brief assistant reply, then this request as the 2nd user turn (it may lean on the first turn, e.g. "and can you find that exact quote?")',
  non_native: 'non-native English, slightly off grammar, as a second-language speaker would write',
  terse: 'terse search-box style, keywords only',
};
const QUOTE_TYPES = ['exact_phrase', 'source_resolution', 'lay_paraphrase'];
const STYLE_SETS = {
  quote: Object.keys(STYLES),
  plain: ['bare', 'polite', 'find', 'typo', 'embedded', 'followup', 'non_native', 'terse'],
  person_work: ['bare', 'polite', 'find', 'source_of', 'typo', 'embedded', 'followup', 'non_native', 'terse'],
};
const group = (fx) => (QUOTE_TYPES.includes(fx.type) || fx.id === 'mis-helps-themselves' || fx.id === 'inc-necessary-element' ? 'quote'
  : ['find_work', 'find_person'].includes(fx.type) || fx.endpoint === 'find_document' ? 'person_work' : 'plain');

// What Anís's route should be, as search-plan.js SHAPES (quote|fact|topic|define|lookup|enumerate|converse). A LIST = any is right.
const SHAPE = { exact_phrase: ['quote'], source_resolution: ['quote'], lay_paraphrase: ['quote'], find_work: ['lookup'], misattribution: ['lookup'],
  find_person: ['lookup', 'fact', 'define'], enumerate: ['enumerate'], scoped_topic: ['topic'], compare: ['topic'], author_scoped: ['topic'],
  author_theme: ['topic'], history_fact: ['fact'], define_term: ['define'], library_meta: ['fact', 'converse'] };
const RELI = { buddhist: 'buddh', christian: 'christ|bible|jesus|gospel', islam: 'islam|quran|muslim|muhammad', judaism: 'jewish|judaism|torah|hebrew', hindu: 'hindu|veda|gita', bahai: 'bahai', tao: 'tao', taoist: 'tao' };
const AUTH = { bahaullah: 'bahaullah', abdulbaha: 'abdul baha', 'abdul baha': 'abdul baha', 'shoghi effendi': 'shoghi', bab: 'the bab|bab' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9\s|]/g, ' ').replace(/\s+/g, ' ').trim();
// cite = what a RIGHT answer must contain (all regexes are matched against folded reply text). Derived from the fixture's own expect/truth — never from Anís.
export function citeOf(fx) {
  const e = fx.expect || {}, c = { link: !!e.link };
  if (fx.id === 'inc-necessary-element') return { any: ['uncompiled published letters', 'lights of guidance', 'social action'], link: true };
  if (e.hit?.title && QUOTE_TYPES.includes(fx.type)) c.any = [e.hit.title, e.hit.text].map(fold);
  else if (e.hit?.author) c.any = [AUTH[e.hit.author] || e.hit.author, e.hit.text].map(fold);
  else if (e.origin) c.any = [AUTH[e.origin.author] || e.origin.author, e.origin.text].map(fold);
  else if (e.candidate) c.all = [e.candidate.title, ...(fx.type === 'misattribution' ? [AUTH[e.candidate.author] || e.candidate.author] : [])].map(fold);
  else if (e.same_as) c.any = [fold(e.same_as)];
  else if (e.includes) c.min = { n: Math.ceil(e.includes.length * 0.6), of: e.includes.map(fold) };
  else if (e.top_religion) c.any = [RELI[e.top_religion.religion] || e.top_religion.religion];
  else if (e.religions_all) c.all = e.religions_all.map((r) => RELI[r] || r);
  else if (e.religions_min) c.min = { n: e.religions_min, of: Object.values(RELI).filter((v, i, a) => a.indexOf(v) === i) };
  else if (e.top_author) c.any = [AUTH[e.top_author.author] || e.top_author.author];
  else if (e.min_count) c.min = { n: 6, of: Object.values(RELI).filter((v, i, a) => a.indexOf(v) === i) };
  else if (fx.id.startsWith('th-')) c.all = ['shoghi', 'world order|lights of guidance|dispensation|letter'];
  else if (e.hit?.text) c.any = [fold(e.hit.text)];
  if (fx.id === 'mis-helps-themselves') { c.any = ['sidney|franklin|not in the bible|not (a )?(biblical|scriptur)|not (found|from|said)|does not appear|isn t in|proverb|not (a )?(saying|quotation|quote) of (jesus|christ)']; c.allow_not_found = true; delete c.link; }
  return c;
}

const TOOL = { name: 'wordings', description: 'the wordings', input_schema: { type: 'object', required: ['variants'], properties: { variants: { type: 'array', items: {
  type: 'object', required: ['style', 'messages'], properties: { style: { type: 'string', enum: Object.keys(STYLES) },
    messages: { type: 'array', description: 'the conversation ending with the user request; a single user message unless style=followup', items: { type: 'object', required: ['role', 'content'], properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } } } } } } } } } };

async function ask(system, user, tool) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens: 6000, system, tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: user }] });
      const u = r.content.find((b) => b.type === 'tool_use')?.input; if (u) return { out: u, usage: r.usage };
    } catch (e) { if (a === 2) throw e; await new Promise((z) => setTimeout(z, 3000)); }
  }
  throw new Error('no tool output');
}

async function makeVariants(fx) {
  const styles = STYLE_SETS[group(fx)];
  const params = fx.params ? `\nRequired detail to KEEP in every wording: the question also names ${JSON.stringify(fx.params)} (a deliberately wrong author - keep it).` : '';
  const sys = `You write test wordings of one fixed information need, as real readers of a Baha'i/world-scriptures library would phrase it to an AI research assistant. Every wording must ask for EXACTLY the same thing, so the correct answer is unchanged. Never add the answer or ANY fact, clue, source, author, work, topic or keyword that is not already in the canonical request (an embedded story may add personal colour only; a follow-up's first turn and assistant reply must not mention the answer or its topic). Never change names/facts, never switch language. Vary vocabulary, length and tone naturally; do not sound like a template.`;
  const user = `Canonical request: ${JSON.stringify(fx.query)}${params}\nQuestion type: ${fx.type}. Correct answer (for your eyes only; do NOT put it in the wordings): ${fx.truth}\n\nWrite ${styles.length + 5} wordings. Use EACH of these styles at least once (the 5 extras: repeat any styles):\n${styles.map((s) => `- ${s}: ${STYLES[s]}`).join('\n')}\nFor style=followup, "messages" has 3 turns (user, assistant, user); every other style has exactly one user message. Call the wordings tool.`;
  return ask(sys, user, TOOL);
}
const JTOOL = { name: 'verdicts', description: 'verdicts', input_schema: { type: 'object', required: ['keep'], properties: { keep: { type: 'array', items: { type: 'object', required: ['i', 'same', 'why'], properties: { i: { type: 'number' }, same: { type: 'boolean' }, why: { type: 'string' } } } } } } };
async function validate(fx, vs) {
  const sys = 'You check test wordings. For each numbered wording decide: does it ask for exactly the same thing as the canonical request, such that the SAME answer is correct? same=true when it targets the same person/work/quote/fact and the same good answer is correct (asking where to read it, who wrote it, or whether the library has it are all the same target). same=false only if it changes the person/work/quote/fact, drops a required constraint (e.g. the wrong author named), asks a different question, or ADDS a clue/keyword/fact not in the canonical request (leaks the answer).';
  const user = `Canonical request: ${JSON.stringify(fx.query)}${fx.params ? ` with ${JSON.stringify(fx.params)}` : ''}\nCorrect answer: ${fx.truth}\n\n${vs.map((v, i) => `${i}. [${v.style}] ${JSON.stringify(v.messages.at(-1).content)}`).join('\n')}\n\nWordings tagged [misquoted] deliberately alter a word or two or the word order: that is expected; same=true if a reader would still obviously mean the same passage. Call the verdicts tool for every number.`;
  return ask(sys, user, JTOOL);
}

const base = JSON.parse(readFileSync(join(DIR, 'search-type-fixtures.json'), 'utf8')).fixtures;
const incident = { id: 'inc-necessary-element', type: 'exact_phrase', persona: 'both', endpoint: 'search', query: 'but it will always be present as a necessary element',
  expect: { hit: { title: 'uncompiled published letters|lights of guidance|social action', text: 'present as a necessary element' }, link: { text: 'necessary element', site: 'siftersearch.com', paragraph: true } },
  truth: 'Shoghi Effendi (letter, Question 6 on machinery and toil): "it will always be present as a necessary element in our earthly existence" - Uncompiled Published Letters; also quoted (with "be always present") in Lights of Guidance. Incident 10-31: Anís routed this as a topic and answered off-topic.',
  incident: 'Chad 10-31: "can you find the quote including \'but it will always be present as a necessary element\'" -> routed topic, off-topic answer, 14 s' };
const all = [incident, ...base].filter((f) => !only || only.includes(f.id));
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { fixtures: [] };
const done = new Map(prev.fixtures.map((f) => [f.id, f]));
let tokIn = 0, tokOut = 0;
const results = [];
const work = async (fx) => {
  if (process.argv.includes('--merge') && done.has(fx.id)) return done.get(fx.id);
  const { out, usage } = await makeVariants(fx);
  const vs = (out.variants || []).filter((v) => STYLES[v.style] && v.messages?.length && v.messages.at(-1).role === 'user' && v.messages.at(-1).content?.trim());
  const j = await validate(fx, vs);
  tokIn += usage.input_tokens + j.usage.input_tokens; tokOut += usage.output_tokens + j.usage.output_tokens;
  const ok = new Map(j.out.keep.map((k) => [k.i, k]));
  const dropped = vs.map((v, i) => ({ v, i })).filter(({ i }) => ok.get(i)?.same === false).map(({ v, i }) => ({ style: v.style, text: v.messages.at(-1).content, why: ok.get(i).why }));
  const keep = vs.filter((_, i) => ok.get(i)?.same !== false);
  return { id: fx.id, type: fx.type, persona: fx.persona, source_endpoint: fx.endpoint, canonical: fx.query, ...(fx.params ? { params: fx.params } : {}), truth: fx.truth,
    ...(fx.incident ? { incident: fx.incident } : {}), expected_strategy: SHAPE[fx.type], cite: citeOf(fx),
    variants: keep.map((v, i) => ({ id: `${fx.id}#${String(i + 1).padStart(2, '0')}`, style: v.style, messages: v.messages })), dropped };
};
const N = 4;
for (let i = 0; i < all.length; i += N) { results.push(...await Promise.all(all.slice(i, i + N).map((f) => work(f).catch((e) => { console.error(f.id, e.message); return null; })))); process.stderr.write(`${Math.min(i + N, all.length)}/${all.length}\n`); }
const merged = new Map(prev.fixtures.map((f) => [f.id, f])); results.filter(Boolean).forEach((r) => merged.set(r.id, r));
const fixtures = [...merged.values()];
writeFileSync(OUT, JSON.stringify({ _about: 'FROZEN natural-language wordings of tests/quality/search-type-fixtures.json (+ the 10-31 incident), generated once by gen-anis-wordings.mjs (Haiku 5.5, then a meaning-check pass). expected_strategy = acceptable search-plan.js SHAPES; cite = regexes (matched on folded reply) a right answer contains, derived from fixture expect/truth. Do not edit variants to fit Anís.', styles: STYLES, fixtures }, null, 1));
console.log(`fixtures ${fixtures.length}, variants ${fixtures.reduce((n, f) => n + f.variants.length, 0)}, dropped ${fixtures.reduce((n, f) => n + f.dropped.length, 0)}, tokens in ${tokIn} out ${tokOut}`);
