// A paragraph's citable LOCATOR (11-04, digest #156): the place inside its work a reader cites — "CXVII" (Gleanings),
// "Arabic 5" (Hidden Words), "¶12" (Íqán), else the nearest section heading ("The Seven Valleys"). Both inputs are already
// stored per row (block_attrs.pn from the refs schemes, content.heading from ingest), so this is a projection at read time,
// no index walk and no backfill. Pure. Deps: sections.js (heading cleanup).
import { isNoiseHeading, cleanHeading } from '../sections.js';

const ROMAN_PN = /^([IVXLCDM]+)(?:\.\d+)?$/;   // Gleanings: "CXVII" opens the section, "CXVII.2" continues it
const MAX_HEADING = 80;
const same = (a, b) => String(a || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === String(b || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** {pn, heading, title} → the locator string, or null when the row has nothing a reader could cite by. */
export function paragraphLocator({ pn = null, heading = null, title = null } = {}) {
  const n = pn == null ? '' : String(pn).trim();
  if (n) {
    const roman = n.match(ROMAN_PN);
    if (roman) return roman[1];
    if (/^\d+$/.test(n)) return `¶${n}`;
    return n;   // "Arabic 5", "Persian 3", "Q&A 3"
  }
  if (!heading || isNoiseHeading(heading)) return null;
  const h = cleanHeading(heading);
  if (!h || h.length > MAX_HEADING || same(h, title)) return null;   // the book's own title locates nothing
  return h;
}
