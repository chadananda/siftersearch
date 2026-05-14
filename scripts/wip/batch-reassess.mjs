// Batch reassess all deep research articles without aspect sections.
// Run on tower-nas via localhost to bypass Cloudflare's 100s timeout.
// Usage: node scripts/wip/batch-reassess.mjs [--ids 1,2,3] [--all]
import { readFileSync } from 'fs';

const BASE = 'http://localhost:7839/api/v1';
const KEY = process.env.DEPLOY_SECRET || readFileSync('/home/chad/sifter/siftersearch/.env-secrets', 'utf8')
  .split('\n').find(l => l.startsWith('DEPLOY_SECRET='))?.split('=')[1]?.trim();

const args = process.argv.slice(2);
const IDS_IDX = args.indexOf('--ids');
const FORCE_ALL = args.includes('--all');
const DELAY_MS = 5000; // 5s between calls to avoid hammering AI

async function apiCall(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { 'x-internal-key': KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const { data } = await apiCall('/deep-research?status=complete&limit=200');
const records = data.records || [];
console.log(`Found ${records.length} complete records`);

let targets;
if (IDS_IDX >= 0) {
  const ids = new Set(args[IDS_IDX + 1].split(',').map(Number));
  targets = records.filter(r => ids.has(r.id));
} else if (FORCE_ALL) {
  targets = records;
} else {
  // Only records without aspect sections
  targets = records.filter(r => {
    const secs = r.sections_json ? JSON.parse(r.sections_json) : [];
    return !secs.some(s => s.type === 'aspect');
  });
}

console.log(`Reassessing ${targets.length} records\n`);

let done = 0, failed = 0;
for (const r of targets) {
  process.stdout.write(`[${done + 1}/${targets.length}] ID ${r.id}: ${r.canonical_question.slice(0, 50)}... `);
  const { status, data: res } = await apiCall(`/admin/deep-research/${r.id}/reassess`, { method: 'POST', body: {} });
  if (status === 202) {
    console.log(`started`);
    done++;
  } else {
    console.log(`FAILED (${status}): ${JSON.stringify(res).slice(0, 100)}`);
    failed++;
  }
  if (done < targets.length) await sleep(DELAY_MS);
}

console.log(`\nDone: ${done} started, ${failed} failed`);
console.log('Reassessments run in background on server. Check pm2 logs for progress.');
