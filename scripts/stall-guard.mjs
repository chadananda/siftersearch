#!/usr/bin/env node
// STALL GUARD (2026-07-29) — the guardrail whose ABSENCE let grounding burn $160+ over 4 days re-grounding
// already-finished books (done-count frozen at 634/898) while the single-writer silently failed, undetected.
//
// Runs hourly (cron). Read-only on the DB; halts via the internal API; alarms via email. It compares this hour's
// {doneBooks, grounding-spend-today} to last hour's snapshot. If grounding SPENT money but the done-count did NOT
// advance — the spend-without-progress signature (re-grounding / a stuck writer) — it:
//   1. HALTS grounding (POST /grounding/mode {override}) to stop the bleed, and
//   2. emails a distinct ALARM (not the cheerful digest, so it can't be ignored like the digests were).
// Requires TWO consecutive stall hours before halting (one slow hour on a big book is normal). Auto-resumes
// (mode→plan) and emails an all-clear when the done-count advances again. Touches no writer/grounding code.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { getIntegrationProgress } = await import('../api/lib/bio.js');
const { queryOne } = await import('../api/lib/db.js');
const { sendEmail } = await import('../api/services/email.js');
const { logger } = await import('../api/lib/logger.js');

const STATE = join(ROOT, 'logs', 'stall-guard-state.json');
const API = process.env.INTERNAL_API_URL || 'http://127.0.0.1:7839';
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY || '';
const TO = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL || '';
const SPEND_THRESHOLD = Number(process.env.STALL_SPEND_USD || 20); // $ spent in the hour that DEMANDS ≥1 completion
const MIN_BOOKS = Number(process.env.STALL_MIN_BOOKS || 1);        // completions required to clear that spend
const STRIKES_TO_HALT = 2;                                          // consecutive "nothing moving at all" hours before halting
// The DEFEAT this closes (2026-07-29): entity_mentions_v2 growth was treated as "progress", but re-grounding churn
// re-creates mentions — so spend-with-growth-but-ZERO-completions read as healthy and never halted. Entity growth now
// only buys TOLERANCE for a slow in-progress book; past this many consecutive hours of spend with zero book
// completions (even while entities grow) we halt regardless — a healthy pipeline completes SOME book within this window.
const NO_COMPLETION_MAX_HOURS = Number(process.env.STALL_NO_COMPLETION_HOURS || 4);

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (s) => { fs.mkdirSync(dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); };

async function groundingSpendToday() {
  const r = await queryOne(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage
                            WHERE provider='deepseek' AND service_type LIKE 'grounding%' AND date(timestamp)=date('now')`);
  return Number(r?.s || 0);
}
// GROUNDING-WRITE signal — entity_mentions_v2 row count. Every book's grounding writes mentions here, so it climbs
// steadily during legit work (+hundreds/hr) and goes FLAT when the writer is broken or re-grounding-without-persist
// (the 07-24..28 failure). NOTE: do NOT use graph_entities here — it's the resolved+deduped count and barely moves,
// because this corpus reuses the same historical figures across books, so legit grounding would look "flat" and the
// guard would FALSE-HALT healthy work. Progress = a book completed OR mentions grew. -1 = unknown → never stall.
async function entityCount() {
  const r = await queryOne(`SELECT COUNT(*) n FROM entity_mentions_v2`).catch(() => ({ n: -1 }));
  return Number(r?.n ?? -1);
}
const MIN_ENTITIES = Number(process.env.STALL_MIN_ENTITIES || 50);  // grounding-write growth that counts as real progress
async function setMode(mode) {
  try {
    const r = await fetch(`${API}/api/admin/grounding/mode`, {
      method: 'POST', headers: { 'X-Internal-Key': KEY, 'content-type': 'application/json' }, body: JSON.stringify({ mode }),
    });
    return r.ok;
  } catch (e) { logger.error({ err: e.message, mode }, 'stall-guard: setMode failed'); return false; }
}
const alarm = (subject, text) => TO ? sendEmail({ to: TO, subject, text }).catch((e) => logger.error({ err: e.message }, 'stall-guard: email failed')) : Promise.resolve();

(async () => {
  const prog = await getIntegrationProgress();
  const doneBooks = prog.doneBooks || 0, totalBooks = prog.totalBooks || 0;
  const spend = await groundingSpendToday();
  const entities = await entityCount();
  const st = readState();
  const prev = st.snapshot;                 // last hour: {doneBooks, spend, entities}
  let strikes = st.strikes || 0, halted = !!st.haltedByGuard;
  let noCompletionHours = st.noCompletionHours || 0;   // consecutive spending-hours with ZERO book completions

  if (prev) {
    const dBooks = doneBooks - prev.doneBooks;
    const dSpend = spend - prev.spend;       // negative across the UTC-midnight reset → not a stall
    const dEntities = (entities >= 0 && (prev.entities ?? -1) >= 0) ? entities - prev.entities : MIN_ENTITIES;
    // A book COMPLETING is the only TRUE progress. Entity growth tolerates a slow in-progress book but can be faked by
    // re-grounding churn, so it is NOT sufficient past NO_COMPLETION_MAX_HOURS (see the constant's note).
    const completed = dBooks >= MIN_BOOKS;
    const activeSpend = dSpend >= SPEND_THRESHOLD;
    const softProgress = completed || dEntities >= MIN_ENTITIES;      // something is moving (a book, or the graph grew)
    // strikes = consecutive hours with active spend and NOTHING moving at all (the writer-dead / total-stall signature).
    strikes = (activeSpend && !softProgress) ? strikes + 1 : 0;
    // noCompletionHours = consecutive hours with active spend and NO book completing (reset by a completion, or by idle).
    noCompletionHours = completed ? 0 : (activeSpend ? noCompletionHours + 1 : 0);
    const doHalt = strikes >= STRIKES_TO_HALT || noCompletionHours >= NO_COMPLETION_MAX_HOURS;
    const reason = strikes >= STRIKES_TO_HALT
      ? `nothing moving for ${strikes}h (no completion AND graph flat)`
      : `${noCompletionHours}h of spend with ZERO book completions (entities grew +${dEntities}/h — the churn-masking-a-stall signature)`;
    logger.info({ doneBooks, totalBooks, dBooks, dEntities, dSpend: Math.round(dSpend * 100) / 100, strikes, noCompletionHours, halted }, 'stall-guard tick');

    if (doHalt && !halted) {
      const ok = await setMode('override');
      await alarm(
        `⚠️ SifterSearch HALTED — grounding spending with no completions`,
        `Spend-without-completion detected: ${reason}.\n` +
        `  done-count: ${prev.doneBooks} → ${doneBooks} of ${totalBooks}\n` +
        `  net-new entities this hour: ${dEntities}\n` +
        `  grounding spend this hour: $${dSpend.toFixed(2)}\n\n` +
        `This is the spend-without-progress signature (a stuck writer / API hang / re-grounding loop) — the class of` +
        ` failure that burned $160+ over 4 days on 07-24..28 and hung the API on 07-29.\n\n` +
        `Grounding was ${ok ? 'AUTOMATICALLY HALTED (mode=override)' : 'NOT halted (setMode failed — HALT MANUALLY)'}.` +
        ` Diagnose, then resume with mode=plan.`);
      halted = true;
      logger.error({ dSpend, strikes, noCompletionHours }, 'STALL GUARD: halted grounding + alarmed');
    } else if (halted && completed) {
      await setMode('plan');
      await alarm(`✅ SifterSearch — grounding resumed (completions returned)`,
        `Completions returned (+${dBooks} books, now ${doneBooks}/${totalBooks}); grounding auto-resumed (mode=plan).`);
      halted = false; strikes = 0; noCompletionHours = 0;
      logger.info('STALL GUARD: completions returned → resumed');
    }
  }

  writeState({ snapshot: { doneBooks, spend, entities, ts: Date.now() }, strikes, noCompletionHours, haltedByGuard: halted });
  process.exit(0);
})().catch((e) => { logger.error({ err: e.message }, 'stall-guard crashed'); process.exit(1); });
