// Drive the materialize stage (api/lib/rag/entities/materialize.js): write the decision log's replay onto mentions.
//   DRY (default): report corrections by category, recorded decisions and reassessment pairs; change nothing.
//   --write: save a rollback file (every mention it will change, with its current entity), then record + correct.
// Options: --doc=N (one document). Triggered by POST /api/admin/server/identity-materialize.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DOC = Number((args.find((a) => a.startsWith('--doc=')) || '').split('=')[1]) || null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const { makeStore } = await import('../api/lib/rag-adapter/store.js');
const { run } = await import('../api/lib/rag/entities/materialize.js');
const ctx = { store: makeStore(), log: {} };

const dry = await run(ctx, { docId: DOC, write: false });
let written = null;
if (WRITE) {
  writeFileSync(`logs/identity-materialize-rollback-${stamp}.json`, JSON.stringify(dry.changesList.map(({ id, from }) => ({ id, entityId: from }))));
  written = await run(ctx, { docId: DOC, write: true });
}
const r = written || dry;
const out = { mode: WRITE ? 'write' : 'dry', docId: DOC, mentions: r.mentions, divergent: r.divergent, byCategory: r.byCategory,
  changes: r.changes, recordedDecisions: r.recordedDecisions, written: r.written,
  rollback: WRITE ? `logs/identity-materialize-rollback-${stamp}.json` : null,
  pairs: r.pairs, recorded: r.recorded, changesSample: r.changesList.slice(0, 200) };
writeFileSync(`logs/identity-materialize-${out.mode}-${stamp}.json`, JSON.stringify(out, null, 1));
console.log(`REPORT logs/identity-materialize-${out.mode}-${stamp}.json`);
console.log(JSON.stringify({ divergent: r.divergent, byCategory: r.byCategory, changes: r.changes, recorded: r.recordedDecisions, pairs: r.pairs.length, written: r.written }));
process.exit(0);
