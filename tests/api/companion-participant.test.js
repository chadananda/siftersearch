// "Forget me" must resolve the SAME participant as chat, or an anonymous widget visitor (cookie-identified)
// cannot reset the relationship the companion built from their chats.
import { describe, it, expect } from 'vitest';
import { participantOf } from '../../api/routes/companion-me.js';
import { participantId } from '../../api/lib/anonymous.js';

describe('companion self-service participant', () => {
  const cases = [
    { user: { sub: 42 }, headers: {}, cookies: {} },
    { headers: { 'x-user-id': 'user_abc123' }, cookies: {} },
    { headers: {}, cookies: { sifter_sid: 'sess_0123abcd-ef01' } },
  ];
  for (const req of cases) {
    it(`matches chat for ${JSON.stringify(req).slice(0, 60)}`, () => {
      expect(participantOf(req)).toBe(participantId(req));
      expect(participantOf(req)).toBeTruthy();
    });
  }
});
