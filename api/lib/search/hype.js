// HyPE sidecar search + sync. The HyPE index holds one document per
// hypothetical-question (and thesis) generated for each enriched paragraph,
// pointing back at the parent paragraph_id. Querying it semantically
// surfaces paragraphs whose questions match the user's query directly,
// which is a much sharper signal than topic-vector matching against the
// paragraph text alone.
//
// `searchHypeQuestions` issues a hybrid (vector + keyword) query against
// the sidecar; multiIndexSearch in search.js merges its results with the
// main paragraph hits via Reciprocal Rank Fusion.
//
// `syncHypeBatch` is the bulk indexer: pulls enriched paragraphs whose
// `enhanced_synced=0` and pushes one Meili doc per question/thesis with
// the paragraph's metadata + a fresh embedding of the question text.
//
// `getMeili` and `INDEXES` come from the parent search.js — passed in as
// dependencies to keep this module loosely coupled.

import { logger } from '../logger.js';
import { createEmbedding, createEmbeddings } from '../ai.js';

/**
 * Convert stored hyp_questions text → array of trimmed question strings.
 * Handles two storage formats: newline-separated (canonical) and JSON
 * arrays (legacy rows from before the format migrated).
 */
export function parseStoredHypQuestions(raw) {
  if (!raw || typeof raw !== 'string') return [];
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(q => String(q).trim()).filter(Boolean);
    } catch { /* fall through to newline split */ }
  }
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

/**
 * Hybrid search the HyPE sidecar by query.
 * @param {object} deps - { getMeili, INDEXES }
 * @param {string} query
 * @param {object} options - { limit, filters: { religion, collection, documentId|doc_id, encumbered } }
 */
export async function searchHypeQuestions({ getMeili, INDEXES }, query, options = {}) {
  const meili = getMeili();
  if (!meili || !query || !query.trim()) return { hits: [] };
  const { limit = 10, filters = {} } = options;

  let vector;
  try {
    const { embedding } = await createEmbedding(query, { caller: 'hype-search' });
    vector = embedding;
  } catch (err) {
    logger.warn({ err: err.message }, 'HyPE search: embedding generation failed');
    return { hits: [] };
  }

  const meiliFilters = [];
  if (filters.religion) meiliFilters.push(`religion = "${filters.religion.replace(/"/g, '\\"')}"`);
  if (filters.collection) meiliFilters.push(`collection = "${filters.collection.replace(/"/g, '\\"')}"`);
  // author is not indexed in hype_questions — skip it here (applied to main paragraph index only)

  // Accept either camelCase (from executeSearch) or snake_case for doc_id
  const docIdFilter = typeof filters.documentId === 'number' ? filters.documentId
    : (typeof filters.doc_id === 'number' ? filters.doc_id : null);
  if (docIdFilter !== null) meiliFilters.push(`doc_id = ${docIdFilter}`);
  if (filters.encumbered === false) meiliFilters.push('encumbered != 1');

  try {
    const result = await meili.index(INDEXES.HYPE_QUESTIONS).search(query, {
      vector,
      hybrid: { semanticRatio: 0.85, embedder: 'default' },
      limit,
      ...(meiliFilters.length ? { filter: meiliFilters.join(' AND ') } : {}),
      showRankingScore: true,
      attributesToRetrieve: ['id', 'paragraph_id', 'doc_id', 'religion', 'collection', 'authority', 'question_text']
    });
    const hits = (result.hits || []).map(h => ({ ...h, _semanticScore: h._rankingScore || 0 }));
    return { hits, processingTimeMs: result.processingTimeMs };
  } catch (err) {
    logger.warn({ err: err.message, query }, 'HyPE search failed');
    return { hits: [] };
  }
}

/**
 * Sync a batch of HyPE-enriched paragraphs to the sidecar index.
 * Returns { processed, indexed, errors } counts.
 *
 * Pulls enriched paragraphs (hyp_questions IS NOT NULL OR hyp_thesis IS NOT NULL)
 * that aren't yet synced (enhanced_synced=0), generates one Meili doc per
 * question/thesis, embeds them, and inserts.
 *
 * @param {object} deps - { getMeili, INDEXES }
 * @param {object} options - { queryAll, query, getAuthority, limit }
 */
export async function syncHypeBatch({ getMeili, INDEXES }, { queryAll, query, getAuthority, limit = 100 } = {}) {
  if (!queryAll || !query) {
    throw new Error('syncHypeBatch requires queryAll and query (from api/lib/db.js)');
  }
  const meili = getMeili();
  if (!meili) {
    return { processed: 0, indexed: 0, errors: 0, skipped: 'meili-unavailable' };
  }

  // INDEXED BY forces the planner onto idx_content_hype_to_sync (migration 59).
  // Without the hint, SQLite picks idx_content_deleted_at — a 99%-of-rows
  // index that turns this batch into a 54-second scan and pushes the worker
  // past its PM2 memory cap. With the hint: <200ms on 4M rows.
  const rows = await queryAll(`
    SELECT c.id AS paragraph_id, c.doc_id, c.hyp_questions, c.hyp_thesis,
           d.religion, d.collection, d.encumbered, d.title, d.author
    FROM content c INDEXED BY idx_content_hype_to_sync
    JOIN docs d ON d.id = c.doc_id
    WHERE c.enhanced_synced = 0
      AND (c.hyp_questions IS NOT NULL OR c.hyp_thesis IS NOT NULL)
      AND c.deleted_at IS NULL
      AND COALESCE(c.is_duplicate, 0) = 0
      AND d.deleted_at IS NULL
    ORDER BY c.id
    LIMIT ?
  `, [limit]);

  if (rows.length === 0) return { processed: 0, indexed: 0, errors: 0 };

  // Build per-question records (paragraph_id × question_index).
  // Sonnet-tier paragraphs have a hyp_thesis (one-sentence doctrinal claim) —
  // ALSO indexed as a virtual "question" suffixed _t. Thesis is searchable
  // both semantically and via the is_thesis filter.
  const records = [];
  const sourceParagraphIds = [];
  const questionTexts = [];

  for (const row of rows) {
    const questions = parseStoredHypQuestions(row.hyp_questions);
    const thesis = (row.hyp_thesis || '').trim();
    if (questions.length === 0 && !thesis) continue;
    sourceParagraphIds.push(row.paragraph_id);
    let authority = 0;
    try { authority = getAuthority ? getAuthority({ author: row.author, title: row.title }) : 0; }
    catch { authority = 0; }
    if (thesis) {
      records.push({
        id: `${row.paragraph_id}_t`,
        paragraph_id: row.paragraph_id,
        doc_id: row.doc_id,
        religion: row.religion || null,
        collection: row.collection || null,
        authority,
        encumbered: row.encumbered ? 1 : 0,
        question_text: thesis,
        is_thesis: 1
      });
      questionTexts.push(thesis);
    }
    questions.forEach((q, qi) => {
      records.push({
        id: `${row.paragraph_id}_${qi}`,
        paragraph_id: row.paragraph_id,
        doc_id: row.doc_id,
        religion: row.religion || null,
        collection: row.collection || null,
        authority,
        encumbered: row.encumbered ? 1 : 0,
        question_text: q,
        is_thesis: 0
      });
      questionTexts.push(q);
    });
  }

  if (records.length === 0) {
    // All rows had empty hyp_questions — mark them synced anyway so we don't loop
    if (sourceParagraphIds.length > 0) {
      const placeholders = sourceParagraphIds.map(() => '?').join(',');
      await query(`UPDATE content SET enhanced_synced = 1 WHERE id IN (${placeholders})`, sourceParagraphIds);
    }
    return { processed: rows.length, indexed: 0, errors: 0 };
  }

  // Batch-embed all questions. createEmbeddings handles internal batching.
  let embeddings;
  try {
    const result = await createEmbeddings(questionTexts, { caller: 'hype-sync' });
    embeddings = result.embeddings;
  } catch (err) {
    logger.error({ err: err.message, count: questionTexts.length }, 'HyPE sync: embedding generation failed');
    return { processed: 0, indexed: 0, errors: rows.length };
  }
  if (!Array.isArray(embeddings) || embeddings.length !== records.length) {
    logger.error({ got: embeddings?.length, expected: records.length }, 'HyPE sync: embedding count mismatch');
    return { processed: 0, indexed: 0, errors: rows.length };
  }

  // Format MUST be `_vectors: { default: <flat array> }` to match the rest of
  // the sync workers. The shorthand `{embeddings, regenerate}` form is silently
  // accepted by Meili but doesn't actually populate the vector store
  // (numberOfEmbeddings stays 0). Verified against sync-processor.js.
  const meiliDocs = records.map((r, i) => ({ ...r, _vectors: { default: embeddings[i] } }));

  try {
    const filterStr = `paragraph_id IN [${sourceParagraphIds.join(',')}]`;
    await meili.index(INDEXES.HYPE_QUESTIONS).deleteDocuments({ filter: filterStr });
  } catch (err) {
    logger.warn({ err: err.message }, 'HyPE sync: prior-rows delete failed (continuing)');
  }

  try {
    await meili.index(INDEXES.HYPE_QUESTIONS).addDocuments(meiliDocs, { primaryKey: 'id' });
  } catch (err) {
    logger.error({ err: err.message, count: meiliDocs.length }, 'HyPE sync: addDocuments failed');
    return { processed: 0, indexed: 0, errors: rows.length };
  }

  const placeholders = sourceParagraphIds.map(() => '?').join(',');
  await query(`UPDATE content SET enhanced_synced = 1 WHERE id IN (${placeholders})`, sourceParagraphIds);

  logger.info({
    paragraphs: rows.length,
    questions_indexed: meiliDocs.length
  }, 'HyPE sidecar sync batch complete');

  return { processed: rows.length, indexed: meiliDocs.length, errors: 0 };
}
