// Anís term study via CTAI: which questions are about a word, the CTAI calls (faked fetch), the code-built renderings,
// and the respond path end to end with injected deps (no network, no model).
import { describe, it, expect } from 'vitest';
import { termQuestion, resolveTerm, ctaiTerm, termEvidence, renderingsBlock, placeRenderings, termFormatHow, renderingCounts, phraseWindow, passagesBlock } from '../../api/lib/anis/ctai-term.js';
import { anisRespond } from '../../api/lib/anis/respond.js';
import { channelFor } from '../../api/lib/anis/channels.js';

const STUDY = {
  term: 'عرفان', root: 'ع-ر-ف', transliteration: 'ʿ-r-f', meaning: 'knowledge; know',
  renderings: [{ en: 'knowledge', count: 29 }, { en: 'understanding', count: 19 }, { en: 'recognize', count: 11 }],
  total: 78, researchUrl: 'https://ctai.info/research/root/rf-knowledge-know/',
  passages: [{ work: 'Gleanings', author: 'Bahá’u’lláh', ref: 'Gleanings XXIX.1', url: 'https://ctai.info/models/gleanings/50/',
    original: 'مقصود از آفرینش عرفان حقّ و لقای او بوده و خواهد بود', english: 'The purpose of God in creating man hath been, and will ever be, to enable him to know his Creator',
    form: 'عرفان', rendering: 'know', phrase: 'مقصود از آفرینش **عرفان** حقّ و لقای …', phraseEn: '… enable him to **know** his Creator' },
    { work: 'Gleanings', author: 'Bahá’u’lláh', ref: 'Gleanings LXXXIII.4', url: 'https://ctai.info/models/gleanings/327/', original: 'x', english: 'y',
      form: 'عرفان', rendering: 'knowledge', phrase: 'از **عرفان** او', phraseEn: 'the **knowledge** of Him' },
    { work: 'Gleanings', author: 'Bahá’u’lláh', ref: 'Gleanings II.1', url: 'https://ctai.info/models/gleanings/7/', original: 'x', english: 'y',
      form: 'عرفان', rendering: 'knowledge', phrase: '**عرفان** اللّه', phraseEn: '**knowledge** of God' }],
};

describe('which questions are about a word', () => {
  it('Arabic script with a word cue', () => {
    expect(termQuestion('What does عرفان mean in the Writings?')).toEqual({ term: 'عرفان', script: 'arabic' });
  });
  it('a transliterated term', () => {
    expect(termQuestion('I would like to understand the meaning of the word Irfan in the Bahá’í writings')).toEqual({ term: 'Irfan', script: 'latin' });
    expect(termQuestion('What does ʿirfán mean?')?.term).toBe('ʿirfán');
    expect(termQuestion('What does Irfan mean?')?.term).toBe('Irfan');
    expect(termQuestion('What is the significance of ʿirfán in the Íqán?')?.term).toBe('ʿirfán');
    expect(termQuestion('How did Shoghi Effendi translate the term inṣáf?')?.term).toBe('inṣáf');
  });
  it('not ordinary questions, nor plain English words', () => {
    expect(termQuestion('What did Bahá’u’lláh say about the earth being one country?')).toBeNull();
    expect(termQuestion('What is the meaning of justice?')).toBeNull();
    expect(termQuestion('What does Bahá’u’lláh say about the oneness of humanity?')).toBeNull();
    expect(termQuestion('What does ‘Abdu’l-Bahá mean by the Most Great Peace?')).toBeNull();
    expect(termQuestion('What is the meaning of sacrifice in the Writings?')).toBeNull();
    expect(termQuestion('يا ابن الروح')).toBeNull();                       // a quotation, no question about a word
  });
});

describe('resolving a spelling', () => {
  it('keeps an Arabic-script answer, without vowel marks', async () => {
    expect(await resolveTerm('Irfan', { complete: async () => ({ content: 'عِرفان' }) })).toBe('عرفان');
  });
  it('refuses anything else', async () => {
    expect(await resolveTerm('Xyz', { complete: async () => ({ content: 'NONE' }) })).toBeNull();
    expect(await resolveTerm('Irfan', { complete: async () => ({ content: 'Irfan means knowledge' }) })).toBeNull();
  });
});

describe('spellings', async () => {
  const { spellings } = await import('../../api/lib/anis/ctai-term.js');
  it('searches the Persian and the Arabic letters', () => {
    expect(spellings('ایقان')).toEqual(['ایقان', 'ايقان']);
    expect(spellings('عرفان')).toEqual(['عرفان']);
    expect(spellings('کلمه')).toEqual(['کلمه', 'كلمه']);
  });
});

describe('counting renderings of the word itself', () => {
  it('a label is the rendering itself, not the words the alignment dragged along', async () => {
    const { renderingLabel } = await import('../../api/lib/anis/ctai-term.js');
    expect(renderingLabel('knowledge,” the “heaven')).toBe('knowledge');
    expect(renderingLabel('of knowledge, above the horizon of the prison-city')).toBe('knowledge');
    expect(renderingLabel('understanding, and love; whilst')).toBe('understanding');
    expect(renderingLabel('comprehend thy nature')).toBe('comprehend thy nature');
    expect(renderingLabel('the capacity')).toBe('capacity');
    expect(renderingLabel('a very long aligned phrase that is not a rendering')).toBe('');
    expect(renderingLabel('can')).toBe('');
    expect(renderingLabel('Your')).toBe('');
  });
  const r = (t) => ({ focus: { translation: t } });
  it('groups inflections, skips unaligned, sorts by count', () => {
    expect(renderingCounts([r('knowledge'), r('Knowledge'), r('recognize'), r('recognition'), r('recognizing'), r(''), r('understanding')]))
      .toEqual([{ en: 'recognize / recognition / recognizing', count: 3 }, { en: 'knowledge', count: 2 }, { en: 'understanding', count: 1 }]);
  });
});

describe('CTAI calls', () => {
  const fakeFetch = async (url) => ({
    ok: true,
    json: async () => (String(url).includes('/concordance')
      ? { terms: [{ root: 'ع-ر-ف', transliteration: 'ʿ-r-f', meaning: 'knowledge', renderings: [{ en: 'knowledge', count: 29 }], more: { url: STUDY.researchUrl } }] }
      : { total: 78, results: [{ work: { title: 'Gleanings', author: 'Bahá’u’lláh' }, section_index: 'XXIX.1', url: '/models/gleanings/50/',
        source_text: STUDY.passages[0].original, translation: STUDY.passages[0].english, focus: { source: 'عرفان', translation: 'know', source_span: [14, 19], target_span: [100, 104] } }] }),
  });
  it('builds the study: root, renderings, paired passages with full links', async () => {
    const s = await ctaiTerm('عرفان', { fetchImpl: fakeFetch, key: 'k', base: 'https://ctai.info/api/v1' });
    expect(s).toMatchObject({ root: 'ع-ر-ف', total: 78, renderings: [{ en: 'knowledge', count: 29 }], counted: 0 });   // 1 aligned → root fallback
    expect(s.passages[0]).toMatchObject({ ref: 'Gleanings XXIX.1', url: 'https://ctai.info/models/gleanings/50/', rendering: 'know' });
  });
  it('no key → no call', async () => { expect(await ctaiTerm('عرفان', { key: '' })).toBeNull(); });
});

describe('renderings are built by code, by channel', () => {
  it('a chart where the channel draws charts, a line elsewhere', () => {
    expect(renderingsBlock({ ...STUDY, counted: 59 }, channelFor('email', { trusted: true }))).toMatch(/^```chart\n\{"title":"How Shoghi Effendi rendered عرفان in 59 passages","bars":\[\{"label":"knowledge","value":29\}/);
    expect(renderingsBlock(STUDY, channelFor('site-chat'))).toBe('**How Shoghi Effendi rendered عرفان (all words of the root ع-ر-ف):** knowledge (29) · understanding (19) · recognize (11)');
  });
  it('replaces the token, or follows the first paragraph if the writer dropped it', () => {
    expect(placeRenderings('Intro.\n\n[[RENDERINGS]]\n\nMore.', STUDY, channelFor('site-chat'))).toContain('Intro.\n\n**How Shoghi Effendi');
    expect(placeRenderings('Intro.\n\nMore.', STUDY, channelFor('site-chat'))).toMatch(/^Intro\.\n\n\*\*How Shoghi Effendi[^\n]+\n\n\| Original[\s\S]+\n\nMore\.$/);
  });
  it('the model writes tokens; code writes the counts and the passages', () => {
    const how = termFormatHow(STUDY, channelFor('email', { trusted: true }));
    expect(how).toMatch(/\[\[RENDERINGS\]\]/);
    expect(how).toMatch(/\[\[PASSAGES\]\]/);
  });
  it('a phrase window bolds exactly the span', () => {
    expect(phraseWindow('one two three four five WORD six seven eight nine ten', [24, 28], 2)).toBe('… four five **WORD** six seven …');
    expect(phraseWindow('WORD here', [0, 4])).toBe('**WORD** here');
    expect(phraseWindow('no span', null)).toBeNull();
    expect(phraseWindow('gales of divine knowledge , blowing', [16, 25])).toBe('gales of divine **knowledge**, blowing');
  });
  it('the passage table: different renderings first, a list where tables cannot show', () => {
    const t = passagesBlock(STUDY, channelFor('email', { trusted: true }));
    const rows = t.split('\n');
    expect(rows[0]).toBe('| Original | Shoghi Effendi’s English | Source |');
    expect(rows[2]).toContain('**know**');                 // 'know' and 'knowledge' are different renderings: both first
    expect(rows[3]).toContain('**knowledge**');
    expect(rows[2]).toContain('[Gleanings XXIX.1](https://ctai.info/models/gleanings/50/)');
    expect(passagesBlock(STUDY, channelFor('widget-chat'))).toMatch(/^- مقصود/);
  });
  it('passages land after the renderings even if the writer dropped both tokens', () => {
    const out = placeRenderings('Intro.\n\nReading.', STUDY, channelFor('site-chat'));
    expect(out.indexOf('**How Shoghi Effendi')).toBeLessThan(out.indexOf('| Original'));
    expect(out.indexOf('| Original')).toBeLessThan(out.indexOf('Reading.'));
  });
  it('evidence is the paired passages, linked to CTAI', () => {
    expect(termEvidence(STUDY)[0]).toMatchObject({ citation_url: 'https://ctai.info/models/gleanings/50/', via: 'ctai' });
  });
});

describe('Anís answers a word question from CTAI', () => {
  it('skips the ordinary search, uses the study, and places the code-built chart', async () => {
    const calls = { search: 0, craft: null };
    const streamed = [];
    const r = await anisRespond({
      onEvent: (e) => { if (e.type === 'text') streamed.push(e.content); },
      messages: [{ role: 'user', content: 'I would like to understand the meaning of the word Irfan' }],
      direction: { channel: channelFor('email', { trusted: true }) },
      llm: { provider: 'test', model: 'test' },
      deps: {
        plan: async () => ({ shape: 'define' }),
        search: async () => { calls.search++; return { passages: [] }; },
        resolveTerm: async () => 'عرفان',
        ctaiTerm: async () => STUDY,
        companion: async () => ({ append: '', plan: null, offer: false }),
        chooseFormat: async () => ({ id: 'should-not-be-used' }),
        craft: async (args) => { calls.craft = args; args.onChunk('The word is عرفان. [[RENDERINGS]] More. '); return 'The word is عرفان.\n\n[[RENDERINGS]]\n\nSee [the passage](https://ctai.info/models/gleanings/50/) and [all renderings on CTAI](https://ctai.info/research/root/rf-knowledge-know/).'; },
      },
    });
    expect(calls.search).toBe(0);
    expect(calls.craft.direction.format.id).toBe('term_study');
    expect(calls.craft.retrieved_quotes[0].via).toBe('ctai');
    expect(r.reply).toContain('```chart');
    expect(r.reply).toContain('https://ctai.info/research/root/rf-knowledge-know/');   // the concordance link survives the link filter
    expect(r.plan).toMatchObject({ shape: 'define', via: 'ctai' });
    expect(streamed.join('')).not.toContain('[[');                                   // placeholders never streamed
  });
  it('falls back to the ordinary search when CTAI has nothing', async () => {
    let searched = 0;
    await anisRespond({
      messages: [{ role: 'user', content: 'What is the meaning of the word Zzqx?' }],
      llm: { provider: 'test', model: 'test' },
      deps: {
        plan: async () => ({ shape: 'define' }), resolveTerm: async () => null, ctaiTerm: async () => null,
        search: async () => { searched++; return { passages: [] }; },
        companion: async () => ({ append: '', plan: null, offer: false }), chooseFormat: async () => null,
        craft: async () => 'I cannot find that.',
      },
    });
    expect(searched).toBe(1);
  });
});
