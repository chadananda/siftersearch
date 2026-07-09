// Generalized source-first claim gather (coverage step N). Same gates as build-claims-gpb but parameterized by source:
//   DOC=<doc_id> SRCFRAG=<url fragment> BATCH=<import_batch> TIER=<provenance_tier>
// e.g. Dawn-Breakers:  DOC=21308 SRCFRAG=dawn-breakers BATCH=db-v1 TIER=2
// Gates: para_ok (paraId resolves to a real paragraph in DOC), proof_ok (verbatim proof-span present), subject_ok.
// DRY by default; WRITE=1 (+ SIFTER_WRITER_URL) inserts into entity_claims. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { createHash } from 'crypto';
const { queryAll, query } = await import('../../api/lib/db.js');
const { assertDisambiguated } = await import('./_disambig-gate.mjs');
const WRITE = process.env.WRITE === '1';
const DOC = Number(process.env.DOC || 21310);
const SRCFRAG = process.env.SRCFRAG || 'god-passes-by';
const BATCH = process.env.BATCH || 'gpb-v1';
const TIER = Number(process.env.TIER || 1);
await assertDisambiguated(DOC);   // pipeline invariant: never extract from an un-disambiguated book

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son daughter dervish native an outstanding figure community known as one'.split(' '));
const sig = (s) => new Set(nrm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const allToks = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const subjectOk = (name, aliasArr, statement) => {
  const m = String(statement || '').match(/^\s*(.{2,60}?)\s+[-–—―−]\s+\S/);
  if (!m) return true;
  if (/^\s*(he|she|they|it|his|her|their|its|who|whom|this|that|these|those|in|on|at|when|after|before|during|next|owing|because)\b/i.test(m[1])) return true;
  const subj = sig(m[1]); if (!subj.size) return true;
  const mine = sig(name); for (const a of (aliasArr || [])) for (const t of sig(a)) mine.add(t);
  const whole = allToks(statement);
  for (const t of mine) if (subj.has(t) || whole.has(t)) return true;
  return false;
};
const paraIdOf = (f) => { if (f.paraId && /^(para_|fn_|h)/.test(f.paraId)) return f.paraId; const m = String(f.url || '').match(/paraId=([^&]+)/); return m ? m[1] : (f.paraId || null); };
const isSrc = (f) => (f.url || '').includes(SRCFRAG) || new RegExp(SRCFRAG.replace(/-/g, '[ -]'), 'i').test(f.source || '');

const srcRows = await queryAll(`SELECT external_para_id pid, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL`, [DOC]);
const src = new Map(srcRows.map((r) => [r.pid, nrm(r.text)]));
console.log(`source doc ${DOC} (${SRCFRAG}) paragraphs indexed: ${src.size}  → batch '${BATCH}' tier ${TIER}`);

const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases, er.research_notes rn
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name
  WHERE ge.entity_type='person' AND er.research_notes LIKE '%paraId%'`);

const st = { ent: 0, entSrc: 0, facts: 0, paraOk: 0, proofOk: 0, subjOk: 0, write: 0, noPara: 0, badSubj: 0 };
const claims = [];
for (const r of rows) {
  st.ent++;
  let rn; try { rn = JSON.parse(r.rn || '{}'); } catch { continue; }
  let aliasArr; try { aliasArr = JSON.parse(r.aliases || '[]'); } catch { aliasArr = []; }
  const facts = []; for (const k of ['facts2', 'episodes', 'characterizations']) if (Array.isArray(rn[k])) for (const f of rn[k]) if (f && f.statement) facts.push(f);
  const sf = facts.filter(isSrc); if (sf.length) st.entSrc++;
  for (const f of sf) {
    st.facts++;
    const pid = paraIdOf(f); const pn = pid && src.get(pid);
    const rel = (f.relation || f.name || 'characterization').toString().slice(0, 60);
    const paraOk = !!pn; const proofOk = !!(pn && f.quote && pn.includes(nrm(f.quote)));
    const subjOk = subjectOk(r.cn, aliasArr, f.statement);
    if (paraOk) st.paraOk++; else st.noPara++;
    if (proofOk) st.proofOk++;
    if (subjOk) st.subjOk++; else st.badSubj++;
    if (paraOk && subjOk) {
      st.write++;
      const hash = createHash('sha1').update(`${r.id}|${rel}|${nrm(f.statement)}|${pid}`).digest('hex').slice(0, 16);
      claims.push({ hash, entity_id: r.id, relation: rel, statement: f.statement, proof: f.quote || null, pid, proof_ok: proofOk ? 1 : 0 });
    }
  }
}
console.log(`persons ${st.ent} · with ${SRCFRAG} facts ${st.entSrc} · facts ${st.facts} · paraOk ${st.paraOk} (noPara ${st.noPara}) · verbatim ${st.proofOk} · subjOk ${st.subjOk} (bad ${st.badSubj}) → qualify ${st.write}`);
if (!WRITE) { console.log(`DRY — ${claims.length} claims staged for batch '${BATCH}'. WRITE=1 (+SIFTER_WRITER_URL) to insert.`); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wr = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
let w = 0;
for (const c of claims) {
  await wr(`INSERT OR IGNORE INTO entity_claims (claim_hash,entity_id,relation,statement,proof_verbatim,doc_id,para_id,proof_ok,subject_ok,provenance_tier,extractor_version,import_batch)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`, [c.hash, c.entity_id, c.relation, c.statement, c.proof, DOC, c.pid, c.proof_ok, TIER, 'build-claims-source-v1', BATCH]);
  if (++w % 500 === 0) { console.log(`  ${w}/${claims.length}`); await sleep(20); }
}
console.log(`DONE — inserted ${w} claims (batch '${BATCH}')`);
process.exit(0);
