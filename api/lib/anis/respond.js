// Anis chat layer — the seeker/student companion embedded on many sites (web component) and reachable by email.
// Conversation + Jev-planned RAW search (no LLM in retrieval) → ONE fast streamed answer, in the site's persona,
// shaped by the Seeker Companion's relationship plan. Transport-neutral: the widget streams onEvent('text'),
// email uses the returned text. Model: ONE global, switchable setting ANIS_LLM="provider:model[:reasoning_effort]".
// Deps (lazy, injectable for tests): routes/chat.js executeSearch, jafar-pipeline craftAnswerStream, companion/.

import { dropUnverified, createSentenceGate } from './quotes.js';

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
 * @returns {{ reply, citations, retrieved, plan, timings }}
 */
export async function anisRespond({ messages, profile = {}, participant = {}, llm, onEvent = () => {}, deps }) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  const persona = profile.persona_name || 'Anis';
  const question = lastUser(messages);
  const t0 = Date.now();

  // Conversation (greetings, thanks, questions about Anis) is not a lookup: answer as ourselves, search nothing.
  const plan = d.plan ? await d.plan(messages).catch(() => null) : null;
  const conversational = plan?.shape === 'converse';

  onEvent({ type: 'stage', stage: 'search' });
  const res = conversational ? { passages: [], _plan: plan } : await d.search({
    query: searchQueryFor(messages), mode: 'passages', limit: 8, scope_config: profile.scope_config,
    plan: { messages, defaults: profile.default_tradition ? { religion: profile.default_tradition } : {} },
  });
  const searchMs = Date.now() - t0;
  const retrieved = (res?.passages || []).map((p) => ({
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

  onEvent({ type: 'stage', stage: 'craft' });
  // Stream a sentence at a time, releasing only sentences whose quotes are in the passages — an invented quote is
  // never SHOWN, not even for the moment before the final text replaces it. first_token_ms = first text SEEN.
  let firstTokenMs = null;
  const gate = createSentenceGate(retrieved, (t) => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
    onEvent({ type: 'text', content: t });
  });
  const raw = await d.craft({
    user_question: question, retrieved_quotes: retrieved, conversation_summary: conversationSummary(messages, persona),
    persona_name: persona, mission: profile.mission || null, companion_append: comp?.append || '',
    comparative: !!res?._plan?.comparative, conversational, entities: res?.entities || null, llm: llm || parseLlm(process.env.ANIS_LLM),
    onChunk: (t) => gate.push(t),
  });
  gate.flush();
  // Final text: markers → links, ungrounded links unlinked, and any sentence quoting words found in NO passage removed
  // (the widget reconciles its streamed text to this; email sends only this).
  const guarded = dropUnverified((d.stripLinks || keepRetrievedLinks)(linkMarkers(raw, retrieved), retrieved), retrieved);
  const reply = guarded.text;
  if (comp?.log && comp.plan) comp.log(comp.plan);

  // Chips = the sources the reply actually links, not every passage retrieved (screenshot: Book of Mormon and
  // Qabbalah under an answer that used two Bahá'í texts).
  const cited = citations.filter((c) => c.url && reply.includes(c.url));
  return { reply, quotes_removed: guarded.removed, citations: cited, retrieved: retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url)), plan: res?._plan || null,
    timings: { search_ms: searchMs, first_token_ms: firstTokenMs ?? Date.now() - t0, total_ms: Date.now() - t0 } };
}
