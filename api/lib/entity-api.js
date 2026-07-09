// Entity API — the shared TOOL layer over the new evidence-reconciled substrate (entity_claims + entity_mentions_v2 +
// deduped graph_entities). Consumed by BOTH the biography browser routes and the general search / Jafar chat tools.
// Reads cited claims (proof-gated, temporal) + occurrences; legacy entity_research only supplies enrichment (summary,
// aliases) the new pipeline doesn't produce yet. Merged-duplicate entities (last_assessed_version LIKE 'merged-into-%')
// are excluded everywhere.
import { queryOne, queryAll } from './db.js';
import { skeletonKeys } from './translit-key.js';

const SRC = { 21310: ['god-passes-by_shoghi-effendi', 'GPB'], 57347: ['god-passes-by_shoghi-effendi', 'GPB'], 21308: ['dawn-breakers_nabil', 'DB'] };
const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const isMerged = (lav) => /^merged-into-/.test(String(lav || ''));

// entity_lookup(name) — fast transliteration-invariant candidate recall (RECALL only; bind by evidence).
export async function entityLookup(q, { type = null, limit = 20 } = {}) {
  const keys = [...skeletonKeys(q || '')];
  if (!q || !keys.length) return [];
  const rows = await queryAll(
    `SELECT lk.entity_id id, ge.canonical_name name, ge.entity_type type, ge.importance importance,
            COUNT(DISTINCT lk.skeleton_key) shared, MAX(lk.is_canonical) canon
       FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')})${type ? ' AND ge.entity_type=?' : ''}
        AND (ge.last_assessed_version IS NULL OR ge.last_assessed_version NOT LIKE 'merged-into-%')
      GROUP BY lk.entity_id ORDER BY canon DESC, shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT ?`,
    [...keys, ...(type ? [type] : []), Math.min(50, +limit || 20)]);
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, importance: r.importance, shared_keys: r.shared, canonical_match: !!r.canon }));
}

// entity_dossier(id) — a person's cited claims + occurrences (+ legacy enrichment where present).
export async function entityDossier(rawId) {
  const id = +String(rawId).replace(/\D/g, '');
  const ge = await queryOne(`SELECT id, canonical_name cn, entity_type et, importance, last_assessed_version lav FROM graph_entities WHERE id=?`, [id]);
  if (!ge || isMerged(ge.lav)) return null;
  const er = await queryOne(`SELECT side, summary, aliases FROM entity_research WHERE canonical_name=? AND entity_type=?`, [ge.cn, ge.et]);
  const rows = await queryAll(`SELECT relation, target_entity_id tid, statement, proof_verbatim proof, doc_id, para_id, time_value tv, time_basis tb
     FROM entity_claims WHERE entity_id=? AND (status IS NULL OR status='supported') ORDER BY (tv IS NULL), tv, relation`, [id]);
  const tids = [...new Set(rows.map((c) => c.tid).filter(Boolean))];
  const tname = new Map();
  if (tids.length) (await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${tids.map(() => '?').join(',')})`, tids)).forEach((r) => tname.set(r.id, r.cn));
  const claims = rows.map((c) => ({
    relation: c.relation, object_id: c.tid || null, object: c.tid ? (tname.get(c.tid) || null) : null,
    statement: c.statement, proof: c.proof || null,
    when: c.tv ? `${c.tv}${c.tb ? ' [' + c.tb + ']' : ''}` : null,
    source: SRC[c.doc_id]?.[1] || null, paraId: c.para_id,
    url: SRC[c.doc_id] && c.para_id ? `https://oceanlibrary.com/${SRC[c.doc_id][0]}?paraId=${c.para_id}` : null,
  }));
  const occ = await queryAll(`SELECT doc_id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id=? GROUP BY doc_id`, [id]);
  return {
    id: ge.id, name: ge.cn, type: ge.et, importance: ge.importance || 0, side: er?.side || null,
    summary: er?.summary || null, aliases: parse(er?.aliases),
    claims, claimCount: claims.length,
    occurrences: occ.map((o) => ({ book: SRC[o.doc_id]?.[1] || `doc${o.doc_id}`, mentions: o.n })),
    mentionCount: occ.reduce((s, o) => s + o.n, 0), source: 'entity-substrate-v2',
  };
}

// entity_search(query) — candidate people whose CITED claims match the query tokens (fast, no AI). Returns each with
// the matching cited claims as evidence — the general search / chat can then read or verify them.
export async function entitySearch(q, { limit = 12 } = {}) {
  const terms = String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!terms.length) return { query: q, results: [] };
  const like = terms.map(() => `LOWER(statement) LIKE ?`).join(' AND ');
  const rows = await queryAll(
    `SELECT ec.entity_id id, ge.canonical_name name, ge.importance imp, ec.statement, ec.relation, ec.doc_id, ec.para_id
       FROM entity_claims ec JOIN graph_entities ge ON ge.id=ec.entity_id
      WHERE (ec.status IS NULL OR ec.status='supported') AND ge.entity_type='person'
        AND (ge.last_assessed_version IS NULL OR ge.last_assessed_version NOT LIKE 'merged-into-%')
        AND ${like} LIMIT 200`, terms.map((t) => `%${t}%`));
  const byEnt = new Map();
  for (const r of rows) { if (!byEnt.has(r.id)) byEnt.set(r.id, { id: r.id, name: r.name, importance: r.imp || 0, evidence: [] });
    byEnt.get(r.id).evidence.push({ statement: r.statement, relation: r.relation, source: SRC[r.doc_id]?.[1] || null, url: SRC[r.doc_id] && r.para_id ? `https://oceanlibrary.com/${SRC[r.doc_id][0]}?paraId=${r.para_id}` : null }); }
  const results = [...byEnt.values()].sort((a, b) => b.evidence.length - a.evidence.length || b.importance - a.importance).slice(0, Math.min(30, +limit || 12));
  return { query: q, results, note: 'cited-claim matches — read/verify evidence before asserting' };
}
