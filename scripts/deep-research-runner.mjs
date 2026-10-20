#!/usr/bin/env node
// Deep Research CLI runner — manually queue and process research for specific questions.
// Usage:
//   node scripts/deep-research-runner.mjs "Why does God allow suffering?"
//   node scripts/deep-research-runner.mjs --list            # list queued/pending
//   node scripts/deep-research-runner.mjs --run <id>        # run specific record
//   node scripts/deep-research-runner.mjs --pending         # process all pending
//   node scripts/deep-research-runner.mjs --status          # show stats

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import * as repo from '../api/lib/repos/deep-research-repo.js';
import { runMigrations } from '../api/lib/migrations.js';
import {
  recordQuestionHit,
  getPendingResearchTasks,
  claimQueueTask,
  finishQueueTask,
  runDeepResearch,
  getDeepResearchQuotes,
} from '../api/lib/deep-research.js';
import { hybridSearch } from '../api/lib/search.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function chat(messages) {
  return anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages });
}

async function search(q, opts = {}) {
  return hybridSearch(q, { limit: opts.limit || 30, semanticRatio: opts.semanticRatio || 0.6 });
}

async function main() {
  await runMigrations();
  const args = process.argv.slice(2);

  if (args[0] === '--list') {
    const rows = await repo.listByAskCount(50);
    console.table(rows);
    return;
  }

  if (args[0] === '--status') {
    const stats = await repo.researchStatusCounts();
    console.table(stats);
    const queue = await repo.queueStatusCounts();
    console.log('\nQueue:');
    console.table(queue);
    return;
  }

  if (args[0] === '--run' && args[1]) {
    const id = parseInt(args[1], 10);
    const record = await repo.getResearchById(id);
    if (!record) { console.error('Record not found:', id); process.exit(1); }
    console.log(`Running deep research for: "${record.canonical_question}"`);
    await repo.setStatus(id, 'queued');
    await runDeepResearch(id, { chat, search });
    const quotes = await getDeepResearchQuotes(id);
    console.log(`\nComplete. ${quotes.length} quotes selected.`);
    for (const q of quotes.slice(0, 5)) {
      console.log(`  [${q.rank}] auth:${q.authority} ${q.religion} — "${(q.text || '').slice(0, 100)}..."`);
    }
    return;
  }

  if (args[0] === '--pending') {
    const tasks = await getPendingResearchTasks(20);
    if (!tasks.length) { console.log('No pending tasks.'); return; }
    console.log(`Processing ${tasks.length} pending tasks...`);
    for (const task of tasks) {
      console.log(`\nProcessing: "${task.canonical_question}" (id: ${task.research_id})`);
      await claimQueueTask(task.id);
      try {
        await runDeepResearch(task.research_id, { chat, search });
        await finishQueueTask(task.id);
        console.log('  Complete.');
      } catch (err) {
        await finishQueueTask(task.id, err.message);
        console.error('  Failed:', err.message);
      }
    }
    return;
  }

  // Default: queue a question
  const question = args.join(' ').trim();
  if (!question) {
    console.log(`Usage:
  node deep-research-runner.mjs "question"     # queue question for research
  node deep-research-runner.mjs --list          # list all records
  node deep-research-runner.mjs --status        # show stats
  node deep-research-runner.mjs --run <id>      # run specific record now
  node deep-research-runner.mjs --pending       # process all pending tasks`);
    return;
  }

  console.log(`Queuing research for: "${question}"`);
  await recordQuestionHit(question);
  await recordQuestionHit(question); // two hits to trigger auto-queue
  const rows = await repo.findByQuestion(question.trim());
  if (rows.length) {
    const r = rows[0];
    if (r.status !== 'queued' && r.status !== 'in_progress') {
      await repo.queueResearchTask(r.id, 10);
    }
    console.log(`Queued record id=${r.id}. Run with: node scripts/deep-research-runner.mjs --run ${r.id}`);
  }
}

// EXIT when done: the imported search/progress modules keep refresh timers alive, so a returned main() never ended — a
// `--status` from 10-11 ran their 10-11 table scans (the retired graph_enriched count, 26–83 s) for 8 days (found 10-19)
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
