// Run the evidence-based merge stage (api/lib/rag/entities/merge.js) and keep its full plan.
//   DRY (default): adjudicate groups, write the plans to logs/entity-merge-dry-<ts>.json, change nothing.
//   --apply=<dry report file> [--exclude=key1,key2]: apply EXACTLY those reviewed plans (no re-adjudication — a new
//     model run could propose different merges), skipping excluded group keys. Before each merge it saves every
//     mention/claim row that points at a merged id (logs/entity-merge-rollback-<ts>.json): applyMerge repoints
//     rows, so without this record a merge could not be undone.
// Options for DRY: --minImportance=N --limit=N --maxSize=N. Triggered by POST /api/admin/server/entity-merge.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const num = (k) => (val(k) != null ? Number(val(k)) : undefined);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

if (val('apply')) {
  const { queryAll } = await import('../api/lib/db.js');
  const { makeStore } = await import('../api/lib/rag-adapter/store.js');
  const { LIVE_SQL } = await import('../api/lib/entity-live.js');
  const store = makeStore();
  const report = JSON.parse(readFileSync(`logs/${val('apply').replace(/^logs\//, '')}`, 'utf8'));
  const exclude = new Set((val('exclude') || '').split(',').filter(Boolean));
  const plans = report.plans.filter((p) => !exclude.has(p.key));
  const rollback = [], applied = [], skipped = [];
  for (const p of plans) {
    const ids = [p.canonical, ...p.merge];
    const liveIds = new Set((await queryAll(`SELECT id FROM graph_entities WHERE id IN (${ids.map(() => '?').join(',')}) AND ${LIVE_SQL()}`, ids)).map((r) => r.id));
    const merge = p.merge.filter((id) => liveIds.has(id));
    if (!liveIds.has(p.canonical) || !merge.length) { skipped.push({ key: p.key, reason: 'canonical or members no longer live' }); continue; }
    const ph = merge.map(() => '?').join(',');
    rollback.push({ key: p.key, canonical: p.canonical, merged: merge,
      mentions: await queryAll(`SELECT id, entity_id FROM entity_mentions_v2 WHERE entity_id IN (${ph})`, merge),
      claimSubjects: await queryAll(`SELECT id, entity_id FROM entity_claims WHERE entity_id IN (${ph})`, merge),
      claimTargets: await queryAll(`SELECT id, target_entity_id FROM entity_claims WHERE target_entity_id IN (${ph})`, merge) });
    writeFileSync(`logs/entity-merge-rollback-${stamp}.json`, JSON.stringify(rollback));   // before the write
    const n = await store.applyMerge(p.canonical, merge, p.reason);
    applied.push({ key: p.key, canonical: p.canonical, merged: n });
  }
  const out = { mode: 'apply', from: val('apply'), excluded: [...exclude], applied, skipped, rollback: `logs/entity-merge-rollback-${stamp}.json` };
  writeFileSync(`logs/entity-merge-write-${stamp}.json`, JSON.stringify(out, null, 1));
  console.log(`REPORT logs/entity-merge-write-${stamp}.json`);
  console.log(JSON.stringify({ applied: applied.length, entities: applied.reduce((a, x) => a + x.merged, 0), skipped: skipped.length }));
  process.exit(0);
}

const { rag } = await import('../api/lib/rag-adapter/index.js');
const opts = { dryRun: true, minImportance: num('minImportance'), limit: num('limit'), maxSize: num('maxSize'), concurrency: 4 };
const t = Date.now();
const result = await rag.entities.merge(opts);
const file = `logs/entity-merge-dry-${stamp}.json`;
writeFileSync(file, JSON.stringify({ mode: 'dry', opts, ms: Date.now() - t, ...result }, null, 1));
const { plans, ...summary } = result;
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ ...summary, plans: plans?.length }));
process.exit(0);
