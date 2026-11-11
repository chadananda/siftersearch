// The One Tap "connected" note: from Anís, says they can write to him, never names the backend (Chad 11-11).
import { describe, it, expect } from 'vitest';
import { connectedLetter } from '../../api/lib/assistant/welcome.js';

describe('connectedLetter', () => {
  it('is Anís speaking, invites email questions, and names neither the backend nor a pause link nor summaries', () => {
    const { subject, text } = connectedLetter({ name: 'chad jones', site: 'Anis' });
    expect(text).toMatch(/^Hello Chad,/);
    expect(text).toMatch(/I’m Anís, the Ocean AI Research Assistant/);
    expect(text).toMatch(/anis@oceanlibrary\.com/);
    expect(text).toMatch(/reply to this letter/);
    expect(`${subject}${text}`).not.toMatch(/sifter|pause|summar|noreply|connected your Google account to Anis/i);
  });
  it('names a partner site, never the widget\'s own name or the backend', () => {
    expect(connectedLetter({ site: 'Bahá’í Education' }).text).toMatch(/Google account on Bahá’í Education,/);
    expect(connectedLetter({ site: 'SifterSearch' }).text).not.toMatch(/sifter/i);
    expect(connectedLetter({}).text).toMatch(/^Hello,/);
  });
});
