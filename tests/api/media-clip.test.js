// Clips: stateless /media/<slug>/clip/<startMs>-<endMs> — parsing, snapping to words (≤ 3 min), the words they cover,
// the short's post text; and the clip quote-card route.
import { describe, it, expect } from 'vitest';
import { parseClipRange, snapClip, clipText, clipPath, CLIP_MAX_MS } from '../../api/lib/media/clip-text.js';
import { shortPostText } from '../../src/lib/share.js';

const paragraphs = [{ words: [['The', 1, 1.2], ['soul', 1.2, 1.6], ['um', 1.6, 1.8, 1], ['is', 1.8, 2], ['eternal', 2, 2.6], ['.', 2.6, 2.6]] }, { words: [{ w: 'Yes', s: 300, e: 300.5 }] }];

describe('clips', () => {
  it('parses and caps a range', () => {
    expect(parseClipRange('1000-2600')).toEqual({ startMs: 1000, endMs: 2600 });
    expect(parseClipRange('1000-2600.jpg')).toEqual({ startMs: 1000, endMs: 2600 });
    expect(parseClipRange('0-999999').endMs).toBe(CLIP_MAX_MS);
    expect(parseClipRange('5-5')).toBe(null); expect(parseClipRange('abc')).toBe(null);
  });
  it('snaps a selection to word boundaries within 3 minutes', () => {
    const words = [{ s: 1, e: 1.2 }, { s: 1.2, e: 1.6 }, { s: 100, e: 100.4 }, { s: 200, e: 200.5 }];
    expect(snapClip(words, 1.1, 1.5)).toEqual({ startMs: 1000, endMs: 1600 });
    expect(snapClip(words, 0, 999)).toEqual({ startMs: 1000, endMs: 100400 });
    expect(snapClip(words, 500, 600)).toBe(null);
  });
  it('reads the clean words of the span (hidden words dropped)', () => {
    expect(clipText(paragraphs, 1000, 2600)).toBe('The soul is eternal.');
    expect(clipPath('a b', 1000.4, 2600)).toBe('/media/a%20b/clip/1000-2600');
  });
  it('writes the short post with the link back to the talk', () => {
    const t = shortPostText({ text: 'The soul is eternal.', speaker: 'Hooper Dunbar', title: 'Soul', year: 1988, talkUrl: 'https://siftersearch.com/media/x?t=1' });
    expect(t).toContain('“The soul is eternal.”');
    expect(t).toContain('— Hooper Dunbar, “Soul”, 1988');
    expect(t).toContain('Hear the whole talk: https://siftersearch.com/media/x?t=1');
    expect(t).toContain('#HooperDunbar');
  });
});
