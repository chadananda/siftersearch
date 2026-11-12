// Widget tables: a GFM pipe table (Anís's side-by-side original/translation, Chad 11-11 "the md is not rendering") → <table>.
// Input lines are already HTML-escaped; `inline` formats each cell (links, bold, italics). Pure.
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l) => isRow(l) && cells(l).every((c) => /^:?-{2,}:?$/.test(c));

/** lines[i] opens a table (header row + rule row)? → { html, next } with next = the first line after it; else null. */
export function tableAt(lines, i, inline = (s) => s) {
  if (!isRow(lines[i] || '') || !isRule(lines[i + 1] || '')) return null;
  const head = cells(lines[i]), rows = [];
  let j = i + 2;
  for (; j < lines.length && isRow(lines[j]); j++) rows.push(cells(lines[j]));
  const tr = (cs, tag) => '<tr>' + head.map((_, k) => `<${tag} dir="auto">${inline(cs[k] ?? '')}</${tag}>`).join('') + '</tr>';
  return { html: `<table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r, 'td')).join('')}</tbody></table>`, next: j };
}
