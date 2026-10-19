// Anís letters: outreach prompts by step, Markdown → email HTML, signed review links.
import { describe, it, expect } from 'vitest';
import { outreachPrompt, CAPABILITIES } from '../../api/lib/assistant/outreach.js';
import { toHtml, reviewUrl, tidy, fillTemplate, replySubject } from '../../worker/mail/drafting.js';

describe('outreach prompts', () => {
  it('steps 0–1 show a capability on their subject; later steps follow up', () => {
    const q = 'What does Bahá’u’lláh say about justice?';
    expect(outreachPrompt(0, q)).toMatchObject({ capability: CAPABILITIES[0].id });
    expect(outreachPrompt(0, q).question).toContain(q);
    expect(outreachPrompt(1, q).capability).toBe(CAPABILITIES[1].id);
    expect(outreachPrompt(2, q)).toMatchObject({ capability: 'follow-up' });
    expect(outreachPrompt(9, q).subject).toMatch(/^Still thinking about/);
  });
  it('a long question is shortened in the subject', () => {
    expect(outreachPrompt(2, 'x'.repeat(200)).subject.length).toBeLessThan(90);
  });
});

describe('letters', () => {
  it('Markdown becomes email HTML', () => {
    const h = toHtml('Dear friend,\n\n> a passage\n\n[Source](https://oceanlibrary.com/x)');
    expect(h).toMatch(/<blockquote style="[^"]+">/);
    expect(h).toMatch(/<a style="[^"]+" href="https:\/\/oceanlibrary.com\/x">Source<\/a>/);
    expect(h).toContain('Ocean Study Companion AI');
  });
  it('footnote markers copied from passages are removed', () => {
    expect(tidy('Set it then before thine eyes.[^14]\n\nWarmly')).toBe('Set it then before thine eyes.\n\nWarmly');
  });
  it('review links are signed per draft', async () => {
    const a = await reviewUrl(12, 'k'), b = await reviewUrl(13, 'k'), c = await reviewUrl(12, 'other');
    expect(a).toMatch(/\/_mail\/review\?t=12\.[a-f0-9]{32}$/);
    expect(a).not.toBe(c);
    expect(b.split('.')[1]).not.toBe(a.split('.')[1]);
  });
});

describe('templates', () => {
  it('greets by name when known', () => {
    expect(fillTemplate('{{greeting}}\n\nI am Anís.', { name: 'Leila' })).toBe('Hello Leila,\n\nI am Anís.');
    expect(fillTemplate('{{greeting}}', {})).toBe('Hello,');
  });
  it('says who asked Anís to write, when someone did', () => {
    expect(fillTemplate("{{intro}}I'm Anís.", { asked_by: 'Chad' })).toBe("Chad asked me to reach out and introduce myself. I'm Anís.");
    expect(fillTemplate("{{intro}}I'm Anís.", {})).toBe("I'm Anís.");
  });
});

describe('signature', async () => {
  const { stripSignOff, composeLetter } = await import('../../worker/mail/letter.js');
  it("replaces the writer's own sign-off name, keeps the closing", () => {
    expect(stripSignOff('Thanks.\n\nWarmly,\nAnis')).toBe('Thanks.\n\nWarmly,');
    expect(stripSignOff('Warmly,\nAnís\nOcean AI Research Assistant\n')).toBe('Warmly,');
    expect(stripSignOff('— Anís')).toBe('');
    expect(stripSignOff('Anís wrote of this before.\nMore.')).toBe('Anís wrote of this before.\nMore.');
  });
  it('every letter: body, the signature, then the pause link', () => {
    const { text, html } = composeLetter('Hello.\n\nWarmly,\nAnis', 'https://x/p');
    expect(text).toBe('Hello.\n\nWarmly,\n\n— Anís\nOcean Study Companion AI\n\n—\nRather not hear from me? https://x/p');
    expect(html).toMatch(/font-style:italic;font-size:24px[^>]*>— Anís<\/p>/);
    expect(html.indexOf('Ocean Study Companion AI')).toBeLessThan(html.indexOf('Rather not hear'));
  });
});

describe('support letters', async () => {
  const { answerBody } = await import('../../worker/mail/letter.js');
  it("sets an Anís letter's middle inside another: salutation and closing removed", () => {
    expect(answerBody('Dear friend,\n\nThe passage reads…\n\nI hope this helps.\n\nWarmly,\nAnis')).toBe('The passage reads…\n\nI hope this helps.');
    expect(answerBody('The passage reads…')).toBe('The passage reads…');
    expect(answerBody('Dear Leila,\nYes.\nWith warm regards,\n— Anís')).toBe('Yes.');
  });
});

describe('tables and charts in letters', async () => {
  const { bodyHtml, plainText, composeLetter } = await import('../../worker/mail/letter.js');
  const chart = '```chart\n{"title":"Renderings of عرفان","bars":[{"label":"knowledge","value":29},{"label":"understanding","value":19},{"label":"recognize","value":11}]}\n```';
  it('a chart block becomes an HTML bar chart scaled to the largest value', () => {
    const h = bodyHtml(`Here:\n\n${chart}\n\nAfter.`);
    expect(h).toContain('<caption');
    expect(h).toContain('Renderings of عرفان');
    expect(h).toMatch(/width:100%"><\/div>/);            // the largest bar is full width
    expect(h).toMatch(/width:66%"><\/div>/);             // 19/29
    expect(h).not.toContain('```');
    expect(h).toContain('After.');
    expect(h).not.toMatch(/<td[^>]*style="[^"]*"[^>]*style=/);   // no cell styled twice
  });
  it('the plain-text letter draws the same chart with block characters', () => {
    const t = plainText(chart);
    expect(t.split('\n')[1]).toMatch(/^knowledge\s+█{20} 29$/);
    expect(composeLetter(chart, 'https://x/p').text).not.toContain('"bars"');
  });
  it('a malformed chart block is left as written', () => {
    expect(bodyHtml('```chart\nnot json\n```')).toContain('not json');
  });
  it('tables are styled and right-to-left cells follow their text', () => {
    const h = bodyHtml('| Original | English |\n|---|---|\n| عرفان | knowledge |');
    expect(h).toMatch(/<table cellpadding="0"[^>]*border-collapse/);
    expect(h).toMatch(/<td dir="auto" style="padding/);
  });
});

// a reply answers someone who wrote to Anís — no unsubscribe footer (Chad 10-13); letters Anís starts keep it
import { composeLetter as compose2 } from '../../worker/mail/letter.js';
describe('reply letters carry no pause footer', () => {
  it('no pauseUrl → no footer in text or html', () => {
    const { text, html } = compose2('Hello.', null);
    expect(text).not.toMatch(/Rather not hear/);
    expect(html).not.toMatch(/Rather not hear/);
  });
});

describe('replySubject — a reading stays in its thread', () => {
  it('a reply inside a reading thread keeps Re: <their subject>', () => {
    expect(replySubject('Re: [Reading] Dawn-Breakers #Intro.3 - Townshend', '[📖 Reading] Dawn-Breakers #Intro.4, Next')).toBe('Re: [Reading] Dawn-Breakers #Intro.3 - Townshend');
    expect(replySubject('[📖 Reading] Dawn-Breakers #1.1, Start', '[📖 Reading] Dawn-Breakers #1.2, Next')).toBe('Re: [📖 Reading] Dawn-Breakers #1.1, Start');
  });
  it('the reply that opens a reading takes the descriptive subject; ordinary replies are Re:', () => {
    expect(replySubject('study help', '[📖 Reading] Dawn-Breakers, where shall we begin?')).toBe('[📖 Reading] Dawn-Breakers, where shall we begin?');
    expect(replySubject('a question', null)).toBe('Re: a question');
  });
});

describe('reply drafts are tower JOBS (docs/architecture/continuous-deploy.md)', () => {
  const fakeDb = () => {
    const runs = [];
    return { runs, prepare: (sql) => ({ bind: (...a) => ({ run: async () => { runs.push([sql, a]); return { meta: { changes: 1 } }; }, all: async () => ({ results: [] }), first: async () => null }) }) };
  };
  const m = (o) => ({ id: 702, thread_key: 't', from_addr: 'a@b.c', status: 'new', error: null, ...o });
  it('a new message starts a job and waits; a running job waits; a done job yields its reply', async () => {
    const { draftJob } = await import('../../worker/mail/drafting.js');
    const calls = [];
    const call = (status, result) => async (env, path, body) => { calls.push([path, body?.job ?? null]); return path.startsWith('/draft/job/') ? { status, result } : { status: 'running' }; };
    expect(await draftJob({}, fakeDb(), m(), { call: call() })).toBeNull();
    expect(calls).toEqual([['/draft', 'mail-702']]);
    calls.length = 0;
    expect(await draftJob({}, fakeDb(), m({ status: 'drafting' }), { call: call('running') })).toBeNull();
    expect(calls).toEqual([['/draft/job/mail-702', null]]);
    expect(await draftJob({}, fakeDb(), m({ status: 'drafting' }), { call: call('done', { reply: 'Dear Lal' }) })).toEqual({ reply: 'Dear Lal' });
  });
  it('unknown (never started) restarts without counting; failed counts, and after 3 the message is failed', async () => {
    const { draftJob } = await import('../../worker/mail/drafting.js');
    const call = (status) => async (env, path) => (path.startsWith('/draft/job/') ? { status, error: 'boom' } : { status: 'running' });
    const db1 = fakeDb();
    await draftJob({}, db1, m({ status: 'drafting' }), { call: call('unknown') });
    expect(db1.runs.length).toBe(0);
    const db2 = fakeDb();
    await draftJob({}, db2, m({ status: 'drafting', error: 'attempt 1: x' }), { call: call('failed') });
    expect(db2.runs[0][1][0]).toMatch(/^attempt 2/);
    const db3 = fakeDb();
    await draftJob({}, db3, m({ status: 'drafting', error: 'attempt 3: x' }), { call: call('lost') });
    expect(db3.runs[0][0]).toMatch(/status = 'failed'/);
  });
});
