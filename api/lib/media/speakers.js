// SPEAKER PORTRAITS (Chad 10-22: "feel free to search the web for pictures if we do not have them"; one canonical portrait
// per person, reused by every item; credit shown where known). Sources, best first: Wikidata/Commons (licensed),
// Bahaipedia (its portraits live on bahai.media, a MediaWiki whose file pages carry credit/licence), English Wikipedia
// (only a page that is about a Bahá'í). Each candidate must be a raster image of a usable size and a page whose title
// carries the person's names. The master is kept once on tower; the image worker crops it face-centred per size.
// fetch injected for tests.
import { slugify } from './names.js';
import { findSpeakerImage } from './thumbs.js';

const UA = 'SifterSearch media library (https://siftersearch.com; chadananda@gmail.com)';
export const ascii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`´']/g, '').replace(/\s+/g, ' ').trim();
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Honorifics and titles that are not part of a name ("Mr. Hooper Dunbar", "Dr. Elsie Austin", "Hand of the Cause …"). */
const TITLES = /^(?:mr|mrs|ms|miss|dr|prof|professor|hand of the cause(?: of god)?|counsellor|amatul-baha|jinab-i|jenab|haji|mirza|sir|lady)\.?\s+/i;
export const cleanName = (name) => { let n = ascii(name).replace(/[‘’]/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim(); for (let i = 0; i < 3; i++) n = n.replace(TITLES, ''); return n.trim(); };

/** The person key: the folded name as a slug ("‘Alí Nakhjavání" → "ali-nakhjavani"). null for a surname alone. */
export function speakerKey(name) {
  let n = cleanName(name);
  // a middle initial is not part of the key ("Hooper C. Dunbar" = "Hooper Dunbar") while two full names remain
  const toks = n.split(/\s+/), full = toks.filter((t) => t.replace(/\./g, '').length > 1);
  if (full.length >= 2 && full.length < toks.length) n = full.join(' ');
  if (!n || n.split(/\s+/).length < 2 || /\b(?:audience|questioner|interpreter|narrator|chair|various|unknown|misc)\b/i.test(n)) return null;
  return slugify(n, 60) || null;
}

/** Does a page or file title carry the person's first and last names (folded; hyphens and spaces equal)? */
export function titleMatches(title, name) {
  const t = ` ${ascii(title).toLowerCase().replace(/\.(jpe?g|png|webp|gif)$/, '').replace(/[-_.,]/g, ' ')} `;
  const toks = cleanName(name).toLowerCase().replace(/-/g, ' ').split(/\s+/).filter((x) => x.length > 1);
  const first = toks[0], last = toks[toks.length - 1];
  return !!first && !!last && t.includes(` ${last} `) && (t.includes(` ${first} `) || t.includes(` ${first[0]} `) || toks.length === 1);
}

async function getJson(fetchImpl, url) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  return r.ok === false ? null : r.json();
}

/** A MediaWiki site's page portrait: search → the first page whose title carries the names → its page image → that
 *  file's credit/licence on the file host. check(page) may veto (Wikipedia: the page must be about a Bahá'í). */
async function wikiPortrait(fetchImpl, { api, fileApi, origin }, name, check = null) {
  const q = cleanName(name);
  const s = await getJson(fetchImpl, `${api}?action=query&format=json&list=search&srnamespace=0&srlimit=6&srsearch=${encodeURIComponent(q)}`);
  for (const hit of s?.query?.search || []) {
    if (!titleMatches(hit.title, q)) continue;
    const p = await getJson(fetchImpl, `${api}?action=query&format=json&redirects=1&prop=pageimages|info|extracts&exintro=1&explaintext=1&exchars=600&inprop=url&piprop=original|name&titles=${encodeURIComponent(hit.title)}`);
    const page = Object.values(p?.query?.pages || {})[0];
    const img = page?.original;
    if (!img?.source || !/\.(jpe?g|png|webp)$/i.test(img.source) || (img.width && img.width < 120) || isGroupPhoto(page.pageimage || '')) continue;
    if (check && !check(page)) continue;
    const file = `File:${page.pageimage}`;
    const ii = await getJson(fetchImpl, `${fileApi}?action=query&format=json&prop=imageinfo|revisions&rvprop=content&rvslots=main&iiprop=url|extmetadata&titles=${encodeURIComponent(file)}`).catch(() => null);
    const fp = Object.values(ii?.query?.pages || {})[0];
    const info = fp?.imageinfo?.[0];
    const md = info?.extmetadata || {};
    const inf = parseInformation(fp?.revisions?.[0]?.slots?.main?.['*']);
    const dedupe = (v) => { const x = strip(v); const h = x.length / 2; return x.length % 2 === 0 && x.slice(0, h) === x.slice(h) ? x.slice(0, h) : x; };
    return { url: img.source, width: img.width || null, height: img.height || null, origin, page_url: page.fullurl || null,
      source_url: inf.source && /^https?:/.test(inf.source) ? inf.source : (info?.descriptionurl || img.source), file_page: info?.descriptionurl || null,
      credit: (inf.credit || dedupe(md.Artist?.value || md.Credit?.value)).slice(0, 200) || null, licence: inf.licence || strip(md.LicenseShortName?.value) || null, who: page.title };
  }
  return null;
}

/** The {{Information}} template of a MediaWiki file page → { credit, source, permission, licence } (unknowns dropped). Pure. */
export function parseInformation(wikitext) {
  const t = String(wikitext || '');
  const field = (k) => { const m = new RegExp(`^\\s*\\|\\s*${k}\\s*=(.*)$`, 'im').exec(t); return m ? strip(m[1].replace(/''/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')).trim() : null; };
  const clean = (v) => (v && !/^(unknown|n\/a|none|-)$/i.test(v) ? v : null);
  const lic = /\{\{\s*Baha'?i media bank/i.test(t) ? 'Bahá’í Media Bank (media.bahai.org terms)'
    : (/\{\{\s*(PD[^}|]*|cc-by[^}|]*|Fair use[^}|]*)/i.exec(t)?.[1] || null);
  return { credit: clean(field('Author')), source: clean(field('Source')), permission: clean(field('Permission')), licence: lic };
}

/** A group photograph is not a portrait (face-centred cropping would pick anyone). */
export const isGroupPhoto = (title) => /\b(?:and|with|family|group|children|couple|wedding|conference|members)\b/i.test(ascii(title).replace(/[_-]/g, ' '));

const BAHAIPEDIA = { api: 'https://bahaipedia.org/api.php', fileApi: 'https://bahai.media/api.php', origin: 'bahaipedia' };
const WIKIPEDIA = { api: 'https://en.wikipedia.org/w/api.php', fileApi: 'https://en.wikipedia.org/w/api.php', origin: 'wikipedia' };

/** The best portrait we can find for a person, or null. → { url, origin, source_url, page_url, credit, licence, … } */
export async function findPortrait(name, { fetchImpl = fetch } = {}) {
  const n = cleanName(name);
  if (!speakerKey(n)) return null;
  // Bahaipedia first: its portraits are curated for exactly these people (UHJ members, Hands of the Cause, scholars)
  const bp = await wikiPortrait(fetchImpl, BAHAIPEDIA, n).catch(() => null);
  if (bp) return bp;
  const commons = await findSpeakerImage(n, { fetchImpl, commonsSearch: false }).catch(() => null);
  if (commons) return { ...commons, origin: 'wikimedia-commons', page_url: commons.wikidata ? `https://www.wikidata.org/wiki/${commons.wikidata}` : null, credit: commons.artist || null };
  return wikiPortrait(fetchImpl, WIKIPEDIA, n, (page) => /bah[aá][’'‘]?[ií]/i.test(page.extract || '')).catch(() => null);
}

/** Portraits found by hand (Chad 10-22: "search the web for pictures"): data/media-speaker-portraits.json —
 *  { "<key>": { "wiki": "Bahaipedia page title" } | { "url", "page_url", "credit", "licence" } }. */
export async function portraitFor(name, { overrides = {}, fetchImpl = fetch } = {}) {
  const key = speakerKey(name);
  const o = key && overrides[key];
  if (o?.url) return { origin: 'web', source_url: o.page_url || o.url, ...o };
  if (o?.wiki) return findPortrait(o.wiki, { fetchImpl });
  return findPortrait(name, { fetchImpl });
}

/** Put a portrait master into the cdn-assets R2 bucket (the image worker reads it in place: /img/cdn/siftersearch.com/<key>),
 *  the same path the biography portraits use (scripts/entity-read/bio-r2-upload-api.mjs). → the site-relative key. */
export async function putCdnPortrait(key, bytes, contentType, { fetchImpl = fetch, account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN } = {}) {
  if (!account || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing — cannot store the portrait master in R2');
  const objectKey = `siftersearch.com/${key}`;
  const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/cdn-assets/objects/${objectKey}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: bytes });
  if (!r.ok) throw new Error(`R2 upload ${r.status}`);
  return key;
}

/** A biography portrait already held for this person (bio-assets manifest, keyed by entity id) → { cdn, … } or null. */
export async function biographyPortrait(entityId, { manifest = null } = {}) {
  if (!entityId) return null;
  const m = manifest || (await import('../bio.js')).readBioManifest();
  const e = m?.[String(entityId)];
  return e?.cdn ? e : null;
}
