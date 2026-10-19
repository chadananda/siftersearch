// Anís Threads admin view: thread list with audit roll-ups, the "better strategy warranted" flag, one thread in rounds.
import { describe, it, expect } from 'vitest';
import { strategyFlag, auditView, threadsOverview, threadDetail } from '../../api/lib/assistant/admin-threads.js';

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
  it('problems returned JSON-encoded as a string are parsed (not counted as characters)', () => {
    const a = auditView({ status: 'done', v: { ...V_OK, problems: JSON.stringify([{ where: 'reply', kind: 'tone', detail: 'x' }]) } });
    expect(a.problems).toHaveLength(1);
  });
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

describe('strategyGaps (the work queue)', async () => {
  const { strategyGaps } = await import('../../api/lib/assistant/admin-threads.js');
  it('ranks switches, needs, shortfalls, data gaps and problems by frequency with threads to read', () => {
    const need = { ...V_BAD, new_strategy: { suggested: true, need: 'Shoghi Effendi word frequency', route: 'CTAI renderings chart' }, data_gap: { found: true, detail: 'Persian Hidden Words missing' } };
    const g = strategyGaps([
      { session_id: 'a', status: 'done', v: V_BAD }, { session_id: 'b', status: 'done', v: V_BAD }, { session_id: 'c', status: 'done', v: need },
      { session_id: 'd', status: 'done', v: V_OK }, { session_id: 'e', status: 'error', v: null },
    ]);
    expect(g).toMatchObject({ audited: 4, warranted: 3 });
    expect(g.switches[0]).toMatchObject({ key: 'passages → term-study', n: 3, threads: ['a', 'b', 'c'] });
    expect(g.needs[0]).toMatchObject({ key: 'Shoghi Effendi word frequency', n: 1, route: 'CTAI renderings chart' });
    expect(g.shortfalls[0]).toMatchObject({ key: 'routing', n: 3 });
    expect(g.data_gaps[0].key).toBe('Persian Hidden Words missing');
    expect(g.problems[0]).toMatchObject({ key: 'reply · missed-key-passage', n: 3 });
  });
});

describe('mailPeople (correspondent names survive a failed refresh)', async () => {
  const { mailPeople, personOf, _resetPeople } = await import('../../api/lib/assistant/admin-threads.js');
  const { emailHash } = await import('../../api/lib/assistant/pause-link.js');
  const ok = async () => ({ json: async () => ({ messages: [{ from_addr: 'lal@example.org', from_name: 'Lal' }] }) });
  const down = async () => { throw new Error('The operation was aborted due to timeout'); };

  it('a timeout after a good fetch still names the person (10-14: every row read "email correspondent")', async () => {
    _resetPeople();
    const pid = `email:${emailHash('lal@example.org')}`;
    expect((await mailPeople({ fetchImpl: ok, key: 'k', persist: false })).get(pid).name).toBe('Lal');
    const after = await mailPeople({ fetchImpl: down, key: 'k', persist: false, fresh: true });
    expect(after.get(pid)).toEqual({ email: 'lal@example.org', name: 'Lal' });
  });

  it('an unknown address is distinguishable, never the generic label', () => {
    const p = personOf('email:abcdef1234', new Map());
    expect(p.name).toBe('unknown address abcdef');
    expect(personOf(null, new Map()).name).toBe('unknown');
  });
});

describe('rememberCorrespondent', async () => {
  const { mailPeople, rememberCorrespondent, _resetPeople } = await import('../../api/lib/assistant/admin-threads.js');
  const { emailHash } = await import('../../api/lib/assistant/pause-link.js');
  it('a correspondent Anís answered is named even when the mail store never answers', async () => {
    _resetPeople();
    rememberCorrespondent('Seeker@Example.org', null, { persist: false });
    const down = async () => { throw new Error('timeout'); };
    const m = await mailPeople({ fetchImpl: down, key: 'k', persist: false, fresh: true });
    expect(m.get(`email:${emailHash('seeker@example.org')}`).email).toBe('seeker@example.org');
  });
});

describe('digestConversations (Chad 10-19: Anís daily digest like Jafar\'s)', () => {
  it('rounds answered in the window, grouped by person, with audits; the reviewer\'s own threads left out', async () => {
    const { digestConversations } = await import('../../api/lib/assistant/admin-threads.js');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const old = new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
    const listThreads = async () => [{ id: 's1', last_at: now }, { id: 's2', last_at: now }, { id: 's3', last_at: old }];
    const thread = async (id) => ({ id, channel: 'email', participant_id: id === 's2' ? 'email:chad' : 'email:abc' });
    const messages = async (id) => [
      { id: 10, round_index: 0, role: 'user', content: 'old question', created_at: old },
      { id: 11, round_index: 0, role: 'assistant', content: 'old answer', status: 'answered', created_at: old, answered_at: old, path_json: '{}' },
      { id: 12, round_index: 1, role: 'user', content: 'What is the original word for chamber?', created_at: now },
      { id: 12, round_index: 1, role: 'assistant', content: 'I cannot find it.', status: 'answered', created_at: now, answered_at: now, path_json: '{"recipe":"quote"}' },
    ];
    const ppl = async () => new Map([['email:abc', { email: 'lal@example.com', name: 'Lal' }], ['email:chad', { email: 'chadananda@gmail.com', name: 'Chad' }]]);
    const r = await digestConversations({ listThreads, thread, messages, audits, people: ppl }, { hours: 24, exclude: ['chadananda@gmail.com'] });
    expect(r.people).toHaveLength(1);
    expect(r.people[0].person.name).toBe('Lal');
    expect(r.people[0].rounds).toHaveLength(1);
    expect(r.people[0].rounds[0]).toMatchObject({ question: 'What is the original word for chamber?', reply: 'I cannot find it.', audit: { answered: 'no' } });
  });
});
