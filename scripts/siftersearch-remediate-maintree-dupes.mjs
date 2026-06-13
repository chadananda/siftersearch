// Remediate main-tree (non-OceanLibrary) physical files that duplicate an
// OceanLibrary canonical doc. We control these files (the main library tree);
// we do NOT touch -sites/ (OceanLibrary's own files).
//
// For each main-tree doc that is duplicate_of an OceanLibrary canonical doc:
//   --dry-run (default)  report file_path + the OL canonical it duplicates
//   --mark               add durable frontmatter to the physical .md:
//                          is_duplicate: true
//                          canonical_url: <OL source_url>
//                          canonical_doc_id: <OL doc id>
//                        (reversible; keeps the file, stops it masquerading as primary)
//   --remove             physically delete the .md (the watcher then soft-deletes
//                        the doc via the guarded chokepoint on verified absence)
//
// Safe-by-default: does nothing without --mark or --remove. Only operates on
// files that physically resolve (verified present) and are NOT under -sites/.
// See feedback_oceanlibrary_canonical + project_canonical_gutted_by_dedupe_20260609.
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, access, unlink } from 'fs/promises';
import yaml from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { config } = await import('../api/lib/config.js');

const args = process.argv.slice(2);
const MODE = args.includes('--remove') ? 'remove' : args.includes('--mark') ? 'mark' : 'dry-run';
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const basePath = config.library.basePath;
if (!basePath) { console.error('library.basePath not configured'); process.exit(1); }

// Main-tree docs (we control) that have been superseded by an OceanLibrary canonical.
const rows = await queryAll(`
  SELECT d.id, d.file_path, ol.id AS ol_id, ol.title AS ol_title, ol.source_url AS ol_url
  FROM docs d
  JOIN docs ol ON ol.id = d.duplicate_of
  WHERE d.deleted_at IS NULL
    AND (d.source_site IS NULL OR d.source_site = '')
    AND ol.source_site = 'oceanlibrary.com'
    AND d.file_path IS NOT NULL
  ORDER BY d.id`);

console.log(`Mode: ${MODE} | main-tree docs superseded by an OceanLibrary canonical: ${rows.length}`);

let resolved = 0, missing = 0, sitesSkipped = 0, marked = 0, removed = 0, errors = 0;
let shown = 0;
for (const r of rows) {
  if (marked + removed >= LIMIT) break;
  // Never touch -sites/ files — those are not ours.
  if (r.file_path.startsWith('-sites/')) { sitesSkipped++; continue; }
  const abs = join(basePath, r.file_path);
  let present = false;
  try { await access(abs); present = true; } catch { present = false; }
  if (!present) { missing++; continue; }
  resolved++;

  if (shown < 15) { console.log(`  dup: ${r.file_path}\n        → canonical: ${r.ol_title} (${r.ol_url || 'doc ' + r.ol_id})`); shown++; }

  if (MODE === 'mark') {
    try {
      const raw = await readFile(abs, 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      let fm = {}, body = raw;
      if (m) { try { fm = yaml.parse(m[1]) || {}; } catch { fm = {}; } body = m[2]; }
      fm.is_duplicate = true;
      fm.canonical_url = r.ol_url || null;
      fm.canonical_doc_id = r.ol_id;
      const out = `---\n${yaml.stringify(fm)}---\n${body}`;
      await writeFile(abs, out, 'utf8');
      marked++;
    } catch (e) { errors++; console.error(`  ERROR marking ${r.file_path}: ${e.message}`); }
  } else if (MODE === 'remove') {
    try { await unlink(abs); removed++; }
    catch (e) { errors++; console.error(`  ERROR removing ${r.file_path}: ${e.message}`); }
  }
}

console.log(`\nResolved on disk: ${resolved} | already-missing: ${missing} | -sites skipped: ${sitesSkipped}`);
if (MODE === 'mark') console.log(`Marked: ${marked} | errors: ${errors}`);
else if (MODE === 'remove') console.log(`Removed: ${removed} | errors: ${errors}`);
else console.log(`DRY-RUN — re-run with --mark (add is_duplicate frontmatter) or --remove (delete files).`);
process.exit(0);
