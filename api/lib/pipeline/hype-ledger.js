// HyPE program quality ledger: free per-batch metrics (measureDoc → sumAcc → rates), baseline comparison (compare) and the file
// store under data/run/hype-program/ (ledger.jsonl, baseline.json, pause.json, cursor.json). Pure except the store. No deps but profile's language probe.
import fs from 'node:fs';
import path from 'node:path';
import { detectLatinLang } from './profile.js';

export const FAULT_KEYS = ['yesNo', 'selfReference', 'nonLatin', 'namedBook', 'unanswered'];   // questions the gates dropped (settle stats); `unverified` is only informational
export const DEFAULT_MARGIN = { rel: 0.25, abs: 0.02, qpp: 0.2, gradePts: 10 };   // worse-than-baseline tolerance (rates: max(base*(1+rel), base+abs); q/¶ may fall qpp relative; grades gradePts points)
export const DEFAULT_MIN_SAMPLE = 100, MIN_GRADED_QUESTIONS = 20;
export const DUP_JACCARD = 0.8;
const RATE_KEYS = ['faultRate', 'emptyRate', 'exhaustedRate', 'truncationRate', 'failedRate', 'dupRate', 'langMismatchRate'];   // higher is worse
export const GRADE_KEYS = ['searchablePct', 'answeredPct', 'distinctPct'];                                                               // higher is better

const qsOf = (row) => { try { const q = typeof row.hyp_questions === 'string' ? JSON.parse(row.hyp_questions) : row.hyp_questions; return (Array.isArray(q) ? q : q?.questions) || []; } catch { return []; } };
const words = (s) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
const jaccard = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n || 1); };
// language bucket of a text: a dominant non-Latin script wins, else the Latin-script function-word probe
const langBucket = (t) => { const l = String(t).match(/\p{L}/gu) || []; if (!l.length) return null; const n = (re) => l.filter((c) => re.test(c)).length / l.length;
  return n(/[֐-׿]/) > 0.2 ? 'he' : n(/[؀-ۿ]/) > 0.2 ? 'ar' : n(/[㐀-鿿]/) > 0.2 ? 'zh' : detectLatinLang(t); };
const isArabicScript = (l) => l === 'ar' || l === 'fa';

export const newAcc = () => ({ sent: 0, written: 0, failed: 0, exhausted: 0, alreadyDone: 0, gone: 0, truncated: 0, split: 0, qCount: 0, qParas: 0, dupQ: 0, langChecked: 0, langBad: 0, faults: {}, unverified: 0, sampleIds: [] });

/** One settled doc → its measurements. outcomes = [{id, replies[]}] sent, result = rag.retrieval.settle's return, truncated = Set of ids that hit max_tokens,
 *  rows = the doc's content rows now ([{id, text, hyp_questions, hyp_model}]), sampleRate = share of written ¶ queued for the 1% grader. */
export function measureDoc({ outcomes, result, truncated = new Set(), rows = [], version, sampleRate = 0, rand = Math.random }) {
  const a = newAcc(), failed = new Set(result.failed || []), sent = new Set(outcomes.map((o) => o.id));
  a.sent = outcomes.length; a.written = result.written || 0; a.failed = failed.size; a.exhausted = result.exhausted || 0; a.alreadyDone = result.alreadyDone || 0; a.gone = result.gone || 0;
  a.truncated = outcomes.filter((o) => truncated.has(o.id)).length; a.split = outcomes.filter((o) => (o.replies || []).length > 1).length;
  for (const k of FAULT_KEYS) if (result.stats?.[k]) a.faults[k] = result.stats[k];
  a.unverified = result.stats?.unverified || 0;
  const ok = rows.filter((r) => sent.has(r.id) && !failed.has(r.id) && r.hyp_model === version && qsOf(r).length);
  for (const r of ok) {
    const qs = qsOf(r), toks = qs.map(words);
    a.qParas++; a.qCount += qs.length;
    for (let i = 1; i < qs.length; i++) if (toks.slice(0, i).some((t) => jaccard(t, toks[i]) >= DUP_JACCARD)) a.dupQ++;
    if (sampleRate > 0 && rand() < sampleRate) a.sampleIds.push(r.id);
  }
  // language: pooled over the doc (a short question set is too little text for the function-word probe)
  if (ok.length) {
    const pl = langBucket(ok.map((r) => r.text).join(' ')), ql = langBucket(ok.flatMap(qsOf).join(' '));
    if (pl && ql) { a.langChecked = ok.length; if (pl !== ql && !(isArabicScript(pl) && isArabicScript(ql))) a.langBad = ok.length; }
  }
  return a;
}

export function sumAcc(list) {
  const t = newAcc();
  for (const a of list) {
    for (const k of Object.keys(t)) if (typeof t[k] === 'number') t[k] += a[k] || 0;
    for (const [k, v] of Object.entries(a.faults || {})) t.faults[k] = (t.faults[k] || 0) + v;
    t.sampleIds.push(...(a.sampleIds || []));
  }
  return t;
}

const r4 = (n) => Math.round(n * 10000) / 10000;
/** Totals → rates (all 0..1 except questionsPerPara). faultRate = dropped / (dropped + kept) questions; byReason splits it. */
export function rates(a) {
  const dropped = Object.values(a.faults).reduce((n, v) => n + v, 0), asked = dropped + a.qCount, s = a.sent || 0;
  const empty = Math.max(0, s - a.failed - a.alreadyDone - a.gone - a.qParas);
  return { sent: s, questionsPerPara: a.qParas ? r4(a.qCount / a.qParas) : 0, faultRate: asked ? r4(dropped / asked) : 0,
    faultByReason: Object.fromEntries(Object.entries(a.faults).map(([k, v]) => [k, asked ? r4(v / asked) : 0])),
    emptyRate: s ? r4(empty / s) : 0, exhaustedRate: s ? r4(a.exhausted / s) : 0, truncationRate: s ? r4(a.truncated / s) : 0, splitRate: s ? r4(a.split / s) : 0,
    failedRate: s ? r4(a.failed / s) : 0, dupRate: a.qCount ? r4(a.dupQ / a.qCount) : 0, langMismatchRate: a.langChecked ? r4(a.langBad / a.langChecked) : 0 };
}

/** Grade totals → percentages (the score-hype numbers). graded = [{questions:[{searchable,answered,distinct}], missed:[]}] per sampled ¶. */
export function gradeSummary(graded) {
  const g = { paragraphs: graded.length, questions: 0, searchable: 0, answered: 0, distinct: 0, missed: 0 };
  for (const v of graded) { g.missed += (v.missed || []).length; for (const q of v.questions || []) { g.questions++; if (q.searchable) g.searchable++; if (q.answered) g.answered++; if (q.distinct) g.distinct++; } }
  const pct = (n) => (g.questions ? Math.round((1000 * n) / g.questions) / 10 : null);
  return { ...g, searchablePct: pct(g.searchable), answeredPct: pct(g.answered), distinctPct: pct(g.distinct), missedPerParagraph: g.paragraphs ? r4(g.missed / g.paragraphs) : 0 };
}

/** Is this batch worse than the stored baseline by more than the margin? → [{ metric, value, baseline, limit }] (empty = fine, or too small to judge).
 *  Gates only on a real sample (minSample ¶ sent; grades need MIN_GRADED_QUESTIONS). No baseline → nothing to compare (never guessed). */
export function compare(r, baseline, { margin = {}, minSample = DEFAULT_MIN_SAMPLE, grade = null } = {}) {
  if (!baseline || (r.sent || 0) < minSample) return [];
  const m = { ...DEFAULT_MARGIN, ...margin }, out = [];
  for (const k of RATE_KEYS) {
    if (baseline[k] == null) continue;
    const limit = r4(Math.max(baseline[k] * (1 + m.rel), baseline[k] + m.abs));
    if (r[k] > limit) out.push({ metric: k, value: r[k], baseline: baseline[k], limit });
  }
  if (baseline.questionsPerPara != null) { const limit = r4(baseline.questionsPerPara * (1 - m.qpp)); if (r.questionsPerPara < limit) out.push({ metric: 'questionsPerPara', value: r.questionsPerPara, baseline: baseline.questionsPerPara, limit }); }
  if (grade && grade.questions >= MIN_GRADED_QUESTIONS) for (const k of GRADE_KEYS) {
    if (baseline[k] == null || grade[k] == null) continue;
    const limit = baseline[k] - m.gradePts;
    if (grade[k] < limit) out.push({ metric: k, value: grade[k], baseline: baseline[k], limit });
  }
  return out;
}

/** The file store: one directory, atomic JSON writes. */
export function createStore(dir = path.join(process.cwd(), 'data', 'run', 'hype-program')) {
  const f = (n) => path.join(dir, n);
  const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(f(n), 'utf8')); } catch { return d; } };
  const writeJson = (n, v) => { fs.mkdirSync(dir, { recursive: true }); const t = `${f(n)}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f(n)); };
  const ledger = () => { try { return fs.readFileSync(f('ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return {
    dir, ledger,
    /** append one batch entry; a batch id already present is NOT written twice (a re-run collect). → true when written */
    appendLedger(entry) { if (ledger().some((e) => e.id === entry.id)) return false; fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(f('ledger.jsonl'), `${JSON.stringify(entry)}\n`); return true; },
    /** patch one batch entry in place (its quality check arrives a round later). → true when found */
    updateLedger(id, patch) {
      const all = ledger(), i = all.findIndex((e) => e.id === id); if (i < 0) return false;
      all[i] = { ...all[i], ...patch }; fs.mkdirSync(dir, { recursive: true });
      const t = `${f('ledger.jsonl')}.${process.pid}.tmp`; fs.writeFileSync(t, all.map((e) => `${JSON.stringify(e)}\n`).join('')); fs.renameSync(t, f('ledger.jsonl')); return true;
    },
    baselines: () => readJson('baseline.json', {}),
    /** baseline for a tier; falls back to the '*' (all tiers) one */
    baselineFor(tier) { const b = readJson('baseline.json', {}); return b[tier] || b['*'] || null; },
    setBaseline(tier, value) { const b = readJson('baseline.json', {}); b[tier || '*'] = value; writeJson('baseline.json', b); return b; },
    pause: () => readJson('pause.json', null),
    setPause: (p) => writeJson('pause.json', p),
    clearPause() { try { fs.unlinkSync(f('pause.json')); } catch { /* none */ } },
    cursors: () => readJson('cursor.json', {}),
    setCursor(key, c) { const all = readJson('cursor.json', {}); all[key] = c; writeJson('cursor.json', all); },
  };
}
