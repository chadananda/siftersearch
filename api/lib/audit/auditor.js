// Strategy auditor (planning/strategy-audit-plan.md): one completed Anís exchange → TYPED verdicts on whether its search
// strategy was right and best, whether the evidence answered, whether the format fit, what went wrong in the reply, and
// whether it calls for a NEW strategy or reveals a library gap. Runs after the exchange (never inline). Pure: prompt,
// schema and cost; the caller sends it (scripts/audit/audit-exchanges.mjs).

export const STRATEGIES = {
  quote: 'find a passage from its wording, exact or half-remembered',
  source: 'where a quotation comes from: its book and original tablet (SourceHunt)',
  topic: 'what the texts say about a theme',
  fact: 'who, when, where, what happened',
  define: 'what a term or name means',
  lookup: 'a named work or person itself',
  enumerate: 'a complete list: members, attendees, every instance',
  compare: 'how traditions or authors treat a theme',
  original: 'the Arabic or Persian behind an English passage',
  'best-expression': 'the passage that best states an idea',
  'survey-subject': 'the main ideas within a subject, each with key passages (deep, many searches)',
  'examine-position': "the reader's position examined: evidence for and against (deep, many searches)",
  timeline: 'dated events for a person, subject or period',
  'writing-project': 'an article, blog post or study material written from evidence',
  converse: 'conversation, not a lookup',
  other: 'none of these',
};

export const FORMATS = ['direct answer', 'yes or no with proof', 'decisive passage', 'range of voices', 'authority layers',
  'popular belief beside the texts', 'term with its original', 'find a passage', 'people record', 'list', 'timeline',
  'comparison', 'comparison table', 'reading suggestion', 'study question', 'honest absence', 'letter', 'source answer'];

/** The tool the model must call: every field typed, so verdicts can be counted and trended. */
export const AUDIT_TOOL = {
  name: 'record_audit',
  description: 'Record the audit of one exchange.',
  input_schema: {
    type: 'object',
    required: ['strategy_used', 'strategy_verdict', 'best_strategy', 'evidence', 'format_verdict', 'problems', 'new_strategy', 'data_gap', 'reader_feedback', 'summary'],
    properties: {
      strategy_used: { type: 'string', enum: Object.keys(STRATEGIES), description: 'the strategy the exchange actually followed' },
      strategy_verdict: { type: 'string', enum: ['right', 'acceptable', 'wrong'] },
      best_strategy: { type: 'string', enum: Object.keys(STRATEGIES), description: 'the strategy that would have served best (may equal strategy_used)' },
      evidence: { type: 'object', required: ['answered', 'cause'], properties: {
        answered: { type: 'string', enum: ['fully', 'partly', 'no', 'not-applicable'] },
        cause: { type: 'string', enum: ['none', 'routing', 'wrong-tradition-filter', 'ranking', 'missing-text', 'bad-text', 'too-few-passages', 'other'] },
      } },
      format_verdict: { type: 'object', required: ['fit'], properties: {
        fit: { type: 'string', enum: ['right', 'acceptable', 'wrong'] },
        better: { type: 'string', enum: [...FORMATS, 'none'] },
      } },
      problems: { type: 'array', description: 'every concrete mistake seen, WHEREVER it lies — not only Anís\'s', items: { type: 'object', required: ['where', 'kind', 'detail'], properties: {
        where: { type: 'string', enum: ['reply', 'library-data', 'source-text', 'reader-premise'],
          description: "reply = Anís's answer; library-data = our catalogue/metadata/links (wrong author, wrong original, a passage credited to the wrong writer); source-text = an error in the published source itself; reader-premise = the reader's assumption (e.g. a quote they attribute wrongly)" },
        kind: { type: 'string', enum: ['misquote', 'misattribution', 'wrong-authority-level', 'wrong-original', 'wrong-metadata', 'overreach', 'unsupported-claim', 'missed-key-passage', 'not-retrieved', 'shut-down', 'tone', 'other'] },
        detail: { type: 'string', description: 'name the passage, the work and what is wrong' },
      } } },
      new_strategy: { type: 'object', required: ['suggested'], properties: {
        suggested: { type: 'boolean', description: 'true only if no strategy in the catalogue fits this kind of request' },
        need: { type: 'string', description: 'the unmet need, in one sentence' },
        route: { type: 'string', description: 'how a strategy could serve it: which layers, steps, format' },
      } },
      needed_works: { type: 'array', items: { type: 'string' }, description: "works the reply needed but the evidence did not contain — each the work's PUBLISHED TITLE alone, one per item (e.g. 'The Dawn-Breakers', 'Kitáb-i-Aqdas', 'Lotus Sutra'): no author, no '(…)' glosses, no 'notes on…', never a topic ('scholarship on irfán' is not a work). You cannot see the catalogue: each is CHECKED against it afterwards — held ones become 'not retrieved' search failures, only unheld ones become library gaps" },
      data_gap: { type: 'object', required: ['found'], properties: {
        found: { type: 'boolean', description: 'only a defect VISIBLE in the evidence shown. Never "the library lacks X" — put X in needed_works' },
        detail: { type: 'string', description: 'bad OCR, missing original text, wrong metadata — in a passage shown; name it' },
      } },
      reader_feedback: { type: 'object', required: ['present'], description: "the reader's own feedback, when the question IS feedback (on an earlier reply, on Anís, or on the library)", properties: {
        present: { type: 'boolean' },
        about: { type: 'string', enum: ['earlier-reply', 'anis-generally', 'library', 'other'] },
        summary: { type: 'string', description: 'what the reader says, in one sentence' },
        justified: { type: 'string', enum: ['yes', 'partly', 'no', 'unclear'], description: 'judged against the earlier reply and its evidence' },
        fix: { type: 'string', description: 'the concrete improvement it points to (strategy, index, data, format, voice), or "none"' },
      } },
      vs_competitor: { type: 'object', required: ['verdict'], description: 'Anís against the SAME question answered by Perplexity (when shown)', properties: {
        verdict: { type: 'string', enum: ['better', 'equal', 'worse', 'no-comparison'] },
        they_gave: { type: 'string', description: 'what the competitor gave that Anís did not (a fact, a word, a source, a direction) — or "nothing"' },
        we_gave: { type: 'string', description: 'what Anís gave that the competitor could not (the library: originals, authoritative texts, links into them)' },
      } },
      summary: { type: 'string', description: 'one sentence: what most needs improving, or "fine"' },
    },
  },
};

const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** The audit request for one exchange: earlier turns (context), the question, the logged path, the evidence, the reply. */
/** What the competitor is asked: the reader's question alone — no addresses, numbers, greetings or signatures (a name
 *  lives in those) — with the previous question for context when this one is a short follow-up. Pure. */
export function competitorQuery(question, earlier = []) {
  // everything from the sign-off down is the signature (a name on its own line)
  const unsigned = (t) => { const ls = String(t || '').split('\n'); const k = ls.findIndex((l, i) => i > 0 && /^\s*(warm(ly)?|regards|best( wishes)?|love|blessings|sincerely|cheers|yours\b|with (love|thanks)|sent from)\b/i.test(l)); return (k > 0 ? ls.slice(0, k) : ls).join('\n'); };
  const scrub = (t) => unsigned(t).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ').replace(/\+?\d[\d\s().-]{7,}\d/g, ' ')
    .split('\n').filter((l) => !/^\s*(dear|hi|hello|thank(s| you)|warm(ly)?|regards|best|love|blessings|sincerely|cheers|sent from|on .+ wrote:|>)\b/i.test(l)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  const q = scrub(question);
  const prev = [...earlier].reverse().find((m) => m.role === 'user');
  return q.length < 220 && prev ? `Earlier question: ${clip(scrub(prev.content), 500)}\n\nFollow-up: ${q}` : q;
}

export function buildAuditPrompt({ earlier = [], question, reply, path = {}, competitor = null }) {
  const p = path || {};
  const evidence = (p.evidence || []).map((e, i) => `[${i + 1}] ${e.title || '?'} — ${e.author || '?'}${e.religion ? ` (${e.religion})` : ''}\n${clip(e.text, 1200)}`).join('\n\n');
  const route = {
    gate: p.gate, triage_kind: p.kind ?? p.triage?.kind, stance: p.triage?.stance, strategy: p.recipe, format: p.format?.id,
    passages: p.retrieved, timings_ms: p.timings, output_check: p.output_check, replaced: p.replaced,
  };
  const system = `You audit one exchange of Anís, a study companion that answers questions about the world's sacred texts from a library of primary texts, interpretation, history and scholarship. Judge the SEARCH STRATEGY and the use of evidence, not the prose style. FIRST ASK: did the reply help the person EXPLORE the idea they were reaching for (Chad 10-19: "The audit should answer questions in a way that encourages exploration, not shutting it down")? A reply that declines what it could have helped with, hedges, pads itself with what the texts do NOT discuss, or quibbles about the reader's wording is a 'shut-down' problem — the worst kind; name what an exploring reply would have given. Read the reader charitably: a slip in their spelling, transliteration or grammar is NEVER a problem to report and never something the reply should correct (they meant the correct form — judge the answer to that). 'reader-premise' is only for a substantive mistake (a work or saying attributed to the wrong author), never for language slips. AUTHORITY: on a DOCTRINAL question only the Revelation (Bahá'u'lláh, the Báb) and its authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi) may carry the answer — a doctrinal point rested on the Universal House of Justice, a scholar, a pilgrim's note or a secondary book is a 'wrong-authority-level' problem even if correct (Chad 10-19: "an antipattern, not better"); the House is the authority only for applying the law and the administrative order. When a competitor answer leans on the House or scholars for doctrine, that is a weakness of the competitor, not a model for Anís. Anís may answer LANGUAGE questions (what an Arabic/Persian/Hebrew word means, which words carry an idea, roots and grammar) from his own knowledge of the language — that is not an unsupported claim; facts about people, events and teachings still need a passage. Be strict and concrete: name the passage or the missing passage. Strategies available:\n${Object.entries(STRATEGIES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\nSuggest a new strategy only when none of these fits the kind of request — not when an existing one was merely executed badly. Report EVERY mistake you can see, wherever it lies — in the reply, in the library's own data (a passage credited to the wrong writer, a wrong original, wrong metadata), in a published source, or in the reader's premise (e.g. a saying attributed to Bahá'u'lláh that is not his). Catching mistakes of any source is the point of watching. You see ONLY the passages this reply retrieved, never the library's catalogue: a work missing from the evidence was NOT RETRIEVED — it may well be held (10-14: an audit declared The Dawn-Breakers and its introduction absent; both are in the library). Name such works in needed_works; never call them missing from the library. A PORTION of a book (its introduction, notes, a chapter, a tablet inside a compilation) is held when the book is: name the BOOK in needed_works. The EXCERPTS below are clipped for this audit (older logs at 300 characters): the reply was written from the full passages, so an excerpt ending mid-word is never a defect — do not report truncation. When the reader's message is FEEDBACK — praise, a complaint, "that's not what I asked", "I don't see how these quotes relate" — it is the most valuable signal there is: judge the EARLIER reply in its light, say whether it is justified, and name the concrete fix (record it in reader_feedback; record the earlier reply's mistakes in problems).`;
  const user = [
    earlier.length ? `EARLIER IN THE CONVERSATION:\n${earlier.map((m) => `${m.role === 'user' ? 'Reader' : 'Anís'}: ${clip(m.content, 400)}`).join('\n')}` : '',
    (p.triage?.kind === 'feedback' || ['confused', 'disagreed'].includes(p.triage?.reaction))
      ? `NOTE: the gate read this message as the reader's FEEDBACK on the earlier reply (kind ${p.triage?.kind}, reaction ${p.triage?.reaction}). Audit that reply in its light.` : '',
    `QUESTION:\n${clip(question, 2000)}`,
    `WHAT THE SYSTEM DID:\n${JSON.stringify(route)}`,
    `EVIDENCE THE REPLY WAS WRITTEN FROM:\n${evidence || '(not logged for this exchange)'}`,
    `REPLY:\n${clip(reply, 4000)}`,
    competitor?.text ? `THE SAME QUESTION ANSWERED BY PERPLEXITY (web search — our main competitor; the bar is that Anís is ALWAYS more helpful and informative, with the library's originals, authoritative texts and links behind him):\n${clip(competitor.text, 3000)}${competitor.citations?.length ? `\nIts sources: ${competitor.citations.slice(0, 8).map((c) => c?.url || c).join(' · ')}` : ''}\nJudge vs_competitor: is Anís's reply better, equal or worse for this reader, and what did each give that the other did not? A competitor's claim is not evidence — check it against the passages; do not reward a confident error.` : 'No competitor answer this time: vs_competitor.verdict = no-comparison.',
    'Audit this exchange by calling the record_audit tool (exactly one call; no prose).',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

/** USD for one call from token usage and a per-1k price ({ input, output } as in the model registry). */
export function costOf(usage = {}, pricing = { input: 0.003, output: 0.015 }) {
  return ((usage.input_tokens || 0) / 1000) * pricing.input + ((usage.output_tokens || 0) / 1000) * pricing.output;
}

const ABSENCE = /\b(not (present|held|available|retrievable|found|in the library)|absent|missing from the library|lacks?|no (copy|text) of)\b/i;

/** After the call: check every work the auditor said the reply needed against the catalogue (`find(title)` → the held doc or
 *  null). Held → a 'not-retrieved' problem (a search failure, the useful finding); unheld → the library gap. A data_gap
 *  that only asserts absence is dropped — the auditor cannot see the catalogue. Pure over the injected lookup. */
export async function verifyHoldings(v, find) {
  if (!v) return v;
  // a recheck starts clean: earlier 'held but not retrieved' findings were this function's own output
  const out = { ...v, holdings_checked: true,
    problems: (Array.isArray(v.problems) ? v.problems : []).filter((p) => !(p?.kind === 'not-retrieved' && /^held but not retrieved/.test(p.detail || ''))) };
  const unheld = [], unchecked = [];
  for (const title of (Array.isArray(v.needed_works) ? v.needed_works : []).slice(0, 8)) {
    let doc;
    try { doc = await find(title); } catch { unchecked.push(title); continue; }   // lookup failed: unknown, never 'unheld'
    if (doc) out.problems.push({ where: 'reply', kind: 'not-retrieved', detail: `held but not retrieved: "${doc.title}" (doc ${doc.id}) — needed for "${title}"` });
    else unheld.push(title);
  }
  // the model's own data_gap is kept (data_gap_model) so a recheck starts from it; a defect it SAW in the evidence stands
  // beside any unheld works (10-15: it was overwritten), an absence claim it could not see is dropped
  const model = v.data_gap_model || v.data_gap || { found: false };
  out.data_gap_model = model;
  const seen = model.found && !ABSENCE.test(String(model.detail || '')) ? model.detail : null;
  if (unchecked.length) out.holdings_unchecked = unchecked;
  const parts = [seen, unheld.length ? `not in the library (catalogue title search found nothing): ${unheld.join('; ')}` : null].filter(Boolean);
  out.data_gap = parts.length ? { found: true, detail: parts.join(' · ') }
    : { found: false, ...(model.found ? { detail: `dropped unverified claim: ${model.detail}` } : {}) };
  return out;
}

// ── Catalogue title matching for verifyHoldings (10-15: the first matcher demanded every word of the auditor's phrase —
// "Introduction to The Dawn-Breakers (Shoghi Effendi)" missed "The Dawn-breakers---Introduction", "Qur'an (ḥūr al-ʿayn)"
// missed the Qur'an — and fifteen held works were reported as library gaps).
const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'to', 'on', 'in', 'by', 'for', 'with', 'from', 'al', 'el', 'introduction', 'intro', 'notes', 'note', 'book', 'volume', 'vol']);
const ORDINAL = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', i: '1', ii: '2', iii: '3' };
export const titleWords = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'‘`ʿʾ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => ORDINAL[w] || w)
  .filter((w) => !['epistle', 'letter', 'gospel'].includes(w))                       // "First Epistle of John" = "1 John"
  .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));

/** The ways a needed-work phrase can name a title: whole, without its (gloss), each (gloss), each part of a / or ; list. */
export function titleCandidates(phrase) {
  const s = String(phrase || '');
  const out = [s, s.replace(/\([^)]*\)/g, ' '), ...[...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])];
  for (const part of s.replace(/\([^)]*\)/g, ' ').split(/\s+\/\s+|;|\s+—\s+/)) out.push(part);
  // A PORTION of a book lives inside the book (Chad 10-15): "Introduction to The Dawn-Breakers", "Notes to the Aqdas",
  // "Chapter 3 of …", "Days of Remembrance footnotes on …" are held when the book is.
  for (const x of [...out]) {
    const m = x.match(/^\s*(?:the\s+)?(?:introduction|intro|preface|foreword|prologue|epilogue|afterword|notes?|footnotes?|endnotes?|glossary|annotations?|appendix|chapter\s+\S+|part\s+\S+|section\s+\S+|volume\s+\S+)\s+(?:to|of|on|in|for)\s+(.+)$/i);
    if (m) out.push(m[1]);
    const n = x.match(/^(.+?)\s+(?:introduction|preface|foreword|notes?|footnotes?|endnotes?|glossary|appendix)\b/i);
    if (n) out.push(n[1]);
  }
  return [...new Set(out.map((x) => x.replace(/\s+/g, ' ').trim()))].filter((x) => titleWords(x).length);
}

/** Does a catalogue title name the work in `candidate`? Either word set contains the other (the shorter covering ≥ half). */
export function titleMatches(candidate, docTitle) {
  const a = new Set(titleWords(candidate)), b = new Set(titleWords(docTitle));
  if (!a.size || !b.size) return false;
  const aInB = [...a].every((w) => b.has(w)), bInA = [...b].every((w) => a.has(w));
  const shared = [...a].filter((w) => b.has(w)).length;          // "Karaniya Metta Sutta" ~ "Sutta Nipata 1.8 - Metta Sutta"
  return aInB || (bInA && b.size / a.size >= 0.5) || (shared >= 2 && shared / a.size >= 2 / 3);
}
