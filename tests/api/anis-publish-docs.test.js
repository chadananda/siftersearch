// scripts/anis/publish-docs.mjs: the transformed body must survive content.js renderMarkdown byte-for-byte.
// renderMarkdown isn't exported (content.js pulls in the DB), so its functions are lifted from the source text and run here.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import { transformDoc, transformCss, lint, DOCS } from '../../scripts/anis/publish-docs.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const src = readFileSync(join(ROOT, 'api/routes/content.js'), 'utf8');
const fn = (name) => src.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}$`, 'm'))[0];
const renderMarkdown = new Function('marked',
  ['applyHighlightParams', 'applySmartQuotes', 'applyInlineQuoteItalics', 'renderMarkdown'].map(fn).join('\n') + '\nreturn renderMarkdown;')(marked);

const SAMPLE = `<title>T</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans">
<style>
:root{--ink:#111;--odd:#123;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#eee;--odd:#456}}
:root[data-theme="dark"]{--ink:#eee;--odd:#456}
body{background:#fff;color:var(--ink);font:15px/1.6 "Public Sans",system-ui;padding:0 16px}
main{max-width:900px;margin:0 auto;display:flex;gap:40px}
q{quotes:"“" "”"} .x::before{content:''}
.stage>div{color:var(--odd)}
</style>
<main>
<h1>He said "hi" &amp; ‘bye’</h1>

<p>A “quoted passage” and *not markdown*.</p>

    <p>indented after a blank line</p>
<svg viewBox="0 0 10 10"><text x="1" y="1">“label”</text></svg>
<p><a href="#strategies-doc" title="a > b">next</a></p>
<pre>line 1

line 3</pre>
</main>`;

describe('anis publish-docs transform', () => {
  const { body, heading } = transformDoc(SAMPLE);
  it('passes lint and survives renderMarkdown unchanged', () => {
    expect(lint(body)).toEqual([]);
    expect(renderMarkdown(body).trim()).toBe(body.trim());
  });
  it('scopes CSS, maps tokens, follows the site theme, drops the page frame', () => {
    expect(body).not.toMatch(/<title>|<main>|:root|data-theme/);
    expect(body).toContain('--ink:var(--text-primary)');
    expect(body).toContain('--odd:light-dark(#123,#456)');
    expect(body).toContain('#anis-doc .stage>div{');
    expect(body).not.toMatch(/max-width:900px|background:#fff/);
    expect(body).toMatch(/#anis-doc\{[^}]*display:flex;gap:40px/);
  });
  it('rewrites cross-doc links and reports the heading', () => {
    expect(body).toContain('href="/docs/response-strategies"');   // the retired Strategies & Activities page's successor
    expect(body).not.toContain('/docs/anis-strategies');
    expect(heading).toBe('He said "hi" &amp; ‘bye’');
  });
  it('shields every CSS string', () => {
    expect(transformCss('a{font-family:"X Y"}')).toContain('/*<*/"X Y"/*>*/');
  });
  for (const d of DOCS) {
    it.skipIf(!existsSync(join(ROOT, d.file)))(`${d.slug}: real document round-trips`, () => {
      const out = transformDoc(readFileSync(join(ROOT, d.file), 'utf8')).body;
      expect(lint(out)).toEqual([]);
      expect(renderMarkdown(out).trim()).toBe(out.trim());
    });
  }
});
