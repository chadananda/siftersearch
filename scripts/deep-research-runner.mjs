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

import { queryOne, queryAll, query } from '../api/lib/db.js';
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
    const rows = await queryAll("SELECT id, canonical_question, status, ask_count, total_selected FROM deep_research ORDER BY ask_count DESC LIMIT 50");
    console.table(rows);
    return;
  }

  if (args[0] === '--status') {
    const stats = await queryAll("SELECT status, COUNT(*) as count FROM deep_research GROUP BY status");
    console.table(stats);
    const queue = await queryAll("SELECT status, COUNT(*) as count FROM deep_research_queue GROUP BY status");
    console.log('\nQueue:');
    console.table(queue);
    return;
  }

  if (args[0] === '--run' && args[1]) {
    const id = parseInt(args[1], 10);
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [id]);
    if (!record) { console.error('Record not found:', id); process.exit(1); }
    console.log(`Running deep research for: "${record.canonical_question}"`);
    await query("UPDATE deep_research SET status = 'queued' WHERE id = ?", [id]);
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
  const rows = await queryAll("SELECT id, status, ask_count FROM deep_research WHERE canonical_question = ?", [question.trim()]);
  if (rows.length) {
    const r = rows[0];
    if (r.status !== 'queued' && r.status !== 'in_progress') {
      await query("UPDATE deep_research SET status = 'queued' WHERE id = ?", [r.id]);
      await query('INSERT INTO deep_research_queue (research_id, job_type, status, priority, created_at) VALUES (?, ?, ?, ?, ?)',
        [r.id, 'research', 'pending', 10, new Date().toISOString()]);
    }
    console.log(`Queued record id=${r.id}. Run with: node scripts/deep-research-runner.mjs --run ${r.id}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
