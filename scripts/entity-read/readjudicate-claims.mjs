// CLAIM RE-ADJUDICATION — the honest fix for intermixed/conflated records. For each entity, read EVERY claim together
// with its CITED SOURCE PARAGRAPH, and let the AI (1) partition the claims into the REAL distinct people the source
// describes (by nisba/role/associates/era/fate in the paragraph, not by name), and (2) flag any claim whose statement
// added or changed a detail not in the paragraph (hallucination, e.g. "Tabríz" where the source says Ṭihrán).
// Read-only report; test with NAME='Muḥammad-Riḍá' before scaling. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const NAME = process.env.NAME || '';
const IDS = (process.env.IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// paragraph text for the two seed docs, ORDERED — so we can hand the AI the SCENE (cited paragraph + neighbours),
// because narrative context (place, era, who the subject is) is often established a paragraph or two EARLIER and not
// repeated in the cited one (e.g. the Báb's uncle's beheading paragraph never repeats "Ṭihrán").
const docParas = new Map(); const pidPos = new Map();
for (const doc of [21308, 21310]) {
  const ps = await queryAll(`SELECT external_para_id pid, heading, text, paragraph_index idx FROM content WHERE doc_id=? AND deleted_at IS NULL AND external_para_id IS NOT NULL ORDER BY paragraph_index`, [doc]);
  const arr = ps.map((r) => ({ pid: r.pid, heading: r.heading || '', text: String(r.text).replace(/\s+/g, ' ').trim() }));
  docParas.set(doc, arr); arr.forEach((p, i) => pidPos.set(`${doc}|${p.pid}`, i));
}
const windowFor = (doc, pid, before = 3, after = 1) => { const arr = docParas.get(doc); const pos = pidPos.get(`${doc}|${pid}`);
  if (pos == null || !arr) return null; return arr.slice(Math.max(0, pos - before), Math.min(arr.length, pos + after + 1)).map((p) => ({ ...p, cited: p.pid === pid })); };
const sceneText = (doc, pid) => { const w = windowFor(doc, pid); if (!w) return '(paragraph not found)';
  return w.map((p) => `${p.cited ? '»CITED« ' : ''}[${p.pid}${p.heading ? ' | ' + p.heading : ''}] ${p.text.slice(0, p.cited ? 300 : 170)}`).join('\n       '); };

let ents;
if (IDS.length) ents = await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE id IN (${IDS.map(() => '?').join(',')})`, IDS);
else ents = await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE entity_type='person' AND canonical_name LIKE ?`, [`%${NAME}%`]);
console.log(`entities matched: ${ents.length}`);

const SYS = `You are repairing a historical entity database in which bare-name matching FUSED several different people (and intermixed their facts) under one record. You are given the entity's cited CLAIMS, each with a snippet of its SOURCE PARAGRAPH. Do two things:
1. PARTITION the claims into the REAL DISTINCT PEOPLE the sources describe. Judge by the WEIGHT of evidence in the paragraphs — nisba/place, role, associates, era, and fate — NOT by the shared name. Nisbas/places are SOFT (a village vs its province, or a governor of a province vs its city, can be one man; two people can share a town), so cluster by coherent LIFE, not by place strings. Give each person a short descriptor.
2. FAITHFULNESS: each claim comes with its SCENE — the cited paragraph plus neighbouring paragraphs — because place/era/subject are often established a paragraph or two EARLIER and not repeated. Judge the statement against the WHOLE SCENE, not the single cited line. Flag a detail (place/date/fate) ONLY if the scene CONTRADICTS it (statement "Tabríz" but the scene says "Ṭihrán") or the scene nowhere supports it — NEVER merely because the one cited paragraph omits it. If the scene establishes the correct value, give it in the issue (e.g. "says Tabríz; scene establishes Ṭihrán").
Return ONLY JSON: {"people":[{"descriptor":"<name / nisba / role / era>","claims":[<indexes>]}],"hallucinations":[{"claim":<index>,"issue":"<the unsupported detail>"}],"note":"<=25 words"}.`;

for (const e of ents) {
  const claims = await queryAll(`SELECT id, relation, statement, doc_id, para_id, proof_ok FROM entity_claims WHERE entity_id=? AND import_batch IN ('gpb-v1','db-v1') ORDER BY id`, [e.id]);
  if (claims.length < 2) { console.log(`\n=== [${e.id}] ${e.cn} — ${claims.length} claim(s), skip ===`); continue; }
  const body = claims.map((c, i) => `${i}. (${c.relation}) ${c.statement}\n     SCENE (cited paragraph + neighbours):\n       ${sceneText(c.doc_id, c.para_id)}`).join('\n');
  let r = {};
  try { const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `ENTITY: ${e.cn}\nCLAIMS:\n${body}` }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1600, responseFormat: { type: 'json_object' } });
    r = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]);
  } catch (err) { console.log(`\n=== [${e.id}] ${e.cn} — ADJUDICATION FAILED: ${err.message} ===`); continue; }
  console.log(`\n=== [${e.id}] ${e.cn} — ${claims.length} claims → ${(r.people || []).length} distinct people ===`);
  if (r.note) console.log(`    note: ${r.note}`);
  for (const p of (r.people || [])) { console.log(`  • ${p.descriptor}`);
    for (const ci of (p.claims || [])) { const c = claims[ci]; if (c) console.log(`       [${c.id}] (${c.relation}) ${String(c.statement).slice(0, 90)}`); } }
  for (const h of (r.hallucinations || [])) { const c = claims[h.claim]; console.log(`  ⚠ HALLUCINATION claim ${c ? c.id : h.claim}: ${h.issue}`); }
}
process.exit(0);
