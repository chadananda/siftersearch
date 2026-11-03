// NUMBERING TABLES (data, not intent): how editions in the library number their parts, so a reference Jev already chose
// ("Qur’án 2:255", "Some Answered Questions 33") resolves to the exact paragraph. Each layout is checked against the
// edition's paragraph_count at run time; a mismatch means the edition changed and the caller falls back. Pure.

/** Verses per sūra, standard (Kufan) numbering — 6236 in all. */
export const QURAN_VERSES = Object.freeze([7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]);

/** Pickthall's "The Meaning of the Glorious Qur’án" as ingested (verified 11-03 via literal_search + context_lookup, and 113 of
 *  114 sūras against the markdown): 2 front-matter paragraphs; al-Fātiḥa = its basmala (1:1) + three merged paragraphs
 *  (1:2–3, 1:4–5, 1:6–7); every later sūra = a basmala paragraph (none for sūra 9) then ONE paragraph per verse. */
export const PICKTHALL = Object.freeze({ title: 'Pickthall', front: 2, fatiha: Object.freeze({ 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3 }), fatihaRows: 4, noBasmala: Object.freeze([9]) });

const rowsOf = (L, s) => (s === 1 ? L.fatihaRows : QURAN_VERSES[s - 1] + (L.noBasmala.includes(s) ? 0 : 1));
/** The paragraph count the layout predicts (6347 for Pickthall). */
export const layoutTotal = (L) => L.front + QURAN_VERSES.reduce((n, _, i) => n + rowsOf(L, i + 1), 0);

/** sūra:verse → paragraph_index in the layout, or null when the verse does not exist. verse 0 = the sūra's basmala. */
export function quranIndex(L, sura, verse) {
  if (!(sura >= 1 && sura <= 114) || verse == null || verse < 0 || verse > QURAN_VERSES[sura - 1]) return null;
  let i = L.front;
  for (let s = 1; s < sura; s++) i += rowsOf(L, s);
  if (sura === 1) return i + L.fatiha[Math.max(1, verse)];
  const basmala = L.noBasmala.includes(sura) ? 0 : 1;
  if (verse === 0) return basmala ? i : null;
  return i + basmala + verse - 1;
}

/** A Qur’án reference → the paragraph range to read: a verse (or span), else the sūra's opening (basmala + 3 verses). */
export function quranRange(L, { sura, verse = null, verseEnd = null }) {
  if (verse == null) { const a = quranIndex(L, sura, 0) ?? quranIndex(L, sura, 1); const b = quranIndex(L, sura, Math.min(3, QURAN_VERSES[sura - 1] ?? 0)); return a == null || b == null ? null : [a, b]; }
  const a = quranIndex(L, sura, verse), b = quranIndex(L, sura, verseEnd ?? verse);
  return a == null || b == null || b < a ? null : [a, b];
}
