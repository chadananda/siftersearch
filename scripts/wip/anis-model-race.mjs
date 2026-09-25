// Race models on the Anis crafter over REAL passages (prod zero-LLM search). Lean Anis prompt for every model,
// plus "jafar:" = the 12k-token Jafar crafter on gpt-4o (today's baseline). Measures first-token + total latency
// and the hard rule: no links outside the retrieved sources. Groq calls are spaced for the free-tier TPM limit.
// Run from repo root: node scripts/wip/anis-model-race.mjs [spec,spec,...]
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { craftAnswerStream } = await import('../../api/lib/jafar-pipeline.js');
const { anisCraft } = await import('../../api/lib/anis/craft.js');
const { parseLlm } = await import('../../api/lib/anis/respond.js');

const MODELS = (process.argv[2] || 'jafar:openai:gpt-4o,openai:gpt-4o,openai:gpt-4o-mini,deepseek:deepseek-v4-flash,groq:openai/gpt-oss-120b:low,groq:openai/gpt-oss-20b:low').split(',');
// Quote fidelity (api/lib/anis/quotes.js): a quoted span of ≥5 words must appear in a retrieved passage.
const { quoteSpans, unverifiedQuotes } = await import('../../api/lib/anis/quotes.js');
const fidelity = (text, retrieved) => { const n = quoteSpans(text).length; return { quotes: n, verified: n - unverifiedQuotes(text, retrieved).length }; };
const QUESTIONS = [
  'What does Bahá’u’lláh say about justice?',
  'What did Bahá’u’lláh say about the earth being one country?',
  'When was the Báb martyred?',
  'I lost my mother last month. What do the Writings say about the soul after death?',
];
const KEY = process.env.PUBLIC_SIFTER_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function passages(q) {
  const r = await fetch('https://api.siftersearch.com/api/v1/search', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY }, body: JSON.stringify({ query: q, limit: 8, analyze: false }) });
  const d = await r.json();
  return (d.results || []).map((h) => ({ text: h.text || '', source_title: h.title || '', source_author: h.author || '',
    citation_url: h.url || null, doc_id: h.documentId, paragraph_index: h.paragraphIndex, religion: h.religion }));
}

const rows = [];
for (const q of QUESTIONS) {
  const retrieved = await passages(q);
  const allowed = new Set(retrieved.map((p) => p.citation_url).filter(Boolean));
  for (const spec of MODELS) {
    const jafar = spec.startsWith('jafar:');
    const llm = parseLlm(jafar ? spec.slice(6) : spec);
    if (llm.provider === 'groq') await sleep(25000);
    const t0 = Date.now(); let first = null;
    const onChunk = () => { if (first === null) first = Date.now() - t0; };
    const args = { user_question: q, retrieved_quotes: retrieved, conversation_summary: '', persona_name: 'Anis', llm, onChunk };
    try {
      const out = await Promise.race([jafar ? craftAnswerStream(args) : anisCraft(args), sleep(45000).then(() => { throw new Error('45s timeout'); })]);
      const links = [...out.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]);
      const bad = links.filter((u) => !allowed.has(u));
      const f = fidelity(out, retrieved);
      rows.push({ q: q.slice(0, 28), model: spec, first_ms: first, total_ms: Date.now() - t0, words: out.split(/\s+/).length, links: links.length, bad_links: bad.length, quotes: f.quotes, fake_quotes: f.quotes - f.verified });
      if (f.quotes - f.verified) console.log(`\n--- FAKE QUOTE ${spec} | ${q}\n${out.slice(0, 600)}`);
    } catch (e) { rows.push({ q: q.slice(0, 28), model: spec, error: e.message.slice(0, 90) }); }
  }
}
console.table(rows);
const by = {};
for (const r of rows.filter((x) => !x.error)) (by[r.model] ||= []).push(r);
for (const [m, rs] of Object.entries(by)) {
  const med = (k) => rs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
  const sum = (k) => rs.reduce((s, r) => s + r[k], 0);
  console.log(`${m.padEnd(34)} n=${rs.length} first p50 ${med('first_ms')}ms  total p50 ${med('total_ms')}ms  words p50 ${med('words')}  bad links ${sum('bad_links')}/${sum('links')}  FAKE QUOTES ${sum('fake_quotes')}/${sum('quotes')}`);
}
process.exit(0);
