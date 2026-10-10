// Admin dollar display: cents at most.
import { describe, it, expect } from 'vitest';
import { usd } from '../../src/lib/money.js';

describe('usd', () => {
  it('rounds to the cent', () => {
    expect(usd(249.2507)).toBe('$249.25');
    expect(usd(0.016)).toBe('$0.02');
    expect(usd(0)).toBe('$0.00');
  });
  it('shows tiny non-zero amounts as <$0.01, missing as —', () => {
    expect(usd(0.0004)).toBe('<$0.01');
    expect(usd(null)).toBe('—');
  });
  it('compact thousands only when asked', () => {
    expect(usd(1234.5)).toBe('$1,234.50');
    expect(usd(1234.5, { compact: true })).toBe('$1.2K');
  });
});
