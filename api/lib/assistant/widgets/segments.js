// Widget markers in a reply: `<!-- widget:ID -->` + the widget's markdown table (+ approximate note) stay in the stored reply as the fallback;
// clients swap that span for the widget component. Pure, no imports (the site and the embed bundle import it).
export const APPROX_NOTE = '*Aligned approximately (by meaning or position in the work), not verse by verse.*';
export const widgetMarker = (id) => `<!-- widget:${id} -->`;
/** reply markdown × widgets [{id, kind, …}] → [{ kind: 'text', md } | { kind: 'widget', widget, md }]; a marker with no widget in hand stays as text. */
export function widgetSegments(md, widgets) {
  const src = String(md || ''), by = new Map((widgets || []).map((w) => [w?.id, w]));
  if (!by.size || !src.includes('<!-- widget:')) return [{ kind: 'text', md: src }];
  const lines = src.split('\n'), out = [];
  let from = 0;
  for (let i = 0; i < lines.length; i++) {
    const id = lines[i].match(/^\s*<!--\s*widget:([\w-]+)\s*-->\s*$/)?.[1];
    if (!id || !by.has(id)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const t0 = j;
    while (j < lines.length && lines[j].trim().startsWith('|')) j++;
    if (j === t0) continue;
    let k = j;
    while (k < lines.length && !lines[k].trim()) k++;
    if (k < lines.length && lines[k].trim() === APPROX_NOTE) j = k + 1;
    if (i > from) out.push({ kind: 'text', md: lines.slice(from, i).join('\n') });
    out.push({ kind: 'widget', widget: by.get(id), md: lines.slice(i, j).join('\n') });
    from = j; i = j - 1;
  }
  if (from < lines.length) out.push({ kind: 'text', md: lines.slice(from).join('\n') });
  return out.filter((s) => s.kind === 'widget' || s.md.trim());
}
