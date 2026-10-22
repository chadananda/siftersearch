// Media item naming: folding, slugs, and metadata HINTS from a file's path (the LLM naming step and the transcript refine
// them; the slug is fixed at archive time and never changes once published). Pure.

export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`´]/g, "'");

export const slugify = (s, max = 80) => fold(s).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

/** `<speaker surname>-<title>-<year>`, ASCII, ≤ 80 chars; the title alone when no speaker is known. */
export function makeSlug({ speaker, title, year } = {}) {
  const sp = slugify(String(speaker || '').split(/[,&]| and /)[0].trim().split(/\s+/).pop() || '');
  const t = slugify(title || 'untitled', 60);
  const parts = [sp && !t.startsWith(sp) ? sp : '', t, year && !t.includes(String(year)) ? String(year) : ''].filter(Boolean);
  return slugify(parts.join('-'), 80) || 'untitled';
}

/** A slug not in `taken` (a Set or a function): `slug`, `slug-2`, `slug-3`, … */
export function uniqueSlug(slug, taken) {
  const has = typeof taken === 'function' ? taken : (s) => taken.has(s);
  if (!has(slug)) return slug;
  for (let i = 2; ; i++) if (!has(`${slug}-${i}`)) return `${slug}-${i}`;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** A date or year written in a file name: "1995 08 08", "20120623", "23 Nov 1973", "Aug 1988", "c1961". */
export function dateIn(s) {
  const t = String(s || '');
  let m = t.match(/\b((?:19|20)\d{2})[ ._-](\d{1,2})[ ._-](\d{1,2})\b/);
  if (m && +m[2] <= 12 && +m[3] <= 31) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, year: +m[1] };
  m = t.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { date: `${m[1]}-${m[2]}-${m[3]}`, year: +m[1] };
  m = t.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})\b/);
  const mo = m && (MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)]);
  if (mo) return { date: `${m[3]}-${pad(mo)}-${pad(m[1])}`, year: +m[3] };
  // the LAST year in the name: "1952 ARC … Aug 1988" — the leading year is the event recalled, the trailing one the recording
  const ys = [...t.matchAll(/(?:^|[^\d])c?((?:19|20)\d{2})(?!\d)/g)].map((x) => +x[1]);
  return ys.length ? { date: null, year: ys[ys.length - 1] } : { date: null, year: null };
}

const tidy = (s) => String(s || '').replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
const DATE_PART = /^(?:(?:19|20)\d{2}[ ._-]\d{1,2}[ ._-]\d{1,2}|(?:19|20)\d{6}|undated)$/i;
const NOT_SPEAKER = /^(?:class|part|day|talk|session|track|disc|\d+)\b/i;

/**
 * Hints from a path relative to the media root ("Nakhjavani Various/Nakhjavani - The Prayerful Attitude - 1996 11 22.mp3").
 * → { speaker, title, date, year, part, collection, series }. Anything not written in the path is null.
 */
export function parseMediaPath(rel) {
  const segs = String(rel || '').split('/').filter(Boolean);
  const file = segs.pop() || '';
  const base = file.replace(/\.[a-z0-9]{2,5}$/i, '');
  const collection = segs.length ? tidy(segs[0]) : null;
  const series = segs.length > 1 ? tidy(segs[segs.length - 1]) : null;
  const { date, year } = dateIn(base);
  let speaker = null, title = null, part = null, speakerFrom = null;
  // "William_Sears__Prophecies.03" → speaker "William Sears", title "Prophecies", part 3
  const dunder = base.match(/^(.+?)__(.+?)(?:\.(\d{1,3}))?$/);
  if (dunder) {
    speaker = tidy(dunder[1]); title = tidy(dunder[2]); part = dunder[3] ? Number(dunder[3]) : null; speakerFrom = 'file';
  } else {
    const parts = base.split(/\s+-\s+/).map(tidy).filter(Boolean);
    while (parts.length > 1 && DATE_PART.test(parts[parts.length - 1])) parts.pop();
    if (parts.length >= 2 && !NOT_SPEAKER.test(parts[0]) && parts[0].split(/\s+/).length <= 4) { speaker = parts[0]; title = parts.slice(1).join(' - '); speakerFrom = 'file'; }
    else title = parts.join(' - ') || tidy(base);
  }
  if (title) {
    const pm = title.match(/^(.*?)[\s,]+(?:part\s+)?(\d{1,2})(?:\s*\(.*\))?$/i);
    if (pm && pm[1].length > 3 && !/(?:19|20)\d{2}$/.test(title)) { title = pm[1].trim(); part = part ?? Number(pm[2]); }
    title = title.replace(/\s*\((?:\d+|copy)\)$/i, '').replace(/[\s-]+$/, '').trim();
  }
  // a speaker folder ("Taherzadeh Covenant of Baha'u'llah", "Nakhjavani Various", "sharaf's talks/William Sears/…")
  if (!speaker && segs.length) {
    const named = segs.map(tidy).find((s) => /^[A-Z][a-z]+(?: [A-Z][a-z.]+)?(?: Various)?$/.test(s) && !/talks|recordings|audio/i.test(s));
    if (named) { speaker = named.replace(/ Various$/, ''); speakerFrom = 'folder'; }
  }
  if (speaker) speaker = speaker.replace(/,\s*$/, '');
  return { speaker, title, date, year, part, collection, series, speakerFrom };
}
