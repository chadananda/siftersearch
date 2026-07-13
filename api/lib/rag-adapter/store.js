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

    // Paragraphs that already have ≥1 claim — lets claims(--resume) reprocess only the gaps (crash / throttle).
    async getClaimedParaIds(docId) {
      return (await db.queryAll(`SELECT DISTINCT para_id FROM entity_claims WHERE doc_id=?`, [docId])).map((r) => r.para_id);
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
            AND ge.canonical_name NOT LIKE '%⟨merged%'
          GROUP BY lk.entity_id ORDER BY shared DESC, (ge.importance IS NULL), ge.importance DESC LIMIT ?`,
        [...keys, ...(type ? [type] : []), limit]);
      return rows;
    },

    // Resolve-against-search: evidence from the GROUNDED corpus for an identity decision. "Grounded" = claims
    // already BOUND to an entity (entity_id set only at project, i.e. from prior COMPLETED books — the current
    // book's claims are still unbound during its own reconcile, so they're naturally excluded). Recalls entities
    // two ways so it catches what name-recall alone misses: (a) transliteration-invariant NAME skeleton, (b) a
    // token match on established claim statements (the resolved cluster usually carries a role/epithet — e.g.
    // "…the Báb's amanuensis" surfaces Qazvíní even when the bare name recalls Azghandí). Returns compact,
    // entity-linked facts (≤2 per entity) — retrieve-then-reason, never dumps text.
    async searchGrounded(query, { limit = 6 } = {}) {
      const core = String(query).replace(/\([^)]*\)/g, '').split(/[,;—]| the | who /)[0].trim();
      const keys = [...new Set([query, core].filter(Boolean).flatMap((p) => [...skeletonKeys(p)]))];
      const ids = new Set();
      if (keys.length) (await db.queryAll(
        `SELECT DISTINCT entity_id id FROM entity_lookup_keys WHERE skeleton_key IN (${keys.map(() => '?').join(',')})`, keys
      )).forEach((r) => ids.add(r.id));
      const toks = [...new Set((String(query).toLowerCase().match(/[\p{L}]{4,}/gu) || []))].slice(0, 6);
      if (toks.length) (await db.queryAll(
        `SELECT DISTINCT entity_id id FROM entity_claims WHERE entity_id IS NOT NULL AND (status IS NULL OR status='supported')
           AND (${toks.map(() => 'lower(statement) LIKE ?').join(' OR ')}) LIMIT 40`, toks.map((t) => `%${t}%`)
      )).forEach((r) => ids.add(r.id));
      const idList = [...ids].slice(0, 12);
      if (!idList.length) return [];
      const rows = await db.queryAll(
        `SELECT c.entity_id id, ge.canonical_name name, c.statement fact, c.para_id
           FROM entity_claims c JOIN graph_entities ge ON ge.id=c.entity_id
          WHERE c.entity_id IN (${idList.map(() => '?').join(',')}) AND (c.status IS NULL OR c.status='supported')
          ORDER BY (c.time_value IS NULL), c.time_value`, idList);
      const per = {}, out = [];
      for (const r of rows) {
        if ((per[r.id] = (per[r.id] || 0) + 1) > 2) continue;    // ≤2 distinctive facts per entity
        out.push({ entityId: r.id, name: r.name, fact: r.fact, source: r.para_id });
        if (out.length >= limit) break;
      }
      return out;
    },

    // The book's clusters left UNCERTAIN by reconcile — the research-resolve worklist. Skips clusters already
    // researched (a decision tagged via:'research') so re-runs don't re-research the same figure.
    async getUncertainClusters(docId, { limit = 500 } = {}) {
      const researched = new Set();
      for (const r of await db.queryAll(`SELECT payload FROM entity_decisions WHERE kind IN ('link','create','uncertain','other-type')`)) {
        try { const p = JSON.parse(r.payload || '{}'); if (p.via === 'research' && p.resolvedAs) researched.add(p.resolvedAs); } catch { /* */ }
      }
      const out = [];
      for (const r of await db.queryAll(`SELECT target_ids, payload FROM entity_decisions WHERE kind='uncertain' AND status='proposed'`)) {
        let p = {}; try { p = JSON.parse(r.payload || '{}'); } catch { continue; }
        if (p.docId !== docId || p.via === 'research' || researched.has(p.resolvedAs)) continue;
        let paraIds = []; try { paraIds = JSON.parse(r.target_ids || '[]'); } catch { /* */ }
        out.push({ resolvedAs: p.resolvedAs, paraIds, freq: p.freq });
        if (out.length >= limit) break;
      }
      return out;
    },

    // Full-corpus search (all books) for research-resolve — each hit carries its doc's AUTHORITY (10 - docTier,
    // so higher = more authoritative; GPB/primary highest), plus title + a snippet for the adjudicator.
    async searchCorpus(query, { limit = 6, religion = null } = {}) {
      try {
        const { getMeili, INDEXES } = await import('../search.js');
        const { getDocTier } = await import('../doc-tier.js');
        // Fetch extra when scoping by tradition (post-filter drops cross-tradition hits — a Bible/Qur'án passage
        // that merely shares a name is not this figure). doc_id filterable; religion is post-filtered via the DB.
        const res = await getMeili().index(INDEXES.PARAGRAPHS).search(String(query).slice(0, 120), { limit: religion ? limit * 4 : limit });
        const hits = res.hits || [];
        if (!hits.length) return [];
        const docIds = [...new Set(hits.map((h) => h.doc_id).filter(Boolean))];
        const docs = {};
        if (docIds.length) (await db.queryAll(`SELECT id, title, author, religion, collection FROM docs WHERE id IN (${docIds.map(() => '?').join(',')})`, docIds)).forEach((d) => { docs[d.id] = d; });
        const out = [];
        for (const h of hits) {
          const d = docs[h.doc_id] || {};
          if (religion && d.religion && d.religion !== religion) continue;   // scope to the book's tradition
          let tier = 9; try { tier = getDocTier(d) || 9; } catch { /* */ }
          out.push({ docId: h.doc_id, title: d.title || null, authorityTier: 10 - tier, paraId: h.external_para_id || null, snippet: String(h.text || '').replace(/\s+/g, ' ').slice(0, 200) });
          if (out.length >= limit) break;
        }
        return out;
      } catch { return []; }
    },

    // An entity's distinctive BOUND claims — the dedup-guard's fact query (resolve-by-fact, not by name).
    async getEntityFacts(entityId, { limit = 6 } = {}) {
      const ent = (await db.queryAll(`SELECT id, canonical_name name FROM graph_entities WHERE id=?`, [entityId]))[0];
      if (!ent) return null;
      const facts = await db.queryAll(
        `SELECT statement, relation, time_value AS whenv FROM entity_claims
           WHERE entity_id=? AND (status IS NULL OR status='supported') ORDER BY (time_value IS NULL), time_value LIMIT ?`,
        [entityId, limit]);
      return { id: ent.id, name: ent.name, facts: facts.map((f) => ({ statement: f.statement, relation: f.relation, when: f.whenv })) };
    },

    // Live search-index coverage for the verify gate. Cast + claims come from the DB (bound = grounded); the
    // "actually searchable" checks (paragraphs, HyPE, and probes that a real cast name / HyPE question RETURNS)
    // hit Meili. If Meili is unavailable the searchable counts stay 0 → verify reports "not searchable" (the
    // correct, fail-closed answer). doc_id is the filterable attribute on both indexes.
    async getGroundingCoverage(docId, { probeLimit = 3 } = {}) {
      const castCount = (await db.queryAll(
        `SELECT COUNT(*) n FROM (SELECT entity_id FROM entity_mentions_v2 WHERE doc_id=? AND entity_id IS NOT NULL
           UNION SELECT entity_id FROM entity_claims WHERE doc_id=? AND entity_id IS NOT NULL)`, [docId, docId]))[0]?.n || 0;
      const claimCount = (await db.queryAll(`SELECT COUNT(*) n FROM entity_claims WHERE doc_id=?`, [docId]))[0]?.n || 0;
      let paragraphsIndexed = 0, hypeIndexed = 0; const probes = [];
      try {
        const { getMeili, INDEXES } = await import('../search.js');
        const meili = getMeili();
        const filt = `doc_id = ${Number(docId)}`;
        paragraphsIndexed = (await meili.index(INDEXES.PARAGRAPHS).search('', { filter: filt, limit: 1 })).estimatedTotalHits || 0;
        hypeIndexed = (await meili.index(INDEXES.HYPE_QUESTIONS).search('', { filter: filt, limit: 1 })).estimatedTotalHits || 0;
        const names = (await db.queryAll(
          `SELECT ge.canonical_name name FROM entity_claims c JOIN graph_entities ge ON ge.id=c.entity_id
            WHERE c.doc_id=? AND c.entity_id IS NOT NULL GROUP BY c.entity_id ORDER BY COUNT(*) DESC LIMIT ?`, [docId, probeLimit])).map((r) => r.name);
        for (const name of names) {
          const hits = (await meili.index(INDEXES.PARAGRAPHS).search(name, { filter: filt, limit: 1 })).estimatedTotalHits || 0;
          probes.push({ kind: 'cast', query: name, hits });
        }
        const hq = (await db.queryAll(`SELECT hyp_questions FROM content WHERE doc_id=? AND hyp_questions IS NOT NULL AND hyp_questions!='' LIMIT 1`, [docId]))[0]?.hyp_questions;
        if (hq) {
          let q = String(hq);
          try { const a = JSON.parse(hq); if (Array.isArray(a) && a.length) q = typeof a[0] === 'string' ? a[0] : (a[0].question || a[0].q || q); } catch { q = q.split('\n')[0]; }
          const hits = (await meili.index(INDEXES.HYPE_QUESTIONS).search(q.slice(0, 120), { filter: filt, limit: 1 })).estimatedTotalHits || 0;
          probes.push({ kind: 'hype', query: q.slice(0, 80), hits });
        }
      } catch { /* Meili unavailable → 0s → verify fails closed */ }
      return { castCount, claimCount, hypeIndexed, paragraphsIndexed, probes };
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
          payload: { resolvedAs: p.resolvedAs ?? p.resolved_as, entityId: p.entityId ?? p.entity_id ?? null, canonical: p.canonical ?? null, type: p.type ?? 'person', freq: p.freq, docId: p.docId ?? p.doc_id ?? null } };
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

    // Clear a doc's prior lexicon entries (same method version) — makes lexicon.seed idempotent on re-run.
    async clearLexicon(docId, methodVersion) {
      await db.query(`DELETE FROM concept_lexicon WHERE proof_doc_id=? AND method_version=?`, [docId, methodVersion]);
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
          WHERE ge.entity_type=? AND ge.canonical_name NOT LIKE '%⟨merged%'`, [type]); // exclude already-merged (dead) entities
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
