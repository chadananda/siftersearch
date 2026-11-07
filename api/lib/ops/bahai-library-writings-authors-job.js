// BAHAI-LIBRARY WRITINGS AUTHORS. bahai-library.com docs whose author is the site's path slug ('writings-bahaullah-aqdas-aqdas',
// 'writings-shoghieffendi-wob-36') get the Central Figure the slug names and religion Baha'i, so search can read their tier (11-07:
// the Aqdas, Summons and Tablets of ‘Abdu’l-Bahá ranked as unknown-tier). Editorial parts (notes, supplements, introductions,
// about pages) are not the figure's words: they get the religion only. Dry by default; write:true applies through doc-corrections,
// then queues doc-author-restamp. params { write = false, limit, sample = 10 }.
import { listDocs } from '../docs-repo.js';
import { docCorrectionsJob } from './doc-corrections-job.js';

const FIGURES = { bahaullah: 'Bahá’u’lláh', abdulbaha: '‘Abdu’l-Bahá', bab: 'The Báb', shoghieffendi: 'Shoghi Effendi' };
const EDITORIAL = /-(?:notes|endnotes|about|supplements|intr(?:o|oduction)?(?:-[a-z0-9]+)*)$/;

/** 'writings-bahaullah-aqdas-aqdas' → { author, religion }; editorial parts → { religion }; null when the slug names no figure. */
export function writingsFigure(slug) {
  const m = /^writings-([a-z]+)-/.exec(String(slug || '').toLowerCase());
  const author = m && FIGURES[m[1]];
  if (!author) return null;
  return EDITORIAL.test(String(slug).toLowerCase()) ? { religion: "Baha'i" } : { author, religion: "Baha'i" };
}

export async function bahaiLibraryWritingsAuthorsJob({ write = false, limit = Infinity, sample = 10 } = {}, deps = {}) {
  const { docs = listDocs, corrections = docCorrectionsJob, enqueue = async (n, p, by) => (await import('../repos/ops-report-repo.js')).enqueue(n, p, by) } = deps;
  const out = { write, scanned: 0, perFigure: {}, editorial: 0, unchanged: {}, sample: [], changed: 0, restamp: null };
  const fixes = [];
  for (let afterId = 0; ;) {
    const page = (await docs({ scope: 'live', sourceSite: 'bahai-library.com', authorLike: 'writings-%', afterId, fields: ['id', 'title', 'author', 'religion'], limit: 1000, count: false })).docs || [];
    if (!page.length) break;
    afterId = page[page.length - 1].id;
    for (const d of page) {
      out.scanned++;
      const f = writingsFigure(d.author);
      if (!f) { const p = d.author.split('-').slice(0, 2).join('-'); out.unchanged[p] = (out.unchanged[p] || 0) + 1; continue; }
      if (!f.author && d.religion === f.religion) continue;
      if (f.author) out.perFigure[f.author] = (out.perFigure[f.author] || 0) + 1; else out.editorial++;
      if (out.sample.length < sample) out.sample.push({ id: d.id, title: d.title, was: d.author, now: f.author ?? '(religion only)' });
      if (fixes.length < limit) fixes.push({ id: d.id, ...f, was: d.author });
    }
  }
  out.changed = fixes.length;
  if (write && fixes.length) {
    const ids = [];
    for (let i = 0; i < fixes.length; i += 500) {
      const r = await corrections({ fixes: fixes.slice(i, i + 500).map(({ was, ...f }) => f), write: true });
      ids.push(...r.changes.map((c) => c.id));
    }
    const was = Object.fromEntries(fixes.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.was]));
    out.restamp = ids.length ? await enqueue('doc-author-restamp', { ids, was }, 'bahai-library-writings-authors') : null;
  }
  return out;
}
