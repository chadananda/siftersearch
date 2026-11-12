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
  const table = `<table class="rt-wide"><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r, 'td')).join('')}</tbody></table>`;
  return { html: `<div class="rt">${table}<div class="rt-rows">${rows.map((r) => fold(head, r, inline)).join('')}</div></div>`, next: j };
}

// A narrow screen gets each row as a fold (Chad 11-12 "collapsible accordion style … on each row … on mobile"): the
// row's title (a "#" column numbers it; the first linked cell, else the first cell, names it) opens to the other cells.
function fold(head, r, inline) {
  const num = /^#?$/.test(head[0]) ? 0 : -1;
  const ks = head.map((_, k) => k).filter((k) => k !== num);
  const t = ks.find((k) => /\]\(|https?:/.test(r[k] ?? '')) ?? ks[0];
  const title = (num === 0 && r[0] ? `${inline(r[0])}. ` : '') + inline(r[t] ?? '');
  const rest = ks.filter((k) => k !== t && (r[k] ?? '') !== '').map((k) => `<div dir="auto"><span class="rt-k">${inline(head[k])}</span> ${inline(r[k])}</div>`).join('');
  return rest ? `<details><summary dir="auto">${title}</summary>${rest}</details>` : `<div class="rt-one" dir="auto">${title}</div>`;
}
