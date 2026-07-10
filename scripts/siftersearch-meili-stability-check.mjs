// Provable Meili stability check. Read-only. Samples the convergence metrics over a window and prints a verdict.
// STABLE requires, over the whole window: Meili enqueued NOT growing, content synced=0 flat & low, and search latency
// bounded. Run on tower-nas (needs local Meili + sifter.db). Usage:
//   node scripts/siftersearch-meili-stability-check.mjs [samples=12] [intervalSec=30]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const SAMPLES = parseInt(process.argv[2] || '12', 10);
const INTERVAL = (parseInt(process.argv[3] || '30', 10)) * 1000;
const HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const H = { Authorization: `Bearer ${process.env.MEILISEARCH_KEY || process.env.MEILI_MASTER_KEY}` };
const API = process.env.SELF_API || 'http://localhost:7839';   // internal API port
const Database = (await import('better-sqlite3')).default;
const DB = process.env.HOME + '/sifter/siftersearch/data/sifter.db';

const meiliCount = async (s) => { try { return (await fetch(`${HOST}/tasks?statuses=${s}&limit=1`, { headers: H }).then((r) => r.json())).total; } catch { return -1; } };
const isIndexing = async () => { try { return (await fetch(`${HOST}/indexes/paragraphs/stats`, { headers: H }).then((r) => r.json())).isIndexing; } catch { return null; } };
const dirty = () => { const db = new Database(DB, { readonly: true }); const n = db.prepare(`SELECT COUNT(*) n FROM content WHERE synced=0 AND deleted_at IS NULL`).get().n; db.close(); return n; };
// deterministic Meili keyword latency (the layer that must be instant)
const QUERIES = ['the Covenant of God', 'unity of religions', 'martyrs of Nayriz', 'prayer and meditation', 'the station of the Bab'];
const searchMs = async (q) => { const t0 = Date.now(); try { await fetch(`${HOST}/indexes/paragraphs/search`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, limit: 10 }) }).then((r) => r.json()); return Date.now() - t0; } catch { return -1; } };

const rows = [];
for (let i = 0; i < SAMPLES; i++) {
  const [enq, proc, idx] = await Promise.all([meiliCount('enqueued'), meiliCount('processing'), isIndexing()]);
  const s0 = dirty();
  const q = QUERIES[i % QUERIES.length];
  const ms = await searchMs(q);
  rows.push({ enq, proc, idx, s0, ms });
  console.log(`[${String(i + 1).padStart(2)}/${SAMPLES}] enqueued=${enq} processing=${proc} isIndexing=${idx} synced0=${s0} meiliKeywordMs=${ms}`);
  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, INTERVAL));
}

const enqs = rows.map((r) => r.enq).filter((x) => x >= 0);
const s0s = rows.map((r) => r.s0);
const mss = rows.map((r) => r.ms).filter((x) => x >= 0).sort((a, b) => a - b);
const p = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : -1;
const enqGrowing = enqs.length >= 2 && (enqs[enqs.length - 1] - enqs[0]) > 20;   // net growth over window = churn
const s0Growing = s0s.length >= 2 && (s0s[s0s.length - 1] - s0s[0]) > 100;
const enqMax = Math.max(...enqs, 0), s0Max = Math.max(...s0s, 0);
const p50 = p(mss, 0.5), p95 = p(mss, 0.95);

console.log('\n──────── VERDICT ────────');
console.log(`Meili enqueued: start=${enqs[0]} end=${enqs[enqs.length - 1]} max=${enqMax}  ${enqGrowing ? '❌ GROWING (churn)' : '✅ not growing'}`);
console.log(`content synced=0: start=${s0s[0]} end=${s0s[s0s.length - 1]} max=${s0Max}  ${s0Growing ? '❌ GROWING (churn)' : '✅ flat/low'}`);
console.log(`Meili keyword search: p50=${p50}ms p95=${p95}ms  ${p95 < 1000 ? '✅ fast' : '⚠️ slow'}`);
const stable = !enqGrowing && !s0Growing && p95 < 1000;
console.log(`\n${stable ? '✅✅ STABLE' : '❌ UNSTABLE'} — ${stable ? 'queue not growing, no dirty churn, search fast' : 'see failing metric above'}`);
process.exit(stable ? 0 : 1);
