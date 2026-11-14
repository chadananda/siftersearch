// Ops report `hype-selfref-purge`: legacy STATED questions that today's questionFault calls selfReference ("according to the paragraph", "the author…") leave the index (Chad 11-13).
// DROP = the slot stays, emptied: { q: '', dropped: 'selfReference', was } so survivors keep their k (point id = para*1000+k) and no vector is re-sent; then enhanced_synced=0 + a hype
// follow-index per touched doc, whose block diff deletes exactly the dropped points (scripts/phrase-index/indexer.mjs). Only selfReference. Default DRY RUN; apply is idempotent.
// params { apply?: false, limit? (max paragraphs changed), fault?: 'selfReference'|'yesNo' (11-13: yes/no retired too) } → { apply, fault, paragraphs, questions, pointsToDelete, emptied, samples[30], docs, reindex }
// emptied = paragraphs left with no stated question at all (they then need a re-hype to be found by question).
import * as implied from '../repos/implied-repo.js';
import { maxContentId } from '../paragraphs-repo.js';
import { questionFault } from '../rag/enrich/retrieval.js';

const WIN = 20000, SAMPLES = 30, CHUNK = 200;
const isImp = (x) => x && typeof x === 'object' && x.implied;
const FAULTS = ['selfReference', 'yesNo'];

export async function hypeSelfrefPurgeJob(params = {}, deps = {}) {
  const d = { window: implied.hypWindow, titles: implied.titleOfDocs, maxId: maxContentId, fault: questionFault, replace: implied.replaceHypIf, reindex: null, log: console, rand: Math.random, yieldTick: () => new Promise((r) => setImmediate(r)), ...deps };
  const fault = params.fault ?? 'selfReference';
  if (!FAULTS.includes(fault)) throw Object.assign(new Error(`fault must be one of ${FAULTS.join(', ')}`), { statusCode: 400 });
  const apply = params.apply === true, limit = Number(params.limit) > 0 ? Number(params.limit) : Infinity;
  const titles = new Map(), reservoir = [], docs = new Set();
  let paragraphs = 0, questions = 0, written = 0, emptied = 0;
  const top = await d.maxId();
  for (let from = 0; from < top && paragraphs < limit; from += WIN) {
    const rows = await d.window(from, from + WIN), need = [...new Set(rows.map((r) => r.doc_id))].filter((i) => !titles.has(i));
    if (need.length) for (const [id, t] of await d.titles(need)) titles.set(id, t);
    const updates = [];
    for (const r of rows) {
      if (paragraphs >= limit) break;
      let arr = null;
      if (typeof r.hyp_questions === 'string' && r.hyp_questions.startsWith('[')) { try { const v = JSON.parse(r.hyp_questions); if (Array.isArray(v)) arr = v; } catch { /* legacy text */ } }
      if (!arr) arr = String(r.hyp_questions || '').split('\n').map((s) => s.trim()).filter(Boolean);
      let hit = 0;
      const next = arr.map((x) => {
        if (isImp(x)) return x;
        const q = typeof x === 'string' ? x : x?.q ?? x?.question ?? '';
        if (!q || d.fault(q, titles.get(r.doc_id), { seeker: !!x?.seeker }) !== fault) return x;
        hit++;
        const s = { q, paraId: r.id, docId: r.doc_id };
        if (reservoir.length < SAMPLES) reservoir.push(s); else { const j = Math.floor(d.rand() * (questions + hit)); if (j < SAMPLES) reservoir[j] = s; }
        return { q: '', dropped: fault, was: q };
      });
      if (!hit) continue;
      paragraphs++; questions += hit; docs.add(r.doc_id);
      if (!next.some((x) => !isImp(x) && String(typeof x === 'string' ? x : x?.q ?? x?.question ?? '').trim())) emptied++;
      updates.push({ id: r.id, from: r.hyp_questions, to: JSON.stringify(next) });
    }
    if (apply) for (let i = 0; i < updates.length; i += CHUNK) written += await d.replace(updates.slice(i, i + CHUNK));
    d.log.info?.({ from, paragraphs, questions, written }, `hype-selfref-purge(${fault}): window`);
    await d.yieldTick();
  }
  const out = { apply, fault, paragraphs, questions, pointsToDelete: questions, emptied, docs: docs.size, samples: reservoir.map((s) => ({ ...s, doc: titles.get(s.docId) || null })) };
  if (apply) {
    out.written = written;
    const ids = [...docs];
    out.reindex = ids.length ? await (d.reindex || (async (x) => (await import('../implied/service.js')).queueReindex(x)))(ids) : 'none';
  }
  return out;
}
