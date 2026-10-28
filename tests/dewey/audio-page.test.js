// resolveAudioPage: talk page HTML → audio URL + readable name, no network.
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { resolveAudioPage } from '../../scripts/dewey/worker/lib.mjs';

const page = (html, status = 200) => async (url) => ({ res: Object.assign(Readable.from([html]), { statusCode: status }), url });
const ctx = { robots: async () => ({ allowed: true }) };
describe('resolveAudioPage', () => {
  it('finds the protocol-relative mp3 and names it from title/speaker/year', async () => {
    const r = await resolveAudioPage({ url: 'https://imagesinternational.org/audio/accounting', params: { title: 'Accounting', speaker: 'Ms. Tahirih Foroughi', year: '1982' } }, ctx,
      { request: page('<div class="field-name-field-audio-file-link"><a href="//bahaicast.softcomputer.com/x/688_Accounting.mp3">dl</a></div>') });
    expect(r.url).toBe('https://bahaicast.softcomputer.com/x/688_Accounting.mp3');
    expect(r.nameHint).toBe('Accounting - Ms. Tahirih Foroughi (1982).mp3');
  });
  it('fails (not retryable) when no audio is linked, and when robots says no', async () => {
    await expect(resolveAudioPage({ url: 'https://a.org/audio/x', params: {} }, ctx, { request: page('<html></html>') })).rejects.toThrow(/no audio/);
    await expect(resolveAudioPage({ url: 'https://a.org/audio/x', params: {} }, { robots: async () => ({ allowed: false, why: 'robots' }) }, { request: page('') })).rejects.toThrow(/robots/);
  });
});
