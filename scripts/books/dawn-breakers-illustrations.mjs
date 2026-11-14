#!/usr/bin/env node
// Builds data/illustrations.json: every plate of Shoghi Effendi's Dawn-Breakers (1932) — its caption from the edition's HTML (never a
// file name or alt text), the doc 21308 paragraph it faces, its chapter, the places its caption names and the people bound to it by the
// REVIEWED table below (a name is evidence, not identity). Reads the public API (doc paragraphs, the person index); no DB access.
// --upload: each full-size original (library folder, PNG) → R2 cdn-assets siftersearch.com/illustrations/dawn-breakers/ (R2 REST, as
// scripts/entity-read/bio-r2-upload-api.mjs).   node scripts/books/dawn-breakers-illustrations.mjs [--upload]
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fold, PLACES } from '../../api/lib/illustrations.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const API = 'https://api.siftersearch.com';
const DOC = 21308;
const LIB = path.join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/staging');
const HTML = path.join(LIB, 'dawn-breakers-ar/data/Nabil, The Dawn-Breakers.html');
const ORIGINALS = path.join(LIB, 'books-work/assets/img/db - original');
const KEY_PREFIX = 'illustrations/dawn-breakers';   // cdn-assets key = siftersearch.com/<this>/<file>

// Person index id → the forms a PASSAGE names them by (folded). A person binds to a plate only through BIND (caption read by hand,
// 11-14); people the captions name but the index lacks (Shaykh Aḥmad, Siyyid Káẓim, Mírzá Buzurg, Ashraf, Ḥájí Ímán) bind nobody.
const KEYS = {
  1247931: ['nabil i azam', 'nabil i zarandi', 'nabil'], 1247687: ['fath ali shah'], 1247712: ['aqay i kalim', 'mirza musa'], 1247902: ['siyyid javad i karbilai'],
  1247570: ['haji mirza siyyid ali', 'khal i azam'], 1247583: ['manuchihr khan', 'mutamidud dawlih'], 1249196: ['haji mirza jani'], 1247565: ['muhammad shah'],
  1247567: ['haji mirza aqasi'], 1247566: ['nasirid din shah'], 1249103: ['qaim maqam'], 1247606: ['saidul ulama'], 1249462: ['mirza muhammad taqi'],
  1254435: ['mirza abu talib'], 1247553: ['vahid'], 1247568: ['mirza taqi khan', 'amir nizam'], 1247591: ['mamaqani'], 1247580: ['hujjat'],
  1247616: ['kalantar', 'mahmud khan'], 1247554: ['tahirih', 'qurratul ayn'], 1247551: ['the bab'], 1247564: ['mulla husayn'], 1247562: ['bahaullah'],
  1247563: ['abdul baha'], 1247552: ['quddus'], 1247648: ['imam husayn'],
};
const P = (...ids) => ids;
const BAB = 1247551, MH = 1247564, BAHA = 1247562, TAH = 1247554, VAHID = 1247553, HUJJAT = 1247580, QUDDUS = 1247552;
// file stem → person ids, each read from the caption ("Home of Mullá Ḥusayn", "Bahá’u’lláh’s House in Afchih"); a plate's
// captionless half takes its caption, so its binding too.
const BIND = {
  '00-lxiii-nabil': P(1247931), '06-sons-of-shah': P(1247687), '06-shah': P(1247687), '103-aqay-i-kalim': P(1247712), '189-siyyid-javad': P(1247902),
  '192-house-of-mirza-ali': P(1247570), '193-house-of-mirza-ali': P(1247570), '206-house-of-mutamid': P(1247583), '211-manuchihr-khan': P(1247583),
  '220-house-of-mirza-jani1': P(1249196), '220-house-of-mirza-jani2': P(1249196, BAB), '229-muhammad-shah': P(1247565), '233-haji-mirza-aqasi': P(1247567),
  '314-shah-as-child': P(1247566, 1249103, 1247567, 1247583), '315-nasirid-din-shah': P(1247566), '316-nasirid-din-shah': P(1247566),
  '334-house-of-saidul-ulama': P(1247606), '350-house-of-muhammad-taqi': P(1249462), '428-mirza-abu-talib': P(1254435), '500-mirza-taqi-khan': P(1247568),
  '509-house-of-mamaqani': P(1247591), '623-house-of-kalantar': P(1247616, TAH),
  '466-vahids-house-yazd': P(VAHID), '479-vahids-house-nayriz': P(VAHID), '480-vahids-room-in-fort': P(VAHID), '492-masjid-i-jami': P(VAHID), '498-vahids-resting-place': P(VAHID),
  '528-masjid-built-for-hujjat': P(HUJJAT), '571-hujjats-house-zanjan': P(HUJJAT), '578-square-zanjan': P(HUJJAT),
  '78-tahirihs-handwriting': P(TAH), '274-houses-of-tahirih': P(TAH), '275-tahirihs-library': P(TAH), '626-garden-ilkhani': P(TAH),
  '00-inmost-shrine': P(BAB), '64-entrance': P(BAB), '54-orange-tree-planted-by-the-bab': P(BAB), '64-steps-to-declaration-chamber': P(BAB), '58-sitting-room': P(BAB),
  '58-upper-room': P(BAB), '55-the-babs-samovar': P(BAB), '60-bedchamber': P(BAB), '60-sitting-room': P(BAB), '60-mothers-room': P(BAB), '64-original-window': P(BAB),
  '53-shiraz-masjid-i-ilkani': P(BAB, MH), '56-room-bab-born': P(BAB), '56-outskirts-shiraz': P(BAB), '71-public-bath': P(BAB), '73-qahviyih-awliya': P(BAB),
  '74-resting-place-of-babs-wife': P(BAB), '74-resting-place-of-babs-son': P(BAB), '133-coat-worn-by-bab': P(BAB), '133-cap-worn-by-bab': P(BAB),
  '135-cloth-worn-by-bab': P(BAB), '52-masjid-i-vakil2': P(BAB), '203-masjid-i-jumih-isfahan': P(BAB), '210-Imarat-i-khurshid2': P(BAB),
  '238-citadel-of-tabriz': P(BAB), '310-house-occupied-by-bab-urumiyyih': P(BAB), '318-corner-where-bab-bastinadoed': P(BAB), '503-prayer-beads-bab': P(BAB),
  '503-quran-bab': P(BAB), '511-barrack-square-tabriz': P(BAB), '517-moat-surrounding-tabriz': P(BAB), '520-imam-zadih-hasan': P(BAB), '535-caravanserai-masum': P(BAB),
  '666-shrine-bab': P(BAB),
  '49-home-of-mulla-husayn': P(MH), '124-mosque-gawhar-shad-mashhad': P(MH), '124-mosque-gawhar-shad-mashhad2': P(MH), '327-masjid-exterior': P(MH), '380-tree-mh-was-shot': P(MH),
  '105-house-of-baha': P(BAHA), '105-house-of-baha-2': P(BAHA), '110-approach-to-home-takur': P(BAHA), '110-ruins-home-takur': P(BAHA), '115-exterior-room-baha': P(BAHA),
  '115-interior-room-baha': P(BAHA), '442-madrisiy-i-sadr': P(BAHA), '597-village-afchih': P(BAHA), '597-house-of-baha': P(BAHA), '598-baha-summer-home-shimiran': P(BAHA),
  '640-ruins-house-baha-takur': P(BAHA), '662-house-baha-baghdad': P(BAHA), '115-exterior-room-abd': P(1247563), '115-interior-room-abd': P(1247563),
  '182-house-quddus': P(QUDDUS), '412-madrisih-zaki1': P(QUDDUS), '412-madrisih-zaki2': P(QUDDUS),
  '26-shrine-of-husayn-in-karbila': P(1247648), '29-shrine-of-husayn-in-karbila': P(1247648),
};
// plates that are a person's likeness (not a place they knew)
const PORTRAITS = new Set(['00-lxiii-nabil', '01-shaykh-ahmad', '06-sons-of-shah', '06-shah', '011-mirza-buzurg', '103-aqay-i-kalim', '189-siyyid-javad', '211-manuchihr-khan',
  '229-muhammad-shah', '233-haji-mirza-aqasi', '314-shah-as-child', '315-nasirid-din-shah', '316-nasirid-din-shah', '317-eminent-mujtahids', '427-muhammad-rida',
  '428-mirza-abu-talib', '500-mirza-taqi-khan', '579-haji-iman']);
const CAPTION = { '00-liv': 'Genealogy of the Prophet Muḥammad' };   // a chart whose caption is the heading above it

// `<u>Sh</u>` → "S̱h" (the library's form: the macron under the first letter)
export const strip = (s) => String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<u>(.*?)<\/u>/gi, (m, a) => `${a[0]}̱${a.slice(1)}`)
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().normalize('NFC');
const SMALL = new Set(['of', 'the', 'and', 'in', 'at', 'by', 'where', 'which', 'to', 'a', 'on', 'from', 'is', 'her', 'his', 'one']);
export const titleCase = (s) => (s !== s.toUpperCase() ? s : s.toLowerCase().split(' ')
  .map((w, i) => (i && SMALL.has(w) ? w : w.replace(/^([^\p{L}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase()).replace(/-(i|u)-/g, '-$1-').replace(/-(\p{L})(?=\p{L}{3})/gu, (m, b) => `-${b.toUpperCase()}`)))
  .join(' '));

/** The edition's HTML → { chapters: [{ n, title, texts }], plates: [{ file, caption, title, sub, chapter, page, before, after }] }. */
export function parseEdition(html) {
  const chapters = [], plates = [];
  let chapter = null, page = null, lastText = null, heading = null, plateTitle = null, plateKey = null, sincePlate = 0;
  const re = /<section class="content chapter" id="db_chapter_(\d+)"[\s\S]*?<h3 class="title[^"]*">([\s\S]*?)<\/h3>|<p class="illustration([^"]*)">([\s\S]*?)<\/p>|<p id="(\d+)\.(\d+)"[^>]*>([\s\S]*?)<\/p>|<h3 class="subhead[^"]*"[^>]*>([\s\S]*?)<\/h3>|data-pg="([ivxlc\d]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { chapter = { n: +m[1], title: titleCase(strip(m[2])), texts: [] }; chapters.push(chapter); }
    else if (m[4] != null) {
      const body = m[4], parts = body.split(/<img\b/);
      const head = strip(parts[0]);
      const pg = /data-pg="(\d+)"/.exec(body);
      for (const part of parts.slice(1)) {
        const file = /src="[^"]*\/([^"/]+)"/.exec(part)?.[1];
        if (!file) continue;
        const stem = file.replace(/\.[a-z]+$/i, ''), key = stem.split('-')[0];
        if (head) { plateTitle = titleCase(head); plateKey = key; }
        else if (sincePlate > 0 || plateKey !== key) plateTitle = null;   // a plate title carries over only to its own next images
        const sub = titleCase(strip(part.replace(/^[^>]*>/, '').replace(/<span[^>]*data-pg[^>]*><\/span>/g, '')));
        plates.push({ file, stem, key, title: plateTitle, sub: sub || null, heading, chapter: chapter?.n ?? 0, page: pg ? +pg[1] : page, before: lastText, after: null });
      }
      sincePlate = 0;
    } else if (m[5]) {
      const t = strip(m[7]);
      for (const p of plates) if (p.after == null && p.before === lastText) p.after = t;
      lastText = t; sincePlate++;
      for (const pm of m[7].matchAll(/data-pg="(\d+)"/g)) page = +pm[1];
      if (chapter && +m[5] === chapter.n) chapter.texts.push(t);
    } else if (m[8] != null) heading = strip(m[8]);
    else if (m[9] && /^\d+$/.test(m[9])) page = +m[9];
  }
  for (const p of plates) {
    const own = p.title && p.sub && fold(p.title) !== fold(p.sub) ? `${p.title}: ${p.sub}` : p.sub || p.title;
    p.caption = CAPTION[p.stem] || own || null;
  }
  // a captionless half of a plate takes the caption of the same plate (same page number in the file name, nearest captioned)
  plates.forEach((p, i) => {
    if (p.caption) return;
    const mates = plates.map((q, j) => ({ q, d: Math.abs(j - i) })).filter(({ q }) => q !== p && q.key === p.key && q.caption).sort((a, b) => a.d - b.d);
    if (mates[0]) { p.caption = mates[0].q.caption; p.shared = mates[0].q.stem; }
  });
  return { chapters, plates };
}

const key60 = (t) => fold(String(t || '').replace(/\[pg [^\]]*\]/g, '').replace(/\[\^?\d+\]/g, '')).slice(0, 60);
async function getJson(url, tries = 5) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
    catch (e) { if (i >= tries) throw e; await new Promise((ok) => setTimeout(ok, 2000 * i)); }
  }
}
const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];

async function put(key, bytes) {
  const { CLOUDFLARE_ACCOUNT_ID: acct, CLOUDFLARE_API_TOKEN: token } = process.env;
  if (!acct || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing (.env-secrets)');
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets/cdn-assets/objects/${key.split('/').map(encodeURIComponent).join('/')}`;
  for (let i = 1; ; i++) {
    const r = await fetch(url, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: bytes }).catch((e) => ({ ok: false, status: e.message, text: async () => '' }));
    if (r.ok) return;
    if (i >= 4) throw new Error(`R2 put ${key}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    await new Promise((ok) => setTimeout(ok, 3000 * i));
  }
}

async function main() {
  const upload = process.argv.includes('--upload');
  const { chapters, plates } = parseEdition(readFileSync(HTML, 'utf8'));
  const paras = [];
  for (let o = 0; ; o += 200) {
    const j = await getJson(`${API}/api/library/documents/${DOC}?paragraphLimit=200&paragraphOffset=${o}`);
    paras.push(...(j.paragraphs || []));
    if ((j.paragraphs || []).length < 200) break;
  }
  const byKey = new Map(), byPage = new Map();
  for (const p of paras) {
    const k = key60(p.text); if (k.length >= 30 && !byKey.has(k)) byKey.set(k, p.paragraph_index);
    for (const m of String(p.text).matchAll(/\[pg (\d+)\]/g)) if (!byPage.has(+m[1])) byPage.set(+m[1], p.paragraph_index);
  }
  const at = (t) => (t ? byKey.get(key60(t)) ?? null : null);
  const ranges = chapters.map((c) => { const idx = c.texts.map(at).filter((x) => x != null); return idx.length ? { n: c.n, title: c.title, from: Math.min(...idx), to: Math.max(...idx) } : null; }).filter(Boolean);
  // chapter ranges tile the doc: each runs to the next chapter's start (a plate set between chapters belongs to the one before)
  ranges.forEach((r, i) => { if (ranges[i + 1]) r.to = ranges[i + 1].from - 1; });
  if (ranges.length) ranges[0].from = 1;
  const { people } = await getJson(`${API}/api/v1/people?limit=2000`);
  const named = new Map(people.map((p) => [p.id, p.name]));
  const images = [], notes = [];
  for (const p of plates) {
    if (!p.caption) { notes.push(`${p.file}: no caption — left out`); continue; }
    const src = path.join(ORIGINALS, `${p.stem}.png`);
    if (!existsSync(src)) { notes.push(`${p.file}: no original in the library folder — left out`); continue; }
    const bytes = readFileSync(src), [w, h] = pngSize(bytes);
    const para = at(p.before) ?? at(p.after) ?? (p.page ? byPage.get(p.page) ?? null : null);
    const chapter = (para != null ? ranges.find((r) => para >= r.from && para <= r.to)?.n : null) ?? (p.chapter || null);
    const fc = fold(p.caption);
    const ppl = (BIND[p.stem] || []).map((id) => { if (!named.has(id)) notes.push(`${p.stem}: person ${id} not in the index`); return { id, name: named.get(id) ?? null, keys: KEYS[id] || [] }; }).filter((x) => x.name);
    const places = PLACES.filter((pl) => pl.keys.some((k) => ` ${fc} `.includes(` ${k} `))).map((pl) => pl.name);
    images.push({ id: `db-${p.stem.toLowerCase()}`, doc: DOC, para, chapter, page: p.page ?? null, caption: p.caption, ...(p.shared ? { plate_of: `db-${p.shared.toLowerCase()}` } : {}),
      credit: 'The Dawn-Breakers (1932), Shoghi Effendi’s edition', r2: `${KEY_PREFIX}/${p.stem}.png`, w, h, v: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
      kind: PORTRAITS.has(p.stem) ? 'portrait' : 'scene', people: ppl, places });
    if (upload) { await put(`siftersearch.com/${KEY_PREFIX}/${p.stem}.png`, bytes); process.stdout.write('.'); }
  }
  // the per-chapter edition (one doc per chapter, author books-dawnbreakers-chapters-N) shares these plates by chapter
  const chapterDocs = Object.fromEntries(Object.entries(CHAPTER_DOCS).map(([n, d]) => [d, +n]));
  const out = { version: 1, source: 'Nabíl, The Dawn-Breakers (1932, Shoghi Effendi’s edition): its plates and captions', built: new Date().toISOString().slice(0, 10),
    docs: { [DOC]: { title: 'The Dawn-Breakers', chapters: ranges } }, chapterDocs, images };
  writeFileSync('data/illustrations.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\n${plates.length} plates found; ${images.length} indexed (${images.filter((x) => x.para != null).length} at a paragraph; ${images.filter((x) => x.kind === 'portrait').length} portraits; ${images.filter((x) => x.places.length).length} with places; ${images.filter((x) => x.people.length).length} with people); ${ranges.length} chapters`);
  for (const n of notes) console.log(`  ${n}`);
}
// the older per-chapter edition's doc ids (library, 11-14; chapter XX's doc not found)
const CHAPTER_DOCS = { 1: 33841, 2: 33852, 3: 33859, 4: 33860, 5: 33861, 6: 33862, 7: 33863, 8: 33864, 9: 33865, 10: 33842, 11: 33843, 12: 33844, 13: 33845,
  14: 33846, 15: 33847, 16: 33848, 17: 33849, 18: 33850, 19: 33851, 21: 33853, 22: 33854, 23: 33855, 24: 33856, 25: 33857, 26: 33858 };

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
