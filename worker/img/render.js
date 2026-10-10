// Photon (WASM) renderer, in the Worker: extract → fit/resize (cover focal-crop | contain | inside | fill) → optional
// sharpen → encode (webp(q) | jpeg(q) | png). Ported from blogworks.ai packages/blogworks-image/src/render.ts; adds sharpen
// and LOSSY webp: Photon's webp is lossless only (a 320×480 cover came out at 368 KB, larger than a 640-wide q70 jpeg),
// so webp is encoded by jSquash (libwebp, SIMD build) from Photon's pixels with the requested quality.
import { PhotonImage, resize, crop, sharpen, SamplingFilter } from '@cf-wasm/photon';
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode';
import WEBP_WASM from '@jsquash/webp/codec/enc/webp_enc_simd.wasm';

let webpReady = null;
const webp = () => (webpReady ??= initWebp(WEBP_WASM));
import { computeCoverCrop, computeContain, clamp } from './transform.js';

const MAX_DIM = 4000;   // guardrail: never allocate an absurd canvas

export const CONTENT_TYPE = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' };

export async function renderImage(srcBytes, { spec, format, focal }) {
  let img = PhotonImage.new_from_byteslice(srcBytes);
  const owned = [img];
  const swap = (next) => { if (next !== img) { owned.push(next); img = next; } };
  try {
    if (spec.extract) {
      const sw = img.get_width(), sh = img.get_height();
      const x1 = clamp(spec.extract.x, 0, sw - 1), y1 = clamp(spec.extract.y, 0, sh - 1);
      const x2 = clamp(x1 + spec.extract.w, x1 + 1, sw), y2 = clamp(y1 + spec.extract.h, y1 + 1, sh);
      swap(crop(img, x1, y1, x2, y2));
    }
    const sw = img.get_width(), sh = img.get_height();
    const dpr = spec.dpr || 1;
    const tw = spec.width ? Math.min(MAX_DIM, Math.round(spec.width * dpr)) : undefined;
    const th = spec.height ? Math.min(MAX_DIM, Math.round(spec.height * dpr)) : undefined;
    if (tw && th) {
      if (spec.fit === 'fill') swap(resize(img, tw, th, SamplingFilter.Lanczos3));
      else if (spec.fit === 'contain' || spec.fit === 'inside') {
        const { w, h } = computeContain(sw, sh, tw, th, spec.fit === 'contain');
        swap(resize(img, w, h, SamplingFilter.Lanczos3));
      } else {
        const g = computeCoverCrop(sw, sh, tw, th, focal);
        swap(resize(img, g.scaledW, g.scaledH, SamplingFilter.Lanczos3));
        swap(crop(img, g.cropX, g.cropY, g.cropX + g.cropW, g.cropY + g.cropH));
      }
    } else if (tw || th) {
      const { w, h } = computeContain(sw, sh, tw, th, true);
      swap(resize(img, w, h, SamplingFilter.Lanczos3));
    }
    if (spec.sharpen) sharpen(img);   // in place
    return await encode(img, format, spec.quality);
  } finally {
    for (const p of owned) { try { p.free(); } catch { /* already freed */ } }
  }
}

async function encode(img, format, quality) {
  if (format === 'jpeg') return new Uint8Array(img.get_bytes_jpeg(clamp(quality, 1, 100)));
  if (format === 'png') return new Uint8Array(img.get_bytes());
  await webp();
  const width = img.get_width(), height = img.get_height(), px = img.get_raw_pixels();
  const data = new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength);
  return new Uint8Array(await encodeWebp({ data, width, height }, { quality: clamp(quality, 1, 100) }));
}
