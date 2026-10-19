// The researcher (Chad 10-19: "too determinative"): a model plans the lookups with the library's tools and ends with a
// brief; its passages become the reply's evidence. Fake model and tools — the loop, the refs, KEEP and the switch.
import { describe, it, expect } from 'vitest';
import { research, parseBrief } from '../../api/lib/assistant/researcher.js';
import { researchEnabled } from '../../api/lib/assistant/respond.js';

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const GLEANINGS = { id: 606, text: 'Whoso reciteth, in the privacy of his chamber, the verses revealed by God…', title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', source_url: 'https://oceanlibrary.com/g#606', document_id: 20783, paragraph_index: 605 };
const ARABIC = { id: 9001, text: 'من قرأ آيات الله من بيته وحده', title: 'Muntakhabát (original)', author: 'Bahá’u’lláh', source_url: 'https://oceanoflights.org/x', document_id: 4614, paragraph_index: 3, language: 'ar' };

describe('researcher', () => {
  it('runs the tools the model asks for, numbers what it finds, and keeps only what the brief keeps', async () => {
    const seen = [];
    const replies = [
      { tool_calls: [call('a', 'search_library', { query: 'privacy of his chamber verses revealed by God' })] },
      { tool_calls: [call('b', 'find_original', { english: 'Whoso reciteth, in the privacy of his chamber' })] },
      { content: 'BRIEF:\nReaching for: the Arabic behind "chamber"\n- "chamber" renders min baytihi waḥdahu, "from his house, alone": P1, P2\n- other words: ghurfa, ḥujra, khalwa [own]\nThread to pull: where ḥujra appears\nKEEP: P1, P2' },
    ];
    const create = async (params) => { seen.push(params); return { choices: [{ message: replies.shift() }] }; };
    const tools = { search: async () => [GLEANINGS], original: async () => [ARABIC, GLEANINGS] };
    const r = await research({ messages: [{ role: 'user', content: 'Would fi baytihi be used for chamber?' }], create, tools });
    expect(r.steps.map((s) => s.tool)).toEqual(['search_library', 'find_original']);
    expect(r.passages.map((p) => p.id)).toEqual([606, 9001]);   // the repeated Gleanings passage keeps its P1
    expect(r.brief).toMatch(/ghurfa, ḥujra, khalwa \[own\]/);
    expect(seen[0].tools.map((t) => t.function.name)).toContain('word_study');
    expect(String(seen[1].messages.at(-1).content)).toMatch(/\[P1\] Gleanings/);
  });
  it('the last round offers no tools, so it always ends with a brief', async () => {
    let n = 0;
    const create = async (params) => ({ choices: [{ message: params.tools ? { tool_calls: [call(`c${n++}`, 'search_library', { query: 'x' })] } : { content: 'BRIEF:\nReaching for: x\n- y [own]\nKEEP:' } }] });
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create, tools: { search: async () => [] }, maxRounds: 3 });
    expect(r.steps).toHaveLength(2);
    expect(r.brief).toMatch(/Reaching for: x/);
  });
  it('parses the brief and its KEEP line', () => {
    expect(parseBrief('BRIEF:\nReaching for: a\n- b: P2\nKEEP: P2, w1')).toEqual({ brief: 'Reaching for: a\n- b: P2', keep: ['P2', 'W1'] });
  });
});

describe('the switch', () => {
  it('ANIS_RESEARCH names the channels; off by default', () => {
    expect(researchEnabled({ id: 'email' }, 'email')).toBe(true);
    expect(researchEnabled({ id: 'widget-chat' }, 'email')).toBe(false);
    expect(researchEnabled({ id: 'widget-chat' }, 'all')).toBe(true);
    expect(researchEnabled({ id: 'email' }, undefined)).toBe(false);
  });
});

describe('brief markers', () => {
  it('never reach the reader', async () => {
    const { dropBriefMarkers } = await import('../../api/lib/assistant/lint.js');
    expect(dropBriefMarkers('Bayt means house [own]. It is rendered "chamber" (P1, P2) and so on [W1].')).toBe('Bayt means house. It is rendered "chamber" and so on.');
  });
});
