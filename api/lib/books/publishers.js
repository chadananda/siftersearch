// PUBLISHERS — who published a book, read from its own pages, and what that means for rights (Chad 10-23: "Books from George
// Ronald, for instance, are copyright encumbered"). Pure.
//   commercial  — a commercial or private press (George Ronald, Kalimát, Oneworld, Palabra, Nur, Juxta, university and trade
//                 presses …) → its books are encumbered
//   institutional — a Bahá'í institution publishing its own texts (UHJ, BWC, BIC, an NSA in its own name) → never
//   review      — a Bahá'í Publishing Trust / national Bahá'í publishing house: Chad's pending question, never decided here
import { norm } from '../rights/canonical.js';

// [display name, pattern on the normalised text, class]
export const KNOWN_PUBLISHERS = Object.freeze([
  ['George Ronald', /\bgeorge ronald\b/, 'commercial'],
  ['Kalimát Press', /\bkalimat press\b/, 'commercial'],
  ['Oneworld Publications', /\bone ?world (publications|oxford)\b|\boneworld\b/, 'commercial'],
  ['Palabra Publications', /\bpalabra\b/, 'commercial'],
  ['Nur Publications', /\bnur publications?\b/, 'commercial'],
  ['Juxta Publishing', /\bjuxta\b/, 'commercial'],
  ['Naturegraph', /\bnaturegraph\b/, 'commercial'],
  ['Global Perspective', /\bglobal perspective\b/, 'commercial'],
  ['Baha’i Studies Review / Intellect', /\bintellect (books|ltd)\b/, 'commercial'],
  ['Association for Bahá’í Studies', /\bassociation for bahai studies\b/, 'review'],   // an agency of a National Assembly?
  ['Wilmette Institute', /\bwilmette institute\b/, 'review'],
  ['Bahá’í Publishing Trust', /\bbahai publishing trust\b|\bb p t\b/, 'review'],
  ['Bahá’í Publishing (US)', /\bbahai publishing\b(?! trust)/, 'review'],
  ['Bahá’í Publications Australia', /\bbahai publications australia\b/, 'review'],
  ['Bahá’í Distribution Service', /\bbahai distribution service\b/, 'review'],
  ['Bahá’í World Centre', /\bbahai world cent(re|er)\b/, 'institutional'],
  ['Bahá’í International Community', /\bbahai international community\b/, 'institutional'],
  ['Universal House of Justice', /\buniversal house of justice\b/, 'institutional'],
  ['National Spiritual Assembly', /\bnational spiritual assembly\b/, 'institutional'],
]);
// any other press in a publisher line is a commercial/academic house
const GENERIC_PRESS = /\b(university press|press|publishers?|publishing|publications|books|verlag|editions|edizioni|editorial|ediciones|knopf|pantheon|penguin|random house|harper ?collins|macmillan|routledge|brill|tauris|walker|doubleday|simon (and|&) schuster|curzon|mellen)\b/;

/** A publisher name → { name, class } (class: commercial | institutional | review), or null. */
export function publisherClass(name) {
  const n = norm(name);
  if (!n) return null;
  for (const [display, re, cls] of KNOWN_PUBLISHERS) if (re.test(n)) return { name: display, class: cls };
  return GENERIC_PRESS.test(n) ? { name: String(name).trim(), class: 'commercial' } : null;
}

const YEAR = '((?:1[6-9]|20)\\d{2})';
// A publisher named in a CITATION, an "also by" list or an approval line is not this book's publisher (10-23 dry run: a
// bibliography's "Oxford: George Ronald, 1973", "(Bahá’í Publishing Trust, London, 1972)", "Approved by the National
// Spiritual Assembly" were all taken as imprints).
const PAREN = /\([^()]*\)/g;
const CITE = /[_*]|\bpp?\.\s*\d|\bedition of\b|\breferences?\b|\bcited\b|\bsee\b|\bibid\b|\bbibliograph|\bvol\.\s*\d|\bin:/i;
const ALSO = /\b(by the same author|also by|other books|other titles|works by|books by|du meme auteur)\b/;
const APPROVAL = /\b(approved|authori[sz]ed|reviewed|review(ing)? (committee|panel)|appreciation|thanks|grateful|permission|supervision|letter|dated|message)\b/;
const CUE = /©|\(c\)\s*\d|\bcopyright\b|\ball rights reserved\b|\bpublished by\b|\bpublishers?\b|\bprinted in\b|\bfirst published\b/i;
/** May this front-page line name the book's own publisher? Short imprint lines, or lines with a copyright/publisher cue. */
export function publisherLineOk(line) {
  const n = norm(line);
  if (ALSO.test(n) || CITE.test(line)) return false;
  if (/^[^(]*\)/.test(line)) return false;   // "George Ronald, 1989)." — the tail of a citation
  return line.length <= 160 || CUE.test(line);
}
/**
 * What a book's own front pages say about its publication: publisher, year, edition (with the line each came from).
 * paragraphs: the first pages [{ text }]. → { publisher?, year?, edition?, printing_year? } each { value, evidence }.
 */
export function imprintFromText(paragraphs = []) {
  const out = {};
  const lines = paragraphs.slice(0, 40).map((p) => String(p?.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const clip = (s) => s.slice(0, 200);
  for (const line of lines) {
    const n = norm(line);
    if (!out.publisher && publisherLineOk(line)) {
      const k = KNOWN_PUBLISHERS.find(([, re, cls]) => re.test(norm(line.replace(PAREN, ' '))) && !(cls === 'institutional' && APPROVAL.test(n)));
      if (k) out.publisher = { value: k[0], class: k[2], evidence: clip(line) };
      else {
        const m = line.match(/\bpublished (?:in [^.]{0,40} )?by ([A-Z][^.,;©\n]{2,60})/) || line.match(/\b([A-Z][\w'’&. ]{2,40}),? Publishers?\b/);
        const c = m && publisherClass(m[1]);
        if (c && !(c.class === 'institutional' && APPROVAL.test(n))) out.publisher = { value: c.name, class: c.class, evidence: clip(line) };
      }
    }
    if (!out.year && !CITE.test(line) && !ALSO.test(n)) {
      const m = line.match(new RegExp(`(?:©|\\(c\\)|copyright)\\s*(?:by\\s+)?(?:[^0-9]{0,60}?)${YEAR}`, 'i'))
        || line.match(new RegExp(`\\bfirst (?:published|edition|printed)(?: in [^0-9]{0,40})?\\s*(?:in\\s+)?${YEAR}`, 'i'));
      if (m) out.year = { value: Number(m[1]), evidence: clip(line) };
    }
    if (!out.edition) {
      const m = line.match(/\b(first|second|third|fourth|fifth|sixth|revised|new|enlarged|expanded|\d+(?:st|nd|rd|th))\s+(?:revised\s+)?edition\b/i);
      if (m) out.edition = { value: `${m[1].toLowerCase()} edition`, evidence: clip(line) };
    }
    if (!out.printing_year) {
      const m = line.match(new RegExp(`\\b(?:reprinted|this edition|printed)[^0-9]{0,30}${YEAR}`, 'i'));
      if (m) out.printing_year = { value: Number(m[1]), evidence: clip(line) };
    }
  }
  return out;
}
