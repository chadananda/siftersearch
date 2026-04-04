/**
 * Research Assistant Chat Routes
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * The AI responds instantly. Background research runs in parallel and
 * feeds results into the next turn's context.
 */

import OpenAI from 'openai';
import { hybridSearch, keywordSearch } from '../lib/search.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { getAnonymousUserId } from '../lib/anonymous.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

const SYSTEM_PROMPT = `You are the Ocean Library's research companion — a warm, pithy guide to an interfaith library spanning 11 religious traditions.

Core lens: Bahá'í perspective held with philosophical nuance — not doctrine to impose, but a lens that illuminates connections between traditions.

Style rules:
- Be SHORT. 2-4 sentences unless the question demands more. Dense, not padded.
- Conversational and warm, never lecturing. Talk *with* the person, not *at* them.
- No bullet lists, no headers, no markdown formatting. Flowing prose only.
- When citing library passages, weave them naturally: (*Title* — Author). Pick 1-3 best, never fabricate.
- End with a question when it feels natural — be a thinking partner, not a search engine.
- If you don't know, say so briefly.`;

function planResearch(messages) {
  const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  const msg = lastUser.trim();
  if (msg.length < 20) return [];
  if (/^(hi|hello|hey|how are you|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye|what's up|good morning|good evening|how's it going)/i.test(msg)) return [];
  if (/^(who are you|what are you|what can you do|help me|tell me about yourself)/i.test(msg)) return [];
  if (/^(interesting|i see|that makes sense|go on|continue|wow|cool|great|nice|amazing)/i.test(msg)) return [];
  return [msg.replace(/[?!.]+$/, '').substring(0, 80)];
}

async function runResearch(queries) {
  if (queries.length === 0) return { context: '', citations: [] };
  try {
    const results = await Promise.all([
      hybridSearch(queries[0], { limit: 5 }).catch(() => ({ hits: [] })),
      keywordSearch(queries[0], { limit: 3 }).catch(() => ({ hits: [] }))
    ]);
    const seen = new Set();
    const allHits = [];
    for (const result of results) {
      for (const hit of (result?.hits || [])) {
        const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
        if (!seen.has(key)) { seen.add(key); allHits.push(hit); }
      }
    }
    const top = allHits.slice(0, 6);
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
      .map((c, i) => `[${i + 1}] "${c.text.substring(0, 400)}..."\n   — *${c.title}*${c.author ? `, ${c.author}` : ''} (${c.religion})`)
      .join('\n\n');
    return { context, citations };
  } catch (err) {
    logger.warn({ err: err.message }, 'Background research failed');
    return { context: '', citations: [] };
  }
}

export default async function chatRoutes(fastify) {
  fastify.post('/stream', {
    preHandler: optionalAuthenticate,
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array', minItems: 1, maxItems: 50,
            items: {
              type: 'object', required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 4000 }
              }
            }
          },
          conversationId: { type: 'string' },
          researchContext: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { messages, researchContext } = request.body;
    const userId = request.user?.sub?.toString() || getAnonymousUserId(request);

    // Set headers directly on raw response — reply.header() doesn't survive flushHeaders()
    const origin = request.headers.origin;
    if (origin) reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendEvent = (data) => {
      try { reply.raw.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (_) { /* closed */ }
    };

    try {
      const openai = new OpenAI({ apiKey: config.ai.openai?.apiKey || process.env.OPENAI_API_KEY });

      let systemContent = SYSTEM_PROMPT;
      if (researchContext) {
        systemContent += `\n\n## Library Context (from background research)\n\n${researchContext}`;
      }

      const aiMessages = [
        { role: 'system', content: systemContent },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      // Start research in parallel (doesn't block response)
      const researchQueries = planResearch(messages);
      const researchPromise = runResearch(researchQueries);

      // Stream response immediately
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

      // Collect background research (should be done by now)
      const { context: newResearch, citations } = await researchPromise;

      if (citations.length > 0) {
        sendEvent({ type: 'citations', citations });
      }

      sendEvent({ type: 'complete', citations, researchContext: newResearch || null });
      reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      reply.raw.end();
    }

    // Prevent Fastify from trying to send its own response
    return reply;
  });
}
