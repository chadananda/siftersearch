// talk_search: a published talk by speaker / topic / title, fast and typo-tolerant; the agent shows its card (turn.talks). Deps stubbed.
import { describe, it, expect, vi } from 'vitest';
import { talkSearch, rankTalks } from '../../api/lib/assistant/talk-search.js';
import { agentAnswer, AGENT_TOOL_NAMES, AGENT_SYSTEM, AGENT_TOOLS } from '../../api/lib/assistant/agent.js';
import { run } from '../../api/lib/assistant/tools.js';

const R = (o) => ({ playback: 'full', thumb: null, date: null, duration_s: 3600, ...o });
const rows = [
  R({ id: 2506, slug: 'dunbar-consciousness-creation-and-the-soul', title: 'Consciousness, Creation and the Soul', speaker: 'Hooper Dunbar', speaker_key: 'hooper-dunbar', year: 1988, doc_id: 2210357, date: '1988-06-13' }),
  R({ id: 2507, slug: 'dunbar-the-covenant', title: 'The Covenant', speaker: 'Hooper Dunbar', speaker_key: 'hooper-dunbar', year: 1990, doc_id: 2210358 }),
  R({ id: 3000, slug: 'banani-memories', title: 'Memories of the Master', speaker: 'Mírzá Ḥabíb Bánání', speaker_key: 'banani', year: 1985, doc_id: 2210400, playback: 'clips' }),
];
const deps = (o = {}) => ({ rows: async () => rows, sketch: async (k) => (k === 'hooper-dunbar' ? 'https://cdn/x/sketch-sq-abc.jpg' : null), topicDocs: async () => [], ...o });
const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } });
const script = (...rounds) => { let n = 0; return async () => { const r = rounds[Math.min(n++, rounds.length - 1)]; return { choices: [{ message: typeof r === 'string' ? { role: 'assistant', content: r } : { role: 'assistant', content: null, tool_calls: r }, finish_reason: typeof r === 'string' ? 'stop' : 'tool_calls' }], usage: {} }; }; };

describe('talk_search', () => {
  it('speaker + a typo\'d topic finds the talk with its page, sketch and player', async () => {
    const { talks } = await talkSearch({ speaker: 'Hooper Dunbar', topic: 'conciousness' }, deps());
    expect(talks[0]).toMatchObject({ doc_id: 2210357, slug: 'dunbar-consciousness-creation-and-the-soul', year: 1988, matched: true,
      url: 'https://siftersearch.com/media/dunbar-consciousness-creation-and-the-soul', thumb_url: 'https://cdn/x/sketch-sq-abc.jpg',
      audio_url: 'https://siftersearch.com/api/media/dunbar-consciousness-creation-and-the-soul/file/web/dunbar-consciousness-creation-and-the-soul.m4a' });
    expect(talks[1].matched).toBe(false);
  });
  it('diacritics fold in the speaker; a clips-only talk has no player', async () => {
    const { talks } = await talkSearch({ speaker: 'Habib Banani' }, deps());
    expect(talks.map((t) => t.slug)).toEqual(['banani-memories']);
    expect(talks[0].audio_url).toBeNull();
  });
  it('a topic with no speaker matches titles only; nothing matching gives none (no transcript hit either)', async () => {
    expect((await talkSearch({ topic: 'covenant' }, deps())).talks.map((t) => t.slug)).toEqual(['dunbar-the-covenant']);
    expect((await talkSearch({ topic: 'quantum gravity' }, deps())).talks).toEqual([]);
  });
  it('no title word says it → the transcripts\' talks answer (topicDocs)', async () => {
    const topicDocs = vi.fn(async () => [2210358]);
    const { talks } = await talkSearch({ speaker: 'Dunbar', topic: 'unity of mankind' }, deps({ topicDocs }));
    expect(topicDocs).toHaveBeenCalled();
    expect(talks.map((t) => t.slug)).toEqual(['dunbar-the-covenant']);
  });
  it('needs at least one of speaker, topic, title; rankTalks drops other speakers', async () => {
    expect((await talkSearch({}, deps())).talks).toEqual([]);
    expect(rankTalks(rows, { speaker: 'Dunbar', title: 'covenant' })[0].slug).toBe('dunbar-the-covenant');
    expect(rankTalks(rows, { speaker: 'Dunbar' }).map((r) => r.id)).not.toContain(3000);
  });
  it('is a registry tool (injectable deps) and on the agent\'s list and guide', async () => {
    expect((await run('talk_search', { speaker: 'Dunbar', topic: 'soul' }, { deps: { talk: deps() } })).talks[0].slug).toBe('dunbar-consciousness-creation-and-the-soul');
    expect(AGENT_TOOL_NAMES).toContain('talk_search');
    expect(AGENT_TOOLS.find((t) => t.function.name === 'talk_search')).toBeTruthy();
    expect(AGENT_SYSTEM).toContain('talk_search');
  });
});

describe('the agent shows the talk', () => {
  const base = { messages: [{ role: 'user', content: 'can you find the talk from Hooper Dunbar on conciousness?' }] };
  it('a found talk becomes turn.talks (its card), counted as one library search', async () => {
    const talkSearchImpl = async (a) => talkSearch(a, deps());
    const r = await agentAnswer({ ...base, create: script([call('a', 'talk_search', { speaker: 'Hooper Dunbar', topic: 'conciousness' })], 'Hooper Dunbar gave *Consciousness, Creation and the Soul* in 1988.'), tools: { talkSearch: talkSearchImpl, search: async () => [] } });
    expect(r.talks.map((t) => t.slug)).toEqual(['dunbar-consciousness-creation-and-the-soul']);
    expect(r.agent.searches).toBe(1);
    expect(r.reply).toContain('Consciousness, Creation and the Soul');
  });
  it('no match → no card', async () => {
    const r = await agentAnswer({ ...base, create: script([call('a', 'talk_search', { topic: 'quantum gravity' })], 'The library holds no such talk.'), tools: { talkSearch: async (a) => talkSearch(a, deps()), search: async () => [] } });
    expect(r.talks).toEqual([]);
  });
});
