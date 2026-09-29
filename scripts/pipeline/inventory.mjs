// Partial Inventory (Stephen Phelps, github.com/portlandiator/PI_browser) → inventory_items + inventory_links (migr 129).
//
//   node scripts/pipeline/inventory.mjs --stage import      # download + load 29k records
//   node scripts/pipeline/inventory.mjs --stage link [--dry] # locate each original in our ingested library
//
// link: each PIN's original is located VERBATIM (anchor.js letter coverage) in Baha'i/Core Tablets; the link stores
// both ids — PIN and the oceanoflights bookid (= file name stem) — plus our doc id. Status per PIN: present (≥0.6),
// absent (<0.3), unclear. Run on tower-nas via POST /api/admin/server/inventory.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const { queryAll, transaction } = await import('../../api/lib/db.js');
const { buildIndex, locate } = await import('../../api/lib/rag/concepts/anchor.js');

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const stage = val('--stage') || 'import';
const dry = args.includes('--dry');
const DIR = 'tmp/pi';
const URL = 'https://raw.githubusercontent.com/portlandiator/PI_browser/main/data/collection.tar.gz';
const t0 = Date.now();

function ensureData() {
  if (existsSync(join(DIR, 'metadata - copy'))) return;
  mkdirSync(DIR, { recursive: true });
  execFileSync('curl', ['-sL', '-m', '600', '-o', join(DIR, 'collection.tar.gz'), URL]);
  execFileSync('tar', ['-xzf', 'collection.tar.gz'], { cwd: DIR });
}
const readText = (p) => { const b = readFileSync(p); const t = b.toString('utf8'); return t.includes('�') ? b.toString('latin1') : t; };

// Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines).
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^\uFEFF/, ''), r[i] ?? ''])));
}
const authorOf = (pin) => ({ BH: "Bahá'u'lláh", AB: "'Abdu'l-Bahá", BB: 'The Báb' })[pin.slice(0, 2)] || null;

if (stage === 'import') {
  ensureData();
  const meta = readdirSync(join(DIR, 'metadata - copy')).find((f) => f.endsWith('.csv'));
  const rows = parseCsv(readFileSync(join(DIR, 'metadata - copy', meta), 'utf8'));
  const has = (sub, pin) => existsSync(join(DIR, sub, `${pin}.txt`));
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').trim();
  const items = rows.filter((r) => r.PIN).map((r) => [r.PIN, authorOf(r.PIN), r.Language || null, r.Title || null,
    r['First line (original)'] || null, r['First line (translated)'] || null, strip(r.Translations) || null, r.Volume || null,
    r.Date || null, r.Period || null, r.Recipient || null, r.Place || null, Number(r['Word count']) || null,
    has('original_texts - copy', r.PIN) ? 1 : 0, has('translated_texts - copy', r.PIN) ? 1 : 0]);
  console.log(`records ${items.length} | with original ${items.filter((x) => x[13]).length} | with rendering ${items.filter((x) => x[14]).length}`);
  if (!dry) {
    for (let i = 0; i < items.length; i += 500) {
      await transaction(items.slice(i, i + 500).map((a) => ({
        sql: `INSERT INTO inventory_items (pin, author, language, title, first_line_orig, first_line_en, citations, volume,
                date, period, recipient, place, word_count, has_original, has_rendering)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT (pin) DO UPDATE SET author=excluded.author, language=excluded.language, title=excluded.title,
                first_line_orig=excluded.first_line_orig, first_line_en=excluded.first_line_en, citations=excluded.citations,
                volume=excluded.volume, date=excluded.date, period=excluded.period, recipient=excluded.recipient,
                place=excluded.place, word_count=excluded.word_count, has_original=excluded.has_original,
                has_rendering=excluded.has_rendering`, args: a })), 'inventory:import');
    }
    console.log('imported', items.length);
  }
}

if (stage === 'link') {
  ensureData();
  const originals = await queryAll(
    `SELECT c.id, c.doc_id AS docId, c.text, d.file_path AS path FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE d.file_path LIKE 'Baha''i/Core Tablets/%' AND d.language IN ('ar','fa')
        AND c.deleted_at IS NULL AND d.deleted_at IS NULL`, [], 'inventory:originals');
  const pathOf = new Map(originals.map((o) => [o.docId, o.path]));
  const index = buildIndex(originals);
  console.log(`originals ${originals.length} indexed`);
  const dirO = join(DIR, 'original_texts - copy');
  const tally = { present: 0, absent: 0, unclear: 0, empty: 0 };
  const links = [], status = [];
  for (const f of readdirSync(dirO).sort()) {
    const pin = f.replace(/\.txt$/, '');
    const t = readText(join(dirO, f));
    if (!/[؀-ۿ]/.test(t)) { tally.empty++; status.push([pin, 'empty', null]); continue; }
    const r = locate(t.slice(0, 6000), index, { minCoverage: 0.6 });
    const cov = r ? r.coverage : 0;
    const s = cov >= 0.6 ? 'present' : cov < 0.3 ? 'absent' : 'unclear';
    tally[s]++; status.push([pin, s, cov]);
    if (r && cov >= 0.3) links.push([pin, r.docId, basename(pathOf.get(r.docId) || '').replace(/\.md$/, ''), cov, s === 'present' ? 'anchor' : 'anchor-weak']);
  }
  console.log('link:', tally, '| links', links.length);
  if (!dry) {
    for (let i = 0; i < status.length; i += 500) {
      await transaction(status.slice(i, i + 500).map(([pin, s, cov]) => ({
        sql: 'UPDATE inventory_items SET ool_status = ?, ool_coverage = ? WHERE pin = ?', args: [s, cov, pin] })), 'inventory:status');
    }
    for (let i = 0; i < links.length; i += 500) {
      await transaction(links.slice(i, i + 500).map((a) => ({
        sql: `INSERT INTO inventory_links (pin, doc_id, ool_id, coverage, basis) VALUES (?,?,?,?,?)
              ON CONFLICT (pin, doc_id) DO UPDATE SET ool_id=excluded.ool_id, coverage=excluded.coverage, basis=excluded.basis`,
        args: a })), 'inventory:links');
    }
    console.log('written', links.length, 'links,', status.length, 'statuses');
  }
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(0);
