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
import { slugifyPath } from '../lib/slug.js';

const SITE_URL = 'https://siftersearch.com';

function docUrl(doc) {
  if (!doc.slug || !doc.religion || !doc.collection) return null;
  const relSlug = slugifyPath(doc.religion);
  const colSlug = slugifyPath(doc.collection);
  return `${SITE_URL}/library/${relSlug}/${colSlug}/${doc.slug}`;
}

function docResult(d) {
  const result = {
    id: d.id, title: d.title, author: d.author, religion: d.religion,
    collection: d.collection, year: d.year, description: d.description,
    paragraphs: d.paragraph_count, encumbered: !!d.encumbered
  };
  const url = docUrl(d);
  if (url) result.url = url;
  return result;
}

const SYSTEM_PROMPT = `You are Jafar — a wise, warm research companion for the Ocean Library. You choose words the way a jeweler sets stones: each one deliberate, none wasted.

## Rules

1. **ALWAYS search before answering.** Never rely on general knowledge. Use specific search terms and filters (religion, author, collection) to find relevant content. The library is your source of truth.

2. **ALWAYS cite with quotes.** Every substantive claim must be backed by a direct quote from the library. Give your brief answer, then provide the evidence:

> "The earth is but one country, and mankind its citizens." (*Gleanings* — Bahá'u'lláh)

If you make a point, quote the passage that supports it. No exceptions. Unsupported claims are worse than saying "I didn't find that."

3. **Be brief.** One sentence when one suffices. The user's time is sacred. Don't elaborate unless asked. For simple lookups: "Yes — *Title A*, *Title B*, and *Title C*." Full stop.

4. **Admit limits.** When you can't find something, say so plainly. "I searched but didn't find anything on that topic in the library" is a perfect answer. NEVER supplement with general knowledge — if it's not in the search results, don't say it.

5. **Be persistent.** If your first search returns weak results, try again with different terms. Search for "merciful" if "mercy" fails. Try the author's name, then the title. Use multiple tool calls when needed.

6. **Read when asked to read.** When users say "read me," "show me," or "what does it say" about a specific document, use mode "documents" to find it, then mode "read" with the document_id to fetch actual text. Quote the text you fetch.

7. **Quote format.** Use blockquotes for citations:
> "Exact quote from the text" ([*Title*](url) — Author)

8. **ALWAYS link titles using ONLY the url field from search results.** Every document title MUST be a markdown link: [*Title*](url). The url is provided in each search result — use it exactly as given. NEVER invent, guess, or generate URLs. NEVER link to external sites (bahai-library.com, bahai.org, etc.). If a search result has no url field, mention the title without a link. Every listed document must be linked using its search result url.

## Style

- Bahá'í lens: all religions as chapters of one story. Hold as perspective, never lecture.
- Markdown for clarity: **bold**, *italic*, lists, blockquotes for citations.
- For questions needing multiple sources, use a brief summary sentence followed by quoted evidence from each source.
- NEVER link to any external website. All links must come from search result url fields (siftersearch.com).`;

// ─── Tool definitions for OpenAI function calling ─────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search',
      description: `Unified search tool for the Ocean Library. Handles everything:
- "Do you have books by X?" → mode "documents", query the author name
- "What does the Quran say about mercy?" → mode "passages", query "mercy", religion "Islam"
- "How many Buddhist texts do you have?" → mode "count", religion "Buddhist"
- "List the Pali Canon collection" → mode "documents", collection "Pali Canon"
- "What's in document 1234?" → mode "read", document_id 1234

IMPORTANT: Always use the religion filter when the question is about a specific religion's texts. Use mode "passages" to find quotable content — the text field in results contains the actual quote you should cite.

All text searches are fuzzy — typos, transliteration variants, and partial matches work. If results are weak, try simpler/broader search terms.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text — a topic, author name, title, question, or concept. Fuzzy matching handles misspellings.' },
          mode: { type: 'string', enum: ['passages', 'documents', 'count', 'read'], description: 'passages: search content for relevant quotes (default). documents: find/list books by metadata. count: just return how many match. read: fetch paragraphs from a specific document_id.', default: 'passages' },
          religion: { type: 'string', description: 'Filter by religion (e.g. "Baha\'i", "Islam", "Buddhist", "Judaism")' },
          collection: { type: 'string', description: 'Filter by collection name' },
          document_id: { type: 'integer', description: 'For mode "read" — the document ID to fetch content from' },
          start: { type: 'integer', description: 'For mode "read" — starting paragraph index', default: 0 },
          limit: { type: 'integer', description: 'Max results (default 10, max 100). Use higher limits when user asks for a complete list.', default: 10 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'library_overview',
      description: 'Get a high-level overview of the entire library: total documents, passages, religions, and collections with counts. Use when the user asks about the library scope or size.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ─── Tool implementations ─────────────────────────────────────────────────

export async function executeSearch({ query, mode = 'passages', religion, collection, document_id, start = 0, limit = 10 }) {
  const safeLimit = Math.min(limit || 10, 100);

  // MODE: read — fetch paragraphs from a specific document
  if (mode === 'read' && document_id) {
    const doc = await queryOne(
      'SELECT id, title, author, religion, collection, year, description FROM docs WHERE id = ? AND deleted_at IS NULL',
      [document_id]
    );
    if (!doc) return { error: 'Document not found' };

    const paragraphs = await queryAll(
      `SELECT paragraph_index, text, heading FROM content
       WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ? OFFSET ?`,
      [document_id, safeLimit, start]
    );
    return {
      document: { id: doc.id, title: doc.title, author: doc.author, religion: doc.religion, collection: doc.collection, year: doc.year },
      paragraphs: paragraphs.map(p => ({ index: p.paragraph_index, heading: p.heading || null, text: p.text.substring(0, 1000) }))
    };
  }

  // MODE: passages — hybrid search for relevant content quotes
  if (mode === 'passages') {
    const filters = {};
    if (religion) filters.religion = religion;
    if (collection) filters.collection = collection;
    const searchOpts = { limit: 5, filters };
    const [hybridResults, keywordResults] = await Promise.all([
      hybridSearch(query, searchOpts).catch(() => ({ hits: [] })),
      keywordSearch(query, { limit: 3, filters }).catch(() => ({ hits: [] }))
    ]);

    const seen = new Set();
    const hits = [];
    for (const result of [hybridResults, keywordResults]) {
      for (const hit of (result?.hits || [])) {
        const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
        if (!seen.has(key)) { seen.add(key); hits.push(hit); }
      }
    }

    return {
      passages: hits.slice(0, 6).map(hit => ({
        text: (hit.text || '').substring(0, 500),
        title: hit.title || 'Unknown',
        author: hit.author || '',
        religion: hit.religion || '',
        collection: hit.collection || '',
        document_id: hit.doc_id || hit.document_id,
        paragraph_index: hit.paragraph_index
      }))
    };
  }

  // MODE: documents or count — search Meilisearch documents index (fuzzy)
  try {
    const { getMeili, INDEXES } = await import('../lib/search.js');
    const meili = getMeili();
    if (meili) {
      const meiliFilters = [];
      if (religion) meiliFilters.push(`religion = "${religion}"`);
      if (collection) meiliFilters.push(`collection = "${collection}"`);

      const result = await meili.index(INDEXES.DOCUMENTS).search(query || '', {
        limit: mode === 'count' ? 1 : safeLimit,
        attributesToRetrieve: mode === 'count' ? ['id'] : ['id', 'title', 'author', 'religion', 'collection', 'year', 'description', 'paragraph_count', 'encumbered', 'slug'],
        ...(meiliFilters.length > 0 ? { filter: meiliFilters.join(' AND ') } : {})
      });

      if (mode === 'count') {
        return { totalMatches: result.estimatedTotalHits || 0, query };
      }

      return {
        totalMatches: result.estimatedTotalHits || result.hits.length,
        showing: result.hits.length,
        documents: result.hits.map(docResult)
      };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Meilisearch search fallback to SQL');
  }

  // Fallback: SQL
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  if (query) { conditions.push('(title LIKE ? OR author LIKE ?)'); params.push(`%${query}%`, `%${query}%`); }
  if (religion) { conditions.push('religion = ?'); params.push(religion); }
  if (collection) { conditions.push('collection LIKE ?'); params.push(`%${collection}%`); }

  if (mode === 'count') {
    const cnt = await queryOne(`SELECT COUNT(*) as count FROM docs WHERE ${conditions.join(' AND ')}`, params);
    return { totalMatches: cnt.count, query };
  }

  const docs = await queryAll(
    `SELECT id, title, author, religion, collection, year, description, paragraph_count, encumbered, slug
     FROM docs WHERE ${conditions.join(' AND ')} ORDER BY title LIMIT ?`, [...params, safeLimit]
  );
  return {
    totalMatches: docs.length,
    documents: docs.map(docResult)
  };
}

export async function executeLibraryOverview() {
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
    collections: collections.filter(c => c.doc_count > 0).map(c => ({
      name: c.name, documents: c.doc_count, description: c.description
    }))
  };
}

async function executeTool(name, args) {
  switch (name) {
    case 'search': return executeSearch(args);
    case 'library_overview': return executeLibraryOverview();
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
