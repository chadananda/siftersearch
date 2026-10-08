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
