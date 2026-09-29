// Link policy for search results (Chad, 2026-09-25; OceanofLights raised to second 2026-09-29): OceanLibrary.com →
// OceanofLights.org → BahaiLibrary.com → (another publisher) → SifterSearch.com. The document's own origin is docs.source_url OR docs.metadata.sourceUrl
// (the importer stores frontmatter `sourceUrl` in the JSON) — reading only the column produced 0 BahaiLibrary links
// in 435. Every result also carries a paragraph-exact SifterSearch reader link. Pure; deps: slug.js.
import { generateDocSlug, slugifyPath } from './slug.js';

const SITE = 'https://siftersearch.com';
const TIERS = [['oceanlibrary.com', 1], ['oceanoflights.org', 2], ['bahai-library.com', 3]];
const OURS = 'siftersearch.com';

/** Site tier of a URL: 1 OceanLibrary, 2 OceanofLights, 3 BahaiLibrary, 4 another publisher, 5 SifterSearch. */
export function tierOf(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { site: null, tier: 9 }; }
  if (host === OURS || host.endsWith(`.${OURS}`)) return { site: OURS, tier: 5 };
  const hit = TIERS.find(([d]) => host === d || host.endsWith(`.${d}`));
  return hit ? { site: hit[0], tier: hit[1] } : { site: host, tier: 4 };
}

const paragraphLevel = (url) => /paraId=|#p\d+|[?&]p=\d+/.test(url || '');

function parseMeta(metadata) {
  if (!metadata) return null;
  try { return typeof metadata === 'string' ? JSON.parse(metadata) : metadata; } catch { return null; }
}

// Origin URLs the metadata implies. Core Tablets files carry `bookid` (their oceanoflights.org page is the bookid
// lowercased with _ → -, verified on all 5,533 files) and Partial Inventory tablets carry `pin` (Stephen Phelps'
// browser). Their frontmatter `url:`/`source_url:` keys were never stored, so these ids are the durable handle.
export const oceanoflightsUrl = (bookid) => `https://oceanoflights.org/${String(bookid).toLowerCase().replace(/_/g, '-')}/`;
export const inventoryUrl = (pin) => `https://portlandiator.github.io/PI_browser/?id=${encodeURIComponent(pin)}`;
function metaSourceUrls(metadata) {
  const m = parseMeta(metadata);
  if (!m) return [];
  return [m.sourceUrl, m.bookid && oceanoflightsUrl(m.bookid), m.pin && inventoryUrl(m.pin)];
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
  // Every OceanLibrary paragraph has a para_id (the site copy's id="para_N"); search carries it as external_para_id.
  // Attach it here, once, so no search path can hand out a book-level OceanLibrary link when the paragraph is known.
  const withPara = (u) => (doc.external_para_id && tierOf(u).tier === 1 && !/paraId=/.test(u)
    ? `${u}${u.includes('?') ? '&' : '?'}paraId=${encodeURIComponent(doc.external_para_id)}` : u);
  const candidates = [doc.source_url, ...metaSourceUrls(doc.metadata)]
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    .map((u) => withPara(u))
    .map((u) => ({ url: u, ...tierOf(u) }))
    .filter((c) => c.tier < 5);   // our own address stored as a "source" is not a source
  // Best tier wins; within a tier, a paragraph-level link beats a whole-document one.
  candidates.sort((a, b) => a.tier - b.tier || Number(paragraphLevel(b.url)) - Number(paragraphLevel(a.url)));
  const best = candidates[0];
  if (!best) return { url: reader, site: OURS, tier: 5, paragraph_level: true, reader_url: reader };
  return { url: best.url, site: best.site, tier: best.tier, paragraph_level: paragraphLevel(best.url), reader_url: reader };
}
