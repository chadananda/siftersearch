// Title → figure merges, done safely. For each catalog verdict kind=title_of:
//   1. STRICT resolution: the named figure must match a live person BY NAME (a name form equal to the model's
//      same_as, folded) — recall's top candidate is NOT accepted on prominence (that sent "Zayn al-‘Ábidín" and
//      "Ghusn-i-A‘ẓam" to Bahá’u’lláh in the first dry run);
//   2. SECOND CHECK: an independent DeepSeek call with both records' summaries: is this a title / alternate name of
//      that figure? Only yes + both agree → planned merge.
// DRY by default (plan only). --write applies the plan with applyMerge, rows saved to a rollback file first.
// Output: logs/entity-title-merge-<dry|write>-<ts>.json. POST /api/admin/server/entity-title-merge.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { queryAll } = await import('../api/lib/db.js');
const { chatCompletion } = await import('../api/lib/ai.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');
const { makeStore } = await import('../api/lib/rag-adapter/store.js');
const { getEncounterIndex, fold } = await import('../api/lib/encounters.js');

const WRITE = process.argv.includes('--write');
const store = makeStore();
const idx = await getEncounterIndex();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const key = (s) => fold(String(s || '').replace(/\([^)]*\)/g, ' ')).trim().replace(/^(the|a) /, '');

const rows = await queryAll(`SELECT r.entity_id id, r.same_as, r.confidence conf, r.reason, ge.canonical_name name, er.summary
  FROM entity_catalog_review r JOIN graph_entities ge ON ge.id = r.entity_id
  LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE r.kind = 'title_of' AND r.same_as IS NOT NULL AND ge.entity_type = 'person' AND ${LIVE_SQL('ge.')}`);

// 1. strict resolution
const resolved = [];
let unresolved = 0;
for (const r of rows) {
  const want = key(r.same_as);
  const cands = await store.findCandidateEntities(r.same_as, { type: 'person', limit: 8 });
  const hit = cands.find((c) => c.id !== r.id && (idx.people.get(c.id)?.forms || []).some((f) => f.phrase === want || f.bare === want));
  if (hit) resolved.push({ ...r, sid: hit.id, figure: hit.canonical, figureSummary: hit.summary || null }); else unresolved++;
}

// 2. second check, 20 per call
const SYSTEM = `For each numbered pair, decide whether RECORD is only another name, title, epithet or office-holder phrase for FIGURE — the SAME individual — using both summaries. Answer "yes" only when the summaries make it certain; different people with similar names or titles are "no" (e.g. an Imam is not Bahá'u'lláh; a caliph is not ‘Abdu'l-Bahá; the Greatest Branch is ‘Abdu'l-Bahá, not Bahá'u'lláh). Return ONLY JSON {"answers":[{"n":1,"same":"yes|no","reason":"<=12 words"}]}`;
const plan = [], rejected = [];
for (let i = 0; i < resolved.length; i += 20) {
  const b = resolved.slice(i, i + 20);
  const user = b.map((r, k) => `${k + 1}. RECORD "${r.name}"${r.summary ? ` — ${String(r.summary).slice(0, 180)}` : ''}\n   FIGURE "${r.figure}"${r.figureSummary ? ` — ${String(r.figureSummary).slice(0, 180)}` : ''}`).join('\n');
  try {
    const res = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens: 60 * b.length + 100, responseFormat: { type: 'json_object' }, caller: 'entity-title-merge' });
    const ans = JSON.parse(String(res.content).match(/\{[\s\S]*\}/)[0]).answers || [];
    b.forEach((r, k) => { const a = ans.find((x) => Number(x.n) === k + 1); (a?.same === 'yes' ? plan : rejected).push({ ...r, check: a?.reason || null }); });
  } catch { rejected.push(...b.map((r) => ({ ...r, check: 'second check failed' }))); }
}

const report = { mode: WRITE ? 'write' : 'dry', titles: rows.length, unresolved, resolved: resolved.length, planned: plan.length, rejected: rejected.length,
  plan: plan.map((r) => `${r.name} → ${r.figure} (#${r.sid}) — ${r.check}`), rejectedSample: rejected.slice(0, 60).map((r) => `${r.name} ✗ ${r.figure} — ${r.check}`) };
if (WRITE) {
  const rollback = [];
  for (const r of plan) {
    rollback.push({ title: r.id, into: r.sid,
      mentions: await queryAll(`SELECT id, entity_id FROM entity_mentions_v2 WHERE entity_id = ?`, [r.id]),
      claimSubjects: await queryAll(`SELECT id, entity_id FROM entity_claims WHERE entity_id = ?`, [r.id]),
      claimTargets: await queryAll(`SELECT id, target_entity_id FROM entity_claims WHERE target_entity_id = ?`, [r.id]),
      relations: await queryAll(`SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?`, [r.id, r.id]) });
    writeFileSync(`logs/entity-title-merge-rollback-${stamp}.json`, JSON.stringify(rollback));
    await store.applyMerge(r.sid, [r.id], `title of ${r.figure}: catalog review (${r.conf}) + second check — ${r.check}`);
  }
  report.rollback = `logs/entity-title-merge-rollback-${stamp}.json`;
}
mkdirSync('logs', { recursive: true });
const file = `logs/entity-title-merge-${report.mode}-${stamp}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ mode: report.mode, titles: report.titles, unresolved, resolved: report.resolved, planned: report.planned, rejected: report.rejected }));
process.exit(0);
