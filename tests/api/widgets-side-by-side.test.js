// Display widget side_by_side: build from aligned passages (verbatim, spans, approximate), markdown/HTML renderers, tight + study sentence pairing, segments swap, PDF print keeps Arabic.
import { describe, it, expect } from 'vitest';
import { getDocumentProxy, extractText } from 'unpdf';
import { buildSideBySide, sentences, studyRows, toMarkdown, toHtml } from '../../api/lib/assistant/widgets/side-by-side.js';
import { widgetBlock, renderWidget, MODES } from '../../api/lib/assistant/widgets/index.js';
import { widgetSegments, widgetMarker, APPROX_NOTE } from '../../api/lib/assistant/widgets/segments.js';
import { renderPdf } from '../../api/lib/assistant/pdf/render.js';

const AR = ['إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ', 'فَصَلِّ لِرَبِّكَ وَانْحَرْ', 'إِنَّ شَانِئَكَ هُوَ الْأَبْتَرُ'];
const orig = (i, extra = {}) => ({ id: 100 + i, role: 'original', language: 'ar', document_id: 1, paragraph_index: i, title: 'Qur’án 108', text: `⁅s1⁆${AR[i]}⁅/s1⁆`, source_url: `https://o/ar#p${i}`, ...extra });
const tr = (id, text, aligned_to, extra = {}) => ({ id, role: 'translation', language: 'en', document_id: 2, title: 'Kawthar', translator: 'Rodwell', text, aligned_to, exact: true, source_url: `https://o/en#p${id}`, ...extra });

describe('buildSideBySide', () => {
  it('one row per original, Arabic verbatim, markers stripped, a spanning translation is one cell', () => {
    const d = buildSideBySide([orig(2), orig(0), orig(1), tr(500, 'Verily We have given thee Kawthar. So pray. Thy foe is cut off.', [100, 101, 102])]);
    expect(d.rows.map((r) => r.original.text)).toEqual(AR);
    expect(JSON.stringify(d)).not.toMatch(/⁅/);
    expect(d.original).toMatchObject({ lang: 'ar', dir: 'rtl', label: 'Arabic' });
    expect(d.rows[0].translations[0]).toMatchObject({ span: 3, url: 'https://o/en#p500' });
    expect(d.rows[1].translations[0]).toBeNull(); expect(d.rows[2].translations[0]).toBeNull();
    expect(d.approximate).toBe(false);
  });
  it('verse-by-verse cells, an uncovered verse is an empty cell, non-exact alignment sets approximate', () => {
    const d = buildSideBySide([orig(0), orig(1), orig(2), tr(500, 'A', [100]), tr(501, 'C', [102], { exact: false })]);
    expect(d.rows.map((r) => r.translations[0].text)).toEqual(['A', '', 'C']);
    expect(d.approximate).toBe(true);
  });
  it('no aligned_to: pairs by index when counts match; null without an original', () => {
    const d = buildSideBySide([orig(0), orig(1), tr(500, 'one'), tr(501, 'two')]);
    expect(d.rows.map((r) => r.translations[0].text)).toEqual(['one', 'two']);
    expect(buildSideBySide([tr(500, 'x')])).toBeNull();
  });
});

describe('markdown and segments', () => {
  const d = buildSideBySide([orig(0), orig(1), tr(500, 'A | b', [100]), tr(501, 'B', [101], { exact: false })]);
  it('table: header, separator, one line per row, pipes escaped, note when approximate', () => {
    const lines = toMarkdown(d).split('\n');
    expect(lines[0]).toBe('| *Qur’án 108* — Arabic · original | *Kawthar* — English · tr. Rodwell |');
    expect(lines[1]).toBe('| --- | --- |');
    expect(lines[2]).toContain(AR[0]); expect(lines[2]).toContain('A \\| b');
    expect(lines.at(-1)).toBe(APPROX_NOTE);
    expect(lines.join('\n')).toContain('| [o](https://o/ar#p0) | [o](https://o/en#p500) |');   // sources: one bottom row, cells never links
    expect(lines[2]).not.toContain('](');
  });
  it('a byline beside a long original is no column; Phelps only when no column has a real source', () => {
    const long = { ...orig(0), text: 'ب'.repeat(260), source_url: 'https://oceanoflights.org/bab-inba-053/#:~:text=x' };
    const d2 = buildSideBySide([long, tr(500, 'by the Bab', [100], { document_id: 3 }), tr(501, 'Then from the letter Vav is the absolute Guardianship …', [100], { source_url: 'https://portlandiator.github.io/PI_browser/?id=BB00007' })]);
    expect(d2.translations).toHaveLength(1);
    expect(d2.original.source).toMatchObject({ name: 'Ocean of Lights' });
    expect(d2.translations[0].source).toBeNull();
    expect(d2.work.url).toBe('https://oceanoflights.org/bab-inba-053/');
    const only = buildSideBySide([{ ...orig(0), source_url: null }, tr(501, 'x y z w', [100], { source_url: 'https://portlandiator.github.io/PI_browser/?id=BB1' })]);
    expect(only.translations[0].source).toMatchObject({ name: 'Phelps Inventory' });
  });
  it('titles: main, subtitle and provisional split off', async () => {
    const { titleParts } = await import('../../api/lib/assistant/widgets/side-by-side.js');
    expect(titleParts("Tafsir-i-Suratu'l-Kawthar (Commentary on the Surah of Kawthar) (provisional translation)")).toEqual({ main: "Tafsir-i-Suratu'l-Kawthar", sub: 'Commentary on the Surah of Kawthar', provisional: true });
  });
  it('marker + table swap to a widget segment, text around kept', () => {
    const md = `Framing line.\n\n${widgetBlock(d)}\n\nAfter.`;
    expect(md).toContain(widgetMarker(d.id));
    const s = widgetSegments(md, [d]);
    expect(s.map((x) => x.kind)).toEqual(['text', 'widget', 'text']);
    expect(s[1].widget.id).toBe(d.id); expect(s[2].md).toContain('After.');
    expect(widgetSegments(md, [])).toEqual([{ kind: 'text', md }]);
    // streaming: a marker with its table not yet (or half) arrived is already the widget — no raw table ever shows
    const head = `Framing line.\n\n${widgetMarker(d.id)}\n`;
    expect(widgetSegments(head, [d]).map((x) => x.kind)).toEqual(['text', 'widget']);
    const half = `${head}\n${widgetBlock(d).split('\n').slice(2).join('\n').slice(0, -20)}`;
    expect(widgetSegments(half, [d]).map((x) => x.kind)).toEqual(['text', 'widget']);
  });
});

describe('sentence pairing (study layout)', () => {
  it('splits Arabic on ۔ ؟ ! . and verse marks, English on . ? ! ;, never inside a sentence', () => {
    expect(sentences('قال الله. هل أتاك؟ نعم! ثم ۝١ انتهى')).toEqual(['قال الله.', 'هل أتاك؟', 'نعم!', 'ثم ۝١', 'انتهى']);
    expect(sentences('He came; he saw. Did he? Yes!')).toEqual(['He came;', 'he saw.', 'Did he?', 'Yes!']);
  });
  const mk = (o, t) => buildSideBySide([{ id: 1, role: 'original', language: 'ar', document_id: 1, paragraph_index: 0, text: o }, { id: 2, role: 'translation', language: 'en', document_id: 2, text: t, aligned_to: [1], exact: true }], { layout: 'study' });
  it('equal counts pair in order', () => {
    const r = studyRows(mk('أولى. ثانية. ثالثة.', 'One. Two. Three.'));
    expect(r.map((x) => [x.original.text, x.translations[0].text])).toEqual([['أولى.', 'One.'], ['ثانية.', 'Two.'], ['ثالثة.', 'Three.']]);
  });
  it('unequal counts: the surplus shares the last row; nothing dropped or reordered', () => {
    const more = studyRows(mk('أولى. ثانية. ثالثة. رابعة.', 'One. Two.'));
    expect(more).toHaveLength(2);
    expect(more[1].original.text).toBe('ثانية. ثالثة. رابعة.'); expect(more[1].translations[0].text).toBe('Two.');
    const fewer = studyRows(mk('أولى. ثانية.', 'One. Two. Three. Four.'));
    expect(fewer).toHaveLength(2);
    expect(fewer.map((x) => x.translations[0].text).join(' ')).toBe('One. Two. Three. Four.');
    expect(fewer.map((x) => x.original.text).join(' ')).toBe('أولى. ثانية.');
  });
  it('a spanning translation pairs against all the originals it covers', () => {
    const d = buildSideBySide([orig(0), orig(1), tr(500, 'Given. Pray.', [100, 101])], { layout: 'study' });
    expect(studyRows(d).map((x) => x.translations[0].text)).toEqual(['Given.', 'Pray.']);
  });
});

describe('HTML per mode', () => {
  const d = buildSideBySide([orig(0), tr(500, 'Given.', [100], { exact: false })]);
  it('chat/embed use classes + rtl cells; email/print inline styles; layout switches rows', () => {
    expect(MODES).toEqual(['chat', 'embed', 'email', 'print']);
    const chat = renderWidget(d, 'chat');
    expect(chat).toContain('class="sbs tight"'); expect(chat).toContain('dir="rtl"'); expect(chat).toContain('lang="ar"'); expect(chat).toContain(AR[0]);
    const mail = renderWidget(d, 'email');
    expect(mail).toContain('style="'); expect(mail).not.toContain('<style>'); expect(mail).toContain('Aligned approximately');
    const multi = buildSideBySide([{ ...orig(0), text: 'أولى. ثانية.' }, tr(500, 'One. Two.', [100])]);
    expect((toHtml(multi, { mode: 'chat', layout: 'study' }).match(/<tr>/g) || []).length).toBe(4);   // + the sources row
    expect((toHtml(multi, { mode: 'chat', layout: 'tight' }).match(/<tr>/g) || []).length).toBe(3);
    expect(renderWidget(d, 'nope')).toBe('');
  });
});

describe('print (PDF)', () => {
  it('Arabic original is in the PDF (not dropped) for both layouts', async () => {
    for (const layout of ['tight', 'study']) {
      const d = buildSideBySide([orig(0), orig(1), tr(500, 'Verily We have given thee Kawthar.', [100, 101])], { layout, workUrl: 'https://oceanlibrary.com/book/1' });
      const buf = await renderPdf({ title: 'Kawthar', markdown: `Framing.\n\n${widgetBlock(d)}`, widgets: [d] });
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
      expect(text).toContain('Kawthar'); expect(text).toMatch(/[؀-ۿ]/);
    }
  });
  it('an anchor in Arabic script is the original even when catalogued "en" (kawthar: the writer built its own table)', () => {
    const w = buildSideBySide([
      { id: 1, document_id: 20171, paragraph_index: 0, language: 'en', text: 'بسم اللّه الرحمن الرحيم' },
      { id: 9, document_id: 77, paragraph_index: 0, language: 'en', role: 'translation', aligned_to: [1], text: 'In the Name of God' }]);
    expect(w.original.lang).toBe('ar'); expect(w.original.dir).toBe('rtl');
    expect(w.rows).toHaveLength(1); expect(w.rows[0].translations[0].text).toBe('In the Name of God');
  });
});
