// TOPIC SUBHEADERS (Chad 10-22): the media-headings role proposes a subheader at each topic shift, phrased as a statement
// or a question the talk raises; this guard keeps only those that start at a real paragraph, sit ≥ 2 min after the
// previous one (≈ one per 3–8 min, by content), and share a content word with the section they head (faithful to what is
// said there). Headings are structure only: no audio, no time of their own (the TOC jumps to the paragraph they precede).
// Each gets a #slug for deep links. Pure.
import { slugify } from './names.js';

const STOP = new Set('about above after again against also among another because been before being between both could does doing during each every from further have having here into itself just more most much must only other over same should some such than that their theirs them then there these they this those through under until very were what when where which while whom whose will with within without would your yours talk speaker speaks discusses discussion'.split(' '));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ`']/g, '').toLowerCase();
/** The heading's content words, as 5-letter stems ("interpreter" ~ "interpretation"). */
export const contentStems = (s) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)))];

/** A unique #slug for a heading. used: a Set of slugs already taken (mutated). */
export function headingSlug(text, used = new Set()) {
  const base = slugify(text, 60) || 'section';
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
}

/** Does the section the heading opens talk about it? (≥ 1 of its content words, or half of them for long headings, appear) */
export function supported(text, sectionText) {
  const stems = contentStems(text);
  if (!stems.length) return false;
  const body = new Set(fold(sectionText).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
  const hit = stems.filter((s) => body.has(s)).length;
  return hit >= Math.max(1, Math.ceil(stems.length / 3));
}

/**
 * Validate proposals [{ p, text, form }] against the paragraphs → { headings, refused }.
 * headings: [{ kind: 'heading', source: 'generated', model, p, text, form, slug }] in order.
 */
export function acceptHeadings(proposals, paragraphs, { model = null, minGapS = 120, maxLen = 110 } = {}) {
  const byN = new Map(paragraphs.map((p, i) => [p.n, i]));
  const textOf = (p) => p.words.filter((w) => !w.hide).map((w) => w.w).join(' ');
  const sorted = [...(proposals || [])].filter((h) => h && byN.has(Number(h.p))).sort((a, b) => Number(a.p) - Number(b.p));
  const out = [], refused = [], used = new Set();
  for (let k = 0; k < sorted.length; k++) {
    const h = sorted[k];
    const text = String(h.text || h.title || '').replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();
    const i0 = byN.get(Number(h.p));
    const why = !text ? 'empty' : text.length > maxLen ? 'too long' : null;
    if (why) { refused.push({ p: h.p, text, why }); continue; }
    const prev = out[out.length - 1];
    if (prev && paragraphs[i0].t0 - paragraphs[byN.get(prev.p)].t0 < minGapS) { refused.push({ p: h.p, text, why: 'too close to the previous heading' }); continue; }
    // the section: from this paragraph to the next proposal's (or 8 paragraphs, whichever is first)
    const next = sorted.slice(k + 1).find((x) => Number(x.p) > Number(h.p));
    const i1 = Math.min(next ? byN.get(Number(next.p)) : paragraphs.length, i0 + 8);
    if (!supported(text, paragraphs.slice(i0, Math.max(i1, i0 + 1)).map(textOf).join(' '))) { refused.push({ p: h.p, text, why: 'not what the section discusses' }); continue; }
    const form = /\?\s*$/.test(text) ? 'question' : 'statement';
    out.push({ kind: 'heading', source: 'generated', model, p: Number(h.p), text, form, slug: headingSlug(text, used) });
  }
  return { headings: out, refused };
}

/** headings with each one's start time (its paragraph's t0), for TOCs. */
export const withTimes = (headings, paragraphs) => {
  const t = new Map(paragraphs.map((p) => [p.n, p.t0]));
  return (headings || []).filter((h) => t.has(h.p)).map((h) => ({ ...h, t: t.get(h.p) }));
};
