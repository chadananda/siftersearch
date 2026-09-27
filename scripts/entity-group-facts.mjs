// Record a fact the sources state of a GROUP ("the Letters of the Living attained the presence of the Báb") as one
// cited claim per member, so a per-person question is answered from the sentence the source actually wrote — and an
// explicit exception ("unlike her fellow-disciples, never attained the presence") as a DENYING claim for that member.
// Spec: config/group-facts.json. Every proof must occur VERBATIM in its paragraph or nothing is written.
// Rows carry import_batch 'group-fact:<key>' (DELETE by it). DRY by default; --write inserts (INSERT OR IGNORE on hash).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const { queryAll, queryOne, transaction } = await import('../api/lib/db.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');

const WRITE = process.argv.includes('--write');
const specs = JSON.parse(readFileSync('config/group-facts.json', 'utf8'));
const fold = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const para = async (id) => queryOne(`SELECT c.id, c.doc_id, c.external_para_id, c.text, d.title FROM content c JOIN docs d ON d.id=c.doc_id WHERE c.id=?`, [id]);
const out = [];
for (const f of specs) {
  const members = await queryAll(`SELECT gr.source_entity_id id, ge.canonical_name name FROM graph_relations gr JOIN graph_entities ge ON ge.id=gr.source_entity_id
    WHERE gr.target_entity_id=? AND ge.entity_type='person' AND ${LIVE_SQL('ge.')}`, [f.group]);
  const target = await queryOne(`SELECT canonical_name name FROM graph_entities WHERE id=?`, [f.target]);
  const main = await para(f.paragraph);
  const verify = (p, proof) => { if (!p || !fold(p.text).includes(fold(proof))) throw new Error(`proof not verbatim in paragraph ${p?.id}: "${proof}"`); };
  verify(main, f.proof);
  const except = new Map();
  for (const x of f.exceptions || []) { const p = await para(x.paragraph); verify(p, x.proof); except.set(x.member, { ...x, p }); }
  const rows = [];
  for (const m of members) {
    const x = except.get(m.id), p = x ? x.p : main, proof = x ? x.proof : f.proof;
    const statement = `${m.name} — ${f.relation} ${target.name}`;
    const pid = p.external_para_id || `p${p.id}`;
    rows.push({ sql: `INSERT OR IGNORE INTO entity_claims (claim_hash, entity_id, relation, target_entity_id, statement, proof_verbatim, doc_id, para_id,
        status, proof_ok, subject_ok, confidence, provenance_tier, extractor_version, import_batch, semantic_key)
      VALUES (?,?,?,?,?,?,?,?, 'supported', 1, 1, 1.0, 1, 'group-fact-v1', ?, ?)`,
      args: [createHash('sha1').update(`group-fact|${f.key}|${m.id}|${p.id}`).digest('hex').slice(0, 16), m.id, f.relation, f.target,
        statement, proof, p.doc_id, pid, `group-fact:${f.key}`, `${m.name}|${f.relation}|${target.name}|${pid}`] });
    out.push({ key: f.key, member: m.name, source: p.title, pid, denies: !!x, proof });
  }
  if (WRITE) await transaction(rows, 'entity-group-facts');
}
console.log(JSON.stringify({ mode: WRITE ? 'write' : 'dry', claims: out.length, rows: out }, null, 1));
process.exit(0);
