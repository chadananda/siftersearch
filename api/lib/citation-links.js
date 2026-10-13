// Citation links point at the best PUBLISHER of the passage, whatever copy search found (Chad 10-12, universal for SourceHunt,
// Anís, search and the API): an identical copy on OceanLibrary (range link) beats Ocean of Lights (page + range) beats
// Phelps beats bahai-library beats siftersearch. linkFor ranks the found copy's own addresses; this looks across copies.
// Deps: copies-repo (injectable), source-links.
import { linkFor } from './source-links.js';
import { encodeMarker } from './ool-range.js';

// The SAME WORK only: the bahai-library copy of Gleanings → OceanLibrary's Gleanings; "Bahá'í World Faith" quoting those words
// stays Bahá'í World Faith (10-12: a row naming one publication must not link another).
const workKey = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(the|a|an)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\bbaha u llah\b/g, 'bahaullah').replace(/\babdu l baha\b/g, 'abdulbaha').trim().split(/\s+/).slice(0, 5).join(' ');
const sameWork = (a, b) => { const x = workKey(a), y = workKey(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
// OceanLibrary's book id names the work even when its title differs ("Fountain of Wisdom" = Tablets of Bahá’u’lláh)
const bookIdWork = (externalId) => String(externalId || '').replace(/_(?:ocean|bahai|prod)\b.*$/i, '').replace(/_/g, ' ');

/** items: [{ id (paragraph), title (its work), link: linkFor result, quote? }] → Map(id → better link + that copy's `title`,
 *  which the caller shows: the link and the name must be the same publication — 10-12) where an identical copy
 *  of the same work is published higher. Without a title, any identical copy counts. */
const arabicScript = (t) => { const s = String(t || ''); const a = (s.match(/[\u0600-\u06FF]/g) || []).length; return a > 0 && a >= (s.match(/[A-Za-z]/g) || []).length; };
const rtlLang = (l) => /^(ar|fa|ur|ara|per|fas)/i.test(String(l || ''));

export async function betterCopyLinks(items, opts = {}) {
  const { copies } = opts;
  const need = (items || []).filter((x) => x?.id && x.link && x.link.tier > 1);
  if (!need.length) return new Map();
  const find = copies || (await import('./repos/copies-repo.js')).identicalCopies;
  const byId = await find(need.map((x) => x.id));
  const out = new Map();
  for (const x of need) {
    let best = null;
    for (const c of byId.get(Number(x.id)) || []) {
      if (x.title && !sameWork(x.title, c.title)) continue;
      const l = linkFor({ ...c, id: c.doc_id }, c.paragraph_index, { quote: x.quote || null });
      if (l.tier < (best?.tier ?? x.link.tier) || (best && l.tier === best.tier && l.paragraph_level && !best.paragraph_level)) best = { ...l, title: c.title || null };
    }
    if (best && best.tier < x.link.tier) { out.set(Number(x.id), best); continue; }
    // no identical copy (our copy adds "[11.12]" markers, spacing…): the SAME WORK on OceanLibrary + the words → the output
    // pass finds the paragraph by its opening words and writes the range (ocean-links.js, OCEAN_BOOK_QUOTE)
    if (x.link.tier > 1 && x.title && (x.quote || x.text)) {
      const works = await (opts.olWorks || (await import('./repos/copies-repo.js')).oceanLibraryWorks)().catch(() => []);
      // the SAME LANGUAGE too: an Arabic original titled like its English compilation ("Gleanings") was sent to the English
      // book on OceanLibrary (Chad 10-12: "the link for the Arabic is to the english of oceanlibrary.com")
      const rtl = arabicScript(x.quote || x.text);
      const w = works.find((d) => (sameWork(x.title, d.title) || sameWork(x.title, bookIdWork(d.external_id))) && rtl === rtlLang(d.language));
      if (w) out.set(Number(x.id), { url: `${String(w.source_url).replace(/[?#].*$/, '')}#~q=${encodeMarker(String(x.quote || x.text).slice(0, 2000))}`,
        site: 'oceanlibrary.com', tier: 1, paragraph_level: true, reader_url: x.link.reader_url, title: w.title });
    }
  }
  return out;
}
