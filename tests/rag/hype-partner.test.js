// HyPE reads the LINKED passage with the paragraph (Chad 2026-09-30: generate for both passages at once).
import { describe, it, expect } from 'vitest';
import { partnerBlock, buildUser } from '../../api/lib/rag/enrich/retrieval.js';

const en = { pid: 'p1', text: 'O Son of Being!', context: null, partner: { kind: 'original', ids: [9], lang: 'fa', text: 'ای پسر هستی' } };
describe('partnerBlock', () => {
  it('names the original and carries its text', () => {
    expect(partnerBlock(en)).toContain('the ORIGINAL (Persian) of this same passage');
    expect(buildUser(en)).toContain('ای پسر هستی');
  });
  it('labels Phelps as a provisional rendering', () => {
    const orig = { pid: 'p2', text: 'ای پسر هستی', partner: { kind: 'translation', ids: [], text: 'O son of being', authority: 'partial-inventory' } };
    expect(partnerBlock(orig)).toContain("Stephen Phelps' provisional rendering");
  });
  it('adds nothing when the original already rides beside the English, or there is no partner', () => {
    expect(partnerBlock({ ...en, original: 'ای پسر هستی' })).toBe('');
    expect(partnerBlock({ pid: 'p3', text: 'x', partner: null })).toBe('');
  });
});
