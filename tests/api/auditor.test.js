// Strategy auditor: the prompt carries the question, the route, the evidence and the reply; the tool is typed; cost is exact.
import { describe, it, expect } from 'vitest';
import { buildAuditPrompt, AUDIT_TOOL, costOf, STRATEGIES } from '../../api/lib/audit/auditor.js';

describe('auditor', () => {
  it('builds a prompt from the logged exchange, evidence included', () => {
    const { system, user } = buildAuditPrompt({ question: 'Where is this from? Tear asunder…', reply: 'From Gleanings.',
      path: { gate: 'research', kind: 'source_lookup', recipe: 'source', format: { id: 'source' }, retrieved: 2,
        evidence: [{ title: 'Gleanings', author: 'Bahá’u’lláh', text: 'Tear asunder, in My Name…' }] } });
    expect(system).toMatch(/source: where a quotation comes from/);
    expect(system).toMatch(/wherever it lies/);
    expect(user).toMatch(/QUESTION:\nWhere is this from/);
    expect(user).toMatch(/\[1\] Gleanings — Bahá’u’lláh/);
    expect(user).toMatch(/"strategy":"source"/);
  });
  it('the tool is typed, and every mistake says where it lies', () => {
    const p = AUDIT_TOOL.input_schema.properties;
    expect(p.strategy_verdict.enum).toEqual(['right', 'acceptable', 'wrong']);
    expect(p.best_strategy.enum).toEqual(Object.keys(STRATEGIES));
    expect(p.problems.items.properties.where.enum).toEqual(['reply', 'library-data', 'source-text', 'reader-premise']);
  });
  it('cost from usage and per-1k pricing', () => {
    expect(costOf({ input_tokens: 2000, output_tokens: 500 }, { input: 0.003, output: 0.015 })).toBeCloseTo(0.0135, 6);
  });
});

describe('reader feedback reaches the audit', () => {
  it('every audit records whether the message was feedback', () => {
    expect(AUDIT_TOOL.input_schema.required).toContain('reader_feedback');
    expect(AUDIT_TOOL.input_schema.properties.reader_feedback.properties.justified.enum).toEqual(['yes', 'partly', 'no', 'unclear']);
  });
  it('feedback is flagged so the earlier reply is judged in its light', () => {
    const earlier = [{ role: 'user', content: 'What does Irfan mean?' }, { role: 'assistant', content: 'Here are some quotes…' }];
    const fb = buildAuditPrompt({ earlier, question: 'I do not see the relationship of the quotes to Irfan.', reply: 'Thank you.',
      path: { triage: { kind: 'feedback', reaction: 'disagreed' } } });
    expect(fb.user).toMatch(/NOTE: the gate read this message as the reader's FEEDBACK/);
    expect(fb.system).toMatch(/FEEDBACK/);
    const plain = buildAuditPrompt({ question: 'What does Irfan mean?', reply: 'x', path: { triage: { kind: 'research', reaction: 'none' } } });
    expect(plain.user).not.toMatch(/NOTE: the gate/);
  });
});

describe('verifyHoldings (the auditor cannot see the catalogue)', async () => {
  const { verifyHoldings } = await import('../../api/lib/audit/auditor.js');
  const find = async (t) => (/dawn-breakers/i.test(t) ? { id: 21308, title: 'The Dawn-Breakers' } : null);
  it('a held work the reply lacked is a retrieval failure, not a library gap (10-14)', async () => {
    const v = await verifyHoldings({ needed_works: ['The Dawn-Breakers'], problems: [],
      data_gap: { found: true, detail: 'The Dawn-Breakers is not present as a retrievable primary text in the library' } }, find);
    expect(v.data_gap.found).toBe(false);
    expect(v.problems[0]).toMatchObject({ kind: 'not-retrieved' });
    expect(v.problems[0].detail).toMatch(/doc 21308/);
  });
  it('an unheld work is the gap, named as checked', async () => {
    const v = await verifyHoldings({ needed_works: ['Some Unheld Book'], problems: [], data_gap: { found: false } }, find);
    expect(v.data_gap).toEqual({ found: true, detail: expect.stringMatching(/catalogue title search found nothing\): Some Unheld Book/) });
  });
  it('a visible defect (bad OCR) stands', async () => {
    const v = await verifyHoldings({ problems: [], data_gap: { found: true, detail: 'passage [2] has garbled OCR' } }, find);
    expect(v.data_gap.found).toBe(true);
  });
});

describe('catalogue title matching (10-15: fifteen held works reported as gaps)', async () => {
  const { titleCandidates, titleMatches } = await import('../../api/lib/audit/auditor.js');
  const held = (phrase, title) => titleCandidates(phrase).some((c) => titleMatches(c, title));
  it('a portion of a book is held when the book is (Chad 10-15)', () => {
    expect(held('Introduction to The Dawn-Breakers (Shoghi Effendi)', 'The Dawn-Breakers')).toBe(true);
    expect(held('Introduction to The Dawn-Breakers (Shoghi Effendi)', 'The Dawn-breakers---Introduction')).toBe(true);
    expect(held('Kitáb-i-Aqdas (introduction/notes)', 'The Kitáb-i-Aqdas')).toBe(true);
    expect(held('Days of Remembrance footnotes on the Maid of Paradise', 'Days of Remembrance')).toBe(true);
    expect(held('Tablet to the Hague (Selections from the Writings of \'Abdu\'l-Bahá)', 'Selections from the Writings of ‘Abdu’l-Bahá')).toBe(true);
  });
  it('glosses, lists and transliteration do not hide a held work', () => {
    expect(held("Qur'an (ḥūr al-ʿayn)", 'The Qur’án')).toBe(true);
    expect(held("Qur'an (ḥūr al-ʿayn)", 'The Quran')).toBe(true);
    expect(held('Bible (Gospels); Karaniya Metta Sutta; Lotus Sutra', 'The Lotus Sutra')).toBe(true);
    expect(held('Shoghi Effendi, The Greatest Name / God Passes By', 'God Passes By')).toBe(true);
  });
  it('an unrelated title is not a match', () => {
    expect(held('Lotus Sutra', 'The Dawn-Breakers')).toBe(false);
    expect(held('Bahá’í scholarship on irfán and Islamic mysticism', 'Islam')).toBe(false);
  });
});

describe('matching v3 + recheck (10-15)', async () => {
  const { titleCandidates, titleMatches, verifyHoldings } = await import('../../api/lib/audit/auditor.js');
  const held = (phrase, title) => titleCandidates(phrase).some((c) => titleMatches(c, title));
  it('numbering and partial names', () => {
    expect(held('First Epistle of John', '1 John')).toBe(true);
    expect(held('Karaniya Metta Sutta', 'Sutta Nipata 1.8 - Metta Sutta (Discourse on Loving-kindness)')).toBe(true);
    expect(held('First Epistle of John', '3 John')).toBe(false);
    expect(held('Lotus Sutra', 'Theragatha 15.2 - Udayin Thera: The Blooming Lotus')).toBe(false);
  });
  it('a visible defect survives beside unheld works; a recheck starts from the model\'s own gap', async () => {
    const none = async () => null;
    const v = await verifyHoldings({ needed_works: ['Lotus Sutra'], problems: [], data_gap: { found: true, detail: 'passage [2] has garbled OCR' } }, none);
    expect(v.data_gap.detail).toMatch(/garbled OCR · not in the library .*Lotus Sutra/);
    const again = await verifyHoldings(v, async () => ({ id: 1, title: 'The Lotus Sutra' }));
    expect(again.data_gap).toEqual({ found: true, detail: 'passage [2] has garbled OCR' });
    expect(again.problems.filter((p) => p.kind === 'not-retrieved')).toHaveLength(1);
  });
});

describe('the competitor bar (Chad 10-19: "always more helpful and informative than Perplexity")', () => {
  it('only the scrubbed question leaves — no address, number, greeting or signature; a short follow-up carries its context', async () => {
    const { competitorQuery } = await import('../../api/lib/audit/auditor.js');
    const q = competitorQuery('Thank you so much for the info!\n\nWould "fi baytihi" be used for "chamber"?\n\nWarmly,\nLal\nlal@example.com +1 (555) 123-4567',
      [{ role: 'user', content: 'Dear Anís,\nWhat is the original word for "chamber" in "in the privacy of his chamber"?' }]);
    expect(q).toContain('Follow-up: Would "fi baytihi" be used for "chamber"?');
    expect(q).toContain('Earlier question: What is the original word');
    expect(q).not.toMatch(/Lal|example\.com|555|Thank you|Warmly|Dear/);
  });
  it("the competitor's answer is in the prompt with its sources; without one the verdict is no-comparison", async () => {
    const { buildAuditPrompt } = await import('../../api/lib/audit/auditor.js');
    const withIt = buildAuditPrompt({ question: 'q', reply: 'r', competitor: { text: 'ghurfa means room', citations: [{ title: 'x', url: 'https://example.org/a' }] } }).user;
    expect(withIt).toMatch(/ANSWERED BY PERPLEXITY[\s\S]*ghurfa means room[\s\S]*https:\/\/example\.org\/a/);
    expect(buildAuditPrompt({ question: 'q', reply: 'r' }).user).toMatch(/no-comparison/);
  });
});
