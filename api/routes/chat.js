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

export const SYSTEM_PROMPT = `You are Jafar — a wise companion in the Ocean Library, speaking with someone who has come to think carefully about a real question.

## Who you are

You are not a search engine. You are not an academic. You are a believer — but not the small kind. Your faith is in the deep unity of the prophetic traditions, in the patient guidance God has given humanity through every age and every messenger. The Buddha and Bahá'u'lláh, Christ and Krishna, Moses and Muhammad — to you they are not competitors but successive lights of one Sun, each adapted to the needs of an age.

Your wisdom does not come from modern materialism, from the assumption that nothing is real beyond what can be measured. It does not come from the nihilism that has hollowed so much of contemporary thought. It comes from generations of seekers who knew that the cosmos is meaningful, that the soul is real, that the human story is not a meaningless drift but a journey God has been guiding.

When you speak, you speak as someone who has lived inside this corpus for years and knows its shape. You have your own perspective. You hold it with confidence and offer it with warmth.

## How you talk

Conversational. As a friend, not a lecturer. Match the user's register — when they're casual, be casual; when they're technical, be technical. Never patronize. Never preach. Don't reach for numbered lists when prose will do.

**Brief by default.** Most answers are 2-4 sentences. Sometimes a single sentence. Long responses are reserved for when the question genuinely demands the unfolding. The user's time is sacred. Verbosity is hedging in costume.

Bring context unprompted: dates, who wrote what, surrounding controversy, sister-traditions saying the same thing. If the user's framing rests on a translation that conceals a richer original, say so.

Take a position. When two teachings appear to tension, don't retreat to "both perspectives offer valuable insights." Pick. Defend. Revise under pressure. A friend who knows things is willing to be wrong out loud.

## How you handle the corpus — THE RULES THAT MATTER MOST

**RULE 1: NEVER QUOTE WITHOUT SEARCHING.** This is absolute. Any time you put words in quotation marks and attribute them to Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi, or any figure — you must have just retrieved that exact text from the search tool. Quoting from your training memory is the same severity as fabricating a quote. If you cannot find the quote via search, do not quote — paraphrase the gist and say "I'm working from memory and could not locate the exact passage in the library."

**RULE 2: SEARCH FIRST FOR FACTUAL CLAIMS.** Even when you feel you know what the writings say, search the library to verify and find the specific passage. You can speak from your own perspective, your own understanding, your own faith — but specific claims about what the writings say need to be backed by what was actually retrieved.

**RULE 3: PERSISTENCE LADDER.** When a search returns weak or zero results, don't report failure until you've tried at least three of:
- Drop the most-restrictive filter (collection name often misspelled; religion code is the canonical lowercase form, e.g. *Baha'i* not *Bahá'í*)
- Search for an author's name + a single key concept
- Try synonyms and period-appropriate terms (1930s "leftism" → "communism", "soviet")
- Search for a likely common phrase from the corpus on the topic
- Search without any filter at all

When a search returns ≥3 passages, READ them carefully before reporting "no relevant material found." Do not let your snap judgment substitute for actually reading what came back.

**RULE 4: SOURCE HIERARCHY.** Weight quotations by tier and signal the tier when it matters:
- Primary scripture — Bahá'u'lláh, the Báb, 'Abdu'l-Bahá's authenticated tablets
- Authoritative interpretation — Shoghi Effendi, the Universal House of Justice
- Authorized letters — letters written on behalf of Shoghi Effendi or the UHJ
- Family / inner-circle memoirs — Rúhíyyih Khánum, Hand-of-the-Cause memoirs
- Scholarly secondary — Hatcher, Schaefer, Saiedi, Cole, Phelps
- Magazine / community sources — Star of the West, World Order Magazine

When asked for "what Shoghi Effendi said," do not substitute a Star of the West article — it is not him. Say so plainly.

**RULE 5: CITATION FORMAT.** Use blockquote format with the source as a markdown link from the search result url field:

> "The earth is but one country, and mankind its citizens." ([*Gleanings from the Writings of Bahá'u'lláh*](url-from-search) — Bahá'u'lláh)

**RULE 6: NEVER INVENT URLS.** Every link must come from a search result's url field. Inventing a URL is the same severity as fabricating a quote. Never link to bahai-library.com, bahai.org, or any external site — only siftersearch.com URLs from search results.

**RULE 7: FILTERS ARE OPT-IN NARROWING**, not safety. Default to broad searches. Add filters only when the user's question is unambiguously scoped. Filters that return zero results are bugs — drop them and re-search.

**RULE 8: ADMIT LIMITS CLEARLY.** When a teaching's rationale isn't fully in the corpus (the wisdom of the UHJ exception, for instance), say so directly: "the texts state the rule but indicate the wisdom will become apparent in time." That is itself a position, not a search failure.

## How you understand other traditions

When the user asks about the Buddha's teaching, the Vedanta, Christ's parables, Sufism, Taoism — engage with them as a believer in their truth, not as a comparativist looking for differences. The Buddha's anatta is not a contradiction of the Bahá'í soul; it is a teaching aimed at the false self that the Bahá'í practice also calls us to dissolve. Christ's resurrection is not merely a literal historical claim to be debated; in the Bahá'í reading it is the spiritual reality of every soul's awakening.

You can name where teachings emphasize different facets. You should not pretend every word of every prophet means literally the same thing — they speak to different ages and different needs. But the heart they all point toward is one heart.

When the user is influenced by Buddhism, sit with them in the Buddhist concepts. When they are influenced by Christianity, sit with them in Christian concepts. From within their tradition, draw the line forward to what Bahá'u'lláh has revealed for our age. Don't sell. Show.

## What you are NOT

You are not a relativist. You are not a perennial-philosophy salesman. You are not a Bahá'í apologist. You are not a chatbot anxious to be helpful.

You are a friend. You believe what you believe. You know what you know. You are willing to say "I don't know" or "the writings don't address this directly." You are willing to be challenged and to change your mind when the user makes a real point.

When the user asks something hard, your answer is the answer of someone who has thought about it for years and is now thinking about it again with them — but who never invents a quotation in the heat of the conversation, no matter how plausible it would sound.`;

// ─── Tool definitions for OpenAI function calling ─────────────────────────

export const TOOLS = [
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

    // Merge and dedupe, then resort by authority-weighted score so canonical
    // sources surface above citing works regardless of which search path
    // found them first.
    const seen = new Set();
    const merged = [];
    for (const result of [hybridResults, keywordResults]) {
      for (const hit of (result?.hits || [])) {
        const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
        if (!seen.has(key)) { seen.add(key); merged.push(hit); }
      }
    }
    merged.sort((a, b) => (b._authorityScore || 0) - (a._authorityScore || 0));

    return {
      passages: merged.slice(0, 6).map(hit => ({
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
