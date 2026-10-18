// Structure for books that do not mark it as headings (Chad 10-17: "a lot of our 3rd party books have TOC, but that
// data is not integrated into the text … those are mostly famous texts that would have a standard and commonly known
// structure"). Code proposes CANDIDATE heading lines (short lines, marked divisions); a model picks which begin a
// section of the work's structure, by paragraph number only — so every section starts at a line that exists in our text;
// code builds nested ranges and checks them. Pure: rows in, candidates / sections out.

// marked divisions in several scripts: Part/Book/Chapter/Question/Article/Sura/Canto…, كتاب باب فصل مسألة, פרק, ספר
const MARKED = /^(\s*[\[(]?\s*)?(part|book|chapter|chap\.|question|article|section|sura|surah|canto|treatise|lecture|letter|discourse|sermon|tablet|volume|appendix|introduction|preface|foreword|prologue|epilogue|conclusion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b|^(كتاب|باب|فصل|مسألة|الباب|الفصل|سورة|فصل)\b|^(פרק|ספר)\b/i;
const NUMBERED = /^\s*([IVXLC]+|\d{1,4})[.:)\s]\s*\S/;
const plain = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/[*_#`]+/g, '').replace(/\[\^?\d+\]/g, '').replace(/\s+/g, ' ').trim();

/** Lines that could begin a section: short, with letters; ending without a sentence stop unless a marked division. */
export function headingCandidates(rows, { maxLen = 120 } = {}) {
  return rows.filter((r) => {
    const t = plain(r.text);
    if (!t || t.length > maxLen || !/\p{L}/u.test(t)) return false;
    if (/^\[?pg\s/i.test(t)) return false;                                   // page markers
    if (MARKED.test(t) || NUMBERED.test(t)) return true;
    return !/[.,;:!?…"”’)]$/.test(t) && t.split(' ').length <= 14;           // a title, not a sentence fragment
  }).map((r) => ({ i: r.paragraph_index, id: r.id, text: plain(r.text) }));
}

/** Picks [{ i, level, title }] (validated against the candidates) → nested sections over the document's paragraphs.
 *  A section runs to the paragraph before the next pick at its own or a higher level; the last ones to the end. */
export function sectionsFromPicks(picks, rows) {
  const byIndex = new Map(rows.map((r) => [r.paragraph_index, r]));
  const ordered = [...new Map(picks.filter((p) => byIndex.has(p.i)).map((p) => [p.i, p])).values()].sort((a, b) => a.i - b.i);
  const last = rows.length ? rows[rows.length - 1].paragraph_index : 0;
  const idx = rows.map((r) => r.paragraph_index);
  const count = (a, b) => idx.filter((x) => x >= a && x <= b).length;
  return ordered.map((p, k) => {
    const level = Math.max(1, Math.min(6, Number(p.level) || 1));
    const next = ordered.slice(k + 1).find((q) => (Math.max(1, Math.min(6, Number(q.level) || 1))) <= level);
    const end = next ? next.i - 1 : last;
    return { ord: k, level, title: String(p.title || byIndex.get(p.i).text || '').slice(0, 200), start_index: p.i, end_index: end,
      paragraphs: count(p.i, end), first_para_id: byIndex.get(p.i).id };
  });
}

/** Checks before writing: enough sections, in order, the first early in the book, covering most of it. */
export function checkSections(sections, rows) {
  const issues = [];
  if (sections.length < 3) issues.push(`only ${sections.length} sections`);
  const n = rows.length, first = sections[0];
  if (first && rows.findIndex((r) => r.paragraph_index === first.start_index) > n * 0.3) issues.push('first section starts after 30% of the book');
  const top = Math.min(...sections.map((s) => s.level));
  const covered = sections.filter((s) => s.level === top).reduce((m, s) => m + s.paragraphs, 0);
  if (n && covered / n < 0.6) issues.push(`top-level sections cover ${Math.round(100 * covered / n)}% of the book`);
  return issues;
}
