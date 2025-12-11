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
import { hybridSearch, keywordSearch, semanticSearch } from '../lib/search.js';

const RESEARCHER_SYSTEM_PROMPT = `You are a research strategist for an interfaith library search system. Your job is to analyze user queries and determine the optimal search strategy.

QUERY TYPES:

1. SIMPLE/DIRECT - Single search sufficient
   - "What does Baha'u'llah say about justice?"
   - "Find prayers for healing"
   - "Quotes about love"
   Strategy: One hybrid search with the query as-is

2. CONCEPT EXPLORATION - Multiple related searches
   - "What is the purpose of life?"
   - "Teachings about the soul"
   Strategy: 2-3 searches with related terms/synonyms

3. CROSS-TRADITION COMPARISON - Tradition-specific searches
   - "Compare Baha'i and Buddhist teachings on suffering"
   - "How do different religions view the afterlife?"
   Strategy: Separate searches per tradition, then merge

4. DEEP DIVE - Comprehensive exploration
   - "Everything about Abdu'l-Baha's travels to America"
   - "All teachings on education"
   Strategy: Multiple searches with variations, broader and narrower terms

5. SPECIFIC REFERENCE - Targeted lookup
   - "Quote from Hidden Words about detachment"
   - "What Shoghi Effendi wrote about administration"
   Strategy: Keyword search targeting specific works/authors

SEARCH MODES:
- hybrid: Best for most queries (combines semantic + keyword)
- semantic: Best for conceptual/meaning-based queries
- keyword: Best for specific phrases, names, titles

OUTPUT:
Return a search plan with 1-5 queries, each with mode and optional filters.`;

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
   */
  async createSearchPlan(query, options = {}) {
    const { strategy = 'auto', traditions = [] } = options;

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
    const planPrompt = `Create a search plan for this query: "${query}"

${traditions.length ? `Focus on traditions: ${traditions.join(', ')}` : ''}
${strategy === 'complex_search' ? 'Use a comprehensive multi-query approach.' : 'Choose the simplest effective approach.'}

Return JSON only:
{
  "type": "simple" | "multi" | "comparative",
  "reasoning": "brief explanation",
  "queries": [
    {
      "query": "search string",
      "mode": "hybrid" | "semantic" | "keyword",
      "limit": 10,
      "filters": { "religion": "optional", "author": "optional" }
    }
  ]
}

Max 5 queries. Most queries need only 1-2 searches.`;

    const response = await this.chat([
      { role: 'user', content: planPrompt }
    ], { temperature: 0.2, maxTokens: 600 });

    try {
      const plan = this.parseJSON(response.content);
      // Validate and sanitize
      return {
        type: plan.type || 'simple',
        reasoning: plan.reasoning || '',
        queries: (plan.queries || [{ query, mode: 'hybrid', limit: 10 }]).slice(0, 5)
      };
    } catch (error) {
      this.logger.warn({ error, query }, 'Failed to parse search plan, using simple strategy');
      return {
        type: 'simple',
        reasoning: 'Fallback to simple search',
        queries: [{ query, mode: 'hybrid', limit: options.limit || 10 }]
      };
    }
  }

  /**
   * Execute a search plan and return combined results
   */
  async executeSearchPlan(plan, _options = {}) {
    const allResults = [];
    const seenIds = new Set();

    for (const searchQuery of plan.queries) {
      // Select search function
      let searchFn;
      switch (searchQuery.mode) {
        case 'keyword':
          searchFn = keywordSearch;
          break;
        case 'semantic':
          searchFn = semanticSearch;
          break;
        default:
          searchFn = hybridSearch;
      }

      try {
        const results = await searchFn(searchQuery.query, {
          limit: searchQuery.limit || 10,
          filters: searchQuery.filters || {}
        });

        // Deduplicate results
        for (const hit of results.hits || []) {
          if (!seenIds.has(hit.id)) {
            seenIds.add(hit.id);
            allResults.push({
              ...hit,
              _searchQuery: searchQuery.query,
              _searchMode: searchQuery.mode
            });
          }
        }
      } catch (error) {
        this.logger.error({ error, searchQuery }, 'Search query failed');
      }
    }

    return {
      hits: allResults,
      plan,
      totalHits: allResults.length,
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
