// entities/reconcile — resolve mention-clusters to entities by EVIDENCE, writing PROPOSED decisions (never
// edits the graph). For each cluster (a name as the disambiguation resolved it) it recalls candidate person
// entities by transliteration-invariant name (candidates only — never determinative), assembles a dossier
// (representative scenes + candidates), and asks a model to adjudicate: link to a candidate | create a new
// entity | uncertain | other-type (place/work/concept…). Name similarity ALONE never links — role/place/era/
// connection must agree. Output is an append-only decision (actor_tier 2, status proposed); high-impact or
// uncertain ones route to human review. Gated on disambiguation.
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const profile = await profileFor(ctx, docId);
  const clusters = await ctx.store.getMentionClusters(docId, { minFreq: opts.minFreq ?? 1, filter: opts.filter, limit: opts.limit });
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const stats = { clusters: clusters.length, adjudicated: 0, failed: 0, escalated: 0, proposed: 0, byKind: {} };

  const decisions = [];
  await pool(opts.concurrency ?? 5, clusters, async (cluster) => {
    const candidates = await ctx.store.findCandidateEntities(cluster.resolvedAs, { type: 'person', limit: 6 });
    const scenes = await ctx.store.getScenes(docId, cluster.paraIds.slice(0, 4));
    const user = buildUser(cluster, candidates, scenes);
    const { parsed, escalated } = await ctx.model.runLadder({ route, system: SYSTEM, user, parse: parseVerdict, maxTokens: 400 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++; if (escalated) stats.escalated++;
    const row = decisionRow(parsed, cluster, candidates);
    stats.byKind[row.kind] = (stats.byKind[row.kind] || 0) + 1;
    decisions.push(row);
  });
  stats.proposed = opts.dryRun ? 0 : await ctx.store.saveDecisions(decisions);
  ctx.log.info?.({ docId, ...stats }, 'entities/reconcile');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const SYSTEM = `You are an entity-resolution adjudicator for a prosopography. Given a MENTION CLUSTER (an entity as the source resolves it, with representative scenes) and CANDIDATE existing PERSON entities (found by transliteration-invariant name recall — CANDIDATES, not matches):
FIRST classify the cluster's TYPE. If it is NOT an individual human — a PLACE (fort, city, house, shrine), a WORK (tablet/book), a CONCEPT/term, a RELIGION or COMMUNITY, a GROUP, an EVENT/upheaval, or a messianic archetype — return {"verdict":"other","type":"place|work|concept|community|group|event","canonical":"<the reference>","entity_id":null,"decisive":"not a person","confidence":1}.
If it IS a person, decide by EVIDENCE:
• "link" — the cluster IS one specific candidate (same person: compatible role, place, era, connections). Give its id.
• "create" — a person NOT among the candidates (or the only name-candidate's evidence contradicts this cluster's role/era). Give canonical = the source's resolved form.
• "uncertain" — evidence insufficient; route to human.
Rules: name similarity ALONE never justifies "link" (namesakes abound); require role/place/era/connection agreement. A descriptor that contradicts a candidate (an "amanuensis" is not a "traditions-scholar") forbids linking. Prefer "create"/"uncertain" over a wrong link (a false merge fabricates a person).
Return ONLY JSON: {"verdict":"link|create|uncertain|other","type":"person|place|work|concept|community|group|event","entity_id":<id or null>,"canonical":"<name or null>","decisive":"<axis that settled it, ≤20 words>","confidence":0.0-1.0}`;

export function parseVerdict(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!['link', 'create', 'uncertain', 'other'].includes(j.verdict)) return null;
    return { verdict: j.verdict, type: j.type || 'person', entityId: j.entity_id ?? null, canonical: j.canonical ?? null, decisive: j.decisive || '', confidence: j.confidence ?? null };
  } catch { return null; }
}

export function buildUser(cluster, candidates, scenes) {
  const sceneBlock = scenes.map((s) => `[${s.pid}] ${String(s.context || '').slice(0, 220)}`).join('\n') || '(no scenes)';
  const candBlock = candidates.map((c) => `  #${c.id} "${c.canonical}" (imp ${c.importance ?? '?'}) — ${String(c.summary || '').slice(0, 90)}`).join('\n') || '  (no name-candidates found)';
  return `MENTION CLUSTER — resolved as: "${cluster.resolvedAs}" (${cluster.freq} mentions)\nSCENES:\n${sceneBlock}\n\nCANDIDATE entities (name-recall only, verify by evidence):\n${candBlock}`;
}

// Map an adjudication verdict to an append-only decision row. entity_id is only carried for a "link".
export function decisionRow(v, cluster, candidates) {
  const kind = v.verdict === 'other' ? 'other-type' : v.verdict; // link | create | uncertain | other-type
  return {
    kind, targetKind: 'mention-cluster',
    targetIds: cluster.paraIds.slice(0, 20),
    payload: { resolvedAs: cluster.resolvedAs, verdict: v.verdict, type: v.type, entityId: v.verdict === 'link' ? v.entityId : null, canonical: v.canonical, freq: cluster.freq },
    evidence: { scenes: cluster.paraIds.slice(0, 6), candidates: candidates.map((c) => c.id) },
    rationale: v.decisive, actor: 'model', actorTier: 2, confidence: v.confidence, status: 'proposed',
  };
}
