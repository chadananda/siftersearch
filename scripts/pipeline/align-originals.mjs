// Populate the bilingual layer on `content` — the original beside Shoghi Effendi's rendering (migration 120).
//
//   node scripts/pipeline/align-originals.mjs --dry                 # every alignable doc, report only
//   node scripts/pipeline/align-originals.mjs --doc 20810 --dry     # one doc, report only
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/pipeline/align-originals.mjs --doc 20810
//   … --coverage                                                    # what is already aligned, no fetching
//
// ALWAYS --dry FIRST on a doc you have not aligned before. The alignment is a derived claim about two texts;
// a dry run reports coverage, the score spread and the unmatched paragraphs by name, which is what tells you
// whether the pairing is real before it is written.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });

const { rag } = await import('../../api/lib/rag-adapter/index.js');
const { CTAI_WORK_BY_DOC } = await import('../../api/lib/rag/concepts/ctai.js');
const { makeStore } = await import('../../api/lib/rag-adapter/store.js');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const dryRun = has('--dry');
const only = val('--doc');
const docIds = only ? [Number(only)] : Object.keys(CTAI_WORK_BY_DOC).map(Number);

if (has('--coverage')) {
  const store = makeStore();
  console.log('\nBILINGUAL LAYER COVERAGE\n');
  for (const docId of docIds) {
    const c = await store.getOriginalCoverage(docId);
    const pct = c.total ? Math.round((100 * c.aligned) / c.total) : 0;
    console.log(`  ${String(docId).padEnd(7)} ${CTAI_WORK_BY_DOC[docId].padEnd(32)} ` +
      `${String(c.aligned).padStart(4)}/${String(c.total).padEnd(4)} (${pct}%) · SE-rendered ${c.seRendered}`);
  }
  console.log('');
  process.exit(0);
}

if (!dryRun && !process.env.SIFTER_WRITER_URL) {
  console.error('Refusing to write without SIFTER_WRITER_URL — sifter.db has ONE writer (:7849).');
  process.exit(2);
}

console.log(`\n${dryRun ? 'DRY RUN' : 'WRITING'} — bilingual layer for ${docIds.length} doc(s)\n`);
for (const docId of docIds) {
  const t0 = Date.now();
  process.stdout.write(`  ${docId} ${CTAI_WORK_BY_DOC[docId] || '?'} … fetching pairs`);
  try {
    const r = await rag.concepts.alignOriginals(docId, { dryRun });
    const secs = Math.round((Date.now() - t0) / 1000);
    if (r.skipped || r.error) { console.log(`\r  ${docId}: ${r.skipped || r.error}`.padEnd(80)); continue; }
    console.log(`\r  ${docId} ${r.work}`.padEnd(52) +
      `${r.matched}/${r.ours} (${Math.round(r.coverage * 100)}%) · median ${r.medianScore} · min ${r.minScore} · ` +
      `${r.authority || 'no authority'} · ${r.written} written · ${secs}s`);
    if (r.unmatchedSamples?.length) {
      console.log(`      unmatched (${r.unmatchedOurs}), first few:`);
      for (const u of r.unmatchedSamples) console.log(`        #${u.index} ${JSON.stringify(u.text)}`);
    }
    if (r.unmatchedTheirs) console.log(`      ${r.unmatchedTheirs} original paragraph(s) matched nothing on our side`);
  } catch (err) {
    console.log(`\r  ${docId}: FAILED — ${err.message}`.padEnd(80));
  }
}
console.log('');
