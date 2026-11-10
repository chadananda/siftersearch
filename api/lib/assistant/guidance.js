// CURRENT GUIDANCE (W3; planning/anis-strategies.json D4): Jev said the reader asks what the Universal House of Justice says.
// Code searches its letters, dates each hit from the document (file name YYYY-MM-DD, else year) and orders them NEWEST FIRST —
// recency of guidance, not doctrinal weight (the House of Justice legislates and guides; it does not interpret the Writings).
// A letter quoted inside a compilation (Lights of Guidance) gives its slot to the House's own published message (own-source.js,
// writer = the House); a hit that is only a letter's title is read on into the letter (battery 11-10: "Only its title came through").
// Deps (injectable via ctx.deps): docs-repo listDocs/getParagraphsAround, own-source preferOwnWork. Search: respond.js executeSearch.
import { NO_LOG } from './decision-log.js';
import { combinedSearch } from './combined-search.js';
import { render } from './activities/templates.js';

export const UHJ = 'Universal House of Justice';
const MAX = 8;

export const GUIDANCE_HOW = (dates) => render('guidance.how', { dates: dates.length ? render('guidance.dates', { dates: dates.join(', ') }) : '' });   // words = template rows

const RANGE = /\b(1[89]\d\d|20\d\d)\s*[-–]\s*(1[89]\d\d|20\d\d)\b/;
/** A letter's date from its document: YYYY-MM-DD in the file name, else the year. A VOLUME of letters (a year range in its title,
 *  "Messages … 1986-2001") is dated by the range, never by its publication year (battery 11-10: a 1986-2001 volume "tagged 2009"). Pure. */
export const dateOf = (doc = {}) => {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(doc.file_path || doc.slug || doc.title || ''));
  if (m) return m[1];
  const r = RANGE.exec(String(doc.title || ''));
  if (r) return `${r[1]}–${r[2]}`;
  const y = Number(doc.year); return y > 1800 && y < 2200 ? String(y) : null;
};

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DAY_DATE = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})\\s+(\\d{4})\\b`);
/** The letter's own date line ("8 January 2001") in its title or opening text, inside the volume's range. Pure. */
export function letterDate(text, range) {
  const m = DAY_DATE.exec(String(text || ''));
  if (!m) return null;
  const [lo, hi] = String(range || '').split('–').map(Number);
  const y = Number(m[3]);
  return !lo || (y >= lo && y <= hi) ? `${m[1]} ${m[2]} ${m[3]}` : null;
}

const TITLE_ONLY = 12;   // words: a hit this short is a letter's heading, not its words
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
/** A heading-only hit read on into its letter: the heading kept as `heading`, the next paragraphs as its text. */
async function readOn(p, around) {
  if (words(p.text) >= TITLE_ONLY || p.paragraph_index == null || !p.document_id) return p;
  const rows = await around(p.document_id, p.paragraph_index, { before: 0, after: 3 }).catch(() => []);
  const next = rows.filter((r) => Number(r.paragraph_index) > Number(p.paragraph_index) && String(r.text || '').trim());
  return next.length ? { ...p, heading: p.text, text: next.map((r) => r.text).join('\n\n') } : p;
}

/** Passages ordered newest first (undated last), each tagged with its date. Pure. */
export function newestFirst(passages, dates) {
  return passages.map((p) => ({ ...p, theme: dates.get(Number(p.document_id)) || 'undated' }))
    .sort((a, b) => (b.theme === 'undated' ? '' : b.theme).localeCompare(a.theme === 'undated' ? '' : a.theme));
}

export async function currentGuidance(ctx) {
  const { messages, query, search, profile = {}, decisions = NO_LOG, deps = {} } = ctx;
  const r = await combinedSearch({ query, limit: 14, filters: { author: UHJ }, scope_config: profile.scope_config, messages, defaults: { religion: "Baha'i" } }, { search }).catch(() => null);
  const hits = (r?.passages || []).filter((p) => /house of justice/i.test(p.author || '') || /house of justice/i.test(p.book_author || ''));
  decisions.record('guidance:letters', { by: 'code', saw: { query, returned: r?.passages?.length ?? 0 }, chosen: `${hits.length} from the ${UHJ}`, reason: hits.length ? null : 'no letters of the House of Justice matched' });
  if (!hits.length) return null;
  const listDocs = deps.listDocs || (await import('../docs-repo.js')).listDocs;
  const around = deps.getParagraphsAround || (async (...a) => (await import('../docs-repo.js')).getParagraphsAround(...a));
  // the House's words quoted in a compilation → the House's own message (literal lookup, own-source budget); late → kept
  const os = await import('./own-source.js');
  const ownDeps = deps.ownSource || { search: os.literalOwnSearch, link: os.linkHits, shape: (await import('./tool-kit.js')).toPassage };
  const owned = await os.preferOwnWork(hits, { ...ownDeps, writers: [UHJ] }).catch(() => null);
  if (owned?.swapped?.length) decisions.record('guidance:own-message', { by: 'code', saw: owned.swapped, chosen: `${owned.swapped.length} swapped for the House's own message`, reason: null });
  const read = await Promise.all((owned?.passages || hits).map((p) => readOn(p, around)));
  const ids = [...new Set(read.map((p) => Number(p.document_id)).filter(Boolean))];
  const { docs = [] } = await listDocs({ ids, fields: ['id', 'title', 'year', 'file_path', 'slug'], limit: ids.length, count: false }).catch(() => ({ docs: [] }));
  const dates = new Map(docs.map((d) => [Number(d.id), dateOf(d)]).filter(([, v]) => v));
  // a volume's range narrows to the letter's own date line when its heading or opening carries one
  const dated = newestFirst(read, dates).map((p) => {
    const d = RANGE.test(p.theme) ? letterDate(`${p.heading || ''}\n${String(p.text || '').slice(0, 400)}`, p.theme) : null;
    return d ? { ...p, theme: d } : p;
  });
  const ordered = dated.slice(0, MAX);
  const order = ordered.map((p) => `${p.document_id}:${p.theme}`);
  decisions.record('guidance:recency', { by: 'code', saw: Object.fromEntries(dates), options: ['newest first', 'search order'], chosen: 'newest first', reason: `${dates.size}/${ids.length} letters dated; order ${order.join(' ')}` });
  const dl = [...new Set(ordered.map((p) => p.theme).filter((t) => t !== 'undated'))];
  return { passages: ordered, plan: { shape: 'guidance', author: UHJ, dates: dl, undated: ordered.filter((p) => p.theme === 'undated').length },
    format: { id: 'guidance', by: 'strategy:guidance', how: GUIDANCE_HOW(dl) } };
}
