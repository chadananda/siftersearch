// Upload gathered portraits to the cdn-assets R2 bucket via the Cloudflare R2 REST API (no wrangler / npx —
// which is unreliable on the server). Auth: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID. Records
// manifest[id].cdn = "biography/<id>.<ext>". Env: ONLYNEW=1 skip already-uploaded; ONLY=id,id only those.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' }); dotenv.config({ path: '.env' });
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
const ROOT = path.join(process.env.HOME, 'sifter', 'bio-assets');
const BUCKET = 'cdn-assets', PREFIX = 'siftersearch.com/biography';
const ACCT = process.env.CLOUDFLARE_ACCOUNT_ID, TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!ACCT || !TOKEN) { console.error('missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN'); process.exit(1); }
const ONLYNEW = process.env.ONLYNEW === '1';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const CT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

let up = 0, skip = 0, fail = 0;
for (const dir of readdirSync(ROOT)) {
  const m = dir.match(/^(\d+)-/); if (!m) continue;
  const id = m[1];
  if (ONLY && !ONLY.has(id)) continue;
  const files = (() => { try { return readdirSync(path.join(ROOT, dir)); } catch { return []; } })();
  const portrait = files.find(f => /^portrait\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (!portrait) continue;
  if (ONLYNEW && manifest[id]?.cdn) { skip++; continue; }
  const ext = portrait.split('.').pop().toLowerCase();
  const key = `${PREFIX}/${id}.${ext}`;                       // slashes are path separators in the object key
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/r2/buckets/${BUCKET}/objects/${key}`;
  try {
    const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': CT[ext] || 'image/jpeg' }, body: readFileSync(path.join(ROOT, dir, portrait)) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
    manifest[id] = { ...(manifest[id] || {}), cdn: `biography/${id}.${ext}` };
    up++; process.stderr.write(`  ✓ ${id}.${ext}\n`);
  } catch (e) { fail++; process.stderr.write(`  ✗ ${id} — ${String(e.message || e).slice(0, 90)}\n`); }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`\nuploaded: ${up} | skipped: ${skip} | failed: ${fail}`);
process.exit(0);
