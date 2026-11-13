// The Worker's build-time tool snapshot cannot drift from the agent's tools; tower's wire encoding of Map/Set round-trips; followups core keeps the original's behaviour.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { llmTools } from '../../api/lib/assistant/tools.js';
import { AGENT_TOOL_NAMES } from '../../api/lib/assistant/agent-core.js';
import { snapshot } from '../../scripts/anis-edge/snapshot-tools.mjs';
import { encode } from '../../api/routes/anis-impl-tools.js';
import { revive } from '../../worker/anis/index.js';
import { followups, cleanFollowups } from '../../api/lib/assistant/followups.js';

describe('anis edge snapshot', () => {
  const file = JSON.parse(readFileSync('worker/anis/agent-tools.json', 'utf8'));
  it('agent-tools.json equals llmTools(AGENT_TOOL_NAMES) and the live impl names (run scripts/anis-edge/snapshot-tools.mjs after a change)', () => {
    expect(file.tools).toEqual(JSON.parse(JSON.stringify(llmTools(AGENT_TOOL_NAMES))));
    expect(file).toEqual(JSON.parse(JSON.stringify(snapshot())));
  });
  it('Map and Set results survive the wire', () => {
    const out = encode({ m: new Map([[1, [{ a: 1 }]]]), s: new Set([5]) });
    expect(JSON.parse(JSON.stringify(out), revive)).toEqual({ m: new Map([[1, [{ a: 1 }]]]), s: new Set([5]) });
    expect(encode(undefined)).toBeNull();
  });
  it('followups keeps its behaviour over the pure core', async () => {
    expect(await followups('q?', 'a reply', { complete: async () => '["One?","q?","Two?"]' })).toEqual(['One?', 'Two?']);
    expect(cleanFollowups('nope')).toEqual([]);
  });
});
