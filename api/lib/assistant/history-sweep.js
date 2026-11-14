// The history sweep (Dawn-Breakers battery 11-14, retrieval gap): a library-wide search on a bare name (Bajistání, Khu'í, Ibdál, Kandí…)
// found nothing although each stands in The Dawn-Breakers and most in Balyuzi, Momen or Ẓuhúru'l-Ḥaqq. A history search therefore also
// searches INSIDE those works — Nabíl always; for a person lookup (a short query) all of them, with spelling variants. Deps: impl.searchIn.
import { NARRATIVE_DOCS } from './source-tier.js';

// Nabíl first, then Balyuzi (The Báb, Bahá'u'lláh: The King of Glory, 'Abdu'l-Bahá, Edward Granville Browne…), Momen, Ẓuhúru'l-Ḥaqq vol 3
export const HISTORY_WORKS = [...NARRATIVE_DOCS, 462, 466, 467, 3887, 11557, 15254];
export const HISTORY_NAMES = "Nabíl's The Dawn-Breakers, Balyuzi, Momen, Ẓuhúru'l-Ḥaqq";
const strip = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[’'ʻʿʼ`‘]/g, '').replace(/\s+/g, ' ').trim();
/** The spellings a name is searched by: as given, diacritics and hamza/ayn dropped, the -í/-iy ending swapped. ≤3, distinct. Pure. */
export const nameVariants = (q) => {
  const s = strip(q);
  const y = /iy\b/i.test(s) ? s.replace(/iy\b/gi, 'i') : s.replace(/(?<=\p{L}{2})i\b/giu, 'iy');
  return [...new Set([String(q).trim(), s, y].filter(Boolean))].slice(0, 3);
};
/** A person lookup: a name or a name with a word or two, not an event described in a sentence. Pure. */
export const personLookup = (q) => strip(q).split(/\s+/).filter(Boolean).length <= 5;

/** Search inside the history works. → { hits (≤3 Nabíl + ≤3 others, work order kept), variants, person, n }. Never throws. */
export async function sweepHistory(impl, query) {
  const person = personLookup(query);
  const variants = person ? nameVariants(query) : [String(query).trim()];
  const works = person ? HISTORY_WORKS : NARRATIVE_DOCS;
  const runs = works.flatMap((doc, w) => (w === 0 ? variants : variants.slice(0, 2)).map((v) => ({ doc, v })));
  const got = await Promise.all(runs.map(({ doc, v }) => Promise.resolve().then(() => impl.searchIn(v, doc)).then((r) => (r || []).map((p) => ({ ...p, _w: doc }))).catch(() => [])));
  const seen = new Set(), nabil = [], other = [];
  for (const p of got.flat()) {
    const k = p.id ?? `${p.document_id}:${String(p.text || '').slice(0, 80)}`;
    if (seen.has(k) || !p.text) continue;
    seen.add(k);
    const { _w, ...q } = p;
    (NARRATIVE_DOCS.includes(_w) ? nabil : other).push(q);
  }
  const hits = [...nabil.slice(0, 3), ...other.slice(0, 3)];
  return { hits, variants, person, n: hits.length };
}
