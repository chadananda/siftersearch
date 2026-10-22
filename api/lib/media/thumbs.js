// A picture of the speaker for audio-only items (Chad 10-21): Wikidata's image (P18) of a person whose description names
// the Bahá'í Faith, from Wikimedia Commons with its licence and author kept for attribution; else a generated tile
// (initials + the talk's waveform). The source URL and licence go in meta.json. fetch injected for tests.
const UA = 'SifterSearch media library (https://siftersearch.com; chadananda@gmail.com)';
const WD = 'https://www.wikidata.org/w/api.php', COMMONS = 'https://commons.wikimedia.org/w/api.php';
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Licences we accept for a reused photo (attribution kept): public domain and CC BY / BY-SA. */
export const okLicence = (l) => /^(public domain|pd|cc0|cc[ -]by(-sa)?[ -]?\d|cc[ -]by(-sa)?$)/i.test(String(l || '').trim());

/** Does a Wikidata description place the person in the Bahá'í Faith (or name the tradition we expect)? */
export const describesBahai = (desc, tradition = "Baha'i") => (/bah[aá]/i.test(tradition) ? /bah[aá][’'‘]?[ií]/i.test(String(desc || '')) : !!desc);

const BAHAI_FAITH = 'Q22679';   // Wikidata: Bahá'í Faith (religion, P140)
const ascii = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ`´']/g, '').trim();

/** Commons image info for a file name → { url, source_url, licence, artist } when its licence is accepted, else null. */
async function commonsInfo(get, file) {
  const ii = await get(`${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=480&titles=${encodeURIComponent(file.startsWith('File:') ? file : `File:${file}`)}`);
  const info = Object.values(ii?.query?.pages || {})[0]?.imageinfo?.[0];
  const md = info?.extmetadata || {};
  const licence = strip(md.LicenseShortName?.value);
  if (!info?.thumburl || !okLicence(licence) || !/^image\/(jpeg|png)/.test(info.mime || 'image/jpeg')) return null;
  return { url: info.thumburl, source_url: info.descriptionurl, licence, licence_url: md.LicenseUrl?.value || null, artist: strip(md.Artist?.value).slice(0, 200) };
}

/**
 * 1) Wikidata: a person of that name whose description names the Bahá'í Faith or whose religion (P140) is the Bahá'í
 *    Faith, with an image (P18); 2) Commons: a photo whose FILE NAME carries the person's first and last name. Licences:
 *    public domain / CC BY / CC BY-SA only, author kept. (Names are searched without diacritics: Wikidata finds
 *    "Ali Nakhjavani", not "‘Alí Nakhjavání".)
 */
export async function findSpeakerImage(name, { tradition = "Baha'i", fetchImpl = fetch, commonsSearch = true } = {}) {
  const plain = ascii(name);
  const toks = plain.toLowerCase().split(/[\s-]+/).filter((t) => t.length > 1);
  if (toks.length < 2) return null;   // a surname alone is too ambiguous to picture
  const get = async (url) => (await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).json();
  const s = await get(`${WD}?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(plain)}`);
  for (const e of s?.search || []) {
    const ent = await get(`${WD}?action=wbgetentities&format=json&props=claims&ids=${e.id}`);
    const claims = ent?.entities?.[e.id]?.claims || {};
    const religion = (claims.P140 || []).map((c) => c?.mainsnak?.datavalue?.value?.id);
    if (!describesBahai(e.description, tradition) && !(/bah[aá]/i.test(tradition) && religion.includes(BAHAI_FAITH))) continue;
    const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) continue;
    const info = await commonsInfo(get, file);
    if (info) return { ...info, wikidata: e.id, who: `${e.label} — ${e.description || ''}`, kind: 'photo' };
  }
  // (the file-name search finds namesakes — "Chad Jones" the economist, "Stephen Phelps House" — so the portrait finder
  // in speakers.js turns it off and relies on Bahá'í-verified sources)
  if (!commonsSearch) return null;
  const c = await get(`${COMMONS}?action=query&format=json&list=search&srnamespace=6&srlimit=10&srsearch=${encodeURIComponent(`"${plain}"`)}`);
  for (const hit of c?.query?.search || []) {
    const t = ascii(hit.title).toLowerCase();
    if (!toks.every((k) => t.includes(k)) || !/\.(jpe?g|png)$/i.test(hit.title)) continue;
    const info = await commonsInfo(get, hit.title);
    if (info) return { ...info, who: hit.title, kind: 'photo', via: 'commons-search' };
  }
  return null;
}

const escX = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** A generated tile: the speaker's initials over the talk's waveform. peaks: BBC data array (min/max pairs). */
export function tileSvg({ speaker = '', title = '', peaks = [] }) {
  const initials = String(speaker || title || '?').split(/[\s-]+/).filter((w) => /^\p{Lu}/u.test(w)).slice(0, 2).map((w) => w[0]).join('') || '♪';
  const n = 120, pts = [];
  const pairs = peaks.length / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.floor((i / n) * pairs) * 2;
    const v = pairs ? Math.max(Math.abs(peaks[k] || 0), Math.abs(peaks[k + 1] || 0)) / 128 : 0.3;
    pts.push(`${(i * 480 / n).toFixed(1)},${(360 - v * 80).toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480"><rect width="480" height="480" fill="#2b2620"/>`
    + `<polyline points="${pts.join(' ')}" fill="none" stroke="#e0a94a" stroke-width="3" opacity=".7"/>`
    + `<text x="240" y="230" font-family="Georgia,serif" font-size="150" fill="#f4ecdc" text-anchor="middle">${escX(initials)}</text>`
    + `<text x="240" y="430" font-family="system-ui,sans-serif" font-size="22" fill="#cdbfa6" text-anchor="middle">${escX(String(speaker || '').slice(0, 36))}</text></svg>`;
}
