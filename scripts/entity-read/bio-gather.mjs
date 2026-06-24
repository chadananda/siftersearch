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
// curated SEARCH TERMS for figures whose canonical name doesn't search cleanly (search resolves apostrophes/
// redirects; exact-title lookup was fragile). For these we trust the top non-group hit.
const QUERIES = {
  1247563: "Abdu'l-Baha", 1248214: 'Shoghi Effendi', 1247564: 'Mulla Husayn Bushrui', 1247552: 'Quddus Babi',
  1247554: 'Tahirih', 1247711: 'Bahiyyih Khanum', 1247566: 'Naser al-Din Shah Qajar', 1247674: 'Moses',
  1247826: 'Asiyih Khanum', 1247553: 'Yahya Darabi Vahid', 1247568: 'Amir Kabir', 1247676: 'Jesus',
  1247679: 'Gautama Buddha', 1247946: 'Mirza Agha Khan Nuri', 1247580: 'Hujjat Zanjani', 1247675: 'Zoroaster',
  1247678: 'Krishna', 1247683: 'Abraham', 1249921: 'Munirih Khanum', 1247565: 'Mohammad Shah Qajar',
  1247567: 'Haji Mirza Aqasi', 1247583: 'Manuchehr Khan Gorji Motamed', 1247600: 'Kazim Rashti', 1247744: 'Abdulaziz Ottoman sultan',
  1247599: 'Shaykh Ahmad Ahsai', 1247926: 'Queen Victoria', 1248174: 'Martha Root', 1247931: 'Nabil Zarandi',
  1247598: 'Subh-i-Azal', 1247664: 'Arthur de Gobineau', 1247661: 'George Curzon 1st Marquess Curzon',
  1247794: 'Napoleon III', 1247825: 'Mirza Mihdi Purest Branch', 1247648: 'Husayn ibn Ali', 1247677: 'Ali ibn Abi Talib',
  1247675: 'Zoroaster',
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

const GROUP = /\b(timeline|split|list of|family|Letters of the Living|martyrs|Bahá|Babism|religion)\b/i;
async function resolveTitle(p) {
  const curated = !!QUERIES[p.id];
  const q = QUERIES[p.id] || p.cn.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const d = await j(`${API}?action=query&format=json&list=search&srlimit=5&srsearch=${enc(q)}`);
  const hits = (d?.query?.search || []).filter(h => !GROUP.test(h.title));
  if (curated) return { title: hits[0]?.title || null, curated: true };       // trust my precise query
  // non-curated: require the GIVEN-NAME token (first significant token) to appear in the title — avoids
  // nisba-only false matches (Báqir-i-Tabrízí -> "Shams Tabrizi")
  const given = tokens(p.cn)[0];
  if (!given) return { title: null, curated: false };
  for (const h of hits) if (new Set(tokens(h.title)).has(given)) return { title: h.title, curated: false };
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
