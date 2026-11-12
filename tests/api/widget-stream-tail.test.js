// The streaming tail is held back until its markdown closes (Chad 11-12: formatting arrived late, raw first).
import { describe, it, expect } from 'vitest';
import { settled } from '../../src/widget/stream-tail.js';

describe('streaming tail', () => {
  it('an open bold, italic or link waits; closed ones show', () => {
    expect(settled('See **the Kitáb')).toBe('See ');
    expect(settled('See *the Kitáb')).toBe('See ');
    expect(settled('See **the** *Kitáb*')).toBe('See **the** *Kitáb*');
    expect(settled('In [the Tablet](https://x.o')).toBe('In ');
    expect(settled('In [the Tablet](https://x.org) and')).toBe('In [the Tablet](https://x.org) and');
  });
  it('a table grows row by row, never as raw pipes', () => {
    expect(settled('Here:\n| # | Prayer |')).toBe('Here:\n');
    expect(settled('Here:\n| # | Prayer |\n|---|')).toBe('Here:\n');
    expect(settled('Here:\n| # | Prayer |\n|---|---|\n| 1 | O G')).toBe('Here:\n| # | Prayer |\n|---|---|\n');
    expect(settled('| # | Prayer |\n|---|---|\n| 1 | O God |')).toBe('| # | Prayer |\n|---|---|\n| 1 | O God |');
  });
  it('earlier lines are never touched', () => {
    expect(settled('a *b\nc')).toBe('a *b\nc');
  });
});
