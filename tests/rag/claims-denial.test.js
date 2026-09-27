// The claim gate drops a MEETING claim whose own proof denies the meeting (live: "Ṭáhirih — met the Báb" from
// "she never attained the presence of the Báb").
import { describe, it, expect } from 'vitest';
import { deniesMeeting } from '../../api/lib/rag/entities/claims.js';

describe('deniesMeeting', () => {
  it('drops a meeting claim whose proof says it never happened', () => {
    expect(deniesMeeting('met', 'she never attained the presence of the Báb')).toBe(true);
    expect(deniesMeeting('met', 'She never met the Bab during her lifetime')).toBe(true);
    expect(deniesMeeting('knew', 'recognize the Bab without ever seeing Him')).toBe(true);
    expect(deniesMeeting('met', 'هرگز به ملاقات حضرت باب نرسید')).toBe(true);
  });
  it('keeps real meetings, and other relations', () => {
    expect(deniesMeeting('met', 'Quddús was admitted into His presence')).toBe(false);
    expect(deniesMeeting('died', 'he never saw his home again')).toBe(false);
  });
});
