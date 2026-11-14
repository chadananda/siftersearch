// A paragraph link in a reply must come from a real tool result (11-14 Íqán divines: the agent typed ?paraId=para_10 / para_12 /
// para_23 / para_24 — paragraphs it never held). Pure: keeps links to held paragraphs; an unheld one → the book (slug known) or its words.
const OL = /\[([^\]]{0,300})\]\((https?:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s)]+)\/?\?[^)\s]*?paraId=([A-Za-z0-9_.-]+)[^)\s]*)\)/g;
const ANY = /https?:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s)"'<>\]]+)\/?(?:\?[^)\s"'<>\]]*?paraId=([A-Za-z0-9_.-]+))?/g;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** → { text, dropped }. passages/works: what the turn holds (any url field); prior: earlier messages — their links count only when
 *  code made them (a selectionString or quote marker), since a typed link once shown is not evidence either. */
export function keepHeldLinks(text, { passages = [], works = [], prior = [] } = {}) {
  const paras = new Set(), slugs = new Set();
  const note = (s, trusted = true) => {
    for (const m of String(s || '').matchAll(ANY)) {
      slugs.add(dec(m[1]));
      if (m[2] && trusted) paras.add(`${dec(m[1])}|${m[2]}`);
    }
  };
  for (const p of [...passages, ...works]) for (const k of ['source_url', 'url', 'citation_url', 'reader_url']) note(p?.[k]);
  for (const m of prior) {
    if (m?.role !== 'assistant') continue;
    for (const l of String(m.content || '').matchAll(/\]\((https?:[^)\s]+)\)/g)) note(l[1], /selectionString=|#~q=/.test(l[1]));
  }
  let dropped = 0;
  const out = String(text ?? '').replace(OL, (whole, label, url, slug, para) => {
    if (paras.has(`${dec(slug)}|${para}`)) return whole;
    dropped++;
    return slugs.has(dec(slug)) ? `[${label}](https://oceanlibrary.com/${slug}/)` : label;
  });
  return { text: out, dropped };
}
