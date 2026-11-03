#!/usr/bin/env node
// UPS event mail (storage plan R16; called by deploy/nut/upssched-cmd via /usr/local/bin/sifter-ups-mail). Sends through
// the ops alert mailer — no DB. Usage: ups-mail.mjs <key> <subject> [text]. severity 'page' for power-down, else 'action'.
// 'replbatt' (battery due for replacement) is maintenance, not an emergency: it goes to the weekly email (Chad 11-03).
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true }); dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });
const [key = 'ups', subject = 'tower UPS event', text = ''] = process.argv.slice(2);
if (key === 'replbatt') {
  const { queueMaintenance } = await import('../../api/lib/ops/maintenance.js');
  queueMaintenance({ source: 'ups', key: 'ups-replbatt', severity: 'warn', title: subject, text: text || 'The UPS reports its battery needs replacement.' });
  process.exit(0);
}
const { actionRequired } = await import('../../api/lib/ops/alert.js');
const timer = setTimeout(() => process.exit(1), 10_000);   // a dead mailer must never delay a shutdown
await actionRequired({ key: `ups-${key}`, subject, text: text || subject, quietMs: 0, severity: key === 'powerdown' ? 'page' : 'action' })
  .catch((err) => console.error(err.message));
clearTimeout(timer);
process.exit(0);
