// What the reader sees while Anís works: stage → progress words. Pure. The "what I understood" line is NOT templated here —
// it is Anís's own restatement from Jev's decision (understanding.js, W3 11-03); until it arrives only the neutral word shows.
const STAGE_TEXT = { understand: 'Thinking…', search: 'Searching the library…', read: 'Reading the passages…', craft: 'Writing the answer…' };

export const progressText = (stage) => STAGE_TEXT[stage] ?? null;
export const NEUTRAL = STAGE_TEXT.understand;

// Time and cost of one conversation, from its rounds' path.meta (usd, latency_ms, calls). Missing numbers count as 0.
export const conversationTotals = (rounds = []) => rounds.reduce((t, r) => {
  const m = r?.meta ?? r?.path?.meta ?? {};
  return { turns: t.turns + 1, usd: +(t.usd + (Number(m.usd) || 0)).toFixed(6), ms: t.ms + (Number(m.latency_ms) || 0), calls: t.calls + (Number(m.calls) || 0) };
}, { turns: 0, usd: 0, ms: 0, calls: 0 });
