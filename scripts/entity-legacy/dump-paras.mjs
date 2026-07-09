// Dump a paragraph range as JSON (for the person-sweep workers to read a section without re-deriving DB access).
// Run: DOC=21308 FROM=760 TO=840 node scripts/entity-read/dump-paras.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const DOC = Number(process.env.DOC || 21308), FROM = Number(process.env.FROM || 0), TO = Number(process.env.TO || 99999);
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const abbr = DOC === 21308 ? 'DB' : DOC === 21310 ? 'GPB' : String(DOC);
const rows = await queryAll(`SELECT external_para_id pid, paragraph_index pix, heading, text FROM content
  WHERE doc_id=? AND text IS NOT NULL AND deleted_at IS NULL AND paragraph_index BETWEEN ? AND ? ORDER BY paragraph_index`, [DOC, FROM, TO]);
process.stdout.write(JSON.stringify(rows.filter((r) => clean(r.text).length > 30).map((r) => ({ ref: `${abbr} ¶${r.pix}`, docId: DOC, paraId: r.pid, heading: r.heading || '', text: clean(r.text).slice(0, 1100) }))));
process.exit(0);
