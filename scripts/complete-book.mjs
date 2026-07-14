#!/usr/bin/env node
// complete-book — thin CLI over the shared grounding executor (api/lib/pipeline/run-grounding.js). Drives ONE book
// through the full Definition of Done and REFUSES to report it done unless it VERIFIES as searchable. Serial
// grounding runs this per book in authority order. Idempotent: every stage resumes/skips completed work.
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/complete-book.mjs 21310 [--from=reconcile] [--only=verify] [--cc=N]
// Exit 0 = complete+searchable; 2 = a stage left it unsearchable (missing[] printed); 1 = usage.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import fs from 'node:fs';
const { runGrounding, GROUNDING_STAGES } = await import('../api/lib/pipeline/run-grounding.js');

const argv = process.argv.slice(2);
const doc = Number(argv.find((a) => !a.startsWith('--')));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!doc) { console.error('usage: complete-book <docId> [--from=stage] [--only=stage] [--cc=N]'); process.exit(1); }

// Live status for the biography progress popup (api/lib/bio.js reads this): which book + stage is being worked.
const STATUS_PATH = 'data/siftersearch-grounding-status.json', STARTED = new Date().toISOString();
const mark = (stage) => { try { fs.writeFileSync(STATUS_PATH, JSON.stringify({ docId: doc, stage,
  stageIndex: GROUNDING_STAGES.indexOf(stage), totalStages: GROUNDING_STAGES.length, startedAt: STARTED, updatedAt: new Date().toISOString() })); } catch { /* best-effort */ } };

const res = await runGrounding(doc, {
  from: opt.from === true ? undefined : opt.from,
  only: opt.only === true ? undefined : opt.only,
  cc: Number(opt.cc) || 8,
  onStage: (stage) => mark(stage),
  onResult: (stage, r) => console.log(`\n▶ ${stage}(${doc}) → ${JSON.stringify(r)}`),
});

if (res.verify && !res.verify.ok) { console.error(`\n❌ BOOK ${doc} NOT DONE — unsearchable: ${res.verify.missing.join('; ')}`); process.exit(2); }
if (res.verify?.ok) {
  const v = res.verify;
  console.log(`\n✅ BOOK ${doc} COMPLETE + SEARCHABLE — cast ${v.castCount}, claims ${v.claimCount}, hype ${v.hypeIndexed}, paras ${v.paragraphsIndexed}`);
  if (res.flaggedKeystones.length) {
    console.warn(`⚠ KEYSTONE GATE: ${res.flaggedKeystones.length} figure(s) flagged — resolve before shipping: ` +
      res.flaggedKeystones.map((r) => `${r.who}[${r.verdict}${r.real?.length ? ` ${r.real.length} frag` : ''}]`).join(', '));
    console.warn(`   detail: node scripts/entity-read/keystone-gate.mjs`);
  } else console.log('✅ KEYSTONE GATE: all major figures resolve to a single entity');
}
mark('done'); // clear the "active" marker so the popup stops showing this book as in-progress
process.exit(0);
