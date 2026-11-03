// Publishes the Anís planning artifacts (standalone HTML pages) as public /docs/<slug> pages via admin PUT /api/v1/admin/pages.
// Transform: scoped CSS under #anis-doc (tokens → site tokens / light-dark(), so it follows the site theme), quote-safe for
// content.js's smart-quote + quote-italic passes, no blank lines (marked keeps the whole body as ONE raw HTML block).
// Usage: node scripts/anis/publish-docs.mjs [--dry] [--only <slug>] [--api=http://tower-nas:7839] [--site=https://siftersearch.com]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DOCS = [
  { slug: 'anis-vision', file: 'planning/anis-question-scenarios-20261102.html', title: 'Anís Vision', nav_label: 'Vision', sort_order: 10,
    description: 'What Anís, the Ocean AI research assistant, is: his character, how people meet him, what he does for them, and how his answers look.' },
  { slug: 'anis-strategies', file: 'planning/anis-strategies.html', title: 'Anís Strategies & Activities', nav_label: 'Strategies & Activities', sort_order: 20,
    description: 'The strategies and activities Anís uses to answer: deterministic decision trees first, model work only where they fail.' },
  { slug: 'anis-engagement', file: 'planning/anis-engagement.html', title: 'Anís Hyper Engagement', nav_label: 'Hyper Engagement', sort_order: 25,
    description: 'How Anís keeps people learning and coming back: the reader card, letters with one discovery each, a rhythm that steps back, activities, and success counted in people who reply.' },
  { slug: 'anis-launch-week', file: 'planning/anis-launch-week.html', title: 'Anís Launch Week', nav_label: 'Launch Week', sort_order: 30,
    description: 'The plan for the week Anís launches: what ships each day and the gates it must pass.' },
];
const SECTION = 'anis';
const SCOPE = '#anis-doc';
// Cross-document placeholders the artifacts use → public docs URLs (same origin, relative).
const DOC_LINKS = { '#vision-doc': '/docs/anis-vision', '#strategies-doc': '/docs/anis-strategies', '#engagement-doc': '/docs/anis-engagement', '#launch-doc': '/docs/anis-launch-week' };

// Artifact tokens → the site's semantic tokens (src/styles/global.css), so the page wears the site theme.
// Tokens not listed keep the artifact's own light/dark pair as light-dark().
const TOKEN_MAP = {
  '--ink': 'var(--text-primary)',
  '--text': 'var(--text-secondary)',
  '--muted': 'var(--text-tertiary)',
  '--line': 'var(--border-default)',
  '--paper': 'var(--surface-0)',
  '--bg': 'var(--surface-1)',
  '--accent': 'var(--accent-primary)',
  '--accent-soft': 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
  '--bar': 'color-mix(in srgb, var(--accent-primary) 45%, transparent)',
  '--warn': 'var(--warning)',
  '--warn-soft': 'color-mix(in srgb, var(--warning) 14%, transparent)',
  '--good': 'var(--success)',
  '--bad': 'var(--error)',
};

// ─── CSS ───────────────────────────────────────────────────────────────────────
// Strip comments, keep strings intact. Returns CSS text.
function stripCssComments(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") { const j = endOfString(css, i); out += css.slice(i, j); i = j - 1; }
    else if (c === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); i = j < 0 ? css.length : j + 1; }
    else out += c;
  }
  return out;
}
function endOfString(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') j++; else if (s[j] === q) return j + 1; }
  return s.length;
}
// Parse into [{prelude, body}] (body = string for declarations, or nested array for @media/@supports/@layer).
function parseCss(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    let j = i, depth = 0;
    while (j < css.length && css[j] !== '{' && css[j] !== ';') {
      if (css[j] === '"' || css[j] === "'") j = endOfString(css, j); else j++;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) break;
    if (css[j] === ';') { if (prelude) rules.push({ prelude, body: null }); i = j + 1; continue; }   // @import/@charset
    let k = j;
    for (; k < css.length; k++) {
      const c = css[k];
      if (c === '"' || c === "'") { k = endOfString(css, k) - 1; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    const inner = css.slice(j + 1, k);
    const nested = /^@(media|supports|layer|container)\b/i.test(prelude);
    rules.push({ prelude, body: nested ? parseCss(inner) : inner.trim() });
    i = k + 1;
  }
  return rules;
}
function splitTop(s, sep) {
  const parts = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { const j = endOfString(s, i); cur += s.slice(i, j); i = j - 1; continue; }
    if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}
const decls = (body) => splitTop(body, ';').map(d => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; });
const isDarkMedia = (p) => /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/i.test(p);
const isRootSel = (s) => /^:root\b/.test(s) || s === 'html';
const themeOf = (sel) => /data-theme\s*=\s*["']?dark/.test(sel) ? 'dark' : /data-theme\s*=\s*["']?light/.test(sel) ? 'light' : null;
// Page-frame properties the docs layout owns (body/main of a standalone page).
const FRAME_DROP = /^(max-width|min-height|width|margin(-.*)?|padding(-.*)?|background(-.*)?|color-scheme)$/;

function scopeSelector(sel) {
  return splitTop(sel, ',').map(s => {
    const m = s.match(/^(:root|html|body|main)(?![\w-])(.*)$/);
    if (m) return `${SCOPE}${m[2]}`;
    return `${SCOPE} ${s}`;
  }).join(',');
}

export function transformCss(css, warn = () => {}) {
  const rules = parseCss(stripCssComments(css));
  const light = {}, dark = {}, frame = [];
  const out = [];
  const take = (body, into) => { for (const [k, v] of decls(body)) if (k.startsWith('--')) into[k] = v; };
  const walk = (list, inDark) => {
    const res = [];
    for (const r of list) {
      if (Array.isArray(r.body)) {
        if (isDarkMedia(r.prelude)) {
          for (const x of r.body) {
            if (typeof x.body === 'string' && splitTop(x.prelude, ',').every(isRootSel)) take(x.body, dark);
            else warn(`dark-media rule kept on prefers-color-scheme only (ignores the site toggle): ${x.prelude}`), res.push(`@media (prefers-color-scheme:dark){${scopeSelector(x.prelude)}{${x.body}}}`);
          }
          continue;
        }
        const inner = walk(r.body, inDark);
        if (inner.length) res.push(`${r.prelude}{${inner.join('')}}`);
        continue;
      }
      if (r.body === null) { warn(`dropped at-rule: ${r.prelude}`); continue; }
      if (/^@(font-face|keyframes|-webkit-keyframes|property|page)/i.test(r.prelude)) { res.push(`${r.prelude}{${r.body}}`); continue; }
      const sels = splitTop(r.prelude, ',');
      if (sels.every(isRootSel)) {
        const t = themeOf(r.prelude);
        if (t === 'dark') { take(r.body, dark); continue; }
        take(r.body, light);
        const rest = decls(r.body).filter(([k]) => !k.startsWith('--') && k !== 'color-scheme');
        if (rest.length) frame.push(...rest);
        continue;
      }
      if (sels.length === 1 && /^(body|main)$/.test(sels[0])) {   // page frame → onto the wrapper, minus what the layout owns
        for (const [k, v] of decls(r.body)) if (!FRAME_DROP.test(k)) frame.push([k, v]);
        continue;
      }
      res.push(`${scopeSelector(r.prelude)}{${r.body}}`);
    }
    return res;
  };
  out.push(...walk(rules, false));
  const tokens = Object.keys(light).concat(Object.keys(dark).filter(k => !(k in light))).map(k => {
    if (TOKEN_MAP[k]) return `${k}:${TOKEN_MAP[k]}`;
    const l = light[k] ?? dark[k], d = dark[k] ?? light[k];
    return `${k}:${l === d ? l : `light-dark(${l},${d})`}`;
  });
  const head = [
    // Layout fit: the docs article is 48rem; these pages are designed for ~900px.
    `.article:has(> ${SCOPE}){max-width:62rem}`,
    // Undo the docs prose styles + Tailwind preflight inside the page so it renders as authored (SVG internals excluded:
    // `all` would override their presentation attributes). The page's own rules below win by source order.
    `${SCOPE} :not(svg,svg *){all:revert}`,
    `${SCOPE} svg{display:revert;vertical-align:revert}`,
    `${SCOPE}{${tokens.concat(frame.map(([k, v]) => `${k}:${v}`)).join(';')}}`,
    `${SCOPE} a{color:var(--accent-primary)}`,
    `${SCOPE} [id]{scroll-margin-top:5rem}`,
  ];
  return shieldCssStrings(head.concat(out).join('\n'));
}

// content.js runs applySmartQuotes + applyInlineQuoteItalics on every text node, and <style> text is a text node: CSS
// strings ("Public Sans", content:"") would turn curly and get <em> inserted. Both passes split on /<[^>]+>/ and skip
// tag text, so each string is fenced by comments that look like a tag to them: /*<*/"Public Sans"/*>*/.
function shieldCssStrings(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const j = endOfString(css, i), str = css.slice(i, j);
      if (/[<>]/.test(str)) throw new Error(`CSS string contains < or >, cannot shield: ${str}`);
      out += `/*<*/${str}/*>*/`; i = j - 1;
    } else out += c;
  }
  return out;
}

// ─── HTML ──────────────────────────────────────────────────────────────────────
const TAG_RE = /<\/?[a-zA-Z][^\s/>]*(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/y;
const QUOTE_ENT = { '“': '&#8220;', '”': '&#8221;', '‘': '&#8216;', '’': '&#8217;', '"': '&#34;', "'": '&#8217;' };

// Walk the markup: tags pass through (with < > inside attribute values escaped so /<[^>]+>/ can't split them),
// text nodes get their quotes as numeric entities (the quote passes only touch literal characters and &quot;/&#39;),
// so the page keeps its authored typography instead of gaining <em> around every quotation.
function protectMarkup(html) {
  let out = '', i = 0, pre = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const j = html.indexOf('-->', i); i = j < 0 ? html.length : j + 3; continue; }   // comments dropped
    if (html[i] === '<') {
      TAG_RE.lastIndex = i;
      const m = TAG_RE.exec(html);
      if (m) {
        const tag = m[0].replace(/("[^"]*"|'[^']*')/g, v => v.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        if (/^<(pre|textarea)\b/i.test(tag)) pre++; else if (/^<\/(pre|textarea)>/i.test(tag)) pre = Math.max(0, pre - 1);
        if (/^<script\b/i.test(tag)) throw new Error('<script> is not supported in a docs page body');
        out += tag; i += m[0].length; continue;
      }
      out += '&lt;'; i++; continue;
    }
    let j = html.indexOf('<', i); if (j < 0) j = html.length;
    let text = html.slice(i, j).replace(/&quot;/g, '"').replace(/[“”‘’"']/g, c => QUOTE_ENT[c]);
    // marked ends an HTML block at the first blank line; inside <pre> keep the line, elsewhere drop it.
    text = pre ? text.replace(/\n[ \t]*(?=\n)/g, '\n&#32;') : text.replace(/\n[ \t]*(?=\n)/g, '');
    out += text; i = j;
  }
  return out.replace(/\n\s*\n/g, '\n');
}

export function transformDoc(html, { warn = () => {} } = {}) {
  let src = html.replace(/<!doctype[^>]*>/i, '').replace(/<\/?(html|head|body)\b[^>]*>/gi, '');
  const heading = (src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  src = src.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  const styles = [];
  src = src.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { styles.push(css); return ''; });
  src = src.replace(/<\/?main\b[^>]*>/gi, '');   // the docs layout already has <main>; the frame's rule moved onto the wrapper
  for (const [ph, url] of Object.entries(DOC_LINKS)) src = src.split(`href="${ph}"`).join(`href="${url}"`);
  const css = transformCss(styles.join('\n'), warn);
  const body = protectMarkup(src.trim());
  const out = `<div class="anis-doc" id="anis-doc">\n<style>\n${css}\n</style>\n${body}\n</div>`;
  return { body: out, heading };
}

// Checks that the server's renderMarkdown will pass the body through untouched (see tests/scripts/anis-publish-docs.test.js
// for the full round trip against a replica of content.js).
export function lint(body) {
  const problems = [];
  if (/\n[ \t]*\n/.test(body)) problems.push('blank line (marked would end the HTML block there)');
  const style = body.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
  const naked = style.replace(/\/\*<\*\/("[^"]*"|'[^']*')\/\*>\*\//g, '').match(/["'“”]/);
  if (naked) problems.push(`unshielded quote in CSS near: ${style.slice(Math.max(0, naked.index - 40), naked.index + 20)}`);
  const text = body.replace(/<style>[\s\S]*?<\/style>/, '').split(/(<[^>]+>)/).filter((_, i) => i % 2 === 0).join('');
  if (/[“”"]|&quot;/.test(text)) problems.push('literal double quote in a text node (would be smart-quoted / italicised)');
  for (const ph of Object.keys(DOC_LINKS)) if (body.includes(`href="${ph}"`)) problems.push(`unrewritten placeholder ${ph}`);
  return problems;
}

// Node's fetch to Cloudflare IPs stalls from some local networks while curl gets through, so fall back to curl.
async function getPage(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return { status: r.status, text: r.ok ? await r.text() : '', cache: r.headers.get('x-sifter-cache') || '-' };
  } catch {
    const { execFileSync } = await import('child_process');
    const out = execFileSync('curl', ['-s', '-D', '-', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const split = out.indexOf('\r\n\r\n'), head = out.slice(0, split);
    return { status: +(head.match(/^HTTP\/\S+ (\d+)/)?.[1] || 0), text: out.slice(split + 4), cache: head.match(/x-sifter-cache: (\S+)/i)?.[1] || '-' };
  }
}

// ─── CLI ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const API = args.find(a => a.startsWith('--api='))?.split('=')[1] || 'http://tower-nas:7839';
  const SITE = args.find(a => a.startsWith('--site='))?.split('=')[1] || 'https://siftersearch.com';
  const docs = DOCS.filter(d => !only || d.slug === only);
  if (!docs.length) { console.error(`unknown slug: ${only}`); process.exit(1); }

  let KEY = null;
  if (!dry) {
    const dotenv = (await import('dotenv')).default;
    dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
    KEY = process.env.INTERNAL_API_KEY;
    if (!KEY) { console.error('INTERNAL_API_KEY missing'); process.exit(1); }
  }
  let failed = 0;
  for (const d of docs) {
    let html;
    try { html = readFileSync(join(ROOT, d.file), 'utf-8'); } catch { console.error(`✗ ${d.slug}: ${d.file} not found`); failed++; continue; }
    const warnings = [];
    const { body, heading } = transformDoc(html, { warn: w => warnings.push(w) });
    for (const w of warnings) console.warn(`  ! ${d.slug}: ${w}`);
    const problems = lint(body);
    if (problems.length) { console.error(`✗ ${d.slug}: ${problems.join('; ')}`); failed++; continue; }
    if (!heading) { console.error(`✗ ${d.slug}: no <h1> to verify against`); failed++; continue; }
    if (dry) {
      mkdirSync(join(ROOT, 'tmp/anis-docs'), { recursive: true });
      writeFileSync(join(ROOT, `tmp/anis-docs/${d.slug}.html`), body);
      console.log(`✓ ${d.slug}: ${(body.length / 1024).toFixed(1)} KB → tmp/anis-docs/${d.slug}.html  (h1: ${heading})`);
      continue;
    }
    const payload = { title: d.title, description: d.description, section: SECTION, nav_label: d.nav_label, sort_order: d.sort_order,
      body_md: body, layout: 'docs', active_section: d.slug, status: 'published' };
    const res = await fetch(`${API}/api/v1/admin/pages/${d.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': KEY }, body: JSON.stringify(payload) });
    if (!res.ok) { console.error(`✗ ${d.slug}: PUT ${res.status} ${(await res.text()).slice(0, 200)}`); failed++; continue; }
    // Public reads, no key: the API row must be our body byte-for-byte (renderMarkdown left it alone), the page must show the h1.
    const api = await fetch(`${API}/api/v1/pages/${d.slug}`);
    const doc = api.ok ? (await api.json()).doc : null;
    const same = doc && doc.body_html.trim() === body.trim();
    const page = await getPage(`${SITE}/docs/${d.slug}`);
    const pageText = page.text;
    const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const shows = plain(pageText).includes(plain(heading));
    const ok = api.status === 200 && same && page.status === 200 && shows;
    console.log(`${ok ? '✓' : '✗'} ${d.slug}: api ${api.status}${same ? ' (body intact)' : ' (BODY ALTERED by renderMarkdown)'}; ${SITE}/docs/${d.slug} → ${page.status}` +
      `${shows ? '' : ' (h1 not found — edge cache may still hold an older copy, retry in ~5 min)'} [${page.cache}]`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
