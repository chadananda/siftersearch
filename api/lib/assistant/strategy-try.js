// The full-reply DRY RUN (strategy graph Phase 3): the normal Anís turn (turn.js anisTurn) with the strategy forced to id@version,
// or with no strategy given the CURRENT route (Jev chooses as live). No thread is opened or saved (open/close/fail are no-ops),
// no mail (reports off), no rate limits, no strikes. Every paid call of the turn is billed to `caller` (default improve-replay →
// the improve group, never anis) through the ai-context `billTo` key; its searches are traced with route 'replay:<id@v>'.
// The pinned strategy (ai-context strategyPin) is read by graph.js / templates.js, so a candidate runs although it is not active.
// With a pin, Jev is ALSO asked with the candidate's option text added (the promotion check) — what he picked is returned as
// jev_pick, then the choice is forced (pin.keepChoice: not forced — a decision-step theory runs wherever Jev routes to its graph). → { reply, path, steps, ms, usd, jev_pick, status }. Deps: turn.js, strategy-choice.js.
import { withAIContext } from '../ai-context.js';
import { anisTurn, defaultDeps } from './turn.js';
import { chooseStrategy, strategyOptions } from './strategy-choice.js';

export const REPLAY_CALLER = 'improve-replay';

/** The Jev option set with `row` added (a version of an existing name replaces its text), 'other' kept last. Pure. */
export function optionsWith(row, base = strategyOptions()) {
  const o = Object.fromEntries(Object.entries(base).filter(([k]) => k !== row.name && k !== 'other'));
  o[row.name] = row.description;
  if (base.other) o.other = base.other;
  return o;
}

/**
 * @param {object} a
 * @param {string} a.question
 * @param {Array}  [a.history]   earlier messages [{role, content}]
 * @param {object} [a.pin]       strategy pin (strategy-candidates-repo pinFor); null = the current route
 * @param {string} [a.caller]    who pays (an improve-* caller)
 * @param {object} [a.deps]      { base: turn deps (default turn.js defaultDeps), choose: chooseStrategy, turn: anisTurn }
 */
export async function tryStrategy({ question, history = [], pin = null, caller = REPLAY_CALLER, deps = {} }) {
  if (!question) throw new Error('question is required');
  if (!String(caller).startsWith('improve-')) throw new Error(`a dry run bills an improve-* caller, not ${caller}`);
  const choose = deps.choose || chooseStrategy, turn = deps.turn || anisTurn;
  const base = deps.base || await defaultDeps();
  const options = pin ? optionsWith(pin.row) : null;
  let jevPick = null;
  const strategy = async (messages, o) => {
    const r = await choose(messages, { ...o, ...(options ? { options } : {}) }).catch(() => null);
    jevPick = r?.strategy?.choice ?? null;
    if (!pin || pin.keepChoice) return r;   // keepChoice: Jev routes as live; the pinned graph runs wherever its strategy is chosen
    const forced = { choice: pin.row.name, confidence: 1, distribution: null, forced: true, jev: jevPick };
    return { ...(r || { sides: [], sources: {}, ms: 0, decisions: [] }), strategy: forced,
      decisions: [...(r?.decisions || []), { point: 'strategy:forced', by: 'dry-run', chosen: `${pin.row.id}@${pin.row.version}`, reason: `jev picked ${jevPick ?? 'nothing'}` }] };
  };
  const turnDeps = { ...base, open: async () => null, close: async () => {}, fail: async () => {}, reports: null, limits: null, card: null,
    strikes: { inTarpit: () => false, strike: () => {} }, strategy };
  const meter = [];
  const t0 = Date.now();
  const r = await withAIContext({ billTo: caller, meter, strategyPin: pin, replay: true, trace: { route: `replay:${pin ? `${pin.row.id}@${pin.row.version}` : 'current'}` } },
    () => turn({ messages: [...history, { role: 'user', content: question }], channel: 'widget-chat', deps: turnDeps }));
  const usd = meter.reduce((n, c) => n + (c.usd || 0), 0);
  return { reply: r?.reply ?? '', status: r?.status ?? null, path: r?.path ?? null, steps: r?.path?.steps ?? r?.steps ?? [], ms: Date.now() - t0,
    usd: Math.round(usd * 1e6) / 1e6, jev_pick: jevPick, conversationId: r?.conversationId ?? null };
}
