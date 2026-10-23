// OceanLibrary display ids (the 10-23 export's `num`): what each block of a book is (content / source line / signature /
// lead-in / structure) and the number a reader cites it by. Chad 10-23: "display numbers are supposed to be totally
// unique to the book"; source, signature and header lines are not citable (their stray num is ignored); a lead-in
// (salutation, invocation, address line) sharing the next paragraph's number belongs to that paragraph; a block with no
// number inside a numbered unit (a Hidden Word's body) cites as the unit; numbers are OL's own, uppercase-roman segments
// as Arabic, letter prefixes (p.3, a1, qa.105) kept. A number two CONTENT paragraphs share is an OL defect: no reference.
// Pure; used by ops job ol-refresh and the defect report. Deps: the OL adapter's attr parser.
import { _internal } from '../../services/site-adapters/oceanlibrary.js';

const { parsePandocAttrs } = _internal;
const TRAILING = /^([\s\S]*?)\s*\{([^{}]+)\}\s*$/;
const FOOTNOTE = /^\[\^[^\]]+\]:/;

/** Text of a block without markup: tags, emphasis, footnote refs, a leading list marker. */
export const plain = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\[\^[^\]]+\]/g, '').replace(/[*_\\]/g, '')
  .replace(/^\s*#+\s*/, '').replace(/^\s*(?:\d{1,3}\.|[-*])\s+/, '').replace(/\s+/g, ' ').trim();
export const words = (t) => plain(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/** Raw export text → { fm, blocks:[{ i, ilm, num, type, subtype, classes, text, paraN }] } (footnote definitions dropped;
 *  a standalone `{…}` line belongs to the text block above it — OL's list items; paraN counts every attributed block). */
export function parseExport(text) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^([\w-]+):\s*"?(.*?)"?\s*$/); if (k) fm[k[1]] = k[2]; }
  const raw = (m ? m[2] : String(text)).split(/\n{2,}/).flatMap((b) => (FOOTNOTE.test(b) ? b.split(/\n(?=\[\^[^\]]+\]:)/) : [b])).map((b) => b.trim()).filter(Boolean);
  const blocks = []; let pending = null; let paraN = 0;
  const push = (t, attrs) => {
    if (attrs) paraN++;
    blocks.push({ i: blocks.length, ilm: attrs?.id ?? null, num: attrs?.num ?? null, type: attrs?.type || 'par', subtype: attrs?.subtype || null,
      classes: attrs?.classes || [], text: t, paraN: attrs ? paraN : null });
  };
  for (const b of raw) {
    if (FOOTNOTE.test(b)) { if (pending != null) { push(pending, null); pending = null; } continue; }
    const t = b.match(TRAILING);
    const attrs = t && /\b(?:id|type)=/.test(t[2]) ? parsePandocAttrs(t[2]) : null;
    if (!attrs) {
      const body = t ? t[1] : b;   // `{language="en"}` alone (or trailing) is not a block id — drop it, keep the text
      if (!body.trim()) continue;
      if (pending != null) push(pending, null); pending = body; continue;
    }
    if (t[1] === '') { if (pending != null) { push(pending, attrs); pending = null; } continue; }
    if (pending != null) { push(pending, null); pending = null; }
    push(t[1], attrs);
  }
  if (pending != null) push(pending, null);
  return { fm, blocks };
}

const SIG = /^(?:\(?signed\)?|your (?:true|loving|affectionate|devoted|ever)|with (?:loving|warm|deepest|love)|in his service|ever your|affectionately|yours (?:ever|faithfully|in|very|sincerely)|i am yours|shoghi\b|(?:the )?universal house of justice\.?$|department of the secretariat|for the universal house)/i;
const INVOCATION = /^\W*(?:in the name|he is (?:the|god)|in his name|bismi|بسم|هو\s)/i;
const NAME_LINE = /^[A-ZÁÉÍÓÚ‘’'][\p{L}’'‘\-.]*(?: [A-ZÁÉÍÓÚ‘’'][\p{L}’'‘\-.]*){0,3},?$/u;

/** One block's kind before lead-ins: struct (title/header/hr/illustration), source, signature, content. */
export function baseKind(b, nextType) {
  if (b.type !== 'par') return 'struct';
  const t = plain(b.text);
  if (b.classes.includes('reference')) return 'source';
  if (t.length < 600 && (/^\(.*\)\.?$/s.test(t) || /^[([]?(?:from a letter|from the|letter (?:written|of)|cited in)\b/i.test(t))) return 'source';
  const n = t.split(/\s+/).filter(Boolean).length;
  if (n <= 8 && t.length <= 70) {
    if (SIG.test(t)) return 'signature';
    if ((b.classes.includes('right') || b.classes.includes('signature')) && !/[.?!:;]$/.test(t)) return 'signature';
    if (NAME_LINE.test(t) && !/\d/.test(t) && ['hr', 'header', 'title', 'end'].includes(nextType)) return 'signature';
  }
  return 'content';
}

const ROMAN = /^(X{0,3})(IX|IV|V?I{0,3})$/;
const romanInt = (r) => { const v = { I: 1, V: 5, X: 10 }; let n = 0; for (let i = 0; i < r.length; i++) { const a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; } return n; };
/** OL's number as cited: trimmed, no trailing dot, uppercase roman segments (I–XXXIX) as Arabic; prefixes kept. */
export function olPn(num) {
  if (num == null) return null;
  const s = String(num).trim().replace(/[.\s]+$/, '');
  if (!s || s === 'none') return null;
  return s.split(/([.:])/).map((seg) => (seg && ROMAN.test(seg) ? String(romanInt(seg)) : seg)).join('');
}

/**
 * blocks (parseExport) → per block { kind, pn, cite, dup, invocationNumbered } and the book's duplicate content ids.
 * kind: struct | source | signature | lead-in | content. pn: the number shown/cited (lead-in = its paragraph's; an
 * unnumbered content block after a numbered one with no header/hr between inherits it; source/signature/struct: null).
 * cite: may be cited as "Book #pn" (content, has pn, pn not shared by another content block).
 */
export function numberBook(blocks) {
  const kinds = blocks.map((b, i) => baseKind(b, blocks[i + 1] ? (blocks[i + 1].type === 'par' ? 'par' : blocks[i + 1].type) : 'end'));
  const pns = blocks.map((b) => olPn(b.num));
  // a short content block whose number the very next content block also carries = its lead-in (salutation, invocation)
  for (let i = 0; i < blocks.length - 1; i++) {
    if (kinds[i] !== 'content' || !pns[i] || kinds[i + 1] !== 'content' || pns[i + 1] !== pns[i]) continue;
    if (words(blocks[i].text).length <= 30) kinds[i] = 'lead-in';
  }
  const out = blocks.map((b, i) => ({ kind: kinds[i], pn: null, ownNum: pns[i], cite: false, dup: false, inherited: false, invocationNumbered: false }));
  let unit = null;   // the last numbered content pn, until a header/hr closes the unit
  for (let i = 0; i < blocks.length; i++) {
    const o = out[i];
    if (o.kind === 'struct') { if (['header', 'hr', 'title'].includes(blocks[i].type)) unit = null; continue; }
    if (o.kind === 'source' || o.kind === 'signature') continue;
    if (o.kind === 'lead-in') { o.pn = pns[i]; continue; }
    if (pns[i]) { o.pn = pns[i]; unit = pns[i]; } else if (unit) { o.pn = unit; o.inherited = true; }
    if (pns[i] && INVOCATION.test(plain(blocks[i].text)) && words(blocks[i].text).length <= 30) o.invocationNumbered = true;
  }
  const count = new Map();
  out.forEach((o) => { if (o.kind === 'content' && o.pn && !o.inherited) count.set(o.pn, (count.get(o.pn) || 0) + 1); });
  const dups = [...count].filter(([, n]) => n > 1).map(([pn]) => pn);
  const dupSet = new Set(dups);
  out.forEach((o) => { if (o.pn && dupSet.has(o.pn) && o.kind !== 'struct') o.dup = true; o.cite = o.kind === 'content' && !!o.pn && !o.dup; });
  return { blocks: out, dups };
}

/**
 * Every duplicated raw `num` in a book, by kind (OL defect report; Chad 10-23: numbers must be unique to the book).
 * → [{ num, kind: source|signature|header|lead-in|content, blocks:[{ ilm, kind, text }] }]; a group's kind is its
 * worst member's: content (two content paragraphs) > lead-in > header > signature > source. Plus numbered invocations.
 */
export function numberingDefects(blocks, numbered = numberBook(blocks)) {
  const by = new Map();
  blocks.forEach((b, i) => {
    const pn = olPn(b.num); if (!pn) return;
    const k = numbered.blocks[i].kind === 'struct' ? (b.type === 'header' ? 'header' : 'struct') : numbered.blocks[i].kind;
    if (!by.has(pn)) by.set(pn, []);
    by.get(pn).push({ ilm: b.ilm, kind: k, text: plain(b.text).slice(0, 100) });
  });
  const rank = { content: 5, 'lead-in': 4, header: 3, struct: 3, signature: 2, source: 1 };
  const groups = [];
  for (const [num, list] of by) {
    if (list.length < 2) continue;
    const contents = list.filter((x) => x.kind === 'content').length;
    // a lead-in + its paragraph is one unit sharing one number (OL convention) — listed, lowest severity
    const kind = contents >= 2 ? 'content' : list.some((x) => x.kind === 'lead-in') && contents <= 1 && list.every((x) => ['lead-in', 'content'].includes(x.kind)) ? 'lead-in'
      : list.filter((x) => x.kind !== 'content').sort((a, b) => rank[b.kind] - rank[a.kind])[0].kind;
    groups.push({ num, kind: kind === 'struct' ? 'header' : kind, blocks: list });
  }
  const invocations = blocks.map((b, i) => (numbered.blocks[i].invocationNumbered ? { num: olPn(b.num), ilm: b.ilm, text: plain(b.text).slice(0, 100) } : null)).filter(Boolean);
  return { groups, invocations };
}
