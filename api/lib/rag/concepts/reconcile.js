// concepts/reconcile — the lexicon is SPENT here (twin of person reconciliation). A symbol/metaphor
// occurrence in a lower text is bound to its authoritative meaning by evidence + authority, proof-gated.
// Literal and metaphorical are kept as SEPARATE attributed layers; under-bind rather than mis-bind (the
// metaphor should have *possible* conceptual power — bind only when the context fits). Emits proposed
// concept decisions (tier 2). Gated on disambiguation.
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';

export const SYSTEM = `You bind a SYMBOL/metaphor occurrence to its authoritative INTERPRETATION. Given a symbol as it appears in a passage (with the passage's context) and CANDIDATE authoritative interpretations from the lexicon (each with its authority + rank), decide by EVIDENCE + AUTHORITY:
• "bind" — the passage's context FITS one candidate interpretation (e.g. an eschatological "clouds" about recognizing a Prophet). Give its lexicon id and the layer: "metaphorical" (the interpretive layer) — the literal reading is always kept separately, never overwritten.
• "under-bind" — the occurrence is LITERAL (a weather cloud, a cloud of witnesses) or the context does not clearly fit any candidate. Do NOT force a binding.
Rules: bind ONLY when the context genuinely fits; higher-authority interpretation governs when several fit; prefer under-bind over a wrong bind. Never overwrite the literal sense — the interpretive layer is ADDED, attributed to its authority.
Return ONLY JSON: {"verdict":"bind|under-bind","lexicon_id":<id or null>,"layer":"literal|metaphorical","decisive":"<=20 words","confidence":0.0-1.0}`;

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const profile = await profileFor(ctx, docId);
  const groups = await ctx.store.getConceptGroups(docId, { limit: opts.limit });
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const stats = { groups: groups.length, adjudicated: 0, failed: 0, proposed: 0, byKind: {} };

  const decisions = [];
  await pool(opts.concurrency ?? 4, groups, async (g) => {
    const candidates = await ctx.store.findLexiconEntries(g.symbol, { limit: 5 });
    if (!candidates.length && !opts.keepUnmatched) return;           // nothing to bind against → skip (under-bind implicitly)
    const { parsed } = await ctx.model.runLadder({ route, system: SYSTEM, user: buildUser(g, candidates), parse: parseConceptVerdict, maxTokens: 400 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++;
    const row = conceptDecisionRow(parsed, g, candidates);
    stats.byKind[row.kind] = (stats.byKind[row.kind] || 0) + 1;
    decisions.push(row);
  });
  stats.proposed = opts.dryRun ? 0 : await ctx.store.saveConceptDecisions(decisions);
  ctx.log.info?.({ docId, ...stats }, 'concepts/reconcile');
  return opts.dryRun ? { ...stats, decisions } : stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseConceptVerdict(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!['bind', 'under-bind'].includes(j.verdict)) return null;
    return { verdict: j.verdict, lexiconId: j.lexicon_id ?? null, layer: j.layer || 'metaphorical', decisive: j.decisive || '', confidence: j.confidence ?? null };
  } catch { return null; }
}

export function conceptDecisionRow(v, group, candidates) {
  const kind = v.verdict === 'bind' ? 'bind' : 'under-bind';
  return {
    kind, targetKind: 'symbol-occurrence',
    targetIds: group.occurrences || [],
    payload: { symbol: group.symbol, verdict: v.verdict, lexiconId: v.verdict === 'bind' ? v.lexiconId : null, layer: v.layer },
    evidence: { paras: group.paraIds || [], candidates: candidates.map((c) => c.id) },
    rationale: v.decisive, actor: 'model', actorTier: 2, confidence: v.confidence, status: 'proposed',
  };
}

export function buildUser(group, candidates) {
  const cand = candidates.map((c) => `  #${c.id} [${c.authority || '?'}, tier ${c.authorityTier ?? '?'}] ${String(c.interpretation).slice(0, 120)}`).join('\n') || '  (no lexicon candidates)';
  return `SYMBOL: "${group.symbol}" (${(group.occurrences || []).length} occurrences)\nPASSAGES: ${(group.paraIds || []).join(', ')}\n\nCANDIDATE authoritative interpretations:\n${cand}\n\nDoes the passage's use of this symbol fit an authoritative interpretation (bind, metaphorical layer), or is it literal / unclear (under-bind)?`;
}
