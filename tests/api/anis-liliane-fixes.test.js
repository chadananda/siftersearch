// Fixes from the 10-23 reviews of Anís's letters to Liliane (planning/anis-liliane-reviews.md): attached photos are read,
// a pasted original / translate request is never routed to the reading guide or small talk, letters Anís starts are never
// weak, source markers run 1, 2, 3, and reflections go only to watched readers, once per letter.
import { describe, it, expect } from 'vitest';
import { textRequest } from '../../api/lib/assistant/text-request.js';
import { understandReply } from '../../api/lib/assistant/reading.js';
import { readable, withAttachments, attachmentNote } from '../../api/lib/assistant/attachments.js';
import { threadQuestion, weakLetter, subjectTopic, outreachPrompt } from '../../api/lib/assistant/outreach.js';
import { renumberSources } from '../../api/lib/mail-render.js';
import { reflectionDecision, reflectionLines } from '../../worker/mail/reviews.js';
import { RESEARCH_SYSTEM } from '../../api/lib/assistant/researcher.js';

const HER_903 = `can you translate this one or go to jafar to do this
  ۲اهلل هُ و ای پروردگار یاران را کامکار کن و به عبودی ّ تت همدم و دمساز
فرما قلوب را نورانی فرما و وجوه را رحمانی کن تا بنیان محب ّت و مهربانی در
عالم انسانی تأسیس گردد و در مهرپرور گردند شرق دست درنگ سبیل محب ّت پوید به`;

describe('a pasted original or a translate request is a text request', () => {
  it('her Persian prayer + "can you translate" is one; reading commands and short questions are not', () => {
    expect(textRequest(HER_903).request).toBe(true);
    expect(textRequest('Below is the picture of the prayer in farsi. Can you translate this for me to english.').request).toBe(false);   // no passage: a question
    expect(textRequest('can you translate عرفان').request).toBe(true);
    expect(textRequest('next').request).toBe(false);
    expect(textRequest('what happens to the Báb after this?').request).toBe(false);
    expect(textRequest('هو الله').request).toBe(false);
  });
  it('the reading guide never takes it, even with an open reading the model calls a question', async () => {
    const llm = async () => ({ json: { kind: 'question', language: 'en' } });
    expect((await understandReply(HER_903, { active: true, page: 'Dawn-Breakers #5.7', llm })).kind).toBe('none');
    expect((await understandReply('who was Quddús?', { active: true, page: 'Dawn-Breakers #5.7', llm })).kind).toBe('question');
  });
});

describe('attachments are read and joined to the reader\'s message', () => {
  const img = { name: "Munáját-háy-i-Hadrat-i-'Abdu'l-Bahá Prayer 51 pp. 51-52.jpg", type: 'image/jpeg', size: 240000, data: 'AAAA' };
  it('images only, at most four', () => {
    expect(readable([img, { name: 'x.pdf', type: 'application/pdf', data: 'A' }, { ...img, data: '' }])).toEqual([img]);
  });
  it('the transcription and the file name land on the last user turn', async () => {
    const create = async (role, p) => {
      expect(role).toBe('anis-read-attachment');
      expect(p.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
      return { choices: [{ message: { content: 'TEXT:\nهو الله\nای پروردگار یاران را کامکار کن\nWHAT IT IS: two pages of a Persian prayer book, prayer 51' } }] };
    };
    const out = await withAttachments([{ role: 'user', content: 'can you translate this' }], [img, { name: 'a.pdf', type: 'application/pdf', data: 'A' }], { create });
    expect(out[0].content).toMatch(/can you translate this\n\n\[Attached image "Munáját.*Prayer 51 pp\. 51-52\.jpg" — two pages of a Persian prayer book, prayer 51/);
    expect(out[0].content).toMatch(/ای پروردگار یاران را کامکار کن/);
    expect(out[0].content).toMatch(/Attached file "a\.pdf" \(application\/pdf\) — not readable here/);
  });
  it('no attachments: messages unchanged', async () => {
    const m = [{ role: 'user', content: 'hi' }];
    expect(await withAttachments(m, [])).toBe(m);
    expect(attachmentNote([], [])).toBe('');
  });
});

describe('letters Anís starts', () => {
  it('a short follow-up leans on the question before it; the subject names that question', () => {
    const q = threadQuestion([{ role: 'user', content: "What is Irfan in the Baha'i faith?" }, { role: 'assistant', content: '…' },
      { role: 'user', content: 'please give me some example of ILM in the writings' }, { role: 'assistant', content: '…' },
      { role: 'user', content: "than let's use the english word knowledge" }]);
    expect(q).toBe("please give me some example of ILM in the writings — then: than let's use the english word knowledge");
    expect(outreachPrompt(0, q).subject).toBe('Something more on “please give me some example of ILM in the writings”');
    expect(subjectTopic('What does the word ʿirfán mean in the Bahá’í Writings, and how did Shoghi Effendi translate it into English?')).toMatch(/…$/);
  });
  it('a letter that declines or reports a gap is weak (never sent)', () => {
    expect(weakLetter('I am afraid I must begin with an honest answer: looking across the specific works…')).toBe(true);
    expect(weakLetter('Please note that the texts I can search here do not settle a systematic definition')).toBe(true);
    expect(weakLetter('I cannot find a passage that sets an English word beside its original')).toBe(true);
    expect(weakLetter('Here are four passages on ʿilm, with the Persian beside Shoghi Effendi’s English.')).toBe(false);
  });
});

describe('source markers are numbered in order of use', () => {
  it('¹ and ³ become ¹ and ²; the key follows and drops an unused entry', () => {
    const md = '```bilingual\nهو الله\nHe is God.<sup>1</sup>\n\nای پروردگار\nO Lord!<sup>3</sup>\n```\n\n<sup>1</sup> Provisional translation by Stephen Phelps (public domain) · <sup>2</sup> Authorized translation · <sup>3</sup> Provisional translation by Anís';
    expect(renumberSources(md)).toBe('```bilingual\nهو الله\nHe is God.<sup>1</sup>\n\nای پروردگار\nO Lord!<sup>2</sup>\n```\n\n<sup>1</sup> Provisional translation by Stephen Phelps (public domain) · <sup>2</sup> Provisional translation by Anís');
  });
  it('already in order, or no markers: unchanged', () => {
    const md = 'A<sup>1</sup> B<sup>2</sup>\n\n<sup>1</sup> X · <sup>2</sup> Y';
    expect(renumberSources(md)).toBe(md);
    expect(renumberSources('plain letter')).toBe('plain letter');
  });
});

describe('reflections', () => {
  const readers = ['liliane.saberin@gmail.com'];
  const letters = [{ id: 36, verdict: 'wrong', reflection_id: null }, { id: 38, verdict: 'could be better', reflection_id: null },
    { id: 31, verdict: 'good', reflection_id: null }, { id: 720, verdict: 'wrong', reflection_id: 905 }];
  it('only to watched readers, only for letters reviewed as needing one, at most one per letter', () => {
    expect(reflectionDecision({ to: 'Liliane.Saberin@gmail.com', readers, letters, covers: [36, 38] }).ok).toBe(true);
    expect(reflectionDecision({ to: 'someone@else.org', readers, letters, covers: [36] }).reason).toMatch(/only to watched readers/);
    expect(reflectionDecision({ to: readers[0], readers, letters, covers: [31] }).reason).toMatch(/not reviewed as needing one/);
    expect(reflectionDecision({ to: readers[0], readers, letters, covers: [720] }).reason).toMatch(/already has its reflection/);
    expect(reflectionDecision({ to: readers[0], readers, letters, covers: [999] }).reason).toMatch(/not a sent Anís letter/);
    expect(reflectionDecision({ to: readers[0], readers, letters, covers: [] }).ok).toBe(false);
  });
  it('the digest names them', () => {
    expect(reflectionLines([{ to_addr: readers[0], subject: 'Re: irfan', covers: '36, 38' }], 2).join('\n')).toMatch(/Anís reflections .*1 sent · 2 letters awaiting review\n  • to liliane.*Re: irfan \(on letters 36, 38\)/);
    expect(reflectionLines([], 0)).toEqual([]);
  });
});

describe('the researcher finds an original from an older English translation', () => {
  it('renders distinctive clauses into Persian and follows any original wording with find_translation', () => {
    expect(RESEARCH_SYSTEM).toMatch(/FINDING THE ORIGINAL of an English translation/);
    expect(RESEARCH_SYSTEM).toMatch(/ترک … تاجیک/);
    expect(RESEARCH_SYSTEM).toMatch(/call find_translation with that exact original line/);
    expect(RESEARCH_SYSTEM).toMatch(/ع ع\) is 'Abdu'l-Bahá's signature/);
  });
});
