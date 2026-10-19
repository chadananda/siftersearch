// dewey-offer-paths ops job — files a folder sweep found MISSING (or partly held) become OFFERS for Chad (Chad 10-19: "find
// books we do not have and propose them"): each file (a server path, read in place) is checked again, appraised (what it is,
// its shelf), and offered under Found on /dewey with its verdict — never imported unasked. A file already handled (its
// sha256 on an item) is skipped. params { paths: [server paths], by? }.
import { identifyAndCheck } from '../dewey/holdings.js';
import { appraiseDocument } from '../dewey/appraise.js';
import { allowedPath } from '../dewey/paths.js';
import { createItem, updateItem, findBySha } from '../repos/dewey-repo.js';
import { logActivity } from '../repos/activity-repo.js';
import { wholeWork, estimatedWords } from '../dewey/whole.js';

export async function deweyOfferPathsJob({ paths = [], by = 'dewey-sweep' } = {}, deps = {}) {
  const { check = identifyAndCheck, appraise = appraiseDocument, find = findBySha, create = createItem, update = updateItem, allowed = allowedPath } = deps;
  const out = { offered: [], held: [], skipped: [], incomplete: [], errors: [] };
  for (const path of paths) {
    if (!allowed(path)) { out.errors.push({ path, why: 'outside the allowed folders' }); continue; }
    try {
      const doc = await check({ path });
      if (doc.sha256 && await find(doc.sha256)) { out.skipped.push(path); continue; }
      if (doc.result?.verdict === 'held') { out.held.push({ path, held: doc.result.candidates?.[0]?.id }); continue; }
      const a = await appraise(doc.identified, doc.excerpt, doc.result?.verdict).catch(() => null);
      // never offer an incomplete copy (Chad 10-19: "That is a trap")
      const w = wholeWork({ name: path.split('/').pop(), kind: a?.kind || '', words: estimatedWords(doc), pdfPages: doc.identified?.sample?.of || null, text: doc.identified?._text || doc.excerpt || '' });
      // an incomplete copy only tells us the work EXISTS: it goes on the acquire list, the copy noted as the evidence
      if (!w.whole) {
        const it = await create({ title: a?.title || doc.identified?.title || path.split('/').pop(), author: a?.author || null, kind: a?.kind || null,
          identified: { title: a?.title || null, author: a?.author || null, appraisal: a, incomplete_copy: { path, why: w.why }, scout: { sought: a?.title || null, why: a?.summary || null, importance: 3, channels: [] } },
          by, state: 'to-buy', why: `a folder had only part of it (${w.why.join('; ')}) — on the list to acquire` });
        out.incomplete.push({ path, why: w.why, item: it.id });
        continue;
      }
      const name = path.split('/').pop();
      const item = await create({ title: a?.title || doc.identified?.title || name, author: a?.author || doc.identified?.author || null, kind: a?.kind || null,
        identified: { ...doc.identified, _text: undefined, file_name: name, shelf: a?.shelf || null, appraisal: a, verdict: doc.result?.verdict,
          candidates: (doc.result?.candidates || []).slice(0, 3).map((c) => ({ id: c.id, title: c.title, relation: c.relation?.relation || null })) },
        by, state: 'offered', why: `found in a folder sweep: ${doc.result?.verdict}${a?.recommendation ? ` — Dewey recommends: ${a.recommendation}` : ''}` });
      await update(item.id, { original_path: path, sha256: doc.sha256 || null });
      out.offered.push({ path, item: item.id, verdict: doc.result?.verdict, title: item.title });
    } catch (err) { out.errors.push({ path, why: String(err.message).slice(0, 160) }); }
  }
  await logActivity('job', `folder sweep offers: ${out.offered.length} offered, ${out.held.length} held after all, ${out.skipped.length} already handled`).catch(() => {});
  return out;
}
