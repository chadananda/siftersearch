// Passage cards for researched replies (Chad 11-10): the shared blockquote parser (server + both chat clients), the server's card data
// per quoted passage (covers mocked), Jev's named work → book card, and the turn emitting them on live chat only.
import { describe, it, expect, vi } from 'vitest';
// the PDF renderer is not on this path (and pdfkit may be absent from a dev checkout)
vi.mock('../../api/lib/assistant/pdf/documents.js', () => ({ makeDocuments: () => ({}), DOC_TEXT: {} }));
import { quoteBlocks, quoteSegments, quoteKey, coverAt, coverSrcset } from '../../api/lib/quote-blocks.js';
import { quoteCards, placeOf, matchBlocks } from '../../api/lib/assistant/quote-cards.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const U1 = 'https://oceanlibrary.com/gleanings#p117', U2 = 'https://oceanlibrary.com/hidden-words#p5';
const Q1 = 'The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me';
const Q2 = 'Regard man as a mine rich in gems of inestimable value, education can alone cause it to reveal its treasures';
const REPLY = [
  'Bahá’u’lláh writes:', '', `> ${Q1}.`, `> — [*Gleanings*, CXVII](${U1})`, '',
  'And elsewhere:', '', `> ${Q2}.`, '', `— [*The Hidden Words*, Arabic 5](${U2})`, '',
  'Both point to the same thing.', '', '> Words the writer did not cite at all, five or more.',
].join('\n');
const SOURCES = [
  { title: 'Gleanings', author: 'Bahá’u’lláh', url: U1, document_id: 11, text: `${Q1}, and neglect it not.` },
  { source_title: 'The Hidden Words', source_author: 'Bahá’u’lláh', citation_url: 'https://oceanlibrary.com/hidden-words#p5-upgraded', doc_id: 22, text: `${Q2}.` },
];
const docs = async (ids) => ids.map((id) => ({ id, title: id === 11 ? 'Gleanings from the Writings of Bahá’u’lláh' : 'The Hidden Words', author: 'Bahá’u’lláh', year: 1952, cover_url: id === 11 ? '/img/covers/gleanings.jpg' : null }));
const links = async (ds) => new Map(ds.map((d) => [d.id, `https://oceanlibrary.com/book/${d.id}`]));

describe('quoteBlocks (shared by server and clients)', () => {
  it('finds each blockquote with its citation line, inside the block or on the line under it', () => {
    const b = quoteBlocks(REPLY);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatchObject({ body: `${Q1}.`, url: U1, attribution: `[*Gleanings*, CXVII](${U1})` });
    expect(b[1]).toMatchObject({ body: `${Q2}.`, url: U2 });
    expect(b[1].end).toBe(10);   // the citation line after the blank line belongs to the block
    expect(b[2]).toMatchObject({ url: null, attribution: null });
  });
  it('a plain paragraph after a quote is never taken for its citation', () => {
    expect(quoteBlocks('> some quoted words here and more\n\nSee [this](https://x.org) for more of what I mean in a long sentence.')[0].url).toBeNull();
  });
  it('segments swap only the blocks that have a card (by url, else by quote key); the rest stays markdown', () => {
    const segs = quoteSegments(REPLY, [{ url: U1, title: 'Gleanings' }, { url: 'https://other', key: quoteKey(Q2), title: 'The Hidden Words' }]);
    expect(segs.map((s) => s.kind)).toEqual(['text', 'quote', 'text', 'quote', 'text']);
    expect(segs[1]).toMatchObject({ body: `${Q1}.` });
    expect(segs[3].md).toContain('— [*The Hidden Words*');
    expect(segs[4].md).toContain('> Words the writer did not cite');
    expect(segs.filter((s) => s.kind !== 'quote').map((s) => s.md).join('\n')).not.toContain(Q1);
  });
  it('no cards → the reply untouched (email/PDF/voice and old clients)', () => {
    expect(quoteSegments(REPLY, [])).toEqual([{ kind: 'text', md: REPLY }]);
  });
  it('covers go through the image service with a srcset', () => {
    expect(coverAt('https://x/c.jpg', 96)).toBe('https://x/c.jpg?tr=w-96,q-80,e-sharpen');
    expect(coverSrcset('https://x/c.jpg?v=2')).toMatch(/&tr=w-48.* 48w, .* 96w, .* 144w$/);
  });
});

describe('quoteCards (server)', () => {
  it('one card per cited quote: work, author, place, absolute cover; matched by url, else by the quote text', async () => {
    const { cards, books } = await quoteCards(REPLY, SOURCES, { docs, links });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ url: U1, work_id: 11, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', place: 'CXVII' });
    expect(cards[0].cover_url).toMatch(/^https:\/\/.+\/img\/covers\/gleanings\.jpg$/);
    expect(cards[1]).toMatchObject({ url: U2, work_id: 22, title: 'The Hidden Words', place: 'Arabic 5', cover_url: null });
    expect(cards[1].key).toBe(quoteKey(`${Q2}.`));
    expect(books).toEqual([]);
  });
  it('the work Jev named, cited in the reply → its book card (below the text, the reply still shown)', async () => {
    const reply = `${REPLY.split('And elsewhere:')[0]}See *The Hidden Words*, Arabic 5 ([link](${U2})).`;
    const { books } = await quoteCards(reply, SOURCES, { namedWork: 'The Hidden Words', docs, links });
    expect(books).toEqual([expect.objectContaining({ id: 22, title: 'The Hidden Words', url: 'https://oceanlibrary.com/book/22', sufficient: false })]);
  });
  it('the named work already has a quote card (its cover beside the quote) → no second book card (Chad 11-12)', async () => {
    const { cards, books } = await quoteCards(REPLY, SOURCES, { namedWork: 'The Hidden Words', docs, links });
    expect(cards.map((c) => c.work_id)).toContain(22);
    expect(books).toEqual([]);
  });
  it('no blockquote and no named work → no DB read', async () => {
    let read = 0;
    const r = await quoteCards('Just prose.', SOURCES, { docs: async () => { read++; return []; }, links });
    expect(r).toEqual({ cards: [], books: [] }); expect(read).toBe(0);
  });
  it('a quote from no source gets no card; placeOf reads the place off the label', () => {
    expect(matchBlocks(REPLY, SOURCES)).toHaveLength(2);
    expect(placeOf('[*Gleanings*, CXVII](u)', 'Gleanings')).toBe('CXVII');
    expect(placeOf('Bahá’u’lláh, [*Gleanings*, CXVII](u)', 'Gleanings from the Writings')).toBe('CXVII');
    expect(placeOf('[*Gleanings*](u)', 'Gleanings from the Writings')).toBeNull();
  });
});

describe('anisTurn emits the cards on live chat', () => {
  const run = async (channel) => {
    const events = [], seen = [];
    const deps = {
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' } }),
      respond: async () => ({ reply: REPLY, citations: SOURCES, retrieved: [], plan: { shape: 'topic' }, timings: {} }),
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      quoteCards: async (reply, sources, opts) => { seen.push({ reply, n: sources.length, opts }); return { cards: [{ url: U1, title: 'Gleanings' }], books: [] }; },
    };
    const r = await anisTurn({ messages: [{ role: 'user', content: 'What does Bahá’u’lláh say about justice?' }], channel, ...(channel === 'email' ? { trusted: true } : {}), participant: { id: 's' }, clientKey: 's', onEvent: (e) => events.push(e), deps });
    return { r, events, seen };
  };
  it('site chat: a quote_cards event and the cards on the result', async () => {
    const { r, events, seen } = await run('site-chat');
    expect(seen[0]).toMatchObject({ n: 2 });
    expect(events).toContainEqual({ type: 'quote_cards', cards: [{ url: U1, title: 'Gleanings' }] });
    expect(r.quote_cards).toHaveLength(1);
    expect(r.reply).toContain('> — [*Gleanings*');   // the reply text itself is unchanged
  });
  it('email: no cards computed (the letter keeps its blockquotes)', async () => {
    const { events, seen } = await run('email');
    expect(seen).toHaveLength(0);
    expect(events.some((e) => e.type === 'quote_cards')).toBe(false);
  });
});
