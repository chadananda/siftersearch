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
import { federatedSearch, batchEmbeddings, hybridSearch, keywordSearch, semanticSearch, enrichHitsWithExcerpts } from '../lib/search.js';

const RESEARCHER_SYSTEM_PROMPT = `You are designing a search strategy for an interfaith religious library. Your primary goal is to find passages that ANSWER the user's question (or implied question).

## ANSWERING QUESTIONS

Every search query—whether phrased as a question or as a topic—implies a question the user wants answered:
- "justice" → "What is justice?" or "How do the texts define justice?"
- "love in marriage" → "What is the role of love in marriage?"
- "meditation" → "How should one meditate?" or "What is meditation?"

Design searches that will surface passages containing ANSWERS: definitions, explanations, instructions, principles.

## SPIRITUAL PERSPECTIVES

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
      // Use 'fast' service for quick planning
      service: options.service || 'fast',
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
        maxResults: 10,
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

    const planPrompt = `Create a FAST search plan for: "${query}"

${traditions.length ? `Focus on traditions: ${traditions.join(', ')}` : ''}${filterContext}

GOAL: Find passages that ANSWER the question (or implied question).
- If the query is a topic like "justice", the implied question is "What is justice?"
- Design queries to find definitions, explanations, principles, and instructions.

Return JSON only:
{
  "type": "simple" | "comparative",
  "reasoning": "1-sentence strategy focusing on what ANSWER we're seeking",
  "queries": [
    {
      "query": "search string designed to find passages with answers",
      "mode": "hybrid" | "keyword",
      "filters": { "religion": "optional" }
    }
  ]
}

RULES:
- Generate 3-5 queries MAX (keep it fast)
- Use "hybrid" for conceptual, "keyword" for specific terms/names
- Include queries that target answer-containing phrases (e.g., "justice is", "the meaning of justice")
- Add religion filter only if query mentions a specific tradition
- Keep reasoning brief (1 sentence)`;

    const response = await this.chat([
      { role: 'user', content: planPrompt }
    ], { temperature: 0.3, maxTokens: 500 });

    try {
      const plan = this.parseJSON(response.content);
      // Validate and sanitize - default maxResults based on type if not specified
      const defaultMaxResults = plan.type === 'simple' ? 10 : plan.type === 'exhaustive' ? 50 : 20;
      return {
        type: plan.type || 'exhaustive',
        maxResults: plan.maxResults || defaultMaxResults,
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
        maxResults: 10,
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
    if (filters.documentId) filterParts.push(`doc_id = ${filters.documentId}`);  // INTEGER

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

    // STEP 5: Extract matching sentences from results
    // Uses Meilisearch _matchesPosition to find exactly which sentences contain matches
    // This reduces token usage when passing results to AI analysis
    hits = enrichHitsWithExcerpts(hits, {
      contextSentences: 1,  // Include 1 sentence before/after each match
      maxLength: 600        // Allow longer excerpts for multiple matches
    });

    // STEP 6: Add metadata about which query found each result
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
   * Detect if query requests exhaustive/comprehensive search
   */
  isExhaustiveQuery(query) {
    const exhaustivePatterns = [
      /\b(all|every|complete|comprehensive|thorough|exhaustive|full)\b/i,
      /\bfind all\b/i,
      /\bevery (reference|mention|passage|quote)\b/i,
      /\ball (references|mentions|passages|quotes)\b/i,
      /\bdeep dive\b/i,
      /\bcompletely\b/i
    ];
    return exhaustivePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Main search method - plans and executes
   * Automatically uses two-pass for exhaustive queries
   */
  async search(query, options = {}) {
    const startTime = Date.now();

    // Check if this is an exhaustive query that warrants two-pass search
    const forceExhaustive = options.strategy === 'exhaustive' || options.twoPass === true;
    const isExhaustive = forceExhaustive || this.isExhaustiveQuery(query);

    if (isExhaustive && options.strategy !== 'simple_search') {
      this.logger.info({ query, forceExhaustive }, 'Exhaustive query detected, using two-pass search');
      return this.exhaustiveSearch(query, options);
    }

    // Standard single-pass search
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
   * Still enriches results with excerpts for consistency
   */
  async quickSearch(query, options = {}) {
    const { limit = 10, mode = 'hybrid', filters = {} } = options;

    const searchFn = mode === 'keyword' ? keywordSearch :
                     mode === 'semantic' ? semanticSearch :
                     hybridSearch;

    const results = await searchFn(query, { limit, filters });

    // Enrich with excerpts for consistent output
    results.hits = enrichHitsWithExcerpts(results.hits, {
      contextSentences: 1,
      maxLength: 600
    });

    return results;
  }

  /**
   * Review first-pass results and create refined second-pass plan for exhaustive searches
   * @param {string} query - Original user query
   * @param {Object} firstPassPlan - The initial search plan
   * @param {Array} firstPassHits - Results from first pass
   * @param {Object} options - Search options
   */
  async createSecondPassPlan(query, firstPassPlan, firstPassHits, options = {}) {
    const { filterTerms = [] } = options;

    // Summarize what we found in first pass
    const hitsSummary = firstPassHits.slice(0, 20).map((hit, i) => ({
      index: i,
      title: hit.title,
      author: hit.author,
      religion: hit.religion,
      preview: (hit.text || '').substring(0, 150)
    }));

    const traditionsFound = [...new Set(firstPassHits.map(h => h.religion).filter(Boolean))];
    const authorsFound = [...new Set(firstPassHits.map(h => h.author).filter(Boolean))].slice(0, 10);

    const filterContext = filterTerms.length > 0
      ? `\nActive filters: ${filterTerms.join(', ')}`
      : '';

    const reviewPrompt = `You are refining a comprehensive search. Review what the first pass found and design a SECOND PASS to fill gaps and expand coverage.

ORIGINAL QUERY: "${query}"

FIRST PASS STRATEGY:
- Reasoning: ${firstPassPlan.reasoning}
- Queries executed: ${firstPassPlan.queries?.length || 0}
- Results found: ${firstPassHits.length}
${filterContext}

TRADITIONS FOUND: ${traditionsFound.join(', ') || 'None identified'}
AUTHORS FOUND: ${authorsFound.join(', ') || 'None identified'}

SAMPLE RESULTS (first 20):
${hitsSummary.map(h => `[${h.index}] "${h.title}" by ${h.author} (${h.religion}): ${h.preview}...`).join('\n')}

---

Based on these results, design a SECOND PASS that:
1. Identifies GAPS - traditions, perspectives, or angles NOT well covered
2. Explores DEEPER - specific authors, collections, or themes that appeared promising
3. Tries ALTERNATIVE framings - different terminology or conceptual approaches
4. Casts WIDER net - related concepts the results suggest but weren't explicitly searched

Return JSON only:
{
  "gaps": ["what's missing from first pass"],
  "promising": ["authors/themes/traditions worth exploring deeper"],
  "reasoning": "strategy for second pass - what we're trying to find that we missed",
  "queries": [
    {
      "query": "search string",
      "mode": "hybrid" | "semantic" | "keyword",
      "rationale": "why this fills a gap or goes deeper",
      "angle": "gap" | "deeper" | "alternative" | "wider",
      "filters": { "religion": "optional" },
      "limit": 15
    }
  ]
}

Generate 5-8 queries that COMPLEMENT (not duplicate) the first pass. Focus on what's MISSING.`;

    const response = await this.chat([
      { role: 'user', content: reviewPrompt }
    ], { temperature: 0.4, maxTokens: 1200 });

    try {
      const plan = this.parseJSON(response.content);
      return {
        type: 'second_pass',
        gaps: plan.gaps || [],
        promising: plan.promising || [],
        reasoning: plan.reasoning || 'Refined search based on first pass',
        queries: (plan.queries || []).slice(0, 8),
        isSecondPass: true
      };
    } catch (error) {
      this.logger.warn({ error, query }, 'Failed to parse second pass plan');
      return null;
    }
  }

  /**
   * Execute two-pass search for exhaustive queries
   * @param {string} query - User query
   * @param {Object} options - Search options
   */
  async exhaustiveSearch(query, options = {}) {
    const startTime = Date.now();

    // PASS 1: Initial exploration
    this.logger.info({ query }, 'Starting two-pass exhaustive search - Pass 1');
    const firstPassPlan = await this.createSearchPlan(query, { ...options, strategy: 'complex_search' });
    firstPassPlan.twoPass = true;
    firstPassPlan.pass = 1;

    const firstPassResults = await this.executeSearchPlan(firstPassPlan, options);
    const pass1TimeMs = Date.now() - startTime;

    this.logger.info({
      query,
      pass1Hits: firstPassResults.hits.length,
      pass1TimeMs
    }, 'Pass 1 complete, analyzing for gaps');

    // PASS 2: Refined search based on what we found
    const pass2StartTime = Date.now();
    const secondPassPlan = await this.createSecondPassPlan(
      query,
      firstPassPlan,
      firstPassResults.hits,
      options
    );

    if (!secondPassPlan || !secondPassPlan.queries?.length) {
      this.logger.info({ query }, 'No second pass needed or failed to generate');
      return {
        ...firstPassResults,
        plan: { ...firstPassPlan, twoPass: true, secondPassSkipped: true },
        processingTimeMs: Date.now() - startTime
      };
    }

    const secondPassResults = await this.executeSearchPlan(secondPassPlan, options);
    const pass2TimeMs = Date.now() - pass2StartTime;

    // Merge and deduplicate results from both passes
    const seenIds = new Set();
    const mergedHits = [];

    // First pass results first (they're already ranked)
    for (const hit of firstPassResults.hits) {
      if (!seenIds.has(hit.id)) {
        seenIds.add(hit.id);
        mergedHits.push({ ...hit, _pass: 1 });
      }
    }

    // Then second pass results
    for (const hit of secondPassResults.hits) {
      if (!seenIds.has(hit.id)) {
        seenIds.add(hit.id);
        mergedHits.push({ ...hit, _pass: 2 });
      }
    }

    const totalTimeMs = Date.now() - startTime;

    this.logger.info({
      query,
      pass1Hits: firstPassResults.hits.length,
      pass2Hits: secondPassResults.hits.length,
      mergedHits: mergedHits.length,
      pass1TimeMs,
      pass2TimeMs,
      totalTimeMs
    }, 'Two-pass exhaustive search complete');

    // Combine plans for display
    const combinedPlan = {
      ...firstPassPlan,
      twoPass: true,
      pass1: {
        reasoning: firstPassPlan.reasoning,
        queries: firstPassPlan.queries,
        hits: firstPassResults.hits.length
      },
      pass2: {
        gaps: secondPassPlan.gaps,
        promising: secondPassPlan.promising,
        reasoning: secondPassPlan.reasoning,
        queries: secondPassPlan.queries,
        hits: secondPassResults.hits.length
      },
      planningTimeMs: (firstPassResults.planningTimeMs || 0) + pass2TimeMs,
      pass1TimeMs,
      pass2TimeMs
    };

    return {
      hits: mergedHits,
      plan: combinedPlan,
      searchTimeMs: firstPassResults.searchTimeMs + secondPassResults.searchTimeMs,
      embeddingTimeMs: (firstPassResults.embeddingTimeMs || 0) + (secondPassResults.embeddingTimeMs || 0),
      meiliTimeMs: (firstPassResults.meiliTimeMs || 0) + (secondPassResults.meiliTimeMs || 0),
      totalHits: mergedHits.length,
      queriesExecuted: firstPassPlan.queries.length + secondPassPlan.queries.length,
      processingTimeMs: totalTimeMs
    };
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
