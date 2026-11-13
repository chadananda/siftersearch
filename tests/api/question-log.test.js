// question log: site extraction (host only), outcome classification, logging never throws, repo SQL shape (injected-free: since parsing + grouping via sqlite in memory).
import { describe, it, expect, vi } from 'vitest';
import { siteOf, outcomeOf, logTurnQuestion } from '../../api/lib/assistant/question-log.js';
import { sinceStamp } from '../../api/lib/repos/question-log-repo.js';

describe('siteOf', () => {
  it('origin → host only', () => expect(siteOf({ origin: 'https://www.Example.org:8443' })).toBe('www.example.org'));
  it('referer → host, path and query dropped', () => expect(siteOf({ referer: 'https://blog.example.com/a/b?email=x#y' })).toBe('blog.example.com'));
  it('origin wins over referer', () => expect(siteOf({ origin: 'https://a.com', referer: 'https://b.com/x' })).toBe('a.com'));
  it('junk → null', () => { expect(siteOf({ origin: 'null' })).toBeNull(); expect(siteOf({ origin: 'not a url' })).toBeNull(); expect(siteOf({})).toBeNull(); expect(siteOf()).toBeNull(); });
});
describe('outcomeOf', () => {
  it('classifies by similarity', () => {
    expect(outcomeOf(1)).toBe('hit'); expect(outcomeOf(0.88)).toBe('hit');
    expect(outcomeOf(0.8)).toBe('related'); expect(outcomeOf(0.75)).toBe('related');
    expect(outcomeOf(0.74)).toBe('miss');
  });
});
describe('logTurnQuestion', () => {
  it('writes one row with outcome, set, channel, site', async () => {
    const logQuestion = vi.fn(async () => {});
    await logTurnQuestion({ question: ' How do Baha\'is pray? ', hit: { similarity: 0.91, setId: 7 }, channel: 'widget-chat', site: 'x.org' }, { repo: { logQuestion } });
    const row = logQuestion.mock.calls[0][0];
    expect(row).toMatchObject({ question: "How do Baha'is pray?", researchSetId: 7, similarity: 0.91, outcome: 'hit', channel: 'widget-chat', site: 'x.org' });
    expect(row.hash).toBeTruthy();
  });
  it('no hit → miss with null set and similarity', async () => {
    const logQuestion = vi.fn(async () => {});
    await logTurnQuestion({ question: 'q' }, { repo: { logQuestion } });
    expect(logQuestion.mock.calls[0][0]).toMatchObject({ outcome: 'miss', researchSetId: null, similarity: null, site: null });
  });
  it('a failing repo never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logTurnQuestion({ question: 'q' }, { repo: { logQuestion: async () => { throw new Error('db down'); } } })).resolves.toBeNull();
    expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });
  it('an empty question logs nothing', async () => {
    const logQuestion = vi.fn();
    await logTurnQuestion({ question: '  ' }, { repo: { logQuestion } });
    expect(logQuestion).not.toHaveBeenCalled();
  });
});
describe('sinceStamp', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  it('relative windows', () => { expect(sinceStamp('7d', now)).toBe('2026-11-05 12:00:00'); expect(sinceStamp('24h', now)).toBe('2026-11-11 12:00:00'); });
  it('ISO passes through; junk/empty → no bound', () => { expect(sinceStamp('2026-11-01T00:00:00Z', now)).toBe('2026-11-01 00:00:00'); expect(sinceStamp('soon', now)).toBeNull(); expect(sinceStamp('', now)).toBeNull(); });
});
