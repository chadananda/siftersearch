// Ops report `implied-overview`: the Implication browser's numbers — items by status/concept/tradition, HyPE spend (REAL, from ai_usage) by day/model/tradition,
// coverage per tradition, featured items. Whole-table reads happen HERE (windowed, one report at a time), never per request. Anything allocated is flagged estimated.
import * as implied from '../repos/implied-repo.js';
import { hypeSpendWindow, firstUsageAt, impliedSideSpend } from '../repos/ai-usage-repo.js';
import { coverageTotalsAll } from '../repos/coverage-repo.js';
import { maxContentId } from '../paragraphs-repo.js';
import { shapeItem } from '../implied/service.js';

const r4 = (n) => Math.round((n || 0) * 10000) / 10000;
const DAY = 86400e3, WIN = 250000;

export async function impliedOverviewJob(params = {}, deps = {}) {
  const d = { totals: implied.impliedTotals, spendWindow: hypeSpendWindow, firstAt: firstUsageAt, side: impliedSideSpend, coverage: coverageTotalsAll, maxId: maxContentId, counts: implied.hypeCountsWindow,
    religions: implied.religionOfDocs, featured: implied.featuredRows, texts: implied.paragraphTexts, now: () => new Date(), yieldTick: () => new Promise((r) => setImmediate(r)), ...deps };
  const totals = await d.totals(), now = d.now();
  // HyPE spend: windows of 7 days from the first ledger row → day / model / document
  const byDay = new Map(), byModel = new Map(), byDoc = new Map();
  const first = await d.firstAt();
  for (let t = first ? Date.parse(first.replace(' ', 'T') + 'Z') : now.getTime(); t < now.getTime() + DAY; t += 7 * DAY) {
    const iso = (x) => new Date(x).toISOString().replace('T', ' ').slice(0, 19);
    for (const r of await d.spendWindow(iso(t), iso(t + 7 * DAY))) {
      const day = byDay.get(r.day) || { day: r.day, usd: 0, calls: 0 }; day.usd += r.usd || 0; day.calls += r.calls || 0; byDay.set(r.day, day);
      byModel.set(r.model, (byModel.get(r.model) || 0) + (r.usd || 0));
      if (r.docId != null && r.docId !== '') byDoc.set(Number(r.docId), (byDoc.get(Number(r.docId)) || 0) + (r.usd || 0));
    }
    await d.yieldTick();
  }
  const hypeUsd = [...byDay.values()].reduce((n, x) => n + x.usd, 0), attributed = [...byDoc.values()].reduce((n, x) => n + x, 0);
  // HyPE output per document (id windows) → tradition
  const perDoc = new Map(), top = await d.maxId();
  for (let from = 0; from < top; from += WIN) { for (const r of await d.counts(from, from + WIN)) perDoc.set(r.doc_id, { paragraphs: r.paragraphs, questions: r.questions || 0 }); await d.yieldTick(); }
  const rel = await d.religions([...new Set([...perDoc.keys(), ...byDoc.keys()])]);
  const trad = new Map(), T = (k) => trad.get(k) || trad.set(k, { religion: k, usd: 0, attributedUsd: 0, paragraphs: 0, questions: 0, implied: 0 }).get(k);
  for (const [doc, o] of perDoc) { const t = T(rel.get(doc) || 'Other'); t.paragraphs += o.paragraphs; t.questions += o.questions; }
  for (const [doc, usd] of byDoc) T(rel.get(doc) || 'Other').attributedUsd += usd;
  for (const x of totals.byReligion) T(x.religion).implied = x.items;
  // spend with no document id is spread over traditions by their share of HyPE'd paragraphs — labelled estimated
  const unattributed = Math.max(0, hypeUsd - attributed), allParas = [...trad.values()].reduce((n, t) => n + t.paragraphs, 0);
  const byReligion = [...trad.values()].map((t) => { const share = allParas ? unattributed * t.paragraphs / allParas : 0; return { religion: t.religion, usd: r4(t.attributedUsd + share), estimated: share > 0.005 * Math.max(1, t.attributedUsd + share),
    paragraphs: t.paragraphs, questions: t.questions, implied: t.implied }; }).filter((t) => t.usd > 0 || t.paragraphs > 0).sort((a, b) => b.usd - a.usd);
  const questionsAll = byReligion.reduce((n, t) => n + t.questions, 0), paragraphsAll = byReligion.reduce((n, t) => n + t.paragraphs, 0), qPerPara = paragraphsAll ? questionsAll / paragraphsAll : 0;
  const impliedByDay = new Map(totals.impliedByDay.map((x) => [x.day, x.implied]));
  const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map((x) => ({ day: x.day, usd: r4(x.usd), paragraphs: x.calls, questions: Math.round(x.calls * qPerPara), implied: impliedByDay.get(x.day) || 0 }));
  const side = await d.side(), impliedItems = totals.items;
  // implied share of the HyPE bill: the implied output's share of all items written (an output-token proxy) + the real side spend
  const shareEst = questionsAll + impliedItems ? hypeUsd * impliedItems / (questionsAll + impliedItems) : 0, impliedShareUsd = r4(shareEst + side.premise + side.propose);
  const cov = new Map();
  for (const c of await d.coverage()) if (c.layer === 'hype') { const e = cov.get(c.religion || 'Other') || { religion: c.religion || 'Other', hyped: 0, total: 0 }; e.hyped += c.generated || 0; e.total += c.total || 0; cov.set(e.religion, e); }
  const featuredRows = await d.featured(12), texts = await d.texts([...new Set(featuredRows.map((r) => r.paraId))]);
  const featured = featuredRows.map((r) => shapeItem(r, texts.get(r.paraId) || null));
  return { asOf: now.toISOString(),
    totals: { items: totals.items, paragraphs: totals.paragraphs, byStatus: totals.byStatus, bySource: totals.bySource }, byConcept: totals.byConcept,
    byReligion: totals.byReligion.map((x) => ({ religion: x.religion, items: x.items, paragraphs: x.paragraphs })),
    spend: { totalUsd: r4(hypeUsd + side.premise + side.propose + side.judge), hypeUsd: r4(hypeUsd), impliedShareUsd, impliedShareEstimated: true, sideUsd: { premisePilot: r4(side.premise), propose: r4(side.propose), judge: r4(side.judge) },
      byDay: days, byDayEstimated: { questions: true }, byReligion, attributedShare: hypeUsd ? r4(attributed / hypeUsd) : 0,
      byModel: [...byModel].map(([model, usd]) => ({ model, usd: r4(usd) })).sort((a, b) => b.usd - a.usd),
      costPerQuestion: questionsAll ? r4(hypeUsd / questionsAll) : null, costPerImplied: impliedItems ? r4(impliedShareUsd / impliedItems) : null, costPerImpliedEstimated: true,
      coverage: [...cov.values()].sort((a, b) => b.hyped - a.hyped) },
    featured };
}
