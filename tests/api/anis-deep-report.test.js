// Deep reports (Chad 11-03): Jev decides the depth (answer / research / deep_report) from the history, the reader card and
// the channel as context, never a channel rule or a word rule. deep_report runs deep research as a JOB (the deep-research
// worker queue); chat answers at once and offers to email the report; acceptance (Jev's call) sends it through mail.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { triageMessage, DEPTHS, DEPTH_Q, T } from '../../api/lib/assistant/triage.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { buildReport, renderReport, makeReports, offerStore, emailIn, startDeepReport, REPORT_TEXT } from '../../api/lib/assistant/deep-report.js';
import * as tools from '../../api/lib/assistant/tools.js';
import { requestDeepResearch } from '../../api/lib/deep-research.js';

const RECORD = {
  id: 42, status: 'complete', canonical_question: 'What do the Writings say about the purpose of suffering?', completed_at: '2026-11-03T10:00:00Z',
  summary_json: JSON.stringify({ overview: 'Suffering refines the soul.', traditions: ["Baha'i"] }),
  sections_json: JSON.stringify([
    { label: 'Why do tests come?', summary: 'Tests are a means of growth.', quotes: [
      { para_id: 7, excerpt: 'Tests are benefits from God.', source_title: 'Paris Talks', source_author: "'Abdu'l-Bahá", source_site: 'oceanlibrary.com', source_url: 'https://oceanlibrary.com/paris-talks/', external_para_id: 'p12' },
      { para_id: 8, excerpt: 'The mind and spirit of man advance when he is tried by suffering.', source_title: 'Paris Talks', source_author: "'Abdu'l-Bahá", source_url: 'https://example.org/pt#8' }] },
    { label: 'Empty', summary: 'x', quotes: [] }]),
};
const memStore = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } }; };

describe('triage exposes depth (Jev decides; the channel is context)', () => {
  const capture = (answers) => { const c = {}; c.fetch = async (_u, init) => { c.body = JSON.parse(init.body); return { ok: true, json: async () => ({ answers }) }; }; return c; };
  const base = { malicious: { noul: 0.01 }, complete: { noul: 0.99 }, stop_request: { noul: 0.01 }, kind: { choice: 'research', confidence: 0.9 } };

  it('asks a depth choice with the three depths and returns it', async () => {
    const c = capture({ ...base, depth: { choice: 'deep_report', confidence: 0.82 } });
    const t = await triageMessage([{ role: 'user', content: 'I am writing a paper on the purpose of suffering; can you research it thoroughly?' }], { apiKey: 'k', fetchImpl: c.fetch });
    expect(Object.keys(c.body.questions.depth.criteria)).toEqual(['answer', 'research', 'deep_report']);
    expect(c.body.questions.depth.instructions).toBe(DEPTH_Q);
    expect(t.depth).toEqual({ choice: 'deep_report', confidence: 0.82 });
  });
  it('the channel rides in Jev\'s state as context; the instructions name it a prior, never a rule', async () => {
    expect(DEPTH_Q).toMatch(/channel/i);
    expect(DEPTH_Q).toMatch(/email/i);
    expect(DEPTH_Q).toMatch(/conversation/i);
    expect(DEPTH_Q).toMatch(/reader/i);
    expect(Object.keys(DEPTHS)).toEqual(['answer', 'research', 'deep_report']);
    const c = capture(base);
    await triageMessage([{ role: 'user', content: 'What is the purpose of suffering?' }], { apiKey: 'k', fetchImpl: c.fetch, channel: 'email' });
    expect(c.body.state).toMatch(/CHANNEL: email/);
  });
  it('in a thread Jev is asked whether the turn accepts the assistant\'s offer; never on a first message', async () => {
    const c = capture({ ...base, accepts_offer: { noul: 0.93 } });
    const t = await triageMessage([{ role: 'user', content: 'tell me about suffering' }, { role: 'assistant', content: 'Shall I email you the report?' }, { role: 'user', content: 'sure' }], { apiKey: 'k', fetchImpl: c.fetch });
    expect(c.body.questions.accepts_offer.type).toBe('noul');
    expect(t.accepts_offer).toBe(0.93);
    const f = capture(base);
    const t1 = await triageMessage([{ role: 'user', content: 'sure' }], { apiKey: 'k', fetchImpl: f.fetch });
    expect(f.body.questions.accepts_offer).toBeUndefined();
    expect(t1.accepts_offer).toBe(0);
  });
});

describe('the report document', () => {
  it('buildReport: title, summary, sections, citations as linked passages (empty sections dropped)', () => {
    const r = buildReport(RECORD);
    expect(r).toMatchObject({ id: 42, title: RECORD.canonical_question, summary: 'Suffering refines the soul.', status: 'complete' });
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]).toMatchObject({ heading: 'Why do tests come?', summary: 'Tests are a means of growth.' });
    expect(r.sections[0].passages.map((p) => p.ref)).toEqual([1, 2]);
    expect(r.citations[0]).toMatchObject({ ref: 1, title: 'Paris Talks', url: 'https://oceanlibrary.com/paris-talks/?paraId=p12', para_id: 7 });
    expect(r.citations[1].url).toBe('https://example.org/pt#8');
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(buildReport({ ...RECORD, status: 'in_progress' })).toBeNull();
  });
  it('renderReport: an HTML email body with each passage linked to its source, and a text part', () => {
    const { html, text, subject } = renderReport(buildReport(RECORD));
    expect(subject).toMatch(/purpose of suffering/);
    expect(html).toContain('<a href="https://oceanlibrary.com/paris-talks/?paraId=p12"');
    expect(html).toContain('Tests are benefits from God.');
    expect(html).toContain('<h2');
    expect(text).toContain('https://example.org/pt#8');
  });
  it('escapes what it renders', () => {
    const { html } = renderReport(buildReport({ ...RECORD, canonical_question: '<script>x</script>' }));
    expect(html).not.toContain('<script>');
  });
});

describe('deep_report is a registered strategy that queues a job, never runs research inline', () => {
  it('registered internal strategy named deep_report', () => {
    expect(tools.resolve('deep_report')).toMatchObject({ name: 'deep_report', kind: 'strategy', internal: true });
    expect(tools.publicNames()).not.toContain('deep_report');
  });
  it('run → the request function (queue) → { researchId, status }', async () => {
    const request = vi.fn(async () => ({ id: 9, status: 'queued' }));
    expect(await tools.run('deep_report', { question: 'q?' }, { request })).toEqual({ researchId: 9, status: 'queued' });
    expect(request).toHaveBeenCalledWith('q?');
    expect(await startDeepReport({ question: '' }, { request })).toBeNull();
  });
  it('requestDeepResearch creates the record if new and queues it unless queued, running or done', async () => {
    const repo = { findByQuestionHash: vi.fn(async () => null), createPendingResearch: vi.fn(async () => ({ lastInsertRowid: 5 })),
      queueResearchTask: vi.fn(async () => {}) };
    expect(await requestDeepResearch('Why suffering?', { repo, embed: async () => Array(8).fill(0) })).toEqual({ id: 5, status: 'queued' });
    expect(repo.queueResearchTask).toHaveBeenCalledWith(5, expect.any(Number));
    for (const status of ['queued', 'in_progress', 'complete']) {
      const r2 = { findByQuestionHash: vi.fn(async () => ({ id: 6, status })), queueResearchTask: vi.fn(), incrementAskCount: vi.fn(async () => {}) };
      expect(await requestDeepResearch('Why suffering?', { repo: r2 })).toEqual({ id: 6, status });
      expect(r2.queueResearchTask).not.toHaveBeenCalled();
    }
    const r3 = { findByQuestionHash: vi.fn(async () => ({ id: 7, status: 'failed' })), queueResearchTask: vi.fn(async () => {}), incrementAskCount: vi.fn(async () => {}) };
    expect(await requestDeepResearch('Why suffering?', { repo: r3 })).toEqual({ id: 7, status: 'queued' });
  });
});

describe('delivery through mail', () => {
  it('a ready report is sent at once; one not ready yet is queued for the worker to send', async () => {
    const sendMail = vi.fn(async () => ({ success: true })), addNotify = vi.fn(async () => {});
    const ready = makeReports({ load: async () => RECORD, sendMail, addNotify, store: memStore() });
    expect(await ready.deliver({ researchId: 42, email: 'a@b.org' })).toMatchObject({ sent: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.org', html: expect.stringContaining('<a href=') }));
    const later = makeReports({ load: async () => ({ ...RECORD, status: 'in_progress' }), sendMail, addNotify, store: memStore() });
    expect(await later.deliver({ researchId: 42, email: 'a@b.org' })).toMatchObject({ queued: true });
    expect(addNotify).toHaveBeenCalledWith(42, 'a@b.org');
  });
  it('sendPending (the worker, after the job completes): every waiting address gets the report, then is marked', async () => {
    const sendMail = vi.fn(async () => ({ success: true })), mark = vi.fn(async () => {});
    const r = makeReports({ load: async () => RECORD, sendMail, pending: async () => [{ id: 1, email: 'a@b.org' }, { id: 2, email: 'c@d.org' }], mark, store: memStore() });
    expect(await r.sendPending(42)).toBe(2);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(mark).toHaveBeenCalledWith([1, 2]);
  });
  it('the offer store persists across instances (file-backed)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'offers-'));
    await offerStore(dir).set('conv_1', { researchId: 42 });
    expect(await offerStore(dir).get('conv_1')).toMatchObject({ researchId: 42 });
    await offerStore(dir).del('conv_1');
    expect(await offerStore(dir).get('conv_1')).toBeNull();
  });
  it('emailIn resolves an address the reader typed (structure, not intent)', () => {
    expect(emailIn('yes, send it to <Jane.Doe@example.org>, thanks')).toBe('Jane.Doe@example.org');
    expect(emailIn('yes please')).toBeNull();
    expect(emailIn('me@localhost')).toBeNull();
  });
});

describe('anisTurn routes depth', () => {
  function harness({ triage, record = { ...RECORD, status: 'queued' }, store = memStore() } = {}) {
    const calls = { respond: [], request: [], mail: [], notify: [] };
    const reports = makeReports({ request: async (q) => { calls.request.push(q); return { id: 42, status: record.status }; }, load: async () => record,
      sendMail: async (m) => { calls.mail.push(m); return { success: true }; }, addNotify: async (id, e) => { calls.notify.push([id, e]); }, store });
    const deps = {
      open: async () => ({ conversationId: 'conv_1', round: 0 }), close: async () => {}, fail: async () => {}, card: null, resolve: null,
      triage: async () => triage,
      respond: async (a) => { calls.respond.push(a); return { reply: 'Suffering, the texts say, refines the soul.', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {}, reports,
    };
    const run = (messages, extra = {}) => anisTurn({ messages, participant: { id: 'sess_1' }, clientKey: 'sess_1', onEvent: () => {}, deps, ...extra });
    return { calls, run, store };
  }
  const base = { malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 } };
  const q = [{ role: 'user', content: 'Please research the purpose of suffering in depth for my study group.' }];

  it('chat + deep_report: the job is queued, the short answer comes at once with the offer, the offer is remembered', async () => {
    const h = harness({ triage: { ...base, depth: { choice: 'deep_report', confidence: 0.85 }, features: { first: true } } });
    const r = await h.run(q, { channel: 'site-chat' });
    expect(h.calls.request).toEqual([q[0].content]);
    expect(h.calls.respond).toHaveLength(1);
    expect(r.reply.startsWith('Suffering, the texts say')).toBe(true);
    expect(r.reply).toContain(REPORT_TEXT.offer);
    expect(r.deep_report).toMatchObject({ researchId: 42, offered: true });
    expect(await h.store.get('conv_1')).toMatchObject({ researchId: 42 });
    expect(r.path.deep_report).toMatchObject({ researchId: 42, offered: true });
    expect(h.calls.mail).toHaveLength(0);
  });
  it('Jev\'s depth = answer on EMAIL: answered normally, no job (the channel never forces depth)', async () => {
    const h = harness({ triage: { ...base, depth: { choice: 'answer', confidence: 0.9 }, features: { first: true } } });
    const r = await h.run(q, { channel: 'email', trusted: true, participant: { id: 'email:x', email: 'a@b.org' } });
    expect(h.calls.request).toHaveLength(0);
    expect(r.reply).toBe('Suffering, the texts say, refines the soul.');
    expect(r.deep_report).toBeUndefined();
  });
  it('no depth from Jev (fail open) = the normal answer on every channel', async () => {
    for (const channel of ['site-chat', 'email']) {
      const h = harness({ triage: { ...base, features: { first: true } } });
      const r = await h.run(q, { channel, trusted: true, participant: { id: 'p', email: 'a@b.org' } });
      expect(h.calls.request).toHaveLength(0);
      expect(r.reply).toBe('Suffering, the texts say, refines the soul.');
    }
  });
  it('EMAIL + deep_report: a ready report IS the reply; one still running follows by mail to the correspondent', async () => {
    const ready = harness({ triage: { ...base, depth: { choice: 'deep_report', confidence: 0.85 }, features: { first: true } }, record: RECORD });
    const r = await ready.run(q, { channel: 'email', trusted: true, participant: { id: 'email:x', email: 'a@b.org' } });
    expect(r.reply).toContain('Tests are benefits from God.');
    expect(r.reply).toContain('https://oceanlibrary.com/paris-talks/?paraId=p12');
    const running = harness({ triage: { ...base, depth: { choice: 'deep_report', confidence: 0.85 }, features: { first: true } } });
    const r2 = await running.run(q, { channel: 'email', trusted: true, participant: { id: 'email:x', email: 'a@b.org' } });
    expect(r2.reply).toContain(REPORT_TEXT.emailFollows);
    expect(running.calls.notify).toEqual([[42, 'a@b.org']]);
  });
  it('acceptance (Jev\'s accepts_offer) with a known address sends the report through mail', async () => {
    const store = memStore(); await store.set('conv_1', { researchId: 42, question: 'x' });
    const h = harness({ triage: { ...base, accepts_offer: 0.92, features: { first: false } }, record: RECORD, store });
    const r = await h.run([...q, { role: 'assistant', content: `answer. ${REPORT_TEXT.offer}` }, { role: 'user', content: 'yes please' }],
      { channel: 'site-chat', participant: { id: 'sess_1', email: 'reader@example.org' } });
    expect(h.calls.respond).toHaveLength(0);
    expect(h.calls.mail).toHaveLength(1);
    expect(h.calls.mail[0]).toMatchObject({ to: 'reader@example.org' });
    expect(h.calls.mail[0].html).toContain('Tests are benefits from God.');
    expect(r.reply).toBe(REPORT_TEXT.sent('reader@example.org'));
    expect(r.status).toBe('report');
    expect(await store.get('conv_1')).toBeNull();
  });
  it('acceptance with no known address asks for it; the next turn with the address sends', async () => {
    const store = memStore(); await store.set('conv_1', { researchId: 42, question: 'x' });
    const h = harness({ triage: { ...base, accepts_offer: 0.9, features: { first: false } }, record: RECORD, store });
    const thread = [...q, { role: 'assistant', content: `answer. ${REPORT_TEXT.offer}` }, { role: 'user', content: 'yes' }];
    const r = await h.run(thread, { channel: 'site-chat' });
    expect(r.reply).toBe(REPORT_TEXT.askEmail);
    expect(h.calls.mail).toHaveLength(0);
    const r2 = await h.run([...thread, { role: 'assistant', content: REPORT_TEXT.askEmail }, { role: 'user', content: 'reader@example.org' }], { channel: 'site-chat' });
    expect(h.calls.mail[0]).toMatchObject({ to: 'reader@example.org' });
    expect(r2.reply).toBe(REPORT_TEXT.sent('reader@example.org'));
  });
  it('without Jev\'s acceptance a pending offer does not send (a new question is just answered)', async () => {
    const store = memStore(); await store.set('conv_1', { researchId: 42 });
    const h = harness({ triage: { ...base, accepts_offer: 0.1, features: { first: false } }, record: RECORD, store });
    const r = await h.run([...q, { role: 'assistant', content: 'a' }, { role: 'user', content: 'yes, and what about joy?' }], { channel: 'site-chat', participant: { id: 's', email: 'r@e.org' } });
    expect(h.calls.mail).toHaveLength(0);
    expect(h.calls.respond).toHaveLength(1);
    expect(r.status).toBe('answered');
  });
  it('the thresholds exist', () => { expect(T.depth).toBeGreaterThan(0.4); expect(T.accept).toBeGreaterThan(0.4); });
});

describe('no word rules decide depth or acceptance', () => {
  it('deep-report.js, triage.js and turn.js never test the reader\'s words for depth or acceptance', () => {
    for (const f of ['deep-report.js', 'triage.js', 'turn.js']) {
      const src = readFileSync(new URL(`../../api/lib/assistant/${f}`, import.meta.url), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\/[^/\n]*\b(yes|yeah|sure|please|ok|okay|email|e-mail|mail|report|deep|research|thorough|in depth|detailed)\b[^/\n]*\/[gimsuy]*\.(test|exec)\(/i);
      expect(src, f).not.toMatch(/channel(\.id)?\s*===?\s*'email'[^\n]*depth|depth[^\n]*channel(\.id)?\s*===?\s*'email'/);
    }
    const dr = readFileSync(new URL('../../api/lib/assistant/deep-report.js', import.meta.url), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(dr).not.toMatch(/\.(test|exec|match)\(\s*(text|message|content)/);
  });
});
