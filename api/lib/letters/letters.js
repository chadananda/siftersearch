// LETTER LOOKUP (Chad 10-21: "If someone writes a book about the most important letters of Shoghi Effendi, we should have all of
// them and be able to link to them"). An author's letters live in three shapes: a whole BOOK (The Advent of Divine Justice), a
// CHAPTER of a book (The Dispensation of Bahá'u'lláh in The World Order of Bahá'u'lláh), or a dated MESSAGE inside a compilation
// (Bahá'í Administration's "Letter of January 21st, 1922"; Messages to America's messages that END with their date line).
// buildLetters() finds them from a book's sections and paragraphs; matchLetters() answers "the letter of 28 July 1954" /
// "The Dispensation of Bahá'u'lláh". Pure — the letters-index job reads the books, letters-repo stores the rows.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'i');
const monthNo = (m) => MONTHS.indexOf(String(m).toLowerCase()) + 1;

/** Letters, digits and spaces only — for title comparison. */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A date written in a title or a date line → { y, m, d } (d / m null when the text gives less), or null.
 *  "January 21st, 1922" · "21 January 1922" · "April, 1954" · "Circa June 1947" · "1/21/22" · "10/57" · "1954-07-28". */
export function parseDate(text) {
  const t = String(text || '');
  let m = t.match(new RegExp(`${MON.source}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i'));
  if (m) return { y: +m[3], m: monthNo(m[1]), d: +m[2] };
  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON.source},?\\s+(\\d{4})`, 'i'));
  if (m) return { y: +m[3], m: monthNo(m[2]), d: +m[1] };
  m = t.match(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/);
  if (m) return { y: +m[1], m: +m[2], d: m[3] ? +m[3] : null };
  m = t.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  if (m) return { y: m[3].length === 2 ? 1900 + +m[3] : +m[3], m: +m[1], d: +m[2] };
  m = t.match(/^\s*(\d{1,2})\/(\d{2})\s*$/);
  if (m) return { y: 1900 + +m[2], m: +m[1], d: null };
  m = t.match(new RegExp(`${MON.source},?\\s+(\\d{4})`, 'i'));
  if (m) return { y: +m[2], m: monthNo(m[1]), d: null };
  return null;
}

// a paragraph that is ONLY a date line ("Cablegram June 21, 1932", "Haifa, Palestine, February 8, 1934", "March 16, 1933")
const isDateLine = (text) => { const s = String(text || '').trim(); return s.length > 0 && s.length <= 90 && !!parseDate(s) && !/[.!?]\s+\S/.test(s.replace(/\b[A-Z][a-z]?\./g, '')); };

/**
 * One book → its letters. doc { id, title }, sections [{ title, level, start_index, end_index }], paras [{ paragraph_index, text }].
 * → [{ doc_id, title, y, m, d, start, end, kind: book|chapter|message, basis }]
 */
export function buildLetters(doc, sections = [], paras = []) {
  const out = [];
  const add = (r) => out.push({ doc_id: doc.id, book_title: doc.title, ...r });
  const last = paras.length ? paras[paras.length - 1].paragraph_index : 0;
  const lines = paras.filter((p) => isDateLine(p.text)).map((p) => ({ i: p.paragraph_index, date: parseDate(p.text) }));
  const dateIn = (s, e) => { const l = lines.filter((x) => x.i >= s && x.i <= e); return l.length ? l[l.length - 1].date : null; };
  const covered = new Set();
  // 1. sections whose TITLE carries the date ("Letter of January 21st, 1922.", "Cablegram, April 25, 1950", "April, 1954")
  for (const s of sections) {
    const date = parseDate(s.title);
    if (!date) continue;
    add({ title: s.title.replace(/\s*[\[\]\\]+\s*/g, ' ').trim(), ...date, start: s.start_index, end: s.end_index, kind: 'message', basis: 'section-date' });
    covered.add(s.start_index);
  }
  // 2. CHAPTERS: a book of a few top-level sections, each a letter (The World Order of Bahá'u'lláh); its date from the date line.
  //    Not a single CONTAINER section spanning most of the book ("Messages to the Bahá'í World 1950-1957"), not a flat list of
  //    topical headings (Messages to America's 118)
  const tops = sections.filter((s) => s.level === Math.min(...sections.map((x) => x.level)));
  const span = last + 1;
  if (tops.length > 1 && tops.length <= 30 && !tops.some((s) => parseDate(s.title) || (s.end_index - s.start_index + 1) / span > 0.6)) {
    for (const s of tops) add({ title: s.title, ...(dateIn(s.start_index, s.end_index) || { y: null, m: null, d: null }), start: s.start_index, end: s.end_index, kind: 'chapter', basis: 'chapter' });
  }
  // 3. MESSAGES that end with their date line (Messages to America, Citadel of Faith): the text since the previous date line;
  //    titled by the section it starts in. Only where no dated section already names it.
  let prev = -1;
  for (const l of lines) {
    const start = prev + 1;
    prev = l.i;
    if (covered.has(start) || sections.some((s) => parseDate(s.title) && s.start_index <= l.i && l.i <= s.end_index)) continue;
    const sec = sections.filter((s) => s.start_index <= start && start <= s.end_index).sort((a, b) => b.start_index - a.start_index)[0];
    add({ title: sec?.title || doc.title, ...l.date, start, end: l.i, kind: 'message', basis: 'date-line' });
  }
  // 3b. messages DATED BY THEIR HEADING (Citadel of Faith: "November 3, 1948", then topical sub-headings until the next date)
  let cur = null;
  for (const p of paras) {
    const hd = isDateLine(p.heading) ? parseDate(p.heading) : null;
    if (hd && (!cur || cur.heading !== p.heading)) {
      if (cur) out.push(cur);
      const sec = sections.filter((x) => x.start_index <= p.paragraph_index && p.paragraph_index <= x.end_index && !parseDate(x.title)).sort((a, b) => b.start_index - a.start_index)[0];
      cur = { doc_id: doc.id, book_title: doc.title, title: sec?.title || p.heading, ...hd, start: p.paragraph_index, end: p.paragraph_index, kind: 'message', basis: 'date-heading', heading: p.heading };
    } else if (cur && p.heading && !hd) cur.end = p.paragraph_index;   // topical sub-heading: still the same message
    else if (cur && hd) cur.end = p.paragraph_index;
  }
  if (cur) out.push(cur);
  for (const r of out) delete r.heading;
  // 5. every other SECTION, by title (a letter known by its title — "A Turning Point in American Bahá'í History"), dated by the
  //    message it sits in when one is known
  for (const s of sections) {
    if (parseDate(s.title) || out.some((r) => r.start === s.start_index && r.end === s.end_index)) continue;
    const within = out.find((r) => r.kind === 'message' && r.start <= s.start_index && s.start_index <= r.end);
    add({ title: s.title, ...(within ? { y: within.y, m: within.m, d: within.d } : (dateIn(s.start_index, s.end_index) || { y: null, m: null, d: null })),
      start: s.start_index, end: s.end_index, kind: 'section', basis: 'section-title' });
  }
  // 4. the whole BOOK (a letter in its own right — The Advent of Divine Justice), dated by its closing date line if it has one
  add({ title: doc.title, ...(lines.length ? lines[lines.length - 1].date : { y: null, m: null, d: null }), start: 0, end: last, kind: 'book', basis: 'book' });
  return out;
}

/**
 * Rank letters for a citation. q { date: "1954-07-28" | "28 July 1954" | {y,m,d}, title, book } (book: a title hint, e.g. "Citadel of Faith").
 * Date: exact day 100, same month 60 (75 when both are month-only). Title: share of the asked words found, ×80 (+20 exact).
 * A book row only scores on title; a topical section only beats its letter by its title. Ties: message/chapter, book, section. → [{ ...letter, score }] best first.
 */
export function matchLetters(letters, q = {}) {
  const want = typeof q.date === 'object' && q.date ? q.date : q.date ? parseDate(q.date) : null;
  const words = fold(q.title).split(' ').filter((w) => w.length > 2);
  const scored = letters.map((l) => {
    let score = 0;
    if (want && l.y === want.y && l.m === want.m) score += l.d && want.d ? (l.d === want.d ? 100 : -50) : (!l.d && !want.d ? 75 : 60);   // month-only asks prefer month-only letters (Riḍván "April, 1955")
    else if (want && l.y && want.y && l.y !== want.y) score -= 40;
    let share = 0;
    if (words.length) {
      const have = new Set(fold(l.title).split(' '));
      share = words.filter((w) => have.has(w)).length / words.length;
      score += share * 80 + (fold(l.title) === fold(q.title) ? 20 : 0);
    }
    if (l.kind === 'book' && !words.length) score -= 100;
    // a topical section is found by its TITLE: one that only shares its letter's date never beats the letter itself
    if (l.kind === 'section' && share < 0.5) score -= 30;
    if (q.book && fold(l.book_title || '').includes(fold(q.book))) score += 30;
    return { ...l, score };
  }).filter((l) => l.score > 30);
  const rank = { message: 0, chapter: 0, book: 1, section: 2 };
  scored.sort((a, b) => b.score - a.score || rank[a.kind] - rank[b.kind] || (a.end - a.start) - (b.end - b.start));
  // one letter, one answer: a range found two ways (a chapter that is also dated by its line; a twin section) is listed once
  const seen = new Set();
  return scored.filter((l) => { const k = `${l.doc_id}:${l.start}:${l.end}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
