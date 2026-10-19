// THE RESEARCHER (Chad 10-19: "How do we make Anís into a useful research and study assistant. It seems downright
// reluctant to be helpful" · "I think we have made it too determinative" · "Even Haiku 5.5 might be sufficient for
// planning research"). Regexes used to decide beforehand what kind of question it was and which ONE lookup to run; a
// question between shapes got a generic search and an apology. Here a model plans the research itself, with the
// library's own instruments as tools — search, read around a passage, the original of an English passage, Shoghi
// Effendi's renderings of a word, the source of a quotation, the web — and ends with a BRIEF for the writer. Its
// passages become the reply's evidence, so the quote gate and link rules still hold. Deps injectable (tests).
import { logger } from '../logger.js';
const log = logger.child ? logger.child({ mod: 'anis-researcher' }) : logger;

const TOOLS = [
  { name: 'search_library', description: 'Search the library (primary texts in English and in their original Arabic/Persian, authorised interpretation, history, scholarship). Phrase the query in the words the texts themselves would use; name an author or work in the query to narrow it.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, tradition: { type: 'string', description: "e.g. Baha'i, Islam, Christianity — omit for all" } }, required: ['query'] } },
  { name: 'read_around', description: 'Read the paragraphs before and after a passage you found (its ref, e.g. P3) — for context, or to see how a thought continues.',
    parameters: { type: 'object', properties: { ref: { type: 'string' }, before: { type: 'integer' }, after: { type: 'integer' } }, required: ['ref'] } },
  { name: 'find_original', description: 'The original-language (Arabic/Persian) text of an English passage, and the authorised translations linked to that original. Give the English words (a sentence or two).',
    parameters: { type: 'object', properties: { english: { type: 'string' } }, required: ['english'] } },
  { name: 'word_study', description: "How Shoghi Effendi rendered an Arabic/Persian word or root across the Writings (the CTAI concordance): his English renderings with counts, and passages pairing the original with his English. Give the word in Arabic script or transliteration, or the English word.",
    parameters: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] } },
  { name: 'source_of', description: 'Where a quotation comes from: its published source, the original tablet, other works quoting it.',
    parameters: { type: 'object', properties: { quotation: { type: 'string' } }, required: ['quotation'] } },
  { name: 'web_search', description: 'The open web — ONLY for what a library of texts cannot hold (recent events, modern scholarship, general background). Results are labelled WEB and never treated as scripture or authoritative.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
].map((t) => ({ type: 'function', function: t }));

export const RESEARCH_SYSTEM = `You are the research mind behind Anís, a study companion for the world's sacred texts. The library holds primary texts in English and in their original languages (Arabic, Persian, Hebrew…), authorised interpretation, history and scholarship, and you reach it through tools. Your job: find what a generous, well-read scholar would bring to THIS person's question, then write a BRIEF for the writer.
- First work out what the person is reaching for, and serve that — read them charitably; never quibble with their wording, spelling or grammar.
- Research like a scholar: search in the words the texts would use; follow leads — read around a passage, fetch its original, study how a word was rendered, trace a quotation to its source. Usually 2–5 calls; stop when you have enough.
- Authority decides on doctrine: the Revelation (Bahá'u'lláh, the Báb) and its authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi) carry the answer; the Universal House of Justice is authoritative on applying the law; memoirs, pilgrims' notes and studies only illustrate.
- Your own knowledge of LANGUAGE (what an Arabic/Persian/Hebrew word means, other words for the idea, roots, grammar) and well-known general background may go in the brief, marked [own]. Facts about people, events, dates and teachings need a passage (P#) — or a web result (W#), named as such.
- Never conclude "nothing found" while a reasonable search is untried. If the library truly lacks something, say what it does have that helps.
When done, reply with no tool call, in exactly this form:
BRIEF:
Reaching for: <one line>
- <a point of the answer, with its support: P#, W# or [own]>
- <…>
Thread to pull: <one line>
KEEP: <the refs the reply should quote or cite, e.g. P2, P5 — only those that carry a point>`;

const clipText = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

/** The researcher's closing message → { brief, keep: ['P2', …] }. Pure. */
export function parseBrief(text) {
  const t = String(text || '');
  const keep = (t.match(/^\s*KEEP:\s*(.*)$/im)?.[1] || '').match(/[PW]\d+/gi)?.map((x) => x.toUpperCase()) || [];
  const brief = t.replace(/^\s*KEEP:.*$/im, '').replace(/^\s*BRIEF:\s*/im, '').trim();
  return { brief, keep };
}

/**
 * → { passages, brief, steps, ms } or null. passages carry the search shape respond.js expects (text, title, author,
 * source_url, document_id, paragraph_index, religion, collection, language, id, ref).
 */
export async function research({ messages, create, tools: impl, maxRounds = 6, maxCalls = 10 }) {
  const t0 = Date.now();
  const found = new Map();   // ref → passage
  let pn = 0, wn = 0;
  const add = (p, web = false) => {
    if (!p?.text) return null;
    const dup = [...found.values()].find((x) => (p.id && x.id === p.id) || (x.text === p.text && x.title === p.title));
    if (dup) return dup.ref;
    const ref = web ? `W${++wn}` : `P${++pn}`;
    found.set(ref, { ...p, ref });
    return ref;
  };
  const show = (refs) => refs.filter(Boolean).map((r) => { const p = found.get(r); return `[${r}] ${p.title || '?'} — ${p.author || '?'}${p.language && p.language !== 'en' ? ` (${p.language})` : ''}\n${clipText(p.text, 900)}`; }).join('\n\n') || '(nothing)';
  const run = {
    search_library: async ({ query, tradition }) => show((await impl.search(query, tradition)).slice(0, 8).map((p) => add(p))),
    read_around: async ({ ref, before = 2, after = 2 }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      return show((await impl.around(p, Math.min(5, before), Math.min(5, after))).map((x) => add(x)));
    },
    find_original: async ({ english }) => show((await impl.original(english)).map((x) => add(x))),
    word_study: async ({ word }) => {
      const r = await impl.wordStudy(word);
      if (!r) return 'no concordance entry';
      return `${r.summary}\n\n${show((r.passages || []).map((x) => add(x)))}`;
    },
    source_of: async ({ quotation }) => show((await impl.sourceOf(quotation)).map((x) => add(x))),
    web_search: async ({ query }) => {
      const r = await impl.web(query);
      if (!r?.text) return 'no web answer';
      const ref = add({ text: r.text, title: `Web: ${clipText(query, 60)}`, author: 'web search', source_url: r.citations?.[0]?.url || null, web: true }, true);
      return `[${ref}] (WEB — not the library)\n${clipText(r.text, 1500)}${r.citations?.length ? `\nSources: ${r.citations.slice(0, 5).map((c) => c.url || c).join(' · ')}` : ''}`;
    },
  };
  const convo = messages.slice(-7).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clipText(m.content, 3000) }));
  const msgs = [{ role: 'system', content: RESEARCH_SYSTEM }, ...convo];
  const steps = [];
  let calls = 0, final = '';
  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1 || calls >= maxCalls;
    const r = await create({ messages: msgs, ...(last ? {} : { tools: TOOLS, tool_choice: 'auto' }), max_tokens: 4000 });
    const m = r?.choices?.[0]?.message || {};
    const tcs = (m.tool_calls || []).slice(0, Math.max(0, maxCalls - calls));
    if (!tcs.length) { final = String(m.content || ''); break; }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: tcs });
    for (const tc of tcs) {
      calls++;
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
      const fn = run[tc.function?.name];
      const out = fn ? await fn(args).catch((err) => `tool failed: ${String(err.message).slice(0, 160)}`) : 'unknown tool';
      steps.push({ tool: tc.function?.name, args, found: (String(out).match(/^\[[PW]\d+\]/gm) || []).length });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: clipText(out, 12000) });
    }
  }
  const { brief, keep } = parseBrief(final);
  // the reply's evidence: what the researcher kept, else everything it found (in order)
  const kept = (keep.length ? keep : [...found.keys()]).map((r) => found.get(r)).filter(Boolean);
  log.info({ steps: steps.map((s) => `${s.tool}:${s.found}`), found: found.size, kept: kept.length, ms: Date.now() - t0 }, 'researched');
  if (!brief) return null;
  return { passages: kept, brief, steps, ms: Date.now() - t0 };
}

export const RESEARCH_HOW = (brief) => `Write the reply from this research brief — it says what the person is reaching for and what the answer holds. Give the substance generously: every point of the brief, in plain prose; quote the passages that carry it (exact words, linked as the house style says). A point marked [own] is your knowledge of the language or general background — say it plainly as a scholar friend would, without a source. A point from W# is from the web: name it as such, never as scripture. End with the thread to pull, as an invitation — no summary, no remarks about sources or authority.\n\nBRIEF:\n${brief}`;

/** The live tools over the library (lazy imports; the API process). */
export function libraryTools({ search }) {
  const shape = (p) => ({ id: p.id, text: p.text || '', title: p.title || p.document?.title || '', author: p.author || p.document?.author || '',
    source_url: p.source_url || p.readerUrl || p.url || null, document_id: p.document_id ?? p.documentId ?? p.doc_id, paragraph_index: p.paragraph_index ?? p.paragraphIndex,
    religion: p.religion || p.document?.religion || null, collection: p.collection || p.document?.collection || null, language: p.language || p.source_lang || 'en' });
  return {
    search: async (query, tradition) => ((await search({ query, mode: 'passages', limit: 8,
      plan: { messages: [{ role: 'user', content: query }], defaults: tradition ? { religion: tradition } : {} } }))?.passages || [])
      .filter((p) => String(p.text || '').length <= 8000).map(shape),
    around: async (p, before, after) => {
      const { getParagraphs } = await import('../docs-repo.js');
      const idx = Number(p.paragraph_index) || 0;
      const rows = await getParagraphs(p.document_id, { offset: Math.max(0, idx - before), limit: before + after + 1 });
      const { withLinks } = await import('../hit-links.js');
      const linked = await withLinks(rows.map((r) => ({ id: r.id, doc_id: p.document_id, paragraph_index: r.paragraph_index, text: r.text, title: p.title }))).catch(() => []);
      return rows.map((r, i) => shape({ ...r, title: p.title, author: p.author, religion: p.religion, document_id: p.document_id, source_url: linked[i]?.url || null }));
    },
    original: async (english) => {
      const pl = await import('../passage-links.js');
      const r = await pl.findOriginals(english, { limit: 10, search: (await import('../search.js')).hybridSearch });
      const o = r?.originals?.[0];
      if (!o) return (r?.matches || []).slice(0, 2).map((x) => shape(x.passage)).filter((x) => x.text);
      const tr = ((await pl.resolveLinks([o.id], { quotedBy: false })).get(o.id)?.translations || []).slice(0, 2);
      return [shape(o), ...tr.map(shape)];
    },
    wordStudy: async (word) => {
      const { resolveTerm, ctaiTerm } = await import('./ctai-term.js');
      const w = /[؀-ۿ]/.test(word) ? word : await resolveTerm(word).catch(() => null);
      const s = w ? await ctaiTerm(w).catch(() => null) : null;
      if (!s?.passages?.length) return null;
      const bars = (s.renderings || []).map((x) => `${x.en} ${x.count}`).join(' · ');
      // say WHAT the counts are (10-19 audit: root-wide counts were presented as the phrase's)
      const of = s.counted ? `in the ${s.counted} aligned passages shown` : 'across all words of the root';
      return { summary: `Word ${s.term}${s.transliteration ? ` (${s.transliteration})` : ''}${s.root ? `, root ${s.root}` : ''}${s.meaning ? ` — ${s.meaning}` : ''}. Shoghi Effendi's renderings ${of}: ${bars || 'n/a'}${s.researchUrl ? ` · all renderings: ${s.researchUrl}` : ''}`,
        passages: s.passages.slice(0, 4).map((x) => shape({ text: `${x.original}\n${x.english}`, title: x.ref || x.work, author: x.author, source_url: x.url, religion: "Baha'i", language: 'ar' })) };
    },
    sourceOf: async (quotation) => {
      const { sourceHunt } = await import('../source-hunt.js');
      const r = await sourceHunt(quotation).catch(() => null);
      if (!r?.origin) return [];
      const o = r.origin, t = r.tablet?.certain ? r.tablet : null;
      return [shape({ text: o.text, title: o.title, author: r.quoteAuthor || o.author, source_url: o.rangeUrl || o.url, document_id: o.documentId }),
        ...(t ? [shape({ text: t.text, title: `${t.meta?.title || t.title} (original)`, author: r.quoteAuthor || o.author, source_url: t.meta?.links?.oceanoflightsRange || t.rangeUrl || t.url, document_id: t.documentId, language: /[پچژگ]/.test(t.text || '') ? 'fa' : 'ar' })] : [])];
    },
    web: async (query) => (await import('../perplexity.js')).perplexityFallback(query, { caller: 'anis-researcher', maxTokens: 700 }),
  };
}
