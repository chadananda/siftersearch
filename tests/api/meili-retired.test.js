// Meilisearch RETIRED (storage plan R8, Chad 10-21 "get rid of meilisearch"): production config disables it, nothing pages
// about it being down, no backup step runs for it, health follows Qdrant, and the remaining Meili-only paths return empty
// instead of throwing.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

vi.mock('../../api/lib/config.js', async (orig) => {
  const m = await orig();
  return { ...m, config: { ...m.config, search: { ...m.config.search, enabled: false } } };
});
vi.mock('../../api/lib/search/qdrant-layers.js', async (orig) => ({ ...(await orig()), qdrantHealth: async () => ({ status: 'ok', collections: { phrases: { status: 'green' } } }) }));

describe('Meilisearch retired', () => {
  it('production config disables it', () => expect(read('.env-public')).toMatch(/^MEILISEARCH_ENABLED=false$/m));
  it('system-checks never probes it (a stopped Meili must not page)', () => expect(read('scripts/system-checks.mjs')).not.toMatch(/7700|add\('Meilisearch'/));
  it('the daily backup skips the Meili rsync while it is disabled', () => expect(read('api/lib/backup.js')).toMatch(/if \(config\.search\.enabled\) components\.push\(await runMeiliBackup\(\)\)/));
  it('cache prewarm is not gated on Meili', () => expect(read('api/lib/api-runtime.js')).toMatch(/if \(PRIMARY\) \{[\s\S]*prewarmCache\(POPULAR_QUERIES\)/));
  it('/api/search/health status follows Qdrant', async () => {
    const { healthCheck } = await import('../../api/lib/search.js');
    expect(await healthCheck()).toMatchObject({ status: 'ok', engine: 'qdrant', meilisearch: 'retired' });
  });
  it('Meili-only paths return empty, never throw', async () => {
    const { federatedSearch, getMeili } = await import('../../api/lib/search.js');
    expect(getMeili()).toBeNull();
    expect(await federatedSearch([{ query: 'x' }])).toMatchObject({ hits: [] });
    const { syncConcepts, syncLexicon } = await import('../../api/lib/search/concepts.js');
    expect(await syncConcepts()).toMatchObject({ indexed: 0, skipped: 'meilisearch retired' });
    expect(await syncLexicon()).toMatchObject({ indexed: 0, skipped: 'meilisearch retired' });
  });
});
