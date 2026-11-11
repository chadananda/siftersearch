// Article writers for periodicals (Star of the West): each article's writer from its byline, "FROM X." heading, closing
// "(Signed) X." or the issue's table of contents. Pure, no LLM. Name as written (evidence, not identity). Deps: trailers, window
import { trailerText, isHeading, isMeta } from './trailers.js';
import { canonical } from './window.js';

const PARTICLE = new Set(['de', 'van', 'von', 'der', 'al', 'el', 'ibn', 'bin', 'ben', 'du', 'la', 'le', 'di', 'da', 'ud', 'ul']);
const clean = (s) => trailerText(s).replace(/^#+\s*/, '').replace(/[_*]/g, '').trim();
const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
/** 1-6 capitalised words (initials, particles allowed), no digits / sentence punctuation: a person, not prose. */
export function nameShaped(s) {
  const t = String(s).trim().replace(/[.,;:]+$/, '');
  if (!t || t.length > 60 || /\d|[,;:!?"“”()]/.test(t)) return false;
  const w = t.split(/\s+/);
  if (w.length > 6) return false;
  return w.every((x) => /^['’‘ʻʼ]?\p{Lu}/u.test(x) || PARTICLE.has(x.toLowerCase())) && /\p{L}{2}/u.test(t);
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s.\-])(['’‘ʻʼ]?)(\p{L})/gu, (m, a, q, b) => a + q + b.toUpperCase());
/** Display form: aliases (Shoghi → Shoghi Effendi, 'ABDU'L-BAHÁ ABBAS → ‘Abdu’l-Bahá), ALL CAPS → Title Case, "Mr." dropped. */
export function displayName(raw) {
  let n = String(raw).trim().replace(/[.\s]+$/, '').replace(/^(?:mr|mrs|miss)\.?\s+/i, '').replace(/\s+/g, ' ');
  const base = n.replace(/\s+['’‘ʻʼ]?abb[aá]s$/i, '');
  if (/^shoghi$/i.test(base)) return 'Shoghi Effendi';
  const c = canonical(base);
  if (c && c !== base && !/editor/i.test(c)) return c;
  if (c && /^(‘|Bah|The B|Shoghi|Universal)/.test(c) && fold(c) === fold(base)) return c;
  return n === n.toUpperCase() ? titleCase(n) : n;
}
const lastWord = (n) => fold(String(n).trim().split(/\s+/).pop());
const similar = (a, b) => !!a && !!b && (fold(a) === fold(b) || lastWord(a) === lastWord(b));

const FROM = /^FROM\s+((?:(?:MR|MRS|MISS|DR|PROF|REV)\.?\s+)?[^a-z]{3,60}?)\.?$/;           // "FROM MR. SIDNEY SPRAGUE."
const FROM_MIXED = /^From\s+((?:(?:Mr|Mrs|Miss|Dr|Prof|Rev)\.?\s+)?\p{Lu}[^.]{2,50}?)\.?$/u;
const BY = /^(?:written\s+)?by\s+(.{3,70}?)\.?$/i;
const SIGNED = /^\(signed\)\s*(.{2,70}?)\.?$/i;
const DASH = /^(?:[—–]|--)\s*(.{2,70}?)\.?$/;
// "From Stenographic Notes." / "From the Diary of …" name a record, not a person (11-11 dry run credited "Stenographic Notes")
const RECORD = /\b(?:notes?|diary|records?|minutes|stenographic|letters?|tablets?|address|talks?|words|writings|press|report|translation)\b/i;
const personFrom = (m) => { const x = m?.[1]?.trim(); return x && nameShaped(x) && !RECORD.test(x) && (x.split(/\s+/).length >= 2 || /^shoghi$/i.test(x)) ? x : null; };
// a title stored as a plain paragraph ("TABLET FROM 'ABDU'L-BAHÁ", "Words of 'Abdu'l-Bahá", "ADDRESS OF 'ABDU'L-BAHÁ AT …") opens a new
// piece: left inside the article before it, its closing "(Signed) 'ABDU'L-BAHÁ" credited Louise Waite's essay to Him (SoW v12 i1, 11-11)
const TITLE_OPENER = /^(?:(?:a|the|another)\s+)?(?:(?:recent|new)\s+)?(?:tablets?|words|address|talk|letter|prayer|supplication|cablegram)\s+(?:from|of|to|by|revealed)\b/i;
export const titleLine = (t) => t.length <= 200 && TITLE_OPENER.test(t) && !/[,;:]\s*$/.test(t) && (t.length <= 90 || t === t.toUpperCase());
export const fromLine = (t) => personFrom(t.match(FROM)) || personFrom(t.match(FROM_MIXED));
export const byLine = (t) => { const m = t.match(BY); return m && nameShaped(m[1]) && /^[A-Z*_]/.test(t) ? m[1].trim() : null; };
export function signedLine(t) {
  const m = t.match(SIGNED) || t.match(DASH);
  const x = m?.[1]?.trim().replace(/\.+$/, '');
  if (!x) return null;
  if (/^the editors?$/i.test(x)) return 'The Editors';
  return nameShaped(x) || /^['’‘ʻʼ]?abdu/i.test(x) || /^bah[aá]/i.test(x) ? x : null;
}
const level = (r, t) => { const m = String(r.text || '').match(/^(#+)\s/); return m ? m[1].length : (String(r.blocktype || '').match(/(\d)/) || [])[1] * 1 || 2; };

/** "Title—By X ..... 4", "Title—From the Words of Y ..... 4", "Title, X ..... 354" → Map(folded title → writer). */
export function tocWriters(rows) {
  const out = new Map();
  for (const r of rows) {
    const t = clean(r.text);
    if (!/\.{4,}\s*\d+/.test(t)) continue;
    for (let e of t.split(/\.{4,}\s*\d+\s*/).map((x) => x.replace(/^PAGE\s+/i, '').replace(/\{[^}]*\}/g, '').trim()).filter(Boolean)) {
      let title = null, w = null, m;
      if ((m = e.match(/^(.+?)\s*[—–-]+\s*(?:by|from the words of|words of|from)\s+(.{3,60})$/i)) && (nameShaped(m[2]) || /abdu|bah[aá]/i.test(m[2]))) [title, w] = [m[1], m[2]];
      else if ((m = e.match(/^(.+),\s*([^,]{3,60})$/)) && nameShaped(m[2])) [title, w] = [m[1], m[2]];
      if (title && fold(title).length >= 4) out.set(fold(title), displayName(w));
    }
  }
  return out;
}

/** rows [{ id, pidx, text, blocktype }] in order → Map(rowId → { writer, basis, span:[firstPidx, lastPidx] }). */
export function articleWriters(rows) {
  const toc = tocWriters(rows), out = new Map();
  const segs = [];
  let cur = null;
  const stack = [];
  const open = (seg) => { cur = seg; segs.push(seg); };
  rows.forEach((r, i) => {
    const t = clean(r.text);
    if (!t) return;
    if (/\.{4,}\s*\d+/.test(t)) { if (cur) cur.rows.push(r); return; }
    const head = isHeading(r, String(r.text || '').trim());
    const from = !head ? fromLine(t) : null;
    if (head) {
      const L = level(r, t);
      while (stack.length && stack[stack.length - 1].level >= L) stack.pop();
      const parent = stack[stack.length - 1];
      open({ title: t, level: L, rows: [r], start: parent?.start?.basis === 'byline' ? parent.start : null, prose: false });
      stack.push(cur);
    } else if (from) open({ title: t, level: 99, rows: [r], start: { writer: displayName(from), basis: 'from-heading' }, prose: true });
    else if (cur && titleLine(t)) open({ title: t, level: 99, rows: [r], start: null, prose: false });
    else if (cur) {
      cur.rows.push(r);
      if (!isMeta(t)) cur.prose = true;
      if (!cur.start && cur.rows.filter((x) => !isMeta(clean(x.text))).length <= 4) { const b = byLine(t); if (b) cur.start = { writer: displayName(b), basis: 'byline', explicit: true }; }
    }
  });
  for (const seg of segs) {
    if (/^contents?$/i.test(seg.title)) continue;
    const start = seg.start || (toc.has(fold(seg.title)) ? { writer: toc.get(fold(seg.title)), basis: 'toc' } : null);
    // signatures split the segment into blocks; "—X" only counts when the article ends within 2 paragraphs of it
    const body = seg.rows.map((r) => ({ r, t: clean(r.text) })).filter((x) => x.t && !/^-{3,}$/.test(x.t));
    const sigs = [];
    body.forEach((x, k) => {
      const w = signedLine(x.t);
      if (!w) return;
      const tail = body.slice(k + 1).filter((y) => !isMeta(y.t)).length <= 2;
      if (/^\(signed\)/i.test(x.t) ? !(start?.explicit && !similar(displayName(w), start.writer) && !tail) : tail) sigs.push({ k, w: displayName(w) });
    });
    let from = 0;
    const block = (to, sig) => {
      // a signer other than the article's named writer, closing the article's opening block: the block is mixed (the writer's text, then a
      // signed piece we could not separate) — credited to no one rather than all of it to the signer
      const clash = sig && start && !similar(sig, start.writer) && from === 0 && start.basis !== 'from-heading';
      const slice = seg.rows.slice(from, to), w = clash ? null : sig && start && similar(sig, start.writer) ? { writer: start.writer, basis: start.basis } : sig ? { writer: sig, basis: 'signature' } : start ? { writer: start.writer, basis: start.basis } : null;
      if (w && slice.length) for (const r of slice) out.set(r.id, { ...w, span: [slice[0].pidx, slice[slice.length - 1].pidx] });
    };
    for (const s of sigs) { const end = seg.rows.indexOf(body[s.k].r) + 1; block(end, s.w); from = end; }
    // text after the article's own closing signature belongs to no one we can name
    if (!sigs.length || !(start?.basis === 'from-heading' || sigs.some((x) => similar(x.w, start?.writer)))) block(seg.rows.length, null);
  }
  return out;
}
