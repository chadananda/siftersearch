// continueLeads: a found paragraph ending "…as follows:" carries its next same-section paragraphs (11-10 Letters of the Living).
import { describe, it, expect } from 'vitest';
import { continueLeads } from '../../api/lib/assistant/tools.js';

const rows = [
  { doc_id: 7, paragraph_index: 287, heading: 'Ch 3', text: 'Their names are as follows:' },
  { doc_id: 7, paragraph_index: 288, heading: 'Ch 3', text: 'Mullá Ḥusayn, Mírzá Muḥammad-Ḥasan, …' },
  { doc_id: 7, paragraph_index: 289, heading: 'Ch 3', text: 'Ṭáhirih, Quddús.' },
  { doc_id: 7, paragraph_index: 290, heading: 'Ch 4', text: 'Another chapter.' },
];
const ctx = (enc = new Set()) => ({ deps: {
  encumberedAmong: async () => enc,
  paragraphsInRange: async (doc, a, b) => rows.filter((r) => r.doc_id === doc && r.paragraph_index >= a && r.paragraph_index <= b),
} });

describe('continueLeads', () => {
  it('a lead-in paragraph gets the following paragraphs of its section', async () => {
    const [p] = await continueLeads([{ document_id: 7, paragraph_index: 287, text: 'Their names are as follows:' }], ctx());
    expect(p.text).toContain('Ṭáhirih, Quddús.');
    expect(p.text).not.toContain('Another chapter');
    expect(p.continued).toBe(2);
  });
  it('an encumbered work or a paragraph that does not lead on is unchanged', async () => {
    const lead = { document_id: 7, paragraph_index: 287, text: 'Their names are as follows:' };
    expect((await continueLeads([lead], ctx(new Set([7]))))[0]).toBe(lead);
    const plain = { document_id: 7, paragraph_index: 288, text: 'A sentence.' };
    expect((await continueLeads([plain], ctx()))[0]).toBe(plain);
  });
});
