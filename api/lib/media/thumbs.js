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

export async function findSpeakerImage(name, { tradition = "Baha'i", fetchImpl = fetch } = {}) {
  if (!name || String(name).split(/\s+/).length < 2) return null;   // a surname alone is too ambiguous to picture
  const get = async (url) => (await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).json();
  const s = await get(`${WD}?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(name)}`);
  for (const e of s?.search || []) {
    if (!describesBahai(e.description, tradition)) continue;
    const c = await get(`${WD}?action=wbgetclaims&format=json&property=P18&entity=${e.id}`);
    const file = c?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!file) continue;
    const ii = await get(`${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=480&titles=${encodeURIComponent(`File:${file}`)}`);
    const info = Object.values(ii?.query?.pages || {})[0]?.imageinfo?.[0];
    const md = info?.extmetadata || {};
    const licence = strip(md.LicenseShortName?.value);
    if (!info?.thumburl || !okLicence(licence)) continue;
    return { url: info.thumburl, source_url: info.descriptionurl, licence, licence_url: md.LicenseUrl?.value || null, artist: strip(md.Artist?.value).slice(0, 200),
      wikidata: e.id, who: `${e.label} — ${e.description}`, kind: 'photo' };
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
