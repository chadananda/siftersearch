// Probe source resolution on LIVE results: live Jev classification + exact-words lookup via prod /api/search/multi.
// Run: node scripts/wip/resolve-probe.mjs "query"
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
const { resolveSources, jevClassify } = await import('../../api/lib/source-resolve.js');
const IK = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
const multi = async (query, body = {}) => (await (await fetch('https://api.siftersearch.com/api/search/multi', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Internal-Key': IK }, body: JSON.stringify({ query, limit: 10, ...body }) })).json()).hits || [];
const q = process.argv[2] || 'What does Bahá’u’lláh say about justice?';
const hits = await multi(q);
const t0 = Date.now();
let verdicts = null;
const r = await resolveSources(hits, {
  classify: async (ps) => (verdicts = await jevClassify(ps)),
  phraseSearch: (span, { religion }) => multi(span, { plan: false, limit: 20, filters: religion ? { religion } : {} }),
});
console.log(`resolved ${r.resolved} in ${Date.now() - t0}ms ${r.error || ''}`);
for (const h of r.hits) {
  const s = h._source;
  console.log(`${String(h.doc_id).padStart(7)} a${String(h.authority).padEnd(4)} ${(h.author || '').slice(0, 20).padEnd(20)} | ${(h.title || '').slice(0, 34).padEnd(34)} | ${s ? `${s.kind}/${s.speaker}${s.resolved ? ` ← from ${s.quoted_in.title.slice(0, 30)}` : ''}` : '(original, not checked)'}`);
}
process.exit(0);
