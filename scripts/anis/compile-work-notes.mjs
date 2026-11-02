// Compile api/lib/assistant/work-notes.json: per core work, the library's best SOURCED passages about its significance,
// purpose, station and impression (Chad 11-01: "always pull something interesting to share that is backed by a source").
// Public search API (no DB) → passages that NAME the work → Haiku picks exact spans → each span verified verbatim.
// Usage: node scripts/anis/compile-work-notes.mjs [--only "God Passes By"] [--dry]   (env: TEST_API_KEY, ANTHROPIC_API_KEY)
import fs from 'node:fs';
import { CANON } from '../../api/lib/assistant/work-canon.js';

const API = process.env.SIFTER_API || 'http://tower-nas:7839';
const OUT = new URL('../../api/lib/assistant/work-notes.json', import.meta.url);
const MODEL = 'claude-haiku-4-5-20251001';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
const CENTRAL = /bah[aá].?u.?ll[aá]h|abdu.?l.?bah[aá]|\bthe b[aá]b\b|shoghi effendi|universal house of justice/i;
// a source's weight (feedback_citation_source_order): own published work > published compilation > last-resort letters > secondary
const LAST_RESORT = /uncompiled published letters/i;
const COMPILATION = /lights of guidance|directives from the guardian|dawn of a new day|light of divine guidance|unfolding destiny|arohanui|dear co-?worker|messages to|letters from the guardian|high endeavours|compilation/i;
// a central figure's words inside someone else's book (a pilgrim's notes, a compiler's deepening) are second-hand: tier 2
const own = (n) => fold(n.source_author).includes(fold(n.speaker).replace(/^the /, ''));
export const tier = (n) => (LAST_RESORT.test(n.source_title) ? 4 : !CENTRAL.test(n.speaker || '') ? 3 : COMPILATION.test(n.source_title) || !own(n) ? 2 : 1);
// the work named AS A TITLE: capitalised as written ("the advent of divine justice" in the Báb's text is not the book)
const caseFold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`ʻʼ]/g, "'").replace(/[^A-Za-z0-9']+/g, ' ').trim();
export const namesTitle = (text, names) => names.some((a) => caseFold(text).includes(caseFold(a).replace(/^The /, '')));

async function search(query, filters = {}) {
  const r = await fetch(`${API}/api/v1/search`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Sifter-Test': '1', 'X-API-Key': process.env.TEST_API_KEY },
    body: JSON.stringify({ query, analyze: false, phraseBoost: true, limit: 40, filters }), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  return j.hits || j.results || [];
}

async function candidates(work) {
  const names = [work.title, ...(work.aliases || [])];
  const named = (t) => namesTitle(t, names);
  const own = (h) => names.some((a) => fold(h.title).includes(fold(a)));   // the work's own text (or a copy of it) is not ABOUT it
  const out = new Map();
  for (const q of names.slice(0, 3)) for (const f of [{ author: 'Shoghi Effendi' }, {}]) {
    for (const h of await search(q, f)) {
      if (!h.text || out.has(h.id) || own(h) || !named(h.text) || h.text.length < 80) continue;
      out.set(h.id, { id: h.id, text: h.text.slice(0, 1400), source_title: h.title, source_author: h.author, url: h.url || h.readerUrl, source_url: h.documentUrl || null });
    }
  }
  return [...out.values()].slice(0, 45);
}

const PROMPT = (work, rows) => `You are compiling, for a library assistant, the most interesting SOURCED statements about the book "${work.title}"${work.author ? ` by ${work.author}` : ''}: its significance, purpose, station, importance, or the impression it made on readers.

Passages from the library (each names the book):
${rows.map((r, i) => `[${i}] source: "${r.source_title}" (listed author: ${r.source_author || 'unknown'})\n${r.text}`).join('\n\n')}

Pick up to 6 of the best statements ABOUT the book \"${work.title}\" itself — the named work (not quotations FROM it, not a phrase that merely shares its words, not catalogue notes, not translation logistics, not permissions, not page references).
Prefer the words of Bahá'u'lláh, 'Abdu'l-Bahá, the Báb, Shoghi Effendi or the Universal House of Justice; prefer vivid, quotable lines.
For each, return:
- n: the passage number
- quote: an EXACT contiguous span copied character-for-character from that passage, 12–70 words, that is itself the statement about the book
- speaker: whose words the span is — the listed author ONLY if the span is plainly their own words; if the passage attributes the words to someone else, that person; if unclear, null.
  Editors' and translators' introductions, prefaces, headnotes and footnotes are NOT the listed author's words: for those speaker is null.
  Never name Bahá'u'lláh, the Báb, 'Abdu'l-Bahá or Shoghi Effendi as speaker unless the span is certainly their own text.
- angle: one of significance | purpose | station | impression | history
Return ONLY JSON: {"picks":[{"n":0,"quote":"…","speaker":"…","angle":"…"}]}. If none qualify, {"picks":[]}.`;

async function pick(work, rows) {
  if (!rows.length) return { picks: [], usage: null };
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: PROMPT(work, rows) }] }) });
  const j = await r.json();
  const text = j.content?.[0]?.text || '';
  try { return { picks: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).picks || [], usage: j.usage }; }
  catch { return { picks: [], usage: j.usage }; }
}

// the span must be in the passage, word for word (after accent/punctuation folding) — anything else is dropped
export function verified(p, rows) {
  const row = rows[p.n];
  if (!row || !p.quote || fold(p.quote).split(' ').length < 8) return null;
  if (!fold(row.text).includes(fold(p.quote))) return null;
  const n = { quote: p.quote.trim(), speaker: p.speaker || null, angle: p.angle || null, source_title: row.source_title, source_author: row.source_author, url: row.url, source_url: row.source_url };
  return { ...n, tier: tier(n) };
}

async function main() {
  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { works: [] };
  const byTitle = new Map(prior.works.map((w) => [w.title, w]));
  let tin = 0, tout = 0;
  for (const work of CANON) {
    if (only && work.title !== only) continue;
    const rows = await candidates(work);
    const { picks, usage } = await pick(work, rows);
    tin += usage?.input_tokens || 0; tout += usage?.output_tokens || 0;
    const seen = new Set();
    const notes = picks.map((p) => verified(p, rows)).filter((n) => n && !seen.has(fold(n.quote)) && seen.add(fold(n.quote)))
      .sort((a, b) => a.tier - b.tier);
    console.log(`${work.title}: ${rows.length} passages → ${picks.length} picked → ${notes.length} verified`);
    byTitle.set(work.title, { title: work.title, notes });
  }
  const cost = (tin * 1 + tout * 5) / 1e6;
  console.log(`tokens in ${tin} out ${tout} ≈ $${cost.toFixed(3)}`);
  if (process.argv.includes('--dry')) return;
  const works = CANON.map((w) => byTitle.get(w.title)).filter(Boolean);
  fs.writeFileSync(OUT, JSON.stringify({ compiled: new Date().toISOString().slice(0, 10), model: MODEL, works }, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
