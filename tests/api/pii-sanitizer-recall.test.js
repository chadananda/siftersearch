// WHAT DOES THE SANITIZER ACTUALLY CATCH? Measured, not assumed.
//
// The user-facing thread-share path was held back because the PII sanitizer was "unverified". This is the
// verification. It targets the FALLBACK path deliberately: anonymizeUserTurns catches its own LLM failure
// and returns the regex-scrubbed text, so regex-only is not a hypothetical — it is exactly what ships
// whenever gpt-4o-mini is down, rate-limited, or slow. It is also the only pass assistant turns EVER get.
//
// These tests assert what is true today, including the gaps. A red test here would mean the sanitizer got
// worse; the documented gaps are recorded as expectations so that FIXING them fails this file loudly and
// forces the number to be re-measured rather than assumed.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: async () => {} }));
// Force the fallback: the LLM pass throws, so anonymizeUserTurns returns regex-scrubbed text.
vi.mock('openai', () => ({
  default: class { constructor() { this.chat = { completions: { create: async () => { throw new Error('LLM down'); } } }; } },
}));

const load = async () => (await import('../../api/lib/publish-pipeline.js')).anonymizeUserTurns;

const scrub = async (text, role = 'user') => {
  const fn = await load();
  const out = await fn([{ role, content: text }, { role: 'assistant', content: 'ok' }]);
  return out[0].content;
};

beforeEach(() => vi.resetModules());

describe('PII sanitizer — regex fallback: what it DOES catch', () => {
  it('email addresses', async () => {
    expect(await scrub('write me at seeker.jones+bahai@example.co.uk please')).toContain('[email]');
    expect(await scrub('write me at seeker.jones+bahai@example.co.uk please')).not.toContain('example.co.uk');
  });

  it('phone numbers in common US shapes', async () => {
    for (const p of ['+1 520-555-0134', '(520) 555-0134', '520.555.0134']) {
      expect(await scrub(`call ${p}`)).toContain('[phone]');
    }
  });

  it('the "my name is X" / "call me X" openers', async () => {
    expect(await scrub('my name is Roya and I have a question')).not.toContain('Roya');
    expect(await scrub('call me Farid, I am new here')).not.toContain('Farid');
  });
});

describe('PII sanitizer — regex fallback: MEASURED GAPS (these ship when the LLM is down)', () => {
  // Each of these is real PII that survives the fallback untouched. Recorded so the exposure is a number
  // someone can act on, not a vague worry — and so closing a gap fails loudly here.
  const gaps = [
    ['bare self-identification', "I'm Layli. Does the Faith teach reincarnation?", 'Layli'],
    ['name mid-sentence', 'My daughter Nadia asked me about prayer', 'Nadia'],
    ['city / location', 'I live in Tucson and there is no community here', 'Tucson'],
    ['employer', 'I work at Raytheon and my colleagues ask about my faith', 'Raytheon'],
    ['age + profession', 'I am a 34-year-old nurse considering the Faith', 'nurse'],
    ['street address', 'I am at 42 Oak Street, apartment 3B', 'Oak Street'],
    ['family relation + name', 'my husband Kamran does not believe', 'Kamran'],
  ];
  for (const [label, text, leak] of gaps) {
    it(`STILL LEAKS: ${label}`, async () => {
      expect(await scrub(text)).toContain(leak);
    });
  }
});

describe('PII sanitizer — assistant turns get regex ONLY, ever', () => {
  // The file header says "Jafar may echo the name back" and the implementation then routes only USER turns
  // through the LLM. So an echoed name in an assistant turn is protected by regex alone.
  it('an assistant turn echoing a name keeps it', async () => {
    const fn = await load();
    const out = await fn([
      { role: 'user', content: 'my name is Roya' },
      { role: 'assistant', content: 'Welcome, Roya — you asked about the Covenant.' },
    ]);
    expect(out[0].content).not.toContain('Roya');       // user turn scrubbed by regex
    expect(out[1].content).toContain('Roya');           // assistant turn NOT — the documented risk, unhandled
  });
});
