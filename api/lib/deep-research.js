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
import { initStorage, hasCloudStorage, uploadFile, uploadImageFromUrl, generateAssetKey } from './storage.js';

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

Produce a research brief that guides a library search across ALL major religious traditions. Every tradition must be searched — your job is to identify what to look for, not to decide which traditions are relevant.

For each angle (5-6 distinct thematic angles on this question):
- "search_phrases": 2-3 broad phrases that will find relevant passages in ANY tradition (used to search all 8 traditions)
- "traditions": for EVERY tradition in [${TRADITIONS.join(', ')}], provide:
  - "search_phrases": 1-2 tradition-specific phrases (use that tradition's vocabulary — e.g., "dhyana" for Buddhism, "salat" for Islam, "puja" for Hinduism)
  - "known_passages": (optional) up to 2 specific passages you are highly confident exist. Each: { "text_fragment": "4-6 exact words", "source": "book name", "search_phrases": ["phrase1"] }

Also provide "general_search_phrases": 4-6 broad queries covering the full question.

Return JSON:
{
  "angles": [
    {
      "theme": "concise angle label (5-8 words)",
      "core_claim": "1-2 sentences: what this angle explores",
      "search_phrases": ["angle phrase 1", "angle phrase 2"],
      "traditions": {
        "TraditionName": {
          "search_phrases": ["tradition-vocabulary phrase"],
          "known_passages": [
            { "text_fragment": "exact words", "source": "book name", "search_phrases": ["phrase"] }
          ]
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
      const r = await search(phrase, { limit: 20, filters: { religion: tradition }, semanticRatio: 0.5 });
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
  const ALL_TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh'];
  const seen = new Set();
  const candidates = [];

  // Search ALL traditions for every angle — not just those the brief happened to mention.
  // Use tradition-specific phrases from brief when available; fall back to angle-level phrases.
  const tasks = [];
  for (const angle of (brief.angles || [])) {
    const anglePhrases = (angle.search_phrases || []).slice(0, 2);
    for (const tradition of ALL_TRADITIONS) {
      const tradPhrases = (angle.traditions?.[tradition]?.search_phrases || []).slice(0, 2);
      const phrases = tradPhrases.length ? tradPhrases : anglePhrases.slice(0, 1);
      for (const phrase of phrases) {
        tasks.push({ phrase, tradition });
      }
    }
  }

  const results = await Promise.all(tasks.map(async ({ phrase, tradition }) => {
    try {
      const r = await search(phrase, { limit: 25, filters: { religion: tradition }, semanticRatio: 0.65 });
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

  logger.info({ tasks: tasks.length, found: candidates.length }, 'Discovery fan-out complete (all traditions)');
  return candidates;
}

/**
 * Diversity sweep — ensures every major tradition has ≥MIN_PER_TRADITION candidates.
 * Runs after main retrieval; fills gaps that knowledgeBrief silently omitted.
 *
 * @param {string} question
 * @param {Array} allCandidates - all candidates found so far
 * @param {object} brief
 * @param {Function} search
 * @returns {Promise<Array>} Additional candidates
 */
export async function diversitySweep(question, allCandidates, brief, search) {
  const REQUIRED = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh'];
  const MIN = 5;

  const tradCount = {};
  for (const c of allCandidates) {
    const t = c.religion || '';
    if (t) tradCount[t] = (tradCount[t] || 0) + 1;
  }
  const underrepresented = REQUIRED.filter(t => (tradCount[t] || 0) < MIN);
  if (!underrepresented.length) {
    logger.info('Diversity sweep: all traditions covered');
    return [];
  }

  logger.info({ underrepresented }, 'Diversity sweep: filling gaps');
  const phrases = [question, ...(brief.general_search_phrases || []).slice(0, 2)];
  const seen = new Set(allCandidates.map(c => c.id));
  const extra = [];

  const tasks = underrepresented.flatMap(tradition =>
    phrases.slice(0, 2).map(phrase => ({ phrase, tradition }))
  );
  const results = await Promise.all(tasks.map(async ({ phrase, tradition }) => {
    try {
      const r = await search(phrase, { limit: 10, filters: { religion: tradition }, semanticRatio: 0.75 });
      return r.hits || [];
    } catch (err) {
      logger.warn({ err: err.message, tradition }, 'diversitySweep error');
      return [];
    }
  }));
  for (const hits of results) {
    for (const hit of hits) {
      if ((hit.text || '').length < 80) continue;
      if (!seen.has(hit.id)) { seen.add(hit.id); extra.push({ ...hit, _searchType: 'diversity_sweep' }); }
    }
  }
  logger.info({ added: extra.length }, 'Diversity sweep complete');
  return extra;
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
        const r = await search(phrase, { limit: 20, filters: { religion: tradition }, semanticRatio: 0.4 });
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


// Keyword pre-filter disabled: for spiritual/comparative-religion queries, topic keywords like
// "faith" are severely overloaded (e.g., "faith" = "Bahá'í Faith" institution in ~40% of Bahá'í texts),
// causing false positives for bad passages and false negatives for valid synonym-based passages
// (e.g., "certitude", "assurance"). The LLM reranker handles disambiguation correctly at low cost.
function keywordPreFilter(question, candidates) {
  return candidates;
}

// Filter out secondary compilations, commentary works, and non-authoritative sources.
// Deep research should cite primary scriptures and authoritative writings directly.
// Secondary works that merely quote primary sources should be filtered here.
function filterSecondaryCompilations(candidates) {
  const SECONDARY_TITLE = /parallel\s+(?:hidden|text)|bilingual|side.by.side|in light of scripture|ethics in light|study companion|introduction to bah|bah[aá']+[ií] world(?:\s+\d+)?|perspectives on|thematic anthology|study guide|commentary on|notes on the|annotated edition|bahá'í scholarship|bahá'í studies|vol\.\s*\d+|lawh-i-maqsud.*study|ocean of light series/i;
  // Known secondary commentators — their works interpret primary texts but are not scripture
  const SECONDARY_AUTHORS = /^udo schaefer$|^moojan momen$|^william s\. hatcher$|^william hatcher$/i;
  const before = candidates.length;
  const filtered = candidates.filter(c => {
    if (SECONDARY_TITLE.test(c.title || '')) return false;
    if (SECONDARY_AUTHORS.test(c.author || '')) return false;
    return true;
  });
  if (filtered.length < before) {
    logger.info({ removed: before - filtered.length, kept: filtered.length }, 'Filtered secondary compilation candidates');
  }
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

// Source priority bonus (−2 to +2) for canonical primary texts over secondary compilations.
// Applied as tiebreaker when authority scores are equal for the same deduped quote.
// Ensures e.g. Gleanings beats "Baha'u'llah and the New Era" for the same tablet passage.
function sourcePriorityBonus(title) {
  const t = (title || '').toLowerCase();
  // Parallel / bilingual compilations — same text exists in primary sources; never preferred
  if (/parallel|bilingual|side.by.side|comparative translation/.test(t)) return -2;
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

For the "answer" field: write a SHORT phrase (under 12 words) capturing what THIS passage says — vivid, direct, in the voice of the tradition itself. Write the insight, not a description of it. Example: "Suffering burns away what was never truly ours." If the passage doesn't directly address the question, write "Not directly relevant."

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
  const sorted = deduped
    .filter(p => p.relevance_score >= 5)
    .sort((a, b) => (b.relevance_score * 2 + b.authority) - (a.relevance_score * 2 + a.authority));

  // Tradition diversity: Bahá'í texts are plentiful (41% of corpus, auth 9-10 for Central
  // Figures) and address universal topics — they flood cross-tradition research otherwise.
  // Unless the question is specifically about the Bahá'í Faith, require a higher relevance
  // threshold (≥7) AND cap Bahá'í to 25% of topN so other traditions get fair coverage.
  const isBahaiQuestion = /bah[aá]['i\u2019]/i.test(question) || /\bbahai\b/i.test(question);
  const BAHAI_MIN_SCORE = isBahaiQuestion ? 5 : 7;
  const bahaiCap = isBahaiQuestion ? topN : Math.max(3, Math.ceil(topN * 0.25));
  let bahaiCount = 0;
  const ranked = [];
  for (const p of sorted) {
    const isBahai = /bah/i.test(p.religion || '');
    if (isBahai) {
      if (p.relevance_score < BAHAI_MIN_SCORE) continue;
      if (bahaiCount >= bahaiCap) continue;
      bahaiCount++;
    }
    ranked.push(p);
    if (ranked.length >= topN) break;
  }

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

  // Collect candidates for scoring — exclude secondary compilations, don't add until scored
  const supplementCandidates = [];
  for (const { hits, m } of searchResults) {
    const targetSection = sections[m.aspect_idx];
    if (!targetSection) continue;
    const primaryHits = filterSecondaryCompilations(hits);
    for (const hit of primaryHits) {
      if ((hit.text || '').length < 80) continue;
      if (existingIds.has(hit.id)) continue;
      supplementCandidates.push({ hit, m, targetSection });
      existingIds.add(hit.id);
      break; // one hit per missing passage
    }
  }

  // Score supplemental candidates — only add if ≥7 (clearly addresses the question)
  const scored = await rerankPassages(question, supplementCandidates.map(c => c.hit), chat, supplementCandidates.length);
  const scoredMap = new Map(scored.map(s => [s.para_id, s]));

  for (const { hit, m, targetSection } of supplementCandidates) {
    const score = scoredMap.get(hit.id);
    if (!score || score.relevance_score < 7) continue; // drop if not clearly relevant
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
      relevance_score: score.relevance_score,
      contextual_note: `Supplemented from ${m.source || m.tradition}`,
    });
    if (hit.religion && !targetSection.traditions.includes(hit.religion)) {
      targetSection.traditions.push(hit.religion);
    }
    appended++;
  }

  logger.info({ appended, candidates: supplementCandidates.length }, 'assessAndSupplement complete');
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
// Consistent artistic medium for all research hero images.
// Subject and palette vary per theme; medium is always the same.
// Consistent artistic medium — all images are abstract oil paintings, no figures, no icons.
const HERO_MEDIUM = 'Richly detailed digital oil painting with dramatic atmospheric lighting, painterly impasto texture. Purely abstract — no human figures, no prophets, no religious icons, no faces, no symbols, no text, no calligraphy. Wide 16:9 cinematic composition. Museum quality fine art.';

// Topic-to-visual-theme map. Each entry: { keys, subject, palette }
// Matched against topic_tags or keywords in the question.
const VISUAL_THEMES = [
  { keys: ['prayer','worship','devotion','dhikr','meditation'],
    subject: 'Abstract shafts of golden light streaming downward through deep indigo darkness, candlelight flames rising in curved paths, warm amber and cool violet light meeting at an unseen horizon',
    palette: 'deep midnight blue, amber gold, candlelight orange, rose violet, warm shadow brown' },
  { keys: ['afterlife','what happens after death','resurrection','rebirth'],
    subject: 'Abstract aurora borealis ribbons reflected in a perfectly still obsidian lake, flowing silver-green light dissolving into soft luminous mist at the edges',
    palette: 'deep indigo, aurora teal, silver-green, pearl white, soft violet' },
  { keys: ['death-grief','grief','mourning','significance of death','preparing for death'],
    subject: 'Abstract luminous threshold — a vertical band of warm golden-white light dividing two vast spaces of deep blue and deep violet, each beautiful, each infinite',
    palette: 'warm white-gold threshold, deep royal blue on one side, rich violet on the other, soft luminous edges' },
  { keys: ['theodicy','suffering','purpose of suffering'],
    subject: 'Stormy dark clouds breaking open with fierce shafts of golden sunlight, turbulent abstract forms of charcoal and iron giving way to blazing amber where light breaks through',
    palette: 'charcoal grey, stormy slate blue, iron black, blazing gold light, deep ember orange' },
  { keys: ['evil','darkness','nature of evil'],
    subject: 'Abstract vast dark space with a single unwavering point of warm light at center, concentric rings of darkness pressing inward, the small flame holding steady and immovable',
    palette: 'near-total black, deep umber, single warm amber light-point, faint golden corona, deep violet shadow' },
  { keys: ['tests','trials','tests-trials','hardship','adversity'],
    subject: 'Abstract mountainous forms emerging from swirling mist and fog, a single point of warm fire-light near the summit illuminating the surrounding darkness',
    palette: 'steel grey, mist white, charcoal, warm firelight gold, deep navy' },
  { keys: ['enlightenment','awakening','liberation','nirvana','moksha'],
    subject: 'Abstract vast darkness pierced by a single tremendous burst of radiant white-gold light expanding outward in all directions, darkness dissolving from center to edge',
    palette: 'pure radiant white at center, expanding gold, luminous amber, soft rose edges, dissolving darkness' },
  { keys: ['soul-spirit','human soul','nature of the soul','soul and body','what is the soul'],
    subject: 'Abstract luminous vapor gently rising and expanding through deep space, becoming more translucent and radiant as it ascends, cosmos reflected below in still dark water',
    palette: 'deep midnight blue, translucent silver-white vapor, soft gold luminescence, cosmic indigo, pearl mist' },
  { keys: ['soul','consciousness','self','inner life'],
    subject: 'Abstract luminous sphere at the center of vast dark space, radiating soft concentric rings of light outward, surrounded by deep cosmic void with distant nebula-like clouds of color',
    palette: 'luminous pearl white, soft rose, cosmic deep blue, nebula violet, warm gold core' },
  { keys: ['mysticism','nearness','nearness-to-god','unity of god','transcendence','mystical','contemplative'],
    subject: 'Abstract concentric geometric rings of light dissolving into radiant white at the center, deep blue-black at the edges, layers of translucent color creating infinite depth',
    palette: 'radiant white, cream gold, deep sky blue, midnight indigo, translucent violet layers' },
  { keys: ['ethics','conduct','virtue','morality','character','forgiveness','reconciliation'],
    subject: 'Abstract scales of light and shadow balanced over an implied horizon, two luminous masses of warm and cool color meeting in perfect equilibrium at the center',
    palette: 'warm gold, cool silver-blue, soft white, slate grey, gentle rose' },
  { keys: ['justice','fairness','equity','rights'],
    subject: 'Abstract columns of blazing white light rising from darkness, orderly and strong, each pillar casting pools of clarity against deep shadow',
    palette: 'pure white, iron grey, deep black, warm ivory, muted gold' },
  { keys: ['mercy','compassion','mercy-compassion','grace'],
    subject: 'Abstract warm rose and amber light pouring downward like liquid honey over dark forms below, softening edges and dissolving harshness into gentle warmth',
    palette: 'warm rose gold, soft amber, ivory white, gentle peach, tender lavender' },
  { keys: ['faith','doubt','trust','belief','certainty','uncertainty'],
    subject: 'Abstract path of luminous stepping-stones crossing a dark void, each stone glowing warmly, surrounded by darkness yet connected by a thread of light into the unknown distance',
    palette: 'warm amber stepping-stones, deep void black, faint connecting thread of gold, distant luminous horizon' },
  { keys: ['free will','predestination','free-will','choice','determinism'],
    subject: 'Abstract diverging paths of light in a vast dark space, two streams of luminous color branching apart from a single glowing origin point, each following its own arc',
    palette: 'blue-white origin, golden path, silver path, deep void black, soft twilight purple' },
  { keys: ['revelation','prophecy','scripture','divine word','scripture-study'],
    subject: 'Abstract blazing light descending vertically from above like a column of fire, striking an implied surface below and sending arcs of light outward in all directions',
    palette: 'blazing white-gold, deep navy sky, flame orange, radiant yellow, charcoal shadow' },
  { keys: ['progressive revelation','progressive-revelation','history','evolution','ages'],
    subject: 'Abstract series of luminous arcs rising in sequence across a dark panorama, each arc slightly brighter than the last, forming a flowing progression of light across time',
    palette: 'deep indigo, progression from violet to blue to gold, culminating in bright white arc' },
  { keys: ['science','reason','science-reason','truth'],
    subject: 'Abstract crystalline geometric forms floating in luminous blue-white space, precise and faceted, each face refracting light into clean spectrum bands',
    palette: 'crystal clear white, refracted spectrum colors, deep azure, silver, clean sharp light' },
  { keys: ['unity','oneness','unity of humanity','brotherhood','peace'],
    subject: 'Abstract convergence of many flowing streams of different colors spiraling together toward a unified center of brilliant white light, each stream distinct but harmonizing',
    palette: 'rainbow of tradition colors converging to white center, deep blue-black void surrounds' },
  { keys: ['equality','inclusion','diversity'],
    subject: 'Abstract mosaic of differently colored light patches, each luminous and distinct, fitting together seamlessly like a celestial pattern without borders',
    palette: 'jewel tones — sapphire, emerald, ruby, amber, violet — each glowing from within, dark space between' },
  { keys: ['authority','leadership','institution','covenant'],
    subject: 'Abstract strong central pillar of cool white light rising from the center, surrounded by subsidiary columns of softer light in an implied circular arrangement',
    palette: 'central cool white, surrounding warm gold columns, deep charcoal ground, subtle bronze' },
  { keys: ['law','practice','law-practice','observance','fasting'],
    subject: 'Abstract ordered pattern of light and dark in rhythmic alternation, regular and purposeful, like light through a deep forest canopy at dawn',
    palette: 'deep forest green, gold dappled light, rich earth brown, cool shadow blue, warm amber' },
  { keys: ['eschatology','end times','judgment','apocalypse'],
    subject: 'Abstract massive luminous event on the horizon, vast dark storm in the upper frame split by a blazing rift of light, earth-tones in deep shadow below',
    palette: 'dramatic dark stormcloud, blazing rift of white-gold, deep shadow brown, red-orange horizon' },
  { keys: ['social order','world peace','civilization','community','society'],
    subject: 'Abstract geometry of warm light points arranged in organic clusters against a vast starry deep blue expanse, as if cities of light seen from great height',
    palette: 'warm amber points, deep sapphire expanse, silver starlight, gentle rose at horizon' },
  { keys: ['love','love of god','devotion','longing'],
    subject: 'Abstract flame of deep rose-red burning at the center of a dark composition, radiating warmth and golden light outward in soft concentric halos against violet darkness',
    palette: 'deep rose red, warm gold halo, rich violet darkness, soft rose-gold, ember orange' },
  { keys: ['creation','cosmos','genesis','universe','God','ultimate'],
    subject: 'Abstract cosmic genesis — swirling nebula of color emerging from a central burst of brilliant white light, clouds of deep space blue and violet tinged with gold and rose',
    palette: 'cosmic deep blue, nebula violet, rose cloud, brilliant white origin, warm gold edges' },
  { keys: ['sin','redemption','sin-redemption','error','failure'],
    subject: 'Abstract dark form below being lifted and transformed by a descending beam of warm light from above, darkness becoming translucent rose and gold at the edges',
    palette: 'deep shadow at base, warm rose light descending, translucent gold edges, soft white at peak' },
  { keys: ['service','humanitarian','charity','sacrifice','poor','marginalized'],
    subject: 'Abstract many small warm light sources arranged in an implied circle, each contributing its glow to a collective brightness at the center larger than any single flame',
    palette: 'individual warm amber points, collective warm white center, deep blue-grey between, gentle gold' },
  { keys: ['angels','beings','spiritual beings','invisible'],
    subject: 'Abstract luminous forms descending through vast dark space like falling stars, elongated ribbons of light curving gracefully, each distinct yet harmonious',
    palette: 'pure silver-white, soft blue, warm gold, deep space black, translucent violet trails' },
  { keys: ['marriage','family','home','children'],
    subject: 'Abstract two distinct streams of warm light intertwining and becoming one, surrounded by smaller emanating points of light, all set against deep indigo',
    palette: 'warm gold, rose gold, soft amber, deep indigo, gentle cream' },
  { keys: ['beauty','art','creativity','aesthetic'],
    subject: 'Abstract explosion of color — bold sweeping arcs of multiple hues curving and intersecting in a dark space, like light painted across a cosmic canvas',
    palette: 'vivid cobalt, crimson, gold, emerald, violet, sweeping arcs on dark ground' },
  { keys: ['silence','stillness','contemplation','solitude'],
    subject: 'Abstract vast calm — a single horizontal band of soft luminous color across the center of deep darkness, barely perceptible gradients of grey and silver',
    palette: 'near-black, midnight navy, barely-there silver horizon, deep cool grey, faint luminous white' },
  { keys: ['pride','humility','ego','vanity'],
    subject: 'Abstract tall form of brilliant light gradually softening and spreading wide at its base into humble warmth, darkness receding as light expands outward',
    palette: 'brilliant white pinnacle, warm amber spreading base, deep shadow receding, soft gold glow' },
  { keys: ['work','vocation','labor','purpose'],
    subject: 'Abstract strong geometric forms of golden light arranged like pillars or beams in purposeful structure, each supporting the larger luminous whole',
    palette: 'burnished gold, deep warm shadow, amber light, strong ochre, pale cream highlight' },
  { keys: ['time','calendar','seasons','holy days','sacred time','liturgy'],
    subject: 'Abstract cycle of light — a great arc of color moving from deep indigo through gold through rose and back, suggesting rotation and rhythmic return',
    palette: 'deep indigo night, dawn violet, morning gold, noon bright white, dusk rose, back to indigo' },
  { keys: ['natural world','environment','ecology','nature and humanity','earth'],
    subject: 'Abstract flowing landscape of layered living forms — warm ochre and deep forest green suffused with golden light from within, roots of luminous earth-light meeting sky-blue radiance descending from above',
    palette: 'warm ochre earth, deep forest green, inner golden light, sky-blue luminance, soft amber at the horizon where earth and sky meet' },
  { keys: ['ceremony','ritual','rite','sacrament','observance'],
    subject: 'Abstract a central point of concentrated warm golden light surrounded by a perfect circle of smaller, softer light points at equal distances, all connected by faint luminous threads, set against deep ceremonial darkness',
    palette: 'deep ceremonial black, concentrated golden center, pearl-white circle points, silver connecting threads, faint rose glow' },
  { keys: ['transformation','inner transformation','social change','social transformation'],
    subject: 'Abstract two luminous realms — warm inner gold and cool outer silver — flowing through each other at a permeable radiant boundary, each realm transformed at the threshold where they meet',
    palette: 'warm inner gold, cool silver-blue outer, luminous white threshold, soft rose at the meeting point, deep indigo distance' },
  { keys: ['spiritual knowledge','spiritual-knowledge','discernment','wisdom','how do we know'],
    subject: 'Abstract infinite regress of luminous mirrors — each crystalline facet reflecting the next into vast indigo depth, a chain of clarity receding to a single bright point of pure knowing at the vanishing horizon',
    palette: 'crystal silver, luminous indigo, deep blue depth, bright knowing-point, soft gold reflection, endless recession' },
];

const FALLBACK_THEME = {
  subject: 'Abstract landscape of light and darkness, a luminous horizon dividing deep space above from implied ground below, soft gradients of color flowing between realms',
  palette: 'deep cosmic blue, warm amber horizon, pearl silver, soft violet, gentle gold',
};

// Match topic tags and question keywords to a visual theme.
// Uses word-boundary matching so e.g. "spiritual" doesn't match "spirit".
// usedSubjects: Set of subject strings already in use by other records — skips those themes.
function pickVisualTheme(tags, question, usedSubjects = new Set()) {
  const haystack = [...(tags || []), question.toLowerCase()].join(' ');
  const wordBound = k => new RegExp(`\\b${k.replace(/-/g, '[- ]')}\\b`).test(haystack);

  // First pass: theme that matches AND hasn't been used
  for (const theme of VISUAL_THEMES) {
    if (theme.keys.some(wordBound) && !usedSubjects.has(theme.subject)) return theme;
  }
  // Second pass: matching theme even if reused (better than wrong theme)
  for (const theme of VISUAL_THEMES) {
    if (theme.keys.some(wordBound)) return theme;
  }
  // Third pass: any unused theme (fallback if no keyword match)
  for (const theme of VISUAL_THEMES) {
    if (!usedSubjects.has(theme.subject)) return theme;
  }
  return FALLBACK_THEME;
}

// Load subjects already used by other records (to avoid duplicate images).
async function loadUsedSubjects(excludeId = null) {
  const rows = await queryAll(
    'SELECT hero_prompt FROM deep_research WHERE hero_prompt IS NOT NULL AND id != ?',
    [excludeId || 0]
  );
  // Extract subject portion: everything before ". Evoking the spiritual question:"
  const used = new Set();
  for (const { hero_prompt } of rows) {
    const cut = hero_prompt.indexOf('. Evoking the spiritual question:');
    if (cut > 0) used.add(hero_prompt.slice(0, cut));
  }
  return used;
}

// Build a topic-differentiated image prompt.
// Same artistic medium every time; subject and palette vary by topic.
// usedSubjects prevents picking a theme already used by another record.
function buildResearchHeroPrompt({ question, traditions, tags, usedSubjects = new Set() }) {
  const tradList = (traditions || []).slice(0, 3).join(', ') || 'world religions';
  const theme = pickVisualTheme(tags, question, usedSubjects);
  return `${theme.subject}. Evoking the spiritual question: "${question}" across ${tradList}. Color palette: ${theme.palette}. ${HERO_MEDIUM}`;
}

// Generate and store hero image for a deep research record.
// Exported so the admin route can trigger regeneration on demand.
export async function generateResearchHeroImage(researchId, { question, traditions, tags }) {
  try {
    initStorage();
    if (!hasCloudStorage()) {
      logger.warn({ researchId }, 'No cloud storage — skipping hero image');
      return null;
    }

    const usedSubjects = await loadUsedSubjects(researchId);
    const prompt = buildResearchHeroPrompt({ question, traditions, tags, usedSubjects });
    logger.info({ researchId, prompt: prompt.slice(0, 80) }, 'Generating research hero image');

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'medium',
    });

    const b64 = resp.data[0]?.b64_json;
    if (!b64) throw new Error('gpt-image-1 returned no b64_json');
    const buffer = Buffer.from(b64, 'base64');

    const key = generateAssetKey('research', researchId, 'jpg');
    const result = await uploadFile(key, buffer, { contentType: 'image/jpeg' });

    await query('UPDATE deep_research SET hero_image = ?, hero_prompt = ? WHERE id = ?', [result.url, prompt, researchId]);
    logger.info({ researchId, url: result.url }, 'Research hero image stored');
    return result.url;
  } catch (err) {
    logger.error({ err: err.message, researchId }, 'Hero image generation failed (non-fatal)');
    return null;
  }
}

/**
 * Enforce per-section tradition diversity: max 3 quotes from any single tradition per section.
 * Keeps highest-relevance_score quotes when trimming. Recomputes section.traditions after.
 */
function balanceSectionDiversity(sections) {
  const MAX_PER_TRADITION = 3;
  for (const section of sections) {
    const byTrad = new Map();
    for (const q of (section.quotes || [])) {
      const t = q.tradition || '_unknown';
      if (!byTrad.has(t)) byTrad.set(t, []);
      byTrad.get(t).push(q);
    }
    const trimmed = [];
    for (const [, qs] of byTrad) {
      qs.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      trimmed.push(...qs.slice(0, MAX_PER_TRADITION));
    }
    section.quotes = trimmed.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    section.traditions = [...new Set(trimmed.map(q => q.tradition).filter(Boolean))];
  }
  return sections;
}

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

    // 4b. Diversity sweep — fill any traditions missing from candidacy due to brief gaps
    const sweepExtra = await diversitySweep(record.canonical_question, allCandidates, brief, search);
    for (const c of sweepExtra) {
      if (!seen.has(c.id)) { seen.add(c.id); allCandidates.push(c); }
    }

    await query('UPDATE deep_research SET total_candidates = ? WHERE id = ?', [allCandidates.length, researchId]);

    // 4b. Filter secondary compilations — study books and commentary works that only
    // quote primary sources; prefer the primary source directly.
    const noSecondary = filterSecondaryCompilations(allCandidates);

    // 4c. Keyword pre-filter — eliminate clear misses before costly LLM rerank
    const filtered = keywordPreFilter(record.canonical_question, noSecondary);

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

    // 7b2. Section diversity balancer — cap any tradition at 3 quotes per section
    sections = balanceSectionDiversity(sections);

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

    // 9. Hero image (non-blocking — failure doesn't fail the research)
    const traditions = traditionsCovered.split(',').filter(Boolean);
    const tags = record.topic_tags ? JSON.parse(record.topic_tags) : [];
    await generateResearchHeroImage(researchId, { question: record.canonical_question, traditions, tags });

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

  const systemPrompt = `You are writing interfaith research with the voice of a young David Attenborough — direct wonder at deep things, respectful awe for the wisdom of every tradition, plain English that carries real weight. You treat the world's sacred teachings as a naturalist treats the natural world: each tradition is a distinct and magnificent specimen, each insight worth pausing over. No academic hedging. No pious distance. Just honest fascination.

Critical rules:
1. Frame each aspect as a focused question about a UNIVERSAL SPIRITUAL PRINCIPLE — vary the phrasing. Do NOT start every question with "How does". Use forms like "What role does X play?", "Why do traditions teach X?", "What happens when X?", "Is X a punishment or a gift?", etc.
2. Aspect labels must use universal language, NOT tradition-specific terminology. WRONG: "What is karma?", "What is the Tao?", "What is tzedakah?", "What is moksha?". RIGHT: "Does past action shape the soul's future?", "What cosmic order underlies existence?", "What obligations govern giving to those in need?", "What is liberation from the cycle of rebirth?". Ask what the principle IS or DOES across traditions — not what a single tradition calls it.
3. NEVER name a section after a tradition ("Sikh Perspective", "Buddhist View", etc.) — all sections must be thematic.
4. Base the aspects on the theological framework provided — do not invent new categories from scratch.
5. Assign each quote only to an aspect it directly addresses. A quote must substantively answer the aspect sub-question — not merely be from the same tradition or thematic domain. Use aspect_idx=-1 for any quote that does not directly address at least one aspect. Precision matters: a weak assignment dilutes the section more than a rejected quote.
6. Extract the most directly relevant 2-4 sentences from each passage. The excerpt must answer the sub-question. Prefer complete thoughts — never quote an entire long paragraph.
7. For non-English text (Arabic, Persian, Sanskrit, Hebrew, Punjabi, etc.), provide ONLY a clean English translation as the excerpt.
8. Strip all markup: ⁅s1⁆, ⁅/s1⁆, **, __, ##, [], *
9. The summary for each aspect is 1-2 SHORT sentences in the Attenborough voice — an observation that makes the reader feel the weight of what these passages reveal. Direct, vivid, never hedged. Do NOT open with "Across traditions", "Multiple traditions", "These passages show", or similar. If only one tradition is represented, say so plainly.
10. The overview is 2-3 sentences — open with wonder at the subject itself, not the research. Something that makes a thoughtful person lean forward. NEVER open with "Across these traditions", "World religions teach", "Throughout history", or any variant.`;

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
      'SELECT id, slug, canonical_question, question_hash, status, topic_tags, question_type, traditions_covered, angles_json, sections_json, summary_json, convergence_json, qa_json, assessment_json, total_candidates, total_selected, llm_input_tokens, llm_output_tokens, llm_cost_usd, started_at, research_model, ask_count, last_asked_at, created_at, completed_at, hero_image FROM deep_research WHERE slug = ?',
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
