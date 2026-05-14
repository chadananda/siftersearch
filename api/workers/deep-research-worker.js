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
import Anthropic from '@anthropic-ai/sdk';

// Sonnet 4.6 pricing per 1K tokens (USD)
const SONNET_PRICING = { input: 0.003, output: 0.015 };

const POLL_INTERVAL_MS = 30_000;
const IDLE_SLEEP_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

let isShuttingDown = false;
let heartbeatTimer = null;
let currentResearchId = null;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// makeChatFn returns a chat function bound to a cost accumulator object.
// Each call logs to ai_usage and increments acc.inputTokens/outputTokens/costUsd.
// The caller field tags which pipeline step made the call for per-step breakdown.
export function makeChatFn(acc, researchId) {
  return async function chat(messages, opts = {}) {
    const caller = opts.caller || 'deep-research';
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: opts.max_tokens || 4096,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: userMsgs,
    });
    const inputTok = response.usage?.input_tokens || 0;
    const outputTok = response.usage?.output_tokens || 0;
    const cost = (inputTok * SONNET_PRICING.input + outputTok * SONNET_PRICING.output) / 1000;
    acc.inputTokens += inputTok;
    acc.outputTokens += outputTok;
    acc.costUsd += cost;
    acc.breakdown[caller] = acc.breakdown[caller] || { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
    acc.breakdown[caller].inputTokens += inputTok;
    acc.breakdown[caller].outputTokens += outputTok;
    acc.breakdown[caller].costUsd += cost;
    acc.breakdown[caller].calls += 1;
    // Log to ai_usage inline — avoids importing ai-services.js (heavy module with client init)
    query(
      `INSERT INTO ai_usage (provider, model, service_type, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, caller, success, job_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['anthropic', 'claude-sonnet-4-6', 'chat', inputTok, outputTok, inputTok + outputTok, cost, caller, 1, researchId ? String(researchId) : null]
    ).catch(err => logger.warn({ err: err.message }, 'ai_usage log failed'));
    return response;
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
  await claimQueueTask(task.id);
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
