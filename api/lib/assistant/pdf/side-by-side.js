// Print renderer for the side_by_side widget (pdf/render.js calls it). The original is shaped right-to-left in Amiri (font 'a0': fontkit joins the letters; words are
// wrapped here with NBSP so pdfkit cannot drop the word gaps); translations flow through render.js' inline(). A QR to the work floats on the right edge unless the page already carries it at the top (ctx.topQr).
// tight = one ruled row per verse (spans merged); study = sentence rows, no rules. The verse number sits in a narrow centre column.
import { studyRows, heads, verseNumber } from '../widgets/side-by-side.js';

const PAD = 4, SIZE = 9.5, AR = 15, NB = ' ', NW = 22;
// greedy wrap of Arabic-script text into lines (each NBSP-joined) that fit `width`
export function rtlLines(doc, text, width, size = AR) {
  doc.font('a0').fontSize(size);
  const out = []; let line = [];
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (line.length && doc.widthOfString([...line, w].join(NB)) > width) { out.push(line.join(NB)); line = []; }
    line.push(w);
  }
  if (line.length) out.push(line.join(NB));
  return out;
}
/** ctx: { x, width, bottom, need(h), addPage(), color, inline(doc, spans, o), measure(spans, o), drawQr(doc, url, x, y, size), topQr } → draws the widget at doc.y.
 *  Columns: original | verse number | translation(s). The original's width is chosen so both sides run about the same height (Chad 11-13). */
export function drawSideBySide(doc, data, ctx, { layout = data.layout ?? 'tight' } = {}) {
  const { x, width, bottom, color } = ctx, study = layout === 'study', n = data.translations.length, rtl = data.original.dir === 'rtl';
  // the verse number leaves the text for the centre column: the translation's own number, else the original's
  const nums = [];
  const rows = (study ? studyRows(data) : data.rows).map((r, i) => {
    const strip = (c) => { if (!c?.text) return c; const v = verseNumber(c.text); if (!v.num) return c; nums[i] ??= v.num; return { ...c, text: v.rest }; };
    const translations = r.translations.map(strip);
    return { ...r, original: strip(r.original), translations };
  });
  // sentence rows (r.verse set) number only a verse's first sentence and rule only between verses
  const sentences = rows.some((r) => r.verse != null);
  const label = (i) => (sentences ? (rows[i].first ? String(rows[i].verse) : '') : nums.some(Boolean) ? nums[i] ?? '' : String(i + 1));
  const ends = (k) => !sentences || k === rows.length - 1 || rows[k + 1].first;
  const nw = n ? NW : 0, avail = width - nw;
  const lh = (() => { doc.font('a0').fontSize(AR); return doc.currentLineHeight(true) + 2; })();
  const txt = (c, w) => (c?.text ? ctx.measure([{ text: c.text, style: 'r' }], { width: w - 2 * PAD, size: SIZE, gap: 1.5 }) : 0);
  const layoutAt = (ow) => {
    const tw = n ? (avail - ow) / n : 0;
    const oLines = rows.map((r) => (rtl ? rtlLines(doc, r.original.text, ow - 2 * PAD) : []));
    const oh = rows.map((r, i) => (rtl ? oLines[i].length * lh : txt(r.original, ow)));
    const th = rows.map((r) => Math.max(0, ...r.translations.map((c) => (c?.span > 1 ? 0 : txt(c, tw)))));
    return { ow, tw, oLines, oh, th, total: oh.reduce((a, v, i) => a + Math.max(v, th[i]), 0) };
  };
  // the split with the shortest table: both sides then fill their rows about equally
  let L = layoutAt(n ? avail * 0.5 : width);
  if (n) for (let f = 0.32; f <= 0.68; f += 0.04) { const c = layoutAt(avail * f); if (c.total < L.total - 0.5) L = c; }
  const { ow, tw, oLines } = L;
  const colX = (c) => x + (c < 0 ? 0 : ow + nw + c * tw);
  const h = rows.map((r, i) => Math.max(L.oh[i], L.th[i]) + 2 * PAD);
  rows.forEach((r, i) => r.translations.forEach((c) => {   // a spanned cell needs its text height across its rows
    if (!(c?.span > 1)) return;
    const have = h.slice(i, i + c.span).reduce((a, b) => a + b, 0), need = txt(c, tw) + 2 * PAD;
    if (need > have) h[Math.min(rows.length, i + c.span) - 1] += need - have;
  }));
  // header
  const head = () => {
    const hh = 18, y = doc.y; doc.rect(x, y, width, hh).fill(color.sea);
    heads(data).forEach((hd, c) => { const t = String(hd.kicker || '').toUpperCase();
      ctx.inline(doc, [{ text: t.length > 48 ? `${t.slice(0, 46)}…` : t, style: 's', color: '#ffffff' }], { x: colX(c - 1) + PAD, y: y + 5.5, width: (c ? tw : ow) - 2 * PAD, size: 7.5 }); });
    doc.y = y + hh;
  };
  // the words of a cell that fit in `room` points → [now, rest] (a row taller than the page breaks both columns together, 11-13)
  const fitWords = (text, w, room) => {
    if (txt({ text }, w) <= room) return [text, ''];
    const ws = String(text).split(/(?<=\s)/);
    let lo = 0, hi = ws.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (txt({ text: ws.slice(0, mid).join('') }, w) <= room) lo = mid; else hi = mid - 1; }
    return [ws.slice(0, lo).join('').trimEnd(), ws.slice(lo).join('')];
  };
  const start = (hh) => Math.min(hh, 6 * lh);   // a row taller than a page starts wherever a few lines fit, then continues
  ctx.need(18 + start(h[0] || 0)); head();
  const qrUrl = data.work?.url || data.rows[0]?.original.url;
  if (qrUrl && !ctx.topQr) ctx.drawQr(doc, qrUrl, x + width + 4, doc.y - 18, 44);
  // groups = rows tied together by a spanned translation cell; a group never splits across pages unless it is taller than the page
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    for (let k = i; k < j; k++) for (const c of rows[k].translations) if (c?.span > 1) j = Math.max(j, k + c.span);
    j = Math.min(j, rows.length);
    const gh = h.slice(i, j).reduce((a, b) => a + b, 0);
    if (doc.y + (gh < bottom - 120 ? gh : start(h[i])) > bottom) { ctx.addPage(); head(); }
    let y = doc.y;
    for (let k = i; k < j; k++) {
      const r = rows[k];
      if (nw && label(k)) ctx.inline(doc, [{ text: label(k), style: 's', color: color.mist }], { x: x + ow, y: y + PAD + 2, width: nw, size: 7.5, align: 'center' });
      // a spanned cell is drawn whole on its first page; every other cell and the original break page by page TOGETHER, so a
      // row taller than the page never starts its translation a page before its original (11-13: Tablet of Aḥmad verse 6)
      r.translations.forEach((c, m) => { if (c?.text && c.span > 1) ctx.inline(doc, [{ text: c.text, style: 'r', ...(c.url ? { link: c.url } : {}) }], { x: colX(m) + PAD, y: y + PAD, width: tw - 2 * PAD, size: SIZE, gap: 1.5 }); });
      const parts = r.translations.map((c) => (c?.text && !(c.span > 1) ? c.text : null));
      let oRest = rtl ? oLines[k].slice() : r.original.text || '', broke = false;
      for (;;) {
        const room = bottom - y - 2 * PAD;
        let used = 0, drew = false;
        parts.forEach((t, m) => {
          if (!t) return;
          const [now, rest] = fitWords(t, tw, room), c = r.translations[m];
          if (now) { ctx.inline(doc, [{ text: now, style: 'r', ...(c.url ? { link: c.url } : {}) }], { x: colX(m) + PAD, y: y + PAD, width: tw - 2 * PAD, size: SIZE, gap: 1.5 }); used = Math.max(used, txt({ text: now }, tw)); drew = true; }
          parts[m] = rest || null;
        });
        if (rtl) {
          const now = oRest.splice(0, Math.max(0, Math.floor(room / lh)));
          now.forEach((l, q) => doc.font('a0').fontSize(AR).fillColor(color.ink).text(l, x + PAD, y + PAD + q * lh, { width: ow - 2 * PAD, align: 'right', lineBreak: false, ...(r.original.url ? { link: r.original.url } : {}) }));
          if (now.length) { used = Math.max(used, now.length * lh); drew = true; }
        } else if (oRest) {
          const [now, rest] = fitWords(oRest, ow, room);
          if (now) { ctx.inline(doc, [{ text: now, style: 'r', ...(r.original.url ? { link: r.original.url } : {}) }], { x: x + PAD, y: y + PAD, width: ow - 2 * PAD, size: SIZE, gap: 1.5 }); used = Math.max(used, txt({ text: now }, ow)); drew = true; }
          oRest = rest;
        }
        if (!(parts.some(Boolean) || oRest.length) || (!drew && broke)) { if (broke) h[k] = used + 2 * PAD; break; }
        ctx.addPage(); head(); y = doc.y; broke = true;
      }
      y += h[k];
      // the rule under a row: full width at the end of the group, the original column only inside a spanned group
      if (!study && ends(k)) doc.moveTo(x, y).lineTo(k === j - 1 ? x + width : x + ow, y).lineWidth(0.5).strokeColor(color.rule).stroke();
    }
    doc.y = y; i = j;
  }
  doc.y += 8;
  if (data.approximate) { ctx.inline(doc, [{ text: 'Aligned approximately (by meaning or position in the work), not verse by verse.', style: 'i', color: color.mist }], { x, y: doc.y, width, size: 8 }); doc.y += 6; }
}
