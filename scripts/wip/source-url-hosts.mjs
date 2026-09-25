// For documents raw search linked to SifterSearch.com: what does each document's OWN source_url say?
// (the internal multi endpoint returns the raw hit, including source_url / source_site). Run: node … audit.json
import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
const IK = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
const audit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ssDocs = new Set(audit.rows.filter((r) => r.tier === 4).map((r) => r.doc));
const queries = [...new Set(audit.rows.filter((r) => r.tier === 4).map((r) => r.q))];
const seen = new Map();
for (const q of queries) {
  const r = await fetch('https://api.siftersearch.com/api/search/multi', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': IK }, body: JSON.stringify({ query: q, limit: 10 }) });
  const d = await r.json();
  for (const h of d.hits || []) if (ssDocs.has(h.doc_id) && !seen.has(h.doc_id)) seen.set(h.doc_id, h);
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u ? 'not-a-url' : '(none)'; } };
const counts = {};
for (const h of seen.values()) { const k = `${host(h.source_url)} | source_site=${h.source_site ?? 'null'}`; counts[k] = (counts[k] || 0) + 1; }
console.log(`${seen.size} of ${ssDocs.size} SifterSearch-linked documents re-found; their own source_url:`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
for (const h of [...seen.values()].filter((x) => host(x.source_url) !== 'siftersearch.com').slice(0, 10)) console.log(`   e.g. ${h.doc_id} ${(h.title || '').slice(0, 40)} → ${h.source_url}`);
process.exit(0);
