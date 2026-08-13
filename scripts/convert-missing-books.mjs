// Missing-books converter: turn fetchable metadata-STUBS into real Markdown books.
// For each fetchable stub (a scraped bahai-library.com metadata page that links a real
// .docx/.pdf/.rtf), fetch the source file, convert to clean Markdown with a source_url
// header, write it into the library, and retire the stub. Books + scholarly papers only —
// obvious non-documents (changelogs, fundraising, version notes) are skipped.
//
// SAFETY: dry by default (download + convert + quality-gate + REPORT, no writes). --apply writes.
//   node scripts/convert-missing-books.mjs [--apply] [--limit N] [--id DOCID] [--fetch-frames] [--any-time]
// PDFs: text-layer ONLY (never OCR) — a coherent-prose gate rejects scanned/sparse PDFs.
// Run ON tower-nas (library files + writer live there). Writes via SIFTER_WRITER_URL for DB ops.
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const APPLY = process.argv.includes('--apply');
const FETCH_FRAMES = process.argv.includes('--fetch-frames');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();
const ONLY_ID = (() => { const i = process.argv.indexOf('--id'); return i >= 0 ? parseInt(process.argv[i + 1], 10) : null; })();


const db = new Database('data/sifter.db', { readonly: true });
const { config } = await import('../api/lib/config.js');
const { detectLang } = await import('../api/lib/pipeline/profile.js');
// Window/API-request handling + run records come from the shared harness, so every stage decides and
// reports identically, and a rejection becomes DATA (a reason with a count) instead of a log line.
const { runStage } = await import('./lib/stage-runner.mjs');
const stageState = await import('../api/lib/pipeline/stage-state.js');
const CONVERT_VERSION = 'convert-2';   // bump when the quality gate or extraction rules change
const LIB = config.library?.basePath;
const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';

// ── Type filter: keep books + scholarly papers; skip obvious non-documents ────
const SKIP_TITLE = /(what'?s new|version \d|changelog|^funds?$|fundrais|donation|membership|minutes of|agenda|newsletter|price list|order form|flyer|poster|brochure)/i;
const isConvertible = (t) => t && !SKIP_TITLE.test(t.trim());

// ── Quality gate for extracted text (never OCR; reject scanned/sparse) ────────
function coherentProse(text, { pages = 1 } = {}) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const words = t ? t.split(' ').length : 0;
  const alpha = (t.match(/[a-zA-ZÀ-ɏ]/g) || []).length;
  const alphaRatio = t.length ? alpha / t.length : 0;
  const wordsPerPage = words / Math.max(1, pages);
  // A real text layer: substantial word count, mostly letters, reasonable density per page.
  const ok = words >= 300 && alphaRatio >= 0.55 && wordsPerPage >= 120;
  return { ok, words, alphaRatio: +alphaRatio.toFixed(2), wordsPerPage: Math.round(wordsPerPage) };
}

// ── Fetch a source file (follows redirects; returns Buffer + content-type) ────
async function fetchFile(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000), headers: { 'user-agent': 'SifterSearch/1.0 (library ingest)' } });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  return { buf: Buffer.from(await r.arrayBuffer()), ct };
}

// ── Framed-PDF recovery: read the bahai-library page, extract the embedded PDF URL ──
async function findFramedPdf(pageUrl) {
  try {
    const r = await fetch(pageUrl, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'SifterSearch/1.0' } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<iframe[^>]+src=["']([^"']+\.pdf[^"']*)["']/i)
      || html.match(/<embed[^>]+src=["']([^"']+\.pdf[^"']*)["']/i)
      || html.match(/https?:\/\/[^\s"'<>]+\.pdf\b/i);
    if (!m) return null;
    return new URL(m[1] || m[0], pageUrl).href;
  } catch { return null; }
}

// ── Converters ────────────────────────────────────────────────────────────────
async function docxToMarkdown(buf) {
  const mammoth = (await import('mammoth')).default || (await import('mammoth'));
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}
async function pdfToText(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join('\n') : text, pages: totalPages || 1 };
}
function rtfToText(buf) {
  // Minimal RTF → text: drop control words/groups, unescape hex. Good enough for prose.
  return buf.toString('latin1')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\par[d]?/g, '\n').replace(/\{\\[^}]*\}/g, '').replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

const slugify = (s) => String(s || 'untitled').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

async function writeViaWriter(statements, name) {
  const r = await fetch(`${WRITER}/write`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statements, name }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`writer ${r.status}: ${await r.text()}`);
}

// ── Work-list: fetchable stubs (logo/TAGS chrome, <36 paras) with a source file ──
let stubs = db.prepare(`
  SELECT d.id, d.title, d.author, d.religion, d.collection, d.source_url, d.file_path,
    (SELECT c.text FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL
       AND (c.text LIKE '%bahai-library.com/docs/%' OR c.text LIKE '%.docx%' OR c.text LIKE '%.pdf%' OR c.text LIKE '%.rtf%') LIMIT 1) linktext
  FROM docs d JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
  WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.language = 'en'
    AND d.paragraph_count BETWEEN 1 AND 35
    AND d.title NOT LIKE '%Partial Inventory%' AND COALESCE(d.author,'') NOT LIKE '%Phelps%'
  GROUP BY d.id HAVING SUM(CASE WHEN c.text LIKE '%logo_1850x358%' OR c.text LIKE '%TAGS:%' THEN 1 ELSE 0 END) > 0
`).all();
if (ONLY_ID) stubs = stubs.filter((s) => s.id === ONLY_ID);

const fileUrlOf = (s) => {
  const t = s.linktext || '';
  const m = t.match(/https?:\/\/[^\s()[\]"']+\.(?:pdf|docx?|rtf)\b/i) || t.match(/https?:\/\/bahai-library\.com\/docs\/[^\s()[\]"']+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
};

console.log(`stubs (chrome, <36¶): ${stubs.length}${ONLY_ID ? ` (filtered to #${ONLY_ID})` : ''} · mode: ${APPLY ? 'APPLY (write files, DEFER ingest+retire)' : 'DRY'}\n`);
const report = { converted: [], skippedType: [], noFile: [], badQuality: [], fetchErr: [] };
const MANIFEST = '.work/converted-books-manifest.json';
const manifest = (() => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return []; } })();
const alreadyDone = new Set(manifest.map((m) => m.stub_id));   // resume-safe: skip already-converted
let done = 0;

await runStage('convert', { anyTime: process.argv.includes('--any-time') }, async (tally) => {
const rec = async (id, o) => { if (APPLY) await stageState.markStage(id, 'convert', { version: CONVERT_VERSION, ...o }).catch(() => {}); };

for (const s of stubs) {
  if (done >= LIMIT) break;
  if (APPLY && alreadyDone.has(s.id)) continue;   // resume: already converted in a prior run
  if (!isConvertible(s.title)) {
    report.skippedType.push({ id: s.id, title: s.title });
    tally.rejected++; tally.reason('not a document (changelog/fundraising/etc)');
    await rec(s.id, { status: 'rejected', reason: 'not a document (changelog/fundraising/etc)', payload: { title: s.title } });
    continue;
  }
  let url = fileUrlOf(s);
  if (!url && FETCH_FRAMES && s.source_url) url = await findFramedPdf(s.source_url);
  if (!url) {
    report.noFile.push({ id: s.id, title: s.title });
    tally.rejected++; tally.reason('no source file linked');
    await rec(s.id, { status: 'rejected', reason: 'no source file linked', payload: { title: s.title, source_url: s.source_url } });
    continue;
  }
  done++; tally.in++;
  try {
    const { buf } = await fetchFile(url);
    const ext = (url.match(/\.(pdf|docx?|rtf)\b/i) ?? ['', ''])[1].toLowerCase();
    let text, pages = 1;
    if (ext === 'docx' || ext === 'doc') text = await docxToMarkdown(buf);
    else if (ext === 'pdf') ({ text, pages } = await pdfToText(buf));
    else if (ext === 'rtf') text = rtfToText(buf);
    else {
      report.fetchErr.push({ id: s.id, title: s.title, err: `unsupported ext ${ext}` });
      tally.rejected++; tally.reason(`unsupported extension .${ext}`);
      await rec(s.id, { status: 'rejected', reason: `unsupported extension .${ext}`, payload: { url } });
      continue;
    }

    const q = coherentProse(text, { pages });
    if (!q.ok) {
      report.badQuality.push({ id: s.id, title: s.title, url, ...q });
      tally.rejected++; tally.reason(`poor text layer (${q.wordsPerPage ?? '?'} words/page)`);
      await rec(s.id, { status: 'rejected', reason: `poor text layer (${q.wordsPerPage ?? '?'} words/page)`, payload: { url, pages, words: q.words } });
      continue;
    }

    const religion = s.religion || 'Baha\'i';
    const collection = s.collection || 'Books';
    const slug = slugify(s.title);
    const rel = path.join(religion, collection, `${slug}.md`);
    // DETECT THE LANGUAGE FROM THE TEXT. The stub row says 'en' because bahai-library's metadata page is
    // in English — but the BOOK may not be ("Abdu'l-Bahá à Londres", "Tratado sobre gobernanza"). Ingesting
    // those as English is what sends them to a model that cannot read them and burns tokens until the
    // storm-guard parks the book (2026-08-12). Detect once, here, at the earliest point the real text exists.
    const lang = detectLang(text.slice(0, 6000), null) || 'en';
    const frontmatter = `---\ntitle: "${(s.title || '').replace(/"/g, "'")}"\nauthor: "${(s.author || '').replace(/"/g, "'")}"\nlanguage: ${lang}\nsource_url: ${s.source_url || url}\nsource_file: ${url}\nconverted: true\n---\n\n`;
    const md = frontmatter + text.replace(/\n{3,}/g, '\n\n').trim() + '\n';

    report.converted.push({ id: s.id, title: s.title, rel, words: q.words, pages });
    if (APPLY) {
      const dest = path.join(LIB, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, md);
      // DEFER ingestion + stub-retirement until the history books finish (Chad's sequencing):
      // write the file now, record the stub↔file mapping in a manifest, and let the separate
      // post-history ingest step retire the stub + trigger ingestion. The library-watcher is
      // stopped, so a freshly-written file does NOT auto-ingest — exactly what we want.
      manifest.push({ stub_id: s.id, rel, source_url: s.source_url || url, file_url: url, title: s.title, words: q.words, pages });
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));   // incremental (crash-safe)
    }
    tally.out++;
    await rec(s.id, { status: 'done', payload: { rel, url, words: q.words, pages, language: lang } });
    console.log(`  ✓ ${s.id} "${(s.title || '').slice(0, 45)}" → ${rel} (${q.words}w/${pages}p, ${lang})`);
  } catch (e) {
    report.fetchErr.push({ id: s.id, title: s.title, url, err: e.message });
    tally.failed++;
    await rec(s.id, { status: 'failed', error: e.message, bumpAttempt: true, payload: { url } });
  }
}

console.log(`\nSUMMARY (${APPLY ? 'APPLIED' : 'DRY'}):`);
console.log(`  convertible + good quality: ${report.converted.length}`);
console.log(`  skipped (non-document type): ${report.skippedType.length}`);
console.log(`  no source file / frame not found: ${report.noFile.length}`);
console.log(`  rejected (poor text layer / scanned): ${report.badQuality.length}`);
console.log(`  fetch/convert errors: ${report.fetchErr.length}`);
fs.writeFileSync('.work/convert-missing-books-report.json', JSON.stringify(report, null, 2));
console.log(`\nfull report → .work/convert-missing-books-report.json`);
if (report.badQuality.length) console.log('sample rejected:', report.badQuality.slice(0, 5).map((r) => `${r.id} ${r.wordsPerPage}w/pg`).join(' · '));
});
