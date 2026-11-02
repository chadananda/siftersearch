// Classifies every test question (registry, Immerse feed, conversation-run turns with thread) into Anís request types
// (question-types.json): lead strategy + other strategies the answer also needs. Haiku 5.5, ~$0.3. Env: ANTHROPIC_API_KEY.
// Out: planning/anis-question-types-20261102.json (items + counts). Args: --limit N (sample), --immerse <path>.
import fs from 'node:fs';
import path from 'node:path';
import { DIR, loadQuestions } from './registry.mjs';

const ROOT = path.resolve(DIR, '../../..');
const OUT = path.join(ROOT, 'planning/anis-question-types-20261102.json');
const MODEL = 'claude-haiku-5-5';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LIMIT = Number(arg('--limit')) || Infinity;
const IMMERSE = arg('--immerse');
const { types } = JSON.parse(fs.readFileSync(path.join(DIR, 'question-types.json'), 'utf8'));
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n);

const items = [], seen = new Set();
const add = (source, text, thread = []) => {
  const key = `${text}|${thread.map((m) => m.content).join('|')}`;
  if (!text || seen.has(key)) return;
  seen.add(key); items.push({ source, text: clip(text, 400), thread });
};
for (const q of loadQuestions()) {
  if (q.wordings?.length) for (const w of q.wordings) {
    const m = w.messages || [{ role: 'user', content: w.text }];
    add(`registry:${q.origin}`, m.at(-1).content, m.slice(0, -1).map((x) => ({ role: x.role, content: clip(x.content, 300) })));
  } else add(`registry:${q.origin}`, q.text);
}
if (IMMERSE) for (const r of JSON.parse(fs.readFileSync(IMMERSE, 'utf8'))) add('immerse', r.question);
const REP = path.join(DIR, '../reports');
for (const f of fs.readdirSync(REP).filter((x) => x.startsWith('anis-conversations-') && x.endsWith('.json'))) {
  for (const c of JSON.parse(fs.readFileSync(path.join(REP, f), 'utf8')).results || []) {
    const hist = [];
    for (const t of c.turns || []) {
      add('conversation', t.user, hist.slice(-4));
      hist.push({ role: 'user', content: clip(t.user, 300) }, { role: 'assistant', content: clip(t.reply, 300) });
    }
  }
}

const TYPES = Object.entries(types).map(([k, v]) => `${k}: ${v}`).join('\n');
const PROMPT = (batch) => `You route messages sent to Anís, a research assistant over a library of religious scripture and commentary (all world religions, deepest on the Bahá'í Faith).
Each message needs one or more research strategies, one per request type:
${TYPES}

For each message give:
- lead: the type whose strategy drives the answer
- also: other types whose strategies must also run and be combined into the answer (often empty; e.g. "Bahá'í and Buddhist view of death, with quotes" = lead C1, also [A3]; "is this quote real and what does it mean" = lead A4, also [B2])
- a G type is lead only when the message depends on the thread shown; a message that stands alone is never G even if it looks like a follow-up
- new: if no type fits well, a short name for a new type, else null
Messages (thread shown before the message where there is one):
${batch.map((it, i) => `#${i}${it.thread.length ? ` [thread: ${it.thread.map((m) => `${m.role}: ${m.content}`).join(' | ')}]` : ''}\n${it.text}`).join('\n')}

Return ONLY JSON: {"r":[{"i":0,"lead":"B1","also":[],"new":null},...]} with one entry per message.`;

async function ask(batch, tries = 3) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content: PROMPT(batch) }] }) });
  const j = await r.json();
  const t = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  try { return { r: JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).r, usage: j.usage }; }
  catch { if (tries > 1) return ask(batch, tries - 1); return { r: [], usage: j.usage, err: j.error?.message || `unparseable (${j.stop_reason}): ${t.slice(0, 120)}` }; }
}

// --retry: keep the prior run's labels, reclassify only what it left unlabelled, in smaller batches
const RETRY = process.argv.includes('--retry');
if (RETRY) { const prior = new Map(JSON.parse(fs.readFileSync(OUT, 'utf8')).items.map((it) => [`${it.text}|${it.thread.map((m) => m.content).join('|')}`, it]));
  for (const it of items) { const p = prior.get(`${it.text}|${it.thread.map((m) => m.content).join('|')}`); if (p?.lead) Object.assign(it, { lead: p.lead, also: p.also, new: p.new }); } }
const all = items.slice(0, LIMIT), todo = RETRY ? all.filter((it) => !it.lead) : all, B = RETRY ? 10 : 40;
let tin = 0, tout = 0, done = 0;
const batches = [];
for (let i = 0; i < todo.length; i += B) batches.push(todo.slice(i, i + B));
const pool = async () => { for (let b; (b = batches.shift());) {
  const { r, usage, err } = await ask(b);
  if (err) console.error('batch failed:', err);
  tin += usage?.input_tokens || 0; tout += usage?.output_tokens || 0;
  for (const x of r || []) if (b[x.i]) Object.assign(b[x.i], { lead: x.lead, also: (x.also || []).filter((a) => a !== x.lead), new: x.new || null });
  done += b.length; process.stdout.write(`\r${done}/${todo.length}`);
} };
await Promise.all(Array.from({ length: 6 }, pool));

const count = (f) => all.reduce((m, it) => { for (const k of [f(it)].flat().filter(Boolean)) m[k] = (m[k] || 0) + 1; return m; }, {});
const sources = [...new Set(all.map((it) => it.source))];
const summary = {
  model: MODEL, items: all.length, unclassified: all.filter((it) => !it.lead).length,
  cost_usd: +((tin * 0.1 + tout * 0.5) / 1e6).toFixed(3),
  lead: count((it) => it.lead), also: count((it) => it.also),
  multi: all.filter((it) => it.also?.length).length,
  combos: count((it) => (it.also?.length ? `${it.lead}+${[...it.also].sort().join('+')}` : null)),
  new_types: count((it) => it.new),
  by_source: Object.fromEntries(sources.map((s) => [s, Object.fromEntries(Object.entries(count((it) => (it.source === s ? it.lead : null))).sort((a, b) => b[1] - a[1]))])),
};
fs.writeFileSync(OUT, JSON.stringify({ summary, items: all }, null, 0) + '\n');
console.log('\n' + JSON.stringify({ ...summary, by_source: undefined, combos: Object.entries(summary.combos).sort((a, b) => b[1] - a[1]).slice(0, 25) }, null, 1));
