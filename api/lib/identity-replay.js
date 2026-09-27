// Read-only replay check: rebuild every mention's entity from the decision log (rag/entities/projection.js) and
// classify how the stored entity_mentions_v2.entity_id diverges. Increment 1 of planning/work-plan-identity.md —
// proves (or disproves) that the graph is reproducible from the log before anything is switched to projection.
// Deps: db, projection.
import { queryAll } from './db.js';
import { compare } from './rag/entities/projection.js';

export async function identityReplay({ sampleSize = 12 } = {}) {
  const t0 = Date.now();
  const mentions = (await queryAll(`SELECT id, doc_id, resolved_as, entity_id, resolution_basis, method_version FROM entity_mentions_v2`, [], 'replay:mentions'))
    .map((r) => ({ id: r.id, docId: r.doc_id, resolvedAs: r.resolved_as, entityId: r.entity_id, basis: r.resolution_basis || r.method_version || 'unknown' }));
  const decisions = (await queryAll(`SELECT id, kind, target_kind, status, supersedes, payload FROM entity_decisions
      WHERE target_kind='mention-cluster' OR kind='merge'`, [], 'replay:decisions'))
    .map((r) => ({ id: r.id, kind: r.kind, targetKind: r.target_kind, status: r.status, supersedes: r.supersedes, payload: r.payload }));
  const kinds = await queryAll(`SELECT kind, target_kind, status, COUNT(*) n FROM entity_decisions GROUP BY 1,2,3 ORDER BY n DESC`, [], 'replay:kinds');
  const result = compare({ mentions, decisions, sampleSize });
  return { ms: Date.now() - t0, decisionsRead: decisions.length, logKinds: kinds, ...result };
}
