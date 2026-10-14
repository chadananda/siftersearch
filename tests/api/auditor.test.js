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
