/**
 * Search API Routes
 *
 * POST /api/search - Main hybrid search
 * POST /api/search/analyze - AI-powered analysis of search results
 * GET /api/search/stats - Index statistics
 * GET /api/search/health - Search health check
 */

import { hybridSearch, keywordSearch, semanticSearch, getStats, healthCheck } from '../lib/search.js';
import { authenticate } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { ai } from '../lib/ai.js';
import { logger } from '../lib/logger.js';
import { ResearcherAgent } from '../agents/agent-researcher.js';

// Helper functions for anchor-based sentence matching

/**
 * Normalize text for fuzzy matching - lowercase, collapse whitespace, remove punctuation
 */
function normalizeForMatch(str) {
  return str.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

/**
 * Find position in original text that matches normalized anchor
 * Returns { start, end } or -1 if not found
 */
function findAnchorPosition(text, anchor, searchFrom = 0) {
  const normalizedAnchor = normalizeForMatch(anchor);
  const anchorWords = normalizedAnchor.split(' ').filter(w => w.length > 0);
  if (anchorWords.length === 0) return -1;

  const textLower = text.toLowerCase();
  let pos = searchFrom;

  while (pos < text.length) {
    // Find first word
    const firstWordPos = textLower.indexOf(anchorWords[0], pos);
    if (firstWordPos === -1) return -1;

    // Check if remaining words follow
    let matchStart = firstWordPos;
    let matchEnd = firstWordPos;
    let wordIdx = 0;
    let checkPos = firstWordPos;

    while (wordIdx < anchorWords.length && checkPos < text.length) {
      // Skip non-word characters
      while (checkPos < text.length && /[\s\W]/.test(text[checkPos])) {
        checkPos++;
      }

      // Extract word at current position
      let wordEnd = checkPos;
      while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
        wordEnd++;
      }

      const word = text.substring(checkPos, wordEnd).toLowerCase();

      if (word === anchorWords[wordIdx]) {
        if (wordIdx === 0) matchStart = checkPos;
        matchEnd = wordEnd;
        wordIdx++;
        checkPos = wordEnd;
      } else if (wordIdx === 0) {
        break;
      } else {
        break;
      }
    }

    if (wordIdx === anchorWords.length) {
      return { start: matchStart, end: matchEnd };
    }

    pos = firstWordPos + 1;
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

  // Sanity check: sentence shouldn't be too long (max 800 chars)
  if (endMatch.end - startMatch.start > 800) return null;

  return {
    start: startMatch.start,
    end: endMatch.end,
    text: text.substring(startMatch.start, endMatch.end)
  };
}

/**
 * Fallback highlighting using keywords when anchor matching fails.
 * Finds the first sentence containing any keyword and highlights it.
 */
function fallbackKeywordHighlight(text, keyWords) {
  if (!keyWords || keyWords.length === 0) return null;

  // Split into sentences (rough heuristic)
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Find first sentence containing a keyword
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceLower = sentence.toLowerCase();

    for (const keyword of keyWords) {
      if (sentenceLower.includes(keyword.toLowerCase())) {
        // Found a match - calculate position in original text
        let pos = 0;
        for (let j = 0; j < i; j++) {
          pos += sentences[j].length + 1; // +1 for space
        }

        return {
          start: pos,
          end: pos + sentence.length,
          text: sentence
        };
      }
    }
  }

  return null;
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
    return stats;
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

Response guidelines:
- Give a 1-2 sentence introduction that orients the user to what was found
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
      const aiResponse = await ai.chat([
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
    }
  }, async (request, reply) => {
    const { query, limit = 10, mode = 'hybrid', useResearcher = true } = request.body;

    let searchResults;
    let researchPlan = null;

    if (useResearcher) {
      // Use ResearcherAgent for intelligent search planning
      const researcher = new ResearcherAgent();
      const planStartTime = Date.now();
      const plan = await researcher.createSearchPlan(query, { limit });
      const planningTimeMs = Date.now() - planStartTime;

      researchPlan = {
        type: plan.type,
        assumptions: plan.assumptions || [],
        reasoning: plan.reasoning,
        queries: plan.queries.map(q => ({
          query: q.query,
          mode: q.mode,
          rationale: q.rationale || '',
          angle: q.angle || 'direct',
          filters: q.filters || {}
        })),
        traditions: plan.traditions || [],
        surprises: plan.surprises || [],
        followUp: plan.followUp || [],
        planningTimeMs
      };
      logger.info({ query, planType: plan.type, queryCount: plan.queries.length, planningTimeMs }, 'Research plan created');

      // Execute the plan
      searchResults = await researcher.executeSearchPlan(plan, { limit });
    } else {
      // Direct search without researcher
      const searchFn = mode === 'keyword' ? keywordSearch : mode === 'semantic' ? semanticSearch : hybridSearch;
      searchResults = await searchFn(query, { limit });
    }

    if (!searchResults.hits || searchResults.hits.length === 0) {
      return reply
        .header('Content-Type', 'text/event-stream')
        .header('Cache-Control', 'no-cache')
        .header('Connection', 'keep-alive')
        .send('data: ' + JSON.stringify({
          type: 'complete',
          analysis: 'No relevant passages found to analyze for your query.',
          sources: []
        }) + '\n\n');
    }

    // Set up SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send research plan if available
    if (researchPlan) {
      reply.raw.write('data: ' + JSON.stringify({ type: 'plan', plan: researchPlan }) + '\n\n');
    }

    // Build context for analyzer
    const passagesForAnalysis = searchResults.hits.map((hit, i) => ({
      index: i,
      text: hit.text || hit._formatted?.text || '',
      title: hit.title || 'Untitled',
      author: hit.author || 'Unknown',
      religion: hit.religion || '',
      collection: hit.collection || ''
    }));

    // STEP 1: Ask AI to analyze, re-rank, filter, and annotate results
    const analyzerPrompt = `Analyze search results for: "${query}"

TASKS:
1. Re-rank by relevance (most relevant first)
2. Remove irrelevant passages
3. Find the MOST relevant sentence - provide anchor words to locate it
4. Identify 1-3 key words/phrases to highlight
5. Write a DIRECT answer summary (5-10 words max)

CRITICAL SUMMARY RULES:
- Write a complete assertion statement from the quote's content
- ALWAYS include articles (the, a, an) - never omit them
- Format: Complete sentence-like assertion. Example: "The soul connects to God through Divine Revelation" NOT "Soul connects God"
- NO meta-language: Never say "this passage states", "asserts", "discusses", "addresses"
- If query is "What is X?" → summary is "X is [answer]" or "The X is [answer]"
- Maximum 10 words but must read naturally with proper grammar

Return ONLY valid JSON:
{
  "results": [
    {
      "originalIndex": 0,
      "sentenceStart": "first 3-5 words VERBATIM",
      "sentenceEnd": "last 3-5 words VERBATIM",
      "keyWords": ["word1", "phrase"],
      "summary": "Direct 5-10 word answer"
    }
  ],
  "introduction": "Brief 1 sentence intro"
}

PASSAGES:
${passagesForAnalysis.map((p, i) => `[${i}] ${p.title} by ${p.author}:\n${p.text}`).join('\n\n---\n\n')}

CRITICAL RULES:
- Only include relevant passages
- sentenceStart: EXACT first 3-5 words of the relevant sentence (COPY VERBATIM from text)
- sentenceEnd: EXACT last 3-5 words of the relevant sentence (COPY VERBATIM including punctuation)
- keyWords: 1-3 important words/phrases from that sentence to bold
- Summaries: direct answers, no filler words`;

    try {
      // Get structured analysis from AI
      const analysisResponse = await ai.chat([
        { role: 'system', content: 'You are an expert search result analyzer. Return only valid JSON, no markdown.' },
        { role: 'user', content: analyzerPrompt }
      ], {
        temperature: 0.3,
        maxTokens: 3000
      });

      // Parse the AI response
      let analysis;
      try {
        // Try to extract JSON from the response
        const jsonMatch = analysisResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseErr) {
        logger.error({ parseErr, content: analysisResponse.content }, 'Failed to parse analyzer response');
        // Fallback: send original results without analysis
        // In fallback case, use Meilisearch highlighting since we don't have analyzer
        const fallbackSources = searchResults.hits.map(hit => ({
          id: hit.id,
          document_id: hit.document_id,
          paragraph_index: hit.paragraph_index,
          text: hit.text, // Plain text
          title: hit.title,
          author: hit.author,
          religion: hit.religion,
          collection: hit.collection || hit.religion,
          summary: '',
          highlightedText: hit.text // No highlighting in fallback - use plain text
        }));
        reply.raw.write('data: ' + JSON.stringify({ type: 'sources', sources: fallbackSources }) + '\n\n');
        reply.raw.write('data: ' + JSON.stringify({ type: 'chunk', text: `I found ${fallbackSources.length} passages related to your query.` }) + '\n\n');
        reply.raw.write('data: ' + JSON.stringify({ type: 'complete' }) + '\n\n');
        reply.raw.end();
        return;
      }

      // STEP 2: Build enhanced sources with analysis data
      const enhancedSources = analysis.results.map(result => {
        const originalHit = searchResults.hits[result.originalIndex];
        if (!originalHit) return null;

        // Create highlighted text by marking the relevant sentence
        // Start with plain text, not Meilisearch's formatted version
        let highlightedText = originalHit.text || '';
        const plainText = highlightedText;
        let highlightSuccess = false;

        // Helper to apply highlighting to a match
        const applyHighlight = (match) => {
          let highlightedSentence = match.text;

          // Bold keywords within the sentence
          if (result.keyWords?.length > 0) {
            const sortedKeyWords = [...result.keyWords].sort((a, b) => b.length - a.length);
            for (const keyword of sortedKeyWords) {
              const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              highlightedSentence = highlightedSentence.replace(regex, '<b>$1</b>');
            }
          }

          // Reconstruct: text before + marked sentence + text after
          const before = plainText.substring(0, match.start);
          const after = plainText.substring(match.end);
          return `${before}<mark>${highlightedSentence}</mark>${after}`;
        };

        // Try anchor-based matching first
        if (result.sentenceStart && result.sentenceEnd) {
          const match = findSentenceByAnchors(plainText, result.sentenceStart, result.sentenceEnd);

          if (match) {
            highlightedText = applyHighlight(match);
            highlightSuccess = true;
            logger.debug({
              originalIndex: result.originalIndex,
              matchedText: match.text.substring(0, 60)
            }, 'Highlight success (anchor)');
          } else {
            logger.warn({
              originalIndex: result.originalIndex,
              sentenceStart: result.sentenceStart,
              sentenceEnd: result.sentenceEnd,
              title: originalHit.title
            }, 'Anchor match failed, trying keyword fallback');
          }
        }

        // Fallback: try keyword-based highlighting if anchor matching failed
        if (!highlightSuccess && result.keyWords?.length > 0) {
          const match = fallbackKeywordHighlight(plainText, result.keyWords);

          if (match) {
            highlightedText = applyHighlight(match);
            highlightSuccess = true;
            logger.debug({
              originalIndex: result.originalIndex,
              matchedText: match.text.substring(0, 60)
            }, 'Highlight success (keyword fallback)');
          }
        }

        // Log if all highlighting failed
        if (!highlightSuccess) {
          logger.warn({
            originalIndex: result.originalIndex,
            hasSentenceStart: !!result.sentenceStart,
            hasSentenceEnd: !!result.sentenceEnd,
            keyWordsCount: result.keyWords?.length || 0,
            title: originalHit.title
          }, 'All highlighting methods failed');
        }

        return {
          id: originalHit.id,
          document_id: originalHit.document_id,
          paragraph_index: originalHit.paragraph_index,
          text: originalHit.text, // Plain text without Meilisearch highlighting
          title: originalHit.title,
          author: originalHit.author,
          religion: originalHit.religion,
          collection: originalHit.collection || originalHit.religion,
          summary: result.summary || '',
          highlightedText // Only this should have <mark> around the relevant sentence
        };
      }).filter(Boolean);

      // Send enhanced sources
      reply.raw.write('data: ' + JSON.stringify({ type: 'sources', sources: enhancedSources }) + '\n\n');

      // STEP 3: Stream the introduction
      const intro = analysis.introduction || `I found ${enhancedSources.length} relevant passages for your query.`;
      reply.raw.write('data: ' + JSON.stringify({ type: 'chunk', text: intro }) + '\n\n');

      // Send completion
      reply.raw.write('data: ' + JSON.stringify({ type: 'complete' }) + '\n\n');
      reply.raw.end();

      logger.info({ query, hitsAnalyzed: searchResults.hits.length, resultsReturned: enhancedSources.length }, 'Analysis completed');

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
