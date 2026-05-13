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
//   syncDeepResearch(ids?)            → sync records to Meili index
//   runDeepResearch(researchId)              → full LLM research pass (worker only)

import crypto from 'crypto';
import { queryOne, queryAll, query } from './db.js';
import { logger } from './logger.js';
import { createEmbedding } from './ai.js';
import { getMeili, INDEXES } from './search.js';
import { getAuthority } from './authority.js';
import { generateSlug } from './slug.js';

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
      const slug = generateSlug(question.trim()).slice(0, 120);
      const result = await query(
        `INSERT INTO deep_research (canonical_question, question_embedding, question_hash, slug, status, ask_count, last_asked_at, created_at)
         VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)`,
        [question.trim(), embedBuf, hash, slug, now, now]
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
  // Values must match the `religion` field in the Meilisearch paragraphs index exactly.
  const TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh', 'General'];
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
// Text fingerprint for dedup: normalize to lowercase alphanum, take first 100 chars.
// Catches the same quote appearing in different publications.
function textFingerprint(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

// Source priority bonus (0–2) for canonical primary texts over secondary compilations.
// Applied as tiebreaker when authority scores are equal for the same deduped quote.
// Ensures e.g. Gleanings beats "Baha'u'llah and the New Era" for the same tablet passage.
function sourcePriorityBonus(title) {
  const t = (title || '').toLowerCase();
  // Primary scripture / authoritative compilations by Central Figures or Shoghi Effendi
  if (/gleanings|kitab-i-aqdas|kitab-i-iqan|most holy book|book of certitude|hidden words|prayers and meditations|tablets of baha|epistle to the son|seven valleys|four valleys|advent of divine justice|world order of baha/.test(t)) return 2;
  if (/some answered questions|will and testament|selections from.*abdu|memorials of the faithful|secret of divine civilization|traveler.*narrative/.test(t)) return 2;
  if (/lights of guidance|compilation.*compilations|baha'i education|baha'i writings/.test(t)) return 1;
  // Secondary works (biographies, historical, commentaries)
  if (/new era|promulgation|paris talks|divine art of living/.test(t)) return 0.5;
  return 0;
}

export async function rerankPassages(question, candidates, chat, topN = 50) {
  if (!candidates.length) return [];

  const BATCH_SIZE = 30; // Keep LLM prompt manageable — ~30 passages ~= 12K chars
  const passages = candidates.slice(0, 270).map((c, i) => ({
    idx: i,
    id: c.id,
    text: (c.text || '').slice(0, 350),
    title: c.title || '',
    author: c.author || '',
    religion: c.religion || c._searchTradition || '',
    authority: c.authority || getAuthority(c),
    fingerprint: textFingerprint(c.text || ''),
  }));

  const systemPrompt = `You are an expert in comparative religion. Evaluate passages for direct relevance to a spiritual question. Score 0-10 where 10 = directly answers the question with authoritative doctrine, 0 = unrelated. When the same quote appears from multiple sources, favor the primary authoritative compilation. Return ONLY valid JSON array.`;

  const allScores = [];
  for (let start = 0; start < passages.length; start += BATCH_SIZE) {
    const batch = passages.slice(start, start + BATCH_SIZE);
    const userPrompt = `Question: "${question}"

Rate each passage 0-10 for relevance. Write a 1-sentence note explaining how it addresses the question. JSON only.

Passages:
${batch.map(p => `[${p.idx}] ${p.religion} (auth:${p.authority}) "${p.title}" — ${p.author}: "${p.text}"`).join('\n\n')}

Return: [{"idx": N, "score": 0-10, "note": "..."}]`;

    try {
      const response = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      const text = response.content?.[0]?.text || '';
      const json = text.match(/\[[\s\S]*\]/)?.[0];
      if (json) {
        const parsed = JSON.parse(json);
        allScores.push(...parsed);
        logger.debug({ batch: start / BATCH_SIZE, scored: parsed.length, above6: parsed.filter(s => s.score >= 6).length }, 'Rerank batch scored');
      } else {
        logger.warn({ batch: start / BATCH_SIZE, textLen: text.length, preview: text.slice(0, 200) }, 'Rerank batch: no JSON array in response');
      }
    } catch (err) {
      logger.warn({ err: err.message, batch: start / BATCH_SIZE }, 'Rerank batch scoring failed');
    }
  }

  logger.info({ candidates: passages.length, scored: allScores.length, above6: allScores.filter(s => s.score >= 6).length }, 'Rerank complete');

  const scoreMap = new Map(allScores.map(s => [s.idx, s]));
  const scored = passages.map((p, i) => {
    const s = scoreMap.get(i) || { score: 0, note: '' };
    return { ...p, relevance_score: s.score, contextual_note: s.note };
  });

  // Deduplicate: same quote appearing in multiple publications — keep the most
  // authoritative source. Rank by authority * 3 + relevance + source bonus.
  // Source bonus (+0–2) favors canonical primary texts (Gleanings, Kitáb-i-Aqdas)
  // over secondary compilations (B&NE, commentaries) for the same underlying quote.
  const byFingerprint = new Map();
  for (const p of scored) {
    const fp = p.fingerprint;
    if (!byFingerprint.has(fp)) {
      byFingerprint.set(fp, p);
    } else {
      const existing = byFingerprint.get(fp);
      const existingScore = existing.authority * 3 + existing.relevance_score + sourcePriorityBonus(existing.title);
      const newScore = p.authority * 3 + p.relevance_score + sourcePriorityBonus(p.title);
      if (newScore > existingScore) byFingerprint.set(fp, p);
    }
  }
  const deduped = [...byFingerprint.values()];
  const dupeCount = scored.length - deduped.length;
  if (dupeCount > 0) logger.info({ dupeCount, kept: deduped.length }, 'Deduped cross-publication passages');

  const ranked = deduped
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
    const reranked = await rerankPassages(record.canonical_question, candidates, chat, 50);

    // Re-attach candidate source data (text, author, title) stripped during reranking
    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    const selected = reranked.map(s => {
      const cand = candidateMap.get(s.para_id) || {};
      return { ...s, text: cand.text, author: cand.author, title: cand.title, source_site: cand.source_site, source_url: cand.source_url, external_para_id: cand.external_para_id };
    });

    // 4. Store quotes
    await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [researchId]);
    for (const q of selected) {
      await query(
        `INSERT INTO deep_research_quotes (research_id, para_id, tradition, authority, relevance_score, contextual_note, rank, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [researchId, q.para_id, q.tradition, q.authority, q.relevance_score, q.contextual_note, q.rank, new Date().toISOString()]
      );
    }

    // 5. Build structured content sections (JSON-indexed for search)
    const traditionsCovered = [...new Set(selected.map(q => q.tradition).filter(Boolean))].join(',');
    const sections = buildSections(record.canonical_question, selected, angles);
    const summary = buildSummary(sections, traditionsCovered.split(',').filter(Boolean));
    const convergence = buildConvergence(sections);

    await query(
      `UPDATE deep_research SET
         status = 'complete',
         total_selected = ?,
         traditions_covered = ?,
         sections_json = ?,
         summary_json = ?,
         convergence_json = ?,
         completed_at = ?,
         heartbeat_at = ?
       WHERE id = ?`,
      [
        selected.length, traditionsCovered,
        JSON.stringify(sections), JSON.stringify(summary), JSON.stringify(convergence),
        new Date().toISOString(), new Date().toISOString(), researchId
      ]
    );

    // 6. Sync to Meilisearch
    await syncDeepResearch([researchId]);

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

// --- Content section builders (called after rerank; no LLM needed) ---

/**
 * Group curated quotes into per-tradition sections with relevance metadata.
 * Each section is {type, tradition, title, quotes[], avg_relevance, avg_authority}.
 * These sections are the JSON-indexed content units for search.
 */
function buildSections(question, selected, angles = []) {
  const byTradition = new Map();
  for (const q of selected) {
    const key = q.tradition || 'General';
    if (!byTradition.has(key)) byTradition.set(key, []);
    byTradition.get(key).push(q);
  }
  const sections = [];
  for (const [tradition, quotes] of byTradition.entries()) {
    const angle = angles.find(a => a.tradition === tradition);
    const avgRel = quotes.reduce((s, q) => s + (q.relevance_score || 0), 0) / quotes.length;
    const avgAuth = quotes.reduce((s, q) => s + (q.authority || 5), 0) / quotes.length;
    sections.push({
      type: 'tradition',
      tradition,
      title: `${tradition} Perspective`,
      angle: angle?.angle || '',
      quotes: quotes.map(q => ({
        para_id: q.para_id,
        text: q.text,
        source_title: q.title,
        source_author: q.author,
        source_site: q.source_site,
        source_url: q.source_url,
        external_para_id: q.external_para_id,
        authority: q.authority,
        relevance_score: q.relevance_score,
        contextual_note: q.contextual_note,
        rank: q.rank,
      })),
      avg_relevance: Math.round(avgRel * 10) / 10,
      avg_authority: Math.round(avgAuth * 10) / 10,
      // Aggregated text for Meilisearch indexing
      searchable_text: quotes.map(q => q.contextual_note || '').join(' '),
    });
  }
  // Sort sections by avg_relevance * avg_authority descending
  return sections.sort((a, b) => (b.avg_relevance * b.avg_authority) - (a.avg_relevance * a.avg_authority));
}

/**
 * Build executive summary object from sections.
 */
function buildSummary(sections, traditions) {
  const highAuthority = sections.flatMap(s => s.quotes.filter(q => q.authority >= 9)).slice(0, 3);
  const notes = sections.flatMap(s => s.quotes.map(q => q.contextual_note).filter(Boolean)).slice(0, 8);
  return {
    traditions_count: traditions.length,
    traditions,
    quote_count: sections.reduce((s, sec) => s + sec.quotes.length, 0),
    top_quote: highAuthority[0]?.text?.slice(0, 280) || null,
    key_points: notes.slice(0, 5),
    // Full text for Meilisearch
    searchable_text: notes.join(' '),
  };
}

/**
 * Build convergence/divergence analysis from sections.
 * Simple heuristic — compares which traditions have high-relevance quotes.
 */
function buildConvergence(sections) {
  const highRelevance = sections.filter(s => s.avg_relevance >= 7);
  const lowRelevance = sections.filter(s => s.avg_relevance < 6);
  return {
    broadly_agreed: highRelevance.map(s => s.tradition),
    less_coverage: lowRelevance.map(s => s.tradition),
    agreements: highRelevance.map(s => `${s.tradition}: ${s.angle || 'addresses this question directly'}`),
    divergences: lowRelevance.length ? [`Some traditions have less direct coverage: ${lowRelevance.map(s => s.tradition).join(', ')}`] : [],
    searchable_text: highRelevance.map(s => s.angle).join('. '),
  };
}

/**
 * Sync deep research records to Meilisearch.
 *
 * @param {number[]} [ids] - specific IDs to sync; omit to sync all complete records
 */
export async function syncDeepResearch(ids = null) {
  const meili = getMeili();
  if (!meili) return;

  const rows = ids
    ? await queryAll(`SELECT * FROM deep_research WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : await queryAll("SELECT * FROM deep_research WHERE status = 'complete'");

  if (!rows.length) return;

  const docs = rows.map(r => {
    const summary = r.summary_json ? JSON.parse(r.summary_json) : {};
    const convergence = r.convergence_json ? JSON.parse(r.convergence_json) : {};
    const sections = r.sections_json ? JSON.parse(r.sections_json) : [];
    // Aggregate searchable text from all JSON sections + contextual notes
    const sectionText = sections.map(s => s.searchable_text || '').join(' ');
    return {
      id: r.id,
      canonical_question: r.canonical_question,
      question_hash: r.question_hash,
      slug: r.slug,
      status: r.status,
      topic_tags: r.topic_tags ? JSON.parse(r.topic_tags) : [],
      question_type: r.question_type,
      traditions_covered: r.traditions_covered ? r.traditions_covered.split(',') : [],
      ask_count: r.ask_count,
      priority: r.priority,
      created_at: r.created_at,
      completed_at: r.completed_at,
      // Searchable content from sections + summary (pre-gauged relevancy baked in)
      summary_text: summary.searchable_text || '',
      section_text: sectionText,
      convergence_text: convergence.searchable_text || '',
      key_points: summary.key_points || [],
      traditions_agreement: convergence.broadly_agreed || [],
    };
  });

  try {
    await meili.index(INDEXES.DEEP_RESEARCH).addDocuments(docs, { primaryKey: 'id' });
    logger.info({ count: docs.length }, 'Deep research synced to Meilisearch');
  } catch (err) {
    logger.warn({ err: err.message }, 'syncDeepResearch failed');
  }
}

/**
 * Look up a research record by slug.
 *
 * @param {string} slug
 * @returns {Promise<{record, quotes}|null>}
 */
export async function getDeepResearchBySlug(slug) {
  try {
    // Exclude question_embedding blob — it's large and not needed by the frontend.
    const record = await queryOne(
      'SELECT id, slug, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, angles_json, sections_json, summary_json, convergence_json, qa_json, total_candidates, total_selected, research_model, ask_count, last_asked_at, created_at, completed_at FROM deep_research WHERE slug = ?',
      [slug]
    );
    if (!record) return null;
    // Parse stored JSON fields
    for (const field of ['sections_json', 'summary_json', 'convergence_json', 'angles_json', 'qa_json', 'topic_tags']) {
      if (record[field] && typeof record[field] === 'string') {
        try { record[field] = JSON.parse(record[field]); } catch { /* leave as-is */ }
      }
    }
    const quotes = await getDeepResearchQuotes(record.id);
    return { record, quotes };
  } catch (err) {
    logger.warn({ err: err.message, slug }, 'getDeepResearchBySlug error');
    return null;
  }
}

/**
 * Add an email notification request for when research completes.
 */
export async function addNotifyEmail(researchId, email) {
  try {
    await query(
      'INSERT OR IGNORE INTO deep_research_notify (research_id, email, created_at) VALUES (?, ?, ?)',
      [researchId, email.trim().toLowerCase(), new Date().toISOString()]
    );
    return true;
  } catch (err) {
    logger.warn({ err: err.message, researchId, email }, 'addNotifyEmail error');
    return false;
  }
}

/**
 * Get all pending email notifications for a research record (called by worker after completion).
 */
export async function getPendingNotifications(researchId) {
  return queryAll(
    'SELECT * FROM deep_research_notify WHERE research_id = ? AND notified_at IS NULL',
    [researchId]
  );
}

/**
 * Mark notifications as sent.
 */
export async function markNotificationsSent(ids) {
  if (!ids?.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await query(`UPDATE deep_research_notify SET notified_at = ? WHERE id IN (${placeholders})`, [new Date().toISOString(), ...ids]);
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
