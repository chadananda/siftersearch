// structure-infer ops job: structure for books that do not mark it as headings (api/lib/toc.js). Code lists candidate
// heading lines; Haiku picks which begin a section — guided by the book's own Contents page and, for a famous work, its
// standard structure (Chad 10-17) — by paragraph number only; code builds the nested sections and checks them. Written as
// source 'inferred' (never shown as the author's headings), then BM25 re-sent so the paths are searchable.
// params { ids? | candidates? (books with a Contents page), limit?, dry? }.
import { listDocs } from '../docs-repo.js';
import { structureRows, replaceSections, tocCandidates } from '../repos/sections-repo.js';
import { saveStructureCoverage } from '../repos/coverage-repo.js';
import { enqueue } from '../repos/ops-report-repo.js';
import { headingCandidates, sectionsFromPicks, checkSections } from '../toc.js';
import { roleCreate } from '../role-client.js';
import { logActivity } from '../repos/activity-repo.js';

const CHUNK = 250;
const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

export function inferPrompt(doc, lines, contents, before) {
  return `Book: "${doc.title}"${doc.author ? ` by ${doc.author}` : ''}.
Below are short lines from this book, each with its paragraph number. Pick the lines that BEGIN a section of the book's
structure — its parts, books, chapters, treatises, questions, suras, cantos — and, if this is a well-known work, follow the
standard structure it is known by. Give each a level: 1 = the largest division, 2 inside it, and so on.
Skip: the contents list itself, running heads, page numbers, captions, and short lines that belong to the running text.
${contents ? `\nThe book's own table of contents, for guidance:\n${contents}\n` : ''}${before.length ? `\nHeadings already chosen before these lines (keep levels consistent): ${before.map((h) => `L${h.level} ${h.title}`).join(' | ')}\n` : ''}
LINES
${lines.map((l) => `[${l.i}] ${l.text}`).join('\n')}

Return ONE JSON object: {"headings":[{"i":<paragraph number from the list>,"level":<1-6>,"title":"the heading, cleaned of numbering artefacts and page numbers"}]}`;
}

export async function inferStructure(doc, rows, { create = roleCreate } = {}) {
  const cands = headingCandidates(rows);
  const ci = rows.findIndex((r) => /^\W*(table of )?contents\W*$/i.test(String(r.text).trim()));
  const contents = ci >= 0 ? rows.slice(ci + 1, ci + 80).map((r) => r.text).join('\n').slice(0, 6000) : '';
  const picks = [];
  for (let k = 0; k < cands.length; k += CHUNK) {
    const lines = cands.slice(k, k + CHUNK), allowed = new Set(lines.map((l) => l.i));
    const res = await create('toc-infer', { max_tokens: 6000, temperature: 0, messages: [{ role: 'user', content: inferPrompt(doc, lines, contents, picks.slice(-8)) }] });
    // only a line from THIS list may begin a section — a number the model invents is dropped
    for (const h of jsonOf(res?.choices?.[0]?.message?.content)?.headings || []) if (allowed.has(Number(h.i))) picks.push({ i: Number(h.i), level: h.level, title: h.title });
  }
  const sections = sectionsFromPicks(picks, rows);
  return { candidates: cands.length, sections, issues: checkSections(sections, rows) };
}

export async function structureInferJob({ ids = null, candidates = false, limit = 0, dry = false } = {}, { create = roleCreate } = {}) {
  if (candidates) ids = (await tocCandidates({ longest: 100000 })).longest.map((d) => d.id);
  if (!ids?.length) throw new Error('structure-infer needs { ids } or { candidates: true }');
  if (limit) ids = ids.slice(0, limit);
  const stats = { docs: 0, written: 0, refused: 0, sections: 0, refusals: [], previews: [] };
  const written = [];
  for (let k = 0; k < ids.length; k += 500) {
    const { docs } = await listDocs({ ids: ids.slice(k, k + 500), fields: ['id', 'title', 'author'], limit: 500, count: false });
    for (const doc of docs) {
      const rows = await structureRows(doc.id);
      const r = await inferStructure(doc, rows, { create }).catch((err) => ({ sections: [], issues: [`failed: ${String(err.message).slice(0, 100)}`] }));
      stats.docs++;
      if (dry || r.issues.length) {
        if (r.issues.length) { stats.refused++; if (stats.refusals.length < 30) stats.refusals.push({ id: doc.id, title: doc.title, issues: r.issues }); }
        if (dry && stats.previews.length < 10) stats.previews.push({ id: doc.id, title: doc.title, candidates: r.candidates, sections: r.sections.length,
          outline: r.sections.slice(0, 40).map((s) => `${'  '.repeat(s.level - 1)}${s.title} [¶${s.start_index}, ${s.paragraphs}]`) });
        continue;
      }
      await replaceSections(doc.id, doc.title, r.sections, 'inferred');
      await saveStructureCoverage(doc.id, r.sections.length);
      written.push(doc.id); stats.written++; stats.sections += r.sections.length;
      if (stats.docs % 10 === 0) logActivity('index', `structure inferred · ${stats.written}/${stats.docs} books · ${stats.sections} sections`);
    }
  }
  if (written.length) await enqueue('keyword-fill', { ids: written }, 'structure-infer');   // BM25 carries the new section paths
  return stats;
}
