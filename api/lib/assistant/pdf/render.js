// Branded PDF from Markdown (Anís document modality). Pure JS: pdfkit + marked + lib/qr.js (cached vector QR), TTFs in api/assets/fonts/pdf (no browser,
// safe on tower). Any answer shape (headings, paragraphs, quotes, lists, tables); every link stays clickable, is numbered, and
// gets a vector QR (shortened URL) in the Sources list; closing QR to OceanLibrary. Chars no text font covers (Arabic script) are dropped, except in display widgets (pdf/side-by-side.js: Amiri, shaped RTL).
import PDFDocument from 'pdfkit';
import { drawQr, shortUrl } from '../../qr.js';
import { drawSideBySide } from './side-by-side.js';
import * as fontkit from 'fontkit';
import { marked } from 'marked';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const FONT_DIR = join(ROOT, 'api', 'assets', 'fonts', 'pdf');
// Gentium Book Plus + Noto Sans: every letter of Bahá'í transliteration (á í ú, ḥ ṭ ṣ ẓ ḍ, ‘ ’, K͟h S͟h) — Chad 11-13 "a universal font";
// the site's Caslon / Gloock / Space Grotesk cuts lack the dots below or the acutes. Check a new font with the set in tests/api/anis-pdf.test.js.
const FILES = { r: ['gentium-book-plus-regular'], b: ['gentium-book-plus-bold'], i: ['gentium-book-plus-italic'], m: ['ibm-plex-mono-400-latin', 'noto-sans-regular'],
  h: ['gentium-book-plus-bold'], s: ['noto-sans-regular'], a: ['amiri-regular-arabic'] };   // a = Arabic-script (side_by_side print only; the text chains above still drop it)
const COLOR = { ink: '#2b2621', sea: '#1f6f8b', mist: '#7a8890', rule: '#d6dde0', zebra: '#f3f7f8' };
const P = { w: 612, h: 792, l: 60, r: 60, top: 84, bottom: 70 };
const SITE = 'https://oceanlibrary.com';
let cache = null;
const fonts = () => cache ??= Object.fromEntries(Object.entries(FILES).map(([k, names]) => [k, names.map((n, i) => {
  const buf = readFileSync(join(FONT_DIR, `${n}.ttf`));
  return { name: `${k}${i}`, buf, font: fontkit.create(buf) };
})]));
const register = (doc) => Object.values(fonts()).flat().forEach((f) => doc.registerFont(f.name, f.buf));

// split text into runs by the first font of the style's chain that has the glyph; uncovered chars are dropped
export function runs(text, style) {
  const chain = fonts()[style], out = [];
  for (let ch of String(text).normalize('NFC')) {
    const cp = ch.codePointAt(0);
    let f = /\s/.test(ch) ? chain[0] : chain.find((c) => c.font.hasGlyphForCodePoint(cp));
    if (!f) {   // no glyph: the base letter, never a dropped one
      const base = ch.normalize('NFD')[0];
      f = base !== ch && chain.find((c) => c.font.hasGlyphForCodePoint(base.codePointAt(0)));
      if (!f) continue;
      ch = base;
    }
    if (out.at(-1)?.name === f.name) out.at(-1).text += ch; else out.push({ name: f.name, text: ch });
  }
  return out;
}

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (tokens) => (tokens || []).map((t) => (t.tokens ? plain(t.tokens) : t.type === 'br' ? ' ' : t.type === 'html' ? '' : unesc(t.text ?? t.raw ?? ''))).join('');
const isWeb = (u) => /^https?:\/\//i.test(u || '');

/** Inline tokens → spans [{text, style, color?, link?, scale?}]. `reg(href, label)` numbers a link (null → none). */
export function spansOf(tokens, reg, st = {}, out = []) {
  for (const t of tokens || []) {
    if (t.type === 'strong') spansOf(t.tokens, reg, { ...st, b: 1 }, out);
    else if (t.type === 'em' || t.type === 'del') spansOf(t.tokens, reg, { ...st, i: 1 }, out);
    else if (t.type === 'codespan') out.push({ text: unesc(t.text), style: 'm', color: st.color, scale: 0.9 });
    else if (t.type === 'link') {
      const n = isWeb(t.href) ? reg(t.href, plain(t.tokens) || unesc(t.text)) : null;
      spansOf(t.tokens, reg, { ...st, link: isWeb(t.href) ? t.href : st.link, color: isWeb(t.href) ? COLOR.sea : st.color }, out);
      if (n) out.push({ text: `[${n}]`, style: 's', color: COLOR.mist, scale: 0.7, link: t.href });
    } else if (t.type === 'br') out.push({ text: '\n', style: 'r' });
    else if (t.type === 'image') out.push({ text: unesc(t.text || ''), style: 'i', color: st.color });
    else if (t.type === 'html') { if (/^<br\s*\/?>$/i.test(t.raw)) out.push({ text: '\n', style: 'r' }); }
    else if (t.tokens?.length) spansOf(t.tokens, reg, st, out);
    else out.push({ text: unesc(t.text ?? t.raw ?? ''), style: st.b && st.i ? 'i' : st.b ? 'b' : st.i ? 'i' : 'r', color: st.color, link: st.link });
  }
  return out;
}

// draw spans as one flowing paragraph; returns doc.y after. Fonts switch per run (continued text).
function inline(doc, spans, { x, y, width, size = 10.5, gap = 2.5, color = COLOR.ink, align = 'left', style = null }) {
  const pieces = spans.flatMap((s) => runs(s.text, style || s.style).map((r) => ({ ...r, s })));
  if (!pieces.length) { doc.y = y; return y; }
  pieces.forEach((p, k) => {
    doc.font(p.name).fontSize(size * (p.s.scale || 1)).fillColor(p.s.color || color);
    const o = { width, continued: k < pieces.length - 1, lineGap: gap, align, underline: !!p.s.link && !p.s.scale, ...(p.s.link ? { link: p.s.link } : {}) };
    if (k === 0) doc.text(p.text, x, y, o); else doc.text(p.text, o);
  });
  return doc.y;
}

/** Markdown → PDF Buffer. opts: { title, markdown, date, siteUrl, onlineUrl, widgets, qr: { url, label } (a QR beside the title), running: [line1, line2] (the header on every page, after "Anís ·"), pdfUrl (this PDF's own link: a share QR at the end) } */
export async function renderPdf({ title = '', markdown = '', date = new Date(), siteUrl = SITE, onlineUrl = null, widgets = [], qr = null, running = null, pdfUrl = null } = {}) {
  const doc = new PDFDocument({ size: [P.w, P.h], margins: { top: P.top, bottom: P.bottom, left: P.l, right: P.r }, bufferPages: true,
    info: { Title: String(title).slice(0, 200), Author: 'Anís, Ocean AI Research Assistant', Creator: 'Anís · OceanLibrary.com' } });
  const chunks = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  const mdoc = new PDFDocument({ size: [P.w, 100000], margins: { top: 0, bottom: 0, left: 0, right: 0 } }); mdoc.on('data', () => {});
  register(doc); register(mdoc);
  const W = P.w - P.l - P.r, bottom = P.h - P.bottom;
  const links = new Map();   // cleaned url → { n, label, href }
  const reg = (href, label) => { const k = shortUrl(href); if (!links.has(k)) links.set(k, { n: links.size + 1, label, href }); return links.get(k).n; };
  const measure = (spans, o) => { mdoc.y = 0; return inline(mdoc, spans, { ...o, x: 0, y: 0 }); };
  const need = (h) => { if (doc.y + h > bottom) doc.addPage(); };
  const logo = readFileSync(join(ROOT, 'public', 'ocean-noback.svg'), 'utf8').match(/ d="([^"]+)"/)[1];   // the Ocean mark as a vector, inked in sea blue for print
  const dateText = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const header = () => {
    doc.save().translate(16, 16).scale(40 / 512).path(logo).fill(COLOR.sea).restore();   // larger, in the page's corner (Chad 11-13)
    const fit = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);   // one line each, never wrapped into the rule
    inline(doc, [{ text: running?.[0] ? `Anís · ${fit(running[0], 52)}` : 'Anís', style: 'h' }], { x: P.l + 2, y: 31, width: W - 110, size: 15, color: COLOR.sea });
    inline(doc, [{ text: fit(running?.[1] || 'Ocean AI Research Assistant', 90), style: 's' }], { x: P.l + 2, y: 50, width: W - 110, size: 8, color: COLOR.mist });
    doc.font('s0').fontSize(8).fillColor(COLOR.mist).text('OceanLibrary.com', P.l, 40, { width: W, align: 'right', lineBreak: false, link: siteUrl });
    doc.moveTo(P.l, 68).lineTo(P.w - P.r, 68).lineWidth(0.6).strokeColor(COLOR.rule).stroke();
    doc.x = P.l; doc.y = P.top;
  };
  doc.on('pageAdded', header);
  header();

  // title block
  const tsp = [{ text: String(title).replace(/\s+/g, ' ').trim() || 'Research', style: 'h' }];
  const QS = 58, ty = doc.y, tw0 = qr?.url ? W - QS - 14 : W;
  if (qr?.url) {
    drawQr(doc, qr.url, P.l + W - QS, ty - 4, QS);
    if (qr.label) inline(doc, [{ text: qr.label, style: 's', link: qr.url }], { x: P.l + W - 160, y: ty + QS + 1, width: 160, size: 6.5, color: COLOR.mist, align: 'right' });
    doc.y = ty;   // the title starts level with the code
  }
  inline(doc, tsp, { x: P.l, y: doc.y, width: tw0, size: 21, gap: 3, color: COLOR.sea });
  doc.y += 4; inline(doc, [{ text: `Prepared ${dateText}`, style: 's' }], { x: P.l, y: doc.y, width: tw0, size: 8.5, color: COLOR.mist });
  if (qr?.url) doc.y = Math.max(doc.y, ty + QS + (qr.label ? 12 : 0));
  doc.y += 8; doc.moveTo(P.l, doc.y).lineTo(P.w - P.r, doc.y).lineWidth(1.2).strokeColor(COLOR.sea).stroke(); doc.y += 14;

  const pageCount = () => doc.bufferedPageRange().count;
  const bar = (p0, y0, x, color) => { if (pageCount() === p0 && doc.y > y0) doc.moveTo(x, y0 + 1).lineTo(x, doc.y - 1).lineWidth(1.6).strokeColor(color).stroke(); };

  function table(tok, cx, cw) {
    const rows = [tok.header, ...tok.rows], cols = tok.header.length, pad = 4, size = 9;
    const lens = Array.from({ length: cols }, (_, c) => { const ls = rows.map((r) => (r[c]?.text || '').length); return 0.5 * (ls.reduce((a, b) => a + b, 0) / ls.length) + 0.5 * Math.min(Math.max(...ls), 90); });
    const min = 46, tot = lens.reduce((a, b) => a + Math.max(b, 6), 0);
    let ws = lens.map((l) => Math.max(min, cw * Math.max(l, 6) / tot)); const k = cw / ws.reduce((a, b) => a + b, 0); ws = ws.map((w) => w * k);
    const cells = rows.map((r, ri) => r.map((c, ci) => spansOf(c.tokens, reg, ri === 0 ? { b: 1, color: '#ffffff' } : {})));
    const height = (ri) => Math.max(...cells[ri].map((sp, ci) => measure(sp, { width: ws[ci] - 2 * pad, size, gap: 1.5, style: null }) )) + 2 * pad;
    const hs = rows.map((_, ri) => height(ri));
    const draw = (ri, y) => {
      let x = cx;
      if (ri === 0) doc.rect(cx, y, cw, hs[0]).fill(COLOR.sea);
      else if (ri % 2 === 0) doc.rect(cx, y, cw, hs[ri]).fill(COLOR.zebra);
      cells[ri].forEach((sp, ci) => { inline(doc, sp, { x: x + pad, y: y + pad, width: ws[ci] - 2 * pad, size, gap: 1.5, align: tok.align?.[ci] || 'left' }); x += ws[ci]; });
      doc.moveTo(cx, y + hs[ri]).lineTo(cx + cw, y + hs[ri]).lineWidth(0.5).strokeColor(COLOR.rule).stroke();
      doc.y = y + hs[ri];
    };
    need(hs[0] + (hs[1] || 0));
    draw(0, doc.y);
    for (let ri = 1; ri < rows.length; ri++) {
      if (doc.y + hs[ri] > bottom) { doc.addPage(); draw(0, doc.y); }
      draw(ri, doc.y);
    }
    doc.y += 10;
  }

  // display widgets: `<!-- widget:ID -->` before a table (+ the approximate note) → the widget drawn for print; no data for the id → the markdown table as is
  const wById = new Map((widgets || []).map((w) => [w?.id, w]));
  let pendingWidget = null;
  const wctx = (cx, cw) => ({ x: cx, width: cw, bottom, color: COLOR, need, addPage: () => doc.addPage(), inline: (d, sp, o) => inline(d, sp, o), measure, drawQr, topQr: !!qr?.url });
  function blocks(tokens, cx, cw) {
    for (const t of tokens || []) {
      if (t.type === 'html') { const id = /^\s*<!--\s*widget:([\w-]+)\s*-->/.exec(t.raw || '')?.[1]; if (id && wById.has(id)) { pendingWidget = wById.get(id); continue; } }
      if (pendingWidget && t.type === 'table') { drawSideBySide(doc, pendingWidget, wctx(cx, cw)); pendingWidget = { done: true, ...pendingWidget }; continue; }
      if (pendingWidget?.done && t.type === 'paragraph' && /^\s*Aligned approximately/.test(plain(t.tokens))) { pendingWidget = null; continue; }
      if (t.type !== 'space') pendingWidget = null;
      if (t.type === 'space') continue;
      if (t.type === 'heading') {
        const sz = [0, 16, 14, 12, 11, 10.5, 10.5][t.depth] || 11, sp = spansOf(t.tokens, reg, t.depth > 2 ? { b: 1 } : {});
        need(sz * 3.2); doc.y += t.depth <= 2 ? 8 : 5;
        inline(doc, sp, { x: cx, y: doc.y, width: cw, size: sz, color: t.depth <= 2 ? COLOR.sea : COLOR.ink, style: t.depth <= 2 ? 'h' : null, gap: 1.5 });
        doc.y += 4;
      } else if (t.type === 'paragraph' || t.type === 'text') {
        const sp = spansOf(t.tokens || [{ type: 'text', text: t.text }], reg);
        need(Math.min(measure(sp, { width: cw, size: 10.5 }), 60));
        inline(doc, sp, { x: cx, y: doc.y, width: cw, size: 10.5 }); doc.y += 7;
      } else if (t.type === 'blockquote') {
        need(40); const p0 = pageCount(), y1 = doc.y;
        blocks(t.tokens, cx + 16, cw - 16); bar(p0, y1, cx + 4, COLOR.sea); doc.y += 2;
      } else if (t.type === 'list') {
        t.items.forEach((it, i) => {
          need(30); const y = doc.y, mark = t.ordered ? `${(Number(t.start) || 1) + i}.` : '•';
          doc.font('r0').fontSize(10.5).fillColor(COLOR.ink).text(mark, cx, y, { width: 16, lineBreak: false });
          doc.y = y; blocks(it.tokens, cx + 18, cw - 18);
        });
        doc.y += 2;
      } else if (t.type === 'code') {
        const sp = [{ text: t.text, style: 'm' }], p0 = pageCount(), y0 = doc.y; need(30);
        inline(doc, sp, { x: cx + 10, y: doc.y, width: cw - 10, size: 8.5, color: '#44505a', gap: 1 }); bar(p0, y0, cx + 3, COLOR.rule); doc.y += 8;
      } else if (t.type === 'hr') { need(14); doc.y += 5; doc.moveTo(cx, doc.y).lineTo(cx + cw, doc.y).lineWidth(0.6).strokeColor(COLOR.rule).stroke(); doc.y += 8; }
      else if (t.type === 'table') table(t, cx, cw);
    }
  }
  blocks(marked.lexer(String(markdown || '')), P.l, W);

  // Sources: every link, numbered, with a QR
  if (links.size) {
    need(110); doc.y += 8;
    inline(doc, [{ text: 'Sources', style: 'h' }], { x: P.l, y: doc.y, width: W, size: 14, color: COLOR.sea }); doc.y += 4;
    inline(doc, [{ text: 'Each source is a link; scan the code with a phone to open it.', style: 'i' }], { x: P.l, y: doc.y, width: W, size: 8.5, color: COLOR.mist }); doc.y += 10;
    const colW = W / 2, qr = 51,   // 18 mm incl. quiet zone: scans fine from a printed page
       rowH = qr + 12;
    let i = 0;
    for (const [url, l] of links) {   // url = the shortened form (also the dedupe key)
      if (i % 2 === 0) need(rowH);
      const x = P.l + (i % 2) * colW, y = doc.y;
      drawQr(doc, l.href, x, y, qr);
      inline(doc, [{ text: `${l.n}  `, style: 'b', color: COLOR.sea }, { text: l.label.length > 110 ? `${l.label.slice(0, 107)}…` : l.label, style: 'r', link: l.href, color: COLOR.sea }], { x: x + qr + 8, y, width: colW - qr - 18, size: 9, gap: 1 });
      let host = ''; try { host = new URL(url).host.replace(/^www\./, ''); } catch { /* none */ }
      if (host && !/siftersearch/i.test(host)) { doc.font('s0').fontSize(7.5).fillColor(COLOR.mist).text(host, x + qr + 8, doc.y + 1, { width: colW - qr - 18, lineBreak: false }); }
      doc.y = y; i++;
      if (i % 2 === 0 || i === links.size) doc.y = y + rowH;
    }
  }

  // closing: continue online
  const target = onlineUrl || siteUrl;
  need(pdfUrl ? 112 : 100); doc.y += 12;
  doc.moveTo(P.l, doc.y).lineTo(P.w - P.r, doc.y).lineWidth(0.6).strokeColor(COLOR.rule).stroke(); doc.y += 12;
  const cy = doc.y, sw = pdfUrl ? 64 + 18 : 0, tw = W - 78 - sw;   // pdfUrl: this PDF's own QR on the right, to share it (Chad 11-13)
  drawQr(doc, target, P.l, cy, 64);
  if (pdfUrl) {
    drawQr(doc, pdfUrl, P.l + W - 64, cy, 64);
    inline(doc, [{ text: 'Share this PDF', style: 's', link: pdfUrl }], { x: P.l + W - 64, y: cy + 66, width: 64, size: 7, color: COLOR.mist, align: 'center' });
  }
  inline(doc, [{ text: onlineUrl ? 'Continue this conversation online' : 'Ask Anís your own question', style: 'h' }], { x: P.l + 78, y: cy, width: tw, size: 12, color: COLOR.sea });
  doc.y += 3; inline(doc, [{ text: `Anís is the Ocean AI Research Assistant of Ocean 2.0 (OceanLibrary.com). Scan the code or visit ${siteUrl.replace(/^https?:\/\//, '')}.${pdfUrl ? ' The code on the right opens this PDF, to share it.' : ''} This document is AI-assisted research: check each quotation against the source it cites.`, style: 'r' }], { x: P.l + 78, y: doc.y, width: tw, size: 9, color: COLOR.ink });
  doc.y = Math.max(doc.y, cy + 64 + (pdfUrl ? 12 : 0));

  // footers (page n of N)
  const { count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    doc.font('r0').fontSize(8).fillColor(COLOR.mist);
    doc.text(`Anís · Ocean AI Research Assistant · ${dateText}`, P.l, P.h - 44, { lineBreak: false });
    doc.text(`Page ${i + 1} of ${count}`, P.l, P.h - 44, { width: W, align: 'right', lineBreak: false });
  }
  doc.flushPages(); doc.end(); mdoc.end();
  return done;
}
