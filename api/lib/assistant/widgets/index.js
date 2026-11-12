// Display-widget registry: { kind → { toMarkdown(data), toHtml(data, { mode, layout }) } }; modes chat | embed | email | print (print also drawn by pdf/side-by-side.js).
// One data object per widget, built by code from the turn's evidence; each mode renders it its own way. Pure.
import * as sideBySide from './side-by-side.js';
import { widgetMarker } from './segments.js';

export const MODES = ['chat', 'embed', 'email', 'print'];
export const WIDGETS = { side_by_side: { build: sideBySide.buildSideBySide, toMarkdown: sideBySide.toMarkdown, toHtml: sideBySide.toHtml } };
/** widget data → the reply's fallback block: marker + markdown (what the stored reply, battery and clients without the component show). */
export const widgetBlock = (data) => (WIDGETS[data?.kind] ? `${widgetMarker(data.id)}\n\n${WIDGETS[data.kind].toMarkdown(data)}` : '');
export const renderWidget = (data, mode = 'chat', opts = {}) => (WIDGETS[data?.kind] && MODES.includes(mode) ? WIDGETS[data.kind].toHtml(data, { ...opts, mode }) : '');
