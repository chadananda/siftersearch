// Integration tests for library-watcher.js — religion-root whitelist.
//
// The whitelist is the watcher's central invariant: only files inside a
// directory containing `.religion/meta.yaml` are eligible for ingestion.
// Production bugs in this logic (-sites/ accidentally ingested as a religion;
// dotfolder paths slipping past the regex) cost us hours of cleanup, so we
// pin the behavior here.
//
// Tests use a tmp-dir tree against the actual `discoverReligionRoots` /
// `isInReligionFolder` exported under `_internal`. No DB or chokidar needed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// The watcher module reads config at the helper-call boundary — `refreshReligionRoots`
// reads config.library.basePath. The pure helpers we test here take basePath as
// an argument, so we don't need to mock config. Mock logger to silence noise.
vi.mock('../../api/lib/logger.js', () => ({
  logger: {
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {}
  }
}));

// db.js is imported transitively (via ingester chain). Stub it minimally so
// importing library-watcher doesn't crash trying to open a real SQLite DB.
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async () => null),
  queryAll: vi.fn(async () => []),
  getDb: vi.fn(),
  transaction: vi.fn(),
  getBatchDb: vi.fn()
}));

const fakeConfig = { library: { basePath: '/tmp' }, ai: { embeddings: { model: 'text-embedding-3-large', dimensions: 512 } } };
vi.mock('../../api/lib/config.js', () => ({ config: fakeConfig, default: fakeConfig }));

let tmpBase;
let watcher;

async function makeReligion(base, name, hasMeta = true) {
  const root = join(base, name);
  await mkdir(root, { recursive: true });
  if (hasMeta) {
    await mkdir(join(root, '.religion'), { recursive: true });
    await writeFile(join(root, '.religion', 'meta.yaml'), `religion: "${name}"\n`, 'utf-8');
  }
  return root;
}

describe('Library watcher — religion-root whitelist', () => {
  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'libwatch-'));
    if (!watcher) watcher = await import('../../api/services/library-watcher.js');
  });

  afterEach(async () => {
    if (tmpBase) await rm(tmpBase, { recursive: true, force: true });
  });

  it('detects directories with .religion/meta.yaml as religion roots', async () => {
    const bahai = await makeReligion(tmpBase, "Baha'i");
    const islam = await makeReligion(tmpBase, "Islam");
    const roots = await watcher._internal.discoverReligionRoots(tmpBase);

    expect(roots.size).toBe(2);
    expect(roots.has(bahai)).toBe(true);
    expect(roots.has(islam)).toBe(true);
  });

  it('does NOT mark a directory as a religion root when meta.yaml is missing', async () => {
    await makeReligion(tmpBase, "Baha'i");
    const noMeta = join(tmpBase, "FakeReligion");
    await mkdir(join(noMeta, '.religion'), { recursive: true });   // dir present but no meta.yaml
    const roots = await watcher._internal.discoverReligionRoots(tmpBase);

    expect(roots.size).toBe(1);
    expect([...roots].some(r => r.endsWith('FakeReligion'))).toBe(false);
  });

  it('skips dotfolders during walk (excludes -sites/ when no .religion present)', async () => {
    await makeReligion(tmpBase, "Baha'i");
    // Mimic the production -sites/oceanlibrary.com/ tree — no .religion/ inside.
    const sitesDir = join(tmpBase, '-sites', 'oceanlibrary.com', "Bahá'í");
    await mkdir(sitesDir, { recursive: true });
    await writeFile(join(sitesDir, 'fake-book.md'), '# fake', 'utf-8');

    const roots = await watcher._internal.discoverReligionRoots(tmpBase);
    expect(roots.size).toBe(1);
    expect([...roots].every(r => !r.includes('-sites'))).toBe(true);
  });

  it('isInReligionFolder returns true for paths inside a discovered root', async () => {
    const bahai = await makeReligion(tmpBase, "Baha'i");
    watcher._internal.setReligionRootsForTest([bahai]);

    expect(watcher._internal.isInReligionFolder(join(bahai, 'foo.md'))).toBe(true);
    expect(watcher._internal.isInReligionFolder(join(bahai, 'sub', 'deep', 'foo.md'))).toBe(true);
    expect(watcher._internal.isInReligionFolder(bahai)).toBe(true);
  });

  it('isInReligionFolder returns false for paths outside any root', async () => {
    const bahai = await makeReligion(tmpBase, "Baha'i");
    watcher._internal.setReligionRootsForTest([bahai]);

    expect(watcher._internal.isInReligionFolder(join(tmpBase, '-sites', 'foo.md'))).toBe(false);
    expect(watcher._internal.isInReligionFolder(join(tmpBase, 'OtherDir', 'foo.md'))).toBe(false);
  });

  it('IGNORED_PATTERNS: dotfolders ignored EXCEPT .religion/.collection', () => {
    const { IGNORED_PATTERNS } = watcher._internal;
    const matches = (path) => IGNORED_PATTERNS.some(p =>
      typeof p === 'function' ? p(path) : p.test(path)
    );

    // Standard dotfolders should be ignored
    expect(matches('/lib/.git/config')).toBe(true);
    expect(matches('/lib/.DS_Store')).toBe(true);
    expect(matches('/lib/.cache/foo')).toBe(true);
    // Religion + collection metadata folders must NOT be ignored
    expect(matches("/lib/Baha'i/.religion/meta.yaml")).toBe(false);
    expect(matches("/lib/Baha'i/Books/.collection/meta.yaml")).toBe(false);
    // node_modules ignored
    expect(matches('/repo/node_modules/foo')).toBe(true);
  });

  it('does not recurse into a religion root once detected (religions do not nest)', async () => {
    const bahai = await makeReligion(tmpBase, "Baha'i");
    // Plant a sibling dir INSIDE bahai that also has .religion/meta.yaml.
    // discoverReligionRoots should NOT pick this up — it stops walking
    // once a parent is identified as a root.
    const nested = join(bahai, 'NestedFakeReligion');
    await mkdir(join(nested, '.religion'), { recursive: true });
    await writeFile(join(nested, '.religion', 'meta.yaml'), 'religion: nested\n', 'utf-8');

    const roots = await watcher._internal.discoverReligionRoots(tmpBase);
    expect(roots.size).toBe(1);
    expect(roots.has(bahai)).toBe(true);
    expect([...roots].every(r => !r.includes('NestedFakeReligion'))).toBe(true);
  });
});
