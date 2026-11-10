// Server-side twin of POST /concepts/judge-hype: a second model grades one paragraph's questions with the score-hype RUBRIC.
// Spend lands on the ambient AI context (hype-program sets billTo). Deps: ai.js chatCompletion, ai-context.js (lazy, injectable).
import { RUBRIC, JUDGE_MODEL, judgeUser } from './hype-rubric.js';

/** → { questions:[{i,searchable,answered,distinct,same_as,why}], missed:[] } or { questions:[], missed:[], unparsed } */
export async function judgeHype({ docId, paragraph, original = null, questions, model = JUDGE_MODEL, provider = 'anthropic', caller = 'hype-program' }, deps = {}) {
  const chat = deps.chatCompletion || (await import('../ai.js')).chatCompletion;
  const withCtx = deps.withAIContext || (await import('../ai-context.js')).withAIContext;
  const reply = await withCtx({ docId: Number(docId), stage: 'hype-judge', originalLang: original ? 'fa' : null, caller },
    () => chat([{ role: 'system', content: RUBRIC }, { role: 'user', content: judgeUser(paragraph, original, questions) }], { provider, model, temperature: 0, maxTokens: 4000 }));
  return parseJudge(String(reply?.content ?? reply?.text ?? ''));
}

/** The judge's reply text → its verdict (same shape as judgeHype); unparseable → { unparsed }. Shared with the batched checks. */
export function parseJudge(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return { questions: [], missed: [], unparsed: String(text || '').slice(0, 200) };
  try { return JSON.parse(m[0]); } catch { return { questions: [], missed: [], unparsed: m[0].slice(0, 200) }; }
}
