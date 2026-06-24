// Start the biography-asset collection. For each important person (importance>=MIN, excluding Bahá'u'lláh /
// the Báb / the Prophet Muḥammad, by request), write a rich bio.json (OUR verified data: summary, side,
// importance, aliases, kinship, research_notes) PLUS a Wikipedia match (title/url/intro extract/image+license).
// A CURATED title map fixes the famous figures; for the rest, only accept a search hit that shares a name
// token (avoids the Áqá-Khán→Subh-i-Azal class of wrong-person match). Image downloaded only for confident
// matches, into ~/sifter/bio-assets/<id>-<slug>/. Env: MIN, LIMIT, OFFSET, WRITE.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const MIN = +(process.env.MIN || 45), LIMIT = +(process.env.LIMIT || 0), OFFSET = +(process.env.OFFSET || 0), WRITE = process.env.WRITE === '1';
const EXCL = new Set([1247562, 1247551, 1247647]);
const ROOT = process.env.HOME + '/sifter/bio-assets';
const API = 'https://en.wikipedia.org/w/api.php';
// curated, verified Wikipedia titles for the famous figures (blind search mis-resolves these)
const TITLES = {
  1247563: "ʻAbdu'l-Bahá", 1248214: 'Shoghi Effendi', 1247564: 'Mullá Husayn', 1247552: 'Quddús',
  1247554: 'Táhirih', 1247711: 'Bahíyyih Khánum', 1247566: 'Naser al-Din Shah Qajar', 1247674: 'Moses',
  1247826: 'Ásíyih Khánum', 1247553: 'Yahya Darabi', 1247568: 'Amir Kabir', 1247676: 'Jesus',
  1247679: 'Gautama Buddha', 1247946: 'Mirza Agha Khan Nuri', 1247580: 'Hujjat-i Zanjani', 1247675: 'Zoroaster',
  1247678: 'Krishna', 1247683: 'Abraham', 1249921: 'Munírih Khánum', 1247565: 'Mohammad Shah Qajar',
  1247567: 'Haji Mirza Aqasi', 1247583: 'Manuchehr Khan Gorji', 1247600: 'Kazim Rashti', 1247744: 'Abdulaziz',
  1247599: 'Shaykh Ahmad', 1247926: 'Queen Victoria', 1248174: 'Martha Root', 1247931: 'Nabíl-i-Aʻzam',
  1247598: 'Subh-i-Azal', 1247664: 'Arthur de Gobineau', 1247661: 'George Curzon, 1st Marquess Curzon of Kedleston',
  1247794: 'Napoleon III', 1247825: 'Mírzá Mihdí (Purest Branch)', 1247648: 'Husayn ibn Ali', 1247677: 'Ali',
  1247642: 'Mohammad Salih Baraghani', 1247554: 'Táhirih', 1247563: "ʻAbdu'l-Bahá",
};
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/gi, ' ').toLowerCase();
const STOP = new Set(['mulla', 'mirza', 'siyyid', 'haji', 'aqa', 'shaykh', 'the', 'of', 'sultan', 'khan', 'shah', 'i']);
const tokens = s => norm(s).split(/\s+/).filter(t => t.length > 3 && !STOP.has(t));
const j = async u => { const r = await fetch(u, { headers: { 'User-Agent': 'SifterSearch-bio/1.0 (chadananda@gmail.com)' } }); return r.json(); };
const enc = encodeURIComponent;

let people = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.side, er.summary, er.aliases, er.kinship, er.research_notes FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.importance>=${MIN} ORDER BY ge.importance DESC`))
  .filter(p => !EXCL.has(p.id));
if (LIMIT) people = people.slice(OFFSET, OFFSET + LIMIT);
console.log(`bio-gather: ${people.length} people (imp>=${MIN})`);
if (WRITE) mkdirSync(ROOT, { recursive: true });
const manifestPath = ROOT + '/manifest.json';
const manifest = (WRITE && existsSync(manifestPath)) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

async function resolveTitle(p) {
  if (TITLES[p.id]) return { title: TITLES[p.id], curated: true };
  const base = p.cn.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const d = await j(`${API}?action=query&format=json&list=search&srlimit=4&srsearch=${enc(base)}`);
  const want = new Set(tokens(p.cn));
  for (const h of (d?.query?.search || [])) {
    if (/\b(timeline|split|list of|family|Letters of the Living)\b/i.test(h.title)) continue;  // group/list articles
    const ht = new Set(tokens(h.title));
    if ([...want].some(t => ht.has(t))) return { title: h.title, curated: false };   // shares a name token
  }
  return { title: null, curated: false };
}
const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const out = []; const CONC = 3;
for (let i = 0; i < people.length; i += CONC) {
  const batch = await Promise.all(people.slice(i, i + CONC).map(async p => {
    const bio = { id: p.id, canonical_name: p.cn, importance: p.imp, side: p.side || null, summary: p.summary || null, aliases: parse(p.aliases), kinship: parse(p.kinship), research_notes: (() => { try { return JSON.parse(p.research_notes || '{}'); } catch { return {}; } })(), wikipedia: null };
    try {
      const { title, curated } = await resolveTitle(p);
      if (title) {
        const d = await j(`${API}?action=query&format=json&prop=pageimages|extracts|pageprops&piprop=original|thumbnail|name&pithumbsize=500&exintro=1&explaintext=1&redirects=1&titles=${enc(title)}`);
        const page = Object.values(d?.query?.pages || {})[0] || {};
        const w = { title, curated, url: 'https://en.wikipedia.org/wiki/' + enc(title.replace(/ /g, '_')), extract: (page.extract || '').slice(0, 600), image_url: page.original?.source || null, thumb_url: page.thumbnail?.source || null };
        if (page.pageimage) { const fi = await j(`${API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File:${enc(page.pageimage)}`); const m = Object.values(fi?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata || {}; w.license = m.LicenseShortName?.value || null; w.credit = (m.Artist?.value || '').replace(/<[^>]+>/g, '').slice(0, 120) || null; }
        bio.wikipedia = w;
      }
    } catch (e) { bio.wiki_error = String(e).slice(0, 80); }
    const hasImg = bio.wikipedia?.image_url;
    bio.status = !bio.wikipedia ? 'no-article' : hasImg ? 'image' : 'no-image';
    if (WRITE) {
      const dir = `${ROOT}/${p.id}-${slug(p.cn)}`; mkdirSync(dir, { recursive: true });
      if (hasImg) {
        try { const ext = (bio.wikipedia.image_url.split('?')[0].split('.').pop() || 'jpg').slice(0, 4); const fr = await fetch(bio.wikipedia.image_url, { headers: { 'User-Agent': 'SifterSearch-bio/1.0 (chadananda@gmail.com)' } }); const buf = Buffer.from(await fr.arrayBuffer()); writeFileSync(`${dir}/portrait.${ext}`, buf); bio.portrait = `portrait.${ext}`; bio.portrait_bytes = buf.length; } catch (e) { bio.portrait_error = String(e).slice(0, 60); }
      }
      writeFileSync(`${dir}/bio.json`, JSON.stringify(bio, null, 1));
    }
    return bio;
  }));
  for (const b of batch) { out.push(b); manifest[b.id] = { id: b.id, cn: b.canonical_name, status: b.status, title: b.wikipedia?.title, curated: b.wikipedia?.curated, portrait: b.portrait, license: b.wikipedia?.license }; }
  process.stderr.write(`  ${Math.min(i + CONC, people.length)}/${people.length}\n`);
}
if (WRITE) writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
const c = s => out.filter(o => o.status === s).length;
console.log(`\nimage: ${c('image')} | no-image: ${c('no-image')} | no-article: ${c('no-article')}\n`);
for (const o of out) console.log(`  [${o.status}${o.wikipedia?.curated ? ' ✓curated' : o.wikipedia ? ' ~search' : ''}${o.portrait_bytes ? ' ' + Math.round(o.portrait_bytes / 1024) + 'KB' : ''}] ${o.canonical_name}  ->  ${o.wikipedia?.title || '-'}`);
process.exit(0);
