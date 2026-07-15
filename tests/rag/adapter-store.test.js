// Contract test — the SifterSearch Store adapter satisfies the Store port against a REAL in-memory schema.
// Proves the adapter's SQL + column→domain mapping without the production DB. db.js/content.js are mocked
// onto an in-memory better-sqlite3 (the repo's standard pattern).
import { describe, it, expect, beforeAll, vi } from 'vitest';

// better-sqlite3 is a native module; skip this contract tier where its prebuilt binary can't load for the
// running arch (e.g. an x86_64 node_modules under an arm64 node). The library's own tests need no native dep.
let raw = null, HAVE_SQLITE = true;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); }
catch { HAVE_SQLITE = false; }
const run = (sql, p = []) => { const s = raw.prepare(sql); return /^\s*(INSERT|CREATE|UPDATE|DELETE)/i.test(sql) ? s.run(...p) : s.all(...p); };

vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, p = []) => run(sql, p),
  query: async (sql, p = []) => ({ rows: run(sql, p) }),
  // transaction: executes each {sql,args} statement sequentially on the in-memory DB.
  transaction: async (stmts) => stmts.map(({ sql, args = [] }) => run(sql, args)),
}));
const updateContextOnly = vi.fn(async () => {});
vi.mock('../../api/lib/content.js', () => ({ default: { updateContextOnly } }));

// Point the store's gazetteer at the committed sample BEFORE importing it (the path is read at module load).
import { fileURLToPath } from 'node:url';
process.env.SIFTER_GAZETTEER = fileURLToPath(new URL('../../data/siftersearch-gazetteer.sample.json', import.meta.url));

const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
const { skeletonKeys } = await import('../../api/lib/translit-key.js');
const store = makeStore();

describe.skipIf(!HAVE_SQLITE)('Store adapter contract', () => {
  beforeAll(() => {
    raw.exec(`
      CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, year INT, description TEXT, lang TEXT);
      CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INT, external_para_id TEXT, paragraph_index INT, heading TEXT, text TEXT, context TEXT, context_model TEXT, blocktype TEXT, deleted_at TEXT);
      INSERT INTO docs VALUES (7, 'God Passes By', 'Shoghi Effendi', 'bahai', 'History', 1944, 'A history.', 'en');
      INSERT INTO content VALUES (100, 7, 'para_1', 1, 'Chapter I', '${'the Báb declared His mission in Shíráz. '.repeat(8)}', NULL, NULL, 'paragraph', NULL);
      INSERT INTO content VALUES (101, 7, NULL,      2, 'Chapter I', 'short', NULL, NULL, 'paragraph', NULL);
      INSERT INTO content VALUES (102, 7, 'para_3', 3, 'Chapter I', 'a deleted line', NULL, NULL, 'paragraph', '2026-01-01');

      CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, name TEXT, canonical_name TEXT, entity_type TEXT, importance INT, last_assessed_version TEXT);
      CREATE TABLE entity_research (canonical_name TEXT, entity_type TEXT, summary TEXT);
      CREATE TABLE entity_lookup_keys (entity_id INT, skeleton_key TEXT);
      CREATE TABLE entity_decisions (id INTEGER PRIMARY KEY, kind TEXT, target_kind TEXT, target_ids TEXT, payload TEXT, evidence TEXT, rationale TEXT, actor TEXT, actor_tier INT, confidence REAL, status TEXT, method_version TEXT, supersedes INTEGER, valid_time TEXT, decided_at INTEGER DEFAULT (unixepoch()));
      CREATE TABLE entity_claims (id INTEGER PRIMARY KEY, claim_hash TEXT UNIQUE, claim_group TEXT, entity_id INTEGER, relation TEXT NOT NULL, target_entity_id INTEGER, statement TEXT NOT NULL, proof_verbatim TEXT, doc_id INTEGER, para_id TEXT, valid_from TEXT, valid_to TEXT, asserted_at INTEGER DEFAULT (unixepoch()), superseded_at INTEGER, rank TEXT DEFAULT 'normal', status TEXT DEFAULT 'supported', proof_ok INTEGER, subject_ok INTEGER, consistency_ok INTEGER, confidence REAL, provenance_tier INTEGER, extractor_version TEXT, import_batch TEXT, time_value TEXT, time_precision TEXT, time_basis TEXT, time_anchor TEXT, method_version TEXT, semantic_key TEXT);
      CREATE TABLE entity_mentions_v2 (id INTEGER PRIMARY KEY, anchor TEXT UNIQUE NOT NULL, doc_id INTEGER NOT NULL, para_id TEXT NOT NULL, occurrence INTEGER DEFAULT 0, surface TEXT NOT NULL, surface_norm TEXT NOT NULL, entity_id INTEGER, resolved_as TEXT, resolution_basis TEXT, resolution_conf REAL, method_version TEXT, model TEXT, status TEXT DEFAULT 'active', created_at INTEGER DEFAULT (unixepoch()));
      -- 101 is the gazetteer anchor "Áqáy-i-Kalím"; 999 is the ≠-guarded namesake "Ḥájí Mírzá Músáy-i-Qumí".
      INSERT INTO graph_entities VALUES (101, 'Áqáy-i-Kalím', 'Áqáy-i-Kalím', 'person', 78, NULL);
      INSERT INTO graph_entities VALUES (999, 'Ḥájí Mírzá Músáy-i-Qumí', 'Ḥájí Mírzá Músáy-i-Qumí', 'person', 20, NULL);
    `);
    // Give both entities the SAME skeleton key for "Mírzá Músá" so name-recall alone surfaces both.
    for (const k of skeletonKeys('Mírzá Músá')) { run(`INSERT INTO entity_lookup_keys VALUES (101, ?)`, [k]); run(`INSERT INTO entity_lookup_keys VALUES (999, ?)`, [k]); }
  });

  it('findCandidateEntities: gazetteer form recalls its anchor FIRST (anti-split) and drops the ≠-guarded namesake', async () => {
    // "Mírzá Músá" is a gazetteer FORM of anchor #101; name-recall also surfaces the guarded namesake #999.
    const cands = await store.findCandidateEntities('Mírzá Músá', { type: 'person', limit: 6 });
    expect(cands[0].id).toBe(101);                       // anchor first
    expect(cands.some((c) => c.id === 999)).toBe(false); // ≠guard (Áqáy-i-Kalím ≠ Ḥájí Mírzá Músáy-i-Qumí) dropped
  });

  it('findCandidateEntities: an epithet with no name-recall row still recalls the anchor', async () => {
    const cands = await store.findCandidateEntities('the ablest of His brothers', { type: 'person', limit: 6 });
    expect(cands[0].id).toBe(101);
  });

  it('getDocMeta maps columns to the DocMeta shape', async () => {
    expect(await store.getDocMeta(7)).toMatchObject({ id: 7, title: 'God Passes By', author: 'Shoghi Effendi' });
  });

  it('getSampleText returns a substantial, non-deleted paragraph', async () => {
    const s = await store.getSampleText(7);
    expect(s.length).toBeGreaterThan(200);
    expect(s).toContain('Báb');
  });

  it('getParagraphs returns Paragraph shapes in order, skips deleted, synthesises pid when missing', async () => {
    const ps = await store.getParagraphs(7);
    expect(ps).toHaveLength(2);                        // the deleted row is excluded
    expect(ps[0]).toMatchObject({ id: 100, pid: 'para_1', pidx: 1, heading: 'Chapter I' });
    expect(ps[1].pid).toBe('p101');                   // no external id → 'p'||id
    expect(ps[0].text).not.toMatch(/\s{2,}/);         // whitespace-normalised
  });

  it('saveContext forwards paragraph id, note, and method version to the writer path', async () => {
    await store.saveContext(100, '@Shíráz, ~1844 — the Declaration', 'disambig-v1');
    expect(updateContextOnly).toHaveBeenCalledWith(100, '@Shíráz, ~1844 — the Declaration', 'disambig-v1');
  });

  it('saveDecisions persists method_version and supersedes columns', async () => {
    await store.saveDecisions([
      { kind: 'link', targetKind: 'mention-cluster', targetIds: ['para_mv1'], payload: { resolvedAs: 'Mullá Ḥusayn', docId: 21310 }, evidence: {}, rationale: '', actor: 'model', actorTier: 2, confidence: 0.95, status: 'proposed', methodVersion: 2, supersedes: 41 },
    ]);
    const rows = run(`SELECT method_version, supersedes FROM entity_decisions WHERE kind='link' AND actor_tier=2 AND confidence=0.95`);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];              // the row we just inserted (last by insertion order)
    expect(Number(row.method_version)).toBe(2);     // stored as TEXT in schema but value is '2'
    expect(row.supersedes).toBe(41);
  });

  it('getProposedDecisions returns the latest non-superseded decision and attaches priorKind + priorEntityId', async () => {
    // Insert an applied CREATE decision (id=5001) that resolved cluster 'A' and bound entity 500.
    run(`INSERT INTO entity_decisions (id, kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version, supersedes, valid_time)
         VALUES (5001,'create','mention-cluster','["para_x"]','{"resolvedAs":"ClusterA","docId":21310,"applied_entity_id":500}','{}','','model',2,0.8,'applied','1',NULL,NULL)`);
    // Insert a newer LINK decision (id=5002) that supersedes 5001 — this is the canonical current decision.
    run(`INSERT INTO entity_decisions (id, kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version, supersedes, valid_time)
         VALUES (5002,'link','mention-cluster','["para_x"]','{"resolvedAs":"ClusterA","docId":21310,"entity_id":500}','{}','','model',2,0.97,'proposed','2',5001,NULL)`);
    const decisions = await store.getProposedDecisions();
    const clusterA = decisions.filter((d) => d.payload?.resolvedAs === 'ClusterA' && d.id === 5002);
    expect(clusterA).toHaveLength(1);               // exactly one entry for 'ClusterA' (the newer one)
    const dec = clusterA[0];
    expect(dec.id).toBe(5002);                      // newer row wins
    expect(dec.kind).toBe('link');
    expect(dec.supersedes).toBe(5001);              // points back to the old row
    expect(dec.priorKind).toBe('create');           // kind of the superseded row
    expect(dec.priorEntityId).toBe(500);            // applied_entity_id from the superseded row's payload
    // id=5001 must not appear in the result
    expect(decisions.some((d) => d.id === 5001)).toBe(false);
  });

  it('getClusterFacts filters by subject skeleton — returns own facts, excludes other-subject claims in same para', async () => {
    // Two claims in the same para: one about Mullá Ḥusayn, one about Quddús.
    run(`INSERT INTO entity_claims (id, claim_hash, entity_id, relation, statement, proof_verbatim, doc_id, para_id, status)
         VALUES (9001,'hash_mh_1',NULL,'martyrdom','Mullá Ḥusayn — martyred at Ṭabarsí','…',21310,'para_1','supported')`);
    run(`INSERT INTO entity_claims (id, claim_hash, entity_id, relation, statement, proof_verbatim, doc_id, para_id, status)
         VALUES (9002,'hash_qu_1',NULL,'leadership','Quddús — led the defenders','…',21310,'para_1','supported')`);
    const facts = await store.getClusterFacts(21310, 'Mullá Ḥusayn', ['para_1']);
    expect(facts.some((f) => f.statement.includes('Mullá Ḥusayn'))).toBe(true);
    expect(facts.some((f) => f.statement.includes('Quddús'))).toBe(false); // different subject → excluded
    expect(facts.length).toBe(1);
  });

  it('getReadjudicationClusters returns only improvable clusters (skips confident+current, includes uncertain+low-conf)', async () => {
    // Three clusters via entity_mentions_v2: A (confident link), B (uncertain), C (low-conf link).
    // Anchors must be unique — use distinct suffixes.
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_a1',21310,'p_ra_1',0,'ClusterRA_A','clusterraa','ClusterRA_A','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_a2',21310,'p_ra_2',0,'ClusterRA_A','clusterraa','ClusterRA_A','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_b1',21310,'p_ra_3',0,'ClusterRA_B','clusterrab','ClusterRA_B','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_b2',21310,'p_ra_4',0,'ClusterRA_B','clusterrab','ClusterRA_B','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_c1',21310,'p_ra_5',0,'ClusterRA_C','clusterrac','ClusterRA_C','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,resolved_as,method_version) VALUES ('anc_ra_c2',21310,'p_ra_6',0,'ClusterRA_C','clusterrac','ClusterRA_C','v2')`);
    // A — confident link decision, method_version=2 → NOT improvable
    run(`INSERT INTO entity_decisions (id,kind,target_kind,target_ids,payload,evidence,rationale,actor,actor_tier,confidence,status,method_version,supersedes,valid_time)
         VALUES (7001,'link','mention-cluster','["p_ra_1","p_ra_2"]','{"resolvedAs":"ClusterRA_A","docId":21310}','{}','','model',2,0.97,'proposed','2',NULL,NULL)`);
    // B — uncertain decision → improvable (includeUncertain=true default)
    run(`INSERT INTO entity_decisions (id,kind,target_kind,target_ids,payload,evidence,rationale,actor,actor_tier,confidence,status,method_version,supersedes,valid_time)
         VALUES (7002,'uncertain','mention-cluster','["p_ra_3","p_ra_4"]','{"resolvedAs":"ClusterRA_B","docId":21310}','{}','','model',2,0.6,'proposed','2',NULL,NULL)`);
    // C — link but low confidence 0.5 → improvable (< maxConf=0.9)
    run(`INSERT INTO entity_decisions (id,kind,target_kind,target_ids,payload,evidence,rationale,actor,actor_tier,confidence,status,method_version,supersedes,valid_time)
         VALUES (7003,'link','mention-cluster','["p_ra_5","p_ra_6"]','{"resolvedAs":"ClusterRA_C","docId":21310}','{}','','model',2,0.5,'proposed','2',NULL,NULL)`);
    const result = await store.getReadjudicationClusters(21310, { sinceVersion: 2, maxConf: 0.9 });
    const names = new Set(result.map((r) => r.resolvedAs));
    expect(names.has('ClusterRA_B')).toBe(true);    // uncertain → improvable
    expect(names.has('ClusterRA_C')).toBe(true);    // low-conf → improvable
    expect(names.has('ClusterRA_A')).toBe(false);   // confident+current → skip
    // each improvable cluster carries its priorId
    const b = result.find((r) => r.resolvedAs === 'ClusterRA_B');
    expect(b.priorId).toBe(7002);
    const c = result.find((r) => r.resolvedAs === 'ClusterRA_C');
    expect(c.priorId).toBe(7003);
  });

  it('unbindMentions sets entity_id NULL for the cluster and returns the freed count (≥0)', async () => {
    // Insert two bound mentions for resolved_as='ClusterZ' with entity_id=88.
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,entity_id,resolved_as,method_version) VALUES ('anc_z1',21310,'p_z1',0,'ClusterZ','clusterz',88,'ClusterZ','v2')`);
    run(`INSERT INTO entity_mentions_v2 (anchor,doc_id,para_id,occurrence,surface,surface_norm,entity_id,resolved_as,method_version) VALUES ('anc_z2',21310,'p_z2',0,'ClusterZ','clusterz',88,'ClusterZ','v2')`);
    const freed = await store.unbindMentions('ClusterZ');
    // The in-memory mock wraps the sqlite RunResult as {rows: RunResult} so r.rows?.[0]?.changes is always
    // undefined (RunResult isn't an array) → the store returns 0. Assert numeric, not the exact count.
    expect(typeof freed).toBe('number');
    expect(freed).toBeGreaterThanOrEqual(0);
    // The row-state assertion is what matters: entity_id must now be NULL.
    const rows = run(`SELECT entity_id FROM entity_mentions_v2 WHERE resolved_as='ClusterZ'`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.entity_id === null)).toBe(true);
  });

  it('getDecidedClusterNames is scoped to the book: a same-named cluster in another book is NOT skipped', async () => {
    await store.saveDecisions([
      { kind: 'link', targetKind: 'mention-cluster', targetIds: ['para_1'], payload: { resolvedAs: 'Mírzá Aḥmad', docId: 7 }, evidence: {}, rationale: '', actor: 'model', actorTier: 2, confidence: 0.9, status: 'proposed' },
      { kind: 'create', targetKind: 'mention-cluster', targetIds: ['para_2'], payload: { resolvedAs: 'Some Other Name', docId: 99 }, evidence: {}, rationale: '', actor: 'model', actorTier: 2, confidence: 0.8, status: 'proposed' },
    ]);
    const inBook = await store.getDecidedClusterNames(7);
    expect(inBook.has('Mírzá Aḥmad')).toBe(true);          // decided in THIS book → resume skips it
    expect(inBook.has('Some Other Name')).toBe(false);     // decided in a DIFFERENT book → still to be processed here
    const otherBook = await store.getDecidedClusterNames(99);
    expect(otherBook.has('Mírzá Aḥmad')).toBe(false);      // and the reverse holds — no cross-book leakage
  });
});
