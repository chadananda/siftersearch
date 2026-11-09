// Where IN the work a citation points (Chad 11-09): "<subdocument>, <locator>" else "¶<paragraph_index>". Pure. Deps: none.
// locator = refs/locator.js (traditional number or section heading); subdocument = a part inside a container work, if the row carries one.
// Unknown fields are omitted, never invented. paragraph_index is the block index in the document (no per-chapter number is stored).
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** {locator, subdocument, paragraph_index} → "Tablet of Ahmad, ¶4" | "CXVII" | "¶12" | null. */
export function placeOf({ locator = null, subdocument = null, paragraph_index = null } = {}) {
  const loc = clean(locator), sub = clean(subdocument), n = Number.isInteger(paragraph_index) && paragraph_index >= 0 ? `¶${paragraph_index}` : '';
  const place = [sub && sub !== loc ? sub : '', loc || n].filter(Boolean).join(', ');
  return place || null;
}

/** The citation text: title, then where in it. Link text stays the whole of it. */
export const citeLabel = (title, place) => (place ? `${title}, ${place}` : title);
