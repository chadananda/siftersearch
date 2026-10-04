// Scraped-site junk filter for the search index (site-scraped 'supplemental' docs only; library docs are never filtered).
// Two fixed rules — a paragraph is skipped when it is markup with no words (image, layout table, lone link, separator),
// or when its exact text recurs in ≥ MIN_DOCS scraped documents (page chrome: menus, comment forms, banners). A real
// passage quoted on ≥10 scraped pages is dropped from the SCRAPED copies only — the library keeps its own copy.
// Interim until the scraper extracts article bodies only (Chad, 2026-10-02). Pure except boilerplateTexts (reads a DB).
export const MIN_DOCS = 10;

const LETTER = /[\p{L}]/u;

/** Markup with no prose: images, HTML tables/tags, a lone markdown link, separators, emphasis-only lines. */
export function isMarkupOnly(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (/^(\*\s*){3,}$|^-{3,}$|^_{3,}$/.test(t)) return true;                       // separators
  if (/^<\s*(table|tbody|tr|td|div|span|img|br|hr|center|p)\b/i.test(t)) return true;   // layout HTML
  const stripped = t
    .replace(/!\[[^\]]*\]\([^)]*\)(<!--[\s\S]*?-->)?/g, ' ')   // images (+ the scraper's src comment)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')                  // links → their label
    .replace(/<[^>]+>/g, ' ');
  if (!LETTER.test(stripped)) return true;
  // a line that is only one or more links (category menus, "browse all"): nothing left once link labels are removed
  return /^(\[[^\]]*\]\([^)]*\)[\s|·•,]*)+$/.test(t);
}

/** Texts that recur in ≥ MIN_DOCS scraped docs (scope 'supplemental', all sites together), as a Set — once per run. */
export function boilerplateTexts(db, minDocs = MIN_DOCS) {
  const rows = db.prepare(`SELECT c.text FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE d.scope = 'supplemental' AND d.deleted_at IS NULL AND c.deleted_at IS NULL
    GROUP BY c.text HAVING COUNT(DISTINCT c.doc_id) >= ?`).all(minDocs);
  return new Set(rows.map((r) => r.text));
}

/** Keep a scraped-site paragraph in the index? */
export const keepSiteParagraph = (text, boilerplate) => !isMarkupOnly(text) && !boilerplate.has(text);
