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
import { verifyLink } from './verify-link.js';

// The adjudicator engine version — a single monotonic integer stamped on every decision this run produces
// (method_version). Bump when the resolution logic improves; a book whose decisions are all < this is "behind"
// and a candidate for a cheap incremental re-adjudication sweep. v2 = EEWA-lite: cluster+candidate facts fed to
// the prompt (P1) + the contradiction verification gate on every LINK (P2). (v1 = the pre-EEWA thin reconcile.)
export const ADJUDICATOR_VERSION = 2;

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.99 });
  const profile = await profileFor(ctx, docId);
  // Three run modes: readjudicate (re-decide ONLY the improvable minority, superseding their old decision) |
  // resume (skip already-decided) | full. readjudicate is the cheap incremental sweep — reuses all prior work.
  let clusters;
  if (opts.readjudicate) {
    const sel = opts.readjudicate === true ? {} : opts.readjudicate;
    clusters = await ctx.store.getReadjudicationClusters(docId, { sinceVersion: sel.sinceVersion ?? ADJUDICATOR_VERSION, ...sel });
  } else {
    clusters = await ctx.store.getMentionClusters(docId, { minFreq: opts.minFreq ?? 1, filter: opts.filter });
    if (opts.resume) {                            // skip clusters that already have a decision (idempotent batches)
      const decided = await ctx.store.getDecidedClusterNames(docId);
      clusters = clusters.filter((c) => !decided.has(c.resolvedAs));
    }
  }
  const allClusters = clusters.length;            // count after mode-filtering → ABSOLUTE progress base
  if (opts.limit) clusters = clusters.slice(0, opts.limit);   // apply the batch cap AFTER resume-filtering
  // ABSOLUTE progress: report against ALL clusters (incl resume-skipped), so a resumed reconcile's bar reflects
  // true book progress (e.g. 1664/6533) rather than the remaining slice (24/4893).
  const progBase = opts.limit ? 0 : allClusters - clusters.length;
  const progTotal = opts.limit ? clusters.length : allClusters;
  const onProgress = opts.onProgress ? (d) => opts.onProgress(progBase + d, progTotal) : undefined;
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
    // EEWA P1 — the evidence that actually settles identity, already in the DB: the cluster's OWN facts (the
    // book's testimony) + each top candidate's fact-profile, so the model compares fact-to-fact, not name-to-name.
    const ownFacts = (await ctx.store.getClusterFacts?.(docId, cluster.resolvedAs, cluster.paraIds)) || [];
    const candFacts = {};
    for (const c of candidates.slice(0, 3)) {
      const f = await ctx.store.getEntityFacts?.(c.id, { limit: 4 });
      if (f?.facts?.length) candFacts[c.id] = f.facts;
    }
    const user = buildUser(cluster, candidates, scenes, evidence, ownFacts, candFacts);
    const { parsed, escalated } = await ctx.model.runLadder({ route, system: SYSTEM, user, parse: parseVerdict, maxTokens: 400 });
    if (!parsed) { stats.failed++; return; }
    stats.adjudicated++; if (escalated) stats.escalated++;
    // EEWA P2 — verification gate: a proposed LINK must survive a contradiction check against the candidate's
    // facts (nisba/era/death/role/kin). A conflict VETOES the link (fabrication guardrail) → downgrade to
    // uncertain with the conflicting axis recorded, rather than merge two different people.
    let verdict = parsed;
    if (parsed.verdict === 'link' && parsed.entityId != null) {
      const cand = candidates.find((c) => c.id === parsed.entityId);
      const v = verifyLink({ name: cluster.resolvedAs, facts: ownFacts }, { name: cand?.canonical || '', facts: candFacts[parsed.entityId] || [], side: cand?.side });
      if (v && v.ok === false) {
        verdict = { ...parsed, verdict: 'uncertain', entityId: null, decisive: `verify-gate veto (${v.axis}): ${v.reason}`.slice(0, 90) };
        stats.vetoed = (stats.vetoed || 0) + 1;
      }
    }
    const row = decisionRow(verdict, cluster, candidates, docId, { methodVersion: ADJUDICATOR_VERSION, supersedes: cluster.priorId ?? null });
    stats.byKind[row.kind] = (stats.byKind[row.kind] || 0) + 1;
    decisions.push(row);
    await flush();                    // checkpoint once the buffer fills
  }, onProgress);
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
Weigh THIS CLUSTER'S OWN FACTS (the book's testimony about it) against each CANDIDATE'S FACTS — fact-to-fact, not name-to-name. LINK only when the cluster's facts are COMPATIBLE with a candidate's; a contradiction on a discriminative axis (different death place/year, incompatible office, conflicting parentage/kin, a different nisba) FORBIDS the link — prefer "create"/"uncertain" over merging two different people.
GROUNDED EVIDENCE, when present, is prior-established fact from COMPLETED higher-authority books and is DECISIVE: if a candidate's grounded facts (birth/death/kin/role/place/connections) match this cluster → "link" that id; if a grounded fact CONTRADICTS a candidate → do NOT link it (create or split). Grounded evidence outranks name overlap and the in-book scenes.
Rules: name similarity ALONE never justifies "link" (namesakes abound); require role/place/era/connection agreement. A descriptor that contradicts a candidate (an "amanuensis" is not a "traditions-scholar") forbids linking. Prefer "create"/"uncertain" over a wrong link (a false merge fabricates a person).
But do NOT over-create — these are false splits:
• A deceased figure referenced in a LATER scene is the SAME person — a date gap between a person's death and a scene that merely MENTIONS them is NOT an era mismatch (e.g. Shaykh Aḥmad-i-Aḥsá'í, d. 1826, cited in an 1852 scene → LINK, not create).
• Minor surface differences (a trailing period, an added descriptor, a parenthetical) are the SAME entity you would resolve the bare name to — link them to that candidate.
• Do NOT invent a "context incompatibility" to justify a create; create ONLY when the core name + role genuinely has no match among the candidates. If a candidate matches the core name and role, LINK.
• RELATIONSHIP and ROLE are identity evidence, not just the name. A reference anchored by its tie to a NAMED person or a specific office — "the maternal uncle of the Báb", "the wife of Vaḥíd", "the governor of Zanján", "Quddús's amanuensis" — points to a REAL individual, and the connection is strong evidence. Use it WITH the scene + grounded evidence to LINK it to the specific person the evidence identifies (among the Báb's several maternal uncles, a scene detail — martyred, at Shíráz — singles out which), so its facts attach to that person instead of being lost. Return "uncertain" for such a reference ONLY when the connection genuinely does not single out one individual.
• A TRULY generic reference — no name, no relationship, no specific role: "a youth", "a neighbour", "a comrade", "two brothers", "a bystander" → "uncertain" (never create). Create ONLY for a real GIVEN NAME (optionally honorific/nisba/place). A bare first name alone with nothing to distinguish it (many share it) → "uncertain".
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

export function buildUser(cluster, candidates, scenes, evidence = [], ownFacts = [], candFacts = {}) {
  const sceneBlock = scenes.map((s) => `[${s.pid}] ${String(s.context || '').slice(0, 220)}`).join('\n') || '(no scenes)';
  const candBlock = candidates.map((c) => `  #${c.id} "${c.canonical}" (imp ${c.importance ?? '?'}) — ${String(c.summary || '').slice(0, 90)}`).join('\n') || '  (no name-candidates found)';
  // The cluster's OWN facts — the book's testimony about this person, the strongest identity evidence.
  const ownBlock = ownFacts.length
    ? `\n\nTHIS CLUSTER'S OWN FACTS (what the book asserts about "${cluster.resolvedAs}"):\n`
      + ownFacts.slice(0, 8).map((f) => `  • ${String(f.statement).slice(0, 140)}${f.when ? ` (${f.when})` : ''}`).join('\n')
    : '';
  // Each candidate's fact-profile — compare fact-to-fact (a contradiction on death/office/kin/nisba forbids a link).
  const candFactBlock = candidates.some((c) => candFacts[c.id]?.length)
    ? '\n\nCANDIDATE FACTS (compare against this cluster fact-to-fact, not name-to-name):\n'
      + candidates.filter((c) => candFacts[c.id]?.length).map((c) =>
        `  #${c.id} "${c.canonical}":\n` + candFacts[c.id].slice(0, 4).map((f) => `      – ${String(f.statement).slice(0, 120)}${f.when ? ` (${f.when})` : ''}`).join('\n')).join('\n')
    : '';
  const evBlock = evidence.length
    ? '\n\nGROUNDED EVIDENCE (facts already established in COMPLETED higher-authority books — decisive for identity):\n'
      + evidence.map((e) => `  →#${e.entityId} "${e.name}": ${String(e.fact || '').slice(0, 140)}${e.source ? ` [${e.source}]` : ''}`).join('\n')
    : '';
  return `MENTION CLUSTER — resolved as: "${cluster.resolvedAs}" (${cluster.freq} mentions)\nSCENES:\n${sceneBlock}\n\nCANDIDATE entities (name-recall only, verify by evidence):\n${candBlock}${candFactBlock}${ownBlock}${evBlock}`;
}

// Map an adjudication verdict to an append-only decision row. entity_id is only carried for a "link".
// meta.methodVersion stamps the adjudicator engine version; meta.supersedes = the prior decision id this one
// replaces (a re-adjudication sweep), so project re-binds and the old row is filtered out (never mutated).
export function decisionRow(v, cluster, candidates, docId, meta = {}) {
  const kind = v.verdict === 'other' ? 'other-type' : v.verdict; // link | create | uncertain | other-type
  return {
    kind, targetKind: 'mention-cluster',
    targetIds: cluster.paraIds.slice(0, 20),
    payload: { resolvedAs: cluster.resolvedAs, verdict: v.verdict, type: v.type, entityId: v.verdict === 'link' ? v.entityId : null, canonical: v.canonical, freq: cluster.freq, docId },
    evidence: { scenes: cluster.paraIds.slice(0, 6), candidates: candidates.map((c) => c.id) },
    rationale: v.decisive, actor: 'model', actorTier: 2, confidence: v.confidence, status: 'proposed',
    methodVersion: meta.methodVersion ?? null, supersedes: meta.supersedes ?? null,
  };
}
