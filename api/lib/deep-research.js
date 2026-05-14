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
 * Step 0: Knowledge brief — use LLM general knowledge to produce a research target map.
 * For each angle, lists known canonical passages per tradition as search targets plus
 * discovery phrases. General knowledge guides the search — it never provides content.
 *
 * @param {string} question
 * @param {Function} chat
 * @returns {Promise<{angles: Array, general_search_phrases: Array}>}
 */
export async function knowledgeBrief(question, chat) {
  const TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh'];
  const response = await chat([
    {
      role: 'system',
      content: `You are a comparative religion scholar. Your task is to produce a research brief that guides a library search — NOT to answer the question yourself. General knowledge identifies WHERE to look and WHAT to look for. All content comes from the library. Return JSON only.`
    },
    {
      role: 'user',
      content: `Question: "${question}"

Produce a knowledge brief: a structured map of known canonical passages and search directions for each major angle, so a library search can be intelligently targeted.

For each angle (5-6 distinct thematic angles), provide per-tradition (only include traditions with real content — skip if unsure):
- "known_passages": up to 2 specific passages you are confident exist in that tradition's primary texts. Each: { "text_fragment": "4-6 exact words from the passage", "source": "book name", "search_phrases": ["phrase1", "phrase2"] }. Only include passages you are confident about.
- "search_phrases": 1-2 discovery phrases for this tradition × angle

Also provide "general_search_phrases": 3-4 broad queries on the main question (no tradition filter).

Traditions: ${TRADITIONS.join(', ')}

Return JSON:
{
  "angles": [
    {
      "theme": "concise angle label (5-8 words)",
      "core_claim": "1-2 sentences: what this angle covers",
      "traditions": {
        "TraditionName": {
          "teaching": "1 sentence on what this tradition teaches on this angle",
          "known_passages": [
            { "text_fragment": "exact words from text", "source": "book name", "search_phrases": ["phrase1", "phrase2"] }
          ],
          "search_phrases": ["discovery phrase1", "discovery phrase2"]
        }
      }
    }
  ],
  "general_search_phrases": ["broad query1", "broad query2", "broad query3", "broad query4"]
}`
    }
  ], { max_tokens: 10000 });

  const text = response.content?.[0]?.text || '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('knowledgeBrief: no JSON in response');
  let result;
  try {
    result = JSON.parse(json);
  } catch (parseErr) {
    // LLM response truncated — try to salvage partial JSON
    const truncated = json.replace(/,?\s*\{[^{}]*$/, '').replace(/,?\s*\[[^[\]]*$/, '') + ']}]}';
    try { result = JSON.parse(truncated); } catch { throw new Error(`knowledgeBrief: JSON parse failed — ${parseErr.message}`); }
  }
  const totalKnown = (result.angles || []).reduce((sum, a) =>
    sum + Object.values(a.traditions || {}).reduce((s, t) => s + (t.known_passages?.length || 0), 0), 0);
  logger.info({ angles: result.angles?.length, knownPassages: totalKnown }, 'Knowledge brief complete');
  return result;
}

/**
 * Targeted retrieval — search for known canonical passages from the knowledge brief.
 * Keyword-heavy (semanticRatio: 0.25) + religion-filtered for maximum precision.
 *
 * @param {object} brief - result of knowledgeBrief()
 * @param {Function} search
 * @returns {Promise<Array>} Candidate paragraphs
 */
export async function targetedRetrieval(brief, search) {
  const seen = new Set();
  const candidates = [];

  const tasks = [];
  for (const angle of (brief.angles || [])) {
    for (const [tradition, tradData] of Object.entries(angle.traditions || {})) {
      for (const passage of (tradData.known_passages || [])) {
        for (const phrase of (passage.search_phrases || []).slice(0, 2)) {
          tasks.push({ phrase, tradition });
        }
      }
    }
  }

  const results = await Promise.all(tasks.map(async ({ phrase, tradition }) => {
    try {
      const r = await search(phrase, { limit: 10, filters: { religion: tradition }, semanticRatio: 0.25 });
      return { hits: r.hits || [], tradition };
    } catch (err) {
      logger.warn({ err: err.message, tradition, phrase: phrase.slice(0, 50) }, 'targetedRetrieval error');
      return { hits: [], tradition };
    }
  }));

  for (const { hits, tradition } of results) {
    for (const hit of hits) {
      if ((hit.text || '').length < 80) continue;
      if (!seen.has(hit.id)) { seen.add(hit.id); candidates.push({ ...hit, _searchTradition: tradition, _searchType: 'targeted' }); }
    }
  }

  logger.info({ tasks: tasks.length, found: candidates.length }, 'Targeted retrieval complete');
  return candidates;
}

/**
 * Discovery fan-out — angle × tradition searches to find passages beyond known examples.
 * Semantic-balanced (semanticRatio: 0.65) + religion-filtered.
 *
 * @param {object} brief - result of knowledgeBrief()
 * @param {Function} search
 * @returns {Promise<Array>} Candidate paragraphs
 */
export async function discoveryFanOut(brief, search) {
  const seen = new Set();
  const candidates = [];

  const tasks = [];
  for (const angle of (brief.angles || [])) {
    for (const [tradition, tradData] of Object.entries(angle.traditions || {})) {
      for (const phrase of (tradData.search_phrases || []).slice(0, 2)) {
        tasks.push({ phrase, tradition });
      }
    }
  }

  const results = await Promise.all(tasks.map(async ({ phrase, tradition }) => {
    try {
      const r = await search(phrase, { limit: 20, filters: { religion: tradition }, semanticRatio: 0.65 });
      return { hits: r.hits || [], tradition };
    } catch (err) {
      logger.warn({ err: err.message, tradition, phrase: phrase.slice(0, 50) }, 'discoveryFanOut error');
      return { hits: [], tradition };
    }
  }));

  for (const { hits, tradition } of results) {
    for (const hit of hits) {
      if ((hit.text || '').length < 80) continue;
      if (!seen.has(hit.id)) { seen.add(hit.id); candidates.push({ ...hit, _searchTradition: tradition, _searchType: 'discovery' }); }
    }
  }

  logger.info({ tasks: tasks.length, found: candidates.length }, 'Discovery fan-out complete');
  return candidates;
}

/**
 * General discovery — broad unfiltered queries to find unexpected cross-tradition passages.
 *
 * @param {object} brief - result of knowledgeBrief()
 * @param {Function} search
 * @returns {Promise<Array>} Candidate paragraphs
 */
export async function generalDiscovery(brief, search) {
  const seen = new Set();
  const candidates = [];

  const phrases = (brief.general_search_phrases || []).slice(0, 6);
  const results = await Promise.all(phrases.map(async phrase => {
    try {
      const r = await search(phrase, { limit: 25, filters: {}, semanticRatio: 0.65 });
      return r.hits || [];
    } catch (err) {
      logger.warn({ err: err.message, phrase: phrase.slice(0, 50) }, 'generalDiscovery error');
      return [];
    }
  }));

  for (const hits of results) {
    for (const hit of hits) {
      if ((hit.text || '').length < 80) continue;
      if (!seen.has(hit.id)) { seen.add(hit.id); candidates.push({ ...hit, _searchTradition: hit.religion || 'General', _searchType: 'general' }); }
    }
  }

  logger.info({ found: candidates.length }, 'General discovery complete');
  return candidates;
}

/**
 * Gap check loop — detect known passages not yet retrieved, retry with alternative queries.
 * Uses word-overlap on text_fragment to determine coverage. Up to maxPasses retries.
 *
 * @param {object} brief - result of knowledgeBrief()
 * @param {Array} foundCandidates - all candidates found so far
 * @param {Function} search
 * @param {number} [maxPasses=3]
 * @returns {Promise<Array>} Additional candidates found during gap-filling
 */
export async function gapCheckLoop(brief, foundCandidates, search, maxPasses = 3) {
  const foundTexts = foundCandidates.map(c => (c.text || '').toLowerCase());
  const seen = new Set(foundCandidates.map(c => c.id));
  const extra = [];

  const stopwords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'been', 'they', 'their', 'into', 'your', 'when', 'which', 'shall', 'unto', 'thee', 'thou', 'hath', 'doth', 'thus', 'such', 'also', 'upon', 'must', 'more', 'than', 'were', 'there', 'what', 'even', 'only']);
  const keyWords = frag => frag.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));

  const isCovered = (fragment) => {
    const words = keyWords(fragment);
    if (words.length === 0) return true;
    const needed = Math.max(2, Math.ceil(words.length * 0.6));
    return foundTexts.some(text => words.filter(w => text.includes(w)).length >= needed);
  };

  const unfound = [];
  for (const angle of (brief.angles || [])) {
    for (const [tradition, tradData] of Object.entries(angle.traditions || {})) {
      for (const passage of (tradData.known_passages || [])) {
        if (!isCovered(passage.text_fragment)) {
          unfound.push({ passage, tradition });
        }
      }
    }
  }

  if (!unfound.length) {
    logger.info({ passes: 0 }, 'Gap check: all known passages covered');
    return extra;
  }

  logger.info({ unfound: unfound.length }, 'Gap check: retrying unfound passages');

  const remaining = [...unfound];
  for (let pass = 0; pass < maxPasses && remaining.length > 0; pass++) {
    // Collect all search tasks for this pass and run in parallel
    const tasks = remaining.flatMap(({ passage, tradition }) =>
      (passage.search_phrases || []).slice(0, 3).map(phrase => ({ phrase, tradition, passage }))
    );
    const taskResults = await Promise.all(tasks.map(async ({ phrase, tradition }) => {
      try {
        const r = await search(phrase, { limit: 15, filters: { religion: tradition }, semanticRatio: 0.15 });
        return { hits: r.hits || [], tradition };
      } catch (err) {
        logger.warn({ err: err.message, phrase: phrase.slice(0, 50) }, 'gapCheckLoop search error');
        return { hits: [], tradition };
      }
    }));
    // Merge all new hits from this pass
    for (const { hits, tradition } of taskResults) {
      for (const hit of hits) {
        if ((hit.text || '').length < 80) continue;
        if (!seen.has(hit.id)) {
          seen.add(hit.id);
          extra.push({ ...hit, _searchTradition: tradition, _searchType: 'gap' });
          foundTexts.push((hit.text || '').toLowerCase());
        }
      }
    }
    // Re-check which passages remain uncovered after all new hits are merged
    const stillUnfound = remaining.filter(({ passage }) => !isCovered(passage.text_fragment));
    remaining.length = 0;
    remaining.push(...stillUnfound);
    logger.info({ pass: pass + 1, remaining: stillUnfound.length, extra: extra.length }, 'Gap check pass complete');
  }

  if (remaining.length > 0) {
    logger.warn(
      { stillMissing: remaining.map(u => `${u.tradition}: ${u.passage.text_fragment.slice(0, 40)}`).join('; ') },
      'Gap check: some known passages not found in library'
    );
  }

  return extra;
}


/**
 * Keyword pre-filter — eliminate candidates with zero keyword overlap with the question.
 * Runs before LLM rerank to cut ~40-50% of candidates cheaply. Only filters on exact
 * word match, so it only removes clear misses (not false negatives on relevant passages).
 */
function keywordPreFilter(question, candidates) {
  const stopwords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'been', 'they', 'their', 'into', 'your', 'when', 'which', 'shall', 'unto', 'thee', 'thou', 'hath', 'doth', 'thus', 'such', 'also', 'upon', 'must', 'more', 'than', 'were', 'there', 'what', 'even', 'only', 'does', 'about', 'some', 'very', 'just', 'like', 'then', 'them', 'these', 'those', 'over', 'after', 'before', 'both', 'each', 'here', 'most', 'other', 'through']);
  const keyWords = question.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
  if (keyWords.length < 2) return candidates;

  const before = candidates.length;
  const filtered = candidates.filter(c => {
    const text = (c.text || '').toLowerCase();
    return keyWords.some(w => text.includes(w));
  });
  const eliminated = before - filtered.length;
  if (eliminated > 0) logger.info({ eliminated, kept: filtered.length, total: before }, 'Keyword pre-filter');
  return filtered;
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
  // eslint-disable-next-line no-misleading-character-class
  return (text || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
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

  const BATCH_SIZE = 30; // ~30 passages at 200 chars each ≈ 6K chars, comfortable prompt
  const RERANK_CONCURRENCY = 3; // parallel LLM calls
  const passages = candidates.slice(0, 270).map((c, i) => ({
    idx: i,
    id: c.id,
    text: (c.text || '').slice(0, 200), // 350→200: still enough signal, saves ~40% tokens
    title: c.title || '',
    author: c.author || '',
    religion: c.religion || c._searchTradition || '',
    authority: c.authority || getAuthority(c),
    fingerprint: textFingerprint(c.text || ''),
  }));

  const systemPrompt = `You are an expert in comparative religion. Score passages 0-10 for direct relevance to a spiritual question.

Scoring rules:
- 9-10: Passage directly and substantively addresses the question — the core subject of the passage IS the question topic
- 7-8: Passage clearly addresses the question topic, though it may also address other things
- 5-6: Passage is thematically related but only touches the question topic tangentially or metaphorically
- 3-4: Passage is from a related domain but does not address the question topic itself
- 0-2: Passage is unrelated or only shares keywords without sharing meaning

CRITICAL: A passage that uses related vocabulary (e.g. "tests", "trials", "affliction") without actually discussing the question topic scores 4 or below. The passage must directly address the question, not merely be retrievable by the same keywords.

Return ONLY valid JSON array.`;

  const scoreBatch = async (batch, batchIdx) => {
    const userPrompt = `Question: "${question}"

Score each passage 0-10 for DIRECT relevance (not thematic proximity).

For the "answer" field: write a SHORT phrase (under 12 words) that rephrases what THIS passage says in answer to the question. Write it as the answer itself — not a description of the passage. Example: "Suffering purifies the soul like fire refines gold." If the passage doesn't directly address the question, write "Not directly relevant."

JSON only.

Passages:
${batch.map(p => `[${p.idx}] ${p.religion} (auth:${p.authority}) "${p.title}" — ${p.author}: "${p.text}"`).join('\n\n')}

Return: [{"idx": N, "score": 0-10, "answer": "..."}]`;

    try {
      const response = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { model: 'claude-haiku-4-5-20251001', caller: 'deep-research/rerank' });
      const text = response.content?.[0]?.text || '';
      const json = text.match(/\[[\s\S]*\]/)?.[0];
      if (json) {
        const parsed = JSON.parse(json);
        logger.debug({ batch: batchIdx, scored: parsed.length, above6: parsed.filter(s => s.score >= 6).length }, 'Rerank batch scored');
        return parsed;
      }
      logger.warn({ batch: batchIdx, textLen: text.length, preview: text.slice(0, 200) }, 'Rerank batch: no JSON array in response');
      return [];
    } catch (err) {
      logger.warn({ err: err.message, batch: batchIdx }, 'Rerank batch scoring failed');
      return [];
    }
  };

  // Build batch list then run RERANK_CONCURRENCY at a time
  const batches = [];
  for (let start = 0; start < passages.length; start += BATCH_SIZE) {
    batches.push({ batch: passages.slice(start, start + BATCH_SIZE), idx: batches.length });
  }

  const allScores = [];
  for (let i = 0; i < batches.length; i += RERANK_CONCURRENCY) {
    const group = batches.slice(i, i + RERANK_CONCURRENCY);
    const groupResults = await Promise.all(group.map(({ batch, idx }) => scoreBatch(batch, idx)));
    for (const scores of groupResults) allScores.push(...scores);
  }

  logger.info({ candidates: passages.length, scored: allScores.length, above6: allScores.filter(s => s.score >= 6).length }, 'Rerank complete');

  const scoreMap = new Map(allScores.map(s => [s.idx, s]));
  const scored = passages.map((p, i) => {
    const s = scoreMap.get(i) || { score: 0, answer: '' };
    return { ...p, relevance_score: s.score, contextual_note: s.answer };
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

  // Threshold 5: passage must clearly address the question. Old threshold 3 let in tangential
  // matches; 7 was too strict for cross-tradition research where scoring varies by tradition idiom.
  const ranked = deduped
    .filter(p => p.relevance_score >= 5)
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
 * Assess coverage gaps and append missing canonical passages to sections.
 * Single LLM call with section labels only (not full excerpts) — cheap.
 * Identifies famous missing passages → parallel searches → appends to sections.
 * No re-clustering: supplements existing sections in place.
 *
 * @param {string} question
 * @param {Array} sections - output of clusterAndStructure
 * @param {Function} chat
 * @param {Function} search
 * @returns {Promise<Array>} sections (mutated in place, also returned)
 */
export async function assessAndSupplement(question, sections, chat, search) {
  if (!sections.length) return sections;

  const traditionsCovered = [...new Set(sections.flatMap(s => s.traditions || []))];
  const sectionLabels = sections.map((s, i) => ({
    idx: i,
    label: s.label,
    traditions: s.traditions || [],
    quote_count: s.quotes?.length || 0,
  }));

  let missing = [];
  try {
    const response = await chat([
      {
        role: 'system',
        content: `You are a comparative religion scholar reviewing research coverage. Identify famous authoritative passages likely missing from a research set. Be specific and accurate — only suggest passages you are highly confident exist.`
      },
      {
        role: 'user',
        content: `Question: "${question}"

Traditions covered: ${traditionsCovered.join(', ')}

Research sections:
${sectionLabels.map(s => `[${s.idx}] "${s.label}" — ${s.quote_count} quotes from: ${s.traditions.join(', ') || 'none'}`).join('\n')}

What famous authoritative passages are likely missing? Focus on:
- Canonical passages any scholar would expect to find here
- Traditions with few or no quotes for a directly relevant section
- Cross-tradition parallels that illuminate the question

Return JSON (empty array if coverage looks complete):
{
  "missing": [
    {
      "tradition": "name",
      "text_fragment": "4-6 exact words from passage",
      "source": "book name",
      "search_phrases": ["phrase1", "phrase2"],
      "aspect_idx": 0
    }
  ]
}`
      }
    ], { max_tokens: 2000 });

    const text = response.content?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (json) {
      const result = JSON.parse(json);
      missing = result.missing || [];
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'assessAndSupplement LLM call failed — skipping');
    return sections;
  }

  if (!missing.length) {
    logger.info('assessAndSupplement: coverage complete — no gaps identified');
    return sections;
  }

  logger.info({ missing: missing.length }, 'assessAndSupplement: searching for missing passages');

  // Parallel searches for all missing passages
  const searchTasks = missing.flatMap(m =>
    (m.search_phrases || []).slice(0, 2).map(phrase => ({ phrase, m }))
  );
  const searchResults = await Promise.all(searchTasks.map(async ({ phrase, m }) => {
    try {
      const filter = m.tradition ? { religion: m.tradition } : {};
      const r = await search(phrase, { limit: 8, filters: filter, semanticRatio: 0.25 });
      return { hits: r.hits || [], m };
    } catch { return { hits: [], m }; }
  }));

  const existingIds = new Set(sections.flatMap(s => (s.quotes || []).map(q => q.para_id)));
  let appended = 0;

  for (const { hits, m } of searchResults) {
    const targetSection = sections[m.aspect_idx];
    if (!targetSection) continue;
    for (const hit of hits) {
      if ((hit.text || '').length < 80) continue;
      if (existingIds.has(hit.id)) continue;
      existingIds.add(hit.id);
      targetSection.quotes.push({
        para_id: hit.id,
        tradition: hit.religion || m.tradition,
        excerpt: (hit.text || '').slice(0, 280),
        source_title: hit.title || m.source,
        source_author: hit.author || '',
        source_site: hit.source_site,
        source_url: hit.source_url,
        external_para_id: hit.external_para_id,
        authority: getAuthority(hit),
        relevance_score: 6,
        contextual_note: `Supplemented from ${m.source || m.tradition}`,
      });
      if (hit.religion && !targetSection.traditions.includes(hit.religion)) {
        targetSection.traditions.push(hit.religion);
      }
      appended++;
      break; // one hit per missing passage
    }
  }

  logger.info({ appended }, 'assessAndSupplement complete');
  return sections;
}

/**
 * Quality assessment — objective scoring of a completed research run.
 * Computes data-driven metrics (tradition coverage, authority, relevance, depth)
 * plus a single LLM call for coverage completeness. Cheap: uses section labels only.
 *
 * Scoring dimensions (each 1-10):
 *   tradition_coverage — breadth across major world religions
 *   authority          — avg authority of selected passages
 *   relevance          — avg LLM relevance score of selected passages
 *   depth              — fraction of aspects with ≥2 quotes
 *   completeness       — LLM assessment: are obvious canonical passages present?
 *   overall            — weighted composite
 *
 * @param {string} question
 * @param {Array} sections - clustered aspects with quotes
 * @param {Array} selectedQuotes - flat list of all selected passages (with authority/relevance_score)
 * @param {Function} chat
 * @returns {Promise<{scores, overall, grade, gaps, assessment}>}
 */
export async function runQualityAssessment(question, sections, selectedQuotes, chat) {
  const MAJOR_TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh'];

  const traditions = [...new Set(selectedQuotes.map(q => q.tradition).filter(Boolean))];
  const coveredMajor = traditions.filter(t => MAJOR_TRADITIONS.some(m => t.toLowerCase().includes(m.toLowerCase()))).length;
  const traditionCoverage = Math.min(10, Math.round(coveredMajor / MAJOR_TRADITIONS.length * 10 * 1.25)); // slight boost since 8/8 is rare

  const avgAuth = selectedQuotes.reduce((s, q) => s + (q.authority || 0), 0) / (selectedQuotes.length || 1);
  const authority = Math.min(10, Math.round(avgAuth));

  const avgRel = selectedQuotes.reduce((s, q) => s + (q.relevance_score || 0), 0) / (selectedQuotes.length || 1);
  const relevance = Math.min(10, Math.round(avgRel));

  const filledAspects = sections.filter(s => (s.quotes?.length || 0) >= 2).length;
  const depth = sections.length > 0 ? Math.round((filledAspects / sections.length) * 10) : 0;

  // LLM completeness check — cheap: section labels + tradition list only
  let completeness = 6;
  let gaps = [];
  let assessmentText = '';
  try {
    const response = await chat([
      {
        role: 'system',
        content: 'You are a comparative religion scholar. Assess research coverage objectively. Be specific and fair.'
      },
      {
        role: 'user',
        content: `Question: "${question}"

Traditions represented: ${traditions.join(', ')}
Aspects covered (${sections.length} sections):
${sections.map((s, i) => `[${i}] "${s.label}" — ${s.quotes?.length || 0} quotes from: ${(s.traditions || []).join(', ')}`).join('\n')}

Score coverage completeness 1-10:
- 9-10: All major canonical passages for this topic are present; rich cross-tradition coverage
- 7-8: Most expected passages present; minor gaps only
- 5-6: Good but missing some well-known passages from one or two traditions
- 3-4: Significant gaps — famous passages or whole traditions missing
- 1-2: Major coverage failure

Return JSON:
{
  "completeness": 7,
  "gaps": ["specific missing passage or tradition — be concrete"],
  "assessment": "2-3 sentences: what this research covers well and what's missing"
}`
      }
    ], { max_tokens: 800, caller: 'deep-research/assessment' });

    const text = response.content?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (json) {
      const r = JSON.parse(json);
      completeness = Math.max(1, Math.min(10, r.completeness || 6));
      gaps = r.gaps || [];
      assessmentText = r.assessment || '';
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Quality assessment LLM call failed');
  }

  const overall = Math.round((traditionCoverage * 1.5 + authority + relevance * 2 + depth + completeness * 2) / 7.5);
  const grade = overall >= 9 ? 'A' : overall >= 8 ? 'B+' : overall >= 7 ? 'B' : overall >= 6 ? 'C+' : overall >= 5 ? 'C' : 'D';

  logger.info({ overall, grade, traditions: traditions.length, aspects: sections.length }, 'Quality assessment complete');
  return {
    scores: { tradition_coverage: traditionCoverage, authority, relevance, depth, completeness },
    overall,
    grade,
    traditions_count: traditions.length,
    aspects_count: sections.length,
    quotes_count: selectedQuotes.length,
    gaps,
    assessment: assessmentText,
  };
}

/**
 * Run full deep research for a queued record.
 * Called exclusively from the deep-research worker.
 *
 * @param {number} researchId
 * @param {object} deps - { chat, search }
 */
export async function runDeepResearch(researchId, { chat, search, costAcc = null }) {
  const record = await queryOne('SELECT * FROM deep_research WHERE id = ?', [researchId]);
  if (!record) throw new Error(`Deep research record ${researchId} not found`);

  const workerId = `dr-${process.pid}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  await query(
    'UPDATE deep_research SET status = ?, worker_id = ?, heartbeat_at = ?, started_at = ? WHERE id = ?',
    ['in_progress', workerId, startedAt, startedAt, researchId]
  );

  try {
    logger.info({ researchId, question: record.canonical_question }, 'Deep research started');

    // Wrap chat to tag each LLM call with the pipeline step name for cost breakdown
    const taggedChat = (step) => (messages, opts = {}) => chat(messages, { ...opts, caller: `deep-research/${step}` });

    // 0. Knowledge brief — map what general knowledge knows, to guide library search
    const brief = await knowledgeBrief(record.canonical_question, taggedChat('knowledgeBrief'));
    await query('UPDATE deep_research SET angles_json = ? WHERE id = ?', [JSON.stringify({ brief }), researchId]);

    // 1-3. Retrieval — all three strategies run in parallel
    const [targeted, discovered, general] = await Promise.all([
      targetedRetrieval(brief, search),
      discoveryFanOut(brief, search),
      generalDiscovery(brief, search),
    ]);

    // Merge and deduplicate all candidates
    const seen = new Set();
    const allCandidates = [];
    for (const c of [...targeted, ...discovered, ...general]) {
      if (!seen.has(c.id)) { seen.add(c.id); allCandidates.push(c); }
    }
    logger.info({ targeted: targeted.length, discovered: discovered.length, general: general.length, total: allCandidates.length }, 'Initial retrieval complete');

    // 4. Gap check — retry known passages not yet found in the library
    const gapExtra = await gapCheckLoop(brief, allCandidates, search, 3);
    for (const c of gapExtra) {
      if (!seen.has(c.id)) { seen.add(c.id); allCandidates.push(c); }
    }

    await query('UPDATE deep_research SET total_candidates = ? WHERE id = ?', [allCandidates.length, researchId]);

    // 4b. Keyword pre-filter — eliminate clear misses before costly LLM rerank
    const filtered = keywordPreFilter(record.canonical_question, allCandidates);

    // 5. Rerank — LLM-scored relevance in parallel batches, threshold 5/10
    const reranked = await rerankPassages(record.canonical_question, filtered, taggedChat('rerank'), 100);

    // Re-attach candidate source data stripped during reranking
    const candidateMap = new Map(allCandidates.map(c => [c.id, c]));
    const selected = reranked.map(s => {
      const cand = candidateMap.get(s.para_id) || {};
      return { ...s, text: cand.text, author: cand.author, title: cand.title, source_site: cand.source_site, source_url: cand.source_url, external_para_id: cand.external_para_id };
    });

    // 6. Validate para_ids exist in content table
    const validParaIds = new Set(
      (await queryAll(
        `SELECT id FROM content WHERE id IN (${selected.map(() => '?').join(',')})`,
        selected.map(q => q.para_id)
      )).map(r => r.id)
    );
    const validSelected = selected.filter(q => validParaIds.has(q.para_id));
    const skipped = selected.length - validSelected.length;
    if (skipped > 0) logger.warn({ skipped, total: selected.length }, 'Skipped quotes with para_ids not in content table');

    await query('DELETE FROM deep_research_quotes WHERE research_id = ?', [researchId]);
    for (const q of validSelected) {
      await query(
        `INSERT INTO deep_research_quotes (research_id, para_id, tradition, authority, relevance_score, contextual_note, rank, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [researchId, q.para_id, q.tradition, q.authority, q.relevance_score, q.contextual_note, q.rank, new Date().toISOString()]
      );
    }

    // 7. Cluster by thematic aspects + extract clean excerpts (LLM-driven)
    const traditionsCovered = [...new Set(validSelected.map(q => q.tradition).filter(Boolean))].join(',');
    const structured = await clusterAndStructure(record.canonical_question, validSelected, taggedChat('cluster'), brief);
    let sections = structured?.sections || buildSectionsFallback(selected, []);
    const summary = structured?.summary || buildSummaryFallback(sections, traditionsCovered.split(',').filter(Boolean));

    // 7b. Assess coverage and append obviously missing canonical passages
    sections = await assessAndSupplement(record.canonical_question, sections, taggedChat('supplement'), search);

    // 7c. Quality assessment — score the research objectively
    const assessment = await runQualityAssessment(record.canonical_question, sections, validSelected, taggedChat('assessment'));

    const convergence = { searchable_text: sections.map(s => s.label || '').join(' ') };

    await query(
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
        validSelected.length, traditionsCovered,
        JSON.stringify(sections), JSON.stringify(summary), JSON.stringify(convergence),
        costAcc?.inputTokens || 0, costAcc?.outputTokens || 0,
        costAcc?.costUsd || 0, costAcc ? JSON.stringify(costAcc.breakdown) : null,
        JSON.stringify(assessment),
        new Date().toISOString(), new Date().toISOString(), researchId
      ]
    );

    // 8. Sync to Meilisearch
    await syncDeepResearch([researchId]);

    logger.info({ researchId, selected: validSelected.length, traditions: traditionsCovered }, 'Deep research complete');
  } catch (err) {
    await query(
      'UPDATE deep_research SET status = ?, error = ?, heartbeat_at = ? WHERE id = ?',
      ['failed', err.message, new Date().toISOString(), researchId]
    );
    logger.error({ err: err.message, researchId }, 'Deep research failed');
    throw err;
  }
}

// --- Aspect-based clustering (LLM-driven) ---

/**
 * Cluster selected quotes into thematic aspects and extract clean English excerpts.
 * Single LLM call handles: aspect identification, quote assignment, excerpt extraction,
 * translation of non-English content, and per-aspect synthesis.
 *
 * Returns { sections[], summary } or null on failure (caller uses fallbacks).
 */
export async function clusterAndStructure(question, selected, chat, recon = null) {
  if (!selected.length) return null;

  // Use research angles as the structural anchor if available (brief.angles or legacy recon.frameworks)
  const angleList = recon?.angles || recon?.frameworks || [];
  const frameworkHint = angleList.length
    ? `\nTheological framework (from prior analysis — use these as the basis for aspects):\n${angleList.map(f => `- ${f.theme}: ${f.core_claim}`).join('\n')}\n`
    : '';

  const systemPrompt = `You are a scholar of comparative religion creating a structured interfaith research document in Q&A format.
The main document answers a big spiritual question. Sub-sections are specific aspect sub-questions backed by primary source passages.

Critical rules:
1. Frame each aspect as a focused question — vary the phrasing. Do NOT start every question with "How does". Use forms like "What role does X play?", "Why do traditions teach X?", "What happens when X?", "Is X a punishment or a gift?", etc.
2. Base the aspects on the theological framework provided — do not invent new categories from scratch.
3. Assign each quote only to an aspect it directly addresses. A quote must substantively answer the aspect sub-question — not merely be from the same tradition or thematic domain. Use aspect_idx=-1 for any quote that does not directly address at least one aspect. Precision matters: a weak assignment dilutes the section more than a rejected quote.
4. Extract the most directly relevant 2-4 sentences from each passage. The excerpt must answer the sub-question. Prefer complete thoughts — never quote an entire long paragraph.
5. For non-English text (Arabic, Persian, Sanskrit, Hebrew, Punjabi, etc.), provide ONLY a clean English translation as the excerpt.
6. Strip all markup: ⁅s1⁆, ⁅/s1⁆, **, __, ##, [], *
7. The summary for each aspect is 1-2 SHORT sentences — a plain statement of what the found passages show. No flourishes. If only one tradition is represented, say so plainly.
8. The overview is 2-3 sentences — plain synthesis of the landscape, grounded in the found texts.`;

  const userPrompt = `Main question: "${question}"
${frameworkHint}
Passages found in the library:
${selected.map((q, i) => `[${i}] ${q.tradition} auth:${q.authority} "${q.title}" — ${q.author}:
"${(q.text || '').slice(0, 220)}"`).join('\n\n')}

Return ONLY valid JSON:
{
  "aspects": [
    {"label": "Question with varied phrasing? (6-10 words)", "summary": "1-2 plain sentences. State what passages show."}
  ],
  "assignments": [
    {"quote_idx": 0, "aspect_idx": 0, "excerpt": "2-4 sentences in clean English that directly answer the sub-question", "answer": "under 12 words: what this passage says in answer to the sub-question — NOT the main question"}
  ],
  "overview": "2-3 sentences. Plain summary of what these traditions collectively teach."
}`;

  try {
    const response = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 8000 });
    const text = response.content?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) {
      logger.warn({ textSnippet: text.slice(0, 200) }, 'clusterAndStructure: no JSON found in response');
      throw new Error('No JSON in clustering response');
    }
    const result = JSON.parse(json);

    // Build sections from aspects + assignments
    const assignMap = new Map();
    for (const a of (result.assignments || [])) {
      if (a.aspect_idx >= 0) {
        if (!assignMap.has(a.aspect_idx)) assignMap.set(a.aspect_idx, []);
        assignMap.get(a.aspect_idx).push({ ...a, quote: selected[a.quote_idx] });
      }
    }

    const sections = (result.aspects || []).map((aspect, idx) => {
      const assigned = assignMap.get(idx) || [];
      const quotes = assigned.map(a => {
        const q = a.quote || {};
        return {
          para_id: q.para_id,
          tradition: q.tradition,
          excerpt: a.excerpt || (q.text || '').slice(0, 280),
          source_title: q.title,
          source_author: q.author,
          source_site: q.source_site,
          source_url: q.source_url,
          external_para_id: q.external_para_id,
          authority: q.authority,
          relevance_score: q.relevance_score,
          contextual_note: a.answer || q.contextual_note,
        };
      }).filter(q => q.excerpt)
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

      const avgRel = quotes.reduce((s, q) => s + (q.relevance_score || 0), 0) / (quotes.length || 1);
      const traditions = [...new Set(quotes.map(q => q.tradition).filter(Boolean))];
      return {
        type: 'aspect',
        label: aspect.label,
        summary: aspect.summary,
        traditions,
        quotes,
        avg_relevance: Math.round(avgRel * 10) / 10,
        searchable_text: [aspect.summary, ...quotes.map(q => q.contextual_note || '')].join(' '),
      };
    }).filter(s => s.quotes.length > 0);

    const allQuotes = sections.flatMap(s => s.quotes);
    const summary = {
      overview: result.overview || '',
      traditions: [...new Set(allQuotes.map(q => q.tradition).filter(Boolean))],
      quote_count: allQuotes.length,
      aspect_count: sections.length,
      searchable_text: result.overview || '',
    };

    logger.info({ aspects: sections.length, quotes: allQuotes.length }, 'Aspect clustering complete');
    return { sections, summary };
  } catch (err) {
    logger.warn({ err: err.message }, 'clusterAndStructure failed — using fallback');
    return null;
  }
}

// --- Fallback builders (used if LLM clustering fails) ---

function buildSectionsFallback(selected, angles = []) {
  const byTradition = new Map();
  for (const q of selected) {
    const key = q.tradition || 'General';
    if (!byTradition.has(key)) byTradition.set(key, []);
    byTradition.get(key).push(q);
  }
  return [...byTradition.entries()].map(([tradition, quotes]) => {
    const angle = angles.find(a => a.tradition === tradition);
    return {
      type: 'tradition',
      label: `${tradition} Perspective`,
      summary: angle?.angle || '',
      traditions: [tradition],
      quotes: quotes.map(q => ({
        para_id: q.para_id,
        tradition: q.tradition,
        excerpt: (q.text || '').slice(0, 280),
        source_title: q.title,
        source_author: q.author,
        source_site: q.source_site,
        source_url: q.source_url,
        authority: q.authority,
        relevance_score: q.relevance_score,
        contextual_note: q.contextual_note,
      })),
      searchable_text: quotes.map(q => q.contextual_note || '').join(' '),
    };
  });
}

function buildSummaryFallback(sections, traditions) {
  const notes = sections.flatMap(s => s.quotes.map(q => q.contextual_note).filter(Boolean));
  return {
    overview: '',
    traditions,
    quote_count: sections.flatMap(s => s.quotes).length,
    aspect_count: sections.length,
    searchable_text: notes.join(' '),
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
      'SELECT id, slug, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, angles_json, sections_json, summary_json, convergence_json, qa_json, assessment_json, total_candidates, total_selected, llm_input_tokens, llm_output_tokens, llm_cost_usd, started_at, research_model, ask_count, last_asked_at, created_at, completed_at FROM deep_research WHERE slug = ?',
      [slug]
    );
    if (!record) return null;
    // Parse stored JSON fields
    for (const field of ['sections_json', 'summary_json', 'convergence_json', 'angles_json', 'qa_json', 'assessment_json', 'topic_tags']) {
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
