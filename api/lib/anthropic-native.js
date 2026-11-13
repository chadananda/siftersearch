// OpenAI-shaped chat params ⇄ native Anthropic Messages, for prompt caching (the OpenAI compat layer has none — 11-12: every
// agent round re-read the whole system prompt + tools + earlier rounds). Breakpoints: system, last tool, last message.
// Thinking blocks ride on the assistant message as `_thinking` and go back before its tool_use (the API requires them).
const EPH = { type: 'ephemeral' };

const toolUse = (tc) => {
  let input = {};
  try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → empty */ }
  return { type: 'tool_use', id: tc.id, name: tc.function?.name, input };
};
const blocksOf = (m) => {
  if (m.role === 'tool') return [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') }];
  const text = typeof m.content === 'string' ? m.content : (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return [...(m._thinking || []), ...(text.trim() ? [{ type: 'text', text }] : []), ...(m.tool_calls || []).map(toolUse)];
};

/** Pure: OpenAI chat params → native Messages params (cache breakpoints set). */
export function toNative(params, { model, thinking } = {}) {
  const system = params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const messages = [];
  for (const m of params.messages.filter((x) => x.role !== 'system')) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const blocks = blocksOf(m);
    if (!blocks.length) continue;
    const prev = messages.at(-1);
    if (prev?.role === role) prev.content.push(...blocks); else messages.push({ role, content: blocks });
  }
  const last = messages.at(-1)?.content.at(-1);
  if (last) last.cache_control = EPH;
  const tools = (params.tools || []).map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  if (tools.length) tools.at(-1).cache_control = EPH;
  return {
    model, max_tokens: params.max_completion_tokens ?? params.max_tokens ?? 4096, messages,
    ...(system ? { system: [{ type: 'text', text: system, cache_control: EPH }] } : {}),
    ...(tools.length ? { tools, tool_choice: { type: params.tool_choice === 'required' ? 'any' : 'auto' } } : {}),
    ...(thinking ? { thinking } : {}),
  };
}

const usageOf = (u = {}) => ({
  prompt_tokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
  completion_tokens: u.output_tokens || 0, cached_tokens: u.cache_read_input_tokens || 0, cache_write_tokens: u.cache_creation_input_tokens || 0,
});

/** Pure: a native Message → the chat.completions response shape. */
export function fromNative(msg) {
  const content = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const calls = (msg.content || []).filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  const thinking = (msg.content || []).filter((b) => b.type === 'thinking' || b.type === 'redacted_thinking');
  return { choices: [{ message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}), ...(thinking.length ? { _thinking: thinking } : {}) },
    finish_reason: msg.stop_reason }], usage: usageOf(msg.usage) };
}

/** A native event stream → chat.completions chunks (content / tool_calls deltas, usage on the last chunk). Thinking blocks
 *  are collected and handed over on the last chunk as `_thinking`. */
export async function* chunksOf(events) {
  const usage = {}, tools = new Map(), thinking = [];
  let cur = null;
  for await (const e of events) {
    if (e.type === 'message_start') Object.assign(usage, e.message?.usage);
    else if (e.type === 'message_delta') Object.assign(usage, e.usage);
    else if (e.type === 'content_block_start') {
      const b = e.content_block;
      cur = b.type === 'thinking' || b.type === 'redacted_thinking' ? { ...b } : null;
      if (b.type === 'tool_use') {
        tools.set(e.index, tools.size);
        yield { choices: [{ delta: { tool_calls: [{ index: tools.get(e.index), id: b.id, type: 'function', function: { name: b.name, arguments: '' } }] } }] };
      }
    } else if (e.type === 'content_block_delta') {
      const d = e.delta;
      if (d.type === 'text_delta') yield { choices: [{ delta: { content: d.text } }] };
      else if (d.type === 'input_json_delta' && tools.has(e.index)) yield { choices: [{ delta: { tool_calls: [{ index: tools.get(e.index), function: { arguments: d.partial_json } }] } }] };
      else if (cur && d.type === 'thinking_delta') cur.thinking = (cur.thinking || '') + d.thinking;
      else if (cur && d.type === 'signature_delta') cur.signature = d.signature;
    } else if (e.type === 'content_block_stop' && cur) { thinking.push(cur); cur = null; }
  }
  yield { choices: [], usage: usageOf(usage), ...(thinking.length ? { _thinking: thinking } : {}) };
}

/** chat.completions.create, natively: same params in, same shapes out (a stream → an async iterable of chunks). */
export async function nativeCreate(client, params, { model, thinking } = {}) {
  const body = toNative(params, { model, thinking });
  if (!params.stream) return fromNative(await client.messages.create(body));
  return chunksOf(await client.messages.create({ ...body, stream: true }));
}
