// Ported from blogworks.ai packages/blogworks-image/src/focal.ts.
// Smart-crop focal detection via Cloudflare Workers AI (self-hosted equivalent of
// ImageKit fo-face / fo-auto). Runs an object-detection model (DETR) on the source
// and derives a normalized focal point (0..1):
//   fo-face → center on the highest-confidence person, biased to the head (upper body).
//   fo-auto → center on the largest salient detected object.
// Degrades gracefully to geometric center if AI is unavailable or finds nothing, so
// a transform never fails just because detection didn't fire.
import { focusToPoint } from './transform.js';


const DETR_MODEL = '@cf/facebook/detr-resnet-50';

/** Resolve a focal point for the given focus mode. Only auto/face hit Workers AI. */
export async function resolveFocalPoint(focus, srcBytes, ai, imgW, imgH) {
  if (focus !== 'auto' && focus !== 'face') return focusToPoint(focus);
  if (!ai) return { fx: 0.5, fy: 0.5 };
  try {
    const out = (await ai.run(DETR_MODEL, { image: Array.from(srcBytes) }));
    const boxes = Array.isArray(out) ? out : out?.objects ?? [];
    return focus === 'face' ? facePoint(boxes, imgW, imgH) : autoPoint(boxes, imgW, imgH);
  } catch {
    return { fx: 0.5, fy: 0.5 };
  }
}

/** Normalize a detection box (model returns pixel coords) to 0..1 center. */
function boxCenter(b, w, h) {
  const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2;
  const area = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
  return { fx: clamp01(cx / w), fy: clamp01(cy / h), area };
}

function facePoint(boxes, w, h) {
  const people = boxes.filter((b) => /person/i.test(b.label) && b.score >= 0.4);
  const pool = people.length ? people : boxes.filter((b) => b.score >= 0.4);
  if (!pool.length) return { fx: 0.5, fy: 0.5 };
  const best = pool.sort((a, b) => b.score - a.score)[0];
  // Head sits near the TOP of a person box — bias the focal point up into the top third.
  const cx = (best.box.xmin + best.box.xmax) / 2;
  const headY = best.box.ymin + (best.box.ymax - best.box.ymin) * 0.18;
  return { fx: clamp01(cx / w), fy: clamp01(headY / h) };
}

function autoPoint(boxes, w, h) {
  const pool = boxes.filter((b) => b.score >= 0.4);
  if (!pool.length) return { fx: 0.5, fy: 0.5 };
  // Largest confident object = the subject. Weight by area*score.
  const best = pool
    .map((b) => ({ b, c: boxCenter(b.box, w, h) }))
    .sort((p, q) => q.c.area * q.b.score - p.c.area * p.b.score)[0];
  return { fx: best.c.fx, fy: best.c.fy };
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
