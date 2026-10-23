// Covenant-breakers by DATE (Chad 10-23: "We do not exclude Covenant-breakers until AFTER they broke the covenant"):
// Remey's talks before Ridván 1960 are welcome; on or after → excluded; undated → held for Chad, never auto-published.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { readFileSync } from 'fs';
import { cbPerson, cbVerdict } from '../../api/lib/media/cb-date.js';

const people = JSON.parse(readFileSync(new URL('../../data/media-speaker-people.json', import.meta.url), 'utf8')).people;

describe('cb_from verdict', () => {
  it('before the break included, on or after excluded, undated held', () => {
    expect(cbVerdict('1960-04', '1957-08-12')).toBe('include');
    expect(cbVerdict('1960-04', 1953)).toBe('include');
    expect(cbVerdict('1960-04', '1960-03-30')).toBe('include');
    expect(cbVerdict('1960-04', '1960-04-21')).toBe('exclude');
    expect(cbVerdict('1960-04', '1966')).toBe('exclude');
    expect(cbVerdict('1960-04', null)).toBe('hold');
    expect(cbVerdict('1960-04', '')).toBe('hold');
    expect(cbVerdict('1960-04', 1960)).toBe('hold');   // the year alone cannot say which side of Ridván
  });
  it('Remey is in the data with cb_from 1960-04, first-hand, and every spelling finds him', () => {
    const r = people.find((p) => p.key === 'charles-mason-remey');
    expect(r).toMatchObject({ cb_from: '1960-04', historical: 'first-hand' });
    expect(r.cb).toBeUndefined();   // not blanket-blocked: the date decides
    for (const n of ['Charles Mason Remey', 'Mason Remey', 'C. Mason Remey', 'Remey, Charles Mason']) expect(cbPerson(n, people)?.key, n).toBe('charles-mason-remey');
    expect(cbPerson('Remey', people)).toBeNull();   // a surname alone decides nothing
    expect(cbPerson('Hooper Dunbar', people)).toBeNull();
  });
});

describe('runItem applies it', async () => {
  const { runItem } = await import('../../api/lib/media/item.js');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
  const run = async (year) => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-')); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ slug: 'remey-x', speaker: 'Charles Mason Remey', ...(year ? { year } : {}), stages: { archive: { at: 'x' } } }));
    const updates = [];
    const repo = { updateMediaItem: async (id, f) => { updates.push(f); return {}; }, getMediaItem: async () => ({ state: 'queued' }) };
    const r = await runItem({ id: 7, dir, source_kind: 'file', speaker: 'Charles Mason Remey' }, {}, { tools: {}, llm: {}, repo, draining: async () => false, loadVocab: async () => ({}) });
    return { r, updates };
  };
  it('1966 → excluded; undated → review (held); 1955 → runs on', async () => {
    const a = await run(1966); expect(a.r.excluded).toBe(true); expect(a.updates.at(-1).state).toBe('excluded');
    const b = await run(null); expect(b.r.held).toBe(true); expect(b.updates.at(-1).state).toBe('review');
    const c = await run(1955).catch((e) => ({ err: e })); expect(c.r?.excluded).toBeFalsy(); expect(c.r?.held).toBeFalsy();
  });
});
