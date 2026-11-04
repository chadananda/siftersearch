// THE AGENT (Chad 11-01: "start with using haiku + tools to answer everything … it hallucinates constantly instead of using
// its library"). One model loop that researches AND writes — no brief handed to a second writer — over the library tools
// (researcher.js toolRunner over the tools.js registry) plus work_notes_lookup (work-notes.json: sourced lines on a core work's importance). Grounding is code's
// job: the model cites only the refs its tools gave it ([[P3]] a passage, [[B1]] a book); renderRefs turns them into links and
// drops any it was not given, and the quote gate removes a sentence quoting words no passage holds. Deps injectable (tests).
import { toolRunner, libraryTools, TOOL_CHARS } from './researcher.js';
import { llmTools, canonical, canonWork, run as runTool } from './tools.js';
import { dropUnverified, fixQuoteSpeakers, linkQuotes } from './quotes.js';
import { dropPreamble } from './work-request.js';
import { agentSearch } from './agent-search.js';

const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

// the agent's tools, by canonical name (tools.js registry): its search is fused_search (no planner), never combined_search under another name
export const AGENT_TOOL_NAMES = ['fused_search', 'originals_search', 'context_lookup', 'original_lookup', 'translation_lookup', 'rendering_lookup', 'source_trace', 'quotation_trace', 'document_search', 'work_notes_lookup', 'web_search'];
export const AGENT_TOOLS = llmTools(AGENT_TOOL_NAMES);
export { canonWork };

export const AGENT_SYSTEM = `You are Anís, a study companion in a library of the world's sacred texts (above all the Bahá'í Writings, with their originals, history and scholarship). You answer readers in chat.

ANSWER LIKE A SCHOLAR WHO KNOWS THE FIELD AND CHECKS EVERYTHING. Use what you know to decide what the answer is and where the texts say it — then find those texts with the tools and quote them. Every statement about a text, person, event, date, number or teaching carries the ref of a passage that supports it; a claim you cannot find support for is left out or plainly marked as unconfirmed in the library. Never present memory as a source.

RESEARCH BEFORE WRITING. Your first round should launch several searches at once from different angles (the obvious primary source, Shoghi Effendi's account, the key term, the person's name with the event). Read the results; if the best source is still missing, search again with the words that source would use, or context_lookup the strongest passage. Stop when you hold the passages a well-read Bahá'í scholar would cite — not before.

TOOLS — use them before answering; call several at once when they are independent:
- document_search: whenever a book, tablet or work is named or asked for. It returns [B#] — the library's own copy. Always give it.
- work_notes_lookup: sourced lines on a core work's importance — use beside document_search when the reader asks for or about a book.
- fused_search: passages. Phrase the query in the words the texts would use; put an author or work name in the query to narrow it. Try another wording before concluding anything is missing.
- SOURCE QUESTIONS (a reader gives a quotation, or asks where words come from, who said them, whether they are authentic): call quotation_trace first, with fused_search on the distinctive phrase in parallel. EXACT quotation (or the reader asks for the original/tablet/Persian/Arabic): answer with the source linked, the original when found, and works that quote it. INEXACT ask (keywords, a paraphrase, "the X quote"): give the MAIN source quoted and linked plus 1–2 similar passages from fused_search, and NO original-language text, Phelps Inventory or tablet detail unless asked; if no published source holds the words, say so plainly — never attribute from memory.
- context_lookup, quotation_trace (where a quotation comes from), original_lookup, translation_lookup, rendering_lookup, source_trace (a letter or scholar stating a teaching → the primary passages), web_search (last resort; label it as from the web, never as scripture).

WRITING:
- The first sentence gives the obvious answer plainly (who/what/where), as a reader would expect from a knowledgeable friend. No preamble, no "Great question", no "Let me", no "I found", no "Based on the library".
- Length follows the question: a short question gets 1–3 sentences; a request for a book gets its link and one or two sourced lines on it; a study question gets an organised answer with several quoted passages and one insight the reader would not have found alone (a connection, the original word, how the Writings frame it).
- Cite with refs: put [[P3]] right after the words that come from passage P3; write a book's name as [[B1]] (code turns it into the linked title). Never write a URL. Never use a ref you were not given.
- Quotation marks only around words copied exactly from a passage. Credit a quotation to the passage's writer (a letter written on behalf of Shoghi Effendi is not his own words; an editor's introduction is not the author's).
- Prefer, in order: the Writings of Bahá'u'lláh, the Báb and 'Abdu'l-Bahá; Shoghi Effendi; then compilations; "Uncompiled Published Letters" only when nothing else holds the words. Doctrine rests on the Writings and Shoghi Effendi; the Universal House of Justice speaks with authority on law and administration.
- Readings in the community's sense: "the House" = the Universal House of Justice, "the Master" = 'Abdu'l-Bahá, "the Guardian" = Shoghi Effendi, "the Blessed Beauty" = Bahá'u'lláh, "the Most Holy Book" = the Kitáb-i-Aqdas, "the Nine Year Plan" = 2022–2031.
- When the library does not hold what was asked, say so in one sentence and give what it does hold that helps, with refs. Never fill a gap from memory.
- Never send the reader to another website or catalogue for something the library holds.
- End, if useful, with one short offer to go further. No summary, no remarks about your sources or tools.`;

/** [[P3]] / [[P3, P5]] / [[B1]] (single brackets too) → links from what the tools returned; any other ref is dropped. Pure. */
export function renderRefs(text, { found, works }) {
  return String(text || '')
    .replace(/\(\s*(\[\[?[PW]\d+(?:\s*[,;]\s*[PW]\d+)*\]\]?)\s*\)/g, '$1')   // "([[P1]])" → one pair of parens
    .replace(/\*{0,2}\[\[?(B\d+)\]\]?\*{0,2}(?!\()/g, (m, r) => { const w = works.get(r); return w ? `[*${w.title}*](${w.url})` : ''; })
    .replace(/\s*\[\[?((?:[PW]\d+)(?:\s*[,;]\s*[PW]\d+)*)\]\]?(?!\()/g, (m, list) => {
      const seen = new Set();
      const links = list.split(/\s*[,;]\s*/).map((r) => found.get(r)).filter((p) => p?.source_url && !seen.has(p.source_url) && seen.add(p.source_url))
        .map((p) => `[${p.web ? 'web: ' : ''}${clip(p.title || 'source', 70)}](${p.source_url})`);
      return links.length ? ` (${links.join('; ')})` : '';
    })
    .replace(/[ \t]+([.,;:!?])/g, '$1');
}

const STATUS = { fused_search: (a) => `Searching the library: ${clip(a.query, 60)}`, combined_search: (a) => `Searching the library: ${clip(a.query, 60)}`, document_search: (a) => `Finding ${clip(a.title, 60)}`,
  work_notes_lookup: (a) => `What the sources say about ${clip(a.title, 50)}`, context_lookup: () => 'Reading around a passage', quotation_trace: () => 'Tracing a quotation',
  original_lookup: () => 'Finding the original', translation_lookup: () => 'Finding a translation', rendering_lookup: (a) => `Word study: ${clip(a.word, 40)}`,
  source_trace: () => 'Tracing to the primary texts', web_search: () => 'Searching the web' };

/**
 * One turn: → { reply, retrieved, citations, steps, usage, timings }. create = OpenAI-compatible chat (roleCreate('anis-agent')).
 * impl = libraryTools({ search }) (+ notes for work_notes_lookup, tests).
 */
export async function agentAnswer({ messages, create, tools: impl, onEvent = () => {}, maxRounds = 8, maxCalls = 24 }) {
  const t0 = Date.now();
  const { found, works, add, show, run } = toolRunner(impl, { search: 'fused_search' });
  run.work_notes_lookup = async ({ title }) => {
    const { work, notes } = await runTool('work_notes_lookup', { title }, { notes: impl.notes });
    if (!work) return `no compiled notes for "${title}" — fused_search for passages that name it`;
    if (!notes.length) return `no compiled notes for ${work} — fused_search for passages that name it`;
    return show(notes.slice(0, 5).map((n, i) => add({ id: `note:${work}:${i}`, text: n.quote, title: n.source_title,
      author: n.speaker || n.source_author, source_url: n.url, religion: "Baha'i" })), 600);
  };
  const convo = messages.slice(-9).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 3000) }));
  const msgs = [{ role: 'system', content: AGENT_SYSTEM }, ...convo];
  const steps = [], usage = { in: 0, out: 0 };
  let calls = 0, final = '', firstToolMs = null;
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1 || calls >= maxCalls;
    const r = await create({ messages: msgs, ...(last ? {} : { tools: AGENT_TOOLS, tool_choice: 'auto' }), max_tokens: 3000 });
    usage.in += r?.usage?.prompt_tokens || 0; usage.out += r?.usage?.completion_tokens || 0;
    const m = r?.choices?.[0]?.message || {};
    const tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) { final = String(m.content || ''); break; }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs });
    firstToolMs ??= Date.now() - t0;
    // independent calls run together; results go back in the order asked
    const outs = await Promise.all(tcs.map(async (tc) => {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
      const name = tc.function?.name, fn = run[canonical(name)];
      onEvent({ type: 'status', text: STATUS[canonical(name)]?.(args) || name });
      const s0 = Date.now();
      const out = fn ? await fn(args).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`) : 'unknown tool';
      steps.push({ tool: name, args, found: (String(out).match(/^\[[PWB]\d+\]/gm) || []).length, ms: Date.now() - s0 });
      return { tc, out };
    }));
    calls += tcs.length;
    for (const { tc, out } of outs) msgs.push({ role: 'tool', tool_call_id: tc.id, content: clip(out, TOOL_CHARS) });
  }
  // code does the grounding: refs → links, unverifiable quotations out, speakers fixed, quotations linked, no preamble
  const retrieved = [...found.values()].map((p) => ({ ...p, citation_url: p.source_url, source_title: p.title, source_author: p.author, doc_id: p.document_id }));
  const rendered = renderRefs(final, { found, works });
  const guarded = dropUnverified(rendered, retrieved, { asked: messages.filter((m) => m.role === 'user').map((m) => String(m.content || '')) });
  const speakers = fixQuoteSpeakers(guarded.text, retrieved);
  const linked = linkQuotes(speakers.text, retrieved);
  const reply = dropPreamble(linked.text).trim();
  const citations = [...[...works.values()].map((w) => ({ title: w.title, author: w.author, url: w.url, religion: w.religion, document_id: w.id, paragraph_index: null, text: '' })),
    ...retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url, religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index ?? null, text: String(q.text).slice(0, 300) }))]
    .filter((c) => c.url && reply.includes(c.url));
  return { reply, raw: final, retrieved: retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url)), citations, steps, usage,
    quotes_removed: guarded.removed, quotes_recredited: speakers.fixed || 0, quotes_linked: linked.linked || 0,
    timings: { first_tool_ms: firstToolMs, total_ms: Date.now() - t0 } };
}

/** The live tools for the agent (the API process): the researcher's library tools. */
export const agentTools = ({ search, fastSearch } = {}) => libraryTools({ search, fastSearch: fastSearch || agentSearch() });
