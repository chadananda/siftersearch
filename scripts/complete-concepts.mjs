// complete-concepts — run the CONCEPTUAL track over one document, detached.
//
// Exists because concept runs cannot live in an HTTP request: concepts/disambiguate is SEQUENTIAL by design
// (paragraph N is only correct once N-1 has been read), so a 292-paragraph book died on a Cloudflare 524.
// Grounding solved this long ago with a detached CLI + per-doc log; this is the same shape, so an
// operator-launched concept run and an API-launched one are identical.
//
//   node scripts/complete-concepts.mjs <docId> [--only=extract] [--from=extract] [--limit=N] [--dry]
//
// Order is FIXED (conceptual-track §3/§7): disambiguate → extract → lexicon → reconcile. The lexicon must
// accumulate from the higher texts before lower texts bind to it, and HyPE reads the note, so a
// concept-carrying note must exist before questions are written.
// promote is LAST: it rebuilds concept records from the lexicon, so it must see everything the earlier
// stages wrote. Deterministic and idempotent, so re-running converges rather than duplicating.
const ORDER = ['disambiguate', 'extract', 'lexicon', 'reconcile', 'promote'];

const argv = process.argv.slice(2);
const docId = Number(argv[0]);
if (!docId) { console.error('usage: complete-concepts.mjs <docId> [--only=stage] [--from=stage] [--limit=N] [--dry]'); process.exit(1); }
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const only = flag('only');
const from = flag('from');
const limit = Number(flag('limit')) || undefined;
const dryRun = argv.includes('--dry');

const fromI = from ? ORDER.indexOf(from) : 0;
const stages = only ? [only] : ORDER.slice(fromI < 0 ? 0 : fromI);
const unknown = stages.filter((s) => !ORDER.includes(s));
if (unknown.length) { console.error(`unknown stage(s): ${unknown.join(', ')} — known: ${ORDER.join(', ')}`); process.exit(1); }

const { rag, langOf } = await import('../api/lib/rag-adapter/index.js');
const { withUsageScope } = await import('../api/lib/rag-adapter/usage.js');
const { setAIContext } = await import('../api/lib/ai-context.js');

// METERING SCOPE — the same one run-grounding establishes, and for the same reason. Without it a concept run
// is UNMETERED: its model calls are not costed against (docId, stage) in ai_usage, do not appear in byBook,
// and — the part that matters — are not checked against the spend policy that authorises Anthropic for
// PERSIAN ONLY. Measured on the first GPB run: 3,753 claims extracted while the doc's byBook total did not
// move at all. An unmetered path around a fail-closed policy is the policy not existing.
const scope = { docId, lang: null, stage: null };
try { scope.lang = await langOf(docId); } catch { /* unknown language → policy fails closed on paid providers */ }

const started = Date.now();
console.log(`[concepts] doc ${docId} — stages: ${stages.join(' → ')}${dryRun ? ' (DRY)' : ''}${limit ? ` limit=${limit}` : ''}`);

let failed = null;
await withUsageScope(scope, async () => {
for (const stage of stages) {
  setAIContext({ stage: `concept:${stage}` });   // cost each stage separately, as grounding does
  const t0 = Date.now();
  try {
    const fn = stage === 'lexicon' ? rag.concepts.lexicon.seed : rag.concepts[stage];
    const res = await fn.call(rag.concepts, docId, { limit, dryRun });
    console.log(`[concepts] ${stage}: ${JSON.stringify(res)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    // Stop at the first failure. A later stage consuming a half-built lexicon produces confidently wrong
    // bindings, and a wrong entry in the lexicon propagates as authoritative interpretation to every lower
    // text that resolves against it — worse than no bindings at all.
    console.error(`[concepts] ${stage} FAILED: ${err.message}`);
    failed = stage;
    break;
  }
}
});

if (!failed && !dryRun) {
  try {
    const { syncConcepts } = await import('../api/lib/search/concepts.js');
    console.log(`[concepts] index: ${JSON.stringify(await syncConcepts())}`);
  } catch (err) {
    console.error(`[concepts] index FAILED: ${err.message}`);   // reported; the extraction still stands
  }
}

console.log(`[concepts] doc ${docId} ${failed ? `STOPPED at ${failed}` : 'complete'} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
// Explicit exit: the rag adapter holds Meili/writer clients whose keep-alive handles keep the event loop open,
// which is exactly what left siftersearch-book-ingest hanging at 'online' until a cron tick killed it.
process.exit(failed ? 1 : 0);
