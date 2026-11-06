// Markdown validity of a reply (Chad 11-04: "We can deterministically test formatting validity"). Free, pure: nested links,
// unbalanced bold/italic, broken link syntax, per paragraph. Forensics counts each as WRITER 'malformed-markdown' on every reply.
// safeLinkText repairs the one class code can fix without judgement: brackets inside a link's text (a title with "[…]").
// A URL may hold one level of balanced parens: Ocean of Lights range links end "#(start)(end)" and must stay literal.
const LINK = /\[([^\][\n]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
const NESTED = /\[[^\]\n]*\[[^\]\n]*\]\([^)\n]*\)[^\]\n]*\]\(/;

/** → [{ id, at }] — empty when the reply is valid markdown for the widget and mail renderers. */
export function markdownDefects(text) {
  const out = [];
  for (const para of String(text || '').split(/\n\s*\n/)) {
    const lines = para.split('\n').map((l) => l.replace(/^\s*>\s?/, ''));
    const body = lines.join('\n').replace(/`[^`\n]*`/g, '');
    if (NESTED.test(body)) { out.push({ id: 'nested-link', at: body.match(NESTED)[0].slice(0, 80) }); continue; }
    const flat = body.replace(LINK, (m, t) => `${t} `);   // link text stays (its emphasis counts), the URL goes
    if (/\]\(/.test(flat)) out.push({ id: 'broken-link', at: flat.slice(Math.max(0, flat.indexOf('](') - 40), flat.indexOf('](') + 20) });
    const prose = flat.split('\n').map((l) => l.replace(/^\s*[*-]\s+/, '')).join('\n');   // list bullets are not emphasis
    const bold = (prose.match(/\*\*/g) || []).length;
    const single = (prose.replace(/\*\*/g, '').match(/\*/g) || []).length;
    if (bold % 2 || single % 2) out.push({ id: 'unbalanced-emphasis', at: prose.slice(0, 80) });
  }
  return out;
}

/** Brackets inside a link's TEXT → parentheses, so the link survives every renderer: "[*Book of Common Prayer [King's
 *  Chapel]*](url)" → "[*Book of Common Prayer (King's Chapel)*](url)". The link text is found by bracket depth back from
 *  each "](" on its own line; a text holding a link of its own (a nested link) is left alone. URLs are never touched. Pure. */
export function safeLinkText(text) {
  const s = String(text ?? '');
  if (!s.includes('](')) return s;
  const c = s.split('');   // UTF-16 units: same indices as s
  for (let at = s.indexOf(']('); at >= 0; at = s.indexOf('](', at + 2)) {
    let depth = 1, open = -1;
    for (let i = at - 1; i >= 0 && s[i] !== '\n'; i--) {
      if (s[i] === ']') depth++;
      else if (s[i] === '[' && --depth === 0) { open = i; break; }
    }
    if (open < 0) continue;
    const inner = s.slice(open + 1, at);
    if (!/[[\]]/.test(inner) || inner.includes('](')) continue;
    for (let i = open + 1; i < at; i++) {
      if (s[i] === '[') c[i] = '(';
      else if (s[i] === ']') c[i] = ')';
    }
  }
  return c.join('');
}
