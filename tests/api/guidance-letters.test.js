// Current guidance (guidance.js), battery 11-10 "sample-guidance": a volume of letters is dated by its range (never its
// publication year), a title-only hit is read on into the letter, and the House's words quoted in a compilation go back to
// the House's own published message (own-source.js `writers`).
import { describe, it, expect } from 'vitest';
import { currentGuidance, dateOf, letterDate } from '../../api/lib/assistant/guidance.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';

const UHJ = 'Universal House of Justice';
const msgs = [{ role: 'user', content: 'What has the Universal House of Justice said about the role of youth in the community?' }];
const LETTER = 'Youth can move the world. Your energies are needed now in every community, while still young and unburdened.';

describe('guidance: dating a volume of letters', () => {
  it('a year range in the title dates the letter by the range, not the publication year', () => {
    expect(dateOf({ title: 'Messages from the Universal House of Justice: 1986-2001', year: 2009 })).toBe('1986–2001');
    expect(dateOf({ year: 1985 })).toBe('1985');
  });
  it('the letter’s own date line narrows the range; a date outside it does not', () => {
    expect(letterDate('Responsibilities of Youth\n8 January 2001\nTo the Bahá’í Youth', '1986–2001')).toBe('8 January 2001');
    expect(letterDate('written 3 March 2009', '1986–2001')).toBeNull();
  });
});

describe('guidance: read on, cite the message', () => {
  it('a title-only hit is read on into its letter; a compilation quoting the House gives its slot to the published message', async () => {
    const heading = { id: 1, text: 'Responsibilities of Youth in the Bahá’í Community', document_id: 366, paragraph_index: 40, author: UHJ, book_author: UHJ, title: 'Messages from the Universal House of Justice: 1986-2001' };
    const quoted = { id: 2, text: LETTER, document_id: 20804, paragraph_index: 9, author: UHJ, book_author: 'Helen Hornby', title: 'Lights of Guidance', source_url: 'https://oceanoflights.org/lights-of-guidance/#:~:text=x' };
    const published = { id: 3, text: LETTER, document_id: 202, paragraph_index: 77, author: UHJ, book_author: UHJ, title: 'Messages from the Universal House of Justice 1963-86', source_url: 'https://oceanlibrary.com/messages-1963-86/?paraId=p77' };
    const around = async (doc, idx) => (doc === 366 && idx === 40 ? [{ paragraph_index: 41, text: '8 January 2001' }, { paragraph_index: 42, text: 'Dearly loved friends, the youth are called to arise.' }] : []);
    const searched = [];
    const out = await currentGuidance({ messages: msgs, query: 'youth', decisions: decisionLog(), search: async () => ({ passages: [heading, quoted] }),
      deps: { listDocs: async () => ({ docs: [{ id: 366, title: heading.title, year: 2009 }, { id: 202, title: published.title }] }), getParagraphsAround: around,
        ownSource: { search: async (span, f) => { searched.push(f.author); return [published]; }, link: async (h) => h } } });
    const lead = out.passages.find((p) => p.document_id === 366);
    expect(lead.heading).toBe(heading.text);
    expect(lead.text).toMatch(/youth are called to arise/);
    expect(lead.theme).toBe('8 January 2001');
    expect(searched).toEqual([UHJ]);
    expect(out.passages.find((p) => p.text === LETTER).source_url).toMatch(/oceanlibrary\.com/);
    expect(out.passages.map((p) => p.theme)).not.toContain('2009');
  });
});
