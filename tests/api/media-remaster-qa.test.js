// Remaster QA (planning/media-library-plan.md §13): the Ioas numbers (10-23) as the fixture.
import { describe, it, expect } from 'vitest';
import { pickListening, qaVerdict, vetoes, compareWords, QA } from '../../api/lib/media/remaster-qa.js';

const ioas = {
  original: { nisqa: 1.22, dnsmos_ovrl: 1.2, bandwidth_khz: 2.99, rolloff99_hz: 2610, clip_pct: 0, lufs: -18.4, voice_sim: 1 },
  dfn: { nisqa: 2.16, dnsmos_ovrl: 2.5, bandwidth_khz: 4.16, rolloff99_hz: 2566, clip_pct: 0, lufs: -17.9, voice_sim: 0.6 },
  dfn15: { nisqa: 2.07, dnsmos_ovrl: 2.18, bandwidth_khz: 4.33, rolloff99_hz: 2591, clip_pct: 0, lufs: -18.1, voice_sim: 0.917 },
  restored: { nisqa: 4.55, dnsmos_ovrl: 3.09, bandwidth_khz: 19.53, rolloff99_hz: 5705, clip_pct: 0, lufs: -18.1, voice_sim: 0.611 },
};

describe('listening pick by perceived quality', () => {
  it('Ioas: the restored chain scores best but loses words → vetoed; nothing unapproved by ear is ever picked (Chad 10-23)', () => {
    const c = { ...ioas, restored: { ...ioas.restored, chain: 'dfn15+resemble', words_lost: 7, lost: ['our', 'the'] }, dfn: { ...ioas.dfn, chain: 'dfn', words_lost: 3 } };
    const r = pickListening(c);
    expect(r.pick).toBe('original');
    expect(r.vetoed.restored.join(' ')).toMatch(/not approved by ear/);
    expect(r.vetoed.restored.join(' ')).toMatch(/7 word\(s\) lost/);
  });
  it('an approved chain with no word loss can win; an unmeasured chain cannot', () => {
    const q = { ...QA, approvedChains: ['gentle'] };
    const ok = { nisqa: 2.4, dnsmos_ovrl: 2, bandwidth_khz: 3, rolloff99_hz: 2600, lufs: -18, voice_sim: 0.95, chain: 'gentle', words_lost: 0, low_conf_rise: 0 };
    expect(pickListening({ original: ioas.original, g: ok }, q).pick).toBe('g');
    expect(pickListening({ original: ioas.original, g: { ...ok, words_lost: undefined } }, q).pick).toBe('original');
  });
  it('the 10-23 failure: a DFN copy that cut the roll-off 2,620 → 888 Hz is vetoed whatever its SNR', () => {
    const r = pickListening({ original: ioas.original, dfn: { ...ioas.dfn, rolloff99_hz: 888 } });
    expect(r.vetoed.dfn.join(' ')).toMatch(/roll-off 2610 → 888/);
    expect(r.pick).toBe('original');
  });
  it('never worse than the original; a changed voice, new clipping, wrong loudness or worse ASR are vetoes', () => {
    expect(pickListening({ original: { nisqa: 3 }, x: { nisqa: 2.5, words_lost: 0 } }, { ...QA, approvedChains: ['x'] }).pick).toBe('original');
    const w = { words_lost: 0 };   // intelligibility measured, so only the property under test can veto
    expect(vetoes({ ...w, voice_sim: 0.4 }, {})[0]).toMatch(/voice changed/);
    expect(vetoes({ ...w, clip_pct: 0.5 }, { clip_pct: 0 })[0]).toMatch(/clipping/);
    expect(vetoes({ ...w, lufs: -25 }, {})[0]).toMatch(/loudness/);
    expect(vetoes({ ...w, asr_logprob: -0.4 }, { asr_logprob: -0.2 })[0]).toMatch(/ASR/);
    expect(vetoes({ ...w, rolloff99_hz: 1000, removed_noise_above_speech: true }, { rolloff99_hz: 8000 })).toEqual([]);
    expect(vetoes({ voice_sim: 0.9 }, {})[0]).toMatch(/intelligibility not measured/);
  });
});

describe('QA verdict per talk', () => {
  it('Ioas restored: a big gain, but voice similarity 0.61 → a human listens', () => {
    expect(qaVerdict({ original: ioas.original, published: { ...ioas.restored, words_lost: 0 } })).toMatchObject({ verdict: 'review', gain: 3.33 });
  });
  it('a poor source barely helped while a stronger chain exists → needs-work', () => {
    expect(qaVerdict({ original: ioas.original, published: { ...ioas.dfn15, nisqa: 1.4, words_lost: 0 }, strongerAvailable: true }).verdict).toBe('needs-work');
  });
  it('a clean gain with the voice intact → pass-auto; a veto → review', () => {
    expect(qaVerdict({ original: { nisqa: 3, rolloff99_hz: 8000 }, published: { nisqa: 3.8, rolloff99_hz: 7900, voice_sim: 0.9, lufs: -18, words_lost: 0 } }).verdict).toBe('pass-auto');
    expect(qaVerdict({ original: { nisqa: 3 }, published: { nisqa: 4.5, words_lost: 2 } }).reasons[0]).toMatch(/intelligibility/);
    expect(qaVerdict({ original: ioas.original, published: { ...ioas.dfn, rolloff99_hz: 888 } }).verdict).toBe('review');
  });
});

describe('word-level intelligibility comparison', () => {
  it('a confident word the candidate dropped is counted lost; an added word is not a loss', () => {
    const o = ['Today', 'the', 'world', 'is', 'confronted', 'with', 'the', 'greatest', 'task'].map((w) => ({ w, conf: 0.9 }));
    const c = ['today', 'the', 'world', 'confronted', 'with', 'greatest', 'task', 'um'].map((w) => ({ w, conf: 0.9 }));
    expect(compareWords(o, c)).toMatchObject({ words_lost: 2, lost: ['is', 'the'] });
    expect(compareWords(o, o).words_lost).toBe(0);
  });
  it('the low-confidence share rising is measured', () => {
    const o = [{ w: 'a', conf: 0.9 }, { w: 'b', conf: 0.9 }], c = [{ w: 'a', conf: 0.3 }, { w: 'b', conf: 0.9 }];
    expect(compareWords(o, c).low_conf_rise).toBe(0.5);
  });
});
