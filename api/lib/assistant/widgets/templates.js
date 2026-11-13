// Inline display templates (Chad 11-13 "display widgets are like inline templates"): research stays data; the writer may put a
// template on a line of its own — {{quote P3}}, {{book B1}}, {{side_by_side P1 P4}} — and code expands it from the turn's refs
// into the widget's marker + fallback markdown, plus its data for the clients. Unknown kind or a ref not in hand → line dropped. Pure.
import { WIDGETS, widgetBlock } from './index.js';

const LINE = /^[ \t]*\{\{\s*([a-z_]+)((?:[\s,]+[PB]\d+)+)\s*\}\}[ \t]*$/gm;
export const TEMPLATE_KINDS = Object.keys(WIDGETS);

export function expandTemplates(text, refs) {
  const widgets = [];
  const out = String(text || '').replace(LINE, (m, kind, list) => {
    const data = WIDGETS[kind]?.fromRefs?.(list.trim().split(/[\s,]+/), refs);
    if (!data) return '';
    data.id = `${kind}-${widgets.length + 1}`;
    widgets.push(data);
    return `\n${widgetBlock(data)}\n`;
  }).replace(/\{\{[^{}\n]*\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, widgets };
}
