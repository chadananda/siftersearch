// Anís boot config (src/widget/boot.js): render at once from the cached config or full-screen defaults.
import { describe, it, expect } from 'vitest';
import { cfgKey, slimConfig, loadConfig, saveConfig, bootConfig } from '../../src/widget/boot.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

describe('slimConfig', () => {
  it('keeps only first-render fields', () => expect(slimConfig({ name: 'A', accent: '#111', secret: 1, allowedOrigins: ['x'] })).toEqual({ name: 'A', accent: '#111' }));
  it('tolerates null', () => expect(slimConfig(null)).toEqual({}));
});

describe('load/save', () => {
  it('round-trips under anis-cfg:<token>', () => {
    const s = mem();
    saveConfig(s, 'tok', { name: 'X', position: 'bottom-left', extra: 2 });
    expect(s.m.has(cfgKey('tok'))).toBe(true);
    expect(loadConfig(s, 'tok')).toEqual({ name: 'X', position: 'bottom-left' });
  });
  it('bad JSON or a non-object → null', () => {
    expect(loadConfig(mem({ [cfgKey('t')]: '{oops' }), 't')).toBe(null);
    expect(loadConfig(mem({ [cfgKey('t')]: '[1]' }), 't')).toBe(null);
    expect(loadConfig(mem(), 't')).toBe(null);
  });
  it('a throwing storage never throws', () => {
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadConfig(bad, 't')).toBe(null);
    expect(() => saveConfig(bad, 't', { name: 'a' })).not.toThrow();
  });
});

describe('bootConfig', () => {
  it('no cache, not full screen → wait for the fetch', () => expect(bootConfig({})).toBe(null));
  it('full screen, first visit → defaults', () => expect(bootConfig({ fullscreen: true })).toEqual({ name: 'Anís', accent: '#0f5f73', position: 'bottom-right', placeholder: 'Ask a question…' }));
  it('cached wins over defaults; page overrides win over both', () => {
    expect(bootConfig({ cached: { name: 'C', accent: '#222', position: 'bottom-left' }, fullscreen: true })).toEqual({ name: 'C', accent: '#222', position: 'bottom-left' });
    expect(bootConfig({ cached: { name: 'C', accent: '#222' }, name: 'Anís', accent: '#0f5f73' })).toEqual({ name: 'Anís', accent: '#0f5f73' });
  });
});
