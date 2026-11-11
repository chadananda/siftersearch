// pipeline/hype-bank-seed — question-bank HyPE seeding: held-out questions never seeded, core/gray hits only, dry run = pairs + est $,
// grader verdicts → seeded / rejected, budget refusal, resume after a drain, billing key. Everything injected; no network, no DB.
import { describe, it, expect } from 'vitest';
import { hypeBankSeedJob, seedable, asQuestion, resolveTradition, reapplyBankSeeds } from '../../api/lib/pipeline/hype-bank-seed.js';
import { EST_USD_PER_CHECK } from '../../api/lib/pipeline/hype-program.js';
import { currentAIContext } from '../../api/lib/ai-context.js';

const Q = (n) => Array.from({ length: n }, (_, i) => ({ id: `bahai-${String(i + 1).padStart(3, '0')}`, q: `question number ${i + 1}`, held_out: i % 5 === 4 }));
function world({ questions = Q(10), hits, judge, spend = {}, env = { HYPE_PROGRAM_USD_MONTH: '1000' }, draining = async () => false, judged = new Set() } = {}) {
  const w = { searches: [], created: [], saved: [], followed: [], billTo: [], metered: [], logs: [] };
  const bySearch = hits || ((q) => [
    { id: 100 + Number(q.match(/\d+/)[0]), doc_id: 7, religion: "Baha'i", title: 'Gleanings', tier: 'core' },
    { id: 900, doc_id: 9, religion: "Baha'i", title: 'A study', tier: 'supplemental' },
    { id: 500, doc_id: 5, religion: 'Islam', title: 'Quran', tier: 'core' },
  ]);
  const deps = {
    env, sleep: async () => {}, draining, log: async (k, t) => { w.logs.push(t); },
    bankIds: () => ['bahai', 'islam'],
    bank: () => ({ tradition: 'bahai', questions }),
    search: async (q, religion, limit) => { w.searches.push({ q, religion, limit }); return bySearch(q); },
    tier: (h) => h.tier,
    rows: async (ids) => ids.map((id) => ({ id, doc_id: 7, text: `paragraph ${id} text`, original_text: null })),
    spend: { month: async () => spend.month ?? 0, today: async () => spend.today ?? 0 },
    follow: async (ids) => { w.followed.push(...ids); },
    repo: {
      judgedPairs: async () => judged,
      saveBankSeeds: async (pairs, o) => { w.saved.push({ pairs, o }); return { merged: pairs.filter((p) => p.verdict === 'seeded').length, recorded: pairs.length }; },
      reapplySeeds: async (t, v) => ({ paragraphs: 2, merged: 1, docIds: [7], t, v }),
    },
    checks: async () => ({
      create: async (reqs, o) => { w.billTo.push(currentAIContext().billTo); w.created.push({ reqs, o }); return 'cb1'; },
      status: async () => ({ ended: true }),
      results: async function* () {
        for (const r of w.created.at(-1).reqs) {
          const n = r.user.split('QUESTIONS:\n')[1].split('\n').length;
          yield { custom_id: r.custom_id, ok: true, text: JSON.stringify((judge || (() => ({ questions: Array.from({ length: n }, (_, i) => ({ i, answered: true })) })))(r)), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } };
        }
      },
      meter: async (m) => { w.metered.push(m); },
    }),
  };
  return { w, deps };
}

describe('helpers', () => {
  it('held-out questions (flag or every 5th) are never seedable', () => {
    const qs = Q(10); qs[0].held_out = true;
    expect(seedable(qs).map((q) => q.id)).toEqual(['bahai-002', 'bahai-003', 'bahai-004', 'bahai-006', 'bahai-007', 'bahai-008', 'bahai-009']);
  });
  it('bank phrasing → a question; bank id or religion name resolves', () => {
    expect(asQuestion('what is bahai faith')).toBe('What is bahai faith?');
    expect(asQuestion('  who was the bab?? ')).toBe('Who was the bab?');
    expect(resolveTradition("Bahá'í", ['bahai', 'islam'])).toEqual({ bankId: 'bahai', religion: "Baha'i" });
    expect(resolveTradition('bahai', ['bahai'])).toEqual({ bankId: 'bahai', religion: "Baha'i" });
    expect(resolveTradition('Jain', ['bahai']).bankId).toBeNull();
  });
});

describe('hypeBankSeedJob', () => {
  it('requires a tradition with a bank', async () => {
    const { deps } = world();
    expect((await hypeBankSeedJob({}, deps)).status).toBe('error');
    expect((await hypeBankSeedJob({ tradition: 'Jain' }, deps)).error).toMatch(/no question bank/);
  });
  it('dry run: pairs from non-held-out questions, core/gray hits of the religion only, est $ = checks × EST_USD_PER_CHECK; spends nothing', async () => {
    const { w, deps } = world();
    const r = await hypeBankSeedJob({ tradition: 'bahai', dry: true }, deps);
    expect(r).toMatchObject({ dryRun: true, tradition: 'bahai', religion: "Baha'i", bankQuestions: 10, heldOut: 2, seedable: 8, pairs: 8, checks: 8 });
    expect(r.estUsd).toBeCloseTo(8 * EST_USD_PER_CHECK, 2);
    expect(r.planned.every((p) => p.docId === 7 && p.tier === 'core')).toBe(true);   // supplemental and other-religion hits dropped
    expect(w.searches.map((s) => s.q)).not.toContain('question number 5');           // held out: never even searched
    expect(w.searches.every((s) => s.religion === "Baha'i")).toBe(true);
    expect(w.created).toHaveLength(0); expect(w.saved).toHaveLength(0);
  });
  it('skips pairs already judged at this version', async () => {
    const { deps } = world({ judged: new Set(['bahai-001|101']) });
    const r = await hypeBankSeedJob({ tradition: 'bahai', dry: true }, deps);
    expect(r.planned.map((p) => p.bankId)).not.toContain('bahai-001');
    expect(r.noHitIds).toContain('bahai-001');
  });
  it('real run: one check per paragraph (all its questions), billed to hype-program; answered → seeded, else rejected; seeded docs go to the hype index', async () => {
    const shared = () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }];
    const judge = (r) => ({ questions: r.user.split('QUESTIONS:\n')[1].split('\n').map((_, i) => ({ i, answered: i % 2 === 0, why: 'w' })) });
    const { w, deps } = world({ questions: Q(4), hits: shared, judge });
    const r = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(r).toMatchObject({ status: 'complete', pairs: 4, checks: 1, seeded: 2, rejected: 2 });
    expect(w.created[0].reqs).toHaveLength(1);
    expect(w.created[0].reqs[0].custom_id).toBe('d3_p300');
    expect(w.created[0].reqs[0].user).toContain('0. Question number 1?');
    expect(w.billTo).toEqual(['hype-program']);
    expect(w.saved[0].pairs.map((p) => p.verdict)).toEqual(['seeded', 'rejected', 'seeded', 'rejected']);
    expect(w.saved[0].o).toMatchObject({ tradition: 'bahai', version: 'hype-v15-seeker' });
    expect(w.followed).toEqual([3]);
    expect(w.metered).toHaveLength(1);
  });
  it('no Anthropic credit on the check submit: waits, records creditWait, then proceeds; nothing recorded as rejected meanwhile', async () => {
    const { w, deps } = world({ questions: Q(4), hits: () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }] });
    const sleeps = []; deps.sleep = async (ms) => { sleeps.push(ms); };
    const mk = deps.checks; let n = 0, savedBefore = null;
    deps.checks = async () => { const c = await mk(); const c0 = c.create; c.create = async (...a) => { if (n++ < 2) { savedBefore = w.saved.length; throw new Error('400 Your credit balance is too low to access the Anthropic API'); } return c0(...a); }; return c; };
    const r = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(r).toMatchObject({ status: 'complete', seeded: 4, rejected: 0 });
    expect(savedBefore).toBe(0);
    expect(w.created).toHaveLength(1);
    expect(sleeps).toHaveLength(2);
    expect(r.creditWait).toMatchObject({ probes: 2 }); expect(r.creditWait.resolvedAt).toBeTruthy();
  });
  it('a non-credit check-submit error still throws', async () => {
    const { deps } = world({ questions: Q(4), hits: () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }] });
    const mk = deps.checks; deps.checks = async () => ({ ...(await mk()), create: async () => { throw new Error('boom'); } });
    await expect(hypeBankSeedJob({ tradition: 'bahai' }, deps)).rejects.toThrow('boom');
  });
  it('draining during the credit wait yields with the pairs to resume', async () => {
    const { deps } = world({ questions: Q(4), hits: () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }], draining: async () => true });
    const mk = deps.checks; deps.checks = async () => ({ ...(await mk()), create: async () => { throw new Error('402 payment required: credit balance is too low'); } });
    const r = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(r).toMatchObject({ yielded: true, creditWait: { probes: 1 } }); expect(r.resume.pairs).toHaveLength(4);
  });
  it('an unparseable verdict leaves its pairs unjudged (retried next run)', async () => {
    const { w, deps } = world({ questions: Q(2), judge: () => 'garbage' });
    deps.checks = (orig => async () => { const c = await orig(); const res = c.results; c.results = async function* (b) { for await (const x of res(b)) yield { ...x, text: 'no json here' }; }; return c; })(deps.checks);
    const r = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(r).toMatchObject({ seeded: 0, rejected: 0, unparsed: 2 });
    expect(w.saved[0].pairs).toHaveLength(0);
  });
  it('budget: no ceiling or no room → quiet stop, nothing submitted', async () => {
    const a = world({ env: { HYPE_PROGRAM_USD_MONTH: '0' } });
    expect((await hypeBankSeedJob({ tradition: 'bahai' }, a.deps)).status).toBe('budget');
    const b = world({ spend: { month: 999.99 } });
    expect((await hypeBankSeedJob({ tradition: 'bahai' }, b.deps))).toMatchObject({ status: 'budget', binding: 'month' });
    const c = world();
    expect((await hypeBankSeedJob({ tradition: 'bahai', maxUsd: 0.001 }, c.deps))).toMatchObject({ status: 'budget', binding: 'job' });
    expect([...a.w.created, ...b.w.created, ...c.w.created]).toHaveLength(0);
  });
  it('draining while the check batch runs → yields with the batch id + pairs; the resume collects without resubmitting', async () => {
    const { w, deps } = world({ questions: Q(2) });
    let ended = false;
    deps.checks = (orig => async () => { const c = await orig(); c.status = async () => ({ ended }); return c; })(deps.checks);
    deps.draining = async () => true;
    const y = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(y.yielded).toBe(true);
    expect(y.resume).toMatchObject({ tradition: 'bahai', checkBatch: 'cb1' });
    expect(y.resume.pairs).toHaveLength(2);
    ended = true; deps.draining = async () => false;
    const r = await hypeBankSeedJob(y.resume, deps);
    expect(r).toMatchObject({ status: 'complete', seeded: 2 });
    expect(w.created).toHaveLength(1);
  });
  it('reapplyBankSeeds re-merges via the repo and queues the docs', async () => {
    const { w, deps } = world();
    expect(await reapplyBankSeeds("Bahá'í", deps)).toMatchObject({ tradition: 'bahai', merged: 1, indexedDocs: 1 });
    expect(w.followed).toEqual([7]);
  });
});

describe('hype-bank-seed — semantic dedupe (11-10)', () => {
  it('the paragraph\'s attached questions go into the check text (array or {questions}); none → no block', async () => {
    const shared = () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }];
    const a = world({ questions: Q(2), hits: shared });
    a.deps.rows = async (ids) => ids.map((id) => ({ id, text: 't', original_text: null, hyp_questions: JSON.stringify({ questions: ['Who is the Báb?', 'What is the soul?'] }) }));
    await hypeBankSeedJob({ tradition: 'bahai' }, a.deps);
    const u = a.w.created[0].reqs[0].user;
    expect(u).toContain('ALREADY ATTACHED');
    expect(u).toContain('- Who is the Báb?\n- What is the soul?');
    expect(u.indexOf('ALREADY ATTACHED')).toBeLessThan(u.indexOf('QUESTIONS:'));
    const b = world({ questions: Q(2), hits: shared });
    await hypeBankSeedJob({ tradition: 'bahai' }, b.deps);
    expect(b.w.created[0].reqs[0].user).not.toContain('ALREADY ATTACHED');
  });
  it('answered but distinct:false → duplicate (why = same as); the earlier bank question stays seeded; counts reported', async () => {
    const shared = () => [{ id: 300, doc_id: 3, religion: "Baha'i", tier: 'gray' }];
    const judge = () => ({ questions: [{ i: 0, answered: true, distinct: true }, { i: 1, answered: true, distinct: false, same_as: 'Question number 1?' }, { i: 2, answered: false }] });
    const { w, deps } = world({ questions: Q(3), hits: shared, judge });
    const r = await hypeBankSeedJob({ tradition: 'bahai' }, deps);
    expect(w.saved[0].pairs.map((p) => p.verdict)).toEqual(['seeded', 'duplicate', 'rejected']);
    expect(w.saved[0].pairs[1].why).toBe('same as: Question number 1?');
    expect(r).toMatchObject({ seeded: 1, duplicates: 1, rejected: 1 });
    expect(w.followed).toEqual([3]);
  });
});

describe('hype-bank-seed — every phrasing searched (11-10)', () => {
  it('searches the question and each variant, interleaving ranks, up to perQuestion confirmed paragraphs', async () => {
    const questions = [{ id: 'bahai-001', q: 'what is bahai faith', variants: ['what do bahai believe', 'what is bahai faith'], held_out: false }];
    const hits = (q) => (q === 'what is bahai faith' ? [{ id: 1, doc_id: 7, religion: "Baha'i", tier: 'core' }, { id: 2, doc_id: 7, religion: "Baha'i", tier: 'core' }]
      : [{ id: 3, doc_id: 8, religion: "Baha'i", tier: 'gray' }, { id: 1, doc_id: 7, religion: "Baha'i", tier: 'core' }]);
    const { deps, w } = world({ questions, hits });
    const r = await hypeBankSeedJob({ tradition: 'bahai', dry: true }, deps);
    expect(w.searches.map((s) => s.q)).toEqual(['what is bahai faith', 'what do bahai believe']);   // duplicate variant searched once
    expect(r.planned.map((p) => p.paraId)).toEqual([1, 3, 2]);   // rank 0 of each list, then rank 1, de-duplicated
  });
});
