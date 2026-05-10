import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true });
const rows = db.prepare(`
  SELECT c.id, length(c.text) AS len, substr(c.text, 1, 200) AS preview, d.title, d.author
  FROM content c
  JOIN docs d ON d.id = c.doc_id
  WHERE c.id IN (SELECT content_id FROM enrichment_pending)
  LIMIT 30
`).all();

console.log(`Found ${rows.length} stuck paragraphs:`);
for (const r of rows) {
  console.log(`---\nid=${r.id} len=${r.len} doc="${(r.title || '').slice(0, 50)}" by ${(r.author || '').slice(0, 30)}`);
  console.log(`  ${(r.preview || '').replace(/\s+/g, ' ').slice(0, 200)}`);
}
db.close();
