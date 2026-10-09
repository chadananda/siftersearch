#!/usr/bin/env node
// Library-wide sweep: books whose stored paragraphs no longer match what the CURRENT parser makes of their file. A parser
// fix (e.g. 10-03: consecutive "> " lines are one quotation, not one row per printed line) never re-ingests a book by
// itself — only a file change does — so old ingests keep the old split (10-09: 66 secondary books, 54,955 rows → 23,054).
// Read-only (runs ON tower). Writes one JSON line per stale book to --out (default /tank/sifter/stale-sweep.jsonl).
//   node scripts/library/stale-ingest-sweep.mjs [--out file] [--min-extra 20] [--ratio 1.05]
import Database from 'better-sqlite3';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseDocumentWithBlocks, parseMarkdownFrontmatter } from '../../api/services/ingester.js';
import { getAuthority } from '../../api/lib/authority.js';
import { config } from '../../api/lib/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const OUT = opt('--out', '/tank/sifter/stale-sweep.jsonl'), MIN = Number(opt('--min-extra', 20)), RATIO = Number(opt('--ratio', 1.05));
const BASE = config.library.basePath;
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
writeFileSync(OUT, '');
// library files only (scraped sites have their own adapters); id-ordered pages keep each read short
const page = db.prepare(`SELECT id, file_path, title, author, religion, collection FROM docs
  WHERE id > ? AND deleted_at IS NULL AND file_path IS NOT NULL AND (source_site IS NULL OR source_site = '') ORDER BY id LIMIT 2000`);
const count = db.prepare('SELECT COUNT(*) n FROM content WHERE doc_id = ? AND deleted_at IS NULL');
let seen = 0, stale = 0;
for (let last = 0; ;) {
  const docs = page.all(last);
  if (!docs.length) break;
  last = docs[docs.length - 1].id;
  for (const d of docs) {
    const f = join(BASE, d.file_path);
    if (!existsSync(f)) continue;
    let parsed;
    try {
      const { content } = parseMarkdownFrontmatter(readFileSync(f, 'utf8'));
      parsed = (await parseDocumentWithBlocks(content, { skipAISegmentation: true })).chunks.length;
    } catch { continue; }
    const rows = count.get(d.id).n;
    seen++;
    if (rows > parsed * RATIO && rows - parsed >= MIN) {
      stale++;
      appendFileSync(OUT, JSON.stringify({ id: d.id, rows, parsed, authority: getAuthority(d), religion: d.religion, title: String(d.title || '').slice(0, 70) }) + '\n');
    }
    if (seen % 5000 === 0) console.log(JSON.stringify({ seen, stale }));
  }
}
console.log(JSON.stringify({ done: true, seen, stale, out: OUT }));
process.exit(0);
