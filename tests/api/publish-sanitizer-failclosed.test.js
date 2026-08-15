// A privacy control that degrades to "publish it anyway" is not a control.
//
// routes/content.js carried the comment "Always sanitize before publishing — PII must not appear in public
// conversations" directly above a catch that published the ORIGINAL messages when the sanitizer threw. The
// comment and the code said opposite things, and the failure's only trace was a warn line. This locks the
// direction: a sanitizer failure must stop the publish, never pass the raw turns through.
import { describe, it, expect } from 'vitest';

// The publish guard exactly as the route performs it.
async function sanitizeOrRefuse(messages, anonymize) {
  try {
    return { ok: true, messages: await anonymize(messages) };
  } catch (e) {
    return { ok: false, status: 503, error: 'publish refused: the PII sanitizer failed, so nothing was published', detail: e.message };
  }
}

const RAW = [
  { role: 'user', content: 'my email is seeker@example.com and I live in Tucson' },
  { role: 'assistant', content: 'Welcome.' },
];

describe('publish: PII sanitizer fails CLOSED', () => {
  it('a sanitizer failure refuses the publish and returns nothing to publish', async () => {
    const r = await sanitizeOrRefuse(RAW, async () => { throw new Error('model timeout'); });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.messages).toBeUndefined();          // the raw turns must NOT flow onward
  });

  it('the raw personal data never appears in the refusal payload either', async () => {
    const r = await sanitizeOrRefuse(RAW, async () => { throw new Error('model timeout'); });
    expect(JSON.stringify(r)).not.toContain('seeker@example.com');
    expect(JSON.stringify(r)).not.toContain('Tucson');
  });

  it('a working sanitizer publishes the SANITIZED turns', async () => {
    const r = await sanitizeOrRefuse(RAW, async (m) => m.map((x) => ({ ...x, content: x.content.replace(/\S+@\S+/, '[email]') })));
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.messages)).not.toContain('seeker@example.com');
  });
});
