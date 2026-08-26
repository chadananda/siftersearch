// Reading an original from bahai.org's library — and separating the text from the chrome around it.
import { describe, it, expect } from 'vitest';
import { splitParagraphNumber, bodyParagraphs } from '../../api/lib/rag/concepts/bahai-org.js';

describe('splitParagraphNumber', () => {
  it('reads a Persian-digit paragraph number and strips it without transliterating the text', () => {
    const { n, text } = splitParagraphNumber('۵ و همچنین ثبت و ذکر شئ در کتاب سبب وجود شئ نگردد');
    expect(n).toBe(5);
    expect(text).toBe('و همچنین ثبت و ذکر شئ در کتاب سبب وجود شئ نگردد');
  });

  it('reads Arabic-Indic digits too', () => {
    expect(splitParagraphNumber('١٠٥ انّ الّذی يأوّل').n).toBe(105);
  });

  it('reports null for an unnumbered block rather than guessing', () => {
    expect(splitParagraphNumber('مجموعه‌ای از متن گفتگوهای حضرت عبدالبهاء').n).toBe(null);
  });
});

describe('bodyParagraphs — the number IS the filter', () => {
  // The page furniture is prose in the same script inside the same tags, so no length or language rule
  // separates it. But bahai.org numbers every body paragraph and numbers nothing else.
  const html = `
    <p>مجموعه‌ای از متن گفتگوهای حضرت عبدالبهاء بر سر نهار در عکّا بین سال‌های ۱۹۰۴ و ۱۹۰۶</p>
    <p>با قرار دادن نشانگر ماوس کامپیوتر در سمت راست ابتدای هر پاراگراف، مستطیل آبی رنگی نمایان می‌شود</p>
    <p>۱ طبیعت کیفیّتیست و یا حقیقتیست که بظاهر حیات و ممات و بعبارت اخری ترکیب و تحلیل کافّۀ اشیا راجع باوست</p>
    <p>۲ ریاضیّون بحساب فلکی واقف شوند که چندی بعد خسوف و کسوف واقع خواهد گشت البتّه این کشف سبب وقوع نه</p>`;

  it('keeps the numbered text and drops the unnumbered chrome', () => {
    const out = bodyParagraphs(html);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.n)).toEqual([1, 2]);
    expect(out[0].text.startsWith('طبیعت')).toBe(true);
  });

  it('needs no allow-list of CSS classes, which is what makes it survive a redesign', () => {
    const restyled = html.replace(/<p>/g, '<p class="sc-v0a083-2 hZhLxc">');
    expect(bodyParagraphs(restyled)).toHaveLength(2);
  });

  it('drops a numbered fragment too short to be a paragraph', () => {
    expect(bodyParagraphs('<p>۱۱ ذی الحجّۀ ۱۳۲۵</p>')).toHaveLength(0);   // a dateline in the front matter
  });
});
