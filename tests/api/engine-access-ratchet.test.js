// Search-engine access is RATCHETED (planning/architecture-data-access-20261009.md). SQLite is the only place data is read
// from or written to; a search engine is asked only "which ids match?", by one module. Today 62 files reach Meili directly —
// which is how Qdrant-only search silently kept needing Meili to answer (10-09: "we do not even know why meili is still being
// called"). This list may only SHRINK: a new file fails; a migrated file must be removed from the list (so it stays honest).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const ENGINE = /getMeili\s*\(|from ['"]meilisearch['"]|new MeiliSearch\(|getMeiliHeaders|:7700\b|MEILI_(URL|HOST)\b/;
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs)$/.test(e.name) ? [join(d, e.name)] : []));

// Frozen 2026-10-09. Target: only api/lib/search/engine/* + api/lib/search/index-writer/* (P3), then nothing (P5).
const ALLOWED = new Set([
  // config / env / health (move to engine.health() — P3)
  'api/lib/config.js', 'api/lib/env-check.js', 'api/routes/search.js', 'scripts/health-check.mjs', 'scripts/system-checks.mjs',
  'scripts/preflight.js', 'scripts/dev.js',
  // ranking + secondary indexes (behind engine.js — P3)
  'api/lib/search.js', 'api/lib/search/concepts.js', 'api/lib/search/entity.js', 'api/lib/search/hype.js', 'api/lib/deep-research.js',
  'api/lib/source-resolve.js',
  // data fetched THROUGH the engine — wrong, to repos / findDocuments (P1): all migrated 10-09
  // index writes outside the sync worker — wrong, mark dirty instead (P2)
  'api/routes/admin.js', 'api/routes/tablets.js', 'api/services/library-watcher.js', 'api/services/indexer.js',
  'api/lib/graph-meili-sync.js', 'api/workers/graph-extractor.js', 'api/workers/graph-pipeline.js',
  // the sync workers (index-writer's caller — P2; sync-processor.js is a dead duplicate to delete)
  'api/workers/unified-worker.js', 'api/workers/sync-processor.js',
  // scripts — one-off / legacy tools: delete or move onto index-writer
  'scripts/add-authority-to-index.js', 'scripts/authorship/push-meili-authors.mjs', 'scripts/bulk-meili-sync.mjs',
  'scripts/cleanup-meili-orphans.js', 'scripts/drop-existing-hype.mjs', 'scripts/fix-001-title.js', 'scripts/fix-meili-vectors.js',
  'scripts/generate-missing-slugs.js', 'scripts/index-library.js', 'scripts/migrate-meili-doc-id.js', 'scripts/push-slugs-to-meili.js',
  'scripts/rebuild-paragraphs-index.mjs', 'scripts/refresh-authority.js', 'scripts/regenerate-slugs.js', 'scripts/rescue-embeddings.js',
  'scripts/siftersearch-enable-binary-quant.mjs', 'scripts/siftersearch-meili-stability-check.mjs', 'scripts/sync-frontmatter-metadata.js',
  'scripts/sync-meili-titles.js', 'scripts/sync-meili-to-content.js', 'scripts/sync-meili.js', 'scripts/update-authority.js',
  'scripts/update-ranking-rules.js', 'scripts/wip/priority-sync-docs.mjs', 'scripts/wip/purge-bismillah-hype.mjs', 'scripts/wip/resolve-gpb.mjs',
  'scripts/wip/sync-ol-sura-hype.mjs', 'scripts/wip/upgrade-to-ol-sources.mjs',
]);

function engineFiles() {
  const out = [];
  for (const base of ['api', 'scripts', 'worker']) {
    let files = [];
    try { files = walk(join(ROOT, base)); } catch { continue; }
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (rel.includes('/migrations/')) continue;
      if (ENGINE.test(codeOnly(readFileSync(f, 'utf-8')))) out.push(rel);
    }
  }
  return out.sort();
}

describe('search-engine access is ratcheted', () => {
  const found = engineFiles();
  it('no NEW file reaches the search engine directly', () => {
    const added = found.filter((f) => !ALLOWED.has(f));
    if (added.length) throw new Error(`New direct search-engine access in:\n  ${added.join('\n  ')}\n`
      + 'Read data through api/lib/docs-repo.js / paragraphs-repo (SQLite); find ids through the search interface. '
      + 'See planning/architecture-data-access-20261009.md.');
    expect(added).toEqual([]);
  });
  it('a file that no longer reaches the engine is removed from the allowed list', () => {
    const gone = [...ALLOWED].filter((f) => !found.includes(f));
    if (gone.length) throw new Error(`These files no longer touch the engine — remove them from ALLOWED (the list only shrinks):\n  ${gone.join('\n  ')}`);
    expect(gone).toEqual([]);
  });
});
