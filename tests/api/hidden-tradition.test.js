// "Other" (Chad 10-21): works spanning traditions, related ideas, contrasting beliefs — searchable, never shelved.
import { describe, it, expect } from 'vitest';
import { hiddenFrom } from '../../api/lib/authority.js';
import { buildShelves } from '../../api/lib/library/shelves.js';

describe('hidden traditions', () => {
  it('meta.yaml hidden: true marks a tradition hidden', () => {
    expect([...hiddenFrom({ Other: { title: 'Other', hidden: true }, Islam: { title: 'Islam' } })]).toEqual(['Other']);
  });
  it('the shelves never list a hidden tradition', () => {
    const rows = [{ religion: 'Islam', collection: 'Quran', source_site: null, n: 3 }, { religion: 'Other', collection: 'Economics and Political Philosophy', source_site: null, n: 1 }];
    const with_ = buildShelves({ collectionCounts: rows });
    const without = buildShelves({ collectionCounts: rows, hidden: new Set(['Other']) });
    const names = (x) => JSON.stringify(x).includes('"Other"');
    expect(names(with_)).toBe(true);
    expect(names(without)).toBe(false);
  });
});
