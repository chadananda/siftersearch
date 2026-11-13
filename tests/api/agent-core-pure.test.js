// Ratchet: the agent core must bundle for a Worker (no fs/net/sqlite reachable from agent-core.js). Only node:async_hooks is allowed (nodejs_compat).
import { describe, it, expect } from 'vitest';
import * as esbuild from 'esbuild';

const bundle = (f) => esbuild.build({ entryPoints: [f], bundle: true, platform: 'browser', write: false, external: ['node:async_hooks'], logLevel: 'silent' });

describe('pure agent modules bundle for a Worker', () => {
  for (const f of ['agent-core', 'tool-runner', 'tool-defs']) {
    it(`${f}.js has zero unresolved imports`, async () => {
      const r = await bundle(`api/lib/assistant/${f}.js`);
      expect(r.errors).toEqual([]);
    });
  }
  it('agent-core runs a turn with no server pieces injected', async () => {
    const { agentAnswer } = await import('../../api/lib/assistant/agent-core.js');
    const create = async () => ({ choices: [{ message: { content: 'Plain answer.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'hi' }], create, tools: {} });
    expect(r.reply).toBe('Plain answer.');
  });
  it('re-exports keep the old homes', async () => {
    const { asPassage, SAME_QUESTION } = await import('../../api/lib/assistant/tool-defs.js');
    expect((await import('../../api/lib/assistant/agent-strategies.js')).asPassage).toBe(asPassage);
    expect((await import('../../api/lib/assistant/research-cache.js')).SAME_QUESTION).toBe(SAME_QUESTION);
    expect((await import('../../api/lib/assistant/tool-kit.js')).translationLabel).toBe((await import('../../api/lib/assistant/tool-defs.js')).translationLabel);
  });
});
