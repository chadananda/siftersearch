// The talk API's audio block + the original copy's word starts (the "Original" A/B button, Chad 10-23). Pure.
// The remaster stage writes meta.web_original {ogg, m4a} (paths under the item dir) + meta.aligned_to ('unipase'|'safe');
// transcript words carry s/e on the MAIN copy and s0/e0 on the original. One trim (offset_s) applies to both copies.

/** True when the talk's main copy is a distinct remaster with a kept original web encode. */
export function isRemastered(meta = {}) {
  const wo = meta?.web_original;
  return !!(wo && (wo.m4a || wo.ogg) && meta.aligned_to && meta.aligned_to !== 'safe');
}

/** The `audio` block of GET /api/media/:slug (null unless full playback). */
export function talkAudio({ slug, level, meta = {} }) {
  if (level !== 'full') return null;
  const v = meta.version || 1, base = `/api/media/${slug}`;
  const out = { ogg: `${base}/file/web/${slug}.ogg?v=${v}`, m4a: `${base}/file/web/${slug}.m4a?v=${v}`, offset_s: meta.trim?.start_s || 0, end_s: meta.trim?.end_s ?? null, remastered: false };
  if (isRemastered(meta)) {
    const wo = meta.web_original, f = (p) => (p ? `${base}/file/${String(p).replace(/^\/+/, '')}?v=${v}` : null);
    Object.assign(out, { remastered: true, original_url: f(wo.m4a || wo.ogg), original_ogg: f(wo.ogg) });
  }
  return out;
}

/** A paragraph's word starts on the ORIGINAL copy (s0, else s), or null when the talk is not remastered / has no s0. */
export function originalStarts(words = [], remastered = false) {
  if (!remastered || !words.some((w) => w?.s0 != null)) return null;
  return words.map((w) => (w.s0 ?? w.s));
}

/** Spread into a paragraph: { s0 } when the original copy's starts exist, else {}. */
export const originalField = (words, remastered) => { const s0 = originalStarts(words, remastered); return s0 ? { s0 } : {}; };
