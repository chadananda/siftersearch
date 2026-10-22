// EXTENDED PORTRAIT MASTERS (Chad 10-22: "do not stretch pictures … if you need more size in a crop, fill in with gemini
// once"): a speaker portrait is placed, scaled uniformly, on a generous 9:16 canvas (1152×2048) with headroom on every side;
// the image-outpaint role (a Gemini image model) fills ONLY the margins; the original pixels are then pasted back exactly
// (feathered edge), so the centre is never AI-made. One extended master per person, cached (media_speakers ext_*), recorded
// as AI-extended with model and prompt; every crop (shorts, 9:16 frames, wide heroes) uses it. Deps injected for tests.
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';

export const CANVAS = { w: 1152, h: 2048 };
export const OUTPAINT_PROMPT = 'Extend this photograph outward to fill the whole canvas: continue the background, clothing and '
  + 'surroundings naturally into the grey margins, matching the original lighting, colour, grain and focus. Do not change, '
  + 'retouch, move or redraw anything inside the original photograph, especially the face. No text, no borders, no frames.';

/** Where the original goes on the canvas: scaled uniformly to ≤ 80 % of the width and ≤ 55 % of the height, its centre at
 *  38 % of the height (portraits carry the face in their upper half). Pure. → { sw, sh, x, y } */
export function placement({ w, h }, canvas = CANVAS) {
  const s = Math.min((canvas.w * 0.8) / w, (canvas.h * 0.55) / h);
  const sw = 2 * Math.round((w * s) / 2), sh = 2 * Math.round((h * s) / 2);
  // even offsets: tower's ffmpeg refuses an odd pad offset on 4:2:0 frames ("Error reinitializing filters", 10-22)
  const even = (v) => 2 * Math.round(v / 2);
  const x = even((canvas.w - sw) / 2), y = even(Math.max(0, Math.min(canvas.h - sh, canvas.h * 0.38 - sh / 2)));
  return { sw, sh, x, y };
}

/** Rough $ for one Gemini image call (output image tokens dominate; registry prices when present). */
export function costOf(usage = {}, { inPerM = 0.3, outPerM = 30 } = {}) {
  return Math.round((((usage.promptTokenCount || 0) * inPerM + (usage.candidatesTokenCount || 0) * outPerM) / 1e6) * 10000) / 10000;
}

/** One Gemini image call: the padded canvas in, an image out. → { bytes, mime, usage } */
export async function geminiOutpaint(png, { model, key = process.env.GEMINI_API_KEY, fetchImpl = fetch, prompt = OUTPAINT_PROMPT } = {}) {
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const body = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: Buffer.from(png).toString('base64') } }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } } };
  const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gemini ${r.status}: ${String(j?.error?.message || '').slice(0, 200)}`);
  const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!part) throw new Error(`gemini returned no image (${j.candidates?.[0]?.finishReason || 'no candidate'})`);
  return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType, usage: j.usageMetadata || {} };
}

/**
 * The extended master for one portrait. src: the original's bytes; dims: { w, h }. deps: { ffmpeg(args), outpaint(png) →
 * { bytes, usage }, model }. → { bytes (JPEG 1152×2048), placement, model, prompt, usage, usd }
 */
export async function extendPortrait(src, dims, deps) {
  const work = join(tmpdir(), `outpaint-${process.pid}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  const P = placement(dims);
  const { w: CW, h: CH } = CANVAS;
  try {
    await writeFile(join(work, 'src'), src);
    // the padded canvas: the original scaled UNIFORMLY, neutral grey margins
    await deps.ffmpeg(['-y', '-i', join(work, 'src'), '-vf', `scale=${P.sw}:${P.sh},format=rgb24,pad=${CW}:${CH}:${P.x}:${P.y}:color=0x808080`, '-frames:v', '1', join(work, 'canvas.png')]);
    const out = await deps.outpaint(await readFile(join(work, 'canvas.png')));
    await writeFile(join(work, 'gen'), out.bytes);
    // the generated canvas back to 1152×2048 (uniform scale + centre crop), then the ORIGINAL pixels pasted over their place
    // with a 24 px feathered edge
    const F = 24;
    await deps.ffmpeg(['-y', '-i', join(work, 'gen'), '-i', join(work, 'src'), '-filter_complex',
      `[0:v]scale=${CW}:${CH}:force_original_aspect_ratio=increase,crop=${CW}:${CH},format=rgba[bg];`
      + `[1:v]scale=${P.sw}:${P.sh},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,W-1-X),min(Y,H-1-Y))/${F})'[fg];`
      + `[bg][fg]overlay=${P.x}:${P.y},format=yuvj420p`, '-frames:v', '1', '-q:v', '2', join(work, 'ext.jpg')]);
    return { bytes: await readFile(join(work, 'ext.jpg')), placement: P, model: deps.model, prompt: OUTPAINT_PROMPT, usage: out.usage, usd: costOf(out.usage) };
  } finally { await rm(work, { recursive: true, force: true }); }
}
