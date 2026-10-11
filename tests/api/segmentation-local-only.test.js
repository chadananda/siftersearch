// A localOnly AI scope must never reach a paid model (10-11: tower's USE_REMOTE_AI=true silently made segmentation's
// "local" primary GPT-4o, so a localOnly Arabic ingest spent $0.72 before it was stopped).
import { describe, it, expect } from 'vitest';
import { config } from '../../api/lib/config.js';
import { aiService, segmentationService } from '../../api/lib/ai-services.js';
import { withAIContext } from '../../api/lib/ai-context.js';

describe('segmentation stays local when asked', () => {
  it('forceLocal beats USE_REMOTE_AI', () => {
    const was = config.useRemoteAI;
    config.useRemoteAI = true;
    try {
      expect(aiService('segmentation', { forceLocal: true }).name).toBe('segmentation:local');
      expect(aiService('segmentation').name).toBe('segmentation:remote');
    } finally { config.useRemoteAI = was; }
  });
  it('a localOnly scope refuses a non-local segmentation provider before any call', async () => {
    const was = config.ai.segmentation.provider;
    config.ai.segmentation.provider = 'openai';
    try {
      await expect(withAIContext({ localOnly: true }, () => segmentationService().chat([{ role: 'user', content: 'x' }])))
        .rejects.toThrow(/localOnly scope refuses/);
    } finally { config.ai.segmentation.provider = was; }
  });
});
