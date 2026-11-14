// Display-widget registry: { kind → { toMarkdown(data), toHtml(data, { mode, layout }) } }; modes chat | embed | email | print (print also drawn by pdf/side-by-side.js).
// One data object per widget, built by code from the turn's evidence; each mode renders it its own way. Pure.
import * as sideBySide from './side-by-side.js';
import * as quote from './quote.js';
import * as book from './book.js';
import * as scene from './scene.js';
import { widgetMarker } from './segments.js';
import { imagesForPassages, cardImage, imageHtml, imageMarkdown } from '../../illustrations.js';

export const MODES = ['chat', 'embed', 'email', 'print'];
// a passage card of an illustrated book (Dawn-Breakers, Chad 11-14) carries at most ONE plate, chosen by code from the passage's own
// doc, paragraph and words (illustrations.js imagesFor) — never by the model; rendered inside the card, linked to the larger image
const pictured = (w) => ({ ...w,
  fromRefs: (refs, ctx, strings) => {
    const d = w.fromRefs(refs, ctx, strings);
    const img = d && cardImage(imagesForPassages(refs.map((r) => ctx?.found?.get(r)).filter(Boolean), { max: 1 })[0]);
    return d && img ? { ...d, image: img } : d;
  },
  toMarkdown: (d) => [w.toMarkdown(d), imageMarkdown(d.image)].filter(Boolean).join('\n\n'),
  toHtml: (d, opts = {}) => { const h = w.toHtml(d, opts), img = imageHtml(d.image, opts); return img ? h.replace(/(<\/(?:figure|section)>)$/, `${img}$1`) : h; },
});
// fromRefs(refs, { found, works, books }, strings) → data: what an inline template ({{kind P1 …}}, templates.js) builds from the turn's refs
export const WIDGETS = {
  side_by_side: { build: sideBySide.buildSideBySide, fromRefs: (rs, { found }) => sideBySide.buildSideBySide(rs.map((r) => found?.get(r)).filter(Boolean)), toMarkdown: sideBySide.toMarkdown, toHtml: sideBySide.toHtml },
  quote: pictured(quote), book, scene: pictured(scene),
};
/** widget data → the reply's fallback block: marker + markdown (what the stored reply, battery and clients without the component show). */
export const widgetBlock = (data) => (WIDGETS[data?.kind] ? `${widgetMarker(data.id)}\n\n${WIDGETS[data.kind].toMarkdown(data)}` : '');
export const renderWidget = (data, mode = 'chat', opts = {}) => (WIDGETS[data?.kind] && MODES.includes(mode) ? WIDGETS[data.kind].toHtml(data, { ...opts, mode }) : '');
