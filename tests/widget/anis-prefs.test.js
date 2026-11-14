// Reader preferences (src/widget/prefs.js): theme choice and the "what Anís knows about me" rows.
import { describe, it, expect } from 'vitest';
import { THEME_KEY, loadTheme, saveTheme, nextTheme, isDark, bioRows } from '../../src/widget/prefs.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };

describe('theme', () => {
  it('defaults to system, which follows the OS', () => {
    expect(loadTheme(mem())).toBe('system');
    expect(isDark('system', true)).toBe(true);
    expect(isDark('system', false)).toBe(false);
  });
  it('a stored choice wins over the OS', () => {
    expect(loadTheme(mem({ [THEME_KEY]: 'light' }))).toBe('light');
    expect(isDark('light', true)).toBe(false);
    expect(isDark('dark', false)).toBe(true);
  });
  it('save round-trips; system clears the key', () => {
    const s = mem();
    saveTheme(s, 'dark'); expect(loadTheme(s)).toBe('dark');
    saveTheme(s, 'system'); expect(s.m.has(THEME_KEY)).toBe(false);
  });
  it('bad or blocked storage never breaks', () => {
    expect(loadTheme(mem({ [THEME_KEY]: 'purple' }))).toBe('system');
    expect(loadTheme(broken)).toBe('system');
    expect(() => saveTheme(broken, 'dark')).not.toThrow();
  });
  it('cycles system → light → dark → system', () => {
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark'), nextTheme('junk')]).toEqual(['light', 'dark', 'system', 'system']);
  });
});

describe('bioRows', () => {
  it('shows the label, the value and the reader\'s own words', () => {
    expect(bioRows({ indications: [{ kind: 'role', value: ' study-class tutor ', evidence: 'I lead a Dawn-Breakers class', at: 1 }] }))
      .toEqual([{ label: 'Role', value: 'study-class tutor', evidence: 'I lead a Dawn-Breakers class' }]);
  });
  it('drops malformed rows and never throws', () => {
    expect(bioRows(null)).toEqual([]);
    expect(bioRows({ indications: 'x' })).toEqual([]);
    expect(bioRows({ indications: [null, { kind: 'level' }, { kind: 'odd', value: 'v' }] })).toEqual([{ label: 'Noted', value: 'v', evidence: '' }]);
  });
});
