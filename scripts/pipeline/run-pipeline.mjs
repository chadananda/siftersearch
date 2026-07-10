// Manual-phase driver for the unified enrichment orchestrator (docs/architecture/unified-enrichment-pipeline.md).
// While in the manual seeding phase, this is how a human releases + advances books through the gated
// stages. Reuses the proven scripts/entity-read/* drivers as isolated subprocesses.
//   node scripts/pipeline/run-pipeline.mjs --dry                    # preview next action per released doc (no writes)
//   ... --doc 8632 --stage hype                                     # run one stage for one doc
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 ... --once             # run the single next unit of work
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 ... --drain           # process the whole released worklist (long)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { drain, runStage, nextStageOf } = await import('../../api/lib/pipeline/orchestrator.js');
const { queryAll } = await import('../../api/lib/db.js');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (has('--doc') && has('--stage')) {
  const ok = await runStage(+val('--doc'), val('--stage'));
  console.error(ok ? 'stage done' : 'stage FAILED');
  process.exit(ok ? 0 : 1);
}
if (has('--once')) { const n = await drain({ max: 1 }); console.error(`processed ${n} unit(s)`); process.exit(0); }
if (has('--drain')) { const n = await drain({}); console.error(`drained ${n} unit(s)`); process.exit(0); }

// default = --dry: preview only (no writes)
const rows = await queryAll(
  `SELECT p.doc_id, p.priority, p.disambig_status, p.disambig_version, p.hype_status, p.extract_status, d.title
   FROM doc_pipeline p JOIN docs d ON d.id = p.doc_id WHERE p.enabled = 1 ORDER BY p.priority ASC`);
console.log('DRY — next gated action per released doc (in priority order):\n');
for (const r of rows) {
  const next = nextStageOf(r) || '(complete)';
  console.log(`  prio ${String(r.priority).padStart(4)} · doc ${String(r.doc_id).padEnd(6)} · next: ${String(next).padEnd(10)} · ${String(r.title || '').slice(0, 46)}`);
}
console.log('\n(run with --once / --drain / --doc N --stage X to execute)');
process.exit(0);
