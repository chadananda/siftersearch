// Remaster QA (planning/media-library-plan.md §13): the Ioas numbers (10-23) as the fixture.
import { describe, it, expect } from 'vitest';
import { pickListening, qaVerdict, vetoes } from '../../api/lib/media/remaster-qa.js';

const ioas = {
  original: { nisqa: 1.22, dnsmos_ovrl: 1.2, bandwidth_khz: 2.99, rolloff99_hz: 2610, clip_pct: 0, lufs: -18.4, voice_sim: 1 },
  dfn: { nisqa: 2.16, dnsmos_ovrl: 2.5, bandwidth_khz: 4.16, rolloff99_hz: 2566, clip_pct: 0, lufs: -17.9, voice_sim: 0.6 },
  dfn15: { nisqa: 2.07, dnsmos_ovrl: 2.18, bandwidth_khz: 4.33, rolloff99_hz: 2591, clip_pct: 0, lufs: -18.1, voice_sim: 0.917 },
  restored: { nisqa: 4.55, dnsmos_ovrl: 3.09, bandwidth_khz: 19.53, rolloff99_hz: 5705, clip_pct: 0, lufs: -18.1, voice_sim: 0.611 },
};

describe('listening pick by perceived quality', () => {
  it('Ioas: the restored chain wins on NISQA/DNSMOS', () => {
    expect(pickListening(ioas).pick).toBe('restored');
  });
  it('the 10-23 failure: a DFN copy that cut the roll-off 2,620 → 888 Hz is vetoed whatever its SNR', () => {
    const r = pickListening({ original: ioas.original, dfn: { ...ioas.dfn, rolloff99_hz: 888 } });
    expect(r.vetoed.dfn[0]).toMatch(/roll-off 2610 → 888/);
    expect(r.pick).toBe('original');
  });
  it('never worse than the original; a changed voice, new clipping, wrong loudness or worse ASR are vetoes', () => {
    expect(pickListening({ original: { nisqa: 3 }, x: { nisqa: 2.5 } }).pick).toBe('original');
    expect(vetoes({ voice_sim: 0.4 }, {})[0]).toMatch(/voice changed/);
    expect(vetoes({ clip_pct: 0.5 }, { clip_pct: 0 })[0]).toMatch(/clipping/);
    expect(vetoes({ lufs: -25 }, {})[0]).toMatch(/loudness/);
    expect(vetoes({ asr_logprob: -0.4 }, { asr_logprob: -0.2 })[0]).toMatch(/ASR/);
    expect(vetoes({ rolloff99_hz: 1000, removed_noise_above_speech: true }, { rolloff99_hz: 8000 })).toEqual([]);
  });
});

describe('QA verdict per talk', () => {
  it('Ioas restored: a big gain, but voice similarity 0.61 → a human listens', () => {
    expect(qaVerdict({ original: ioas.original, published: ioas.restored })).toMatchObject({ verdict: 'review', gain: 3.33 });
  });
  it('a poor source barely helped while a stronger chain exists → needs-work', () => {
    expect(qaVerdict({ original: ioas.original, published: { ...ioas.dfn15, nisqa: 1.4 }, strongerAvailable: true }).verdict).toBe('needs-work');
  });
  it('a clean gain with the voice intact → pass-auto; a veto → review', () => {
    expect(qaVerdict({ original: { nisqa: 3, rolloff99_hz: 8000 }, published: { nisqa: 3.8, rolloff99_hz: 7900, voice_sim: 0.9, lufs: -18 } }).verdict).toBe('pass-auto');
    expect(qaVerdict({ original: ioas.original, published: { ...ioas.dfn, rolloff99_hz: 888 } }).verdict).toBe('review');
  });
});
