// Apply reviewed identity verdicts (api/lib/rag/entities/reviewed.js): merges with evidence, distinct pairs, renames.
//   --items=<file.json> (array of {verdict, a, b?, into?, name?, reason, reviewer}); DRY unless --write.
//   Triggered by POST /api/admin/server/identity-reviewed, which writes the items file.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const WRITE = args.includes('--write');
const items = JSON.parse(readFileSync(val('items'), 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const { buildContext } = await import('../api/lib/rag/index.js');
const { sifterDeps } = await import('../api/lib/rag-adapter/index.js');
const { run } = await import('../api/lib/rag/entities/reviewed.js');
const r = await run(buildContext(sifterDeps()), { items, write: WRITE });
const out = { mode: WRITE ? 'write' : 'dry', counts: r.counts, results: r.results.map(({ decision, ...x }) => ({ ...x, rationale: decision.rationale, tier: decision.actorTier })) };
writeFileSync(`logs/identity-reviewed-${out.mode}-${stamp}.json`, JSON.stringify(out, null, 1));
console.log(`REPORT logs/identity-reviewed-${out.mode}-${stamp}.json`);
console.log(JSON.stringify(out.counts));
process.exit(0);
