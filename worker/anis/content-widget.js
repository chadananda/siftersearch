// The Anís widget on every anis.oceanlibrary.com content page (Chad 11-14): /discuss, /d, /doc, /bio, /media all end with
// widgetEmbed(page). Collapsed launcher, loaded when the page is idle (never costs the page its first paint), page context
// for the widget (window.anisPage → src/widget/page-context.js), and "Ask Anís about …" links that open the widget in place.
// Also the reader's stored theme before first paint (src/widget/prefs.js THEME_KEY) for pages whose CSS honours data-theme.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// JSON inside <script>: no "</script>" (U+2028/9 are legal in JS strings since ES2019)
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

import { openKey } from '../../src/widget/page-context.js';
export const WIDGET_TOKEN = 'wgt_house_siftersearch';
export const PAGE_KINDS = ['discussion', 'text', 'person', 'talk'];

/** In <head>, before any CSS paints: the reader's light/dark choice from the app (system when none) → <html data-theme>. */
export const THEME_PREP = `<script>try{var t=localStorage.getItem('anis-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

/** Light + dark CSS variables that follow the stored theme: system first, then the reader's choice (with THEME_PREP). */
export const themeVars = (light, dark) => `:root{${light}}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}:root[data-theme=dark]{${dark}}`;

/** "Back to Anís" for a content page's top bar: the app opens the reader's current conversation by itself. */
export const BACK_LINK = '<a class="back-anis" href="/" data-anis-back>Back to Anís</a>';

/** A real link (works with no script, a middle-click or a new tab: the app asks it) that opens the widget in place. */
export const askLink = (label, question, cls = 'ask-anis') =>
  `<a class="${esc(cls)}" href="/?ask=${encodeURIComponent(String(question || '').slice(0, 500))}" data-anis-ask="${esc(String(question || '').slice(0, 500))}">${esc(label)}</a>`;

// The loader never competes with the page: after `load` it waits for the reader's first touch/scroll/key, or 3.5 s + idle
// (at idle straight away when the reader left the widget open). The launcher is position:fixed, so nothing moves (CLS 0).
// An "Ask Anís" click before then loads it at once and the widget takes the question.
const LOADER = `(function(){var d=document,w=window,go=0;function load(){if(go)return;go=1;var s=d.createElement('script');s.src='/widget.js';s.async=true;`
  + `s.setAttribute('data-key','${WIDGET_TOKEN}');s.setAttribute('data-name','Anís');d.body.appendChild(s)}`
  + `d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-anis-ask]');`
  + `if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();`
  + `w.__anisAsk=a.getAttribute('data-anis-ask');if(d.querySelector('[data-sifter-chat]'))w.dispatchEvent(new CustomEvent('sifter-chat:open',{detail:{q:w.__anisAsk,send:true}}));else load()});`
  + `function idle(){(w.requestIdleCallback||function(f){setTimeout(f,200)})(load,{timeout:4000})}`
  + `function ready(){var kept;try{kept=localStorage.getItem('${openKey(WIDGET_TOKEN)}')==='1'}catch(e){}`
  + `if(kept)return idle();['pointerdown','keydown','scroll','touchstart'].forEach(function(t){w.addEventListener(t,load,{once:true,passive:true})});setTimeout(idle,3500)}`
  + `if(d.readyState==='complete')ready();else w.addEventListener('load',ready)})()`;

/** The page → its context for the widget ({type, slug, title}); null when it is not one of the content kinds. */
export function pageOf(p) {
  if (!p || !PAGE_KINDS.includes(p.type)) return null;
  const title = String(p.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return title ? { type: p.type, slug: String(p.slug || '').slice(0, 160), title } : null;
}

/** Just before </body> on every content page. */
export function widgetEmbed(page) {
  const ctx = pageOf(page);
  return `${ctx ? `<script>window.anisPage=${js(ctx)}</script>` : ''}<script>${LOADER}</script>`;
}
