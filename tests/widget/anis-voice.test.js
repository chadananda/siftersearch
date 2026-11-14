// Anís voice pure helpers (src/widget/voice-core.js): sentence splitting, silence tracking, level, MIME choice.
import { describe, it, expect } from 'vitest';
import { lastBoundary, sentenceStream, sentences, sayable, silenceTracker, bargeTracker, rms, orbScale, pickMime, worthSending, STATE_TEXT } from '../../src/widget/voice-core.js';

describe('sentence splitter', () => {
  it('splits finished sentences and keeps the unfinished tail', () => {
    const s = sentenceStream({ minChars: 1 });
    expect(s.push('The Báb was born in Shiraz in 1819. He declared his mis')).toEqual(['The Báb was born in Shiraz in 1819.']);
    expect(s.push('sion in 1844! Then')).toEqual(['He declared his mission in 1844!']);
    expect(s.flush()).toEqual(['Then']);
  });
  it('never splits after an initial or abbreviation, or inside a link or template', () => {
    expect(lastBoundary('By H. M. Balyuzi')).toBe(-1);
    expect(lastBoundary('See e.g. the Íqán')).toBe(-1);
    expect(lastBoundary('Read [the Tablet. Of Ahmad](https://x.org/a. b')).toBe(-1);
    expect(lastBoundary('{{book: Íqán. p}}')).toBe(-1);
    expect(sentences('By H. M. Balyuzi, a fine book. Next one here now.', { minChars: 1 })).toEqual(['By H. M. Balyuzi, a fine book.', 'Next one here now.']);
  });
  it('makes text sayable: links, emphasis, headings, markers and templates dropped', () => {
    expect(sayable('## Title\n<!-- widget:book -->\n**Bold** [link](https://a.b) {{card x}} end')).toBe('Title Bold link end');
    expect(sentences('# Heading\n\nA paragraph with *emphasis* that is long.\n\n- item one is here\n- item two is here', { minChars: 1 }))
      .toEqual(['Heading', 'A paragraph with emphasis that is long.', 'item one is here item two is here']);
  });
  it('short sentences ride with the next; the last always flushes', () => {
    expect(sentences('Yes. It was in Baghdad that he declared it.')).toEqual(['Yes. It was in Baghdad that he declared it.']);
    expect(sentences('No.')).toEqual(['No.']);
    expect(sentences('')).toEqual([]);
  });
  it('a paragraph break ends a sentence even without a stop; closing quotes stay with it', () => {
    expect(sentences('He said, "Be generous in prosperity." Then he left the room.', { minChars: 1 })).toEqual(['He said, Be generous in prosperity.', 'Then he left the room.']);
    expect(sentences('A list heading\n\nThe next paragraph.', { minChars: 1 })).toEqual(['A list heading', 'The next paragraph.']);
  });
  it('a long reply splits fast (one pass)', () => {
    const md = 'This is one sentence of moderate length. '.repeat(400);
    const t0 = Date.now();
    expect(sentences(md).length).toBe(400);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('silence tracker', () => {
  const run = (tr, frames) => frames.map(([lvl, t]) => tr.feed(lvl, t)).filter(Boolean);
  it('starts after minSpeechMs of voice and ends after hangMs of quiet', () => {
    const tr = silenceTracker({ threshold: 0.02, minSpeechMs: 200, hangMs: 1000 });
    const f = [];
    for (let t = 0; t <= 500; t += 50) f.push([0.005, t]);
    for (let t = 550; t <= 1500; t += 50) f.push([0.1, t]);
    for (let t = 1550; t <= 2600; t += 50) f.push([0.004, t]);
    expect(run(tr, f)).toEqual(['start', 'end']);
  });
  it('a click shorter than minSpeechMs is not speech', () => {
    const tr = silenceTracker({ minSpeechMs: 200 });
    expect(run(tr, [[0.005, 0], [0.3, 50], [0.3, 100], [0.004, 150], [0.004, 400]])).toEqual([]);
  });
  it('a short pause mid-sentence does not end the turn', () => {
    const tr = silenceTracker({ hangMs: 1000, minSpeechMs: 100 });
    expect(run(tr, [[0.1, 0], [0.1, 150], [0.005, 400], [0.005, 900], [0.1, 1000], [0.005, 1500], [0.005, 2100]])).toEqual(['start', 'end']);
  });
  it('the noise floor adapts: a steady hum stops counting as speech', () => {
    const tr = silenceTracker({ threshold: 0.02, ratio: 2.5, minSpeechMs: 300, hangMs: 500 });
    const f = []; for (let t = 0; t < 5000; t += 50) f.push([0.03, t]);
    run(tr, f);
    expect(tr.floor).toBeGreaterThan(0.015);
    expect(tr.loud(0.03)).toBe(false);
    expect(tr.loud(0.2)).toBe(true);
  });
  it('maxMs ends an endless turn', () => {
    const tr = silenceTracker({ minSpeechMs: 0, maxMs: 1000 });
    const f = []; for (let t = 0; t <= 1200; t += 100) f.push([0.2, t]);
    expect(run(tr, f).slice(0, 2)).toEqual(['start', 'end']);   // the caller stops listening at 'end'
  });
  it('barge-in needs louder, longer speech than a turn start', () => {
    expect(run(bargeTracker(), [[0.04, 0], [0.04, 200], [0.04, 500]])).toEqual([]);
    expect(run(bargeTracker(), [[0.2, 0], [0.2, 200], [0.2, 400]])).toEqual(['start']);
  });
});

describe('level, orb, mime, copy', () => {
  it('rms of float and byte frames', () => {
    expect(rms(new Float32Array([0, 0, 0]))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Uint8Array([128, 128]))).toBe(0);
    expect(rms(new Uint8Array([192, 64]))).toBeCloseTo(0.5);
    expect(rms(null)).toBe(0);
  });
  it('orb scale is bounded', () => {
    expect(orbScale(0)).toBe(1);
    expect(orbScale(1)).toBe(1.35);
    expect(orbScale(-1)).toBe(1);
  });
  it('picks the first supported recorder format', () => {
    expect(pickMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMime(() => false)).toBe('');
    expect(pickMime(undefined)).toBe('');
  });
  it('filters empty and hallucinated transcripts', () => {
    expect(worthSending('Who was Táhirih?')).toBe(true);
    expect(worthSending('  . ')).toBe(false);
    expect(worthSending('Thank you.')).toBe(false);
    expect(worthSending('you')).toBe(false);
  });
  it('state copy', () => { expect(STATE_TEXT.listening).toBe('Listening…'); expect(STATE_TEXT.speaking).toBe('Speaking…'); expect(STATE_TEXT.thinking).toBe('Thinking…'); });
});
