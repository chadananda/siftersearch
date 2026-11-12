#!/usr/bin/env node
// Anís REQUESTS battery (Chad 11-12: "every single search I have done has failed… dramatically upgrade our methodology"): scripted
// multi-turn conversations of real reader requests — finding a work, its opening, side-by-side original + translation, compilations,
// comparisons, timelines, follow-ups that must STAY on the subject — sent through /api/chat/stream as one thread, every turn checked in CODE
// (no LLM judge): expected work cited, original script present, a table when side-by-side was asked, no false absence, no drift into
// traditions the conversation never named, plus the live battery's checks (denial, markers, markdown). Replies saved for hand review.
//   node tests/quality/anis-requests-battery.mjs [--only id,id] [--concurrency 2]   API_BASE (default https://api.siftersearch.com)
import { writeFileSync, mkdirSync } from 'fs';
import net from 'net';
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
import { send, check as baseCheck, isCapReply } from './anis-live-battery.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const ARABIC = /[؀-ۿ]{3,}/;
const ABSENT = /\b(?:(?:could|did)n['’]?t find|haven['’]?t found|not (?:able|been able) to find|no (?:such )?(?:work|passage|text) (?:in|from) the library|does not hold|doesn['’]t hold|isn['’]t in (?:the|this) library|paste (?:its|the) (?:first )?(?:lines|text))\b/i;
const OTHER = { hindu: /hindu|bhagavad|gita|upanishad|veda|krishna/i, buddhist: /buddh|dhammapada|sutta|pali/i, christian: /\bbible\b|gospel|\bking james\b|new testament/i, jewish: /torah|talmud|tanakh|hebrew bible/i, islam: /qur.?[aá]n|hadith|bihar al|sahih/i };
// turn checks: cite (regex over citation/source titles), arabic, table, absentOk, forbid (keys of OTHER over titles + text links), text (regex), notText
export const CONVS = [
  { id: 'kawthar-explicit', turns: [
    { q: "show me the first paragraph of tafsir-i-surata'l-Kawthar (the original arabic tablet) and show me a side-by-side translation from the provisional translation or whatever you have", cite: /kawthar/i, arabic: true, table: true, forbid: ['hindu', 'buddhist', 'christian', 'jewish'], notText: /Lo! We have given thee Abundance/ },
    { q: 'what is the Báb saying in that first paragraph?', cite: /kawthar/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] },
    { q: 'and the next paragraph?', cite: /kawthar/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'kawthar-followup', turns: [
    { q: "Do you have the Báb's commentary on the Surah of Kawthar?", cite: /kawthar/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] },
    { q: 'yes, I wonder if you can give me the first couple paragraphs with side-by-side translation', cite: /kawthar/i, arabic: true, table: true, forbid: ['hindu', 'buddhist', 'christian', 'jewish'], notText: /Lo! We have given thee Abundance/ },
    { q: 'who translated it?', text: /phelps|provisional/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'remover', turns: [
    { q: 'Give me the Remover of Difficulties prayer', text: /Is there any Remover of difficulties save God/i },
    { q: 'show it to me in the original Arabic beside the English', arabic: true, table: true, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'ahmad-sbs', turns: [
    { q: 'Make me a side-by-side of the Arabic Tablet of Aḥmad with the authorized English translation, first few verses', arabic: true, table: true, cite: /ahmad|aḥmad|prayers/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'hidden-words-open', turns: [
    { q: 'Show me the first three Arabic Hidden Words in Arabic with the English beside them', arabic: true, table: true, cite: /hidden words/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish', 'islam'] } ] },
  { id: 'dawnbreakers', turns: [
    { q: 'Who wrote The Dawn-Breakers?', cite: /dawn.?breakers/i, text: /nab[ií]l/i },
    { q: 'give me the opening paragraph of chapter one', cite: /dawn.?breakers/i, text: /shaykh a[hḥ]mad/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] },
    { q: 'summarize that chapter for me in five bullet points', cite: /dawn.?breakers/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'compilation-justice', turns: [
    { q: "Make me a short compilation of passages on justice from Bahá'u'lláh's writings, with references", cite: /hidden words|gleanings|tablets|aqdas|epistle|summons/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish', 'islam'] },
    { q: 'add two from Abdu\'l-Bahá', cite: /abdu|selections|promulgation|paris talks|some answered/i, forbid: ['hindu', 'buddhist', 'christian', 'jewish', 'islam'] } ] },
  { id: 'compare-return', turns: [
    { q: 'Compare what the Kitáb-i-Íqán and the Gospel of Matthew say about the return of Christ', cite: /[ií]q[aá]n|certitude/i, text: /matthew/i } ] },
  { id: 'timeline-bab', turns: [
    { q: 'Give me a timeline of the Báb\'s life with sources', text: /1819/, forbid: ['hindu', 'buddhist'] },
    { q: 'expand on the year 1848', text: /badasht|chihr[ií]q|tabriz|1848/i, forbid: ['hindu', 'buddhist'] } ] },
  { id: 'study-guide-seven-valleys', turns: [
    { q: 'Create a study guide for the Valley of Search in The Seven Valleys, with the key passages and discussion questions', cite: /seven valleys|call of the divine beloved/i, text: /\?/, forbid: ['hindu', 'buddhist', 'christian', 'jewish'] } ] },
  { id: 'tahirih', turns: [
    { q: 'Who was Ṭáhirih?', text: /badasht|qurratu|poet/i },
    { q: 'what happened at Badasht?', text: /veil|unveil|badasht/i, forbid: ['hindu', 'buddhist'] },
    { q: 'what did Shoghi Effendi write about her?', cite: /god passes by|shoghi|advent|world order/i, forbid: ['hindu', 'buddhist'] } ] },
];

export function checkTurn(t, r, named) {
  const f = baseCheck({ cite: t.cite, text: t.text }, r).filter((x) => !/no expected citation/.test(x) || t.cite);
  const titles = [...(r.citations || []), ...(r.sources || [])].map((x) => `${x.title ?? ''} ${x.author ?? ''} ${x.religion ?? ''}`).join(' | ');
  if (t.arabic && !ARABIC.test(r.text)) f.push('no original (Arabic) text');
  if (t.table && !/^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(r.text)) f.push('no side-by-side table');
  if (!t.absentOk && ABSENT.test(r.text)) f.push(`claims absence: "${r.text.match(ABSENT)[0]}"`);
  if (t.notText?.test(r.text)) f.push(`wrong text: ${t.notText}`);
  for (const k of t.forbid || []) if (!named.test(k) && (OTHER[k].test(titles) || OTHER[k].test((r.text.match(/\]\([^)]+\)/g) || []).join(' ')))) f.push(`drifted into ${k} sources`);
  return f;
}

async function runConv(c) {
  const uid = `user_${crypto.randomUUID()}`, messages = [], out = []; let cid = null, asked = '';
  for (const t of c.turns) {
    asked += ` ${t.q}`;
    const named = { test: (k) => OTHER[k].test(asked) };   // a tradition the reader named is not drift
    const r = await send(t.q, messages, uid, cid); cid = r.cid;
    messages.push({ role: 'user', content: t.q }, { role: 'assistant', content: r.text });
    const fails = isCapReply(r) ? ['SKIP: spend cap'] : checkTurn(t, r, named);
    out.push({ q: t.q, ms: r.ms, fails, text: r.text, cites: [...(r.citations || []), ...(r.sources || [])].map((x) => x.title).slice(0, 8), cid });
  }
  return { id: c.id, turns: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = arg('only')?.split(','), conc = Number(arg('concurrency') || 2);
  const todo = CONVS.filter((c) => !only || only.includes(c.id)), res = [];
  let i = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < todo.length) { const c = todo[i++]; res.push(await runConv(c)); } }));
  res.sort((a, b) => CONVS.findIndex((c) => c.id === a.id) - CONVS.findIndex((c) => c.id === b.id));
  let pass = 0, n = 0;
  for (const c of res) for (const [k, t] of c.turns.entries()) { n++; if (!t.fails.length) pass++; console.log(`${t.fails.length ? '✗' : '✓'} ${c.id}#${k + 1} ${(t.ms / 1000).toFixed(1)}s ${t.q.slice(0, 60)}${t.fails.length ? `\n    ${t.fails.join('\n    ')}` : ''}`); }
  console.log(`\n${pass}/${n} turns pass`);
  mkdirSync('tests/quality/reports', { recursive: true });
  const f = `tests/quality/reports/anis-requests-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`;
  writeFileSync(f, JSON.stringify(res, null, 1)); console.log(f);
}
