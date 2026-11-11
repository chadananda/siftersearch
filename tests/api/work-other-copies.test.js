// otherCopies: the "library also holds" line offers copies of the SAME work only (11-10, Nabíl's Dawn-Breakers card).
import { describe, it, expect } from 'vitest';
import { otherCopies } from '../../api/lib/assistant/work-request.js';

const d = (title, author, collection = 'Books', n = 500) => ({ title, author, collection, paragraph_count: n });
describe('otherCopies', () => {
  it('drops a recording sharing the title, and a single-chapter fragment', () => {
    const sorted = [d('The Dawn-Breakers', 'Nabil Zarandi'), d('Dawn Breakers', 'William Sears', 'Media'), d('The DAWN-BREAKERS---Chapter I', 'Nabíl-i-A‘ẓam'), d('The Dawn-Breakers (1932)', 'Nabíl-i-A‘ẓam')];
    expect(otherCopies(sorted, 'the dawn-breakers').map((x) => x.title)).toEqual(['The Dawn-Breakers (1932)']);
  });
  it('keeps translations by other hands', () => {
    expect(otherCopies([d('Dhammapada', 'Müller'), d('The Dhammapada', 'Buddharakkhita'), d('Dhammapada: Sayings', 'Easwaran')], 'dhammapada').length).toBe(2);
  });
});
