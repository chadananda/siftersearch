import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const rows = db.prepare(`
  SELECT c.id, c.paragraph_index, length(c.text) AS len, c.text, d.title, d.author
  FROM content c
  JOIN docs d ON d.id = c.doc_id
  WHERE c.id IN (
    SELECT content_id FROM enrichment_pending
    WHERE batch_id = (SELECT MAX(id) FROM enrichment_batches WHERE status='in_progress')
  )
  ORDER BY c.id
  LIMIT 20
`).all();
console.log(`Found ${rows.length} stuck paragraphs in latest in_progress batch:`);
for (const r of rows) {
  console.log(`---\nid=${r.id} para=${r.paragraph_index} len=${r.len} doc="${(r.title||"").slice(0,50)}"`);
  const preview = (r.text || "").replace(/\s+/g, " ").slice(0, 300);
  console.log(`  ${preview}`);
}
db.close();
