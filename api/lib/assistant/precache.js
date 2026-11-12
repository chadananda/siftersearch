// Precached common questions (Chad 11-10: "every common question … is precached for speed"). The answer cache (answer-cache.js, SEARCH_VERSION
// rules) behind anisTurn: an OPENING site-chat question the warm job answered at the current SEARCH_VERSION is served at once; a stale row is a
// miss (the next warm run replaces it). Only the warm job writes (a reader's answer carries their reader card, so it is never cached for others);
// test turns never read (they measure the pipeline). Ops job `anis-precache` { tradition, limit?, dry?, heldOut?, refresh? }: bank questions
// (held-out included — they are real common questions) through the normal pipeline, billed to the test ledger (improve cap). Deps injectable.
import fs from 'node:fs';
import path from 'node:path';

const BANK_DIR = path.join(process.cwd(), 'tests', 'quality', 'question-bank');

/** The stream events that are cards (book card, passage cards, quote cards, named-work books): stored with a warmed answer and replayed. */
export const CARD_EVENTS = new Set(['book', 'passage', 'quote_cards', 'books', 'widget']);

/** Cache key text: the question without trailing punctuation, so "…jesus?" and "…jesus" share a row (answer-cache normalises case/space). Pure. */
export const keyText = (q) => String(q || '').trim().replace(/[\s?.!¿؟]+$/u, '');
/** Persona column = persona × channel (reply size and style differ by channel). Pure. */
export const cacheKey = (name, channel) => `${name || 'Anís'}|${channel}`;
/** Only an opening site-chat turn with no host profile (scope, mission, tradition) and no caller override is cacheable. Pure. */
export function cacheEligible({ messages, channel, profile = {}, overrides = [] }) {
  const m = messages || [];
  return channel === 'site-chat' && !profile.scope_config && !profile.mission && !profile.default_tradition
    && m.length === 1 && m[0]?.role === 'user' && !!keyText(m[0].content) && overrides.every((x) => x === undefined || x === null || x === false);
}

const slimCitation = (c) => ({ id: c?.id ?? null, title: c?.title ?? null, author: c?.author ?? null, url: c?.url ?? null, document_id: c?.document_id ?? null,
  paragraph_index: c?.paragraph_index ?? null, text: String(c?.text || '').slice(0, 400) });
const slimRetrieved = (q) => ({ doc_id: q?.doc_id ?? q?.document_id ?? null, paragraph_index: q?.paragraph_index ?? null, text: String(q?.text || '').slice(0, 300),
  source_title: q?.source_title ?? q?.title ?? null, source_author: q?.source_author ?? q?.author ?? null, religion: q?.religion ?? null, collection: q?.collection ?? null });

/** A cache row → what the turn replays, or null when it cannot be read (a miss, never an error). Pure. */
export function unpack(entry) {
  try {
    const research = entry.research_json ? JSON.parse(entry.research_json) : {};
    const citations = entry.citations_json ? JSON.parse(entry.citations_json) : [];
    if (!entry.answer_md) return null;
    return { id: entry.id, hash: entry.question_hash, version: entry.search_version, reply: entry.answer_md, citations: Array.isArray(citations) ? citations : [],
      retrieved: Array.isArray(research.retrieved) ? research.retrieved : [], events: Array.isArray(research.events) ? research.events.filter((e) => CARD_EVENTS.has(e?.type)) : [],
      strategy: research.strategy ?? null, warmed_at: research.warmed_at ?? null };
  } catch { return null; }
}

/** The turn's cache deps over answer-cache.js (lazy; `ac` injectable for tests). */
export function cacheDeps(ac = null) {
  const mod = () => (ac ? Promise.resolve(ac) : import('../answer-cache.js'));
  const fresh = async (q, persona) => {
    const m = await mod();
    const hit = await m.checkAnswerCache(keyText(q), { persona });   // exact (normalised) question only: no embedding call on a reader's turn
    if (!hit?.entry) return { m, hit: null };
    if (hit.stale) { m.recordServe({ question_hash: hit.entry.question_hash, cache_status: 'miss-stale', served_version: hit.entry.search_version }); return { m, hit: null }; }
    return { m, hit: unpack(hit.entry) };
  };
  return {
    lookup: async (q, persona) => (await fresh(q, persona)).hit,
    has: async (q, persona) => !!(await fresh(q, persona)).hit,
    store: async (q, persona, a) => (await mod()).storeAnswer(keyText(q), { persona, answer: a.reply, citations: (a.citations || []).slice(0, 40).map(slimCitation),
      research: { events: a.events || [], retrieved: (a.retrieved || []).slice(0, 8).map(slimRetrieved), strategy: a.strategy ?? null, warmed_at: new Date().toISOString() },
      retrieved_count: (a.retrieved || []).length }),
    served: async (hit, ms) => { const m = await mod(); m.recordServe({ question_hash: hit.hash, cache_status: 'hit-fresh', served_version: hit.version, similarity: 1, latency_ms: ms }); m.touchEntry(hit.id); },
  };
}

async function defaults(over) {
  return {
    bankIds: () => fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
    bank: (id) => JSON.parse(fs.readFileSync(path.join(BANK_DIR, `${id}.json`), 'utf8')),
    turn: async (args) => (await import('./turn.js')).anisTurn(args),
    cache: cacheDeps(),
    draining: async () => (await import('../drain.js')).isDraining(),
    log: async (kind, text) => (await import('../repos/activity-repo.js')).logActivity(kind, text),
    ...over,
  };
}

/**
 * Warm the cache with one tradition's bank. dry → the questions and whether each is already fresh (no LLM). Otherwise each question not fresh
 * (or every one with refresh) is asked as a TEST turn with warm on — the normal pipeline, billed to the improve cap; the run stops at the cap or a drain
 * (a later run resumes: fresh questions are skipped).
 */
export async function anisPrecacheJob({ tradition, limit = null, dry = false, heldOut = true, refresh = false, persona = 'Anís' } = {}, over = {}) {
  const d = await defaults(over);
  const ids = d.bankIds(), bankId = ids.find((x) => x === String(tradition || '').toLowerCase());
  if (!bankId) throw Object.assign(new Error(`anis-precache: no question bank "${tradition}" (have ${ids.join(', ')})`), { statusCode: 400 });
  let qs = (d.bank(bankId).questions || []).filter((q) => heldOut || !q.held_out);
  if (limit) qs = qs.slice(0, Number(limit));
  const key = cacheKey(persona, 'site-chat');
  const out = { tradition: bankId, dry: !!dry, total: qs.length, fresh: 0, warmed: 0, not_stored: [], stopped: null, questions: [] };
  for (const q of qs) {
    const has = await d.cache.has(q.q, key).catch(() => false);
    if (dry) { out.questions.push({ id: q.id, q: q.q, held_out: !!q.held_out, cached: has }); if (has) out.fresh++; continue; }
    if (has && !refresh) { out.fresh++; continue; }
    if (await d.draining().catch(() => false)) { out.stopped = 'draining'; break; }
    const r = await d.turn({ test: true, warm: true, channel: 'site-chat', messages: [{ role: 'user', content: q.q }], participant: { id: `precache-${q.id}` },
      clientKey: `precache:${q.id}`, onEvent: () => {} }).catch((e) => ({ status: 'error', error: e?.message }));
    if (r?.status === 'limited') { out.stopped = r.limit || 'limited'; break; }
    if (await d.cache.has(q.q, key).catch(() => false)) out.warmed++;
    else out.not_stored.push({ id: q.id, q: q.q, status: r?.status ?? null, error: r?.error ?? null });
  }
  if (dry) out.would_warm = qs.length - out.fresh;
  await d.log('anis', `anis-precache ${bankId}${dry ? ' (dry)' : ''}: ${dry ? `${out.would_warm} to warm, ${out.fresh} fresh` : `${out.warmed} warmed, ${out.fresh} already fresh, ${out.not_stored.length} not stored`}${out.stopped ? ` · stopped: ${out.stopped}` : ''}`).catch(() => {});
  return out;
}
