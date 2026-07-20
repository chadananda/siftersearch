#!/usr/bin/env node
// Deep Research Worker — async background processor for pre-computed passage sets.
// Polls deep_research_queue for pending tasks, runs full LLM research passes,
// stores curated quotes in deep_research_quotes, syncs to Meilisearch.
// PM2 process name: siftersearch-deep-research
// Single-writer invariant: only this process writes deep_research* tables.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import {
  getPendingResearchTasks,
  claimQueueTask,
  finishQueueTask,
  runDeepResearch,
} from '../lib/deep-research.js';
import { hybridSearch } from '../lib/search.js';
import { chatCompletion } from '../lib/ai.js';
import { getModel } from '../lib/model-registry.js';

// Deep-research runs on DeepSeek. Anthropic is locked to grounding the approved Persian plan books (see
// anthropic-policy.js) — this worker is not an authorised Anthropic caller, so it uses the gated ai.js client
// with a DeepSeek model. deepseek-v4-pro = the reasoning tier (thinking on), appropriate for multi-step research.
const DEFAULT_MODEL = 'deepseek-v4-pro';

const POLL_INTERVAL_MS = 30_000;
const IDLE_SLEEP_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

let isShuttingDown = false;
let heartbeatTimer = null;
let currentResearchId = null;

// makeChatFn returns a chat function bound to a cost accumulator object. It funnels through the gated ai.js
// chatCompletion (DeepSeek) — which logs ai_usage itself — and returns an Anthropic-SHAPED object so the
// downstream research code (which reads response.content[0].text) is unchanged. The caller field tags the step.
export function makeChatFn(acc, researchId) {
  return async function chat(messages, opts = {}) {
    const caller = opts.caller || 'deep-research';
    const model = opts.model || DEFAULT_MODEL;
    const res = await chatCompletion(messages, {
      provider: 'deepseek', model, maxTokens: opts.max_tokens || 4096, thinking: true,
      caller, serviceType: 'deep-research',
    });
    const inputTok = res.usage?.promptTokens || 0;
    const outputTok = res.usage?.completionTokens || 0;
    const p = getModel(model)?.pricing || { input: 0, output: 0 };
    const cost = (inputTok * p.input + outputTok * p.output) / 1000;   // registry pricing is per 1K tokens
    acc.inputTokens += inputTok;
    acc.outputTokens += outputTok;
    acc.costUsd += cost;
    acc.breakdown[caller] = acc.breakdown[caller] || { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
    acc.breakdown[caller].inputTokens += inputTok;
    acc.breakdown[caller].outputTokens += outputTok;
    acc.breakdown[caller].costUsd += cost;
    acc.breakdown[caller].calls += 1;
    // ai_usage is logged by chatCompletion (the shared meter) — no inline insert here, to avoid double-counting.
    // Return the Anthropic response shape the callers expect.
    return { content: [{ text: res.content }], stop_reason: res.finishReason || 'end_turn',
      usage: { input_tokens: inputTok, output_tokens: outputTok } };
  };
}

async function search(q, opts = {}) {
  return hybridSearch(q, {
    limit: opts.limit || 30,
    semanticRatio: opts.semanticRatio || 0.6,
    filters: opts.filters || {},
  });
}

function startHeartbeat(researchId) {
  currentResearchId = researchId;
  heartbeatTimer = setInterval(async () => {
    if (currentResearchId) {
      await query('UPDATE deep_research SET heartbeat_at = ? WHERE id = ?', [new Date().toISOString(), currentResearchId]).catch(() => {});
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  currentResearchId = null;
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

async function processOne(task) {
  logger.info({ taskId: task.id, researchId: task.research_id, question: task.canonical_question }, 'Processing deep research task');
  const claimed = await claimQueueTask(task.id);
  if (!claimed) {
    logger.info({ taskId: task.id }, 'Task already claimed by another worker — skipping');
    return;
  }
  startHeartbeat(task.research_id);
  const costAcc = { inputTokens: 0, outputTokens: 0, costUsd: 0, breakdown: {} };
  try {
    const chat = makeChatFn(costAcc, task.research_id);
    await runDeepResearch(task.research_id, { chat, search, costAcc });
    await finishQueueTask(task.id);
    logger.info({ taskId: task.id, researchId: task.research_id, costUsd: costAcc.costUsd.toFixed(4), inputTokens: costAcc.inputTokens, outputTokens: costAcc.outputTokens }, 'Deep research cost summary');
  } catch (err) {
    await finishQueueTask(task.id, err.message);
    logger.error({ err: err.message, taskId: task.id }, 'Deep research task failed');
  } finally {
    stopHeartbeat();
  }
}

async function workerLoop() {
  while (!isShuttingDown) {
    try {
      const tasks = await getPendingResearchTasks(1);
      if (tasks.length) {
        await processOne(tasks[0]);
      } else {
        await new Promise(r => setTimeout(r, IDLE_SLEEP_MS));
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Deep research worker loop error');
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  logger.info('Deep research worker shut down');
}

process.on('SIGTERM', () => { isShuttingDown = true; stopHeartbeat(); });
process.on('SIGINT', () => { isShuttingDown = true; stopHeartbeat(); });

const _scriptPath = fileURLToPath(import.meta.url);
// PM2 uses dynamic import() for ESM — process.argv[1] is ProcessContainerFork.js.
// Check pm_exec_path (set by PM2) or direct argv match.
const isMain = process.argv[1] === _scriptPath ||
               process.env.pm_exec_path === _scriptPath ||
               process.argv[1]?.endsWith('deep-research-worker.js');
if (isMain) {
  logger.info('Deep research worker starting');
  runMigrations().then(workerLoop).catch(err => {
    logger.error({ err: err.message }, 'Deep research worker startup failed');
    process.exit(1);
  });
}
