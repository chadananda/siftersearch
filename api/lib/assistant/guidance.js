// CURRENT GUIDANCE (W3; planning/anis-strategies.json D4): Jev said the reader asks what the Universal House of Justice says.
// Code searches its letters, dates each hit from the document (file name YYYY-MM-DD, else year) and orders them NEWEST FIRST —
// recency of guidance, not doctrinal weight (the House of Justice legislates and guides; it does not interpret the Writings).
// Deps (injectable via ctx.deps): docs-repo listDocs. Search: respond.js executeSearch with the author filter.
import { NO_LOG } from './decision-log.js';
import { combinedSearch } from './combined-search.js';
import { render } from './activities/templates.js';

export const UHJ = 'Universal House of Justice';
const MAX = 8;

export const GUIDANCE_HOW = (dates) => render('guidance.how', { dates: dates.length ? render('guidance.dates', { dates: dates.join(', ') }) : '' });   // words = template rows

/** A letter's date from its document: YYYY-MM-DD in the file name, else the year. Pure. */
export const dateOf = (doc = {}) => {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(doc.file_path || doc.slug || doc.title || ''));
  if (m) return m[1];
  const y = Number(doc.year); return y > 1800 && y < 2200 ? String(y) : null;
};

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
  const ids = [...new Set(hits.map((p) => Number(p.document_id)).filter(Boolean))];
  const { docs = [] } = await listDocs({ ids, fields: ['id', 'title', 'year', 'file_path', 'slug'], limit: ids.length, count: false }).catch(() => ({ docs: [] }));
  const dates = new Map(docs.map((d) => [Number(d.id), dateOf(d)]).filter(([, v]) => v));
  const ordered = newestFirst(hits, dates).slice(0, MAX);
  const order = ordered.map((p) => `${p.document_id}:${p.theme}`);
  decisions.record('guidance:recency', { by: 'code', saw: Object.fromEntries(dates), options: ['newest first', 'search order'], chosen: 'newest first', reason: `${dates.size}/${ids.length} letters dated; order ${order.join(' ')}` });
  const dl = [...new Set(ordered.map((p) => p.theme).filter((t) => t !== 'undated'))];
  return { passages: ordered, plan: { shape: 'guidance', author: UHJ, dates: dl, undated: ordered.filter((p) => p.theme === 'undated').length },
    format: { id: 'guidance', by: 'strategy:guidance', how: GUIDANCE_HOW(dl) } };
}
