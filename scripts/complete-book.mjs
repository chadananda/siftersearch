#!/usr/bin/env node
// complete-book — drive ONE book through the full Definition of Done and REFUSE to report it done unless it
// VERIFIES as searchable (cast + claims + HyPE actually return from the live indexes). Serial grounding runs
// this per book in authority order; a book must pass before the next begins. Reuses the app-wired `rag`.
// Idempotent: every stage resumes/skips completed work, so re-running is cheap and safe.
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/complete-book.mjs 21310 [--from=reconcile] [--only=verify]
// Exit 0 = complete+searchable; 2 = a stage left it unsearchable (missing[] printed); 1 = usage.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { execSync } from 'node:child_process';
const { rag } = await import('../api/lib/rag-adapter/index.js');

const argv = process.argv.slice(2);
const doc = Number(argv.find((a) => !a.startsWith('--')));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!doc) { console.error('usage: complete-book <docId> [--from=stage] [--only=stage]'); process.exit(1); }

const STAGES = ['disambiguate', 'mentions', 'claims', 'reconcile', 'project', 'dedup', 'link', 'hype', 'verify'];
const from = opt.only ? STAGES.indexOf(opt.only) : (opt.from ? STAGES.indexOf(opt.from) : 0);
const to = opt.only ? STAGES.indexOf(opt.only) : STAGES.length - 1;
const want = (s) => { const i = STAGES.indexOf(s); return i >= from && i <= to; };
const log = (s, r) => console.log(`\n▶ ${s}(${doc}) → ${JSON.stringify(r)}`);
const writer = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';

let createdIds = [];
if (want('disambiguate')) log('disambiguate', await rag.disambiguate(doc, { concurrency: 4 }));
if (want('mentions'))     log('mentions', await rag.entities.mentions(doc));
if (want('claims'))       log('claims', await rag.entities.claims(doc, { resume: true, threshold: 0.9, concurrency: 4 }));
if (want('reconcile'))    log('reconcile', await rag.entities.reconcile(doc, { resume: true, threshold: 0.9, concurrency: 4 })); // FULL — no --limit
if (want('project'))      { const r = await rag.entities.project({ auto: true, kinds: ['link', 'create'], hiConf: 0.9, docId: doc }); createdIds = r.createdIds || []; log('project', r); }
if (want('dedup') && createdIds.length) log('dedup-guard', await rag.entities.dedupGuard({ entityIds: createdIds }));
if (want('link'))         execSync(`DOC=${doc} WRITE=1 SIFTER_WRITER_URL=${writer} node scripts/entity-read/link-claims.mjs`, { stdio: 'inherit' });
if (want('hype'))         log('hype', await rag.retrieval.index(doc, { resume: true }));
if (want('verify')) {
  const v = await rag.entities.verify(doc);
  log('verify', { ok: v.ok, ...v.checks, missing: v.missing });
  if (!v.ok) { console.error(`\n❌ BOOK ${doc} NOT DONE — unsearchable: ${v.missing.join('; ')}`); process.exit(2); }
  console.log(`\n✅ BOOK ${doc} COMPLETE + SEARCHABLE — cast ${v.checks.castCount}, claims ${v.checks.claimCount}, hype ${v.checks.hypeIndexed}, paras ${v.checks.paragraphsIndexed}`);
}
process.exit(0);
