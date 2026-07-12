// SifterSearch Store adapter — implements the CorpusRAG `Store` port (see api/lib/rag/ports.js) over the
// application's SQLite schema. THIS is where every table and column name lives; the library core sees only
// the neutral domain shapes returned here. Writes go through db.js, which auto-routes them to the single
// writer when SIFTER_WRITER_URL is set. Grown method-by-method as stages need data.
import * as db from '../db.js';           // shared SQLite wrapper (reads direct, writes routed to the single writer)
import content from '../content.js';      // paragraph write helpers (updateContextOnly routes through the writer)
import { skeletonKeys } from '../translit-key.js'; // transliteration-invariant recall keys (Sadeq→Ṣádiq…)

// Blocktypes that carry readable prose we enrich (skip figures, nav, etc.). App-specific → stays here.
const PROSE = "blocktype IN ('paragraph','quote')";

export function makeStore() {
  return {
    // Document metadata for profiling. Maps DB columns → the port's neutral DocMeta shape.
    async getDocMeta(docId) {
      return (await db.queryAll(
        `SELECT id, title, author, religion, collection, year, description FROM docs WHERE id=?`, [docId]
      ))[0] || { id: docId };
    },

    // A representative paragraph — the script sample that drives language detection.
    async getSampleText(docId) {
      return (await db.queryAll(
        `SELECT text FROM content WHERE doc_id=? AND ${PROSE} AND deleted_at IS NULL AND length(text)>200
           ORDER BY paragraph_index LIMIT 1`, [docId]
      ))[0]?.text || '';
    },

    // All enrichable paragraphs in reading order, as the port's Paragraph shape. `pid` is the stable public
    // ref (OceanLibrary external id where present, else a synthetic 'p'||id). Includes the existing context
    // note so a stage can resume idempotently.
    async getParagraphs(docId) {
      const rows = await db.queryAll(
        `SELECT id, COALESCE(external_para_id, 'p' || id) pid, paragraph_index pidx, heading, blocktype AS kind, text,
                context, context_model AS contextModel, hyp_questions AS hyp, hyp_thesis AS hypThesis
           FROM content WHERE doc_id=? AND deleted_at IS NULL AND ${PROSE} ORDER BY paragraph_index`, [docId]);
      return rows.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() }));
    },

    // Persist a disambiguation note against a paragraph, tagged with the method version (routed to the writer).
    async saveContext(paragraphId, note, methodVersion) {
      await content.updateContextOnly(paragraphId, note, methodVersion);
    },

    // Persist HyPE questions (array) + thesis for a paragraph; flags the row for Meili re-index.
    async saveHype(paragraphId, questions, thesis) {
      await content.updateHype(paragraphId, questions, thesis);
    },

    // Persist source-anchored mentions (INSERT OR IGNORE on the stable anchor). entity_id stays NULL —
    // identity is bound later by evidence at reconcile, never here. Returns the count offered.
    async saveMentions(mentions) {
      if (!mentions.length) return 0;
      const stmts = mentions.map((m) => ({
        sql: `INSERT OR IGNORE INTO entity_mentions_v2
                (anchor,doc_id,para_id,occurrence,surface,surface_norm,entity_id,resolved_as,resolution_basis,resolution_conf,method_version,model)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [m.anchor, m.docId, m.paraId, m.occurrence, m.surface, m.surfaceNorm, null, m.resolvedAs, 'note-deferred', null, m.methodVersion, m.methodVersion],
      }));
      await db.transaction(stmts);
      return mentions.length;
    },

    // The controlled relation vocabulary the claims prompt constrains to.
    async getRelations() {
      return db.queryAll(`SELECT key, label FROM relations ORDER BY category, key`);
    },

    // Persist cited claims (INSERT OR IGNORE on the content-addressed claim_hash). entity_id/target stay NULL
    // (deferred to reconcile). Returns the count offered.
    async saveClaims(rows) {
      if (!rows.length) return 0;
      const stmts = rows.map((c) => ({
        sql: `INSERT OR IGNORE INTO entity_claims
                (claim_hash, entity_id, relation, target_entity_id, statement, proof_verbatim, doc_id, para_id,
                 time_value, time_precision, time_basis, time_anchor, semantic_key, method_version, extractor_version,
                 confidence, status, proof_ok, import_batch)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [c.claimHash, null, c.relation, null, c.statement, c.proofVerbatim, c.docId, c.paraId,
          c.timeValue, c.timePrecision, c.timeBasis, c.timeAnchor, c.semanticKey, c.methodVersion, c.extractor,
          c.confidence, c.status, c.proofOk, c.batch],
      }));
      await db.transaction(stmts);
      return rows.length;
    },

    // Fraction of a doc's prose paragraphs that carry a disambiguation note — the gate's input.
    async getDisambigCoverage(docId) {
      const r = (await db.queryAll(
        `SELECT COUNT(*) total, SUM(CASE WHEN context IS NOT NULL AND context!='' THEN 1 ELSE 0 END) done
           FROM content WHERE doc_id=? AND deleted_at IS NULL AND ${PROSE}`, [docId]
      ))[0];
      return r?.total ? r.done / r.total : 1;
    },

    // The book's cumulative who's-who, grounding identity in the disambiguation prompt. Best-effort — the
    // cast builder is legacy tooling; absence just means a leaner prompt, never a failure.
    async getCastSeed(docId) {
      try { const { buildCastSeed } = await import('../../../scripts/entity-read/cast-seed.mjs'); return (await buildCastSeed(docId)).seed || ''; }
      catch { return ''; }
    },

    // Resolved names that already carry a reconcile decision — so a resumed batch skips them (idempotent).
    async getDecidedClusterNames() {
      const rows = await db.queryAll(`SELECT payload FROM entity_decisions WHERE target_kind='mention-cluster'`);
      const s = new Set();
      for (const r of rows) { try { const p = JSON.parse(r.payload || '{}'); const n = p.resolvedAs ?? p.resolved_as; if (n) s.add(n); } catch { /* */ } }
      return s;
    },

    // Mention-clusters for reconcile: distinct resolved names in the book with frequency + the paragraphs
    // they occur in. Skips unresolved '?' and non-id roster markers.
    async getMentionClusters(docId, { minFreq = 1, filter, limit } = {}) {
      const params = [docId];
      let where = `doc_id=? AND resolved_as IS NOT NULL AND resolved_as NOT LIKE '%not given%' AND resolved_as NOT LIKE '%?%'`;
      if (filter) { where += ` AND resolved_as LIKE ?`; params.push(`%${filter}%`); }
      let rows = await db.queryAll(`SELECT resolved_as, COUNT(*) freq, GROUP_CONCAT(DISTINCT para_id) paras
        FROM entity_mentions_v2 WHERE ${where} GROUP BY resolved_as ORDER BY freq DESC`, params);
      rows = rows.filter((r) => r.freq >= minFreq);
      if (limit) rows = rows.slice(0, limit);
      return rows.map((r) => ({ resolvedAs: r.resolved_as, freq: r.freq, paraIds: String(r.paras).split(',') }));
    },

    // Candidate entities by transliteration-invariant name recall (RECALL ONLY — the caller binds by
    // evidence, never by this list). Recalls on BOTH the full resolved string AND its core name (before any
    // parenthetical/descriptor) — else a long "Name (the … leader, successor of …)" dilutes the skeleton and
    // misses the existing entity (seen live: Siyyid Káẓim-i-Rashtí wrongly proposed as a create).
    async findCandidateEntities(name, { type = 'person', limit = 6 } = {}) {
      // Recall on the full string, the core name (before any parenthetical), AND the parenthetical alias —
      // an entity may be stored under either form ("Áqáy-i-Kalím" vs its alias "Mírzá Músá").
      const core = String(name).replace(/\([^)]*\)/g, '').split(/[,;—]| the | who | a /)[0].trim();
      const paren = (String(name).match(/\(([^)]+)\)/g) || []).map((s) => s.replace(/[()]/g, '')).join(' ');
      const keys = [...new Set([name, core, paren].filter(Boolean).flatMap((p) => [...skeletonKeys(p)]))];
      if (!keys.length) return [];
      const rows = await db.queryAll(
        `SELECT lk.entity_id id, ge.canonical_name canonical, ge.entity_type type, ge.importance importance,
                er.summary, COUNT(DISTINCT lk.skeleton_key) shared
           FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
           LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
          WHERE lk.skeleton_key IN (${keys.map(() => '?').join(',')})${type ? ' AND ge.entity_type=?' : ''}
          GROUP BY lk.entity_id ORDER BY shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT ?`,
        [...keys, ...(type ? [type] : []), limit]);
      return rows;
    },

    // Representative disambiguation notes for a set of paragraphs (the reconcile dossier).
    async getScenes(docId, paraIds) {
      if (!paraIds.length) return [];
      const rows = await db.queryAll(
        `SELECT external_para_id pid, context FROM content WHERE doc_id=? AND external_para_id IN (${paraIds.map(() => '?').join(',')})`,
        [docId, ...paraIds]);
      return rows;
    },

    // Append proposed reconcile decisions to the immutable decision log (never edits the projection).
    async saveDecisions(decisions) {
      if (!decisions.length) return 0;
      const stmts = decisions.map((d) => ({
        sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, valid_time)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [d.kind, d.targetKind, JSON.stringify(d.targetIds), JSON.stringify(d.payload), JSON.stringify(d.evidence), d.rationale, d.actor, d.actorTier, d.confidence, d.status, null],
      }));
      await db.transaction(stmts);
      return decisions.length;
    },

    // Mention-cluster decisions with payload normalised to the library's shape (tolerates the legacy
    // snake_case payload from the pre-library reconcile prototype).
    async getProposedDecisions() {
      const rows = await db.queryAll(`SELECT id, kind, status, confidence, payload FROM entity_decisions WHERE target_kind='mention-cluster'`);
      return rows.map((r) => {
        let p = {};
        try { p = JSON.parse(r.payload || '{}'); } catch { /* */ }
        return { id: r.id, kind: r.kind, status: r.status, confidence: r.confidence,
          payload: { resolvedAs: p.resolvedAs ?? p.resolved_as, entityId: p.entityId ?? p.entity_id ?? null, canonical: p.canonical ?? null, type: p.type ?? 'person', freq: p.freq } };
      });
    },

    // Mint a new (bare) entity as a projection — invisible to the live browser until enriched. Returns its id.
    async createEntity(canonical, type = 'person') {
      const r = await db.query(`INSERT INTO graph_entities (name, canonical_name, entity_type, last_assessed_version) VALUES (?,?,?,?)`, [canonical, canonical, type, 'reconcile-v1']);
      return r.lastInsertRowid;
    },

    // Bind an entire resolved-name cluster to an entity (the projection set by an applied decision). Returns rows bound.
    async bindMentions(resolvedAs, entityId, conf) {
      const r = await db.query(`UPDATE entity_mentions_v2 SET entity_id=?, resolution_basis='reconcile', resolution_conf=? WHERE resolved_as=?`, [entityId, conf, resolvedAs]);
      return r.rows?.[0]?.changes ?? 0;
    },

    // Mark a decision applied + record which entity it resolved to (reversible provenance).
    async markDecisionApplied(id, entityId) {
      await db.query(`UPDATE entity_decisions SET status='applied', payload=json_set(COALESCE(payload,'{}'),'$.applied_entity_id',?) WHERE id=?`, [entityId, id]);
    },

    // Persist cited concept claims (INSERT OR IGNORE on claim_hash). concept_id stays NULL (deferred to
    // concept reconcile). Stores the concept name (subject) + original-language root for later binding.
    async saveConceptClaims(rows) {
      if (!rows.length) return 0;
      const stmts = rows.map((c) => ({
        sql: `INSERT OR IGNORE INTO concept_claims
                (claim_hash, concept_id, subject, root, relation, target, statement, proof_verbatim, doc_id, para_id,
                 semantic_key, method_version, extractor_version, confidence, status, proof_ok, import_batch)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [c.claimHash, null, c.concept, c.root, c.relation, c.target, c.statement, c.proofVerbatim, c.docId, c.paraId,
          c.semanticKey, c.methodVersion, c.extractor, c.confidence, c.status, c.proofOk, c.batch],
      }));
      await db.transaction(stmts);
      return rows.length;
    },

    // A concept entity (for the interfaith link stage).
    async getConcept(id) {
      return (await db.queryAll(`SELECT id, canonical, root, tradition, summary FROM concept_entities WHERE id=?`, [id]))[0] || { id };
    },

    // Persist interfaith concept links (analogical / authoritative-bridge). Entities stay distinct.
    async saveConceptLinks(links) {
      if (!links.length) return 0;
      const stmts = links.map((l) => ({
        sql: `INSERT INTO concept_links (a_concept_id, b_concept_id, link_type, authority, proof_verbatim, rationale) VALUES (?,?,?,?,?,?)`,
        args: [l.aConceptId, l.bConceptId, l.linkType, l.authority, l.proofVerbatim, l.rationale],
      }));
      await db.transaction(stmts);
      return links.length;
    },

    // Interpretation claims (a higher text's stated meaning of a symbol) — the lexicon seed input.
    async getConceptInterpretations(docId) {
      return db.queryAll(
        `SELECT subject, relation, target, statement, proof_verbatim, para_id, doc_id FROM concept_claims
          WHERE doc_id=? AND relation IN ('means','interprets','symbolizes','is-station-of','fulfills')`, [docId]);
    },

    // Persist authority-ranked, cited lexicon entries (the cumulative interpretive seed).
    async saveLexiconEntries(entries) {
      if (!entries.length) return 0;
      const stmts = entries.map((e) => ({
        sql: `INSERT INTO concept_lexicon (symbol, interpretation, authority, authority_tier, layer, proof_doc_id, proof_para_id, proof_verbatim, method_version)
              VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [e.symbol, e.interpretation, e.authority, e.authorityTier, e.layer, e.proofDocId, e.proofParaId, e.proofVerbatim, e.methodVersion],
      }));
      await db.transaction(stmts);
      return entries.length;
    },

    // Concept-claim occurrences grouped by symbol (subject) for concept reconcile — each with its claim ids
    // and paragraphs. Only unbound (concept_id NULL).
    async getConceptGroups(docId, { limit } = {}) {
      const rows = await db.queryAll(`SELECT id, subject, para_id FROM concept_claims WHERE doc_id=? AND concept_id IS NULL AND subject IS NOT NULL`, [docId]);
      const g = {};
      for (const r of rows) { const k = r.subject; (g[k] = g[k] || { symbol: k, occurrences: [], paraIds: [] }); g[k].occurrences.push(r.id); if (r.para_id) g[k].paraIds.push(r.para_id); }
      let out = Object.values(g);
      if (limit) out = out.slice(0, limit);
      return out;
    },

    // Lexicon interpretations for a symbol, authority-ranked (lower tier = higher authority).
    async findLexiconEntries(symbol, { limit = 5 } = {}) {
      return db.queryAll(
        `SELECT id, interpretation, authority, authority_tier AS authorityTier, layer FROM concept_lexicon
          WHERE symbol=? OR symbol LIKE ? ORDER BY (authority_tier IS NULL), authority_tier LIMIT ?`,
        [symbol, `%${symbol}%`, limit]);
    },

    // Append proposed concept decisions (bind/under-bind) to the concept decision log.
    async saveConceptDecisions(decisions) {
      if (!decisions.length) return 0;
      const stmts = decisions.map((d) => ({
        sql: `INSERT INTO concept_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, valid_time)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [d.kind, d.targetKind, JSON.stringify(d.targetIds), JSON.stringify(d.payload), JSON.stringify(d.evidence), d.rationale, d.actor, d.actorTier, d.confidence, d.status, null],
      }));
      await db.transaction(stmts);
      return decisions.length;
    },

    // Same-name entity groups (exact normalized canonical) for the dedup stage — each with mention count +
    // summary + a few facts so the adjudicator can judge same-person vs namesake by evidence.
    async getDuplicateGroups({ type = 'person', minSize = 2, limit } = {}) {
      const ents = await db.queryAll(
        `SELECT ge.id, ge.canonical_name canonical, er.summary,
                (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
           FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
          WHERE ge.entity_type=?`, [type]);
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const groups = {};
      for (const e of ents) { const k = norm(e.canonical); if (!k) continue; (groups[k] = groups[k] || []).push(e); }
      let out = Object.entries(groups).filter(([, es]) => es.length >= minSize)
        .map(([key, es]) => ({ key, ids: es.map((e) => e.id), entities: es.sort((a, b) => b.mentions - a.mentions) }));
      out.sort((a, b) => b.entities[0].mentions - a.entities[0].mentions);   // richest groups first
      if (limit) out = out.slice(0, limit);
      return out;
    },

    // Merge: repoint mentions + claims from the merged ids onto the canonical, record an append-only merge
    // decision (reversible), and mark the merged graph_entities rows (canonical_name suffixed) so the bio
    // browser stops surfacing them. Returns count merged.
    async applyMerge(canonicalId, mergeIds, reason) {
      if (!mergeIds.length) return 0;
      const ph = mergeIds.map(() => '?').join(',');
      await db.transaction([
        { sql: `UPDATE entity_mentions_v2 SET entity_id=? WHERE entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE entity_claims SET entity_id=? WHERE entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE entity_claims SET target_entity_id=? WHERE target_entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE graph_entities SET canonical_name=canonical_name||' ⟨merged→${canonicalId}⟩' WHERE id IN (${ph})`, args: mergeIds },
        { sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, rationale, actor, actor_tier, status, valid_time) VALUES ('merge','entity',?,?,?, 'model', 2, 'applied', NULL)`,
          args: [JSON.stringify(mergeIds), JSON.stringify({ canonical: canonicalId, merged: mergeIds }), reason || null] },
      ]);
      return mergeIds.length;
    },
  };
}
