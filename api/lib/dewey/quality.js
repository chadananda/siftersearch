// IMPORT QUALITY (Chad 10-18: "individually inspect each book that Dewey prepares for import to find ways to improve it
// further and build those into Dewey and suggest to SLP"): what a document's stored paragraphs say about how it was read.
// Pure measures, one document at a time; the dewey-quality ops report runs them over every Dewey import, worst first.
// Each finding names its likely CAUSE so it becomes a fix (Dewey) or a suggestion (SearchLayerPDF).
import { wordRatio } from './convert.js';

const TERMINAL = /[.!?:;"”’)\]…]$/;
const norm = (t) => String(t || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** paragraphs [{ text }] + item → { metrics, findings: [{ code, n, example, cause, fix }] }. */
export function inspectDocument(paragraphs, item = {}) {
  const ps = paragraphs.map((p) => String(p.text || '').trim()).filter(Boolean);
  const words = ps.map((t) => t.split(/\s+/).length);
  const total = words.reduce((a, b) => a + b, 0);
  const findings = [];
  const add = (code, n, example, cause, fix) => { if (n) findings.push({ code, n, example: String(example || '').slice(0, 160), cause, fix }); };

  // a sentence split across paragraphs: no end punctuation, next starts lower-case / with a digit
  const splits = [];
  for (let k = 0; k + 1 < ps.length; k++) if (!TERMINAL.test(ps[k]) && words[k] >= 4 && /^[\p{Ll}\d]/u.test(ps[k + 1])) splits.push(`${ps[k].slice(-60)} ‖ ${ps[k + 1].slice(0, 40)}`);
  add('split-sentences', splits.length, splits[0], 'line ends taken as paragraph breaks', 'rejoin blocks that do not end a sentence (SLP: emit paragraphs, not printed lines)');

  // running headers / footers: the same short line again and again
  const counts = new Map();
  for (const t of ps) if (t.split(/\s+/).length <= 10) counts.set(norm(t), (counts.get(norm(t)) || 0) + 1);
  const repeats = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  add('running-headers', repeats.reduce((n, [, c]) => n + c, 0), repeats[0]?.[0], 'page headers/footers kept as text', 'drop short lines repeated on many pages (SLP: mark headers/footers, never in the Markdown)');

  // bare page numbers and page labels
  const pageNums = ps.filter((t) => /^(page\s+)?[\divxlc]{1,6}\.?$/i.test(t) || /^-\s*\d+\s*-$/.test(t));
  add('page-numbers', pageNums.length, pageNums[0], 'printed page numbers kept as paragraphs', 'remove; record as <pb n/> instead (SLP: page labels as markers only)');

  // words broken by a line-end hyphen and left apart ("para- graph")
  const hyph = ps.flatMap((t) => t.match(/\b\p{L}{2,}- \p{Ll}{2,}\b/gu) || []);
  add('broken-hyphens', hyph.length, hyph[0], 'line-end hyphenation not rejoined', 'join "word- word" when the halves make a word');

  // fragments: very short paragraphs that are not headings
  const frags = ps.filter((t, k) => words[k] <= 3 && !/^#/.test(t) && !/^[\p{Lu}\d]/u.test(t));
  add('fragments', frags.length, frags[0], 'bits of lines (marginalia, stamps, broken OCR)', 'merge into the neighbouring paragraph or drop');

  // a wall of text: no paragraph breaks at all
  const walls = ps.filter((t, k) => words[k] > 600);
  add('walls', walls.length, walls[0]?.slice(0, 80), 'paragraph breaks lost', 'split at sentence boundaries near blank-line / indentation cues');

  // OCR noise (Latin text)
  const latin = ps.join(' ');
  const ratio = /[A-Za-z]/.test(latin) ? wordRatio(latin) : null;
  if (ratio != null && ratio < 0.8) add('ocr-noise', Math.round((1 - ratio) * 100), latin.split(/\s+/).filter((w) => w.length > 1 && !/^[A-Za-z][a-z'’-]*[a-z][.,;:!?)"’]*$/.test(w)).slice(0, 8).join(' '), 'misread characters', 'a cleaner OCR pass, or the vision transcription for handwriting');

  // Markdown left in the text
  const md = ps.filter((t) => /\*\*|__|^#{1,6}\s|\[\]\(|<!--/.test(t));
  add('markup', md.length, md[0], 'Markdown/HTML left in a paragraph', 'strip before ingest');

  // catalogue: title and author
  const title = String(item.title || '');
  if (/^untitled|\.(pdf|docx?|rtf|txt)\b|_/i.test(title)) add('weak-title', 1, title, 'no title found in the contents', 'take the title from the first page / SLP metadata');
  if (!item.author && !/^(letter|email|minutes)/i.test(String(item.identified?.appraisal?.kind || ''))) add('no-author', 1, title, 'author not identified', 'read the title page / byline');

  const score = Math.round(100 * findings.reduce((s, f) => s + Math.min(1, f.n / Math.max(1, ps.length)) * (f.code === 'ocr-noise' ? 2 : 1), 0)) / 100;
  return { metrics: { paragraphs: ps.length, words: total, avg_words: ps.length ? Math.round(total / ps.length) : 0, word_ratio: ratio == null ? null : +ratio.toFixed(2) }, findings, score };
}
