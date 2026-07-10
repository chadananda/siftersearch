// Entity API — the shared TOOL layer over the new evidence-reconciled substrate (entity_claims + entity_mentions_v2 +
// deduped graph_entities). Consumed by BOTH the biography browser routes and the general search / Jafar chat tools.
// Reads cited claims (proof-gated, temporal) + occurrences; legacy entity_research only supplies enrichment (summary,
// aliases) the new pipeline doesn't produce yet. Merged-duplicate entities (last_assessed_version LIKE 'merged-into-%')
// are excluded everywhere.
import { queryOne, queryAll } from './db.js';
import { skeletonKeys } from './translit-key.js';

const parse = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const isMerged = (lav) => /^merged-into-/.test(String(lav || ''));
const abbrOf = (t) => t === 'The Dawn-Breakers' ? 'DB' : t === 'God Passes By' ? 'GPB' : (String(t || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || null);
// Resolve source documents (title + public url) from the docs table — NOT a hardcoded book list. Every claim carries
// doc_id + para_id by construction, so a citation always exists; the clickable oceanlibrary link is added when the
// book has a source_url. Returns Map(doc_id → { title, url }).
async function resolveDocs(docIds) {
  const ids = [...new Set(docIds.filter(Boolean))];
  const m = new Map();
  for (let i = 0; i < ids.length; i += 800) { const ch = ids.slice(i, i + 800);
    (await queryAll(`SELECT id, title, source_url FROM docs WHERE id IN (${ch.map(() => '?').join(',')})`, ch)).forEach((r) => m.set(r.id, { title: r.title || null, url: r.source_url || null })); }
  return m;
}

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
  const occ = await queryAll(`SELECT doc_id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id=? GROUP BY doc_id`, [id]);
  const dmap = await resolveDocs([...rows.map((c) => c.doc_id), ...occ.map((o) => o.doc_id)]);
  const claims = rows.map((c) => { const d = dmap.get(c.doc_id) || {}; return {
    relation: c.relation, object_id: c.tid || null, object: c.tid ? (tname.get(c.tid) || null) : null,
    statement: c.statement, proof: c.proof || null,
    when: c.tv ? `${c.tv}${c.tb ? ' [' + c.tb + ']' : ''}` : null,
    source: d.title || null, sourceAbbr: abbrOf(d.title), paraId: c.para_id,
    url: d.url && c.para_id ? `${d.url}?paraId=${c.para_id}` : null,
  }; });
  return {
    id: ge.id, name: ge.cn, type: ge.et, importance: ge.importance || 0, side: er?.side || null,
    summary: er?.summary || null, aliases: parse(er?.aliases),
    claims, claimCount: claims.length,
    occurrences: occ.map((o) => ({ book: (dmap.get(o.doc_id)?.title) || `doc${o.doc_id}`, mentions: o.n })),
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
  const dmap = await resolveDocs(rows.map((r) => r.doc_id));
  const byEnt = new Map();
  for (const r of rows) { if (!byEnt.has(r.id)) byEnt.set(r.id, { id: r.id, name: r.name, importance: r.imp || 0, evidence: [] });
    const d = dmap.get(r.doc_id) || {};
    byEnt.get(r.id).evidence.push({ statement: r.statement, relation: r.relation, source: d.title || null, sourceAbbr: abbrOf(d.title), paraId: r.para_id, url: d.url && r.para_id ? `${d.url}?paraId=${r.para_id}` : null }); }
  const results = [...byEnt.values()].sort((a, b) => b.evidence.length - a.evidence.length || b.importance - a.importance).slice(0, Math.min(30, +limit || 12));
  return { query: q, results, note: 'cited-claim matches — read/verify evidence before asserting' };
}
