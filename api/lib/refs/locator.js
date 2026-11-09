// A paragraph's citable LOCATOR (11-04, digest #156): the place inside its work a reader cites — "#117.2" (Gleanings
// section.paragraph), "Arabic #5" (Hidden Words), "#12" (Íqán), else the nearest section heading ("The Seven Valleys"). Both inputs are already
// stored per row (block_attrs.pn from the refs schemes, content.heading from ingest), so this is a projection at read time,
// no index walk and no backfill. Pure. Deps: sections.js (heading cleanup).
import { isNoiseHeading, cleanHeading } from '../sections.js';

const ROMAN_PN = /^([IVXLCDM]+)(?:\.(\d+))?$/;   // Gleanings: "CXVII" opens the section (= its paragraph 1), "CXVII.2" continues it
const ROMAN = { I: 1, V: 5, X: 10, C: 100, L: 50, D: 500, M: 1000 };
// Roman → Arabic: numerals are a presentation choice, not an address (Chad 11-09)
const toArabic = (r) => [...r].reduce((t, c, i, a) => t + (ROMAN[c] < (ROMAN[a[i + 1]] || 0) ? -ROMAN[c] : ROMAN[c]), 0);
const MAX_HEADING = 80;
const same = (a, b) => String(a || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === String(b || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** {pn, heading, title} → the locator string, or null when the row has nothing a reader could cite by. */
export function paragraphLocator({ pn = null, heading = null, title = null } = {}) {
  const n = pn == null ? '' : String(pn).trim();
  if (n) {
    const roman = n.match(ROMAN_PN);
    if (roman) return `#${toArabic(roman[1])}.${roman[2] || 1}`;   // section.paragraph: "CXVII.2" → "#117.2", "CXVII" → "#117.1"
    if (/^\d+(\.\d+)?$/.test(n)) return `#${n}`;
    return n.replace(/^(.*?[^\d\s])\s*(\d+)$/, '$1 #$2');   // "Arabic 5" → "Arabic #5", "Q&A 3" → "Q&A #3"
  }
  if (!heading || isNoiseHeading(heading)) return null;
  const h = cleanHeading(heading);
  if (!h || h.length > MAX_HEADING || same(h, title)) return null;   // the book's own title locates nothing
  return h;
}
