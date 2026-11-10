// Ops report `tradition-readiness` (planning/anis-tradition-rollout.md, Chad 11-10): per tradition, how far each data layer a
// tradition needs before its question bank is tested has reached, split core / gray / rest, + ready and the missing layers.
// Reads ONLY coverage_totals + a docs count per religion (coverage-repo) — never paragraphs. Deps: coverage-repo, tradition-name.
import { canonicalTradition } from '../assistant/tradition-name.js';

/** The rollout order (bank traditions): these come first in the report, in this order. Bank file id → stored religion name. */
export const BANK_TRADITIONS = ['bahai', 'christianity', 'islam', 'judaism', 'buddhism', 'hinduism', 'sikhism', 'confucianism', 'taoism', 'jainism', 'zoroastrianism'];
export const bankReligion = (id) => canonicalTradition(id);

/** Each readiness layer → the ledger layer it is read from, its unit and which ledger figure counts as done. `measured: false`
 *  = the ledger has no completion stamp for it: the figure is shown as a lower bound and the layer never counts as complete. */
export const READINESS_LAYERS = [
  { key: 'phrase', ledger: 'phrase', unit: 'paragraphs', done: 'reached', what: 'paragraphs of documents with phrase points (ledger phrase.reached)' },
  { key: 'documents', ledger: 'text', unit: 'paragraphs', done: 'indexed', what: 'paragraphs synced to search (ledger text.indexed)' },
  { key: 'sub_documents', ledger: 'sections', unit: 'documents', done: 'generated', what: 'documents whose structure was found or is not needed (ledger sections.generated)' },
  { key: 'translations', ledger: 'originals', unit: 'paragraphs', done: 'generated', zeroIs: 'not needed', what: 'non-English paragraphs with a stored translation or a live alignment to English (ledger originals.generated)' },
  { key: 'disambiguation', ledger: 'context', unit: 'paragraphs', done: 'generated', what: 'paragraphs with a disambiguation note (content.context, ledger context.generated)' },
  { key: 'history', ledger: 'entities', unit: 'paragraphs', done: 'generated', what: 'paragraphs the entity/event extractor processed (content.extract_model, ledger entities.generated)' },
  { key: 'concepts', ledger: 'concepts', unit: 'paragraphs', done: 'generated', measured: false,
    what: 'paragraphs with ≥1 proof-checked concept claim (ledger concepts.generated) — a LOWER BOUND',
    toMeasure: 'needs a per-paragraph concept-extraction stamp (e.g. content.concept_model, written for every paragraph the extractor reads, as extract_model is) counted in coverage-repo measureDoc' },
  { key: 'hype', ledger: 'hype', unit: 'paragraphs', done: 'current', what: 'HyPE-eligible paragraphs (paragraph/quote ≥ 60 chars) with questions at the current version (ledger hype.current)' },
];
const TIER = { 1: 'core', 2: 'gray', 0: 'rest' };
const pct = (done, total) => (total ? Math.round((1000 * done) / total) / 10 : null);

/** Pure: coverage_totals rows + live docs per religion → the report. { minPct } = the share a layer must reach to count complete. */
export function buildReadiness(totals = [], liveDocs = [], { minPct = 100, only = null } = {}) {
  const by = new Map();   // canonical religion → { live, layers: Map(ledger → { docs, total, done-figures… per tier }) }
  const ent = (rel) => by.get(rel) || by.set(rel, { live: 0, raw: new Set(), ledger: new Map() }).get(rel);
  for (const r of liveDocs) { const e = ent(canonicalTradition(r.religion || 'Other') || 'Other'); e.live += Number(r.docs) || 0; e.raw.add(r.religion); }
  for (const r of totals) {
    const e = ent(canonicalTradition(r.religion || 'Other') || 'Other'); e.raw.add(r.religion);
    const l = e.ledger.get(r.layer) || e.ledger.set(r.layer, {}).get(r.layer), t = TIER[Number(r.core)] || 'rest';
    const c = (l[t] ||= { docs: 0, total: 0, generated: 0, current: 0, indexed: 0, reached: 0 });
    for (const k of Object.keys(c)) c[k] += Number(r[k]) || 0;
  }
  const order = BANK_TRADITIONS.map(bankReligion);
  const names = [...new Set([...order, ...[...by.keys()].sort((a, b) => (by.get(b).live - by.get(a).live) || a.localeCompare(b))])]
    .filter((n) => !only || [].concat(only).map(canonicalTradition).includes(n));
  const traditions = names.map((religion) => {
    const e = by.get(religion) || { live: 0, raw: new Set(), ledger: new Map() };
    const measuredDocs = ['core', 'gray', 'rest'].reduce((n, t) => n + (e.ledger.get('text')?.[t]?.docs || 0), 0);
    const layers = {}, missing = [];
    for (const spec of READINESS_LAYERS) {
      const l = e.ledger.get(spec.ledger) || {}, tiers = {};
      let total = 0, done = 0, docs = 0;
      for (const t of ['core', 'gray', 'rest']) {
        const c = l[t]; if (!c) continue;
        const tt = c.total, dd = Math.min(c[spec.done], tt);
        tiers[t] = { total: tt, done: dd, pct: pct(dd, tt), docs: c.docs };
        total += tt; done += dd; docs += c.docs;
      }
      let status, reason = null;
      if (!measuredDocs) { status = 'not measured'; reason = 'no document of this tradition is in the coverage ledger yet'; }
      else if (docs < measuredDocs) { status = 'partly measured'; reason = `the ledger has this layer for ${docs} of ${measuredDocs} measured documents (the rolling coverage refresh is still filling it)`; }
      else if (spec.measured === false) { status = 'not measured'; reason = spec.toMeasure; }
      else if (!total) { status = spec.zeroIs || 'empty'; if (status === 'empty') reason = `no ${spec.unit} to measure`; }
      else status = pct(done, total) >= minPct ? 'complete' : 'incomplete';
      layers[spec.key] = { unit: spec.unit, from: spec.what, total, done, pct: pct(done, total), tiers, docs, status, ...(reason ? { reason } : {}) };
      if (!['complete', 'not needed'].includes(status)) missing.push(spec.key);
    }
    const unmeasured = Math.max(0, e.live - measuredDocs);
    return { religion, stored_as: [...e.raw].filter((x) => x != null).sort(), live_docs: e.live, measured_docs: measuredDocs,
      ...(unmeasured ? { unmeasured_docs: unmeasured } : {}), ready: !!e.live && !missing.length && !unmeasured, missing, layers };
  });
  return { min_pct: minPct, layers: READINESS_LAYERS.map(({ key, ledger, unit, what, measured, toMeasure }) => ({ key, ledger, unit, from: what, ...(measured === false ? { measured: false, to_measure: toMeasure } : {}) })), traditions };
}

/** The report. params { minPct = 100, tradition? (one name or a list) }. Deps injectable for tests. */
export async function traditionReadinessReport({ minPct = 100, tradition = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/coverage-repo.js');
  const [totals, live] = await Promise.all([repo.coverageTotalsAll(), repo.liveDocsByReligion()]);
  return buildReadiness(totals, live, { minPct: Number(minPct) || 100, only: tradition });
}
