// slug-metadata report: locator title/author → what the book prints; byline first, title page via the role, surname must corroborate.
import { describe, it, expect } from 'vitest';
import { slugMetadataJob, slugSurname, slugAuthor } from '../../api/lib/ops/slug-metadata-job.js';
import { authorFromText } from '../../api/lib/text/source-metadata.js';

const reply = (j) => async () => ({ choices: [{ message: { content: JSON.stringify(j) } }] });
const run = (rows, texts, create) => slugMetadataJob({}, { gaps: async () => rows, paragraphs: async (id) => [{ text: texts[id] }], create });

describe('slug-metadata', () => {
  it('slug surnames: locators and bare surnames carry one; generic slugs do not', () => {
    expect(slugSurname('pdf-h-holley')).toBe('holley');
    expect(slugSurname('pdf-a-armstrong-ingram')).toBe('armstrong');
    expect(slugSurname('bayat')).toBe('bayat');
    expect(slugSurname('newspaper')).toBe(null);
    expect(slugSurname('pdf-journal-de-constantinople-ocr-ed')).toBe(null);
    expect(slugAuthor('pdf-h-holley') && slugAuthor('bayat') && !slugAuthor('Horace Holley')).toBe(true);
  });
  it('a BY line with the name on the next line is a byline', () => {
    expect(authorFromText('THE MODERN SOCIAL RELIGION\nBY\nHORACE HOLLEY\nLONDON', { expectSurname: 'holley' })).toBe('HORACE HOLLEY');
  });
  it('byline found → no LLM call; title page via the role otherwise; a non-corroborating author goes to review', async () => {
    let calls = 0;
    const create = async (...a) => { calls++; return reply({ title: 'A Study Guide', author: 'Someone Else', kind: 'book', printed: true })(...a); };
    const rows = [{ id: 1, title: 'smith_world_order_essays', author: 'pdf-s-smith' }, { id: 2, title: 'Study Guide', author: 'bayat' }];
    const texts = { 1: 'World Order Essays\nBy Jane Smith\n' + 'text '.repeat(40), 2: 'A STUDY GUIDE\n' + 'text '.repeat(40) };
    const r = await run(rows, texts, create);
    expect(calls).toBe(1);
    expect(r.proposals[0]).toMatchObject({ id: 1, author: 'Jane Smith', title: 'World Order Essays', source: 'byline', review: [] });
    expect(r.proposals[1].author).toBe('Someone Else');
    expect(r.proposals[1].review).toContain("author lacks the locator surname 'bayat'");
    expect(r.ready).toBe(1);
  });
  it('a newspaper page with no byline keeps author unknown (review), with its publication', async () => {
    const r = await run([{ id: 3, title: 'x', author: 'newspaper' }], { 3: 'THE CLEVELAND ADVOCATE ' + 'news '.repeat(40) },
      reply({ title: 'The Cleveland Advocate, 6 March 1920', author: null, kind: 'newspaper', publication: 'The Cleveland Advocate', printed: true }));
    expect(r.proposals[0]).toMatchObject({ title: 'The Cleveland Advocate, 6 March 1920', author: null, publication: 'The Cleveland Advocate' });
    expect(r.proposals[0].review).toContain('author unknown');
  });
});
