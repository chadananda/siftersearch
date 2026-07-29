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
const STRIKES_TO_HALT = 2;                                          // consecutive stall hours before halting

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (s) => { fs.mkdirSync(dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); };

async function groundingSpendToday() {
  const r = await queryOne(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage
                            WHERE provider='deepseek' AND service_type LIKE 'grounding%' AND date(timestamp)=date('now')`);
  return Number(r?.s || 0);
}
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
  const st = readState();
  const prev = st.snapshot;                 // last hour: {doneBooks, spend}
  let strikes = st.strikes || 0, halted = !!st.haltedByGuard;

  if (prev) {
    const dBooks = doneBooks - prev.doneBooks;
    const dSpend = spend - prev.spend;       // negative across the UTC-midnight reset → not a stall
    const stalling = dSpend >= SPEND_THRESHOLD && dBooks < MIN_BOOKS;
    strikes = stalling ? strikes + 1 : 0;
    logger.info({ doneBooks, totalBooks, dBooks, dSpend: Math.round(dSpend * 100) / 100, strikes, halted }, 'stall-guard tick');

    if (stalling && strikes >= STRIKES_TO_HALT && !halted) {
      const ok = await setMode('override');
      await alarm(
        `⚠️ SifterSearch HALTED — grounding spent $${dSpend.toFixed(2)} with 0 progress`,
        `Spend-without-progress detected for ${strikes} consecutive hours:\n` +
        `  done-count: ${prev.doneBooks} → ${doneBooks} of ${totalBooks} (NO advance)\n` +
        `  grounding spend this hour: $${dSpend.toFixed(2)}\n\n` +
        `This is the signature of re-grounding already-finished books (a stuck writer / broken completion persistence)` +
        ` — the exact failure that burned $160+ over 4 days on 07-24..28.\n\n` +
        `Grounding was ${ok ? 'AUTOMATICALLY HALTED (mode=override)' : 'NOT halted (setMode failed — HALT MANUALLY)'}.` +
        ` Fix the writer/completion path, then resume with mode=plan.`);
      halted = true;
      logger.error({ dSpend, strikes }, 'STALL GUARD: halted grounding + alarmed');
    } else if (halted && dBooks >= MIN_BOOKS) {
      await setMode('plan');
      await alarm(`✅ SifterSearch — grounding resumed (progress returned)`,
        `Done-count advanced (+${dBooks}, now ${doneBooks}/${totalBooks}); grounding auto-resumed (mode=plan).`);
      halted = false; strikes = 0;
      logger.info('STALL GUARD: progress returned → resumed');
    }
  }

  writeState({ snapshot: { doneBooks, spend, ts: Date.now() }, strikes, haltedByGuard: halted });
  process.exit(0);
})().catch((e) => { logger.error({ err: e.message }, 'stall-guard crashed'); process.exit(1); });
