// Widget links keep URLs with balanced parens whole (11-10, Kawthar: an Ocean of Lights range link shown cut at the first ")").
import { describe, it, expect } from 'vitest';
import { richLinks } from '../../src/widget/rich-link.js';

const KAWTHAR = 'https://oceanoflights.org/bab-pub01-37-ar/#(%D8%AA%D9%81%D8%B3%D9%8A%D8%B1%20%D8%B3%D9%88%D8%B1%D9%87%D8%B4%20%DA%A9%D9%88%D8%AB%D8%B1)(%DA%A9%D9%88%D8%AB%D8%B1)';

describe('widget richLinks', () => {
  it('keeps an Ocean of Lights range link whole', () => {
    const html = richLinks(`the [*Tafsir-i-Suratu'l-Kawthar*](${KAWTHAR}), exploring`);
    expect(html).toBe(`the <a href="${KAWTHAR}" target="_blank" rel="noopener">*Tafsir-i-Suratu'l-Kawthar*</a>, exploring`);
  });
  it('still ends a plain link at its ")" and links two in a row', () => {
    expect(richLinks('([a](https://x.org/a)) [b](https://x.org/b)')).toBe('(<a href="https://x.org/a" target="_blank" rel="noopener">a</a>) <a href="https://x.org/b" target="_blank" rel="noopener">b</a>');
  });
  it('never links a non-https URL or one holding a quote mark', () => {
    expect(richLinks('[a](http://x.org)')).toBe('[a](http://x.org)');
    expect(richLinks('[a](https://x.org/"onmouseover=1)')).toBe('[a](https://x.org/"onmouseover=1)');
  });
});
