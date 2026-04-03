/**
 * Research Assistant Chat Routes
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * Architecture: Two parallel tracks
 * 1. INSTANT: AI responds immediately from conversation context + any
 *    previously gathered research
 * 2. BACKGROUND: Research agent searches the library in parallel. Results
 *    are sent to the client and injected into the next turn's context.
 *
 * The user never waits for search. The conversation flows naturally,
 * and library citations appear as the research agent finds them.
 *
 * Event types (SSE): chunk | research | citations | complete | error
 */

import OpenAI from 'openai';
import { hybridSearch, keywordSearch } from '../lib/search.js';
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

## Using Library Context

A research agent searches the library in the background as you converse. When relevant passages are provided in your context, weave them naturally into your response — cite inline as (*Title* — Author). Pick the 2-4 most illuminating passages. If you don't have library context yet, respond from your own knowledge and the research will catch up on the next turn.

Never fabricate citations. If you reference a passage, it must come from the provided context.

## Formatting

Write in flowing prose. Use markdown emphasis (*italics*, **bold**) for key terms. Avoid bullet-point lists as your default. End with a question or invitation to go deeper when it feels natural.

You are not a chatbot. You are a well-read companion who loves these texts and loves helping people discover what's in them.`;

// ============================================================================
// BACKGROUND RESEARCH
// ============================================================================

/**
 * Determine search queries for background research based on the conversation.
 * Returns 0-2 search queries. Fast heuristic — no AI call.
 */
function planResearch(messages) {
  const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const msg = lastUser.trim();

  // Skip research for very short messages, greetings, meta-questions
  if (msg.length < 12) return [];
  if (/^(hi|hello|hey|how are you|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye|what's up)/i.test(msg)) return [];
  if (/^(who are you|what are you|what can you do|help me)/i.test(msg)) return [];
  if (/^(interesting|i see|that makes sense|go on|continue|wow|cool|great)/i.test(msg)) return [];

  const queries = [];

  // Primary: use the user's message as a search query (trimmed)
  queries.push(msg.replace(/[?!.]+$/, '').substring(0, 80));

  // Secondary: if the message mentions a specific tradition, add a focused query
  const traditions = ['baha', 'buddhis', 'christian', 'confuc', 'hindu', 'islam', 'muslim', 'jain', 'judai', 'jewish', 'sikh', 'tao', 'zoroastr'];
  const mentionedTradition = traditions.find(t => msg.toLowerCase().includes(t));
  if (mentionedTradition && msg.length > 30) {
    // Extract the core concept without the tradition name
    const concept = msg.replace(new RegExp(mentionedTradition + '\\w*', 'gi'), '').trim().replace(/[?!.]+$/, '').substring(0, 60);
    if (concept.length > 10) queries.push(concept);
  }

  return queries;
}

/**
 * Run background research. Returns formatted context string + citations array.
 * Runs both keyword and hybrid search in parallel for speed.
 */
async function runResearch(queries) {
  if (queries.length === 0) return { context: '', citations: [] };

  try {
    // Run all searches in parallel
    const searches = [];
    for (const q of queries) {
      searches.push(hybridSearch(q, { limit: 5 }).catch(() => ({ hits: [] })));
      searches.push(keywordSearch(q, { limit: 3 }).catch(() => ({ hits: [] })));
    }
    const results = await Promise.all(searches);

    // Merge and deduplicate by paragraph ID
    const seen = new Set();
    const allHits = [];
    for (const result of results) {
      for (const hit of (result?.hits || [])) {
        const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
        if (!seen.has(key)) {
          seen.add(key);
          allHits.push(hit);
        }
      }
    }

    // Take top 8 results
    const top = allHits.slice(0, 8);
    if (top.length === 0) return { context: '', citations: [] };

    const citations = top.map(hit => ({
      document_id: hit.doc_id || hit.document_id,
      paragraph_index: hit.paragraph_index,
      text: hit.text || '',
      title: hit.title || 'Unknown',
      author: hit.author || '',
      religion: hit.religion || '',
      collection: hit.collection || ''
    }));

    const context = citations
      .map((c, i) => `[${i + 1}] "${c.text.substring(0, 500)}${c.text.length > 500 ? '...' : ''}"\n   — *${c.title}*${c.author ? `, ${c.author}` : ''} (${c.religion})`)
      .join('\n\n');

    return { context, citations };
  } catch (err) {
    logger.warn({ err: err.message }, 'Background research failed');
    return { context: '', citations: [] };
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
          conversationId: { type: 'string' },
          // Client can pass research context from the previous turn
          researchContext: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { messages, researchContext } = request.body;
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

      // Build system prompt with any research context from previous turn
      let systemContent = SYSTEM_PROMPT;
      if (researchContext) {
        systemContent += `\n\n## Library Context (from background research)\n\n${researchContext}`;
      }

      const aiMessages = [
        { role: 'system', content: systemContent },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      // Start TWO things in parallel:
      // 1. Stream the AI response immediately
      // 2. Run background research for the NEXT turn

      const researchQueries = planResearch(messages);
      const researchPromise = runResearch(researchQueries);

      // Stream AI response — user sees it immediately
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: aiMessages,
        stream: true,
        max_tokens: 2500,
        temperature: 0.7
      });

      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content || '';
        if (text) sendEvent({ type: 'chunk', text });
      }

      // By now the background research has likely finished (or will very soon)
      const { context: newResearch, citations } = await researchPromise;

      // Send research results to client — client stores these for the next turn
      if (citations.length > 0) {
        sendEvent({ type: 'citations', citations });
      }

      // Send the research context for the client to pass back on the next turn
      sendEvent({
        type: 'complete',
        citations,
        researchContext: newResearch || null
      });

      reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      reply.raw.end();
    }
  });
}
