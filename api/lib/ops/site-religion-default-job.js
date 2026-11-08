// SITE RELIGION DEFAULT (Chad 11-08: "documents from bahai-library.com and oceanoflights should be Baha'i by default unless there
// is evidence otherwise"). Live docs of those sites with no religion get Baha'i; the evidence otherwise is the site's own Bible /
// Qur'an copies (slug 'bible-…', 'quran-…', 'writings-quran-…' or a title that IS the scripture) → Christian / Islam. Dry by default;
// write:true applies through doc-corrections, then queues doc-author-restamp so the index points carry it. params { write, limit, sample }.
import { listDocs } from '../docs-repo.js';
import { docCorrectionsJob } from './doc-corrections-job.js';

export const SITES = ['bahai-library.com', 'oceanoflights.org'];
const BIBLE = /^(?:writings-)?bible-/i, QURAN = /^(?:writings-)?(?:quran|koran)-/i;
const BIBLE_TITLE = /^(?:the\s+)?(?:holy\s+)?bible\b/i, QURAN_TITLE = /^(?:the\s+)?(?:holy\s+)?(?:al[-\s]?)?(?:koran|qur[’']?[aā]n)\b/i;

/** A site doc with no religion → the religion it gets. Pure. */
export function siteReligion({ title = '', author = '' } = {}) {
  const a = String(author || ''), t = String(title || '').trim();
  if (BIBLE.test(a) || BIBLE_TITLE.test(t)) return 'Christian';
  if (QURAN.test(a) || QURAN_TITLE.test(t)) return 'Islam';
  return "Baha'i";
}

export async function siteReligionDefaultJob({ write = false, limit = Infinity, sample = 10 } = {}, deps = {}) {
  const { docs = listDocs, corrections = docCorrectionsJob, enqueue = async (n, p, by) => (await import('../repos/ops-report-repo.js')).enqueue(n, p, by) } = deps;
  const out = { write, scanned: 0, perSite: {}, perReligion: {}, otherwise: [], changed: 0, restamp: null };
  const fixes = [];
  for (const site of SITES) {
    for (let afterId = 0; ;) {
      const page = (await docs({ scope: 'live', sourceSite: site, afterId, fields: ['id', 'title', 'author', 'religion'], limit: 1000, count: false })).docs || [];
      if (!page.length) break;
      afterId = page[page.length - 1].id;
      for (const d of page) {
        out.scanned++;
        if (String(d.religion || '').trim()) continue;
        const religion = siteReligion(d);
        out.perSite[site] = (out.perSite[site] || 0) + 1;
        out.perReligion[religion] = (out.perReligion[religion] || 0) + 1;
        if (religion !== "Baha'i" && out.otherwise.length < sample * 5) out.otherwise.push({ id: d.id, title: d.title, author: d.author, religion });
        if (fixes.length < limit) fixes.push({ id: d.id, religion, was: d.author });
      }
    }
  }
  out.changed = fixes.length;
  if (write && fixes.length) {
    const ids = [];
    for (let i = 0; i < fixes.length; i += 500) {
      const r = await corrections({ fixes: fixes.slice(i, i + 500).map(({ was, ...f }) => f), write: true });
      ids.push(...r.changes.map((c) => c.id));
    }
    const done = new Set(ids);
    const was = Object.fromEntries(fixes.filter((f) => done.has(f.id) && f.was).map((f) => [f.id, f.was]));
    out.restamp = ids.length ? await enqueue('doc-author-restamp', { ids, was }, 'site-religion-default') : null;
  }
  return out;
}
