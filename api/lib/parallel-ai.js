// Parallel.ai Task API — web research with cited sources (Chad 10-12: the reading guide's depth layer, used only for what
// the library cannot answer). POST /v1/tasks/runs → GET /v1/tasks/runs/:id/result?timeout=… . Fail-closed: no
// PARALLELAI_API_KEY or an error → null. Logged to ai_usage (per-run price: registry task-<processor>). Deps: logger, ai-services.
import { logger } from './logger.js';
import { logAIUsage } from './ai-services.js';

const BASE = 'https://api.parallel.ai/v1';

export const parallelAvailable = () => !!process.env.PARALLELAI_API_KEY;

/** → { text, citations: [{ title, url }] } or null. */
export async function parallelResearch(question, { processor = 'base', timeoutS = 90, caller = 'parallel-research' } = {}) {
  const key = process.env.PARALLELAI_API_KEY;
  if (!key || !question) return null;
  const h = { 'x-api-key': key, 'content-type': 'application/json' };
  try {
    const run = await (await fetch(`${BASE}/tasks/runs`, { method: 'POST', headers: h, body: JSON.stringify({ input: String(question).slice(0, 4000), processor }),
      signal: AbortSignal.timeout(20000) })).json();
    if (!run?.run_id) { logger.warn({ run }, 'parallel: no run id'); return null; }
    const r = await (await fetch(`${BASE}/tasks/runs/${run.run_id}/result?timeout=${timeoutS}`, { headers: h, signal: AbortSignal.timeout((timeoutS + 15) * 1000) })).json();
    // per-run price: the registry's task-<processor> entry prices 1,000 'tokens' = one run
    logAIUsage({ provider: 'parallel', model: `task-${processor}`, serviceType: 'chat', caller, promptTokens: 0, completionTokens: 1000 });
    const out = r?.output;
    const text = typeof out?.content === 'string' ? out.content : out?.content ? JSON.stringify(out.content) : '';
    const citations = (out?.basis || []).flatMap((b) => b.citations || []).map((c) => ({ title: c.title || c.url, url: c.url })).filter((c) => c.url);
    return text.trim() ? { text: text.trim(), citations: [...new Map(citations.map((c) => [c.url, c])).values()].slice(0, 6) } : null;
  } catch (err) {
    logger.warn({ err: err.message }, 'parallel: research failed');
    return null;
  }
}
