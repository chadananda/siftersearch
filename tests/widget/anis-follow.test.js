// Stream auto-follow lets go the moment the reader scrolls up (Chad 11-14).
import { describe, it, expect } from 'vitest';
import { follower, nearBottom } from '../../src/widget/follow.js';

function fakeEl() {
  const ls = {};
  return { scrollTop: 0, scrollHeight: 1000, clientHeight: 400,
    addEventListener: (t, f) => { ls[t] = f; }, removeEventListener: (t) => { delete ls[t]; }, fire: (t, e = {}) => ls[t]?.(e) };
}

describe('anis stream follow', () => {
  it('follows new content while the reader is at the bottom', () => {
    const el = fakeEl(), f = follower(el);
    f.scroll(); expect(el.scrollTop).toBe(1000);
    el.scrollHeight = 1400; f.scroll(); expect(el.scrollTop).toBe(1400);
  });
  it('stops at once on an upward wheel, before any scroll event', () => {
    const el = fakeEl(), f = follower(el); f.scroll();
    el.fire('wheel', { deltaY: -40 });
    el.scrollHeight = 1600; f.scroll(); expect(el.scrollTop).toBe(1000);
  });
  it('stops when the reader scrolls up (keys, scrollbar, touch)', () => {
    const el = fakeEl(), f = follower(el); f.scroll();
    el.scrollTop = 200; el.fire('scroll');
    el.scrollHeight = 1600; f.scroll(); expect(el.scrollTop).toBe(200); expect(f.following).toBe(false);
  });
  it('resumes when the reader returns to the bottom', () => {
    const el = fakeEl(), f = follower(el); f.scroll();
    el.scrollTop = 200; el.fire('scroll');
    el.scrollTop = el.scrollHeight - el.clientHeight; el.fire('scroll');
    el.scrollHeight = 2000; f.scroll(); expect(el.scrollTop).toBe(2000);
  });
  it('a downward wheel does not let go; the reader\'s own act (send) forces follow', () => {
    const el = fakeEl(), f = follower(el); f.scroll();
    el.fire('wheel', { deltaY: 30 }); expect(f.following).toBe(true);
    el.fire('wheel', { deltaY: -30 }); f.scroll(true); expect(f.following).toBe(true);
  });
  it('nearBottom tolerates a small slack', () => {
    expect(nearBottom({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(true);
    expect(nearBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 })).toBe(false);
  });
});
