// Anís edge: the reply's links made here, from the passages the turn holds — no tower round-trip (Chad 11-13: tower only for new
// research). Research passages already carry whole-paragraph range links; a quote marker (#~q=) narrows its link to the quoted words.
import { findSpan, siteOffset } from '../../api/lib/ocean-range.js';
import { textFragmentUrl, dropMarkers } from '../../api/lib/ocean-links.js';
import { anisText } from '../../api/lib/anis-links.js';
import { unwrapMarkers } from '../../api/lib/assistant/widgets/templates.js';

const OL_LINK = /https:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s"'<>)\]]+)\/?\?paraId=([A-Za-z0-9_.-]+)(?:&selectionString=([^#\s"'<>)\]&]+))?(?:#~q=([^\s"'<>)\]]+))?/g;
const OOL_QUOTE = /https:\/\/(?:www\.)?oceanoflights\.org\/([^?#\s"'<>)\]]+?)\/?#(?:~d=\d+)?~q=([^\s"'<>)\]]+)/g;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return null; } };
const plain = (t) => String(t || '').replace(/⁅\/?[sp]\d+⁆/g, '');

/** Pure: slug|paraId → { ilmid, text } for every held passage whose link is a one-paragraph OceanLibrary range. */
export function anchorsOf(passages) {
  const m = new Map();
  for (const p of passages || []) {
    for (const x of String(p?.source_url || p?.url || '').matchAll(OL_LINK)) {
      const sel = dec(x[3] || ''), [a, b] = String(sel || '').split('~').map((e) => e.replace(/\.\d+$/, ''));
      if (a && a === b && p.text) m.set(`${dec(x[1])}|${x[2]}`, { ilmid: a, text: plain(p.text) });
    }
  }
  return m;
}

/** Pure: every link in the reply made final — a quote marker narrowed to its words in the held paragraph, else the paragraph's range;
 *  Ocean of Lights quotes → a text fragment; leftover markers dropped. → { text, narrowed, unplaced }. */
export function finishLinks(reply, passages) {
  const anchors = anchorsOf(passages);
  let narrowed = 0, unplaced = 0;
  let s = unwrapMarkers(String(reply ?? '')).replace(OL_LINK, (whole, slug, para, sel, q) => {
    const a = anchors.get(`${dec(slug)}|${para}`), base = `https://oceanlibrary.com/${slug}/?paraId=${para}`;
    const quote = q ? dec(q) : null;
    const span = a && quote ? findSpan(a.text, quote) : null;
    if (span) { narrowed++; return `${base}&selectionString=${encodeURIComponent(`${a.ilmid}.${siteOffset(a.text, span.start)}~${a.ilmid}.${siteOffset(a.text, span.end)}`)}`; }
    if (quote) unplaced++;
    if (sel) return `${base}&selectionString=${sel}`;
    return a ? `${base}&selectionString=${encodeURIComponent(`${a.ilmid}.0~${a.ilmid}.${siteOffset(a.text, a.text.length)}`)}` : base;
  });
  s = s.replace(OOL_QUOTE, (whole, slug, q) => { const quote = dec(q); return quote ? textFragmentUrl(`https://oceanoflights.org/${slug}/`, quote) : `https://oceanoflights.org/${slug}/`; });
  // our own reader links → the passage's Anís page (its held passage names the document), else unlinked (lib/anis-links.js)
  const byUrl = new Map();
  for (const p of passages || []) for (const k of ['source_url', 'url', 'citation_url', 'reader_url']) if (p?.[k]) byUrl.set(String(p[k]).replace(/#.*$/, ''), p);
  return { text: anisText(dropMarkers(s), { docOf: (u) => byUrl.get(u.replace(/#.*$/, '')) || null }), narrowed, unplaced };
}

/** A streamed-text filter: inline templates ({{quote P3}}, widgets/templates.js) never show while the reply streams — a template is
 *  held back until it closes, then dropped (the finished reply carries its widget). Returns push(text) → text to show now. */
export function templateFilter() {
  let held = '';
  return (s) => {
    let t = unwrapMarkers(held + String(s ?? '')).replace(/\{\{[^{}\n]*\}\}/g, ''); held = '';   // a wrapped marker that reached here → its quote as typed
    const i = t.lastIndexOf('{{');
    if (i >= 0 && !t.slice(i).includes('\n')) { held = t.slice(i); t = t.slice(0, i); }
    else if (t.endsWith('{')) { held = '{'; t = t.slice(0, -1); }
    return t;
  };
}
