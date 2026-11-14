// Inline display templates (Chad 11-13 "display widgets are like inline templates"): research stays data; the writer may put a
// template on a line of its own — {{quote P3}}, {{book B1}}, {{side_by_side P1 P4}}, {{scene "Title" "line" P4 P5}} — and code expands it from the turn's refs
// into the widget's marker + fallback markdown, plus its data for the clients. Unknown kind or a ref not in hand → line dropped. Pure.
import { WIDGETS, widgetBlock } from './index.js';
import { holdsPhrase, isPdfDump } from './card-text.js';

const LINE = /^[ \t]*\{\{\s*([a-z_]+)((?:\s+["“][^"“”\n]*["”])*)((?:[\s,]+[PB]\d+)+)\s*\}\}[ \t]*$/gm;   // quoted strings: a scene's title and line
export const TEMPLATE_KINDS = Object.keys(WIDGETS);

// ONE CARD PER PASSAGE (Dawn-Breakers battery 11-14, dbp:003: the same Memorials passage as scene 2 and scene 5): a passage already shown
// in a card this turn (`refs.carded`, kept across the live pieces) is not shown again — a quote card of it goes, a scene keeps its other
// passages (none left → the scene goes). Keyed on the words, so two refs to one paragraph are one passage.
const cardKey = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 160);
const unseen = (data, carded) => {
  if (!carded) return data;
  const fresh = (x) => { const k = cardKey(x.text); return k.length < 20 || !carded.has(k); };
  if (data.kind === 'quote') return fresh(data) ? data : null;
  if (data.kind === 'scene') { const passages = data.passages.filter(fresh); return passages.length ? { ...data, passages } : null; }
  return data;
};
const remember = (data, carded) => { for (const x of data.kind === 'scene' ? data.passages : data.kind === 'quote' ? [data] : []) carded?.add(cardKey(x.text)); };

// A QUOTE WRAPPED IN THE MARKER (presumption run 11-14, 1fuszlx P46/P6, 1kuomdm P7/P2): the writer typed `{{quote:\n\n> "…" — [[P7]]\n\nP7}}`
// and the reader saw braces, the quote as plain text and "P7}}". A marker that spans lines or opens with a colon is mended BEFORE anything
// else reads the text: its P/B numbers → the template on its own line (the card), when that card can be drawn; otherwise the marker goes
// and its inside stays as typed (an ordinary blockquote). Raw text ([[P#]] not yet rendered). Pure.
const WRAPPED = /\{\{[ \t]*([a-z_]+)[ \t]*(?::[ \t]*|(?=\n))([\s\S]*?)\}\}/g;
// a wrapped marker's inside → { ids: the P/B numbers closing it (else the first [[P#]] of its attribution), body: the quote as typed }.
// Any attribution form stays in the body: "— [[P7]]", "— [Title](url)", "*— Title*", "([Title](url))", a bare source line.
const insideOf = (inner) => {
  const tail = /((?:[\s,]+[PB]\d+|\n[ \t]*\[\[[PB]\d+\]\])+)\s*$/.exec(` ${inner}`);   // the numbers closing the marker ("P7", "P1, P4", "[[P7]]" on its own line); "— [[P7]]" is attribution
  const body = (tail ? ` ${inner}`.slice(0, tail.index) : inner).trim();
  const closing = tail ? [...new Set([...tail[1].matchAll(/[PB]\d+/g)].map((x) => x[0]))] : [];
  return { body, ids: closing.length ? closing : [...body.matchAll(/\[\[([PB]\d+)\]\]/g)].map((x) => x[1]).slice(0, 1) };
};
export function mendTemplates(text, refs) {
  const t = String(text || '');
  if (!/\{\{[ \t]*[a-z_]+[ \t]*(?::|\n)/.test(t)) return t;
  return t.replace(WRAPPED, (m, kind, inner) => {
    const { body, ids } = insideOf(inner);
    const built = WIDGETS[kind] && ids.length ? WIDGETS[kind].fromRefs?.(ids, refs, []) : null;
    if (built && unseen(built, refs?.carded)) return `\n\n{{${kind} ${ids.join(' ')}}}\n\n`;
    return body ? `\n\n${body}\n\n` : '';
  }).replace(/\n{3,}/g, '\n\n');
}

// THE LAST GUARD (live 11-14, edge a058f647: 8 of 21 replies showed `{{quote:\n\n> "…"\n> — [Title](url)\n\nP3}}` raw in their text
// events): finished text (a streamed piece, the final reply) never shows a marker's braces. A wrapped marker → its inside as typed (the
// blockquote, attribution kept); a marker split across pieces → its opener "{{quote:" and its closing "P3}}" line go. Pure, idempotent.
export function unwrapMarkers(text) {
  const t = String(text ?? '');
  if (!/\{\{|\}\}/.test(t)) return t;
  return t.replace(WRAPPED, (m, kind, inner) => { const { body } = insideOf(inner); return body ? `\n\n${body}\n\n` : ''; })
    .replace(/\{\{[ \t]*[a-z_]+[ \t]*:[ \t]*/g, '')
    .replace(/(^|\n)[ \t]*(?:\[{0,2}[PB]\d+\]{0,2}[ \t,]*)+\}\}[ \t]*(?=\n|$)/g, '$1')   // a split marker's closing line
    .replace(/\n{3,}/g, '\n\n');
}

export function expandTemplates(text, refs, { start = 0 } = {}) {
  const widgets = [];
  const out = String(text || '').replace(LINE, (m, kind, strs, list) => {
    const built = WIDGETS[kind]?.fromRefs?.(list.trim().split(/[\s,]+/), refs, [...strs.matchAll(/["“]([^"“”\n]*)["”]/g)].map((x) => x[1]));
    const data = built && unseen(built, refs?.carded);
    if (!data) { console.warn(`[anis] template dropped${built ? ' (passage already carded)' : ''}: ${m.trim().slice(0, 160)}`); return ''; }
    remember(data, refs?.carded);
    data.id = `${kind}-${start + widgets.length + 1}`;
    widgets.push(data);
    return `\n${widgetBlock(data)}\n`;
  }).replace(/\{\{\s*book\s+(B\d+)\s*\}\}/g, '[[$1]]')   // a book template inside a sentence ("The library's copy is {{book B1}}.") is its linked title, never a hole
    .replace(/\{\{[^{}\n]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, widgets };
}

// A TYPED QUOTATION IS A CARD (round 7d, evilr7: three blockquotes of held passages, no card). A blockquote whose words a passage of
// the turn holds (its own ref first, else any) becomes {{quote "the quoted words" P#}} — the card shows the words quoted, verified
// against the passage, linked to its place; the attribution line under it goes with it. Words no passage holds, a PDF page, a
// passage already carded, or a block under 8 words stay as typed. Raw text (before refs render). Pure.
const stripBody = (lines) => lines.map((l) => l.replace(/^\s*>\s?/, '')).filter((l) => !/^\s*[—–-]{1,2}\s/.test(l)).join(' ')
  .replace(/\[\[[PBW]\d+(?:\s*[,;]\s*[PBW]\d+)*\]\]/g, ' ').replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)|\[([^\]]*)\]\([^)]*\)/g, (m, t) => t || ' ')
  .replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().replace(/^["“](.*)["”]$/, '$1').trim();
export function blockquoteCards(text, found, carded) {
  if (!found?.size || !/^\s*>/m.test(String(text || ''))) return String(text || '');
  const lines = String(text).split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) { out.push(lines[i]); continue; }
    let j = i; while (j < lines.length && /^\s*>/.test(lines[j])) j++;
    const block = lines.slice(i, j), body = stripBody(block);
    const refs = [...block.join(' ').matchAll(/\b(P\d+)\b/g)].map((m) => m[1]);
    const ok = (r) => { const p = found.get(r); return p?.text && p.source_url && !isPdfDump(p.text) && holdsPhrase(p.text, body) && !(carded?.has(cardKey(p.text)) || carded?.has(cardKey(body))); };
    const ref = body.split(/\s+/).length >= 8 ? (refs.find(ok) || [...found.keys()].find((r) => /^P\d+$/.test(r) && ok(r))) : null;
    if (!ref) { out.push(...block); i = j - 1; continue; }
    let k = j; if (k < lines.length && /^\s*[—–]\s/.test(lines[k])) k++;   // "— [[P1]]" under the block: the card carries it
    out.push(/["“”]/.test(body) ? `{{quote ${ref}}}` : `{{quote "${body}" ${ref}}}`);
    i = k - 1;
  }
  return out.join('\n');
}
