// Display-widget registry: { kind → { toMarkdown(data), toHtml(data, { mode, layout }) } }; modes chat | embed | email | print (print also drawn by pdf/side-by-side.js).
// One data object per widget, built by code from the turn's evidence; each mode renders it its own way. Pure.
import * as sideBySide from './side-by-side.js';
import * as quote from './quote.js';
import * as book from './book.js';
import * as scene from './scene.js';
import { widgetMarker } from './segments.js';
import { imagesForPassages, cardImage, imageHtml, imageMarkdown, fold, PLACES } from '../../illustrations.js';

export const MODES = ['chat', 'embed', 'email', 'print'];
// a passage card of an illustrated book (Dawn-Breakers, Chad 11-14) carries at most ONE plate, chosen by code from the passage's own
// doc, paragraph and words (illustrations.js imagesFor) — never by the model; rendered inside the card, linked to the larger image.
// A card from another work (A Traveller's Narrative on the martyrdom, live 11-14: no plate) borrows the plate a Dawn-Breakers passage
// of this turn drew, only when the card's own words name both a person and a place the plate's caption names — the same event.
const sameEvent = (img, words) => {
  const hay = ` ${fold(words)} `, named = (k) => hay.includes(` ${k} `);
  return img.people.some((p) => p.keys?.some(named)) && img.places.some((pl) => PLACES.find((x) => x.name === pl)?.keys.some(named));
};
const pictured = (w) => ({ ...w,
  fromRefs: (refs, ctx, strings) => {
    const d = w.fromRefs(refs, ctx, strings);
    if (!d) return d;
    const own = refs.map((r) => ctx?.found?.get(r)).filter(Boolean), subject = ctx?.subject || '';
    let img = imagesForPassages(own, { max: 1, subject })[0];
    if (!img && ctx?.found) {
      const words = own.map((p) => p.text || '').join(' ');
      img = imagesForPassages([...ctx.found.values()].filter((p) => !own.includes(p)), { max: 3 }).find((x) => sameEvent(x, words));
    }
    const card = cardImage(img);
    return card ? { ...d, image: card } : d;
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
