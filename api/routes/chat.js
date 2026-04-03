/**
 * Research Assistant Chat Routes
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * Provides a multi-turn conversational interface powered by the configured
 * AI provider. The assistant can search the library mid-conversation and
 * cite relevant passages inline.
 *
 * Event types (SSE): chunk | search_start | citations | complete | error
 */

import { aiService } from '../lib/ai-services.js';
import { hybridSearch } from '../lib/search.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { getAnonymousUserId } from '../lib/anonymous.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const RESEARCH_ASSISTANT_SYSTEM_PROMPT = `You are the Ocean Library's research companion — a knowledgeable, warm, and genuinely curious guide to an interfaith digital library spanning 11 religious traditions: Bahá'í, Buddhist, Christian, Confucian, Hindu, Islamic, Jain, Jewish, Sikh, Taoist, and Zoroastrian. The library contains over 8,000 documents and 3.6 million passages.

## Your Character

You approach every conversation with three foundations:
1. **Spiritual reality matters.** You treat religion as central to human life and civilization, not a quaint relic.
2. **The traditions are connected.** You see the world's religions as successive chapters of one unfolding story — not competing truth claims.
3. **Every person has dignity.** You engage everyone with genuine respect regardless of their background or beliefs.

You are shaped by a Bahá'í perspective, which you hold with philosophical nuance — not as doctrine to impose, but as a lens that illuminates connections others might miss. When the Bahá'í view differs from another tradition's, you present both with care, never arguing.

## How You Converse

**Be a thinking partner, not a search engine.** When someone asks a question, think with them. Use Socratic questioning — ask what they already understand, surface hidden assumptions, explore implications together.

**Bridge concepts.** Connect the user's existing vocabulary to unfamiliar ideas. If they know Quaker consensus, bridge to Bahá'í consultation. If they know natural law theory, bridge to Bahá'í ethics. Meet people where they are.

**Progressive disclosure.** Start simple, go deeper only as the conversation warrants. Don't front-load complexity. Build understanding in layers.

**Weave in the library.** When you find a relevant passage, let it speak. A well-chosen quote from Gleanings or the Dhammapada should feel like a friend handing you a book open to the right page — not a footnote dump. Cite sparingly and precisely: 2-4 passages, not 10.

**Handle tension gracefully.** When someone says something that contradicts a principle you hold:
1. Acknowledge what's true in what they said
2. Surface the deeper principle at stake
3. Offer the alternative perspective as "one lens" — let the library make the case, not you
4. Keep curiosity alive. The goal is never to win a point.

## Citations and Search

When passages from the library are provided as context, cite them inline: (*Title* — Author). Select the most illuminating passages rather than listing everything. If no relevant passages were found, say so honestly — never fabricate a citation.

## Formatting

Write in flowing prose. Use markdown emphasis (*italics*, **bold**) for key terms. Use headers sparingly for longer responses. Avoid bullet-point lists as your default — you're having a conversation, not writing a report. End with a question or invitation to go deeper when it feels natural.

You are not a chatbot. You are a well-read companion who loves these texts and loves helping people discover what's in them.`;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Decide whether a message warrants a library search.
 * Returns a search query string, or null if no search needed.
 */
async function planSearch(messages, userMessage) {
  const planPrompt = `You are helping a research assistant decide whether to search an interfaith library.

Given this conversation, does the latest user message warrant searching the library for relevant passages?
If yes, provide a concise search query (2-8 words focusing on the core concept).
If no, respond with null.

Conversation (last 3 messages):
${messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Latest message: "${userMessage}"

Respond with JSON only: {"search": "query"} or {"search": null}`;

  try {
    const response = await aiService('fast').chat([
      { role: 'user', content: planPrompt }
    ], {
      temperature: 0.1,
      maxTokens: 100,
      caller: 'chat:search-planning'
    });
    const text = response.content?.trim() || '';
    // Extract JSON from response
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed.search || null;
  } catch (err) {
    logger.warn({ err: err.message }, 'Chat search planning failed, skipping search');
    return null;
  }
}

/**
 * Search the library and format results as context for the AI.
 * Returns { context, citations } where context is a string to inject
 * and citations is an array of structured passage objects.
 */
async function searchLibrary(query, limit = 5) {
  try {
    const results = await hybridSearch(query, { limit, mode: 'hybrid' });
    const hits = results?.hits || [];
    if (hits.length === 0) return { context: '', citations: [] };

    const citations = hits.slice(0, limit).map(hit => ({
      document_id: hit.doc_id || hit.document_id,
      paragraph_index: hit.paragraph_index,
      text: hit.text || '',
      title: hit.title || 'Unknown',
      author: hit.author || '',
      religion: hit.religion || '',
      collection: hit.collection || ''
    }));

    const context = citations
      .map((c, i) => `[${i + 1}] "${c.text.substring(0, 300)}${c.text.length > 300 ? '...' : ''}"\n   — ${c.title}${c.author ? `, ${c.author}` : ''} (${c.religion || 'Unknown tradition'})`)
      .join('\n\n');

    return { context, citations };
  } catch (err) {
    logger.warn({ err: err.message, query }, 'Library search failed in chat');
    return { context: '', citations: [] };
  }
}

// ============================================================================
// ROUTE
// ============================================================================

export default async function chatRoutes(fastify) {
  /**
   * POST /stream
   * Body: { messages: [{role, content}], conversationId?: string }
   * Streams SSE events: chunk | search_start | citations | complete | error
   */
  fastify.post('/stream', {
    preHandler: optionalAuthenticate,
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 4000 }
              }
            }
          },
          conversationId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { messages } = request.body;
    const userMessage = messages[messages.length - 1]?.content || '';
    const userId = request.user?.sub?.toString() || getAnonymousUserId(request);

    // Set up SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (data) => {
      try { reply.raw.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) { /* stream closed */ }
    };

    try {
      // Step 1: Plan whether to search the library
      const searchQuery = await planSearch(messages.slice(0, -1), userMessage);

      let searchContext = '';
      let citations = [];

      // Step 2: Optionally search the library
      if (searchQuery) {
        sendEvent({ type: 'search_start', query: searchQuery });
        const { context, citations: found } = await searchLibrary(searchQuery, 6);
        searchContext = context;
        citations = found;
        if (citations.length > 0) {
          sendEvent({ type: 'citations', citations });
        }
      }

      // Step 3: Build messages for the AI
      // Inject search results as a system-style user turn before the final user message
      const aiMessages = [
        { role: 'system', content: RESEARCH_ASSISTANT_SYSTEM_PROMPT }
      ];

      // Include conversation history (skip last user message — added after search context)
      for (const msg of messages.slice(0, -1)) {
        aiMessages.push({ role: msg.role, content: msg.content });
      }

      // Add search context and user message together if we have results
      if (searchContext) {
        aiMessages.push({
          role: 'user',
          content: `[Library search for "${searchQuery}" returned these passages:\n\n${searchContext}]\n\n${userMessage}`
        });
      } else {
        aiMessages.push({ role: 'user', content: userMessage });
      }

      // Step 4: Stream AI response
      const svcConfig = aiService('quality').config;
      let streamResponse;

      try {
        // Use streaming if supported by the provider
        streamResponse = await aiService('quality').chat(aiMessages, {
          stream: true,
          maxTokens: 1500,
          temperature: 0.7,
          caller: 'chat:research-assistant',
          userId
        });
      } catch (streamErr) {
        // If streaming fails, fall back to non-streaming
        logger.warn({ err: streamErr.message }, 'Streaming not available, falling back to non-streaming');
        const nonStreamResponse = await aiService('quality').chat(aiMessages, {
          stream: false,
          maxTokens: 1500,
          temperature: 0.7,
          caller: 'chat:research-assistant',
          userId
        });
        sendEvent({ type: 'chunk', text: nonStreamResponse.content });
        sendEvent({ type: 'complete', citations });
        reply.raw.end();
        return;
      }

      // Handle streaming based on provider
      let fullContent = '';

      if (svcConfig.provider === 'ollama') {
        // Ollama returns an async iterable of {message: {content}} objects
        for await (const chunk of streamResponse) {
          const text = chunk.message?.content || '';
          if (text) {
            fullContent += text;
            sendEvent({ type: 'chunk', text });
          }
        }
      } else {
        // OpenAI-compatible streaming (openai, lmstudio)
        for await (const chunk of streamResponse) {
          const text = chunk.choices?.[0]?.delta?.content || '';
          if (text) {
            fullContent += text;
            sendEvent({ type: 'chunk', text });
          }
        }
      }

      sendEvent({ type: 'complete', citations });
      reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      reply.raw.end();
    }
  });
}
