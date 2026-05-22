// HyPE enrichment via Anthropic Messages Batches (Sonnet 4.6).
// Used for tier 1-7 (Bahá'í primary doctrinal) where premium-tier
// reasoning is worth the API cost. Tier 8-9 use local Qwen3 in
// scripts/run-enrichment.js.
//
// Architecture:
//   1. enqueueParagraphsForBatch() — populates enrichment_pending from
//      tier 1-7 paragraphs that lack hyp_thesis.
//   2. submitNextBatch() — creates Anthropic batch, marks pending rows
//      with batch_id, transitions enrichment_batches.status='submitted'.
//   3. pollAndProcess() — checks each in_progress batch, downloads
//      results when ready, writes thesis+questions to content table,
//      sets enhanced_synced=0 (Meili will re-pick).
//
// Designed to be called periodically by a PM2 worker. Idempotent — safe
// to interrupt and resume.

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';
import { query, queryAll, queryOne, transaction } from './db.js';
import { getDocTier, isPrimaryDoctrinal, getContextWindow } from './doc-tier.js';

const SONNET_MODEL = 'claude-sonnet-4-6';
// Smaller batches keep per-submission memory pressure manageable on the
// worker (each request carries ~50KB serialized — 2500 × 50KB ≈ 125MB
// during create() call). Anthropic processes batches in parallel, so
// submitting 27 small batches isn't slower than 1 big one.
const MAX_REQUESTS_PER_BATCH = 2500;

// SDK reads ANTHROPIC_API_KEY from env. Lazy-init so worker boots even
// without the key set (key is required at submit time, not import time).
// Long timeout for batch submission — sending 2500 requests serialized is
// a sizable upload, even on a fast connection.
let _client;
function getClient() {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 600000,  // 10 min — generous for large batch submissions
      maxRetries: 2
    });
  }
  return _client;
}

// ─── Prompt construction ─────────────────────────────────────────────────────

function collectionDisplay(doc) {
  // OL docs have a hex hash in collection — not useful to show. Fall back to religion.
  if (/^[0-9a-f]{20,}$/i.test(doc.collection || '')) return doc.religion || 'unknown';
  return doc.collection || doc.religion || 'unknown';
}

function buildSystemPrompt(doc, windowParas, targetPos) {
  const tradition = `${doc.religion || 'unknown'} / ${collectionDisplay(doc)}`;
  const singlePara = windowParas.length === 1;

  if (singlePara) {
    return `You are generating hypothetical questions and a doctrinal thesis for a passage from sacred or scholarly literature.

Document: "${doc.title}" by ${doc.author}
Tradition: ${tradition}
${doc.description ? 'About: ' + doc.description.slice(0, 300) : ''}

Analyze the following passage:

<passage>
${windowParas[0].text}
</passage>`;
  }

  return `You are generating hypothetical questions and a doctrinal thesis for a passage from sacred or scholarly literature.

Document: "${doc.title}" by ${doc.author}
Tradition: ${tradition}
${doc.description ? 'About: ' + doc.description.slice(0, 300) : ''}

You will see ${windowParas.length} paragraphs. The TARGET is [P${targetPos}]. Surrounding paragraphs are CONTEXT (for resolving pronouns and references in the TARGET) — do NOT generate questions about them.

<context>
${windowParas.map((p, i) => `[P${i + 1}]${i + 1 === targetPos ? ' (TARGET)' : ''} ${p.text}`).join('\n\n')}
</context>`;
}

function buildUserPrompt(targetPos, singlePara = false) {
  const target = singlePara ? 'this passage' : `[P${targetPos}] (the TARGET paragraph)`;
  return `For ${target}, produce TWO things:

PART 1 — A single-sentence DOCTRINAL THESIS stating what this paragraph actually teaches as a proposition (not a question). Specific to this paragraph's actual claim — not a generic restatement. 25-50 words.

PART 2 — Exactly 5 hypothetical questions covering these 5 registers (one each):
  1. Conversational — how a thoughtful friend would ask, casual register, 8-15 words
  2. Topical concept — academic framing of the central idea, 8-15 words
  3. Philosophical implication — the doctrinal stake or what follows from this teaching
  4. Cross-tradition / connection — broader debates, traditions, or fields this passage speaks to
  5. Distinctive phrase — a striking phrase from the passage someone might search literally

Use ONLY content from the passage. Surrounding paragraphs (if any) are for pronoun resolution only.

Output format (exactly):
THESIS: <thesis sentence>
Q1: <conversational>
Q2: <topical>
Q3: <philosophical>
Q4: <cross-tradition>
Q5: <distinctive phrase>

Nothing else.`;
}

// ─── Response parsing ────────────────────────────────────────────────────────

const THESIS_RE = /^THESIS:\s*(.+)$/m;
const Q_RE = /^Q[1-5]:\s*(.+)$/gm;

export function parseSonnetResponse(text) {
  if (!text) return null;
  const thesisMatch = text.match(THESIS_RE);
  const thesis = thesisMatch ? thesisMatch[1].trim() : null;
  const questions = [];
  let qm;
  while ((qm = Q_RE.exec(text)) !== null) {
    const q = qm[1].trim();
    if (q.length > 3) questions.push(q);
  }
  Q_RE.lastIndex = 0;
  if (!thesis && questions.length === 0) return null;
  return { thesis, questions };
}

// ─── Queue management ────────────────────────────────────────────────────────

/**
 * Propagate HyPE results to paragraphs whose normalized text already has
 * hyp_questions on another content row. Keyed on normalized_hash — same
 * mechanism as the embedding cache. Free: no API calls, pure SQL.
 *
 * Returns count of rows updated.
 */
export async function propagateHypeFromNormalizedHash({ batchSize = 500 } = {}) {
  // Batched to avoid holding the write lock for minutes on large tables.
  // Each batch updates at most batchSize rows, releases the lock, then loops.
  let totalPropagated = 0;
  let batch;
  do {
    const result = await query(`
      UPDATE content
      SET hyp_questions  = (SELECT src.hyp_questions FROM content src
                            WHERE src.normalized_hash = content.normalized_hash
                              AND src.hyp_questions IS NOT NULL
                              AND src.id != content.id
                            LIMIT 1),
          hyp_thesis     = (SELECT src.hyp_thesis FROM content src
                            WHERE src.normalized_hash = content.normalized_hash
                              AND src.hyp_questions IS NOT NULL
                              AND src.id != content.id
                            LIMIT 1),
          enhanced_synced = 0
      WHERE rowid IN (
        SELECT c.rowid FROM content c
        WHERE c.hyp_questions IS NULL
          AND c.normalized_hash IS NOT NULL
          AND c.normalized_hash IN (
            SELECT normalized_hash FROM content
            WHERE hyp_questions IS NOT NULL
              AND normalized_hash IS NOT NULL
          )
        LIMIT ?
      )
    `, [batchSize]);
    batch = result?.changes ?? 0;
    totalPropagated += batch;
  } while (batch >= batchSize);
  if (totalPropagated > 0) logger.info({ propagated: totalPropagated }, 'propagateHypeFromNormalizedHash: copied HyPE from duplicate paragraphs');
  return totalPropagated;
}

/**
 * Find paragraphs in tier 1-7 docs that need enrichment and add them to
 * enrichment_pending. Idempotent — content_id is the primary key, INSERT OR IGNORE
 * means already-queued rows are untouched.
 *
 * Returns count of newly queued paragraphs.
 */
export async function enqueueParagraphsForBatch({ limit = 100000 } = {}) {
  // Grab all docs for classification. Include OceanLibrary.com docs since primary
  // doctrinal texts (KJV, Rodwell, Tanakh JPS) live there. All other external sites
  // remain excluded — supplementals don't get HyPE and site-only sites use their
  // own SQLite which is structurally invisible here.
  const docs = await queryAll(
    `SELECT id, author, religion, collection, title, description, file_path FROM docs
      WHERE deleted_at IS NULL
        AND (source_site IS NULL OR source_site = 'oceanlibrary.com')`
  );
  const sonnetDocIds = [];
  const tierByDocId = new Map();
  for (const doc of docs) {
    const tier = getDocTier(doc);
    if (tier >= 1 && tier <= 7) {
      sonnetDocIds.push(doc.id);
      tierByDocId.set(doc.id, tier);
    } else if (isPrimaryDoctrinal(doc)) {
      sonnetDocIds.push(doc.id);
      // Store as tier 8 so they queue after Bahá'í primary but before nothing
      tierByDocId.set(doc.id, 8);
    }
  }
  if (sonnetDocIds.length === 0) return 0;

  // Find paragraphs in those docs that don't yet have a thesis.
  // Process in chunks of 500 doc_ids per query to avoid SQLite's
  // expression-tree depth limit on huge IN (...) clauses.
  const CHUNK_SIZE = 500;
  let totalQueued = 0;
  for (let i = 0; i < sonnetDocIds.length && totalQueued < limit; i += CHUNK_SIZE) {
    const chunk = sonnetDocIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const remaining = limit - totalQueued;
    const rows = await queryAll(
      `SELECT id, doc_id FROM content
        WHERE doc_id IN (${placeholders})
          AND hyp_thesis IS NULL
          AND deleted_at IS NULL
          AND COALESCE(is_duplicate, 0) = 0
          AND length(text) >= 100
          AND text NOT LIKE '<%'
          AND text NOT LIKE '![%'
        ORDER BY doc_id, paragraph_index
        LIMIT ?`,
      [...chunk, remaining]
    );
    if (rows.length === 0) continue;

    // INSERT OR IGNORE — content_id is PK so already-queued rows are skipped.
    // Write in sub-chunks of 100 rows with a brief yield between each to avoid
    // holding the SQLite write lock for minutes and starving other writers.
    const WRITE_CHUNK = 100;
    const stmts = rows.map(r => ({
      sql: 'INSERT OR IGNORE INTO enrichment_pending (content_id, tier) VALUES (?, ?)',
      args: [r.id, tierByDocId.get(r.doc_id)]
    }));
    for (let j = 0; j < stmts.length; j += WRITE_CHUNK) {
      await transaction(stmts.slice(j, j + WRITE_CHUNK));
      if (j + WRITE_CHUNK < stmts.length) await new Promise(r => setTimeout(r, 50));
    }
    totalQueued += rows.length;
  }

  logger.info({ total: totalQueued, tier_docs: sonnetDocIds.length }, 'enqueueParagraphsForBatch complete');
  return totalQueued;
}

// ─── Build a single batch request from a content row ─────────────────────────

async function buildBatchRequest(contentId) {
  // Load the target paragraph + ±CONTEXT_WINDOW neighbors + doc metadata
  const target = await queryOne(
    'SELECT id, doc_id, paragraph_index, text FROM content WHERE id = ? AND deleted_at IS NULL',
    [contentId]
  );
  if (!target) return null;
  const doc = await queryOne(
    'SELECT id, author, religion, collection, title, description, file_path FROM docs WHERE id = ? AND deleted_at IS NULL',
    [target.doc_id]
  );
  if (!doc) return null;

  const tier = getDocTier(doc);
  const cw = getContextWindow(doc, tier);
  const lo = Math.max(0, target.paragraph_index - cw);
  const hi = target.paragraph_index + cw;
  const windowParas = await queryAll(
    `SELECT paragraph_index, text FROM content
      WHERE doc_id = ? AND paragraph_index >= ? AND paragraph_index <= ?
        AND deleted_at IS NULL ORDER BY paragraph_index`,
    [doc.id, lo, hi]
  );
  if (windowParas.length === 0) return null;
  const targetPos = windowParas.findIndex(p => p.paragraph_index === target.paragraph_index) + 1;
  const singlePara = windowParas.length === 1;

  return {
    custom_id: `c${contentId}`,
    params: {
      model: SONNET_MODEL,
      max_tokens: 350,
      temperature: 0.3,
      system: buildSystemPrompt(doc, windowParas, targetPos),
      messages: [{ role: 'user', content: buildUserPrompt(targetPos, singlePara) }]
    }
  };
}

// ─── Submit a batch ──────────────────────────────────────────────────────────

/**
 * Pull up to MAX_REQUESTS_PER_BATCH paragraphs out of enrichment_pending
 * (in priority-tier order), build a single Anthropic Messages Batch, and
 * submit it. Returns the new batch row ID, or null if nothing was pending.
 */
export async function submitNextBatch() {
  const pending = await queryAll(
    `SELECT content_id, tier FROM enrichment_pending
      WHERE batch_id IS NULL ORDER BY tier ASC, content_id ASC LIMIT ?`,
    [MAX_REQUESTS_PER_BATCH]
  );
  if (pending.length === 0) return null;

  logger.info({ count: pending.length, lowest_tier: pending[0].tier }, 'submitNextBatch: building requests');

  // Build all request payloads
  const requests = [];
  for (const p of pending) {
    const req = await buildBatchRequest(p.content_id);
    if (req) requests.push(req);
  }
  if (requests.length === 0) {
    logger.warn('submitNextBatch: no valid requests built (paragraphs may have been deleted)');
    return null;
  }

  // Create the batch row first so we have an ID to mark pending rows
  const batchInsert = await query(
    `INSERT INTO enrichment_batches (provider, model, status, request_count, notes)
     VALUES (?, ?, ?, ?, ?)`,
    ['anthropic', SONNET_MODEL, 'pending', requests.length,
     `tier=${pending[0].tier}..${pending[pending.length-1].tier}`]
  );
  const batchId = Number(batchInsert.lastInsertRowid);

  // Mark pending rows as belonging to this batch (so a parallel run won't grab them)
  const ids = requests.map(r => Number(r.custom_id.slice(1)));
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(',');
    await query(
      `UPDATE enrichment_pending SET batch_id = ? WHERE content_id IN (${placeholders})`,
      [batchId, ...chunk]
    );
  }

  // Submit to Anthropic
  let externalBatchId;
  const submitStart = Date.now();
  logger.info({ batchId, requests: requests.length }, 'Calling Anthropic batches.create...');
  try {
    const client = getClient();
    const batch = await client.messages.batches.create({ requests });
    externalBatchId = batch.id;
    logger.info({ batchId, externalBatchId, requests: requests.length, elapsed_ms: Date.now() - submitStart }, 'Anthropic batch submitted');
  } catch (err) {
    // Roll back the assignment so the rows can be retried
    logger.error({ err: err.message, batchId }, 'Anthropic batch submission failed');
    await query('UPDATE enrichment_batches SET status = ?, notes = ? WHERE id = ?',
      ['failed', `submit_error: ${err.message?.slice(0, 200)}`, batchId]);
    await query('UPDATE enrichment_pending SET batch_id = NULL WHERE batch_id = ?', [batchId]);
    return null;
  }

  await query(
    `UPDATE enrichment_batches SET status = ?, external_batch_id = ?, submitted_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ['submitted', externalBatchId, batchId]
  );

  return batchId;
}

// ─── Poll + process completed batches ────────────────────────────────────────

/**
 * For each submitted/in_progress batch, check Anthropic's status. When
 * 'ended', stream results and write thesis + questions to content. Marks
 * the batch row as succeeded/failed and clears enrichment_pending.
 *
 * Returns a summary { polled, completed, total_succeeded, total_failed }.
 */
export async function pollAndProcess() {
  const inflight = await queryAll(
    `SELECT id, external_batch_id FROM enrichment_batches
      WHERE status IN ('submitted', 'in_progress') ORDER BY id ASC`
  );
  if (inflight.length === 0) return { polled: 0, completed: 0 };

  const client = getClient();
  let completed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  for (const b of inflight) {
    let batchInfo;
    try {
      batchInfo = await client.messages.batches.retrieve(b.external_batch_id);
    } catch (err) {
      logger.warn({ err: err.message, batchId: b.id }, 'pollAndProcess: retrieve failed');
      continue;
    }
    const apiStatus = batchInfo.processing_status;
    if (apiStatus === 'in_progress') {
      await query('UPDATE enrichment_batches SET status = ? WHERE id = ?', ['in_progress', b.id]);
      logger.info({ batchId: b.id, externalBatchId: b.external_batch_id, status: apiStatus, counts: batchInfo.request_counts }, 'batch still in_progress');
      continue;
    }
    if (apiStatus !== 'ended') {
      logger.warn({ batchId: b.id, apiStatus }, 'unexpected batch processing_status');
      continue;
    }

    // Stream results — each line is a {custom_id, result: {type, message}} record
    let succeeded = 0;
    let failed = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for await (const r of await client.messages.batches.results(b.external_batch_id)) {
        const cid = parseInt(String(r.custom_id || '').replace(/^c/, ''), 10);
        if (!cid) continue;

        if (r.result?.type === 'succeeded') {
          const msg = r.result.message;
          const text = msg?.content?.[0]?.text || '';
          const parsed = parseSonnetResponse(text);
          if (parsed && (parsed.thesis || parsed.questions.length > 0)) {
            const questionsBlob = parsed.questions.join('\n');
            await query(
              `UPDATE content
                  SET hyp_thesis = ?, hyp_questions = ?,
                      context_model = ?, enhanced_synced = 0
                WHERE id = ?`,
              [parsed.thesis, questionsBlob, SONNET_MODEL, cid]
            );
            succeeded++;
            inputTokens += msg?.usage?.input_tokens || 0;
            outputTokens += msg?.usage?.output_tokens || 0;
          } else {
            logger.warn({ cid, raw: text.slice(0, 200) }, 'unparseable Sonnet response');
            failed++;
          }
        } else {
          failed++;
        }
      }
    } catch (err) {
      logger.error({ err: err.message, batchId: b.id }, 'results stream failed');
      continue;
    }

    // Clear the pending rows for this batch
    await query('DELETE FROM enrichment_pending WHERE batch_id = ?', [b.id]);
    await query(
      `UPDATE enrichment_batches
          SET status = ?, completed_at = CURRENT_TIMESTAMP,
              succeeded_count = ?, failed_count = ?,
              cost_input_tokens = ?, cost_output_tokens = ?
        WHERE id = ?`,
      [failed > 0 && succeeded === 0 ? 'failed' : 'succeeded',
       succeeded, failed, inputTokens, outputTokens, b.id]
    );
    completed++;
    totalSucceeded += succeeded;
    totalFailed += failed;
    logger.info({ batchId: b.id, succeeded, failed, inputTokens, outputTokens }, 'batch processed');
  }

  return { polled: inflight.length, completed, total_succeeded: totalSucceeded, total_failed: totalFailed };
}

// ─── Status report (for diagnostics + the worker loop) ───────────────────────

export async function getStatus() {
  const pendingTotal = await queryOne('SELECT COUNT(*) AS n FROM enrichment_pending');
  const pendingUnassigned = await queryOne('SELECT COUNT(*) AS n FROM enrichment_pending WHERE batch_id IS NULL');
  const batchesByStatus = await queryAll(
    `SELECT status, COUNT(*) AS n,
            SUM(succeeded_count) AS succeeded,
            SUM(failed_count) AS failed,
            SUM(cost_input_tokens) AS in_tok,
            SUM(cost_output_tokens) AS out_tok
       FROM enrichment_batches GROUP BY status`
  );
  return {
    pending_total: pendingTotal.n,
    pending_unassigned: pendingUnassigned.n,
    batches: batchesByStatus
  };
}
