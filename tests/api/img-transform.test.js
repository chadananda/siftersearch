// Image service transforms (worker/img/) — ported with the code from blogworks.ai packages/blogworks-image/test/transform.test.ts,
// plus e-sharpen. Pure: no WASM.
import { describe, it, expect } from 'vitest';
import {
  parseTransformGroup, parseTransforms, resolveFormat, computeCoverCrop, computeContain, focusToPoint, defaultSpec,
} from '../../worker/img/transform.js';
import { resolveFocalPoint } from '../../worker/img/focal.js';

describe('parseTransformGroup', () => {
  it('parses ImageKit-style tokens', () => {
    const s = parseTransformGroup('w-800,h-600,fo-face,f-webp,q-70,dpr-2');
    expect(s.width).toBe(800);
    expect(s.height).toBe(600);
    expect(s.focus).toBe('face');
    expect(s.format).toBe('webp');
    expect(s.quality).toBe(70);
    expect(s.dpr).toBe(2);
    expect(s.fit).toBe('cover');
  });
  it('maps crop modes and jpg alias, clamps quality', () => {
    expect(parseTransformGroup('c-pad_resize').fit).toBe('contain');
    expect(parseTransformGroup('c-force').fit).toBe('fill');
    expect(parseTransformGroup('c-at_max').fit).toBe('inside');
    expect(parseTransformGroup('f-jpg').format).toBe('jpeg');
    expect(parseTransformGroup('f-avif').format).toBe('auto'); // not encodable → negotiate
    expect(parseTransformGroup('q-9999').quality).toBe(100);
  });
  it('parses cm-extract region', () => {
    const s = parseTransformGroup('cm-extract,x-10,y-20,w-100,h-50');
    expect(s.extract).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(s.width).toBeUndefined();
  });
  it('defaults when tr empty', () => {
    expect(parseTransforms('')).toEqual([defaultSpec()]);
  });
});

describe('e-sharpen (SifterSearch addition)', () => {
  it('turns sharpening on only when asked', () => {
    expect(parseTransformGroup('w-320,e-sharpen').sharpen).toBe(true);
    expect(parseTransformGroup('w-320').sharpen).toBe(false);
    expect(defaultSpec().sharpen).toBe(false);
  });
});

describe('resolveFormat — webp by default', () => {
  it('defaults to webp with no Accept header', () => {
    expect(resolveFormat(defaultSpec(), null)).toBe('webp');
  });
  it('keeps webp when client accepts webp', () => {
    expect(resolveFormat(defaultSpec(), 'image/avif,image/webp,*/*')).toBe('webp');
  });
  it('downgrades to jpeg only for a legacy client listing images but not webp', () => {
    expect(resolveFormat(defaultSpec(), 'image/jpeg,image/png')).toBe('jpeg');
  });
  it('respects an explicit format', () => {
    expect(resolveFormat({ ...defaultSpec(), format: 'png' }, null)).toBe('png');
  });
});

describe('computeCoverCrop — focal smart crop', () => {
  it('center focal crops symmetrically', () => {
    const g = computeCoverCrop(1000, 1000, 400, 200, { fx: 0.5, fy: 0.5 });
    expect(g.cropW).toBe(400);
    expect(g.cropH).toBe(200);
    // scaled to cover 400x200 from 1000x1000 → scale=0.4 → 400x400, crop y centered
    expect(g.scaledW).toBe(400);
    expect(g.scaledH).toBe(400);
    expect(g.cropY).toBe(100);
    expect(g.cropX).toBe(0);
  });
  it('face focal near top pulls the crop window up and clamps', () => {
    const g = computeCoverCrop(1000, 1000, 400, 200, { fx: 0.5, fy: 0.1 });
    expect(g.cropY).toBe(0); // clamped to top, never negative
  });
  it('never produces a negative or out-of-bounds window', () => {
    const g = computeCoverCrop(800, 600, 300, 300, { fx: 1, fy: 1 });
    expect(g.cropX).toBeGreaterThanOrEqual(0);
    expect(g.cropY).toBeGreaterThanOrEqual(0);
    expect(g.cropX + g.cropW).toBeLessThanOrEqual(g.scaledW);
    expect(g.cropY + g.cropH).toBeLessThanOrEqual(g.scaledH);
  });
});

describe('computeContain', () => {
  it('fits inside without upscaling when disallowed', () => {
    expect(computeContain(100, 100, 400, 400, false)).toEqual({ w: 100, h: 100 });
  });
  it('scales down to the limiting dimension', () => {
    expect(computeContain(1000, 500, 400, 400, true)).toEqual({ w: 400, h: 200 });
  });
});

describe('focusToPoint', () => {
  it('maps keywords to points', () => {
    expect(focusToPoint('center')).toEqual({ fx: 0.5, fy: 0.5 });
    expect(focusToPoint('top').fy).toBeLessThan(0.5);
  });
});

describe('resolveFocalPoint (Workers AI)', () => {
  const fakeAi = (objects) => ({ run: async () => objects });

  it('returns center for fixed focus without calling AI', async () => {
    const p = await resolveFocalPoint('top', new Uint8Array(), undefined, 100, 100);
    expect(p.fy).toBeLessThan(0.5);
  });
  it('falls back to center when AI missing', async () => {
    const p = await resolveFocalPoint('face', new Uint8Array(), undefined, 100, 100);
    expect(p).toEqual({ fx: 0.5, fy: 0.5 });
  });
  it('face focus centers on the person box, biased to the head', async () => {
    const ai = fakeAi([{ label: 'person', score: 0.9, box: { xmin: 200, ymin: 100, xmax: 600, ymax: 900 } }]);
    const p = await resolveFocalPoint('face', new Uint8Array([1]), ai, 1000, 1000);
    expect(p.fx).toBeCloseTo(0.4, 1);     // (200+600)/2 / 1000
    expect(p.fy).toBeLessThan(0.4);        // head bias → upper part of the box
  });
  it('auto focus picks the largest confident object', async () => {
    const ai = fakeAi([
      { label: 'book', score: 0.8, box: { xmin: 0, ymin: 0, xmax: 100, ymax: 100 } },
      { label: 'car', score: 0.85, box: { xmin: 400, ymin: 400, xmax: 900, ymax: 900 } },
    ]);
    const p = await resolveFocalPoint('auto', new Uint8Array([1]), ai, 1000, 1000);
    expect(p.fx).toBeCloseTo(0.65, 1);     // car center
    expect(p.fy).toBeCloseTo(0.65, 1);
  });
});
