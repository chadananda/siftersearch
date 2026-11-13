// Print renderer for the side_by_side widget (pdf/render.js calls it). The original is shaped right-to-left in Amiri (font 'a0': fontkit joins the letters; words are
// wrapped here with NBSP so pdfkit cannot drop the word gaps); translations flow through render.js' inline(). A QR to the work floats on the right edge.
// tight = one ruled row per verse (spans merged); study = sentence rows, no rules.
import { studyRows, heads } from '../widgets/side-by-side.js';

const PAD = 4, SIZE = 9.5, AR = 15, NB = ' ';
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
/** ctx: { x, width, bottom, need(h), addPage(), color, inline(doc, spans, o), measure(spans, o), drawQr(doc, url, x, y, size) } → draws the widget at doc.y. */
export function drawSideBySide(doc, data, ctx, { layout = data.layout ?? 'tight' } = {}) {
  const { x, width, bottom, color } = ctx, study = layout === 'study', rows = study ? studyRows(data) : data.rows, n = data.translations.length;
  const ow = n ? width * 0.42 : width, tw = n ? (width - ow) / n : 0, rtl = data.original.dir === 'rtl';
  const colX = (c) => x + (c < 0 ? 0 : ow + c * tw);
  // measure: the original (RTL lines, or Latin for an LTR original) and each translation cell
  const lh = (() => { doc.font('a0').fontSize(AR); return doc.currentLineHeight(true) + 2; })();
  const oLines = rows.map((r) => (rtl ? rtlLines(doc, r.original.text, ow - 2 * PAD) : []));
  const txt = (c, w) => (c?.text ? ctx.measure([{ text: c.text, style: 'r' }], { width: w - 2 * PAD, size: SIZE, gap: 1.5 }) : 0);
  const h = rows.map((r, i) => Math.max(rtl ? oLines[i].length * lh : txt(r.original, ow), ...r.translations.map((c) => (c?.span > 1 ? 0 : txt(c, tw)))) + 2 * PAD);
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
  const start = (hh) => Math.min(hh, 6 * lh);   // a row taller than a page starts wherever a few lines fit, then continues
  ctx.need(18 + start(h[0] || 0)); head();
  const qrUrl = data.work?.url || data.rows[0]?.original.url;
  if (qrUrl) ctx.drawQr(doc, qrUrl, x + width + 4, doc.y - 18, 44);
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
      // translations first (they stay on the row's first page); the original may continue across pages
      r.translations.forEach((c, m) => { if (c?.text) ctx.inline(doc, [{ text: c.text, style: 'r', ...(c.url ? { link: c.url } : {}) }], { x: colX(m) + PAD, y: y + PAD, width: tw - 2 * PAD, size: SIZE, gap: 1.5 }); });
      if (rtl) {
        let ly = y + PAD, broke = false;
        for (const l of oLines[k]) {
          if (ly + lh > bottom) { ctx.addPage(); head(); y = doc.y; ly = y + PAD; broke = true; }
          doc.font('a0').fontSize(AR).fillColor(color.ink).text(l, x + PAD, ly, { width: ow - 2 * PAD, align: 'right', lineBreak: false, ...(r.original.url ? { link: r.original.url } : {}) });
          ly += lh;
        }
        h[k] = broke ? ly + PAD - y : Math.max(h[k], ly + PAD - y);
      } else ctx.inline(doc, [{ text: r.original.text, style: 'r', ...(r.original.url ? { link: r.original.url } : {}) }], { x: x + PAD, y: y + PAD, width: ow - 2 * PAD, size: SIZE, gap: 1.5 });
      y += h[k];
      // the rule under a row: full width at the end of the group, the original column only inside a spanned group
      if (!study) doc.moveTo(x, y).lineTo(k === j - 1 ? x + width : x + ow, y).lineWidth(0.5).strokeColor(color.rule).stroke();
    }
    doc.y = y; i = j;
  }
  doc.y += 8;
  if (data.approximate) { ctx.inline(doc, [{ text: 'Aligned approximately (by meaning or position in the work), not verse by verse.', style: 'i', color: color.mist }], { x, y: doc.y, width, size: 8 }); doc.y += 6; }
}
