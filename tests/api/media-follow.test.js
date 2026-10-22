// Follow mode on the talk page: where the playing line is held, how far to scroll, and when a scroll is the reader's.
import { describe, it, expect } from 'vitest';
import { anchorFor, followStep, isManualScroll, CHROME_PX } from '../../src/lib/media-follow.js';

describe('follow mode', () => {
  it('holds the clicked line where it is when comfortably on screen, else at 35 %', () => {
    expect(anchorFor(400, 900)).toBe(400);
    expect(anchorFor(null, 900)).toBe(315);
    expect(anchorFor(800, 900)).toBe(315);            // too low
    expect(anchorFor(90, 900)).toBe(315);             // under the nav / slim player
    expect(anchorFor(null, 360)).toBe(CHROME_PX + 24);  // a short viewport never anchors under the chrome
  });
  it('scrolls by the line\'s distance from the anchor, once per line', () => {
    expect(followStep(500, 1000, 315)).toEqual({ delta: 185, pageTop: 1500 });
    expect(followStep(317, 1000, 315)).toEqual({ delta: 0, pageTop: 1317 });            // already there
    expect(followStep(500, 1000, 315, 1502)).toEqual({ delta: 0, pageTop: 1502 });      // same line as last time
    expect(followStep(500, 1000, 315, 1502, true).delta).toBe(185);                     // forced (rejoin)
    expect(followStep(200, 1000, 315).delta).toBe(-115);                                // a line above: scroll up
  });
  it('pauses on the reader\'s own scrolling, not on momentum right after play starts', () => {
    expect(isManualScroll({ type: 'wheel' }, { playing: true, sinceStartMs: 5000 })).toBe(true);
    expect(isManualScroll({ type: 'touchmove' }, { playing: true, sinceStartMs: 5000 })).toBe(true);
    expect(isManualScroll({ type: 'keydown', key: 'PageDown' }, { playing: true, sinceStartMs: 5000 })).toBe(true);
    expect(isManualScroll({ type: 'keydown', key: 'a' }, { playing: true, sinceStartMs: 5000 })).toBe(false);
    expect(isManualScroll({ type: 'wheel' }, { playing: true, sinceStartMs: 300 })).toBe(false);
    expect(isManualScroll({ type: 'wheel' }, { playing: false, sinceStartMs: 5000 })).toBe(false);
  });
});
