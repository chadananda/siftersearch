// Chad 10-20: "how am I supposed to decide on importing documents that are RTF if they cannot be displayed".
import { describe, it, expect } from 'vitest';
import { previewHtml, sanitizeHtml, PREVIEWABLE } from '../../api/lib/dewey/preview.js';

describe('Dewey file preview', () => {
  it('RTF, Word, WordPerfect, ODT and EPUB are converted; PDF and text are shown as they are', async () => {
    for (const x of ['rtf', 'doc', 'docx', 'wpd', 'odt', 'epub']) expect(PREVIEWABLE.has(x)).toBe(true);
    expect(await previewHtml('/x/book.pdf')).toBeNull();
    expect(await previewHtml('/x/notes.txt')).toBeNull();
  });
  it('an RTF goes through the office converter and comes back readable', async () => {
    const out = await previewHtml('/x/letter.rtf', { read: async () => Buffer.from('{\\rtf1 hi}'), office: async (_b, ext) => `<html><body><p>Dear friend (${ext})</p></body></html>` });
    expect(out.html).toContain('<p>Dear friend (rtf)</p>');
    expect(out.html).toContain("default-src 'none'");
  });
  it('nothing that runs or fetches survives', () => {
    const h = sanitizeHtml(`<body><p onclick="x()">a</p><script>alert(1)</script><a href="javascript:x">l</a><img src="http://t/x.gif"><iframe src="http://e"></iframe><a href="https://evil">e</a><style>@import url(http://e/c.css); p{color:red}</style></body>`);
    expect(h).not.toMatch(/onclick|<script|javascript:|<img|<iframe|https:\/\/evil|@import|http:\/\/e/);
    expect(h).toContain('<p>a</p>');
  });
});
