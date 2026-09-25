// Link policy for search results (Chad, 2026-09-25): OceanLibrary.com → BahaiLibrary.com → OceanofLights.org →
// (another publisher) → SifterSearch.com. The document's own origin is docs.source_url OR docs.metadata.sourceUrl
// (the importer stores frontmatter `sourceUrl` in the JSON) — reading only the column produced 0 BahaiLibrary links
// in 435. Every result also carries a paragraph-exact SifterSearch reader link. Pure; deps: slug.js.
import { generateDocSlug, slugifyPath } from './slug.js';

const SITE = 'https://siftersearch.com';
const TIERS = [['oceanlibrary.com', 1], ['bahai-library.com', 2], ['oceanoflights.org', 3]];
const OURS = 'siftersearch.com';

/** Site tier of a URL: 1 OceanLibrary, 2 BahaiLibrary, 3 OceanofLights, 4 another publisher, 5 SifterSearch. */
export function tierOf(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { site: null, tier: 9 }; }
  if (host === OURS || host.endsWith(`.${OURS}`)) return { site: OURS, tier: 5 };
  const hit = TIERS.find(([d]) => host === d || host.endsWith(`.${d}`));
  return hit ? { site: hit[0], tier: hit[1] } : { site: host, tier: 4 };
}

const paragraphLevel = (url) => /paraId=|#p\d+|[?&]p=\d+/.test(url || '');

function metaSourceUrl(metadata) {
  if (!metadata) return null;
  try { return (typeof metadata === 'string' ? JSON.parse(metadata) : metadata)?.sourceUrl || null; } catch { return null; }
}

/** Paragraph-exact page on SifterSearch (always available). */
export function readerUrl(doc, paragraphIndex) {
  const slug = doc.slug || generateDocSlug(doc);
  const base = slug && doc.religion && doc.collection
    ? `${SITE}/library/${slugifyPath(doc.religion)}/${slugifyPath(doc.collection)}/${slug}`
    : `${SITE}/library/view?doc=${doc.doc_id ?? doc.document_id ?? doc.id}`;
  return paragraphIndex != null ? `${base}#p${paragraphIndex}` : base;
}

/**
 * The link a result should carry, by policy.
 * @param {object} doc  { id|doc_id, source_url, metadata, religion, collection, slug, filename }
 * @returns {{ url, site, tier, paragraph_level, reader_url }}
 */
export function linkFor(doc, paragraphIndex) {
  const reader = readerUrl(doc, paragraphIndex);
  const candidates = [doc.source_url, metaSourceUrl(doc.metadata)]
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    .map((u) => ({ url: u, ...tierOf(u) }))
    .filter((c) => c.tier < 5);   // our own address stored as a "source" is not a source
  // Best tier wins; within a tier, a paragraph-level link beats a whole-document one.
  candidates.sort((a, b) => a.tier - b.tier || Number(paragraphLevel(b.url)) - Number(paragraphLevel(a.url)));
  const best = candidates[0];
  if (!best) return { url: reader, site: OURS, tier: 5, paragraph_level: true, reader_url: reader };
  return { url: best.url, site: best.site, tier: best.tier, paragraph_level: paragraphLevel(best.url), reader_url: reader };
}
