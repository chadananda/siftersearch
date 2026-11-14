// Reply form checks (Chad 11-14, Reddit round 3): offers → pills, run-in heads only at the agent's own depth, core text quoted first. Form only, never intent.
import { describe, it, expect } from 'vitest';
import { DEPTH, hasDepth, dropDepth, dropOffers, isInvite, runInHeads, headsAsk, quotedRefs, leadSource, leadAsk, offerPill, withOfferPill } from '../../api/lib/assistant/reply-form.js';

const B = 'Bahá’í';
const WRIT = { author: 'Bahá’u’lláh', religion: B, title: 'Gleanings from the Writings of Bahá’u’lláh', collection: 'Core Tablets' };
const PILGRIM = { author: 'A Pilgrim', religion: B, title: 'Pilgrimage (Extracts)', collection: 'Pilgrim Notes' };

describe('offers leave the prose (live round 2: 1j4m76y, 1xj6ann, 18t1bhn)', () => {
  it('drops a closing "I can go deeper" offer and keeps the sentence for the pills', () => {
    const r = dropOffers('Chastity is a discipline of the self.\n\nIf you want, I can go deeper into how the Writings treat the Trinity and the station of Christ, or how they explain progressive revelation.');
    expect(r.text).toBe('Chastity is a discipline of the self.');
    expect(r.offers).toHaveLength(1);
  });
  it('drops an invitation to ask, and the "Just ask." after an offer', () => {
    expect(isInvite('You are welcome to ask how Bahá’ís treat people of other beliefs.')).toBe(true);
    expect(dropOffers('An answer.\n\nI can say more about the Covenant if you would like. Just ask.').text).toBe('An answer.');
  });
  it('never touches quotations, blockquotes or ordinary prose, and never empties the reply', () => {
    const t = '> "Ask me about anything," He said. [[P1]]\n\nHe wrote that we may "ask whatever we wish". [[P2]]';
    expect(dropOffers(t)).toEqual({ text: t, offers: [] });
    expect(dropOffers('I can go deeper into this if you would like.').offers).toEqual([]);
  });
});

describe('an offer becomes a pill', () => {
  it('turns the offer into "Tell me more about …"', () => {
    expect(offerPill('I can go deeper into how the Writings frame chastity, or share the passages on marriage.')).toBe('Tell me more about how the Writings frame chastity');
    expect(offerPill('You are welcome to ask how the Guardian explained this.')).toBe('Tell me more about how the Guardian explained this');
    expect(offerPill('Chastity is a discipline.')).toBe(null);
  });
  it('keeps pills that already take up the offer; otherwise the last pill makes way', () => {
    const offer = ['I can go deeper into the station of Christ in the Writings.'];
    expect(withOfferPill(['What is the station of Christ?', 'b', 'c'], offer)).toEqual(['What is the station of Christ?', 'b', 'c']);
    expect(withOfferPill(['Who wrote it?', 'b', 'c'], offer)).toEqual(['Who wrote it?', 'b', 'Tell me more about the station of Christ in the Writings']);
    expect(withOfferPill(['Who wrote it?'], offer)).toHaveLength(2);
    expect(withOfferPill(['x'], [])).toEqual(['x']);
  });
  it('a shared word like "Bahá’í" is not coverage', () => {
    const out = withOfferPill(['Does the Bahá’í Faith say gay people should be welcomed?', 'b', 'c'], ['You are welcome to ask how Bahá’ís treat people of other beliefs and lifestyles.']);
    expect(out[2]).toMatch(/^Tell me more about how Bahá’ís treat people/);
  });
});

describe('run-in section heads (1jhg01p: **Sexism.** **Homophobia.** **Transphobia.**)', () => {
  const essay = 'The question assumes a frame.\n\n**Sexism.** The Writings hold equality.\n\n**Homophobia.** Prejudice is ruled out.\n\n**Transphobia**\nNo text addresses it directly.';
  it('finds two or more heads, bold run-ins and headings', () => {
    expect(runInHeads(essay)).toEqual(['Sexism', 'Homophobia', 'Transphobia']);
    expect(runInHeads('Intro.\n\n## Why\nText.\n\n## How\nText.')).toEqual(['Why', 'How']);
  });
  it('one head, a bold word in a sentence, or a bold quotation is not a sectioned reply', () => {
    expect(runInHeads('**Sexism.** Equality.\n\nPlain.')).toEqual([]);
    expect(runInHeads('A **bold** word.\n\n**“The earth is but one country”** He wrote.\n\n**“And mankind its citizens”** too.')).toEqual([]);
    expect(runInHeads('**God** is beyond attribute.\n\n**Love** is the bond.')).toEqual([]);
  });
  it('the rewrite note names the heads and offers the depth marker', () => {
    const a = headsAsk(runInHeads(essay));
    expect(a).toContain('"Sexism"');
    expect(a).toContain(DEPTH);
    expect(a).toMatch(/^\(note from the library, not the reader\)/);
  });
  it('the depth marker is the agent’s own field, stripped before anything is shown', () => {
    expect(hasDepth(`${DEPTH}\n**Sexism.** …`)).toBe(true);
    expect(dropDepth(`${DEPTH}\n**Sexism.** text`)).toBe('**Sexism.** text');
    expect(hasDepth('**Sexism.** …')).toBe(false);
  });
});

describe('the core text is quoted first (1xebxqv: a pilgrim note led)', () => {
  const found = new Map([['P1', PILGRIM], ['P2', WRIT]]);
  it('reads quotations in the order the reader meets them', () => {
    expect(quotedRefs('{{quote P3}}\n\n> words [[P1]]\n\nHe wrote "x y z" [[P2]]. See also [[P4]].')).toEqual(['P3', 'P1', 'P2']);
  });
  it('flags a pilgrim note quoted ahead of the Writings', () => {
    const r = leadSource('A pilgrim recalls:\n\n{{quote P1}}\n\nBahá’u’lláh writes:\n\n{{quote P2}}', found);
    expect(r).toEqual({ first: 'P1', core: 'P2', firstTier: 'reported' });
    expect(leadAsk(r)).toMatch(/P2 quoted first/);
  });
  it('core first, a pilgrim note alone, or an unquoted citation passes', () => {
    expect(leadSource('{{quote P2}}\n\n{{quote P1}}', found)).toBe(null);
    expect(leadSource('{{quote P1}}', found)).toBe(null);
    expect(leadSource('{{quote P1}}\n\nSee [[P2]].', found)).toBe(null);
  });
});

// ---- wired into the agent (agent-core.js): the marker never reaches a reader on any path; one rewrite; offers carried for the pills ----
import { agentAnswer } from '../../api/lib/assistant/agent.js';
import { headsAsk as HA } from '../../api/lib/assistant/reply-form.js';

const GPB = { id: 11, text: 'Foremost among the priceless treasures cast forth from the billowing ocean of Bahá’u’lláh’s Revelation ranks the Kitáb-i-Íqán.',
  title: 'God Passes By', author: 'Shoghi Effendi', source_url: 'https://oceanlibrary.com/gpb#p1', document_id: 5, paragraph_index: 1 };
const tools = { search: async () => [GPB] };
const SEARCH = { choices: [{ message: { content: '', tool_calls: [{ id: 's', function: { name: 'fused_search', arguments: '{"query":"Iqan"}' } }] } }] };
const say = (content) => ({ choices: [{ message: { content } }] });
const chunks = (parts, tc = null) => ({ async *[Symbol.asyncIterator]() {
  for (const p of parts) yield { choices: [{ delta: { content: p } }] };
  if (tc) yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: tc, arguments: '{"query":"Iqan"}' } }] } }] };
  yield { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } };
} });
const SECTIONED = 'The Íqán is foremost among His works.\n\n**Its rank.** Shoghi Effendi ranks it first [[P1]].\n\n**Its purpose.** It answers a seeker’s questions [[P1]].';
const DEEP = `${DEPTH}\n${SECTIONED}`;
const noMarker = (s) => expect(String(s)).not.toMatch(/\[\[\s*D\s*E\s*P|DEPTH\]\]|PTH\]\]/);

describe('agent: the depth marker never leaks, on any path', () => {
  it('live stream, the marker split across chunks: no text event, reply or raw carries it; no rewrite (the agent chose depth)', async () => {
    const ev = []; let n = 0;
    const create = async () => (n++ === 0 ? chunks(['Let me search.'], 'fused_search') : chunks(['[[DE', 'PTH]]', '\nThe Íqán is foremost among His works, as Shoghi Effendi says in his history of the Faith. ',
      '\n\n**Its rank.** Shoghi Effendi ranks it first [[P1]].', '\n\n**Its purpose.** It answers a seeker’s questions [[P1]].']));
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'A full research survey of the Iqan, please.' }], tools, create, onEvent: (e) => ev.push(e) });
    expect(n).toBe(2);
    expect(ev.some((e) => e.type === 'text')).toBe(true);
    for (const e of ev.filter((e) => e.type === 'text')) noMarker(e.content);
    noMarker(r.reply); noMarker(r.raw);
    expect(r.reply).toContain('**Its rank.**');
  });
  it('whole (non-streamed) reply — what email/letters, saved history and share pages are made from', async () => {
    let n = 0;
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Research the Iqan in depth.' }], tools, create: async () => (n++ === 0 ? SEARCH : say(DEEP)) });
    noMarker(r.reply); noMarker(r.raw);
    expect(r.reply).toContain('**Its purpose.**');
  });
  it('a marker in an earlier reply is not fed back to the model as its own text', async () => {
    const seen = [];
    await agentAnswer({ messages: [{ role: 'user', content: 'Research the Iqan.' }, { role: 'assistant', content: DEEP }, { role: 'user', content: 'Who wrote it?' }], tools,
      create: async (p) => { seen.push(p); return seen.length === 1 ? SEARCH : say('Bahá’u’lláh wrote it [[P1]].'); } });
    expect(seen[0].messages.find((m) => m.role === 'assistant').content).not.toContain(DEPTH);
    expect(seen[0].messages[0].content).toContain(DEPTH);   // the instruction itself, in the system prompt
  });
});

describe('agent: one rewrite for form, offers kept for the pills', () => {
  it('run-in heads without the marker → the writer rewrites once; the reader gets the plain version', async () => {
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, create: async (p) => { seen.push(p);
      return seen.length === 1 ? SEARCH : seen.length === 2 ? say(SECTIONED) : say('The Íqán is foremost among His works; Shoghi Effendi ranks it first [[P1]].'); } });
    expect(seen).toHaveLength(3);
    expect(seen[2].messages.at(-1)).toEqual({ role: 'user', content: HA(['Its rank', 'Its purpose']) });
    expect(r.reply).not.toContain('**Its rank.**');
  });
  it('a plain reply is not rewritten; a closing offer leaves the prose and is returned for the pills', async () => {
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, create: async (p) => { seen.push(p);
      return seen.length === 1 ? SEARCH : say('Shoghi Effendi ranks the Íqán first [[P1]].\n\nI can go deeper into how the Íqán reads prophecy, if you would like.'); } });
    expect(seen).toHaveLength(2);
    expect(r.reply).not.toMatch(/go deeper/);
    expect(r.offers).toEqual(['I can go deeper into how the Íqán reads prophecy, if you would like.']);
  });
  it('a streamed offer piece never shows', async () => {
    const ev = []; let n = 0;
    await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, onEvent: (e) => ev.push(e),
      create: async () => (n++ === 0 ? chunks(['Let me search.'], 'fused_search') : chunks(['Shoghi Effendi ranks the Íqán above every other work of its Author, a book he calls the foremost treasure of the Revelation and the key to its scripture. ', 'It answers the questions of a seeker about the return of the Prophets [[P1]]. ', 'It was written in Baghdad. ', '\n\nYou are welcome to ask how it reads prophecy.'])) });
    const text = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(text).toContain('foremost treasure');
    expect(text).not.toMatch(/welcome to ask/);
  });
});
