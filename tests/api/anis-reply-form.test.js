// Reply form checks (Chad 11-14, Reddit rounds 3–4): offers → pills, section heads → prose by code unless the agent chose depth, core text quoted first. Form only, never intent.
import { describe, it, expect } from 'vitest';
import { sourceTier } from '../../api/lib/assistant/source-tier.js';
import { sentencesOf } from '../../api/lib/assistant/sentences.js';
import { DEPTH, hasDepth, dropDepth, dropOffers, isInvite, isOfferSentence, runInHeads, deHead, liveDeHead, firstQuoted, quotedRefs, leadSource, leadAsk, reorderQuotes, offerPill, withOfferPill } from '../../api/lib/assistant/reply-form.js';

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
  it('the depth marker is the agent’s own field, stripped before anything is shown', () => {
    expect(hasDepth(`${DEPTH}\n**Sexism.** …`)).toBe(true);
    expect(dropDepth(`${DEPTH}\n**Sexism.** text`)).toBe('**Sexism.** text');
    expect(hasDepth('**Sexism.** …')).toBe(false);
  });
});

// 1xebxqv round 4 (Chad 11-14: "Talks by Central figures, eyewitness accounts … (Pilgrim Notes) … still higher than any other
// authority, including administrative authorities such as ITC, NSA, LSA, ABM, CBC, NTC, RTC and UHJ"): the Will and Testament led,
// then the House's "Issues Related to the Study…", then 'Abdu'l-Bahá and the Guardian, and Pilgrimage (Extracts) came last
describe('quotations in rank order: talks and pilgrim notes above every institution (1xebxqv round 4)', () => {
  const R4 = new Map([
    ['P1', { author: '‘Abdu’l-Bahá', religion: B, title: 'The Will and Testament of ‘Abdu’l-Bahá' }],
    ['P2', { author: 'Universal House of Justice', religion: B, title: 'Issues Related to the Study of the Bahá’í Faith', collection: 'Research Department Compilations' }],
    ['P3', { author: '‘Abdu’l-Bahá', religion: B, title: 'Selections from the Writings of ‘Abdu’l-Bahá' }],
    ['P4', { author: 'Shoghi Effendi', religion: B, title: 'Dawn of a New Day' }],
    ['P5', { author: 'Shoghi Effendi', book_author: 'May Maxwell', religion: B, title: 'Pilgrimage (Extracts)', collection: 'Pilgrim Notes' }]]);
  const reply = '‘Abdu’l-Bahá says:\n\n{{quote P1}}\n\nThe House of Justice calls it "unchallengeable" [[P2]].\n\n{{quote P2}}\n\n{{quote P3}}\n\n{{quote P4}}\n\n'
    + 'He also records that *"no two consciences agree"* [[P5]].';
  it('a House letter before the Writings and before a pilgrim note → one rewrite into rank order', () => {
    const r = leadSource(reply, R4);
    expect(r).toMatchObject({ first: 'P2', core: 'P3', firstTier: 'house', coreTier: 'writings' });
    expect(r.order).toEqual(['P1', 'P3', 'P4', 'P5', 'P2']);   // the pilgrim note before the House letter
    expect(leadAsk(r)).toContain('P5 (a talk or pilgrim’s note), P2 (a House of Justice letter)');
  });
  it('the House after the pilgrim note passes; so does a talk before a pilgrim note', () => {
    expect(leadSource('{{quote P1}}\n\n{{quote P4}}\n\n{{quote P5}}\n\n{{quote P2}}', R4)).toBe(null);
    const talk = new Map([['P9', { author: '‘Abdu’l-Bahá', religion: B, title: 'Paris Talks' }], ['P5', R4.get('P5')]]);
    expect(leadSource('{{quote P5}}\n\n{{quote P9}}', talk)).toBe(null);   // talk vs pilgrim note is a half step: no rewrite
  });
  it('another tradition’s passage and Nabíl’s narrative are not ranked', () => {
    const m = new Map([['P7', { author: 'Jesus', religion: 'Christianity', title: 'Matthew' }], ['P8', { author: 'Nabíl-i-A‘ẓam', religion: B, title: 'The Dawn-Breakers', document_id: 21308 }], ['P1', R4.get('P1')]]);
    expect(leadSource('{{quote P7}}\n\n{{quote P8}}\n\n{{quote P1}}', m)).toBe(null);
  });
  it('every administrative body ranks below a pilgrim note, even filed under Pilgrim Notes (docs 18, 9296 from the library)', () => {
    const nsa = { author: 'National Spiritual Assembly', religion: B, title: 'Homosexuality and Civil Rights', collection: 'Administrative' };   // doc 18
    const itc = { author: 'International Teaching Centre', religion: B, title: 'Guidance on Pilgrim Notes and the Calamity', collection: 'Pilgrim Notes' };   // doc 9296
    for (const p of [nsa, itc, { ...nsa, author: 'Local Spiritual Assembly of the Bahá’ís of Seattle' }, { ...itc, author: 'Continental Board of Counsellors' },
      { ...nsa, author: 'Auxiliary Board member' }, { ...nsa, author: 'National Teaching Committee' }, { ...nsa, author: 'Regional Teaching Committee' }])
      expect(['house', 'secondary']).toContain(sourceTier(p));
    expect(leadSource('{{quote P6}}\n\n{{quote P5}}', new Map([['P6', itc], ['P5', R4.get('P5')]]))).toMatchObject({ first: 'P6', core: 'P5', firstTier: 'secondary' });
  });
});

// the round-5 replies after their rewrite (wt tmp round5), cut to their paragraph frame: the prose verbatim where it joins the blocks
describe('reorderQuotes: whole blocks move only when nothing refers across them (round 5)', () => {
  const P = (author, title, extra = {}) => ({ author, religion: B, title, ...extra });
  it('1fuszlx: the Guardian’s lead-in says "frames it the same way" → the draft stays', () => {
    const found = new Map([['P14', P('Universal House of Justice', 'Messages from the Universal House of Justice: 1986-2001')], ['P3', P('Shoghi Effendi', 'Messages to Canada')], ['P1', P('Bahá’u’lláh', 'Gleanings from the Writings of Bahá’u’lláh')]]);
    const t = 'The short answer is no.\n\nOn that conduct, the House of Justice says plainly:\n\n{{quote P14}}\n\nShoghi Effendi frames it the same way. The condemnation *"does not mean that people so afflicted must not be helped"* [[P3]]. Bahá\'u\'lláh\'s general rule applies to all dealings:\n\n{{quote P1}}\n\nThere is also a protection on privacy.';
    expect(leadSource(t, found)).toMatchObject({ first: 'P14', firstTier: 'house' });
    expect(reorderQuotes(t, found)).toBe(null);
  });
  it('197utk7: a chained argument ("For that reason…", "He also describes…", "His claim…") → the draft stays', () => {
    const found = new Map([['P1', P('‘Abdu’l-Bahá', 'Selections from the Writings of ‘Abdu’l-Bahá')], ['P2', P('‘Abdu’l-Bahá', 'The Promulgation of Universal Peace')],
      ['P3', P('‘Abdu’l-Bahá', 'Some Answered Questions')], ['P4', P('‘Abdu’l-Bahá', 'Divine Philosophy')], ['P5', P('‘Abdu’l-Bahá', 'Selections from the Writings of ‘Abdu’l-Bahá')]]);
    const t = ['The principle comes first. Science and religion are not two rival authorities but two kinds of one inquiry.', '{{quote P1}}',
      'For that reason, \'Abdu\'l-Bahá states that a belief which contradicts established science is superstition. In a talk recorded in *The Promulgation of Universal Peace*, He says:', '{{quote P2}}',
      'The sharpest test is biology. In *Some Answered Questions*, \'Abdu\'l-Bahá denies that man was ever an animal species that turned into another one:', '{{quote P3}}',
      'His claim is that the human species is distinct and original. A talk recorded in *Divine Philosophy* repeats the point:', '{{quote P4}}',
      'He also describes the stages of the embryo as an analogy for gradual development through many forms:', '{{quote P5}}'].join('\n\n');
    expect(leadSource(t, found)).toMatchObject({ firstTier: 'reported' });
    expect(reorderQuotes(t, found)).toBe(null);
  });
  it('1g330j9: Shoghi Effendi’s cards ahead of Bahá’u’lláh pass (one written core); the House quoted inline before Him is flagged, but inline words never move', () => {
    const found = new Map([['P14', P('Shoghi Effendi', 'A Chaste and Holy Life')], ['P13', P('Shoghi Effendi', 'The Light of Divine Guidance')], ['P10', P('Shoghi Effendi', 'Lights of Guidance')],
      ['P18', P('Universal House of Justice', 'To Set the World in Order')], ['P3', P('Bahá’u’lláh', 'Epistle to the Son of the Wolf')]]);
    const t = 'The rule on sexual expression is stated plainly:\n\n{{quote P14}}\n\nSex is not treated as unclean:\n\n{{quote P13}}\n\nThe limit is one of proportion:\n\n{{quote P10}}\n\nThe House of Justice adds that society has exalted sexuality *"to a level of importance far beyond its proper place in our lives."* [[P18]]\n\nBahá\'u\'lláh tells monks to leave their cloisters: *"He that secludeth himself in his house is indeed as one dead."* [[P3]]';
    expect(leadSource(t, found)).toMatchObject({ first: 'P18', core: 'P3', firstTier: 'house', coreTier: 'writings' });
    expect(leadSource(t.replace(/\n\nThe House of Justice adds[^\n]*/, ''), found)).toBe(null);   // the Guardian’s three cards before Bahá’u’lláh: in order
    expect(reorderQuotes(t, found)).toBe(null);
  });
  it('blocks that stand alone trade places with their lead-ins; inline quotations and other prose stay put', () => {
    const found = new Map([['P2', P('Universal House of Justice', 'Messages from the Universal House of Justice: 1986-2001')], ['P5', P('Shoghi Effendi', 'Pilgrimage (Extracts)', { book_author: 'May Maxwell', collection: 'Pilgrim Notes' })], ['P1', P('Bahá’u’lláh', 'Gleanings from the Writings of Bahá’u’lláh')]]);
    const t = 'The short answer is no.\n\nThe House of Justice says plainly:\n\n{{quote P2}}\n\nMay Maxwell recalls the Guardian’s words:\n\n{{quote P5}}\n\nThe welcome is open to all.\n\nBahá’u’lláh writes:\n\n{{quote P1}}\n\nKindness comes first.';
    const r = reorderQuotes(t, found);
    expect(r.order).toEqual(['P1', 'P5', 'P2']);
    expect(r.text).toBe('The short answer is no.\n\nBahá’u’lláh writes:\n\n{{quote P1}}\n\nMay Maxwell recalls the Guardian’s words:\n\n{{quote P5}}\n\nThe welcome is open to all.\n\nThe House of Justice says plainly:\n\n{{quote P2}}\n\nKindness comes first.');
    expect(leadSource(r.text, found)).toBe(null);
    // a moved block whose next paragraph leans on it (a block that keeps its place keeps its follower), or prose pointing "above", keeps the draft
    expect(reorderQuotes(t.replace('Kindness comes first.', 'This is the heart of it.'), found)).toBe(null);
    expect(reorderQuotes(t.replace('Kindness comes first.', 'The passages above agree.'), found)).toBe(null);
  });
});

describe('section heads become prose (round 3: 7 replies, round 4: 197utk7); real lists and bold quotations stay', () => {
  it('bold run-ins become the paragraph’s first sentence; a lone bold head joins the paragraph after it', () => {
    const r = deHead('The question assumes a frame.\n\n**Sexism.** The Writings hold equality.\n\n**Homophobia:** Prejudice is ruled out.\n\n**Transphobia**\n\nNo text addresses it directly.');
    expect(r.text).toBe('The question assumes a frame.\n\nSexism. The Writings hold equality.\n\nHomophobia. Prejudice is ruled out.\n\nTransphobia. No text addresses it directly.');
    expect(r.heads).toEqual(['Sexism', 'Homophobia', 'Transphobia']);
  });
  it('a markdown heading and a numbered heading line (197utk7 "1. Human origins…") become prose', () => {
    const r = deHead('Intro.\n\n## How agreement is found\nConsultation seeks the truth.\n\n1. Human origins and evolution\n\nThe Writings hold that humanity was always distinct.');
    expect(r.text).not.toMatch(/^#|^1\./m);
    expect(r.text).toContain('How agreement is found. Consultation seeks the truth.');
    expect(r.text).toContain('Human origins and evolution. The Writings hold');
  });
  it('a real numbered list, a bold quotation and a bold word in a sentence are left alone', () => {
    const list = 'Three things:\n\n1. Prayer\n2. Fasting\n3. Service';
    expect(deHead(list)).toEqual({ text: list, heads: [] });
    const items = 'Steps.\n\n1. Pray daily.\n\n2. Read the Writings morning and evening.';
    expect(deHead(items).text).toBe(items);
    const table = '# The thirteen named in the Íqán\n\n| # | Name |\n|---|---|\n| 1 | Ṭáhirih |';
    expect(deHead(table).text).toBe(table);   // a compiled table keeps its title (Dawn-Breakers round 7 email turn)
    const titled = '# The thirteen named in the Íqán\n\nBahá’u’lláh names some of the learned.\n\n| # | Name |\n|---|---|';
    expect(deHead(titled).text).toBe(titled);   // "# X" is a title, not a section head
    const q = '**“The earth is but one country”** He wrote.\n\nA **bold** word stays.';
    expect(deHead(q).text).toBe(q);
  });
  it('a head over a card ends as its own sentence; the card is untouched', () => {
    expect(deHead('**What He wrote**\n\n{{quote P1}}\n\nThat settles it.').text).toBe('What He wrote.\n\n{{quote P1}}\n\nThat settles it.');
  });
  it('live: a numbered head split across stream pieces comes out the same as the whole reply', () => {
    const pieces = ['The question assumes a frame. ', '\n\n1. ', 'Human origins and evolution\n\n', 'The Writings hold that humanity was always distinct. ', '\n\n**Its rank.** Shoghi Effendi ranks it first.'];
    const L = liveDeHead(); const out = [];
    for (const p of pieces) out.push(...L.push(p));
    out.push(...L.flush());
    expect(out.join('')).toBe(deHead(pieces.join('')).text);
    expect(L.heads).toBe(2);
  });
  it('live: with the depth marker the pieces pass through untouched', () => {
    const L = liveDeHead(() => true);
    expect([...L.push('**Its rank.** First.'), ...L.flush()].join('')).toBe('**Its rank.** First.');
  });
});

describe('first-person offers (1j4m76y, rounds 3 and 4)', () => {
  it('a conditional lead-in is part of the offer: "If you tell me how that sits with you, I can say more about … or about …" (18t1bhn, round 5)', () => {
    const t = "The beliefs do differ. If you tell me how that sits with you, I can say more about how Bahá'ís are asked to treat others, or about what the Writings say on the oneness of humanity and the dignity of every soul.";
    const r = dropOffers(t);
    expect(r.text).toBe('The beliefs do differ.');
    expect(offerPill(r.offers[0])).toBe("Tell me more about how Bahá'ís are asked to treat others");
    expect(dropOffers('If God wills, I can only hope. Next.').offers).toEqual([]);   // not an offer
  });
  it('"I can set out how … traditions answer" leaves the prose and becomes a pill', () => {
    const o = 'I can set out how the Christian or Islamic traditions answer your question, if that would help.';
    expect(isOfferSentence(o)).toBe(true);
    const r = dropOffers(`Each Manifestation renews the same faith.\n\n${o}`);
    expect(r.text).toBe('Each Manifestation renews the same faith.');
    expect(offerPill(r.offers[0])).toBe('Tell me more about how the Christian or Islamic traditions answer your question');
    expect(offerPill('I can set out how the Christian or Islamic traditions answer your question.')).toBe('Tell me more about how the Christian or Islamic traditions answer your question');   // round 4, verbatim
  });
  it('a trailing ", and I can set those out alongside it" is cut from the claim; a pronoun topic makes no pill', () => {
    const r = dropOffers('Each tradition reads its own fulfilment from their own scriptures, and I can set those out alongside it.');
    expect(r.text).toBe('Each tradition reads its own fulfilment from their own scriptures.');
    expect(r.offers).toEqual(['I can set those out alongside it.']);
    expect(offerPill(r.offers[0])).toBe(null);
  });
  it('"I can see why…", "I cannot…" and quoted words are not offers', () => {
    expect(isOfferSentence('I can see why that seems hard.')).toBe(false);
    expect(isOfferSentence('I cannot find that passage.')).toBe(false);
    const q = 'He said, “I can show you the way.”';
    expect(dropOffers(`An answer.\n\n${q}`).text).toContain(q);
  });
});

describe('the core text is quoted first (1xebxqv: a pilgrim note led)', () => {
  const found = new Map([['P1', PILGRIM], ['P2', WRIT]]);
  it('reads quotations in the order the reader meets them', () => {
    expect(quotedRefs('{{quote P3}}\n\n> words [[P1]]\n\nHe wrote "x y z" [[P2]]. See also [[P4]].')).toEqual(['P3', 'P1', 'P2']);
  });
  it('flags a pilgrim note quoted ahead of the Writings', () => {
    const r = leadSource('A pilgrim recalls:\n\n{{quote P1}}\n\nBahá’u’lláh writes:\n\n{{quote P2}}', found);
    expect(r).toMatchObject({ first: 'P1', core: 'P2', firstTier: 'reported', coreTier: 'writings', order: ['P2', 'P1'] });
    expect(leadAsk(r)).toMatch(/in this order: P2 \(the Writings\), P1 \(a talk or pilgrim’s note\)/);
    expect(leadAsk(r)).not.toMatch(/authority/i);   // a short factual note, no lecture for the reply to echo
  });
  it('core first, a pilgrim note alone, or an unquoted citation passes', () => {
    expect(leadSource('{{quote P2}}\n\n{{quote P1}}', found)).toBe(null);
    expect(leadSource('{{quote P1}}', found)).toBe(null);
    expect(leadSource('{{quote P1}}\n\nSee [[P2]].', found)).toBe(null);
  });
  it('firstQuoted reports the first quotation’s tier and authors (telemetry)', () => {
    expect(firstQuoted('{{quote P1}}\n\n{{quote P2}}', found)).toMatchObject({ ref: 'P1', tier: 'reported' });
    expect(firstQuoted('No quotation.', found)).toBe(null);
  });
});

// ---- wired into the agent (agent-core.js): the marker never reaches a reader on any path; one rewrite; offers carried for the pills ----
import { agentAnswer } from '../../api/lib/assistant/agent.js';

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
  it('run-in heads without the marker → no rewrite: code turns them into prose; the form is in the telemetry', async () => {
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, create: async (p) => { seen.push(p); return seen.length === 1 ? SEARCH : say(SECTIONED); } });
    expect(seen).toHaveLength(2);
    expect(r.reply).not.toContain('**Its rank.**');
    expect(r.reply).toMatch(/Its rank\. Shoghi Effendi ranks it first/);
    expect(r.agent.form).toMatchObject({ heads: 2, depth: false, rewritten: false, rewroteFor: null, lead: null });
  });
  it('streamed heads reach the reader as prose too', async () => {
    const ev = []; let n = 0;
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, onEvent: (e) => ev.push(e),
      create: async () => (n++ === 0 ? chunks(['Let me search.'], 'fused_search') : chunks(['The Íqán is foremost among His works, as Shoghi Effendi says in his history of the Faith. ',
        '\n\n**Its rank.** Shoghi Effendi ranks it first [[P1]].', '\n\n**Its purpose.** It answers a seeker’s questions [[P1]].'])) });
    const text = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(text).not.toContain('**Its');
    expect(text).toMatch(/Its purpose\. It answers/);
    expect(r.agent.form.heads).toBe(2);
  });
  it('held research, one round (1xebxqv): a House passage quoted ahead of the Writings → the lead rewrite still runs', async () => {
    const HOUSE = { id: 901, title: 'Issues Related to the Study of the Bahá’í Faith', author: 'Universal House of Justice', religion: B, source_url: 'https://oceanlibrary.com/issues#p1', text: 'The Faith has no clergy and no creed imposed from above.' };
    const GL = { id: 902, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: B, source_url: 'https://oceanlibrary.com/gleanings#p2', text: 'Consort with the followers of all religions in a spirit of friendliness and fellowship.' };
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Is the Faith a cult?' }], tools: { search: async () => [] },
      held: { same: true, status: 'candidate', question: 'Is the Bahá’í Faith a cult?', passages: [HOUSE, GL] },
      create: async (p) => { seen.push(p);
        const turn = p.messages.findLast((m) => m.role === 'user' && /HELD/.test(m.content))?.content || '';
        const ref = (t) => turn.match(new RegExp(`(P\\d+)[^\\n]*${t}`))?.[1];
        const h = ref('Issues Related'), g = ref('Gleanings');
        return say(seen.length === 1 ? `{{quote ${h}}}\n\nBahá’u’lláh wrote:\n\n{{quote ${g}}}` : `Bahá’u’lláh wrote:\n\n{{quote ${g}}}`); } });
    expect(seen).toHaveLength(2);
    expect(seen[1].messages.at(-1).content).toMatch(/in this order: P\d \(the Writings\), P\d \(a House of Justice letter\)/);
    expect(r.agent.form).toMatchObject({ rewritten: true, rewroteFor: 'lead', first: { tier: 'house' } });
  });
  // round 5: the rewrite complied in 1 of 6 → when it still quotes out of order, code moves whole blocks (reorderQuotes)
  const twoCards = async (second) => {
    const HOUSE = { id: 911, title: 'Messages from the Universal House of Justice: 1986-2001', author: 'Universal House of Justice', religion: B, source_url: 'https://oceanlibrary.com/uhj#p1', text: 'To regard homosexuals with prejudice and disdain would be entirely against the spirit of Bahá’í Teachings.' };
    const GL = { id: 912, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: B, source_url: 'https://oceanlibrary.com/gleanings#p13', text: 'Show forbearance and benevolence and love to one another.' };
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Do Bahá’ís support LGBTQ people?' }], tools: { search: async () => [] },
      held: { same: true, status: 'candidate', question: 'Do Bahá’ís support LGBTQ people?', passages: [HOUSE, GL] },
      create: async (p) => { seen.push(p);
        const turn = p.messages.findLast((m) => m.role === 'user' && /HELD/.test(m.content))?.content || '';
        const ref = (t) => turn.match(new RegExp(`(P\\d+)[^\\n]*${t}`))?.[1];
        const h = ref('Messages from'), gl = ref('Gleanings');
        return say(seen.length === 1 ? `The short answer is no.\n\nThe House of Justice says plainly:\n\n{{quote ${h}}}\n\nBahá’u’lláh’s rule applies to all dealings:\n\n{{quote ${gl}}}` : second(h, gl)); } });
    return { r, seen };
  };
  it('the rewrite still quotes the House first → code moves the whole blocks, each with its lead-in (1fuszlx, round 5)', async () => {
    const { r, seen } = await twoCards((h, gl) => `The short answer is no.\n\nOn conduct, the House of Justice says plainly:\n\n{{quote ${h}}}\n\nBahá’u’lláh’s rule applies to all dealings:\n\n{{quote ${gl}}}\n\nBahá’ís are asked for kindness.`);
    expect(seen).toHaveLength(2);
    expect(r.agent.form).toMatchObject({ rewritten: true, reordered: true, leadAfter: { firstTier: 'house', coreTier: 'writings' } });
    const at = (t) => r.reply.indexOf(t);
    expect(at('Show forbearance')).toBeGreaterThan(-1);
    expect(at('rule applies to all dealings')).toBeLessThan(at('Show forbearance'));
    expect(at('Show forbearance')).toBeLessThan(at('the House of Justice says plainly'));
    expect(at('the House of Justice says plainly')).toBeLessThan(at('prejudice and disdain'));
    expect(r.reply.trim()).toMatch(/kindness\.$/);
  });
  it('…but a block the prose leans on stays where the writer put it (nothing dangles)', async () => {
    const { r } = await twoCards((h, gl) => `The House of Justice says plainly:\n\n{{quote ${h}}}\n\nThis rests on Bahá’u’lláh’s own rule:\n\n{{quote ${gl}}}`);
    expect(r.agent.form).toMatchObject({ rewritten: true, reordered: false, leadAfter: { firstTier: 'house' } });
    expect(r.reply.indexOf('prejudice and disdain')).toBeLessThan(r.reply.indexOf('Show forbearance'));
  });
  it('a letter written on behalf of Shoghi Effendi IS Shoghi Effendi: quoted before his own book, no rewrite and no reorder (Chad 10-03)', async () => {
    const OB = { id: 921, title: 'Lights of Guidance', author: 'Written on behalf of Shoghi Effendi', religion: B, source_url: 'https://oceanlibrary.com/lights#p1', text: 'The Bahá’í teachings on sexual morality centre on marriage and the family.' };
    const SE = { id: 922, title: 'The Advent of Divine Justice', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: B, source_url: 'https://oceanlibrary.com/advent#p30', text: 'A chaste and holy life must be made the controlling principle.' };
    expect(sourceTier(OB)).toBe('guardian');
    for (const a of ['Written on behalf of the Universal House of Justice', 'Department of the Secretariat on behalf of the Universal House of Justice'])
      expect(sourceTier({ ...OB, author: a })).toBe('house');
    const text = 'A letter written on his behalf explains:\n\n{{quote P1}}\n\nShoghi Effendi writes:\n\n{{quote P2}}', found = new Map([['P1', OB], ['P2', SE]]);
    expect(leadSource(text, found)).toBe(null);
    expect(reorderQuotes(text, found)).toBe(null);
    const seen = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Bahá’í view of chastity?' }], tools: { search: async () => [] },
      held: { same: true, status: 'candidate', question: 'What is the Bahá’í view of chastity?', passages: [OB, SE] },
      create: async (p) => { seen.push(p);
        const turn = p.messages.findLast((m) => m.role === 'user' && /HELD/.test(m.content))?.content || '';
        const ref = (t) => turn.match(new RegExp(`(P\\d+)[^\\n]*${t}`))?.[1];
        return say(`A letter written on his behalf explains:\n\n{{quote ${ref('Lights of')}}}\n\nShoghi Effendi writes:\n\n{{quote ${ref('Advent of')}}}`); } });
    expect(seen).toHaveLength(1);
    expect(r.agent.form).toMatchObject({ lead: null, rewritten: false, reordered: false });
    expect(r.reply.indexOf('sexual morality')).toBeLessThan(r.reply.indexOf('chaste and holy'));
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

describe('abbreviations stay inside their sentence (tz4 live, edge 1e544da3: "Date and recipient. H. (1865)")', () => {
  const TZ = '**Date and recipient.** Revealed in 1281 A.H. (1865) for Aḥmad, a native of Yazd. He wrote it in Adrianople.\n\nMore follows.';
  const words = (t) => t.replace(/\*\*/g, '').split(/\s+/).filter(Boolean);
  it('deHead and liveDeHead keep every word of the A.H. sentence', () => {
    expect(words(deHead(TZ).text)).toEqual(words(TZ));
    const live = liveDeHead(), out = [];
    for (const p of ['**Date and recipient.** Revealed in 1281 A.', 'H. ', '(1865) for Aḥmad, a native of Yazd. ', 'He wrote it in Adrianople.\n\n', 'More follows.']) out.push(...live.push(p));
    out.push(...live.flush());
    expect(words(out.join(''))).toEqual(words(TZ));
    expect(out.join('')).toContain('Date and recipient. Revealed in 1281 A.H. (1865) for Aḥmad');
  });
  it('the sentence splitter never ends a sentence at A.H., A.D., B.E., e.g., i.e., vol., ch., p., pp., no., initials, Mr. or Dr.', () => {
    const s = 'Revealed in 1281 A.H. (1865) for Aḥmad. See vol. 2, ch. 3, p. 45 and pp. 50–52, no. 7, e.g. this, i.e. that. Mr. Smith and Dr. Jones met J. E. Esslemont in 1920 A.D., 77 B.E. here. It rests on a. Next.';
    const r = sentencesOf(s);
    expect(r.join('')).toBe(s);
    expect(r.map((x) => x.trim())).toEqual(['Revealed in 1281 A.H. (1865) for Aḥmad.', 'See vol. 2, ch. 3, p. 45 and pp. 50–52, no. 7, e.g. this, i.e. that.',
      'Mr. Smith and Dr. Jones met J. E. Esslemont in 1920 A.D., 77 B.E. here.', 'It rests on a.', 'Next.']);
  });
  it('an offer after an abbreviation is still one sentence, and the A.H. sentence is never taken for an offer', () => {
    const r = dropOffers('Revealed in 1281 A.H. (1865) for Aḥmad.\n\nI can say more about the Tablet of Aḥmad if you like.');
    expect(r.text).toBe('Revealed in 1281 A.H. (1865) for Aḥmad.');
    expect(r.offers).toHaveLength(1);
  });
});


// team-lead 11-14: reorderQuotes declined in 197utk7 and 1g330j9 with no reason in the telemetry → every decline names its reason (form.reorderWhy)
describe('reorderQuotes records why it declines', () => {
  const P = (author, title, extra = {}) => ({ author, religion: B, title, ...extra });
  const why = (t, found) => { const w = []; expect(reorderQuotes(t, found, w)).toBe(null); return w; };
  const found = new Map([['P2', P('Universal House of Justice', 'Messages from the Universal House of Justice: 1986-2001')], ['P1', P('Bahá’u’lláh', 'Gleanings from the Writings of Bahá’u’lláh')]]);
  const t = 'The short answer is no.\n\nThe House of Justice says plainly:\n\n{{quote P2}}\n\nThe welcome is open to all.\n\nBahá’u’lláh writes:\n\n{{quote P1}}\n\nKindness comes first.';
  it('names each reason', () => {
    expect(why(t.replace('Kindness comes first.', 'The passage above says it.'), found)).toEqual(['quoted above']);
    expect(why(t.replace('The welcome is open to all.', 'This is the heart of it.'), found)).toEqual(['next para leans: P2']);
    expect(why('Intro.\n\n{{quote P1}}\n\nThen.\n\n{{quote P2}}', found)).toEqual(['in order']);
    expect(why('Intro.\n\n{{quote P9}}', found)).toEqual(['block ¶2: refs=0', 'blocks=0']);
  });
  it('the default leaves callers unchanged', () => expect(reorderQuotes(t, found).order).toEqual(['P1', 'P2']));
});
