// Chad's daily conversation digest (10-22): every Anís conversation exactly as the reader saw it, summary + jump list,
// redaction, links to tweak, ~1 MB cap with the rest on the signed digest page. Nothing is sent here.
import { describe, it, expect } from 'vitest';
import { conversationDigest, redactEmail, redactName, mst, embeddable, configFiles, replyState } from '../../worker/mail/conversation-digest.js';
import { gatherConversations, digestUrl } from '../../worker/mail/drafting.js';
import { turnType, meterSummary, turnMeta, meterTurn } from '../../api/lib/assistant/turn-meta.js';

const CHAD = 'chadananda@gmail.com';
const letter = '<div style="font-family:Georgia"><p>Dear friend, <strong>ḥakam</strong> <a href="https://x.org">x</a></p></div>';
const conv = (o = {}) => ({ key: 't1', channel: 'email', thread: 'conv_1', person: { email: 'lalf1919@gmail.com', name: 'Lal Fernando' }, types: ['research answer'],
  items: [
    { kind: 'in', at: '2026-10-22 23:40:00', from: 'lalf1919@gmail.com', fromName: 'Lal Fernando', subject: 'A prayer', text: 'What does <b>this</b> mean?', status: 'drafted', channel: 'email' },
    { kind: 'out', at: '2026-10-22 23:42:00', to: 'lalf1919@gmail.com', subject: 'Re: A prayer', html: letter, text: '**ḥakam**', status: 'sent', channel: 'email',
      meta: { type: 'research answer', models: ['gemini-3.5-flash'], usd: 0.0123, latency_ms: 61000 }, audit: { state: 'done', answered: 'partly', problems: [{ kind: 'not-retrieved', detail: 'Bahá’í Prayers' }] },
      review: 'https://siftersearch.com/_mail/review?t=1.abc' },
  ], ...o });

describe('redaction and time', () => {
  it('initials@domain unless it is Chad; names to initials; MST', () => {
    expect(redactEmail('lalf1919@gmail.com', CHAD)).toBe('l@gmail.com');
    expect(redactEmail('john.q.smith@ex.org', CHAD)).toBe('jqs@ex.org');
    expect(redactEmail(CHAD, CHAD)).toBe(CHAD);
    expect(redactName('Lal Fernando')).toBe('L. F.');
    expect(mst('2026-10-22 23:41:50')).toBe('2026-10-22 16:41 MST');
  });
});

describe('conversationDigest', () => {
  it('summary, jump list, the letter embedded as sent, meta, audit, links to tweak; the address redacted', () => {
    const chat = conv({ key: 'c2', channel: 'widget-chat', thread: 'conv_2', person: { email: null, name: 'web visitor' }, types: ['canned (greeting)'],
      items: [{ kind: 'in', at: '2026-10-22 10:00:00', text: 'hi', channel: 'widget-chat' },
        { kind: 'out', at: '2026-10-22 10:00:01', html: '<p>Hello!</p>', text: 'Hello!', status: 'canned', channel: 'widget-chat', meta: { type: 'canned (greeting)', models: [], usd: 0, latency_ms: 300 } }] });
    const d = conversationDigest([chat, conv()], { date: '2026-10-23', reviewer: CHAD, fullUrl: 'https://siftersearch.com/_mail/digest?t=1.x' });
    expect(d).toMatchObject({ conversations: 2, replies: 2, flagged: 1, held: 0, truncated: 0 });
    expect(d.html).toMatch(/By channel:.*widget.*email|By channel:.*email.*widget/s);
    expect(d.html).toContain('research answer');
    expect(d.html).toContain(letter);                                   // exactly the letter that went out
    expect(d.html).toContain('gemini-3.5-flash');
    expect(d.html).toContain('$0.01');
    expect(d.html).toContain('61.0 s');
    expect(d.html).toContain('href="#c2"');
    expect(d.html).toContain('not-retrieved');
    expect(d.html).toContain('https://siftersearch.com/admin/anis#threads/conv_1');
    expect(d.html).toContain('blob/main/api/lib/assistant/soul.md');
    expect(d.html).toContain('_mail/review?t=1.abc');
    expect(d.html).not.toContain('lalf1919');
    expect(d.html).toContain('l@gmail.com');
    expect(d.html).toContain('What does &lt;b&gt;this&lt;/b&gt; mean?');   // the reader's words escaped
    expect(d.text).toContain('ANÍS (research answer');
    expect(d.text).not.toContain('**');
  });
  it('past the size cap the rest are linked to the digest page', () => {
    const big = (i) => conv({ key: `k${i}`, items: conv().items.map((x) => (x.kind === 'out' ? { ...x, html: `<p>${'x'.repeat(4000)}</p>` } : x)) });
    const d = conversationDigest([big(1), big(2), big(3)], { reviewer: CHAD, fullUrl: 'https://s/_mail/digest?t=9.z', maxBytes: 12000 });
    expect(d.truncated).toBeGreaterThan(0);
    expect(d.html).toContain('https://s/_mail/digest?t=9.z#c3');
  });
  it('held and failed replies count; embeddable strips scripts and handlers', () => {
    expect(replyState({ status: 'draft' }).held).toBe(true);
    expect(replyState({ status: 'failed' }).failed).toBe(true);
    const e = embeddable('<!doctype html><html><body><div class="em-body" style="x"><p onclick="x()">a</p><script>bad()</script></div></body></html>');
    expect(e).toBe('<p>a</p>');
    expect(configFiles('reading guide')).toContain('api/lib/assistant/reading.js');
    expect(configFiles('CTAI term study', 'widget-chat')).not.toContain('worker/mail/letter.js');
  });
});

describe('turn meta (the per-turn meter)', () => {
  it('types, models, cost, latency', async () => {
    expect(turnType({ status: 'answered', recipe: 'define' })).toBe('CTAI term study');
    expect(turnType({ status: 'reading' })).toBe('reading guide');
    expect(turnType({ status: 'canned', kind: 'greeting' })).toBe('canned (greeting)');
    expect(meterSummary([{ model: 'a', usd: 0.01 }, { model: 'b', usd: 0.02 }, { model: 'a', usd: 0 }])).toEqual({ models: ['a', 'b'], usd: 0.03, calls: 3 });
    const { currentAIContext } = await import('../../api/lib/ai-context.js');
    const { meter, ms } = await meterTurn(async () => { currentAIContext().meter.push({ model: 'm', usd: 0.5 }); });
    expect(turnMeta({ status: 'answered', path: { recipe: 'research' }, meter, ms })).toMatchObject({ type: 'research answer', models: ['m'], usd: 0.5 });
  });
  it('logAIUsage feeds an open meter', async () => {
    const { logAIUsage } = await import('../../api/lib/ai-services.js');
    const { meter } = await meterTurn(async () => logAIUsage({ provider: 'openai', model: 'gpt-4o-mini', serviceType: 'chat', promptTokens: 1000, completionTokens: 100 }));
    expect(meter).toHaveLength(1);
    expect(meter[0]).toMatchObject({ model: 'gpt-4o-mini' });
    expect(meter[0].usd).toBeGreaterThanOrEqual(0);
  });
});

describe('gatherConversations (fake D1 + tower)', () => {
  const rows = [
    { id: 1, mailbox: 'anis', direction: 'in', status: 'drafted', thread_key: '<a@x>', from_addr: 'lalf1919@gmail.com', from_name: 'Lal', subject: 'Q', text: 'What is it?\n\nOn Mon, X wrote:\n> old', created_at: '2026-10-22 20:00:00' },
    { id: 2, mailbox: 'anis', direction: 'out', kind: 'reply', status: 'sent', thread_key: '<a@x>', to_addr: 'lalf1919@gmail.com', subject: 'Re: Q', text: '**It** is.', html: null,
      error: 'source:1; anis:answered', meta_json: JSON.stringify({ type: 'research answer', models: ['g'], usd: 0.02, latency_ms: 50000, conversation: 'conv_9' }), created_at: '2026-10-22 20:01:00', sent_at: '2026-10-22 20:01:05' },
    { id: 3, mailbox: 'anis', direction: 'in', status: 'drafted', thread_key: '<b@x>', from_addr: 'battery@siftersearch.com', subject: 'test', text: 't', created_at: '2026-10-22 21:00:00' },
    { id: 4, mailbox: 'anis', direction: 'out', kind: 'reply', status: 'sent', thread_key: '<b@x>', to_addr: 'battery@siftersearch.com', subject: 'Re', text: 'r', created_at: '2026-10-22 21:01:00' },
  ];
  const env = { MAIL_LINK_SECRET: 's', ANIS_DB: { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: /mail_settings/.test(sql) ? [] : rows }) }), all: async () => ({ results: [] }) }) } };
  const tower = { hours: 24, people: [
    { thread: 'conv_9', person: { email: 'lalf1919@gmail.com' }, rounds: [{ at: '2026-10-22 20:00:50', channel: 'email', question: 'What is it?', reply: '**It** is.', status: 'answered', audit: { state: 'done', answered: 'fully', problems: [] }, meta: null }] },
    { thread: 'conv_7', person: { email: null, name: 'web visitor' }, rounds: [{ at: '2026-10-22 09:00:00', asked_at: '2026-10-22 08:59:58', channel: 'widget-chat', question: 'Who was Ṭáhirih?', reply: '**Ṭáhirih** was a poet.', status: 'answered', audit: null, meta: { type: 'research answer', models: ['g'], usd: 0.01, latency_ms: 4000 } }] },
  ] };
  it('email threads from the mailbox (letter composed as sent, audit joined), chat from tower, batteries counted not shown', async () => {
    const g = await gatherConversations(env, { until: new Date('2026-10-23T14:00:00Z'), settings: { reviewer_email: CHAD }, fetchTower: async () => tower });
    expect(g.skipped).toBe(1);
    expect(g.conversations.map((c) => c.channel)).toEqual(['widget-chat', 'email']);
    const email = g.conversations[1];
    expect(email.thread).toBe('conv_9');
    expect(email.items[0].text).toBe('What is it?');                       // their own words, quoted history removed
    expect(email.items[1].html).toMatch(/<strong style="[^"]*">It<\/strong>/);
    expect(email.items[1].html).toContain('— Anís');
    expect(email.items[1].audit).toMatchObject({ answered: 'fully' });
    expect(email.items[1].review).toMatch(/\/_mail\/review\?t=2\./);
    expect(g.conversations[0].items[1].html).toMatch(/<strong style="[^"]*">Ṭáhirih<\/strong>/);
    expect(await digestUrl(new Date('2026-10-23T14:00:00Z'), 's')).toMatch(/\/_mail\/digest\?t=1792764000\.[a-f0-9]{32}$/);
  });
});
