#!/usr/bin/env node
// Periodic verification: how is the Sonnet HyPE bootstrap progressing?
// Outputs a short status report + 3 random quality samples.
//
// Usage:
//   node scripts/verify-hype-progress.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'sifter.db');
const db = new Database(DB_PATH, { readonly: true });

console.log('=' .repeat(70));
console.log(`HyPE Bootstrap Progress — ${new Date().toISOString()}`);
console.log('='.repeat(70));

// ── 1. Batch status summary ────────────────────────────────────────────────
console.log('\n## Anthropic Batches\n');
const byStatus = db.prepare(`
  SELECT status, COUNT(*) AS n,
         SUM(request_count) AS req,
         SUM(succeeded_count) AS done,
         SUM(failed_count) AS failed,
         SUM(cost_input_tokens) AS in_tok,
         SUM(cost_output_tokens) AS out_tok
  FROM enrichment_batches
  GROUP BY status
`).all();
if (byStatus.length === 0) {
  console.log('  (no batches yet)');
} else {
  console.log('  Status        Batches  Requests  Succeeded  Failed   InTokens   OutTokens');
  console.log('  ' + '-'.repeat(76));
  for (const r of byStatus) {
    console.log(
      '  ' + (r.status || '?').padEnd(13),
      String(r.n).padStart(7),
      String(r.req || 0).padStart(9),
      String(r.done || 0).padStart(10),
      String(r.failed || 0).padStart(7),
      String(r.in_tok || 0).padStart(10),
      String(r.out_tok || 0).padStart(11)
    );
  }
}

// ── 2. Pending queue ──────────────────────────────────────────────────────
const pending = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN batch_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
    MIN(tier) AS lowest_tier,
    MAX(tier) AS highest_tier
  FROM enrichment_pending
`).get();
console.log('\n## Pending Queue');
console.log(`  Total: ${pending.total}, unassigned: ${pending.unassigned}, tier range: ${pending.lowest_tier}..${pending.highest_tier}`);

// ── 3. Content table progress ─────────────────────────────────────────────
const tierProgress = db.prepare(`
  SELECT
    SUM(CASE WHEN c.hyp_thesis IS NOT NULL THEN 1 ELSE 0 END) AS thesis_done,
    SUM(CASE WHEN c.hyp_questions IS NOT NULL THEN 1 ELSE 0 END) AS questions_done,
    COUNT(*) AS total
  FROM content c
  WHERE c.deleted_at IS NULL
`).get();
console.log('\n## Content Enrichment State');
console.log(`  Total paragraphs: ${tierProgress.total}`);
console.log(`  With hyp_thesis:    ${tierProgress.thesis_done} (${(tierProgress.thesis_done / tierProgress.total * 100).toFixed(2)}%)`);
console.log(`  With hyp_questions: ${tierProgress.questions_done} (${(tierProgress.questions_done / tierProgress.total * 100).toFixed(2)}%)`);

// ── 4. Cost so far ─────────────────────────────────────────────────────────
const costRow = db.prepare(`
  SELECT SUM(cost_input_tokens) AS in_tok, SUM(cost_output_tokens) AS out_tok
  FROM enrichment_batches WHERE provider = 'anthropic'
`).get();
const inTok = costRow.in_tok || 0;
const outTok = costRow.out_tok || 0;
const cost = (inTok / 1e6) * 1.50 + (outTok / 1e6) * 7.50; // Sonnet batch pricing
console.log('\n## Cost So Far (Anthropic batch pricing)');
console.log(`  Input tokens:  ${inTok.toLocaleString()}`);
console.log(`  Output tokens: ${outTok.toLocaleString()}`);
console.log(`  Estimated cost: $${cost.toFixed(2)}`);

// ── 5. 3 random quality samples ───────────────────────────────────────────
console.log('\n## Quality Samples (3 random paragraphs with hyp_thesis)\n');
const samples = db.prepare(`
  SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.hyp_thesis, c.hyp_questions,
         d.title, d.author
  FROM content c
  JOIN docs d ON d.id = c.doc_id
  WHERE c.hyp_thesis IS NOT NULL AND c.deleted_at IS NULL
  ORDER BY RANDOM() LIMIT 3
`).all();
if (samples.length === 0) {
  console.log('  (no samples yet — no paragraphs have hyp_thesis populated)');
} else {
  for (const s of samples) {
    console.log('  ─'.repeat(34));
    console.log(`  Doc ${s.doc_id} para ${s.paragraph_index}: "${(s.title || '').slice(0, 60)}" by ${(s.author || '').slice(0, 40)}`);
    console.log(`  TEXT:    ${(s.text || '').slice(0, 200).replace(/\s+/g, ' ')}...`);
    console.log(`  THESIS:  ${(s.hyp_thesis || '').slice(0, 250)}`);
    const qs = (s.hyp_questions || '').split('\n').filter(q => q.trim());
    console.log(`  Q1:      ${qs[0] || '(missing)'}`);
    console.log(`  Q2:      ${qs[1] || '(missing)'}`);
    console.log(`  Q3:      ${qs[2] || '(missing)'}`);
    console.log(`  Q4:      ${qs[3] || '(missing)'}`);
    console.log(`  Q5:      ${qs[4] || '(missing)'}`);
    console.log();
  }
}

// ── 6. Recent worker activity ─────────────────────────────────────────────
const recent = db.prepare(`
  SELECT id, model, status, request_count, succeeded_count,
         submitted_at, completed_at, notes, external_batch_id IS NOT NULL AS has_external
  FROM enrichment_batches
  ORDER BY id DESC LIMIT 5
`).all();
console.log('\n## 5 Most Recent Batches');
console.log('  ID  Status        Reqs    Done   ExtId  Submitted             Completed             Notes');
console.log('  ' + '-'.repeat(105));
for (const r of recent) {
  console.log(
    '  ' + String(r.id).padStart(2),
    (r.status || '?').padEnd(13),
    String(r.request_count || 0).padStart(5),
    String(r.succeeded_count || 0).padStart(6),
    r.has_external ? '  ✓  ' : '  ✗  ',
    (r.submitted_at || '').padEnd(20),
    (r.completed_at || '').padEnd(20),
    (r.notes || '').slice(0, 30)
  );
}

console.log('\n' + '='.repeat(70));
db.close();
