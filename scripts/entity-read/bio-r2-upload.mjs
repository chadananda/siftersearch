// Upload gathered biography portraits to the cdn-assets R2 bucket so they can be served (resized, webp) via
// ImageKit — ik.imagekit.io/1260/cdn/siftersearch.com/biography/<id>.<ext>?tr=w-N. Matches the wrangler →
// cdn-assets convention used by gen-dialog-images-db.mjs. Records manifest[id].cdn = "biography/<id>.<ext>".
// Run on tower-nas (CLOUDFLARE_API_TOKEN in env). Env: ONLYNEW=1 to skip already-uploaded.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' }); dotenv.config({ path: '.env' });
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const ROOT = path.join(process.env.HOME, 'sifter', 'bio-assets');
const R2_BUCKET = 'cdn-assets', PREFIX = 'siftersearch.com/biography';
const ONLYNEW = process.env.ONLYNEW === '1';
const CT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

let up = 0, skip = 0, fail = 0;
for (const dir of readdirSync(ROOT)) {
  const m = dir.match(/^(\d+)-/); if (!m) continue;
  const id = m[1];
  const files = (() => { try { return readdirSync(path.join(ROOT, dir)); } catch { return []; } })();
  const portrait = files.find(f => /^portrait\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
  if (!portrait) continue;
  if (ONLYNEW && manifest[id]?.cdn) { skip++; continue; }
  const ext = portrait.split('.').pop().toLowerCase();
  const key = `${PREFIX}/${id}.${ext}`;
  const file = path.join(ROOT, dir, portrait);
  try {
    execSync(`npx --yes wrangler r2 object put ${JSON.stringify(`${R2_BUCKET}/${key}`)} --file ${JSON.stringify(file)} --content-type ${CT[ext] || 'image/jpeg'} --remote`,
      { env: process.env, stdio: 'pipe', timeout: 60000 });
    manifest[id] = { ...(manifest[id] || {}), cdn: `biography/${id}.${ext}` };
    up++; process.stderr.write(`  ✓ ${id}.${ext}\n`);
  } catch (e) { fail++; process.stderr.write(`  ✗ ${id} — ${String(e.message || e).slice(0, 80)}\n`); }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`\nuploaded: ${up} | skipped: ${skip} | failed: ${fail}`);
process.exit(0);
