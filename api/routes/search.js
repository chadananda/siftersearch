/**
 * Search API Routes
 *
 * POST /api/search - Main hybrid search
 * POST /api/search/analyze - AI-powered analysis of search results
 * GET /api/search/stats - Index statistics
 * GET /api/search/health - Search health check
 */

import { hybridSearch, keywordSearch, semanticSearch, getStats, healthCheck } from '../lib/search.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version: serverVersion } = require('../../package.json');
import { aiService } from '../lib/ai-services.js';
import { logger } from '../lib/logger.js';
import { ResearcherAgent } from '../agents/agent-researcher.js';
import { checkQueryLimit, incrementSearchCount, incrementUserSearchCount, getAnonymousUserId } from '../lib/anonymous.js';
import { ApiError } from '../lib/errors.js';
import { MemoryAgent } from '../agents/agent-memory.js';
import { getCachedSearch, setCachedSearch } from '../lib/search-cache.js';
import { analyzePassagesParallel, getOptimalPassageCount } from '../lib/parallel-analyzer.js';

// Helper function to parse parenthetical filter terms from query
/**
 * Parse parenthetical filter terms from a query string.
 * Example: "what is justice (shoghi, pilgrim)" returns:
 *   { cleanQuery: "what is justice", filterTerms: ["shoghi", "pilgrim"] }
 *
 * Filter terms are used to match against author, collection, or title fields (case insensitive).
 */
function parseQueryFilters(query) {
  // Match content in parentheses at the end of the query
  const parenMatch = query.match(/\(([^)]+)\)\s*$/);

  if (!parenMatch) {
    return { cleanQuery: query.trim(), filterTerms: [] };
  }

  // Extract filter terms (comma-separated)
  const filterTerms = parenMatch[1]
    .split(',')
    .map(term => term.trim().toLowerCase())
    .filter(term => term.length > 0);

  // Remove the parenthetical from the query
  const cleanQuery = query.replace(/\(([^)]+)\)\s*$/, '').trim();

  return { cleanQuery, filterTerms };
}

/**
 * Build Meilisearch filter string for author/collection/title containing any of the filter terms.
 * Uses OR logic: matches if author OR collection OR title contains any term.
 */
function buildMetadataFilter(filterTerms, existingFilters = {}) {
  const filterParts = [];

  // Add existing filters
  if (existingFilters.religion) filterParts.push(`religion = "${existingFilters.religion}"`);
  if (existingFilters.collection) filterParts.push(`collection = "${existingFilters.collection}"`);
  if (existingFilters.language) filterParts.push(`language = "${existingFilters.language}"`);
  if (existingFilters.yearFrom) filterParts.push(`year >= ${existingFilters.yearFrom}`);
  if (existingFilters.yearTo) filterParts.push(`year <= ${existingFilters.yearTo}`);
  if (existingFilters.documentId) filterParts.push(`document_id = "${existingFilters.documentId}"`);

  // Add text-based filters for author/collection/title
  // Meilisearch uses CONTAINS operator for partial text matching
  if (filterTerms.length > 0) {
    const textFilters = [];
    for (const term of filterTerms) {
      // Match against author, collection, or title (case insensitive in Meilisearch)
      textFilters.push(`author CONTAINS "${term}"`);
      textFilters.push(`collection CONTAINS "${term}"`);
      textFilters.push(`title CONTAINS "${term}"`);
    }
    // Join with OR - any match is acceptable
    filterParts.push(`(${textFilters.join(' OR ')})`);
  }

  return filterParts.length > 0 ? filterParts.join(' AND ') : undefined;
}

// Helper functions for anchor-based sentence matching

/**
 * Normalize text for fuzzy matching - lowercase, collapse whitespace, remove punctuation
 */
function normalizeForMatch(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

/**
 * Normalize a word for comparison - handles contractions, possessives
 */
function normalizeWord(word) {
  return word.toLowerCase()
    .replace(/['']/g, '')  // Remove apostrophes (it's → its, God's → Gods)
    .replace(/[^\w]/g, ''); // Remove other non-word chars
}

/**
 * Find position in original text that matches normalized anchor
 * Returns { start, end } or -1 if not found
 *
 * Strategy: Extract all words from text with their positions,
 * then find the anchor word sequence within those words.
 */
function findAnchorPosition(text, anchor, searchFrom = 0) {
  // Normalize the anchor and extract words
  const anchorWords = anchor.split(/\s+/)
    .map(w => normalizeWord(w))
    .filter(w => w.length > 0);
  if (anchorWords.length === 0) return -1;

  // Extract all words from text with their start/end positions
  // Match word characters plus apostrophes for contractions
  const wordRegex = /[\w']+/g;
  const words = [];
  let match;
  while ((match = wordRegex.exec(text)) !== null) {
    if (match.index >= searchFrom) {
      words.push({
        word: normalizeWord(match[0]),
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }

  // Find anchor sequence in words
  for (let i = 0; i <= words.length - anchorWords.length; i++) {
    let matches = true;
    for (let j = 0; j < anchorWords.length; j++) {
      if (words[i + j].word !== anchorWords[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return {
        start: words[i].start,
        end: words[i + anchorWords.length - 1].end
      };
    }
  }

  return -1;
}

/**
 * Find sentence in text using start and end anchors (fuzzy matching)
 */
function findSentenceByAnchors(text, startAnchor, endAnchor) {
  if (!startAnchor || !endAnchor) return null;

  const startMatch = findAnchorPosition(text, startAnchor, 0);
  if (startMatch === -1) return null;

  const endMatch = findAnchorPosition(text, endAnchor, startMatch.end);
  if (endMatch === -1) return null;

  // Include trailing punctuation (.,;:!?"') after the end match
  let endPos = endMatch.end;
  while (endPos < text.length && /[.,;:!?"')}\]]/.test(text[endPos])) {
    endPos++;
  }

  // Sanity check: sentence shouldn't be too long (max 800 chars)
  if (endPos - startMatch.start > 800) return null;

  return {
    start: startMatch.start,
    end: endPos,
    text: text.substring(startMatch.start, endPos)
  };
}


export default async function searchRoutes(fastify) {
  // Main search endpoint
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          mode: { type: 'string', enum: ['hybrid', 'keyword', 'semantic'], default: 'hybrid' },
          semanticRatio: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
          filters: {
            type: 'object',
            properties: {
              religion: { type: 'string' },
              collection: { type: 'string' },
              language: { type: 'string' },
              yearFrom: { type: 'integer' },
              yearTo: { type: 'integer' },
              documentId: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const {
      query,
      limit = 20,
      offset = 0,
      mode = 'hybrid',
      semanticRatio = 0.5,
      filters = {}
    } = request.body;

    // Select search function based on mode
    let searchFn;
    switch (mode) {
      case 'keyword':
        searchFn = keywordSearch;
        break;
      case 'semantic':
        searchFn = semanticSearch;
        break;
      default:
        searchFn = hybridSearch;
    }

    const results = await searchFn(query, {
      limit,
      offset,
      filters,
      semanticRatio
    });

    return {
      ...results,
      mode,
      filters
    };
  });

  // Fast keyword-only search (no auth required, rate limited)
  fastify.get('/quick', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
        }
      }
    }
  }, async (request) => {
    const { q, limit = 10 } = request.query;

    const results = await keywordSearch(q, { limit });

    return {
      hits: results.hits.map(hit => ({
        id: hit.id,
        text: hit._formatted?.text || hit.text,
        title: hit.title,
        author: hit.author,
        score: hit._rankingScore
      })),
      query: q,
      processingTimeMs: results.processingTimeMs
    };
  });

  // Index statistics
  fastify.get('/stats', async () => {
    const stats = await getStats();
    return {
      ...stats,
      serverVersion
    };
  });

  // Health check
  fastify.get('/health', async () => {
    const health = await healthCheck();
    return health;
  });

  // AI-powered analysis of search results
  fastify.post('/analyze', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          mode: { type: 'string', enum: ['hybrid', 'keyword', 'semantic'], default: 'hybrid' }
        }
      }
    }
  }, async (request) => {
    const { query, limit = 10, mode = 'hybrid' } = request.body;

    // First, search for relevant passages
    const searchFn = mode === 'keyword' ? keywordSearch : mode === 'semantic' ? semanticSearch : hybridSearch;
    const searchResults = await searchFn(query, { limit });

    if (!searchResults.hits || searchResults.hits.length === 0) {
      return {
        analysis: 'No relevant passages found to analyze for your query.',
        sources: [],
        query
      };
    }

    // Build context from search results
    const contextTexts = searchResults.hits.map((hit, i) => {
      const text = hit.text || hit._formatted?.text || '';
      const title = hit.title || 'Untitled';
      const author = hit.author || 'Unknown';
      return `[${i + 1}] "${title}" by ${author}:\n${text}`;
    }).join('\n\n---\n\n');

    // Create analysis prompt - AI decides how to respond based on query type
    const systemPrompt = `You are Sifter, a scholarly assistant for SifterSearch, an interfaith library.
Your role is to help users FIND passages - not to summarize or analyze them unless explicitly asked.

CRITICAL: Keep responses BRIEF. Your job is to introduce and point to sources, not to explain them.

IMPORTANT: The passages are ALREADY SORTED BY RELEVANCE. [1] is the most relevant, [2] is second most relevant, etc.
Do NOT say things like "most relevant are [3] and [6]" - the order already reflects relevance.

SEMANTIC AWARENESS - CRITICAL:
Key terms often carry multiple philosophical meanings users may not distinguish. If passages reveal different conceptualizations:
- "equality" → rights vs outcomes vs nature vs dignity
- "freedom" → from constraint vs to act vs spiritual vs political
- "justice" → retributive vs restorative vs distributive vs divine
- "love" → divine vs human vs duty vs emotion
If you notice passages using a term in DIFFERENT SENSES, briefly note this to help users see the landscape of meaning. Example: "These passages explore justice in different senses - some focus on divine justice, others on social justice."

Response guidelines:
- Give a 1-2 sentence introduction that orients the user to what was found
- If key terms appear in distinctly different senses, note this briefly
- Reference passages by citation numbers [1], [2], etc.
- Let the passages speak for themselves - don't paraphrase or summarize their content
- Since [1] is already most relevant, just say "I found X passages about [topic]" without picking favorites

For most queries:
- "I found X passages about [topic] from various traditions."
- Keep it short - users can read the passages themselves
- You can mention which traditions/collections are represented

Only provide longer analysis when the user specifically requests:
- "Summarize these passages"
- "Explain what these mean"
- "Compare these teachings"

Never make up quotes - only reference what's in the provided passages.`;

    const userPrompt = `User query: "${query}"

PASSAGES FROM SEARCH (ALREADY SORTED BY RELEVANCE - [1] is most relevant):
${contextTexts}

Provide a BRIEF introduction (1-2 sentences). Remember: passages are already sorted by relevance, so [1] is most relevant.`;

    try {
      // Use AI to analyze the results
      const aiResponse = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.7,
        maxTokens: 1500
      });

      logger.info({ query, hitsAnalyzed: searchResults.hits.length }, 'Analysis completed');

      return {
        analysis: aiResponse.content,
        sources: searchResults.hits.map(hit => ({
          id: hit.id,
          text: hit._formatted?.text || hit.text,
          title: hit.title,
          author: hit.author,
          collection: hit.collection || hit.religion
        })),
        query,
        processingTimeMs: searchResults.processingTimeMs,
        model: aiResponse.model
      };
    } catch (err) {
      logger.error({ err, query }, 'Analysis failed');

      // Fallback: return search results without AI analysis
      return {
        analysis: `I found ${searchResults.hits.length} relevant passages but couldn't generate an analysis at this time. Please review the sources below.`,
        sources: searchResults.hits.map(hit => ({
          id: hit.id,
          text: hit._formatted?.text || hit.text,
          title: hit.title,
          author: hit.author,
          collection: hit.collection || hit.religion
        })),
        query,
        processingTimeMs: searchResults.processingTimeMs,
        error: 'AI analysis unavailable'
      };
    }
  });

  // Streaming AI-powered analysis of search results
  fastify.post('/analyze/stream', {
    schema: {
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          mode: { type: 'string', enum: ['hybrid', 'keyword', 'semantic'], default: 'hybrid' },
          useResearcher: { type: 'boolean', default: true }
        }
      }
    },
    preHandler: optionalAuthenticate
  }, async (request, reply) => {
    const { query: rawQuery, limit = 10, mode = 'hybrid', useResearcher = true } = request.body;

    // Check query limit before processing
    const limitCheck = await checkQueryLimit(request);
    if (!limitCheck.allowed) {
      // Return error as SSE for consistency
      reply.raw.writeHead(402, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      reply.raw.write('data: ' + JSON.stringify({
        type: 'error',
        error: 'query_limit_exceeded',
        message: limitCheck.reason,
        isAuthenticated: limitCheck.isAuthenticated,
        limit: limitCheck.limit
      }) + '\n\n');
      reply.raw.end();
      return;
    }

    // Parse parenthetical filter terms from query
    const { cleanQuery, filterTerms } = parseQueryFilters(rawQuery);
    const query = cleanQuery; // Use cleaned query for search

    if (filterTerms.length > 0) {
      logger.info({ rawQuery, cleanQuery, filterTerms }, 'Parsed query filters');
    }

    // Check cache first (only for queries without filter terms for now)
    if (filterTerms.length === 0) {
      const cached = await getCachedSearch(query);
      if (cached) {
        // Set up SSE and send cached response
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        // Send plan if available
        if (cached.plan) {
          reply.raw.write('data: ' + JSON.stringify({ type: 'plan', plan: { ...cached.plan, cached: true } }) + '\n\n');
        }

        // Send sources
        reply.raw.write('data: ' + JSON.stringify({ type: 'sources', sources: cached.sources }) + '\n\n');

        // Send analysis intro
        reply.raw.write('data: ' + JSON.stringify({ type: 'chunk', text: cached.intro }) + '\n\n');

        // Send completion with cache info
        reply.raw.write('data: ' + JSON.stringify({
          type: 'complete',
          cached: true,
          cacheAge: cached.cacheAge,
          queryLimit: {
            remaining: Math.max(0, limitCheck.remaining - 1),
            limit: limitCheck.limit,
            isAuthenticated: limitCheck.isAuthenticated
          }
        }) + '\n\n');
        reply.raw.end();

        // Still count the query for rate limiting
        if (limitCheck.isAuthenticated && request.user?.sub) {
          await incrementUserSearchCount(request.user.sub);
        } else {
          const anonymousUserId = getAnonymousUserId(request);
          if (anonymousUserId) {
            await incrementSearchCount(anonymousUserId, query);
          }
        }

        logger.info({ query, cacheAge: cached.cacheAge }, 'Served from cache');
        return;
      }
    }

    // Get user ID for memory and context
    const userId = request.user?.sub?.toString() || getAnonymousUserId(request);

    // Initialize Memory agent and fetch user context
    const memory = new MemoryAgent();
    let userContext = null;
    let relevantMemories = [];

    if (userId) {
      try {
        // Fetch user profile and relevant memories in parallel
        const [profile, memories] = await Promise.all([
          memory.getUserProfile(userId),
          memory.searchMemories(userId, query, 3) // Get 3 most relevant past conversations
        ]);
        userContext = profile;
        relevantMemories = memories;

        if (relevantMemories.length > 0) {
          logger.info({ userId, memoryCount: relevantMemories.length }, 'Found relevant past conversations');
        }
      } catch (memErr) {
        logger.warn({ memErr, userId }, 'Failed to fetch user context, continuing without');
      }
    }

    // Detect if this will be a complex/exhaustive search BEFORE starting
    const researcher = new ResearcherAgent();
    const isExhaustive = researcher.isExhaustiveQuery(query);

    // Set up SSE response EARLY so we can send conversational feedback
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send AI-generated conversational acknowledgment for complex queries
    // Sifter's personality: questions assumptions, seeks deeper spiritual perspectives
    if (isExhaustive) {
      try {
        const ackPrompt = `You are Sifter, a scholarly assistant for an interfaith library. A user has asked a comprehensive question that will require thorough exploration.

USER QUERY: "${query}"

Generate a brief (1-2 sentence) conversational acknowledgment that:
1. Shows genuine interest in their question
2. Hints that you'll be looking at multiple perspectives and angles
3. Reflects that sometimes the framing of a question matters as much as the answer
4. Feels natural and conversational, not formulaic

Do NOT:
- Use generic phrases like "Great question!" or "That's fascinating!"
- Sound robotic or templated
- Lecture or preach
- Make it too long

Just respond with the acknowledgment, nothing else.`;

        const ackResponse = await aiService.chat([
          { role: 'user', content: ackPrompt }
        ], {
          model: config.ai.search.model, // Fast model for quick response
          temperature: 0.8,
          maxTokens: 100
        });

        const ack = ackResponse.content?.trim() || '';
        if (ack) {
          reply.raw.write('data: ' + JSON.stringify({ type: 'thinking', message: ack, isExhaustive: true }) + '\n\n');
          logger.info({ query, isExhaustive, ack }, 'Sent AI-generated acknowledgment');
        }
      } catch (ackError) {
        // Don't fail the search if acknowledgment generation fails
        logger.warn({ ackError }, 'Failed to generate acknowledgment, continuing with search');
      }
    }

    let searchResults;
    let researchPlan = null;

    if (useResearcher) {
      // Use ResearcherAgent for intelligent search planning
      // The search method auto-detects exhaustive queries and uses two-pass when needed
      const planStartTime = Date.now();

      // Stream progress during two-pass search
      if (isExhaustive) {
        // First pass
        reply.raw.write('data: ' + JSON.stringify({ type: 'progress', phase: 'pass1', message: 'Exploring initial search strategies...' }) + '\n\n');
      }

      // Use the main search method which handles two-pass detection
      searchResults = await researcher.search(query, { limit, filterTerms });
      const planningTimeMs = Date.now() - planStartTime;

      // If two-pass was used, send completion of passes
      if (searchResults.plan?.twoPass) {
        reply.raw.write('data: ' + JSON.stringify({
          type: 'progress',
          phase: 'complete',
          message: `Found ${searchResults.hits.length} passages across ${searchResults.queriesExecuted} search queries`
        }) + '\n\n');
      }

      const plan = searchResults.plan;

      // Build research plan for UI display
      researchPlan = {
        type: plan.type,
        twoPass: plan.twoPass || false,
        assumptions: plan.assumptions || [],
        reasoning: plan.reasoning,
        queries: (plan.queries || []).map(q => ({
          query: q.query,
          mode: q.mode,
          rationale: q.rationale || '',
          angle: q.angle || 'direct',
          filters: q.filters || {}
        })),
        traditions: plan.traditions || [],
        surprises: plan.surprises || [],
        followUp: plan.followUp || [],
        filterTerms, // Include parsed filter terms in plan
        maxResults: plan.maxResults || 20,
        // Two-pass details if applicable
        ...(plan.twoPass && plan.pass1 && {
          pass1: {
            reasoning: plan.pass1.reasoning,
            queries: plan.pass1.queries?.length || 0,
            hits: plan.pass1.hits || 0
          },
          pass2: plan.pass2 ? {
            gaps: plan.pass2.gaps || [],
            promising: plan.pass2.promising || [],
            reasoning: plan.pass2.reasoning,
            queries: plan.pass2.queries?.length || 0,
            hits: plan.pass2.hits || 0
          } : null,
          pass1TimeMs: plan.pass1TimeMs,
          pass2TimeMs: plan.pass2TimeMs
        }),
        // Timing metrics
        planningTimeMs,
        searchTimeMs: searchResults.searchTimeMs || 0,
        embeddingTimeMs: searchResults.embeddingTimeMs || 0,
        meiliTimeMs: searchResults.meiliTimeMs || 0
      };

      logger.info({
        query,
        planType: plan.type,
        twoPass: plan.twoPass || false,
        queryCount: plan.queries?.length || 0,
        filterTerms,
        planningTimeMs,
        searchTimeMs: searchResults.searchTimeMs,
        embeddingTimeMs: searchResults.embeddingTimeMs,
        meiliTimeMs: searchResults.meiliTimeMs
      }, 'Research plan created and executed');
    } else {
      // Direct search without researcher - apply filter terms directly
      const searchFn = mode === 'keyword' ? keywordSearch : mode === 'semantic' ? semanticSearch : hybridSearch;
      const filterString = buildMetadataFilter(filterTerms, {});
      searchResults = await searchFn(query, { limit, filter: filterString });
    }

    if (!searchResults.hits || searchResults.hits.length === 0) {
      // SSE already set up, just send the completion
      reply.raw.write('data: ' + JSON.stringify({
        type: 'complete',
        analysis: 'No relevant passages found to analyze for your query.',
        sources: []
      }) + '\n\n');
      reply.raw.end();
      return;
    }

    // Send research plan if available
    if (researchPlan) {
      reply.raw.write('data: ' + JSON.stringify({ type: 'plan', plan: researchPlan }) + '\n\n');
    }

    // Determine optimal passage counts based on query complexity
    const planType = researchPlan?.type || 'simple';
    const { toAnalyze, toReturn } = getOptimalPassageCount(query, planType);

    // Build context for analyzer - include hit id for tracking
    const analyzerInputLimit = Math.min(searchResults.hits.length, toAnalyze);
    const passagesForAnalysis = searchResults.hits.slice(0, analyzerInputLimit).map((hit, i) => ({
      index: i,
      id: hit.id,
      document_id: hit.document_id,
      paragraph_index: hit.paragraph_index,
      text: hit.text || hit._formatted?.text || '',
      title: hit.title || 'Untitled',
      author: hit.author || 'Unknown',
      religion: hit.religion || '',
      collection: hit.collection || '',
      _searchQuery: hit._searchQuery // Which search query found this
    }));

    // Build research context string for parallel analyzer
    const researchContext = researchPlan
      ? `Strategy: ${researchPlan.reasoning || 'Standard search'}. Looking for: ${researchPlan.assumptions?.slice(0, 2).join(', ') || 'relevant passages'}`
      : '';

    try {
      // PARALLEL ANALYSIS: Split passages into batches and analyze concurrently
      // This reduces analysis time from ~15-20s to ~3-5s
      const analyzerStartTime = Date.now();

      const analysis = await analyzePassagesParallel(query, passagesForAnalysis, {
        researchContext,
        batchSize: 2,
        maxConcurrent: 10
      });

      const analyzerTimeMs = Date.now() - analyzerStartTime;

      // Build enhanced sources - parallel analyzer already handles highlighting
      // highlightedText contains: excerpt with <mark> for key phrase, <b> for core terms
      const enhancedSources = analysis.results.map(result => {
        const originalHit = searchResults.hits[result.globalIndex];
        if (!originalHit) return null;

        return {
          id: originalHit.id,
          document_id: originalHit.document_id,
          paragraph_index: originalHit.paragraph_index,
          text: originalHit.text,
          title: originalHit.title,
          author: originalHit.author,
          religion: originalHit.religion,
          collection: originalHit.collection || originalHit.religion,
          summary: result.summary || result.briefAnswer || '',
          score: result.score || 0,
          highlightedText: result.highlightedText || originalHit.text,
          keyPhrase: result.keyPhrase || '',
          coreTerms: result.coreTerms || []
        };
      }).filter(Boolean);

      // Cap at toReturn (already sorted by score from parallel analyzer)
      const cappedSources = enhancedSources.slice(0, toReturn);

      // Send enhanced sources
      reply.raw.write('data: ' + JSON.stringify({ type: 'sources', sources: cappedSources }) + '\n\n');

      // Send introduction (with semantic note if present)
      let intro = analysis.introduction || `Found ${cappedSources.length} relevant passages for your query.`;
      if (analysis.semanticNote) {
        intro += '\n\n' + analysis.semanticNote;
      }
      reply.raw.write('data: ' + JSON.stringify({ type: 'chunk', text: intro }) + '\n\n');

      // Send completion with timing metrics
      const remainingQueries = limitCheck.remaining - 1;
      reply.raw.write('data: ' + JSON.stringify({
        type: 'complete',
        timing: {
          analyzerTimeMs,
          ...analysis.timing
        },
        queryLimit: {
          remaining: Math.max(0, remainingQueries),
          limit: limitCheck.limit,
          isAuthenticated: limitCheck.isAuthenticated
        }
      }) + '\n\n');
      reply.raw.end();

      // Increment search count
      if (limitCheck.isAuthenticated && request.user?.sub) {
        await incrementUserSearchCount(request.user.sub);
      } else {
        const anonymousUserId = getAnonymousUserId(request);
        if (anonymousUserId) {
          await incrementSearchCount(anonymousUserId, query);
        }
      }

      // Cache the results for future identical queries (skip if filter terms used)
      if (filterTerms.length === 0) {
        try {
          await setCachedSearch(query, {
            plan: researchPlan,
            sources: cappedSources,
            intro
          });
        } catch (cacheErr) {
          logger.warn({ cacheErr, query }, 'Failed to cache search results');
        }
      }

      // Store this interaction in memory for future context
      if (userId) {
        try {
          await memory.storeMemory(userId, 'user', query, {
            isSearch: true,
            resultsCount: cappedSources.length
          });

          if (intro) {
            await memory.storeMemory(userId, 'assistant', intro, {
              isSearch: true,
              resultsCount: cappedSources.length,
              topSources: cappedSources.slice(0, 3).map(s => ({ title: s.title, author: s.author }))
            });
          }
        } catch (memErr) {
          logger.warn({ memErr, userId }, 'Failed to store search in memory');
        }
      }

      logger.info({
        query,
        planType,
        hitsAnalyzed: analyzerInputLimit,
        resultsReturned: cappedSources.length,
        toAnalyze,
        toReturn,
        analyzerTimeMs,
        parallelBatches: analysis.timing?.batchCount || 0,
        remainingQueries
      }, 'Parallel analysis completed');

    } catch (err) {
      logger.error({ err, query }, 'Streaming analysis failed');
      reply.raw.write('data: ' + JSON.stringify({
        type: 'error',
        message: 'AI analysis unavailable'
      }) + '\n\n');
      reply.raw.end();
    }
  });
}
