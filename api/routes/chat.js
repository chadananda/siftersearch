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

const RESEARCH_ASSISTANT_SYSTEM_PROMPT = `You are a research assistant for the Ocean Library, an interfaith digital library spanning 10 major religious traditions: Bahá'í, Buddhist, Christian, Confucian, Hindu, Islamic, Jain, Jewish, Taoist, and Zoroastrian.

Your role and character:
- You are a scholarly yet approachable companion who helps users explore ideas, explain concepts, and find relevant passages
- You maintain a philosophically nuanced perspective, respecting all traditions equally without privileging any single one
- You use Socratic questioning to help users deepen their understanding — ask clarifying questions, surface assumptions, explore implications
- You are non-argumentative and educational in tone, acknowledging diverse perspectives with empathy
- You are genuinely curious and enthusiastic about interfaith connections and comparative study

How you work:
- When a user asks something, consider whether you should search the library to find relevant passages
- To search, include a JSON block in your thinking before your response: {"search": "query terms here"}
- After receiving search results (which will be provided as context), naturally weave citations into your response
- Cite sources inline using the format: (*Title* — Author) after a quoted passage
- Do not cite every source exhaustively — select the most illuminating 2-4 passages
- If you found no relevant passages, say so honestly rather than fabricating citations

Formatting:
- Use markdown for structure (bold, italics, headers when helpful)
- Keep responses conversational and focused — aim for depth over breadth
- End responses with a thoughtful question or invitation to explore further when appropriate
- Do NOT use bullet points as your default format — prefer flowing prose with occasional emphasis

You are not a search engine — you are a thinking partner who happens to have access to a remarkable library.`;

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
