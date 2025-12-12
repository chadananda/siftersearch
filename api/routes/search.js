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
          mode: { type: 'string', enum: ['hybrid', 'keyword', 'semantic'], default: 'hybrid' }
        }
      }
    }
  }, async (request, reply) => {
    const { query, limit = 10, mode = 'hybrid' } = request.body;

    // First, search for relevant passages
    const searchFn = mode === 'keyword' ? keywordSearch : mode === 'semantic' ? semanticSearch : hybridSearch;
    const searchResults = await searchFn(query, { limit });

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
3. Find the MOST relevant sentence in each passage
4. Identify 1-3 key words/phrases in that sentence
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
      "relevantSentence": "Exact quote from passage",
      "keyWords": ["word1", "phrase"],
      "summary": "Direct 5-10 word answer"
    }
  ],
  "introduction": "Brief 1 sentence intro"
}

PASSAGES:
${passagesForAnalysis.map((p, i) => `[${i}] ${p.title} by ${p.author}:\n${p.text}`).join('\n\n---\n\n')}

Rules:
- Only include relevant passages
- relevantSentence must be EXACT quote
- keyWords from relevantSentence only
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
          relevantSentence: '',
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

        // Highlight the relevant sentence if we have one
        if (result.relevantSentence) {
          // Try to find where the sentence appears in the plain text
          // First try exact match
          let sentenceIndex = plainText.indexOf(result.relevantSentence);
          let matchedSentence = result.relevantSentence;

          // If exact match fails, try normalized matching
          if (sentenceIndex === -1) {
            // Normalize whitespace for comparison
            const normalizedSentence = result.relevantSentence.replace(/\s+/g, ' ').trim();
            const normalizedText = plainText.replace(/\s+/g, ' ');
            const normalizedIndex = normalizedText.indexOf(normalizedSentence);

            if (normalizedIndex !== -1) {
              // Find the actual position in original text by counting characters
              // This is approximate but usually works
              let charCount = 0;
              let actualIndex = 0;
              for (let i = 0; i < plainText.length && charCount < normalizedIndex; i++) {
                if (!/\s/.test(plainText[i]) || (i > 0 && !/\s/.test(plainText[i-1]))) {
                  charCount++;
                }
                actualIndex = i;
              }
              // Find the end of the sentence in original text
              let sentenceEnd = actualIndex;
              let matchedChars = 0;
              const targetChars = normalizedSentence.replace(/\s+/g, '').length;
              for (let i = actualIndex; i < plainText.length && matchedChars < targetChars; i++) {
                if (!/\s/.test(plainText[i])) {
                  matchedChars++;
                }
                sentenceEnd = i + 1;
              }
              sentenceIndex = actualIndex;
              matchedSentence = plainText.substring(actualIndex, sentenceEnd);
            }
          }

          // If still no match, try finding the first few words
          if (sentenceIndex === -1) {
            const words = result.relevantSentence.split(/\s+/).slice(0, 5).join(' ');
            if (words.length > 10) {
              const partialIndex = plainText.indexOf(words);
              if (partialIndex !== -1) {
                // Find the end of the sentence (period, question mark, exclamation, or end of text)
                const sentenceEndMatch = plainText.substring(partialIndex).match(/[.!?]/);
                const sentenceEnd = sentenceEndMatch
                  ? partialIndex + sentenceEndMatch.index + 1
                  : Math.min(partialIndex + result.relevantSentence.length + 50, plainText.length);
                sentenceIndex = partialIndex;
                matchedSentence = plainText.substring(partialIndex, sentenceEnd).trim();
              }
            }
          }

          if (sentenceIndex !== -1) {
            // Build the highlighted version with bolded keywords
            let highlightedSentence = matchedSentence;

            // If we have keywords, bold them within the sentence using <b> tags
            if (result.keyWords?.length > 0) {
              const sortedKeyWords = [...result.keyWords].sort((a, b) => b.length - a.length);
              for (const keyword of sortedKeyWords) {
                const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                highlightedSentence = highlightedSentence.replace(regex, '<b>$1</b>');
              }
            }

            // Reconstruct: text before + marked sentence + text after
            const before = plainText.substring(0, sentenceIndex);
            const after = plainText.substring(sentenceIndex + matchedSentence.length);
            highlightedText = `${before}<mark>${highlightedSentence}</mark>${after}`;
          }
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
          relevantSentence: result.relevantSentence || '',
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
