// Sequential coreference READER (DeepSeek v4-pro). Reads a document paragraph-by-paragraph in reading
// order (content.paragraph_index), in overlapping windows, carrying a running CAST so that a reference
// in a later window resolves against every person established earlier. Captures EVERY person-reference —
// name, title, epithet, role, kinship, pronoun — never skipping. DeepSeek reads + resolves coreference;
// a later Anthropic/Claude pass verifies each resolution and reconciles the cast labels to DB entity ids.
// Output: per-window JSON in tmp/entity-research/seqread/ + a running cast.json. Resumable (skips windows
// already written). Usage: node seq-read.mjs <docId> <startIdx> <endIdx> [windowSize=45] [castReset=0]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');

const KEY = process.env.DEEPSEEK_API_KEY;
const DOC = Number(process.argv[2] || 21308);
const START = Number(process.argv[3] ?? 0);
const END = Number(process.argv[4] ?? 9_999_999);
const WIN = Number(process.argv[5] || 45);
const CAST_RESET = process.argv[6] === '1';
const OUT = 'tmp/entity-research/seqread';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const CASTFILE = `${OUT}/cast.json`;

const SYS = `You read a historical narrative paragraph-by-paragraph to capture EVERY reference to a PERSON. Completeness is mandatory — never skip a reference. Capture every form a person is referred to by: full or partial name, title, honorific, epithet, descriptive phrase, role ("the prince", "the governor", "the mujtahid"), kinship ("his nephew", "her sister"), and pronoun ("he", "she", "they") whenever it points to a specific identifiable person. Resolve coreference from the full context: bind every pronoun, epithet and role to the actual person meant — e.g. "the siyyid who had deserted the fort" must resolve to whoever deserted it earlier in the text or cast. Keep ONE stable label per distinct person and reuse it everywhere. Distinguish people who share a name or title BY CONTEXT — never merge two different people, never split one person. You are given a running CAST established earlier in the book (labels + descriptions + every alias seen); reuse those labels for returning people and ADD any new surface forms. Output STRICT JSON ONLY, no prose, no markdown:
{"cast":[{"label":"stable unique label","description":"who they are + distinguishing facts established so far (nisba, side, role, kin, fate)","aliases":["every surface form used for them"]}],"mentions":[{"para":<paragraph_index int>,"span":"exact substring referring to the person","label":"matching cast label","type":"name|title|epithet|role|kinship|pronoun","reason":"why this refers to that person"}]}
Include cast entries for every person referenced in this window (new or carried). Every paragraph that refers to any person MUST yield mentions; do not omit pronouns or epithets.`;

const buildUser = (cast, paras) =>
  `RUNNING CAST (people already established earlier in the book — reuse these labels):\n${JSON.stringify(cast)}\n\nPARAGRAPHS (format "<paragraph_index> ⟶ <text>"). Capture every person-reference in every paragraph:\n` +
  paras.map(p => `${p.paragraph_index} ⟶ ${p.text.replace(/\s+/g, ' ').trim()}`).join('\n');

const MODEL = process.env.SEQ_MODEL || 'deepseek-chat';   // deepseek-chat = v4-flash NON-thinking (clean JSON; v4-pro/flash reasoning starves content)
async function callDeepSeek(messages) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0, max_tokens: 32000, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) { console.log('  !! HTTP', res.status, (await res.text()).slice(0, 200)); return ''; }
  const j = await res.json();
  const ch = j.choices?.[0];
  const c = ch?.message?.content || '';
  if (!c) console.log(`  .. empty content (finish=${ch?.finish_reason}, reasoning=${(ch?.message?.reasoning_content || '').length}c)`);
  return c;
}

const paras = await queryAll(
  "SELECT paragraph_index, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND paragraph_index BETWEEN ? AND ? AND text NOT LIKE '![%' AND length(trim(text))>0 ORDER BY paragraph_index",
  [DOC, START, END]
);
console.log(`paras: ${paras.length} (idx ${paras[0]?.paragraph_index}–${paras[paras.length - 1]?.paragraph_index}), windows of ${WIN}`);

// Carry only the last K windows of cast (bounded prompt; global identity is the reconciler's job, not the reader's).
const K = Number(process.env.SEQ_CAST_WINDOWS || 2);
const dedupCast = arr => { const m = new Map(); for (const c of arr) { const e = m.get(c.label); if (e) { e.aliases = [...new Set([...(e.aliases || []), ...(c.aliases || [])])]; } else m.set(c.label, { ...c }); } return [...m.values()]; };
let history = [];        // per-window emitted casts, in order (for building the rolling carried cast)
let totalMentions = 0;
for (let i = 0; i < paras.length; i += WIN) {
  const win = paras.slice(i, i + WIN);
  const a = win[0].paragraph_index, b = win[win.length - 1].paragraph_index;
  const wf = `${OUT}/${DOC}-${String(a).padStart(5, '0')}-${String(b).padStart(5, '0')}.json`;
  if (existsSync(wf)) { try { history.push(JSON.parse(readFileSync(wf, 'utf8')).windowCast || []); } catch {} console.log(`  window ${a}-${b}: cached`); continue; }
  const carried = dedupCast(history.slice(-K).flat());
  let parsed = null, raw = '';
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    raw = await callDeepSeek([{ role: 'system', content: SYS }, { role: 'user', content: buildUser(carried, win) }]);
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()); } catch { /* retry */ }
  }
  if (!parsed) { console.log(`  !! window ${a}-${b}: JSON parse failed after retries (raw ${raw.length} chars)`); history.push([]); continue; }
  const windowCast = parsed.cast || [];
  writeFileSync(wf, JSON.stringify({ range: [a, b], mentions: parsed.mentions || [], windowCast }, null, 1));
  history.push(windowCast);
  totalMentions += (parsed.mentions || []).length;
  console.log(`  window ${a}-${b}: ${(parsed.mentions || []).length} mentions, carried ${carried.length}`);
}
console.log(`done: ${totalMentions} mentions this run`);
process.exit(0);
