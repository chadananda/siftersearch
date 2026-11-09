// Where IN the work a citation points (Chad 11-09): "<subdocument>, <locator>[, #n]". Pure. Deps: none.
// locator = refs/locator.js ("#117.2", "Arabic #5", "#12", or a section heading); para_no = 1-based ordinal among the doc's
// NON-heading blocks (paragraphs-repo), shown as "#n" only when the locator has no paragraph number. Never "¶", never 0-based.
// Unknown fields are omitted, never invented. paragraph_index (block index, URL anchors) is NOT displayed.
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** {locator, subdocument, para_no} → "Tablet of Ahmad, #4" | "#117.2" | "The Seven Valleys, #9" | "#12" | null. */
export function placeOf({ locator = null, subdocument = null, para_no = null } = {}) {
  const loc = clean(locator), sub = clean(subdocument), n = Number.isInteger(para_no) && para_no >= 1 ? `#${para_no}` : '';
  const paraLevel = /^#\d|\s#\d/.test(loc);   // the locator already names the paragraph
  return [sub && sub !== loc ? sub : '', loc, loc && paraLevel ? '' : n].filter(Boolean).join(', ') || null;
}

/** The citation text: title, then where in it. Link text stays the whole of it. */
export const citeLabel = (title, place) => (place ? `${title}, ${place}` : title);
