// jev-calls-repo — the Jev DECISION BANK: reads/labels the System-1 call log (calls.db, written by systemone.js) so one gate
// (task) can be studied alone: every call's state + questions + answers + the turn it belonged to. Server processes only.
// Answers are {question: {choice, confidence, distribution} | {noul}}; gold is {question: choice}. Deps: systemone (callsDb).
import { callsDb } from '../systemone.js';

const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
/** {question: choice} from a Jev answers object (a noul question reads as yes/no). Pure. */
export const chosenOf = (answers) => Object.fromEntries(Object.entries(answers || {}).map(([q, a]) => [q, a?.choice ?? (typeof a?.noul === 'number' ? (a.noul >= 0.5 ? 'yes' : 'no') : null)]));
/** Gold (map, or a bare string for a one-question call) → map. Pure. */
export const goldMap = (gold, questions) => (gold && typeof gold === 'object' ? gold : gold != null && Object.keys(questions || {}).length === 1 ? { [Object.keys(questions)[0]]: gold } : null);
/** true/false: do the answers agree with every gold question? null when there is no gold. Pure. */
export function matchesGold(answers, gold, questions) {
  const g = goldMap(gold, questions);
  if (!g || !Object.keys(g).length) return null;
  const c = chosenOf(answers);
  return Object.entries(g).every(([q, v]) => c[q] === v);
}
const shape = (r) => {
  const questions = parse(r.questions), jev = parse(r.jev), gold = parse(r.gold);
  return { id: r.id, task: r.task, at: r.at, ref: r.ref, state: r.state, questions, answers: jev, chosen: chosenOf(jev), gold, gold_basis: r.gold_basis,
    correct: matchesGold(jev, gold, questions), tokens: r.jev_tokens, ms: r.jev_ms, model: r.jev_model, served_by: r.served_by };
};

/** Per gate over the last `days`: calls, answer distribution, gold coverage + accuracy, tokens/ms, shadow agreement. */
export function gateStats({ days = 7, maxRows = 300000 } = {}) {
  const db = callsDb(), since = Date.now() - days * 86400000, gates = {};
  const g = (t) => (gates[t] ||= { task: t, calls: 0, tokens: 0, ms: 0, answers: {}, gold: 0, gold_right: 0, shadow: {} });
  for (const r of db.prepare('SELECT task, jev, jev_tokens, jev_ms, gold, questions FROM calls WHERE at >= ? ORDER BY at DESC LIMIT ?').iterate(since, maxRows)) {
    const x = g(r.task); x.calls++; x.tokens += r.jev_tokens || 0; x.ms += r.jev_ms || 0;
    const ans = parse(r.jev);
    for (const [q, c] of Object.entries(chosenOf(ans))) { const d = (x.answers[q] ||= {}); d[c ?? 'null'] = (d[c ?? 'null'] || 0) + 1; }
    if (r.gold) { const ok = matchesGold(ans, parse(r.gold), parse(r.questions)); if (ok != null) { x.gold++; if (ok) x.gold_right++; } }
  }
  for (const r of db.prepare(`SELECT c.task, s.backend, c.jev, s.answers FROM shadow s JOIN calls c ON c.id = s.call_id WHERE c.at >= ? AND s.answers IS NOT NULL AND c.jev IS NOT NULL LIMIT ?`).iterate(since, maxRows)) {
    const a = chosenOf(parse(r.jev)), b = chosenOf(parse(r.answers)), s = (g(r.task).shadow[r.backend] ||= { n: 0, agree: 0 });
    s.n++; if (Object.keys(a).every((q) => a[q] === b[q])) s.agree++;
  }
  return Object.values(gates).sort((a, b) => b.calls - a.calls).map((x) => ({ task: x.task, calls: x.calls, avg_tokens: x.calls ? Math.round(x.tokens / x.calls) : 0, avg_ms: x.calls ? Math.round(x.ms / x.calls) : 0,
    answers: x.answers, gold: x.gold, gold_coverage: x.calls ? +(x.gold / x.calls).toFixed(3) : 0, accuracy: x.gold ? +(x.gold_right / x.gold).toFixed(3) : null,
    shadow_agreement: Object.fromEntries(Object.entries(x.shadow).map(([b, s]) => [b, { n: s.n, agree: +(s.agree / s.n).toFixed(3) }])) }));
}

/** Calls of one gate, newest first. gold: 'any'|'none'|'right'|'wrong'; chosen: a choice any question answered (with q: that question). */
export function listCalls({ task, chosen = null, q = null, gold = null, since = 0, ref = null, limit = 50, maxScan = 100000, id = null } = {}) {
  const where = [], args = [];
  if (task) { where.push('task = ?'); args.push(task); }
  if (since) { where.push('at >= ?'); args.push(Number(since)); }
  if (ref) { where.push('ref = ?'); args.push(String(ref)); }
  if (id) { where.push('id = ?'); args.push(Number(id)); }
  if (gold === 'any' || gold === 'right' || gold === 'wrong') where.push('gold IS NOT NULL'); else if (gold === 'none') where.push('gold IS NULL');
  const out = [], cap = Math.min(Math.max(1, Number(limit) || 50), 1000);
  for (const r of callsDb().prepare(`SELECT * FROM calls ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC LIMIT ?`).iterate(...args, maxScan)) {
    const c = shape(r);
    if (chosen != null && !(q ? c.chosen[q] === chosen : Object.values(c.chosen).includes(chosen))) continue;
    if (gold === 'right' && c.correct !== true) continue;
    if (gold === 'wrong' && c.correct !== false) continue;
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

/** A random sample of the labelled (or any) bank for one gate — the experiment's input. Per gate, never per question. */
export function sampleBank(task, { n = 200, gold = 'labelled', since = 0, chosen = null, q = null } = {}) {
  const want = Math.min(Number(n) || 200, 2000), where = ['task = ?', 'jev IS NOT NULL'], args = [task];
  if (gold !== 'any') where.push('gold IS NOT NULL');
  if (since) { where.push('at >= ?'); args.push(Number(since)); }
  const rows = callsDb().prepare(`SELECT * FROM calls WHERE ${where.join(' AND ')} ORDER BY RANDOM() LIMIT ?`).all(...args, want * (chosen ? 5 : 1)).map(shape);
  return (chosen ? rows.filter((c) => (q ? c.chosen[q] === chosen : Object.values(c.chosen).includes(chosen))) : rows).slice(0, want);
}

/** Label one call by id. gold = {question: choice}; a one-question call needs no q. → { ok, gold } | { ok:false, error } */
export function labelCall(id, answer, { q = null, basis = 'manual' } = {}) {
  const db = callsDb(), row = db.prepare('SELECT id, questions, gold FROM calls WHERE id = ?').get(Number(id));
  if (!row) return { ok: false, error: 'no such call' };
  const questions = parse(row.questions) || {}, names = Object.keys(questions);
  const question = q || (names.length === 1 ? names[0] : null);
  if (!question || !questions[question]) return { ok: false, error: `name the question with q= (one of: ${names.join(', ')})` };
  const options = Object.keys(questions[question].criteria || {});
  if (options.length && !options.includes(answer)) return { ok: false, error: `"${answer}" is not an option of ${question} (${options.join(', ')})` };
  const gold = { ...(goldMap(parse(row.gold), questions) || {}), [question]: answer };
  db.prepare('UPDATE calls SET gold = ?, gold_basis = ? WHERE id = ?').run(JSON.stringify(gold), basis, row.id);
  return { ok: true, gold };
}

/** An automatic label's basis (the judge's): such gold may be relabelled by a later judge; any other basis is HUMAN gold. Pure. */
export const isAutoBasis = (basis) => basis == null || /^opus-|judge/.test(String(basis));
/** Label every call of `task` made in turn `ref` with the right choice, on the one question that offers it. A call that already
 *  holds HUMAN gold (a basis other than a judge's) is never overwritten. → calls labelled */
export function labelByRef(task, ref, right, basis = 'opus-judge') {
  let n = 0;
  for (const r of callsDb().prepare('SELECT id, questions, gold, gold_basis FROM calls WHERE task = ? AND ref = ?').all(task, String(ref))) {
    if (r.gold != null && !isAutoBasis(r.gold_basis)) continue;
    const qs = Object.entries(parse(r.questions) || {}).filter(([, d]) => Object.keys(d?.criteria || {}).includes(right));
    if (qs.length === 1 && labelCall(r.id, right, { q: qs[0][0], basis }).ok) n++;   // ambiguous or not an option here → no guess
  }
  return n;
}
