/**
 * Research Assistant Chat Routes — Anís (POST /api/chat/stream)
 *
 * POST /api/chat/stream - Streaming conversational research assistant
 *
 * Uses OpenAI function calling with library tools:
 * - search_library: hybrid search across all documents
 * - library_stats: overview of religions, collections, document counts
 * - find_documents: search by author, title, collection, religion
 * - read_document: fetch paragraphs from a specific document
 */

import { readLibraryStats, countList, religionCollectionCounts } from '../lib/library/library-stats.js';
import { hybridSearch, keywordSearch, multiIndexSearch } from '../lib/search.js';
import { entityLookup, entityDossier, entitySearch } from '../lib/entity-api.js';
import { optionalAuthenticate } from '../lib/auth.js';
import { participantId, writeSessionCookieRaw, accountFromCookie } from '../lib/anonymous.js';
import { linkFor } from '../lib/source-links.js';
import { logger } from '../lib/logger.js';
import { queryOne, queryAll } from '../lib/db.js';
import { externalParaIdsByIds, paragraphMetaAt } from '../lib/paragraphs-repo.js';
import { previewWindow, PREVIEW_PARAGRAPHS } from '../lib/rights/preview.js';

const ENCUMBERED_RANGE = 3;   // the most consecutive paragraphs of a copyrighted book a chat tool reads at once
import { slugifyPath } from '../lib/slug.js';
import { headOf } from '../lib/text/head-of.js';
import { rankByTitle } from '../lib/title-rank.js';

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

// (The Jafar system prompt is gone: Anís has one prompt source, api/lib/assistant/prompt.js.)

// ─── Tool definitions for OpenAI function calling ─────────────────────────

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search',
      description: `Search for quotable passages and documents in the Ocean Library.

Use this for:
- "What does the Quran say about mercy?" → mode "passages", query "mercy", religion "Islam"
- "Do you have books by X?" → mode "documents", query the author name
- "What's in document 1234?" → mode "read", document_id 1234

Do NOT use this for catalog/coverage questions ("what do you have", "how many", "list collections", "what languages"). Use library_overview for those.

IMPORTANT: Always use the religion filter when the question is about a specific religion's texts. Use mode "passages" to find quotable content — the text field in results contains the actual quote you should cite.

All text searches are fuzzy — typos, transliteration variants, and partial matches work.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text — a topic, author name, title, question, or concept. Fuzzy matching handles misspellings.' },
          mode: { type: 'string', enum: ['passages', 'documents', 'count', 'read'], description: 'passages: search content for relevant quotes (default). documents: find/list books by metadata. count: just return how many match. read: fetch paragraphs from a specific document_id.', default: 'passages' },
          religion: { type: 'string', description: 'Filter by religion (e.g. "Baha\'i", "Islam", "Buddhist", "Judaism")' },
          collection: { type: 'string', description: 'Filter by collection name' },
          language: { type: 'string', description: 'Filter by document language code (e.g. "en" for English, "ar" for Arabic)' },
          document_id: { type: 'integer', description: 'Scope to a specific book/document. Works with mode "passages" (search within that book) AND mode "read" (fetch paragraphs sequentially). Get the ID from find_document_for_citation.' },
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
      description: `Returns a structured snapshot of the entire library: total documents, total paragraphs, religion counts (per tradition: how many docs, how many paragraphs), and collection counts (per collection name within each religion). Call this when:
- the user asks about library scope, size, or coverage ("how big is your library?", "how many books do you have?")
- the user asks what's available on a tradition ("do you have anything on Sufism?", "what Buddhist texts do you carry?")
- you're about to answer a question on a tradition you suspect might be thinly represented in the corpus — checking coverage first prevents asserting from training memory when the corpus is sparse
- the user asks about a specific collection ("the Pali Canon", "the Tablet Translations") and you need to know if it exists and how big it is`,
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_document_for_citation',
      description: `Locate a specific NAMED scripture or work by title — *the* citation lookup. Use this BEFORE quoting from a named text. Also use when user asks "What does [author] say about X" where the author has a canonical text: Lao Tzu → "Tao Te Ching", Confucius → "Analects", the Buddha (Dhammapada context) → "Dhammapada", Moses → "Genesis"/"Torah", Isaiah → "Isaiah", Zoroaster → "Gathas". Searches the documents index by title with a primary-source authority boost: canonical scriptures (Aqdas, Iqán, Hidden Words, Gleanings, Some Answered Questions; the Gospels; Qur'án; Pali Canon; Upanishads, Bhagavad Gita; Guru Granth Sahib) rank ABOVE commentaries, papers, and pilgrim notes that share the title. Returns up to 5 candidates with document_id, title, author, paragraph_count, and an is_primary flag. Then call read_document_for_question with the document_id of the primary match. Use search with mode:"passages" for topic searches; use this tool when the user is asking about a specific named work.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The work\'s name as the user said it (or as it\'s commonly known): "Tablet of Wisdom", "Lawh-i-Hikmat", "Gospel of John", "Bhagavad Gita".' },
          religion: { type: 'string', description: 'Tradition filter: "Baha\'i", "Christian", "Islam", "Buddhist", "Hindu", "Judaism", "Sikh", "Jain", "Confucian", "Tao", "Zoroastrian".' },
          author: { type: 'string', description: 'Optional partial author name filter, useful when multiple works share a title (e.g., "Bahá\'u\'lláh" to disambiguate from \'Abdu\'l-Bahá tablets).' },
          limit: { type: 'integer', description: 'Max candidates to return (default 5).', default: 5 }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'document_info',
      description: `Everything catalogued ABOUT one document (not its text): for a tablet — to whom it was addressed, date (Gregorian and Hijri), place of revelation, period, the collection it belongs to, manuscripts, where it has been published and translated, subjects, recitations, scholarly notes; for a book — author, translator, publisher, year, subjects. Sources: Stephen Phelps' Partial Inventory, oceanoflights.org, the library. Use when the user asks about a document's circumstances ("to whom was this tablet written?", "when and where was it revealed?", "has it been translated?"). Needs a document_id (from search or find_document_for_citation).`,
      parameters: { type: 'object', properties: { document_id: { type: 'integer' } }, required: ['document_id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_documents_by_metadata',
      description: `Find DOCUMENTS (not passages) by what is catalogued about them: recipient, place of revelation, date range, subjects, names. E.g. "tablets to Mullá Ḥusayn", "tablets revealed in Adrianople", "Bahá'u'lláh's tablets from 1868", "prayers for healing". Returns document ids with a one-line description each; pass the ids to read_document_for_question, or quote them. Use this before a passage search when the question is about a document's circumstances.`,
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'free text: a name, place, subject or title' },
        kind: { type: 'string', enum: ['tablet', 'book'] },
        author: { type: 'string', description: "exact author as catalogued, e.g. Bahá'u'lláh, 'Abdu'l-Bahá, The Báb" },
        place: { type: 'string' }, year_from: { type: 'integer' }, year_to: { type: 'integer' },
        limit: { type: 'integer', default: 10 }
      } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_document_for_question',
      description: `Targeted read of a document via a sub-agent — keeps your conversation thread clean. Pass document_id and the user's question; sub-agent returns a 1-3 sentence summary plus 2-3 verbatim excerpts. Document body never enters your context.

For named sections inside a compilation (e.g. the Tablet of Wisdom inside "Tablets of Bahá'u'lláh Revealed After the Aqdas", or the Epilogue of the Dawn-Breakers), find_document_for_citation will return a candidate with start_paragraph and end_paragraph — pass those through here so the sub-agent reads ONLY that section, not the entire compilation.

For standalone small works, omit start_paragraph/end_paragraph and the sub-agent reads from paragraph 0 up to max_paragraphs.`,
      parameters: {
        type: 'object',
        properties: {
          document_id: { type: 'integer', description: 'The document_id from a prior find_document_for_citation result.' },
          question: { type: 'string', description: 'The full question the sub-agent should target while reading.' },
          start_paragraph: { type: 'integer', description: 'Inclusive start of paragraph range (when reading a named section inside a compilation). Use the start_paragraph value from the find_document_for_citation candidate.' },
          end_paragraph: { type: 'integer', description: 'Inclusive end of paragraph range (when reading a named section inside a compilation). Use the end_paragraph value from the find_document_for_citation candidate.' },
          max_paragraphs: { type: 'integer', description: 'Cap on paragraphs fetched when not using a range (default 250, max 1000).', default: 250 }
        },
        required: ['document_id', 'question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'library_count',
      description: `Count documents matching any combination of filters. Use when the user asks filtered coverage questions:
- "How many documents do you have from bahai-library.com?" → site: "bahai-library.com"
- "How many books by Udo Shaefer?" → author: "Udo Shaefer"
- "How many Islamic texts do you carry in Arabic?" → religion: "Islam", language: "Arabic"
- "How many primary-source Bahá'í documents?" → religion: "Baha'i", scope: "primary"
Returns the count plus up to 5 sample titles so you can verify the filter is working.
For an unfiltered total of the whole library, use library_overview instead.`,
      parameters: {
        type: 'object',
        properties: {
          author:     { type: 'string', description: 'Partial author name (e.g. "Udo Shaefer", "Bahá\'u\'lláh")' },
          religion:   { type: 'string', description: 'Tradition name (e.g. "Baha\'i", "Buddhist", "Islam", "Hindu")' },
          site:       { type: 'string', description: 'Source website domain (e.g. "bahai-library.com", "oceanlibrary.com")' },
          language:   { type: 'string', description: 'Language name (e.g. "Arabic", "Persian", "French", "English")' },
          collection: { type: 'string', description: 'Collection name — partial match (e.g. "Pali Canon", "Gleanings")' },
          scope:      { type: 'string', enum: ['primary', 'supplemental'], description: '"primary" = Ocean Library curated docs; "supplemental" = external site documents (e.g. bahai-library.com)' }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'translate_passage',
    description: 'Translate an Arabic, Persian, or Hebrew passage into English using JAFAR-grounded translation that follows Shoghi Effendi\'s concordance for Bahá\'í terminology and the corpus consensus for other terms. Returns the translation plus the JAFAR term analysis. Use when the user asks for a translation, asks "what is the original word for X in this passage", or wants paired original-and-English display. Cached by content hash so repeated calls are free.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The source-language passage to translate.' },
        source_lang: { type: 'string', enum: ['ar', 'fa', 'he', 'auto'], description: 'Source language code; "auto" or omitted = detect from script.' },
        work_context: { type: 'string', description: 'Optional — e.g. "from Bahá\'u\'lláh\'s Tablet of Wisdom" — helps the translator match register.' }
      },
      required: ['text']
    }
  },
  {
    type: 'function',
    function: {
      name: 'entity_lookup',
      description: 'Resolve a PERSON/place/work NAME (any transliteration — Sadeq=Ṣádiq, Rezvan=Riḍván, Ghoddus=Quddús) to candidate entities in the Bábí-Bahá\'í prosopography. Fast; returns candidate ids + names. Use to get an entity id before entity_dossier, or to disambiguate which person a name refers to. RECALL only — candidates are possibilities to confirm by evidence.',
      parameters: { type: 'object', properties: { q: { type: 'string', description: 'the name, any spelling' }, type: { type: 'string', enum: ['person', 'place', 'work', 'group'], description: 'optional entity-type filter' } }, required: ['q'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'entity_dossier',
      description: 'Get a person\'s CITED biographical facts from the evidence-reconciled entity database: each claim carries a relation, object, verbatim proof span, time (pin/estimate), source book, and a paragraph link. Use for "who was X", "when/where did X do Y", kinship/relationship questions. Pass the entity id from entity_lookup.',
      parameters: { type: 'object', properties: { id: { type: 'integer', description: 'entity id (from entity_lookup)' } }, required: ['id'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'entity_search',
      description: 'Find PEOPLE whose cited facts match a description, role, or event (e.g. "amanuensis of the Báb", "died at Fort Ṭabarsí", "governor of Fárs"). Returns candidate people each with their matching cited claims as evidence. Use for descriptive/relational person questions a name lookup can\'t answer.',
      parameters: { type: 'object', properties: { q: { type: 'string', description: 'the description / role / event to match' } }, required: ['q'] }
    }
  }
];

// ─── Tool implementations ─────────────────────────────────────────────────

// plan: { messages?, defaults? } → Jev-planned retrieval (search-plan.js) instead of the raw engine; same output + _plan.
/**
 * (doc_id:paragraph_index) → external_para_id for OceanLibrary hits. Hydrated hits carry it (paragraphDoc); the rest are
 * read by content id (primary key). It was one `doc_id = ? AND paragraph_index IN (...)` per doc, which walks the whole
 * document (no such index): worst 2,466 ms on the API thread (11-03). Hits with neither are left without a deep link.
 */
export async function olParaIds(olHits, { byIds = externalParaIdsByIds, at = paragraphMetaAt } = {}) {
  const out = new Map();
  const key = (h) => `${h.doc_id || h.document_id}:${h.paragraph_index}`;
  const hasId = (h) => h.id != null && Number.isInteger(Number(h.id));
  const need = olHits.filter((h) => {
    if (h.external_para_id === undefined) return true;
    if (h.external_para_id) out.set(key(h), h.external_para_id);
    return false;
  });
  const withId = need.filter(hasId);
  // keyed by the row's own doc/index, so an id that is not this hit's paragraph never lends it a link
  if (withId.length) for (const r of await byIds(withId.map((h) => h.id))) {
    if (r.external_para_id) out.set(`${r.doc_id}:${r.paragraph_index}`, r.external_para_id);
  }
  // a hit with no content id: the (doc, index) read — rare, and the slow path
  const byDoc = new Map();
  for (const h of need) {
    const d = h.doc_id || h.document_id;
    if (hasId(h) || d == null || !Number.isInteger(h.paragraph_index)) continue;
    (byDoc.get(d) || byDoc.set(d, []).get(d)).push(h.paragraph_index);
  }
  for (const [d, idx] of byDoc) for (const r of await at(d, idx)) if (r.external_para_id) out.set(`${d}:${r.paragraph_index}`, r.external_para_id);
  return out;
}

// A passage's text is cut (sentence-bounded, marked " …") at textChars: external API callers and the legacy chat tool loop
// keep their old ~500-character size. Anís passes Infinity and cuts for himself (prompt.js passageText, researcher.js show):
// a 500 cut lost a footnote's date ("…ended in 1963 with the first el") and every quoted phrase past character 500.
export const SEARCH_TEXT_CHARS = 500;

export async function executeSearch({ query, mode = 'passages', religion, collection, author, writerOnly, language, document_id, yearFrom, yearTo, start = 0, limit = 10, scope_config, semanticRatio, entityIds, phrase, plan, textChars = SEARCH_TEXT_CHARS }) {
  const safeLimit = Math.min(limit || 10, 100);

  // MODE: read — fetch paragraphs from a specific document
  if (mode === 'read' && document_id) {
    const doc = await queryOne(
      'SELECT id, title, author, religion, collection, year, description, encumbered FROM docs WHERE id = ? AND deleted_at IS NULL',
      [document_id]
    );
    if (!doc) return { error: 'Document not found' };
    // a copyrighted (encumbered) book is read only in its first 40 paragraphs — by any tool, for anyone (Chad 10-23)
    const win = previewWindow({ encumbered: doc.encumbered === 1, offset: start, limit: safeLimit });

    const paragraphs = win.limit <= 0 ? [] : await queryAll(
      `SELECT paragraph_index, text, heading FROM content
       WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ? OFFSET ?`,
      [document_id, win.limit, win.offset]
    );
    return {
      ...(win.previewLimit ? { copyright: `Under copyright: only the first ${win.previewLimit} paragraphs can be read; quote it only in short excerpts.` } : {}),
      document: { id: doc.id, title: doc.title, author: doc.author, religion: doc.religion, collection: doc.collection, year: doc.year },
      paragraphs: paragraphs.map(p => ({ index: p.paragraph_index, heading: p.heading || null, text: headOf(p.text, 1000) }))
    };
  }

  // MODE: passages — multi-index merged search across paragraphs + HyPE
  // sidecar (and future enrichment layers). Falls back to legacy
  // hybrid+keyword path if multiIndexSearch isn't available (e.g., HyPE
  // index empty during early backfill — the merge still works because
  // hype side returns 0 hits, contributing 0 RRF weight).
  if (mode === 'passages') {
    const filters = {};
    if (religion) filters.religion = religion;
    if (collection) filters.collection = collection;
    if (author) filters.author = author;
    if (language) filters.language = language;
    if (document_id) filters.documentId = document_id;
    if (writerOnly) filters.writerOnly = true;
    if (yearFrom != null) filters.yearFrom = yearFrom;
    if (yearTo != null) filters.yearTo = yearTo;

    let merged;
    let planInfo = null;
    let entitiesOut = null;
    let peopleAnswerOut = null;
    if (plan && !phrase) {
      const { plannedSearch } = await import('../lib/planned-search.js');
      const r = await plannedSearch(query, { messages: plan.messages, given: filters, defaults: plan.defaults, limit: safeLimit, scope_config, entityIds, hints: plan.hints });
      merged = r.hits || [];
      entitiesOut = r.entities || null;
      peopleAnswerOut = r.peopleAnswer || null;
      planInfo = { shape: r.plan.shape, about: r.plan.about, filters: r.plan.filters, prefer: r.plan.prefer?.author || null, comparative: r.plan.comparative,
        widened: r.widened, relaxed: r.relaxed, cached: r.cached, timings: r.timings, error: r.plan.error || null, resolution: r.resolution, target: r.target || null,
        provenance: r.plan.provenance || null, reason: r.plan.reason || null, overridden: r.plan.overridden || null, quote: r.plan.quote || null, plan_ms: r.plan.ms ?? null };
    } else if (phrase) {
      // PHRASE mode (quote-source lookups): pure BM25 straight to the paragraphs
      // index — Meili honors "quoted phrases" in q. The multi-index merge below
      // would blend in HyPE-question hits, which match ANY text semantically and
      // pollute an exact-phrase lookup with thematic cousins.
      const r = await hybridSearch(query, { limit: safeLimit, filters, scope_config, semanticRatio: 0 }).catch(() => ({ hits: [] }));
      merged = r.hits || [];
    } else {
    try {
      const result = await multiIndexSearch(query, { limit: safeLimit, filters, scope_config, ...(semanticRatio != null ? { semanticRatio } : {}), ...(entityIds?.length ? { entityIds } : {}) });
      merged = (result.hits || []).map(hit => ({
        ...hit,
        _matched_via_hype: !!hit.matched_hype
      }));
    } catch (err) {
      logger.warn({ err: err.message }, 'multiIndexSearch failed, falling back to legacy path');
      const [hybridResults, keywordResults] = await Promise.all([
        hybridSearch(query, { limit: safeLimit, filters, scope_config }).catch(() => ({ hits: [] })),
        keywordSearch(query, { limit: Math.max(3, Math.floor(safeLimit / 2)), filters }).catch(() => ({ hits: [] }))
      ]);
      const seen = new Set();
      merged = [];
      for (const r of [hybridResults, keywordResults]) {
        for (const hit of (r?.hits || [])) {
          const key = `${hit.doc_id || hit.document_id}:${hit.paragraph_index}`;
          if (!seen.has(key)) { seen.add(key); merged.push(hit); }
        }
      }
      merged.sort((a, b) => (b._authorityScore || 0) - (a._authorityScore || 0));
    }
    } // close phrase/multi-index branch

    // Enrich hits with source-site provenance + external paragraph IDs so
    // OL (and other sites) can render proper deep-links. The Meili paragraph
    // index doesn't carry these fields — pull them from SQLite at result time
    // (one keyed lookup per result, batched).
    const top = merged.slice(0, safeLimit);
    const docIds = [...new Set(top.map(h => h.doc_id || h.document_id).filter(Boolean))];
    let docMeta = new Map();
    if (docIds.length > 0) {
      const placeholders = docIds.map(() => '?').join(',');
      const docRows = await queryAll(
        `SELECT id, slug, filename, religion, collection, language, source_site, source_url, title, author, metadata FROM docs WHERE id IN (${placeholders})`,
        docIds
      );
      docMeta = new Map(docRows.map(r => [r.id, r]));

      // For docs without source_url, find OceanLibrary equivalent. OL is always preferred.
      // Two-pass: (1) exact title match, (2) keyword overlap for different translations
      // of the same scripture (e.g. "The Koran Interpreted" → OL Quran surah collection).
      const noUrlRows = docRows.filter(r => !r.source_site && r.title);
      if (noUrlRows.length > 0) {
        // Pass 1: exact title match
        const titleList = noUrlRows.map(r => r.title);
        const olExact = await queryAll(
          `SELECT title, source_url FROM docs WHERE source_site = 'oceanlibrary.com' AND title IN (${titleList.map(() => '?').join(',')}) AND source_url IS NOT NULL`,
          titleList
        );
        const olByTitle = new Map(olExact.map(r => [r.title, r.source_url]));

        // Pass 2: scripture-keyword fuzzy fallback — map local copies to their OL equivalent.
        // Narrow by title pattern to avoid cross-assigning (e.g. Bukhari title ≠ 'Qur%').
        const SCRIPTURE_KEYWORDS = [
          { pattern: /qur['\u2019a]|quran|koran/i,       olReligion: 'Islam',     olTitleLike: '%Qur%' },
          { pattern: /\bbible\b|gospel|testament|psalm/i, olReligion: 'Christian', olTitleLike: '%Gospel%' },
          { pattern: /torah|tanakh|talmud|mishnah/i,      olReligion: 'Judaism',   olTitleLike: '%Torah%' },
          { pattern: /dhammapada|nikaya|sutta|pali/i,     olReligion: 'Buddhist',  olTitleLike: '%Dhammapada%' },
          { pattern: /gita|upanishad|veda|mahabharata/i,  olReligion: 'Hindu',     olTitleLike: null },
        ];
        const olByKey = new Map(); // `${olReligion}|${olTitleLike}` → best OL source_url

        for (const row of noUrlRows) {
          if (olByTitle.has(row.title)) {
            row.source_url = olByTitle.get(row.title);
            row.source_site = 'oceanlibrary.com';
            continue;
          }
          const match = SCRIPTURE_KEYWORDS.find(k => k.pattern.test(row.title));
          if (!match) continue;
          const cacheKey = `${match.olReligion}|${match.olTitleLike || ''}`;
          if (!olByKey.has(cacheKey)) {
            const params = [match.olReligion];
            const titleClause = match.olTitleLike ? ' AND d.title LIKE ?' : '';
            if (match.olTitleLike) params.push(match.olTitleLike);
            const [best] = await queryAll(
              `SELECT d.source_url FROM docs d
               WHERE d.source_site = 'oceanlibrary.com' AND d.religion = ?${titleClause} AND d.source_url IS NOT NULL
               ORDER BY (SELECT COUNT(*) FROM content WHERE doc_id = d.id AND deleted_at IS NULL) DESC
               LIMIT 1`,
              params
            );
            olByKey.set(cacheKey, best?.source_url || null);
          }
          const olUrl = olByKey.get(cacheKey);
          if (olUrl) {
            row.source_url = olUrl;
            row.source_site = 'oceanlibrary.com';
          }
        }
      }
    }
    // OceanLibrary docs always preferred — re-sort top so OL-sourced hits come
    // first. source_site may not be in Meilisearch hits (synced before field was
    // added) so we use SQLite docMeta which is always current.
    top.sort((a, b) => {
      const aSite = docMeta.get(a.doc_id || a.document_id)?.source_site || '';
      const bSite = docMeta.get(b.doc_id || b.document_id)?.source_site || '';
      const aOl = aSite === 'oceanlibrary.com' ? 1 : 0;
      const bOl = bSite === 'oceanlibrary.com' ? 1 : 0;
      if (bOl !== aOl) return bOl - aOl;
      return (b._authorityScore || 0) - (a._authorityScore || 0);
    });

    // external_para_id per (doc_id, paragraph_index) for OL hits — what hydration already carried, else by content id.
    const olHits = top.filter(h => {
      const m = docMeta.get(h.doc_id || h.document_id);
      return m && m.source_site;
    });
    const paraExtIds = await olParaIds(olHits);

    return {
      ...(planInfo ? { _plan: planInfo } : {}),
      ...(entitiesOut ? { entities: entitiesOut } : {}),
      ...(peopleAnswerOut ? { peopleAnswer: peopleAnswerOut } : {}),
      // a whole-book "paragraph" (an unsegmented import awaiting re-ingest) is never a passage (Chad 10-19: "Never should we
      // search an unsegmented book") — filtered BEFORE the textChars cut below hides its size
      passages: await withBetterCopies(top.filter((hit) => String(hit.text || '').length <= 8000).map(hit => {
        const docId = hit.doc_id || hit.document_id;
        const meta = docMeta.get(docId);
        const extParaId = paraExtIds.get(`${docId}:${hit.paragraph_index}`);
        const result = {
          text: headOf(hit.text || '', textChars),
          title: hit.title || 'Unknown',
          author: hit.author || '',
          // the BOOK's catalogue author: a paragraph whose author differs is quoted IN that book (r5: a Hidden Word quoted in a
          // Bahá'í World article read as an authorized text) — Anís names both, never one for the other
          book_author: meta?.author || null,
          religion: hit.religion || '',
          collection: hit.collection || '',
          language: hit.language || meta?.language || null,
          document_id: docId,
          paragraph_index: hit.paragraph_index,
          ...(hit.matched_hype ? { matched_hype: hit.matched_hype } : {}),
          ...(hit._source ? { source: hit._source } : {})
        };
        // Deep-link priority: OceanLibrary para deeplink > internal /library/…#p{N}
        // If neither resolves, source_url stays null — docs missing metadata need fixing at the source.
        const paraAnchor = hit.paragraph_index != null ? `#p${hit.paragraph_index}` : '';
        if (meta?.source_site && meta?.source_url) {
          result.source_site = meta.source_site;
          result.source_url = extParaId
            ? `${meta.source_url}/?paraId=${extParaId}`
            : meta.source_url;
          if (extParaId) result.external_para_id = extParaId;
        } else if (meta) {
          const rawSlug = meta.slug || (meta.filename ? meta.filename.replace(/\.[^.]+$/, '') : null);
          const docSlug = rawSlug ? encodeURIComponent(rawSlug).replace(/%2F/g, '/') : null;
          if (docSlug && meta.religion && meta.collection) {
            const base = `https://siftersearch.com/library/${encodeURIComponent(meta.religion)}/${encodeURIComponent(meta.collection)}/${docSlug}`;
            result.source_url = `${base}${paraAnchor}`;
          }
          // No slug/religion/collection → source_url stays null; fix the doc metadata, don't invent a URL
        }
        // No meta → source_url stays null
        // Link policy (source-links.js): the document's own origin (source_url or metadata.sourceUrl) by site tier —
        // OceanLibrary → OceanofLights → Phelps collection → BahaiLibrary → publisher — else the SifterSearch paragraph.
        if (meta) {
          const link = linkFor({ ...meta, text: hit.text, external_para_id: extParaId,
            source_url: result.source_url?.includes('siftersearch.com') ? meta.source_url : (result.source_url || meta.source_url) }, hit.paragraph_index);
          result.source_url = link.url;
          result.link_site = link.site;
          result.reader_url = link.reader_url;
          Object.defineProperty(result, '_copy', { value: { id: hit.id, title: hit.title, text: hit.text, link }, enumerable: false });
        }
        return result;
      }))
    };
  }

  // MODE: documents or count — the document finder (SQLite FTS, docs-repo), never a search engine's index
  const { findDocuments } = await import('../lib/docs-repo.js');
  const found = await findDocuments(query || '', { religion, collectionLike: collection, limit: mode === 'count' ? 1 : safeLimit,
    fields: ['id', 'title', 'author', 'religion', 'collection', 'year', 'description', 'paragraph_count', 'encumbered', 'slug'] });
  if (mode === 'count') return { totalMatches: found.total, query };
  return { totalMatches: found.total, showing: found.docs.length, documents: found.docs.map(docResult) };
}

// Citation links go to the best PUBLISHER of the words (Chad 10-12, universal): an identical copy on OceanLibrary / Ocean of
// Lights beats the copy search found (citation-links.js). Anís cites these passages' source_url verbatim.
async function withBetterCopies(results) {
  const items = results.filter((r) => r._copy).map((r) => r._copy);
  const better = await (await import('../lib/citation-links.js')).betterCopyLinks(items).catch(() => new Map());
  for (const r of results) {
    const b = r._copy && better.get(Number(r._copy.id));
    if (b) { r.source_url = b.url; r.link_site = b.site; if (b.title) r.title = b.title; }   // name the publication the link opens
  }
  return results;
}

// ─── Canonical-works hard-resolve for find_document_for_citation ─────────
// When the user names a known canonical work, return its known doc_id
// directly — bypasses Meilisearch ranking entirely.
//
// Two kinds of entries:
// 1. Whole-document works (Aqdas, Iqán, Hidden Words, etc.) — { matchers, doc_id, religion }
// 2. Sub-section works (named tablets inside a compilation, chapters of a
//    book) — { matchers, doc_id, religion, start_paragraph, end_paragraph }
//
// Sub-section ranges were audited 2026-04-28 against the corpus by parsing
// chapter prefixes [N.M] in paragraph text.
const CANONICAL_WORKS = [
  // Bahá'u'lláh — primary works
  { matchers: ['kitab-i-aqdas', 'kitabi aqdas', 'kitab al-aqdas', 'aqdas', 'most holy book'], doc_id: 16712, religion: "Baha'i" },
  { matchers: ['kitab-i-iqan', 'iqan', 'book of certitude'], doc_id: 8300, religion: "Baha'i" },
  { matchers: ['hidden words'], doc_id: 8230, religion: "Baha'i" },
  { matchers: ['gleanings'], doc_id: 8312, religion: "Baha'i" },
  { matchers: ['gems of divine mysteries', 'jawahir al-asrar'], doc_id: 8253, religion: "Baha'i" },
  { matchers: ['seven valleys', 'four valleys', 'haft vadi'], doc_id: 8241, religion: "Baha'i" },
  { matchers: ['summons of the lord of hosts'], doc_id: 8299, religion: "Baha'i" },
  { matchers: ['prayers and meditations'], doc_id: 8301, religion: "Baha'i" },
  { matchers: ['supplications'], doc_id: 16289, religion: "Baha'i" },
  { matchers: ['epistle to the son of the wolf', 'epistle son of the wolf'], doc_id: 8273, religion: "Baha'i" },
  { matchers: ['mathnaviyi', 'mathnavi'], doc_id: 16284, religion: "Baha'i" },
  { matchers: ['hymn to love', 'saqi bi-dih', 'saqi bidih'], doc_id: 11447, religion: "Baha'i" },
  { matchers: ['ode of the dove', 'qasidiy-i-varqaiyyih'], doc_id: 16600, religion: "Baha'i" },
  { matchers: ['tablet of the temple', 'surih-i-haykal'], doc_id: 16658, religion: "Baha'i" },
  { matchers: ['tablet to manikchi', 'tablet to manakji', 'lawh-i-manikchi'], doc_id: 16691, religion: "Baha'i" },
  // Specific named prayers / tablets (small docs but doctrinally central)
  { matchers: ['tablet of ahmad', 'tablet-of-ahmad', 'lawh-i-ahmad'], doc_id: 1616, religion: "Baha'i" },
  { matchers: ['long healing prayer', 'lawh-i-anis'], doc_id: 16597, religion: "Baha'i" },

  // Compilation: "Tablets of Bahá'u'lláh Revealed After the Kitáb-i-Aqdas"
  // (doc 8270, 664 paragraphs). Sub-section ranges by chapter prefix:
  { matchers: ['ishraqat', 'splendours', 'splendors', 'effulgences', 'lawh-i-ishraqat'], doc_id: 8270, religion: "Baha'i", start_paragraph: 229, end_paragraph: 312 },
  { matchers: ['tablet of wisdom', 'lawh-i-hikmat', 'lawh i hikmat', 'hikmat'], doc_id: 8270, religion: "Baha'i", start_paragraph: 313, end_paragraph: 365 },
  { matchers: ['asl-i-kullul-khayr', 'words of wisdom'], doc_id: 8270, religion: "Baha'i", start_paragraph: 366, end_paragraph: 387 },
  { matchers: ['lawh-i-maqsud', 'tablet of maqsud'], doc_id: 8270, religion: "Baha'i", start_paragraph: 388, end_paragraph: 439 },
  { matchers: ['suriy-i-vafa', 'tablet of faithfulness'], doc_id: 8270, religion: "Baha'i", start_paragraph: 440, end_paragraph: 467 },
  { matchers: ['lawh-i-siyyid-i-mihdiy-i-dahaji', 'tablet to siyyid mihdi'], doc_id: 8270, religion: "Baha'i", start_paragraph: 468, end_paragraph: 489 },
  // Catch-all for the compilation: searches for "Tablets Revealed After" or
  // any tablet name not matched above fall here, returning the whole comp.
  { matchers: ['tablets of bahaullah', 'tablets revealed after', 'bisharat', 'tarazat', 'lawh-i-dunya', 'kalimat-i-firdawsiyyih', 'glad tidings', 'tablet of the world', 'tablet to manakji', 'tablet to queen victoria', 'lawh-i-malikih', 'lawh-i-naser', 'tablet to napoleon', 'tablet of carmel', 'lawh-i-karmil'], doc_id: 8270, religion: "Baha'i" },

  // 'Abdu'l-Bahá
  { matchers: ['some answered questions', 'mufavadat'], doc_id: 8346, religion: "Baha'i" },
  { matchers: ['promulgation of universal peace'], doc_id: 8638, religion: "Baha'i" },
  { matchers: ['paris talks'], doc_id: 8320, religion: "Baha'i" },
  { matchers: ['secret of divine civilization'], doc_id: 11433, religion: "Baha'i" },
  { matchers: ['tablets of the divine plan'], doc_id: 8260, religion: "Baha'i" },
  // Shoghi Effendi
  { matchers: ['god passes by'], doc_id: 8635, religion: "Baha'i" },
  { matchers: ['advent of divine justice'], doc_id: 8295, religion: "Baha'i" },
  { matchers: ['promised day is come'], doc_id: 8302, religion: "Baha'i" },
  // Foundational books (tier 6-7 in the enrichment classifier)
  { matchers: ['dawn-breakers', 'dawn breakers', 'dawnbreakers', "nabil's narrative", 'nabils narrative', "nabíl's narrative"], doc_id: 8645, religion: "Baha'i" },
  { matchers: ["baha'u'llah and the new era", 'bahaullah and the new era', 'bahá\u2019u\u2019lláh and the new era', 'new era'], doc_id: 8314, religion: "Baha'i" },

  // Islam — Qur'an
  // Specific suras first (more specific matches win over generic 'quran')
  { matchers: ['surah fatiha', 'sura fatiha', 'al-fatiha', 'al fatiha', 'opening chapter', 'first chapter of the quran', 'surah al-fatiha', 'sura i', 'surah 1', 'fatiha'], doc_id: 21104, religion: 'Islam' },
  { matchers: ['quran', "qur'an", 'koran', 'quran rodwell', 'rodwell quran'], doc_id: 21343, religion: 'Islam' },
  { matchers: ['quran pickthall', 'pickthall quran', 'meaning of the glorious'], doc_id: 21207, religion: 'Islam' },

  // Christianity — Gospels
  { matchers: ['gospel of john', 'john gospel', 'gospel john'], doc_id: 20989, religion: 'Christian' },
  { matchers: ['gospel of matthew', 'matthew gospel', 'gospel matthew'], doc_id: 20992, religion: 'Christian' },
  { matchers: ['gospel of luke', 'luke gospel', 'gospel luke'], doc_id: 20990, religion: 'Christian' },
  { matchers: ['gospel of mark', 'mark gospel', 'gospel mark'], doc_id: 20991, religion: 'Christian' },

  // Hinduism — Bhagavad Gita. Paras 0-11 are title/preface; actual dialogue
  // (Dhritirashtra's opening question, Arjuna's response) starts at para 12.
  { matchers: ['bhagavad gita', 'bhagavad-gita', 'gita', 'song celestial', 'bhagavadgita'], doc_id: 17365, religion: 'Hindu', start_paragraph: 12 },

  // Buddhism — Dhammapada (most accessible single text)
  { matchers: ['dhammapada'], doc_id: 20925, religion: 'Buddhist' },

  // Taoism — Legge translation (doc 21293, 239 paras) starts with the actual
  // text immediately. The Gia-fu Feng version (18780) has 4 metadata paras first.
  { matchers: ['tao te ching', 'tao-te-ching', 'daodejing', 'dao de jing', 'tao te king', 'laozi', 'lao tzu', 'lao-tzu'], doc_id: 21293, religion: 'Tao' },

  // Sikhism — Guru Granth Sahib (lead volume)
  { matchers: ['guru granth sahib', 'granth sahib', 'adi granth'], doc_id: 20186, religion: 'Sikh' },

  // Judaism — Torah and scriptures (OL versions)
  { matchers: ['psalms', 'psalm', 'tehillim'], doc_id: 21243, religion: 'Judaism' },
  { matchers: ['genesis', 'bereshit', 'torah genesis'], doc_id: 21228, religion: 'Judaism' },
  { matchers: ['isaiah', 'yisheyah', 'book of isaiah'], doc_id: 21283, religion: 'Judaism' },
  { matchers: ['babylonian talmud'], doc_id: 21354, religion: 'Judaism' },

  // Christianity — New Testament books (OL versions)
  { matchers: ['acts of the apostles', 'book of acts', 'acts apostles'], doc_id: 20988, religion: 'Christian' },

  // Islam — Hadith (OL Sahih al-Bukhari)
  { matchers: ['sahih bukhari', 'sahih al-bukhari', 'bukhari', 'al-bukhari'], doc_id: 21075, religion: 'Islam' },

  // Hinduism — Vedas and epics (OL versions)
  { matchers: ['rig veda', 'rigveda'], doc_id: 21005, religion: 'Hindu' },
  { matchers: ['ramayana', 'ramayan', 'ramayanam'], doc_id: 21331, religion: 'Hindu' },

  // Buddhism — Pali Canon (OL versions)
  { matchers: ['sutta nipata', 'suttanipata'], doc_id: 20926, religion: 'Buddhist' },
  { matchers: ['digha nikaya', 'dīghanikāya', 'dighanikaya', 'long discourses'], doc_id: 20927, religion: 'Buddhist' }
];

function canonicalLookup(title, religion) {
  if (!title) return null;
  const norm = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc\u02bb`'']/g, "'")
    .replace(/[^a-z0-9\-\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const work of CANONICAL_WORKS) {
    if (religion && work.religion !== religion && !religion.toLowerCase().startsWith(work.religion.toLowerCase().slice(0, 4))) continue;
    if (work.matchers.some(m => norm.includes(m))) return work;
  }
  return null;
}

// ─── Primary-source authority boost for find_document_for_citation ───────
// Per-religion allowlist of canonical works whose titles should rank above
// commentary, papers, and pilgrim-note documents when the user asks for "the
// Tablet of Wisdom" or "the Gospel of John". Matches against the document's
// title (case-insensitive substring) and falls back to author for the
// Central Figures who wrote the entire primary canon.
const PRIMARY_AUTHORITY = {
  "Baha'i": {
    titles: [
      'kitáb-i-aqdas', 'kitab-i-aqdas', 'most holy book',
      'kitáb-i-íqán', 'kitab-i-iqan', 'book of certitude',
      'hidden words',
      'gleanings from the writings',
      'gems of divine mysteries',
      'seven valleys', 'four valleys',
      'tablets of bahá', 'tablets of baha',
      'epistle to the son of the wolf',
      'summons of the lord of hosts',
      'prayers and meditations',
      'some answered questions',
      'paris talks', 'promulgation of universal peace',
      'secret of divine civilization',
      'tablets of the divine plan',
      'tablet of', 'lawh-',  // catch all named tablets
      'will and testament',
      // Shoghi Effendi
      'god passes by', 'world order of bahá', 'world order of baha',
      'advent of divine justice', 'promised day is come',
      'dispensation of bahá', 'dispensation of baha'
    ],
    authors: ['bahá', 'baha', 'báb', 'bab', 'abdu', 'shoghi effendi']
  },
  Christian: {
    titles: ['gospel of matthew', 'gospel of mark', 'gospel of luke', 'gospel of john', 'matthew', 'mark', 'luke', 'john (gospel)', 'acts of the apostles'],
    authors: []
  },
  Islam: {
    titles: ['qur', "qur'án", 'koran', 'al-fatihah', 'sahih', 'bukhari', 'muslim'],
    authors: []
  },
  Judaism: {
    titles: ['torah', 'tanakh', 'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'isaiah', 'jeremiah', 'ezekiel', 'psalms', 'proverbs'],
    authors: []
  },
  Buddhist: {
    titles: ['dhammapada', 'sutta', 'sutra', 'pali canon', 'tipitaka'],
    authors: []
  },
  Hindu: {
    titles: ['upanishad', 'bhagavad', 'gita', 'vedas', 'rigveda', 'samaveda'],
    authors: []
  },
  Sikh: {
    titles: ['guru granth sahib'],
    authors: ['guru']
  }
};

function authorityScore(doc) {
  const rel = doc.religion;
  const cfg = PRIMARY_AUTHORITY[rel];
  if (!cfg) return 0;
  const t = (doc.title || '').toLowerCase();
  const a = (doc.author || '').toLowerCase();
  let score = 0;
  // Title-needle match: 60 (the title looks like canonical scripture)
  for (const titleNeedle of cfg.titles) if (t.includes(titleNeedle)) { score += 60; break; }
  // Canonical author: 60 (Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi for Bahá'í)
  for (const authorNeedle of cfg.authors) if (a.includes(authorNeedle)) { score += 60; break; }
  // Penalize titles that look like commentary even if the title-needle matched.
  // "Questions and Answers", "Notes on", "Commentary on", "Problems of" are giveaways.
  if (/questions and answers|commentary on|notes on|problems of|towards a |a study of|reflections on/i.test(t)) {
    score -= 40;
  }
  // Penalize papers/scholarly collections (these aren't primary scripture)
  if (/^papers?$|scholarly|journal|paper$/i.test(doc.collection || '')) {
    score -= 30;
  }
  return score;
}

// Find a specific named work (Tablet, Gospel, Sutra, etc.) by title. Wraps
// Meilisearch documents index with a primary-source authority boost so the
// actual scripture surfaces above commentaries and pilgrim notes.
//
// Religion filter is applied IN JS rather than via Meilisearch filter syntax —
// Meilisearch struggles with apostrophes in filter values like "Baha'i", so
// we over-fetch and post-filter for reliability.
export async function executeFindDocumentForCitation({ title, religion, author, limit = 5 }) {
  const safeLimit = Math.min(Math.max(limit || 5, 1), 20);

  // Hard-resolve known canonical works first. If the user names one (e.g.
  // "Tablet of Wisdom"), we know exactly which doc_id to return — skip the
  // Meilisearch ranking dance entirely. The doc_id is fetched from the DB
  // for fresh metadata, then prepended to any other Meilisearch hits.
  const canon = canonicalLookup(title, religion);
  let canonicalCandidate = null;
  if (canon) {
    const doc = await queryOne(
      `SELECT id, title, author, religion, collection, year, paragraph_count, slug
       FROM docs WHERE id = ? AND deleted_at IS NULL`,
      [canon.doc_id]
    );
    if (doc) {
      const isSubSection = typeof canon.start_paragraph === 'number';
      canonicalCandidate = {
        document_id: doc.id,
        title: isSubSection
          ? `${title} (in ${doc.title}, paragraphs ${canon.start_paragraph}-${canon.end_paragraph})`
          : doc.title,
        author: doc.author || '',
        religion: doc.religion || '',
        collection: doc.collection || '',
        year: doc.year,
        paragraph_count: isSubSection
          ? (canon.end_paragraph - canon.start_paragraph + 1)
          : doc.paragraph_count,
        authority_score: 999,
        is_primary: true,
        slug: doc.slug,
        match_reason: isSubSection ? 'canonical-section' : 'canonical-work',
        ...(isSubSection ? {
          start_paragraph: canon.start_paragraph,
          end_paragraph: canon.end_paragraph,
          read_hint: `read_document_for_question with document_id=${doc.id}, start_paragraph=${canon.start_paragraph}, end_paragraph=${canon.end_paragraph}`
        } : {})
      };
    }
  }

  try {
    const { findDocuments } = await import('../lib/docs-repo.js');
    {
      // candidate pool from the document finder (SQLite FTS) — over-fetch so post-filtering still leaves enough
      const result = { hits: (await findDocuments(title || '', { limit: 50,
        fields: ['id', 'title', 'author', 'religion', 'collection', 'year', 'paragraph_count', 'encumbered', 'slug'] })).docs };
      // Normalize apostrophe + diacritic variants — the DB stores Bahá'u'lláh
      // with curly apostrophe (U+2019); a user typing the same name with a
      // straight quote (U+0027) shouldn't break matching.
      const normalize = (s) => (s || '')
        .toLowerCase()
        .normalize('NFD')               // decompose diacritics
        .replace(/[\u0300-\u036f]/g, '') // strip combining marks
        .replace(/[\u2018\u2019\u02bc\u02bb`]/g, "'"); // unify apostrophes
      let hits = result.hits;
      if (religion) {
        const r = normalize(religion);
        hits = hits.filter(h => normalize(h.religion) === r);
      }
      if (author) {
        const a = normalize(author);
        hits = hits.filter(h => normalize(h.author).includes(a));
      }
      // RE-RANK BY TITLE FIRST, THEN AUTHORITY.
      // This used to sort by authority and use Meilisearch position only as a tie-break. authorityScore
      // awards +60 for a canonical author, so "The Advent of Divine Justice" (Shoghi Effendi) outranked
      // "The Dawn-Breakers" (Nabíl, score 0) for the query "The Dawn-Breakers" — the subagent then read the
      // wrong book and the chat answered "The Dawn-Breakers does not specifically discuss the Conference of
      // Badasht", which is one of its most famous chapters. Authority still decides among titles that match
      // equally well, which is what it was for: the canonical Íqán over "Notes on the Íqán".
      hits = rankByTitle(title || '', hits.map((h, idx) => ({ ...h, _authority: authorityScore(h), _idx: idx })))
        .slice(0, safeLimit);
      const titleCandidates = hits
        // Skip the canonical doc if we already prepended it
        .filter(h => !canonicalCandidate || h.id !== canonicalCandidate.document_id)
        .map(h => ({
          document_id: h.id,
          title: h.title,
          author: h.author || '',
          religion: h.religion || '',
          collection: h.collection || '',
          year: h.year,
          paragraph_count: h.paragraph_count,
          authority_score: h._authority,
          is_primary: h._authority >= 100,
          slug: h.slug,
          match_reason: 'title-search'
        }));
      // Note: named-works detection via heading scan was removed — the heading
      // column data isn't reliable as a section-start marker (headings appear
      // at section endings in some compilations). The canonical-works table
      // above now carries explicit start_paragraph/end_paragraph for known
      // sub-sections, which is much more reliable.
      const candidates = [
        ...(canonicalCandidate ? [canonicalCandidate] : []),
        ...titleCandidates
      ];
      // Liveness gate: dedupe left husk records carrying canonical titles with every
      // paragraph soft-deleted (e.g. the Gleanings doc that sent the subagent into an
      // empty book). A candidate the subagent can't read is worse than none — require
      // live content, keeping the husk list only if NOTHING has live text.
      let live = candidates;
      try {
        const ids = candidates.map((c) => c.document_id).filter(Boolean);
        if (ids.length) {
          const rows = await queryAll(
            `SELECT doc_id, COUNT(*) as n FROM content WHERE doc_id IN (${ids.map(() => '?').join(',')})
             AND deleted_at IS NULL GROUP BY doc_id`, ids
          );
          const liveCounts = new Map(rows.map((r) => [r.doc_id, r.n]));
          const withText = candidates.filter((c) => (liveCounts.get(c.document_id) || 0) > 0);
          if (withText.length) live = withText;
        }
      } catch (liveErr) {
        logger.warn({ err: liveErr.message }, 'find_document liveness check failed — returning unfiltered');
      }
      // sub-documents (Chad 10-15): the name may be a part of a book — an introduction, a talk, a tablet in a compilation
      const { findSections } = await import('../lib/repos/sections-repo.js');
      const sections = (await findSections(title || '', { limit: 5 }).catch(() => [])).map((s) => ({
        section: s.title, in_book: s.book, document_id: s.doc_id, start_paragraph: s.start_index, end_paragraph: s.end_index,
        read_hint: `read_document_for_question with document_id=${s.doc_id}, start_paragraph=${s.start_index}, end_paragraph=${s.end_index}` }));
      return {
        candidates: live.slice(0, safeLimit),
        ...(sections.length ? { sections } : {}),
        searched: title,
        religion_filter: religion || null,
        author_filter: author || null
      };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'find_document Meilisearch failed');
  }
  // Meilisearch unavailable, but we may still have a canonical hit
  if (canonicalCandidate) {
    return { candidates: [canonicalCandidate], searched: title, religion_filter: religion || null };
  }
  return { candidates: [], error: 'Meilisearch unavailable', searched: title };
}

let _overviewCache = null;
let _overviewCacheTime = 0;
const OVERVIEW_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function executeLibraryOverview() {
  const now = Date.now();
  if (_overviewCache && now - _overviewCacheTime < OVERVIEW_CACHE_TTL_MS) {
    return _overviewCache;
  }
  // Totals, religions, languages and collection→religion come from the reports-built snapshot (data/library-stats.json):
  // whole-table counts here (incl. COUNT(*) over every content row) froze the API event loop (better-sqlite3 is sync, 10-23).
  const snap = readLibraryStats();
  const docCount = { count: snap.totals.documents }, paraCount = { count: snap.totals.paragraphs };
  const religions = countList(snap.religionCounts).map(({ name, documents }) => ({ religion: name, count: documents }));
  const languages = countList(snap.languageCounts, 15).map(({ name, documents }) => ({ language: name, count: documents }));
  const collectionReligions = religionCollectionCounts(snap).filter((r) => r.collection != null)
    .map((r) => ({ collection: r.collection, religion: r.religion, cnt: r.count }))
    .sort((a, b) => a.collection.localeCompare(b.collection) || b.cnt - a.cnt);
  const collections = await queryAll(`SELECT ln.name, ln.description, ln.authority_default,
              (SELECT COUNT(*) FROM docs d WHERE d.collection = ln.name AND d.deleted_at IS NULL) as doc_count
              FROM library_nodes ln WHERE ln.node_type = 'collection' AND ln.parent_id IS NOT NULL
              ORDER BY ln.authority_default DESC, ln.name`);

  // Build dominant-religion map per collection
  const dominantReligion = {};
  for (const r of collectionReligions) {
    if (!dominantReligion[r.collection]) dominantReligion[r.collection] = r.religion;
  }

  _overviewCache = {
    totalDocuments: docCount.count,
    totalParagraphs: paraCount.count,
    religions: religions.map(r => ({ name: r.religion, documents: r.count })),
    totalCollections: collections.length,
    collections: collections.filter(c => c.doc_count > 0).map(c => ({
      name: c.name, documents: c.doc_count, description: c.description,
      religion: dominantReligion[c.name] || null
    })),
    languages: languages.map(l => ({ name: l.language, documents: l.count }))
  };
  _overviewCacheTime = now;
  return _overviewCache;
}

// Read-document tool. Originally a "smart reader" sub-agent that ran a
// gpt-4o pass to filter excerpts before returning. Simplified 2026-04-29
// because the three-stage pipeline (research → craft → reflect) already
// has the crafter filtering at the next stage — the inner OpenAI call was
// redundant AND was the slowest step in the per-turn budget (~15s on a
// 50-paragraph compilation slice). Now returns paragraphs directly. The
// crafter sees them as retrieved_quotes and picks the right ones to use.
async function executeReadDocumentForQuestion({ document_id, question, max_paragraphs = 250, start_paragraph, end_paragraph }) {
  const doc = await queryOne(
    'SELECT id, title, author, religion, collection, year, description, slug, filename, source_site, source_url, encumbered FROM docs WHERE id = ? AND deleted_at IS NULL',
    [document_id]
  );
  if (!doc) return { error: 'Document not found' };
  // A copyrighted (encumbered) book (Chad 10-23): the model reads at most its first 40 paragraphs, or a named range of at most
  // ENCUMBERED_RANGE paragraphs, each clipped — so an answer can only ever quote it in short excerpts.
  const encumbered = doc.encumbered === 1;
  if (encumbered && typeof start_paragraph === 'number' && typeof end_paragraph === 'number') {
    end_paragraph = Math.min(end_paragraph, start_paragraph + ENCUMBERED_RANGE - 1);
  }
  if (encumbered) max_paragraphs = Math.min(max_paragraphs || PREVIEW_PARAGRAPHS, PREVIEW_PARAGRAPHS);

  // Two modes: paragraph range (start..end inclusive) for reading a named
  // section of a compilation (e.g. Tablet of Wisdom inside doc 8270), or
  // first-N (the default) for small standalone works.
  let paragraphs;
  if (typeof start_paragraph === 'number' && typeof end_paragraph === 'number') {
    paragraphs = await queryAll(
      `SELECT paragraph_index, text, heading, external_para_id FROM content
       WHERE doc_id = ? AND paragraph_index >= ? AND paragraph_index <= ?
         AND deleted_at IS NULL ORDER BY paragraph_index`,
      [document_id, start_paragraph, end_paragraph]
    );
  } else {
    const cap = Math.min(Math.max(max_paragraphs || 250, 1), 1000);
    paragraphs = await queryAll(
      `SELECT paragraph_index, text, heading, external_para_id FROM content
       WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT ?`,
      [document_id, cap]
    );
  }
  if (paragraphs.length === 0) return { error: 'Document is empty or unreadable' };

  // Direct return — let the crafter (next stage) pick the relevant excerpts.
  // No internal OpenAI call. Each paragraph becomes one excerpt.
  // Cap text per paragraph at 1000 chars so the orchestrator's context
  // stays manageable on long compilations.
  // Build base URL for paragraph deeplinks (same logic as executeSearch)
  // Build per-paragraph source_url. Priority: external ?paraId > /library/…#p > /document/{id}#p
  const buildParaUrl = (p) => {
    if (doc.source_site && doc.source_url) {
      return p.external_para_id
        ? `${doc.source_url}/?paraId=${p.external_para_id}`
        : `${doc.source_url}#p${p.paragraph_index}`;
    }
    const rawSlug = doc.slug || (doc.filename ? doc.filename.replace(/\.[^.]+$/, '') : null);
    const docSlug = rawSlug ? encodeURIComponent(rawSlug).replace(/%2F/g, '/') : null;
    if (docSlug && doc.religion && doc.collection) {
      return `https://siftersearch.com/library/${encodeURIComponent(doc.religion)}/${encodeURIComponent(doc.collection)}/${docSlug}#p${p.paragraph_index}`;
    }
    // No slug/religion/collection — doc missing metadata, no URL to generate
    return null;
  };

  const slugForBase = doc.slug || (doc.filename ? doc.filename.replace(/\.[^.]+$/, '') : null);
  const docBase = slugForBase && doc.religion && doc.collection
    ? `https://siftersearch.com/library/${encodeURIComponent(doc.religion)}/${encodeURIComponent(doc.collection)}/${encodeURIComponent(slugForBase).replace(/%2F/g, '/')}`
    : (doc.source_url || null);

  return {
    ...(encumbered ? { copyright: 'Under copyright: quote it only in short excerpts (a sentence or two), never consecutive paragraphs.' } : {}),
    document: { id: doc.id, title: doc.title, author: doc.author, religion: doc.religion, collection: doc.collection, year: doc.year, base_url: docBase },
    paragraphs_read: paragraphs.length,
    excerpts: paragraphs.map(p => ({
      paragraph_index: p.paragraph_index,
      text: (p.text || '').slice(0, encumbered ? 600 : 1000),
      heading: p.heading || null,
      source_url: buildParaUrl(p)
    }))
  };
}

export async function executeLibraryCount({ author, religion, site, language, collection, scope } = {}) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  if (author) {
    // Normalize Unicode curly quotes to ASCII in both the filter and DB column
    // so 'Abdu'l-Bahá (curly) matches 'Abdu'l-Bahá (ASCII) and vice versa.
    // SQLite REPLACE is applied both to the stored author and the filter param.
    const normalizedAuthor = author.replace(/[\u2018\u2019\u02BC]/g, "'");
    const stripped = normalizedAuthor.replace(/^'+/, '').replace(/'+$/, '');
    conditions.push("REPLACE(REPLACE(REPLACE(author, char(8216), char(39)), char(8217), char(39)), char(700), char(39)) LIKE ?");
    params.push(`%${stripped}%`);
  }
  if (religion)   { conditions.push('religion LIKE ?');    params.push(`%${religion}%`); }
  if (site)       { conditions.push('source_site LIKE ?'); params.push(`%${site}%`); }
  if (language)   { conditions.push('language LIKE ?');    params.push(`%${language}%`); }
  if (collection) { conditions.push('collection LIKE ?');  params.push(`%${collection}%`); }
  if (scope)      { conditions.push('scope = ?');          params.push(scope); }

  const where = conditions.join(' AND ');
  const [countRow, samples] = await Promise.all([
    queryOne(`SELECT COUNT(*) as count FROM docs WHERE ${where}`, params),
    queryAll(`SELECT title, author, religion, collection, source_site, source_url, year FROM docs WHERE ${where} ORDER BY (source_url IS NOT NULL AND source_url != '') DESC, year DESC LIMIT 5`, params)
  ]);

  return {
    count: countRow.count,
    filters: Object.fromEntries(Object.entries({ author, religion, site, language, collection, scope }).filter(([, v]) => v)),
    sample_documents: samples.map(d => ({
      title: d.title, author: d.author, religion: d.religion,
      collection: d.collection, site: d.source_site, year: d.year, source_url: d.source_url
    }))
  };
}

// Optional `ctx` carries scope_config (resolved from chatbot_location at the
// pipeline entry point) so per-call site-scoping flows through to search.
// Tools that don't need scope just ignore ctx.
export async function executeTool(name, args, ctx = {}) {
  switch (name) {
    case 'search': return executeSearch({ ...args, scope_config: ctx.scope_config, entityIds: ctx.entityIds, textChars: SEARCH_TEXT_CHARS });   // a model's args never widen the cut
    case 'library_overview': return executeLibraryOverview();
    case 'library_count': return executeLibraryCount(args);
    case 'find_document_for_citation': return executeFindDocumentForCitation(args);
    case 'read_document_for_question': return executeReadDocumentForQuestion(args);
    case 'document_info': {
      const { getDocMeta } = await import('../lib/doc-meta-store.js');
      const m = await getDocMeta(Number(args.document_id));
      if (!m) return { error: 'nothing catalogued about this document' };
      const { sources, ...rest } = m;                 // provenance stays server-side; the answer names the catalogues
      return { ...rest, catalogued_by: [...new Set(Object.values(sources || {}))] };
    }
    case 'find_documents_by_metadata': {
      const { searchDocMeta } = await import('../lib/doc-meta-store.js');
      return searchDocMeta({ q: args.query, kind: args.kind, author: args.author, place: args.place,
        year_from: args.year_from, year_to: args.year_to, limit: Math.min(args.limit || 10, 30) });
    }
    case 'translate_passage': return executeTranslatePassage(args);
    case 'entity_lookup': return { candidates: await entityLookup(args.q, { type: args.type, limit: 12 }) };
    case 'entity_dossier': return (await entityDossier(args.id)) || { error: 'entity not found or merged' };
    case 'entity_search': return await entitySearch(args.q, { limit: 12 });
    default: return { error: `Unknown tool: ${name}` };
  }
}

async function executeTranslatePassage({ text, source_lang, work_context }) {
  if (!text || !text.trim()) return { error: 'text is required' };
  try {
    const { translatePassage } = await import('../lib/translation-subagent.js');
    const result = await translatePassage({
      text,
      source_lang: source_lang === 'auto' ? undefined : source_lang,
      work_context
    });
    return {
      translation: result.translation,
      source_lang: result.source_lang,
      cached: result.cached,
      jafar_term_count: result.jafar_terms?.length || 0
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Route ────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify) {
  // Query-prep: cache probe only (embed + cosine, no LLM). Responses are tiny; partials never enter any log table.
  fastify.post('/prep', {
    schema: {
      body: {
        type: 'object',
        required: ['partial'],
        properties: {
          partial: { type: 'string', maxLength: 2000 },
          sessionId: { type: 'string', maxLength: 64 },
          widget_token: { type: 'string', maxLength: 64 }
        }
      }
    }
  }, async (request) => {
    const { partial, widget_token } = request.body;
    const text = String(partial || '').trim();
    if (text.split(/\s+/).length < 3 || text.length < 12) return { status: 'noop' };

    let persona = 'Anís';
    if (widget_token) {
      const prof = await queryOne('SELECT name, config_json FROM widget_profiles WHERE token = ?', [widget_token]).catch(() => null);
      persona = prof?.name?.trim().slice(0, 60) || 'Anís';
    }

    // Cache probe (embed + cosine — no LLM): already answered → submit hits Stage A.
    try {
      const { checkAnswerCache } = await import('../lib/answer-cache.js');
      const { createEmbedding } = await import('../lib/ai.js');
      let hit = await checkAnswerCache(text, { persona });
      if (!hit) {
        const emb = (await createEmbedding(text)).embedding;
        hit = await checkAnswerCache(text, { persona, embedding: emb });
      }
      if (hit?.entry?.answer_md) return { status: 'cached' };
    } catch { /* prep must never error the client */ }

    return { status: 'noop' };
  });

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
          researchContext: { type: 'string' },
          // Site-scoped chatbot location (e.g. 'bahaiteachings.org'). When
          // set, search is restricted to that site's scope (site-only sites
          // see only their own content; supplemental sites see the default
          // scope). Default (null) = the whole library.
          chatbot_location: { type: 'string', maxLength: 128 },
          // Widget embed token — resolves the profile's display name so the
          // assistant introduces itself as that persona (e.g. "Anis").
          widget_token: { type: 'string', maxLength: 64 },
          // Per-page widget overrides (data-name / data-mission on the embed): the
          // host site's own tuning. Display name + a short steering mission. Bounded;
          // treated as guidance, never system authority.
          name: { type: 'string', maxLength: 60 },
          mission: { type: 'string', maxLength: 400 },
        }
      }
    }
  }, async (request, reply) => {
    const { messages, researchContext, chatbot_location, widget_token, name, mission } = request.body;
    let persona_name = null;
    let default_tradition = null;
    let profile_instructions = null;
    if (widget_token) {
      const prof = await queryOne('SELECT name, config_json FROM widget_profiles WHERE token = ?', [widget_token]).catch(() => null);
      persona_name = prof?.name?.trim().slice(0, 60) || null;
      // Per-site answer steering: a host site can declare its home tradition
      // (config_json.default_tradition, e.g. "Baha'i" for longbeachbahai.org) —
      // questions default to that tradition's domain unless the USER indicates
      // another tradition. Server-side from the token: never client-supplied.
      try { default_tradition = JSON.parse(prof?.config_json || '{}').default_tradition || null; } catch { /* ignore */ }
      // The site's own instructions for Anís (set on /admin/anis) — the default steering for every page of the site.
      try { profile_instructions = String(JSON.parse(prof?.config_json || '{}').instructions || '').trim().slice(0, 600) || null; } catch { /* ignore */ }
    }
    // Per-page data-* overrides win over the profile (display name, instructions).
    if (typeof name === 'string' && name.trim()) persona_name = name.trim().slice(0, 60);
    const mission_prompt = (typeof mission === 'string' && mission.trim()) ? mission.trim().slice(0, 400) : profile_instructions;
    const userId = participantId(request);   // account → x-user-id → sifter_sid session cookie

    // Set headers directly on raw response — reply.header() doesn't survive flushHeaders()
    const origin = request.headers.origin;
    if (origin) reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('Access-Control-Expose-Headers', 'X-Server-Version');
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    writeSessionCookieRaw(request, reply);   // the cookie plugin never runs on a raw SSE response
    reply.raw.flushHeaders();

    // in order, with OceanLibrary paragraph links upgraded to range links (lib/ocean-links.js)
    const { rangeLinkSender } = await import('../lib/ocean-links.js');
    const sendEvent = rangeLinkSender((json) => reply.raw.write('data: ' + json + '\n\n'));

    const { sseKeepalive } = await import('../lib/assistant/sse-keepalive.js');
    const stopKeepalive = sseKeepalive(reply.raw);
    try {
      // One chat path: the Anís turn — log first → Jev triage gate → research answer → output check.
      const { anisTurn } = await import('../lib/assistant/turn.js');
      const { getScopeForLocation } = await import('../lib/search/scope.js');
      let scope_config;
      try { scope_config = chatbot_location ? getScopeForLocation(chatbot_location) : undefined; } catch { scope_config = undefined; }
      const r = await anisTurn({
        // a harness run (x-sifter-test: tests/quality/anis-conversations.mjs) bills to the improve budget; readers are never capped
        test: request.headers['x-sifter-test'] === '1',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        channel: widget_token ? 'widget-chat' : 'site-chat',
        profile: { persona_name, default_tradition, mission: mission_prompt, scope_config },
        participant: { id: userId, authed: !!(request.user?.sub || accountFromCookie(request)), userId: Number(request.user?.sub) || null, email: request.user?.email || null },
        conversationId: request.body.conversationId || null,
        clientKey: userId || request.ip,
        onEvent: sendEvent,
      });
      const result = {
        reply: r.reply, retrieval_quotes: r.retrieved || [], retrieved_count: (r.retrieved || []).length,
        user_intent: r.status === 'answered' ? (r.plan?.shape || null) : null, gate: { pass: true, picker: 'anis-layer' }, retried: false, timings: r.timings,
        conversation_id: r.conversationId || null, format: r.format?.id || null,
      };

      // Word-by-word emit so the existing dialogue UI's typing animation
      // still triggers, even though the text is fully buffered before send.
      const words = (result.reply || '').split(/(\s+)/);
      for (const w of words) {
        if (w) sendEvent({ type: 'chunk', text: w });
      }

      // Build citations from retrieved_quotes that ended up in the reply
      const citations = (result.retrieval_quotes || []).slice(0, 8).map(q => ({
        document_id: q.doc_id,
        paragraph_index: q.paragraph_index,
        text: (q.text || '').slice(0, 300),
        title: q.source_title,
        author: q.source_author,
        religion: q.religion,
        collection: q.collection
      }));
      if (citations.length > 0) sendEvent({ type: 'citations', citations });

      sendEvent({
        type: 'complete',
        citations,
        meta: {
          user_intent: result.user_intent,
          retrieved_count: result.retrieved_count,
          gate_passed: result.gate?.pass,
          retried: result.retried,
          engine: 'anis',
          ...(result.conversation_id ? { conversation_id: result.conversation_id } : {}),
          ...(result.format ? { format: result.format } : {}),
          ...(result.timings ? { timings: result.timings } : {})
        }
      });
      await sendEvent.flush(); reply.raw.end();

    } catch (err) {
      logger.error({ err: err.message, stack: err.stack, userId }, 'Chat stream error');
      sendEvent({ type: 'error', message: 'An error occurred. Please try again.' });
      await sendEvent.flush(); reply.raw.end();
    }

    return reply;
  });
}
