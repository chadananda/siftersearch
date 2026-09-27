// Read-only replay check: rebuild every mention's entity from the decision log (rag/entities/projection.js) and
// classify how the stored entity_mentions_v2.entity_id diverges. planning/work-plan-identity.md increment 1.
// Deps: rag-adapter store (the replay inputs), projection.
import { queryAll } from './db.js';
import { makeStore } from './rag-adapter/store.js';
import { compare } from './rag/entities/projection.js';

export async function identityReplay({ sampleSize = 12 } = {}) {
  const t0 = Date.now();
  const store = makeStore();
  const [mentions, decisions] = await Promise.all([store.getMentionIdentity(), store.getIdentityLog()]);
  const kinds = await queryAll(`SELECT kind, target_kind, status, COUNT(*) n FROM entity_decisions GROUP BY 1,2,3 ORDER BY n DESC`, [], 'replay:kinds');
  return { ms: Date.now() - t0, decisionsRead: decisions.length, logKinds: kinds, ...compare({ mentions, decisions, sampleSize }) };
}
