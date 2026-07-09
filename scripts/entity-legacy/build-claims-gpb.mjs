// SOURCE-FIRST GATHER, coverage step 1 = GPB alone (doc 21310). Transforms the existing GPB-cited facts on every
// person into provenanced entity_claims candidates, re-verifying each against the actual GPB paragraph:
//   proof_ok      — the verbatim proof-span is present in the cited paragraph
//   subject_ok    — the fact's grammatical subject is THIS entity (not a co-mentioned other)
//   para_ok       — the cited paraId resolves to a real GPB paragraph (groundable at all)
// Only source-grounded claims qualify; research-injected / uncited facts drop out (self-correcting rebuild).
// DRY by default (reports what it WOULD write). WRITE=1 (+ SIFTER_WRITER_URL) inserts into entity_claims. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { createHash } from 'crypto';
const { queryAll, query } = await import('../../api/lib/db.js');
const { assertDisambiguated } = await import('./_disambig-gate.mjs');
const WRITE = process.env.WRITE === '1';
const GPB = 21310;                                            // God Passes By — the seed of authority (coverage step 1)
const BATCH = 'gpb-v1';
await assertDisambiguated(GPB);   // pipeline invariant: never extract from an un-disambiguated book

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son daughter dervish native an outstanding figure community known as one'.split(' '));
const sig = (s) => new Set(nrm(s).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
const allToks = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));
// SUBJECT GATE (mirrors bio.js factSubjectOk): a "<Subject> — desc" roster fact whose subject is a different named person drops
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
const paraIdOf = (f) => { if (f.paraId && /^para_/.test(f.paraId)) return f.paraId; const m = String(f.url || '').match(/paraId=([^&]+)/); return m ? m[1] : (f.paraId || null); };
const isGpb = (f) => /god-passes-by/i.test(f.url || '') || /god passes by/i.test(f.source || '');

// GPB text, for proof verification: external_para_id -> {text, tn, heading}
const gpbRows = await queryAll(`SELECT external_para_id pid, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL`, [GPB]);
const gpb = new Map(gpbRows.map((r) => [r.pid, { text: String(r.text), tn: nrm(r.text), heading: r.heading || '' }]));
console.log(`GPB (${GPB}) paragraphs indexed: ${gpb.size}`);

const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases, er.research_notes rn
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name
  WHERE ge.entity_type='person' AND er.research_notes LIKE '%paraId%'`);

const stats = { entities: 0, entitiesWithGpb: 0, factsGpb: 0, paraOk: 0, proofOk: 0, subjOk: 0, write: 0, noPara: 0, noProof: 0, badSubj: 0 };
const relCount = {}; const claims = []; const samples = [];
for (const r of rows) {
  stats.entities++;
  let rn; try { rn = JSON.parse(r.rn || '{}'); } catch { continue; }
  let aliasArr; try { aliasArr = JSON.parse(r.aliases || '[]'); } catch { aliasArr = []; }
  const facts = []; for (const k of ['facts2', 'episodes', 'characterizations']) if (Array.isArray(rn[k])) for (const f of rn[k]) if (f && f.statement) facts.push(f);
  const gfacts = facts.filter(isGpb);
  if (gfacts.length) stats.entitiesWithGpb++;
  for (const f of gfacts) {
    stats.factsGpb++;
    const pid = paraIdOf(f); const para = pid && gpb.get(pid);
    const rel = (f.relation || f.name || 'characterization').toString().slice(0, 40);
    const paraOk = !!para; const proofOk = !!(para && f.quote && para.tn.includes(nrm(f.quote)));
    const subjOk = subjectOk(r.cn, aliasArr, f.statement);
    if (paraOk) stats.paraOk++; else stats.noPara++;
    if (proofOk) stats.proofOk++; else if (para) stats.noProof++;
    if (subjOk) stats.subjOk++; else stats.badSubj++;
    relCount[rel] = (relCount[rel] || 0) + 1;
    const willWrite = paraOk && subjOk;                       // groundable + right subject (proof_ok recorded, not required if paraphrased-but-cited)
    if (willWrite) {
      stats.write++;
      const hash = createHash('sha1').update(`${r.id}|${rel}|${nrm(f.statement)}|${pid}`).digest('hex').slice(0, 16);
      claims.push({ entity_id: r.id, relation: rel, statement: f.statement, proof_verbatim: f.quote || null, doc_id: GPB, para_id: pid,
        proof_ok: proofOk ? 1 : 0, subject_ok: 1, consistency_ok: null, provenance_tier: 1, claim_hash: hash });
      if (samples.length < 12 && ['the Báb', "Bahá'u'lláh", '‘Abdu’l-Bahá', 'Quddús'].includes(r.cn)) samples.push({ cn: r.cn, rel, pid, proofOk, stmt: String(f.statement).slice(0, 80) });
    }
  }
}

console.log(`\n=== SOURCE-FIRST GPB claim gather (coverage step 1) ===`);
console.log(`person entities scanned      : ${stats.entities}`);
console.log(`  with ≥1 GPB-cited fact     : ${stats.entitiesWithGpb}`);
console.log(`GPB-cited facts examined     : ${stats.factsGpb}`);
console.log(`  paraId resolves to GPB para: ${stats.paraOk}   (dropped, no/again-bad para: ${stats.noPara})`);
console.log(`  proof-span verbatim in para: ${stats.proofOk}   (groundable but not verbatim: ${stats.noProof})`);
console.log(`  subject == entity          : ${stats.subjOk}    (subject mismatch dropped: ${stats.badSubj})`);
console.log(`→ CLAIMS that qualify (para_ok && subject_ok): ${stats.write}`);
console.log(`\ndistinct relations (${Object.keys(relCount).length}) — top 25 (for the controlled vocab):`);
for (const [k, n] of Object.entries(relCount).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${String(n).padStart(4)}  ${k}`);
console.log(`\nsample qualifying claims (central figures):`);
for (const s of samples) console.log(`   [${s.cn}] (${s.rel}) ${s.pid} proof=${s.proofOk ? '✓' : '~'} :: ${s.stmt}`);

if (!WRITE) { console.log(`\nDRY — ${claims.length} GPB claims staged for entity_claims (import_batch='${BATCH}'). WRITE=1 (with SIFTER_WRITER_URL) to insert.`); process.exit(0); }
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const writeRetry = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
let w = 0;
for (const c of claims) {
  await writeRetry(`INSERT OR IGNORE INTO entity_claims (claim_hash,entity_id,relation,statement,proof_verbatim,doc_id,para_id,proof_ok,subject_ok,consistency_ok,provenance_tier,extractor_version,import_batch)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [c.claim_hash, c.entity_id, c.relation, c.statement, c.proof_verbatim, c.doc_id, c.para_id, c.proof_ok, c.subject_ok, c.consistency_ok, c.provenance_tier, 'build-claims-gpb-v1', BATCH]);
  if (++w % 500 === 0) { console.log(`  written ${w}/${claims.length}`); await sleep(20); }
}
console.log(`DONE — inserted ${w} GPB claims into entity_claims`);
process.exit(0);
