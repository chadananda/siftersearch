// zero-hits class (writer residuals 11-05). Three causes, each fixed for the class with fresh cases:
// (1) a tradition named as the religion ("Buddhism") matched no stored value ("Buddhist") and emptied the search (Dhammapada);
// (2) a blank required input is refused, never run; (3) the forensics adapter read document_search's title as "" and gave
// every research step after the first no hits, so searches that found works showed as zero-hits.
import { describe, it, expect, vi } from 'vitest';
import * as tools from '../../api/lib/assistant/tools.js';
import { canonicalTradition } from '../../api/lib/assistant/tradition-name.js';
import { turnFromPath } from '../../api/lib/audit/improve.js';
import { assessSearch } from '../../api/lib/audit/forensics.js';

describe('canonicalTradition — the model names the tradition, code resolves the spelling', () => {
  it.each([
    ['Hinduism', 'Hindu'], ['Christianity', 'Christian'], ['zoroastrianism', 'Zoroastrian'], ['Taoism', 'Tao'], ['Sikhism', 'Sikh'],
    ['Muslim', 'Islam'], ['the Bahá’í Faith', "Baha'i"], ['Bahai', "Baha'i"], ['buddhist', 'Buddhist'], ['JUDAISM', 'Judaism'],
  ])('%s → %s', (name, stored) => expect(canonicalTradition(name)).toBe(stored));
  it('a stored value, an unknown name and an empty one pass through', () => {
    expect(canonicalTradition('Jain')).toBe('Jain');
    expect(canonicalTradition('Shinto')).toBe('Shinto');
    expect(canonicalTradition('')).toBe('');
  });
});

describe('the passage searches filter on the stored religion value', () => {
  it('fused_search: a religion-name tradition reaches the engine as the stored value', async () => {
    const fastSearch = vi.fn(async () => []);
    await tools.run('fused_search', { query: 'the self is its own refuge', tradition: 'Hinduism' }, { fastSearch });
    expect(fastSearch.mock.calls[0][1]).toBe('Hindu');
  });
  it('the shared filters: filters.tradition is resolved for every passage search', () => {
    expect(tools.engineFilters({ tradition: 'Christianity', language: 'en' })).toEqual({ religion: 'Christian', language: 'en' });
  });
});

describe('a blank required input is refused, never run', () => {
  it.each([
    ['document_search', { title: '  ' }],
    ['fused_search', { query: '' }],
    ['original_lookup', { english: '\n' }],
    ['web_search', {}],
  ])('%s %j → empty_input, the engine never called', async (name, input) => {
    const fastSearch = vi.fn(async () => []), findTitled = vi.fn(async () => null);
    await expect(tools.run(name, input, { fastSearch, deps: { findTitled } })).rejects.toMatchObject({ code: 'empty_input' });
    expect(fastSearch).not.toHaveBeenCalled();
    expect(findTitled).not.toHaveBeenCalled();
  });
  it('a real title still runs', async () => {
    const findTitled = vi.fn(async () => null);
    await tools.run('document_search', { title: 'Tablets of the Divine Plan' }, { deps: { findTitled } });
    expect(findTitled).toHaveBeenCalledWith(['Tablets of the Divine Plan']);
  });
});

describe('forensics: a research step is judged by its own count, with the words its tool takes', () => {
  const turn = (steps) => turnFromPath({ question: 'q', reply: 'r', path: { plan: { research: { steps } }, evidence: [{ title: 'W', url: 'https://o/w' }] } });
  it('document_search reads its title; a later step that found works is not a zero-hit search', () => {
    const t = turn([{ tool: 'fused_search', found: 6, args: { query: 'the station of the true seeker' } },
      { tool: 'document_search', found: 2, args: { title: 'Seven Valleys' } },
      { tool: 'original_lookup', found: 1, args: { english: 'The steed of this Valley is patience' } }]);
    expect(t.searches.map((s) => s.query)).toEqual(['the station of the true seeker', 'Seven Valleys', 'The steed of this Valley is patience']);
    expect(t.searches.flatMap((s) => assessSearch(s).defects.map((d) => d.class))).not.toContain('zero-hits');
  });
  it('a step that found nothing is still a zero-hit search, even as the first step', () => {
    const t = turn([{ tool: 'fused_search', found: 0, args: { query: 'the wheel of dharma', tradition: 'Buddhism' } },
      { tool: 'fused_search', found: 5, args: { query: 'the wheel of dharma' } }]);
    expect(assessSearch(t.searches[0]).defects.map((d) => d.class)).toContain('zero-hits');
    expect(assessSearch(t.searches[1]).defects.map((d) => d.class)).not.toContain('zero-hits');
  });
});
