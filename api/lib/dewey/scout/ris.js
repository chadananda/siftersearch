// RIS (bahai-library.com's collection export: /ris/collection_<Name>.ris) → works. Pure parser + a fetch. The Bahá'í
// scout's structured seed: every pilgrim note bahai-library holds, with title, authors, years, abstract, page URL.

/** RIS text → [{ id, url, title, authors, editors, year, written, kinds, language, abstract, notes, keywords }]. Pure. */
export function parseRis(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(/^([A-Z][A-Z0-9])  - ?(.*)$/);
    if (!m) continue;
    const [, tag, v] = m, val = v.trim();
    if (tag === 'TY') { cur = { kind: val, authors: [], editors: [], keywords: [] }; continue; }
    if (!cur) continue;
    if (tag === 'ER') { out.push(cur); cur = null; continue; }
    if (tag === 'ID') cur.id = val;
    else if (tag === 'UR') cur.url = val;
    else if (tag === 'T1' || tag === 'TI') cur.title = val;
    else if (tag === 'A1' || tag === 'AU') cur.authors.push(flipName(val));
    else if (tag === 'A2') cur.editors.push(flipName(val));
    else if (tag === 'Y1' || tag === 'PY') cur.year = val;
    else if (tag === 'Y2') cur.written = val;
    else if (tag === 'M3') cur.kinds = val.split(';').map((s) => s.trim()).filter(Boolean);
    else if (tag === 'LA') cur.language = val;
    else if (tag === 'AB') cur.abstract = val;
    else if (tag === 'N1') cur.notes = val;
    else if (tag === 'KW') cur.keywords.push(val);
  }
  return out.filter((w) => w.title && w.url);
}
// "Khan,Ali Kuli" → "Ali Kuli Khan"; "Various" stays
const flipName = (n) => { const [last, first] = n.split(','); return first ? `${first.trim()} ${last.trim()}`.replace(/, editor$/, '').replace(/\s+/g, ' ') : last.trim(); };

/** One bahai-library collection's works (name as in its URL: 'Pilgrims', …). */
export async function bahaiLibraryCollection(name, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`https://bahai-library.com/ris/collection_${encodeURIComponent(name)}.ris`, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`bahai-library collection ${name}: ${r.status}`);
  return parseRis(await r.text());
}
export const UA = 'SifterSearch-Dewey/1.0 (library scout; +https://siftersearch.com)';
