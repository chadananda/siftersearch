// The speaker-count prescreen's call (api/lib/media/spkscreen.js): only a clean monologue is 'single'.
import { describe, it, expect } from 'vitest';
import { classifyScreen, screenEnabled, singleTurns, SCREEN, SCREEN_DEFAULT_ON } from '../../api/lib/media/spkscreen.js';

const near = (n) => Array(n).fill(0.9);
describe('speaker prescreen verdict', () => {
  it('every window near the main voice → single', () => {
    expect(classifyScreen({ sims: near(200), title: 'The Nature of God' }).verdict).toBe('single');
  });
  it('a few stray far windows in a long talk are still single; more than the allowance is not', () => {
    const far = (n) => Array(n).fill(0.1);
    expect(classifyScreen({ sims: [...near(200 - SCREEN.k), ...far(SCREEN.k)] }).verdict).toBe('single');
    expect(classifyScreen({ sims: [...near(199 - SCREEN.k), ...far(SCREEN.k + 1)] }).verdict).not.toBe('single');
  });
  it('a transcript line that needs a second person (a question taken, an introduction) → not single, whatever the voices say', () => {
    for (const line of ['Yes?', 'Pardon? I did not hear.', 'I have a question about the Covenant.', 'Mr. President, a quick one.',
      'It is my pleasure to introduce our speaker.', 'Thank you very much for coming.', 'I just want to add something.']) {
      expect(classifyScreen({ sims: near(200), texts: ['The Covenant is the axis of oneness.', line] }).verdict, line).toBe('unsure');
    }
    expect(classifyScreen({ sims: near(200), texts: ['What is the Covenant? It is the axis of oneness.', 'Yes, that is the point.'] }).verdict).toBe('single');
  });
  it('a recurring far voice → multi', () => {
    expect(classifyScreen({ sims: [...near(100), ...Array(12).fill(0.3)] }).verdict).toBe('multi');
  });
  it('titles that promise other voices are never single', () => {
    for (const title of ['Questions and Answers', 'Q&A session', 'Interview with Ali', 'Panel on the Covenant', 'Fireside talk']) {
      expect(classifyScreen({ sims: near(200), title }).verdict, title).toBe('unsure');
    }
  });
  it('too little speech to judge, or an interpreted talk → not single', () => {
    expect(classifyScreen({ sims: near(SCREEN.minWindows - 1) }).verdict).toBe('unsure');
    expect(classifyScreen({ sims: near(200), asrLang: 'multi' }).verdict).toBe('multi');
  });
  it('the flag and the single turn', () => {
    expect(screenEnabled({})).toBe(SCREEN_DEFAULT_ON);
    expect(screenEnabled({ MEDIA_SPK_PRESCREEN: '1' })).toBe(true);
    expect(screenEnabled({ MEDIA_SPK_PRESCREEN: '0' })).toBe(false);
    expect(singleTurns(61.23456)).toEqual([{ start: 0, end: 61.235, speaker: 'S1' }]);
  });
});
