// anthropic-native.js: OpenAI-shaped params ⇄ native Messages with cache breakpoints (11-12: the compat layer caches nothing).
import { describe, it, expect } from 'vitest';
import { toNative, fromNative, chunksOf } from '../../api/lib/anthropic-native.js';

const tools = [{ type: 'function', function: { name: 'fused_search', description: 'search', parameters: { type: 'object', properties: { query: { type: 'string' } } } } },
  { type: 'function', function: { name: 'context_lookup', description: 'ctx', parameters: { type: 'object', properties: {} } } }];
const think = { type: 'thinking', thinking: 'hm', signature: 'sig' };

describe('toNative', () => {
  it('system, tools and the last block carry cache breakpoints; tool rounds become tool_use / tool_result', () => {
    const b = toNative({ max_tokens: 900, tool_choice: 'auto', tools, messages: [
      { role: 'system', content: 'SYS' }, { role: 'user', content: 'Q' },
      { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'fused_search', arguments: '{"query":"x"}' } }, { id: 't2', function: { name: 'context_lookup', arguments: '' } }], _thinking: [think] },
      { role: 'tool', tool_call_id: 't1', content: 'R1' }, { role: 'tool', tool_call_id: 't2', content: 'R2' }] }, { model: 'm', thinking: { type: 'between_tools' } });
    expect(b.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(b.tools.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(b.tools[0].cache_control).toBeUndefined();
    expect(b.tool_choice).toEqual({ type: 'auto' });
    expect(b.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(b.messages[1].content.map((x) => x.type)).toEqual(['thinking', 'tool_use', 'tool_use']);
    expect(b.messages[1].content[1].input).toEqual({ query: 'x' });
    expect(b.messages[2].content.map((x) => x.tool_use_id)).toEqual(['t1', 't2']);
    expect(b.messages[2].content.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(b.messages[2].content[0].cache_control).toBeUndefined();
    expect(b.thinking).toEqual({ type: 'between_tools' });
    expect(b.max_tokens).toBe(900);
  });
  it('a last round (no tools) sends no tools; adjacent user turns merge', () => {
    const b = toNative({ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }, { model: 'm' });
    expect(b.tools).toBeUndefined();
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0].content.map((x) => x.text)).toEqual(['a', 'b']);
  });
});

describe('fromNative / chunksOf', () => {
  it('a Message → the chat.completions shape, cache tokens counted in the prompt', () => {
    const r = fromNative({ stop_reason: 'tool_use', content: [think, { type: 'text', text: 'hi' }, { type: 'tool_use', id: 't', name: 'fused_search', input: { query: 'q' } }],
      usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 } });
    expect(r.choices[0].message.content).toBe('hi');
    expect(r.choices[0].message.tool_calls[0].function).toEqual({ name: 'fused_search', arguments: '{"query":"q"}' });
    expect(r.choices[0].message._thinking).toEqual([think]);
    expect(r.usage).toEqual({ prompt_tokens: 115, completion_tokens: 7, cached_tokens: 100, cache_write_tokens: 5 });
  });
  it('a native stream → content and tool_call deltas, usage and thinking on the last chunk', async () => {
    const ev = [
      { type: 'message_start', message: { usage: { input_tokens: 3, cache_read_input_tokens: 50 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 't', name: 'fused_search', input: {} } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"q"}' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', usage: { output_tokens: 9 } },
    ];
    const out = [];
    for await (const c of chunksOf((async function* () { yield* ev; })())) out.push(c);
    expect(out.filter((c) => c.choices[0]?.delta?.content).map((c) => c.choices[0].delta.content)).toEqual(['Hello']);
    const tc = out.flatMap((c) => c.choices[0]?.delta?.tool_calls || []);
    expect(tc[0]).toMatchObject({ index: 0, id: 't', function: { name: 'fused_search' } });
    expect(tc.map((t) => t.function.arguments).join('')).toBe('{"query":"q"}');
    expect(out.at(-1).usage).toEqual({ prompt_tokens: 53, completion_tokens: 9, cached_tokens: 50, cache_write_tokens: 0 });
    expect(out.at(-1)._thinking).toEqual([{ type: 'thinking', thinking: 'hm', signature: 'sig' }]);
  });
});
