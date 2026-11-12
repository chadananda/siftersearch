// Ops report `hype-question-faults`: runs today's questionFault over every STATED question already in content.hyp_questions (legacy rows predate the gate). REPORT ONLY — removes nothing.
// Windowed by content id, one report at a time. → { scanned, paragraphs, faulty, byFault, samples[30] }
import * as implied from '../repos/implied-repo.js';
import { maxContentId } from '../paragraphs-repo.js';
import { questionFault } from '../rag/enrich/retrieval.js';

const WIN = 20000, SAMPLES = 30;

export async function hypeQuestionFaultsJob(params = {}, deps = {}) {
  const d = { window: implied.hypWindow, titles: implied.titleOfDocs, maxId: maxContentId, fault: questionFault, rand: Math.random, now: () => new Date(), yieldTick: () => new Promise((r) => setImmediate(r)), ...deps };
  const titles = new Map(), byFault = {}, reservoir = [];
  let scanned = 0, paragraphs = 0, faulty = 0;
  const top = await d.maxId();
  for (let from = 0; from < top; from += WIN) {
    const rows = await d.window(from, from + WIN), need = [...new Set(rows.map((r) => r.doc_id))].filter((i) => !titles.has(i));
    if (need.length) for (const [id, t] of await d.titles(need)) titles.set(id, t);
    for (const r of rows) {
      const { stated } = implied.splitHyp(r.hyp_questions);
      if (!stated.length) continue;
      paragraphs++;
      for (const x of stated) {
        const q = typeof x === 'string' ? x : x?.q ?? x?.question ?? '';
        if (!q) continue;
        scanned++;
        const f = d.fault(q, titles.get(r.doc_id), { seeker: !!x?.seeker });
        if (!f) continue;
        faulty++; byFault[f] = (byFault[f] || 0) + 1;
        const s = { q, paraId: r.id, docId: r.doc_id, fault: f };
        if (reservoir.length < SAMPLES) reservoir.push(s); else { const j = Math.floor(d.rand() * faulty); if (j < SAMPLES) reservoir[j] = s; }
      }
    }
    await d.yieldTick();
  }
  const samples = reservoir.map((s) => ({ ...s, doc: titles.get(s.docId) || null }));
  return { asOf: d.now().toISOString(), scanned, paragraphs, faulty, faultyShare: scanned ? Math.round(faulty / scanned * 10000) / 10000 : 0, byFault, samples };
}
