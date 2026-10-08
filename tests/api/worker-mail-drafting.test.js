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
    expect(h).toMatch(/<blockquote style="[^"]+">/);
    expect(h).toMatch(/<a style="[^"]+" href="https:\/\/oceanlibrary.com\/x">Source<\/a>/);
    expect(h).toContain('AI Research Assistant for Ocean 2.0');
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
  it('says who asked Anís to write, when someone did', () => {
    expect(fillTemplate("{{intro}}I'm Anís.", { asked_by: 'Chad' })).toBe("Chad asked me to reach out and introduce myself. I'm Anís.");
    expect(fillTemplate("{{intro}}I'm Anís.", {})).toBe("I'm Anís.");
  });
});

describe('signature', async () => {
  const { stripSignOff, composeLetter } = await import('../../worker/mail/letter.js');
  it("replaces the writer's own sign-off name, keeps the closing", () => {
    expect(stripSignOff('Thanks.\n\nWarmly,\nAnis')).toBe('Thanks.\n\nWarmly,');
    expect(stripSignOff('Warmly,\nAnís\nOcean AI Research Assistant\n')).toBe('Warmly,');
    expect(stripSignOff('— Anís')).toBe('');
    expect(stripSignOff('Anís wrote of this before.\nMore.')).toBe('Anís wrote of this before.\nMore.');
  });
  it('every letter: body, the signature, then the pause link', () => {
    const { text, html } = composeLetter('Hello.\n\nWarmly,\nAnis', 'https://x/p');
    expect(text).toBe('Hello.\n\nWarmly,\n\n— Anís\nAI Research Assistant for Ocean 2.0\n\n—\nRather not hear from me? https://x/p');
    expect(html).toMatch(/font-style:italic;font-size:24px[^>]*>— Anís<\/p>/);
    expect(html.indexOf('AI Research Assistant for Ocean 2.0')).toBeLessThan(html.indexOf('Rather not hear'));
  });
});

describe('support letters', async () => {
  const { answerBody } = await import('../../worker/mail/letter.js');
  it("sets an Anís letter's middle inside another: salutation and closing removed", () => {
    expect(answerBody('Dear friend,\n\nThe passage reads…\n\nI hope this helps.\n\nWarmly,\nAnis')).toBe('The passage reads…\n\nI hope this helps.');
    expect(answerBody('The passage reads…')).toBe('The passage reads…');
    expect(answerBody('Dear Leila,\nYes.\nWith warm regards,\n— Anís')).toBe('Yes.');
  });
});

describe('tables and charts in letters', async () => {
  const { bodyHtml, plainText, composeLetter } = await import('../../worker/mail/letter.js');
  const chart = '```chart\n{"title":"Renderings of عرفان","bars":[{"label":"knowledge","value":29},{"label":"understanding","value":19},{"label":"recognize","value":11}]}\n```';
  it('a chart block becomes an HTML bar chart scaled to the largest value', () => {
    const h = bodyHtml(`Here:\n\n${chart}\n\nAfter.`);
    expect(h).toContain('<caption');
    expect(h).toContain('Renderings of عرفان');
    expect(h).toMatch(/width:100%"><\/div>/);            // the largest bar is full width
    expect(h).toMatch(/width:66%"><\/div>/);             // 19/29
    expect(h).not.toContain('```');
    expect(h).toContain('After.');
  });
  it('the plain-text letter draws the same chart with block characters', () => {
    const t = plainText(chart);
    expect(t.split('\n')[1]).toMatch(/^knowledge\s+█{20} 29$/);
    expect(composeLetter(chart, 'https://x/p').text).not.toContain('"bars"');
  });
  it('a malformed chart block is left as written', () => {
    expect(bodyHtml('```chart\nnot json\n```')).toContain('not json');
  });
  it('tables are styled and right-to-left cells follow their text', () => {
    const h = bodyHtml('| Original | English |\n|---|---|\n| عرفان | knowledge |');
    expect(h).toMatch(/<table cellpadding="0"[^>]*border-collapse/);
    expect(h).toMatch(/<td dir="auto" style="padding/);
  });
});
