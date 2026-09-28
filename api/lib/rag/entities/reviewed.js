// entities/reviewed — record identity verdicts a READER made from the passages (Chad, or a model reading a review page)
// as ordinary decisions: a merge carries its evidence and stays reversible through the decision log; "different"
// becomes a distinct decision so no later judge re-proposes the pair; a record whose name its own passages never
// support is renamed to what the text says. Tier: human = 3 (governs model and rule decisions), model reader = 2.
export const METHOD = 'merge-review-v1';

const tierOf = (reviewer) => (/^human:/.test(reviewer) ? 3 : 2);

/** items: [{ verdict: 'same'|'different'|'rename', a, b?, into?, name?, reason, reviewer, source? }] → decisions. Pure. */
export function decisionsFor(items) {
  return items.map((it) => {
    const actor = it.reviewer || 'model:reader', actorTier = tierOf(actor);
    const evidence = { method: METHOD, reviewer: actor, source: it.source ?? null };
    if (!it.reason) throw new Error(`reviewed ${it.a}${it.b ? `-${it.b}` : ''}: a verdict needs its reason`);
    if (it.verdict === 'same') {
      const keep = Number(it.into ?? it.b), fold = keep === Number(it.b) ? Number(it.a) : Number(it.b);
      if (![Number(it.a), Number(it.b)].includes(keep)) throw new Error(`reviewed ${it.a}-${it.b}: into must be one of the pair`);
      return { kind: 'merge', targetKind: 'entity', targetIds: [keep, fold], payload: { canonical: keep, merged: [fold] }, evidence,
        rationale: `same person: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    if (it.verdict === 'different') return { kind: 'distinct', targetKind: 'entity', targetIds: [Number(it.a), Number(it.b)], payload: { pair: [Number(it.a), Number(it.b)] },
      evidence, rationale: `different people: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    if (it.verdict === 'rename') {
      if (!String(it.name || '').trim()) throw new Error(`reviewed ${it.a}: rename needs a name`);
      return { kind: 'rename', targetKind: 'entity', targetIds: [Number(it.a)], payload: { name: String(it.name).trim() }, evidence,
        rationale: `renamed: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    throw new Error(`reviewed ${it.a}: unknown verdict ${it.verdict}`);
  });
}

/** Apply reviewed verdicts. DRY unless write. Every record named must be live (a tombstone is never merged or renamed). */
export async function run(ctx, { items, write = false } = {}) {
  const decisions = decisionsFor(items);
  const ids = [...new Set(decisions.flatMap((d) => d.targetIds))];
  const { dossiers } = await ctx.store.getIdentityDossiers(ids);
  const results = decisions.map((d) => {
    const dead = d.targetIds.filter((id) => !dossiers.get(id)?.live);
    return { kind: d.kind, ids: d.targetIds, names: d.targetIds.map((id) => dossiers.get(id)?.name ?? null), ...(dead.length ? { skipped: `not live: ${dead.join(',')}` } : {}), decision: d };
  });
  if (write) {
    for (const r of results.filter((x) => !x.skipped)) {
      const d = r.decision;
      if (d.kind === 'merge') await ctx.store.applyMerge(d.payload.canonical, d.payload.merged, d.rationale, { evidence: d.evidence, actor: d.actor, actorTier: d.actorTier, methodVersion: METHOD });
      else if (d.kind === 'rename') await ctx.store.renameEntity(d.targetIds[0], d.payload.name, d);
      else await ctx.store.saveDecisions([d]);
    }
  }
  const counts = results.reduce((o, r) => ((o[r.skipped ? 'skipped' : r.kind] = (o[r.skipped ? 'skipped' : r.kind] || 0) + 1), o), {});
  ctx.log.info?.({ items: items.length, counts, write }, 'entities/reviewed');
  return { counts, results };
}
