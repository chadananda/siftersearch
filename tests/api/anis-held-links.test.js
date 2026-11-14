// 11-14 Íqán divines (conversation 73b1d410…, round 4): the reply's Íqán ?paraId=para_10 and Dawn-Breakers para_12 / para_23 / para_24
// were typed by the agent — no tool returned them (the real paragraphs: para_1304 / para_1305). Links come from held passages only.
import { describe, it, expect } from 'vitest';
import { keepHeldLinks } from '../../api/lib/assistant/held-links.js';
import { agentAnswer } from '../../api/lib/assistant/agent.js';

const DB = 'https://oceanlibrary.com/dawn-breakers_nabil/';
const BROTHER = { id: 23666912, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam', document_id: 7, text: 'Mullá Báqir, brother of Mullá Mihdí, both of whom were men of considerable learning, to whose great attainments Bahá’u’lláh testifies in the “Kitáb-i-Íqán.”',
  source_url: `${DB}?paraId=para_1305&selectionString=dawn-breakers-prod-version_en_12y.0~dawn-breakers-prod-version_en_12y.73` };
const IQAN = { id: 20787361, title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh', document_id: 3, text: 'Among them was Mullá Ḥusayn …',
  source_url: 'https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_260&selectionString=kitab-i-iqan-prod-version_en_a0.0~kitab-i-iqan-prod-version_en_a0.72' };

describe('links come from held passages', () => {
  it('a typed paragraph id → the book when the library holds it, the words alone when not; a held paragraph stays', () => {
    const t = `([The Kitáb-i-Íqán](https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_10)); ([The Dawn-Breakers](${DB}?paraId=para_24)); `
      + `([Dawn-Breakers](${BROTHER.source_url})); ([Gleanings](https://oceanlibrary.com/gleanings_bahaullah/?paraId=para_3))`;
    const r = keepHeldLinks(t, { passages: [BROTHER, IQAN] });
    expect(r.text).not.toMatch(/para_10\b|para_24\b|para_3\b/);
    expect(r.text).toContain('[The Kitáb-i-Íqán](https://oceanlibrary.com/kitab-i-iqan_bahaullah/)');
    expect(r.text).toContain(`[The Dawn-Breakers](${DB})`);
    expect(r.text).toContain(BROTHER.source_url);
    expect(r.text).toContain('(Gleanings)');
    expect(r.dropped).toBe(3);
  });
  it('an earlier reply\'s link counts when code made it (a selectionString), not when it was typed', () => {
    const prior = [{ role: 'assistant', content: `([Dawn-Breakers](${BROTHER.source_url})) ([Íqán](https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_10))` }];
    const r = keepHeldLinks(`[a](${DB}?paraId=para_1305) [b](https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_10)`, { prior });
    expect(r.text).toContain(`${DB}?paraId=para_1305`);
    expect(r.text).not.toContain('para_10)');
  });
  it('the agent\'s reply: a typed paragraph link is gone, the ref\'s link is the passage\'s own', async () => {
    let n = 0;
    const create = async () => (n++ === 0 ? { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'fused_search', arguments: '{"query":"Mullá Báqir brother of Mullá Mihdí"}' } }] } }] }
      : { choices: [{ message: { content: 'Row 11 is Mullá Mihdí’s brother, martyred at Ṭabarsí [[P1]]; the Íqán names him ([The Kitáb-i-Íqán](https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_10)) and so does the history ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_12)).' } }] });
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Who is Mullá Báqir, number 11 in the Íqán?' }], tools: { search: async () => [BROTHER, IQAN] }, create });
    expect(r.reply).not.toMatch(/para_10\b|para_12\b/);
    expect(r.reply).toMatch(/paraId=para_(?:260|1305)&selectionString=/);   // the ref's own (tier order decides which passage is P1)
  });
  it('the prompt: a name is evidence, the book\'s own notes first, never a typed link', async () => {
    const seen = [];
    await agentAnswer({ messages: [{ role: 'user', content: 'Who is Mullá Báqir in the Íqán?' }], tools: { search: async () => [] }, create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'x' } }] }; } });
    const sys = seen[0].messages[0].content;
    expect(sys).toMatch(/WHO A BOOK MEANS\. A name is evidence, never identity/);
    expect(sys).toMatch(/search that book first \(search_in_work/);
    expect(sys).toMatch(/never type a library address or a paragraph id/);
  });
});
