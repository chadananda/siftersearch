// Withdrawing a candidate for good (review 11-09: the prayer@2..N "prayer book" candidates): repo withdraw → POST /api/admin/anis/retire
// (ops.mjs anis-retire <id@v>). A withdrawn row leaves the candidates and is never promoted nor restored by rollback.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, resetStrategiesCache, catalog } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, saveCandidate, listCandidates, listPromotions, promote, rollback, withdraw } from '../../api/lib/repos/strategy-candidates-repo.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const GOOD = {
  name: 'timeline', description: 'The reader wants the HISTORY of a practice or institution told in order, era by era, from the passages.',
  exemplars: ['How did the Nineteen Day Feast develop over time?', 'Trace how the Huqúqu’lláh was introduced, step by step.'],
  templates: [{ id: 'timeline.how', text: 'Tell it as a TIMELINE, oldest first. {{base}}' }],
  steps: [{ id: 'timeline.order', activity: 'strategy.understanding', params: { how: 'timeline.how' } }],
  graph: { entry: 'order', nodes: { order: { step: 'timeline.order' } }, edges: [{ from: 'order', on: '*', to: '$end' }] },
};
const status = (db, id, v) => db.prepare('SELECT status FROM strategies WHERE id = ? AND version = ?').get(id, v)?.status;

describe('withdraw', () => {
  it('candidate → withdrawn: out of the candidates, never promoted, never restored by rollback; idempotent; active refused', () => {
    const db = fresh();
    const a = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const b = saveCandidate(db, validateCandidate({ ...GOOD, templates: [{ id: 'timeline.how2', text: 'Oldest first. {{base}}' }],
      steps: [{ id: 'timeline.order2', activity: 'strategy.understanding', params: { how: 'timeline.how2' } }],
      graph: { ...GOOD.graph, nodes: { order: { step: 'timeline.order2' } } } }, { cat: catalog() }).normalized);
    promote(db, 'timeline', a.version);
    promote(db, 'timeline', b.version);                      // a → retired (restorable)
    expect(withdraw(db, 'timeline', a.version, { reason: 'wrong premise' })).toMatchObject({ was: 'retired', changed: true });
    expect(withdraw(db, 'timeline', a.version)).toMatchObject({ changed: false });
    expect(() => withdraw(db, 'timeline', b.version)).toThrow(/is active/);
    expect(() => promote(db, 'timeline', a.version)).toThrow(/withdrawn/);
    expect(rollback(db, 'timeline')).toMatchObject({ rolled_back: b.version, restored: null });
    expect(status(db, 'timeline', a.version)).toBe('withdrawn');
    expect(listCandidates(db).some((c) => c.id === 'timeline' && c.version === a.version)).toBe(false);
    expect(listPromotions(db).find((p) => p.action === 'withdraw')).toMatchObject({ strategy_id: 'timeline', version: a.version, decision: { reason: 'wrong premise' } });
    expect(() => withdraw(db, 'timeline', 99)).toThrow(/no strategy/);
  });

  it('POST /api/admin/anis/retire: internal key, 400 without a version, 409 on an active row', async () => {
    const saved = { d: process.env.DEPLOY_SECRET, i: process.env.INTERNAL_API_KEY };
    process.env.DEPLOY_SECRET = 'ik'; delete process.env.INTERNAL_API_KEY;
    try {
      const db = fresh();
      const cand = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
      const { default: Fastify } = await import('fastify');
      const app = Fastify();
      await app.register((await import('../../api/routes/strategies-admin.js')).default, { prefix: '/api/admin', deps: { db } });
      const h = { 'x-internal-key': 'ik' };
      const post = (payload, headers = h) => app.inject({ method: 'POST', url: '/api/admin/anis/retire', headers, payload });
      expect((await post({ id: 'timeline', version: cand.version }, {})).statusCode).toBe(401);
      expect((await post({ id: 'timeline' })).statusCode).toBe(400);
      const ok = await post({ id: 'timeline', version: cand.version, reason: 'prayer-book premise' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ id: 'timeline', version: cand.version, changed: true });
      expect(status(db, 'timeline', cand.version)).toBe('withdrawn');
      const other = saveCandidate(db, validateCandidate({ ...GOOD, templates: [{ id: 'timeline.how3', text: 'Oldest first! {{base}}' }],
        steps: [{ id: 'timeline.order3', activity: 'strategy.understanding', params: { how: 'timeline.how3' } }],
        graph: { ...GOOD.graph, nodes: { order: { step: 'timeline.order3' } } } }, { cat: catalog() }).normalized);
      promote(db, 'timeline', other.version);
      expect((await post({ id: 'timeline', version: other.version })).statusCode).toBe(409);
      await app.close();
    } finally {
      for (const [k, v] of [['DEPLOY_SECRET', saved.d], ['INTERNAL_API_KEY', saved.i]]) if (v == null) delete process.env[k]; else process.env[k] = v;
    }
  });
});
