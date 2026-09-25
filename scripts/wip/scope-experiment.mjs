// Offline experiment: multi-index search with vs without extractScope()'s religion filter, on search-type fixtures.
// Run from repo root: node scripts/wip/scope-experiment.mjs <out.json>. Hits live /api/search/multi + Jev.
import fs from 'node:fs';
import dotenv from 'dotenv';
const ROOT = process.cwd();
dotenv.config({ path: `${ROOT}/.env-secrets` }); dotenv.config({ path: `${ROOT}/.env-public` });
const { extractScope } = await import(`${ROOT}/api/lib/scope-extract.js`);
const { fixtures } = JSON.parse(fs.readFileSync(`${ROOT}/tests/quality/search-type-fixtures.json`, 'utf8'));
const IK = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
const fold = (s) => String(s || '').replace(/<[^>]+>/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const TRAD = { islam: 'islam', judaism: 'judaism', tao: 'tao', christian: 'christian', buddhist: 'buddhist', hindu: 'hindu', bahai: 'bahai', zoroastrian: 'zoroastrian', confucian: 'confucian', sikh: 'sikh', jain: 'jain' };
const trad = (s) => TRAD[fold(s).replace(/ /g, '')] || fold(s);
const re = (p) => new RegExp(p);
const match = (h, w) => Object.entries(w).every(([k, p]) => re(p).test(h[k] || ''));
const check = (items, e) => Object.entries(e).every(([k, v]) => {
  if (k === 'hit') return items.some((h) => match(h, v));
  if (k === 'no_hit') return !items.some((h) => match(h, v));
  if (k === 'top_religion') return items.slice(0, v.n).length === v.n && items.slice(0, v.n).every((h) => h.religion === v.religion);
  if (k === 'top_author') return items.slice(0, v.n).length === v.n && items.slice(0, v.n).every((h) => re(v.author).test(h.author));
  if (k === 'religions_all') return v.every((r) => items.some((h) => h.religion === r));
  if (k === 'religions_min') return new Set(items.map((h) => h.religion)).size >= v;
  return false;
});
async function multi(query, filters) {
  const r = await fetch('https://api.siftersearch.com/api/search/multi', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Key': IK },
    body: JSON.stringify({ query, limit: 10, filters }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return (d.hits || d.results || []).map((h) => ({ title: fold(h.title), author: fold(h.author), text: fold(h.text), religion: trad(h.religion) }));
}
const rows = [];
for (const f of fixtures.filter((x) => x.endpoint === 'search')) {
  const scope = await extractScope([{ role: 'user', content: f.query }]);
  const filters = scope.religion && !scope.comparative ? { religion: scope.religion } : {};
  const [base, scoped] = await Promise.all([multi(f.query, {}), Object.keys(filters).length ? multi(f.query, filters) : null]);
  const b = check(base, f.expect), s = scoped ? check(scoped, f.expect) : b;
  rows.push({ id: f.id, type: f.type, scope: scope.religion || (scope.comparative ? 'COMPARATIVE' : '-'), conf: scope.confidence, base: b, scoped: s });
  console.log(`${f.type.padEnd(15)} ${f.id.padEnd(34)} scope=${String(rows.at(-1).scope).padEnd(11)} ${(+scope.confidence || 0).toFixed(2)}  base=${b ? 'PASS' : 'fail'}  scoped=${s ? 'PASS' : 'fail'}`);
}
const n = (k) => rows.filter((r) => r[k]).length;
console.log(`\nmulti unscoped ${n('base')}/${rows.length}   multi + scope filter ${n('scoped')}/${rows.length}`);
fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
