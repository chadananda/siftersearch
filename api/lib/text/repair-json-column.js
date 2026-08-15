// Repair entity_research columns that hold PROSE where the reader expects JSON.
//
// bio.js parses aliases/kinship as arrays and research_notes as an object. 20 rows hold a bare sentence
// instead ("Identified…", "Qájár prince"), so every read threw and the person silently lost their death or
// kin — indistinguishable from a person who has none. Found only once the swallowed-error counter was given
// an alarm (2026-08-14).
//
// PRESERVE, DO NOT INTERPRET. It is tempting to parse "son of X" into {relation:'son', who:'X'}, but that
// invents structure from a guess, and a wrong kin edge is worse than an unstructured one — kin drives
// identity resolution. So the sentence is carried across verbatim into a shape the reader can consume, and
// a human can refine it later with the original text still in hand.

/** The shape each column's reader expects. */
export const COLUMN_SHAPES = { aliases: 'array', kinship: 'array-of-kin', research_notes: 'object' };

/** Already valid? Then it is not ours to touch. Returns the parsed value or undefined. */
export function parsedOrUndefined(raw) {
  if (raw == null || raw === '') return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/**
 * @param {string} column aliases | kinship | research_notes
 * @param {string} raw the stored value
 * @returns {{ changed: boolean, next?: string, why: string }}
 */
export function repairJsonColumn(column, raw) {
  if (!(column in COLUMN_SHAPES)) return { changed: false, why: `unknown column ${column}` };
  if (raw == null || String(raw).trim() === '') return { changed: false, why: 'empty — reader already defaults it' };
  if (parsedOrUndefined(raw) !== undefined) return { changed: false, why: 'already valid JSON' };

  const text = String(raw).trim();
  switch (COLUMN_SHAPES[column]) {
    case 'array':
      // aliases: a bare name becomes a one-entry list, which is exactly what it was meant to be.
      return { changed: true, next: JSON.stringify([text]), why: 'prose wrapped as a single-element array' };
    case 'array-of-kin':
      // kinship entries render as `${relation}: ${who}` and are tokenised for identity matching. Without a
      // trustworthy relation, say so plainly rather than fabricating one — 'noted' reads honestly in the UI
      // and cannot be mistaken for an asserted kin edge.
      return { changed: true, next: JSON.stringify([{ relation: 'noted', who: text }]), why: 'prose kept as an unstructured kin note' };
    case 'object':
      // research_notes: only `.death` is read, so parking the sentence under `note` restores the read
      // without inventing a death record that was never stated.
      return { changed: true, next: JSON.stringify({ note: text }), why: 'prose kept under note; no death invented' };
    default:
      return { changed: false, why: 'no shape' };
  }
}
