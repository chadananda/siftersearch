// hype-many — HyPE for MANY small documents in ONE detached process, so their paragraphs share full Message Batches.
//
// Why (10-14): the Core Tablets are 22,062 documents of a few paragraphs each. The grounding queue runs one process per
// document; each would submit a batch of a handful of requests and wait out a whole batch round-trip (5–10 min) — weeks
// of wall-clock and the batch discount wasted on tiny batches. Here dozens of documents run at once and their calls
// pool into 500-request batches (ai.js batch transport, ANTHROPIC_BATCH=1 from spawn.js).
//
//   node scripts/hype-many.mjs <ids.json> [--no-disambig] [--rehype] [--cc=60]
//
// Metered per document (withUsageScope, like complete-book); stops cleanly when the Anthropic grounding budget is
// over (pipeline/queue budgetStatus). Re-runnable: finished paragraphs are skipped by HyPE's own resume.
import fs from 'fs';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: hype-many.mjs <ids.json> [--no-disambig] [--rehype] [--cc=N]'); process.exit(1); }
const ids = JSON.parse(fs.readFileSync(file, 'utf8')).map(Number).filter(Boolean);
const noDisambig = argv.includes('--no-disambig');
const rehype = argv.includes('--rehype');
const cc = Number(argv.find((a) => a.startsWith('--cc='))?.split('=')[1]) || 60;

const { rag, langOf } = await import('../api/lib/rag-adapter/index.js');
const { withUsageScope } = await import('../api/lib/rag-adapter/usage.js');
const { budgetStatus } = await import('../api/lib/pipeline/queue.js');

const overBudget = async () => ((await budgetStatus().catch(() => [])) || []).some((b) => b.provider === 'anthropic' && b.over);
const tally = { docs: ids.length, done: 0, failed: 0, paras: 0, questioned: 0, twinCopied: 0, skippedBudget: 0 };
const t0 = Date.now();
console.log(`[hype-many] ${ids.length} docs · noDisambig=${noDisambig} · rehype=${rehype} · cc=${cc}`);

let next = 0, stopped = false, lastBudgetCheck = 0;
async function worker() {
  while (!stopped && next < ids.length) {
    const docId = ids[next++];
    if (Date.now() - lastBudgetCheck > 60000) {          // the ceiling is checked once a minute, not per document
      lastBudgetCheck = Date.now();
      if (await overBudget()) { stopped = true; console.log('[hype-many] Anthropic budget reached — stopping'); break; }
    }
    const scope = { docId, lang: null, stage: 'hype' };
    try { scope.lang = await langOf(docId); } catch { /* unknown language → the policy decides */ }
    try {
      const r = await withUsageScope(scope, () => rag.retrieval.index(docId, { noDisambig, upgrade: rehype }));
      tally.done++; tally.paras += r.paras || 0; tally.questioned += r.done || 0; tally.twinCopied += r.twinCopied || 0;
    } catch (err) {
      tally.failed++;
      console.error(`[hype-many] doc ${docId} FAILED: ${err.message}`);
    }
    if ((tally.done + tally.failed) % 200 === 0) {
      console.log(`[hype-many] ${tally.done + tally.failed}/${ids.length} docs · ${JSON.stringify(tally)} · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
  }
}
await Promise.all(Array.from({ length: cc }, worker));
tally.skippedBudget = ids.length - tally.done - tally.failed;
console.log(`[hype-many] COMPLETE ${JSON.stringify(tally)} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exit(0);
