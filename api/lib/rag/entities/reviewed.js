// entities/reviewed — record identity verdicts a READER made from the passages (Chad, or a model reading a review page)
// as ordinary decisions: a merge carries its evidence and stays reversible through the decision log; "different"
// becomes a distinct decision so no later judge re-proposes the pair; a record whose name its own passages never
// support is renamed to what the text says. Tier: human = 3 (governs model and rule decisions), model reader = 2.
export const METHOD = 'merge-review-v1';

const tierOf = (reviewer) => (/^human:/.test(reviewer) ? 3 : 2);

/** items: [{ verdict: 'same'|'different'|'rename'|'retire'|'repoint'|'split-mention'|'detach'|'bind', a, b?, into?, name?, reason, reviewer, source? }] → decisions. Pure. */
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
    if (it.verdict === 'repoint') {
      if (!it.docId || !it.handle || !(it.to || String(it.toName || '').trim())) throw new Error(`reviewed ${it.from}: repoint needs docId, handle and to (or toName)`);
      return { kind: 'repoint', targetKind: 'mention-cluster', targetIds: [Number(it.from), ...(it.to ? [Number(it.to)] : [])],
        payload: { docId: Number(it.docId), resolvedAs: it.handle, from: Number(it.from), to: it.to ? Number(it.to) : null, toName: it.toName ?? null, toType: it.toType ?? 'person' },
        evidence, rationale: `split: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    // DETACH: the passage shows a mention is NOT this record's person, but not who it is — unbind it (and its claims)
    // rather than guess; the mention stays, pending identity. Never a deletion.
    if (it.verdict === 'bind') {
      if (!Array.isArray(it.anchors) || !it.anchors.length || !it.to) throw new Error('reviewed: bind needs anchors and to');
      return { kind: 'bind', targetKind: 'mention', targetIds: [Number(it.to)], payload: { anchors: it.anchors.map(String), to: Number(it.to) }, evidence,
        rationale: `bind: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    if (it.verdict === 'detach') {
      if (!Array.isArray(it.anchors) || !it.anchors.length) throw new Error(`reviewed ${it.from}: detach needs anchors`);
      return { kind: 'split-mention', targetKind: 'mention', targetIds: [Number(it.from)],
        payload: { anchors: it.anchors.map(String), from: Number(it.from), to: null, detach: true }, evidence,
        rationale: `not this person: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    if (it.verdict === 'split-mention') {
      if (!Array.isArray(it.anchors) || !it.anchors.length || !(it.to || String(it.toName || '').trim())) throw new Error(`reviewed ${it.from}: split-mention needs anchors and to (or toName)`);
      return { kind: 'split-mention', targetKind: 'mention', targetIds: [Number(it.from), ...(it.to ? [Number(it.to)] : [])],
        payload: { anchors: it.anchors.map(String), from: Number(it.from), to: it.to ? Number(it.to) : null, toName: it.toName ?? null, toType: it.toType ?? 'person' },
        evidence, rationale: `split: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    }
    if (it.verdict === 'retire') return { kind: 'retire', targetKind: 'entity', targetIds: [Number(it.a)], payload: { reason: 'no-passage' }, evidence,
      rationale: `retired: ${it.reason}`.slice(0, 300), actor, actorTier, confidence: null, status: 'applied', methodVersion: METHOD };
    throw new Error(`reviewed ${it.a}: unknown verdict ${it.verdict}`);
  });
}

// Chained verdicts (A≡B, B≡C, or one record judged the same as two others) are ONE person recorded several times:
// applied pair by pair, a later merge could move passages onto a record an earlier one retired. So merges are grouped
// and each group folds into one survivor — the curated record (importance, then mentions). A "different" verdict
// inside a group is a contradiction: that group is refused, never guessed. Pure.
export function planMerges(decisions, dossiers) {
  const par = new Map(), find = (x) => { while (par.has(x) && par.get(x) !== x) x = par.get(x); return x; };
  const merges = decisions.filter((d) => d.kind === 'merge');
  for (const d of merges) { const [a, b] = d.targetIds.map(find); if (a !== b) par.set(a, b); }
  const groups = new Map();
  for (const d of merges) for (const id of d.targetIds) { const r = find(id); groups.set(r, (groups.get(r) || new Set()).add(id)); }
  const rank = (id) => [dossiers.get(id)?.importance ?? -1, dossiers.get(id)?.mentions ?? 0];
  const plans = [...groups.values()].map((g) => {
    const ids = [...g], keep = ids.reduce((a, b) => { const [ia, ma] = rank(a), [ib, mb] = rank(b); return ib > ia || (ib === ia && mb > ma) ? b : a; });
    const own = merges.filter((d) => d.targetIds.some((id) => g.has(id)));
    const conflict = decisions.find((d) => d.kind === 'distinct' && d.targetIds.every((id) => g.has(id)));
    return { keep, fold: ids.filter((id) => id !== keep), decisions: own, ...(conflict ? { conflict: conflict.rationale } : {}) };
  });
  const survivor = new Map(plans.filter((p) => !p.conflict).flatMap((p) => p.fold.map((id) => [id, p.keep])));
  return { plans, survivor };
}

/** Apply reviewed verdicts. DRY unless write. Every record named must be live (a tombstone is never merged or renamed). */
export async function run(ctx, { items, write = false } = {}) {
  const decisions = decisionsFor(items);
  const ids = [...new Set(decisions.flatMap((d) => d.targetIds))];   // a repoint's `from` and existing `to`
  const { dossiers } = await ctx.store.getIdentityDossiers(ids);
  const dead = (d) => d.targetIds.filter((id) => !dossiers.get(id)?.live);
  const { plans, survivor } = planMerges(decisions.filter((d) => d.kind !== 'merge' || !dead(d).length), dossiers);
  const results = [];
  const minted = new Map();   // toName → id: several clusters moving to one NEW person create it once, not once each
  for (const p of plans) {
    const names = [p.keep, ...p.fold].map((id) => dossiers.get(id)?.name ?? null);
    results.push({ kind: 'merge', ids: [p.keep, ...p.fold], names, ...(p.conflict ? { skipped: `contradiction: ${p.conflict}` } : {}), decision: p.decisions[0], rationale: p.decisions.map((d) => d.rationale) });
    if (write && !p.conflict) {
      const d = p.decisions[0];
      await ctx.store.applyMerge(p.keep, p.fold, p.decisions.map((x) => x.rationale).join(' | ').slice(0, 1000),
        { evidence: { ...d.evidence, verdicts: p.decisions.map((x) => ({ ids: x.targetIds, rationale: x.rationale })) }, actor: d.actor, actorTier: Math.max(...p.decisions.map((x) => x.actorTier)), methodVersion: METHOD });
    }
  }
  for (const d of decisions.filter((x) => x.kind !== 'merge')) {
    const targetIds = d.targetIds.map((id) => survivor.get(id) ?? id);   // a verdict about a folded record now concerns its survivor
    const r = { ...d, targetIds, ...(d.kind === 'distinct' ? { payload: { pair: targetIds } } : {}) };
    const gone = targetIds.filter((id) => !dossiers.get(id)?.live);
    const same = d.kind === 'distinct' && targetIds[0] === targetIds[1];
    const res = { kind: d.kind, ids: targetIds, names: targetIds.map((id) => dossiers.get(id)?.name ?? null), decision: r,
      ...(gone.length ? { skipped: `not live: ${gone.join(',')}` } : same ? { skipped: 'contradiction: judged different, but merged' } : {}) };
    results.push(res);
    if (write && !res.skipped) {
      try {   // a store refusal (e.g. a record still anchored by a passage) is that item's outcome, not the batch's end
        if (d.kind === 'rename') await ctx.store.renameEntity(targetIds[0], d.payload.name, r);
        else if (d.kind === 'retire') await ctx.store.retireEntity(targetIds[0], d.payload.reason, r);
        else if (d.kind === 'bind') res.split = await ctx.store.bindMentionAnchors(d.payload.anchors, d.payload.to, r);
        else if (d.kind === 'split-mention') {
          const to = d.payload.detach ? null : d.payload.to ?? await (async () => { if (!minted.has(d.payload.toName)) minted.set(d.payload.toName, await ctx.store.createEntity(d.payload.toName, d.payload.toType)); return minted.get(d.payload.toName); })();
          res.split = await ctx.store.repointMentions(d.payload.anchors, d.payload.from, to, { ...r, payload: { ...d.payload, to } });
          res.to = to;
        } else if (d.kind === 'repoint') {
          const mint = async (name) => { if (!minted.has(name)) minted.set(name, await ctx.store.createEntity(name, d.payload.toType)); return minted.get(name); };
          const to = d.payload.to ?? await mint(d.payload.toName);
          res.split = await ctx.store.repointCluster(d.payload.from, to, d.payload.docId, d.payload.resolvedAs, { ...r, payload: { ...d.payload, to } });
          res.to = to;
        }
        else await ctx.store.saveDecisions([r]);
      } catch (e) { res.skipped = `refused: ${e.message}`; }
    }
  }
  for (const d of decisions.filter((x) => x.kind === 'merge' && dead(x).length)) results.push({ kind: 'merge', ids: d.targetIds, names: d.targetIds.map((id) => dossiers.get(id)?.name ?? null), skipped: `not live: ${dead(d).join(',')}`, decision: d });
  const counts = results.reduce((o, r) => ((o[r.skipped ? 'skipped' : r.kind] = (o[r.skipped ? 'skipped' : r.kind] || 0) + 1), o), {});
  ctx.log.info?.({ items: items.length, counts, write }, 'entities/reviewed');
  return { counts, results };
}
