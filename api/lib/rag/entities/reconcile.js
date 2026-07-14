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
import { IDENTITY_DOCTRINE } from './evidence-doctrine.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const profile = await profileFor(ctx, docId);
  let clusters = await ctx.store.getMentionClusters(docId, { minFreq: opts.minFreq ?? 1, filter: opts.filter });
  if (opts.resume) {                              // skip clusters that already have a decision (idempotent batches)
    const decided = await ctx.store.getDecidedClusterNames(docId);
    clusters = clusters.filter((c) => !decided.has(c.resolvedAs));
  }
  if (opts.limit) clusters = clusters.slice(0, opts.limit);   // apply the batch cap AFTER resume-filtering
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const stats = { clusters: clusters.length, adjudicated: 0, failed: 0, escalated: 0, proposed: 0, byKind: {} };

  // CHECKPOINT decisions in batches, not one final write: a big book has thousands of clusters (hours of work),
  // and a single end-of-run save loses everything to any interruption (worker restart / kill) — leaving the book
  // stuck at 0 decisions forever. Flushing incrementally makes progress durable + lets `resume` skip what landed.
  const FLUSH = opts.flush ?? 40;
  const decisions = [];               // buffer awaiting write (dryRun keeps all here, writes nothing)
  const flush = async (final = false) => {
    if (opts.dryRun) return;
    if (!decisions.length || (!final && decisions.length < FLUSH)) return;
    const chunk = decisions.splice(0, decisions.length);   // sync splice before await → concurrency-safe
    stats.proposed += await ctx.store.saveDecisions(chunk);
  };
  await pool(opts.concurrency ?? 5, clusters, async (cluster) => {
    const candidates = await ctx.store.findCandidateEntities(cluster.resolvedAs, { type: 'person', limit: 6 });
    const scenes = await ctx.store.getScenes(docId, cluster.paraIds.slice(0, 4));
    // Resolve-against-search: evidence from the grounded corpus (completed, higher-authority books) — this is
    // what makes cumulative ordering meaningful (decide grouping/splitting on real cross-book fact, not name).
    const evidence = (await ctx.store.searchGrounded?.(cluster.resolvedAs, { limit: 6 })) || [];
    const user = buildUser(cluster, candidates, scenes, evidence);
    const { parsed, escalated } = await ctx.model.runLadder({ route, system: SYSTEM, user, parse: parseVerdict, maxTokens: 400 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++; if (escalated) stats.escalated++;
    const row = decisionRow(parsed, cluster, candidates, docId);
    stats.byKind[row.kind] = (stats.byKind[row.kind] || 0) + 1;
    decisions.push(row);
    await flush();                    // checkpoint once the buffer fills
  });
  if (opts.dryRun) { ctx.log.info?.({ docId, ...stats }, 'entities/reconcile'); return { ...stats, proposed: 0, decisions }; }
  await flush(true);                  // final partial batch
  ctx.log.info?.({ docId, ...stats }, 'entities/reconcile');
  return stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const SYSTEM = `${IDENTITY_DOCTRINE}

You are an entity-resolution adjudicator for a prosopography. Given a MENTION CLUSTER (an entity as the source resolves it, with representative scenes) and CANDIDATE existing PERSON entities (found by transliteration-invariant name recall — CANDIDATES, not matches):
FIRST classify the cluster's TYPE. If it is NOT an individual human — a PLACE (fort, city, house, shrine), a WORK (tablet/book), a CONCEPT/term, a RELIGION or COMMUNITY, a GROUP, an EVENT/upheaval, or a messianic archetype — return {"verdict":"other","type":"place|work|concept|community|group|event","canonical":"<the reference>","entity_id":null,"decisive":"not a person","confidence":1}.
If it IS a person, decide by EVIDENCE:
• "link" — the cluster IS one specific candidate (same person: compatible role, place, era, connections). Give its id.
• "create" — a person NOT among the candidates (or the only name-candidate's evidence contradicts this cluster's role/era). Give canonical = the source's resolved form.
• "uncertain" — evidence insufficient; route to human.
GROUNDED EVIDENCE, when present, is prior-established fact from COMPLETED higher-authority books and is DECISIVE: if a candidate's grounded facts (birth/death/kin/role/place/connections) match this cluster → "link" that id; if a grounded fact CONTRADICTS a candidate → do NOT link it (create or split). Grounded evidence outranks name overlap and the in-book scenes.
Rules: name similarity ALONE never justifies "link" (namesakes abound); require role/place/era/connection agreement. A descriptor that contradicts a candidate (an "amanuensis" is not a "traditions-scholar") forbids linking. Prefer "create"/"uncertain" over a wrong link (a false merge fabricates a person).
But do NOT over-create — these are false splits:
• A deceased figure referenced in a LATER scene is the SAME person — a date gap between a person's death and a scene that merely MENTIONS them is NOT an era mismatch (e.g. Shaykh Aḥmad-i-Aḥsá'í, d. 1826, cited in an 1852 scene → LINK, not create).
• Minor surface differences (a trailing period, an added descriptor, a parenthetical) are the SAME entity you would resolve the bare name to — link them to that candidate.
• Do NOT invent a "context incompatibility" to justify a create; create ONLY when the core name + role genuinely has no match among the candidates. If a candidate matches the core name and role, LINK.
• An ANONYMOUS or UNNAMED reference is NOT an entity — "the unnamed owner", "the wife of X", "two brothers", "a youth", "a neighbour", "a comrade" with NO given personal name → return "uncertain" (never create). Create ONLY for a real GIVEN NAME (a personal name, optionally with honorific/nisba/place). A bare first name alone with nothing to distinguish it (many people share it) → "uncertain", not create.
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

export function buildUser(cluster, candidates, scenes, evidence = []) {
  const sceneBlock = scenes.map((s) => `[${s.pid}] ${String(s.context || '').slice(0, 220)}`).join('\n') || '(no scenes)';
  const candBlock = candidates.map((c) => `  #${c.id} "${c.canonical}" (imp ${c.importance ?? '?'}) — ${String(c.summary || '').slice(0, 90)}`).join('\n') || '  (no name-candidates found)';
  const evBlock = evidence.length
    ? '\n\nGROUNDED EVIDENCE (facts already established in COMPLETED higher-authority books — decisive for identity):\n'
      + evidence.map((e) => `  →#${e.entityId} "${e.name}": ${String(e.fact || '').slice(0, 140)}${e.source ? ` [${e.source}]` : ''}`).join('\n')
    : '';
  return `MENTION CLUSTER — resolved as: "${cluster.resolvedAs}" (${cluster.freq} mentions)\nSCENES:\n${sceneBlock}\n\nCANDIDATE entities (name-recall only, verify by evidence):\n${candBlock}${evBlock}`;
}

// Map an adjudication verdict to an append-only decision row. entity_id is only carried for a "link".
export function decisionRow(v, cluster, candidates, docId) {
  const kind = v.verdict === 'other' ? 'other-type' : v.verdict; // link | create | uncertain | other-type
  return {
    kind, targetKind: 'mention-cluster',
    targetIds: cluster.paraIds.slice(0, 20),
    payload: { resolvedAs: cluster.resolvedAs, verdict: v.verdict, type: v.type, entityId: v.verdict === 'link' ? v.entityId : null, canonical: v.canonical, freq: cluster.freq, docId },
    evidence: { scenes: cluster.paraIds.slice(0, 6), candidates: candidates.map((c) => c.id) },
    rationale: v.decisive, actor: 'model', actorTier: 2, confidence: v.confidence, status: 'proposed',
  };
}
