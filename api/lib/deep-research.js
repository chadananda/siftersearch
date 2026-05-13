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
 * Step 0: Conceptual reconnaissance — use LLM general knowledge to map the theological
 * landscape before touching the library. Returns frameworks (major thematic categories)
 * with per-tradition vocabulary, driving both search angles and final structuring.
 *
 * @param {string} question
 * @param {Function} chat
 * @returns {Promise<{frameworks: Array, key_distinctions: string}>}
 */
export async function conceptualRecon(question, chat) {
  const TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh'];
  const response = await chat([
    {
      role: 'system',
      content: `You are a comparative religion scholar with broad knowledge of how the world's major religious traditions address spiritual questions. Your task is to map the conceptual landscape of a question so that a library search can be intelligently directed. Return JSON only.`
    },
    {
      role: 'user',
      content: `Question: "${question}"

Using your knowledge of comparative religion, identify the 4-7 major thematic frameworks through which world religions address this question. These frameworks will become the structural sections of a research article, so they must represent genuinely distinct approaches — not just variations on the same idea.

For each framework:
- Which traditions hold this view?
- What specific vocabulary, terminology, metaphors, and images do those traditions' texts actually use? (The words that would appear in a primary text passage, not abstract labels)
- What is the core claim or teaching?

Traditions to consider: ${TRADITIONS.join(', ')}

Return JSON:
{
  "frameworks": [
    {
      "theme": "concise theme label (5-8 words)",
      "core_claim": "1-2 sentences: what this framework actually teaches",
      "traditions": ["list of traditions that hold this view"],
      "search_vocabulary": {
        "TraditionName": ["specific", "words", "metaphors", "concepts", "found in texts"]
      }
    }
  ],
  "key_distinctions": "2-3 sentences on how traditions fundamentally differ in their approach to this question"
}`
    }
  ], { max_tokens: 4096 });

  const text = response.content?.[0]?.text || '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('conceptualRecon: no JSON in response');
  const result = JSON.parse(json);
  logger.info({ frameworks: result.frameworks?.length }, 'Conceptual recon complete');
  return result;
}

/**
 * Decompose a question into search angles guided by the conceptual recon map.
 * Generates two queries per tradition (conceptual + vocabulary-anchored) to
 * bridge the gap between abstract question framing and tradition-specific text idioms.
 *
 * @param {string} question
 * @param {object} recon - result of conceptualRecon()
 * @param {Function} chat
 * @returns {Promise<Array<{tradition, conceptual, vocabulary, angle}>>}
 */
export async function decomposeAngles(question, recon, chat) {
  // Values must match the `religion` field in the Meilisearch paragraphs index exactly.
  const TRADITIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Tao', 'Sikh', 'General'];

  // Build a vocabulary hint per tradition from the recon map
  const vocabHints = {};
  for (const fw of (recon.frameworks || [])) {
    for (const [trad, terms] of Object.entries(fw.search_vocabulary || {})) {
      if (!vocabHints[trad]) vocabHints[trad] = new Set();
      terms.forEach(t => vocabHints[trad].add(t));
    }
  }
  const vocabSummary = Object.entries(vocabHints)
    .map(([t, terms]) => `${t}: ${[...terms].slice(0, 8).join(', ')}`)
    .join('\n');

  const systemPrompt = `You are a research assistant for an interfaith library. Generate targeted search queries to find primary text passages. Return JSON only.`;
  const userPrompt = `Question: "${question}"

Conceptual map (from prior analysis):
${recon.frameworks?.map(f => `- ${f.theme}: ${f.core_claim}`).join('\n')}

Known text vocabulary per tradition:
${vocabSummary}

For each tradition, produce TWO distinct search queries (10-20 words each):
1. "conceptual": abstract framing — purpose, meaning, why + tradition terms
2. "vocabulary": the words that actually appear in texts of that tradition (from the vocabulary map above)

The two queries must be genuinely different — different words, not reordering.

Traditions: ${TRADITIONS.join(', ')}

Return JSON array:
[{"tradition": "...", "conceptual": "...", "vocabulary": "...", "angle": "one-sentence description of what this tradition teaches on this topic"}]`;

  try {
    const response = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    const text = response.content?.[0]?.text || '';
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    if (!json) throw new Error('No JSON array in response');
    return JSON.parse(json);
  } catch (err) {
    logger.warn({ err: err.message }, 'decomposeAngles fallback to defaults');
    return TRADITIONS.map(t => ({ tradition: t, conceptual: question, vocabulary: question, angle: `${t} perspective` }));
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
export async function fanOutQueries(angles, search, perAngle = 25) {
  const seen = new Set();
  const candidates = [];
  // Each angle now has conceptual + vocabulary queries — run both
  for (const angle of angles) {
    const { tradition } = angle;
    const queries = [angle.conceptual || angle.query, angle.vocabulary].filter(Boolean);
    const filter = tradition !== 'General' ? { religion: tradition } : {};
    for (const q of queries) {
      try {
        const results = await search(q, {
          limit: perAngle,
          filters: filter,
          semanticRatio: 0.65,
        });
        for (const hit of (results.hits || [])) {
          // Skip very short passages — likely headers, section titles, frontmatter
          if ((hit.text || '').length < 80) continue;
          if (!seen.has(hit.id)) {
            seen.add(hit.id);
            candidates.push({ ...hit, _searchTradition: tradition });
          }
        }
      } catch (err) {
        logger.warn({ err: err.message, tradition, q: q.slice(0, 50) }, 'fanOutQueries angle error');
      }
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

  const systemPrompt = `You are an expert in comparative religion. Score passages 0-10 for direct relevance to a spiritual question.

Scoring rules:
- 9-10: Passage directly and substantively addresses the question — the core subject of the passage IS the question topic
- 7-8: Passage clearly addresses the question topic, though it may also address other things
- 5-6: Passage is thematically related but only touches the question topic tangentially or metaphorically
- 3-4: Passage is from a related domain but does not address the question topic itself
- 0-2: Passage is unrelated or only shares keywords without sharing meaning

CRITICAL: A passage that uses related vocabulary (e.g. "tests", "trials", "affliction") without actually discussing the question topic scores 4 or below. The passage must directly address the question, not merely be retrievable by the same keywords.

Return ONLY valid JSON array.`;

  const allScores = [];
  for (let start = 0; start < passages.length; start += BATCH_SIZE) {
    const batch = passages.slice(start, start + BATCH_SIZE);
    const userPrompt = `Question: "${question}"

Score each passage 0-10 for DIRECT relevance (not thematic proximity). Write a 1-sentence note on exactly how it addresses the question — if it doesn't directly address it, say so. JSON only.

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
    .filter(p => p.relevance_score >= 7)
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

    // 0. Conceptual reconnaissance — map the theological landscape before searching
    const recon = await conceptualRecon(record.canonical_question, chat);

    // 1. Decompose into angles guided by the recon map (two queries per tradition)
    const angles = await decomposeAngles(record.canonical_question, recon, chat);
    await query('UPDATE deep_research SET angles_json = ? WHERE id = ?', [JSON.stringify({ recon, angles }), researchId]);

    // 2. Fan out queries — two queries per tradition, 25 each, min-length filter
    const candidates = await fanOutQueries(angles, search, 25);
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

    // 5. Cluster by thematic aspects + extract clean excerpts (LLM-driven)
    const traditionsCovered = [...new Set(selected.map(q => q.tradition).filter(Boolean))].join(',');
    const structured = await clusterAndStructure(record.canonical_question, selected, chat, recon);
    const sections = structured?.sections || buildSectionsFallback(selected, angles);
    const summary = structured?.summary || buildSummaryFallback(sections, traditionsCovered.split(',').filter(Boolean));
    const convergence = { searchable_text: sections.map(s => s.label || s.tradition || '').join(' ') };

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

  // Use recon frameworks as the structural anchor if available
  const frameworkHint = recon?.frameworks?.length
    ? `\nTheological framework (from prior analysis — use these as the basis for aspects):\n${recon.frameworks.map(f => `- ${f.theme}: ${f.core_claim}`).join('\n')}\n\nKey distinctions: ${recon.key_distinctions || ''}\n`
    : '';

  const systemPrompt = `You are a scholar of comparative religion creating a structured interfaith research document in Q&A format.
The main document answers a big spiritual question. Sub-sections are specific aspect sub-questions backed by primary source passages.

Critical rules:
1. Frame each aspect as a focused sub-question (e.g. "How does suffering serve as purification?").
2. Base the aspects on the theological framework provided — do not invent new categories from scratch.
3. Every assigned quote MUST directly and substantively answer the sub-question — if tangential, set aspect_idx to -1 (exclude). Be strict.
4. Extract ONLY the most directly relevant 1-2 sentences from each passage. The excerpt must answer the sub-question. Never quote full paragraphs.
5. For non-English text (Arabic, Persian, Sanskrit, Hebrew, Punjabi, etc.), provide ONLY a clean English translation as the excerpt.
6. Strip all markup: ⁅s1⁆, ⁅/s1⁆, **, __, ##, [], *
7. The summary for each aspect synthesizes what the FOUND passages say — acknowledge if only one tradition is represented rather than over-generalizing.
8. The overview synthesizes general knowledge AND the found passages — clearly grounded in the texts.`;

  const userPrompt = `Main question: "${question}"
${frameworkHint}
Passages found in the library:
${selected.map((q, i) => `[${i}] ${q.tradition} auth:${q.authority} "${q.title}" — ${q.author}:
"${(q.text || '').slice(0, 500)}"`).join('\n\n')}

Return ONLY valid JSON:
{
  "aspects": [
    {"label": "Sub-question as a question? (8-12 words)", "summary": "2-3 sentence synthesis — note if limited to one tradition"}
  ],
  "assignments": [
    {"quote_idx": 0, "aspect_idx": 0, "excerpt": "1-2 sentences in clean English that directly answer the sub-question"}
  ],
  "overview": "3-4 sentence overview — synthesize the full theological landscape across traditions, grounded in the passages found"
}`;

  try {
    const response = await chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { max_tokens: 8192 });
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
          contextual_note: q.contextual_note,
        };
      }).filter(q => q.excerpt);

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
