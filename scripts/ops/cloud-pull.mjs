// Tower is the master copy (Chad 11-13 "everything should be there on Tower-NAS"): nightly, bring home what lives only in the cloud.
// R2 buckets → /tank/backups/r2-<bucket> by `rclone copy` (adds and updates, never deletes); D1 databases → /tank/backups/d1/<db>/<date>.json.gz
// through the site Worker's /_d1/dump (worker/d1-dump.js). The siftersearch + cdn-assets buckets are already in ~/rclone-sync.sh.
// Cron (nice/ionice): 30 4 * * * cd ~/sifter/siftersearch && nice -n 19 ionice -c3 node scripts/ops/cloud-pull.mjs >> logs/cloud-pull.log 2>&1
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const ROOT = process.env.CLOUD_PULL_DIR || '/tank/backups';
const BUCKETS = ['siftersearch-media', 'siftersearch-img'];
const DBS = ['anis', 'ops'];
const SITE = process.env.CLOUD_PULL_SITE || 'https://siftersearch.com';
const KEEP_DAYS = 30;
const only = process.argv[2];   // 'r2' | 'd1' | undefined (both)
const log = (...a) => console.log(new Date().toISOString(), ...a);
let failed = 0;

if (only !== 'd1') for (const b of BUCKETS) {
  const t = Date.now();
  const r = spawnSync('rclone', ['copy', `r2-all:${b}`, path.join(ROOT, `r2-${b}`), '--transfers', '4', '--checkers', '8', '--bwlimit', process.env.CLOUD_PULL_BWLIMIT || '30M', '--stats-one-line', '--stats', '0', '-v'], { encoding: 'utf8' });
  const tail = (r.stderr || '').trim().split('\n').filter((l) => /Transferred|ERROR/.test(l)).slice(-3).join(' | ');
  if (r.status !== 0) failed++;
  log(`r2 ${b}: exit ${r.status} in ${Math.round((Date.now() - t) / 1000)}s ${tail}`);
}

const dump = async (body) => {
  const res = await fetch(`${SITE}/_d1/dump`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

if (only !== 'r2') for (const db of DBS) {
  try {
    const { tables } = await dump({ db });
    const out = { db, at: new Date().toISOString(), schema: tables, rows: {} };
    for (const t of tables.filter((x) => /^CREATE TABLE/i.test(x.sql))) {
      out.rows[t.name] = [];
      for (let after = 0; after != null;) { const p = await dump({ db, table: t.name, after }); out.rows[t.name].push(...p.rows); after = p.next; }
    }
    const dir = path.join(ROOT, 'd1', db);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${out.at.slice(0, 10)}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out)));
    for (const f of fs.readdirSync(dir)) if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > KEEP_DAYS * 864e5) fs.unlinkSync(path.join(dir, f));
    log(`d1 ${db}: ${Object.entries(out.rows).map(([k, v]) => `${k} ${v.length}`).join(', ')} → ${file} (${fs.statSync(file).size} B)`);
  } catch (e) { failed++; log(`d1 ${db}: FAILED ${e.message}`); }
}
process.exit(failed ? 1 : 0);
