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
//   POST /api/v1/admin/deep-research/:id/regenerate-hero — regenerate hero image

import { requireInternal } from '../lib/auth.js';
import { queryOne, queryAll, query } from '../lib/db.js';
import { extractDocAttribution, batchExtractAttribution, getPendingAttributionDocs } from '../lib/para-attribution.js';
import { logger } from '../lib/logger.js';
import {
  checkDeepResearch,
  recordQuestionHit,
  getDeepResearchQuotes,
  getDeepResearchBySlug,
  addNotifyEmail,
  syncDeepResearch,
  generateResearchHeroImage,
} from '../lib/deep-research.js';

export default async function deepResearchRoutes(fastify) {
  // List complete research records (public)
  fastify.get('/deep-research', async (req) => {
    const { status = 'complete', limit = 50, offset = 0 } = req.query;
    const rows = await queryAll(
      'SELECT id, slug, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, ask_count, total_selected, llm_input_tokens, llm_output_tokens, llm_cost_usd, cost_breakdown_json, created_at, completed_at FROM deep_research WHERE status = ? ORDER BY ask_count DESC LIMIT ? OFFSET ?',
      [status, Number(limit), Number(offset)]
    );
    return { records: rows, count: rows.length };
  });

  // Single record by ID with quotes (public)
  fastify.get('/deep-research/id/:id', async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const quotes = await getDeepResearchQuotes(record.id);
    return { ...record, quotes };
  });

  // Single record by slug with quotes (public — used by research pages)
  fastify.get('/deep-research/slug/:slug', async (req, reply) => {
    const result = await getDeepResearchBySlug(req.params.slug);
    if (!result) return reply.code(404).send({ error: 'Not found' });
    return { ...result.record, quotes: result.quotes };
  });

  // Email notification signup for pending research (public)
  fastify.post('/deep-research/:id/notify', async (req, reply) => {
    const { email } = req.body || {};
    if (!email?.includes('@')) return reply.code(400).send({ error: 'Valid email required' });
    const record = await queryOne('SELECT id, status FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    if (record.status === 'complete') return { already_done: true, message: 'Research is already complete.' };
    await addNotifyEmail(record.id, email);
    return { success: true, message: 'You\'ll be notified when research completes.' };
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
    if (record.status === 'complete') await syncDeepResearch([record.id]);
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

  // Requeue for full regeneration (admin)
  fastify.post('/admin/deep-research/:id/requeue', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const priority = req.body?.priority || record.priority;
    const clearQuotes = req.body?.clear_quotes !== false; // default: clear old quotes
    if (clearQuotes) {
      await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [record.id]);
      await query('UPDATE deep_research SET total_selected = 0, total_candidates = 0, sections_json = NULL, summary_json = NULL, convergence_json = NULL WHERE id = ?', [record.id]);
    }
    await query("UPDATE deep_research SET status = 'queued', error = NULL, worker_id = NULL, heartbeat_at = NULL WHERE id = ?", [record.id]);
    await query('DELETE FROM deep_research_queue WHERE research_id = ? AND status = ?', [record.id, 'pending']);
    await query('INSERT INTO deep_research_queue (research_id, job_type, status, priority, created_at) VALUES (?, ?, ?, ?, ?)',
      [record.id, 'research', 'pending', priority, new Date().toISOString()]);
    logger.info({ researchId: record.id, clearQuotes }, 'Deep research requeued for regeneration');
    return { success: true, id: record.id, status: 'queued' };
  });

  // Patch content directly (admin — for manual editorial improvements)
  fastify.patch('/admin/deep-research/:id/content', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const { summary_json, convergence_json, sections_json, qa_json, topic_tags, question_type, canonical_question, slug } = req.body || {};
    const updates = [];
    const params = [];
    if (summary_json !== undefined) { updates.push('summary_json = ?'); params.push(JSON.stringify(summary_json)); }
    if (convergence_json !== undefined) { updates.push('convergence_json = ?'); params.push(JSON.stringify(convergence_json)); }
    if (sections_json !== undefined) { updates.push('sections_json = ?'); params.push(JSON.stringify(sections_json)); }
    if (qa_json !== undefined) { updates.push('qa_json = ?'); params.push(JSON.stringify(qa_json)); }
    if (topic_tags !== undefined) { updates.push('topic_tags = ?'); params.push(JSON.stringify(topic_tags)); }
    if (question_type !== undefined) { updates.push('question_type = ?'); params.push(question_type); }
    if (canonical_question) { updates.push('canonical_question = ?'); params.push(canonical_question); }
    if (slug) { updates.push('slug = ?'); params.push(slug); }
    if (!updates.length) return reply.code(400).send({ error: 'No fields to update' });
    updates.push('reviewed_at = ?'); params.push(new Date().toISOString());
    params.push(record.id);
    await query(`UPDATE deep_research SET ${updates.join(', ')} WHERE id = ?`, params);
    if (record.status === 'complete') await syncDeepResearch([record.id]);
    return { success: true };
  });

  // Regenerate hero image on demand (admin)
  fastify.post('/admin/deep-research/:id/regenerate-hero', { preHandler: [requireInternal] }, async (req, reply) => {
    const record = await queryOne('SELECT id, canonical_question, traditions_covered, topic_tags FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const traditions = (record.traditions_covered || '').split(',').filter(Boolean);
    let tags = [];
    try { tags = JSON.parse(record.topic_tags || '[]'); } catch {}
    const url = await generateResearchHeroImage(record.id, { question: record.canonical_question, traditions, tags });
    if (!url) return reply.code(500).send({ error: 'Image generation failed — check server logs' });
    return { success: true, hero_image: url };
  });

  // Add a single curated quote to a research record (admin editorial)
  fastify.post('/admin/deep-research/:id/quotes', { preHandler: [requireInternal] }, async (req, reply) => {
    const { para_id, contextual_note, rank } = req.body || {};
    if (!para_id) return reply.code(400).send({ error: 'para_id required' });
    const record = await queryOne('SELECT id FROM deep_research WHERE id = ?', [req.params.id]);
    if (!record) return reply.code(404).send({ error: 'Not found' });
    const maxRank = await queryOne('SELECT MAX(rank) as m FROM deep_research_quotes WHERE research_id = ?', [record.id]);
    await query(
      'INSERT OR REPLACE INTO deep_research_quotes (research_id, para_id, contextual_note, rank, created_at) VALUES (?, ?, ?, ?, ?)',
      [record.id, para_id, contextual_note, rank ?? (maxRank?.m ?? 0) + 1, new Date().toISOString()]
    );
    return { success: true };
  });

  // Remove a quote from a research record (admin editorial)
  fastify.delete('/admin/deep-research/:id/quotes/:quoteId', { preHandler: [requireInternal] }, async (req, reply) => {
    await query('DELETE FROM deep_research_quotes WHERE id = ? AND research_id = ?', [req.params.quoteId, req.params.id]);
    return { success: true };
  });

  // Cost summary across all completed research (admin)
  fastify.get('/admin/deep-research/costs', { preHandler: [requireInternal] }, async () => {
    const rows = await queryAll(
      `SELECT id, canonical_question, llm_input_tokens, llm_output_tokens, llm_cost_usd, cost_breakdown_json, total_selected, total_candidates, completed_at
       FROM deep_research WHERE status = 'complete' AND llm_cost_usd > 0
       ORDER BY completed_at DESC`
    );
    const total = rows.reduce((s, r) => ({ input: s.input + (r.llm_input_tokens || 0), output: s.output + (r.llm_output_tokens || 0), cost: s.cost + (r.llm_cost_usd || 0) }), { input: 0, output: 0, cost: 0 });
    return {
      total_runs: rows.length,
      total_input_tokens: total.input,
      total_output_tokens: total.output,
      total_cost_usd: Math.round(total.cost * 10000) / 10000,
      runs: rows.map(r => ({
        id: r.id,
        question: r.canonical_question?.slice(0, 80),
        input_tokens: r.llm_input_tokens,
        output_tokens: r.llm_output_tokens,
        cost_usd: r.llm_cost_usd,
        breakdown: r.cost_breakdown_json ? JSON.parse(r.cost_breakdown_json) : null,
        total_selected: r.total_selected,
        total_candidates: r.total_candidates,
        completed_at: r.completed_at,
      })),
    };
  });

  // ── Para attribution admin endpoints ────────────────────────────────────────

  // Extract para_meta attribution for a single doc (admin)
  fastify.post('/admin/attribution/:docId', { preHandler: [requireInternal] }, async (req, reply) => {
    const docId = Number(req.params.docId);
    const { force = false } = req.body || {};
    const result = await extractDocAttribution(docId, { force });
    return result;
  });

  // Batch extract attribution for pending docs (admin)
  fastify.post('/admin/attribution/batch', { preHandler: [requireInternal] }, async (req, reply) => {
    const { limit = 20, force = false } = req.body || {};
    const results = await batchExtractAttribution({ limit, force });
    return { processed: results.length, results };
  });

  // List docs still needing attribution extraction (admin)
  fastify.get('/admin/attribution/pending', { preHandler: [requireInternal] }, async (req) => {
    const { limit = 50 } = req.query;
    const docs = await getPendingAttributionDocs({ limit: Number(limit) });
    return { count: docs.length, docs };
  });

  // Attribution coverage stats (admin)
  fastify.get('/admin/attribution/stats', { preHandler: [requireInternal] }, async () => {
    const [total, done, attributionLines] = await Promise.all([
      queryOne('SELECT COUNT(*) as n FROM content WHERE deleted_at IS NULL'),
      queryOne("SELECT COUNT(*) as n FROM content WHERE deleted_at IS NULL AND para_meta IS NOT NULL"),
      queryOne("SELECT COUNT(*) as n FROM content WHERE deleted_at IS NULL AND json_extract(para_meta, '$.is_attribution_line') = 1"),
    ]);
    return {
      total: total?.n || 0,
      processed: done?.n || 0,
      pending: (total?.n || 0) - (done?.n || 0),
      attribution_lines_found: attributionLines?.n || 0,
    };
  });
}
