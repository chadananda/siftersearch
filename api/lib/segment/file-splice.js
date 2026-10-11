// Write a paragraph's new breaks back into its SOURCE file without losing anything the ingester strips (Chad 10-11).
// The stored row ≠ the file block: files keep inline <!-- fn: … --> footnotes and page-break tags that ingest removes,
// and a heading line can share the block. So the row's words are walked through the file (skipping comments, tags,
// sentence markers); only that span is replaced, and every comment/tag goes back after the same word. Pure; no I/O.
const TOKEN = /(<!--[\s\S]*?-->|<[^>\n]+>)|(⁅\/?[sp]\d+⁆)|(\s+)|([^\s<⁅]+)/y;
const MARK = /⁅\/?[sp]\d+⁆/g;
const TAGS = /<!--[\s\S]*?-->|<[^>\n]+>/g;
const wordsOf = (t) => t.replace(MARK, ' ').split(/\s+/).filter(Boolean);
const boundary = (file, i) => i === 0 || /[\s⁆>]/.test(file[i - 1]);

/** Walk W from p. → { start, end, kept: [{ k, text }] } or null (mismatch, or the span crosses a blank line). */
function walk(file, p, W) {
  const kept = []; let k = 0; TOKEN.lastIndex = p; let m;
  while (k < W.length && (m = TOKEN.exec(file))) {
    if (m[1]) kept.push({ k, text: m[1] });
    else if (m[3]) { if (/\n[ \t]*\n/.test(m[3])) return null; }
    else if (m[4]) { if (m[4] !== W[k]) return null; k++; }
  }
  if (k < W.length) return null;
  let start = p, end = TOKEN.lastIndex;
  while (/⁅[sp]\d+⁆$/.test(file.slice(0, start))) start = file.slice(0, start).replace(/⁅[sp]\d+⁆$/, '').length;   // own opening marker
  for (let n; (n = file.slice(end).match(/^⁅\/[sp]\d+⁆/)); ) end += n[0].length;                            // own closing marker
  return { start, end, kept };
}

/** Re-insert kept comments/tags after the same word of the new blocks. */
function reinsert(blocks, kept) {
  let n = 0, q = 0;
  const out = blocks.map((b, bi) => {
    let s = '';
    if (bi === 0) while (q < kept.length && kept[q].k === 0) s += kept[q++].text + ' ';
    s += b.replace(/(⁅\/?s\d+⁆)|([^\s⁅]+)/g, (tok, mark, word) => {
      if (mark) return tok;
      n++; let extra = '';
      while (q < kept.length && kept[q].k === n) extra += ' ' + kept[q++].text;
      return tok + extra;
    });
    return s;
  });
  if (q < kept.length) out[out.length - 1] += kept.slice(q).map((x) => ' ' + x.text).join('');
  return out;
}

/**
 * Replace the span of `blocks`' words in `file` (searching from `from`) with the blocks joined by blank lines.
 * → { file, cursor } or null when the words cannot be found intact (the caller counts it; the file is untouched).
 */
export function spliceBlocks(file, from, blocks) {
  blocks = blocks.map((b) => b.replace(TAGS, ' ').replace(/[ \t]{2,}/g, ' ').trim());   // the file's own copies go back in
  const W = wordsOf(blocks.join(' '));
  if (!W.length) return null;
  for (let i = file.indexOf(W[0], from); i >= 0; i = file.indexOf(W[0], i + 1)) {
    if (!boundary(file, i)) continue;
    const r = walk(file, i, W);
    if (!r) continue;
    const old = file.slice(r.start, r.end);
    if ((old.match(/⁅s\d+⁆/g) || []).length !== (old.match(/⁅\/s\d+⁆/g) || []).length) return null;   // markers would split
    const region = reinsert(blocks, r.kept).join('\n\n');
    const strip = (t) => wordsOf(t.replace(/<!--[\s\S]*?-->|<[^>\n]+>/g, ' ')).join(' ');
    const tags = (t) => (t.match(/<!--[\s\S]*?-->|<[^>\n]+>/g) || []).join('\u0000');
    if (strip(region) !== strip(old) || tags(region) !== tags(old)) return null;                     // never lose a word or a note
    return { file: file.slice(0, r.start) + region + file.slice(r.end), cursor: r.start + region.length };
  }
  return null;
}
