// The post-conversion step convert-missing-books.mjs deliberately left undone: take the Markdown it
// already wrote, INGEST it, and retire the metadata stub it replaces. Runs during the PEAK window —
// grounding is paused for DeepSeek's off-peak pricing then, so the machine is otherwise idle and
// ingestion costs no model tokens at all. Deps: converted-books manifest, services/ingester, writer.
//
// SAFETY: dry by default (reports what it WOULD ingest). --apply writes.
//   node scripts/ingest-converted-books.mjs [--apply] [--limit N] [--any-time] [--id STUBID]
// Idempotent: the manifest records ingested_doc_id, so a re-run skips finished entries.
// Run ON tower-nas (library files + writer live there).
import fs from 'fs';
import path from 'path';
import { nowInPeak } from '../api/lib/pipeline/peak.js';

const APPLY = process.argv.includes('--apply');
const ANY_TIME = process.argv.includes('--any-time');
const argOf = (flag, cast = String) => { const i = process.argv.indexOf(flag); return i >= 0 ? cast(process.argv[i + 1]) : null; };
const LIMIT = argOf('--limit', Number) ?? Infinity;
const ONLY_ID = argOf('--id', Number);

const MANIFEST = '.work/converted-books-manifest.json';

// Ingest belongs in the window where grounding ISN'T running: they share one box, and a big ingest
// competing with live model runs slows the expensive half. --any-time overrides for a manual run.
if (!ANY_TIME && !nowInPeak()) {
  console.log('off-peak (grounding is running) → skipping ingest; use --any-time to force');
  process.exit(0);
}
if (!fs.existsSync(MANIFEST)) { console.log(`no manifest at ${MANIFEST} — run convert-missing-books.mjs first`); process.exit(0); }

const { config } = await import('../api/lib/config.js');
const { ingestDocument } = await import('../api/services/ingester.js');
const LIB = config.library?.basePath;
const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';

async function write(statements, name) {
  const r = await fetch(`${WRITER}/write`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statements, name }),
  });
  if (!r.ok) throw new Error(`writer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pending = manifest.filter((m) => !m.ingested_doc_id && (!ONLY_ID || m.stub_id === ONLY_ID));
console.log(`manifest: ${manifest.length} converted · ${pending.length} awaiting ingest${APPLY ? '' : ' (DRY RUN)'}`);

const report = { ingested: [], missingFile: [], failed: [], retired: [] };
let n = 0;
for (const m of pending) {
  if (n >= LIMIT) break;
  const abs = path.join(LIB, m.rel);
  if (!fs.existsSync(abs)) { report.missingFile.push(m); continue; }
  n++;
  if (!APPLY) { report.ingested.push({ stub_id: m.stub_id, rel: m.rel, title: m.title }); continue; }
  try {
    const text = fs.readFileSync(abs, 'utf8');
    const res = await ingestDocument(text, { title: m.title, source_url: m.source_url }, m.rel);
    const newId = res?.documentId ?? res?.docId ?? res?.id;
    if (!newId) throw new Error(`ingest returned no document id: ${JSON.stringify(res).slice(0, 120)}`);
    report.ingested.push({ stub_id: m.stub_id, doc_id: newId, rel: m.rel, title: m.title });

    // Retire the stub — EXPLICITLY, by the id the manifest recorded. Never a heuristic sweep: a
    // bulk dedupe once soft-deleted 155 canonical docs, so each retirement names exactly one row and
    // points it at its replacement so the change is traceable and reversible.
    if (Number(m.stub_id) !== Number(newId)) {
      await write([{
        sql: `UPDATE docs SET duplicate_of = ?, deleted_at = COALESCE(deleted_at, unixepoch())
               WHERE id = ? AND duplicate_of IS NULL`,
        args: [newId, m.stub_id],
      }], `retire-stub-${m.stub_id}`);
      report.retired.push({ stub_id: m.stub_id, superseded_by: newId });
    }
    m.ingested_doc_id = newId;
    m.ingested_at = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));   // incremental → crash-safe/resumable
    console.log(`  ✓ ${m.stub_id} → doc ${newId} "${(m.title || '').slice(0, 45)}"`);
  } catch (e) {
    report.failed.push({ stub_id: m.stub_id, title: m.title, err: e.message });
    console.log(`  ✗ ${m.stub_id} "${(m.title || '').slice(0, 40)}": ${e.message}`);
  }
}

console.log(`\nSUMMARY (${APPLY ? 'APPLIED' : 'DRY'}): ingested ${report.ingested.length} · retired ${report.retired.length} · missing file ${report.missingFile.length} · failed ${report.failed.length}`);
fs.writeFileSync('.work/ingest-converted-books-report.json', JSON.stringify(report, null, 2));
