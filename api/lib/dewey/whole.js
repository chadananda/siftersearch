// IS THIS COPY THE WHOLE WORK? (Chad 10-19: "please do not propose books that are incomplete. That is a trap") — one check
// for every offer (scouts, folder sweeps): a contents / index / appendix / excerpt / sample / preview FILE ('Abdu'l-Bahá in
// Europe arrived as its 19-page contents PDF), preview wording, a "book" of a few thousand words, a PDF far shorter than
// the published edition. An incomplete copy is never offered: the scout looks on for a whole one. Pure (published: pages).
import { previewSigns } from '../ops/dewey-intake-job.js';

const PART_FILE = /(?:^|[_\-\s.])(?:contents|toc|index|appendix|appendices|excerpts?|extract|sample|preview|chapter[_\-\s]?\d+|ch\d+|part[_\-\s]?\d+|vol(?:ume)?[_\-\s]?\d+[_\-\s]?of|front[_\-\s]?matter|introduction|intro)(?:[_\-\s.]|$)/i;

/** → { whole: boolean, why: [] }. copy: { name|url, kind, words (whole text, estimated when sampled), pdfPages, text } */
export function wholeWork({ name = '', url = '', kind = '', words = null, pdfPages = null, text = '', published = 0 } = {}) {
  const why = [];
  const file = decodeURIComponent(String(name || url || '').split('?')[0].split('/').pop() || '');
  if (PART_FILE.test(file.replace(/\.[a-z0-9]+$/i, ''))) why.push(`the file is only part of the work (“${file}”)`);
  const p = previewSigns(text);
  if (p) why.push(`it reads as a preview (“${p}”)`);
  const book = /book/i.test(String(kind || ''));
  if (book && words != null && words < 5000) why.push(`a book of only ${words.toLocaleString('en-US')} words`);
  if (book && published >= 60 && pdfPages && pdfPages < published * 0.5 && (words == null || words < published * 150)) why.push(`${pdfPages} pages; the published book has about ${published}`);
  return { whole: !why.length, why };
}

/** The whole text's words, estimated when only sampled pages were read (identifyAndCheck's sample). */
export function estimatedWords(doc) {
  const w = String(doc?.identified?._text || doc?.excerpt || '').split(/\s+/).filter(Boolean).length;
  const s = doc?.identified?.sample;
  return s?.of && s?.sampled?.length ? Math.round(w * s.of / s.sampled.length) : w;
}
