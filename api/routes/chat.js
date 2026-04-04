/**
 * Research Assistant Chat Routes — "Jafar"
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * Uses OpenAI function calling with library tools:
 * - search_library: hybrid search across all documents
 * - library_stats: overview of religions, collections, document counts
 * - find_documents: search by author, title, collection, religion
 * - read_document: fetch paragraphs from a specific document
 */

import OpenAI from 'openai';
import { hybridSearch, keywordSearch } from '../lib/search.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { getAnonymousUserId } from '../lib/anonymous.js';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { queryOne, queryAll } from '../lib/db.js';

const SYSTEM_PROMPT = `You are Jafar — a wise, warm research companion for the Ocean Library. You choose words the way a jeweler sets stones: each one deliberate, none wasted.

ONE SENTENCE when one sentence suffices. The user's time is sacred. If they ask "do you have books by X?" and you find 3, say: "Yes — *Title A*, *Title B*, and *Title C*." Full stop. Don't elaborate unless asked.

Use your tools. Never guess what's in the library — look it up. Share what you find honestly. When uncertain, say so in few words.

Bahá'í lens: all religions as chapters of one story. Hold it as perspective, never lecture.

Markdown is fine: **bold**, *italic*, lists, tables — when they serve clarity. Cite as (*Title* — Author).`;

// ─── Tool definitions for OpenAI function calling ─────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_library',
      description: 'Search the library for passages related to a topic, concept, or question. Returns relevant passages with citations. Use this for any question about religious teachings, concepts, or texts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query — a topic, question, or concept' },
          religion: { type: 'string', description: 'Optional: filter to a specific religion (e.g. "Baha\'i", "Islam", "Judaism")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'library_stats',
      description: 'Get an overview of the library: how many religions, collections, documents, and passages it contains. Use this when the user asks about the library itself, what it contains, or its scope.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_documents',
      description: 'Find documents in the library by author, title, collection, or religion. Use this when the user asks "do you have...", "how many books by...", "what\'s in the collection...", etc.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Search by title (partial match)' },
          author: { type: 'string', description: 'Search by author name (partial match)' },
          religion: { type: 'string', description: 'Filter by religion' },
          collection: { type: 'string', description: 'Filter by collection name' },
          limit: { type: 'integer', description: 'Max results (default 10)', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_document',
      description: 'Read paragraphs from a specific document by its ID. Use this to quote or summarize a specific text.',
      parameters: {
        type: 'object',
        properties: {
          document_id: { type: 'integer', description: 'The document ID' },
          start: { type: 'integer', description: 'Starting paragraph index (default 0)', default: 0 },
          limit: { type: 'integer', description: 'Number of paragraphs to fetch (default 10, max 30)', default: 10 }
        },
        required: ['document_id']
      }
    }
  }
];

// ─── Tool implementations ─────────────────────────────────────────────────

async function executeSearchLibrary({ query, religion }) {
  const filters = religion ? { religion } : {};
  const [hybridResults, keywordResults] = await Promise.all([
    hybridSearch(query, { limit: 5, ...filters }).catch(() => ({ hits: [] })),
    keywordSearch(query, { limit: 3, ...filters }).catch(() => ({ hits: [] }))
  ]);

  const seen = new Set();
  const hits = [];
  for (const result of [hybridResults, keywordResults]) {
    for (const hit of (result?.hits || [])) {
      const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
      if (!seen.has(key)) { seen.add(key); hits.push(hit); }
    }
  }

  return hits.slice(0, 6).map(hit => ({
    text: (hit.text || '').substring(0, 500),
    title: hit.title || 'Unknown',
    author: hit.author || '',
    religion: hit.religion || '',
    collection: hit.collection || '',
    document_id: hit.doc_id || hit.document_id,
    paragraph_index: hit.paragraph_index
  }));
}

async function executeLibraryStats() {
  const [docCount, paraCount, religions, collections] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM docs WHERE deleted_at IS NULL'),
    queryOne('SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL'),
    queryAll('SELECT religion, COUNT(*) as count FROM docs WHERE deleted_at IS NULL GROUP BY religion ORDER BY count DESC'),
    queryAll(`SELECT ln.name, ln.description, ln.authority_default,
              (SELECT COUNT(*) FROM docs d WHERE d.collection = ln.name AND d.deleted_at IS NULL) as doc_count
              FROM library_nodes ln WHERE ln.node_type = 'collection' AND ln.parent_id IS NOT NULL
              ORDER BY ln.authority_default DESC, ln.name`)
  ]);

  return {
    totalDocuments: docCount.count,
    totalParagraphs: paraCount.count,
    religions: religions.map(r => ({ name: r.religion, documents: r.count })),
    totalCollections: collections.length,
    topCollections: collections.filter(c => c.doc_count > 0).slice(0, 20).map(c => ({
      name: c.name, documents: c.doc_count, description: c.description, authority: c.authority_default
    }))
  };
}

async function executeFindDocuments({ title, author, religion, collection, limit = 10 }) {
  const safeLimit = Math.min(limit || 10, 30);

  // Build a search query from title/author (Meilisearch handles typos and fuzzy matching)
  const searchTerms = [title, author].filter(Boolean).join(' ');

  if (searchTerms) {
    // Use Meilisearch for fuzzy search — handles misspellings, transliteration variants
    try {
      const { getMeili, INDEXES } = await import('../lib/search.js');
      const meili = getMeili();
      if (meili) {
        const filters = [];
        if (religion) filters.push(`religion = "${religion}"`);
        if (collection) filters.push(`collection = "${collection}"`);

        const result = await meili.index(INDEXES.DOCUMENTS).search(searchTerms, {
          limit: safeLimit,
          attributesToRetrieve: ['id', 'title', 'author', 'religion', 'collection', 'year', 'description', 'paragraph_count'],
          ...(filters.length > 0 ? { filter: filters.join(' AND ') } : {})
        });

        return {
          totalMatches: result.estimatedTotalHits || result.hits.length,
          showing: result.hits.length,
          documents: result.hits.map(d => ({
            id: d.id, title: d.title, author: d.author, religion: d.religion,
            collection: d.collection, year: d.year, description: d.description,
            paragraphs: d.paragraph_count
          }))
        };
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Meilisearch find_documents fallback to SQL');
    }
  }

  // Fallback: SQL for exact filters (or when Meilisearch unavailable)
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  if (title) { conditions.push('title LIKE ?'); params.push(`%${title}%`); }
  if (author) { conditions.push('author LIKE ?'); params.push(`%${author}%`); }
  if (religion) { conditions.push('religion = ?'); params.push(religion); }
  if (collection) { conditions.push('collection LIKE ?'); params.push(`%${collection}%`); }

  const countResult = await queryOne(
    `SELECT COUNT(*) as count FROM docs WHERE ${conditions.join(' AND ')}`, params
  );
  const docs = await queryAll(
    `SELECT id, title, author, religion, collection, year, description, paragraph_count
     FROM docs WHERE ${conditions.join(' AND ')} ORDER BY title LIMIT ?`,
    [...params, safeLimit]
  );

  return {
    totalMatches: countResult.count,
    showing: docs.length,
    documents: docs.map(d => ({
      id: d.id, title: d.title, author: d.author, religion: d.religion,
      collection: d.collection, year: d.year, description: d.description,
      paragraphs: d.paragraph_count
    }))
  };
}

async function executeReadDocument({ document_id, start = 0, limit = 10 }) {
  const safeLimit = Math.min(limit || 10, 30);

  const doc = await queryOne(
    'SELECT id, title, author, religion, collection, year, description FROM docs WHERE id = ? AND deleted_at IS NULL',
    [document_id]
  );

  if (!doc) return { error: 'Document not found' };

  const paragraphs = await queryAll(
    `SELECT paragraph_index, text, heading FROM content
     WHERE doc_id = ? AND deleted_at IS NULL
     ORDER BY paragraph_index LIMIT ? OFFSET ?`,
    [document_id, safeLimit, start]
  );

  return {
    document: { id: doc.id, title: doc.title, author: doc.author, religion: doc.religion, collection: doc.collection, year: doc.year },
    paragraphs: paragraphs.map(p => ({
      index: p.paragraph_index,
      heading: p.heading || null,
      text: p.text.substring(0, 1000)
    }))
  };
}

async function executeTool(name, args) {
  switch (name) {
    case 'search_library': return executeSearchLibrary(args);
    case 'library_stats': return executeLibraryStats();
    case 'find_documents': return executeFindDocuments(args);
    case 'read_document': return executeReadDocument(args);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ─── Route ────────────────────────────────────────────────────────────────

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
    reply.raw.setHeader('Access-Control-Expose-Headers', 'X-Server-Version');
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
        systemContent += `\n\n## Previous research context\n\n${researchContext}`;
      }

      const aiMessages = [
        { role: 'system', content: systemContent },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      // Tool calling loop — model may call tools multiple times before responding
      const MAX_TOOL_ROUNDS = 5;
      let citations = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: aiMessages,
          tools: TOOLS,
          tool_choice: round === 0 ? 'auto' : 'auto',
          stream: false, // Non-streaming for tool calls
          max_tokens: 2500,
          temperature: 0.7
        });

        const choice = response.choices[0];

        // If the model wants to call tools
        if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length > 0) {
          aiMessages.push(choice.message);

          // Execute all tool calls in parallel
          const toolResults = await Promise.all(
            choice.message.tool_calls.map(async (tc) => {
              const args = JSON.parse(tc.function.arguments || '{}');
              logger.info({ tool: tc.function.name, args, userId }, 'Jafar tool call');
              const result = await executeTool(tc.function.name, args);

              // Collect citations from search results
              if (tc.function.name === 'search_library' && Array.isArray(result)) {
                citations.push(...result.map(r => ({
                  document_id: r.document_id,
                  paragraph_index: r.paragraph_index,
                  text: r.text,
                  title: r.title,
                  author: r.author,
                  religion: r.religion,
                  collection: r.collection
                })));
              }

              return {
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result)
              };
            })
          );

          aiMessages.push(...toolResults);
          sendEvent({ type: 'tool_use', tools: choice.message.tool_calls.map(tc => tc.function.name) });
          continue; // Go back for next round
        }

        // Model is done with tools — stream the final response
        // Re-request with streaming now that tools are resolved
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

        break; // Done
      }

      if (citations.length > 0) {
        sendEvent({ type: 'citations', citations });
      }

      sendEvent({ type: 'complete', citations });
      reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      reply.raw.end();
    }

    return reply;
  });
}
