// App wiring for the HyPE batch runner: real rag, Anthropic batch transport, spend policy + budget gate, ai_usage metering.
// Used by the grounding hype stage (HYPE_MODE=batch) and scripts/pipeline/hype-batch.mjs. Deps: rag-adapter, ai.js, queue budget.
import { rag, langOf } from '../rag-adapter/index.js';
import { assertSpendAllowed } from '../rag-adapter/usage.js';
import { anthropicBatchTransport } from '../ai.js';
import { logAIUsage } from '../ai-services.js';
import { budgetStatus } from './queue.js';
import { logger } from '../logger.js';
import { createHypeBatch } from './hype-batch.js';
import { queueFollowIndex } from '../ops/index-follow.js';

export const makeHypeBatch = (over = {}, caller = 'hype-batch') => createHypeBatch({
  rag, transport: anthropicBatchTransport({ stage: 'hype' }), langOf, assertSpend: assertSpendAllowed, log: logger,
  // settled questions go straight to the hype vectors (hype-index on the indexer; the follow loop is the backstop)
  onSettled: (docIds) => queueFollowIndex('hype', docIds, 'hype-settle', { log: logger }),
  budgetOver: async () => ((await budgetStatus().catch(() => [])) || []).some((b) => b.provider === 'anthropic' && b.over),
  meter: ({ model, docId, ok, usage, error }) => logAIUsage(ok
    ? { provider: 'anthropic', model, serviceType: 'grounding:hype', caller, documentId: docId, batch: true, success: true,
        promptTokens: usage.input + usage.cacheRead + usage.cacheWrite, completionTokens: usage.output, cachedTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite, totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + usage.output }
    : { provider: 'anthropic', model, serviceType: 'grounding:hype', caller, documentId: docId, batch: true, success: false, errorMessage: error }),
  ...over,
});

/** The HyPE program's quality checks as a Message Batch (half price): the stronger judge model, billed to the program (caller),
 *  so the checks live under the same monthly ceiling as the questions they check. → { create, status, results, meter } */
export function makeHypeChecks(caller = 'hype-program') {
  const t = anthropicBatchTransport({ stage: 'hype-judge', caller });
  return { create: t.create, status: t.status, results: t.results,
    meter: ({ model, docId = null, ok, usage, error }) => logAIUsage(ok
      ? { provider: 'anthropic', model, serviceType: 'hype-judge', caller, documentId: docId, batch: true, success: true,
          promptTokens: usage.input + usage.cacheRead + usage.cacheWrite, completionTokens: usage.output, cachedTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite, totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + usage.output }
      : { provider: 'anthropic', model, serviceType: 'hype-judge', caller, documentId: docId, batch: true, success: false, errorMessage: error }) };
}
