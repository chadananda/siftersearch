// entities/projection — the entity graph as a REPLAY of the append-only decision log over the mention substrate
// (docs/entity-improvable-architecture.md). A mention's entity = the applied cluster decision for its (document,
// resolved name), carried through every applied merge. Scoped to the mention's OWN document: the adapter's
// bindMentions applies a decision to the name string in every book, which the replay check reports as 'cross-doc'.
// Pure: no ports, no DB. `compare` is the replay check — every divergence from the stored ids, classified.

const num = (x) => (x == null || x === '' ? null : Number(x));
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

// Applied entity-level merges → merged id → { into, decision }. Later decisions win for the same merged id.
function mergeEdges(decisions) {
  const edges = new Map();
  for (const d of decisions.filter((x) => x.kind === 'merge' && x.status === 'applied').sort((a, b) => a.id - b.id)) {
    const p = payloadOf(d);
    const into = num(p.canonical);
    for (const id of (p.merged ?? p.merge ?? []).map(num)) if (id != null && into != null && id !== into) edges.set(id, { into, decision: d.id });
  }
  return edges;
}

function follow(edges, start) {
  const via = [], seen = new Set([start]);
  let cur = start;
  while (edges.has(cur)) {
    const e = edges.get(cur);
    via.push(e.decision);
    if (seen.has(e.into)) return { entity: null, via, cycle: true };
    seen.add(e.into); cur = e.into;
  }
  return { entity: cur, via, cycle: false };
}

// mentions: [{id, docId, resolvedAs}] · decisions: [{id, kind, targetKind, status, supersedes, payload}]
// → Map(mentionId → {base, entity, decision, via:[merge decision ids], pending, cycle})
export function replay({ mentions, decisions }) {
  const states = clusterStates(decisions);
  const edges = mergeEdges(decisions);
  const memo = new Map();
  const out = new Map();
  for (const mn of mentions) {
    const s = states.get(`${num(mn.docId)}\u0001${mn.resolvedAs}`);
    const base = s?.entity ?? null;
    if (base != null && !memo.has(base)) memo.set(base, follow(edges, base));
    const f = base == null ? { entity: null, via: [], cycle: false } : memo.get(base);
    out.set(mn.id, { base, entity: f.entity, decision: s?.decision ?? null, via: f.via, pending: s?.pending ?? null, cycle: f.cycle });
  }
  return out;
}

// The replay check: classify each mention by how the stored entity id relates to the replayed one.
//   match       — same (both null counts)
//   cross-doc   — stored id is what ANOTHER document's decision for the same name projects to (string-wide binding)
//   no-decision — stored id exists but no applied decision explains it (bound by a script/seed; see `basis`)
//   unbound     — the log binds it, the database does not
//   mismatch    — both bound, to different entities, and no other document explains it
export function compare({ mentions, decisions, sampleSize = 12 }) {
  const r = replay({ mentions, decisions });
  const states = clusterStates(decisions);
  const edges = mergeEdges(decisions);
  const byName = new Map();                                  // resolvedAs → Set(projected entity of each doc's decision)
  for (const [key, s] of states) {
    if (s.entity == null) continue;
    const ra = key.split('\u0001')[1];
    (byName.get(ra) || byName.set(ra, new Set()).get(ra)).add(follow(edges, s.entity).entity);
  }
  const counts = {}, samples = {}, noDecisionByBasis = {};
  const note = (cat, row) => { counts[cat] = (counts[cat] || 0) + 1; const s = (samples[cat] ||= []); if (s.length < sampleSize) s.push(row); };
  for (const mn of mentions) {
    const x = r.get(mn.id);
    const db = num(mn.entityId), rep = x.entity;
    const row = { mention: mn.id, doc: num(mn.docId), name: mn.resolvedAs, db, replay: rep, decision: x.decision, via: x.via };
    if (db === rep) note('match', row);
    else if (db == null) note('unbound', row);
    else if (x.decision == null) { note('no-decision', row); noDecisionByBasis[mn.basis ?? 'unknown'] = (noDecisionByBasis[mn.basis ?? 'unknown'] || 0) + 1; }
    else if (byName.get(mn.resolvedAs)?.has(db)) note('cross-doc', row);
    else note('mismatch', row);
  }
  delete samples.match;
  return { total: mentions.length, counts, noDecisionByBasis, samples };
}
