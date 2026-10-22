// CLIPS: any span of a talk as a stateless, shareable URL — /media/<slug>/clip/<startMs>-<endMs> (no database row).
// Pure helpers shared by the clip page (SSR), its quote card (API) and the talk page's selection sharing.
export const CLIP_MAX_MS = 180_000;

/** "12000-34000" → { startMs, endMs } (whole ms, end > start, capped at 3 min), or null. */
export function parseClipRange(s) {
  const m = /^(\d{1,8})-(\d{1,8})$/.exec(String(s || '').replace(/\.jpg$/, ''));
  if (!m) return null;
  const startMs = Number(m[1]), endMs = Math.min(Number(m[2]), startMs + CLIP_MAX_MS);
  return endMs > startMs ? { startMs, endMs } : null;
}

/** Snap a selection (seconds) to the words it touches, capped at 3 min → { startMs, endMs } on word boundaries.
 *  words: [{ s, e }] in reading order (seconds). */
export function snapClip(words, start, end) {
  const inside = words.filter((w) => w.e > start + 0.01 && w.s < end - 0.01);
  if (!inside.length) return null;
  const s0 = inside[0].s;
  let last = inside[inside.length - 1];
  for (const w of inside) if (w.e - s0 <= CLIP_MAX_MS / 1000) last = w; else break;
  return { startMs: Math.floor(s0 * 1000), endMs: Math.ceil(last.e * 1000) };
}

/** The clean words a clip covers. paragraphs: [{ words: [[w, s, e, hide?]] | [{ w, s, e, hide }] }]. → text */
export function clipText(paragraphs = [], startMs, endMs) {
  const a = startMs / 1000 - 0.05, b = endMs / 1000 + 0.05, out = [];
  for (const p of paragraphs) for (const x of p.words || []) {
    const w = Array.isArray(x) ? { w: x[0], s: x[1], e: x[2], hide: !!x[3] } : x;
    if (w.hide || w.s < a || w.e > b) continue;
    out.push(w.w);
  }
  return out.join(' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

export const clipPath = (slug, startMs, endMs) => `/media/${encodeURIComponent(slug)}/clip/${Math.round(startMs)}-${Math.round(endMs)}`;
