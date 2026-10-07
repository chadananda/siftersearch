// Anis chat layer — the seeker/student companion embedded on many sites (web component) and reachable by email.
// Conversation + Jev-planned RAW search (no LLM in retrieval) → ONE fast streamed answer, in the site's persona,
// shaped by the Seeker Companion's relationship plan. Transport-neutral: the widget streams onEvent('text'),
// email uses the returned text. Model: ONE global, switchable setting ANIS_LLM="provider:model[:reasoning_effort]".
// Deps (lazy, injectable for tests): routes/chat.js executeSearch, jafar-pipeline craftAnswerStream, companion/.

import { dropUnverified, createSentenceGate } from './quotes.js';
import { toFindings, dataProfile, describeProfile } from './findings.js';
import { chooseFormat } from './formats.js';
import { channelFor } from './channels.js';
import { unmachine } from './lint.js';

// Default measured 2026-09-25 (scripts/wip/anis-model-race.mjs, lean prompt, 4 questions): Gemini 3.5 Flash-Lite
// 0.53s first token / 1.5s total (gpt-4o-mini 0.61s / 2.3s; Haiku 0.72s / 4.3s; DeepSeek 0.77s / 2.4s). Every model
// sometimes quotes words not in its passages — the sentence gate (quotes.js) is the protection, not the model.
// Groq gpt-oss is faster still but its paid tier is unavailable (free = 8k TPM). Switch with ANIS_LLM.
const DEFAULT_LLM = { provider: 'gemini', model: 'gemini-3.5-flash-lite' };
const PROVIDERS = new Set(['groq', 'openai', 'deepseek', 'gemini', 'anthropic']);

/** "groq:openai/gpt-oss-120b:low" → { provider, model, reasoning_effort? }; nonsense → the default. */
export function parseLlm(spec) {
  const [provider, ...rest] = String(spec || '').split(':');
  if (!PROVIDERS.has(provider) || !rest.length) return { ...DEFAULT_LLM };
  const effort = ['none', 'low', 'medium', 'high'].includes(rest.at(-1)) && rest.length > 1 ? rest.pop() : null;
  const model = rest.join(':');
  return model ? { provider, model, ...(effort ? { reasoning_effort: effort } : {}) } : { ...DEFAULT_LLM };
}

// The perception line shown while the model starts (Claude-Code-style): specific, because the sources are known.
export function statusLine(citations, plan) {
  if (plan?.widened && plan?.relaxed?.includes('religion')) {
    return `Little in the ${plan.filters?.religion || 'narrower'} texts on this — widening to the whole library…`;
  }
  const titles = [...new Set(citations.map((c) => c.title).filter(Boolean))].slice(0, 2);
  if (!titles.length) return 'Searching more widely…';
  return titles.length === 1 ? `Reading ${titles[0]}…` : `Reading ${titles[0]} and ${titles[1]}…`;
}

/**
 * 【n】 / [n] citation markers → links to OUR passage n (gpt-oss cites this way instead of linking). Only numbers that
 * exist; a passage with no URL becomes its italic title. Real markdown links "[n](…)" are left alone.
 */
export function linkMarkers(text, quotes) {
  return String(text || '').replace(/\s?(?:【(\d+)】|\[(\d+)\](?!\())/g, (m, a, b) => {
    const q = quotes[Number(a || b) - 1];
    if (!q) return m;
    return q.citation_url ? ` ([${q.source_title || 'source'}](${q.citation_url}))` : ` (*${q.source_title || 'source'}*)`;
  });
}

// Words that only mean something with the previous turn ("he", "that book", "there").
const ANAPHOR = /\b(he|him|his|she|her|hers|they|them|their|it|its|this|that|these|those|there|then|he's|she's|they're)\b/i;

/**
 * What to SEARCH for. A follow-up that leans on the conversation (a pronoun, or a short fragment like "and
 * compassion?") is searched together with the question it refers to; a self-contained question is left alone.
 * The model still answers the actual turn — only retrieval is widened.
 */
export function searchQueryFor(messages) {
  const users = (messages || []).filter((m) => m.role === 'user').map((m) => String(m.content || '').trim());
  const current = users.at(-1) || '';
  const previous = users.at(-2);
  if (!previous) return current;
  const short = current.split(/\s+/).filter(Boolean).length <= 5;
  return (ANAPHOR.test(current) || short) ? `${previous} ${current}` : current;
}

const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

/** The quotation in a source question: the longest quoted span (≥ 6 words), else the message without a leading request
 *  ("Where is this from:") — what a library's copy appends (reference line, link) is stripped by SourceHunt itself. */
export function quotationIn(text) {
  const t = String(text || '').trim();
  const quoted = [...t.matchAll(/[“"«]([^”"»]{20,})[”"»]/g)].map((m) => m[1].trim()).filter((q) => q.split(/\s+/).length >= 6);
  if (quoted.length) return quoted.sort((a, b) => b.length - a.length)[0];
  const m = /^[^\n:]{0,80}?(?:from|source|origin|written|said|quote|find)[^\n:]{0,60}[:?\n]\s*([\s\S]{20,})$/i.exec(t);
  return (m ? m[1] : t).trim();
}

/** A link the model wrote to a page we gave it, copied imperfectly (a long text-fragment URL with one character changed), is
 *  replaced by the exact URL we gave — same page (base before ? and #) → our URL. Unknown pages are left to the link filter. */
export function exactLinks(text, urls) {
  const byBase = new Map();
  for (const u of urls || []) { const b = String(u).split('#')[0].split('?')[0]; if (!byBase.has(b)) byBase.set(b, u); }
  return String(text || '').replace(/\]\((https?:\/\/[^\s)]+)\)/g, (m, u) => {
    if ((urls || []).includes(u)) return m;
    const exact = byBase.get(u.split('#')[0].split('?')[0]);
    return exact ? `](${exact})` : m;
  });
}

const clip = (text = '', ranges = [], before = 240, after = 320) => {
  if (!ranges?.length || text.length <= 700) return text;
  const a = Math.max(0, ranges[0][0] - before), b = Math.min(text.length, ranges[ranges.length - 1][1] + after);
  return `${a > 0 ? '… ' : ''}${text.slice(a, b).trim()}${b < text.length ? ' …' : ''}`;
};

/** A question about where a quotation comes from, recognised without the triage model (it can time out): a quotation of
 *  8+ words together with source wording ("where is this from", "who wrote", "the source of", "which tablet"). */
export function looksLikeSourceQuestion(text) {
  const t = String(text || '');
  const asks = /\b(where (is|does|did|was) (this|it|that|the)\b[^?]{0,40}\b(from|come|found|written)|what('s| is) the (source|origin)|source of (this|the)|(who|which \w+) (said|wrote|revealed)|which (book|tablet|work|text)|where can i find)/i.test(t);
  const q = quotationIn(t);
  return asks && q !== t.trim() && q.split(/\s+/).length >= 8;   // a quotation SEPARATE from the question (quoted, or after it)
}

/** SourceHunt as Anís's tool for "where is this from?": the published source and the original tablet become the
 *  passages the reply is written from (so the sentence gate still holds). The model never sees a URL — it writes tags
 *  ({book}, {tablet}, …) that become exact links; it once copied a 400-char text-fragment URL into a repeating loop. */
async function huntSource(d, question) {
  const hunt = d.sourceHunt || (await import('../source-hunt.js')).sourceHunt;
  const r = await hunt(quotationIn(question)).catch(() => null);
  if (!r?.origin) return null;
  const o = r.origin, t = r.tablet?.certain ? r.tablet : null;
  const tTitle = t ? (t.meta?.title || t.title) : null, lang = t && /[پچژگ]/.test(t.text || '') ? 'Persian' : 'Arabic';
  const ool = t?.meta?.links?.oceanoflights || null, phelps = t?.meta?.links?.inventory || null, pin = t?.meta?.pin || null;
  const others = (r.citedBy || []).slice(0, 3);
  const tags = { book: { title: o.title, url: o.rangeUrl || o.url } };
  if (t) tags.tablet = { title: tTitle, url: t.meta?.links?.oceanoflightsRange || ool || t.rangeUrl || t.url };
  if (t && phelps) tags.inventory = { title: `Phelps Inventory${pin ? ` ${pin}` : ''}`, url: phelps, plain: true };
  others.forEach((c, i) => { tags[`cited${i + 1}`] = { title: c.title, url: c.rangeUrl || c.url }; });
  const retrieved = [{ text: clip(o.text, o.highlight), source_title: o.title, source_author: o.author || '', citation_url: tags.book.url,
    doc_id: o.documentId, paragraph_index: null, religion: "Baha'i", collection: null, source_lang: 'en', via: 'sourcehunt' }];
  if (t) retrieved.push({ text: clip(t.text, t.highlight), source_title: `${tTitle} (original, ${lang})`, source_author: o.author || '',
    citation_url: tags.tablet.url, doc_id: t.documentId, paragraph_index: null, religion: "Baha'i",
    collection: null, source_lang: lang === 'Persian' ? 'fa' : 'ar', via: 'sourcehunt' });
  const how = [
    'Never write a URL or a markdown link. Name each source with its tag exactly as written below — the tag becomes the linked title.',
    `Say the quotation comes from {book} (${o.title}) and whose words they are (${r.quoteAuthor || o.author || 'the author'}).`,
    t ? `Say the original is ${lang} — {tablet} (${tTitle}) — and quote the opening words of the original passage (the second passage) in its own script.${tags.inventory ? ' Mention its entry in {inventory}.' : ''}`
      : 'The original tablet could not be confirmed: say so plainly in one sentence, without guessing.',
    others.length ? `Also quoted in: ${others.map((c, i) => `{cited${i + 1}} (${c.title})`).join(', ')} — mention these in one sentence.` : '',
    'Keep it short. Do not describe what kind of text it is or its authority (no "authorized interpretation", "scripture" or similar). Do not interpret the passage unless the seeker asks.',
  ].filter(Boolean).join(' ');
  const extraUrls = Object.values(tags).map((x) => x.url).filter(Boolean);
  return { retrieved, tags, how, extraUrls, hunt: { quoteAuthor: r.quoteAuthor, origin: o.title, tablet: tTitle, ms: r.ms } };
}

/** {book} / {tablet} / {inventory} / {citedN} → links to the exact URLs (titles italic, the Inventory plain). A tag the model
 *  wrapped in brackets or asterisks is still found; an unknown tag is dropped. */
export function fillTags(text, tags) {
  return String(text || '').replace(/\*{0,2}\[?\{(book|tablet|inventory|cited\d)\}\]?\*{0,2}/g, (m, k) => {
    const x = tags?.[k];
    if (!x) return '';
    return x.url ? `[${x.plain ? x.title : `*${x.title}*`}](${x.url})` : (x.plain ? x.title : `*${x.title}*`);
  });
}

// Prior turns only (the current question is sent separately), trimmed — context, not a transcript to re-answer.
function conversationSummary(messages, persona) {
  const prior = (messages || []).slice(0, -1).slice(-6);
  return prior.map((m) => `${m.role === 'user' ? 'Seeker' : persona}: ${String(m.content || '').slice(0, 400)}`).join('\n');
}

async function defaultDeps() {
  const [{ executeSearch }, { craftAnswerStream, stripUngroundedLinks }, companion, { anisCraft }, { planSearch }] = await Promise.all([
    import('../../routes/chat.js'), import('../jafar-pipeline.js'), import('../companion/index.js'), import('./craft.js'),
    import('../search-plan.js'),
  ]);
  return {
    // Planned once here; executeSearch's plannedSearch then hits the plan cache (same conversation state).
    plan: (messages) => planSearch(messages),
    search: executeSearch,
    // Lean Anis prompt by default; ANIS_PROMPT=jafar uses the 12k-token Jafar crafter (comparison / rollback).
    craft: process.env.ANIS_PROMPT === 'jafar' ? craftAnswerStream : anisCraft,
    stripLinks: stripUngroundedLinks,
    companion: async (ctx) => {
      const store = companion.companionStore;
      const [globalDials, rel, turnsSoFar, connectOfferedRecently] = await Promise.all([
        store.getGlobalDials().catch(() => ({})),
        ctx.participantId ? store.getRelationship(ctx.participantId).catch(() => null) : null,
        ctx.participantId ? store.exposureCount(ctx.participantId).catch(() => 0) : 0,
        ctx.participantId ? store.connectOfferedRecently(ctx.participantId).catch(() => true) : true,
      ]);
      const built = companion.buildCompanionPlan({ ...ctx, relationship: rel, globalDials, turnsSoFar, connectOfferedRecently });
      return {
        append: `\n\nCOMPANION HARD RULES (never violate): ${companion.FORBIDDEN.join(' ')}${built.systemAppend}`,
        plan: built.plan,
        offer: !!built.plan?.connect_offer,
        log: (p) => ctx.participantId && store.logExposure({
          participant_id: ctx.participantId, mode: p.mode, intervention: p.intervention, challenge_level: p.challenge_level,
          authority_classes: (p.authority_classes || []).map((a) => a.class), plan: p, policy_version: p.policy_version,
        }).catch(() => {}),
      };
    },
  };
}

// Fallback link filter when none is injected: keep only markdown links whose URL was retrieved.
const keepRetrievedLinks = (text, quotes) => {
  const ok = new Set(quotes.map((q) => q.citation_url).filter(Boolean));
  return String(text || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => (ok.has(url) ? m : label));
};

/**
 * @param {object} a
 * @param {Array}  a.messages     the thread (last = the seeker's question)
 * @param {object} [a.profile]    { persona_name, default_tradition, mission, scope_config } — per site
 * @param {object} [a.participant]{ id, authed } — the Seeker Companion relationship key
 * @param {object} [a.llm]        override; default = ANIS_LLM env → DEFAULT_LLM
 * @param {Function} [a.onEvent]  receives { type: 'stage'|'sources'|'text'|'companion_offer', … }
 * @param {object} [a.direction]  { stance, guarded, channel } from the triage gate (turn.js) → the formatter's DIRECTION
 * @returns {{ reply, citations, retrieved, plan, timings }}
 */
export async function anisRespond({ messages, profile = {}, participant = {}, llm, onEvent = () => {}, direction = {}, deps }) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  const persona = profile.persona_name || 'Anis';
  const question = lastUser(messages);
  const t0 = Date.now();

  // Conversation (greetings, thanks, questions about Anis) is not a lookup: answer as ourselves, search nothing.
  const plan = d.plan ? await d.plan(messages).catch(() => null) : null;
  let conversational = plan?.shape === 'converse';

  onEvent({ type: 'stage', stage: 'search' });
  // "Where is this from?" → SourceHunt (published source + original tablet); nothing found → the ordinary search
  const sourced = (direction.kind === 'source_lookup' || looksLikeSourceQuestion(question)) ? await huntSource(d, question) : null;
  if (sourced) conversational = false;
  const res = sourced ? { passages: [], _plan: { shape: 'source', sourceHunt: sourced.hunt } } : conversational ? { passages: [], _plan: plan } : await d.search({
    query: searchQueryFor(messages), mode: 'passages', limit: 8, scope_config: profile.scope_config,
    plan: { messages, defaults: profile.default_tradition ? { religion: profile.default_tradition } : {} },
  });
  const searchMs = Date.now() - t0;
  const retrieved = sourced ? sourced.retrieved : (res?.passages || []).map((p) => ({
    text: p.text || '', source_title: p.title || '', source_author: p.author || '', citation_url: p.source_url || null,
    doc_id: p.document_id, paragraph_index: p.paragraph_index, religion: p.religion || null,
    collection: p.collection || null, source_lang: p.language || null, via: 'planned',
  }));
  const citations = retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url,
    religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index, text: q.text.slice(0, 300) }));
  // Something useful before the first token (backlog 0023): the sources are known in ~0.2s.
  if (!conversational) {
    onEvent({ type: 'sources', sources: citations, plan: res?._plan || null, ms: searchMs });
    onEvent({ type: 'status', text: statusLine(citations, res?._plan) });
  }

  // Findings (typed, with authority) → data profile → format: the reply's shape is chosen from the question AND what
  // was found AND the channel (PRD F3/F4). Runs in parallel with the Companion plan — no added latency.
  const pa = res?.peopleAnswer || null;
  const findings = toFindings({ retrieved, peopleAnswer: pa, entities: res?.entities || null });
  retrieved.forEach((q, i) => { q.authority = findings[i]?.authority?.name || null; });
  const evidenceProfile = dataProfile(findings, { plan: res?._plan || null, question });
  const channel = direction.channel || channelFor('widget-chat');
  const choose = d.chooseFormat || chooseFormat;
  const formatP = sourced ? Promise.resolve({ id: 'source', by: 'sourcehunt', how: sourced.how })
    : conversational ? Promise.resolve(null) : choose({ question, profile: evidenceProfile, channel }).catch(() => null);

  let comp = null;
  try {
    const evidenceDocs = retrieved.map((q) => ({ doc_id: q.doc_id, title: q.source_title, author: q.source_author, religion: q.religion, collection: q.collection }));
    comp = await d.companion({
      participantId: participant.id || null, authed: !!participant.authed, message: question,
      classifier: { comparative: !!res?._plan?.comparative }, evidenceDocs, evidenceCount: evidenceDocs.length,
      traditionsCovered: new Set(evidenceDocs.map((x) => x.religion).filter(Boolean)).size,
    });
    if (comp?.offer) onEvent({ type: 'companion_offer', offer: 'connect' });
  } catch { comp = null; }   // relationship enriches the answer; it never blocks one
  const format = await formatP;

  onEvent({ type: 'stage', stage: 'craft' });
  // Stream a sentence at a time, releasing only sentences whose quotes are in the passages — an invented quote is
  // never SHOWN, not even for the moment before the final text replaces it. first_token_ms = first text SEEN.
  let firstTokenMs = null;
  // Links allowed = the passages' URLs + the people record's evidence URLs. Applied per sentence while STREAMING
  // (the stream once showed a link the model had moved onto another domain; only the final text caught it).
  const paEvidence = pa ? [...(pa.contested || []).flatMap((p) => [...p.evidence, ...p.against]), ...(pa.notMet || []).flatMap((p) => p.evidence)] : [];
  const allowed = [...retrieved, ...[...(res?.entities || []).flatMap((p) => p.evidence || []), ...paEvidence].map((e) => ({ citation_url: e.url })),
    ...(sourced?.extraUrls || []).map((u) => ({ citation_url: u }))];
  const exactUrls = sourced ? [...retrieved.map((q) => q.citation_url), ...sourced.extraUrls].filter(Boolean) : null;
  const cleanLinks = (t) => unmachine((d.stripLinks || keepRetrievedLinks)(linkMarkers(exactUrls ? exactLinks(fillTags(t, sourced.tags), exactUrls) : t, retrieved), allowed));
  const gate = createSentenceGate(retrieved, (t) => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
    onEvent({ type: 'text', content: cleanLinks(t) });
  });
  const raw = await d.craft({
    user_question: question, retrieved_quotes: sourced ? retrieved.map(({ citation_url: _u, ...q }) => q) : retrieved, conversation_summary: conversationSummary(messages, persona),
    persona_name: persona, mission: profile.mission || null, companion_append: comp?.append || '',
    comparative: !!res?._plan?.comparative, conversational, entities: res?.entities || null, peopleAnswer: pa, target: res?._plan?.target || null, direction: { ...direction, format }, llm: llm || parseLlm(process.env.ANIS_LLM),
    onChunk: (t) => gate.push(t),
  });
  gate.flush();
  // Final text: markers → links, ungrounded links unlinked, and any sentence quoting words found in NO passage removed
  // (the widget reconciles its streamed text to this; email sends only this).
  const guarded = dropUnverified(cleanLinks(raw), retrieved);
  const reply = guarded.text;
  if (comp?.log && comp.plan) comp.log(comp.plan);

  // Chips = the sources the reply actually links, not every passage retrieved (screenshot: Book of Mormon and
  // Qabbalah under an answer that used two Bahá'í texts).
  const cited = citations.filter((c) => c.url && reply.includes(c.url));
  return { reply, quotes_removed: guarded.removed, citations: cited, retrieved: retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url)), plan: res?._plan || null,
    format: format ? { id: format.id, by: format.by } : null, profile: describeProfile(evidenceProfile),
    timings: { search_ms: searchMs, first_token_ms: firstTokenMs ?? Date.now() - t0, total_ms: Date.now() - t0 } };
}
