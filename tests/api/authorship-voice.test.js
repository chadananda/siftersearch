// The one-line voice note the enrichment stages read (api/lib/authorship/voice.js).
import { describe, it, expect } from 'vitest';
import { voiceLine, voiceOf } from '../../api/lib/authorship/voice.js';

const j = (x) => JSON.stringify(x);
describe('voiceLine', () => {
  it('says nothing for the book author speaking with no quotes', () => {
    expect(voiceLine({ authors: j([{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }]), author: 'Nabil Zarandi' })).toBe('');
    expect(voiceLine({ authors: null, author: 'X' })).toBe('');
  });
  it('names a quoted writer and the book that quotes them', () => {
    expect(voiceLine({ authors: j([{ name: 'Queen Marie of Rumania', role: 'author', basis: 'window' }]), author: 'Rúḥíyyih Rabbání' }))
      .toBe('VOICE: Queen Marie of Rumania (quoted in this book by Rúḥíyyih Rabbání)');
  });
  it('marks on-behalf letters and lists who is quoted', () => {
    expect(voiceLine({ authors: j([{ name: 'Shoghi Effendi', role: 'author', basis: 'window', on_behalf: true }, { name: 'Bahá’u’lláh', role: 'quoted', basis: 'window' }]), author: 'Shoghi Effendi' }))
      .toBe('VOICE: Shoghi Effendi (written on their behalf) · quotes / cites: Bahá’u’lláh');
    expect(voiceLine({ authors: j([{ name: 'Nabil Zarandi', role: 'author', basis: 'book' }, { name: 'The Báb', role: 'quoted', basis: 'window' }]), author: 'Nabil Zarandi' }))
      .toBe('VOICE: Nabil Zarandi (the book’s author) · quotes / cites: The Báb');
  });
  it('flags attribution lines', () => {
    expect(voiceLine({ authors: j([{ name: 'Shoghi Effendi', role: 'reference', basis: 'trailer' }]), author: 'Compilation' })).toMatch(/^VOICE: an attribution/);
  });
  it('gives the fields too', () => {
    expect(voiceOf({ authors: j([{ name: 'Shoghi Effendi', role: 'author', basis: 'window', on_behalf: true }, { name: 'Bahá’u’lláh', role: 'quoted' }]), author: 'X' }))
      .toEqual({ speaker: 'Shoghi Effendi', fromBook: false, onBehalf: true, quoted: ['Bahá’u’lláh'], referenceLine: false });
  });
});
