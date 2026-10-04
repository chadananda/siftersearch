// Per-book attribution state machine: spans pending until evidence, written back; prose keeps the book author + quoted.
import { describe, it, expect } from 'vitest';
import { readBook, leadIn, trailingReference, inlineSpeakers, mixedLead, speakerOf } from '../../api/lib/authorship/reader.js';

const names = (r, id) => (r.paragraphs.find((p) => p.id === id)?.authors || []).map((a) => `${a.name}:${a.role}:${a.basis}`);

describe('evidence helpers', () => {
  it('lead-ins, trailing references and inline speakers', () => {
    expect(leadIn('In the Kitáb-i-Íqán, Bahá’u’lláh writes:')).toMatchObject({ speaker: 'Bahá’u’lláh' });
    expect(leadIn('He then wrote the following:')).toMatchObject({ speaker: null, pronoun: true });
    expect(leadIn('This was a long day.')).toBeNull();
    expect(trailingReference('These are the results of the divine advices. — ’Abdu’l-Bahá [BWF 353]')).toMatchObject({ name: '‘Abdu’l-Bahá', kind: 'dash' });
    expect(trailingReference('…dry in the sea.[^175] [175]: Bahá’u’lláh, Seven Valleys, p. 9.')).toMatchObject({ name: 'Bahá’u’lláh', kind: 'footnote' });
    expect(inlineSpeakers('As the Guardian wrote, “the hour is late”, and as ‘Abdu’l-Bahá said, “arise”.')).toEqual(['Shoghi Effendi', '‘Abdu’l-Bahá']);
  });
});

describe('readBook', () => {
  it('compilation: an extract stays pending until its trailer, then the trailer’s writer is written back', () => {
    const r = readBook({ author: 'Bahá’u’lláh', compilation: true }, [
      { id: 1, text: '**12. Burial**', isHeading: true },
      { id: 2, text: '"The body should be treated with honour."' },
      { id: 3, text: '"It should be buried within an hour’s journey."' },
      { id: 4, text: '(From a letter written on behalf of Shoghi Effendi, 1949)', trailer: { name: 'Shoghi Effendi', on_behalf: true } },
      { id: 5, text: '"Next extract with no trailer."' },
      { id: 6, text: '**13. Next**', isHeading: true },
    ]);
    expect(names(r, 2)).toEqual(['Shoghi Effendi:author:trailer']);
    expect(r.paragraphs.find((p) => p.id === 3).authors[0].on_behalf).toBe(true);
    expect(r.open.map((s) => s.ids)).toEqual([[5]]);            // no evidence → left for System-1, NOT the book author
  });
  it('compilation section heading names the writer of extracts without trailers', () => {
    const sec = { names: ['‘Abdu’l-Bahá'], role: 'author' };
    const r = readBook({ author: 'Bahá’u’lláh', compilation: true }, [{ id: 1, text: 'Extract one.', section: sec }, { id: 2, text: '— 2 —', isHeading: true }]);
    expect(names(r, 1)).toEqual(['‘Abdu’l-Bahá:author:section']);
  });
  it('prose: a lead-in naming the speaker makes the next paragraph a quotation; the one after is queued for a continuation check', () => {
    const r = readBook({ author: 'Adib Taherzadeh', compilation: false }, [
      { id: 1, text: 'In one of His Tablets Bahá’u’lláh writes:' },
      { id: 2, text: 'O My servants! Ye are the trees of My garden.' },
      { id: 3, text: 'And yet another passage, perhaps.' },
    ]);
    expect(names(r, 2)).toEqual(['Bahá’u’lláh:author:lead-in']);
    expect(names(r, 1)[0]).toBe('Adib Taherzadeh:author:book');
    expect(r.checks.map((c) => c.id)).toEqual([3]);
  });
  it('prose: a source-linked run is the source author’s; plain prose keeps the book author with inline quotations', () => {
    const r = readBook({ author: 'Adib Taherzadeh', compilation: false }, [
      { id: 1, text: 'Block one of the Tablet.', source: { author: 'Bahá’u’lláh', coverage: 0.95 } },
      { id: 2, text: 'Block two of the Tablet.', source: { author: 'Bahá’u’lláh', coverage: 0.9 } },
      { id: 3, text: 'Here, as the Master said, “love is the light”, the author reflects.', source: { author: 'Shoghi Effendi', coverage: 0.3 } },
      { id: 4, text: 'A quoted line. — ’Abdu’l-Bahá [SWAB 2]' },
    ]);
    expect(names(r, 1)).toEqual(['Bahá’u’lláh:author:source_link']);
    expect(names(r, 2)).toEqual(['Bahá’u’lláh:author:source_link']);
    expect(names(r, 3)).toEqual(['Adib Taherzadeh:author:book', '‘Abdu’l-Bahá:quoted:inline', 'Shoghi Effendi:quoted:source_link']);
    expect(names(r, 4)).toEqual(['‘Abdu’l-Bahá:author:reference']);   // closing “— Name”: the whole paragraph is the quotation
  });
  it('prose: a footnote reference inside ordinary prose cites an INLINE quotation — the book author stays the writer', () => {
    const r = readBook({ author: 'Udo Schaefer', compilation: false }, [{ id: 1, text: 'As He teaches, love conquers fear.[^7] [7]: Bahá’u’lláh, Seven Valleys, p. 9.' }]);
    expect(names(r, 1)).toEqual(['Udo Schaefer:author:book', 'Bahá’u’lláh:quoted:reference']);
  });
  it('ordinary book: a trailer claims only the ONE quotation above it; unnamed trailers end compilation extracts', () => {
    const r = readBook({ author: 'Howard Colby Ives', compilation: false }, [
      { id: 1, text: 'I remember the evening well.' },
      { id: 2, text: 'O Son of Being! Thy heart is My home.' },
      { id: 3, text: '(Bahá’u’lláh, The Hidden Words)', trailer: { name: 'Bahá’u’lláh' } },
    ]);
    expect(names(r, 1)).toEqual(['Howard Colby Ives:author:book']);
    expect(names(r, 2)).toEqual(['Bahá’u’lláh:author:trailer-prev']);
    const c = readBook({ author: 'Bahá’u’lláh', compilation: true }, [
      { id: 1, text: 'A Tablet passage.', section: { names: ['‘Abdu’l-Bahá'] } },
      { id: 2, text: '(From a Tablet — translated from the Persian)', trailer: { name: null } },
      { id: 3, text: 'Next extract.' },
      { id: 4, text: '(Shoghi Effendi, letter)', trailer: { name: 'Shoghi Effendi' } },
    ]);
    expect(names(c, 1)).toEqual(['‘Abdu’l-Bahá:author:section']);      // did NOT run on into the next extract
    expect(names(c, 3)).toEqual(['Shoghi Effendi:author:trailer']);
  });

  it('mixedLead: prose before the first quotation mark makes a paragraph mixed; a numbered or bare quotation is whole', () => {
    expect(mixedLead('Calling this “the King of Days”, Bahá’u’lláh again appeals to the people of the world: “Say: O people!”')).toBe(true);
    expect(mixedLead('[185] In the Lawḥ-i-Ra’ís He actually and categorically prophesies: “Erelong will God raise up…”')).toBe(true);
    expect(mixedLead('[55] “By the righteousness of God! It is not Our wish to lay hands on your kingdoms.”')).toBe(false);
    expect(mixedLead('And: “Bestir yourselves, O people, in anticipation of the days of Divine justice.”')).toBe(false);
    expect(mixedLead('kings appeared more ephemeral than a spider’s web… The celebrations')).toBe(false);
  });

  it('speakerOf: the name attached to the last speech verb, not the first name in the sentence', () => {
    expect(speakerOf('a year coinciding with the Declaration of Bahá’u’lláh in Baghdád. Here is what the Báb wrote:')).toBe('The Báb');
    expect(speakerOf('In a Tablet to the Báb’s uncle, writes Bahá’u’lláh:')).toBe('Bahá’u’lláh');
    expect(speakerOf('Speaking of Mírzá Ja‘far, ‘Abdu’l-Bahá has recounted the following story:')).toBe('‘Abdu’l-Bahá');
  });
  it('trailingReference ignores names inside link URLs', () => {
    expect(trailingReference('And Jesus returned from Jordan.\\[[50](http://bahai-library.com/balyuzi_Bahá’u’lláh_brief_life&chapter=3#1)\\]')).toBe(null);
  });

  it('a speaker heading assigns the talk under it to the speaker, until the next heading', () => {
    const r = readBook({ author: 'Frances Orr Allen', compilation: false }, [
      { id: 1, text: 'READING BY REV. BRADFORD LEAVITT', isHeading: true, byline: 'Rev. Bradford Leavitt' },
      { id: 2, text: 'For our lesson this morning I will read first from the Hindu scripture.' },
      { id: 3, text: 'ADDRESS BY ‘ABDU’L-BAHÁ', isHeading: true, byline: '‘Abdu’l-Bahá' },
      { id: 4, text: 'Praise be to God, this is a good meeting.' },
      { id: 5, text: 'THE NEXT DAY', isHeading: true },
      { id: 6, text: 'Dr. Allen asked if he were not tired.' },
    ]);
    expect(names(r, 2)).toEqual(['Rev. Bradford Leavitt:author:byline']);
    expect(names(r, 4)).toEqual(['‘Abdu’l-Bahá:author:byline']);
    expect(names(r, 6)).toEqual(['Frances Orr Allen:author:book']);
  });
  it('a dash reference names a writer only when the name OPENS the segment', () => {
    expect(trailingReference('To the maid-servant of God, Ruth Klos, Kansas— Upon her be Bahá’u’lláh El-Abhá!')).toBe(null);
    expect(trailingReference('The soul is a sign of God. — ‘Abdu’l-Bahá [SWAB 2]')).toEqual({ name: '‘Abdu’l-Bahá', kind: 'dash' });
  });
});

import { isTrailer } from '../../api/lib/authorship/trailers.js';
describe('bare attribution lines', () => {
  it('"—Bahá’u’lláh" under an extract is a trailer; other dash lines are not', () => {
    expect(isTrailer('—Bahá’u’lláh')).toBe(true);
    expect(isTrailer('_—‘Abdu’l-Bahá_')).toBe(true);
    expect(isTrailer('—to be continued')).toBe(false);
  });
});

import { speakerOf } from '../../api/lib/authorship/reader.js';
describe('speakerOf: a figure is the speaker only as the speech verb\'s subject', () => {
  const cases = [
    ['Katherine, who was only 9, wrote to the Master on the same day as her older sister:', null],
    ['The Chicago Inter-Ocean said, "WORLD HARMONY IS AIM OF ‘ABDU’L-BAHÁ":', null],
    ['A famous playwright, when he came from the room of ’Abdu’l-Bahá, declared:', null],
    ['While Louis was on pilgrimage ’Abdu’l-Bahá wrote to Charles Mason Remey, a white Bahá’í in Washington DC:', '‘Abdu’l-Bahá'],
    ['In one of His Tablets to Ibn-i-Asdaq, Bahá’u’lláh reveals these celebrated Words:', 'Bahá’u’lláh'],
    ['Bahá’u’lláh, in His Tablet to the Pope, writes:', 'Bahá’u’lláh'],
    ['In the late 1920s Shoghi Effendi wrote to her:', 'Shoghi Effendi'],
    ['the following words of ’Abdu’l-Bahá are illuminating:', '‘Abdu’l-Bahá'],
    ['Speaking of these companions, Nabíl has recorded the following:', null],
    ['...’s Christian friends challenged the truth of Bahá’u’lláh by the following argument:', null],
  ];
  for (const [text, want] of cases) it(text.slice(0, 50), () => expect(speakerOf(text)).toBe(want));
});

import { bylineSpeaker } from '../../api/lib/authorship/trailers.js';
describe('talk records: the interpreter is never the speaker', () => {
  it('interpreter / stenographic headings mark ‘Abdu’l-Bahá’s talk', () => {
    expect(bylineSpeaker('Dr. Ameen U. Faríd, Interpreter')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('Mírzá Aḥmad Sohrab, Interpreter')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('Translated by Mírzá Aḥmad Sohrab from his Persian notes')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('Interpreter —? You are all welcome, exceedingly welcome.')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('Talk of ’Abdu’l-Bahá, given at 51 Grosse Bldg., Los Angeles')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('San Francisco, Sunday evening, October 13, 1912')).toBe(null);
  });
  it('a talk runs from the interpreter heading to the next heading', () => {
    const r = readBook({ author: 'Frances Orr Allen', compilation: false }, [
      { id: 1, text: 'Oakland, 3 P. M., October 3, 1912', isHeading: true },
      { id: 2, text: 'Dr. Ameen U. Faríd, Interpreter', isHeading: true, byline: '‘Abdu’l-Bahá' },
      { id: 3, text: 'Praise be to God, this is a good meeting.' },
      { id: 4, text: 'San Francisco, October 10, 1912', isHeading: true },
      { id: 5, text: 'Interpreter —? You are all welcome, exceedingly welcome.', byline: '‘Abdu’l-Bahá' },
      { id: 6, text: 'Then the Master rose to leave.' },
    ]);
    expect(names(r, 3)).toEqual(['‘Abdu’l-Bahá:author:byline']);
    expect(names(r, 5)).toEqual(['‘Abdu’l-Bahá:author:byline']);
  });
});

import { dialogueSpeaker } from '../../api/lib/authorship/trailers.js';
describe('talk headings and interview transcripts', () => {
  it('a heading naming the speaker anywhere, incl. "A.B."', () => {
    expect(bylineSpeaker('Good-by! Good-by! TALK BY ‘ABDU’L-BAHÁ')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('EXCERPT FROM AN ADDRESS BY ‘ABDU’L-BAHÁ')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('Message from A.B. to the Japanese boys in Portland through Mrs. Latimer')).toBe('‘Abdu’l-Bahá');
    expect(bylineSpeaker('INTRODUCTORY REMARKS BY CHAIRMAN W. J. WALTERS')).toBe('Chairman W. J. Walters');
    expect(bylineSpeaker('Dictated to Miss Bijou Straun')).toBe('‘Abdu’l-Bahá');
  });
  it('Q&A lines carry their own speaker', () => {
    expect(dialogueSpeaker('’Abdu’l-Bahá. No, no one will give up his affiliation with his own religion')).toEqual({ name: '‘Abdu’l-Bahá' });
    expect(dialogueSpeaker('Mr. Lawson. Then you are not claiming to have any divine revelations')).toEqual({ name: null, other: true });
    expect(dialogueSpeaker('The Master spoke of the sea.')).toBe(null);
  });
});

describe('a venue heading under a speaker heading keeps the speaker', () => {
  it('ADDRESS BY ‘ABDU’L-BAHÁ / UNITARIAN CHURCH, PALO ALTO', () => {
    const r = readBook({ author: 'Frances Orr Allen', compilation: false }, [
      { id: 1, text: 'ADDRESS BY ‘ABDU’L-BAHÁ', isHeading: true, byline: '‘Abdu’l-Bahá' },
      { id: 2, text: 'UNITARIAN CHURCH, PALO ALTO, CALIFORNIA', isHeading: true },
      { id: 3, text: 'We must not hate a child just because he is a child.' },
      { id: 4, text: 'THE NEXT DAY', isHeading: true },
      { id: 5, text: 'The friends gathered at the Goodall home.' },
    ]);
    expect(names(r, 3)).toEqual(['‘Abdu’l-Bahá:author:byline']);
    expect(names(r, 5)).toEqual(['Frances Orr Allen:author:book']);
  });
});

describe('standard abbreviation trailers', async () => {
  const { trailingReference } = await import('../../api/lib/authorship/reader.js');
  it('a closing quotation + a known abbreviation and page names the writer', () => {
    expect(trailingReference('"The names and attributes of God require the existence of beings." SAQ 281')?.name).toBe('‘Abdu’l-Bahá');
    expect(trailingReference('"Nay, loftiness and sublimity are themselves the creations of His Word." GWB 141-2')?.name).toBe('Bahá’u’lláh');
    expect(trailingReference('"My eternity is My creation, I have created it for thee." AHW #64')?.name).toBe('Bahá’u’lláh');
  });
  it('multi-author collections, unknown codes and uncited prose name nobody', () => {
    expect(trailingReference('"The Guardian has stated that…" LG 85')).toBeNull();
    expect(trailingReference('"…according to their states."146')).toBeNull();
    expect(trailingReference('This is discussed at length in SAQ 146')).toBeNull();
  });
});
