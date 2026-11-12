// Widget greetings: live library facts filled from the stats snapshot; a missing fact drops its sentence.
import { describe, it, expect } from 'vitest';
import { fillFacts } from '../../api/lib/library/library-stats.js';

describe('fillFacts', () => {
  it('fills rounded facts', () => {
    expect(fillFacts('I have read {paragraphs} paragraphs. I know {people} people.', { paragraphs: 10_234_567, people: 41_873 }))
      .toBe('I have read 10.2 million paragraphs. I know 41,000 people.');
  });
  it('drops a sentence whose fact is missing, keeps the rest', () => {
    expect(fillFacts("Hi, I'm Anís. I know {people} people.", { paragraphs: 5 })).toBe("Hi, I'm Anís.");
  });
});
