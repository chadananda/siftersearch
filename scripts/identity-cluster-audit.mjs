// Jev cluster audit (api/lib/identity-audit.js): flag bindings a careful reader should check. READ-ONLY.
//   --ids=1247564,…  (people to audit). Report: logs/identity-cluster-audit-<stamp>.json — per person, every cluster's
//   verdict, and the flagged ones with their windows. Triggered by POST /api/admin/server/identity-cluster-audit.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const ids = (args.find((a) => a.startsWith('--ids='))?.slice(6) || '').split(',').map(Number).filter(Boolean);
const { queryAll, queryOne } = await import('../api/lib/db.js');
const { auditClusters, profileOf, windowAround } = await import('../api/lib/identity-audit.js');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const report = { stamp, people: [] };
for (const id of ids) {
  const ge = await queryOne(`SELECT ge.canonical_name cn, ge.entity_type et, er.summary, er.aliases FROM graph_entities ge
      LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ge.id = ?`, [id]);
  if (!ge) continue;
  let aliases = []; try { aliases = JSON.parse(ge.aliases || '[]'); } catch { /* none */ }
  const profile = profileOf({ name: ge.cn, summary: ge.summary, aliases });
  const rows = await queryAll(`SELECT m.doc_id, m.resolved_as handle, COUNT(*) n, MIN(m.para_id) p1, MAX(m.para_id) p2, MIN(m.surface) surface, d.title, d.year
      FROM entity_mentions_v2 m JOIN docs d ON d.id = m.doc_id WHERE m.entity_id = ? GROUP BY m.doc_id, m.resolved_as`, [id]);
  const clusters = [];
  for (const r of rows) {
    const texts = [];
    for (const pid of [...new Set([r.p1, r.p2])]) {
      const c = await queryOne(`SELECT text FROM content WHERE doc_id = ? AND (external_para_id = ? OR ('p' || id) = ?) AND deleted_at IS NULL`, [r.doc_id, pid, pid]);
      if (c?.text) texts.push(windowAround(c.text, r.surface));
    }
    clusters.push({ doc: r.doc_id, title: r.title, year: r.year, handle: r.handle, surface: r.surface, mentions: r.n, window: texts.join('\n  …  ') || '(no text)' });
  }
  const t0 = Date.now();
  const judged = await auditClusters(profile, clusters);
  const flagged = judged.filter((c) => c.flagged);
  report.people.push({ id, name: ge.cn, clusters: judged.length, mentions: judged.reduce((n, c) => n + c.mentions, 0),
    flagged: flagged.length, flaggedMentions: flagged.reduce((n, c) => n + c.mentions, 0), ms: Date.now() - t0,
    verdicts: judged.reduce((o, c) => ((o[c.verdict] = (o[c.verdict] || 0) + 1), o), {}),
    flags: flagged.sort((a, b) => b.mentions - a.mentions),
    // A random sample of what Jev PASSED, so a reader can measure what it misses (recall), not only its flags.
    passedSample: judged.filter((c) => !c.flagged).map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).slice(0, 30).map(([, c]) => c) });
  console.log(`${ge.cn}: ${judged.length} clusters, ${flagged.length} flagged (${Date.now() - t0}ms)`);
}
writeFileSync(`logs/identity-cluster-audit-${stamp}.json`, JSON.stringify(report, null, 1));
console.log(`REPORT logs/identity-cluster-audit-${stamp}.json`);
process.exit(0);
