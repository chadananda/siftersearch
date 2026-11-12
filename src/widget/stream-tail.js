// While a reply streams, the unfinished tail is held back so markdown never shows raw and then snaps into shape
// (Chad 11-12 "formatting is still coming in late"): a table row appears whole, bold/italics/links once closed. Pure.
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l) => isRow(l) && /^[\s|:-]+$/.test(l) && l.includes('--');

const n = (l) => l.trim().replace(/^\||\|$/g, '').split('|').length;

export function settled(t) {
  const lines = String(t).split('\n');
  let k = lines.length;
  while (k > 0 && /^\s*\|/.test(lines[k - 1])) k--;
  if (k < lines.length) {                                  // a table at the end: header + full rule, then whole rows only
    const run = lines.splice(k), [head, rule] = run;
    const ok = rule && isRule(rule) && n(rule) === n(head);
    const keep = ok ? [head, rule, ...run.slice(2).filter(isRow)] : [];
    return [...lines, ...keep, ...(keep.length < run.length ? [''] : [])].join('\n');
  }
  let last = lines.pop();
  const link = last.lastIndexOf('[');
  if (link >= 0 && !/\]\([^)]*\)/.test(last.slice(link))) last = last.slice(0, link);   // a link not yet closed
  if ((last.match(/\*\*/g) || []).length % 2) last = last.slice(0, last.lastIndexOf('**'));
  if ((last.replace(/\*\*/g, '').match(/\*/g) || []).length % 2) last = last.slice(0, last.replace(/\*\*/g, '\0\0').lastIndexOf('*'));
  return [...lines, last].join('\n');
}
