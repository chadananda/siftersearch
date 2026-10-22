// PM2 cron (every 5 min, fresh process = always CURRENT code): registers newly-declared allowlisted cron apps
// (scripts/lib/ensure-pm2-apps.mjs) and records the decision in data/pm2-apps-check.json. Touches NO database: the
// pipeline snapshot itself is built in siftersearch-reports (api/lib/ops/pipeline-snapshot-job.js) — it used to be built
// here with direct whole-table reads, ~70 s / ~30 GB every hour, the recurring search slowdown (10-22).
// On demand: node scripts/ops/ops.mjs report pipeline-snapshot [--params '{"rebaseIntegrity":true}'].
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, renameSync } from 'fs';
import { ensurePm2Apps } from './lib/ensure-pm2-apps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let result;
try {
  result = await ensurePm2Apps(ROOT);
  if (result.registered?.length) console.log(`registered new pm2 cron apps: ${result.registered.join(', ')}`);
  else if (result.error) console.log(`pm2 app check skipped: ${result.error}`);
} catch (err) {
  result = { error: err.message };
  console.log(`pm2 app check failed (non-fatal): ${err.message}`);
}
const out = join(ROOT, 'data', 'pm2-apps-check.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, JSON.stringify({ ...result, at: new Date().toISOString() }));
renameSync(`${out}.tmp`, out);
process.exit(0);
