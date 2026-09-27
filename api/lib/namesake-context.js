// Read-only research: do same-name person records separate by CONTEXT? Tests the hypothesis "records whose mentions
// share no document / period / companions are presumptively distinct". Per pair: shared documents, overlap of
// claim years, shared co-mentioned people (relational evidence, Bhattacharya–Getoor). Also audits past merges.
// Deps: db, rag-adapter store (grouping), entity-live.
import { queryAll } from './db.js';
import { LIVE_SQL } from './entity-live.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const coreKey = (s) => norm(String(s || '').replace(/\([^)]*\)/g, ' ').split(/[,;—]/)[0]).replace(/^(the|a) /, '');
const inList = (ids) => ids.map(() => '?').join(',');

async function profiles(ids) {
  const P = new Map(ids.map((id) => [id, { docs: new Map(), years: [], co: new Map() }]));
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const ph = inList(chunk);
    for (const r of await queryAll(`SELECT entity_id e, doc_id d, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY 1,2`, chunk, 'namesake:docs'))
      P.get(r.e).docs.set(r.d, r.n);
    for (const r of await queryAll(`SELECT entity_id e, CAST(time_value AS INTEGER) y FROM entity_claims WHERE entity_id IN (${ph}) AND time_value GLOB '1[6789][0-9][0-9]'`, chunk, 'namesake:years'))
      P.get(r.e).years.push(r.y);
    for (const r of await queryAll(`SELECT a.entity_id e, b.entity_id o, COUNT(*) n FROM entity_mentions_v2 a
        JOIN entity_mentions_v2 b ON b.doc_id=a.doc_id AND b.para_id=a.para_id AND b.entity_id IS NOT NULL AND b.entity_id!=a.entity_id
        WHERE a.entity_id IN (${ph}) GROUP BY 1,2`, chunk, 'namesake:co'))
      P.get(r.e).co.set(r.o, r.n);
  }
  return P;
}

const span = (ys) => (ys.length ? [Math.min(...ys), Math.max(...ys)] : null);

export function comparePair(A, B, { exclude = new Set() } = {}) {
  const docsShared = [...A.docs.keys()].filter((d) => B.docs.has(d)).length;
  const sa = span(A.years), sb = span(B.years);
  const yearsOverlap = sa && sb ? !(sa[1] + 10 < sb[0] || sb[1] + 10 < sa[0]) : null;   // ±10y tolerance; null = no dated claims
  const coShared = [...A.co.keys()].filter((o) => B.co.has(o) && !exclude.has(o)).length;
  return { docsShared, yearsOverlap, coShared, aDocs: A.docs.size, bDocs: B.docs.size, aCo: A.co.size, bCo: B.co.size };
}

// pairs: [[a,b],…] explicit; otherwise the largest same-core-name groups (all members, no maxSize truncation).
export async function namesakeContext({ pairs = null, groups = 25, minMentions = 3 } = {}) {
  let work;
  if (pairs?.length) {
    work = [{ key: 'explicit', pairs }];
  } else {
    const ents = await queryAll(`SELECT ge.id, ge.canonical_name c, (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) n
      FROM graph_entities ge WHERE ge.entity_type='person' AND ${LIVE_SQL('ge.')}`, [], 'namesake:ents');
    const g = new Map();
    for (const e of ents) { if (e.n < minMentions) continue; const k = coreKey(e.c); if (k) (g.get(k) || g.set(k, []).get(k)).push(e); }
    work = [...g.entries()].filter(([, es]) => es.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, groups)
      .map(([key, es]) => ({ key, members: es.map((e) => ({ id: e.id, name: e.c, mentions: e.n })),
        pairs: es.flatMap((x, i) => es.slice(i + 1).map((y) => [x.id, y.id])) }));
  }
  const ids = [...new Set(work.flatMap((w) => w.pairs.flat()))];
  const P = await profiles(ids);
  // A co-mention of a group member is not evidence (namesakes co-occur with each other); ubiquitous figures
  // (the Báb, Bahá'u'lláh…) co-occur with everyone, so companions shared only through them are discounted.
  const ubiquity = new Map();
  for (const p of P.values()) for (const o of p.co.keys()) ubiquity.set(o, (ubiquity.get(o) || 0) + 1);
  const common = new Set([...ubiquity.entries()].filter(([, n]) => n > Math.max(5, ids.length * 0.25)).map(([o]) => o));
  const out = work.map((w) => {
    const members = new Set(w.pairs.flat());
    const exclude = new Set([...members, ...common]);
    const rows = w.pairs.map(([a, b]) => ({ a, b, ...comparePair(P.get(a), P.get(b), { exclude }) }));
    const n = rows.length || 1;
    return { key: w.key, members: w.members, pairs: rows.length,
      disjointDocs: rows.filter((r) => !r.docsShared).length / n,
      disjointCompanions: rows.filter((r) => !r.coShared).length / n,
      disjointBoth: rows.filter((r) => !r.docsShared && !r.coShared).length / n,
      yearsDisjoint: rows.filter((r) => r.yearsOverlap === false).length / n,
      rows: w.pairs.length <= 200 ? rows : undefined };
  });
  return { commonCompanionsExcluded: common.size, groups: out };
}

// How many merges ran, by whom, and with what recorded rationale.
export async function mergeAudit() {
  const byActor = await queryAll(`SELECT actor, actor_tier, status, date(decided_at,'unixepoch') day, COUNT(*) n,
      SUM(json_array_length(target_ids)) ids FROM entity_decisions WHERE kind='merge' GROUP BY 1,2,3,4 ORDER BY day`, [], 'namesake:audit');
  const sample = await queryAll(`SELECT id, target_ids, rationale FROM entity_decisions WHERE kind='merge' ORDER BY id DESC LIMIT 15`, [], 'namesake:sample');
  return { byActor, sample, ...(await reconstructability()) };
}

// Can the pre-merge entities be rebuilt from the log? A merged id is recoverable when a create/link decision recorded
// it as applied_entity_id (its mention cluster = payload.docId + payload.resolvedAs). Also: bindMentions binds by
// resolved_as across ALL documents, so one resolved_as decided differently in two books is a cross-book collision.
async function reconstructability() {
  const merged = await queryAll(`SELECT DISTINCT CAST(j.value AS INTEGER) id FROM entity_decisions d, json_each(d.target_ids) j
    WHERE d.kind='merge' AND d.status='applied'`, [], 'namesake:merged');
  const applied = await queryAll(`SELECT kind, json_extract(payload,'$.applied_entity_id') eid, json_extract(payload,'$.docId') doc,
      json_extract(payload,'$.resolvedAs') ra FROM entity_decisions WHERE kind IN ('create','link') AND status='applied'`, [], 'namesake:applied');
  const byEid = new Map();
  for (const a of applied) if (a.eid != null) (byEid.get(Number(a.eid)) || byEid.set(Number(a.eid), []).get(Number(a.eid))).push(a);
  const recoverable = merged.filter((m) => byEid.has(m.id)).length;
  const byRa = new Map();
  for (const a of applied) if (a.ra) (byRa.get(a.ra) || byRa.set(a.ra, new Map()).get(a.ra)).set(String(a.doc), Number(a.eid));
  const collisions = [...byRa.entries()].filter(([, m]) => new Set(m.values()).size > 1);
  const mentionsOnCollided = collisions.length ? (await queryAll(`SELECT COUNT(*) n FROM entity_mentions_v2 WHERE resolved_as IN (${inList(collisions.slice(0, 900))})`,
    collisions.slice(0, 900).map(([ra]) => ra), 'namesake:coll'))[0].n : 0;
  const mentionTotals = (await queryAll(`SELECT COUNT(*) n, SUM(entity_id IS NOT NULL) bound FROM entity_mentions_v2`, [], 'namesake:mt'))[0];
  return { reconstruct: { mergedIds: merged.length, recoverableFromLog: recoverable, appliedDecisions: applied.length,
    resolvedAsDecidedInSeveralDocs: [...byRa.values()].filter((m) => m.size > 1).length,
    crossDocCollisions: collisions.length, mentionsOnFirst900Collisions: mentionsOnCollided, mentionTotals,
    collisionSample: collisions.slice(0, 12).map(([ra, m]) => ({ ra, docs: Object.fromEntries(m) })) } };
}
