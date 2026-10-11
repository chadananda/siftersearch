#!/usr/bin/env node
// Phrase-index coverage: paragraphs with phrase units (vector store, /tank) vs live paragraphs (integrity-repo), per
// scope × religion, and the $ to finish at the measured cost per paragraph. Read-only. Runs ON tower (~10 min: HDD scan).
//   node scripts/phrase-index/coverage.mjs
import dotenv from 'dotenv';
import { liveParagraphsByScope } from '../../api/lib/repos/integrity-repo.js';
import { coverageByScope, monthSpend } from '../../api/lib/repos/phrase-store-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const months = monthSpend();
const covered = coverageByScope();
const live = await liveParagraphsByScope();
const key = (r) => `${r.scope}|${r.religion}`;
const cov = new Map(covered.map((r) => [key(r), r.paragraphs]));
const totalUsd = months.reduce((n, m) => n + (m.usd || 0), 0);
const totalCovered = covered.reduce((n, r) => n + r.paragraphs, 0);
const perPara = totalCovered ? totalUsd / totalCovered : 0;
let missing = 0;
for (const r of live.sort((a, b) => b.paragraphs - a.paragraphs)) {
  const c = cov.get(key(r)) || 0; const m = Math.max(0, r.paragraphs - c); missing += m;
  console.log(JSON.stringify({ scope: r.scope, religion: r.religion, live: r.paragraphs, covered: c, missing: m, pct: +(100 * c / r.paragraphs).toFixed(1) }));
}
console.log(JSON.stringify({ months, spent_usd: +totalUsd.toFixed(2), covered_paragraphs: totalCovered, usd_per_paragraph: +perPara.toFixed(6),
  missing_paragraphs: missing, est_usd_to_finish: +(missing * perPara).toFixed(0), note: 'est assumes the same text mix; dedupe by exact text makes it an upper bound' }));
process.exit(0);
