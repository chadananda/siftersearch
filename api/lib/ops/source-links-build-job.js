// SOURCE-LINKS BUILD (planning/citation-links-plan.md; Chad 10-21: "all central figures and Shoghi Effendi in the compilations …
// the translations vary so use the SourceHunt API to help resolve"). For each compilation, every paragraph that voices
// Bahá'u'lláh, the Báb, 'Abdu'l-Bahá or Shoghi Effendi and has no source link is hunted (api/lib/source-hunt.js — phrase + BM25
// candidates, the holds/translation decision, own-work-first ranking), the compilation itself excluded; the found source
// paragraph is stored in content_source_links (basis 'verbatim' or 'translation' by wording overlap, method 'sourcehunt').
// Dry run lists what it would link. Yields to a drain with its resume point. params { docIds?, collectionLike?, limit = 300,
// write = false, concurrency = 1, pauseMs = 1500, after? } — `after` = { doc, id } resume point.
import { sourceLinkCoverage, unlinkedWriterParagraphs, saveSourceLinks } from '../repos/source-links-repo.js';
import { isDraining } from '../drain.js';
import { firstPerson } from '../authorship/reader.js';
import { paragraphAuthor } from '../authorship/effective.js';

const VERBATIM = 0.6;   // source-hunt.js: the wording is the source's own at this overlap
const TRANSLATION_MIN = 0.3;   // another rendering must still share real wording (the 10-21 sample's 0–0.17 'translations' were wrong)
const WRITERS = new Set(['Bahá’u’lláh', 'The Báb', '‘Abdu’l-Bahá', 'Shoghi Effendi']);   // reader.js PEOPLE names (curly)
const NOT_A_QUOTE = /^\s*(?:translator|year|document\w*|title|author|source)\s*:|^\s*_?download|\.pdf\b|^[\s\\*\[]*see also/im;

/** Is this paragraph a QUOTATION of one of the writers worth hunting? → the writer, or null with a reason. Pure. */
export function quoteWriter(p) {
  const words = String(p.text || '').split(/\s+/).filter(Boolean).length;
  if (words < 12) return { reason: 'short' };
  if (NOT_A_QUOTE.test(p.text)) return { reason: 'not-a-quote' };
  // the paragraph's tagged writer is only a hint — in compilations it is often the compiler or the wrong voice (10-21 sample:
  // Hidden Words and Messages to America quotes tagged as someone else); the SOURCE found decides whose words these are
  const w = firstPerson(paragraphAuthor({ authors: p.authors, author: null }) || '');
  return { writer: WRITERS.has(w) ? w : null, hunt: true };
}

/** Is SourceHunt's answer the writer's OWN source? Their own work or authorized compilation of them, not a scraped mirror,
 *  with the wording verbatim or (another translation) sharing real wording. → basis, or null with a reason. Pure. */
export function acceptSource(o, _writerHint, quoteDoc, collection = null) {
  if (!o?.id || o.documentId === quoteDoc) return { reason: 'not-found' };
  const writer = firstPerson(o.author || '');
  if (!WRITERS.has(writer)) return { reason: 'other-writer' };
  if (firstPerson(o.bookAuthor || '') !== writer) return { reason: 'not-own-work' };
  if (/compilation/i.test(collection || '')) return { reason: 'compilation' };   // a Research Department compilation is not the source
  if (o.site === 'bahai-library.com') return { reason: 'mirror' };
  const ov = o.overlap ?? 0;
  if (ov >= VERBATIM) return { basis: 'verbatim' };
  return ov >= TRANSLATION_MIN ? { basis: 'translation' } : { reason: 'weak-wording' };
}

// one hunt at a time with a breath between (10-21 09:49: two concurrent hunts + Qdrant's own threads took search from 1.6 s to
// 5–11 s — a batch job must never cost a reader their answer)
export async function sourceLinksBuildJob({ docIds = null, collectionLike, limit = 300, write = false, concurrency = 1, pauseMs = 1500, after = null } = {}, deps = {}) {
  const { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), coverage = sourceLinkCoverage, work = unlinkedWriterParagraphs, save = saveSourceLinks, draining = isDraining,
    hunt = async (text, opts) => (await import('../source-hunt.js')).sourceHunt(text, {}, opts),
    docsOf = async (ids) => (await import('../paragraphs-repo.js')).paragraphsByIds(ids) } = deps;
  const docs = (await coverage({ ...(collectionLike ? { collectionLike } : {}), ...(docIds ? { docIds } : {}) }))
    .filter((d) => Object.values(d.writers).some((w) => w.paras > w.linked)).map((d) => d.id).sort((a, b) => a - b);
  const out = { write, docs: docs.length, hunted: 0, linked: 0, verbatim: 0, translation: 0, not_found: 0, errors: 0, fallback: 0, skipped: {}, rejected: {}, sample: [], rejected_sample: [] };
  let start = after?.doc ? docs.indexOf(after.doc) : 0;
  if (start < 0) start = 0;
  for (let di = start; di < docs.length; di++) {
    let afterId = di === start && after?.id ? after.id : 0;
    for (;;) {
      if (draining()) return { ...out, yielded: true, resume: { after: { doc: docs[di], id: afterId } } };
      if (out.hunted + Object.values(out.skipped).reduce((a, b) => a + b, 0) >= limit) return { ...out, stopped: 'limit', next: { after: { doc: docs[di], id: afterId } } };
      const batch = await work(docs[di], { afterId, limit: Math.min(20, limit - out.hunted) });
      if (!batch.length) break;
      const rows = [];
      for (let i = 0; i < batch.length; i += concurrency) {
        const slice = batch.slice(i, i + concurrency);
        const who = slice.map(quoteWriter);
        if (pauseMs && i > 0) await sleep(pauseMs);
        const res = await Promise.all(slice.map((p, k) => (who[k].hunt ? hunt(p.text, { exclude: { documentIds: [p.doc_id] } }).catch((e) => ({ error: e.message })) : null)));
        const consideredIds = res.flatMap((r) => (r?.considered || []).map((c) => c.id)).filter((id) => id != null);
        const docOf = new Map((consideredIds.length ? await docsOf(consideredIds) : []).map((x) => [x.id, x.doc_id]));
        slice.forEach((p, k) => {
          if (!who[k].hunt) { out.skipped[who[k].reason] = (out.skipped[who[k].reason] || 0) + 1; return; }
          const r = res[k]; out.hunted++;
          if (r?.error) { out.errors++; return; }
          // SourceHunt's first answer, else the next CONSIDERED candidate that is the writer's own work (its top pick is
          // sometimes the compilation that reprints the passage — "Through it the pillars of the Faith…" → a RD compilation)
          const cands = [r?.origin, ...(r?.considered || []).filter((c) => c.id !== r?.origin?.id).map((c) => ({ id: c.id, documentId: docOf.get(c.id),
            title: c.title, author: c.writer, bookAuthor: c.bookAuthor, site: c.site === 'library' ? null : c.site, overlap: c.overlap, collection: c.collection }))].filter(Boolean);
          let o = cands[0], ok = acceptSource(o, who[k].writer, p.doc_id, (r?.considered || []).find((c) => c.id === o?.id)?.collection);
          for (const c of cands.slice(1)) { if (ok.basis) break; const t = acceptSource(c, who[k].writer, p.doc_id, c.collection); if (t.basis) { o = c; ok = t; out.fallback++; } }
          if (!ok.basis) { out.rejected[ok.reason] = (out.rejected[ok.reason] || 0) + 1; if (ok.reason === 'not-found') out.not_found++;
            if (out.rejected_sample.length < 15 && o) out.rejected_sample.push({ reason: ok.reason, quote: String(p.text).slice(0, 90), source: o.title, author: o.author, overlap: o.overlap });
            return; }
          const basis = ok.basis;
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
