#!/usr/bin/env node
// The old library copy of the Kitáb-i-Aqdas (doc 8274) carries the House of Justice's NOTES inline as "> [^n]:" paragraphs,
// and a note split over two paragraphs loses its marker on the second ("“My captivity,” He wrote…" read as Bahá’u’lláh's own
// words, 2026-10-07). Credit the notes to the Universal House of Justice; the Text (numbered [n] verses and their unmarked
// continuations) stays Bahá’u’lláh's. Runs ON tower through the single writer (SIFTER_WRITER_URL).
//   node scripts/authorship/aqdas-notes.mjs [--doc=8274] [--write]
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITE = process.argv.includes('--write');
const DOC = Number((process.argv.find((a) => a.startsWith('--doc=')) || '--doc=8274').split('=')[1]);
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
const rows = db.prepare('SELECT id, paragraph_index pidx, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(DOC);

let cls = 'text';
const notes = [];
for (const r of rows) {
  const t = r.text.trim();
  if (/^>\s*\[\^\d+\]:/.test(t)) cls = 'note';
  else if (/^\[\d+\]/.test(t)) cls = 'text';   // a numbered verse; an unmarked paragraph continues whatever came before it
  if (cls === 'note') notes.push(r);
}
console.log(JSON.stringify({ doc: DOC, paragraphs: rows.length, notes: notes.length, continuations: notes.filter((r) => !/^>/.test(r.text.trim())).length }));
for (const r of notes.filter((r) => !/^>/.test(r.text.trim())).slice(0, 8)) console.log('  continuation', r.pidx, r.text.slice(0, 90).replace(/\n/g, ' '));

if (WRITE) {
  const { transaction } = await import('../../api/lib/db.js');
  const AUTH = JSON.stringify([{ name: 'Universal House of Justice', role: 'author', basis: 'section' }]);
  const stmts = notes.map((r) => ({ sql: 'UPDATE content SET authors = ?, authors_model = ? WHERE id = ?', args: [AUTH, 'aqdas-notes-2026-10-07', r.id] }));
  for (let i = 0; i < stmts.length; i += 200) await transaction(stmts.slice(i, i + 200), 'authorship:aqdas-notes');
  console.log(JSON.stringify({ written: stmts.length }));
}
process.exit(0);
