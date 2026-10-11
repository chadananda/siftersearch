// Phrase-index segmentation (Chad 10-11): phrases free, sentences = which phrase starts, markers around the ORIGINAL text.
import { describe, it, expect } from 'vitest';
import { needsModel, phraseSpans, requestText, parseStarts, markSentences, undiacritize } from '../../api/lib/segment/phrase-segment.js';

const para = 'حَدَّثَنَا فُلَانٌ عَنْ فُلَانٍ قَالَ إِذَا كَانَ الْمَاءُ قَدْرَ كُرٍّ لَمْ يُنَجِّسْهُ شَيْءٌ 2- وَبِهَذَا الْإِسْنَادِ عَنْ فُلَانٍ قَالَ لَا بَأْسَ';
describe('phrase-segment', () => {
  it('needsModel: unpunctuated and longer than ~one sentence', () => {
    expect(needsModel(Array(60).fill('كلمة').join(' '))).toBe(true);
    expect(needsModel(Array(20).fill('كلمة').join(' '))).toBe(false);
    expect(needsModel(Array(60).fill('كلمة.').join(' '))).toBe(false);
  });
  it('a numbered report always opens a phrase', () => {
    const spans = phraseSpans(para, 'ar');
    expect(spans.some((s) => para.slice(s.start, s.end).startsWith('2-'))).toBe(true);
  });
  it('request text is undiacritized and numbered; parseStarts keeps phrase 1', () => {
    const t = requestText([{ key: 'P7', phrases: ['حَدَّثَنَا فُلَانٌ', 'قَالَ'] }]);
    expect(t).toBe(`P7:\n[1] ${undiacritize('حَدَّثَنَا فُلَانٌ')}\n[2] ${undiacritize('قَالَ')}`);
    expect([...parseStarts('{"P7":[3]}', ['P7']).P7]).toEqual([1, 3]);
    expect(parseStarts('no json', ['P7'])).toBe(null);
  });
  it('markSentences wraps whole phrases and strips back to the original exactly', () => {
    const spans = phraseSpans(para, 'ar');
    const k = spans.findIndex((s) => para.slice(s.start, s.end).startsWith('2-')) + 1;
    const r = markSentences(para, spans, new Set([1, k]));
    expect(r.sentences).toBe(2);
    expect(r.text.replace(/⁅\/?s\d+⁆/g, '')).toBe(para);
    expect(r.text.startsWith('⁅s1⁆حَدَّثَنَا')).toBe(true);
    expect(r.text).toContain('⁅s2⁆2- وَبِهَذَا');
  });
});

describe('paragraph segmentation by index', () => {
  it('parses both levels (paragraph starts are sentence starts) and splits without losing a word', async () => {
    const { parseParagraphReply, buildParagraphs, phraseSpans } = await import('../../api/lib/segment/phrase-segment.js');
    const spans = phraseSpans(para, 'ar');
    const k = spans.findIndex((s) => para.slice(s.start, s.end).startsWith('2-')) + 1;
    const r = parseParagraphReply(`{"sentences":[1],"paragraphs":[${k}]}`);
    expect([...r.sentences].sort()).toEqual([1, k].sort());
    const blocks = buildParagraphs(para, spans, r);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].startsWith('⁅s1⁆2- وَبِهَذَا')).toBe(true);
    expect(blocks.join(' ').replace(/⁅\/?s\d+⁆/g, '')).toBe(para);
    expect(parseParagraphReply('{"sentences":[1]}')).toBe(null);
  });
});
