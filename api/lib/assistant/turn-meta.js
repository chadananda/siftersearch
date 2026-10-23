// What one Anís turn WAS, for the conversation digest (Chad 10-22: "every Anís conversation … exactly as seen by the
// recipient so I can tweak"): its type, the models it called, what it cost and how long it took. The cost comes from
// the per-turn meter (ai-context `meter`, filled by ai-services logAIUsage). Pure except meterTurn (an ai-context scope).
import { withAIContext, currentAIContext } from '../ai-context.js';

/** The turn's type in words, from its status and path. Pure. */
export function turnType({ status, gate, kind, recipe, format } = {}) {
  if (status === 'reading' || format === 'reading-guide') return 'reading guide';
  if (status === 'tarpit' || gate === 'tarpit') return 'triage: tarpit';
  if (status === 'canned') return `canned${kind ? ` (${kind})` : ''}`;
  if (status === 'failed') return 'failed';
  return { define: 'CTAI term study', source: 'source hunt', original: 'original text', research: 'research answer',
    language: 'language answer', position: 'position answer' }[recipe] || (recipe ? `answer (${recipe})` : 'answer');
}

/** The meter's calls → { models, usd, calls }. Pure. */
export function meterSummary(calls = []) {
  const models = [...new Set(calls.map((c) => c.model).filter(Boolean))];
  return { models, usd: Math.round(calls.reduce((s, c) => s + (Number(c.usd) || 0), 0) * 1e5) / 1e5, calls: calls.length };
}

/** Run fn with a fresh meter unless one is already open (an outer scope measures the whole turn). → { result, meter, ms } */
export async function meterTurn(fn) {
  const t0 = Date.now();
  const outer = currentAIContext().meter;
  if (Array.isArray(outer)) { const result = await fn(outer); return { result, meter: outer, ms: Date.now() - t0 }; }
  const meter = [];
  const result = await withAIContext({ meter }, () => fn(meter));
  return { result, meter, ms: Date.now() - t0 };
}

/** The record stored with a reply. Pure. */
export function turnMeta({ status, path = {}, meter = [], ms = null }) {
  const m = meterSummary(meter);
  return { type: turnType({ status, ...path }), models: m.models, usd: m.usd, calls: m.calls, latency_ms: ms };
}
