// Extended portrait masters (Chad 10-22: never stretch; "fill in with gemini once"): the original placed uniformly on a 9:16
// canvas, only the margins generated, the original pasted back; one per portrait, recorded.
import { describe, it, expect, vi } from 'vitest';
import { placement, costOf, extendPortrait, CANVAS, OUTPAINT_PROMPT } from '../../api/lib/media/outpaint.js';

describe('outpaint', () => {
  it('places the original uniformly (aspect kept), centred, face area at 38 % of the height', () => {
    const p = placement({ w: 1500, h: 2100 });
    expect(p).toEqual({ sw: 804, sh: 1126, x: 174, y: 216 });
    expect(p.x % 2 + p.y % 2).toBe(0);   // even offsets (tower's ffmpeg, 4:2:0)
    expect(Math.abs(p.sw / p.sh - 1500 / 2100)).toBeLessThan(0.002);
    const sq = placement({ w: 900, h: 900 });
    expect(sq.sw).toBe(sq.sh);
    expect(sq.sw).toBeLessThanOrEqual(CANVAS.w * 0.8 + 2);   // even sizes for the encoder
  });
  it('the generated canvas only fills margins: the original is pasted back over its own place', async () => {
    const calls = [];
    const ffmpeg = vi.fn(async (args) => { calls.push(args.join(' ')); const { writeFileSync } = await import('fs'); writeFileSync(args.at(-1), 'img'); });
    const r = await extendPortrait(Buffer.from('src'), { w: 1500, h: 2100 }, { model: 'm', ffmpeg, outpaint: async () => ({ bytes: Buffer.from('gen'), usage: { promptTokenCount: 320, candidatesTokenCount: 1394 } }) });
    expect(calls[0]).toMatch(/scale=804:1126,format=rgb24,pad=1152:2048:174:216:color=0x808080/);
    expect(calls[1]).toMatch(/force_original_aspect_ratio=increase,crop=1152:2048/);
    expect(calls[1]).toMatch(/\[bg\]\[fg\]overlay=174:216/);
    expect(r).toMatchObject({ model: 'm', prompt: OUTPAINT_PROMPT, usd: 0.0419 });
    expect(costOf({})).toBe(0);
    await expect(extendPortrait(Buffer.from('x'), { w: undefined, h: undefined }, { ffmpeg, outpaint: vi.fn() })).rejects.toThrow(/no image size/);
  });
});
