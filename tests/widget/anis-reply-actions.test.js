// Anís reply actions (src/widget/reply-actions.js): clipboard markdown + HTML, the reply's sources as a reference list, rounds, share turns, retry/edit rewind.
import { describe, it, expect } from 'vitest';
import { plainReply, replyHtml, replySources, referenceList, questionIndex, roundOf, answerTurns, rewind } from '../../src/widget/reply-actions.js';

const REPLY = 'Prayer is **communion** with God ([Prayers and Meditations](https://oceanlibrary.com/pm#p3)).\n\n<!-- widget:w1 -->\n> The wings of the soul.\n\n\n{{quote P9}}\n- one *thing*\n- two';

describe('plainReply', () => {
  it('drops widget markers and unexpanded templates, keeps the links and the fallback text', () => {
    const t = plainReply(REPLY);
    expect(t).not.toMatch(/widget:|\{\{/);
    expect(t).toContain('[Prayers and Meditations](https://oceanlibrary.com/pm#p3)');
    expect(t).toContain('> The wings of the soul.');
    expect(t).not.toMatch(/\n{3}/);
  });
});

describe('replyHtml', () => {
  it('paragraphs, bold, italics, links, quotes and lists as clean html', () => {
    const h = replyHtml(REPLY);
    expect(h).toContain('<strong>communion</strong>');
    expect(h).toContain('<a href="https://oceanlibrary.com/pm#p3">Prayers and Meditations</a>');
    expect(h).toContain('<blockquote><p>The wings of the soul.</p></blockquote>');
    expect(h).toContain('<ul><li>one <em>thing</em></li><li>two</li></ul>');
    expect(h).not.toMatch(/class=|style=/);
  });
  it('escapes html in the reply and never makes a javascript: link', () => {
    const h = replyHtml('<script>x</script> [bad](javascript:alert(1))');
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('href="javascript');
  });
  it('headings, numbered lists and pipe tables', () => {
    const h = replyHtml('## Sources\n1. first\n2. second\n\n| A | B |\n|---|---|\n| 1 | **2** |');
    expect(h).toContain('<h3>Sources</h3>');
    expect(h).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(h).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table>');
  });
});

describe('replySources + referenceList', () => {
  const m = { role: 'assistant', content: 'See [*The Kitáb-i-Íqán*](https://oceanlibrary.com/iqan#12) and [again](https://oceanlibrary.com/iqan#40).',
    citations: [{ title: 'Gleanings', author: 'Bahá’u’lláh', url: 'https://oceanlibrary.com/gleanings' }, { title: 'No url' }],
    talks: [{ title: 'On Prayer', speaker: 'H. M. Balyuzi', url: 'https://siftersearch.com/media/on-prayer' }] };
  it('inline links first, one per page, then citations and talks; entries without a url skipped', () => {
    expect(replySources(m)).toEqual([
      { title: 'The Kitáb-i-Íqán', url: 'https://oceanlibrary.com/iqan#12' },
      { title: 'Gleanings', url: 'https://oceanlibrary.com/gleanings', author: 'Bahá’u’lláh' },
      { title: 'On Prayer', url: 'https://siftersearch.com/media/on-prayer', author: 'H. M. Balyuzi' },
    ]);
  });
  it('numbered plain list; empty when nothing is linked', () => {
    expect(referenceList(replySources(m)).split('\n')[1]).toBe('2. Bahá’u’lláh, Gleanings — https://oceanlibrary.com/gleanings');
    expect(referenceList(replySources({ content: 'no links' }))).toBe('');
  });
});

const MSGS = [
  { role: 'assistant', content: 'Welcome.' },
  { role: 'user', content: 'What is prayer?' },
  { role: 'assistant', content: 'Communion.' },
  { role: 'user', content: 'And fasting?' },
  { role: 'assistant', content: 'Detachment.' },
];
describe('questions, rounds, share, rewind', () => {
  it('questionIndex finds the question a reply answers; the greeting has none', () => {
    expect(questionIndex(MSGS, 4)).toBe(3);
    expect(questionIndex(MSGS, 2)).toBe(1);
    expect(questionIndex(MSGS, 0)).toBe(-1);
  });
  it('roundOf counts questions up to the reply', () => {
    expect(roundOf(MSGS, 0)).toBe(0);
    expect(roundOf(MSGS, 2)).toBe(1);
    expect(roundOf(MSGS, 4)).toBe(2);
  });
  it('answerTurns = that one question + answer', () => {
    expect(answerTurns(MSGS, 2)).toEqual([{ role: 'user', content: 'What is prayer?' }, { role: 'assistant', content: 'Communion.' }]);
    expect(answerTurns(MSGS, 0)).toBeNull();
  });
  it('rewind: retry a reply re-asks its question; edit a question re-asks the new text; history before it kept', () => {
    expect(rewind(MSGS, 4)).toEqual({ keep: MSGS.slice(0, 3), ask: 'And fasting?' });
    expect(rewind(MSGS, 1, '  What is obligatory prayer? ')).toEqual({ keep: MSGS.slice(0, 1), ask: 'What is obligatory prayer?' });
    expect(rewind(MSGS, 1, '   ')).toBeNull();
    expect(rewind(MSGS, 0)).toBeNull();
  });
});
