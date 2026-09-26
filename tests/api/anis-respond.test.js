// Anis chat layer: conversation + Jev-planned RAW search → ONE fast streamed answer in the site's persona, with
// the Seeker Companion plan. Transport-neutral (web component streams; email uses the finished text).
import { describe, it, expect, vi } from 'vitest';
import { anisRespond, parseLlm, linkMarkers, searchQueryFor } from '../../api/lib/anis/respond.js';

const passages = [
  { text: 'The earth is but one country, and mankind its citizens.', title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8312, paragraph_index: 117, source_url: 'https://x/g#117' },
  { text: 'So powerful is the light of unity...', title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8312, paragraph_index: 132, source_url: 'https://x/g#132' },
];

function deps(over = {}) {
  const calls = { search: [], craft: [], companion: [] };
  return {
    calls,
    search: async (args) => { calls.search.push(args); return { passages, _plan: { shape: 'quote', filters: { religion: "Baha'i" } } }; },
    craft: async (args) => { calls.craft.push(args); args.onChunk('The earth '); args.onChunk('is one country.'); return 'The earth is ["but one country"](https://x/g#117) — *Gleanings*, not [bad](https://evil.example).'; },
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
    expect(parseLlm(undefined)).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });
  });

  // Groq's gpt-oss cites as 【n】 instead of links (measured 2026-09-24). n is OUR passage number, so it maps to the
  // passage's own URL deterministically — never a guessed one.
  it('turns numbered citation markers into links to that passage', () => {
    const q = [{ citation_url: 'https://x/a', source_title: 'Gleanings' }, { citation_url: null, source_title: 'Paris Talks' }];
    expect(linkMarkers('One country【1】. And unity [2].', q)).toBe('One country ([Gleanings](https://x/a)). And unity (*Paris Talks*).');
    expect(linkMarkers('See [1](https://x/a) and [9].', q)).toBe('See [1](https://x/a) and [9].');   // real links + unknown numbers untouched
  });

  // Live, 2026-09-24: "Who was Mullá Ḥusayn?" then "Where was he killed?" searched only the second turn, found a
  // 1909 Nayriz killing, and Anis told the seeker Mullá Ḥusayn died there (he fell at Shaykh Ṭabarsí). A follow-up
  // that leans on the conversation must be SEARCHED with the turn it refers to.
  it('searches a pronoun follow-up together with the question it refers to', () => {
    const m = [{ role: 'user', content: 'Who was Mullá Ḥusayn?' }, { role: 'assistant', content: 'He was…' }, { role: 'user', content: 'Where was he killed?' }];
    expect(searchQueryFor(m)).toBe('Who was Mullá Ḥusayn? Where was he killed?');
  });

  it('leaves a self-contained question alone', () => {
    const m = [{ role: 'user', content: 'Who was Mullá Ḥusayn?' }, { role: 'assistant', content: '…' }, { role: 'user', content: 'What does the Quran say about patience and endurance in hardship?' }];
    expect(searchQueryFor(m)).toBe('What does the Quran say about patience and endurance in hardship?');
  });

  it('actually searches with the combined query', async () => {
    const d = deps();
    const m = [{ role: 'user', content: 'Who was Mullá Ḥusayn?' }, { role: 'assistant', content: 'He was…' }, { role: 'user', content: 'Where was he killed?' }];
    await anisRespond({ messages: m, deps: d });
    expect(d.calls.search[0].query).toContain('Mullá Ḥusayn');
    expect(d.calls.craft[0].user_question).toBe('Where was he killed?');   // the model still answers the actual turn
  });

  // Screenshot 2026-09-24: "what is your name?" searched the library and crowbarred a prayer quote into Anis's
  // self-introduction. Conversation (greetings, thanks, questions about Anis) is not a lookup.
  it('answers conversation as itself — no search, no passages, no citations', async () => {
    const d = deps({ plan: async () => ({ shape: 'converse', filters: {}, prefer: null, comparative: false }) });
    const r = await anisRespond({ messages: [{ role: 'user', content: 'what is your name?' }], profile: { persona_name: 'Anís' }, deps: d });
    expect(d.calls.search).toHaveLength(0);
    expect(d.calls.craft[0].retrieved_quotes).toEqual([]);
    expect(d.calls.craft[0].conversational).toBe(true);
    expect(r.citations).toEqual([]);
  });

  // Same screenshot: chips listed every retrieved passage (Book of Mormon, Qabbalah…) under an answer that used two.
  it('returns as citations only the sources the reply actually links', async () => {
    const d = deps({ craft: async (a) => { a.onChunk('x'); return 'As it says, ["one country and mankind"](https://x/g#117) — *Gleanings*.'; } });
    const r = await anisRespond({ messages: convo, deps: d });
    expect(r.citations.map((c) => c.url)).toEqual(['https://x/g#117']);
  });

  it('removes a sentence quoting words that are in no retrieved passage before the reply is final', async () => {
    const d = deps({ craft: async (a) => { a.onChunk('x'); return 'Unity matters. He states that "the essence of justice is the love of all mankind". And: ["The earth is but one country, and mankind its citizens"](https://x/g#117) — *Gleanings*.'; } });
    const r = await anisRespond({ messages: convo, deps: d });
    expect(r.reply).not.toContain('essence of justice');
    expect(r.reply).toContain('one country');
    expect(r.quotes_removed).toBe(1);
  });

  // Live 2026-09-25: the stream showed a link the model rewrote onto another domain; only the final text removed it.
  it('never STREAMS a link that is not among the sources', async () => {
    const d = deps({ craft: async (a) => { a.onChunk('See ["one country"](https://invented.example/x). '); a.onChunk('And the source ["The earth is but one country"](https://x/g#117).'); return 'x'; } });
    const streamed = [];
    await anisRespond({ messages: convo, deps: d, onEvent: (e) => e.type === 'text' && streamed.push(e.content) });
    expect(streamed.join('')).not.toContain('invented.example');
    expect(streamed.join('')).toContain('https://x/g#117');
  });

  it('returns what the email adapter needs: text, citations, plan, timings', async () => {
    const r = await anisRespond({ messages: convo, deps: deps() });
    expect(r.citations[0]).toMatchObject({ title: 'Gleanings', url: 'https://x/g#117' });
    expect(r.plan.shape).toBe('quote');
    expect(typeof r.timings.search_ms).toBe('number');
    expect(typeof r.timings.first_token_ms).toBe('number');
  });
});
