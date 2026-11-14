// Edge research store: D1 (better-sqlite3 :memory: running the real migration), fake Vectorize (cosine) + fake AI (table vectors).
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lookup, capture, markStale, logQuestion, saveTurn, loadConversation, questionHash, outcomeOf, MAX_PASSAGES } from '../../worker/anis/research-store.js';

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
// unit vector at angle t (degrees): cosine between two = cos(delta)
const at = (t) => [Math.cos(t * Math.PI / 180), Math.sin(t * Math.PI / 180), 0];
const mkEnv = (vectors) => {
  const db = new Database(':memory:'); db.exec(readFileSync('worker/d1/anis/0015_anis_edge.sql', 'utf8'));
  const stored = new Map();
  const stmt = (sql) => ({ bind: (...a) => { const s = db.prepare(sql);
    return { first: async () => s.get(...a) ?? null, all: async () => ({ results: s.all(...a) }), run: async () => (s.reader ? (s.get(...a), {}) : s.run(...a)) }; } });
  return { db, stored,
    ANIS_DB: { prepare: stmt },
    ANIS_VEC: { query: async (v, { topK }) => ({ matches: [...stored].map(([id, o]) => ({ id, score: cos(v, o.values) })).sort((a, b) => b.score - a.score).slice(0, topK) }),
      upsert: async (items) => items.forEach((i) => stored.set(i.id, i)) },
    AI: { run: async (_m, { text }) => ({ data: [vectors[text[0]] || at(300)] }) } };
};
const P = (id, extra = {}) => ({ id, document_id: 1, paragraph_index: id, text: `t${id}`, title: 'T', author: 'A', source_url: `u${id}`, religion: 'bahai', ...extra });

describe('research store', () => {
  let env;
  beforeEach(() => { env = mkEnv({ 'how do bahais pray?': at(0), 'how do baha is pray': at(10), 'what is the prayer for bahais': at(30), 'other topic': at(90) }); });

  it('exact qhash hit = similarity 1 with snapshot passages and no embedding call', async () => {
    await capture(env, 'How do Bahais pray?', [P(1), P(2)]);
    env.AI.run = async () => { throw new Error('no embed'); };
    const r = await lookup(env, '  how do BAHAIS pray? ');
    expect(r.similarity).toBe(1); expect(r.set.passages.map((p) => p.text)).toEqual(['t1', 't2']);
    expect(env.db.prepare('SELECT hits FROM anis_research_sets').get().hits).toBe(1);
  });
  it('semantic hit on a reworded question; related below SAME; miss below RELATED', async () => {
    await capture(env, 'how do bahais pray?', [P(1)]);
    const same = await lookup(env, 'how do baha is pray'); expect(same.similarity).toBeGreaterThan(0.88); expect(outcomeOf(same.similarity)).toBe('hit');
    const rel = await lookup(env, 'what is the prayer for bahais'); expect(outcomeOf(rel.similarity)).toBe('related');
    expect(await lookup(env, 'other topic')).toBeNull();
  });
  it('curated beats candidate on equal similarity', async () => {
    await capture(env, 'how do bahais pray?', [P(1)]);
    env.AI.run = async (_m, { text }) => ({ data: [text[0] === 'twin' ? at(0) : at(0)] });
    await capture(env, 'twin', [P(2)]);
    env.db.prepare("UPDATE anis_research_sets SET status='curated' WHERE question='twin'").run();
    const r = await lookup(env, 'probe'); expect(r.set.question).toBe('twin');
  });
  it('capture merges by id (new first), caps at MAX_PASSAGES, is idempotent on ids', async () => {
    await capture(env, 'how do bahais pray?', [P(1), P(2)]);
    await capture(env, 'how do bahais pray?', [P(3), P(2, { text: 'new' })]);
    const s = (await lookup(env, 'how do bahais pray?')).set;
    expect(s.passages.map((p) => p.id)).toEqual([3, 2, 1]); expect(s.passages[1].text).toBe('new');
    await capture(env, 'how do bahais pray?', Array.from({ length: 40 }, (_, i) => P(100 + i)));
    expect((await lookup(env, 'how do bahais pray?')).set.passages).toHaveLength(MAX_PASSAGES);
    expect(env.db.prepare('SELECT COUNT(*) c FROM anis_research_sets').get().c).toBe(1); expect(env.stored.size).toBe(1);
  });
  it('a reworded capture using the matched set question grows that set', async () => {
    await capture(env, 'how do bahais pray?', [P(1)]);
    const { set } = await lookup(env, 'how do baha is pray');
    await capture(env, set.question, [P(9)]);
    expect((await lookup(env, 'how do bahais pray?')).set.passages.map((p) => p.id)).toEqual([9, 1]);
  });
  it('curated set is never overwritten; hits grow', async () => {
    await capture(env, 'how do bahais pray?', [P(1)]);
    env.db.prepare("UPDATE anis_research_sets SET status='curated'").run();
    await capture(env, 'how do bahais pray?', [P(5), P(6)]);
    const row = env.db.prepare('SELECT * FROM anis_research_sets').get();
    expect(JSON.parse(row.passages).map((p) => p.id)).toEqual([1]); expect(row.status).toBe('curated'); expect(row.hits).toBe(1);
  });
  it('stale set is skipped by lookup and revived as candidate by capture', async () => {
    await capture(env, 'how do bahais pray?', [P(1)]);
    env.db.prepare("UPDATE anis_research_sets SET status='stale'").run();
    expect(await lookup(env, 'how do bahais pray?')).toBeNull();
    await capture(env, 'how do bahais pray?', [P(2)]);
    expect((await lookup(env, 'how do bahais pray?')).set.status).toBe('candidate');
  });
  it('logQuestion records outcome and never throws', async () => {
    await logQuestion(env, { question: 'q1', similarity: 0.9, setId: 3, site: 's.com', channel: 'web', ms: 5, format: 'short' });
    await logQuestion(env, { question: 'q2', similarity: 0.8 }); await logQuestion(env, { question: 'q3' });
    expect(env.db.prepare('SELECT outcome FROM anis_question_log ORDER BY id').all().map((r) => r.outcome)).toEqual(['hit', 'related', 'miss']);
    expect(await logQuestion({ ANIS_DB: null }, { question: 'x' })).toBeNull();
    expect(await logQuestion(env, { question: '' })).toBeNull();
  });
  it('questionHash matches the tower hash', async () => {
    const { createHash } = await import('node:crypto');
    expect(await questionHash('Bahá’í  Prayer')).toBe(createHash('sha256').update("baha'i prayer").digest('hex').slice(0, 32));
  });
  it('saves and loads a conversation in order — user before assistant within a round', async () => {
    await saveTurn(env, { conversationId: 'c1', round: 1, role: 'user', content: 'hi', site: 's', channel: 'web', reader: 'r' });
    await saveTurn(env, { conversationId: 'c1', round: 1, role: 'assistant', content: 'hello', meta: { a: 1 } });
    await saveTurn(env, { conversationId: 'c1', round: 1, role: 'assistant', content: 'hello2', meta: { a: 2 } });
    const c = await loadConversation(env, 'c1');
    expect(c.conversation.site).toBe('s'); expect(c.turns.map((t) => t.content)).toEqual(['hi', 'hello2']); expect(c.turns[1].meta).toEqual({ a: 2 });
    expect(await loadConversation(env, 'nope')).toBeNull();
  });
  it('bundles for a Worker (esbuild --platform=browser)', () => {
    expect(() => execFileSync('node_modules/.bin/esbuild', ['worker/anis/research-store.js', '--bundle', '--platform=browser', '--format=esm', '--log-level=error', '--outfile=/dev/null'])).not.toThrow();
  });
  it('a set a correction showed wrong goes stale: never served, never on a curated set; the next capture starts afresh (11-14 Íqán divines)', async () => {
    const set = await capture(env, 'how do bahais pray?', [P(1), P(2)]);
    expect(await markStale(env, set.id)).toBe(true);
    expect(await lookup(env, 'how do bahais pray?')).toBeNull();
    expect(await lookup(env, 'how do baha is pray')).toBeNull();
    const again = await capture(env, 'how do bahais pray?', [P(3)]);
    expect(again.passages.map((p) => p.id)).toEqual([3]);   // the wrong passages are not merged back
    env.db.prepare("UPDATE anis_research_sets SET status = 'curated'").run();
    expect(await markStale(env, again.id)).toBe(false);
    expect(readFileSync('worker/d1/anis/0019_anis_stale_iqan_divines.sql', 'utf8')).toMatch(/status = 'stale'[^;]*WHERE id = 172 AND status = 'candidate'/);
  });
});
