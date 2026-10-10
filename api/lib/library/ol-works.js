// OceanLibrary shelves vs multi-part works (Chad 10-10). Pure; used by the OceanLibrary adapter (doc.collection = the
// folder) and by search hydration (paragraphs-repo: hit title = the citation title).
// OceanLibrary files each book under <tradition>/<folder>/<book>.md or directly under <tradition>/. A folder is either a
// SHELF of separate books — named after their author ("Bahá’u’lláh", "Al-Ghazzali", "Unknown") or a named grouping
// (OL_SHELVES_OF_SEPARATE_WORKS) — or ONE large work split into parts (OL_MULTIPART_WORKS: KJV, Qur'an, Rig Veda…). A part of a
// work is cited as "<work>, <part>" and shown as one card on its shelf (Chad 10-10: "very large works like the KJV or the
// Qur'an are organized as collections of documents. That should not impact citation.").
export const OL_SHELVES_OF_SEPARATE_WORKS = Object.freeze(new Set([
  'Research Department Compilations', 'Hadith Collections', 'Mormon Texts', 'Deuterocanonical Books',
]));
// The multi-part works, by name — an explicit list, not a guess from authors: a compilation credited to its compiler
// but filed in an author's folder (Lights of Guidance under Bahá’u’lláh) must not turn that folder into a "work". A
// folder not listed here is a shelf of separate books — the safe default (citations unchanged).
export const OL_MULTIPART_WORKS = Object.freeze(new Set([
  'The Bible (KJV)', 'The Quran (Rodwell)', 'The Tanakh (JPS 1917)', 'The Gospels (Greek-titled)',
  'Rig Veda', 'The Mahabharata', 'The Upanishads', 'Avesta', 'Khorda Avesta',
]));
/** {shelf, work} for an OceanLibrary file path ("-sites/oceanlibrary.com/<tradition>/<folder>/<file>.md" or relative to
 *  the site). shelf = the folder (null for a book directly under its tradition); work = the folder when it is one work. */
export function olPlacement(relativePath, _author) {   // author kept in the signature: callers pass it; the list decides
  const parts = String(relativePath || '').split('/').filter(Boolean);
  const i = parts.indexOf('oceanlibrary.com');
  const rest = i >= 0 ? parts.slice(i + 1) : parts;            // [tradition, folder?, file]
  if (rest.length < 3) return { shelf: null, work: null };
  const folder = rest[1];
  return { shelf: folder, work: OL_MULTIPART_WORKS.has(folder) ? folder : null };
}
/** The multi-part work a doc row belongs to (null for a standalone book): from its path when the row has one, else from
 *  its collection (= the folder, since 10-10). */
export function olWorkOf(doc) {
  if (doc?.source_site !== 'oceanlibrary.com') return null;
  if (doc.file_path) return olPlacement(doc.file_path, doc.author).work;
  const f = doc.collection;
  if (!f || /^[0-9a-f]{32}$/.test(f)) return null;            // unset, or the pre-10-10 hash
  return OL_MULTIPART_WORKS.has(f) ? f : null;
}
/** The title to cite: "<work>, <part>" for a part of a multi-part work, else the title. Works on a doc row. */
export function olCiteTitle(doc) {
  const work = olWorkOf(doc);
  return work && doc.title && !doc.title.startsWith(work) ? `${work}, ${doc.title}` : (doc?.title ?? '');
}
