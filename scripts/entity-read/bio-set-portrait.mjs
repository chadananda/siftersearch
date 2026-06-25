// Set a specific portrait for ONE entity, from a bahai.media File (FILE=) or a local image (LOCAL=).
// Uploads to the cdn-assets R2 bucket, records manifest[id].cdn = "biography/<id>.<ext>", and writes it as
// the dir's portrait.<ext> (removing any prior portrait.*) so directory re-scans stay consistent. A changed
// extension yields a new CDN path, sidestepping ImageKit edge-cache staleness. Run on tower-nas.
// Usage:  ID=1247807 LOCAL=/path/img.png node scripts/entity-read/bio-set-portrait.mjs
//         ID=1249921 FILE="Munírih Khánum 1.jpg" node scripts/entity-read/bio-set-portrait.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' }); dotenv.config({ path: '.env' });
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const ROOT = path.join(process.env.HOME, 'sifter', 'bio-assets');
const R2_BUCKET = 'cdn-assets', PREFIX = 'siftersearch.com/biography';
const CT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const ID = process.env.ID, FILE = process.env.FILE, LOCAL = process.env.LOCAL;
if (!ID || (!FILE && !LOCAL)) { console.error('need ID and FILE= or LOCAL='); process.exit(1); }
const enc = encodeURIComponent;
const manifestPath = path.join(ROOT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
let dir = readdirSync(ROOT).find(d => d.startsWith(ID + '-'));
if (!dir) { dir = `${ID}-portrait`; mkdirSync(path.join(ROOT, dir), { recursive: true }); }
const dirPath = path.join(ROOT, dir);

let buf, ext, source;
if (LOCAL) {
  ext = (LOCAL.split('.').pop() || 'jpg').toLowerCase(); buf = readFileSync(LOCAL); source = 'user-supplied';
} else {
  const j = async u => (await fetch(u, { headers: { 'User-Agent': 'SifterSearch-bio/1.0' } })).json();
  const fi = await j(`https://bahai.media/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=800&titles=File:${enc(FILE)}`);
  const ii = Object.values(fi?.query?.pages || {})[0]?.imageinfo?.[0];
  const url = ii?.thumburl || ii?.url;
  if (!url) { console.error('no bahai.media url for File:', FILE); process.exit(1); }
  ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
  const r = await fetch(url, { headers: { 'User-Agent': 'SifterSearch-bio/1.0' } }); buf = Buffer.from(await r.arrayBuffer()); source = 'bahaipedia';
}
for (const f of readdirSync(dirPath)) if (/^portrait\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)) rmSync(path.join(dirPath, f));
const dest = path.join(dirPath, `portrait.${ext}`); writeFileSync(dest, buf);
execSync(`npx --yes wrangler r2 object put ${JSON.stringify(`${R2_BUCKET}/${PREFIX}/${ID}.${ext}`)} --file ${JSON.stringify(dest)} --content-type ${CT[ext] || 'image/jpeg'} --remote`,
  { env: process.env, stdio: 'pipe', timeout: 60000 });
manifest[ID] = { ...(manifest[ID] || {}), status: 'image', source, portrait: `portrait.${ext}`, cdn: `biography/${ID}.${ext}`, file: FILE || path.basename(LOCAL) };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`set portrait ${ID} → biography/${ID}.${ext} (${source}, ${buf.length} bytes)`);
process.exit(0);
