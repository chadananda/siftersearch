// Tablet metadata: merge Stephen Phelps' Partial Inventory row + oceanoflights frontmatter + linked notes into ONE record
// per tablet, every field carrying its source. Pure; no deps. Read by the reader's intro box, search, HyPE, disambiguation.
// :rules: circumstance + textual history → Phelps (scholarly catalogue); content + media → oceanoflights; OOL titles and
//   descriptions are mostly GENERATED (title_source) and are labelled so. Notes are prose scholarship: linked, not parsed.
// :edge: Phelps dates are Hijri with the Gregorian in brackets ("1265-09-01 [1849-Jul-21]", "1264-1265 [1848-1849]",
//   "1260-10 ca. (Kangan)", "unknown (Chihriq?)"); a bare Hijri year is converted and marked approximate.

const PI = 'Partial Inventory v6.01';
const OOL = 'oceanoflights';
const strip = (v) => String(v ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const list = (v) => (Array.isArray(v) ? v : strip(v) ? strip(v).split(/\s*,\s*/) : []).map(strip).filter(Boolean);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const hijriToYear = (h) => Math.floor(622 + h * 0.970224);

/** Phelps' date text → { text, hijri, gregorian, from, to, approx } (years are Gregorian). null when there is none. */
export function parsePiDate(raw) {
  const text = strip(raw);
  if (!text) return null;
  const greg = text.match(/\[(\d{4})(?:-(\d{4}|[A-Za-z]{3})(?:-(\d{1,2}))?)?\]/);
  const hijri = text.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:\s*-\s*(\d{4}))?/);
  const approx = /\bca\.|\?|late|early|unknown/i.test(text) || !greg;
  let from = null, to = null, gregorian = null;
  if (greg) {
    from = Number(greg[1]);
    to = /^\d{4}$/.test(greg[2] || '') ? Number(greg[2]) : from;
    const mon = MONTHS[(greg[2] || '').toLowerCase()];
    gregorian = mon ? `${greg[1]}-${String(mon).padStart(2, '0')}${greg[3] ? '-' + greg[3].padStart(2, '0') : ''}` : greg[0].slice(1, -1);
  } else if (hijri) {
    from = hijriToYear(Number(hijri[1])); to = hijri[4] ? hijriToYear(Number(hijri[4])) + 1 : from + 1;
  }
  return { text, hijri: hijri ? hijri[0].replace(/\s+/g, '') : null, gregorian, from, to, approx };
}

/** "SWB#09 (p.077-113x),  BPRY.226-227x, OOL.A001" → [{ code, locator, citation, url }] using bib (code → {citation,url}). */
export function expandCodes(raw, bib = {}) {
  return list(raw).map((ref) => {
    const code = (ref.match(/^[A-Za-z][A-Za-z0-9_]*/) || [ref])[0];
    const hit = bib[code] || bib[code.replace(/\d+$/, '')] || null;
    return { code, locator: ref.slice(code.length).replace(/^[#.\s]+/, '').trim() || null, citation: hit?.citation ?? null, url: hit?.url ?? null };
  });
}

const oolUrl = (bookid) => (bookid ? `https://oceanoflights.org/${String(bookid).toLowerCase().replace(/_/g, '-')}/` : null);
const piUrl = (pin) => (pin ? `https://portlandiator.github.io/PI_browser/?id=${encodeURIComponent(pin)}` : null);

/**
 * @param {object} p
 * @param {object} [p.fm]     oceanoflights frontmatter (parsed YAML, arrays intact)
 * @param {object} [p.pi]     Phelps' CSV row (column → value)
 * @param {object} [p.bib]    code → { citation, url }
 * @param {Array}  [p.notes]  [{ docId, title, language }] notes/sources documents about this tablet
 * @returns {object} merged record; `sources` maps each filled field to where it came from
 */
export function mergeTabletMeta({ fm = {}, pi = {}, bib = {}, notes = [] } = {}) {
  const sources = {};
  const put = (obj, key, value, source) => {
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    if (!empty) { obj[key] = value; sources[key] = source; }
  };
  const pin = strip(pi.PIN) || strip(fm.catalog_ref) || strip(fm.pin) || null;
  const bookid = strip(fm.bookid) || null;
  const m = { pin, ool_id: bookid, links: { oceanoflights: oolUrl(bookid), inventory: piUrl(pin) } };
  // names — Phelps' title is a real title; OOL's is "established" only when title_source says so
  const established = strip(fm.title_source) === 'established' || strip(fm.title_source) === 'oceanoflights';
  put(m, 'title', strip(pi.Title) || (established ? strip(fm.title_english || fm.title) : null), strip(pi.Title) ? PI : OOL);
  put(m, 'title_generated', !m.title ? strip(fm.title_english || fm.title) || null : null, `${OOL} (generated)`);
  put(m, 'title_native', strip(fm.title_native) || null, OOL);
  put(m, 'known_names', list(fm.known_names), OOL);
  put(m, 'title_alternates', list(fm.title_alternates), OOL);
  put(m, 'first_line', strip(pi['First line (original)']) || null, PI);
  put(m, 'first_line_en', strip(pi['First line (translated)']) || null, PI);
  // circumstance — Phelps first
  put(m, 'recipient', strip(pi.Recipient) || null, PI);
  put(m, 'addressee', list(fm.addressee), OOL);
  const d = parsePiDate(pi.Date);
  put(m, 'date', d || (strip(fm.date_revealed) ? { text: strip(fm.date_revealed), approx: true } : null), d ? PI : OOL);
  put(m, 'place', strip(pi.Place) || strip(fm.place_revealed) || null, strip(pi.Place) ? PI : OOL);
  put(m, 'period', strip(pi.Period) || null, PI);
  put(m, 'period_ool', strip(fm.period_id) || null, OOL);
  put(m, 'volume', strip(pi.Volume_title) || null, PI);
  // textual history — Phelps
  put(m, 'manuscripts', list(pi.Manuscripts), PI);
  put(m, 'publications', expandCodes(pi.Publications, bib), PI);
  put(m, 'translations', expandCodes(pi.Translations, bib), PI);
  put(m, 'references', expandCodes(pi.Notes, bib), PI);
  put(m, 'abstract', strip(pi.Abstracts) || null, PI);
  put(m, 'word_count', Number(strip(pi['Word count']).replace(/\D/g, '')) || Number(fm.words) || null, strip(pi['Word count']) ? PI : OOL);
  put(m, 'extract', strip(pi.Extract) ? true : null, PI);
  put(m, 'authorized', strip(pi.Authorized) || null, PI);
  put(m, 'musical', list(pi['Musical interpretations']), PI);
  // content + media — oceanoflights
  put(m, 'description', strip(fm.description) || null, `${OOL} (generated)`);
  put(m, 'subjects', list(fm.subjects), OOL);
  put(m, 'genre', strip(fm.genre) || null, OOL);
  put(m, 'prayer_occasion', strip(fm.prayer_occasion) || null, OOL);
  put(m, 'citations', list(fm.citations), OOL);
  let att = [];
  try { att = typeof fm.attachments_json === 'string' ? JSON.parse(fm.attachments_json) : fm.attachments_json || []; } catch { /* malformed */ }
  put(m, 'audio', att.filter((a) => a.kind === 'audio').map((a) => ({ name: a.name, url: a.url })), OOL);
  put(m, 'attached_translations', att.filter((a) => a.kind === 'translation').map((a) => ({ name: a.name, url: a.url })), OOL);
  put(m, 'notes_attachments', att.filter((a) => /note|source/i.test(`${a.kind} ${a.name}`)).map((a) => ({ name: a.name, url: a.url })), OOL);
  put(m, 'notes', notes.map((n) => ({ docId: n.docId, title: n.title, language: n.language })), 'linked notes');
  put(m, 'also_published_as', list(fm.also_published_as), OOL);
  m.sources = sources;
  return m;
}

/** One-paragraph context for HyPE / disambiguation prompts: the facts a reader of the tablet would know. */
export function tabletContextLine(m) {
  if (!m) return '';
  const parts = [];
  if (m.title) parts.push(`«${m.title}»`);
  if (m.recipient) parts.push(`addressed to ${m.recipient}`);
  else if (m.addressee?.length) parts.push(`addressed to ${m.addressee.join(', ')}`);
  if (m.place) parts.push(`revealed in ${m.place}`);
  if (m.date?.gregorian || m.date?.from) parts.push(`dated ${m.date.gregorian || m.date.from}${m.date.approx ? ' (approx.)' : ''}`);
  if (m.subjects?.length) parts.push(`on ${m.subjects.slice(0, 6).join(', ')}`);
  return parts.join('; ');
}
