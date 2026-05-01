// OceanLibrary site adapter.
//
// Parses OceanLibrary's markdown export into normalized docs + paragraphs.
// The format: YAML frontmatter, then blocks separated by blank lines, each
// block ending with a Pandoc-style attribute block:
//
//   This is an epistle from this lowly servant ... {.preamble id="para_8" ilm_id="bl2x" type="par" language="en"}
//
// Block types that matter:
//   - par         → paragraph (the substance)
//   - preamble    → opening sentence of a section, treat like par (blocktype='preamble')
//   - header      → section title; sets heading on following paragraphs, not stored as content
//   - title       → book title / copyright; skipped (we use frontmatter)
//   - hr / toc    → ignored
//
// Output shape matches what the regular ingester expects, plus external_para_id
// and source_url so deep-links can be rebuilt later as `${source_url}/?paraId=${para_NN}`.
//
// Religion mapping: OceanLibrary uses 'Bahá'í', 'Jainism' etc. Our canon uses
// 'Baha'i', 'Jain' etc. The map is supplied by the sites-ingester via
// siteConfig.religion_map (loaded from -sites/sites.yaml).
//
// A baked-in fallback covers the case where someone calls parseDoc directly
// without going through sites-ingester (tests, ad-hoc scripts).

import yaml from 'yaml';

const DEFAULT_RELIGION_MAP = {
  'Bahá\u2019í': "Baha'i",  // curly apostrophe variant in OceanLibrary frontmatter
  "Bahá'í":  "Baha'i",
  'Buddhist': 'Buddhist',
  'Christian': 'Christian',
  'Confucian': 'Confucian',
  'Hindu':    'Hindu',
  'Islam':    'Islam',
  'Jainism':  'Jain',
  'Judaism':  'Judaism',
  'Tao':      'Tao',
  'Zoroastrian': 'Zoroastrian'
};

// ─── Pandoc attribute parsing ────────────────────────────────────────────

// `{.classname .class2 id="x" key="value" ...}` → { classes: [...], id, key... }
function parsePandocAttrs(attrStr) {
  const out = { classes: [] };
  const re = /\.([^\s.{}]+)|#(\S+)|(\w+)=(?:"([^"]*)"|([^\s}]+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    if (m[1]) out.classes.push(m[1]);
    else if (m[2]) out.id = m[2];
    else if (m[3]) out[m[3]] = m[4] !== undefined ? m[4] : m[5];
  }
  return out;
}

// Each block is on its own paragraph(s), with `{...}` at the end.
// Returns { text, attrs } or null if no attrs match (i.e. unstructured prose).
const TRAILING_ATTRS_RE = /^([\s\S]*?)\s*\{([^}]+)\}\s*$/;

function parseBlock(block) {
  const m = block.match(TRAILING_ATTRS_RE);
  if (!m) return { text: block.trim(), attrs: null };
  const [, rawText, attrStr] = m;
  return { text: rawText.trim(), attrs: parsePandocAttrs(attrStr) };
}

// ─── Body text cleanup ───────────────────────────────────────────────────

// Strip the OceanLibrary-specific markup from paragraph text:
// - leading `### ` etc. for header blocks
// - trailing `<br>` HTML
// - markdown emphasis is left intact (matches the rest of our corpus)
function cleanParagraphText(text, type) {
  let t = text;
  if (type === 'header' || type === 'title') {
    t = t.replace(/^#+\s*/, '');         // ### Foo → Foo
    t = t.replace(/^\\?-\s*\d+(\.\d+)*\s*-\s*$/, ''); // section markers like "- 1.1 -"
  }
  t = t.replace(/<br\s*\/?>/gi, '');     // <br> → ''
  return t.trim();
}

// ─── Main parser ─────────────────────────────────────────────────────────

/**
 * Parse an OceanLibrary markdown file into a normalized doc + paragraphs.
 *
 * @param {string} relativePath - file path relative to library basePath (used to detect site)
 * @param {string} content - raw file contents
 * @param {object} opts - { siteRoot: absolute path to -sites/oceanlibrary.com }
 * @returns {Promise<{ docFields, paragraphs, raw_frontmatter }>}
 */
export async function parseDoc(relativePath, content, { siteConfig } = {}) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error('No YAML frontmatter found');
  const frontmatter = yaml.parse(fmMatch[1]) || {};
  const body = fmMatch[2];

  // Religion map comes from siteConfig (loaded from -sites/sites.yaml). Fall
  // back to the baked-in defaults when called outside the ingester pipeline.
  const religionMap = (siteConfig && siteConfig.religion_map) || DEFAULT_RELIGION_MAP;
  const ourReligion = religionMap[frontmatter.ocean_category] || frontmatter.ocean_category;

  // Split body into blocks on blank lines.
  //
  // Footnote definitions (`[^N]: …`) at the end of OL files are written on
  // consecutive lines with no blank-line separation, so they collapse into
  // one giant block (e.g. the Aqdas's 209 footnotes → one 143 KB block →
  // OpenAI 8192-token embed rejection). Pre-split any block containing
  // footnote definitions on the per-line `[^…]:` pattern, then drop the
  // footnote sub-blocks entirely — they're reference apparatus, not body
  // text, and the inline footnote markers (`[^N]`) inside paragraphs are
  // sufficient for the reader to recognise the citation.
  const rawBlocks = body.split(/\n{2,}/)
    .flatMap(b => {
      // If the block contains footnote definitions, split each one off and
      // discard them.
      if (/^\[\^[^\]]+\]:/m.test(b)) {
        return b.split(/\n(?=\[\^[^\]]+\]:)/)
          .filter(part => !/^\[\^[^\]]+\]:/.test(part.trim()));
      }
      return [b];
    })
    .map(b => b.trim())
    .filter(Boolean);

  const paragraphs = [];
  let currentHeading = '';
  let paragraphIndex = 0;

  for (const raw of rawBlocks) {
    const { text, attrs } = parseBlock(raw);
    if (!attrs) {
      // Unstructured block (very rare in OceanLibrary export). Skip — we don't
      // want to invent IDs.
      continue;
    }
    const type = attrs.type || 'par';

    // Skip non-content blocks
    if (type === 'hr' || type === 'toc') continue;
    if (type === 'title') continue; // Use frontmatter title, skip in-body title/copyright

    // Headers update the running heading but aren't stored as paragraphs.
    if (type === 'header') {
      const h = cleanParagraphText(text, type);
      if (h) currentHeading = h;
      continue;
    }

    // Paragraph or preamble — store it
    if (type !== 'par' && type !== 'preamble') {
      // Unknown type — preserve as paragraph but flag the type so we can audit
      // (e.g. footnotes, blockquotes, lists could surface as new types later).
    }

    const cleanText = cleanParagraphText(text, type);
    if (!cleanText) continue;

    paragraphs.push({
      paragraph_index: paragraphIndex++,
      text: cleanText,
      heading: currentHeading,
      blocktype: type === 'preamble' ? 'preamble' : 'paragraph',
      external_para_id: attrs.id || null,
      language: attrs.language || frontmatter.language || 'en'
    });
  }

  // Doc-level fields
  const docFields = {
    title: frontmatter.title || '',
    subtitle: frontmatter.subtitle || '',
    author: frontmatter.author || 'Unknown',
    religion: ourReligion || 'General',
    collection: frontmatter.collection_id || '',
    description: frontmatter.description || frontmatter.description_short || '',
    language: frontmatter.language || 'en',
    source_site: 'oceanlibrary.com',
    source_url: frontmatter.source_url || '',
    external_id: frontmatter.bookid || '',
    file_path: relativePath,
    paragraph_count: paragraphs.length
  };

  return { docFields, paragraphs, raw_frontmatter: frontmatter };
}

// ─── Title / author normalization for fuzzy match ─────────────────────────

function normalizeForFuzzy(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[\u2018\u2019\u02bc\u02bb`'']/g, "'") // unify apostrophes
    .replace(/[^a-z0-9' ]/g, ' ')      // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein with an early-exit cap. Only used on short title/author strings,
// so we don't need fancy algorithms.
function levenshtein(a, b, maxDist = 4) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      dp[j] = (a[i - 1] === b[j - 1]) ? prev : Math.min(prev, dp[j - 1], dp[j]) + 1;
      if (dp[j] < rowMin) rowMin = dp[j];
      prev = cur;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[b.length];
}

function fuzzyTitleMatch(a, b) {
  const na = normalizeForFuzzy(a), nb = normalizeForFuzzy(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Allow up to 3 edits on titles (covers transliteration variants, missing
  // articles, " - " vs ", ", etc.)
  return levenshtein(na, nb, 3) <= 3;
}

function fuzzyAuthorMatch(a, b) {
  const na = normalizeForFuzzy(a), nb = normalizeForFuzzy(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Authors get a smaller edit budget (names should match more tightly than titles)
  return levenshtein(na, nb, 2) <= 2;
}

// ─── Supersession detection ──────────────────────────────────────────────

/**
 * Decide whether an incoming OceanLibrary doc supersedes an existing one in
 * our corpus.
 *
 * Two independent signals — either is sufficient:
 *
 *   A. Hash overlap (existing path): candidates from `findSupersessionCandidates`.
 *      If symmetric paragraph-overlap >= threshold AND title+author fuzzy-match,
 *      supersede. This is the strong signal when both corpora segment paragraphs
 *      identically.
 *
 *   B. Metadata match (new path): candidates from `findMetadataCandidates`
 *      where title and author match after normalization. Necessary because
 *      our existing corpus has `[aN]` reference-prefix markers + slightly
 *      different paragraph segmentation than OceanLibrary, so verbatim-text
 *      paragraphs hash differently and signal A produces 0% overlap on
 *      genuinely-identical works.
 *      Sanity gate: paragraph count within 0.4..2.5 ratio (catches truncated
 *      excerpts and multi-work compilations posing under a canonical title).
 *
 * Either candidate list may be passed; we union them and evaluate.
 *
 * @param {object} incomingDoc - { title, author, paragraph_count }
 * @param {Array} hashCandidates - from findSupersessionCandidates
 * @param {Array} metadataCandidates - from findMetadataCandidates (optional)
 * @param {object} opts - { threshold = 0.80 }
 * @returns {{ supersedes: number|null, reason: string, candidates_inspected }}
 */
export function detectSupersedee(incomingDoc, hashCandidates, metadataCandidates = [], opts = {}) {
  const threshold = opts.threshold ?? 0.80;

  // Signal A — hash-overlap path. Candidates already sorted DESC by matched.
  for (const c of hashCandidates || []) {
    const titleOk = fuzzyTitleMatch(incomingDoc.title, c.doc_title);
    const authorOk = fuzzyAuthorMatch(incomingDoc.author, c.doc_author);
    const symRatio = Math.min(
      c.matched_count / Math.max(incomingDoc.paragraph_count, 1),
      c.matched_count / Math.max(c.doc_paragraph_count, 1)
    );
    if (titleOk && authorOk && symRatio >= threshold) {
      return {
        supersedes: c.doc_id,
        reason: `hash-match: title+author OK, ${(symRatio * 100).toFixed(1)}% paragraph overlap (${c.matched_count}/${incomingDoc.paragraph_count} new vs ${c.doc_paragraph_count} existing)`,
        candidates_inspected: (hashCandidates?.length || 0) + (metadataCandidates?.length || 0)
      };
    }
  }

  // Signal B — metadata-match path. Falls back when paragraph segmentation
  // differs (e.g., our `[aN]` prefix tokens prevent verbatim hash matches).
  for (const c of metadataCandidates || []) {
    const titleOk = fuzzyTitleMatch(incomingDoc.title, c.doc_title);
    const authorOk = fuzzyAuthorMatch(incomingDoc.author, c.doc_author);
    if (!titleOk || !authorOk) continue;
    // Paragraph-count sanity gate. 0.4..2.5 covers normal segmentation
    // differences without admitting truncated excerpts or compilations.
    const ratio = incomingDoc.paragraph_count / Math.max(c.doc_paragraph_count, 1);
    if (ratio < 0.4 || ratio > 2.5) {
      continue;
    }
    return {
      supersedes: c.doc_id,
      reason: `metadata-match: title+author OK, paragraph count ${incomingDoc.paragraph_count} vs ${c.doc_paragraph_count} (ratio ${ratio.toFixed(2)})`,
      candidates_inspected: (hashCandidates?.length || 0) + (metadataCandidates?.length || 0)
    };
  }

  const total = (hashCandidates?.length || 0) + (metadataCandidates?.length || 0);
  if (total === 0) {
    return { supersedes: null, reason: 'no candidates', candidates_inspected: 0 };
  }
  return {
    supersedes: null,
    reason: `${total} candidates inspected, none passed title/author/threshold gates`,
    candidates_inspected: total
  };
}

// Exported for tests
export const _internal = { parsePandocAttrs, parseBlock, normalizeForFuzzy, fuzzyTitleMatch, fuzzyAuthorMatch, levenshtein };
