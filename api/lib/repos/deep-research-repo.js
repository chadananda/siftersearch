// deep-research-repo — THE ONE data interface for deep research (deep_research, deep_research_quotes,
// deep_research_queue, deep_research_notify). Callers: api/lib/deep-research.js, api/workers/deep-research-worker.js,
// scripts/deep-research-runner.mjs. Deps: db.js.

import { query, queryOne, queryAll } from '../db.js';

// --- deep_research reads ---

export async function getResearchById(id) {
  return queryOne('SELECT * FROM deep_research WHERE id = ?', [id]);
}

export async function findByQuestionHash(hash) {
  return queryOne('SELECT * FROM deep_research WHERE question_hash = ?', [hash]);
}

export async function findCompleteByHash(hash) {
  return queryOne('SELECT * FROM deep_research WHERE question_hash = ? AND status = ?', [hash, 'complete']);
}

export async function listCompleteWithEmbedding() {
  return queryAll(
    'SELECT id, canonical_question, question_embedding FROM deep_research WHERE status = ? AND question_embedding IS NOT NULL',
    ['complete']
  );
}

export async function getResearchBySlug(slug) {
  return queryOne(
    'SELECT id, slug, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, angles_json, sections_json, summary_json, convergence_json, qa_json, assessment_json, total_candidates, total_selected, llm_input_tokens, llm_output_tokens, llm_cost_usd, started_at, research_model, ask_count, last_asked_at, created_at, completed_at, hero_image FROM deep_research WHERE slug = ?',
    [slug]
  );
}

export async function getSectionsJson(researchId) {
  return queryOne('SELECT sections_json FROM deep_research WHERE id = ?', [researchId]);
}

export async function findByQuestion(question) {
  return queryAll('SELECT id, status, ask_count FROM deep_research WHERE canonical_question = ?', [question]);
}

export async function listByAskCount(limit = 50) {
  return queryAll(
    'SELECT id, canonical_question, status, ask_count, total_selected FROM deep_research ORDER BY ask_count DESC LIMIT ?',
    [limit]
  );
}

export async function researchStatusCounts() {
  return queryAll('SELECT status, COUNT(*) as count FROM deep_research GROUP BY status');
}

export async function listHeroPrompts(excludeId) {
  return queryAll(
    'SELECT hero_prompt FROM deep_research WHERE hero_prompt IS NOT NULL AND id != ?',
    [excludeId || 0]
  );
}

// --- deep_research writes ---

export async function createPendingResearch({ question, embedBuf, hash, slug, now }) {
  return query(
    `INSERT INTO deep_research (canonical_question, question_embedding, question_hash, slug, status, ask_count, last_asked_at, created_at)
     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)`,
    [question.trim(), embedBuf, hash, slug, now, now]
  );
}

export async function incrementAskCount(id, now) {
  return query('UPDATE deep_research SET ask_count = ask_count + 1, last_asked_at = ? WHERE id = ?', [now, id]);
}

export async function setStatus(id, status) {
  return query('UPDATE deep_research SET status = ? WHERE id = ?', [status, id]);
}

// Auto-queue path (recordQuestionHit): flip status to queued, then enqueue a priority-ranked task.
// No explicit created_at — relies on the queue table's DEFAULT CURRENT_TIMESTAMP.
export async function autoQueueResearch(researchId, priority) {
  await query('UPDATE deep_research SET status = ? WHERE id = ?', ['queued', researchId]);
  await query(
    'INSERT INTO deep_research_queue (research_id, job_type, status, priority) VALUES (?, ?, ?, ?)',
    [researchId, 'research', 'pending', priority]
  );
}

// CLI queue path (deep-research-runner.mjs): flip status to queued, then enqueue with an explicit created_at.
export async function queueResearchTask(researchId, priority) {
  await query('UPDATE deep_research SET status = ? WHERE id = ?', ['queued', researchId]);
  await query(
    'INSERT INTO deep_research_queue (research_id, job_type, status, priority, created_at) VALUES (?, ?, ?, ?, ?)',
    [researchId, 'research', 'pending', priority, new Date().toISOString()]
  );
}

export async function setAnglesJson(researchId, anglesJson) {
  return query('UPDATE deep_research SET angles_json = ? WHERE id = ?', [anglesJson, researchId]);
}

export async function setTotalCandidates(researchId, totalCandidates) {
  return query('UPDATE deep_research SET total_candidates = ? WHERE id = ?', [totalCandidates, researchId]);
}

export async function setHeroImage(researchId, url, prompt) {
  return query('UPDATE deep_research SET hero_image = ?, hero_prompt = ? WHERE id = ?', [url, prompt, researchId]);
}

export async function startResearch(researchId, workerId, startedAt) {
  return query(
    'UPDATE deep_research SET status = ?, worker_id = ?, heartbeat_at = ?, started_at = ? WHERE id = ?',
    ['in_progress', workerId, startedAt, startedAt, researchId]
  );
}

export async function completeResearch(researchId, data) {
  return query(
    `UPDATE deep_research SET
       status = 'complete',
       total_selected = ?,
       traditions_covered = ?,
       sections_json = ?,
       summary_json = ?,
       convergence_json = ?,
       llm_input_tokens = ?,
       llm_output_tokens = ?,
       llm_cost_usd = ?,
       cost_breakdown_json = ?,
       assessment_json = ?,
       completed_at = ?,
       heartbeat_at = ?
     WHERE id = ?`,
    [
      data.totalSelected, data.traditionsCovered,
      data.sectionsJson, data.summaryJson, data.convergenceJson,
      data.inputTokens, data.outputTokens,
      data.costUsd, data.costBreakdownJson,
      data.assessmentJson,
      new Date().toISOString(), new Date().toISOString(), researchId
    ]
  );
}

export async function failResearch(researchId, errorMessage) {
  return query(
    'UPDATE deep_research SET status = ?, error = ?, heartbeat_at = ? WHERE id = ?',
    ['failed', errorMessage, new Date().toISOString(), researchId]
  );
}

export async function heartbeat(researchId) {
  return query('UPDATE deep_research SET heartbeat_at = ? WHERE id = ?', [new Date().toISOString(), researchId]);
}

// --- deep_research_quotes ---

export async function listQuotes(researchId) {
  return queryAll(
    `SELECT drq.*, c.text, c.heading, c.doc_id, c.external_para_id,
            d.title, d.author, d.religion, d.source_site, d.source_url
     FROM deep_research_quotes drq
     JOIN content c ON drq.para_id = c.id
     JOIN docs d ON c.doc_id = d.id
     WHERE drq.research_id = ?
     ORDER BY drq.rank ASC`,
    [researchId]
  );
}

export async function getContentMetaByIds(ids) {
  const placeholders = ids.map(() => '?').join(',');
  return queryAll(
    `SELECT c.id AS para_id, c.text, c.heading, c.doc_id, c.external_para_id,
            d.title, d.author, d.religion, d.source_site, d.source_url
     FROM content c
     JOIN docs d ON c.doc_id = d.id
     WHERE c.id IN (${placeholders})`,
    ids
  );
}

export async function findExistingContentIds(paraIds) {
  const placeholders = paraIds.map(() => '?').join(',');
  const rows = await queryAll(`SELECT id FROM content WHERE id IN (${placeholders})`, paraIds);
  return rows.map(r => r.id);
}

// Delete + re-insert the full curated set for a research record — one logical operation, same order
// as the original call site (DELETE then per-row INSERT).
export async function replaceQuotes(researchId, quotes) {
  await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [researchId]);
  for (const q of quotes) {
    await query(
      `INSERT INTO deep_research_quotes (research_id, para_id, tradition, authority, relevance_score, contextual_note, rank, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [researchId, q.para_id, q.tradition, q.authority, q.relevance_score, q.contextual_note, q.rank, new Date().toISOString()]
    );
  }
}

// Append one supplemental quote without clobbering an existing row for the same para_id.
export async function appendQuote(researchId, q) {
  return query(
    `INSERT OR IGNORE INTO deep_research_quotes (research_id, para_id, tradition, authority, relevance_score, contextual_note, rank, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [researchId, q.para_id, q.tradition, q.authority, q.relevance_score, q.contextual_note, q.rank, new Date().toISOString()]
  );
}

// --- deep_research_notify ---

export async function addNotify(researchId, email) {
  return query(
    'INSERT OR IGNORE INTO deep_research_notify (research_id, email, created_at) VALUES (?, ?, ?)',
    [researchId, email.trim().toLowerCase(), new Date().toISOString()]
  );
}

export async function getPendingNotifications(researchId) {
  return queryAll('SELECT * FROM deep_research_notify WHERE research_id = ? AND notified_at IS NULL', [researchId]);
}

export async function markNotified(ids) {
  const placeholders = ids.map(() => '?').join(',');
  return query(`UPDATE deep_research_notify SET notified_at = ? WHERE id IN (${placeholders})`, [new Date().toISOString(), ...ids]);
}

// --- deep_research_queue ---

export async function getPendingResearchTasks(limit = 5) {
  return queryAll(
    `SELECT drq.*, dr.canonical_question, dr.question_hash
     FROM deep_research_queue drq
     JOIN deep_research dr ON drq.research_id = dr.id
     WHERE drq.status = 'pending'
     ORDER BY drq.priority DESC, drq.created_at ASC
     LIMIT ?`,
    [limit]
  );
}

export async function queueStatusCounts() {
  return queryAll('SELECT status, COUNT(*) as count FROM deep_research_queue GROUP BY status');
}

export async function claimQueueTask(taskId) {
  const result = await query(
    'UPDATE deep_research_queue SET status = ?, started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = ?',
    ['in_progress', new Date().toISOString(), taskId, 'pending']
  );
  return result.rows[0]?.changes > 0;
}

export async function finishQueueTask(taskId, error = null) {
  return query(
    'UPDATE deep_research_queue SET status = ?, completed_at = ?, error = ? WHERE id = ?',
    [error ? 'failed' : 'complete', new Date().toISOString(), error, taskId]
  );
}
