// Print planSearch() on every search-type fixture query: shape, filters, comparative, latency. Live Jev.
import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { planSearch } = await import('../../api/lib/search-plan.js');
const { fixtures } = JSON.parse(fs.readFileSync('tests/quality/search-type-fixtures.json', 'utf8'));
const ms = [];
for (const f of fixtures.filter((x) => x.endpoint === 'search')) {
  const p = await planSearch(f.query);
  ms.push(p.ms);
  console.log(`${f.type.padEnd(15)} ${p.shape.padEnd(9)} ${JSON.stringify(p.filters).padEnd(52)} ${p.comparative ? 'CMP ' : '    '}${String(p.ms).padStart(5)}ms ${p.error || ''} | ${f.query.slice(0, 60)}`);
}
ms.sort((a, b) => a - b);
console.log(`p50 ${ms[Math.floor(ms.length / 2)]}ms  p95 ${ms[Math.floor(ms.length * 0.95)]}ms`);
