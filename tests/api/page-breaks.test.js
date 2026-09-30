// Print-page breaks: kept in the source, out of paragraph text, recorded per paragraph.
import { describe, it, expect } from 'vitest';
import { applyPageBreaks, protectPageBreaks } from '../../api/lib/page-breaks.js';

describe('applyPageBreaks', () => {
  it('records the page a paragraph starts on and the breaks inside it; strips tags and footnote comments', () => {
    const out = applyPageBreaks([
      { text: '<pb vol="1" n="306"/> أول الفقرة' },
      { text: 'وابناها حبيب <!-- fn: [1] في ضبط اسمه خلاف. --> <pb vol="1" n="307"/> وعبد الله', blocktype: 'paragraph' },
      { text: 'بعدها' },
    ]);
    expect(out[0]).toMatchObject({ text: 'أول الفقرة', attrs: { pdf_page: '306', pdf_vol: 1 } });
    expect(out[1].text).toBe('وابناها حبيب وعبد الله');
    expect(out[1].attrs).toMatchObject({ pdf_page: '306', pdf_vol: 1, pb: [[13, 1, 307]] });
    expect(out[1].text.slice(13)).toBe('وعبد الله');               // the offset lands on the first word of the new page
    expect(out[2].attrs).toMatchObject({ pdf_page: '307', pdf_vol: 1 });
  });
  it('an unnumbered break keeps its place but sets no page; a chunk holding only a break is dropped', () => {
    const out = applyPageBreaks([{ text: '<pb/>' }, { text: 'نص <pb/> تتمة' }]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('نص تتمة');
    expect(out[0].attrs.pb).toEqual([[3, null, null]]);
  });
  it('understands the protected token the AI segmenter carries through', () => {
    const t = protectPageBreaks('أ <pb vol="2" n="5"/> ب');
    expect(t).toBe('أ ⟦pb:2:5⟧ ب');
    expect(applyPageBreaks([{ text: t }])[0]).toMatchObject({ text: 'أ ب', attrs: { pb: [[2, 2, 5]] } });
  });
  it('leaves text without breaks untouched', () => {
    const out = applyPageBreaks([{ text: 'plain', attrs: { id: 'x' } }]);
    expect(out[0]).toEqual({ text: 'plain', attrs: { id: 'x' } });
  });
});
