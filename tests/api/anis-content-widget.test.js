// The Anís widget on every anis.oceanlibrary.com content page (Chad 11-14): the embed (worker/anis/content-widget.js),
// the widget's page context and the way back to full mode (src/widget/page-context.js), and the app opening a thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { widgetEmbed, askLink, pageOf, THEME_PREP, themeVars, BACK_LINK, WIDGET_TOKEN } from '../../worker/anis/content-widget.js';
import { pageContext, askLabel, askQuestion, fullModeHref, expandMode, urlThreadAction, threadParam, askParam, loadOpen, saveOpen, startOpen, openKey, loadMax, saveMax, maxKey } from '../../src/widget/page-context.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const svelte = fs.readFileSync(new URL('../../src/widget/SifterChat.svelte', import.meta.url), 'utf8');

describe('content page embed', () => {
  it('passes the page context and idle-loads the widget, collapsed', () => {
    const h = widgetEmbed({ type: 'text', slug: 'kitab-i-iqan', title: 'The Kitáb-i-Íqán' });
    expect(h).toContain('window.anisPage={"type":"text","slug":"kitab-i-iqan","title":"The Kitáb-i-Íqán"}');
    expect(h).toContain("s.src='/widget.js'");
    expect(h).toContain(`'data-key','${WIDGET_TOKEN}'`);
    expect(h).toContain('requestIdleCallback');
    expect(h).toContain("addEventListener('load',ready)");
    expect(h).not.toMatch(/data-opened|'opened'/);   // never auto-opens: the loader is never told to open
  });
  it('never competes with the page: first touch/scroll/key or 3.5 s + idle; at idle only when left open', () => {
    const h = widgetEmbed(null);
    expect(h).toContain(`localStorage.getItem('${openKey(WIDGET_TOKEN)}')==='1'`);
    expect(h).toMatch(/\['pointerdown','keydown','scroll','touchstart'\]/);
    expect(h).toContain('setTimeout(idle,3500)');
    expect(h).toContain("w.addEventListener('load',ready)");
  });
  it('a title cannot close the script', () => {
    const h = widgetEmbed({ type: 'discussion', slug: 'x-y', title: '</script><script>alert(1)</script>' });
    expect(h.match(/<\/script>/g)).toHaveLength(2);
  });
  it('unknown kinds or no title: no context, still the widget', () => {
    expect(pageOf({ type: 'blog', title: 'x' })).toBeNull();
    expect(pageOf({ type: 'person', title: '  ' })).toBeNull();
    expect(widgetEmbed(null)).not.toContain('anisPage');
    expect(widgetEmbed(null)).toContain('/widget.js');
  });
  it('"Ask Anís about …" is a real link (new tab works) that the loader opens in place', () => {
    const a = askLink('Ask Anís about Ṭáhirih', 'Who was Ṭáhirih?');
    expect(a).toMatch(/^<a class="ask-anis" href="\/\?ask=Who%20was%20%E1%B9%AC%C3%A1hirih%3F" data-anis-ask="Who was Ṭáhirih\?">/);
    const h = widgetEmbed({ type: 'person', slug: 'tahirih', title: 'Ṭáhirih' });
    expect(h).toContain("closest('a[data-anis-ask]')");
    expect(h).toContain('e.metaKey||e.ctrlKey');   // a modified click is left to the browser (new tab / window)
    expect(h).toContain("new CustomEvent('sifter-chat:open',{detail:{q:w.__anisAsk,send:true}})");
  });
  it('theme: the stored choice before paint, system otherwise', () => {
    expect(THEME_PREP).toContain("localStorage.getItem('anis-theme')");
    const css = themeVars('--bg:#fff', '--bg:#000');
    expect(css).toContain(':root:not([data-theme=light]){--bg:#000}');
    expect(css).toContain(':root[data-theme=dark]{--bg:#000}');
    expect(BACK_LINK).toContain('href="/"');
  });
});

describe('widget page context', () => {
  it('reads window.anisPage safely', () => {
    expect(pageContext({ type: 'talk', slug: 'a-b', title: ' A  talk ' })).toEqual({ type: 'talk', slug: 'a-b', title: 'A talk' });
    expect(pageContext(undefined)).toBeNull();
    expect(pageContext({ type: 'x', title: 'y' })).toBeNull();
  });
  it('first suggestion names the page', () => {
    for (const type of ['discussion', 'text', 'person', 'talk']) {
      const c = { type, slug: 's', title: 'Gate of the Heart' };
      expect(askLabel(c)).toBe(`Ask about this ${type}`);
      expect(askQuestion(c)).toContain('Gate of the Heart');
    }
  });
  it('the expand URL carries the thread id on the Anís host', () => {
    const id = '3f2a8c1e-9b7d-4e2a-8f00-1c2d3e4f5a6b';
    expect(fullModeHref('anis.oceanlibrary.com', id)).toBe(`/?t=${id}`);
    expect(fullModeHref('localhost:4321', id)).toBe(`/?t=${id}`);
    expect(fullModeHref('anis.oceanlibrary.com', 'bad id!')).toBe('/');
  });
  it('off the Anís host there is no link to the full app: it could not carry the conversation (Chad 11-14)', () => {
    const id = '3f2a8c1e-9b7d-4e2a-8f00-1c2d3e4f5a6b';
    for (const h of ['example.org', 'longbeachbahai.chadananda.workers.dev', 'anis.oceanlibrary.com.evil.io']) {
      expect(fullModeHref(h, id)).toBe('');
      expect(expandMode(h)).toBe('maximize');
    }
    expect(expandMode('anis.oceanlibrary.com')).toBe('link');
    expect(expandMode('localhost:4321')).toBe('link');
  });
  it('an unknown ?t= starts a clean conversation, never keeps another thread showing', () => {
    expect(urlThreadAction('t1abc23xyz', true)).toBe('open');
    expect(urlThreadAction('t1abc23xyz', false)).toBe('new');
    expect(urlThreadAction('', false)).toBe('none');
  });
  it('remembers maximized per reader', () => {
    const s = mem();
    expect(loadMax(s, 'tok')).toBe(false);
    saveMax(s, 'tok', true);
    expect(s.getItem(maxKey('tok'))).toBe('1');
    expect(loadMax(s, 'tok')).toBe(true);
    expect(loadMax(s, 'other')).toBe(false);
    saveMax(s, 'tok', false);
    expect(loadMax(s, 'tok')).toBe(false);
    expect(loadMax({ getItem() { throw new Error('private'); } }, 'tok')).toBe(false);
  });
  it('the app reads ?t= and ?ask=', () => {
    expect(threadParam('?t=t1abc23xyz')).toBe('t1abc23xyz');
    expect(threadParam('?t=../x')).toBe('');
    expect(askParam('?ask=Who%20was%20Quddus%3F')).toBe('Who was Quddus?');
    expect(askParam('')).toBe('');
  });
  it('remembers open/closed; never opens on a first visit or on a phone', () => {
    const s = mem();
    expect(loadOpen(s, 'tok')).toBe(false);
    expect(startOpen({ remembered: loadOpen(s, 'tok'), wide: true })).toBe(false);
    saveOpen(s, 'tok', true);
    expect(s.getItem(openKey('tok'))).toBe('1');
    expect(startOpen({ remembered: loadOpen(s, 'tok'), wide: true })).toBe(true);
    expect(startOpen({ remembered: true, wide: false })).toBe(false);
    expect(loadOpen({ getItem() { throw new Error('private'); } }, 'tok')).toBe(false);
  });
});

describe('SifterChat wiring', () => {
  it('floating header: the "Open full Anís" link only on the Anís host', () => {
    expect(svelte).toMatch(/\{#if !isFull && expandHow === 'link'\}[^\n]*\n\s*<a class="icon expand" href=\{fullHref\}[^>]*aria-label="Open full Anís"/);
    expect(svelte).toContain('fullModeHref(location.host, activeId)');
  });
  it('elsewhere the expand control is a button that maximizes in place (no href), restored by the button or Esc', () => {
    const btn = svelte.match(/<button type="button" class="icon expand"[^>]*>/)?.[0] || '';
    expect(btn).toContain('onclick={toggleMax}');
    expect(btn).toContain('aria-pressed={isMax}');
    expect(btn).not.toContain('href');
    expect(svelte).toContain("ic(isMax ? 'collapse' : 'expand')");
    expect(svelte).toContain('class:max={isMax}');
    // Esc restores before it closes, both inside the panel and on the window
    expect((svelte.match(/else if \(isMax\) toggleMax\(\); else if \((open && )?!isFull\) open = false;/g) || []).length).toBe(2);
    expect(svelte).toMatch(/\.root\.max \.panel \{ position: fixed; inset: 0;/);
    expect(svelte).toContain("de.style.overflow = 'hidden'");   // the host page is locked behind it
  });
  it('an unknown ?t= opens a new conversation', () => {
    expect(svelte).toMatch(/else if \(act === 'new'\) \{ newConversation\(\);/);
  });
  it('the app opens the thread named by ?t= and asks ?ask=', () => {
    expect(svelte).toContain('threadParam(location.search)');
    expect(svelte).toContain('askParam(location.search)');
  });
  it('page context: first suggestion, and "Ask about" opens in place', () => {
    expect(svelte).toContain('pageContext(window.anisPage)');
    expect(svelte).toContain('askLabel(pageCtx)');
    expect(svelte).toContain('window.__anisAsk');
  });
});

describe('every content page carries the widget', async () => {
  const { discussionPage, notFoundPage, TOP } = await import('../../worker/anis/share.js');
  it('a shared discussion (/d/) passes its context (published ones: the dialogue pages, anis-discuss.test.js)', () => {
    const d = discussionPage({ slug: 'why-pray-ab12cd34', title: 'Why pray?', turns: [{ role: 'user', content: 'Why pray?' }, { role: 'assistant', content: 'Because…' }], published_at: Date.now() });
    expect(d).toContain('window.anisPage={"type":"discussion","slug":"why-pray-ab12cd34","title":"Why pray?"}');
    for (const h of [d, notFoundPage()]) {
      expect(h).toContain("s.src='/widget.js'");
      expect(h.indexOf('/widget.js')).toBeGreaterThan(h.indexOf('</main>'));   // after the page content
      expect(h).toContain("localStorage.getItem('anis-theme')");   // the stored theme before paint
    }
    expect(TOP).toContain('Back to Anís');
  });
  it('text, person and talk pages pass their kind (worker shell or AnisWidget.astro)', () => {
    for (const type of ['text', 'person', 'talk']) {
      const h = widgetEmbed({ type, slug: `s-${type}`, title: `T ${type}` });
      expect(h).toContain(`window.anisPage={"type":"${type}","slug":"s-${type}","title":"T ${type}"}`);
      expect(askLabel(pageContext({ type, slug: 'x', title: 'X' }))).toBe(`Ask about this ${type}`);
    }
    const astro = fs.readFileSync(new URL('../../src/components/AnisWidget.astro', import.meta.url), 'utf8');
    expect(astro).toMatch(/widgetEmbed\(\{ type, slug, title \}\)/);
  });
});
