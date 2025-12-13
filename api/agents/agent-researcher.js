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

const RESEARCHER_SYSTEM_PROMPT = `You are designing a search strategy for an interfaith research query. Your goal is to create an exhaustive plan that uncovers ALL relevant perspectives, especially unexpected or counterintuitive teachings.

Create a comprehensive search strategy following these principles:

1. **Challenge Assumptions** - What obvious answers might we expect? List them, then design searches specifically to find teachings that contradict or complicate these expectations.

2. **Cross-Traditional Coverage** - Ensure searches span multiple religious/spiritual traditions. Don't assume which traditions are relevant - cast a wide net.

3. **Multiple Angles** - Break the query into conceptual facets:
   - Direct teachings on the topic
   - Related metaphors, parables, or symbolic teachings
   - Historical/cultural context that shaped the teachings
   - Practical applications or ethical implications
   - Paradoxes or tensions within traditions
   - Evolution of thought across time periods

4. **Unexpected Connections** - What tangential topics might reveal surprising insights? Look for:
   - Concepts that seem unrelated but share deep connections
   - Minority voices or less-studied texts within traditions
   - Teachings that appear contradictory on the surface
   - Modern interpretations vs historical understandings

5. **Keyword Diversity** - Generate search terms that include:
   - Literal terminology
   - Synonyms and related concepts
   - Traditional/scriptural language
   - Modern scholarly framing
   - Metaphorical language

SEARCH MODES:
- hybrid: Best for most queries (combines semantic + keyword)
- semantic: Best for conceptual/meaning-based queries
- keyword: Best for specific phrases, names, titles

Remember: The most valuable insights often come from what we DON'T expect to find. Design searches to prove yourself wrong, not right.`;

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
${strategy === 'complex_search' ? 'Use a comprehensive multi-query approach.' : ''}

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
      "limit": 10
    }
  ],
  "traditions": ["traditions this plan covers"],
  "surprises": ["unexpected findings to watch for"],
  "followUp": ["suggested next searches based on likely findings"]
}

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
