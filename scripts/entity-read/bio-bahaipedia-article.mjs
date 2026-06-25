// Gather portraits from Bahaipedia ARTICLE pages (not just the File-namespace search): each figure's article
// usually has an infobox portrait. For persons WITHOUT a portrait, find the article, parse its images, take
// the first that is portrait-like AND whose filename shares a name token (double check → right person), then
// fetch the file URL from the shared bahai.media repo and download. Env: MIN (importance), LIMIT, WRITE.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
const { queryAll } = await import('../../api/lib/db.js');
const MIN = +(process.env.MIN || 20), LIMIT = +(process.env.LIMIT || 0), WRITE = process.env.WRITE === '1';
const EXCL = new Set([1247562, 1247551, 1247647]);
const ROOT = process.env.HOME + '/sifter/bio-assets';
const BP = 'https://bahaipedia.org/api.php', MEDIA = 'https://bahai.media/api.php';
const NONPORTRAIT = /memorial|\bhouse\b|grave|school|calligraph|\bplan\b|\bmap\b|monument|temple|shrine|garden|document|letter|tablet|certificate|conference|assembly|delegates|\bgroup\b|building|\bsite\b|resting|mansion|prison|barracks|seal|stamp|coin|facsimile|manuscript|signature|logo|icon|flag|coat[-_ ]of|\.svg$|crest|map[-_ ]of|view[-_ ]of|tomb|shrine|wikidata|commons|placeholder/i;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/gi, ' ').toLowerCase();
const STOP = new Set(['mulla', 'mirza', 'siyyid', 'haji', 'aqa', 'shaykh', 'the', 'of', 'sultan', 'khan', 'shah', 'i', 'file', 'png', 'jpg', 'jpeg', 'portrait', 'photo', 'photograph', 'image', 'circa']);
const toks = (s) => norm(s).split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t));
const j = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'SifterSearch-bio/1.0 (chadananda@gmail.com)' } }); return r.json(); };
const enc = encodeURIComponent;
const manifest = existsSync(ROOT + '/manifest.json') ? JSON.parse(readFileSync(ROOT + '/manifest.json', 'utf8')) : {};

let people = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.religion='' AND ge.importance>=${MIN} ORDER BY ge.importance DESC`)).filter((p) => !EXCL.has(p.id));
people = people.filter((p) => !manifest[p.id]?.cdn && manifest[p.id]?.status !== 'image');  // only those still without a portrait
if (LIMIT) people = people.slice(0, LIMIT);
console.error(`figures without portrait (imp>=${MIN}): ${people.length}`);

const out = []; const CONC = 4;
for (let i = 0; i < people.length; i += CONC) {
  const batch = await Promise.all(people.slice(i, i + CONC).map(async (p) => {
    let aliases = []; try { aliases = JSON.parse(p.a || '[]'); } catch {}
    const want = new Set([...toks(p.cn), ...aliases.flatMap(toks)]);
    const base = p.cn.replace(/\s*\([^)]*\)\s*$/, '').trim();
    try {
      const s = await j(`${BP}?action=query&format=json&list=search&srlimit=3&srsearch=${enc(base)}`);
      const hits = (s?.query?.search || []).filter((h) => !/\b(timeline|list of|martyrs of|disambiguation)\b/i.test(h.title));
      const title = hits.find((h) => new Set(toks(h.title)).size && [...want].some((t) => new Set(toks(h.title)).has(t)))?.title || hits[0]?.title;
      if (!title) return { id: p.id, cn: p.cn, status: 'no-article' };
      // take the first portrait-like image INSIDE the infobox (the subject's box); only trust it for download
      // when the filename ALSO matches the subject's name (avoids leading relative images, e.g. Ásíyih→her son)
      const pr = await j(`${BP}?action=parse&format=json&page=${enc(title)}&prop=text`);
      const html = pr?.parse?.text?.['*'] || '';
      const scope = (html.match(/<table[^>]*class="[^"]*infobox[^"]*"[\s\S]*?<\/table>/i) || [html.slice(0, 3500)])[0];
      let chosen = null, nameMatched = false;
      for (const m of scope.matchAll(/<img[^>]+>/g)) {
        const tag = m[0]; const um = tag.match(/src="([^"]+)"/); if (!um) continue;
        if (!/bahai\.media|\/upload\//i.test(um[1])) continue;
        const w = (tag.match(/\bwidth="(\d+)"/) || [])[1]; if (w && +w < 70) continue;
        const fname = decodeURIComponent((um[1].split('/').pop() || '').replace(/^\d+px-/, '')).replace(/_/g, ' ');
        if (NONPORTRAIT.test(fname)) continue;
        chosen = fname; nameMatched = [...want].some((t) => new Set(toks(fname)).has(t)); break;
      }
      if (!chosen) return { id: p.id, cn: p.cn, status: 'no-image', title };
      if (!nameMatched) return { id: p.id, cn: p.cn, title, file: chosen, status: 'candidate' };
      const fi = await j(`${MEDIA}?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=600&titles=File:${enc(chosen)}`);
      const ii = Object.values(fi?.query?.pages || {})[0]?.imageinfo?.[0];
      const url = ii?.thumburl || ii?.url;
      const rec = { id: p.id, cn: p.cn, title, file: chosen, url, page: ii?.descriptionurl, nameMatched, status: url ? 'found' : 'no-url' };
      if (WRITE && url) {
        const dir = `${ROOT}/${p.id}-${slug(p.cn)}`; mkdirSync(dir, { recursive: true });
        const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
        const fr = await fetch(url, { headers: { 'User-Agent': 'SifterSearch-bio/1.0' } });
        writeFileSync(`${dir}/portrait.${ext}`, Buffer.from(await fr.arrayBuffer()));
        const bp = `${dir}/bio.json`; const bio = existsSync(bp) ? JSON.parse(readFileSync(bp, 'utf8')) : { id: p.id, canonical_name: p.cn };
        bio.bahaipedia = { article: `https://bahaipedia.org/${enc(title)}`, file: chosen, page: ii?.descriptionurl }; bio.portrait = `portrait.${ext}`; bio.portrait_source = 'bahaipedia';
        writeFileSync(bp, JSON.stringify(bio, null, 1));
        manifest[p.id] = { ...(manifest[p.id] || {}), status: 'image', portrait: `portrait.${ext}`, source: 'bahaipedia', file: chosen };
        rec.downloaded = true;
      }
      return rec;
    } catch (e) { return { id: p.id, cn: p.cn, status: 'error', error: String(e).slice(0, 70) }; }
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, people.length)}/${people.length}\n`);
}
if (WRITE) writeFileSync(ROOT + '/manifest.json', JSON.stringify(manifest, null, 1));
const f = out.filter((o) => o.status === 'found');
console.log(`\nfound portraits: ${f.length} | downloaded: ${out.filter((o) => o.downloaded).length} | no-article: ${out.filter((o) => o.status === 'no-article').length} | no-match: ${out.filter((o) => o.status === 'no-match').length}\n`);
for (const o of f) console.log(`  ${o.id} ${o.cn}  ←  ${o.file}${o.nameMatched ? '' : '  ⚠unverified-name'}${o.downloaded ? ' ✓' : ''}`);
process.exit(0);
