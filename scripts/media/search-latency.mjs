#!/usr/bin/env node
// Search latency on tower while media work runs (an API client: POST /api/search/multi with the internal key, never the
// database). Every query is FRESH (random word pairs + a nonce word) so the answer cache never answers.
//   node scripts/media/search-latency.mjs [--n 12] [--label running]   → median / p90 seconds
import dotenv from 'dotenv';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const API = process.env.SIFTER_API || 'http://127.0.0.1:7839';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg('--n', 12)), label = arg('--label', 'now');
const A = ['covenant', 'soul', 'prayer', 'justice', 'unity', 'detachment', 'knowledge', 'station', 'revelation', 'mercy', 'pilgrim', 'teaching', 'assembly', 'martyr', 'fasting', 'education', 'peace', 'spirit', 'faith', 'service', 'love', 'nobility', 'wisdom', 'kingdom', 'reality', 'tablet', 'guardian', 'manifestation', 'heaven', 'trust'];
const B = ['of god', 'and the world', 'in this day', 'among the believers', 'of mankind', 'after death', 'of the heart', 'and the youth', 'of the cause', 'in the west', 'and society', 'for the nations'];
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const times = [];
for (let i = 0; i < n; i++) {
  const q = `${pick(A)} ${pick(B)} ${pick(A)}`;
  const t0 = Date.now();
  const r = await fetch(`${API}/api/search/multi`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' },
    body: JSON.stringify({ query: q, limit: 10 }), signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (r) await r.arrayBuffer();
  times.push(r?.ok ? (Date.now() - t0) / 1000 : null);
}
const ok = times.filter((x) => x != null).sort((a, b) => a - b);
const q = (p) => ok[Math.min(ok.length - 1, Math.floor(p * ok.length))];
console.log(JSON.stringify({ label, n, ok: ok.length, median: q(0.5), p90: q(0.9), max: ok.at(-1), load: (await import('os')).loadavg()[0].toFixed(1) }));
