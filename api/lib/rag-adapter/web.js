// SifterSearch WebResearch port — a keyless Wikipedia lookup that RETURNS ITS SOURCES (provenance is
// mandatory; the library tags external evidence as the lowest authority tier). research-resolve calls this
// ONLY when the corpus is thin. To use Perplexity/Serper instead, re-implement research() here — the library
// core never changes. Fails soft (returns null) so a web hiccup can't break a grounding run.
const WP = 'https://en.wikipedia.org';

export function makeWeb() {
  return {
    async research(query) {
      try {
        const term = String(query).replace(/^Who is\s+"?/i, '').split('"')[0].split('?')[0].slice(0, 120).trim() || String(query).slice(0, 120);
        const sr = await fetch(`${WP}/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(12000) });
        const hits = (await sr.json())?.query?.search || [];
        if (!hits.length) return { answer: '', sources: [] };
        const sources = [], parts = [];
        for (const h of hits.slice(0, 2)) {
          const slug = String(h.title).replace(/ /g, '_');
          const pr = await fetch(`${WP}/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(12000) });
          if (!pr.ok) continue;
          const pj = await pr.json();
          sources.push({ url: pj?.content_urls?.desktop?.page || `${WP}/wiki/${encodeURIComponent(slug)}`, title: `${h.title} — Wikipedia` });
          if (pj?.extract) parts.push(`${h.title}: ${pj.extract}`);
        }
        return { answer: parts.join('\n').slice(0, 800), sources };
      } catch { return null; }
    },
  };
}
