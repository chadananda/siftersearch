// The ONE email renderer (api/lib/mail-render.js): every mail is multipart — HTML rendered from Markdown, plain text
// without Markdown syntax (Chad 10-22: "Anís digests of unrendered markdown … ensure the actual emails were rendered").
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderEmail, markdownHtml, markdownText } from '../../api/lib/mail-render.js';

const MD = '## The opening\n\nThe word **ḥakam** means *judge*. See [Seven Valleys](https://oceanlibrary.com/sv#p1).\n\n'
  + '- *fā\'*: singleness\n- *rā\'*: lordship\n\n> "to every letter a meaning is allotted"\n\n| Original | English |\n|---|---|\n| عرفان | **knowledge** |';
const NO_MD = /\*\*|^#{1,6}\s|\]\(|^\s*[-*]\s|^>\s|\|---/m;

describe('renderEmail — markdown in, multipart out', () => {
  it('HTML has strong, links and lists; the text part has none of the syntax but keeps the URL', () => {
    const { html, text } = renderEmail({ markdown: MD });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toMatch(/<strong style="[^"]*">ḥakam<\/strong>/);
    expect(html).toMatch(/<a style="[^"]*" href="https:\/\/oceanlibrary.com\/sv#p1">Seven Valleys<\/a>/);
    expect(html).toMatch(/<ul style="[^"]*">\s*<li/);
    expect(html).toMatch(/<blockquote style=/);
    expect(text).not.toMatch(NO_MD);
    expect(text).toContain('The opening');
    expect(text).toContain('Seven Valleys (https://oceanlibrary.com/sv#p1)');
    expect(text).toMatch(/^• fā': singleness$/m);
    expect(text).toContain('عرفان  ·  knowledge');
  });
  it('is safe: raw HTML is shown as text, script/javascript links never render', () => {
    const h = markdownHtml('<script>alert(1)</script>\n\nhi <mark>noted</mark> [x](javascript:alert(1)) <img src=x onerror=y>');
    expect(h).not.toMatch(/<script|<img|javascript:/i);
    expect(h).toContain('&lt;script&gt;');
    expect(h).toMatch(/<mark style=/);   // the reading guide's highlight is allowed
  });
  it('a plain-text caller (alerts) is read as Markdown with its line breaks kept', () => {
    const { html, text } = renderEmail({ text: 'Line one\nLine **two**' });
    expect(html).toMatch(/Line one<br>\s*Line <strong/);
    expect(text).toBe('Line one\nLine two');
  });
  it('an aligned report stays monospaced (pre), text untouched, URLs linked', () => {
    const { html, text } = renderEmail({ text: 'a   | 1\nsee https://x.org/a', pre: true });
    expect(html).toMatch(/<pre style=/);
    expect(html).toContain('<a href="https://x.org/a"');
    expect(text).toBe('a   | 1\nsee https://x.org/a');
  });
  it('an html caller keeps its HTML and gets a text part', () => {
    const { html, text } = renderEmail({ html: '<p>Hello</p><p>World</p>' });
    expect(html).toContain('<p>Hello</p>');
    expect(text).toBe('Hello\nWorld');
  });
  it('ordered lists and code survive in text', () => {
    expect(markdownText('1. one\n2. two\n\n```\ncode\n```')).toBe('1. one\n2. two\n\n    code');
  });
});

describe('the [ACTION] poor-answer alert (was the reply\'s raw Markdown in a <pre>)', () => {
  it('goes out with the reply rendered', async () => {
    const { actionRequired } = await import('../../api/lib/ops/alert.js');
    const { poorAnswerMarkdown } = await import('../../scripts/audit/poor-answer-mail.mjs');
    const { mkdtempSync } = await import('fs'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const sent = [];
    const markdown = poorAnswerMarkdown({ row: { channel: 'email', answered_at: '2026-10-22 23:41', content: MD, session_id: 'conv_1' }, question: 'What is *ḥakam*?',
      verdict: { evidence: { answered: 'partly' }, strategy_used: 'define', best_strategy: 'source', summary: 'skips the source', problems: [{ kind: 'not-retrieved', detail: 'Bahá’í Prayers' }] } });
    await actionRequired({ key: 'k', subject: 'Anís answer needs a look', markdown }, { dir: mkdtempSync(join(tmpdir(), 'al-')), to: 'c@x', sendEmail: async (m) => sent.push(m) });
    const { html, text } = renderEmail(sent[0]);
    expect(html).not.toMatch(/<pre/);
    expect(html).toMatch(/<strong style="[^"]*">ḥakam<\/strong>/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/siftersearch.com\/admin\/anis#threads\/conv_1"/);
    expect(text).not.toMatch(NO_MD);
  });
  it('a long reply is cut at a paragraph, never inside a link', async () => {
    const { cutAtParagraph } = await import('../../scripts/audit/poor-answer-mail.mjs');
    const long = `${'a'.repeat(4000)}\n\n[link text](https://x.org/${'b'.repeat(3000)})`;
    const cut = cutAtParagraph(long);
    expect(cut).not.toContain('[link text');
    expect(cut).toMatch(/cut; the whole reply is in the thread/);
  });
});

describe('Anís replies: what SES is handed (no real send)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a Markdown reply leaves as multipart: HTML with <strong>/<a>/<ul>, text without Markdown', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', async (req, init) => { bodies.push(JSON.parse(await new Request(req, init).text())); return Response.json({ MessageId: 'm1' }); });
    const { sendMail } = await import('../../worker/mail/index.js');
    const env = { AWS_SES_ACCESS_KEY_ID: 'k', AWS_SES_SECRET_ACCESS_KEY: 's', ANIS_DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
    const r = await sendMail(env, { to: 'reader@example.org', subject: 'Re: q', text: `Dear friend,\n\n${MD}\n\nWarmly,\nAnís`, kind: 'reply' });
    expect(r).toMatchObject({ sesMessageId: 'm1' });
    const body = bodies[0].Content.Simple.Body;
    expect(body.Html.Data).toMatch(/<strong style="[^"]*">ḥakam<\/strong>/);
    expect(body.Html.Data).toMatch(/<a [^>]*href="https:\/\/oceanlibrary.com\/sv#p1"/);
    expect(body.Html.Data).toMatch(/<ul /);
    expect(body.Html.Data).toContain('— Anís');
    expect(body.Text.Data).not.toMatch(NO_MD);
    expect(body.Text.Data).toContain('https://oceanlibrary.com/sv#p1');
  });
  it('the approval preview is the letter as sent (same renderer)', async () => {
    const { composeLetter } = await import('../../worker/mail/letter.js');
    const { toHtml } = await import('../../worker/mail/drafting.js');
    expect(toHtml(MD)).toBe(composeLetter(MD, null).html);
  });
});
