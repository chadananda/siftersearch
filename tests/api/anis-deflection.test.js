// Deflection lint (11-10 live battery): a reply telling the reader to ask differently ("You might try asking…") is removed at the exit.
import { describe, it, expect } from 'vitest';
import { isDeflection, dropDeflection, formPass, finalForm, lintReply } from '../../api/lib/assistant/lint.js';
import { forensicPass } from '../../api/lib/audit/forensics.js';
import { turnFromPath } from '../../api/lib/audit/improve.js';

// the live wordings (history_fact conv_bbf61d9b / conv_7486a43d, quote_trace conv_c29561c7) and their kin
const DEFLECTIONS = [
  'You might try asking about the early life of the Báb in The Dawn-Breakers.',
  'A helpful way forward is to ask specifically for the passage in which Shoghi Effendi uses the phrase.',
  'You could ask me more specifically about which Tablet you mean.',
  'Try rephrasing the question with the name of the book.',
  'If you narrow your question to one period, I can say more.',
  'A better approach would be to ask about her poetry directly.',
];
const NOT_DEFLECTIONS = [
  'The Guardian asked the friends to try to teach the Faith in every land.',
  'She was asked specifically to recite the poem.',
  'The Báb was born in Shiraz on 20 October 1819.',
  '‘Abdu’l-Bahá counsels: "try asking God for assistance in all thy affairs."',
  'He tried to answer every question asked of him.',
];

describe('the deflection lint', () => {
  it('flags every live wording', () => { for (const s of DEFLECTIONS) expect(isDeflection(s), s).toBe(true); });
  it('leaves statements, history and quoted counsel alone', () => { for (const s of NOT_DEFLECTIONS) expect(isDeflection(s), s).toBe(false); });
  it('is a lint id', () => expect(lintReply(DEFLECTIONS[0]).map((x) => x.id)).toContain('deflection'));
});

describe('dropDeflection — removed, the answer stays', () => {
  it('the live reply loses the deflection and keeps the answer', () => {
    const r = dropDeflection('The Báb was born in Shiraz on 20 October 1819. You might try asking about His childhood in *The Dawn-Breakers*.\n\nMore.');
    expect(r).toEqual({ text: 'The Báb was born in Shiraz on 20 October 1819.\n\nMore.', dropped: 1 });
  });
  it('a deflection before a "but" keeps what follows', () => {
    expect(dropDeflection('A helpful way forward is to ask specifically for the Tablet, but Shoghi Effendi quotes the words in *The Promised Day Is Come*.').text)
      .toBe('Shoghi Effendi quotes the words in *The Promised Day Is Come*.');
  });
  it('blockquotes are never touched; the reply is never emptied', () => {
    const q = '> You might try asking the friends.\n\nThat line is quoted.';
    expect(dropDeflection(q)).toEqual({ text: q, dropped: 0 });
    expect(dropDeflection(DEFLECTIONS[0])).toEqual({ text: DEFLECTIONS[0], dropped: 0 });
  });
  it('formPass counts it; finalForm applies it', () => {
    expect(finalForm('The answer. Try rephrasing the question.')).toBe('The answer.');
    expect(formPass('The answer. Try rephrasing the question.').repairs.deflection).toBe(1);
    expect(formPass('The answer.').repairs.deflection).toBeUndefined();
  });
  it('a removed deflection (path.form) is the WRITER defect deflection', () => {
    const f = forensicPass(turnFromPath({ question: 'q', reply: 'The answer.', path: { recipe: 'history_fact', form: { search_denial: 0, search_offer: 0, deflection: 1 } } }));
    expect(f.defects).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'WRITER', class: 'deflection' })]));
  });
});
