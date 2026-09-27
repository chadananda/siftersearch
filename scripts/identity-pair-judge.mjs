// Drive the pair judge (api/lib/rag/entities/pair-judge.js) over held identity pairs.
//   DRY (default): judge every pair (deterministic signals + DeepSeek on the non-vetoed), write nothing, report all.
//   --write: apply merges both judges agree on (evidence recorded on the decision), record vetoed pairs as distinct,
//            and PROPOSE the rest for a human. Pairs: --pairs=a-b,c-d, else the latest materialize dry report's held
//            pairs. --limit=N judges the first N. Triggered by POST /api/admin/server/identity-pair-judge.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, readdirSync, readFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const WRITE = args.includes('--write');
const LIMIT = Number(val('limit')) || null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

let pairs;
if (val('pairs')) pairs = val('pairs').split(',').map((p) => p.split('-').map(Number)).filter((p) => p.length === 2 && p.every(Boolean));
else {
  const f = readdirSync('logs').filter((x) => x.startsWith('identity-materialize-dry-')).sort().at(-1);
  if (!f) { console.error('no materialize dry report — run POST /server/identity-materialize first'); process.exit(1); }
  pairs = JSON.parse(readFileSync(`logs/${f}`, 'utf8')).pairs.map((p) => [p.db, p.replay]);
}
if (LIMIT) pairs = pairs.slice(0, LIMIT);

const { buildContext } = await import('../api/lib/rag/index.js');
const { sifterDeps } = await import('../api/lib/rag-adapter/index.js');
const { run } = await import('../api/lib/rag/entities/pair-judge.js');
const ctx = buildContext(sifterDeps());
let done = 0;
const r = await run(ctx, { pairs, write: WRITE, onProgress: () => { if (++done % 20 === 0) console.log(`progress ${done}/${pairs.length}`); } });
const out = { mode: WRITE ? 'write' : 'dry', pairs: r.pairs, counts: r.counts,
  results: r.results.map((x) => ({ pair: x.pair, names: x.names, rule: x.rule, model: x.model, result: x.result ?? x.skipped,
    signals: x.decision?.evidence?.signals, decision: x.decision && { kind: x.decision.kind, status: x.decision.status, payload: x.decision.payload } })) };
writeFileSync(`logs/identity-pair-judge-${out.mode}-${stamp}.json`, JSON.stringify(out, null, 1));
console.log(`REPORT logs/identity-pair-judge-${out.mode}-${stamp}.json`);
console.log(JSON.stringify({ pairs: r.pairs, counts: r.counts }));
process.exit(0);
