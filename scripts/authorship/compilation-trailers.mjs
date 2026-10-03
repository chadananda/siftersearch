#!/usr/bin/env node
// DRY RUN (read-only; runs ON tower): compilation attribution trailers → per-paragraph authors (planning/
// paragraph-authorship-plan.md, phase 1b). A trailer — a whole paragraph in parentheses naming who wrote the passage
// ("(From a letter written on behalf of Shoghi Effendi …, 8 February 1949)", "(Bahá'u'lláh, Gleanings, p. 287)") —
// applies to the paragraphs above it, back to the previous trailer or heading. Writes a report; changes nothing.
//   node scripts/authorship/compilation-trailers.mjs <out.json> [--docs 20804,8680] [--emit]   (--emit: every assignment)
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2];
const docsArg = process.argv.indexOf('--docs') > 0 ? process.argv[process.argv.indexOf('--docs') + 1].split(',').map(Number) : null;
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });

import { isTrailer, isHeading, parseTrailer } from '../../api/lib/authorship/trailers.js';

const docs = docsArg
  ? db.prepare(`SELECT id, title, author FROM docs WHERE id IN (${docsArg.join(',')})`).all()
  : db.prepare(`SELECT d.id, d.title, d.author FROM docs d WHERE d.scope = 'primary' AND d.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL AND length(c.text) < 500 AND trim(c.text) LIKE '(%)'
      AND (c.text LIKE '(From %' OR c.text LIKE '(Written on behalf%' OR c.text LIKE '(Bah%' OR c.text LIKE '(%Abdu%' OR c.text LIKE '(Shoghi%'))`).all();
const paras = db.prepare(`SELECT id, paragraph_index pidx, text, blocktype FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`);

const EMIT = process.argv.includes('--emit');
const report = { at: new Date().toISOString(), docs: [], assignments: [] };
for (const d of docs) {
  const rows = paras.all(d.id);
  let pending = [];
  const out = { id: d.id, title: d.title, book_author: d.author, trailers: 0, unparsed: [], assigned: 0, unassigned_tail: 0, by_author: {}, big_groups: [], samples: [] };
  for (const r of rows) {
    const t = String(r.text || '').replace(/⁅\/?s\d+⁆/g, '').trim();
    if (!t || r.blocktype === 'footnote') continue;
    if (isTrailer(t)) {
      out.trailers++;
      const p = parseTrailer(t);
      if (!p.name) { out.unparsed.push(t.slice(0, 160)); pending = []; continue; }
      const key = p.name + (p.on_behalf ? ' (on behalf)' : '');
      out.by_author[key] = (out.by_author[key] || 0) + pending.length;
      if (EMIT) for (const x of pending) report.assignments.push({ content_id: x.id, doc_id: d.id, pidx: x.pidx, name: p.name, on_behalf: p.on_behalf, kind: p.kind, group: pending.length, trailer: t.slice(0, 200) });
      out.assigned += pending.length;
      if (pending.length > 6) out.big_groups.push({ trailer: t.slice(0, 120), paragraphs: pending.length, first_pidx: pending[0].pidx });
      if (out.samples.length < 4 && pending.length) out.samples.push({ trailer: t.slice(0, 160), parsed: p, paragraphs: pending.map((x) => x.pidx), first: pending[0].text.slice(0, 120) });
      pending = [];
      continue;
    }
    if (isHeading(r, t)) { pending = []; continue; }
    pending.push({ id: r.id, pidx: r.pidx, text: t });
  }
  out.unassigned_tail = pending.length;
  report.docs.push(out);
}
const tot = report.docs.reduce((a, d) => ({ trailers: a.trailers + d.trailers, assigned: a.assigned + d.assigned, unparsed: a.unparsed + d.unparsed.length }), { trailers: 0, assigned: 0, unparsed: 0 });
report.totals = { docs: report.docs.length, ...tot };
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.totals));
