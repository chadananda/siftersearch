// Translations use what exists (Chad 10-23: "when doing a translation, please use CTAI or use existing translation text to
// inform the translation"): the researcher looks up an existing English before translating, shows it whole and says what
// kind it is; the writer gets it whole and marked; the email frame asks for a ```bilingual block with per-row sources.
import { describe, it, expect } from 'vitest';
import { research, translationLabel, letterVariants, RESEARCH_SYSTEM } from '../../api/lib/assistant/researcher.js';
import { anisUserPayload } from '../../api/lib/assistant/prompt.js';
import { CHANNELS } from '../../api/lib/assistant/channels.js';
import { markdownHtml } from '../../api/lib/mail-render.js';

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const PRAYER = 'ای پروردگار یاران را کامکار کن و به عبودیتت همدم و دمساز فرما';
const LONG_EN = `O Lord! Make Thy loved ones successful and cause them to be intimate companions in Thy servitude. ${'Make their hearts luminous and their faces merciful. '.repeat(30)}May the East embrace the West.`;
const PHELPS = { id: 33303928, text: LONG_EN, title: 'O Lord! Make Thy loved ones victorious… (provisional translation)', author: '‘Abdu’l-Bahá',
  source_url: 'https://portlandiator.github.io/PI_browser/?id=AB05355', translation: translationLabel('Stephen Phelps', 'provisional-phelps') };

describe('labels', () => {
  it('says what kind of translation a text is', () => {
    expect(translationLabel('Shoghi Effendi')).toBe('authorized — Shoghi Effendi');
    expect(translationLabel(null, 'shoghi-effendi')).toBe('authorized — Shoghi Effendi');
    expect(translationLabel('Universal House of Justice')).toBe('authorized — Bahá’í World Centre');
    expect(translationLabel(null, 'provisional-phelps')).toBe('provisional — Stephen Phelps (public domain)');
    expect(translationLabel('Joshua Hall')).toBe('translation by Joshua Hall');
  });
  it('tries both spellings of ی/ي and ک/ك', () => {
    expect(letterVariants('یاران کامکار')).toEqual(['یاران کامکار', 'ياران كامكار']);
  });
});

describe('the researcher looks for an existing translation first', () => {
  it('the system prompt orders it: find_translation, then source_of with a draft line, word_study before translating fresh', () => {
    expect(RESEARCH_SYSTEM).toMatch(/FIRST look for an existing translation — find_translation/);
    expect(RESEARCH_SYSTEM).toMatch(/provisional translation by Anís/);
  });
  it('find_translation shows the whole existing translation, labelled', async () => {
    const seen = [];
    const replies = [{ tool_calls: [call('a', 'find_translation', { original: PRAYER })] }, { content: 'BRIEF:\nReaching for: the prayer line by line\n- Phelps covers every line: P1\nKEEP: P1' }];
    const create = async (p) => { seen.push(p); return { choices: [{ message: replies.shift() }] }; };
    const r = await research({ messages: [{ role: 'user', content: `Please translate: ${PRAYER}` }], create, tools: { translation: async () => [PHELPS] } });
    const shown = String(seen[1].messages.at(-1).content);
    expect(shown).toMatch(/EXISTING TRANSLATION: provisional — Stephen Phelps \(public domain\)/);
    expect(shown).toContain('May the East embrace the West.');   // not clipped at 900
    expect(r.passages[0].translation).toMatch(/Phelps/);
  });
  it('nothing linked → it says how to look further, never "no translation exists"', async () => {
    const replies = [{ tool_calls: [call('a', 'find_translation', { original: PRAYER })] }, { content: 'BRIEF:\nReaching for: x\nKEEP:' }];
    const seen = [];
    const create = async (p) => { seen.push(p); return { choices: [{ message: replies.shift() }] }; };
    await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { translation: async () => [] } });
    expect(String(seen[1].messages.at(-1).content)).toMatch(/call source_of with it/);
  });
});

describe('the writer', () => {
  it('gets an existing translation whole and marked "quote it verbatim"; other passages stay short', () => {
    const u = anisUserPayload({ question: 'q', passages: [
      { source_title: PHELPS.title, citation_url: PHELPS.source_url, text: LONG_EN, translation: PHELPS.translation },
      { source_title: 'Other', text: 'x'.repeat(2000) }] });
    expect(u).toMatch(/EXISTING TRANSLATION \(provisional — Stephen Phelps \(public domain\)\) — quote it verbatim/);
    expect(u).toContain('May the East embrace the West.');
    expect(u).not.toContain('x'.repeat(701));
  });
  it('the email frame asks for a ```bilingual block with a source marker per line — and that block renders as pairs', () => {
    expect(CHANNELS.email.frame).toMatch(/```bilingual/);
    expect(CHANNELS.email.frame).toMatch(/<sup>1<\/sup>/);
    const h = markdownHtml('```bilingual\nهو الله\nHe is God.<sup>2</sup>\n```\n\n<sup>2</sup> Provisional translation by Stephen Phelps (public domain)');
    expect(h).toMatch(/<td class="em-bil-t" dir="ltr"[^>]*>He is God\.<sup>2<\/sup><\/td>/);
  });
});
