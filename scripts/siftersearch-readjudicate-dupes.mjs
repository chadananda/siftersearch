// Re-adjudicate existing duplicate_of links with the AI same-work judge and
// clear the false ones (un-suppressing wrongly-hidden works). The old keyword
// matcher marked distinct works as duplicates (Analects→Epistle of James,
// "Ibn Ezra on Amos"→Amos), hiding them from search. This re-checks each link
// by AI analysis of the actual text and frees the false ones.
//
//   --dry-run (default)  print AI verdict per link; change nothing
//   --apply              clear duplicate_of + is_duplicate for links the AI
//                        judges DISTINCT (routes writes through the single-writer)
//
// Only touches links whose canonical is an OceanLibrary doc. Never deletes
// content; only un-suppresses. See feedback_oceanlibrary_canonical.
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import urllib from 'http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { adjudicateSameWork } = await import('../api/lib/dedup-adjudicator.js');

const APPLY = process.argv.includes('--apply');
const WRITER = process.env.SIFTER_WRITER_URL || 'http://localhost:7849/write';

function writeBatch(statements) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ statements, name: 'siftersearch-readjudicate-clear' });
    const u = new URL(WRITER);
    const req = urllib.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d || '{}')) : reject(new Error(`writer ${res.statusCode}: ${d.slice(0,200)}`))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

const links = await queryAll(`
  SELECT d.id, d.title, d.author, d.religion, ol.id AS ol_id, ol.title AS ol_title
  FROM docs d JOIN docs ol ON ol.id = d.duplicate_of
  WHERE d.deleted_at IS NULL AND ol.source_site = 'oceanlibrary.com'
  ORDER BY d.id`);

console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} | existing duplicate_of→OceanLibrary links: ${links.length}\n`);

let kept = 0, cleared = 0, errors = 0;
for (const l of links) {
  const paras = await queryAll('SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 500', [l.id]);
  let v;
  try { v = await adjudicateSameWork({ title: l.title, author: l.author, religion: l.religion, paragraphs: paras }, l.ol_id); }
  catch (e) { errors++; console.log(`  ERR  ${l.title} :: ${e.message}`); continue; }
  const isSame = v.same && v.confidence >= 0.85;
  console.log(`  ${isSame ? 'KEEP ' : 'CLEAR'} [${(v.confidence ?? 0).toFixed(2)}] "${(l.title||'').slice(0,40)}" vs OL "${(l.ol_title||'').slice(0,34)}" — ${v.reason}`);
  if (isSame) { kept++; continue; }
  cleared++;
  if (APPLY) {
    try {
      await writeBatch([
        { sql: 'UPDATE docs SET duplicate_of = NULL, updated_at = ? WHERE id = ?', args: [new Date().toISOString(), l.id] },
        { sql: 'UPDATE content SET is_duplicate = 0, synced = 0 WHERE doc_id = ?', args: [l.id] },
      ]);
    } catch (e) { errors++; console.log(`    write failed: ${e.message}`); }
  }
}

console.log(`\nKEEP (genuine dup): ${kept} | CLEAR (false, un-suppress): ${cleared} | errors: ${errors}`);
if (!APPLY) console.log('DRY-RUN — re-run with --apply to clear the false links.');
process.exit(0);
