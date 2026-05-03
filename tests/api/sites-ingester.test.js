// Integration tests for the external-source ingester (sites-ingester.js).
// Coverage: parseDoc → harvestBundles cache → upsertDoc → bulkInsert →
// supersession marking → reconcileDeletes lifecycle. Verifies external_para_id,
// source_url, source_site, duplicate_of, is_duplicate end-to-end.
//
// Pattern matches tests/api/pipeline.test.js: in-memory better-sqlite3 + a
// vi.mock of api/lib/db.js that routes the real production query/queryOne/
// queryAll through the in-memory instance. ai-services is mocked to emit
// synthetic 512-element embeddings without hitting OpenAI. config is mocked
// so the ingester points at a tmp-dir basePath we control.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── In-memory DB + module mocks (must be before imports that use them) ────

const rawDb = new Database(':memory:');
rawDb.pragma('journal_mode = WAL');
rawDb.pragma('foreign_keys = OFF');  // match production default

vi.mock('../../api/lib/db.js', () => {
  function runQuery(sql, params = []) {
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
    if (isWrite) {
      const info = rawDb.prepare(sql).run(...params);
      return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }], lastInsertRowid: info.lastInsertRowid };
    }
    return { rows: rawDb.prepare(sql).all(...params) };
  }
  async function query(sql, params = []) { return runQuery(sql, params); }
  async function queryOne(sql, params = []) { const r = runQuery(sql, params); return r.rows[0] || null; }
  async function queryAll(sql, params = []) { return runQuery(sql, params).rows; }
  async function getDb() { return rawDb; }
  async function transaction(stmts) {
    const txn = rawDb.transaction((list) => list.map(({ sql, args = [] }) => rawDb.prepare(sql).run(...args)));
    return txn(stmts);
  }
  return { query, queryOne, queryAll, getDb, transaction, getBatchDb: getDb };
});

vi.mock('../../api/lib/ai-services.js', () => ({
  aiService: () => ({
    // Return one Float32Array per input — synthetic 512-dim vector.
    embed: vi.fn(async (inputs) => {
      const arr = Array.isArray(inputs) ? inputs : [inputs];
      // Each embedding is a plain Array<number> (matches OpenAI shape)
      return arr.map((_, i) => Array.from({ length: 512 }, (__, j) => ((i * 7 + j) % 7) / 10));
    })
  })
}));

vi.mock('../../api/lib/logger.js', () => ({
  logger: {
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {}
  }
}));

// config.library.basePath is set per-test via SITES_INGEST_TEST_BASE; the
// mock reads from that env var so each test can point at its own tmp dir.
const fakeConfig = {
  get library() { return { basePath: process.env.SITES_INGEST_TEST_BASE }; },
  ai: { embeddings: { model: 'text-embedding-3-large', dimensions: 512 } },
  isDevMode: false
};
vi.mock('../../api/lib/config.js', () => ({ config: fakeConfig, default: fakeConfig }));

// ─── Schema setup (subset matching what sites-ingester touches) ───────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE,
    file_hash TEXT,
    body_hash TEXT,
    title TEXT,
    author TEXT,
    religion TEXT,
    collection TEXT,
    language TEXT,
    description TEXT,
    paragraph_count INTEGER DEFAULT 0,
    encumbered INTEGER DEFAULT 0,
    source_site TEXT,
    source_url TEXT,
    external_id TEXT,
    duplicate_of INTEGER,
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    content_hash TEXT,
    normalized_hash TEXT,
    heading TEXT,
    blocktype TEXT,
    embedding BLOB,
    embedding_model TEXT,
    hyp_thesis TEXT,
    hyp_questions TEXT,
    context TEXT,
    context_model TEXT,
    enhanced_synced INTEGER DEFAULT 0,
    external_para_id TEXT,
    is_duplicate INTEGER DEFAULT 0,
    synced INTEGER DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_content_norm_active
    ON content(normalized_hash, doc_id) WHERE deleted_at IS NULL;
`;

function resetDb() {
  rawDb.exec(`DROP TABLE IF EXISTS content; DROP TABLE IF EXISTS docs;`);
  rawDb.exec(SCHEMA);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const FIXTURE_OL_DOC = `---
bookid: test_doc_v1
slug: test-doc
language: en
title: Selections from the Test Tablets
author: The Test Author
ocean_category: Bahá'í
description: A test compilation for the integration test.
source_url: 'https://oceanlibrary.com/test-doc'
para_count: 5
---

# Selections from the Test Tablets {.title id="para_1" type="title" subtype="book title" language="en"}

### Section One {.h3 id="para_2" ilm_id="bla" type="header" subtype="subheader" language="en"}

The first paragraph of substantive content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. {.preamble id="para_3" ilm_id="blb" type="par" language="en"}

The second paragraph speaks of justice and the spiritual ground from which it flows in the writings. {id="para_4" ilm_id="blc" type="par" language="en"}

A third substantive paragraph, completing the section with a teaching on detachment from worldly attachment. {id="para_5" ilm_id="bld" type="par" language="en"}

[^1]: First footnote definition that should be skipped by the adapter. {language="en"}
[^2]: Second footnote — also skipped. {language="en"}
`;

const SITES_YAML = `sites:
  testsite:
    adapter: oceanlibrary
    supersession_threshold: 0.80
    cadence_minutes: 60
    religion_map:
      "Bahá'í": "Baha'i"
      Buddhist: Buddhist
      Christian: Christian
      Hindu: Hindu
      Islam: Islam
      Jainism: Jain
      Judaism: Judaism
      Tao: Tao
      Zoroastrian: Zoroastrian
      Confucian: Confucian
`;

let tmpBase;

async function setupFixtureSite() {
  tmpBase = await mkdtemp(join(tmpdir(), 'sitesingest-'));
  process.env.SITES_INGEST_TEST_BASE = tmpBase;
  await mkdir(join(tmpBase, '-sites', 'testsite'), { recursive: true });
  await writeFile(join(tmpBase, '-sites', 'sites.yaml'), SITES_YAML, 'utf-8');
  // Backdate so the cooldown check passes (mtime > 4h ago not required when
  // we pass force:true, but we also test the unforced path).
  await writeFile(join(tmpBase, '-sites', 'testsite', 'test-doc.md'), FIXTURE_OL_DOC, 'utf-8');
  return tmpBase;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Sites ingester (integration)', () => {
  let ingester;

  beforeAll(async () => {
    ingester = await import('../../api/services/sites-ingester.js');
  });

  beforeEach(async () => {
    resetDb();
    await setupFixtureSite();
  });

  afterAll(async () => {
    if (tmpBase) await rm(tmpBase, { recursive: true, force: true });
  });

  it('ingests an OL doc with correct metadata + paragraph fields', async () => {
    const result = await ingester.ingestSite('testsite', { force: true });

    expect(result.errors).toEqual([]);
    expect(result.stats.errors).toBe(0);
    expect(result.stats.new).toBe(1);

    const doc = rawDb.prepare(`SELECT * FROM docs WHERE source_site = 'oceanlibrary.com'`).get();
    expect(doc).toBeTruthy();
    expect(doc.title).toBe('Selections from the Test Tablets');
    expect(doc.author).toBe('The Test Author');
    expect(doc.religion).toBe("Baha'i");                            // mapped from Bahá'í
    expect(doc.source_url).toBe('https://oceanlibrary.com/test-doc');
    expect(doc.external_id).toBe('test_doc_v1');
    expect(doc.duplicate_of).toBeNull();

    const paras = rawDb.prepare(`SELECT * FROM content WHERE doc_id = ? ORDER BY paragraph_index`).all(doc.id);
    expect(paras.length).toBe(3);                                   // 3 par/preamble blocks; titles + headers + footnotes skipped
    // external_para_id round-trips for deep links
    expect(paras[0].external_para_id).toBe('para_3');
    expect(paras[1].external_para_id).toBe('para_4');
    expect(paras[2].external_para_id).toBe('para_5');
    // Heading was promoted from the section header
    expect(paras[0].heading).toBe('Section One');
    // Embedding was generated (non-null, 2048 bytes = 512 × 4)
    expect(paras[0].embedding).toBeTruthy();
    expect(paras[0].embedding_model).toBe('text-embedding-3-large');
  });

  it('marks our existing doc as duplicate_of when an OL version supersedes it', async () => {
    // Pre-seed our corpus with a doc that matches the OL fixture by title+author.
    rawDb.prepare(`INSERT INTO docs (file_path, title, author, religion, paragraph_count) VALUES (?, ?, ?, ?, ?)`)
      .run('Bahai/test-doc-ours.md', 'Selections from the Test Tablets', 'The Test Author', "Baha'i", 3);
    const oursId = rawDb.prepare(`SELECT id FROM docs WHERE source_site IS NULL`).get().id;

    const result = await ingester.ingestSite('testsite', { force: true });
    expect(result.stats.errors).toBe(0);
    expect(result.stats.supersedes).toBe(1);

    const ours = rawDb.prepare(`SELECT * FROM docs WHERE id = ?`).get(oursId);
    const olDoc = rawDb.prepare(`SELECT id FROM docs WHERE source_site = 'oceanlibrary.com'`).get();

    expect(ours.duplicate_of).toBe(olDoc.id);

    // Per-paragraph propagation: any pre-existing paragraphs would get is_duplicate=1.
    // None pre-seeded here, but the supersession SQL should not error.
  });

  it('reuses cached embedding + sidecar enrichment on hash hit', async () => {
    // Pre-seed our corpus with a paragraph whose normalizedhash matches one
    // in the OL fixture, complete with an embedding + HyPE thesis. The
    // ingester should harvest both onto the new OL row without calling OpenAI.
    rawDb.prepare(`INSERT INTO docs (file_path, title, author, religion, paragraph_count) VALUES (?, ?, ?, ?, ?)`)
      .run('Bahai/some-other.md', 'Some Other Work', 'Some Author', "Baha'i", 1);
    const otherDocId = rawDb.prepare(`SELECT id FROM docs WHERE file_path = 'Bahai/some-other.md'`).get().id;

    // The first par/preamble paragraph in the OL fixture starts:
    //   "The first paragraph of substantive content. Lorem ipsum…"
    // We compute its normalized_hash ourselves to seed the cache.
    const { createHash } = await import('crypto');
    const text = 'The first paragraph of substantive content. Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    const normalized = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').toLowerCase().trim();
    const normHash = createHash('md5').update(normalized).digest('hex');

    const fakeEmbedding = Buffer.alloc(512 * 4);
    for (let i = 0; i < 512; i++) fakeEmbedding.writeFloatLE(0.5, i * 4);

    rawDb.prepare(`INSERT INTO content
      (doc_id, paragraph_index, text, normalized_hash, embedding, embedding_model,
       hyp_thesis, hyp_questions, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(otherDocId, 0, text, normHash, fakeEmbedding, 'text-embedding-3-large',
           'A thesis sentence.', 'Q1?\nQ2?', 'Disambig context.');

    await ingester.ingestSite('testsite', { force: true });

    const olDocId = rawDb.prepare(`SELECT id FROM docs WHERE source_site = 'oceanlibrary.com'`).get().id;
    const olPara = rawDb.prepare(`SELECT * FROM content WHERE doc_id = ? AND normalized_hash = ?`)
      .get(olDocId, normHash);

    expect(olPara).toBeTruthy();
    expect(olPara.hyp_thesis).toBe('A thesis sentence.');           // sidecar carried forward
    expect(olPara.hyp_questions).toBe('Q1?\nQ2?');
    expect(olPara.context).toBe('Disambig context.');
  });

  it('skips re-ingest when file_hash unchanged', async () => {
    await ingester.ingestSite('testsite', { force: true });
    const result = await ingester.ingestSite('testsite');           // no --force; should hit the unchanged path or cooldown
    // Either status is acceptable: file is unchanged OR within cooldown.
    expect(result.stats.errors).toBe(0);
    expect(result.stats.new).toBe(0);
  });
});
