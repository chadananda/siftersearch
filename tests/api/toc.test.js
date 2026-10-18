// Inferred structure: candidate heading lines, sections built only from picked real lines, and the checks.
import { describe, it, expect } from 'vitest';
import { headingCandidates, sectionsFromPicks, checkSections } from '../../api/lib/toc.js';

const rows = [
  'CONTENTS', 'BOOK VI', 'BUDDHISM OUTSIDE INDIA', 'This chapter treats of the expansion of Indian influence across Asia over many centuries.',
  'XXXIV. EXPANSION OF INDIAN INFLUENCE', 'The influence of India spread eastward with its merchants.', '[pg 12]',
  'XXXV. CEYLON', 'Ceylon received Buddhism under Asoka.', 'BOOK VII', 'LV. INFLUENCE OF CHRISTIANITY IN INDIA', 'Christian missions arrived early.',
  'QUESTION 1', 'FIRST ARTICLE [II-II, Q. 1, Art. 1]', 'باب الطهارة', 'He said that the soul, which is immortal, travels on.',
].map((text, i) => ({ id: 100 + i, paragraph_index: i, text }));

describe('inferred structure', () => {
  it('candidates: short titles and marked divisions; not sentences, not page markers', () => {
    const c = headingCandidates(rows).map((x) => x.i);
    expect(c).toEqual(expect.arrayContaining([1, 2, 4, 7, 9, 10, 12, 13, 14]));
    expect(c).not.toContain(3); expect(c).not.toContain(5); expect(c).not.toContain(6); expect(c).not.toContain(15);
  });
  it('sections nest by level and run to the next pick at the same or a higher level; unknown lines are ignored', () => {
    const s = sectionsFromPicks([{ i: 1, level: 1, title: 'Book VI' }, { i: 4, level: 2 }, { i: 7, level: 2 }, { i: 9, level: 1, title: 'Book VII' }, { i: 10, level: 2 }, { i: 999, level: 1 }], rows);
    expect(s.map((x) => [x.title, x.start_index, x.end_index])).toEqual([['Book VI', 1, 8], ['XXXIV. EXPANSION OF INDIAN INFLUENCE', 4, 6],
      ['XXXV. CEYLON', 7, 8], ['Book VII', 9, 15], ['LV. INFLUENCE OF CHRISTIANITY IN INDIA', 10, 15]]);
    expect(s[0]).toMatchObject({ paragraphs: 8, first_para_id: 101 });
  });
  it('checks: too few sections, a late start, poor coverage', () => {
    expect(checkSections(sectionsFromPicks([{ i: 14, level: 1 }], rows), rows)).toEqual(['only 1 sections', 'first section starts after 30% of the book', 'top-level sections cover 13% of the book']);
    expect(checkSections(sectionsFromPicks([{ i: 1, level: 1 }, { i: 4, level: 2 }, { i: 9, level: 1 }], rows), rows)).toEqual([]);
  });
});

describe('inferStructure', async () => {
  const { inferStructure } = await import('../../api/lib/ops/structure-infer-job.js');
  it('the model picks by paragraph number; numbers not in the candidate list are dropped', async () => {
    const create = async () => ({ choices: [{ message: { content: JSON.stringify({ headings: [{ i: 1, level: 1, title: 'Book VI' }, { i: 4, level: 2, title: 'XXXIV. Expansion' }, { i: 3, level: 2, title: 'invented' }, { i: 9, level: 1, title: 'Book VII' }] }) } }] });
    const r = await inferStructure({ title: 'Hinduism and Buddhism' }, rows, { create });
    expect(r.sections.map((s) => s.title)).toEqual(['Book VI', 'XXXIV. Expansion', 'Book VII']);
    expect(r.issues).toEqual([]);
  });
  it('a reply cut off by length is split and asked again; nothing is lost', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i, paragraph_index: i, text: `CHAPTER ${i + 1}` }));
    let n = 0;
    const create = async (role, { messages }) => {
      n++;
      const idx = [...messages[0].content.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
      if (idx.length > 30) return { choices: [{ finish_reason: 'length', message: { content: '{"headings":[{"i":0' } }] };
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ headings: idx.map((i) => ({ i, level: 1, title: `Chapter ${i + 1}` })) }) } }] };
    };
    const r = await inferStructure({ title: 'x' }, many, { create });
    expect(r.sections).toHaveLength(60);
    expect(n).toBe(3);
  });
});
