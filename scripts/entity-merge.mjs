// Run the evidence-based merge stage (api/lib/rag/entities/merge.js) and keep its full plan: DRY by default
// (plans only, nothing written); --write applies each plan via applyMerge (append-only merge decision, reversible).
// Options pass through: --minImportance=N (only groups containing someone that prominent), --limit=N, --maxSize=N.
// Output: logs/entity-merge-<dry|write>-<ts>.json. Triggered by POST /api/admin/server/entity-merge.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { rag } = await import('../api/lib/rag-adapter/index.js');

const args = process.argv.slice(2);
const num = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : undefined; };
const WRITE = args.includes('--write');
const opts = { dryRun: !WRITE, minImportance: num('minImportance'), limit: num('limit'), maxSize: num('maxSize'), concurrency: 4 };
const t = Date.now();
const result = await rag.entities.merge(opts);
const mode = WRITE ? 'write' : 'dry';
const file = `logs/entity-merge-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
mkdirSync('logs', { recursive: true });
writeFileSync(file, JSON.stringify({ mode, opts, ms: Date.now() - t, ...result }, null, 1));
const { plans, ...summary } = result;
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ ...summary, plans: plans?.length }));
process.exit(0);
