// Punctuated Arabic/Persian reads its own sentence endings — no model call (2026-09-30: a re-ingest paid for this).
import { describe, it, expect, vi } from 'vitest';
const chat = vi.fn(async () => { throw new Error('model must not be called for punctuated text'); });
vi.mock('../../api/lib/ai-services.js', async (orig) => ({ ...(await orig()), segmentationService: () => ({ name: 'x', config: {}, chat }) }));
const { detectAllSentenceBoundaries } = await import('../../api/services/segmenter.js');

describe('detectAllSentenceBoundaries on punctuated Arabic', () => {
  it('uses the punctuation (. ؟ ؛) and never calls a model', async () => {
    const paras = [{ id: 1, text: 'قال ابن إسحاق: فلما تفرق الناس عن البيعة، فتشت قريش عن الخبر. فوجدوه حقا؟ فانطلقوا في طلب القوم؛ فأدركوا سعدا.' }];
    const r = await detectAllSentenceBoundaries(paras, 'ar');
    expect(chat).not.toHaveBeenCalled();
    expect(r.get(1).length).toBe(4);
  });
});
