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

const POLL_INTERVAL_MS = 30_000;
const IDLE_SLEEP_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

let isShuttingDown = false;
let heartbeatTimer = null;
let currentResearchId = null;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function chat(messages) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages,
  });
  return response;
}

async function search(q, opts = {}) {
  return hybridSearch(q, { limit: opts.limit || 30, semanticRatio: opts.semanticRatio || 0.6 });
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
  try {
    await runDeepResearch(task.research_id, { chat, search });
    await finishQueueTask(task.id);
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

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  logger.info('Deep research worker starting');
  runMigrations().then(workerLoop).catch(err => {
    logger.error({ err: err.message }, 'Deep research worker startup failed');
    process.exit(1);
  });
}
