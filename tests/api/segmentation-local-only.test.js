// Segmentation is Haiku 5.5 in every language; LM Studio is retired (Chad 10-11). A localOnly scope never spends and no
// local segmenter exists, so it fails at once — the 10-11 hang (a dead LM Studio host, 2 h per book) cannot recur.
import { describe, it, expect } from 'vitest';
import { segmentationService, SEGMENTATION_MODEL } from '../../api/lib/ai-services.js';
import { withAIContext } from '../../api/lib/ai-context.js';

describe('segmentation service', () => {
  it('is Haiku 5.5', () => {
    expect(SEGMENTATION_MODEL).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(segmentationService().config.model).toBe('claude-haiku-5-5');
  });
  it('a localOnly scope fails before any call', async () => {
    await expect(withAIContext({ localOnly: true }, () => segmentationService().chat([{ role: 'user', content: 'x' }])))
      .rejects.toThrow(/localOnly/);
  });
});
