// Unified enrichment pipeline CLI (docs/architecture/unified-enrichment-pipeline.md).
// Manual-phase driver for the doc_pipeline state substrate.
//   node scripts/pipeline/pipeline.mjs status              # corpus-wide stage view
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/pipeline/pipeline.mjs backfill   # (re)build doc_pipeline from DB
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { backfill, statusReport } = await import('../../api/lib/pipeline/state.js');

const cmd = process.argv[2] || 'status';

function printStatus(r) {
  console.log(`\nCORPUS: ${r.totals.docs} docs in pipeline · ${r.totals.enabled} enabled (released into enrichment)\n`);
  const byStage = {};
  for (const row of r.agg) { (byStage[row.stage] ||= {})[row.status] = row.n; }
  console.log('STAGE STATUS (all docs):');
  for (const stage of ['disambig', 'hype', 'extract']) {
    const s = byStage[stage] || {};
    console.log(`  ${stage.padEnd(9)} done=${s.done || 0}  partial=${s.partial || 0}  pending=${s.pending || 0}  error=${s.error || 0}`);
  }
  console.log('\nRELEASED (enabled) — priority order:');
  console.log('  prio  doc    disambig  hype      extract   title');
  for (const e of r.enabled) {
    console.log(`  ${String(e.priority).padStart(4)}  ${String(e.doc_id).padEnd(6)} ${(e.disambig_status||'').padEnd(9)} ${(e.hype_status||'').padEnd(9)} ${(e.extract_status||'').padEnd(9)} ${String(e.title||'').slice(0,48)}`);
  }
  console.log('');
}

if (cmd === 'backfill') {
  console.error('Rebuilding doc_pipeline from current DB state…');
  printStatus(await backfill());
} else if (cmd === 'status') {
  printStatus(await statusReport());
} else {
  console.error(`unknown command: ${cmd}\nusage: pipeline.mjs [status|backfill]`);
  process.exit(1);
}
process.exit(0);
