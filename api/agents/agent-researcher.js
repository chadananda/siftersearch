/**
 * Researcher Agent - Search Strategy Specialist
 *
 * The Researcher agent determines the optimal search strategy for user queries:
 * - Fast queries for simple, direct questions
 * - Complex multi-query strategies for nuanced questions
 * - Cross-tradition comparisons
 * - Deep dives into specific topics
 */

import { BaseAgent } from './base-agent.js';
import { federatedSearch, batchEmbeddings, hybridSearch, keywordSearch, semanticSearch } from '../lib/search.js';

const RESEARCHER_SYSTEM_PROMPT = `You are designing a search strategy for an interfaith religious library. Your goal is to uncover spiritual perspectives that transcend secular materialistic assumptions - discovering higher, more nuanced ways of approaching human problems.

## CORE ORIENTATION

This library contains sacred texts and spiritual teachings. We seek insights that ELEVATE understanding beyond conventional secular framing:

| Secular Assumption | Spiritual Reframing |
|-------------------|---------------------|
| Fight bigotry through opposition | Create unity through love and understanding |
| Solve problems by forcing/taking | Transform through character development and giving |
| Control outcomes externally | Honor freedom of will and inner transformation |
| Material solutions for material problems | Spiritual roots require spiritual remedies |
| Individual rights as ultimate value | Service to humanity as path to fulfillment |
| Conflict as inevitable | Harmony as natural state when aligned with divine will |

When users ask about social issues, don't just confirm secular approaches - actively search for spiritual alternatives that address root causes through transformation rather than coercion.

## SEARCH STRATEGY PRINCIPLES

1. **Semantic Disambiguation** - CRITICAL: Words carry different meanings in spiritual vs secular contexts. EXPOSE these distinctions:
   - "Equality" → equality of soul vs equality of outcomes vs equality before God vs stations and duties
   - "Freedom" → freedom from lower nature vs political freedom vs spiritual liberation vs freedom to serve
   - "Justice" → divine justice vs retributive vs restorative vs cosmic balance
   - "Love" → divine love vs attachment vs selfless service vs love as action not emotion
   - "Truth" → absolute truth vs relative perception vs experiential knowledge vs revealed truth
   - "Power" → spiritual potency vs worldly control vs empowerment through submission to God
   Design searches that surface spiritual conceptualizations users may not know exist.

2. **Challenge Secular Assumptions** - What answers would secular culture expect? List them, then design searches specifically for teachings that offer HIGHER alternatives:
   - Where secularism sees problems to fix, religion sees souls to develop
   - Where secularism demands rights, religion cultivates responsibilities
   - Where secularism fights against, religion builds toward

3. **Cross-Traditional Coverage** - Ensure searches span multiple religious/spiritual traditions. The world's wisdom traditions often converge on truths that transcend secular materialism.

4. **Multiple Angles** - Break the query into spiritual facets:
   - Direct teachings on the topic
   - Metaphors, parables, or mystical teachings
   - The spiritual PURPOSE behind apparent problems
   - Character virtues that address the root issue
   - Paradoxes that reveal deeper truth (weakness as strength, loss as gain)
   - How inner transformation affects outer conditions

5. **Unexpected Connections** - What tangential spiritual concepts might illuminate the issue?
   - The role of tests and difficulties in spiritual growth
   - Unity and oneness as foundation for social harmony
   - Detachment from outcomes while engaging fully in action
   - Service as path to both individual and collective well-being

6. **Keyword Diversity** - Generate search terms that include:
   - Scriptural/sacred terminology
   - Virtues and spiritual qualities (patience, humility, forbearance)
   - Traditional religious framing of modern issues
   - Mystical and contemplative language
   - Terms for inner transformation (purification, refinement, sanctification)

SEARCH MODES:
- hybrid: Best for most queries (combines semantic + keyword)
- semantic: Best for conceptual/meaning-based queries
- keyword: Best for specific phrases, names, titles

Remember: The most valuable insights come from what TRANSCENDS secular expectations. Design searches to discover how spiritual wisdom reframes problems entirely - not just offering alternative solutions, but revealing that the question itself may need transformation.`;

export class ResearcherAgent extends BaseAgent {
  constructor(options = {}) {
    super('researcher', {
      model: options.model || 'gpt-4o',
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens || 800,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      ...options
    });
  }

  /**
   * Create a search plan for a user query
   * @param {string} query - The user's search query
   * @param {Object} options - Search options
   * @param {string} options.strategy - 'auto', 'simple_search', or 'complex_search'
   * @param {string[]} options.traditions - Traditions to focus on
   * @param {string[]} options.filterTerms - Parsed filter terms from parenthetical syntax
   * @param {number} options.limit - Result limit per query
   */
  async createSearchPlan(query, options = {}) {
    const { strategy = 'auto', traditions = [], filterTerms = [] } = options;

    // For simple strategy, just return single query
    if (strategy === 'simple_search') {
      return {
        type: 'simple',
        queries: [{
          query,
          mode: 'hybrid',
          limit: options.limit || 10,
          filters: traditions.length ? { religion: traditions[0] } : {}
        }]
      };
    }

    // For auto or complex, ask AI to plan
    const filterContext = filterTerms.length > 0
      ? `\nIMPORTANT: The user has requested to filter results to documents/authors/collections containing: ${filterTerms.join(', ')}. These filters are already applied to the search - incorporate this context into your strategy (e.g., if filtering by "shoghi", focus on Bahá'í materials).`
      : '';

    const planPrompt = `Create a search plan for this query: "${query}"

${traditions.length ? `Focus on traditions: ${traditions.join(', ')}` : ''}
${strategy === 'complex_search' ? 'Use a comprehensive multi-query approach.' : ''}${filterContext}

Return JSON only:
{
  "type": "simple" | "exhaustive" | "comparative",
  "assumptions": ["obvious answer 1 we might expect", "obvious answer 2"],
  "reasoning": "overall strategy explanation - what makes this query interesting and how we'll explore it",
  "queries": [
    {
      "query": "search string",
      "mode": "hybrid" | "semantic" | "keyword",
      "rationale": "why this specific search",
      "angle": "direct" | "metaphor" | "historical" | "practical" | "paradox" | "unexpected",
      "filters": { "religion": "optional - filter by tradition like Buddhist, Bahai, Christian, etc." },
      "limit": 10
    }
  ],
  "traditions": ["traditions this plan covers"],
  "surprises": ["unexpected findings to watch for"],
  "followUp": ["suggested next searches based on likely findings"]
}

FILTERS: You can add "filters" to any query to narrow results:
- "religion": Filter by tradition (Buddhist, Bahai, Christian, Islamic, Hindu, Jewish, Sikh, Zoroastrian, etc.)
- Use filters when the query specifically mentions a tradition or when exploring a specific tradition's perspective
- Example: For "Buddhist view on suffering", add "filters": { "religion": "Buddhist" }
- For cross-tradition comparisons, run separate queries with different religion filters

Generate 5-10 queries that explore multiple angles. Challenge assumptions. Cast a wide net across traditions.`;

    const response = await this.chat([
      { role: 'user', content: planPrompt }
    ], { temperature: 0.3, maxTokens: 1500 });

    try {
      const plan = this.parseJSON(response.content);
      // Validate and sanitize
      return {
        type: plan.type || 'exhaustive',
        assumptions: plan.assumptions || [],
        reasoning: plan.reasoning || '',
        queries: (plan.queries || [{ query, mode: 'hybrid', limit: 10 }]).slice(0, 10),
        traditions: plan.traditions || [],
        surprises: plan.surprises || [],
        followUp: plan.followUp || []
      };
    } catch (error) {
      this.logger.warn({ error, query }, 'Failed to parse search plan, using simple strategy');
      return {
        type: 'simple',
        assumptions: [],
        reasoning: 'Fallback to simple search',
        queries: [{ query, mode: 'hybrid', limit: options.limit || 10 }],
        traditions: [],
        surprises: [],
        followUp: []
      };
    }
  }

  /**
   * Build a Meilisearch filter string from filters object and filterTerms
   */
  buildFilterString(filters = {}, filterTerms = []) {
    const filterParts = [];

    // Standard filters
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.collection) filterParts.push(`collection = "${filters.collection}"`);
    if (filters.language) filterParts.push(`language = "${filters.language}"`);
    if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
    if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);
    if (filters.documentId) filterParts.push(`document_id = "${filters.documentId}"`);

    // Parenthetical filter terms (author/collection/title CONTAINS)
    if (filterTerms.length > 0) {
      const textFilters = [];
      for (const term of filterTerms) {
        textFilters.push(`author CONTAINS "${term}"`);
        textFilters.push(`collection CONTAINS "${term}"`);
        textFilters.push(`title CONTAINS "${term}"`);
      }
      filterParts.push(`(${textFilters.join(' OR ')})`);
    }

    return filterParts.length > 0 ? filterParts.join(' AND ') : undefined;
  }

  /**
   * Execute a search plan using federated search (batched queries + embeddings)
   * @param {Object} plan - The search plan from createSearchPlan
   * @param {Object} options - Execution options
   * @param {string[]} options.filterTerms - Filter terms to apply to all queries (from parenthetical syntax)
   */
  async executeSearchPlan(plan, options = {}) {
    const { filterTerms = [] } = options;
    const searchStartTime = Date.now();

    // STEP 1: Separate queries by mode (hybrid/semantic need embeddings, keyword doesn't)
    const hybridQueries = plan.queries.filter(q => q.mode !== 'keyword');
    const keywordQueries = plan.queries.filter(q => q.mode === 'keyword');

    // STEP 2: Batch generate embeddings for hybrid/semantic queries (single API call)
    let embeddings = [];
    const embeddingStartTime = Date.now();
    if (hybridQueries.length > 0) {
      try {
        const texts = hybridQueries.map(q => q.query);
        embeddings = await batchEmbeddings(texts);
      } catch (error) {
        this.logger.warn({ error }, 'Batch embedding failed, queries will use keyword-only');
      }
    }
    const embeddingTimeMs = Date.now() - embeddingStartTime;

    // STEP 3: Build federated search request
    const meiliQueries = [];

    // Add hybrid/semantic queries with embeddings
    hybridQueries.forEach((q, i) => {
      meiliQueries.push({
        query: q.query,
        limit: q.limit || 10,
        filter: this.buildFilterString(q.filters, filterTerms),
        vector: embeddings[i] || null,
        semanticRatio: q.mode === 'semantic' ? 1 : 0.5
      });
    });

    // Add keyword-only queries (no embedding needed)
    keywordQueries.forEach(q => {
      meiliQueries.push({
        query: q.query,
        limit: q.limit || 10,
        filter: this.buildFilterString(q.filters, filterTerms),
        vector: null,
        semanticRatio: 0
      });
    });

    // STEP 4: Execute federated search - returns merged, deduplicated results
    // Calculate total limit based on plan queries (cap at reasonable max)
    const totalLimit = Math.min(plan.queries.reduce((sum, q) => sum + (q.limit || 10), 0), 50);
    const meiliStartTime = Date.now();
    let hits = [];
    try {
      const result = await federatedSearch(meiliQueries, { limit: totalLimit });
      hits = result.hits;
    } catch (error) {
      this.logger.error({ error }, 'Federated search failed');
    }
    const meiliTimeMs = Date.now() - meiliStartTime;

    // STEP 5: Add metadata about which query found each result
    // Federation handles deduplication automatically!
    const resultsWithMetadata = hits.map(hit => {
      const queryPosition = hit._federation?.queriesPosition;
      // Map position back to original query (hybrid queries first, then keyword)
      const originalQuery = queryPosition < hybridQueries.length
        ? hybridQueries[queryPosition]
        : keywordQueries[queryPosition - hybridQueries.length];

      return {
        ...hit,
        _queryPosition: queryPosition,
        _searchQuery: originalQuery?.query,
        _searchMode: originalQuery?.mode
      };
    });

    const searchTimeMs = Date.now() - searchStartTime;

    this.logger.info({
      queriesExecuted: plan.queries.length,
      hybridQueries: hybridQueries.length,
      keywordQueries: keywordQueries.length,
      resultsReturned: hits.length,
      embeddingTimeMs,
      meiliTimeMs,
      searchTimeMs
    }, 'Federated search executed');

    return {
      hits: resultsWithMetadata,
      plan,
      searchTimeMs,     // Total time for all searches
      embeddingTimeMs,  // Time for batch embedding generation
      meiliTimeMs,      // Time for federated Meilisearch query
      totalHits: hits.length,
      queriesExecuted: plan.queries.length
    };
  }

  /**
   * Main search method - plans and executes
   */
  async search(query, options = {}) {
    const startTime = Date.now();

    // Create search plan
    const plan = await this.createSearchPlan(query, options);
    this.logger.info({ query, planType: plan.type, queryCount: plan.queries.length }, 'Search plan created');

    // Execute the plan
    const results = await this.executeSearchPlan(plan, options);

    const duration = Date.now() - startTime;
    this.logger.info({ query, duration, totalHits: results.totalHits }, 'Search completed');

    return {
      ...results,
      processingTimeMs: duration
    };
  }

  /**
   * Quick search - bypasses planning for simple queries
   */
  async quickSearch(query, options = {}) {
    const { limit = 10, mode = 'hybrid', filters = {} } = options;

    const searchFn = mode === 'keyword' ? keywordSearch :
                     mode === 'semantic' ? semanticSearch :
                     hybridSearch;

    return searchFn(query, { limit, filters });
  }

  /**
   * Suggest related searches based on query
   */
  async suggestRelatedSearches(query, results = []) {
    const suggestPrompt = `Based on the query "${query}" and ${results.length} results found, suggest 3 related searches that might help the user explore further.

Return JSON only:
{
  "suggestions": [
    { "query": "suggested search", "reason": "brief reason" }
  ]
}`;

    const response = await this.chat([
      { role: 'user', content: suggestPrompt }
    ], { temperature: 0.7, maxTokens: 300 });

    try {
      const result = this.parseJSON(response.content);
      return result.suggestions || [];
    } catch {
      return [];
    }
  }
}

export default ResearcherAgent;
