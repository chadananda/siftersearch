// Anís's daily digest of CONVERSATIONS (Chad 10-19, like Jafar's): flagged replies first, every Q&A as the reader saw it.
import { describe, it, expect } from 'vitest';
import { digestHtml, needsLook } from '../../worker/mail/digest-html.js';

const bad = { state: 'done', answered: 'no', why: 'quote → original', problems: [{ kind: 'missed-key-passage', detail: 'no Arabic looked up' }], summary: 'a bare refusal' };
const fine = { state: 'done', answered: 'fully', problems: [] };
const data = { hours: 24, people: [
  { person: { name: 'Lal', email: 'lal@example.com' }, rounds: [{ at: '2026-10-19 02:03:17', channel: 'email', status: 'answered', question: 'What is the original word for "chamber"?', reply: 'I could not find it.', audit: bad }] },
  { person: { name: 'web visitor', email: null }, rounds: [{ at: '2026-10-19 10:00:00', channel: 'widget-chat', status: 'answered', question: 'Who was Táhirih?', reply: '**Ṭáhirih** was a poet…', audit: fine }] },
] };

describe('Anís digest', () => {
  it('counts, flags and shows every question and answer; flagged first with the audit\'s reasons', () => {
    const d = digestHtml(data, { mailHtml: '<pre>mail</pre>', date: '2026-10-19' });
    expect(d).toMatchObject({ questions: 2, flagged: 1 });
    expect(d.html).toMatch(/Needs a look[\s\S]*chamber[\s\S]*no Arabic looked up[\s\S]*Who asked[\s\S]*Táhirih/);
    expect(d.html).toMatch(/<strong style="[^"]*">Ṭáhirih<\/strong>/);   // the answer rendered as the reader saw it
    expect(d.html).toContain('<pre>mail</pre>');
    expect(needsLook({ audit: fine })).toBe(false);
    expect(needsLook({ audit: { state: 'pending' } })).toBe(false);
  });
  it('a quiet day says so', () => expect(digestHtml({ hours: 24, people: [] }).html).toMatch(/No questions in this window/));
});

describe('Anís letters read like Jafar\'s (Chad 10-19)', () => {
  it('a quotation is text, its link on the work; headings and bold styled', async () => {
    const { bodyHtml, quotesNotLinks } = await import('../../worker/mail/letter.js');
    expect(quotesNotLinks('["A person hath full jurisdiction over his property."](https://x.org/a#p1) — *The Kitáb-i-Aqdas*'))
      .toBe('“A person hath full jurisdiction over his property.” — [*The Kitáb-i-Aqdas*](https://x.org/a#p1)');
    expect(quotesNotLinks('He said ["There is neither equality here nor benevolence."](https://x.org/b) and more.'))
      .toBe('He said “There is neither equality here nor benevolence.” ([source](https://x.org/b)) and more.');
    const h = bodyHtml('### **Property Rights**\n\nText with **bold**.\n\n- one\n- two');
    expect(h).toMatch(/<h3 dir="auto" style="margin:22px 0 8px;font-size:18px/);
    expect(h).toMatch(/<strong style="color:/);
    expect(h).toMatch(/<ul style="margin:6px 0 14px/);
  });
});
