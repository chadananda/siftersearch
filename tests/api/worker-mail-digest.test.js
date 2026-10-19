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
    expect(d.html).toContain('<strong>Ṭáhirih</strong>');   // the answer rendered as the reader saw it
    expect(d.html).toContain('<pre>mail</pre>');
    expect(needsLook({ audit: fine })).toBe(false);
    expect(needsLook({ audit: { state: 'pending' } })).toBe(false);
  });
  it('a quiet day says so', () => expect(digestHtml({ hours: 24, people: [] }).html).toMatch(/No questions in this window/));
});
