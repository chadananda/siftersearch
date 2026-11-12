// Code-built lookup answers pass the light writer (Chad 11-12: the Maxwell-birth reply "shows no comprehension of the question").
import { describe, it, expect } from 'vitest';
import { finishLookup } from '../../api/lib/assistant/lookup-finish.js';

const messages = [{ role: 'user', content: 'Can you try again to see if the maxwell birth is mentioned in Star of the West?' }];
const draft = 'I searched all of *Star of the West* for “Can you try again”: the words are not in it. [x](https://oceanlibrary.com/a)';
const did = 'searched Star of the West for "Can you try again"';

describe('lookup finish', () => {
  it('MISS → not ok, with the reason (the turn goes to Unmatched)', async () => {
    const r = await finishLookup({ messages, draft, did, complete: async () => ({ content: 'MISS: should search the birth of a Maxwell daughter in 1910' }) });
    expect(r).toEqual({ ok: false, why: 'should search the birth of a Maxwell daughter in 1910' });
  });
  it('ANSWER + reply → the writer\'s reply; a link the data lacks → the draft', async () => {
    expect((await finishLookup({ messages, draft, did, complete: async () => ({ content: 'ANSWER\nYes — [here](https://oceanlibrary.com/a).' }) })).reply).toBe('Yes — [here](https://oceanlibrary.com/a).');
    expect((await finishLookup({ messages, draft, did, complete: async () => ({ content: 'ANSWER\nSee [here](https://evil.example/b).' }) })).reply).toBe(draft);
  });
  it('a writer failure or a big table keeps the code draft whole', async () => {
    expect((await finishLookup({ messages, draft, did, complete: async () => { throw new Error('down'); } })).reply).toBe(draft);
    const big = '| # | x |\n|---|---|\n' + '| 1 | y |\n'.repeat(800);
    let asked = '';
    const r = await finishLookup({ messages, draft: big, did, complete: async (m) => { asked = m[0].content; return { content: 'ANSWER' }; } });
    expect(r.reply).toBe(big); expect(asked).toContain('nothing else');
  });
});

describe('finishLookup check (a book card)', () => {
  it('asks the card question and returns the verdict without rewriting', async () => {
    let seen = '';
    const complete = async ([m]) => { seen = m.content; return { content: 'MISS: look inside for duty (dharma)' }; };
    const r = await finishLookup({ messages: [{ role: 'user', content: 'What does the Gita teach about duty?' }], check: true, did: 'The book *Gita* was found by its title', draft: 'card', complete });
    expect(seen).toMatch(/ONLY that book's card/);
    expect(r).toEqual({ ok: false, why: 'look inside for duty (dharma)' });
    const ok = await finishLookup({ messages: [], check: true, did: 'x', draft: 'card', complete: async () => ({ content: 'ANSWER' }) });
    expect(ok).toEqual({ ok: true, reply: 'card' });
  });
});
