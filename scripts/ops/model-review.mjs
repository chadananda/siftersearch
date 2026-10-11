#!/usr/bin/env node
// Monthly model re-assessment (Chad 10-11): which role uses which model, what it cost, and which roles to re-measure.
// Prints the table; with --alert sends ONE [ACTION] email listing flagged roles (nothing flagged → silent).
//   node scripts/ops/model-review.mjs [--alert] [--days 30]
import dotenv from 'dotenv';
import { MODEL_ROLES } from '../../api/lib/model-roles.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';
import { reviewRoles } from '../../api/lib/model-review.js';
import { spendByModel } from '../../api/lib/repos/ai-usage-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const days = Number(process.argv.includes('--days') ? process.argv[process.argv.indexOf('--days') + 1] : 30);
const spend = await spendByModel(days).catch(() => []);
const rows = reviewRoles(MODEL_ROLES, MODEL_REGISTRY, { spend });
for (const r of rows) console.log(JSON.stringify({ role: r.role, model: `${r.provider}:${r.model}`, reviewed: r.reviewed, usd: r.spend_30d?.usd ?? 0, flags: r.flags }));
const flagged = rows.filter((r) => r.flags.length);
if (process.argv.includes('--alert') && flagged.length) {
  const { actionRequired } = await import('../../api/lib/ops/alert.js');
  await actionRequired({ key: `model-review-${new Date().toISOString().slice(0, 7)}`, severity: 'action',
    subject: `Model review: ${flagged.length} role(s) to re-measure`,
    text: flagged.map((r) => `${r.role} (${r.provider}:${r.model}, reviewed ${r.reviewed}): ${r.flags.join('; ')}`).join('\n')
      + `\n\nAction: measure each flagged role against its candidates (small eval, cost estimate first), then update api/lib/model-roles.js (model + reviewed).` });
}
process.exit(0);
