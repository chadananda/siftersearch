// Blind judge for the bake-off: a STRONGER model scores one reply against the question and the evidence it was given.
// The candidate's name is never shown. Stage 'model-eval' is the only Anthropic allowance it uses (anthropic-policy.js).
import { aiService } from '../ai-services.js';
import { withAIContext } from '../ai-context.js';
import { modelFor } from '../model-roles.js';

export const JUDGE = modelFor('bakeoff-judge');
const SYSTEM = `You grade one assistant reply for a multilingual library of religious texts. Be strict and consistent.
Score each 1-5: faithful (every factual claim is supported by the EVIDENCE; quotations are exact), answers (it addresses
what the person actually asked), language (it is written in the person's language, natural and correct), voice (warm,
plain, respectful of every tradition; no preaching, no flattery, no filler). Then overall 1-10.
Reply with JSON only: {"faithful":n,"answers":n,"language":n,"voice":n,"overall":n,"unsupported":["short claim",...]}`;

export async function judgeReply({ question, evidence, reply, judge = JUDGE }) {
  const ev = evidence.map((p, i) => `[${i + 1}] ${p.source_title || ''} — ${p.source_author || ''}: ${String(p.text || '').slice(0, 700)}`).join('\n').slice(0, 6000);
  const r = await withAIContext({ stage: 'model-eval', caller: 'model-bakeoff/judge' }, () =>
    aiService('quality', { forceRemote: true }).chat([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `PERSON ASKED:\n${question}\n\nEVIDENCE GIVEN TO THE ASSISTANT:\n${ev || '(none)'}\n\nREPLY:\n${String(reply).slice(0, 4000)}` },
    ], { provider: judge.provider, model: judge.model, maxTokens: 400, cacheSystemPrompt: true, caller: 'model-bakeoff/judge' }));
  const m = String(r.content ?? r).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const j = JSON.parse(m[0]); return { ...j, overall: Number(j.overall) || null }; } catch { return null; }
}
