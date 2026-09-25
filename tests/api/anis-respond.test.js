// Anis chat layer: conversation + Jev-planned RAW search → ONE fast streamed answer in the site's persona, with
// the Seeker Companion plan. Transport-neutral (web component streams; email uses the finished text).
import { describe, it, expect, vi } from 'vitest';
import { anisRespond, parseLlm, linkMarkers } from '../../api/lib/anis/respond.js';

const passages = [
  { text: 'The earth is but one country, and mankind its citizens.', title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8312, paragraph_index: 117, source_url: 'https://x/g#117' },
  { text: 'So powerful is the light of unity...', title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8312, paragraph_index: 132, source_url: 'https://x/g#132' },
];

function deps(over = {}) {
  const calls = { search: [], craft: [], companion: [] };
  return {
    calls,
    search: async (args) => { calls.search.push(args); return { passages, _plan: { shape: 'quote', filters: { religion: "Baha'i" } } }; },
    craft: async (args) => { calls.craft.push(args); args.onChunk('The earth '); args.onChunk('is one country [bad](https://evil.example).'); return 'The earth is one country [bad](https://evil.example).'; },
    companion: async (ctx) => { calls.companion.push(ctx); return { append: '\n\nCOMPANION: gentle.', plan: { mode: 'INQUIRY' }, offer: false }; },
    ...over,
  };
}
const convo = [
  { role: 'user', content: 'Who was Bahá’u’lláh?' },
  { role: 'assistant', content: 'He was the Founder of the Bahá’í Faith.' },
  { role: 'user', content: 'what did he say about the earth being one country' },
];

describe('anisRespond', () => {
  it('searches ONCE with the conversation (planned) and the site default, then crafts ONCE', async () => {
    const d = deps();
    await anisRespond({ messages: convo, profile: { persona_name: 'Anis', default_tradition: "Baha'i" }, deps: d });
    expect(d.calls.search).toHaveLength(1);
    expect(d.calls.search[0].plan.messages).toEqual(convo);
    expect(d.calls.search[0].plan.defaults).toEqual({ religion: "Baha'i" });
    expect(d.calls.craft).toHaveLength(1);
  });

  it('sends the sources BEFORE the first token (something useful fast), then streams text', async () => {
    const d = deps();
    const events = [];
    await anisRespond({ messages: convo, deps: d, onEvent: (e) => events.push(e.type) });
    expect(events.indexOf('sources')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('sources')).toBeLessThan(events.indexOf('text'));
  });

  // Perception (Chad): instant text, then the answer — like Claude Code's thinking lines. The follow-up line is
  // specific because the sources are already known before the model starts.
  it('sends a specific status line naming what it is reading, before the first token', async () => {
    const d = deps({ search: async () => ({ passages: [...passages, { ...passages[0], title: 'Paris Talks', document_id: 8320 }], _plan: { shape: 'topic' } }) });
    const ev = [];
    await anisRespond({ messages: convo, deps: d, onEvent: (e) => ev.push(e) });
    const status = ev.find((e) => e.type === 'status');
    expect(status.text).toMatch(/Gleanings/);
    expect(status.text).toMatch(/Paris Talks/);
    expect(ev.indexOf(status)).toBeLessThan(ev.findIndex((e) => e.type === 'text'));
  });

  it('says so when it had to widen beyond the scope', async () => {
    const d = deps({ search: async () => ({ passages, _plan: { shape: 'topic', widened: true, relaxed: ['religion'], filters: { religion: 'Jain' } } }) });
    const ev = [];
    await anisRespond({ messages: convo, deps: d, onEvent: (e) => ev.push(e) });
    expect(ev.find((e) => e.type === 'status').text).toMatch(/wid/i);
  });

  it('crafts in the site persona with mission + companion block, conversation context and the configured model', async () => {
    const d = deps();
    const llm = parseLlm('groq:openai/gpt-oss-120b:low');
    await anisRespond({ messages: convo, profile: { persona_name: 'Anis', mission: 'warm, brief' }, llm, deps: d });
    const a = d.calls.craft[0];
    expect(a.persona_name).toBe('Anis');
    expect(a.mission).toBe('warm, brief');
    expect(a.companion_append).toContain('COMPANION');
    expect(a.llm).toEqual(llm);
    expect(a.conversation_summary).toContain('Founder of the Bahá’í Faith');
    expect(a.retrieved_quotes[0]).toMatchObject({ source_title: 'Gleanings', citation_url: 'https://x/g#117' });
  });

  it('strips links that were not among the retrieved sources', async () => {
    const r = await anisRespond({ messages: convo, deps: deps() });
    expect(r.reply).not.toContain('evil.example');
    expect(r.reply).toContain('one country');
  });

  it('still answers when the companion layer fails — relationship is enrichment, never a blocker', async () => {
    const r = await anisRespond({ messages: convo, deps: deps({ companion: async () => { throw new Error('db'); } }) });
    expect(r.reply).toContain('one country');
  });

  // ONE global model, switchable for cost/speed without code (Chad): ANIS_LLM="provider:model[:reasoning_effort]".
  it('parses the model setting, and falls back to the default on nonsense', () => {
    expect(parseLlm('groq:openai/gpt-oss-120b:low')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b', reasoning_effort: 'low' });
    expect(parseLlm('openai:gpt-4o-mini')).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(parseLlm('bogus')).toEqual(parseLlm(undefined));
    expect(parseLlm(undefined)).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  // Groq's gpt-oss cites as 【n】 instead of links (measured 2026-09-24). n is OUR passage number, so it maps to the
  // passage's own URL deterministically — never a guessed one.
  it('turns numbered citation markers into links to that passage', () => {
    const q = [{ citation_url: 'https://x/a', source_title: 'Gleanings' }, { citation_url: null, source_title: 'Paris Talks' }];
    expect(linkMarkers('One country【1】. And unity [2].', q)).toBe('One country ([Gleanings](https://x/a)). And unity (*Paris Talks*).');
    expect(linkMarkers('See [1](https://x/a) and [9].', q)).toBe('See [1](https://x/a) and [9].');   // real links + unknown numbers untouched
  });

  it('returns what the email adapter needs: text, citations, plan, timings', async () => {
    const r = await anisRespond({ messages: convo, deps: deps() });
    expect(r.citations[0]).toMatchObject({ title: 'Gleanings', url: 'https://x/g#117' });
    expect(r.plan.shape).toBe('quote');
    expect(typeof r.timings.search_ms).toBe('number');
    expect(typeof r.timings.first_token_ms).toBe('number');
  });
});
