// System-1 client: every call logged per TASK TYPE; Laya never consulted until a checkpoint trained for that task exists.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Spend ledger mocked: hermetic (no telemetry DB, and importing the real ai-services would load the env files back).
const spent = [];
vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: (row) => spent.push(row) }));

let dir, mod, urls;
beforeEach(async () => {
  spent.length = 0;
  dir = mkdtempSync(join(tmpdir(), 'systemone-'));
  process.env.SYSTEMONE_DIR = dir; process.env.LAYA_TOKEN = 't'; process.env.TYPESAFE_API_KEY = 'k';
  // hermetic: the real .env-secrets may carry the internal key, which would switch Clef shadowing on
  delete process.env.INTERNAL_API_KEY; delete process.env.SYSTEMONE_EDGE_KEY; delete process.env.CLEF; delete process.env.SYSTEMONE_SHADOW;
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    urls.push(url);
    const body = JSON.parse(init.body);
    const answers = Object.fromEntries(Object.keys(body.questions).map((q) => [q, { choice: 'Shoghi Effendi', confidence: 0.97, distribution: { 'Shoghi Effendi': 0.97, other: 0.03 } }]));
    return { ok: true, json: async () => (url.includes('typesafe') ? { model: 'jev-1.13.0', answers, usage: { input_tokens: 900 } } : { answers, ms: 40 }) };
  }));
  vi.resetModules();
  mod = await import('../../api/lib/systemone.js');
});
afterEach(() => { mod._test.reset(); vi.unstubAllGlobals(); });

const Q = { speaker: { type: 'choice', criteria: { 'Shoghi Effendi': 'x', other: 'y' }, instructions: 'who?' } };

describe('systemone.ask', () => {
  it('requires a task type', async () => {
    await expect(mod.ask(null, 's', Q)).rejects.toThrow(/task type/);
  });
  it('untrained task: Jev only, Laya never called, call logged with task + Jev distribution', async () => {
    const r = await mod.ask('paragraph-attribution', 'state text', Q, { ref: 42 });
    expect(r.served_by).toBe('jev');
    expect(urls.every((u) => u.includes('typesafe'))).toBe(true);
    const row = mod._test.db().prepare('SELECT * FROM calls WHERE id = ?').get(r.id);
    expect(row).toMatchObject({ task: 'paragraph-attribution', ref: '42', jev_tokens: 900, laya: null, served_by: 'jev' });
    expect(JSON.parse(row.jev).speaker.distribution['Shoghi Effendi']).toBe(0.97);
    // every paid call is spend: one ai_usage row, priced as jev-latest, with its tokens and task
    expect(spent).toEqual([expect.objectContaining({ provider: 'typesafe', model: 'jev-latest', promptTokens: 900, caller: 'system1:paragraph-attribution' })]);
  });
  it('trained task: Laya shadows Jev; when Laya is primary and confident it serves', async () => {
    writeFileSync(join(dir, 'routing.json'), JSON.stringify({ 'paragraph-attribution': { laya_model: 'ckpt-attr-v1' }, 'search-scope': { laya_model: 'ckpt-scope-v1', primary: 'laya' } }));
    const a = await mod.ask('paragraph-attribution', 's', Q);
    expect(a.served_by).toBe('jev'); expect(a.laya).toBeTruthy();
    urls = [];
    const b = await mod.ask('search-scope', 's', Q);
    expect(b.served_by).toBe('laya'); expect(urls.some((u) => u.includes('typesafe'))).toBe(false);
  });
  it('attaches gold labels by task + ref', async () => {
    await mod.ask('paragraph-attribution', 's', Q, { ref: 7 });
    expect(mod.attachGold('paragraph-attribution', 7, { speaker: 'Shoghi Effendi' }, 'trailer')).toBe(1);
    expect(mod.attachGold('search-scope', 7, {}, 'x')).toBe(0);   // task types never mix
  });
});

describe('Clef backends (Workers AI via our edge Worker)', () => {
  const clefEnv = () => { process.env.INTERNAL_API_KEY = 'ik'; };
  afterEach(() => { delete process.env.INTERNAL_API_KEY; delete process.env.SYSTEMONE_SHADOW; });
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('no internal key → no Clef calls at all, and a clef primary falls back to Jev', async () => {
    writeFileSync(join(dir, 'routing.json'), JSON.stringify({ t: { primary: 'clef-flash' } }));
    const r = await mod.ask('t', 's', Q); await settle();
    expect(r.served_by).toBe('jev'); expect(urls.some((u) => u.includes('/_s1/run'))).toBe(false);
  });
  it('with a token: Jev serves, Clef and Clef-flash shadow AFTER the answer into the shadow table', async () => {
    clefEnv();
    const r = await mod.ask('t', 's', Q); await settle();
    expect(r.served_by).toBe('jev');
    const rows = mod._test.db().prepare('SELECT backend, answers, error FROM shadow WHERE call_id = ? ORDER BY backend').all(r.id);
    expect(rows.map((x) => x.backend)).toEqual(['clef', 'clef-flash']);
    expect(urls.filter((u) => u.includes('/_s1/run'))).toHaveLength(2);
  });
  it('clef-flash primary serves; Jev shadows it; Clef failure falls back to Jev', async () => {
    clefEnv(); writeFileSync(join(dir, 'routing.json'), JSON.stringify({ t: { primary: 'clef-flash' } }));
    const r = await mod.ask('t', 's', Q); await settle();
    expect(r.served_by).toBe('clef-flash');
    const rows = mod._test.db().prepare('SELECT backend FROM shadow WHERE call_id = ? ORDER BY backend').all(r.id).map((x) => x.backend);
    expect(rows).toEqual(['clef', 'clef-flash', 'jev']);
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url.includes('/_s1/run')) return { ok: false, status: 503, text: async () => 'down' };
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ model: 'jev', answers: Object.fromEntries(Object.keys(body.questions).map((q) => [q, { choice: 'other', confidence: 0.9 }])) }) };
    }));
    const f = await mod.ask('t', 's', Q);
    expect(f.served_by).toBe('jev');
  });
  it('SYSTEMONE_SHADOW="" turns shadowing off', async () => {
    clefEnv(); process.env.SYSTEMONE_SHADOW = '';
    await mod.ask('t', 's', Q); await settle();
    expect(urls.some((u) => u.includes('/_s1/run'))).toBe(false);
  });
});

describe('record() — calls made outside ask()', () => {
  it('logs the Jev answer under its task and shadows Clef when on; never throws', async () => {
    process.env.INTERNAL_API_KEY = 'ik';
    const id = mod.record('search-plan', 'user: what is justice?', Q, { answers: { speaker: { choice: 'other' } }, ms: 120, model: 'jev-1' });
    await new Promise((r) => setTimeout(r, 20));
    expect(mod._test.db().prepare('SELECT task, jev_ms, served_by FROM calls WHERE id = ?').get(id)).toMatchObject({ task: 'search-plan', jev_ms: 120, served_by: 'jev' });
    expect(mod._test.db().prepare('SELECT COUNT(*) n FROM shadow WHERE call_id = ?').get(id).n).toBe(2);
    expect(mod.record(null, 's', Q, {})).toBeNull();
    delete process.env.INTERNAL_API_KEY;
  });
});
