// STAGE 1 — map + apply the claim re-adjudication. For each entity: scene-partition its claims into the real people
// (readjudicate logic), KEEP the coherent group matching the record, ROUTE each split-out group to the best existing
// entity (candidate search — NEVER a bare name bind; the group's evidence must be consistent) or a NEW record, and
// QUARANTINE hallucinated / mis-attributed claims. Reversible (rollback file). DRY by default; WRITE=1 applies.
//   IDS=1247570,1254283 node …            # dry plan for specific records
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll, query } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const WRITE = process.env.WRITE === '1';
const IDS = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son brother uncle a an'.split(' '));
const sig = (s) => new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !HON.has(t)));

const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) { const ps = await queryAll(`SELECT external_para_id pid, heading, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, heading: r.heading || '', text: String(r.text).replace(/\s+/g, ' ').trim() })); docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i)); }
const scene = (doc, pid) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return '(n/a)';
  return arr.slice(Math.max(0, pos - 3), pos + 2).map((p) => `${p.pid === pid ? '»CITED« ' : ''}[${p.heading || ''}] ${p.text.slice(0, p.pid === pid ? 300 : 160)}`).join(' ‖ '); };

const SYS = `Repairing a database where bare-name matching fused several people under one record. Given the entity's claims (each with its SCENE = cited paragraph + neighbours, since place/era/subject are often established earlier), PARTITION the claims into the REAL distinct people (judge by the WEIGHT of nisba/role/associates/era/fate in the scenes, not the shared name; places/nisbas are soft). For each person give a short descriptor and the best short NAME to search for. Flag claims whose statement asserts a detail the scene contradicts or nowhere supports (hallucination), and claims whose scene is about a DIFFERENT person entirely (misattributed).
Return ONLY JSON: {"people":[{"descriptor":"..","search_name":"..","claims":[idx]}],"drop":[{"claim":idx,"reason":"hallucination|misattributed","issue":".."}]}.`;

const ents = await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${IDS.map(() => '?').join(',')})`, IDS);
const plan = [];
for (const e of ents) {
  const claims = await queryAll(`SELECT id, relation, statement, doc_id, para_id FROM entity_claims WHERE entity_id=? AND import_batch IN ('gpb-v1','db-v1') ORDER BY id`, [e.id]);
  if (claims.length < 2) { console.log(`\n[${e.id}] ${e.cn}: ${claims.length} claim(s) — skip`); continue; }
  const body = claims.map((c, i) => `${i}. (${c.relation}) ${c.statement}\n   SCENE: ${scene(c.doc_id, c.para_id)}`).join('\n');
  let r; try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `ENTITY: ${e.cn}\nCLAIMS:\n${body}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1600, responseFormat: { type: 'json_object' } });
    r = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); } catch (err) { console.log(`[${e.id}] FAIL ${err.message}`); continue; }
  const drop = new Set((r.drop || []).map((d) => d.claim));
  // keeper = the person-group whose descriptor best overlaps the record's canonical name
  const myTok = sig(e.cn); const scoreG = (g) => { const gt = sig(g.descriptor + ' ' + (g.search_name || '')); let s = 0; for (const t of myTok) if (gt.has(t)) s++; return s; };
  const people = (r.people || []).map((g) => ({ ...g, score: scoreG(g) })).sort((a, b) => b.score - a.score);
  console.log(`\n=== [${e.id}] ${e.cn} — ${claims.length} claims → ${people.length} people, ${drop.size} to quarantine ===`);
  for (let gi = 0; gi < people.length; gi++) { const g = people[gi]; const keep = gi === 0;
    let target = null;
    if (!keep) { const cand = await queryAll(`SELECT id, canonical_name cn, importance imp FROM graph_entities WHERE entity_type='person' AND canonical_name LIKE ? AND id<>? ORDER BY (importance IS NULL), importance DESC LIMIT 3`, [`%${(g.search_name || g.descriptor).split(/[ ,]/)[0].slice(0, 12)}%`, e.id]);
      target = cand[0] ? { id: cand[0].id, cn: cand[0].cn } : { id: 'NEW', cn: g.search_name || g.descriptor }; }
    console.log(`  ${keep ? 'KEEP on record' : `MOVE → ${target.id === 'NEW' ? 'NEW entity' : `[${target.id}] ${target.cn}`}`}  :: ${g.descriptor}`);
    for (const ci of (g.claims || [])) { const c = claims[ci]; if (!c || drop.has(ci)) continue; if (!keep) plan.push({ claim_id: c.id, from: e.id, to: target.id, kind: 'move', target_name: target.cn });
      console.log(`       [${c.id}] ${keep ? '(stay)' : '→move'} ${String(c.statement).slice(0, 70)}`); } }
  for (const d of (r.drop || [])) { const c = claims[d.claim]; if (!c) continue; plan.push({ claim_id: c.id, from: e.id, to: 'QUARANTINE', kind: d.reason, issue: d.issue });
    console.log(`  ⚠ QUARANTINE [${c.id}] (${d.reason}): ${d.issue}`); }
}
console.log(`\nplan: ${plan.length} claim ops (${plan.filter((p) => p.kind === 'move').length} moves, ${plan.filter((p) => p.to === 'QUARANTINE').length} quarantines)`);
if (!WRITE) { console.log('DRY — set WRITE=1 (+SIFTER_WRITER_URL) to apply.'); process.exit(0); }
writeFileSync('/home/chad/sifter/siftersearch/siftersearch-readjudication-rollback.json', JSON.stringify(plan));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const wr = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
for (const op of plan) { if (op.to === 'QUARANTINE') await wr(`UPDATE entity_claims SET status='quarantined-readjudication', superseded_at=unixepoch() WHERE id=?`, [op.claim_id]);
  else if (op.to !== 'NEW') await wr(`UPDATE entity_claims SET entity_id=? WHERE id=?`, [op.to, op.claim_id]); await sleep(15); }
console.log(`DONE — applied ${plan.length} ops (NEW-entity moves left for a follow-up mint step)`); process.exit(0);
