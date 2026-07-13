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
  const toApply = all.filter((d) => kinds.includes(d.kind)
    && (force || d.status !== 'applied')
    && (d.status === 'approved' || d.status === 'applied' || (auto && (d.confidence || 0) >= hiConf)));

  const stats = { proposals: all.length, toApply: toApply.length, applied: 0, created: 0, linked: 0, mentionsBound: 0,
    createdIds: [], uncertain: all.filter((d) => d.kind === 'uncertain').length };
  if (opts.dryRun) return stats;

  for (const d of toApply) {                   // sequential: writes, and a create must resolve its id before binding
    let entityId = d.payload.entityId;
    if (d.kind === 'create') {
      if (!d.payload.canonical) continue;
      entityId = await ctx.store.createEntity(d.payload.canonical, d.payload.type || 'person');
      if (entityId) { stats.created++; stats.createdIds.push(entityId); }   // → dedup-guard checks these for cross-name dups
    } else { stats.linked++; }
    if (!entityId || !d.payload.resolvedAs) continue;
    stats.mentionsBound += await ctx.store.bindMentions(d.payload.resolvedAs, entityId, d.confidence);
    await ctx.store.markDecisionApplied(d.id, entityId);
    stats.applied++;
  }
  ctx.log.info?.(stats, 'entities/project');
  return stats;
}
