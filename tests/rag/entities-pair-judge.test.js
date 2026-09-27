// entities/pair-judge — two independent judges; a merge only when both say SAME; a stated conflict records distinct;
// everything else goes to a human with the evidence.
import { describe, it, expect } from 'vitest';
import { signals, ruleVerdict, outcome, decisionFor, parseVerdict, buildUser, run } from '../../api/lib/rag/entities/pair-judge.js';

const claim = (id, subject, relation, object, when = null, basis = 'stated') => ({ id, relation, statement: `${subject} — ${relation} ${object}`, proof: `${subject}, ${relation.replace('-of', '')} of ${object} ${when ?? ''}`, when, basis, doc: 'DB' });
const D = (id, name, { claims = [], companions = [], docs = [{ id: 1, title: 'DB', n: 3 }], importance = null, mentions = 3 } = {}) =>
  ({ id, name, live: true, importance, mentions, names: [{ name, n: mentions }], docs, claims, companions, passages: [] });
const co = (id, name, n = 2, total = 50) => ({ id, name, n, total });
const universal = new Set([1]);   // the Báb

describe('signals + rule verdict', () => {
  it('a shared companion who is not universal is a tie; the Báb is not', () => {
    const A = D(10, 'Mírzá Yaḥyá', { companions: [co(1, 'the Báb', 9, 90000), co(7, 'Siyyid Muḥammad-i-Iṣfahání')] });
    const B = D(11, 'Mírzá Yaḥyá (Ṣubḥ-i-Azal)', { companions: [co(1, 'the Báb', 4, 90000), co(7, 'Siyyid Muḥammad-i-Iṣfahání')] });
    const s = signals(A, B, { universal, totalMentions: 200000 });
    expect(s.sharedCompanions.map((c) => c.name)).toEqual(['Siyyid Muḥammad-i-Iṣfahání']);
    expect(ruleVerdict(s)).toBe('same');
    const C = D(12, 'Mírzá Yaḥyá', { companions: [co(1, 'the Báb', 3, 90000)] });
    expect(ruleVerdict(signals(A, C, { universal, totalMentions: 200000 }))).toBe('unsure');   // only the universal figure
  });
  it('the same named parent is a tie; different named parents veto', () => {
    const A = D(20, 'Mírzá Músá', { claims: [claim(1, 'Mírzá Músá', 'son-of', 'Mírzá Buzurg')] });
    expect(ruleVerdict(signals(A, D(21, 'Áqáy-i-Kalím', { claims: [claim(2, 'Áqáy-i-Kalím', 'son-of', 'Mírzá Buzurg')] })))).toBe('same');
    expect(ruleVerdict(signals(A, D(22, 'Mírzá Músá', { claims: [claim(3, 'Mírzá Músá', 'son-of', 'Mírzá Hádí')] })))).toBe('different');
  });
  it('two records named in the same paragraph are never auto-same', () => {
    const A = D(30, 'Mírzá Ḥusayn', { companions: [co(31, 'Mírzá Ḥusayn', 1), co(7, 'X')] });
    const B = D(31, 'Mírzá Ḥusayn', { companions: [co(30, 'Mírzá Ḥusayn', 1), co(7, 'X')] });
    expect(ruleVerdict(signals(A, B, { universal }))).toBe('unsure');
  });
});

describe('outcome — both judges must agree, to merge and to keep apart', () => {
  it('merge only when rule and model both say same', () => {
    expect(outcome('same', { verdict: 'same' })).toBe('merge');
    expect(outcome('same', { verdict: 'unsure' })).toBe('review');
    expect(outcome('unsure', { verdict: 'same' })).toBe('review');
    expect(outcome('different', { verdict: 'same' })).toBe('review');       // a veto rests on claims that can be wrong
    expect(outcome('different', { verdict: 'different' })).toBe('distinct');
  });
  it('a merge keeps the curated record (importance, then mentions) and carries its evidence', () => {
    const A = D(1, 'X', { importance: null, mentions: 900 }), B = D(2, 'X', { importance: 68, mentions: 40 });
    const s = signals(A, B, {});
    const d = decisionFor(A, B, s, { verdict: 'same', tie: 'shared companion [c1]', confidence: 0.9 }, 'merge');
    expect(d).toMatchObject({ kind: 'merge', payload: { canonical: 2, merged: [1] }, actorTier: 2, status: 'applied' });
    expect(d.evidence.model.tie).toMatch(/\[c1\]/);
  });
  it('review decisions are PROPOSED, never applied', () => {
    const d = decisionFor(D(1, 'X'), D(2, 'X'), signals(D(1, 'X'), D(2, 'X'), {}), { verdict: 'unsure', tie: '' }, 'review');
    expect(d.status).toBe('proposed');
  });
});

describe('prompt + parse', () => {
  it('shows both dossiers side by side with the signals', () => {
    const A = D(1, 'A-name', { claims: [claim(5, 'A-name', 'son-of', 'P')] }), B = D(2, 'B-name');
    const u = buildUser(A, B, signals(A, B, {}));
    expect(u).toMatch(/RECORD A #1[\s\S]*\[c5\][\s\S]*RECORD B #2[\s\S]*SIGNALS/);
  });
  it('parses a verdict; rejects junk', () => {
    expect(parseVerdict('{"verdict":"same","tie":"[c1]","confidence":0.8}')).toMatchObject({ verdict: 'same' });
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
  });
});

describe('run — writes only when asked; applies merges through the store with evidence', () => {
  it('dry run calls the model for non-vetoed pairs and writes nothing', async () => {
    const A = D(1, 'Mírzá Músá', { claims: [claim(1, 'Mírzá Músá', 'son-of', 'Mírzá Buzurg')] });
    const B = D(2, 'Áqáy-i-Kalím', { claims: [claim(2, 'Áqáy-i-Kalím', 'son-of', 'Mírzá Buzurg')] });
    const merges = [], saved = [];
    const ctx = { log: {}, config: { models: {} },
      model: { runLadder: async () => ({ parsed: { verdict: 'same', tie: 'same named father [c1][c2]', confidence: 0.9 } }) },
      store: { getIdentityDossiers: async () => ({ dossiers: new Map([[1, A], [2, B]]), universal: new Set(), totalMentions: 1000 }),
        applyMerge: async (...a) => merges.push(a), saveDecisions: async (d) => saved.push(...d) } };
    const dry = await run(ctx, { pairs: [[1, 2]] });
    expect(dry.counts).toEqual({ merge: 1 }); expect(merges).toHaveLength(0);
    await run(ctx, { pairs: [[1, 2]], write: true });
    expect(merges[0][0]).toBe(1);                         // equal importance and mentions → first stays
    expect(merges[0][3]).toMatchObject({ actor: 'model:pair-judge' });
  });
});
