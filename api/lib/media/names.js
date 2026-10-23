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
export function parseMediaPath(rel, { known = [] } = {}) {
  const segs = String(rel || '').split('/').filter(Boolean);
  const file = segs.pop() || '';
  const base = file.replace(/\.[a-z0-9]{2,5}$/i, '');
  const collection = segs.length ? tidy(segs[0]) : null;
  const series = segs.length > 1 ? tidy(segs[segs.length - 1]) : null;
  const { date, year } = dateIn(base);
  let speaker = null, title = null, part = null, speakerFrom = null;
  // "William_Sears__Prophecies.03" → speaker "William Sears", title "Prophecies", part 3
  const dunder = dunderParts(base);
  if (dunder) {
    speaker = tidy(dunder.speaker); title = tidy(dunder.title); part = dunder.part; speakerFrom = 'file';
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
  // a known speaker named anywhere in the file name ("Khadem Forerunner 1985", "PKhan on Shrines being closed")
  if (!speaker || speakerFrom === 'folder') {
    const named = speakerInName(base, known);
    if (named) {
      speaker = named; speakerFrom = 'file';
      const drop = new RegExp(`\\b(?:${[...Object.keys(SPEAKER_ALIASES), ...fold(named).replace(/[’'‘.]/g, '').split(/\s+/).filter((x) => x.length > 2)].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
      const rest = tidy(fold(title || '').replace(/[-_]/g, ' ').replace(drop, ' ').replace(/\b(?:various|includes|on|mrs?|nov|dec|jan|feb|mar|apr|jun|jul|aug|sep|oct)\b\.?/gi, ' ').replace(/\b(?:19|20)\d{2}\b/g, ' '));
      if (rest && rest.length >= 3) title = (title || '').length && fold(title) !== title ? title : rest.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  if (speaker) speaker = speaker.replace(/,\s*$/, '');
  const st = seriesTitle(title);
  if (st.part) { title = st.title; part = part ?? st.part; }
  return { speaker, title, date, year, part, of: st.of, collection, series: dunder?.series ? tidy(dunder.series) : series, speakerFrom };
}

// ── QA 10-22 METADATA: speakers in file names without separators, series titles, part numbers ──────────────────────────────
/** Short forms used in file names for well-known speakers ("PKhan on Shrines being closed"). */
export const SPEAKER_ALIASES = { pkhan: 'Peter Khan', khanum: 'Amatu’l-Bahá Rúḥíyyih Khánum', 'mrs banani': 'Mrs. Banání' };

/** The speaker NAMED anywhere in a file name, from known speakers ([{ name }]) and the aliases: a full name, else a surname
 *  (≥ 5 letters) as a whole word. → name or null. "Khadem Forerunner 1985" → "Zikrullah Khadem" (when known). */
export function speakerInName(base, known = []) {
  const f = ` ${fold(String(base || '')).toLowerCase().replace(/[_.\-]+/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [k, v] of Object.entries(SPEAKER_ALIASES)) if (f.includes(` ${k} `)) return v;
  const names = known.map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
  for (const n of names) if (f.includes(` ${fold(n).toLowerCase().replace(/[’'‘]/g, '')} `) || f.includes(` ${fold(n).toLowerCase()} `)) return n;
  for (const n of names) {
    const sur = fold(n).toLowerCase().replace(/[’'‘]/g, '').split(/\s+/).pop();
    if (sur && sur.length >= 5 && f.includes(` ${sur} `)) return n;
  }
  return null;
}

/** One title pattern per series: "10/14 Gems of Divine Mysteries", "Gems of Divine Mysteries (part 3 of 14)", "(7/14)",
 *  "Reminiscences of Shoghi Effendi, Part 2" → { title, part, of }. Titles without a part come back unchanged. */
export function seriesTitle(raw) {
  let t = String(raw || '').trim(), part = null, of = null, m;
  if ((m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s+(.+)$/))) { part = +m[1]; of = +m[2]; t = m[3]; }
  else if ((m = t.match(/^(.+?)\s*[(\[]\s*(?:part\s*)?(\d{1,2})\s*(?:\/|of)\s*(\d{1,2})\s*[)\]]\s*$/i))) { t = m[1]; part = +m[2]; of = +m[3]; }
  else if ((m = t.match(/^(.+?)\s*[(\[]\s*part\s*(\d{1,2})\s*[)\]]\s*$/i))) { t = m[1]; part = +m[2]; }
  else if ((m = t.match(/^(.+?),?\s+part\s+(\d{1,2})(?:\s+of\s+(\d{1,2}))?$/i))) { t = m[1]; part = +m[2]; of = m[3] ? +m[3] : null; }
  t = t.replace(/[\s,–—-]+$/, '').trim();
  return { title: t, part, of };
}
/** The display title of a part: "Gems of Divine Mysteries — Part 3 of 14". */
export const partTitle = ({ title, part, of }) => (part ? `${title} — Part ${part}${of ? ` of ${of}` : ''}` : title);

/** A double-underscore file name names SERIES__SPEAKER when the left side is a title (3+ words) and the right a name
 *  ("Echoes_From_The_Lotus__Collis_Featherstone.03"); SPEAKER__TITLE otherwise ("William_Sears__Prophecies.03"). */
export function dunderParts(base) {
  const m = String(base || '').match(/^(.+?)__(.+?)(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const left = m[1].replace(/_/g, ' ').trim(), right = m[2].replace(/_/g, ' ').trim(), part = m[3] ? Number(m[3]) : null;
  const titleLike = left.split(/\s+/).length >= 3 && right.split(/\s+/).length <= 3;
  return titleLike ? { speaker: right, title: left, series: left, part } : { speaker: left, title: right, series: null, part };
}
