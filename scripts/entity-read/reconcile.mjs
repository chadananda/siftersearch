// PASS 4 — RECONCILE: resolve mention clusters to entities by EVIDENCE, writing entity_decisions (never edits).
// (1) cluster mentions by their disambiguation resolved_as descriptor; (2) candidate-gen via the transliteration-
// invariant lookup index (entity_lookup_keys — RECALL, never determinative); (3) assemble an evidence dossier
// (descriptor + representative scenes + claims + candidate entities); (4) strong-model adjudication → verdict
// {link <entity_id> | create <canonical> | uncertain}; (5) write a PROPOSED decision (actor_tier 2). Proposals are
// NOT applied to the projection here — high-impact/uncertain go to human review. Reversible (append-only log).
//   DRY:   DOC=21308 FILTER=Aḥmad LIMIT=6 node scripts/entity-read/reconcile.mjs
//   WRITE: SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 DOC=21308 node scripts/entity-read/reconcile.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { skeletonKeys } = await import('../../api/lib/translit-key.js');
const DOC = Number(process.env.DOC || 21308);
const WRITE = process.env.WRITE === '1';
const FILTER = process.env.FILTER || null;         // resolved_as LIKE %FILTER% (proof runs)
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : 0;
const MINFREQ = +(process.env.MINFREQ || 1);       // skip clusters mentioned < MINFREQ times (full run: 2)
const CONC = +(process.env.CONC || 5);
const MODEL = process.env.MODEL || 'deepseek-v4-flash';
const MV = 'deepseek-disambig-v1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const coreName = (rs) => String(rs).replace(/\([^)]*\)/g, '').split(/[,;—]| the | who | a /)[0].trim();  // (kept for the create-canonical; candidate recall uses the full name)

if (process.env.CLEAR === '1' && WRITE) {   // clean slate: drop prior mention-cluster decisions + mention bindings
  await query(`DELETE FROM entity_decisions WHERE target_kind='mention-cluster'`);
  await query(`UPDATE entity_mentions_v2 SET entity_id=NULL, resolution_basis=NULL, resolution_conf=NULL`);
  console.error('CLEARED prior mention-cluster decisions + mention bindings');
}

// clusters = distinct resolved_as within the book (skip unresolved '?' and generic roster non-IDs)
let clauses = `doc_id=? AND resolved_as IS NOT NULL AND resolved_as NOT LIKE '%not given%' AND resolved_as NOT LIKE '%?%'`;
const params = [DOC];
if (FILTER) { clauses += ` AND resolved_as LIKE ?`; params.push(`%${FILTER}%`); }
let clusters = await queryAll(`SELECT resolved_as, COUNT(*) freq, GROUP_CONCAT(DISTINCT para_id) paras
  FROM entity_mentions_v2 WHERE ${clauses} GROUP BY resolved_as ORDER BY freq DESC`, params);
clusters = clusters.filter((c) => c.freq >= MINFREQ);
if (LIMIT) clusters = clusters.slice(0, LIMIT);
console.error(`reconcile DOC=${DOC}${FILTER ? ` FILTER=${FILTER}` : ''} · ${clusters.length} resolved_as clusters (freq≥${MINFREQ}) · CONC=${CONC} · WRITE=${WRITE}`);

const sceneOf = async (paras) => {                 // representative disambiguation notes for the cluster
  const ps = paras.split(',').slice(0, 4);
  const rows = await queryAll(`SELECT external_para_id pid, context FROM content WHERE doc_id=? AND external_para_id IN (${ps.map(() => '?').join(',')})`, [DOC, ...ps]);
  return rows.map((r) => `[${r.pid}] ${String(r.context).slice(0, 220)}`).join('\n');
};

const SYS = `You are an entity-resolution adjudicator for a Bábí-Bahá'í prosopography. Given a MENTION CLUSTER (an entity as the source resolves it, with representative scenes) and CANDIDATE existing PERSON entities (found by transliteration-invariant name recall — candidates only, NOT matches):
FIRST classify the cluster's TYPE. If it is NOT an individual human — i.e. a PLACE (fort, city, house, shrine), a WORK (tablet/book), a CONCEPT/term, a RELIGION or COMMUNITY (the Bábí/Bahá'í Faith, "the people of the Bayán"), a GROUP, or an EVENT/upheaval, or a messianic/prophetic archetype (the Qá'im, the Imám-Mihdí) — return {"verdict":"other","type":"place|work|concept|community|group|event","canonical":"<the reference>","decisive":"not a person","confidence":1}.
If it IS a person, decide by EVIDENCE:
• "link" — the cluster IS one specific candidate (same person: compatible role, place, era, connections). Give its id.
• "create" — a person NOT among the candidates (or the only name-candidate is a contaminated/bare record whose evidence contradicts this cluster's role/era). Give canonical = the source's own resolved form.
• "uncertain" — evidence insufficient; route to human.
Rules: name similarity ALONE never justifies "link" (namesakes abound); require role/place/era/connection agreement. A descriptor that contradicts a candidate (an "amanuensis" is not a "traditions-scholar") forbids linking. Prefer "create"/"uncertain" over a wrong link (a false merge fabricates a person). Return ONLY JSON: {"verdict":"link|create|uncertain|other","type":"person|place|work|concept|community|group|event","entity_id":<id or null>,"canonical":"<name or null>","decisive":"<axis that settled it, <=20 words>","confidence":0.0-1.0}`;

let done = 0, proposed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn, n = 4) => { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (x) { e = x; await sleep(600 * (i + 1)); } } throw e; };
process.on('unhandledRejection', (e) => console.error(`unhandledRejection: ${String(e?.message || e).slice(0, 60)}`));
async function processCluster(c) {
  const keys = [...skeletonKeys(c.resolved_as)];   // FULL resolved name (incl. parenthetical alias) → max recall; AI filters by evidence
  const cand = keys.length ? await queryAll(
    `SELECT lk.entity_id id, ge.canonical_name cn, ge.entity_type et, ge.importance imp, er.summary,
            COUNT(DISTINCT lk.skeleton_key) shared
       FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
       LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
      WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')}) AND ge.entity_type='person'
      GROUP BY lk.entity_id ORDER BY shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT 6`, keys) : [];
  const scenes = await sceneOf(c.paras);
  const candBlock = cand.map((x) => `  #${x.id} "${x.cn}" (imp ${x.imp ?? '?'}) — ${String(x.summary || '').slice(0, 90)}`).join('\n') || '  (no name-candidates found)';
  const user = `MENTION CLUSTER — resolved as: "${c.resolved_as}" (${c.freq} mentions)\nSCENES:\n${scenes}\n\nCANDIDATE entities (name-recall only, verify by evidence):\n${candBlock}`;
  let v;
  try { const res = await retry(() => chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }], { provider: 'deepseek', model: MODEL, temperature: 0, maxTokens: 400, responseFormat: { type: 'json_object' } })); v = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]); }
  catch (e) { console.error(`  ["${c.resolved_as.slice(0, 40)}"] FAIL ${String(e.message).slice(0, 40)}`); return; }
  done++;
  const kind = v.verdict === 'other' ? 'other-type' : v.verdict === 'link' ? 'link' : v.verdict === 'create' ? 'create' : 'uncertain';
  console.log(`\n"${c.resolved_as.slice(0, 60)}" (${c.freq}×) → ${kind.toUpperCase()}${v.type && v.type !== 'person' ? '(' + v.type + ')' : ''}${v.entity_id ? ' #' + v.entity_id : ''}${v.canonical ? ' “' + v.canonical + '”' : ''}  · ${v.decisive || ''}`);
  if (WRITE) {
    const payload = JSON.stringify({ resolved_as: c.resolved_as, verdict: v.verdict, type: v.type || 'person', entity_id: v.entity_id || null, canonical: v.canonical || null, freq: c.freq });
    const evidence = JSON.stringify({ scenes: c.paras.split(',').slice(0, 6), candidates: cand.map((x) => x.id) });
    await query(`INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, valid_time)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [kind, 'mention-cluster',
       JSON.stringify(c.paras.split(',').slice(0, 20)), payload, evidence, v.decisive || null,
       `model:${MODEL}`, 2, v.confidence ?? null, 'proposed', null]); proposed++;
  }
}
let next = 0;
async function worker() { while (next < clusters.length) { const i = next++; try { await processCluster(clusters[i]); } catch (e) { console.error(`cluster ${i} crash ${String(e.message).slice(0, 40)}`); } if (WRITE && proposed && proposed % 100 === 0) console.error(`  proposed ${proposed}`); } }
await Promise.all(Array.from({ length: Math.min(CONC, clusters.length) }, worker));
console.error(`\nDONE — ${done} clusters adjudicated · ${proposed} proposed decisions written (status=proposed, actor_tier 2)`);
process.exit(0);
