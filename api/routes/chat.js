/**
 * Research Assistant Chat Routes
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * Uses OpenAI tool-calling: the AI decides when to search the library
 * and which search type to use. No pre-search step — the AI converses
 * naturally and reaches for the library when it needs to.
 *
 * Event types (SSE): chunk | tool_call | citations | complete | error
 */

import OpenAI from 'openai';
import { hybridSearch, keywordSearch, semanticSearch } from '../lib/search.js';
import { queryOne, queryAll } from '../lib/db.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { getAnonymousUserId } from '../lib/anonymous.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are the Ocean Library's research companion — a knowledgeable, warm, and genuinely curious guide to an interfaith digital library spanning 11 religious traditions: Bahá'í, Buddhist, Christian, Confucian, Hindu, Islamic, Jain, Jewish, Sikh, Taoist, and Zoroastrian. The library contains over 8,000 documents and 3.6 million passages.

## Your Character

You approach every conversation with three foundations:
1. **Spiritual reality matters.** You treat religion as central to human life and civilization, not a quaint relic.
2. **The traditions are connected.** You see the world's religions as successive chapters of one unfolding story — not competing truth claims.
3. **Every person has dignity.** You engage everyone with genuine respect regardless of their background or beliefs.

You are shaped by a Bahá'í perspective, which you hold with philosophical nuance — not as doctrine to impose, but as a lens that illuminates connections others might miss. When the Bahá'í view differs from another tradition's, you present both with care, never arguing.

## How You Converse

**Be a thinking partner, not a search engine.** When someone asks a question, think with them. Use Socratic questioning — ask what they already understand, surface hidden assumptions, explore implications together.

**Bridge concepts.** Connect the user's existing vocabulary to unfamiliar ideas. Meet people where they are.

**Progressive disclosure.** Start simple, go deeper only as the conversation warrants. Don't front-load complexity.

**Handle tension gracefully.** Acknowledge what's true in what they said, surface the deeper principle, offer your perspective as one lens — let the library make the case, not you.

## Using the Library

You have search tools available. Use them when a conversation would benefit from actual passages — a specific quote, a citation to support a point, or to find something the user is looking for. Do NOT search for every message. Greetings, follow-ups, and general discussion don't need search.

When you do search, choose the right tool:
- **quick_search**: Fast keyword + semantic search. Good for finding specific passages, quotes, or concepts. Use this most of the time.
- **keyword_search**: Pure text matching. Use when looking for exact phrases, names, or titles.
- **deep_search**: Full semantic search. Use for abstract concepts, thematic exploration, or cross-tradition comparisons.
- **lookup_document**: Get a specific document's content by ID. Use when you already know which document to reference.

Cite sources inline: (*Title* — Author). Pick the 2-4 most illuminating passages, not everything.

## Formatting

Write in flowing prose. Use markdown emphasis for key terms. Avoid bullet-point lists as your default. End with a question or invitation to go deeper when it feels natural.

You are not a chatbot. You are a well-read companion who loves these texts and loves helping people discover what's in them.`;

// ============================================================================
// TOOLS
// ============================================================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'quick_search',
      description: 'Search the library using both keyword matching and semantic understanding. Best for most queries — finds relevant passages quickly.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (2-10 words focusing on the core concept)' },
          religion: { type: 'string', description: 'Optional: filter by religion (e.g. "Baha\'i", "Buddhist", "Islam")' },
          limit: { type: 'number', description: 'Number of results (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'keyword_search',
      description: 'Pure text/keyword search. Use for exact phrases, specific names, book titles, or when you need precise text matching.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Exact text or phrase to find' },
          religion: { type: 'string', description: 'Optional: filter by religion' },
          limit: { type: 'number', description: 'Number of results (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deep_search',
      description: 'Semantic-only search for abstract concepts and thematic exploration. Better for "what do traditions say about X" type questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Conceptual query describing what you\'re looking for' },
          religion: { type: 'string', description: 'Optional: filter by religion' },
          limit: { type: 'number', description: 'Number of results (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_document',
      description: 'Get metadata and sample content from a specific document by ID. Use when you already know which document to reference.',
      parameters: {
        type: 'object',
        properties: {
          document_id: { type: 'number', description: 'The document ID to look up' }
        },
        required: ['document_id']
      }
    }
  }
];

// ============================================================================
// TOOL EXECUTION
// ============================================================================

function formatHits(hits) {
  if (!hits || hits.length === 0) return 'No results found.';
  return hits.map((hit, i) =>
    `[${i + 1}] "${(hit.text || '').substring(0, 500)}${(hit.text || '').length > 500 ? '...' : ''}"\n   — *${hit.title || 'Unknown'}*${hit.author ? `, ${hit.author}` : ''} (${hit.religion || 'Unknown'}) [doc:${hit.doc_id || hit.document_id}, para:${hit.paragraph_index}]`
  ).join('\n\n');
}

async function executeTool(name, args) {
  const limit = Math.min(args.limit || 5, 10);
  const filterOpts = {};
  if (args.religion) filterOpts.religion = args.religion;

  try {
    switch (name) {
      case 'quick_search': {
        const results = await hybridSearch(args.query, { limit, ...filterOpts });
        return { text: formatHits(results?.hits), citations: results?.hits?.slice(0, limit) || [] };
      }
      case 'keyword_search': {
        const results = await keywordSearch(args.query, { limit, ...filterOpts });
        return { text: formatHits(results?.hits), citations: results?.hits?.slice(0, limit) || [] };
      }
      case 'deep_search': {
        const results = await semanticSearch(args.query, { limit, ...filterOpts });
        return { text: formatHits(results?.hits), citations: results?.hits?.slice(0, limit) || [] };
      }
      case 'lookup_document': {
        const doc = await queryOne('SELECT id, title, author, religion, collection, description, paragraph_count FROM docs WHERE id = ? AND deleted_at IS NULL', [args.document_id]);
        if (!doc) return { text: 'Document not found.', citations: [] };
        const sample = await queryAll('SELECT text, paragraph_index FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 3', [args.document_id]);
        const sampleText = sample.map(p => p.text.substring(0, 200)).join('\n...\n');
        return { text: `**${doc.title}** by ${doc.author || 'Unknown'} (${doc.religion})\n${doc.description || ''}\n${doc.paragraph_count} paragraphs\n\nSample:\n${sampleText}`, citations: [] };
      }
      default:
        return { text: 'Unknown tool.', citations: [] };
    }
  } catch (err) {
    logger.warn({ err: err.message, tool: name, args }, 'Tool execution failed');
    return { text: `Search failed: ${err.message}`, citations: [] };
  }
}

// ============================================================================
// ROUTE
// ============================================================================

export default async function chatRoutes(fastify) {
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
    const userId = request.user?.sub?.toString() || getAnonymousUserId(request);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (data) => {
      try { reply.raw.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) { /* closed */ }
    };

    try {
      const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });
      const allCitations = [];

      // Build message array with system prompt
      const aiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      // First call — may return tool calls or direct response
      let response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: aiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        stream: false, // first call non-streaming to check for tool calls
        max_tokens: 2500,
        temperature: 0.7
      });

      let choice = response.choices[0];

      // Tool call loop — execute tools and feed results back (max 3 rounds)
      let rounds = 0;
      while (choice.finish_reason === 'tool_calls' && rounds < 3) {
        rounds++;
        const toolCalls = choice.message.tool_calls || [];

        // Add assistant message with tool calls
        aiMessages.push(choice.message);

        // Execute each tool call
        for (const tc of toolCalls) {
          const args = JSON.parse(tc.function.arguments);
          sendEvent({ type: 'tool_call', tool: tc.function.name, query: args.query || args.document_id });

          const result = await executeTool(tc.function.name, args);
          if (result.citations?.length > 0) {
            allCitations.push(...result.citations.map(h => ({
              document_id: h.doc_id || h.document_id,
              paragraph_index: h.paragraph_index,
              text: h.text || '',
              title: h.title || 'Unknown',
              author: h.author || '',
              religion: h.religion || '',
              collection: h.collection || ''
            })));
          }

          // Add tool result
          aiMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.text
          });
        }

        // Send citations to client
        if (allCitations.length > 0) {
          sendEvent({ type: 'citations', citations: allCitations });
        }

        // Call again with tool results
        response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: aiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          stream: false,
          max_tokens: 2500,
          temperature: 0.7
        });
        choice = response.choices[0];
      }

      // Now stream the final response
      const finalMessages = [...aiMessages];
      if (choice.message?.content) {
        // Already have content from non-streaming call — send it
        sendEvent({ type: 'chunk', text: choice.message.content });
      } else {
        // Stream the final response
        finalMessages.push(choice.message);
        const stream = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: finalMessages,
          stream: true,
          max_tokens: 2500,
          temperature: 0.7
        });

        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content || '';
          if (text) sendEvent({ type: 'chunk', text });
        }
      }

      sendEvent({ type: 'complete', citations: allCitations });
      reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      reply.raw.end();
    }
  });
}
