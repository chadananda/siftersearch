// What the reader sees while Anís works: a deterministic "what I understood" line (no LLM) and stage → progress words. Pure.
const STAGE_TEXT = { search: 'Searching the library…', read: 'Reading the passages…', craft: 'Writing the answer…' };
const SHORT = 90;

export const progressText = (stage) => STAGE_TEXT[stage] ?? null;

const clip = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > SHORT ? `${t.slice(0, SHORT).replace(/\s\S*$/, '')}…` : t; };

// route: { action, kind } from routeTriage. Canned / refuse routes answer at once, so they get no line.
export const understoodLine = (route, text) => {
  if (!route || route.action === 'canned' || route.action === 'refuse') return null;
  const q = clip(text);
  if (!q) return null;
  return `I understand you're asking: “${q}” — I'll look in the library.`;
};

// Time and cost of one conversation, from its rounds' path.meta (usd, latency_ms, calls). Missing numbers count as 0.
export const conversationTotals = (rounds = []) => rounds.reduce((t, r) => {
  const m = r?.meta ?? r?.path?.meta ?? {};
  return { turns: t.turns + 1, usd: +(t.usd + (Number(m.usd) || 0)).toFixed(6), ms: t.ms + (Number(m.latency_ms) || 0), calls: t.calls + (Number(m.calls) || 0) };
}, { turns: 0, usd: 0, ms: 0, calls: 0 });
