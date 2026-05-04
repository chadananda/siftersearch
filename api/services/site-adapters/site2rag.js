// site2rag adapter — generic for the user's `site2rag` crawler MD format.
//
// Drives ingestion for bahai-library.com, oceanoflights.org, bahaiteachings.org
// (and any future crawler-produced site). Per-site differences come from
// sites.yaml config (scope, authority_default, hype_policy), NOT from per-site
// adapter code.
//
// Two body shapes the crawler emits:
//
// 1. HTML-derived: plain markdown body, paragraphs separated by blank lines,
//    no PDF page metadata. Frontmatter has mime_type=text/html.
//
// 2. PDF-derived: each paragraph is preceded by a visible "[↗ p.N](url#page=N)"
//    markdown link AND a `<span data-pdf-page="N" data-pdf-para="M">` marker
//    that carries the source-PDF coordinates. Both get stripped from the
//    indexed text; pdf_page + external_para_id lift to per-paragraph metadata.
//    Frontmatter has mime_type=application/pdf.
//
// Author extraction: frontmatter `authors[].name` if present (oceanoflights
// pattern), else best-effort from the filename prefix (bahai-library pattern,
// where author is encoded in the filename like `esslemont_bahaullah_new_era.md`
// → `esslemont`). Author is NOT load-bearing for v1 — HyPE is gated off for
// supplementals/site-only entirely.
//
// Footnote definitions (`[^N]: ...`) are skipped — same lesson as oceanlibrary.

import yaml from 'yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:/;
const PDF_SPAN_RE = /<span\s+data-pdf-page="(\d+)"\s+data-pdf-para="(\d+)"[^>]*><\/span>/i;
const VISIBLE_PDF_LINK_RE = /\[↗ p\.\d+\]\([^)]+\)/g;
const ANY_PDF_SPAN_RE = /<span\s+data-pdf-[^>]*><\/span>/gi;

/**
 * Parse a crawler markdown file into normalized doc + paragraphs.
 *
 * @param {string} relativePath - file path relative to library basePath
 * @param {string} content - raw file contents (frontmatter + body)
 * @param {object} opts - { siteRoot, siteConfig } — siteConfig.id is the source_site label
 * @returns {Promise<{ docFields, paragraphs, raw_frontmatter }>}
 */
export async function parseDoc(relativePath, content, { siteConfig } = {}) {
  const m = content.match(FRONTMATTER_RE);
  if (!m) throw new Error('No YAML frontmatter found');

  const frontmatter = parseFrontmatterTolerant(m[1]);
  const body = m[2] || '';
  const isPdf = frontmatter.mime_type === 'application/pdf';

  const siteId = siteConfig?.id || frontmatter.domain || '';
  const author = extractAuthor(frontmatter, relativePath);

  const paragraphs = isPdf
    ? parsePdfBody(body, frontmatter)
    : parseHtmlBody(body, frontmatter);

  const docFields = {
    title: String(frontmatter.title ?? '').trim(),
    author,
    religion: null,
    collection: null,
    description: '',
    language: frontmatter.language || 'en',
    source_site: siteId,
    source_url: frontmatter.source_url || frontmatter.canonical_url || '',
    external_id: deriveExternalId(frontmatter, relativePath),
    file_path: relativePath,
    paragraph_count: paragraphs.length
  };

  return { docFields, paragraphs, raw_frontmatter: frontmatter };
}

// The crawler frontmatter sometimes contains unquoted strings with `: `
// (e.g. `title: Fire Tablet (Lawh-i-Qad...): study outline`), which strict
// YAML rejects as a "nested mapping in compact form". Pre-quote single-line
// scalar values that have a `: ` so the YAML parser sees a clean string.
// Multi-line keys (lists, nested objects) are detected via leading whitespace
// or trailing `:` and left untouched.
function parseFrontmatterTolerant(raw) {
  const lines = raw.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Multi-line key (`authors:` followed by indented children) — preserve.
    if (/^\s/.test(line) || /^\s*-\s/.test(line)) { out.push(line); continue; }
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) { out.push(line); continue; }
    const [, key, value] = m;
    if (value === '') { out.push(line); continue; } // multi-line key
    // Already quoted? leave alone.
    if (/^['"`].*['"`]$/.test(value)) { out.push(line); continue; }
    // JSON-ish array/object? leave alone.
    if (/^[[{]/.test(value)) { out.push(line); continue; }
    // Pure number / bool / date — leave alone.
    if (/^-?\d+(\.\d+)?$/.test(value)) { out.push(line); continue; }
    if (/^(true|false|null|~)$/i.test(value)) { out.push(line); continue; }
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) { out.push(line); continue; }
    // Has `: ` inside? quote it. Escape internal double quotes.
    if (/:\s/.test(value)) {
      const escaped = value.replace(/"/g, '\\"');
      out.push(`${key}: "${escaped}"`);
      continue;
    }
    out.push(line);
  }
  try {
    return yaml.parse(out.join('\n')) || {};
  } catch (err) {
    throw new Error(`Frontmatter parse failed: ${err.message}`);
  }
}

/**
 * detectSupersedee — v1 NEVER supersedes primary docs from supplemental
 * or site-only sources. The primary corpus is canonical; external sites are
 * additive at search time. Future v2 may add reverse-supersession (primary
 * supersedes external) but that's out of scope.
 */
export function detectSupersedee(_incomingDoc, _hashCandidates, _metadataCandidates, _opts) {
  return { supersedes: null, reason: 'site2rag: supplementals never supersede primary in v1', candidates_inspected: 0 };
}

// ─── Author extraction ──────────────────────────────────────────────────────

function extractAuthor(frontmatter, relativePath) {
  // Structured authors array (oceanoflights pattern) — first author wins.
  if (Array.isArray(frontmatter.authors) && frontmatter.authors.length > 0) {
    const first = frontmatter.authors[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first === 'object' && first.name) return String(first.name).trim();
  }

  // Plain `author` frontmatter field (rare in crawler output, but cover it).
  if (frontmatter.author && typeof frontmatter.author === 'string') {
    return frontmatter.author.trim();
  }

  // Filename prefix fallback (bahai-library pattern). Decode any URL-encoding
  // first; take everything before the first underscore. Best-effort only —
  // many filenames don't encode the author cleanly. Returns 'Unknown' rather
  // than null so downstream code that filters on author doesn't crash.
  try {
    const baseName = decodeURIComponent(relativePath).split('/').pop().replace(/\.md$/i, '');
    const idx = baseName.indexOf('_');
    if (idx > 0) return baseName.slice(0, idx);
    return baseName || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function deriveExternalId(frontmatter, relativePath) {
  if (frontmatter.url_path) return String(frontmatter.url_path);
  if (frontmatter.canonical_url) return String(frontmatter.canonical_url);
  // Filename without extension as last resort — stable per-doc id.
  return relativePath.split('/').pop().replace(/\.md$/i, '');
}

// ─── HTML-derived body parser ───────────────────────────────────────────────

function parseHtmlBody(body, frontmatter) {
  const blocks = body.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const paragraphs = [];
  let idx = 0;

  for (const block of blocks) {
    if (FOOTNOTE_DEF_RE.test(block)) continue;
    const text = block.trim();
    if (!text) continue;
    paragraphs.push({
      paragraph_index: idx,
      text,
      heading: '',
      blocktype: 'paragraph',
      external_para_id: `h${idx}`,
      pdf_page: null,
      language: frontmatter.language || 'en'
    });
    idx++;
  }
  return paragraphs;
}

// ─── PDF-derived body parser ────────────────────────────────────────────────

function parsePdfBody(body, frontmatter) {
  // Strategy: walk the body looking for <span data-pdf-page="N" data-pdf-para="M">
  // markers. Each marker indicates the start of a new logical paragraph; the
  // text between this marker and the next marker (or end of body) is the
  // paragraph. The visible "[↗ p.N](...)" link is stripped.
  //
  // If no markers exist (some HTML-imported PDF derivatives drop them), fall
  // back to plain blank-line splitting and leave pdf_page null.

  const blocks = body.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const paragraphs = [];
  let idx = 0;
  let pendingPage = null;
  let pendingPara = null;

  for (const block of blocks) {
    if (FOOTNOTE_DEF_RE.test(block)) continue;

    // Some blocks ARE the marker (link + span), text is in the NEXT block.
    // Others have text + inline markers. Handle both.
    const spanMatch = block.match(PDF_SPAN_RE);
    const cleanedBlock = stripPdfMarkers(block);

    if (spanMatch && !cleanedBlock) {
      // Pure marker block — remember the coords for the next text block.
      pendingPage = parseInt(spanMatch[1], 10);
      pendingPara = parseInt(spanMatch[2], 10);
      continue;
    }

    if (!cleanedBlock) continue;

    // This block has text. Pick coords from inline span if present, else
    // pending coords from the prior pure-marker block.
    let page = null;
    let para = null;
    if (spanMatch) {
      page = parseInt(spanMatch[1], 10);
      para = parseInt(spanMatch[2], 10);
    } else if (pendingPage !== null) {
      page = pendingPage;
      para = pendingPara;
    }
    pendingPage = null;
    pendingPara = null;

    paragraphs.push({
      paragraph_index: idx,
      text: cleanedBlock,
      heading: '',
      blocktype: 'paragraph',
      external_para_id: page !== null && para !== null ? `p${page}.${para}` : `p${idx}`,
      pdf_page: page,
      language: frontmatter.language || 'en'
    });
    idx++;
  }

  return paragraphs;
}

function stripPdfMarkers(block) {
  return block
    .replace(VISIBLE_PDF_LINK_RE, '')
    .replace(ANY_PDF_SPAN_RE, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
