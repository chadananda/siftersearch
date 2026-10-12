// Stable paragraph ids + display numbers INTO library source files, OceanLibrary-compatible (Chad 10-11: "We have a
// mechanism for adding id and display id to md books, right? If not … something compatible with oceanlibrary.com output";
// display = `pn` on every block). Each text block gets `{id="para_N" pn="M"}` on its own line (block-parser attaches a
// standalone attr line to the block above). id is PERMANENT: an existing para_N is kept, new blocks take max+1 — so links
// survive edits and re-segmentation. pn = running number of text blocks, unless the block already carries a pn (verse
// scripture, an ILM export) — that one is never changed. A file block the parser would split into several blocks (a list,
// a table) is SKIPPED and counted, never guessed. Pure: text → { text, assigned, kept, skipped }.
import { parseMarkdownBlocks } from '../../services/block-parser.js';

const FM = /^---\n[\s\S]*?\n---\n/;
const ATTR_LINE = /^\{([^}]*)\}\s*$/;
const isTextBlock = (b) => /\p{L}/u.test(b) && !/^\s*(#|<!--|```|\||\{)/.test(b);

function parseAttrs(inner) {
  const out = []; const re = /([\w-]+)="([^"]*)"|([\w-]+)=(\S+)|(#[\w-]+|\.[\w-]+)/g; let m;
  while ((m = re.exec(inner))) out.push(m[1] ? [m[1], m[2]] : m[3] ? [m[3], m[4]] : [m[5], null]);
  return out;
}
const renderAttrs = (pairs) => `{${pairs.map(([k, v]) => (v == null ? k : `${k}="${v}"`)).join(' ')}}`;

export function assignBlockIds(src) {
  const text = src.replace(/\r\n/g, '\n');
  const fm = text.match(FM);
  const head = fm ? fm[0] : '', body = fm ? text.slice(fm[0].length) : text;
  const parts = body.split(/(\n(?:[ \t]*\n)+)/);
  // existing ids anywhere in the file → next free number
  let max = 0;
  for (const m of body.matchAll(/id="para_(\d+)"/g)) max = Math.max(max, Number(m[1]));
  let pn = 0, assigned = 0, kept = 0, skipped = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i];
    if (!raw.trim() || !isTextBlock(raw)) continue;
    const block = raw.replace(/\s+$/, ''), tail = raw.slice(block.length);   // the file's last block keeps its newline
    const lines = block.split('\n');
    const last = lines[lines.length - 1].trim().match(ATTR_LINE);
    const pairs = last ? parseAttrs(last[1]) : [];
    const content = (last ? lines.slice(0, -1) : lines).join('\n');
    const parsed = parseMarkdownBlocks(content, { splitOversized: false }).length;
    if (parsed !== 1) {
      // A quote and the line after it (often a footnote definition) in one file block → the parser makes one block per
      // run of quoted / unquoted lines. Label each run when that accounts for every parsed block; else skip, never guess.
      const groups = [];
      for (const l of content.split('\n')) { const q = /^\s*>/.test(l); if (!groups.length || groups[groups.length - 1].q !== q) groups.push({ q, lines: [] }); groups[groups.length - 1].lines.push(l); }
      const ok = !last && groups.length === parsed && groups.every((g) => parseMarkdownBlocks(g.lines.join('\n'), { splitOversized: false }).length === 1);
      if (!ok) { skipped++; continue; }
      parts[i] = groups.map((g) => `${g.lines.join('\n')}\n${renderAttrs([['id', `para_${++max}`], ['pn', String(++pn)]])}`).join('\n') + tail;
      assigned += groups.length;
      continue;
    }
    pn++;
    const get = (k) => pairs.find(([kk]) => kk === k);
    if (get('id') && get('pn')) { kept++; continue; }
    if (!get('id')) pairs.unshift(['id', `para_${++max}`]);
    if (!get('pn')) pairs.push(['pn', String(pn)]);
    parts[i] = `${content}\n${renderAttrs(pairs)}${tail}`;
    assigned++;
  }
  return { text: head + parts.join(''), assigned, kept, skipped };
}
