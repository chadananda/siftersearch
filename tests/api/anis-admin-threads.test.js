// Anís Threads admin view: thread list with audit roll-ups, the "better strategy warranted" flag, one thread in rounds.
import { describe, it, expect } from 'vitest';
import { strategyFlag, auditView, threadsOverview, threadDetail } from '../../api/lib/anis/admin-threads.js';

const V_OK = { strategy_used: 'passages', strategy_verdict: 'right', best_strategy: 'passages', evidence: { answered: 'fully', cause: 'none' }, format_verdict: { fit: 'right' }, problems: [], new_strategy: { suggested: false }, data_gap: { found: false }, reader_feedback: { present: false }, summary: 'fine' };
const V_BAD = { ...V_OK, strategy_used: 'passages', strategy_verdict: 'wrong', best_strategy: 'term-study', evidence: { answered: 'no', cause: 'routing' },
  problems: [{ where: 'reply', kind: 'missed-key-passage', detail: 'no originals consulted' }], summary: 'a term question needed the originals' };
const audits = (ids) => new Map(ids.filter((id) => id !== 13).map((id) => [id, { status: 'done', audited_at: 'x', v: id === 12 ? V_BAD : V_OK }]));
const people = async () => new Map([['email:abc', { email: 'liliane@example.com', name: 'Liliane' }]]);

describe('strategyFlag', () => {
  it('flags a wrong/acceptable choice, a different best strategy, or a needed new strategy', () => {
    expect(strategyFlag(V_OK).warranted).toBe(false);
    expect(strategyFlag(V_BAD)).toEqual({ warranted: true, why: 'strategy wrong; passages → term-study' });
    expect(strategyFlag({ ...V_OK, new_strategy: { suggested: true, need: 'word study' } }).why).toBe('new strategy: word study');
  });
  it('an unaudited reply is pending', () => expect(auditView(undefined)).toEqual({ state: 'pending' }));
});

describe('threadsOverview', () => {
  const listThreads = async () => [
    { id: 's1', channel: 'email', participant_id: 'email:abc', replies: 2, reply_ids: '11,12', first_question: 'What is Irfan?', last_at: '2026-10-12' },
    { id: 's2', channel: 'web', participant_id: 'p_x', replies: 1, reply_ids: '13', first_question: 'Hi', last_at: '2026-10-11' },
  ];
  it('rolls up audits per thread, names email correspondents, filters', async () => {
    const r = await threadsOverview({ listThreads, audits, people }, {});
    expect(r.totals).toMatchObject({ threads: 2, replies: 3, audited: 2, better_strategy: 1, problems: 1 });
    expect(r.threads[0]).toMatchObject({ person: { email: 'liliane@example.com' }, audited: 2, better_strategy: 1, not_answered: 1, latest_summary: 'a term question needed the originals' });
    expect(r.threads[1]).toMatchObject({ person: { name: 'web visitor' }, pending: 1, latest_summary: null });
    expect((await threadsOverview({ listThreads, audits, people }, { filter: 'strategy' })).threads.map((t) => t.id)).toEqual(['s1']);
    expect((await threadsOverview({ listThreads, audits, people }, { filter: 'pending' })).threads.map((t) => t.id)).toEqual(['s2']);
  });
});

describe('threadDetail', () => {
  it('pairs each question with its reply, the route taken and the audit', async () => {
    const t = await threadDetail({ thread: async () => ({ id: 's1', channel: 'email', participant_id: 'email:abc' }), audits, people,
      messages: async () => [
        { id: 10, round_index: 1, role: 'user', content: 'What is Irfan?', created_at: 'a' },
        { id: 12, round_index: 1, role: 'assistant', content: 'I cannot find…', status: 'answered', path_json: '{"gate":"research","recipe":"passages","format":{"id":"essay"},"retrieved":7}' },
      ] }, 's1');
    expect(t.person.name).toBe('Liliane');
    expect(t.rounds[0].question.text).toBe('What is Irfan?');
    expect(t.rounds[0].reply.route).toEqual({ gate: 'research', strategy: 'passages', format: 'essay', retrieved: 7 });
    expect(t.rounds[0].reply.audit).toMatchObject({ state: 'done', better_strategy_warranted: true, best_strategy: 'term-study', answered: 'no', cause: 'routing' });
  });
});
