// Snapshot of the Anís app's first view (P6, Lighthouse): loads the built widget bundle full screen in headless Chrome with a
// fresh browser and the config fetch held, captures its shadow-DOM HTML and writes src/widget/anis-shell.json {v, html}. The app
// page (src/pages/anis-app.astro) paints it from the first byte; the widget mounts over it calm. Run by `npm run build:widget`.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../', import.meta.url);
const bundle = readFileSync(new URL('api/static/widget/sifter-chat.js', ROOT), 'utf8');
const v = createHash('md5').update(bundle).digest('hex').slice(0, 10);   // = api/routes/widget.js bundleHash
const ORIGIN = 'https://anis.shell.test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body></body></html>' });
    if (u.pathname === '/widget/sifter-chat.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: bundle });
    if (u.pathname.startsWith('/api/v1/widget/config/')) return;   // held: the snapshot is the boot view (defaults), never live config
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(({ v, ORIGIN }) => new Promise((done) => {
    const s = document.createElement('script');
    s.src = `${ORIGIN}/widget/sifter-chat.js?v=${v}`;
    s.onload = () => {
      const el = document.createElement(`sifter-chat-${v}`);
      for (const [k, val] of Object.entries({ token: 'wgt_house_siftersearch', api: ORIGIN, name: 'Anís', opened: '1', fullscreen: '1', version: '__VERSION__' })) el.setAttribute(k, val);
      document.body.appendChild(el);
      done();
    };
    document.head.appendChild(s);
  }), { v, ORIGIN });
  await page.waitForFunction((v) => document.querySelector(`sifter-chat-${v}`)?.shadowRoot?.querySelector('.welcome .wl-card'), v);
  const html = await page.evaluate((v) => document.querySelector(`sifter-chat-${v}`).shadowRoot.innerHTML, v);
  const clean = html.replace(/<!--[^]*?-->/g, '')
    .replace(/(<style[^>]*>)([^]*?)<\/style>/g, (_, open, css) => `${open}${css.replace(/\/\*[^]*?\*\//g, '').replace(/\n\s*\n/g, '\n')}</style>`)   // CSS comments: bytes only
    .replace('<div class="root', '<div class="root calm');   // the shell never animates in
  writeFileSync(new URL('src/widget/anis-shell.json', ROOT), JSON.stringify({ v, html: clean }) + '\n');
  console.log(`anis-shell: v=${v} ${(clean.length / 1024).toFixed(1)} KB`);
} finally { await browser.close(); }
