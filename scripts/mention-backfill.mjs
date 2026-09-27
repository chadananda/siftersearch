// Mention coverage audit + backfill. The mention stage records only names the disambiguation NOTE glosses — a name
// already written out in full ("Mullá Ḥusayn-i-Bushrú'í") needs no gloss, so it never became a mention, and claims
// about him could not bind (Eminent Bahá'ís ¶54: 4 mentions recorded, Mullá Ḥusayn and Mullá Ṣádiq missing).
// This finds known people named in the paragraph TEXT — a name form carried by exactly ONE catalogued person or place
// (never a shared name: "Mullá Ḥusayn" alone is several men), as a whole phrase, not inside a longer name, place or
// possession — and reports, per book, which have no mention. --write inserts them (method_version
// 'name-backfill-v1', resolution_basis 'name-text-sole'; DELETE by method_version). --doc=ID limits to one book.
// Output: logs/mention-backfill-<audit|write>-<ts>.json. POST /api/admin/server/mention-backfill.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { getEncounterIndex, namedBy, fold } = await import('../api/lib/encounters.js');

const WRITE = process.argv.includes('--write');
const DOC = Number((process.argv.find((a) => a.startsWith('--doc=')) || '').split('=')[1]) || null;
const VERSION = 'name-backfill-v1';
const idx = await getEncounterIndex();
const people = [...idx.people.values()];

const docs = DOC ? [{ doc_id: DOC }] : await queryAll(`SELECT DISTINCT doc_id FROM entity_claims WHERE doc_id IS NOT NULL ORDER BY doc_id`);
const report = { mode: WRITE ? 'write' : 'audit', books: 0, paragraphs: 0, named: 0, alreadyMentioned: 0, missing: 0, inserted: 0, byBook: [], samples: [] };
const normSurface = (s) => fold(s).trim();
const anchorOf = (docId, pid, sn) => createHash('sha1').update(`${docId}|${pid}|${sn}|0`).digest('hex').slice(0, 16);

for (const { doc_id: docId } of docs) {
  const paras = await queryAll(`SELECT c.id, c.external_para_id, c.text FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL AND c.text IS NOT NULL`, [docId]);
  const title = (await queryAll(`SELECT title FROM docs WHERE id = ?`, [docId]))[0]?.title || `doc ${docId}`;
  const have = new Set((await queryAll(`SELECT para_id, entity_id FROM entity_mentions_v2 WHERE doc_id = ? AND entity_id IS NOT NULL`, [docId]))
    .map((m) => `${m.para_id}|${m.entity_id}`));
  const b = { docId, title, paragraphs: paras.length, named: 0, missing: 0 };
  const rows = [];
  for (const p of paras) {
    const pid = p.external_para_id || `p${p.id}`;
    const hay = fold(p.text);
    const cands = new Set();
    for (const w of hay.trim().split(' ')) for (const id of idx.byWord.get(w) || []) cands.add(id);
    for (const id of cands) {
      const person = idx.people.get(id);
      const phrase = namedBy(hay, person, { sole: true });
      if (!phrase) continue;
      b.named++;
      if (have.has(`${pid}|${id}`)) { report.alreadyMentioned++; continue; }
      b.missing++;
      if (report.samples.length < 40 && Math.random() < 0.02) report.samples.push({ book: title, pid, person: person.name, phrase });
      const sn = normSurface(phrase);
      rows.push({ sql: `INSERT OR IGNORE INTO entity_mentions_v2
          (anchor, doc_id, para_id, occurrence, surface, surface_norm, entity_id, resolved_as, resolution_basis, resolution_conf, method_version, model, status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active')`,
        args: [anchorOf(docId, pid, `${sn}#${id}`), docId, pid, 0, phrase, sn, id, person.name, 'name-text-sole', 1.0, VERSION, VERSION] });
    }
  }
  report.books++; report.paragraphs += paras.length; report.named += b.named; report.missing += b.missing;
  report.byBook.push(b);
  if (WRITE && rows.length) { for (let i = 0; i < rows.length; i += 300) await transaction(rows.slice(i, i + 300), 'mention-backfill'); report.inserted += rows.length; }
  if (report.books % 50 === 0) console.log(`progress ${report.books}/${docs.length} books · named ${report.named} · missing ${report.missing}`);
}
report.byBook.sort((a, b) => b.missing - a.missing);
report.topBooks = report.byBook.slice(0, 25);
delete report.byBook;
mkdirSync('logs', { recursive: true });
const file = `logs/mention-backfill-${report.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
console.log(`REPORT ${file}`);
const { samples, topBooks, ...summary } = report;
console.log(JSON.stringify(summary));
process.exit(0);
