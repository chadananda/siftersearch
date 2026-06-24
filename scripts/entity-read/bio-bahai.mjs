// Supplement the bio collection from bahai.media (the Bahá'í Media Wiki — same transliteration as our names,
// covers the Bábí/Bahá'í figures Wikipedia lacks). For each important figure WITHOUT a Wikipedia portrait,
// search the File namespace, FILTER out non-portrait files (calligraphy, memorials, houses, graves, group
// photos), token-verify the name, and PROPOSE candidates. Downloads only curated File titles (FILES map) into
// the existing bio-assets folder, recording the bahai.media File-page URL for license review (extmetadata is
// empty there, so licensing must be confirmed before any public use). Env: WRITE.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const ROOT = process.env.HOME + '/sifter/bio-assets';
const M = 'https://bahai.media/api.php';
const EXCL = new Set([1247562, 1247551, 1247647]);
// curated File titles confirmed by review (id -> bahai.media File: title). Filled after the proposal pass.
const FILES = JSON.parse(process.env.FILES || '{}');
const NONPORTRAIT = /memorial|\bhouse\b|grave|school|calligraph|\bplan\b|\bmap\b|monument|temple|shrine|garden|document|letter|tablet|certificate|conference|assembly|delegates|group|building|room|\bsite\b|resting|mansion|prison|cell|barracks|seal|stamp|coin|banknote|facsimile|manuscript|signature/i;
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/gi, ' ').toLowerCase();
const STOP = new Set(['mulla', 'mirza', 'siyyid', 'haji', 'aqa', 'shaykh', 'the', 'of', 'sultan', 'khan', 'shah', 'i', 'file', 'png', 'jpg']);
const toks = s => norm(s).split(/\s+/).filter(t => t.length > 3 && !STOP.has(t));
const j = async u => { const r = await fetch(u, { headers: { 'User-Agent': 'SifterSearch-bio/1.0 (chadananda@gmail.com)' } }); return r.json(); };
const enc = encodeURIComponent;
const manifest = existsSync(ROOT + '/manifest.json') ? JSON.parse(readFileSync(ROOT + '/manifest.json', 'utf8')) : {};

let people = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.importance>=45 ORDER BY ge.importance DESC`)).filter(p => !EXCL.has(p.id));
// only figures that do NOT already have a Wikipedia portrait
people = people.filter(p => manifest[p.id]?.status !== 'image' || FILES[p.id]);

async function fileInfo(title) {
  const d = await j(`${M}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=700&titles=${enc(title)}`);
  const ii = Object.values(d?.query?.pages || {})[0]?.imageinfo?.[0];
  return ii ? { thumb: ii.thumburl || ii.url, full: ii.url, page: ii.descriptionurl, license: ii.extmetadata?.LicenseShortName?.value || null } : null;
}
const out = []; const CONC = 3;
for (let i = 0; i < people.length; i += CONC) {
  const batch = await Promise.all(people.slice(i, i + CONC).map(async p => {
    let aliases = []; try { aliases = JSON.parse(p.a || '[]'); } catch {}
    const queries = [p.cn.replace(/\s*\([^)]*\)\s*$/, '').trim(), ...aliases.filter(x => /[A-Za-z]/.test(x)).slice(0, 2)];
    const want = new Set(toks(p.cn).concat(...aliases.map(toks)));
    const seen = new Set(), cands = [];
    for (const q of queries) {
      const d = await j(`${M}?action=query&format=json&list=search&srnamespace=6&srlimit=6&srsearch=${enc(q)}`);
      for (const h of (d?.query?.search || [])) {
        if (seen.has(h.title) || NONPORTRAIT.test(h.title)) continue; seen.add(h.title);
        const ht = new Set(toks(h.title));
        if ([...want].some(t => ht.has(t))) cands.push(h.title);
      }
    }
    const rec = { id: p.id, cn: p.cn, imp: p.imp, candidates: cands.slice(0, 5) };
    if (FILES[p.id]) {                                   // curated -> fetch + (WRITE) download
      const info = await fileInfo(FILES[p.id]);
      if (info) { rec.chosen = FILES[p.id]; rec.info = info;
        if (WRITE) { const dir = `${ROOT}/${p.id}-${slug(p.cn)}`; mkdirSync(dir, { recursive: true });
          try { const ext = (info.thumb.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4); const fr = await fetch(info.thumb, { headers: { 'User-Agent': 'SifterSearch-bio/1.0' } }); const buf = Buffer.from(await fr.arrayBuffer()); writeFileSync(`${dir}/portrait.${ext}`, buf); rec.downloaded = `portrait.${ext}`; rec.bytes = buf.length;
            const bp = `${dir}/bio.json`; if (existsSync(bp)) { const bio = JSON.parse(readFileSync(bp, 'utf8')); bio.bahai_media = { file: FILES[p.id], page: info.page, full: info.full, license: info.license }; bio.portrait = rec.downloaded; bio.portrait_source = 'bahai.media'; writeFileSync(bp, JSON.stringify(bio, null, 1)); }
            manifest[p.id] = { ...(manifest[p.id] || {}), status: 'image', portrait: rec.downloaded, source: 'bahai.media', file: FILES[p.id] };
          } catch (e) { rec.err = String(e).slice(0, 60); } }
      }
    }
    return rec;
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, people.length)}/${people.length}\n`);
}
if (WRITE) writeFileSync(ROOT + '/manifest.json', JSON.stringify(manifest, null, 1));
const withCand = out.filter(o => o.candidates.length);
console.log(`\nno-WP-portrait figures checked: ${out.length} | with bahai.media portrait candidates: ${withCand.length} | downloaded: ${out.filter(o => o.downloaded).length}\n`);
for (const o of withCand) console.log(`  [${o.id}] ${o.cn}${o.downloaded ? ' ✓DL ' + Math.round(o.bytes / 1024) + 'KB' : ''}\n      ${o.candidates.join('  |  ')}`);
process.exit(0);
