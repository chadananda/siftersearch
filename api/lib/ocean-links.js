// Every OceanLibrary paragraph link we hand out becomes a RANGE link (Chad 2026-10-09: "ensure we do this wherever links
// are generated — it's a much nicer user experience"). Links are built in ~30 places (search, public API, entity/graph
// API, chat, Anís, notes, bios); instead of threading the block id / book id / text through every query, this resolves
// any "https://oceanlibrary.com/<slug>/?paraId=para_N" at the OUTPUT boundary with one batched lookup and rewrites it to
// "?paraId=para_N&selectionString=<ilmid>.0~<ilmid>.<end>" (the whole paragraph highlighted; lib/ocean-range.js). A link
// that already carries a selection, or whose paragraph lacks a stored block id, is left as it is.
// Deps: db (read), ocean-range.
import { queryAll } from './db.js';
import { rangeUrl, quoteUrl } from './ocean-range.js';

// slug is the first path segment; the paragraph id is para_N or a footnote/fn id. A producer that knows the quoted words
// appends the private marker "#~q=<encoded quote>" (source-hunt textFragment) → the range covers just those words.
export const OCEAN_PARA_URL = /https:\/\/(?:www\.)?oceanlibrary\.com\/([^/?#\s"'<>)\]]+)\/?\?paraId=([A-Za-z0-9_.-]+)(?![^\s"'<>)\]]*selectionString=)(?:#~q=([^\s"'<>)\]]+))?/g;
export const oceanQuoteMarker = (url, quote) => (quote ? `${url}#~q=${encodeURIComponent(quote)}` : url);

const cache = new Map();          // `${slug}|${para}` → { external_id, ilm, text } or null (no anchors)
const CACHE_MAX = 50000;

/** Resolve [slug, para] pairs to their range links (batched; cached). */
async function resolve(pairs) {
  const todo = pairs.filter(([s, p]) => !cache.has(`${s}|${p}`));
  for (let i = 0; i < todo.length; i += 200) {
    const chunk = todo.slice(i, i + 200);
    const rows = await queryAll(
      `SELECT d.source_url, d.external_id, c.external_para_id pid, c.text, c.block_attrs
         FROM content c JOIN docs d ON d.id = c.doc_id
        WHERE c.deleted_at IS NULL AND d.deleted_at IS NULL AND d.source_site = 'oceanlibrary.com'
          AND (${chunk.map(() => '(d.source_url IN (?, ?) AND c.external_para_id = ?)').join(' OR ')})`,
      chunk.flatMap(([s, p]) => [`https://oceanlibrary.com/${s}`, `https://oceanlibrary.com/${s}/`, p]), 'ocean-links:resolve');
    const found = new Map(rows.map((r) => [`${String(r.source_url).replace(/\/$/, '').split('/').pop()}|${r.pid}`, r]));
    for (const [s, p] of chunk) {
      const r = found.get(`${s}|${p}`);
      let ilm = null;
      try { ilm = r ? JSON.parse(r.block_attrs || '{}').ilm_id : null; } catch { /* no anchors */ }
      cache.set(`${s}|${p}`, r && ilm && r.external_id ? { external_id: r.external_id, ilm, text: r.text } : null);
    }
  }
  if (cache.size > CACHE_MAX) for (const k of [...cache.keys()].slice(0, cache.size - CACHE_MAX)) cache.delete(k);
}

/** Rewrite every plain OceanLibrary paragraph link inside a string. */
export async function upgradeOceanLinks(text) {
  const s = String(text ?? '');
  if (!s.includes('oceanlibrary.com')) return s;
  const pairs = [...s.matchAll(OCEAN_PARA_URL)].map((m) => [decodeURIComponent(m[1]), m[2]]);
  if (!pairs.length) return s;
  await resolve(pairs);
  return s.replace(OCEAN_PARA_URL, (whole, slug, para, q) => {
    const a = cache.get(`${decodeURIComponent(slug)}|${para}`);
    const plain = whole.replace(/#~q=.*$/, '');                       // the private marker never leaves un-upgraded
    if (!a) return plain;
    const base = `https://oceanlibrary.com/${slug}`, p = { para_id: para, ilm_id: a.ilm, text: a.text };
    let quote = null;
    try { quote = q ? decodeURIComponent(q) : null; } catch { /* malformed marker: whole paragraph */ }
    return (quote && quoteUrl(base, a.external_id, p, quote)) || rangeUrl(base, a.external_id, p) || plain;
  });
}

/** A single link narrowed to the quoted words, when the caller knows them. */
export const oceanQuoteUrl = (url, quote) => upgradeOceanLinks(oceanQuoteMarker(url, quote));

/** An SSE event sender that writes in order and upgrades OceanLibrary links in each event (sources, done, citations).
 *  Streamed answer text needs nothing more: its links come from citation URLs already upgraded before the model ran. */
export function rangeLinkSender(write) {
  let chain = Promise.resolve();
  const send = (data) => {
    const json = JSON.stringify(data);
    chain = chain.then(async () => {
      const out = json.includes('oceanlibrary.com') && json.includes('paraId=') ? await upgradeOceanLinks(json).catch(() => json) : json;
      try { write(out); } catch { /* closed */ }
    });
    return chain;
  };
  send.flush = () => chain;   // await before ending the response, or the last events are cut off
  return send;
}
