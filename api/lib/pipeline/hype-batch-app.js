// App wiring for the HyPE batch runner: real rag, Anthropic batch transport, spend policy + budget gate, ai_usage metering.
// Used by the grounding hype stage (HYPE_MODE=batch) and scripts/pipeline/hype-batch.mjs. Deps: rag-adapter, ai.js, queue budget.
import { rag, langOf } from '../rag-adapter/index.js';
import { assertSpendAllowed } from '../rag-adapter/usage.js';
import { anthropicBatchTransport } from '../ai.js';
import { logAIUsage } from '../ai-services.js';
import { budgetStatus } from './queue.js';
import { logger } from '../logger.js';
import { createHypeBatch } from './hype-batch.js';

export const makeHypeBatch = (over = {}) => createHypeBatch({
  rag, transport: anthropicBatchTransport({ stage: 'hype' }), langOf, assertSpend: assertSpendAllowed, log: logger,
  budgetOver: async () => ((await budgetStatus().catch(() => [])) || []).some((b) => b.provider === 'anthropic' && b.over),
  meter: ({ model, docId, ok, usage, error }) => logAIUsage(ok
    ? { provider: 'anthropic', model, serviceType: 'grounding:hype', caller: 'hype-batch', documentId: docId, batch: true, success: true,
        promptTokens: usage.input + usage.cacheRead + usage.cacheWrite, completionTokens: usage.output, cachedTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite, totalTokens: usage.input + usage.cacheRead + usage.cacheWrite + usage.output }
    : { provider: 'anthropic', model, serviceType: 'grounding:hype', caller: 'hype-batch', documentId: docId, batch: true, success: false, errorMessage: error }),
  ...over,
});
