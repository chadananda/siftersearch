// Follow-up pills are shown only when research backs them; a click on one resolves to its pinned question (no restatement).
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { backPills, pinnedQuestion } from '../../worker/anis/pills.js';

const mkEnv = () => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0016_anis_pills.sql', 'utf8'));
  const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql); return { first: async () => s.get(...a) ?? null, run: async () => s.run(...a) }; } });
  return { ANIS_DB: { prepare: stmt } };
};
const messages = [{ role: 'user', content: 'How do Bahá’ís pray?' }], reply = 'Prayer is **communion** with God.<!-- widget:quote-1 -->';

describe('backPills', () => {
  it('held → kept; missed → researched and captured; nothing found → dropped; the click resolves to the pinned question', async () => {
    const env = mkEnv(), captured = [];
    const deps = {
      restate: async (msgs) => ({ 'When should I pray?': 'When should Bahá’ís pray?', 'Who wrote the prayers?': 'Who wrote the Bahá’í prayers?', 'Can I sing them?': 'Can Bahá’í prayers be sung?' })[msgs.at(-1).content],
      lookup: async (q) => (q === 'When should Bahá’ís pray?' ? { similarity: 1, set: { id: 7, question: q } } : null),
      research: async (q) => (q === 'Who wrote the Bahá’í prayers?' ? [{ id: 1, text: 'x' }] : []),
      capture: async (q, ps) => { captured.push([q, ps.length]); return { id: 8, question: q }; },
    };
    const kept = await backPills(env, { items: ['When should I pray?', 'Who wrote the prayers?', 'Can I sing them?'], messages, reply }, deps);
    expect(kept).toEqual(['When should I pray?', 'Who wrote the prayers?']);
    expect(captured).toEqual([['Who wrote the Bahá’í prayers?', 1]]);
    // the reader clicks a pill: the widget sends the reply as shown (markers and spacing may differ) + the pill
    const click = [...messages, { role: 'assistant', content: 'Prayer is  **communion** with God.' }, { role: 'user', content: 'Who wrote the prayers?' }];
    expect(await pinnedQuestion(env, click)).toBe('Who wrote the Bahá’í prayers?');
    expect(await pinnedQuestion(env, [...click.slice(0, -1), { role: 'user', content: 'something else' }])).toBeNull();
  });
});
