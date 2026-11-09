// Where IN the work a citation points (Chad 11-09: at minimum chapter.paragraph): "<subdocument>, <locator>[, ¶n]". Pure. Deps: none.
// locator = refs/locator.js (traditional number "CXVII.2"/"Arabic 5"/"¶12", or a section heading → ¶n added); subdocument = a part inside a container work, if the row carries one.
// Unknown fields are omitted, never invented. paragraph_index is the block index in the document (no per-chapter number is stored).
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** {locator, subdocument, paragraph_index} → "Tablet of Ahmad, ¶4" | "CXVII" | "¶12" | null. */
export function placeOf({ locator = null, subdocument = null, paragraph_index = null } = {}) {
  const loc = clean(locator), sub = clean(subdocument), n = Number.isInteger(paragraph_index) && paragraph_index >= 0 ? `¶${paragraph_index}` : '';
  // a locator that is only a heading (no paragraph number in it) still gets the paragraph: "The Seven Valleys, ¶12"
  const paraLevel = /^¶\d+$|\d$|^[IVXLCDM]+$/.test(loc);   // "CXVII" alone = that chapter's opening paragraph
  const place = [sub && sub !== loc ? sub : '', loc, loc && paraLevel ? '' : n].filter(Boolean).join(', ');
  return place || null;
}

/** The citation text: title, then where in it. Link text stays the whole of it. */
export const citeLabel = (title, place) => (place ? `${title}, ${place}` : title);
