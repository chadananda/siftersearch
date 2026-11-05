// One passage standing in several copies of a work: the key that says two hits are the same text, and which copy to keep when
// their authority ties — the OceanLibrary copy of a core text (Chad 11-04: "SAQ should use the OceanLibrary.com version, as with
// all the core texts"; publisher order source-links.js). Pure. Deps: source-links.
import { tierOf, SIFTER_TIER } from '../source-links.js';

// page markers ("[pg 306]") and a leading paragraph number ("1 \t") are typesetting, not text: SAQ 20911 vs 919097 never matched
const PAGE_MARK = /\[\s*(?:pg|page|p\.?)\s*\d+[a-z]?\s*\]/gi;
export const copyKey = (t) => String(t || '').replace(PAGE_MARK, ' ').replace(/^\s*\d{1,4}[.)]?\s+/, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').toLowerCase().trim().slice(0, 160);

/** Lower = better publisher of the copy: the OceanLibrary document itself (0), then by its link's site (1 OceanLibrary book link,
 *  2 Ocean of Lights, 3 Phelps, 4 bahai-library, 5 other, 6 ours). An OceanLibrary book link without the OL document is only
 *  a pointer, so the OL document wins over it. */
export const publisherRank = (p = {}) => {
  if (p.source_site === 'oceanlibrary.com') return 0;
  return p.source_url ? tierOf(p.source_url).tier : SIFTER_TIER;
};
