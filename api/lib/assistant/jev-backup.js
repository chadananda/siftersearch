// Jev backup (Chad 11-10: "search it for “private property”" after a title card timed out twice → a library-wide essay). When
// Jev's triage and/or strategy call time out, ONE Haiku call answers the SAME typed options (triage kind, lookup kind, outcome,
// depth; the strategy catalog) read with the history — the turn's intent stays a model's, never word rules. Jev's limits are
// unchanged. Deps: role-client (role anis-jev-backup, injectable llm), triage option texts, request-features (structure only).
import { roleCreate } from '../role-client.js';
import { KINDS, LOOKUP_KINDS, LOOKUP_Q, OUTCOMES, DEPTHS, ACCEPT_Q, DOCUMENTS, DOCUMENT_Q, DELIVERIES, DELIVERY_Q } from './triage.js';
import { turnFacts } from './request-features.js';

export const BACKUP_ROLE = 'anis-jev-backup';
export const BACKUP_TIMEOUT_MS = 6000;

export const BACKUP_SYSTEM = `You stand in for a classifier that timed out. You read a conversation between a reader and Anís, a research assistant over a library of sacred texts and their history, and answer typed questions about the reader's LATEST message, read with the conversation. For each question choose exactly ONE option key from its list and give your confidence (0.0-1.0). Never answer the message itself.
Answer with ONE JSON object and nothing else: {"<question>":{"choice":"<option key>","confidence":0.0-1.0}, ...} for every question asked, plus "named_work": the title of a work the latest message itself names, or null.`;

const opts = (o) => Object.entries(o).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
const firstJson = (t) => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };
const pick = (a, keys) => (a && typeof a === 'object' && keys.includes(a.choice) ? { choice: a.choice, confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0)), by: 'haiku' } : null);

/** The typed questions put to the backup (the same option texts Jev reads). Pure. */
export function backupQuestions({ triage = true, strategies = null, first = true } = {}) {
  const q = {};
  if (triage) {
    q.kind = { ask: 'What kind of message is the latest user turn?', options: KINDS };
    q.lookup = { ask: LOOKUP_Q, options: LOOKUP_KINDS };
    q.outcome = { ask: 'Does the latest user turn call for a library search (or an answer), a short question back, or neither?', options: OUTCOMES };
    q.depth = { ask: 'How deep should the reply to the latest user turn go?', options: DEPTHS };
    q.document = { ask: DOCUMENT_Q, options: first ? { text: DOCUMENTS.text, pdf_new: DOCUMENTS.pdf_new } : DOCUMENTS };
    q.delivery = { ask: DELIVERY_Q, options: DELIVERIES };
    if (!first) q.accepts_offer = { ask: ACCEPT_Q, options: { yes: 'it accepts the offer or supplies what was asked for', no: 'it does not' } };
  }
  if (strategies && Object.keys(strategies).length) q.strategy = { ask: 'What does the latest user message, read in the context of the thread, ask the assistant to do? When no strategy is for what it asks, choose unmatched.', options: strategies };
  return q;
}

/** The prompt's user part: the thread, the reader, the work in focus, the questions. Pure. */
export function backupPrompt({ messages = [], card = null, focus = null, questions }) {
  const thread = messages.slice(-6).map((m) => `${m.role}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, 900)}`).join('\n');
  const qs = Object.entries(questions).map(([k, v]) => `${k}: ${v.ask}\n${opts(v.options)}`).join('\n\n');
  return `READER: ${card || 'unknown'}\n${focus ? `THE WORK IN FOCUS (the book the assistant's previous reply gave): ${focus.title}\n` : ''}CONVERSATION (latest last):\n${thread}\n\nQUESTIONS:\n${qs}`;
}

/** The backup's JSON → { tri, strategy } in the shapes triageMessage / chooseStrategy return (null where not asked or invalid). Pure. */
export function readBackup(j, { questions, messages = [], spans = [], namedUnits = null }) {
  if (!j || typeof j !== 'object') return null;
  const keys = (k) => Object.keys(questions[k]?.options || {});
  let tri = null, strategy = null;
  if (questions.kind) {
    const facts = turnFacts(messages);
    const kind = pick(j.kind, keys('kind'));
    if (kind) {
      const features = { first: facts.first, turn: facts.turn, words: facts.words, short: facts.words <= 6, quoted: facts.quoted.length, script: facts.script };
      const acc = pick(j.accepts_offer, ['yes', 'no']);
      // malicious / stop / complete are not asked: the backup only restores what the turn would otherwise lose to fail-open research
      tri = { malicious: 0, complete: 1, stop_request: 0, kind, stance: null, lookup: pick(j.lookup, keys('lookup')), outcome: pick(j.outcome, keys('outcome')),
        depth: pick(j.depth, keys('depth')), document: pick(j.document, keys('document')), delivery: pick(j.delivery, keys('delivery')), features, by: 'haiku',
        ...(facts.first ? { reaction: { choice: 'none', confidence: 1, by: 'first-message' }, follow_up: 0, accepts_offer: 0 }
          : { reaction: null, follow_up: null, accepts_offer: acc ? (acc.choice === 'yes' ? acc.confidence : 1 - acc.confidence) : 0 }) };
    }
  }
  if (questions.strategy) {
    const s = pick(j.strategy, keys('strategy'));
    const work = typeof j.named_work === 'string' && j.named_work.trim() ? j.named_work.trim().slice(0, 200) : null;
    const answers = Object.fromEntries(Object.keys(questions).filter((k) => /^(?:kind|title)_\d+$/.test(k)).map((k) => [k, pick(j[k], keys(k))]).filter(([, v]) => v));
    const named = namedUnits && spans.length ? namedUnits(answers, spans, messages.filter((m) => m.role === 'user').at(-1)?.content || '') : {};
    if (s) strategy = { strategy: s, sides: [], sources: {}, units: { ...(work ? { named_work: work } : {}), ...named }, decisions: [], patch: null, by: 'haiku' };
  }
  return tri || strategy ? { tri, strategy } : null;
}

export const CREDIT_ROLE = 'anis-jev-backup-credit';
// Anthropic refusing for NO CREDIT (its billing, not our caps) → the same question once to CREDIT_ROLE; any other error throws.
export const defaultLlm = async ({ system, user }, create = roleCreate) => {
  const params = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 600, temperature: 0, response_format: { type: 'json_object' } };
  const r = await create(BACKUP_ROLE, params, { timeout: BACKUP_TIMEOUT_MS })
    .catch((err) => { if (!err?.credit) throw err; return create(CREDIT_ROLE, params, { timeout: BACKUP_TIMEOUT_MS }); });
  return { text: r?.choices?.[0]?.message?.content || '' };
};

/**
 * ONE Haiku call for what Jev could not answer in time. triage: re-ask the triage questions; strategy: true → the active catalog,
 * or an options object. → { tri, strategy, ms } | null. Never throws.
 */
export async function jevBackup({ messages = [], card = null, focus = null, triage = false, strategy = false, llm = defaultLlm } = {}) {
  const t0 = Date.now();
  try {
    const sc = strategy ? await import('./strategy-choice.js') : null;
    const strategies = strategy === true ? sc.strategyOptions() : strategy || null;
    // the name spans' kind/title questions Jev's strategy call carries: a timed-out turn keeps its named work or person (11-12: "the
    // Remover of Difficulties prayer" lost its name to the backup and the prayer search ran the whole sentence in every tradition)
    const spans = sc ? sc.nameSpansOf(messages) : [];
    const sq = Object.fromEntries(Object.entries(sc ? sc.spanQuestions(spans) : {}).map(([k, v]) => [k, { ask: v.instructions, options: v.criteria }]));
    const questions = { ...backupQuestions({ triage, strategies, first: turnFacts(messages).first }), ...(strategies ? sq : {}) };
    if (!Object.keys(questions).length) return null;
    const r = await llm({ system: BACKUP_SYSTEM, user: backupPrompt({ messages, card, focus, questions }) });
    const out = readBackup(r?.json ?? firstJson(r?.text), { questions, messages, spans, namedUnits: sc?.namedUnits });
    return out ? { ...out, ms: Date.now() - t0 } : null;
  } catch (err) { console.warn('anis jev backup failed', err?.message); return null; }
}
