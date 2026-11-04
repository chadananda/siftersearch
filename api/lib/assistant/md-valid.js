// Markdown validity of a reply (Chad 11-04: "We can deterministically test formatting validity"). Free, pure: nested links,
// unbalanced bold/italic, broken link syntax, per paragraph. Forensics counts each as WRITER 'malformed-markdown' on every reply.
const LINK = /\[([^\][\n]*)\]\(([^()\s]*)\)/g;
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
