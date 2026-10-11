// Verse numbers INTO the source file as `{pn="…"}` attribute lines (Chad 10-11: "we must get our bible and qur'an verse
// numbering fully correct so we can link to translations or the original"). Two source shapes, pure string → string:
//  · headed (Tanzil Qur'an): "### 2:5\n<verse>" — the reference was its own heading row, doubling every verse → the
//    verse block carries pn and the heading goes.
//  · leading (Gutenberg Douay-Rheims, one doc for the whole Bible): "2:10. And a river…" under "Genesis Chapter 2" →
//    the number leaves the text, pn names the BOOK too ("Genesis 2:10") since one document holds every book, and the
//    "Book Chapter N" line becomes a heading. Hard-wrapped verse lines are joined.
// Idempotent: a file already carrying pn is returned unchanged.

/** "### c:v\n<verse>" → "<verse>\n{pn=\"c:v\"}". → { text, verses } */
export function headedToPn(src) {
  const text = src.replace(/\r\n/g, '\n');
  if (/\{pn="/.test(text)) return { text, verses: 0 };
  let verses = 0;
  const out = text.replace(/^###[ \t]+(\d+):(\d+)[ \t]*\n+([^\n#{][^\n]*)/gm, (m, c, v, verse) => { verses++; return `${verse.trim()}\n{pn="${c}:${v}"}`; });
  return { text: out, verses };
}

/** Leading "c:v. " verses under "<Book> Chapter N" lines; all-caps "THE BOOK OF …" lines become book headings.
 *  → { text, verses, mismatched } (mismatched = a verse's own chapter ≠ the chapter line above it) */
const CHAPTER = /^([1-4]?[ \t]?[A-Z][A-Za-z]*(?:[ \t]+(?:of[ \t]+)?[A-Z][A-Za-z]*){0,3})[ \t]+Chapter[ \t]+(\d+)\.?(?:[ \t]+(\S[^\n]*))?$/;
const BOOK_TITLE = /^THE[ \t][A-Z0-9 .,'’\-]{3,}$/;
export function leadingToPn(src) {
  const text = src.replace(/\r\n/g, '\n');
  if (/\{pn="/.test(text)) return { text, verses: 0, mismatched: 0 };
  let book = null, chapter = null, verses = 0, mismatched = 0;
  const blocks = text.split(/(\n(?:[ \t]*\n)+)/);                  // runs of blank lines are ONE separator
  for (let i = 0; i < blocks.length; i += 2) {
    const b = blocks[i];
    if (BOOK_TITLE.test(b.trim()) && !b.trim().includes('\n')) { blocks[i] = `# ${b.trim()}`; continue; }
    const ch = b.trim().match(CHAPTER);
    if (ch && !b.trim().includes('\n')) {
      book = ch[1].trim(); chapter = Number(ch[2]);
      blocks[i] = `## ${book} Chapter ${chapter}${ch[3] ? `\n\n${ch[3]}` : ''}`;
      continue;
    }
    const v = b.match(/^(\d+):(\d+)\.[ \t]+([\s\S]*)$/);
    if (!v || !book) continue;
    if (Number(v[1]) !== chapter) mismatched++;
    verses++;
    blocks[i] = `${v[3].replace(/[ \t]*\n[ \t]*/g, ' ').trim()}\n{pn="${book} ${v[1]}:${v[2]}"}`;
  }
  return { text: blocks.join(''), verses, mismatched };
}

/** Make sure the frontmatter says needs_segmentation: false (else the ingester joins short verses). */
export function declareParagraphs(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m || /^needs_segmentation:\s*false/m.test(m[1])) return text;
  return `---\n${m[1]}\nneeds_segmentation: false\n---\n${text.slice(m[0].length)}`;
}
