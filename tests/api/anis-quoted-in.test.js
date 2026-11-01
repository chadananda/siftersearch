// r5 (11-01 conversation harness): a Bahá'í World article's paragraph, carrying a paragraph author of Bahá'u'lláh, was called
// "an authorized text" by Bahá'u'lláh. Attribution comes from paragraph AND book authorship: a paragraph quoted in a
// secondary book is that book's report, classed by the book, and the prompt names both.
import { describe, it, expect } from 'vitest';
import { passageAuthority, quotedIn, toFindings } from '../../api/lib/assistant/findings.js';
import { anisUserPayload } from '../../api/lib/assistant/prompt.js';

const BW = { source_title: 'The Bahá’í World, Volume VIII', source_author: 'Bahá’u’lláh', religion: "Baha'i", collection: "Bahá'í World",
  book_author: 'National Spiritual Assembly of the Baha’is of the United States and Canada', text: 'When the veils of illusion…', citation_url: 'https://x/bw8' };
const GL = { source_title: 'Gleanings', source_author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: "Baha'i", text: 'x' };
const PDC = { source_title: 'The Promised Day is Come', source_author: 'Bahá’u’lláh', book_author: 'Shoghi Effendi', religion: "Baha'i", text: 'x' };

describe('quoted-in attribution', () => {
  it('detects a paragraph whose author is not the book\'s', () => {
    expect(quotedIn(BW)).toBe(true);
    expect(quotedIn(GL)).toBe(false);
    expect(quotedIn({ source_author: 'The Báb', book_author: null })).toBe(false);
    expect(quotedIn({ source_author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh, The Báb, ‘Abdu’l-Bahá' })).toBe(false);
  });
  it('a paragraph quoted in a secondary book is never scripture or authorized interpretation', () => {
    const a = passageAuthority(BW);
    expect(['B1_REVEALED', 'B2_AUTH_INTERPRETATION']).not.toContain(a.class);
    expect(a.name).toMatch(/quoting Bahá’u’lláh$/);
    expect(toFindings({ retrieved: [BW] })[0].authority.class).toBe(a.class);
  });
  it('a Writings or interpretation volume keeps the paragraph\'s own class', () => {
    expect(passageAuthority(GL).class).toBe('B1_REVEALED');
    expect(passageAuthority(PDC).name).not.toMatch(/quoting/);   // an interpretation volume: unchanged
  });
  it('the prompt names the book\'s author for a quoted paragraph', () => {
    const out = anisUserPayload({ question: 'q', passages: [BW] });
    expect(out).toContain('Bahá’u’lláh, as quoted in this work by National Spiritual Assembly');
  });
});
