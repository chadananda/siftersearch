// Translators and interpreters (migration 141): recognise "X, Interpreter" / "Interpreted by X" / "Translated by X from his
// Persian notes" lines, a translator in a title ("… – tr William McCants"), and fold spelling variants to one canonical
// name so the same interpreter is comparable across books (Chad, 2026-10-03: "compare Farid to Sohrab"). Pure.

// Known translators/interpreters: canonical name ← variants (any match anywhere in the raw name).
const KNOWN = [
  ['Ameen U. Faríd', /\b(?:Ameen|Am[ií]n(?:u['’]?ll[aá]h)?)\b.*\bFar[iíe]{1,2}d\b|\bDr\.?\s*Far[iíe]{1,2}d\b|^Far[iíe]{1,2}d$/i],
  ['Mírzá Aḥmad Sohrab', /\bSohr[aá]b\b/i],
  ['Shoghi Effendi', /\bShoghi\b|\bRabb[aá]n[ií]\b/i],
  ['Ali-Kuli Khan', /\bAl[ií][- ]?K[uú]l[ií]\s+Kh[aá]n\b/i],
  ['Marzieh Gail', /\bMarzieh\s+Gail\b/i],
  ['Ruhi Afnan', /\bR[uú][hḥ][ií]\b.*\bAfn[aá]n\b/i],
  ['Habib Taherzadeh', /\bHab[ií]b\b.*\bTaherzadeh\b/i],
  ['Youness Afroukhteh', /\bAfroukhteh\b/i],
  ['Díyá M. Baghdádí', /\bBa[gḡ]h?d[aá]d[ií]\b/i],
];
const TITLES = /^(?:Dr\.?|Doctor|Mr\.?|Mrs\.?|Miss|Prof\.?|Jin[aá]b-i-|Jenabe?)\s+/i;

/** Canonical form of a translator/interpreter name; unknown names are cleaned of titles and stray punctuation. */
export function canonicalTranslator(raw) {
  const s = String(raw || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/[.,;:—–-]+$/, '').trim();
  if (!s || s.length < 3 || /^unknown$/i.test(s)) return null;
  // a PERSON's name: capitalised, not a Central Figure ("interpreted by ’Abdu’l-Bahá to mean", "a Mullá in our"), short
  if (!/^\p{Lu}/u.test(s) || /Bah[aá]['’]?u['’]?ll[aá]h|['’‘]Abdu['’]l-Bah[aá]|\bthe B[aá]b\b/i.test(s) || s.split(' ').length > 6) return null;
  for (const [name, re] of KNOWN) if (re.test(s)) return name;
  return s.replace(TITLES, '').trim() || null;
}

/** The interpreter / translator named by a talk-record line or heading, or null. */
export function interpreterOf(line) {
  const t = String(line || '').replace(/^#+\s*|[*_]/g, '').replace(/\[a\d+\]/g, '').trim();
  if (t.length > 160) return null;
  let m = t.match(/^(.{2,60}?),\s*Interpreter\b/i)
    || t.match(/\bInterpreted\s+by\s+([^,;]{3,60}?)(?:[;,]|\s+(?:and|stenographic|notes|to)\b|\.?$)/i)
    || t.match(/^Translated\s+by\s+([^,;]{3,60}?)(?:\s+from\b.*|,.*)?[.;]?$/i);
  return m ? canonicalTranslator(m[1]) : null;
}

/** A translator named in a document title: "Ozymandius - tr William McCants", "… (trans. Juan Cole)". */
export function titleTranslator(title) {
  const t = String(title || '');
  const m = t.match(/\s[-–—]\s*tr(?:ans(?:lated)?)?\.?\s+(?:by\s+)?([^()\[\]]{3,60})$/i)
    || t.match(/\((?:tr|trans|translated)\.?\s+(?:by\s+)?([^()]{3,60})\)/i)
    || t.match(/\btranslated\s+by\s+([^()\[\],;]{3,60})/i);
  return m ? canonicalTranslator(m[1]) : null;
}

/** Translator names from a source file's frontmatter value ("Dr. Ameen Fareed (for most tablets)", "A; B", "A and B"). */
export function frontmatterTranslators(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/\s*(?:;|&|\band\b|,\s+(?=[A-Z]))\s*/);
  return [...new Set(list.map(canonicalTranslator).filter(Boolean))];
}
