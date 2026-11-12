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
    // list bullets are not emphasis; nor is a star with whitespace on both sides (CommonMark: no flanking run) — the Arabic verse
    // separator " * " in the Tablet of Aḥmad's original (11-12 ahmad-sbs)
    const prose = flat.split('\n').map((l) => l.replace(/^\s*[*-]\s+/, '').replace(/(^|[\s|])\*+(?=[\s|]|$)/g, '$1')).join('\n');
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

// THE EMPHASIS REPAIR (battery 11-10 general_research: `**"Trials … services."* ([Mencius …](…))*` — one star too many at each
// end of a quote). A paragraph markdownDefects calls unbalanced loses the FEWEST stars (one, else two) that leave every
// emphasis run paired opener→closer by CommonMark's flanking rules; no such fix → the paragraph stands. Stars inside a
// link's URL, code and list bullets are never touched. Pure.
const WS = (c) => !c || /\s/.test(c);
const PUNCT = (c) => !!c && /[\p{P}\p{S}]/u.test(c);
function starRuns(s) {
  const mask = s.replace(/\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g, (m) => m.replace(/\*/g, '_')).replace(/`[^`\n]*`/g, (m) => '_'.repeat(m.length))
    .replace(/^(\s*(?:>\s*)?)([*-])(\s)/gm, (m, a, b, c) => `${a}_${c}`);
  const runs = [];
  for (const m of mask.matchAll(/\*+/g)) runs.push({ at: m.index, len: m[0].length });
  return runs;
}
// runs paired opener→closer (same length, flanking); → the runs left unpaired
function unpaired(s) {
  const stack = [], bad = [];
  for (const r of starRuns(s)) {
    const prev = s[r.at - 1], next = s[r.at + r.len];
    const open = !WS(next) && (!PUNCT(next) || WS(prev) || PUNCT(prev)), close = !WS(prev) && (!PUNCT(prev) || WS(next) || PUNCT(next));
    if (close && stack.length && stack[stack.length - 1].len === r.len) stack.pop();
    else if (open) stack.push(r);
    else bad.push(r);
  }
  return [...bad, ...stack];
}
const paired = (s) => !unpaired(s).length;
const dropAt = (s, at) => s.slice(0, at) + s.slice(at + 1);
function repairParagraph(p) {
  // only stars of runs left unpaired are candidates: a well-formed *Title* elsewhere in the paragraph is never touched
  const stars = unpaired(p).flatMap((r) => Array.from({ length: r.len }, (_, k) => r.at + k)).sort((a, b) => a - b);
  for (const i of stars) { const t = dropAt(p, i); if (paired(t)) return t; }
  for (let a = 0; a < stars.length; a++) for (let b = a + 1; b < stars.length; b++) {
    const t = dropAt(dropAt(p, stars[b]), stars[a]);
    if (paired(t)) return t;
  }
  return p;
}
/** → { text, fixed }: each paragraph with unbalanced emphasis repaired by the fewest star removals that pair every run. */
export function repairEmphasis(text) {
  let fixed = 0;
  const out = String(text ?? '').split(/(\n\s*\n)/).map((para, i) => {
    if (i % 2 || !markdownDefects(para).some((d) => d.id === 'unbalanced-emphasis') || /^\s*\|/m.test(para)) return para;
    const r = repairParagraph(para);
    if (r !== para) fixed += 1;
    return r;
  });
  return { text: fixed ? out.join('') : String(text ?? ''), fixed };
}
