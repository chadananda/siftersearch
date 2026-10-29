// compareCopies verdicts: a remaster that matches the original must never count as proof of improvement.
import { describe, it, expect } from 'vitest';
import { compareCopies, verifyRemaster } from '../../api/lib/media/remaster-audit.js';

const base = { all: -20, hf4: -50, hf8: -65, trough: -55 };

describe('compareCopies', () => {
  it('Dunbar-like: a copy spectrally identical to the original is unchanged', () => {
    const r = compareCopies({ ...base, all: -20.2, hf4: -50.3 }, base, 'heavy');
    expect(r.verdict).toBe('unchanged');
  });
  it('bandwidth gain and a lower noise floor is changed', () => {
    const r = compareCopies({ all: -20, hf4: -42, hf8: -55, trough: -68 }, base, 'heavy');
    expect(r.verdict).toBe('changed');
  });
  it('heavy tier that only dulled the highs (moved, but no gain) is suspect', () => {
    const r = compareCopies({ all: -20, hf4: -58, hf8: -75, trough: -55 }, base, 'heavy');
    expect(r.verdict).toBe('suspect');
  });
  it('a non-finite measurement is an error, never a pass', () => {
    expect(compareCopies({ ...base, hf4: NaN }, base).verdict).toBe('error');
  });
  it('missing files are unverifiable', async () => {
    const r = await verifyRemaster({ run: async () => ({ stderr: '' }), original: '/nope/a.flac', remaster: '/nope/b.flac', durationS: 600, tier: 'heavy' });
    expect(r.verdict).toBe('unverifiable');
  });
});

describe('measurement failures name the failing measure', () => {
  it('error says which value is missing', () => {
    const r = compareCopies({ all: -20, hf4: -40, hf8: NaN, trough: -60 }, { all: -20, hf4: -40, hf8: -50, trough: -60 });
    expect(r.verdict).toBe('error');
    expect(r.why).toContain('remaster.hf8');
  });
});
