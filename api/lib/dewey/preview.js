// A READABLE PREVIEW of an item's original for the Review popup (Chad 10-20: "how am I supposed to decide on importing documents
// that are RTF if they cannot be displayed"). Browsers show PDF, text and HTML themselves; RTF, Word (.doc/.docx), WordPerfect,
// ODT, EPUB and webarchives are converted here with Dewey's own converters (convert.js) and served as SANITISED HTML — no
// scripts, event handlers, frames, forms or external fetches, and a CSP that forbids them anyway (the popup shows it in a
// sandboxed iframe). Deps: convert.js.
import { readFile } from 'fs/promises';
import { docxHtml, epubHtml, webarchiveHtml, officeHtml } from './convert.js';

const OFFICE = new Set(['rtf', 'doc', 'odt', 'wpd', 'wps']);
export const PREVIEWABLE = new Set([...OFFICE, 'docx', 'epub', 'webarchive']);

/** Strip everything that could run or fetch; keep the document's structure and inline styling. Pure. */
export function sanitizeHtml(html) {
  let s = String(html || '');
  const body = s.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const styles = [...s.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]).join('\n');
  s = (body ? body[1] : s).replace(/<style\b[\s\S]*?<\/style>/gi, '');   // styles are kept only after cleaning (below)
  s = s.replace(/<(script|iframe|object|embed|form|link|meta|base|frame|frameset|applet|svg|math|template|noscript)\b[\s\S]*?(?:<\/\1\s*>|\/?>)/gi, '')
    .replace(/<(script|iframe|object|embed|form|link|meta|base|frame|applet|svg|math)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction|background|poster|xlink:href)\s*=\s*("\s*(?:javascript|vbscript|data|https?|file):[^"]*"|'\s*(?:javascript|vbscript|data|https?|file):[^']*'|(?:javascript|vbscript|data|https?|file):[^\s>]*)/gi, '')
    .replace(/<img\b[^>]*>/gi, '');   // a converter's images are files that no longer exist (and nothing may be fetched)
  const safeStyles = styles.replace(/@import[^;]*;|url\([^)]*\)|expression\([^)]*\)/gi, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font:16px/1.6 Georgia,serif;max-width:46rem;margin:1.5rem auto;padding:0 1rem;color:#222;background:#fff}</style>${safeStyles}</head><body>${s}</body></html>`;
}

/** An original file → { html } (sanitised), or null when the browser can show the file itself. */
export async function previewHtml(path, { read = readFile, office = officeHtml } = {}) {
  const ext = String(path).split('.').pop().toLowerCase();
  if (!PREVIEWABLE.has(ext)) return null;
  const bytes = await read(path);
  const raw = ext === 'docx' ? await docxHtml(bytes) : ext === 'epub' ? await epubHtml(bytes)
    : ext === 'webarchive' ? webarchiveHtml(bytes) : await office(bytes, ext);
  return { html: sanitizeHtml(raw), ext };
}
