// One chat pipeline: /api/v1/chat adapts anisTurn; no route imports the retired Jafar pipeline.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { v1TurnArgs, v1Event, v1Done } from '../../api/lib/assistant/v1-chat.js';

describe('v1 chat adapter', () => {
  it('maps the v1 body to anisTurn args', () => {
    const onEvent = () => {};
    const a = v1TurnArgs({ messages: [{ role: 'user', content: 'hi', extra: 1 }], participant: { id: 'p' }, clientKey: 'p', onEvent });
    expect(a.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(a).toMatchObject({ channel: 'site-chat', participant: { id: 'p' }, clientKey: 'p', test: false, onEvent });
  });
  it('maps anisTurn events to v1 SSE types', () => {
    expect(v1Event({ type: 'text', content: 'x' })).toEqual({ type: 'text', content: 'x' });
    expect(v1Event({ type: 'status', text: 'Searching' })).toEqual({ type: 'status', message: 'Searching' });
    expect(v1Event({ type: 'sources', sources: [{ id: 1 }] })).toEqual({ type: 'citations', citations: [{ id: 1 }] });
    expect(v1Event({ type: 'sources', sources: [] })).toBeNull();
    expect(v1Event({ type: 'session', conversation_id: 'a' })).toBeNull();
    expect(v1Event({ type: 'stage', stage: 'craft' }).type).toBe('stage');
  });
  it('builds done with final_reply and meta', () => {
    const d = v1Done({ r: { reply: 'ans', status: 'answered', plan: { shape: 'fact' }, retrieved: [1, 2], citations: [{ id: 1 }] }, conversation_id: 'c', startTime: Date.now() });
    expect(d).toMatchObject({ type: 'done', final_reply: 'ans', conversation_id: 'c', citations: [{ id: 1 }], meta: { user_intent: 'fact', retrieved_count: 2, engine: 'anis' } });
  });
});

describe('ratchet: a single chat pipeline', () => {
  it('no route or lib file uses runJafarPipeline; chat-pipeline.js no longer defines it', () => {
    const dirs = ['api/routes', 'api/lib', 'api/lib/assistant'];
    for (const d of dirs) for (const f of readdirSync(d).filter((x) => x.endsWith('.js'))) {
      expect(readFileSync(`${d}/${f}`, 'utf8'), `${d}/${f}`).not.toMatch(/runJafarPipeline/);
    }
  });
  it('/api/v1/chat runs anisTurn', () => {
    expect(readFileSync('api/routes/public-api.js', 'utf8')).toMatch(/assistant\/turn\.js/);
  });
});
