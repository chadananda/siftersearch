// :arch: Pre-search query decomposition — separates facet intent from search terms
// :why: "decentralization in writings of Abdu'l-Baha" should search "decentralization" with author filter, not pollute semantic vectors with author name
// :deps: aiService (fast model) | consumers: search routes, public API, researcher agent
// :rules: Returns original query untouched if no facets detected. Never blocks on AI failure — falls back to raw query.

import { aiService } from './ai-services.js';
import { config } from './config.js';
import { logger } from './logger.js';

const DECOMPOSE_PROMPT = `Extract search facets from the user's query. Separate the SEARCH TERMS (what to find) from FILTER CONSTRAINTS (where to look).

FILTERABLE FIELDS:
- author: e.g. "Bahá'u'lláh", "Abdu'l-Bahá", "Shoghi Effendi", "Buddha", "Jesus", "Muhammad", "Rumi", "Krishna"
- religion: "Bahá'í", "Buddhist", "Christian", "Confucian", "Hindu", "Islam", "Jain", "Judaism", "Tao", "Zoroastrian"
- collection: book/collection name, e.g. "Hidden Words", "Kitáb-i-Aqdas", "Pilgrim Notes", "Bhagavad Gita", "Quran"

DETECTION PATTERNS — strip these from the search query and convert to filters:
- "in the writings of X" / "by X" / "from X" / "according to X" → author filter
- "in Buddhist texts" / "in Islamic scripture" / "from Christianity" → religion filter
- "in the Hidden Words" / "from the Quran" / "in Pilgrim Notes" → collection filter

SPELLING NORMALIZATION:
- "Abdul-Baha" / "Abdul Baha" / "Abdu'l Baha" → author: "'Abdu'l-Bahá"
- "Bahaullah" / "Baha'u'llah" → author: "Bahá'u'lláh"
- "Shoghi" / "Guardian" → author: "Shoghi Effendi"
- "Buddhism" / "Buddha's teachings" → religion: "Buddhist"
- "Islamic" / "Muslim" → religion: "Islam"
- "Christianity" / "Biblical" → religion: "Christian"
- "Hinduism" → religion: "Hindu"
- "Jewish" / "Torah" → religion: "Judaism"
- "Bahai" / "Baha'i" → religion: "Bahá'í"

Return JSON only:
{
  "searchQuery": "the actual topic/concept to search for (no author/religion/collection references)",
  "author": "normalized author name or null",
  "religion": "normalized religion name or null",
  "collection": "collection/book name or null"
}

If NO facets detected, return the query unchanged with null filters.`;

// Cache decomposition results — same query always decomposes the same way
const decomposeCache = new Map();
const CACHE_MAX = 500;

/**
 * Decompose a natural language query into search terms + facet filters.
 * "decentralization of political power in the writings of Abdu'l-Baha"
 *  → { searchQuery: "decentralization of political power", filters: { author: "'Abdu'l-Bahá" } }
 */
export async function decomposeQuery(rawQuery) {
  if (!rawQuery || rawQuery.length < 10) return { searchQuery: rawQuery, filters: {}, decomposed: false };

  // Check cache
  const cacheKey = rawQuery.toLowerCase().trim();
  if (decomposeCache.has(cacheKey)) return decomposeCache.get(cacheKey);

  // Quick regex pre-check: skip AI if no facet-like patterns present
  const facetPatterns = /\b(in the|by|from|according to|writings of|teachings of|scripture|texts?|tradition)\b/i;
  if (!facetPatterns.test(rawQuery)) {
    const noFacet = { searchQuery: rawQuery, filters: {}, decomposed: false };
    decomposeCache.set(cacheKey, noFacet);
    return noFacet;
  }

  try {
    const response = await aiService.chat([
      { role: 'system', content: DECOMPOSE_PROMPT },
      { role: 'user', content: rawQuery }
    ], {
      model: config.ai.search.model,
      temperature: 0,
      maxTokens: 150,
      caller: 'query:decompose'
    });

    const parsed = JSON.parse(response.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    const filters = {};
    if (parsed.author) filters.author = parsed.author;
    if (parsed.religion) filters.religion = parsed.religion;
    if (parsed.collection) filters.collection = parsed.collection;
    const hasFilters = Object.keys(filters).length > 0;
    const result = {
      searchQuery: hasFilters ? (parsed.searchQuery || rawQuery) : rawQuery,
      filters,
      decomposed: hasFilters
    };

    logger.info({ rawQuery, searchQuery: result.searchQuery, filters, decomposed: hasFilters }, 'Query decomposed');

    // Cache result
    if (decomposeCache.size >= CACHE_MAX) {
      const firstKey = decomposeCache.keys().next().value;
      decomposeCache.delete(firstKey);
    }
    decomposeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.warn({ err: err.message, rawQuery }, 'Query decomposition failed, using raw query');
    return { searchQuery: rawQuery, filters: {}, decomposed: false };
  }
}
