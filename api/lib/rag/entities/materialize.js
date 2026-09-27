// entities/materialize — write the projection: set each mention's entity to what the decision log replays to
// (entities/projection.js). The log is the truth; entity_mentions_v2.entity_id is its cache. Diff-only and dry by
// default. Divergences the log cannot explain are RECORDED, not overwritten: a binding with no decision behind it
// becomes a rule decision (tier 1) so the graph keeps it and a later judgement can supersede it. Every divergence
// between two bound entities is returned as a PAIR for evidence reassessment (are they the same person?).
import { divergences } from './projection.js';
import { isAbstention } from './mentions.js';

// Categories the replay corrects (each is a scoping bug, not a judgement — see projection.js), and ones it records.
// HELD by default: a divergence between two BOUND entities (cross-doc, mismatch). Measured 2026-09-27: of 253 such
// pairs nearly all are the same person recorded twice (each book minted its own record; the string-wide bind happened
// to gather mentions on one). Moving them would scatter a person across records — so the pair is adjudicated first
// (same person → an evidence merge, and nothing moves; different → pass `include` to correct).
const CORRECT = new Set(['override-lost', 'cross-doc-unbind', 'unbound']);
// A binding with no decision behind it on an ABSTENTION handle is corrected to none (reconcile never decides those);
// any other undecided binding is recorded.
const correctable = (r) => CORRECT.has(r.category) || (r.category === 'no-decision' && isAbstention(r.name));
const HELD = new Set(['cross-doc', 'mismatch']);
const RECORD = new Set(['no-decision']);
export const METHOD = 'materialize-v1';

// Group recorded divergences into one mention-level decision per (category, entity): the anchors it binds, and why.
export function recordDecisions(rows) {
  const groups = new Map();
  for (const r of rows.filter((x) => RECORD.has(x.category) && x.anchor && !isAbstention(x.name))) {
    const k = `${r.category}\u0001${r.db}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  return [...groups.values()].map((rs) => ({
    kind: 'link', targetKind: 'mention', targetIds: rs.map((r) => r.anchor),
    payload: { entityId: rs[0].db, recorded: rs[0].category, replayWouldBe: [...new Set(rs.map((r) => r.replay))] },
    evidence: { basis: [...new Set(rs.map((r) => r.basis))], names: [...new Set(rs.map((r) => r.name))].slice(0, 5) },
    rationale: `recorded state (${rs[0].category}): this binding predates any decision that explains it — unproven, open to reassessment`,
    actor: 'rule:materialize', actorTier: 1, confidence: null, status: 'applied', methodVersion: METHOD,
  }));
}

// Distinct (stored entity, replayed entity) pairs, with how many mentions and which names — the reassessment queue.
export function reassessPairs(rows) {
  const pairs = new Map();
  for (const r of rows.filter((x) => x.db != null && x.replay != null && (x.category === 'cross-doc' || x.category === 'mismatch'))) {
    const k = `${r.db}\u0001${r.replay}`;
    const p = pairs.get(k) || { db: r.db, replay: r.replay, mentions: 0, docs: new Set(), names: new Set() };
    p.mentions++; p.docs.add(r.doc); p.names.add(r.name);
    pairs.set(k, p);
  }
  return [...pairs.values()].map((p) => ({ ...p, docs: [...p.docs], names: [...p.names].slice(0, 4) })).sort((a, b) => b.mentions - a.mentions);
}

export async function run(ctx, { docId = null, write = false, include = [] } = {}) {
  const [mentions, decisions] = await Promise.all([ctx.store.getMentionIdentity({ docId }), ctx.store.getIdentityLog()]);
  const rows = divergences({ mentions, decisions });
  const fix = new Set([...CORRECT, ...include.filter((c) => HELD.has(c))]);
  const changes = rows.filter((r) => fix.has(r.category) || correctable(r)).map((r) => ({ id: r.mention, from: r.db, to: r.replay, category: r.category }));
  const recorded = recordDecisions(rows);
  const byCategory = rows.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {});
  const held = rows.filter((r) => HELD.has(r.category) && !fix.has(r.category)).length;
  const stats = { docId, mentions: mentions.length, divergent: rows.length, byCategory, changes: changes.length, held, recordedDecisions: recorded.length, written: 0 };
  if (write) {
    if (recorded.length) await ctx.store.saveDecisions(recorded);   // record first: the graph must never lose a binding
    stats.written = changes.length ? await ctx.store.setMentionEntities(changes.map(({ id, to }) => ({ id, entityId: to }))) : 0;
  }
  ctx.log.info?.(stats, 'entities/materialize');
  return { ...stats, changesList: changes, recorded, pairs: reassessPairs(rows) };
}
