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

// ── Which name forms may BIND identity from bare text (stricter than search). Aliases are AI-written and some are
// junk ("him", "king", "second", "said" for Sa‘íd) or belong to someone else ("Ḥájí Mullá ‘Alí-Akbar-i-Shahmírzádí"
// listed under Áḵhúnd Mullá ‘Alí-i-Qazvíní) — measured on the first dry run, 2026-09-27.
const GENERIC = new Set(('him her he she they king queen shah sultan prince princess emperor governor uncle nephew niece son daughter brother sister '
  + 'father mother wife husband master second first third throughout said imam mulla siyyid haji mirza shaykh aqa khan beg').split(' '));
const nisbas = (phrase) => { const w = phrase.split(' '); const out = []; for (let i = 0; i < w.length - 1; i++) if (w[i] === 'i' && w[i + 1].length > 3) out.push(w[i + 1]); return out; };
for (const person of idx.people.values()) {
  const own = new Set(person.forms.filter((f) => f.canonical).flatMap((f) => nisbas(f.phrase)));
  for (const f of person.forms) {
    const words = f.phrase.split(' ');
    const single = words.length === 1;
    const conflict = !f.canonical && own.size && nisbas(f.phrase).length && !nisbas(f.phrase).some((n) => own.has(n));
    f.bindable = f.sole && !conflict && !(single && (!f.canonical || f.phrase.length < 5 || GENERIC.has(f.phrase)));
  }
}
// The name must stand in the source as a PROPER NOUN: its first letter capitalised where it occurs.
const capitalised = (text, phrase) => {
  const first = phrase.split(' ')[0];
  const plain = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ʼʻ‘’'`´]/g, '');
  const re = new RegExp(`(^|[^A-Za-z])${first[0].toUpperCase()}${first.slice(1).split('').join("[-\\s]?")}`, '');
  return re.test(plain);
};

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
      const phrase = namedBy(hay, { ...person, forms: person.forms.filter((f) => f.bindable) }, { sole: true });
      if (!phrase || !capitalised(p.text, phrase)) continue;
      b.named++;
      if (have.has(`${pid}|${id}`)) { report.alreadyMentioned++; continue; }
      b.missing++;
      if (report.samples.length < 80 && (DOC || Math.random() < 0.02)) report.samples.push({ book: title, pid, person: person.name, phrase });
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
