// SOURCE-LINKS BUILD (planning/citation-links-plan.md; Chad 10-21: "all central figures and Shoghi Effendi in the compilations …
// the translations vary so use the SourceHunt API to help resolve"). For each compilation, every paragraph that voices
// Bahá'u'lláh, the Báb, 'Abdu'l-Bahá or Shoghi Effendi and has no source link is hunted (api/lib/source-hunt.js — phrase + BM25
// candidates, the holds/translation decision, own-work-first ranking), the compilation itself excluded; the found source
// paragraph is stored in content_source_links (basis 'verbatim' or 'translation' by wording overlap, method 'sourcehunt').
// Dry run lists what it would link. Yields to a drain with its resume point. params { docIds?, collectionLike?, limit = 300,
// write = false, concurrency = 2, after? } — `after` = { doc, id } resume point.
import { sourceLinkCoverage, unlinkedWriterParagraphs, saveSourceLinks } from '../repos/source-links-repo.js';
import { isDraining } from '../drain.js';

const VERBATIM = 0.6;   // source-hunt.js: the wording is the source's own at this overlap

export async function sourceLinksBuildJob({ docIds = null, collectionLike, limit = 300, write = false, concurrency = 2, after = null } = {}, deps = {}) {
  const { coverage = sourceLinkCoverage, work = unlinkedWriterParagraphs, save = saveSourceLinks, draining = isDraining,
    hunt = async (text, opts) => (await import('../source-hunt.js')).sourceHunt(text, {}, opts) } = deps;
  const docs = (await coverage({ ...(collectionLike ? { collectionLike } : {}), ...(docIds ? { docIds } : {}) }))
    .filter((d) => Object.values(d.writers).some((w) => w.paras > w.linked)).map((d) => d.id).sort((a, b) => a - b);
  const out = { write, docs: docs.length, hunted: 0, linked: 0, verbatim: 0, translation: 0, not_found: 0, errors: 0, sample: [] };
  let start = after?.doc ? docs.indexOf(after.doc) : 0;
  if (start < 0) start = 0;
  for (let di = start; di < docs.length; di++) {
    let afterId = di === start && after?.id ? after.id : 0;
    for (;;) {
      if (draining()) return { ...out, yielded: true, resume: { after: { doc: docs[di], id: afterId } } };
      if (out.hunted >= limit) return { ...out, stopped: 'limit', next: { after: { doc: docs[di], id: afterId } } };
      const batch = await work(docs[di], { afterId, limit: Math.min(20, limit - out.hunted) });
      if (!batch.length) break;
      const rows = [];
      for (let i = 0; i < batch.length; i += concurrency) {
        const slice = batch.slice(i, i + concurrency);
        const res = await Promise.all(slice.map((p) => hunt(p.text, { exclude: { documentIds: [p.doc_id] } }).catch((e) => ({ error: e.message }))));
        slice.forEach((p, k) => {
          const r = res[k]; out.hunted++;
          if (r?.error) { out.errors++; return; }
          const o = r?.origin;
          if (!o?.id || o.documentId === p.doc_id) { out.not_found++; return; }
          const basis = (o.overlap ?? 0) >= VERBATIM ? 'verbatim' : 'translation';
          out.linked++; out[basis]++;
          rows.push({ quote_id: p.id, source_id: o.id, quote_doc: p.doc_id, source_doc: o.documentId, coverage: o.overlap ?? null, share: null, basis, method: 'sourcehunt' });
          if (out.sample.length < 25) out.sample.push({ quote: String(p.text).slice(0, 120), source: o.title, author: o.author, basis, overlap: o.overlap });
        });
      }
      if (write && rows.length) await save(rows);
      afterId = batch[batch.length - 1].id;
    }
  }
  return out;
}
