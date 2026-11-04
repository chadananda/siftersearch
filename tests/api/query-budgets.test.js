// Request-path SQLite budgets (latency-budget.js QUERY_BUDGETS, 11-03): every budgeted name is a real query_stats name
// in the code (a rename must move its budget), and the query-time report marks rows over budget.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { QUERY_BUDGETS, queryBudgetFor } from '../../api/lib/search/latency-budget.js';

const ROOT = join(import.meta.dirname, '..', '..');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const apiSrc = walk(join(ROOT, 'api')).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('QUERY_BUDGETS', () => {
  it('each budgeted name is passed as a query name somewhere in api/', () => {
    for (const name of Object.keys(QUERY_BUDGETS)) expect(apiSrc.includes(`'${name}'`), name).toBe(true);
  });
  it('budgets are single-digit-to-low-double-digit ms with a note', () => {
    for (const [name, b] of Object.entries(QUERY_BUDGETS)) { expect(b.ms, name).toBeLessThanOrEqual(20); expect(b.note.length, name).toBeGreaterThan(20); }
  });
  it('queryBudgetFor: known name → ms, unknown → null', () => {
    expect(queryBudgetFor('docs-repo:path-slug-candidates')).toBe(QUERY_BUDGETS['docs-repo:path-slug-candidates'].ms);
    expect(queryBudgetFor('no-such-query')).toBeNull();
    expect(queryBudgetFor(null)).toBeNull();
  });
  it('the query-time report carries budgetMs / overBudget per row', () => {
    const s = readFileSync(join(ROOT, 'api/routes/ingest.js'), 'utf8');
    expect(s).toMatch(/budgetMs: queryBudgetFor\(r\.name\)/);
    expect(s).toMatch(/overBudget:/);
  });
});
