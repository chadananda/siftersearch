// Deep Research — pre-computed authoritative passage sets per canonical question.
//
// Inverts the HyPE pattern: instead of paragraph → hypothetical-question,
// this builds question → best-paragraphs (curated by LLM rerank across many
// angles). Results are stored in deep_research + deep_research_quotes tables
// and synced to the deep_research Meilisearch index for fast pre-fetch.
//
// Single-writer invariant: only the deep-research worker writes to these tables.
// The API (Jafar pipeline) is read-only; it queues tasks via deep_research_queue.
//
// Key public API:
//   checkDeepResearch(question, embedding)   → curated quotes or null
//   recordQuestionHit(question, embedding)   → fire-and-forget hit tracking
//   getDeepResearchQuotes(researchId)        → ordered curated passage array
//   syncDeepResearchToMeili(ids?)            → sync records to Meili index
//   runDeepResearch(researchId)              → full LLM research pass (worker only)

import crypto from 'crypto';
import { queryOne, queryAll, query } from './db.js';
import { logger } from './logger.js';
import { createEmbedding } from './ai.js';
import { getMeili, INDEXES } from './search.js';
import { getAuthority } from './authority.js';

// Cosine similarity threshold for considering two questions "the same"
const SIMILARITY_THRESHOLD = 0.88;

// Number of times a question must be asked before auto-queueing deep research
const AUTO_QUEUE_THRESHOLD = 2;

// Embedding byte length (512 dims * 4 bytes per float32)
const EMBEDDING_BYTES = 512 * 4;

// --- Embedding helpers ---

function embeddingToBuffer(embedding) {
  const buf = Buffer.allocUnsafe(EMBEDDING_BYTES);
  const arr = Float32Array.from(embedding);
  buf.set(new Uint8Array(arr.buffer), 0);
  return buf;
}

function bufferToEmbedding(buf) {
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(arr);
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function questionHash(question) {
  return crypto.createHash('sha256').update(question.trim().toLowerCase()).digest('hex').slice(0, 32);
}

// --- Public read API (used by Jafar pipeline) ---

/**
 * Check if deep research exists for a question (by embedding similarity).
 * Returns the matched research record with quotes if found, null otherwise.
 *
 * @param {string} question - User's question text
 * @param {number[]} [embedding] - Pre-computed 512-dim embedding (will embed if omitted)
 * @returns {Promise<{id: number, canonical_question: string, quotes: Array}|null>}
 */
export async function checkDeepResearch(question, embedding = null) {
  try {
    // Fast exact-hash check first
    const hash = questionHash(question);
    const exact = await queryOne(
      'SELECT * FROM deep_research WHERE question_hash = ? AND status = ?',
      [hash, 'complete']
    );
    if (exact) {
      const quotes = await getDeepResearchQuotes(exact.id);
      return { ...exact, quotes };
    }

    // Embedding similarity check across completed research
    const candidates = await queryAll(
      'SELECT id, canonical_question, question_embedding FROM deep_research WHERE status = ? AND question_embedding IS NOT NULL',
      ['complete']
    );
    if (!candidates.length) return null;

    const qEmbed = embedding || await createEmbedding(question);
    let best = null;
    let bestScore = 0;
    for (const row of candidates) {
      const rowEmbed = bufferToEmbedding(row.question_embedding);
      const score = cosineSimilarity(qEmbed, rowEmbed);
      if (score > bestScore) { bestScore = score; best = row; }
    }

    if (bestScore >= SIMILARITY_THRESHOLD && best) {
      const full = await queryOne('SELECT * FROM deep_research WHERE id = ?', [best.id]);
      const quotes = await getDeepResearchQuotes(best.id);
      return { ...full, quotes, similarity: bestScore };
    }

    return null;
  } catch (err) {
    logger.warn({ err: err.message }, 'checkDeepResearch error');
    return null;
  }
}

/**
 * Record a question hit — increments ask_count and auto-queues research if threshold met.
 * Fire-and-forget; never throws.
 *
 * @param {string} question - User's question text
 * @param {number[]} [embedding] - Pre-computed embedding
 */
export async function recordQuestionHit(question, embedding = null) {
  try {
    const hash = questionHash(question);
    const now = new Date().toISOString();
    const existing = await queryOne('SELECT * FROM deep_research WHERE question_hash = ?', [hash]);

    if (existing) {
      await query(
        'UPDATE deep_research SET ask_count = ask_count + 1, last_asked_at = ? WHERE id = ?',
        [now, existing.id]
      );
      // Auto-queue if threshold crossed and not already queued/complete
      if (existing.ask_count + 1 >= AUTO_QUEUE_THRESHOLD && existing.status === 'pending') {
        await query('UPDATE deep_research SET status = ? WHERE id = ?', ['queued', existing.id]);
        await query(
          'INSERT INTO deep_research_queue (research_id, job_type, status, priority) VALUES (?, ?, ?, ?)',
          [existing.id, 'research', 'pending', existing.ask_count + 1]
        );
        logger.info({ researchId: existing.id, askCount: existing.ask_count + 1 }, 'Deep research auto-queued');
      }
    } else {
      // Create new pending record
      const qEmbed = embedding || await createEmbedding(question);
      const embedBuf = embeddingToBuffer(qEmbed);
      const result = await query(
        `INSERT INTO deep_research (canonical_question, question_embedding, question_hash, status, ask_count, last_asked_at, created_at)
         VALUES (?, ?, ?, 'pending', 1, ?, ?)`,
        [question.trim(), embedBuf, hash, now, now]
      );
      if (result.lastInsertRowid) {
        logger.debug({ researchId: result.lastInsertRowid }, 'New deep research record created');
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'recordQuestionHit error (non-fatal)');
  }
}

/**
 * Get curated quotes for a deep research record, ordered by rank.
 *
 * @param {number} researchId
 * @returns {Promise<Array<{para_id, tradition, authority, relevance_score, contextual_note, rank}>>}
 */
export async function getDeepResearchQuotes(researchId) {
  try {
    return await queryAll(
      `SELECT drq.*, c.text, c.heading, c.doc_id, c.external_para_id,
              d.title, d.author, d.religion, d.source_site, d.source_url
       FROM deep_research_quotes drq
       JOIN content c ON drq.para_id = c.id
       JOIN docs d ON c.doc_id = d.id
       WHERE drq.research_id = ?
       ORDER BY drq.rank ASC`,
      [researchId]
    );
  } catch (err) {
    logger.warn({ err: err.message, researchId }, 'getDeepResearchQuotes error');
    return [];
  }
}

// --- Worker API (called by the deep-research worker process only) ---

/**
 * Decompose a question into research angles (one per religious tradition + general).
 * Returns an array of angle objects with query variants.
 *
 * @param {string} question
 * @param {Function} chat - LLM chat function
 * @returns {Promise<Array<{tradition, query, angle}>>}
 */
export async function decomposeAngles(question, chat) {
  const TRADITIONS = ["Baha'i", 'Islam', 'Christianity', 'Judaism', 'Buddhism', 'Hinduism', 'Taoism', 'Sikhism', 'General'];
  const systemPrompt = `You are a research assistant for an interfaith library. Given a spiritual question, generate specific search queries optimized for finding relevant authoritative passages in each religious tradition. Return JSON only.`;
  const userPrompt = `Question: "${question}"

For each tradition below, produce a concise search query (10-20 words) that targets how THAT tradition specifically addresses this question. Use tradition-specific vocabulary (e.g. "tests and trials" for Baha'i, "sabr" for Islam, etc).

Traditions: ${TRADITIONS.join(', ')}

Return JSON array:
[{"tradition": "...", "query": "...", "angle": "one-sentence description of the angle"}]`;

  try {
    const response = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    const text = response.content?.[0]?.text || response;
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    if (!json) throw new Error('No JSON array in response');
    return JSON.parse(json);
  } catch (err) {
    logger.warn({ err: err.message }, 'decomposeAngles fallback to defaults');
    return TRADITIONS.map(t => ({ tradition: t, query: question, angle: `${t} perspective` }));
  }
}

/**
 * Fan out search queries across angles and collect candidate passages.
 *
 * @param {Array<{tradition, query}>} angles
 * @param {Function} search - search(query, opts) function
 * @param {number} [perAngle=30] - candidates per angle
 * @returns {Promise<Array>} Deduplicated candidate paragraphs
 */
export async function fanOutQueries(angles, search, perAngle = 30) {
  const seen = new Set();
  const candidates = [];
  for (const { tradition, query: q } of angles) {
    try {
      const results = await search(q, {
        limit: perAngle,
        filters: tradition !== 'General' ? { religion: tradition } : {},
        semanticRatio: 0.6,
      });
      for (const hit of (results.hits || [])) {
        if (!seen.has(hit.id)) {
          seen.add(hit.id);
          candidates.push({ ...hit, _searchTradition: tradition });
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, tradition }, 'fanOutQueries angle error');
    }
  }
  return candidates;
}

/**
 * Rerank candidates using LLM pairwise relevance scoring.
 * Returns top N passages with relevance_score and contextual_note.
 *
 * @param {string} question
 * @param {Array} candidates
 * @param {Function} chat - LLM chat function
 * @param {number} [topN=50] - passages to keep
 * @returns {Promise<Array<{para_id, tradition, authority, relevance_score, contextual_note, rank}>>}
 */
export async function rerankPassages(question, candidates, chat, topN = 50) {
  if (!candidates.length) return [];

  // Build compact passage list for LLM
  const passages = candidates.slice(0, 200).map((c, i) => ({
    idx: i,
    id: c.id,
    text: (c.text || '').slice(0, 400),
    author: c.author || '',
    religion: c.religion || c._searchTradition || '',
    authority: c.authority || getAuthority(c),
  }));

  const systemPrompt = `You are an expert in comparative religion. Evaluate passages for direct relevance to a spiritual question. Score 0-10 where 10 = directly answers the question with authoritative doctrine, 0 = unrelated.`;

  const userPrompt = `Question: "${question}"

Rate each passage 0-10 for relevance to this question. Also write a 1-sentence contextual note explaining HOW this passage addresses the question (or why it doesn't). Return JSON only.

Passages:
${passages.map(p => `[${p.idx}] ${p.religion} (auth:${p.authority}) ${p.author}: "${p.text}"`).join('\n\n')}

Return: [{"idx": N, "score": 0-10, "note": "..."}]`;

  let scores = [];
  try {
    const response = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    const text = response.content?.[0]?.text || response;
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    if (json) scores = JSON.parse(json);
  } catch (err) {
    logger.warn({ err: err.message }, 'rerankPassages scoring failed');
  }

  const scoreMap = new Map(scores.map(s => [s.idx, s]));
  const ranked = passages
    .map((p, i) => {
      const s = scoreMap.get(i) || { score: 0, note: '' };
      return { ...p, relevance_score: s.score, contextual_note: s.note };
    })
    .filter(p => p.relevance_score >= 6)
    .sort((a, b) => (b.relevance_score * 2 + b.authority) - (a.relevance_score * 2 + a.authority));

  return ranked.slice(0, topN).map((p, rank) => ({
    para_id: p.id,
    tradition: p.religion,
    authority: p.authority,
    relevance_score: p.relevance_score,
    contextual_note: p.contextual_note,
    rank,
  }));
}

/**
 * Run full deep research for a queued record.
 * Called exclusively from the deep-research worker.
 *
 * @param {number} researchId
 * @param {object} deps - { chat, search }
 */
export async function runDeepResearch(researchId, { chat, search }) {
  const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [researchId]);
  if (!record) throw new Error(`Deep research record ${researchId} not found`);

  const workerId = `dr-${process.pid}-${Date.now()}`;
  await query(
    'UPDATE deep_research SET status = ?, worker_id = ?, heartbeat_at = ? WHERE id = ?',
    ['in_progress', workerId, new Date().toISOString(), researchId]
  );

  try {
    logger.info({ researchId, question: record.canonical_question }, 'Deep research started');

    // 1. Decompose into angles
    const angles = await decomposeAngles(record.canonical_question, chat);
    await query('UPDATE deep_research SET angles_json = ? WHERE id = ?', [JSON.stringify(angles), researchId]);

    // 2. Fan out queries
    const candidates = await fanOutQueries(angles, search, 30);
    await query('UPDATE deep_research SET total_candidates = ? WHERE id = ?', [candidates.length, researchId]);

    // 3. Rerank
    const selected = await rerankPassages(record.canonical_question, candidates, chat, 50);

    // 4. Store quotes
    await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [researchId]);
    for (const q of selected) {
      await query(
        `INSERT INTO deep_research_quotes (research_id, para_id, tradition, authority, relevance_score, contextual_note, rank, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [researchId, q.para_id, q.tradition, q.authority, q.relevance_score, q.contextual_note, q.rank, new Date().toISOString()]
      );
    }

    // 5. Extract traditions covered + topic classification
    const traditionsCovered = [...new Set(selected.map(q => q.tradition).filter(Boolean))].join(',');

    await query(
      `UPDATE deep_research SET
         status = 'complete',
         total_selected = ?,
         traditions_covered = ?,
         completed_at = ?,
         heartbeat_at = ?
       WHERE id = ?`,
      [selected.length, traditionsCovered, new Date().toISOString(), new Date().toISOString(), researchId]
    );

    // 6. Sync to Meilisearch
    await syncDeepResearchToMeili([researchId]);

    logger.info({ researchId, selected: selected.length, traditions: traditionsCovered }, 'Deep research complete');
  } catch (err) {
    await query(
      'UPDATE deep_research SET status = ?, error = ?, heartbeat_at = ? WHERE id = ?',
      ['failed', err.message, new Date().toISOString(), researchId]
    );
    logger.error({ err: err.message, researchId }, 'Deep research failed');
    throw err;
  }
}

/**
 * Sync deep research records to Meilisearch.
 *
 * @param {number[]} [ids] - specific IDs to sync; omit to sync all complete records
 */
export async function syncDeepResearchToMeili(ids = null) {
  const meili = getMeili();
  if (!meili) return;

  const rows = ids
    ? await queryAll(`SELECT * FROM deep_research WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : await queryAll("SELECT * FROM deep_research WHERE status = 'complete'");

  if (!rows.length) return;

  const docs = rows.map(r => ({
    id: r.id,
    canonical_question: r.canonical_question,
    question_hash: r.question_hash,
    status: r.status,
    topic_tags: r.topic_tags ? JSON.parse(r.topic_tags) : [],
    question_type: r.question_type,
    traditions_covered: r.traditions_covered ? r.traditions_covered.split(',') : [],
    ask_count: r.ask_count,
    priority: r.priority,
    created_at: r.created_at,
    completed_at: r.completed_at,
  }));

  try {
    await meili.index(INDEXES.DEEP_RESEARCH).addDocuments(docs, { primaryKey: 'id' });
    logger.info({ count: docs.length }, 'Deep research synced to Meilisearch');
  } catch (err) {
    logger.warn({ err: err.message }, 'syncDeepResearchToMeili failed');
  }
}

/**
 * Get pending/queued deep research tasks for the worker.
 *
 * @param {number} [limit=5]
 * @returns {Promise<Array>}
 */
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

/**
 * Mark a queue task as started.
 */
export async function claimQueueTask(taskId) {
  await query(
    'UPDATE deep_research_queue SET status = ?, started_at = ?, attempts = attempts + 1 WHERE id = ?',
    ['in_progress', new Date().toISOString(), taskId]
  );
}

/**
 * Mark a queue task as complete or failed.
 */
export async function finishQueueTask(taskId, error = null) {
  await query(
    'UPDATE deep_research_queue SET status = ?, completed_at = ?, error = ? WHERE id = ?',
    [error ? 'failed' : 'complete', new Date().toISOString(), error, taskId]
  );
}
