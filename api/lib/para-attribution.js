// Paragraph-level authorship attribution for compilations and multi-author docs.
// Two-pass: fast regex for standardized formats (Bahá'í compilations cover ~90%),
// then optional LLM for ambiguous cases. Batch-updates the whole doc in one
// SQLite transaction for performance.
//
// Entry points: extractDocAttribution(docId), batchExtractAttribution(docIds)

import { queryAll, queryOne, transaction } from './db.js';
import { logger } from './logger.js';

// ── Regex patterns for standard attribution lines ────────────────────────────

// Matches: "(From a letter written on behalf of Shoghi Effendi to an individual
//           believer, October 29, 1938: Dawn of a New Day, p. 202)"
// Also: "(From a tablet of Bahá'u'lláh)" "(Ibid., p. 5)" "(From a talk by ..."
const ATTRIBUTION_RE = /^\s*\(\s*(From|Ibid\.|See|cf\.|Cited in|Quoted in)/i;

// Extracts structured fields from a matched attribution line
const SOURCE_TYPE_RE = /\ba\s+(letter|tablet|talk|message|address|cable|telegram|dispatch|circular|statement|proclamation|prayer|poem|verse|book|chapter|compilation|document|essay|treatise)\b/i;
const ON_BEHALF_RE = /(?:written\s+)?on\s+behalf\s+of\s+([^,;:()\d]+?)(?=\s+to\s|\s+dated|\s*[,;:()\d]|$)/i;
// Named institutions matched BEFORE the generic BY_RE to prevent partial matches
// (e.g. "of Justice" inside "Universal House of Justice" would otherwise match).
const INSTITUTION_RE = /(Universal House of Justice|Bah[aá]['']?['']?í International Community|International Teaching Centre|Continental Board of Counsellors|Hands of the Cause)/i;
const BY_RE = /(?:by|of)\s+([A-Z][^,;:()\d]{2,60}?)(?=\s+to\s|\s*[,;:()\d]|$)/;
const TO_RE = /\bto\s+(an?\s+[^,;:()\d]+|the\s+[^,;:()\d]+)/i;
const DATE_RE = /\b(\w+ \d{1,2},?\s+\d{4}|\d{4})\b/;
const SOURCE_TITLE_RE = /:([^:()]+?)(?:,\s*(?:p\.|pp\.|vol\.|paragraph)|\s*\))/;
const PAGE_RE = /\b(?:p\.|pp\.)\s*([\d–-]+)/i;
const IBID_RE = /^\s*\(\s*Ibid\./i;

// Detects inline quote attribution: "As Bahá'u'lláh writes:", "He revealed:", etc.
// Matches author name immediately before a verb of utterance followed by a quote.
const INLINE_QUOTE_RE = /\b(Bah[aá]['']?['']?u['']?['']?ll[aá]h|['']Abdu['']l-Bah[aá]|The\s+B[aá]b|Shoghi\s+Effendi|The\s+Master|The\s+Guardian)\b[^"''"]{0,60}(?:writes?|wrote|said|says?|revealed?|stat(?:ed?|es?)|declar(?:ed?|es?)|proclaim(?:ed?|s?)|utter(?:ed?|s?)|affirm(?:ed?|s?)|asserts?|observes?|explains?|recorded|narrat(?:ed?|es?))\s*[:'"'"]/gi;

// Known canonical author name aliases → canonical
const AUTHOR_ALIASES = {
  'the master': "'Abdu'l-Bahá",
  "abdu'l-baha": "'Abdu'l-Bahá",
  "abdul-baha": "'Abdu'l-Bahá",
  'the guardian': 'Shoghi Effendi',
  'guardian': 'Shoghi Effendi',
  'shoghi effendi': 'Shoghi Effendi',
  'the shoghi effendi': 'Shoghi Effendi',
  "baha'u'llah": "Bahá'u'lláh",
  "bahaullah": "Bahá'u'lláh",
  'the bab': 'The Báb',
  'universal house of justice': 'Universal House of Justice',
  'the universal house of justice': 'Universal House of Justice',
};

function canonicalizeAuthor(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/['']/g, "'");
  return AUTHOR_ALIASES[key] || raw.trim();
}

// Extract authors quoted inline within a paragraph body (not attribution lines).
// e.g. "As Bahá'u'lláh writes: '...'" → ["Bahá'u'lláh"]
function extractQuotedAuthors(text) {
  if (!text) return [];
  const found = new Set();
  let match;
  INLINE_QUOTE_RE.lastIndex = 0;
  while ((match = INLINE_QUOTE_RE.exec(text)) !== null) {
    const canonical = canonicalizeAuthor(match[1]);
    if (canonical) found.add(canonical);
  }
  return [...found];
}

function parseAttributionLine(text) {
  if (!text || !ATTRIBUTION_RE.test(text)) return null;

  const isIbid = IBID_RE.test(text);
  const inner = text.replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim();

  const sourceTypeMatch = inner.match(SOURCE_TYPE_RE);
  const source_type = sourceTypeMatch ? sourceTypeMatch[1].toLowerCase() : null;

  let author = null;
  const onBehalfMatch = inner.match(ON_BEHALF_RE);
  if (onBehalfMatch) {
    author = canonicalizeAuthor(onBehalfMatch[1]);
  } else {
    // Check named institutions first to avoid partial matches from BY_RE
    const institutionMatch = inner.match(INSTITUTION_RE);
    if (institutionMatch) {
      author = canonicalizeAuthor(institutionMatch[1]);
    } else {
      const byMatch = inner.match(BY_RE);
      if (byMatch) author = canonicalizeAuthor(byMatch[1]);
    }
  }

  const toMatch = inner.match(TO_RE);
  const recipient = toMatch ? toMatch[1].trim() : null;

  const dateMatch = inner.match(DATE_RE);
  const source_date = dateMatch ? dateMatch[1] : null;

  const titleMatch = inner.match(SOURCE_TITLE_RE);
  const source_title = titleMatch ? titleMatch[1].trim() : null;

  const pageMatch = inner.match(PAGE_RE);
  const source_page = pageMatch ? pageMatch[1] : null;

  return {
    is_attribution_line: true,
    ibid: isIbid,
    author,
    source_type,
    recipient,
    source_date,
    source_title,
    source_page,
    raw: text.trim(),
  };
}

// ── Doc-level extraction ─────────────────────────────────────────────────────

// Process one document: regex-parse all attribution lines, propagate author
// info to adjacent quote paragraphs, batch-update in a single transaction.
export async function extractDocAttribution(docId, { force = false, model = 'regex-v1' } = {}) {
  const doc = await queryOne('SELECT id, title, author, collection FROM docs WHERE id = ?', [docId]);
  if (!doc) throw new Error(`Doc ${docId} not found`);

  const whereClause = force
    ? 'doc_id = ? AND deleted_at IS NULL'
    : 'doc_id = ? AND deleted_at IS NULL AND para_meta IS NULL';

  const paras = await queryAll(
    `SELECT id, paragraph_index, text, blocktype, heading FROM content WHERE ${whereClause} ORDER BY paragraph_index`,
    [docId]
  );

  if (!paras.length) return { docId, processed: 0, skipped: 'nothing to do' };

  // All paragraphs for context window (even already-processed ones for ibid resolution)
  const allParas = force ? paras : await queryAll(
    'SELECT id, paragraph_index, text, blocktype, para_meta FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index',
    [docId]
  );

  const metaMap = new Map(); // para_id → parsed meta object
  const docAuthor = doc.author || null;

  // First pass: identify and parse all attribution lines
  let lastAttribution = null; // for ibid resolution
  for (let i = 0; i < allParas.length; i++) {
    const para = allParas[i];
    const parsed = parseAttributionLine(para.text);

    if (parsed) {
      // Ibid: inherit author + source from the previous non-ibid attribution
      if (parsed.ibid && lastAttribution) {
        parsed.author = parsed.author || lastAttribution.author;
        parsed.source_type = parsed.source_type || lastAttribution.source_type;
        parsed.source_title = parsed.source_title || lastAttribution.source_title;
        parsed.source_date = parsed.source_date || lastAttribution.source_date;
      }
      if (!parsed.ibid) lastAttribution = parsed;

      metaMap.set(para.id, parsed);

      // Propagate backwards: the preceding non-attribution paragraph is the quote
      // Look back up to 3 paragraphs to find the quote (some have heading in between)
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prev = allParas[j];
        if (metaMap.get(prev.id)?.is_attribution_line) continue;
        // Don't overwrite an already-parsed attribution line
        if (!metaMap.has(prev.id)) {
          metaMap.set(prev.id, {
            is_attribution_line: false,
            author: parsed.author || docAuthor,
            source_type: parsed.source_type,
            source_title: parsed.source_title,
            source_date: parsed.source_date,
            source_page: parsed.source_page,
            attribution_para_id: para.id,
          });
        }
        break;
      }
    }
  }

  // Second pass: paragraphs with no attribution signal inherit doc author.
  // Also detect inline quoted authors in all non-attribution paragraphs.
  for (const para of paras) {
    const existing = metaMap.get(para.id);
    const quotedAuthors = (!existing?.is_attribution_line) ? extractQuotedAuthors(para.text) : [];
    if (!existing) {
      metaMap.set(para.id, {
        is_attribution_line: false,
        author: docAuthor,
        ...(quotedAuthors.length ? { quoted_authors: quotedAuthors } : {}),
      });
    } else if (!existing.is_attribution_line && quotedAuthors.length) {
      existing.quoted_authors = quotedAuthors;
    }
  }

  // Batch update in a single transaction
  const now = new Date().toISOString();
  const paraIds = new Set(paras.map(p => p.id));
  const statements = [];
  for (const [paraId, meta] of metaMap) {
    if (!paraIds.has(paraId)) continue;
    statements.push({
      sql: 'UPDATE content SET para_meta = ?, para_meta_model = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify(meta), model, now, paraId],
    });
  }
  if (statements.length > 0) await transaction(statements);
  const processed = statements.length;

  logger.info({ docId, processed, title: doc.title }, 'para_meta attribution extracted');
  return { docId, processed };
}

// ── Batch processing ─────────────────────────────────────────────────────────

// Find all docs that have paragraphs needing attribution.
// Prioritizes compilations and multi-author docs.
export async function getPendingAttributionDocs({ limit = 50 } = {}) {
  return queryAll(`
    SELECT DISTINCT d.id, d.title, d.author, d.collection,
      COUNT(c.id) as unprocessed
    FROM docs d
    JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL AND c.para_meta IS NULL
    WHERE d.deleted_at IS NULL
    GROUP BY d.id
    ORDER BY
      -- compilations first (highest need)
      CASE WHEN d.collection IN ('Compilations','compilations') THEN 0 ELSE 1 END,
      -- then by unprocessed count (biggest bang per doc)
      unprocessed DESC
    LIMIT ?
  `, [limit]);
}

export async function batchExtractAttribution({ limit = 20, force = false } = {}) {
  const docs = await getPendingAttributionDocs({ limit });
  const results = [];
  for (const doc of docs) {
    try {
      const r = await extractDocAttribution(doc.id, { force });
      results.push(r);
    } catch (err) {
      logger.error({ docId: doc.id, err: err.message }, 'Attribution extraction failed');
      results.push({ docId: doc.id, error: err.message });
    }
  }
  return results;
}
