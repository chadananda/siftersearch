#!/usr/bin/env node
// complete-book — thin CLI over the shared grounding executor (api/lib/pipeline/run-grounding.js). Drives ONE book
// through the full Definition of Done and REFUSES to report it done unless it VERIFIES as searchable. Live stage
// state is reported by the executor INTO doc_pipeline (the single truth bio.js/UI/control-API read) — no status file.
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/complete-book.mjs 21310 [--from=reconcile] [--only=verify] [--cc=N]
// Exit 0 = complete+searchable; 2 = a stage left it unsearchable (missing[] printed); 1 = usage.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
// `TypeError: fetch failed` deliberately carries NO URL, so a crash tells you a loopback call died and
// nothing more. Chasing the 2026-08-13 grounding deaths, that one missing fact let three different
// hypotheses (single writer / Meilisearch / local model) all fit the same crash dump, and I "explained"
// it twice from correlation instead of evidence. Wrap fetch ONCE, here at the entry, so every failure
// names its own method + URL. Cheap (one try/catch per request) and it turns an unfalsifiable crash into
// a fact. Installed BEFORE run-grounding is imported so it covers module-evaluation calls too.
const _fetch = globalThis.fetch;
globalThis.fetch = async function namedFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  try {
    return await _fetch(input, init);
  } catch (err) {
    const code = err?.cause?.code || err?.code || err?.name;
    // Attach to the message so it survives into the crash dump, the .exit verdict and the queue error.
    err.message = `${err.message} [${(init?.method || 'GET').toUpperCase()} ${url}${code ? ` — ${code}` : ''}]`;
    err.failedUrl = url;
    console.error(`\n⚠ fetch failed: ${(init?.method || 'GET').toUpperCase()} ${url} — ${code || err.message}`);
    throw err;
  }
};

const { runGrounding } = await import('../api/lib/pipeline/run-grounding.js');

const argv = process.argv.slice(2);
const doc = Number(argv.find((a) => !a.startsWith('--')));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!doc) { console.error('usage: complete-book <docId> [--from=stage] [--only=stage] [--cc=N]'); process.exit(1); }

// Every line below is TOP-LEVEL await, so an unhandled rejection is a module-evaluation crash: node prints a
// bare undici dump with no application frames and exits non-zero, the queue records only "did not reach verify",
// and the actual cause is invisible. On 2026-08-13 that hid a dropped writer connection for two full runs across
// six books. Name the failure instead, and distinguish "the environment is broken" (exit 3, retryable — the
// writer was restarting) from "this book will not ground" (exit 2), so the queue is not told to retry forever.

// The queue reaps a detached run by noticing its pid is gone; it cannot see an exit code, so an
// infrastructure death (the writer dropped our socket) and a genuine "this book won't ground" were
// recorded identically as "did not reach verify" — and THREE of those quarantine the book permanently.
// Six healthy books were quarantined that way on 2026-08-13. Leave the verdict on disk: a file, not a
// DB row, because the failure we most need to report is precisely the one where the writer is unreachable.
import fsSync from 'node:fs';
function writeExit(code, reason) {
  try {
    fsSync.writeFileSync(`${process.cwd()}/logs/grounding-${doc}.exit`,
      JSON.stringify({ code, reason, at: Math.floor(Date.now() / 1000), pid: process.pid }));
  } catch { /* best-effort: the reaper falls back to its old pid-based inference */ }
}

process.on('unhandledRejection', (err) => { fail(err, 'unhandled rejection'); });

function fail(err, where) {
  const code = err?.cause?.code || err?.code;
  const infra = code === 'UND_ERR_SOCKET' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || err?.name === 'TimeoutError';
  console.error(`\n❌ BOOK ${doc} ABORTED (${where}): ${err?.message || err}` +
    (code ? ` [${code}]` : '') +
    (infra ? `\n   The single writer at ${process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849'} did not complete the request` +
             ` — it restarts on every deploy. This is INFRASTRUCTURE, not this book.` : ''));
  if (err?.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  writeExit(infra ? 3 : 2, `${where}: ${code || err?.message || err}`);
  process.exit(infra ? 3 : 2);
}

const res = await runGrounding(doc, {
  from: opt.from === true ? undefined : opt.from,
  only: opt.only === true ? undefined : opt.only,
  to: opt.to === true ? undefined : opt.to,
  readjudicate: opt.readjudicate ? true : undefined,   // incremental re-adjudication sweep (reuse prior work)
  rehype: opt.rehype ? true : undefined,               // regenerate HyPE from scratch (upgrade to current HYPE_VERSION)
  hypeModel: typeof opt['hype-model'] === 'string' ? opt['hype-model'] : undefined,   // hype-stage model override
  cc: Number(opt.cc) || 8,
  onResult: (stage, r) => console.log(`\n▶ ${stage}(${doc}) → ${JSON.stringify(r)}`),
}).catch((e) => fail(e, 'grounding run'));

if (res.verify && !res.verify.ok) {
  console.error(`\n❌ BOOK ${doc} NOT DONE — unsearchable: ${res.verify.missing.join('; ')}`);
  writeExit(2, `unsearchable: ${res.verify.missing.join('; ').slice(0, 160)}`);
  process.exit(2);
}
if (res.verify?.ok) {
  const v = res.verify;
  console.log(`\n✅ BOOK ${doc} COMPLETE + SEARCHABLE — cast ${v.castCount}, claims ${v.claimCount}, hype ${v.hypeIndexed}, paras ${v.paragraphsIndexed}`);
  if (res.flaggedKeystones.length) {
    console.warn(`⚠ KEYSTONE GATE: ${res.flaggedKeystones.length} figure(s) flagged — resolve before shipping: ` +
      res.flaggedKeystones.map((r) => `${r.who}[${r.verdict}${r.real?.length ? ` ${r.real.length} frag` : ''}]`).join(', '));
    console.warn(`   detail: node scripts/entity-read/keystone-gate.mjs`);
  } else console.log('✅ KEYSTONE GATE: all major figures resolve to a single entity');
}
writeExit(0, 'complete');
process.exit(0);
