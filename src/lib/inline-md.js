// Inline markdown in short card text (book descriptions) → parts {t, em, strong}, rendered as text nodes (no HTML injection).
// Handles **bold**, *em* / _em_ (word-bounded, so snake_case stays), [label](url) → label.
const TOKEN = /\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/gs;

export function inlineParts(text) {
  const s = String(text || '').replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    out.push(m[1] != null ? { t: m[1], strong: true } : { t: m[2] ?? m[3], em: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out.filter((p) => p.t);
}
