// Anís letters: outreach prompts by step, Markdown → email HTML, signed review links.
import { describe, it, expect } from 'vitest';
import { outreachPrompt, CAPABILITIES } from '../../api/lib/anis/outreach.js';
import { toHtml, reviewUrl, tidy, fillTemplate } from '../../worker/mail/drafting.js';

describe('outreach prompts', () => {
  it('steps 0–1 show a capability on their subject; later steps follow up', () => {
    const q = 'What does Bahá’u’lláh say about justice?';
    expect(outreachPrompt(0, q)).toMatchObject({ capability: CAPABILITIES[0].id });
    expect(outreachPrompt(0, q).question).toContain(q);
    expect(outreachPrompt(1, q).capability).toBe(CAPABILITIES[1].id);
    expect(outreachPrompt(2, q)).toMatchObject({ capability: 'follow-up' });
    expect(outreachPrompt(9, q).subject).toMatch(/^Still thinking about/);
  });
  it('a long question is shortened in the subject', () => {
    expect(outreachPrompt(2, 'x'.repeat(200)).subject.length).toBeLessThan(90);
  });
});

describe('letters', () => {
  it('Markdown becomes email HTML', () => {
    const h = toHtml('Dear friend,\n\n> a passage\n\n[Source](https://oceanlibrary.com/x)');
    expect(h).toContain('<blockquote>');
    expect(h).toContain('<a href="https://oceanlibrary.com/x">Source</a>');
  });
  it('footnote markers copied from passages are removed', () => {
    expect(tidy('Set it then before thine eyes.[^14]\n\nWarmly')).toBe('Set it then before thine eyes.\n\nWarmly');
  });
  it('review links are signed per draft', async () => {
    const a = await reviewUrl(12, 'k'), b = await reviewUrl(13, 'k'), c = await reviewUrl(12, 'other');
    expect(a).toMatch(/\/_mail\/review\?t=12\.[a-f0-9]{32}$/);
    expect(a).not.toBe(c);
    expect(b.split('.')[1]).not.toBe(a.split('.')[1]);
  });
});

describe('templates', () => {
  it('greets by name when known', () => {
    expect(fillTemplate('{{greeting}}\n\nI am Anís.', { name: 'Leila' })).toBe('Hello Leila,\n\nI am Anís.');
    expect(fillTemplate('{{greeting}}', {})).toBe('Hello,');
  });
});
