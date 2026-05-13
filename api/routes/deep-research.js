// Admin + read routes for Deep Research.
// Mounted at /api/v1 in server.js.
//
// Public (read-only):
//   GET /api/v1/deep-research          — list complete research records
//   GET /api/v1/deep-research/:id      — single record with quotes
//
// Admin (X-Admin-Key required):
//   POST /api/v1/admin/deep-research           — create/queue research for a question
//   PATCH /api/v1/admin/deep-research/:id      — update record (priority, topic_tags, etc.)
//   DELETE /api/v1/admin/deep-research/:id     — delete record + quotes
//   POST /api/v1/admin/deep-research/:id/requeue — requeue a failed/complete record

import { requireInternal } from '../lib/auth.js';
import { queryOne, queryAll, query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  checkDeepResearch,
  recordQuestionHit,
  getDeepResearchQuotes,
  syncDeepResearchToMeili,
} from '../lib/deep-research.js';

export default async function deepResearchRoutes(fastify) {
  // List complete research records (public)
  fastify.get('/deep-research', async (req) => {
    const { status = 'complete', limit = 50, offset = 0 } = req.query;
    const rows = await queryAll(
      'SELECT id, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, ask_count, total_selected, created_at, completed_at FROM deep_research WHERE status = ? ORDER BY ask_count DESC LIMIT ? OFFSET ?',
      [status, Number(limit), Number(offset)]
    );
    return { records: rows, count: rows.length };
  });

  // Single record with quotes (public)
  fastify.get('/deep-research/:id', async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const quotes = await getDeepResearchQuotes(record.id);
    return { ...record, quotes };
  });

  // Check if deep research exists for a question (public, used by chat UI)
  fastify.get('/deep-research/check', async (req) => {
    const { q } = req.query;
    if (!q) return { found: false };
    const result = await checkDeepResearch(q);
    if (!result) return { found: false };
    return { found: true, id: result.id, canonical_question: result.canonical_question, quotes: result.quotes?.length || 0, similarity: result.similarity };
  });

  // Create / queue research for a question (admin)
  fastify.post('/admin/deep-research', { preHandler: [requireInternal] }, async (req, reply) => {
    const { question, priority = 5, topic_tags, question_type } = req.body || {};
    if (!question?.trim()) return reply.code(400).send({ error: 'question required' });
    const { recordQuestionHit: rqh } = await import('../lib/deep-research.js');
    // recordQuestionHit creates the record if it doesn't exist
    await rqh(question.trim());
    const hash = (await import('crypto')).default.createHash('sha256').update(question.trim().toLowerCase()).digest('hex').slice(0, 32);
    const record = await queryOne('SELECT * FROM deep_research WHERE question_hash = ?', [hash]);
    if (!record) return reply.code(500).send({ error: 'Failed to create record' });

    // Update priority/tags and force-queue
    const now = new Date().toISOString();
    await query(
      'UPDATE deep_research SET priority = ?, topic_tags = ?, question_type = ?, status = ? WHERE id = ?',
      [priority, topic_tags ? JSON.stringify(topic_tags) : record.topic_tags, question_type || record.question_type, 'queued', record.id]
    );
    const existing = await queryOne('SELECT id FROM deep_research_queue WHERE research_id = ? AND status = ?', [record.id, 'pending']);
    if (!existing) {
      await query('INSERT INTO deep_research_queue (research_id, job_type, status, priority, created_at) VALUES (?, ?, ?, ?, ?)',
        [record.id, 'research', 'pending', priority, now]);
    }
    logger.info({ researchId: record.id, question: question.trim() }, 'Deep research queued via admin');
    return { id: record.id, status: 'queued', canonical_question: record.canonical_question };
  });

  // Update metadata (admin)
  fastify.patch('/admin/deep-research/:id', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const { priority, topic_tags, question_type, reviewed_by } = req.body || {};
    await query(
      'UPDATE deep_research SET priority = COALESCE(?, priority), topic_tags = COALESCE(?, topic_tags), question_type = COALESCE(?, question_type), reviewed_by = COALESCE(?, reviewed_by), reviewed_at = ? WHERE id = ?',
      [priority, topic_tags ? JSON.stringify(topic_tags) : null, question_type, reviewed_by, reviewed_by ? new Date().toISOString() : record.reviewed_at, record.id]
    );
    if (record.status === 'complete') await syncDeepResearchToMeili([record.id]);
    return { success: true };
  });

  // Delete record + quotes (admin)
  fastify.delete('/admin/deep-research/:id', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT id FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [record.id]);
    await query('DELETE FROM deep_research_queue WHERE research_id = ?', [record.id]);
    await query('DELETE FROM deep_research WHERE id = ?', [record.id]);
    logger.info({ researchId: record.id }, 'Deep research record deleted');
    return { success: true };
  });

  // Requeue (admin)
  fastify.post('/admin/deep-research/:id/requeue', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const priority = req.body?.priority || record.priority;
    await query("UPDATE deep_research SET status = 'queued', error = NULL, worker_id = NULL WHERE id = ?", [record.id]);
    const existing = await queryOne("SELECT id FROM deep_research_queue WHERE research_id = ? AND status = 'pending'", [record.id]);
    if (!existing) {
      await query('INSERT INTO deep_research_queue (research_id, job_type, status, priority, created_at) VALUES (?, ?, ?, ?, ?)',
        [record.id, 'research', 'pending', priority, new Date().toISOString()]);
    }
    return { success: true, id: record.id };
  });
}
