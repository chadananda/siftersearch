/**
 * Meilisearch Client
 *
 * Hybrid search combining keyword and vector (semantic) search.
 */

import { MeiliSearch } from 'meilisearch';
import { config } from './config.js';
import { logger } from './logger.js';
import { createEmbedding, createEmbeddings } from './ai.js';
import { getAuthority } from './authority.js';
import { queryOne, queryAll, query } from './db.js';
import { getImportProgress, getIngestionProgress, getIndexingProgress, getCachedContentCounts } from '../services/progress.js';

let client = null;

// Quran Bismillah opens every sura — BM25 + HyPE both score it high for mercy/compassion
// queries because the formula literally contains those words. Filter it globally so no
// tradition (Islam especially) returns this formulaic opener as a cited passage.
const BISMILLAH_RE = /^In the Name of (?:God|Allah).{0,10}the Compassionate.{0,10}the Merciful[.!]?\s*$/i;

// In-memory cache extracted to api/lib/search/cache.js. Re-exported here so
// existing importers (api/index.js prewarmCache call, agent-librarian.js
// getSearchCacheStats, etc.) keep working unchanged.
import {
  getCachedSearch,
  setCachedSearch,
  clearSearchCache,
  getSearchCacheStats,
  POPULAR_QUERIES
} from './search/cache.js';

export { clearSearchCache, getSearchCacheStats, POPULAR_QUERIES };

/**
 * Pre-warm the cache with common queries. Stays in this file because it
 * calls keywordSearch which lives below; extracting it would create a
 * circular import.
 */
export async function prewarmCache(queries) {
  logger.info({ queryCount: queries.length }, 'Pre-warming search cache');
  const startTime = Date.now();
  let warmed = 0;
  for (const query of queries) {
    try {
      if (!getCachedSearch(query)) {
        await keywordSearch(query, { limit: 10 });
        warmed++;
      }
    } catch (err) {
      logger.warn({ query, err: err.message }, 'Failed to pre-warm cache for query');
    }
  }
  const elapsedMs = Date.now() - startTime;
  logger.info({ warmed, totalQueries: queries.length, elapsedMs }, 'Search cache pre-warmed');
  return { warmed, elapsedMs };
}

/**
 * Check if Meilisearch is enabled
 */
export function isMeiliEnabled() {
  return config.search.enabled;
}

export function getMeili() {
  if (!config.search.enabled) {
    return null;
  }
  if (!client) {
    client = new MeiliSearch({
      host: config.search.host,
      apiKey: config.search.apiKey
    });
    logger.info({ host: config.search.host }, 'Meilisearch connected');
  }
  return client;
}

// Index names. The canonical INDEXES const is now re-exported from the
// scope-aware registry so search code can resolve per-site indexes via the
// same source of truth.
import { INDEXES, getScopeIndexes, getDefaultScope } from './search/scope.js';
export { INDEXES };

/**
 * Build ranking rules with authority at the configured position.
 * Modern Meilisearch (v1.11+) rules: words, typo, proximity, attributeRank,
 * sort, wordPosition, exactness. Older names like 'attribute' are rejected
 * silently via a failed PATCH, which is how the authority rule vanished from
 * the live index.
 *
 * authority:desc is inserted at config.search.authorityRankPosition (1-7).
 * Note: for hybrid (vector) search, ranking rules only matter as tiebreakers,
 * which rarely fires. See authorityBoost post-hoc reranking below for the
 * mechanism that actually moves canonical sources to the top.
 */
function buildRankingRules() {
  const baseRules = ['words', 'typo', 'proximity', 'attributeRank', 'sort', 'wordPosition', 'exactness'];
  const position = Math.min(baseRules.length, Math.max(1, config.search.authorityRankPosition || 4));

  const rules = [...baseRules];
  rules.splice(position - 1, 0, 'authority:desc');

  logger.info({ position, rules }, 'Built ranking rules with authority position');
  return rules;
}

/**
 * Compute the authority-weighted score for a single hit.
 * final = relevance * (1 + boost * (authority - 5) / 5)
 * authority 5 is neutral; 10 boosts (+boost*100%), 1 penalizes.
 *
 * Authority is computed LIVE from hit metadata rather than reading the pre-stored
 * hit.authority value. This means authority.js changes take effect immediately at
 * search time without requiring a full Meilisearch resync. hit.authority is only
 * used as fallback when metadata fields are missing (e.g. HyPE index hits).
 */
function computeAuthorityScore(hit) {
  const rel = typeof hit._rankingScore === 'number' ? hit._rankingScore : 0;
  // Live authority computation from hit metadata; fall back to stored value if available.
  // title is passed so TITLE_AUTHORITY patterns (Quran/Bible translations stored under
  // "Unknown" author) get authority 10 at query time, matching their indexed authority.
  const liveAuth = getAuthority({
    author: hit.author || null,
    religion: hit.religion || null,
    collection: hit.collection || null,
    source_site: hit.source_site || null,
    title: hit.title || null,
    authority: null // don't pass stored authority — force live computation
  });
  const auth = typeof liveAuth === 'number' ? liveAuth : (typeof hit.authority === 'number' ? hit.authority : 5);
  const boost = config.search.authorityBoost ?? 0.3;
  // OceanLibrary docs are always preferred over non-OL duplicates of the same content.
  // Check source_site (preferred) or source_url fallback — Buddhist/older docs were synced
  // before source_site was added to the Meili payload and have source_site=null.
  const isOL = hit.source_site === 'oceanlibrary.com' ||
    (!hit.source_site && typeof hit.source_url === 'string' && hit.source_url.includes('oceanlibrary.com'));
  const olMultiplier = isOL ? (config.search.olSourceMultiplier ?? 2.0) : 1;
  // Floor at 0 — with boost >= 1.0 and auth=1, raw result can be negative
  return Math.max(0, rel * olMultiplier * (1 + boost * ((auth - 5) / 5)));
}

/**
 * Annotate each hit with `_authorityScore` and return them sorted by it.
 * Every search path in this module runs results through here so canonical
 * sources consistently outrank derivative works at the same relevance tier.
 */
function rerankByAuthority(hits) {
  for (const hit of hits) {
    hit._authorityScore = computeAuthorityScore(hit);
    if (!hit.source_url && hit.doc_id) {
      hit.source_url = `https://siftersearch.com/document/${hit.doc_id}`;
    }
    // Construct paragraph-level deeplink when external_para_id is available.
    // OL book URLs are doc-level; appending ?paraId= scrolls to the exact passage.
    if (hit.external_para_id && hit.source_url && !hit.source_url.includes('paraId=')) {
      hit.source_url = `${hit.source_url}?paraId=${hit.external_para_id}`;
    }
  }
  return [...hits].sort((a, b) => (b._authorityScore || 0) - (a._authorityScore || 0));
}

/**
 * Enforce diversity across a hit list by capping any single value of `field`
 * to `maxPer` hits. After per-value caps are filled, remaining slots are filled
 * from overflow (still sorted by authority score).
 *
 * Used in two modes:
 *   field='religion' — cross-tradition diversity for unfiltered queries
 *   field='author'   — within-religion diversity for religion-filtered queries,
 *                      ensures primary scripture authors surface alongside commentary
 */
function diversifyHits(hits, limit, maxPer, field = 'religion', overrideLimits = {}) {
  const counts = new Map();
  const selected = [];
  const overflow = [];
  for (const hit of hits) {
    const key = hit[field] || '__unknown__';
    const n = counts.get(key) || 0;
    const cap = Object.prototype.hasOwnProperty.call(overrideLimits, key) ? overrideLimits[key] : maxPer;
    if (n < cap) {
      selected.push(hit);
      counts.set(key, n + 1);
    } else {
      overflow.push(hit);
    }
    if (selected.length >= limit) break;
  }
  for (const hit of overflow) {
    if (selected.length >= limit) break;
    selected.push(hit);
  }
  return selected;
}

// Traditions to query in parallel for cross-tradition searches (no religion filter).
// Ordered by typical corpus size so Baha'i gets its fair share, not dominance.
const CROSS_TRADITION_RELIGIONS = [
  "Baha'i", 'Christian', 'Islam', 'Buddhist', 'Judaism',
  'Hindu', 'Zoroastrian', 'Tao', 'Confucian', 'Sikh', 'Jain'
];

// Cache OL doc IDs by religion (1-hour TTL). OL single-book docs (e.g., Gospel of
// Matthew) score lower in Meilisearch than large composite non-OL docs (e.g., full
// Bible) for any sub-passage query. Caching OL IDs enables supplementary per-religion
// queries that guarantee OL hits enter the authority-ranking candidate pool.
let _olDocIdCache = null;
let _olDocIdCacheTime = 0;

async function getOlDocIdsByReligion() {
  const now = Date.now();
  if (_olDocIdCache && now - _olDocIdCacheTime < 3600000) return _olDocIdCache;
  const rows = await queryAll(
    `SELECT id, religion FROM docs WHERE source_site = 'oceanlibrary.com' AND deleted_at IS NULL`
  );
  const map = {};
  for (const { id, religion } of rows) {
    if (!map[religion]) map[religion] = [];
    map[religion].push(id);
  }
  _olDocIdCache = map;
  _olDocIdCacheTime = now;
  return map;
}

/**
 * Federate search across all traditions when no religion filter is active.
 * Runs one Meilisearch sub-query per religion in a single multiSearch call,
 * then takes the top N from each religion and merges. This prevents the
 * large Bahá'í corpus from crowding out other traditions at the Meili level,
 * before authority reranking even gets a chance to run.
 */
async function crossTraditionSearch(meili, indexName, query, vector, params, perReligionLimit) {
  const { extraFilter } = params;
  const subQueries = CROSS_TRADITION_RELIGIONS.map(religion => {
    const religionFilter = `religion = "${religion}"`;
    const filter = extraFilter ? `${religionFilter} AND ${extraFilter}` : religionFilter;
    const q = {
      indexUid: indexName,
      q: query,
      filter,
      limit: Math.max(30, overFetchForRerank(perReligionLimit)),
      offset: 0,
      showRankingScore: true,
      showMatchesPosition: true,
      matchingStrategy: 'last',  // use 'last' for religion sub-queries to improve recall
      attributesToRetrieve: params.attributesToRetrieve,
      attributesToHighlight: params.attributesToHighlight,
      highlightPreTag: params.highlightPreTag,
      highlightPostTag: params.highlightPostTag,
    };
    if (vector) {
      q.hybrid = { semanticRatio: params.semanticRatio, embedder: params.useGroundedText ? 'grounded' : 'default' };
      q.vector = vector;
    }
    return q;
  });

  const response = await meili.multiSearch({ queries: subQueries });

  // Supplementary OL queries: large non-OL composite docs (e.g., full Bible) can crowd
  // out OL single-book docs even at fetch-limit=30, because the composite doc has
  // perfect keyword matches across every sub-passage. Fetching top 10 OL hits per
  // religion and merging before authority ranking ensures the 1.4x OL boost applies.
  try {
    const olDocIds = await getOlDocIdsByReligion();
    const olReligionIndices = [];
    const olSubQueries = [];
    for (let ri = 0; ri < CROSS_TRADITION_RELIGIONS.length; ri++) {
      const religion = CROSS_TRADITION_RELIGIONS[ri];
      const ids = olDocIds[religion];
      if (!ids || ids.length === 0) continue;
      olReligionIndices.push(ri);
      const idFilter = `doc_id IN [${ids.join(',')}]`;
      const religionFilter = `religion = "${religion}"`;
      const filter = extraFilter ? `${religionFilter} AND ${idFilter} AND ${extraFilter}` : `${religionFilter} AND ${idFilter}`;
      const q = {
        indexUid: indexName,
        q: query,
        filter,
        // 30 instead of 10: typo-tolerance penalty (e.g. "neighbour" vs "neighbor")
        // drops primary scripture below secondary works in Meilisearch relevance.
        // Authority reranking in crossTraditionSearch needs them in the candidate pool.
        limit: 30,
        offset: 0,
        showRankingScore: true,
        matchingStrategy: 'last',
        attributesToRetrieve: params.attributesToRetrieve,
        attributesToHighlight: params.attributesToHighlight,
        highlightPreTag: params.highlightPreTag,
        highlightPostTag: params.highlightPostTag,
      };
      if (vector) {
        q.hybrid = { semanticRatio: params.semanticRatio, embedder: params.useGroundedText ? 'grounded' : 'default' };
        q.vector = vector;
      }
      olSubQueries.push(q);
    }
    if (olSubQueries.length > 0) {
      const olResponse = await meili.multiSearch({ queries: olSubQueries });
      for (let i = 0; i < olReligionIndices.length; i++) {
        const ri = olReligionIndices[i];
        const olHits = olResponse.results[i]?.hits || [];
        if (olHits.length > 0 && response.results[ri]) {
          response.results[ri].hits = [...(response.results[ri].hits || []), ...olHits];
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'crossTraditionSearch: OL supplementary queries failed');
  }

  // Enrich all hits missing source_site from the docs table before authority sorting.
  // OL paragraphs synced before source_site was added to the worker have null in
  // Meilisearch — without this, computeAuthorityScore can't apply the OL 1.4x multiplier,
  // so OL Gospels/Quran lose their quota slots to non-OL secondary texts.
  const allResponseHits = (response.results || []).flatMap(r => r.hits || []);
  const missingSiteDids = [...new Set(allResponseHits.filter(h => !h.source_site && h.doc_id).map(h => h.doc_id))];
  if (missingSiteDids.length > 0) {
    try {
      const placeholders = missingSiteDids.map(() => '?').join(',');
      const docRows = await queryAll(`SELECT id, source_site, source_url FROM docs WHERE id IN (${placeholders}) AND (source_site IS NOT NULL OR source_url IS NOT NULL)`, missingSiteDids);
      const docMap = new Map(docRows.map(r => [r.id, r]));
      for (const hit of allResponseHits) {
        if (!hit.source_site && hit.doc_id) {
          const doc = docMap.get(hit.doc_id);
          if (doc) { hit.source_site = doc.source_site; hit.source_url = doc.source_url; }
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'crossTraditionSearch: doc source_site enrichment failed');
    }
  }

  const seen = new Set();
  const allHits = [];
  for (let ri = 0; ri < (response.results || []).length; ri++) {
    const result = response.results[ri];
    const religion = CROSS_TRADITION_RELIGIONS[ri];
    // Bahá'í corpus is ~96% of all docs — cap it to avoid crowding other traditions,
    // but give it the same perReligionLimit as everyone else so Bahá'í-specific queries
    // (e.g. "Most Great Peace") can still surface Bahá'í content. Authority re-ranking
    // already downgrades secondary Bahá'í sources relative to primary scripture from
    // other traditions, so equal slot quota is appropriate here.
    const slotLimit = perReligionLimit;
    // Sort by authority-weighted score so primary texts (auth=10) get quota slots
    // over secondary books at the same semantic relevance tier. Falls back to raw
    // ranking score as tiebreaker so semantic relevance still governs within a tier.
    const sorted = [...(result.hits || [])].sort((a, b) => {
      const sa = computeAuthorityScore(a);
      const sb = computeAuthorityScore(b);
      if (Math.abs(sb - sa) > 0.005) return sb - sa;
      return (b._rankingScore || 0) - (a._rankingScore || 0);
    });
    // Two-pass title dedup: prefer one hit per unique base-title per religion.
    // Strips trailing volume numbers ("The Mahabharata 3" → "The Mahabharata")
    // so different numbered volumes of the same work count as one title slot.
    // Relevance floor: tradition-specific searches produce low-scoring hits from
    // unrelated traditions that then win via authority formula (auth=10 OL × 2.0
    // multiplier overcomes 4x lower relevance). Floor at 0.35 prevents this — a
    // tradition with no genuinely relevant hits gets zero slots rather than one
    // low-quality hit that authority-reranking then lifts to #1.
    const MIN_CROSS_TRADITION_RELEVANCE = 0.55;
    const seenTitles = new Set();
    const seenDocIds = new Set();
    const passTwo = [];
    let count = 0;
    for (const hit of sorted) {
      if (seen.has(hit.id)) continue;
      if ((hit._rankingScore || 0) < MIN_CROSS_TRADITION_RELEVANCE) continue;
      const rawTitle = hit.title || String(hit.doc_id);
      const titleKey = rawTitle.replace(/\s+\d+\s*$/, '').trim() || rawTitle;
      if (slotLimit > 1 && seenTitles.has(titleKey)) {
        passTwo.push(hit);
        continue;
      }
      seen.add(hit.id);
      seenTitles.add(titleKey);
      seenDocIds.add(hit.doc_id);
      allHits.push(hit);
      count++;
      if (count >= slotLimit) break;
    }
    // Fill leftover slots with different-doc hits only — never two paras from same doc
    for (const hit of passTwo) {
      if (count >= slotLimit) break;
      if (!seen.has(hit.id) && !seenDocIds.has(hit.doc_id)) {
        seen.add(hit.id);
        seenDocIds.add(hit.doc_id);
        allHits.push(hit);
        count++;
      }
    }
  }
  return allHits;
}

/**
 * Compute internal fetch size so authority reranking has room to pull canonical
 * hits up from just outside the requested window. Capped at maxResults.
 */
function overFetchForRerank(targetCount) {
  const multiplier = config.search.authorityRerankMultiplier || 3;
  const maxResults = config.search.maxResults || 100;
  return Math.min(maxResults, Math.max(targetCount, Math.ceil(targetCount * multiplier)));
}

/**
 * Initialize indexes with proper settings
 */
export async function initializeIndexes() {
  if (!config.search.enabled) {
    logger.info('Meilisearch disabled, skipping index initialization');
    return null;
  }

  const meili = getMeili();
  const expectedDimensions = config.ai.embeddings.dimensions;

  // Paragraphs index (main search index)
  const paragraphs = meili.index(INDEXES.PARAGRAPHS);

  // Check if existing index has wrong dimensions - if so, delete and recreate
  try {
    const settings = await paragraphs.getSettings();
    const currentDimensions = settings.embedders?.default?.dimensions;
    if (currentDimensions && currentDimensions !== expectedDimensions) {
      logger.warn({ currentDimensions, expectedDimensions }, 'Paragraphs index has wrong embedding dimensions, deleting and recreating');
      await meili.deleteIndex(INDEXES.PARAGRAPHS);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    if (!err.message?.includes('not found')) {
      logger.debug({ err: err.message }, 'Could not check paragraphs index settings');
    }
  }

  // Update settings via direct HTTP to avoid meilisearch-js client hanging
  // when Meilisearch has a large task queue
  const meiliUrl = config.search.host || 'http://localhost:7700';
  const meiliKey = config.search.apiKey;
  const headers = { 'Content-Type': 'application/json' };
  if (meiliKey) headers['Authorization'] = `Bearer ${meiliKey}`;

  const paragraphSettings = {
    searchableAttributes: ['text', 'text_grounded', 'context', 'heading', 'title', 'author'],
    filterableAttributes: [
      'doc_id', 'religion', 'collection', 'language', 'year',
      'paragraph_index', 'blocktype', 'author', 'title', 'authority', 'encumbered',
      'topic_tags', 'question_types', 'source_site', 'source_url'
    ],
    sortableAttributes: ['year', 'created_at', 'paragraph_index', 'authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 },
    embedders: {
      default: { source: 'userProvided', dimensions: expectedDimensions }
    }
  };

  const documentSettings = {
    searchableAttributes: ['title', 'author', 'description'],
    filterableAttributes: ['religion', 'collection', 'language', 'year', 'author', 'authority', 'encumbered'],
    sortableAttributes: ['year', 'title', 'created_at', 'authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 }
  };

  // HyPE sidecar — each row is ONE hypothetical question. The question text
  // is the only searchable field; its embedding is the semantic match target.
  // paragraph_id is the back-reference; everything else is metadata for
  // filtering and tier-aware ranking inside the multi-index merge.
  const hypeSettings = {
    searchableAttributes: ['question_text'],
    filterableAttributes: ['paragraph_id', 'doc_id', 'religion', 'collection', 'authority', 'encumbered', 'is_thesis'],
    sortableAttributes: ['authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 50000 },
    embedders: {
      default: { source: 'userProvided', dimensions: expectedDimensions }
    }
  };

  // Entity-mentions sidecar — one row per resolved entity mention
  const entityMentionsSettings = {
    searchableAttributes: ['entity_canonical_name'],
    filterableAttributes: ['entity_id', 'paragraph_id', 'doc_id', 'religion', 'collection', 'role', 'authority', 'encumbered'],
    sortableAttributes: ['authority'],
    rankingRules: buildRankingRules(),
    pagination: { maxTotalHits: 10000 },
  };

  // Deep Research index — canonical questions + curated passage metadata
  const deepResearchSettings = {
    searchableAttributes: ['canonical_question', 'key_points', 'summary_text', 'convergence_text', 'section_text'],
    filterableAttributes: ['topic_tags', 'question_type', 'traditions_covered', 'traditions_agreement', 'status', 'ask_count', 'priority'],
    sortableAttributes: ['ask_count', 'priority', 'created_at'],
    rankingRules: ['words', 'typo', 'proximity', 'attributeRank', 'sort', 'exactness'],
    pagination: { maxTotalHits: 1000 },
  };

  // Ensure indexes exist and settings are applied. Non-blocking — if Meilisearch
  // is busy (processing a settings rebuild on millions of docs), we don't block startup.
  const fetchWithTimeout = (url, opts, ms = 5000) => {
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
  };

  for (const [indexUid, pk] of [[INDEXES.PARAGRAPHS, 'id'], [INDEXES.DOCUMENTS, 'id'], [INDEXES.HYPE_QUESTIONS, 'id'], [INDEXES.DEEP_RESEARCH, 'id'], [INDEXES.ENTITY_MENTIONS, 'id']]) {
    try {
      await fetchWithTimeout(`${meiliUrl}/indexes`, {
        method: 'POST', headers, body: JSON.stringify({ uid: indexUid, primaryKey: pk })
      });
    } catch { /* index may already exist or Meilisearch busy */ }
  }

  // Only PATCH settings if they differ from current — avoids queuing settingsUpdate
  // tasks on every API restart, which block the document indexing queue.
  // IMPORTANT: exclude `embedders` from this comparison — Meilisearch returns extra
  // fields (e.g. {type, source, dimensions}) that don't round-trip cleanly through
  // JSON.stringify, causing false positives. Embedder settings are managed exclusively
  // in the setTimeout block below which reads and compares them correctly.
  for (const [indexName, settings] of [[INDEXES.PARAGRAPHS, paragraphSettings], [INDEXES.DOCUMENTS, documentSettings], [INDEXES.HYPE_QUESTIONS, hypeSettings], [INDEXES.DEEP_RESEARCH, deepResearchSettings], [INDEXES.ENTITY_MENTIONS, entityMentionsSettings]]) {
    try {
      const currentRes = await fetchWithTimeout(`${meiliUrl}/indexes/${indexName}/settings`, { headers }, 5000);
      const current = currentRes.ok ? await currentRes.json() : null;
      const { embedders: _ignored, ...settingsWithoutEmbedders } = settings;
      const needsUpdate = !current || Object.keys(settingsWithoutEmbedders).some(key => {
        return JSON.stringify(current[key]) !== JSON.stringify(settingsWithoutEmbedders[key]);
      });
      if (!needsUpdate) {
        logger.info({ index: indexName }, 'Settings unchanged, skipping update');
        continue;
      }
      const patchBody = settingsWithoutEmbedders;
      const res = await fetchWithTimeout(`${meiliUrl}/indexes/${indexName}/settings`, {
        method: 'PATCH', headers, body: JSON.stringify(patchBody)
      });
      const task = await res.json();
      logger.info({ taskUid: task.taskUid, index: indexName }, 'Settings update enqueued (changed)');
    } catch (err) {
      logger.warn({ err: err.message, index: indexName }, 'Settings check/enqueue failed (Meilisearch may be busy)');
    }
  }

  logger.info('Search indexes initialized (settings enqueued)');

  // CRITICAL: Verify embedder config was actually applied after a delay.
  // A partial PATCH to /settings can silently clear the embedder config,
  // which destroys the vector index and requires a week-long re-index.
  // Verify both PARAGRAPHS and HYPE_QUESTIONS (any vector-bearing index).
  setTimeout(async () => {
    // Guard: never re-apply embedder settings while Meilisearch is processing tasks.
    // A PATCH to /settings when HNSW is rebuilding cancels + restarts the rebuild,
    // turning a 24h job into an infinite loop across API restarts.
    try {
      const tasksRes = await fetch(`${meiliUrl}/tasks?statuses=processing&limit=1`, { headers });
      const tasksJson = await tasksRes.json();
      if (tasksJson?.results?.length > 0) {
        logger.info('Skipping embedder verification — Meilisearch has tasks in processing state');
        return;
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Could not check Meilisearch task status before embedder verify');
    }

    for (const indexUid of [INDEXES.PARAGRAPHS, INDEXES.HYPE_QUESTIONS]) {
      try {
        const res = await fetch(`${meiliUrl}/indexes/${indexUid}/settings/embedders`, { headers });
        const embedders = await res.json();
        if (!embedders?.default) {
          logger.error({ index: indexUid }, 'CRITICAL: Meilisearch embedder config is MISSING. Re-applying...');
          await fetch(`${meiliUrl}/indexes/${indexUid}/settings`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ embedders: { default: { source: 'userProvided', dimensions: expectedDimensions } } })
          });
          logger.info({ index: indexUid }, 'Embedder config re-applied');
          continue;
        }
        const dims = embedders.default.dimensions;
        if (dims !== expectedDimensions) {
          logger.warn({ index: indexUid, expected: expectedDimensions, actual: dims }, 'Embedder dimensions mismatch');
        } else {
          logger.info({ index: indexUid, dimensions: dims }, 'Embedder config verified OK');
        }
      } catch (err) {
        logger.warn({ err: err.message, index: indexUid }, 'Failed to verify embedder config');
      }
    }
  }, 30000); // Check 30s after startup (allows settings tasks to complete)
}

/**
 * Hybrid search combining keyword and semantic search
 */
export async function hybridSearch(query, options = {}) {
  if (!config.search.enabled) {
    logger.warn('Meilisearch disabled, returning empty results');
    return { hits: [], totalHits: 0, query };
  }

  const {
    limit = 20,
    offset = 0,
    filters = {},
    filterTerms = [], // Array of terms to match against author/collection/title (case insensitive)
    semanticRatio = 0.5, // 0 = keyword only, 1 = semantic only
    useGroundedText = false, // use embedding_grounded vector when available (entity-resolved text)
    attributesToRetrieve = ['*'],
    attributesToHighlight = ['text', 'heading'],
    highlightPreTag = '<mark>',
    highlightPostTag = '</mark>'
  } = options;

  const meili = getMeili();
  // Resolve target indexes from scope_config. Default = primary only
  // (preserves existing behavior for callers that don't pass scope_config).
  // Site-only locations are excluded from the default by getDefaultScope.
  const scopeConfig = options.scope_config || { primary: true, sites: [] };
  const targetIndexNames = getScopeIndexes(scopeConfig);
  if (targetIndexNames.length === 0) {
    return { hits: [], totalHits: 0, query };
  }

  // Build filter string
  const filterParts = [];
  if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
  if (filters.collection) filterParts.push(`collection CONTAINS "${filters.collection.replace(/"/g, '\\"')}"`);
  if (filters.author) filterParts.push(`author CONTAINS "${filters.author.replace(/"/g, '\\"')}"`);
  if (filters.language) filterParts.push(`language = "${filters.language}"`);
  if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
  if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
  if (filters.documentId) filterParts.push(`doc_id = ${filters.documentId}`);  // INTEGER, no quotes

  // Add text-based filters for author/collection/title (from parenthetical query syntax)
  if (filterTerms.length > 0) {
    const textFilters = [];
    for (const term of filterTerms) {
      // Match against author, collection, or title (CONTAINS is case insensitive in Meilisearch)
      textFilters.push(`author CONTAINS "${term}"`);
      textFilters.push(`collection CONTAINS "${term}"`);
      textFilters.push(`title CONTAINS "${term}"`);
    }
    // Join with OR - any match is acceptable
    filterParts.push(`(${textFilters.join(' OR ')})`);
  }

  const filterString = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

  // Generate embedding for semantic search
  let vector = null;
  if (semanticRatio > 0) {
    try {
      const embedding = await createEmbedding(query, { caller: 'search' });
      vector = embedding.embedding;
    } catch (err) {
      logger.warn({ err }, 'Failed to generate embedding, falling back to keyword search');
    }
  }

  // Over-fetch so authority reranking can pull canonical sources up from just
  // outside the requested window. Capped at maxResults to keep latency bounded.
  const internalLimit = overFetchForRerank(offset + limit);

  // Perform search
  const searchParams = {
    q: query,
    limit: internalLimit,
    offset: 0,
    filter: filterString,
    attributesToRetrieve,
    attributesToHighlight,
    highlightPreTag,
    highlightPostTag,
    showRankingScore: true,
    showMatchesPosition: true,  // Get exact byte positions of matches for sentence extraction
    matchingStrategy: 'all'
  };

  // Add hybrid search if we have a vector
  if (vector) {
    // Switch to 'last' in hybrid mode: BM25 partial match (some words, not all) plus
    // semantic handles full-concept precision. 'all' in hybrid mode blocks Matthew 5:7
    // ("mercy") from "mercy and compassion" queries because Matthew has mercy but not
    // compassion — causing semantic to surface peacemakers (wrong Beatitude) instead.
    searchParams.matchingStrategy = 'last';
    searchParams.hybrid = {
      semanticRatio,
      embedder: useGroundedText ? 'grounded' : 'default'
    };
    searchParams.vector = vector;
  }

  // Unfiltered cross-tradition queries need special handling: the Bahá'í corpus is
  // ~96% of all documents, so a single unfederated search returns only Bahá'í results
  // regardless of authority reranking. Fix: when no religion/collection/author filter
  // and no filterTerms, run one Meilisearch sub-query PER tradition in a single
  // multiSearch call, take top N from each, then merge + authority-rerank.
  const isCrossTradition = !filters.religion && !filters.collection && !filters.author && !filterTerms.length && offset === 0;

  // Extra filter parts that apply even in cross-tradition mode (language, year, doc_id).
  // The religion filter is added per sub-query in crossTraditionSearch instead.
  const extraFilterParts = [];
  if (filters.language) extraFilterParts.push(`language = "${filters.language}"`);
  if (filters.yearFrom) extraFilterParts.push(`year >= ${filters.yearFrom}`);
  if (filters.yearTo) extraFilterParts.push(`year <= ${filters.yearTo}`);
  if (filters.documentId) extraFilterParts.push(`doc_id = ${filters.documentId}`);
  const extraFilter = extraFilterParts.length > 0 ? extraFilterParts.join(' AND ') : null;
  // Slots per tradition = ceil(requested limit / tradition count), floor at 2.
  // No +1 buffer: over-fetching caused same-work volumes (e.g. Mahabharata 3/5/12)
  // to monopolize the candidate pool before authority reranking could diversify.
  const perReligionLimit = isCrossTradition
    ? Math.max(2, Math.ceil((offset + limit) / CROSS_TRADITION_RELIGIONS.length))
    : 0;

  let allHits;
  let totalProcessingMs = 0;
  let estimated = 0;

  if (isCrossTradition) {
    // Federated per-religion search: one sub-query per tradition, single multiSearch call.
    allHits = [];
    for (const indexName of targetIndexNames) {
      const hits = await crossTraditionSearch(meili, indexName, query, vector, {
        semanticRatio, useGroundedText, attributesToRetrieve, attributesToHighlight, highlightPreTag, highlightPostTag, extraFilter
      }, perReligionLimit).catch(err => {
        logger.warn({ err: err.message, index: indexName }, 'hybridSearch: cross-tradition search failed (continuing)');
        return [];
      });
      allHits.push(...hits);
    }
  } else {
    // Fan out across all target indexes in parallel. For the common
    // single-index case (default scope, no per-site indexes registered yet)
    // this collapses to one call — no overhead.
    const indexResults = await Promise.all(
      targetIndexNames.map(name =>
        meili.index(name).search(query, searchParams).catch(err => {
          logger.warn({ err: err.message, index: name }, 'hybridSearch: per-index search failed (continuing)');
          return { hits: [], processingTimeMs: 0, estimatedTotalHits: 0, query };
        })
      )
    );
    allHits = indexResults.flatMap(r => r.hits || []);
    totalProcessingMs = indexResults.reduce((s, r) => s + (r.processingTimeMs || 0), 0);
    estimated = indexResults.reduce((s, r) => s + (r.estimatedTotalHits || 0), 0);

    // Supplementary OL queries for religion-filtered searches.
    // Same problem as in cross-tradition: a large composite non-OL doc (e.g., full
    // Bible) can crowd out OL single-book docs in raw Meilisearch ranking.
    if (filters.religion && !filters.documentId) {
      try {
        const olDocIds = await getOlDocIdsByReligion();
        const ids = olDocIds[filters.religion];
        if (ids && ids.length > 0) {
          const idFilter = `doc_id IN [${ids.join(',')}]`;
          const olFilter = filterString ? `${filterString} AND ${idFilter}` : idFilter;
          const olParams = { ...searchParams, filter: olFilter, limit: 10, matchingStrategy: 'last' };
          const olResults = await Promise.all(
            targetIndexNames.map(name =>
              meili.index(name).search(query, olParams).catch(() => ({ hits: [] }))
            )
          );
          const olHits = olResults.flatMap(r => r.hits || []);
          const existingIds = new Set(allHits.map(h => h.id));
          for (const h of olHits) {
            if (!existingIds.has(h.id)) allHits.push(h);
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'hybridSearch: OL supplementary query failed');
      }
    }
  }

  // Sort by Meili ranking score before authority rerank.
  allHits.sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

  // Enrich hits missing source_site/source_url from the docs table.
  // Paragraphs synced before source_site was added to the worker have null in
  // Meilisearch. Without source_site the OL 1.4x authority multiplier never fires.
  // Batch lookup by doc_id (docs table is tiny — <50K rows, cached by SQLite).
  // Note: fetch ALL docs (not just those with source_site set) so that backfilled
  // source_url values (from backfill-doc-source-urls.mjs) are applied even when
  // source_site is still null.
  const missingSiteDids = [...new Set(allHits.filter(h => !h.source_site && h.doc_id).map(h => h.doc_id))];
  if (missingSiteDids.length > 0) {
    try {
      const placeholders = missingSiteDids.map(() => '?').join(',');
      const docRows = await queryAll(`SELECT id, source_site, source_url FROM docs WHERE id IN (${placeholders}) AND (source_site IS NOT NULL OR source_url IS NOT NULL)`, missingSiteDids);
      const docMap = new Map(docRows.map(r => [r.id, r]));
      for (const hit of allHits) {
        if (!hit.source_site && hit.doc_id) {
          const doc = docMap.get(hit.doc_id);
          if (doc) { hit.source_site = doc.source_site; hit.source_url = doc.source_url; }
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'hybridSearch: doc source_site enrichment failed');
    }
  }

  // Authority reranking: blend Meilisearch relevance with the per-doc authority
  // score so canonical sources surface above citing/derivative works at the
  // same relevance tier. Runs unconditionally — callers don't opt in.
  const authorityRanked = rerankByAuthority(allHits);

  // For filtered queries, cap any single author at 40% so commentary authors
  // (e.g. Bahá'u'lláh writing on Islamic topics) don't crowd out primary scripture.
  const reranked = (!isCrossTradition && offset === 0 && filters.religion)
    ? diversifyHits(authorityRanked, limit, Math.max(2, Math.ceil(limit * 0.4)), 'author')
    : authorityRanked.slice(offset, offset + limit);

  return {
    hits: reranked,
    query,
    processingTimeMs: totalProcessingMs,
    estimatedTotalHits: estimated,
    limit,
    offset,
    _scopeIndexes: targetIndexNames
  };
}

// Fuzzy text helpers extracted to api/lib/search/fuzzy.js. They're pure
// functions with no DB or Meili dependencies.
import {
  levenshtein,
  stripTashkeel,
  textContainsFuzzy,
  hasAllTermMatches,
  calculatePhraseScore
} from './search/fuzzy.js';

/**
 * Keyword-only search (faster, no embedding needed)
 * Filters results to ensure ALL query terms appear (prefix matching allowed)
 * Boosts exact phrase matches to the top
 *
 * Supports pagination via offset parameter.
 * Results are cached for 5 minutes to enable fast pagination.
 */
export async function keywordSearch(query, options = {}) {
  const { limit = 10, offset = 0, ...restOptions } = options;

  // Check cache first
  const cached = getCachedSearch(query);

  if (cached) {
    // Return slice from cached results
    const hits = cached.hits.slice(offset, offset + limit);
    return {
      hits,
      estimatedTotalHits: cached.estimatedTotalHits,
      processingTimeMs: 0,  // Cached, no processing
      cached: true,
      hasMore: offset + limit < cached.estimatedTotalHits
    };
  }

  // Not cached - compute full result set
  // Request more results than typical pagination needs (150 max)
  const results = await hybridSearch(query, {
    ...restOptions,
    limit: 150,  // Fetch max for caching
    semanticRatio: 0
  });

  // Extract query terms for filtering (min 2 chars, filter stop words)
  // Strip Arabic diacritics so terms match undiacritized indexed text
  const queryTerms = stripTashkeel(query.toLowerCase())
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  logger.info({ query, queryTerms, meiliHits: results.hits.length, meiliEstimate: results.estimatedTotalHits }, 'keywordSearch: before filtering');

  let rankedHits;

  // If only stop words or single short word, return unfiltered
  if (queryTerms.length === 0) {
    rankedHits = results.hits;
  } else {
    // Filter to only results where Meilisearch found ALL query terms (with fuzzy matching)
    const filteredHits = results.hits.filter(hit => {
      return hasAllTermMatches(hit, queryTerms);
    });

    // Re-rank: exact phrase matches first, then authority-weighted score so
    // canonical sources outrank citing works at the same phrase-match tier.
    // _authorityScore is already set by the hybridSearch call above.
    rankedHits = filteredHits.map(hit => ({
      ...hit,
      _phraseScore: calculatePhraseScore(hit.text || '', query, queryTerms)
    })).sort((a, b) => {
      if (b._phraseScore !== a._phraseScore) {
        return b._phraseScore - a._phraseScore;
      }
      return (b._authorityScore || 0) - (a._authorityScore || 0);
    });
  }

  logger.info({ query, filteredCount: rankedHits.length }, 'keywordSearch: after filtering');

  // Filter out trivially short passages (headings, fragments)
  const MIN_TEXT_LENGTH = 40;
  rankedHits = rankedHits.filter(hit => (hit.text || '').length >= MIN_TEXT_LENGTH);

  // Deduplicate: 3 layers
  // 1. Exact: same doc_id + paragraph_index (duplicate index entries)
  // 2. Content: same text appearing in different documents (secondary quoting primary)
  // 3. Document: max 3 passages per document (prevent single doc flooding results)
  const seenKeys = new Set();
  const seenTexts = new Set();
  const docIdCounts = {};
  const titleCounts = {};
  const MAX_PER_DOC = 2;
  const MAX_PER_TITLE = 2; // catches same book indexed under different doc_ids
  const deduplicatedHits = [];
  for (const hit of rankedHits) {
    const key = `${hit.doc_id || hit.document_id}-${hit.paragraph_index}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    // Content dedup: normalize and check first 100 chars
    const textKey = (hit.text || '').replace(/\s+/g, ' ').trim().slice(0, 100).toLowerCase();
    if (textKey.length > 20 && seenTexts.has(textKey)) continue;
    seenTexts.add(textKey);
    // Document limit: max N passages from same doc_id
    const docId = hit.doc_id || hit.document_id;
    docIdCounts[docId] = (docIdCounts[docId] || 0) + 1;
    if (docIdCounts[docId] > MAX_PER_DOC) continue;
    // Title limit: catches duplicate uploads with different doc_ids
    const titleKey = (hit.title || '').toLowerCase().trim();
    if (titleKey) {
      titleCounts[titleKey] = (titleCounts[titleKey] || 0) + 1;
      if (titleCounts[titleKey] > MAX_PER_TITLE) continue;
    }
    deduplicatedHits.push(hit);
  }

  if (deduplicatedHits.length !== rankedHits.length) {
    logger.info({ query, before: rankedHits.length, after: deduplicatedHits.length, removed: rankedHits.length - deduplicatedHits.length }, 'keywordSearch: removed duplicates');
  }

  rankedHits = deduplicatedHits;

  // Cache the full ranked result set
  setCachedSearch(query, rankedHits, rankedHits.length);

  // Return requested slice
  const hits = rankedHits.slice(offset, offset + limit);

  return {
    hits,
    estimatedTotalHits: rankedHits.length,
    processingTimeMs: results.processingTimeMs,
    cached: false,
    hasMore: offset + limit < rankedHits.length
  };
}

/**
 * Semantic-only search
 */
export async function semanticSearch(query, options = {}) {
  return hybridSearch(query, { ...options, semanticRatio: 1 });
}

// ─── HyPE sidecar search ──────────────────────────────────────────────────
//
// Search the `hype_questions` index for questions semantically similar to
// the user's query. Each hit carries the back-reference (paragraph_id) so
// the multi-index merge can promote the underlying paragraph.
//
// HyPE matches are HIGH SIGNAL: each row is "a question this paragraph was
// designed to answer." A user query that semantically matches a stored
// question is a strong vote for the paragraph behind that question.

/**
 * Search the HyPE sidecar for question-similarity matches.
 * @param {string} query - the user's query (treated as a question)
 * @param {object} options
 * @param {number} options.limit - top-K hits to return (default 10)
 * @param {object} options.filters - {religion, collection, doc_id, encumbered}
 * @returns {Object} { hits: [{paragraph_id, doc_id, religion, authority, question_text, _semanticScore}], ... }
 */
// HyPE search delegated to api/lib/search/hype.js.
import {
  searchHypeQuestions as _searchHypeQuestions,
  syncHypeBatch as _syncHypeBatch
} from './search/hype.js';

export async function searchHypeQuestions(query, options = {}) {
  return _searchHypeQuestions({ getMeili, INDEXES }, query, options);
}

// Entity-mention sidecar delegated to api/lib/search/entity.js.
import {
  searchByEntity as _searchByEntity,
  syncEntityMentionsBatch as _syncEntityMentionsBatch
} from './search/entity.js';

export async function searchByEntity(entityIds, options = {}) {
  return _searchByEntity({ getMeili, INDEXES }, entityIds, options);
}

export async function syncEntityMentionsBatch(options = {}) {
  return _syncEntityMentionsBatch({ getMeili, INDEXES }, { queryAll, query, getAuthority: (await import('./authority.js')).getAuthority, ...options });
}

// ─── Multi-index merged search (RRF) ──────────────────────────────────────
//
// Queries the main `paragraphs` index AND every configured sidecar index
// in parallel, then merges results by paragraph_id using Reciprocal Rank
// Fusion. A paragraph that ranks high in MULTIPLE indexes scores higher
// than one only matching in one — surfaces paragraphs that semantically
// match BOTH the user's question (via HyPE) AND the topic (via main).
//
// Adding a new sidecar layer (summaries, entities, glossary tags, etc.)
// is purely additive: define a new INDEXES.* entry, write its sync logic,
// add it as a parallel call here with appropriate weight. Existing layers
// are untouched.
const RRF_K = 60;
const DEFAULT_WEIGHTS = {
  main: 1.0,    // paragraphs hybrid (text + context + paragraph embedding)
  hype: 1.5,    // HyPE question + thesis match (highest signal — designed to answer)
  entity: 1.0   // entity-mentions sidecar (resolved named entity filter)
};

/**
 * Merged search across paragraphs + sidecars with RRF aggregation.
 * Drop-in replacement for hybridSearch() when you want layered enrichment.
 *
 * @param {string} query
 * @param {object} options
 * @param {number} options.limit
 * @param {object} options.filters
 * @param {object} options.weights - per-index weights {main, hype}
 * @param {boolean} options.includeMatchedHype - attach .matched_hype on each hit (debug)
 * @returns {Object} { hits, estimatedTotalHits, _layers: {main: count, hype: count} }
 */
export async function multiIndexSearch(query, options = {}) {
  const limit = options.limit || 10;
  const overFetch = Math.max(limit * 3, 30);
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const filters = options.filters || {};

  // scope_config plumbed through so site-only queries reach the right Meili
  // index (and ONLY the right index — hard rule for site-only).
  const scope_config = options.scope_config;

  // For religion-filtered queries, use more keyword weight (0.3 semantic) so exact
  // scripture text (e.g. Sura CXII for Al-Ikhlas) beats semantically adjacent surahs
  // that score high via embedding but are thematically different. Cross-tradition
  // queries keep 0.5 (default) for better conceptual discovery.
  // Callers can pass semanticRatio to override (e.g. 0.1 for author+religion
  // primary scripture searches where BM25 keyword match must dominate).
  const mainSemanticRatio = options.semanticRatio != null
    ? options.semanticRatio
    : (filters.religion && !filters.collection) ? 0.3 : 0.5;
  const entityIds = options.entityIds || [];

  const [mainResult, hypeResult, entityResult] = await Promise.all([
    hybridSearch(query, { limit: overFetch, filters, scope_config, semanticRatio: mainSemanticRatio }).catch(err => {
      logger.warn({ err: err.message }, 'multiIndexSearch: main hybrid failed');
      return { hits: [] };
    }),
    // HyPE: only query when scope includes primary. Site-only sites don't
    // have HyPE (gated off in v1), and supplementals don't either. The
    // primary `hype_questions` index is the only one populated.
    (!scope_config || scope_config.primary)
      ? searchHypeQuestions(query, { limit: overFetch, filters }).catch(err => {
          logger.warn({ err: err.message }, 'multiIndexSearch: hype failed');
          return { hits: [] };
        })
      : Promise.resolve({ hits: [] }),
    // Entity-mentions: only when resolved entity IDs are provided.
    entityIds.length > 0
      ? searchByEntity(entityIds, { limit: overFetch, filters }).catch(err => {
          logger.warn({ err: err.message }, 'multiIndexSearch: entity failed');
          return { hits: [] };
        })
      : Promise.resolve({ hits: [] }),
  ]);

  // RRF aggregation by paragraph_id
  const aggregate = new Map(); // paragraph_id → { paragraph, score, matchedHype, entityRank, mainRank, hypeRank }

  (mainResult.hits || []).forEach((hit, rank) => {
    const pid = hit.id;
    const cur = aggregate.get(pid) || { paragraph: null, score: 0, matchedHype: null, entityRank: null, mainRank: null, hypeRank: null };
    cur.score += weights.main / (RRF_K + rank);
    cur.paragraph = hit;
    cur.mainRank = rank;
    aggregate.set(pid, cur);
  });

  // Entity mentions: best mention per paragraph (same de-dup pattern as HyPE).
  const entitySeenParagraphs = new Set();
  (entityResult.hits || []).forEach((hit, rank) => {
    const pid = hit.paragraph_id;
    if (entitySeenParagraphs.has(pid)) return;
    entitySeenParagraphs.add(pid);
    const cur = aggregate.get(pid) || { paragraph: null, score: 0, matchedHype: null, entityRank: null, mainRank: null, hypeRank: null };
    cur.score += (weights.entity || 1.0) / (RRF_K + rank);
    cur.entityRank = rank;
    if (!cur.paragraph) {
      cur.paragraph = { id: pid, doc_id: hit.doc_id, religion: hit.religion, collection: hit.collection, authority: hit.authority, _stub: true };
    }
    aggregate.set(pid, cur);
  });

  // Only count the best-ranked HyPE question per paragraph to prevent multi-question
  // accumulation inflating scores for paragraphs with many generated questions.
  const hypeSeenParagraphs = new Set();
  (hypeResult.hits || []).forEach((hit, rank) => {
    const pid = hit.paragraph_id;
    if (hypeSeenParagraphs.has(pid)) return;
    hypeSeenParagraphs.add(pid);
    const cur = aggregate.get(pid) || { paragraph: null, score: 0, matchedHype: null, entityRank: null, mainRank: null, hypeRank: null };
    cur.score += weights.hype / (RRF_K + rank);
    cur.matchedHype = hit.question_text;
    cur.hypeRank = rank;
    if (!cur.paragraph) {
      // Hype-only hit — synthesize a partial paragraph stub from the hype row's
      // metadata. The caller will fetch the full paragraph below.
      cur.paragraph = {
        id: pid,
        doc_id: hit.doc_id,
        religion: hit.religion,
        collection: hit.collection,
        authority: hit.authority,
        _stub: true
      };
    }
    aggregate.set(pid, cur);
  });

  // Fetch full paragraphs for hype-only hits (those flagged _stub).
  // The paragraphs index uses `id` as primary key but doesn't expose `id`
  // as filterable, so we use getDocuments({ ids: [...] }) — primary-key
  // lookup which doesn't require the field to be in filterableAttributes.
  const stubIds = [...aggregate.values()].filter(e => e.paragraph?._stub).map(e => e.paragraph.id);
  if (stubIds.length > 0) {
    try {
      const meili = getMeili();
      const fetched = await meili.index(INDEXES.PARAGRAPHS).getDocuments({
        ids: stubIds,
        limit: stubIds.length
      });
      for (const doc of (fetched.results || fetched.hits || [])) {
        const e = aggregate.get(doc.id);
        if (e) e.paragraph = { ...doc, _stub: false };
      }
    } catch (err) {
      logger.warn({ err: err.message, stubCount: stubIds.length }, 'multiIndexSearch: stub paragraph fetch failed');
    }
  }

  // Sort by RRF score, drop entries that couldn't be fetched.
  // For cross-tradition queries (no religion filter), apply the same per-religion
  // diversity cap used in hybridSearch. HyPE gives Bahá'í hits a double-boost
  // (main + hype RRF contribution) that can undo the per-religion diversity from
  // hybridSearch — applying it here ensures the final window is also diverse.
  const isCrossTraditionMIS = !filters.religion && !filters.collection && !filters.author;
  // Authority-blend sort: for any unfiltered or religion-filtered query, blend authority
  // into the RRF score so primary texts (auth=8-10) beat secondary books (auth=5) for
  // their tradition/author diversity slots. HyPE adds secondary hits that otherwise undo
  // the per-author cap applied in hybridSearch.
  const needsAuthorityBlend = isCrossTraditionMIS || (filters.religion && !filters.collection && !filters.author);
  const allSorted = [...aggregate.values()]
    .filter(e => {
      if (!e.paragraph || e.paragraph._stub) return false;
      // HyPE doesn't index author — post-merge enforce author filter so HyPE hits
      // from non-matching authors don't bypass it (e.g. Pickthall leaking into author="Muhammad" slot).
      if (filters.author && e.paragraph.author && e.paragraph.author !== filters.author) return false;
      // Skip Bismillah formula paragraphs — they score 0.93+ in HyPE for mercy queries
      // (the formula literally contains "Compassionate" and "Merciful") but Jafar can't
      // cite them meaningfully. Filtering here ensures actual content surfaces instead.
      if (BISMILLAH_RE.test((e.paragraph.text || '').trim())) return false;
      return true;
    })
    .sort((a, b) => {
      if (needsAuthorityBlend) {
        const authA = computeAuthorityScore({ ...a.paragraph, _rankingScore: a.score });
        const authB = computeAuthorityScore({ ...b.paragraph, _rankingScore: b.score });
        if (Math.abs(authB - authA) > 1e-7) return authB - authA;
      }
      return b.score - a.score;
    });
  // Deduplicate: cap at 1 paragraph per source document so multiple passages from
  // the same book don't crowd out content from other works.
  // Exception: when author filter is set we're intentionally searching within one
  // author's works — allow up to `limit` passages so callers get the most relevant
  // passages, not just the first-ranked one from each document.
  const perDocCap = filters.author ? limit : 1;
  const docDedup = new Map();
  const sortedDeduped = allSorted.filter(e => {
    const docId = e.paragraph?.doc_id ?? '__nodoc__';
    const n = docDedup.get(docId) || 0;
    if (n < perDocCap) { docDedup.set(docId, n + 1); return true; }
    return false;
  });

  let finalEntries;
  if (isCrossTraditionMIS) {
    const rrfHits = sortedDeduped.map(e => ({ ...e.paragraph, _rrfScore: e.score, _entry: e }));
    // Cap at 25% per tradition (max 2 of 8) so at least 6 other tradition slots exist.
    // Tighter than hybridSearch's 40% because multiIndexSearch is the user-facing output.
    // Bahá'í corpus is ~96% of all docs — cap it to 1 slot so other traditions break in.
    const diverse = diversifyHits(rrfHits, limit, Math.max(2, Math.ceil(limit * 0.25)), 'religion', { "Baha'i": 1 });
    finalEntries = diverse.map(h => h._entry);
  } else if (filters.religion && !filters.collection && !filters.author) {
    // Religion-filtered: apply author diversity so primary-text authors (Muhammad, Matthew)
    // surface alongside commentary authors (Fananapazir, Momen). HyPE dedup is now in place
    // so 33% (max 3 of 8) is safe — higher than 25% to allow 3 surahs/gospels per author
    // rather than capping at 2, which could exclude the most relevant (e.g. actual Al-Ikhlas).
    const filteredHits = sortedDeduped.map(e => ({ ...e.paragraph, _rrfScore: e.score, _entry: e }));
    const diverseFiltered = diversifyHits(filteredHits, limit, Math.max(2, Math.ceil(limit * 0.33)), 'author');
    finalEntries = diverseFiltered.map(h => h._entry);
  } else {
    finalEntries = sortedDeduped.slice(0, limit);
  }

  const hits = finalEntries.map(e => {
    const h = {
      ...e.paragraph,
      _rrfScore: e.score,
      ...(options.includeMatchedHype && e.matchedHype ? { matched_hype: e.matchedHype } : {}),
      _layerRanks: { main: e.mainRank, hype: e.hypeRank }
    };
    if (!h.source_url && h.doc_id) h.source_url = `https://siftersearch.com/document/${h.doc_id}`;
    return h;
  });

  logger.info({
    query: query.slice(0, 80),
    main_hits: (mainResult.hits || []).length,
    hype_hits: (hypeResult.hits || []).length,
    entity_hits: (entityResult.hits || []).length,
    merged: aggregate.size,
    returned: hits.length
  }, 'multi-index search complete');

  return {
    hits,
    estimatedTotalHits: aggregate.size,
    _layers: {
      main: (mainResult.hits || []).length,
      hype: (hypeResult.hits || []).length,
      entity_mentions: (entityResult.hits || []).length,
    }
  };
}

// ─── HyPE sidecar sync ────────────────────────────────────────────────────
//
// Pulls paragraphs with `enhanced_synced=0` and `hyp_questions IS NOT NULL`,
// generates an embedding per question, and upserts one row per question into
// the `hype_questions` Meilisearch index. Marks the source paragraph
// `enhanced_synced=1` after successful indexing.
//
// Idempotent on re-runs: re-indexing a paragraph deletes its prior
// `hype_questions` rows (filter by paragraph_id) before re-inserting,
// so updated questions overwrite stale ones cleanly.
//
// Designed to be called periodically from the unified worker.

/**
 * Parse the stored hyp_questions string into an array of question strings.
 * Storage format: newline-separated, already de-numbered/de-bulleted by
 * parseHyPEResponse. Filter empty lines defensively.
 */
// syncHypeBatch delegated to api/lib/search/hype.js (imported above as _syncHypeBatch).
export async function syncHypeBatch(opts = {}) {
  return _syncHypeBatch({ getMeili, INDEXES }, opts);
}

/**
 * Federated search - execute multiple queries in a single request with merged, deduplicated results
 * @param {Array} queries - Array of { query, filter, limit, vector, semanticRatio }
 * @returns {Object} { hits: [], processingTimeMs }
 */
export async function federatedSearch(queries, options = {}) {
  const meili = getMeili();
  const { limit = 20, offset = 0 } = options;

  // For federated search, limit/offset go on federation object, not individual queries
  const searchQueries = queries.map(q => ({
    indexUid: INDEXES.PARAGRAPHS,
    q: q.query,
    filter: q.filter || undefined,
    vector: q.vector || undefined,
    hybrid: q.vector ? { semanticRatio: q.semanticRatio || 0.5, embedder: 'default' } : undefined,
    showRankingScore: true,
    showMatchesPosition: true,  // Get exact positions for sentence extraction
    attributesToRetrieve: ['*'],
    attributesToHighlight: ['text', 'heading'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
    matchingStrategy: 'all'  // Require ALL words to match
  }));

  // Federated search: merges and deduplicates results across all queries.
  // Over-fetch so authority reranking has material, then trim to the requested
  // window after reranking.
  const federationLimit = overFetchForRerank(offset + limit);
  const response = await meili.multiSearch({
    federation: { limit: federationLimit, offset: 0 },
    queries: searchQueries
  });

  const reranked = rerankByAuthority(response.hits || []).slice(offset, offset + limit);

  return {
    hits: reranked,
    processingTimeMs: response.processingTimeMs
  };
}

/**
 * Generate embeddings for multiple texts in a single batch API call
 * @param {string[]} texts - Array of texts to embed
 * @returns {number[][]} Array of embedding vectors
 */
export async function batchEmbeddings(texts) {
  if (texts.length === 0) return [];

  const { embeddings } = await createEmbeddings(texts, { caller: 'search:rerank' });
  return embeddings;
}

// Meilisearch payload limit: 100MB
// Each paragraph with 3072-dim vector is ~30KB (text + vector + metadata)
// Batch 200 paragraphs per upload to stay well under limit (~6MB per batch)
const MEILI_BATCH_SIZE = 200;

/**
 * Index a document with its paragraphs
 * Handles batching for large documents to avoid Meilisearch payload limits
 */
export async function indexDocument(document, paragraphs) {
  if (!config.search.enabled) {
    logger.debug({ documentId: document.id }, 'Meilisearch disabled, skipping indexing');
    return;
  }
  const meili = getMeili();

  // Index document metadata (primary key: id)
  await meili.index(INDEXES.DOCUMENTS).addDocuments([document], { primaryKey: 'id' });

  // Index paragraphs in batches to avoid payload size limits
  if (paragraphs.length > 0) {
    const paragraphIndex = meili.index(INDEXES.PARAGRAPHS);

    for (let i = 0; i < paragraphs.length; i += MEILI_BATCH_SIZE) {
      const batch = paragraphs.slice(i, i + MEILI_BATCH_SIZE);
      await paragraphIndex.addDocuments(batch, { primaryKey: 'id' });

      // Log progress for large documents
      if (paragraphs.length > MEILI_BATCH_SIZE) {
        logger.debug({
          documentId: document.id,
          batch: Math.floor(i / MEILI_BATCH_SIZE) + 1,
          total: Math.ceil(paragraphs.length / MEILI_BATCH_SIZE),
          paragraphs: `${Math.min(i + MEILI_BATCH_SIZE, paragraphs.length)}/${paragraphs.length}`
        }, 'Indexing paragraph batch');
      }
    }
  }

  logger.info({ documentId: document.id, paragraphCount: paragraphs.length }, 'Document indexed');
}

/**
 * Delete a document and its paragraphs
 */
export async function deleteDocument(documentId) {
  if (!config.search.enabled) {
    logger.debug({ documentId }, 'Meilisearch disabled, skipping delete');
    return;
  }
  const meili = getMeili();

  await meili.index(INDEXES.DOCUMENTS).deleteDocument(documentId);
  await meili.index(INDEXES.PARAGRAPHS).deleteDocuments({
    filter: `doc_id = ${documentId}`  // INTEGER, no quotes
  });

  logger.info({ documentId }, 'Document deleted from index');
}

/**
 * Get library statistics from SQLite (source of truth)
 * Meilisearch is only used for indexing progress status
 */
export async function getStats() {
  // Get progress from progress service
  const [importProgress, ingestionProgress, indexingProgress] = await Promise.all([
    Promise.resolve(getImportProgress()),
    getIngestionProgress(),
    getIndexingProgress()
  ]);

  try {
    // Use cached counts for the heavy content table queries
    const cachedCounts = await getCachedContentCounts();

    // Docs table is small — GROUP BY queries are fast
    const [religionRows, collectionRows] = await Promise.all([
      queryAll(`
        SELECT religion, COUNT(*) as count
        FROM docs
        WHERE deleted_at IS NULL AND religion IS NOT NULL
        GROUP BY religion
      `),
      queryAll(`
        SELECT collection, COUNT(*) as count
        FROM docs
        WHERE deleted_at IS NULL AND collection IS NOT NULL
        GROUP BY collection
      `)
    ]);

    const totalDocuments = cachedCounts.totalDocs;
    const totalPassages = cachedCounts.totalParagraphs;

    // Build religion and collection count maps
    const religionCounts = {};
    for (const row of religionRows) {
      religionCounts[row.religion] = row.count;
    }

    const collectionCounts = {};
    for (const row of collectionRows) {
      collectionCounts[row.collection] = row.count;
    }

    // Estimate total words (~100 words per paragraph average)
    const totalWords = totalPassages * 100;

    // Indexing status derived from SQLite — no Meilisearch HTTP calls needed
    const meilisearchIndexing = (indexingProgress?.pending || 0) > 0;

    return {
      totalDocuments,
      totalPassages,
      totalWords,
      religions: Object.keys(religionCounts).length,
      religionCounts,
      collections: Object.keys(collectionCounts).length,
      collectionCounts,
      meilisearchEnabled: config.search.enabled,
      meilisearchIndexing,
      importProgress,
      ingestionProgress,
      indexingProgress,
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to get library stats');
    return {
      totalDocuments: 0,
      totalPassages: 0,
      totalWords: 0,
      religions: 0,
      religionCounts: {},
      collections: 0,
      collectionCounts: {},
      meilisearchEnabled: config.search.enabled,
      meilisearchIndexing: false,
      meiliTaskProgress: null,
      importProgress,
      ingestionProgress,
      indexingProgress,
      error: err.message
    };
  }
}

/**
 * Health check
 */
export async function healthCheck() {
  if (!config.search.enabled) {
    return { status: 'disabled', message: 'Meilisearch is disabled' };
  }
  try {
    const meili = getMeili();
    const health = await meili.health();
    return { status: 'ok', ...health };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}


// =============================================================================
// SENTENCE EXTRACTION + HIGHLIGHTING — extracted to api/lib/search/highlighting.js
// =============================================================================
// Re-exported here so existing importers (chat.js, public-api.js, etc.) keep
// working unchanged. Each is a pure helper; see search/highlighting.js for
// the full implementation.

import {
  extractMatchingSentences,
  highlightBestSentence,
  enrichHitsWithExcerpts,
  STOP_WORDS
} from './search/highlighting.js';
export { extractMatchingSentences, highlightBestSentence, enrichHitsWithExcerpts, STOP_WORDS };


// ─── mergeSearchResults ───────────────────────────────────────────────────────

/**
 * Merges base search hits with enhanced (AI-enriched) hits by paragraph id.
 * Base hits come first (preserving ranking), enhanced-only hits appended.
 * @param {Array} baseHits - hits from keyword/vector search
 * @param {Array} enhancedHits - hits from AI enhancement pipeline
 * @returns {Array} merged hits
 */
export function mergeSearchResults(baseHits, enhancedHits) {
  const enhancedMap = new Map(enhancedHits.map(h => [h.id, h]));
  const seen = new Set();
  const merged = baseHits.map(hit => {
    seen.add(hit.id);
    const enhanced = enhancedMap.get(hit.id);
    return enhanced ? { ...hit, ...enhanced } : { ...hit };
  });
  for (const hit of enhancedHits) {
    if (!seen.has(hit.id)) merged.push({ ...hit });
  }
  return merged;
}

export const search = {
  getMeili,
  initializeIndexes,
  hybridSearch,
  keywordSearch,
  semanticSearch,
  federatedSearch,
  batchEmbeddings,
  indexDocument,
  deleteDocument,
  getStats,
  healthCheck,
  extractMatchingSentences,
  enrichHitsWithExcerpts,
  highlightBestSentence,
  prewarmCache,
  getSearchCacheStats,
  clearSearchCache,
  INDEXES,
  POPULAR_QUERIES
};

export default search;
