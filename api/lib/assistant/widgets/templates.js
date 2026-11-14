// Inline display templates (Chad 11-13 "display widgets are like inline templates"): research stays data; the writer may put a
// template on a line of its own — {{quote P3}}, {{book B1}}, {{side_by_side P1 P4}}, {{scene "Title" "line" P4 P5}} — and code expands it from the turn's refs
// into the widget's marker + fallback markdown, plus its data for the clients. Unknown kind or a ref not in hand → line dropped. Pure.
import { WIDGETS, widgetBlock } from './index.js';

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
