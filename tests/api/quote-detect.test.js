// detectQuotation: deterministic "the user gave us wording to find" rule, independent of Jev.
import { describe, it, expect } from 'vitest';
import { detectQuotation, isMeaningQuestion, stripMarkup } from '../../api/lib/quote-detect.js';

describe('detectQuotation', () => {
  it('the incident: a find-the-quote request with a quoted span', () => {
    const q = detectQuotation('can you find the quote including  "but it will always be present as a necessary element"');
    expect(q.phrase).toBe('but it will always be present as a necessary element');
    expect(q.via).toBe('quoted');
  });
  it('curly quotes and guillemets count', () => {
    expect(detectQuotation('who said “the earth is but one country”?').phrase).toBe('the earth is but one country');
    expect(detectQuotation('where is «hatred is never ended by more hatred»').phrase).toBe('hatred is never ended by more hatred');
  });
  it('a find/source frame with an unquoted phrase', () => {
    const q = detectQuotation('where is the passage that says the earth is but one country');
    expect(q.phrase).toBe('the earth is but one country');
    expect(q.via).toBe('frame');
    expect(detectQuotation('find the quote: so powerful is the light of unity').phrase).toBe('so powerful is the light of unity');
  });
  it('a short quoted span (under 4 words) is not a quotation', () => {
    expect(detectQuotation('what does "the Greatest Name" mean')).toBe(null);
  });
  it('apostrophes in names are not quotes', () => {
    expect(detectQuotation("what did Bahá'u'lláh and 'Abdu'l-Bahá say about unity of mankind and peace")).toBe(null);
  });
  it('a plain topic question is not a quotation', () => {
    expect(detectQuotation('what is taught about the soul after death')).toBe(null);
    expect(detectQuotation('find the quote')).toBe(null);
    expect(detectQuotation('')).toBe(null);
  });
  it('asking for MORE of an author\'s words that elaborate on an idea is a theme, not a wording hunt (r4)', () => {
    expect(detectQuotation("I recall Shoghi Effendi saying the Manifestations are all 'one soul and the same person' — can you find more quotes or works where he elaborates on this?")).toBe(null);
    // a real quotation in double quotes still is one
    expect(detectQuotation('find more passages like "the earth is but one country and mankind its citizens"')?.via).toBe('quoted');
  });
  // r5 (11-01 conversation harness): follow-ups quoting ANÍS'S OWN earlier words were hunted as wordings to find —
  // "does Shoghi Effendi really write 'without a veil to signal that a new era had begun'?" answered honest_absence.
  it('a span the assistant itself said earlier in the thread is not wording to find', () => {
    const said = ['She appeared without a veil to signal that a new era had begun, as *God Passes By* recounts.'];
    expect(detectQuotation('you said she appeared "without a veil to signal that a new era had begun", does Shoghi Effendi really write this?', { said })).toBe(null);
    // the same span with no such history is still a hunt
    expect(detectQuotation('does Shoghi Effendi really write "without a veil to signal that a new era had begun"?')?.via).toBe('quoted');
    // another quoted span the assistant never said is still found
    expect(detectQuotation('you said "a new era had begun" but where is "the trumpet blast of a new day"?', { said: ['a new era had begun'] })?.phrase).toBe('the trumpet blast of a new day');
  });
  it('an etymology, meaning or comparison question is never a quote hunt', () => {
    const t = 'You said al-insāf comes from the root n-ṣ-f — does that sense shape the "turn not away from it" in the Hidden Word itself?';
    expect(isMeaningQuestion(t)).toBe(true);
    expect(detectQuotation(t)).toBe(null);
    expect(detectQuotation('How is "the knowledge of God which comes to the heart of man" different from what Hooper Dunbar says?')).toBe(null);
    expect(isMeaningQuestion('can you find the quote including "but it will always be present as a necessary element"')).toBe(false);
  });
  it('markup is stripped before detection (a reader message carried 890 chars of <br>)', () => {
    expect(stripMarkup('is it <b>yours</b>?\n\n\n<br>\n\n<br>  ok')).toBe('is it yours? ok');
  });
});
