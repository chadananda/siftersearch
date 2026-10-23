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
  { name: 'find_translation', description: "An EXISTING English translation of an Arabic/Persian text (a prayer, tablet or passage the reader gives in the original): the library's original paragraph and the translations linked to it — authorized (Shoghi Effendi, the Bahá'í World Centre), published, or Stephen Phelps' provisional renderings. Give the original text (a line or more, in Arabic script). Call it BEFORE translating anything yourself.",
    parameters: { type: 'object', properties: { original: { type: 'string' } }, required: ['original'] } },
  { name: 'word_study', description: "How Shoghi Effendi rendered an Arabic/Persian word or root across the Writings (the CTAI concordance): his English renderings with counts, and passages pairing the original with his English. Give the word in Arabic script or transliteration, or the English word.",
    parameters: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] } },
  { name: 'trace_source', description: "A House of Justice letter, a scholar or a compilation stating a teaching is a SIGNPOST (Chad 10-19: when they refer to the teachings there is a presumption they mean something specific — we hold it): give its ref (e.g. P4) and get the primary passages it quotes or rests on — from the library's quote links, else the closest passages of Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi. Cite THOSE.",
    parameters: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'source_of', description: 'Where a quotation comes from: its published source, the original tablet, other works quoting it.',
    parameters: { type: 'object', properties: { quotation: { type: 'string' } }, required: ['quotation'] } },
  { name: 'web_search', description: 'The open web — ONLY for what a library of texts cannot hold (recent events, modern scholarship, general background). Results are labelled WEB and never treated as scripture or authoritative.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
].map((t) => ({ type: 'function', function: t }));

export const RESEARCH_SYSTEM = `You are the research mind behind Anís, a study companion for the world's sacred texts. The library holds primary texts in English and in their original languages (Arabic, Persian, Hebrew…), authorised interpretation, history and scholarship, and you reach it through tools. Your job: find what a generous, well-read scholar would bring to THIS person's question, then write a BRIEF for the writer.
- First work out what the person is reaching for, and serve that — read them charitably; never quibble with their wording, spelling or grammar.
- Read references in the sense of the reader's own community, and in the PRESENT, unless they say otherwise (10-19 battery: "ABS" read as the American Bible Society, "the Nine Year Plan" as 1964). For the Bahá'í library: "the House" = the Universal House of Justice; "the Nine Year Plan" = the current plan (2022–2031); "ABS" = the Association for Bahá'í Studies; "the Master" = 'Abdu'l-Bahá; "the Guardian" = Shoghi Effendi; "the Blessed Beauty" = Bahá'u'lláh; "the Most Holy Book" = the Kitáb-i-Aqdas; a reference like "63.6" is a message's paragraph, not a year.
- Match the depth to the question. A STUDY question (what do the Writings say about X; compile, list, compare; background; how to apply) deserves broad research — usually 4–8 calls, several passages per point from the authoritative texts. A quick factual question: the answer, then its source.
- Research like a scholar: search in the words the texts would use; follow leads — read around a passage, fetch its original, study how a word was rendered, trace a quotation to its source. Usually 2–5 calls; stop when you have enough.
- AUTHORITY DECIDES (Chad 10-19: "quoting a third party scholar or the house of justice on a doctrinal issue is an antipattern"). DOCTRINAL questions (what the Faith teaches) are answered ONLY from the Revelation (Bahá'u'lláh, the Báb) and its authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi): search for THEIR words, keep only their passages, and never rest a doctrinal point on the Universal House of Justice, a scholar, a pilgrim's note or a secondary book — not even beside the texts. The House is the authority only for APPLYING the law and the administrative order (consent to marriage, elections, the Fund, the Plans) — then cite it, after the texts it applies. Scholars and memoirs serve only history, labelled as such.
- Well-known background is yours to give too: e.g. Shoghi Effendi translated Gleanings, The Hidden Words, the Kitáb-i-Íqán and Prayers and Meditations — never doubt such a fact for want of a passage.
- A passage from the House, a scholar, a memoir or a compilation that states a teaching is a SIGNPOST, never the support: trace_source it and cite the primary passage it points to.
- Your own knowledge of LANGUAGE (what an Arabic/Persian/Hebrew word means, other words for the idea, roots, grammar) and well-known general background may go in the brief, marked [own]. Facts about people, events, dates and teachings need a passage (P#) — or a web result (W#), named as such.
- TRANSLATING (Chad 10-23: "when doing a translation, please use CTAI or use existing translation text to inform the translation"): when the reader gives an Arabic/Persian text to translate or read line by line, FIRST look for an existing translation — find_translation with the original; if that finds none, write your own rough English of one distinctive sentence and call source_of with it (it finds published and Phelps' provisional translations in other wordings). Use what exists VERBATIM, in this order: an authorized translation (Shoghi Effendi, the Bahá'í World Centre / Universal House of Justice), then a published one, then Stephen Phelps' provisional rendering (public domain — label it so). Only for lines no translation covers, translate yourself, after word_study on the key terms so you use Shoghi Effendi's renderings of them; mark those lines "provisional translation by Anís". In the brief, give the existing translation's FULL text with its P#, and say which lines each source covers.
- FINDING THE ORIGINAL of an English translation the library may not hold (10-23 Liliane: a prayer in an older translation; the tablet WAS in the library and was missed): (1) find_original and source_of with its most distinctive sentences; (2) if they do not land, render 2–3 of its most distinctive clauses into the Persian/Arabic the author would have written — 'Abdu'l-Bahá's prayers are mostly Persian; names and pairs survive translation ("the Turks … the Persians" = ترک … تاجیک, "the East … embrace the West" = شرق دست در آغوش غرب) — and search_library each; (3) the moment ANY passage shows original wording that matches — a tablet, or a memoir or compilation quoting it — call find_translation with that exact original line: it finds the library's own tablet (Phelps' inventory, PI number) and its translations. Confirm by reading the candidate whole: the right tablet matches the English line after line, not one shared image. A closing "‘Ayn ‘Ayn" (ع ع) is 'Abdu'l-Bahá's signature.
- When you name candidate words (other Arabic/Persian words for an idea), check each in word_study, in Arabic script, so the brief can say how Shoghi Effendi rendered them.
- Earlier replies in the conversation are context, not something to audit: never review or correct them unless the reader questions them (you cannot see how an earlier chart or count was built — 10-19 three "corrections" of Lal's chart were all false). If the reader does question one, say precisely what was wrong, with the passage.
- An empty tool result means only that this lookup found nothing — never treat it as evidence, and never disown or "correct" an earlier reply unless a passage shows it was wrong.
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
  // an existing translation is shown whole (the writer quotes it line by line) and says what kind it is
  const show = (refs, n = 900) => refs.filter(Boolean).map((r) => { const p = found.get(r); return `[${r}] ${p.title || '?'} — ${p.author || '?'}${p.language && p.language !== 'en' ? ` (${p.language})` : ''}${p.translation ? ` · EXISTING TRANSLATION: ${p.translation}` : ''}\n${clipText(p.text, p.translation ? Math.max(n, 4000) : n)}`; }).join('\n\n') || '(nothing)';
  const run = {
    search_library: async ({ query, tradition }) => show((await impl.search(query, tradition)).slice(0, 8).map((p) => add(p))),
    read_around: async ({ ref, before = 2, after = 2 }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p?.document_id) return 'unknown ref';
      // a copyrighted (encumbered) book is never read around — consecutive paragraphs are not a short excerpt (Chad 10-23)
      const enc = await (impl.encumberedAmong || (await import('../repos/rights-repo.js')).encumberedAmong)([p.document_id]).catch(() => new Set());
      if (enc.has(Number(p.document_id))) return 'this book is under copyright: quote only the excerpt you already have (with its link); its neighbouring paragraphs are not available';
      return show((await impl.around(p, Math.min(5, before), Math.min(5, after))).map((x) => add(x)));
    },
    find_original: async ({ english }) => show((await impl.original(english)).map((x) => add(x))),
    find_translation: async ({ original }) => {
      const found = impl.translation ? await impl.translation(original) : [];
      if (!found.some((x) => x.translation)) return `no linked translation found from the original wording${found.length ? ` (the original: ${show(found.map((x) => add(x)))})` : ''} — draft an English rendering of one distinctive sentence and call source_of with it`;
      return show(found.map((x) => add(x)), 4000);
    },
    word_study: async ({ word }) => {
      const r = await impl.wordStudy(word);
      // an empty result is about the SPELLING, never evidence (10-19: "bayt" found nothing and the reply disowned a real chart)
      if (!r) return `no concordance entry for "${word}" in this spelling — this says nothing about the word; try it in Arabic script (e.g. بيت, غرفة, حجرة)`;
      return `${r.summary}\n\n${show((r.passages || []).map((x) => add(x)))}`;
    },
    trace_source: async ({ ref }) => {
      const p = found.get(String(ref).toUpperCase());
      if (!p) return 'unknown ref';
      return show((await impl.trace(p)).map((x) => add(x)));
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
    // one retry for a timed-out or dropped round; the failure says which round and how long (10-19: bare "Request timed out")
    const ask = () => create({ messages: msgs, ...(last ? {} : { tools: TOOLS, tool_choice: 'auto' }), max_tokens: 4000 });
    let r;
    try { r = await ask(); } catch (err) {
      log.warn({ round, calls, ms: Date.now() - t0, err: String(err?.message).slice(0, 160) }, 'research round failed — retrying once');
      try { r = await ask(); } catch (err2) { throw Object.assign(new Error(`round ${round} after ${Date.now() - t0} ms: ${err2?.message}`), { cause: err2 }); }
    }
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

export const RESEARCH_HOW = (brief) => `Write the reply from this research brief — it says what the person is reaching for and what the answer holds. Give the substance generously: every point of the brief. A study question gets a full, organised answer — a short bold lead for each part, several quoted passages, the distinctions that matter, and specifics (names, dates, references); a quick question gets a direct answer first. When the reader asks for a table, a list or a programme, give exactly that; quote the passages that carry it (exact words, linked as the house style says). A point marked [own] is your knowledge of the language or general background — say it plainly as a scholar friend would, without a source. A point from W# is from the web: name it as such, never as scripture. Never comment on, review or correct your earlier replies unless the reader questioned them — and then only precisely, with the passage. Never write the brief's markers (P#, W#, [own]) — they are notes to you. TRANSLATIONS: a passage marked EXISTING TRANSLATION is quoted verbatim, never re-translated; only lines it does not cover are your own (the brief says which). Never volunteer what could not be found or confirmed; give what is known. Well-known background is fine to state (Shoghi Effendi translated Gleanings, The Hidden Words, the Kitáb-i-Íqán). End with the thread to pull, as an invitation — no summary, no remarks about sources or authority.\n\nBRIEF:\n${brief}`;

/** What kind of translation a text is, for the brief and the reply's row markers. Pure. */
export function translationLabel(by, authority) {
  const s = `${by || ''} ${authority || ''}`;
  if (/shoghi/i.test(s)) return 'authorized — Shoghi Effendi';
  if (/universal house|world cent(re|er)|research department/i.test(s)) return 'authorized — Bahá’í World Centre';
  if (/phelps/i.test(s)) return 'provisional — Stephen Phelps (public domain)';
  if (/published|committee/i.test(s)) return by ? `published — ${by}` : 'published translation';
  return by ? `translation by ${by}` : 'translation';
}
/** Persian and Arabic spell ی/ي and ک/ك differently; a reader's typing may not match the library's. Pure. */
export const letterVariants = (s) => [...new Set([String(s), String(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک'), String(s).replace(/ی/g, 'ي').replace(/ک/g, 'ك')])];

/** The live tools over the library (lazy imports; the API process). */
export function libraryTools({ search }) {
  const shape = (p) => ({ id: p.id, text: p.text || '', title: p.title || p.document?.title || '', author: p.author || p.document?.author || '',
    source_url: p.source_url || p.readerUrl || p.url || null, document_id: p.document_id ?? p.documentId ?? p.doc_id, paragraph_index: p.paragraph_index ?? p.paragraphIndex,
    religion: p.religion || p.document?.religion || null, collection: p.collection || p.document?.collection || null, language: p.language || p.source_lang || 'en',
    translation: p.translation || (/\(provisional translation\)/i.test(p.title || p.document?.title || '') ? translationLabel('Stephen Phelps', 'provisional-phelps') : null) });
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
    // an original → the library's copy of it (verbatim, either spelling of ی/ک) → the English linked to it: aligned
    // translation paragraphs and the English stored beside the original (CTAI side-by-side, Phelps)
    translation: async (original) => {
      const pl = await import('../passage-links.js');
      const { hybridSearch } = await import('../search.js');
      const out = [], seen = new Set();
      const push = (p) => { if (p?.text && !seen.has(p.id ?? p.text)) { seen.add(p.id ?? p.text); out.push(p); } };
      for (const v of letterVariants(original)) {
        const r = await pl.findOriginals(v, { limit: 5, semantic: false, search: hybridSearch }).catch(() => null);
        for (const m of (r?.matches || []).filter((x) => x.overlap >= 0.5 && /[\u0600-\u06FF]/.test(x.passage?.text || ''))) {
          push(shape(m.passage));
          for (const t of m.links?.translations || []) push({ ...shape(t), translation: translationLabel(t.translated_by, null) });
          if (m.passage.english?.text) push({ ...shape(m.passage), id: `${m.passage.id}-en`, text: m.passage.english.text, language: 'en',
            title: `${m.passage.document?.title || ''} (English beside the original)`, translation: translationLabel(null, m.passage.english.authority) });
        }
        if (out.some((x) => x.translation)) break;
      }
      return out.slice(0, 6);
    },
    wordStudy: async (word) => {
      const { resolveTerm, ctaiTerm } = await import('./ctai-term.js');
      const w = /[؀-ۿ]/.test(word) ? word : await resolveTerm(word).catch(() => null);
      const s = w ? await ctaiTerm(w).catch(() => null) : null;
      if (!s?.passages?.length) return null;
      const bars = (s.renderings || []).map((x) => `${x.en} ${x.count}`).join(' · ');
      // say WHAT the counts are (10-19 audit: root-wide counts were presented as the phrase's)
      const of = s.counted ? `in ${s.counted} aligned passages` : 'across all words of the root';
      const root = s.counted && s.root_renderings?.length ? ` · CTAI's ROOT-LEVEL counts (every word of the root, a different measure): ${s.root_renderings.map((x) => `${x.en} ${x.count}`).join(' · ')}` : '';
      return { summary: `Word ${s.term}${s.transliteration ? ` (${s.transliteration})` : ''}${s.root ? `, root ${s.root}` : ''}${s.meaning ? ` — ${s.meaning}` : ''}. Shoghi Effendi's renderings ${of}: ${bars || 'n/a'}${root}${s.researchUrl ? ` · all renderings: ${s.researchUrl}` : ''}`,
        passages: s.passages.slice(0, 4).map((x) => shape({ text: `${x.original}\n${x.english}`, title: x.ref || x.work, author: x.author, source_url: x.url, religion: "Baha'i", language: 'ar' })) };
    },
    // the primary passages a signpost rests on: its recorded quote links first, else the closest passages of the authoritative
    // authors (position.js isDoctrine) to what it says
    trace: async (p) => {
      const out = [];
      if (p.id) {
        const pl = await import('../passage-links.js');
        const linked = (await pl.resolveLinks([p.id], { quotedBy: false })).get(Number(p.id))?.sources || [];
        out.push(...linked.slice(0, 4).map(shape));
      }
      if (out.length < 2) {
        const { isDoctrine } = await import('./position.js');
        const hits = ((await search({ query: String(p.text).slice(0, 500), mode: 'passages', limit: 16,
          plan: { messages: [{ role: 'user', content: String(p.text).slice(0, 500) }], defaults: { religion: "Baha'i" } } }))?.passages || [])
          .filter((h) => String(h.text || '').length <= 8000 && isDoctrine(h)).slice(0, 4).map(shape);
        out.push(...hits);
      }
      return out;
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
