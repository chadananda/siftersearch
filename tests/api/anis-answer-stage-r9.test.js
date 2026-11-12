// r9 answer-stage fixes: one category per describe (false absence, capitulation, misattribution/stitching, numbers from
// memory, cut and dangling replies). Each pins the code path that caused the r8-r6-after replay defects.
import { describe, it, expect } from 'vitest';
import { HOUSE_STYLE, STANCE_NOTES, displayName, passageHeader, anisUserPayload, PASSAGE_CHARS, soul } from '../../api/lib/assistant/prompt.js';
import { conversationSummary, PUSHBACK_HOW } from '../../api/lib/assistant/respond.js';
import { unverifiedQuotes, dropUnverified, trimCutReply, completeIntroducedQuotes } from '../../api/lib/assistant/quotes.js';

describe('false absence (A)', () => {
  it('the house style forbids library-wide absence claims and asks for every passage to be read first', () => {
    expect(HOUSE_STYLE).toMatch(/ABSENCE IS CHECKED, NEVER ASSUMED/);
    expect(HOUSE_STYLE).not.toMatch(/couldn't find anything on that in the texts I can search/);   // the old template invited it
  });
  it('an all-removed reply does not claim the library lacks it', () => {
    const r = dropUnverified('He wrote “these words appear in no passage at all anywhere”.', [{ text: 'other words entirely' }]);
    expect(r.text).toMatch(/in this search/);
    expect(r.text).not.toMatch(/in the library/);
  });
});

describe('capitulation on pushback (B)', () => {
  const long = `Gleanings opens with praise. ${'The passage goes on at length about detachment and the soul. '.repeat(14)}Finally it says the soul is a sign of God.`;
  const msgs = [
    { role: 'user', content: 'What does Gleanings say about the soul?' },
    { role: 'assistant', content: long },
    { role: 'user', content: 'Thanks. And the Hidden Words?' },
    { role: 'assistant', content: `See [Hidden Words](https://oceanlibrary.com/hw#1). ${'More on the heart. '.repeat(10)}` },
    { role: 'user', content: 'You said Gleanings calls the soul a ray of the sun — where?' },
  ];
  it('earlier replies are kept long enough to check what was said (was 400 chars), links read as their text (no "[linked]" marker the writer could echo)', () => {
    const s = conversationSummary(msgs, 'Anís');
    expect(s).toContain('Finally it says the soul is a sign of God');   // past char 400 of an EARLIER reply
    expect(s).toContain('See Hidden Words.');
    expect(s).not.toContain('[linked');
    expect(s).not.toContain('https://');
    expect(s).not.toContain('ray of the sun');                            // the current question is not "conversation so far"
  });
  it('the pushback direction checks the record first and never concedes what was not said', () => {
    expect(PUSHBACK_HOW).toMatch(/CONVERSATION SO FAR/);
    expect(PUSHBACK_HOW).toMatch(/do not apologise or concede/);
    expect(PUSHBACK_HOW).toMatch(/hold to it/);
    expect(HOUSE_STYLE).toMatch(/WHAT YOU SAID EARLIER/);
    expect(STANCE_NOTES.disputing).toMatch(/^Check the passages and what you said earlier first/);
    expect(soul()).toMatch(/hold to what the texts show/);
  });
});

describe('misattribution and stitched quotations (C)', () => {
  it('an id or an uploader slug is never printed as an author', () => {
    expect(displayName('5480')).toBe('');
    expect(displayName('bayat')).toBe('Bayat');
    expect(displayName('bayat', { slug: 'drop' })).toBe('');
    expect(displayName('Shoghi Effendi', { slug: 'drop' })).toBe('Shoghi Effendi');
  });
  it('a quoted-in header credits the speaker and names the book author only when it is a name', () => {
    const saq = { source_title: 'Some Answered Questions', source_author: "'Abdu'l-Bahá", book_author: 'bayat', collection: 'x', religion: "Bahá'í", text: 't' };
    expect(passageHeader(saq, 0)).not.toMatch(/bayat|Bayat/);
    expect(passageHeader(saq, 0)).toContain("'Abdu'l-Bahá");
    const id = { ...saq, book_author: '5480' };
    expect(passageHeader(id, 0)).not.toContain('5480');
  });
  it('a quotation stitched from two passages is unverified; each half alone is fine', () => {
    const ps = [{ text: 'The earth is but one country and mankind its citizens.' }, { text: 'Let your vision be world-embracing rather than confined to your own self.' }];
    expect(unverifiedQuotes('He wrote “The earth is but one country and mankind its citizens.”', ps)).toHaveLength(0);
    expect(unverifiedQuotes('He wrote “The earth is but one country … let your vision be world-embracing rather than confined”', ps)).toHaveLength(1);
    expect(unverifiedQuotes('He wrote “The earth is but one country … mankind its citizens”', ps)).toHaveLength(0);
  });
  it('a prayer quoted whole across two consecutive paragraphs of one document is verified; non-adjacent ones are not joined', () => {
    const a = { document_id: 7, paragraph_index: 27, text: 'I bear witness, O my God, that Thou hast created me to know Thee and to worship Thee.' };
    const b = { document_id: 7, paragraph_index: 28, text: 'There is none other God but Thee, the Help in Peril, the Self-Subsisting.' };
    const q = 'He revealed: “I bear witness, O my God, that Thou hast created me to know Thee and to worship Thee. There is none other God but Thee, the Help in Peril, the Self-Subsisting.”';
    expect(unverifiedQuotes(q, [a, b])).toHaveLength(0);
    expect(unverifiedQuotes(q, [a, { ...b, paragraph_index: 30 }])).toHaveLength(1);
    expect(unverifiedQuotes(q, [a, { ...b, document_id: 8 }])).toHaveLength(1);
  });
});

describe('numbers from memory and passages cut short (D, G)', () => {
  it('the house style takes numbering, translators and dates only from a passage', () => {
    expect(HOUSE_STYLE).toMatch(/NUMBERS AND POSITIONS come only from a passage/);
    expect(HOUSE_STYLE).toMatch(/ONE QUOTATION, ONE PASSAGE/);
  });
  it('the writer sees each passage whole up to 4,000 characters (700 cut the dream account of r8 #50; 1,300 cut a quotation 11-04)', () => {
    expect(PASSAGE_CHARS).toBe(4000);
    const u = anisUserPayload({ question: 'q', passages: [{ source_title: 'T', text: `${'a '.repeat(500)}END-OF-ACCOUNT` }] });
    expect(u).toContain('END-OF-ACCOUNT');
  });
});

describe('cut and dangling replies (E)', () => {
  it('a reply cut by the token cap ends at its last whole sentence, never mid-link', () => {
    expect(trimCutReply('He wrote of unity. See [Some Answered Qu')).toBe('He wrote of unity.');
    expect(trimCutReply('First point. Then “an open quotation that never')).toBe('First point.');
    expect(trimCutReply('One. Two ([Gleanings](https://x/g)). Three is cut mid')).toBe('One. Two ([Gleanings](https://x/g)).');
    expect(trimCutReply('no sentence end at all')).toBe('');
  });
  it('"Here are three short statements…:" left without its quotations is rewritten, not left dangling', () => {
    const r = completeIntroducedQuotes('Bahá’u’lláh speaks of this often.\n\nHere are three short statements from His Writings:\n\nIn short, unity is the theme.', []);
    expect(r.text).not.toMatch(/:\s*(\n|$)/);
    expect(r.rewritten).toBe(1);
  });
});
