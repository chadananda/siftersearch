// OVERNIGHT SWEEP — re-adjudicate EVERY multi-claim record against its source scenes to (a) auto-quarantine the
// clearly mis-attributed claims (reversible; gated by TWO signals so it's safe unsupervised: the AI flags it
// misattributed AND the entity's own distinctive name is absent from the cited scene), and (b) cache the split /
// hallucination judgments so the morning review pages are pre-solved where possible. Resumable (per-entity cache).
//   nohup SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/overnight-sweep.mjs > /tmp/siftersearch-sweep.log 2>&1 &
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, existsSync } from 'fs';
const { queryAll, query } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const WRITE = process.env.WRITE === '1';
const CACHE = 'tmp/siftersearch-sweep-verdicts.json';
const ROLL = '/home/chad/sifter/siftersearch/siftersearch-sweep-rollback.json';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj the of son brother uncle a an'.split(' '));
const sig = (s) => [...new Set(nrm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !HON.has(t)))];

const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) { const ps = await queryAll(`SELECT external_para_id pid, text FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, text: String(r.text).replace(/\s+/g, ' ').trim() })); docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i)); }
const sceneText = (doc, pid) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return ''; return arr.slice(Math.max(0, pos - 3), pos + 2).map((p) => p.text).join(' '); };
const sceneSnip = (doc, pid) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`); if (pos == null) return '(n/a)'; return arr.slice(Math.max(0, pos - 3), pos + 2).map((p) => `${p.pid === pid ? '»CITED« ' : ''}${p.text.slice(0, p.pid === pid ? 280 : 150)}`).join(' ‖ '); };

const SYS = `Repairing a database where bare-name matching fused several people under one record. Given the entity's claims (each with its SCENE = cited paragraph + neighbours; place/era/subject are often established earlier and not repeated), PARTITION the claims into the REAL distinct people. DEFAULT TO ONE PERSON — split only on an INCOMPATIBLE LIFE (different death/fate, incompatible era, explicitly distinct individuals). Descriptive facets (uncle, guardian, merchant, martyr, host) are the SAME person; nisbas/places are SOFT (village vs province, governor of a province vs its city = one man; two people can share a town). Also flag claims whose statement asserts a detail the scene CONTRADICTS or nowhere supports (hallucination) or whose scene is about a DIFFERENT person entirely (misattributed).
Return ONLY JSON: {"people":[{"descriptor":"..","claims":[idx]}],"drop":[{"claim":idx,"reason":"hallucination|misattributed","issue":".."}]}.`;

let cache = {}; try { cache = JSON.parse(readFileSync(CACHE, 'utf8')); } catch { /* */ }
let roll = []; try { roll = JSON.parse(readFileSync(ROLL, 'utf8')); } catch { /* */ }
const ents = await queryAll(`SELECT ge.id, ge.canonical_name cn FROM graph_entities ge WHERE ge.entity_type='person'
  AND EXISTS (SELECT 1 FROM entity_claims ec WHERE ec.entity_id=ge.id AND ec.import_batch IN ('gpb-v1','db-v1'))
  ORDER BY (ge.importance IS NULL), ge.importance DESC`);
console.error(`sweep: ${ents.length} entities with claims · WRITE=${WRITE}`);
let done = 0, autoQ = 0, conflated = 0;
for (const e of ents) {
  if (cache[e.id]) { done++; continue; }
  const claims = await queryAll(`SELECT id, relation, statement, doc_id, para_id FROM entity_claims WHERE entity_id=? AND import_batch IN ('gpb-v1','db-v1') AND (status IS NULL OR status='supported') ORDER BY id`, [e.id]);
  if (claims.length < 2) { cache[e.id] = { skip: true }; continue; }
  const nameToks = sig(e.cn);
  const body = claims.map((c, i) => `${i}. (${c.relation}) ${c.statement}\n   SCENE: ${sceneSnip(c.doc_id, c.para_id)}`).join('\n');
  let r; try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `ENTITY: ${e.cn}\nCLAIMS:\n${body}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1700, responseFormat: { type: 'json_object' } }); r = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); }
  catch (err) { console.error(`  [${e.id}] fail ${String(err.message).slice(0, 40)}`); continue; }
  const drops = (r.drop || []).map((d) => { const c = claims[d.claim]; if (!c) return null;
    const sceneN = nrm(sceneText(c.doc_id, c.para_id)); const nameInScene = nameToks.some((t) => sceneN.includes(t));
    const autoQuarantine = /misattribut/i.test(d.reason || '') && !nameInScene;   // 2 signals: AI + name absent from scene
    return { claim_id: c.id, reason: d.reason, issue: d.issue, nameInScene, autoQuarantine }; }).filter(Boolean);
  const nPeople = (r.people || []).length;
  cache[e.id] = { cn: e.cn, nClaims: claims.length, nPeople, drops: drops.map((d) => ({ claim_id: d.claim_id, reason: d.reason, issue: d.issue, auto: d.autoQuarantine })) };
  if (nPeople > 1) conflated++;
  if (WRITE) for (const d of drops) if (d.autoQuarantine) {
    roll.push({ claim_id: d.claim_id, entity_id: e.id }); await query(`UPDATE entity_claims SET status='quarantined-sweep', superseded_at=unixepoch() WHERE id=? AND (status IS NULL OR status='supported')`, [d.claim_id]); autoQ++;
  }
  done++;
  if (done % 20 === 0) { writeFileSync(CACHE, JSON.stringify(cache)); if (WRITE) writeFileSync(ROLL, JSON.stringify(roll)); console.error(`  ${done}/${ents.length} · conflated ${conflated} · auto-quarantined ${autoQ}`); }
}
writeFileSync(CACHE, JSON.stringify(cache)); if (WRITE) writeFileSync(ROLL, JSON.stringify(roll));
console.error(`SWEEP DONE — ${done}/${ents.length} · conflated records ${conflated} · auto-quarantined ${autoQ} misattributions (reversible: status='quarantined-sweep')`);
process.exit(0);
