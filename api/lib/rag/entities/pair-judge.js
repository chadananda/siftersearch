// entities/pair-judge — decide whether two person records are ONE individual, on evidence. Two independent judges:
// deterministic SIGNALS (conflict veto via verify-link; ties from shared non-universal companions and named kin) and a
// MODEL reading both dossiers side by side. A merge is applied only when both say SAME; a stated conflict records the
// pair as distinct; every other outcome is PROPOSED for a human with the evidence. Every decision carries its evidence.
// Deps: verify-link (veto), evidence-doctrine (the shared rules), kernel/run (pool).
import { pool } from '../kernel/run.js';
import { IDENTITY_DOCTRINE } from './evidence-doctrine.js';
import { verifyLink, objectOf } from './verify-link.js';

export const METHOD = 'pair-judge-v1';
const KIN = new Set(['son-of', 'daughter-of', 'father-of', 'mother-of', 'wife-of', 'husband-of', 'brother-of', 'sister-of']);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʼʻ'‘’`´]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

// Signals for a pair. `universal` = companion ids too common to tie anyone (the Báb, Bahá'u'lláh …); weight of a shared
// companion falls with how widely it is mentioned (inverse document frequency over the corpus's mentions).
export function signals(A, B, { universal = new Set(), totalMentions = 1 } = {}) {
  const v = verifyLink({ name: A.name, facts: A.claims }, { name: B.name, facts: B.claims });
  const bCo = new Map(B.companions.map((c) => [c.id, c]));
  const shared = A.companions.filter((c) => bCo.has(c.id) && c.id !== A.id && c.id !== B.id && !universal.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, weight: +Math.log(totalMentions / Math.max(1, c.total)).toFixed(2) }))
    .sort((x, y) => y.weight - x.weight);
  const kinOf = (D) => new Map(D.claims.filter((c) => KIN.has(c.relation)).map((c) => [`${c.relation} ${fold(objectOf(c))}`, c]));
  const ka = kinOf(A), kb = kinOf(B);
  const sharedKin = [...ka.keys()].filter((k) => kb.has(k));
  const coOccur = A.companions.find((c) => c.id === B.id)?.n || 0;   // both named in one paragraph as different records
  const docsA = new Set(A.docs.map((d) => d.id));
  return { veto: v.ok ? null : { axis: v.axis, reason: v.reason }, flags: v.flags || [], sharedCompanions: shared.slice(0, 8),
    tie: shared.reduce((a, c) => a + c.weight, 0), sharedKin, coOccur, sharedDocs: B.docs.filter((d) => docsA.has(d.id)).length };
}

// The deterministic judge's own verdict: SAME only on a real tie and no veto; DIFFERENT only on a veto. Two records named
// in the SAME paragraph may be two people (or one person under two handles) — never auto-SAME; a human reads it.
export const ruleVerdict = (s) => (s.veto ? 'different' : s.coOccur ? 'unsure' : (s.sharedKin.length || s.sharedCompanions.length) ? 'same' : 'unsure');

export const SYSTEM = `${IDENTITY_DOCTRINE}

You compare TWO person records from a Bábí/Bahá'í history corpus and decide if they are ONE individual. Each record has its names as the sources resolved them, the books it appears in, its cited claims (with verbatim proof), the people it appears alongside, and sample passages. The SIGNALS were computed deterministically: a veto is a stated exclusive conflict; shared companions exclude universal figures.
Decide "same" only by a Rule-2 tie you can cite from the records; "different" only by a Rule-3 conflict you can cite; otherwise "unsure".
Return ONLY JSON: {"verdict":"same|different|unsure","tie":"<the specific tie or conflict, citing claim ids [c…] or passages [p…]>","confidence":0.0-1.0}`;

const block = (tag, D) => [
  `RECORD ${tag} #${D.id} "${D.name}"${D.importance != null ? ` (importance ${D.importance})` : ''}`,
  `  names as resolved: ${D.names.map((n) => `${n.name} ×${n.n}`).join(' · ')}`,
  `  books: ${D.docs.map((d) => `${d.title} ×${d.n}`).join(' · ')}`,
  `  claims:\n${D.claims.slice(0, 18).map((c) => `    [c${c.id}] ${c.statement}${c.when ? ` (${c.when}${c.basis ? ' ' + c.basis : ''})` : ''} — "${String(c.proof || '').slice(0, 110)}" [${c.doc}]`).join('\n') || '    (none)'}`,
  `  appears with: ${D.companions.slice(0, 12).map((c) => `${c.name} ×${c.n}`).join(' · ') || '(none)'}`,
  `  passages:\n${D.passages.map((p) => `    [p${p.doc}:${p.para}] ${String(p.text).slice(0, 320)}`).join('\n') || '    (none)'}`,
].join('\n');

export function buildUser(A, B, s) {
  const sig = [`veto: ${s.veto ? `${s.veto.axis} — ${s.veto.reason}` : 'none'}`, `flags: ${s.flags.map((f) => f.reason).join('; ') || 'none'}`,
    `shared companions (non-universal): ${s.sharedCompanions.map((c) => c.name).join(', ') || 'none'}`, `shared kin claims: ${s.sharedKin.join('; ') || 'none'}`,
    `named together in one paragraph: ${s.coOccur}×`, `books in common: ${s.sharedDocs}`].join('\n  ');
  return `${block('A', A)}\n\n${block('B', B)}\n\nSIGNALS\n  ${sig}\n\nAre A and B the same individual?`;
}

export function parseVerdict(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const j = JSON.parse(m[0]); return ['same', 'different', 'unsure'].includes(j.verdict) ? { verdict: j.verdict, tie: String(j.tie || ''), confidence: j.confidence ?? null } : null; }
  catch { return null; }
}

// Combine the two judges. merge = both SAME; distinct = a stated veto (the model may add reasons, never override it);
// everything else is proposed for a human with both judgements attached.
export function outcome(rule, model) {
  if (rule === 'different') return 'distinct';
  if (rule === 'same' && model?.verdict === 'same') return 'merge';
  return 'review';
}

// Survivor of a merge: the record with the higher importance, then more mentions (the curated original, not the thin copy).
const survivor = (A, B) => ((B.importance ?? -1) > (A.importance ?? -1) || ((B.importance ?? -1) === (A.importance ?? -1) && B.mentions > A.mentions) ? [B, A] : [A, B]);

export function decisionFor(A, B, s, model, result) {
  const evidence = { method: METHOD, signals: { veto: s.veto, flags: s.flags, sharedCompanions: s.sharedCompanions, sharedKin: s.sharedKin, coOccur: s.coOccur, sharedDocs: s.sharedDocs },
    model: model ? { verdict: model.verdict, tie: model.tie, confidence: model.confidence } : null };
  if (result === 'merge') {
    const [keep, fold] = survivor(A, B);
    return { kind: 'merge', targetKind: 'entity', targetIds: [keep.id, fold.id], payload: { canonical: keep.id, merged: [fold.id] }, evidence,
      rationale: `same person: ${model.tie}`.slice(0, 300), actor: 'model:pair-judge', actorTier: 2, confidence: model.confidence, status: 'applied', methodVersion: METHOD };
  }
  if (result === 'distinct') return { kind: 'distinct', targetKind: 'entity', targetIds: [A.id, B.id], payload: { pair: [A.id, B.id] }, evidence,
    rationale: `different people: ${s.veto.reason}`.slice(0, 300), actor: 'rule:pair-judge', actorTier: 1, confidence: null, status: 'applied', methodVersion: METHOD };
  return { kind: 'merge', targetKind: 'entity', targetIds: [A.id, B.id], payload: { canonical: A.id, merged: [B.id], review: true }, evidence,
    rationale: `needs a human: rule ${ruleVerdict(s)}, model ${model?.verdict ?? 'none'}`, actor: 'model:pair-judge', actorTier: 2, confidence: model?.confidence ?? null, status: 'proposed', methodVersion: METHOD };
}

// pairs: [[a, b], …]. Store supplies dossiers + the universal set; the model judges every pair not vetoed.
export async function run(ctx, { pairs, write = false, concurrency = 4, onProgress } = {}) {
  const ids = [...new Set(pairs.flat())];
  const { dossiers, universal, totalMentions } = await ctx.store.getIdentityDossiers(ids);
  const route = { model: ctx.config.models?.merge, fallback: ctx.config.models?.mergeFallback };
  const results = [];
  await pool(concurrency, pairs, async ([a, b]) => {
    const A = dossiers.get(a), B = dossiers.get(b);
    if (!A || !B || !A.live || !B.live) { results.push({ pair: [a, b], skipped: 'not live' }); return; }
    const s = signals(A, B, { universal, totalMentions });
    const rule = ruleVerdict(s);
    const model = rule === 'different' ? null
      : (await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(A, B, s), parse: parseVerdict, maxTokens: 400 })).parsed;
    const result = outcome(rule, model);
    results.push({ pair: [a, b], names: [A.name, B.name], rule, model, result, decision: decisionFor(A, B, s, model, result) });
  }, onProgress);
  const decisions = results.filter((r) => r.decision).map((r) => r.decision);
  const counts = results.reduce((o, r) => ((o[r.result ?? r.skipped] = (o[r.result ?? r.skipped] || 0) + 1), o), {});
  if (write) {
    const merges = decisions.filter((d) => d.kind === 'merge' && d.status === 'applied');
    for (const d of merges) await ctx.store.applyMerge(d.payload.canonical, d.payload.merged, d.rationale, { evidence: d.evidence, actor: d.actor, methodVersion: METHOD });
    const rest = decisions.filter((d) => !(d.kind === 'merge' && d.status === 'applied'));
    if (rest.length) await ctx.store.saveDecisions(rest);
  }
  ctx.log.info?.({ pairs: pairs.length, counts }, 'entities/pair-judge');
  return { pairs: pairs.length, counts, results };
}
