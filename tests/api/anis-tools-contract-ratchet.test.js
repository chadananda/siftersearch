// Ratchet (Chad 11-09): a REGISTRY tool never reaches an LLM. ai.js / ai-services.js / role-client.js / jev-call.js are mocked to count
// and throw; every contract tool runs on its example input; any call fails the test. Also: only contract tools hold a cost, and
// tools.js / elements / seeded trees never name the retired combined-search family (except the respond@3 rollback modules).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
const calls = vi.hoisted(() => []);
const trap = (mod) => new Proxy({}, { get: (_, k) => (k === 'then' || typeof k === 'symbol' ? undefined : (...a) => { calls.push(`${mod}.${String(k)}`); throw new Error(`LLM-FORBIDDEN ${mod}.${String(k)}`); }) });
vi.mock('../../api/lib/ai.js', () => trap('ai'));
vi.mock('../../api/lib/ai-services.js', () => trap('ai-services'));
vi.mock('../../api/lib/role-client.js', () => trap('role-client'));
vi.mock('../../api/lib/assistant/jev-call.js', () => trap('jev-call'));
import { REGISTRY, PROCESS, run } from '../../api/lib/assistant/tools.js';

const fixtureDeps = () => ({ fastSearch: async () => [{ id: 1, text: 'one country', title: 'T', author: 'A', document_id: 1, paragraph_index: 1 }], sourceHunt: async () => null });
beforeEach(() => { calls.length = 0; });

describe('no REGISTRY tool reaches an LLM', () => {
  for (const [name, e] of Object.entries(REGISTRY)) {
    it(`${name}: cost.llm is false and a run on its example calls no LLM module`, async () => {
      expect(e.cost, name).toMatchObject({ llm: false });
      expect(typeof e.cost.embed, name).toBe('boolean');
      expect(typeof e.cost.p50_ms, name).toBe('number');
      try { await run(name, e.example.input, { ...fixtureDeps(), deps: {} }); } catch (err) { expect(String(err?.message), name).not.toMatch(/LLM-FORBIDDEN/); }
      expect(calls, name).toEqual([]);
    });
  }
  it('PROCESS tools are never contract tools', () => { for (const n of Object.keys(PROCESS)) expect(REGISTRY[n], n).toBeUndefined(); });
});

describe('the retired combined search is not a tree or tool dependency', () => {
  const read = (f) => readFileSync(new URL(`../../api/lib/assistant/${f}`, import.meta.url), 'utf8');
  for (const f of ['tools.js', 'tool-kit.js', 'activities/elements.js', 'activities/catalog.js', 'strategy-trees-seed.js']) {
    it(`${f} names none of combined_search / search_library / planned_search`, () => {
      let src; try { src = read(f); } catch { return; }
      expect(src).not.toMatch(/combined_search|search_library|planned_search|combinedSearch/);
    });
  }
});
