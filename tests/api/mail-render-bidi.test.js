// Right-to-left in mail (Chad 10-23: a Persian prayer "line by line" arrived scrambled — `- هو الله: *He is God.*` bullets put
// the English full stop at the wrong end, wrapped into a jumble and right-aligned everything). The renderer pairs them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { markdownHtml, markdownText, pairLine, parseBilingual, normalizeBilingual, renderEmail } from '../../api/lib/mail-render.js';
import { composeLetter } from '../../worker/mail/letter.js';

// the exact lines of the letter in the screenshot
const LINES = `**Line by line**

- هو الله: *He is God.*
- ای پروردگار یاران را کامکار کن: *O Lord! Make the friends fortunate.*
- و به عبودیتت همدم و دمساز فرما: *and make them intimates and confidants in Thy servitude.*
- ترک تاجیک را همدم داند و هم‌آغوش و مهربان شمرد: *May the Turk regard the Tajik as a companion, as one embraced and kind.*
- ع ع: the signature, the initial of 'Abdu'l-Bahá.

**How it meets your English**`;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/;

describe('bilingual pairs', () => {
  it('reads one mixed line as original + translation, either order, markdown marks removed', () => {
    expect(pairLine('- هو الله: *He is God.*')).toEqual({ orig: 'هو الله', trans: 'He is God.' });
    expect(pairLine('**هو الله:** *He is God.*')).toEqual({ orig: 'هو الله', trans: 'He is God.' });
    expect(pairLine('He is God — هو الله')).toEqual({ orig: 'هو الله', trans: 'He is God' });
    expect(pairLine('The word فرنگ means Europe.')).toBeNull();                  // a sentence, not a pair
    expect(pairLine('- **گلخن (gulkhan):** a furnace')).toBeNull();             // transliterated gloss stays prose
  });
  it('a run of mixed bullets becomes one table: original right (rtl, fa), English left (ltr) — never one bidi run', () => {
    const h = markdownHtml(LINES);
    expect(h).not.toMatch(/<li/);
    const rows = h.match(/<tr>[\s\S]*?<\/tr>/g);
    expect(rows).toHaveLength(5);
    expect(h).toMatch(/<table role="presentation" class="em-bil" dir="rtl"/);
    expect(rows[1]).toMatch(/^<tr><td class="em-bil-o" dir="rtl" lang="fa" [^>]*style="[^"]*text-align:right[^"]*">ای پروردگار یاران را کامکار کن<\/td><td class="em-bil-t" dir="ltr" lang="en" [^>]*style="[^"]*text-align:left[^"]*">O Lord! Make the friends fortunate\.<\/td><\/tr>$/);
    expect(rows[4]).toContain('>the signature, the initial of &#39;Abdu&#39;l-Bahá.</td>');
    expect(h).toMatch(/Geeza Pro/);   // an Arabic-script face, larger than the body
    // the surrounding prose is untouched
    expect(h).toMatch(/<strong[^>]*>Line by line<\/strong>/);
    expect(h).toMatch(/<strong[^>]*>How it meets your English<\/strong>/);
  });
  it('the text part: original line, translation line, blank line between — no bullets, no bidi controls', () => {
    const t = markdownText(LINES);
    expect(t).toContain('هو الله\nHe is God.\n\nای پروردگار یاران را کامکار کن\nO Lord! Make the friends fortunate.\n\n');
    expect(t).not.toMatch(/[*•]|^- /m);
    expect(t).not.toMatch(BIDI_CONTROLS);
  });
  it('the structured forms Anís now writes: ```bilingual and :::bilingual, original then translation', () => {
    const body = 'هو الله\nHe is God.\n\nای پروردگار یاران را کامکار کن\nO Lord! Make the friends fortunate. <sup>1</sup>';
    for (const md of [`\`\`\`bilingual\n${body}\n\`\`\``, `:::bilingual\n${body}\n:::`]) {
      const h = markdownHtml(md);
      expect(h.match(/<tr>/g)).toHaveLength(2);
      expect(h).toContain('O Lord! Make the friends fortunate. <sup>1</sup></td>');
      expect(markdownText(md)).toBe('هو الله\nHe is God.\n\nای پروردگار یاران را کامکار کن\nO Lord! Make the friends fortunate. 1');
    }
    expect(parseBilingual('He is God.\nهو الله')).toEqual([{ orig: 'هو الله', trans: 'He is God.' }]);
  });
  it('code fences are left alone', () => {
    const md = '```\n- هو الله: He is God.\n```';
    expect(normalizeBilingual(md)).toBe(md);
  });
});

describe('direction of ordinary blocks', () => {
  it('a stray Persian word in an English sentence is isolated; the paragraph stays ltr', () => {
    const h = markdownHtml('Your typed text has words out of place, such as فرنگ (Europe) and بی درنگ (without delay).');
    expect(h).toMatch(/^<p dir="ltr"/);
    expect(h).toContain('such as <span dir="rtl" lang="fa">فرنگ</span> (Europe) and <span dir="rtl" lang="fa">بی درنگ</span> (without delay).');
  });
  it('a Persian paragraph is rtl and right-aligned, without inner spans', () => {
    const h = markdownHtml('> ظلمت دیجور بنور تبدیل گردد. توئی توانا و بینا و شنوا.');
    expect(h).toMatch(/<p dir="rtl" lang="fa" style="text-align:right;font-family:/);
    expect(h).not.toContain('<span dir');
  });
  it('a table cell follows its own script', () => {
    const h = markdownHtml('| Original | English |\n|---|---|\n| عرفان | knowledge |');
    expect(h).toMatch(/<td dir="rtl" lang="ar" style="text-align:right;[^"]*">عرفان<\/td>/);
    expect(h).toMatch(/<td dir="auto" style="[^"]*">knowledge<\/td>/);
  });
});

describe('an all-English letter is byte-identical to before the change', () => {
  it('html and text', () => {
    const md = readFileSync(new URL('../fixtures/mail/english-letter.md', import.meta.url), 'utf8');
    const { html, text } = composeLetter(md, 'https://x/p');
    expect(html).toBe(readFileSync(new URL('../fixtures/mail/english-letter.html', import.meta.url), 'utf8'));
    expect(text).toBe(readFileSync(new URL('../fixtures/mail/english-letter.txt', import.meta.url), 'utf8'));
  });
  it('the document carries the phone stacking rule', () => {
    expect(renderEmail({ markdown: 'hi' }).html).toMatch(/@media \(max-width:420px\)\{\s*table\.em-bil/);
  });
});
