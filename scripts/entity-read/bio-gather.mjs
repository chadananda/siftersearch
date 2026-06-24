// Start the biography-asset collection: for each important person (importance>=MIN, excluding Bahá'u'lláh /
// the Báb / the Prophet Muḥammad, per request), search Wikipedia, grab the lead image (+ license/credit) and
// the intro extract, download the image into ~/sifter/bio-assets/<id>-<slug>/, and record a manifest row.
// The matched title + extract are kept so a wrong-person match can be caught on review. Env: MIN, LIMIT, OFFSET, WRITE.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const MIN = +(process.env.MIN || 45), LIMIT = +(process.env.LIMIT || 0), OFFSET = +(process.env.OFFSET || 0), WRITE = process.env.WRITE === '1';
const EXCL = new Set([1247562, 1247551, 1247647]);   // Bahá'u'lláh, the Báb, the Prophet Muḥammad — no images by convention
const ROOT = process.env.HOME + '/sifter/bio-assets';
const API = 'https://en.wikipedia.org/w/api.php';
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
const j = async u => { const r = await fetch(u, { headers: { 'User-Agent': 'SifterSearch-bio-gather/1.0 (chadananda@gmail.com)' } }); return r.json(); };
const enc = encodeURIComponent;

let people = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.side, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.importance>=${MIN} ORDER BY ge.importance DESC`))
  .filter(p => !EXCL.has(p.id));
if (LIMIT) people = people.slice(OFFSET, OFFSET + LIMIT);
console.log(`bio-gather: ${people.length} people (imp>=${MIN})`);
if (WRITE) mkdirSync(ROOT, { recursive: true });
const manifestPath = ROOT + '/manifest.json';
const manifest = (WRITE && existsSync(manifestPath)) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

async function findTitle(cn, side) {
  const base = cn.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const hint = /Bábí|Bahá/i.test(side || '') ? ' Bahai Babi' : '';
  for (const q of [base + hint, base]) {
    const d = await j(`${API}?action=query&format=json&list=search&srlimit=3&srsearch=${enc(q)}`);
    const hits = d?.query?.search || [];
    if (hits.length) return hits[0].title;
  }
  return null;
}
const out = []; const CONC = 3;
for (let i = 0; i < people.length; i += CONC) {
  const batch = await Promise.all(people.slice(i, i + CONC).map(async p => {
    try {
      const title = await findTitle(p.cn, p.side);
      if (!title) return { id: p.id, cn: p.cn, status: 'no-article' };
      const d = await j(`${API}?action=query&format=json&prop=pageimages|extracts|pageprops&piprop=original|thumbnail|name&pithumbsize=500&exintro=1&explaintext=1&redirects=1&titles=${enc(title)}`);
      const page = Object.values(d?.query?.pages || {})[0] || {};
      const wiki_url = 'https://en.wikipedia.org/wiki/' + enc(title.replace(/ /g, '_'));
      const extract = (page.extract || '').slice(0, 400);
      const rec = { id: p.id, cn: p.cn, imp: p.imp, matched_title: title, wiki_url, extract, image_url: page.original?.source || null, thumb_url: page.thumbnail?.source || null, status: page.original ? 'image' : 'no-image' };
      if (page.pageimage) {  // license/credit from the File
        const fi = await j(`${API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&titles=File:${enc(page.pageimage)}`);
        const meta = Object.values(fi?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata || {};
        rec.license = meta.LicenseShortName?.value || null;
        rec.credit = (meta.Artist?.value || '').replace(/<[^>]+>/g, '').slice(0, 120) || null;
        rec.image_file = page.pageimage;
      }
      if (WRITE && rec.image_url) {
        const dir = `${ROOT}/${p.id}-${slug(p.cn)}`; mkdirSync(dir, { recursive: true });
        const ext = (rec.image_url.split('.').pop() || 'jpg').split('?')[0].slice(0, 4);
        const fr = await fetch(rec.image_url, { headers: { 'User-Agent': 'SifterSearch-bio-gather/1.0 (chadananda@gmail.com)' } });
        const buf = Buffer.from(await fr.arrayBuffer());
        writeFileSync(`${dir}/portrait.${ext}`, buf);
        writeFileSync(`${dir}/bio.json`, JSON.stringify(rec, null, 1));
        rec.local = `${p.id}-${slug(p.cn)}/portrait.${ext}`; rec.bytes = buf.length;
      }
      return rec;
    } catch (e) { return { id: p.id, cn: p.cn, status: 'error', error: String(e).slice(0, 80) }; }
  }));
  for (const r of batch) { out.push(r); manifest[r.id] = r; }
  process.stderr.write(`  ${Math.min(i + CONC, people.length)}/${people.length}\n`);
}
if (WRITE) writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
const img = out.filter(o => o.status === 'image').length, noimg = out.filter(o => o.status === 'no-image').length, none = out.filter(o => o.status === 'no-article').length;
console.log(`\nwith image: ${img} | article-no-image: ${noimg} | no-article: ${none} | errors: ${out.filter(o => o.status === 'error').length}\n`);
for (const o of out) console.log(`  [${o.status}${o.license ? ' ' + o.license : ''}] ${o.cn}  ->  ${o.matched_title || '-'}${o.bytes ? '  (' + Math.round(o.bytes / 1024) + 'KB)' : ''}`);
process.exit(0);
