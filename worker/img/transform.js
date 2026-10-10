// ImageKit-compatible transform parsing + crop geometry + format negotiation. Pure, unit-tested in Node.
// Ported from blogworks.ai packages/blogworks-image/src/transform.ts (Chad's own self-hosted ImageKit replacement);
// adds e-sharpen. `?tr=w-800,h-600,fo-face,f-auto,q-80,e-sharpen` — groups chained with ':' collapse to the last.

const num = (v) => {
  if (v == null) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

// ImageKit `c-` crop mode → fit (maintain_ratio = cover-style scale + crop).
const CMODE_TO_FIT = { maintain_ratio: 'cover', force: 'fill', at_max: 'inside', at_max_enlarge: 'inside', at_least: 'cover', pad_resize: 'contain' };
const FOCI = ['center', 'top', 'bottom', 'left', 'right', 'top_left', 'top_right', 'bottom_left', 'bottom_right', 'auto', 'face'];

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

/** One ImageKit group (comma-separated key-value tokens) → spec. Keys: w,h,q,dpr,f,fo,c,cm+x,y,e (e-sharpen). */
export function parseTransformGroup(group) {
  const kv = new Map();
  for (const tok of group.split(',')) {
    const i = tok.indexOf('-');
    if (i < 0) { kv.set(tok.trim(), ''); continue; }
    kv.set(tok.slice(0, i).trim(), tok.slice(i + 1).trim());
  }
  const spec = {
    width: num(kv.get('w')),
    height: num(kv.get('h')),
    fit: CMODE_TO_FIT[kv.get('c') ?? ''] ?? 'cover',
    focus: FOCI.includes((kv.get('fo') ?? 'center').toLowerCase()) ? (kv.get('fo') ?? 'center').toLowerCase() : 'center',
    format: normalizeFormat(kv.get('f')),
    quality: clamp(num(kv.get('q')) ?? 82, 1, 100),
    dpr: clamp(num(kv.get('dpr')) ?? 1, 1, 3),
    sharpen: kv.get('e') === 'sharpen',
  };
  if (kv.get('cm') === 'extract') {
    const x = num(kv.get('x')) ?? 0, y = num(kv.get('y')) ?? 0, w = num(kv.get('w')) ?? 0, h = num(kv.get('h')) ?? 0;
    if (w > 0 && h > 0) { spec.extract = { x, y, w, h }; spec.width = undefined; spec.height = undefined; }
  }
  return spec;
}

export const defaultSpec = () => ({ fit: 'cover', focus: 'center', format: 'auto', quality: 82, dpr: 1, sharpen: false });

/** A full `tr=` value; ImageKit chains groups with ':' — the last group's sizing is applied. */
export function parseTransforms(tr) {
  if (!tr) return [defaultSpec()];
  return tr.split(':').map(parseTransformGroup);
}

function normalizeFormat(v) {
  const f = (v ?? 'auto').toLowerCase();
  if (f === 'jpg' || f === 'jpeg') return 'jpeg';
  if (f === 'webp' || f === 'png' || f === 'auto') return f;
  return 'auto';   // avif: Photon cannot encode it → negotiate (webp/jpeg)
}

/** Resolve f-auto: webp by default; jpeg only for a legacy client that lists image types without webp or a wildcard. */
export function resolveFormat(spec, accept) {
  if (spec.format !== 'auto') return spec.format;
  const a = accept ?? '';
  const listsImages = /image\/(jpeg|jpg|png|gif|webp|avif)/.test(a);
  const hasWildcard = /image\/\*/.test(a) || /\*\/\*/.test(a);
  if (listsImages && !/image\/webp/.test(a) && !hasWildcard) return 'jpeg';
  return 'webp';
}

/** Focal point (0..1) for a fixed focus keyword; auto/face resolve at runtime (focal.js). */
export function focusToPoint(focus) {
  const map = {
    center: { fx: 0.5, fy: 0.5 }, top: { fx: 0.5, fy: 0.15 }, bottom: { fx: 0.5, fy: 0.85 }, left: { fx: 0.15, fy: 0.5 },
    right: { fx: 0.85, fy: 0.5 }, top_left: { fx: 0.15, fy: 0.15 }, top_right: { fx: 0.85, fy: 0.15 },
    bottom_left: { fx: 0.15, fy: 0.85 }, bottom_right: { fx: 0.85, fy: 0.85 },
  };
  return map[focus] ?? { fx: 0.5, fy: 0.5 };
}

/** Focal-aware cover: scale to cover the box, crop the window centred on the focal point (clamped). */
export function computeCoverCrop(sw, sh, tw, th, focal) {
  const scale = Math.max(tw / sw, th / sh);
  const scaledW = Math.max(tw, Math.round(sw * scale));
  const scaledH = Math.max(th, Math.round(sh * scale));
  const cx = clamp(focal.fx * scaledW - tw / 2, 0, scaledW - tw);
  const cy = clamp(focal.fy * scaledH - th / 2, 0, scaledH - th);
  return { scaledW, scaledH, cropX: Math.round(cx), cropY: Math.round(cy), cropW: tw, cropH: th };
}

/** contain/inside: scale to fit the box (inside never upscales). */
export function computeContain(sw, sh, tw, th, allowUpscale) {
  const boxW = tw ?? sw, boxH = th ?? sh;
  let scale = Math.min(boxW / sw, boxH / sh);
  if (!allowUpscale) scale = Math.min(scale, 1);
  return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)) };
}
