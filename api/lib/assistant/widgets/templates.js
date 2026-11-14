// Inline display templates (Chad 11-13 "display widgets are like inline templates"): research stays data; the writer may put a
// template on a line of its own — {{quote P3}}, {{book B1}}, {{side_by_side P1 P4}}, {{scene "Title" "line" P4 P5}} — and code expands it from the turn's refs
// into the widget's marker + fallback markdown, plus its data for the clients. Unknown kind or a ref not in hand → line dropped. Pure.
import { WIDGETS, widgetBlock } from './index.js';

const LINE = /^[ \t]*\{\{\s*([a-z_]+)((?:\s+["“][^"“”\n]*["”])*)((?:[\s,]+[PB]\d+)+)\s*\}\}[ \t]*$/gm;   // quoted strings: a scene's title and line
export const TEMPLATE_KINDS = Object.keys(WIDGETS);

export function expandTemplates(text, refs, { start = 0 } = {}) {
  const widgets = [];
  const out = String(text || '').replace(LINE, (m, kind, strs, list) => {
    const data = WIDGETS[kind]?.fromRefs?.(list.trim().split(/[\s,]+/), refs, [...strs.matchAll(/["“]([^"“”\n]*)["”]/g)].map((x) => x[1]));
    if (!data) { console.warn(`[anis] template dropped: ${m.trim().slice(0, 160)}`); return ''; }
    data.id = `${kind}-${start + widgets.length + 1}`;
    widgets.push(data);
    return `\n${widgetBlock(data)}\n`;
  }).replace(/\{\{\s*book\s+(B\d+)\s*\}\}/g, '[[$1]]')   // a book template inside a sentence ("The library's copy is {{book B1}}.") is its linked title, never a hole
    .replace(/\{\{[^{}\n]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, widgets };
}
