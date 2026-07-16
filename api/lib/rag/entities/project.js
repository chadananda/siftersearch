// entities/project — materialize entities from the append-only decision log. Applies decisions (a "create"
// mints a new entity; a "link" reuses a candidate) and binds the decision's whole mention-cluster to that
// entity. "uncertain" is NEVER auto-applied. Idempotent: an already-applied decision is skipped (unless
// forced). This is the projection step — the graph is a disposable cache rebuildable from log + mentions.
// A new bare entity is invisible to the live browser until enriched, so creating is additive/safe.
export async function run(ctx, opts = {}) {
  const kinds = opts.kinds ?? ['link', 'create'];
  const auto = opts.auto ?? false;             // also apply high-confidence proposals (not just approved)
  const hiConf = opts.hiConf ?? 0.85;
  const force = opts.force ?? false;           // re-apply already-applied (idempotent overwrite)
  const all = await ctx.store.getProposedDecisions();
  // docId scopes application to ONE book's decisions — the invariant that makes serial grounding actually
  // serial (without it, projecting GPB would also apply every later book's held creates). Omit → apply all.
  const toApply = all.filter((d) => kinds.includes(d.kind)
    && (opts.docId == null || d.payload?.docId === opts.docId)
    && (force || d.status !== 'applied')
    && (d.status === 'approved' || d.status === 'applied' || (auto && (d.confidence || 0) >= hiConf)));

  const stats = { proposals: all.length, toApply: toApply.length, applied: 0, created: 0, reused: 0, linked: 0, mentionsBound: 0,
    unbound: 0, arabicAliases: 0, createdIds: [], skippedBadId: 0, uncertain: all.filter((d) => d.kind === 'uncertain').length };
  if (opts.dryRun) return stats;

  // Re-adjudication PULLBACK: a cluster now 'uncertain' whose superseded decision had BOUND an entity must be
  // UNBOUND — else a vetoed/withdrawn link leaves its mentions stuck on the old entity. Facts are retained
  // (rows survive with entity_id NULL), so the cluster can be re-resolved later. Idempotent (skip already-applied).
  for (const d of all) {
    if (d.kind !== 'uncertain' || !d.priorEntityId || d.status === 'applied') continue;
    if (opts.docId != null && d.payload?.docId !== opts.docId) continue;
    stats.unbound += await ctx.store.unbindMentions(d.payload.resolvedAs);
    await ctx.store.markDecisionApplied(d.id, null);
  }

  for (const d of toApply) {                   // sequential: writes, and a create must resolve its id before binding
    let entityId = d.payload.entityId;
    if (d.kind === 'create') {
      // A re-adjudication that RE-creates reuses the entity its superseded CREATE already minted (never a
      // duplicate). A link→create split does NOT reuse (priorKind was 'link' → that entity is someone else).
      if (d.priorEntityId && d.priorKind === 'create') { entityId = d.priorEntityId; stats.reused++; }
      else {
        if (!d.payload.canonical) continue;
        entityId = await ctx.store.createEntity(d.payload.canonical, d.payload.type || 'person');
        if (entityId) { stats.created++; stats.createdIds.push(entityId); }   // → dedup-guard checks these for cross-name dups
      }
    } else {
      // a link's id must be a real, numeric entity id. Research can emit a name-as-id or null when no candidate
      // id was available — never bind those (a non-scalar id also crashes the writer). Skip, don't apply.
      entityId = Number(entityId);
      if (!Number.isInteger(entityId) || entityId <= 0) { stats.skippedBadId++; continue; }
      stats.linked++;
    }
    if (!entityId || !d.payload.resolvedAs) continue;
    stats.mentionsBound += await ctx.store.bindMentions(d.payload.resolvedAs, entityId, d.confidence);  // re-binds a moved cluster (overwrites by resolved_as)
    // Persian: register the cluster's Arabic-script name as an entity alias (RECALL aid built AFTER this evidence
    // decision) so the same person is recalled — not duplicated — in later Persian books. No-op for non-Persian.
    stats.arabicAliases += (await ctx.store.registerArabicAliases?.(entityId, d.payload.resolvedAs)) || 0;
    await ctx.store.markDecisionApplied(d.id, entityId);
    stats.applied++;
  }
  ctx.log.info?.(stats, 'entities/project');
  return stats;
}
