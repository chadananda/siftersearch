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

describe('PII sanitizer — the seven categories that used to leak are now CAUGHT', () => {
  // This block previously asserted the leaks, to make the exposure a number rather than a worry. The
  // categories are now closed in regexScrub, so it asserts the closure instead — and it stays measured:
  // if a rule regresses, the specific category names itself here.
  const closed = [
    ['bare self-identification', "I'm Layli. Does the Faith teach reincarnation?", 'Layli'],
    ['name mid-sentence', 'My daughter Nadia asked me about prayer', 'Nadia'],
    ['city / location', 'I live in Tucson and there is no community here', 'Tucson'],
    ['employer', 'I work at Raytheon and my colleagues ask about my faith', 'Raytheon'],
    ['age + profession', 'I am a 34-year-old nurse considering the Faith', '34-year-old'],
    ['street address', 'I am at 42 Oak Street, apartment 3B', 'Oak Street'],
    ['family relation + name', 'my husband Kamran does not believe', 'Kamran'],
  ];
  for (const [label, text, leak] of closed) {
    it(`CAUGHT: ${label}`, async () => {
      expect(await scrub(text)).not.toContain(leak);
    });
  }
});

describe('PII sanitizer — over-redaction has limits: the corpus vocabulary survives', () => {
  // Over-redaction is the safe direction for a privacy floor, but not at any price: a sanitizer that
  // shreds "Bahá'u'lláh" or "the Kitáb-i-Íqán" would make published dialogue worthless. These hold the line.
  const keeps = [
    ['a Manifestation named', 'What did Bahá’u’lláh teach about detachment?', 'Bahá’u’lláh'],
    ['a book title', 'I am reading the Kitáb-i-Íqán right now', 'Kitáb-i-Íqán'],
    ['a holy place as subject', 'Why is the Shrine of the Báb in Haifa significant?', 'Haifa'],
    ['a historical figure', 'Tell me about Mullá Ḥusayn and Shaykh Ṭabarsí', 'Mullá Ḥusayn'],
    ['an ordinary doctrinal question', 'What is the station of the Manifestation of God?', 'Manifestation'],
  ];
  for (const [label, text, keep] of keeps) {
    it(`KEEPS: ${label}`, async () => {
      expect(await scrub(text)).toContain(keep);
    });
  }
});

describe('PII sanitizer — an echoed name is removed from ASSISTANT turns too', () => {
  // The file header has always warned "Jafar may echo the name back", and assistant turns deliberately skip
  // the LLM pass because it shreds markdown citation links. The resolution: the assistant can only echo a
  // name the USER gave, so names collected from user turns are deleted from every turn — no model call on
  // assistant turns, so the links survive.
  it('the echoed name is gone from the assistant turn, not just the user turn', async () => {
    const fn = await load();
    const out = await fn([
      { role: 'user', content: 'my name is Roya' },
      { role: 'assistant', content: 'Welcome, Roya — you asked about the Covenant.' },
    ]);
    expect(out[0].content).not.toContain('Roya');
    expect(out[1].content).not.toContain('Roya');      // the documented risk, now closed
  });

  it('CITATION LINKS SURVIVE — the reason assistant turns skip the model pass', async () => {
    const fn = await load();
    const link = '[Gleanings](https://oceanlibrary.com/gleanings?paraId=para_1130)';
    const out = await fn([
      { role: 'user', content: "I'm Layli. Where is that written?" },
      { role: 'assistant', content: `See ${link} for the passage.` },
    ]);
    expect(out[1].content).toContain(link);
  });

  it('does not delete a name the user never disclosed', async () => {
    const fn = await load();
    const out = await fn([
      { role: 'user', content: 'Tell me about Mullá Ḥusayn' },
      { role: 'assistant', content: 'Mullá Ḥusayn was the first to believe.' },
    ]);
    expect(out[1].content).toContain('Mullá Ḥusayn');   // a historical figure, not a seeker
  });
});

describe('collectPersonalNames — what counts as a disclosed name', () => {
  it('picks up the disclosure forms', async () => {
    const { collectPersonalNames } = await import('../../api/lib/publish-pipeline.js');
    expect(collectPersonalNames('my name is Roya')).toContain('Roya');
    expect(collectPersonalNames('call me Farid')).toContain('Farid');
    expect(collectPersonalNames("I'm Layli.")).toContain('Layli');
    expect(collectPersonalNames('my husband Kamran does not believe')).toContain('Kamran');
  });

  it('refuses short and grammatical words — blanket-deleting "The" would be worse than the leak', async () => {
    const { collectPersonalNames } = await import('../../api/lib/publish-pipeline.js');
    expect(collectPersonalNames("I'm The one who asked.")).not.toContain('The');
    expect(collectPersonalNames("I'm Jo.")).toEqual([]);          // under 3 chars
  });
});
