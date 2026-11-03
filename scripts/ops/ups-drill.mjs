#!/usr/bin/env node
// UPS drill: feeds a fake power event through the REAL ledger (api/lib/ops/ups-ledger.js: append → read → confirm plan → report)
// in a temp ledger, never the live one. Nothing on tower is touched.
//   node scripts/ops/ups-drill.mjs --simulate [--scenario good|held|missing|unclean] [--html out.html] [--send]
// --send mails the report with a "[DRILL]" prefix (success as a normal mail, failure through the [ACTION] path).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendStep, buildUpsReport, confirmPlan, currentEvent, drillSequence, readLedger } from '../../api/lib/ops/ups-ledger.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const flag = (k) => process.argv.includes(k);
const val = (k) => (flag(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
if (!flag('--simulate')) { console.error('usage: ups-drill.mjs --simulate [--scenario good|held|missing|unclean] [--html out.html] [--send]'); process.exit(2); }
const scenario = val('--scenario') || 'good';

const dir = mkdtempSync(join(tmpdir(), 'ups-drill-'));
const file = join(dir, 'ledger.jsonl');
try {
  const seq = drillSequence(scenario);
  const healthy = seq.find((l) => l.step === 'healthy');
  for (const { at, ...l } of seq.filter((x) => x !== healthy)) appendStep(l, { file, now: Date.parse(at) });
  const lines = readLedger({ file });
  const last = Date.parse(lines.at(-1).at);
  const plan = confirmPlan(lines, { bootAt: lines.find((l) => l.step === 'boot')?.at, now: last + 10 * 60_000 });
  console.log(`confirm plan: ${plan.action} (${plan.reason})`);
  const report = buildUpsReport([...currentEvent(lines), healthy], { drill: true });
  console.log(`${report.subject}\n\n${report.text}`);
  if (val('--html')) { writeFileSync(val('--html'), `<!doctype html><meta charset="utf-8"><title>UPS drill</title><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:860px;margin:20px auto;padding:0 16px">${report.html}</body>`); console.log(`\nhtml → ${val('--html')}`); }
  if (flag('--send')) {
    const dotenv = (await import('dotenv')).default;
    dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true }); dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });
    if (report.ok) {
      const { sendEmail } = await import('../../api/services/email.js');
      await sendEmail({ to: process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL, subject: report.subject, text: report.text, html: report.html });
    } else {
      const { actionRequired } = await import('../../api/lib/ops/alert.js');
      await actionRequired({ key: `ups-drill-${Date.now()}`, quietMs: 0, severity: 'action', subject: report.subject, text: report.text, html: report.html });
    }
    console.log('\nmailed');
  }
  process.exitCode = 0;
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(0);
