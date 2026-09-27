// entities/projection — the entity graph as a REPLAY of the append-only decision log over the mention substrate
// (docs/entity-improvable-architecture.md). A mention's entity = the applied cluster decision for its (document,
// resolved name), carried through every applied merge. Scoped to the mention's OWN document: the adapter's
// bindMentions applies a decision to the name string in every book, which the replay check reports as 'cross-doc'.
// Pure: no ports, no DB. `compare` is the replay check — every divergence from the stored ids, classified.

const num = (x) => { const n = x == null || x === '' ? NaN : Number(x); return Number.isFinite(n) ? n : null; };
const payloadOf = (d) => (typeof d.payload === 'string' ? JSON.parse(d.payload || '{}') : (d.payload || {}));

// Cluster state per (doc, resolvedAs): walk that key's decisions in id order, as project applied them. An applied
// link/create binds; an applied uncertain withdraws (the re-adjudication pullback); a superseded decision is skipped.
// `pending` = a later decision that has not been applied (what the log proposes but the graph does not show).
function clusterStates(decisions) {
  const rows = decisions.filter((d) => d.targetKind === 'mention-cluster').sort((a, b) => a.id - b.id);
  const superseded = new Set(rows.map((d) => d.supersedes).filter((x) => x != null));
  const states = new Map();
  for (const d of rows) {
    const p = payloadOf(d);
    const key = `${num(p.docId ?? p.doc_id)}\u0001${p.resolvedAs ?? p.resolved_as}`;
    const s = states.get(key) || { entity: null, decision: null, pending: null };
    if (d.status !== 'applied') { if (!superseded.has(d.id)) s.pending = d.id; states.set(key, s); continue; }
    if (superseded.has(d.id) && s.decision != null) { states.set(key, s); continue; }
    if (d.kind === 'link' || d.kind === 'create') { s.entity = num(p.applied_entity_id ?? p.entityId ?? p.entity_id); s.decision = d.id; }
    else if (d.kind === 'uncertain') { s.entity = null; s.decision = d.id; }
    if (s.pending != null && s.pending < d.id) s.pending = null;
    states.set(key, s);
  }
  return states;
}

// Applied entity-level merges, replayed in order as UNIONS of clusters: a merge joins the merged record's current
// cluster to the canonical's current cluster, the canonical's survivor surviving. Replaying "A into B" then "B into A"
// (the per-book global merge ping-ponged) therefore keeps one survivor and can never form a cycle.
// → Map(record id → { into, decision }) — each record's parent, with the decision that set it.
function mergeEdges(decisions) {
  const edges = new Map();
  const find = (x) => { while (edges.has(x)) x = edges.get(x).into; return x; };
  for (const d of decisions.filter((x) => x.kind === 'merge' && x.status === 'applied').sort((a, b) => a.id - b.id)) {
    const p = payloadOf(d);
    const into = num(p.canonical);
    if (into == null) continue;
    for (const id of (p.merged ?? p.merge ?? []).map(num)) {
      if (id == null) continue;
      const root = find(id), target = find(into);
      if (root !== target) edges.set(root, { into: target, decision: d.id });
    }
  }
  return edges;
}

function follow(edges, start) {
  const via = [];
  let cur = start;
  while (edges.has(cur)) { const e = edges.get(cur); via.push(e.decision); cur = e.into; }
  return { entity: cur, via };
}

// Applied mention-level decisions (split / link on target_kind 'mention'): mention id → { entity, decision }. More
// specific than a cluster decision, so they override it; the latest decision per mention wins.
function mentionOverrides(decisions) {
  const out = new Map();
  for (const d of decisions.filter((x) => x.targetKind === 'mention' && x.status === 'applied').sort((a, b) => a.id - b.id)) {
    const p = payloadOf(d);
    const ids = typeof d.targetIds === 'string' ? JSON.parse(d.targetIds || '[]') : (d.targetIds || []);
    const entity = d.kind === 'split' ? num(p.to) : num(p.entityId ?? p.entity_id ?? p.to);
    for (const id of ids.map(num)) if (id != null) out.set(id, { entity, decision: d.id });
  }
  return out;
}

// mentions: [{id, docId, resolvedAs}] · decisions: [{id, kind, targetKind, status, supersedes, payload}]
// → Map(mentionId → {base, entity, decision, via:[merge decision ids], pending})
export function replay({ mentions, decisions }) {
  const states = clusterStates(decisions);
  const edges = mergeEdges(decisions);
  const overrides = mentionOverrides(decisions);
  const memo = new Map();
  const out = new Map();
  for (const mn of mentions) {
    const o = overrides.get(num(mn.id));
    const s = o ? { entity: o.entity, decision: o.decision, pending: null } : states.get(`${num(mn.docId)}\u0001${mn.resolvedAs}`);
    const base = s?.entity ?? null;
    if (base != null && !memo.has(base)) memo.set(base, follow(edges, base));
    const f = base == null ? { entity: null, via: [] } : memo.get(base);
    out.set(mn.id, { base, entity: f.entity, decision: s?.decision ?? null, via: f.via, pending: s?.pending ?? null });
  }
  return out;
}

// The replay check: classify each mention by how the stored entity id relates to the replayed one.
//   match          — same (both null counts)
//   representative — same merged cluster, a different surviving id (the log's merge order vs a data-side repair)
//   override-lost  — a mention-level split/link says otherwise; the DB still holds the cluster's entity (re-bind overwrote it)
//   cross-doc      — stored id is what ANOTHER document's decision for the same name projects to (string-wide binding)
//   cross-doc-unbind — the log binds it; the DB was unbound by a re-adjudication elsewhere (string-wide unbind)
//   no-decision    — stored id exists but no applied decision explains it (bound by a script/seed; see `basis`)
//   unbound        — the log binds it, the database does not
//   mismatch       — both bound, to different clusters, and no other document explains it
export function compare({ mentions, decisions, sampleSize = 12 }) {
  const r = replay({ mentions, decisions });
  const states = clusterStates(decisions);
  const edges = mergeEdges(decisions);
  const root = (id) => follow(edges, id).entity;
  const byName = new Map();                                  // resolvedAs → Map(doc → projected entity of that doc's decision)
  for (const [key, s] of states) {
    if (s.entity == null) continue;
    const [doc, ra] = key.split('\u0001');
    (byName.get(ra) || byName.set(ra, new Map()).get(ra)).set(Number(doc), root(s.entity));
  }
  const otherDocHas = (mn, id) => [...(byName.get(mn.resolvedAs) || new Map())].some(([doc, e]) => doc !== num(mn.docId) && e === id);
  const counts = {}, samples = {}, noDecisionByBasis = {}, unboundByBasis = {};
  const note = (cat, row) => { counts[cat] = (counts[cat] || 0) + 1; const s = (samples[cat] ||= []); if (s.length < sampleSize) s.push(row); };
  for (const mn of mentions) {
    const x = r.get(mn.id);
    const db = num(mn.entityId), rep = x.entity;
    const row = { mention: mn.id, doc: num(mn.docId), name: mn.resolvedAs, db, replay: rep, decision: x.decision, via: x.via, basis: mn.basis };
    const own = byName.get(mn.resolvedAs)?.get(num(mn.docId)) ?? null;
    if (db === rep) note('match', row);
    else if (db == null) {
      const cat = mn.basis === 'reconcile-unbind' ? 'cross-doc-unbind' : 'unbound';
      note(cat, row); unboundByBasis[mn.basis ?? 'unknown'] = (unboundByBasis[mn.basis ?? 'unknown'] || 0) + 1;
    }
    else if (rep != null && root(db) === rep) note('representative', row);
    else if (x.decision != null && own != null && root(db) === own && rep !== own) note('override-lost', row);
    else if (otherDocHas(mn, root(db))) note('cross-doc', row);
    else if (x.decision == null) { note('no-decision', row); noDecisionByBasis[mn.basis ?? 'unknown'] = (noDecisionByBasis[mn.basis ?? 'unknown'] || 0) + 1; }
    else note('mismatch', row);
  }
  delete samples.match;
  return { total: mentions.length, counts, noDecisionByBasis, unboundByBasis, samples };
}
