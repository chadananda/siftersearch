// SifterSearch Store adapter — implements the CorpusRAG `Store` port (see api/lib/rag/ports.js) over the
// application's SQLite schema. THIS is where every table and column name lives; the library core sees only
// the neutral domain shapes returned here. Writes go through db.js, which auto-routes them to the single
// writer when SIFTER_WRITER_URL is set. Grown method-by-method as stages need data.
import * as db from '../db.js';           // shared SQLite wrapper (reads direct, writes routed to the single writer)
import content from '../content.js';      // paragraph write helpers (updateContextOnly routes through the writer)
import { skeletonKeys, nameKeys, arabicKeys } from '../translit-key.js'; // recall keys: translit skeletons ∪ Arabic-script keys (Persian docs)
import { loadGazetteer, anchorFor, guardedPair } from './gazetteer.js'; // central-cast identity anchor + ≠guards
import { DISAMB_DONE_SQL } from '../pipeline/processed.js';
import { INTERPRETATION_RELATIONS, unknownRelations } from '../rag/concepts/relations.js';
import { LIVE_SQL, tombstoneFor, retiredStamp } from '../entity-live.js';

// One record's rows for the lookup index — the SAME keys and folding as scripts/entity-read/build-lookup-index.mjs
// (nameKeys = transliteration skeletons ∪ Arabic-script keys), so a record indexed here is found exactly as a rebuilt one.
const lookupNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
export function lookupKeyRows(id, surface, type, importance, isCanonical) {
  return [...new Set(nameKeys(surface))].map((k) => ({ sql: `INSERT INTO entity_lookup_keys (skeleton_key, entity_id, surface, surface_norm, is_canonical, entity_type, importance) VALUES (?,?,?,?,?,?,?)`,
    args: [k, id, surface, lookupNorm(surface), isCanonical, type, importance ?? null] }));
} // ONE definition of live/merged — never inline it

// Blocktypes that carry readable prose we enrich (skip figures, nav, etc.). App-specific → stays here.
const PROSE = "blocktype IN ('paragraph','quote')";

// Gazetteer path (env-overridable). Absent file → empty gazetteer → recall unchanged (graceful).
const GAZETTEER_PATH = process.env.SIFTER_GAZETTEER || 'data/siftersearch-gazetteer.json';

export function makeStore() {
  return {
    // Follow duplicate_of to the copy that actually holds the text — the ONE owner of that rule is
    // docs-repo, never a second implementation here.
    async resolveCanonicalDoc(docId) {
      const { resolveCanonical } = await import('../docs-repo.js');
      const r = await resolveCanonical(docId);
      return r?.resolved ?? Number(docId);
    },

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
                context, context_model AS contextModel, hyp_questions AS hyp, hyp_thesis AS hypThesis, hyp_model AS hypModel,
                original_text AS original, original_lang AS originalLang, translation_authority AS translationAuthority
           FROM content WHERE doc_id=? AND deleted_at IS NULL AND ${PROSE} ORDER BY paragraph_index`, [docId]);
      return rows.map((p) => ({ ...p, text: String(p.text).replace(/\s+/g, ' ').trim() }));
    },

    // Persist a disambiguation note against a paragraph, tagged with the method version (routed to the writer).
    async saveContext(paragraphId, note, methodVersion) {
      await content.updateContextOnly(paragraphId, note, methodVersion);
    },

    // Stamp the paragraphs extraction PROCESSED, at the extractor's version. The mentions stage writes this
    // for every paragraph it read — including the ones that named nobody — because completion is the pass
    // having run, not the rows it produced (see pipeline/processed.js).
    async markExtracted(paragraphIds, version) {
      await content.markExtracted(paragraphIds, version);
    },

    // Persist HyPE questions (array) + thesis for a paragraph, stamped with the generator version
    // (hyp_model — mirrors context_model); flags the row for Meili re-index.
    async saveHype(paragraphId, questions, thesis, version) {
      await content.updateHype(paragraphId, questions, thesis, version);
    },

    // Cited claims per paragraph — the knowledge feed for fact-informed HyPE (retrieval stage's optional
    // getParaClaims port). Keyed by the same pid shape getParagraphs uses. Live (non-superseded) claims only;
    // statements truncated to prompt-friendly length.
    async getParaClaims(docId) {
      const rows = await db.queryAll(
        `SELECT para_id pid, statement FROM entity_claims
          WHERE doc_id=? AND superseded_at IS NULL AND statement IS NOT NULL AND statement != ''
          ORDER BY para_id, id`, [docId]);
      const byPara = {};
      for (const r of rows) (byPara[r.pid] ||= []).push(String(r.statement).slice(0, 140));
      return byPara;
    },

    // Persist promoted concept records. FULL REBUILD, not an append: promotion is deterministic, so
    // re-running must converge rather than accumulate duplicates. concept_entities had never held a row
    // before this — nothing wrote it (verified 2026-08-20), which is why entities was 0 and concepts/link
    // could never bind anything.
    async saveConceptEntities(concepts) {
      if (!concepts?.length) return 0;
      const stmts = [{ sql: `DELETE FROM concept_entities`, args: [] }];
      for (const c of concepts) {
        stmts.push({
          sql: `INSERT INTO concept_entities (canonical, root, renderings, concept_type, tradition, importance, summary, last_assessed_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [c.canonical, c.root ?? null, JSON.stringify(c.renderings || []), c.concept_type || 'concept',
            c.tradition ?? null, c.importance ?? null, c.summary ?? null, 'promote-v1'],
        });
      }
      await db.transaction(stmts);   // same batch writer every other save port uses; routes to the single writer
      return concepts.length;
    },

    // Concept claims per paragraph — the CONCEPT twin of getParaClaims, and the port that lets HyPE ask about
    // what a doctrinal passage MEANS rather than paraphrase its wording (conceptual-track §7). Same keying as
    // getParagraphs uses, so retrieval can look up by pid. Renders subject/relation/target into one readable
    // line because that is what the prompt consumes.
    //
    // Returns {} until concepts/extract has run on the doc, which is exactly right: the port is optional and
    // an empty result leaves every existing book's prompt byte-identical.
    async getParaConceptClaims(docId) {
      const rows = await db.queryAll(
        `SELECT para_id pid, subject, relation, target, statement FROM concept_claims
          WHERE doc_id=? AND para_id IS NOT NULL AND status != 'rejected'
          ORDER BY para_id, id`, [docId]);
      const byPara = {};
      for (const r of rows) {
        const line = r.subject && r.target ? `${r.subject} ${r.relation || '—'} ${r.target}` : (r.statement || '');
        if (line) (byPara[r.pid] ||= []).push(String(line).slice(0, 180));
      }
      return byPara;
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
    // (deferred to reconcile). hay_folded = diacritic/apostrophe-folded statement+proof, the bio-search
    // SQL-prefilter key (matches bio.js fold() exactly — divergence breaks transliteration-invariant search).
    // Returns the count offered.
    async saveClaims(rows) {
      if (!rows.length) return 0;
      const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
      const stmts = rows.map((c) => ({
        sql: `INSERT OR IGNORE INTO entity_claims
                (claim_hash, entity_id, relation, target_entity_id, statement, proof_verbatim, doc_id, para_id,
                 time_value, time_precision, time_basis, time_anchor, semantic_key, method_version, extractor_version,
                 confidence, status, proof_ok, import_batch, hay_folded)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [c.claimHash, null, c.relation, null, c.statement, c.proofVerbatim, c.docId, c.paraId,
          c.timeValue, c.timePrecision, c.timeBasis, c.timeAnchor, c.semanticKey, c.methodVersion, c.extractor,
          c.confidence, c.status, c.proofOk, c.batch, fold(`${c.statement} ${c.proofVerbatim || ''}`)],
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
      // DONE = every prose paragraph was PROCESSED by disambiguation, NOT that it produced an entity.
      // The stage writes context='' for a paragraph it examined and found nothing to disambiguate — a
      // VALID complete result. Measuring `context!=''` (entity yield) wrongly brands entity-sparse or
      // low-name paragraphs incomplete, so such a book never reaches the gate threshold and re-runs
      // forever. `context IS NOT NULL` = "the stage ran here"; NULL = "not yet processed".
      const r = (await db.queryAll(
        `SELECT COUNT(*) total, SUM(CASE WHEN ${DISAMB_DONE_SQL} THEN 1 ELSE 0 END) done
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

    // Resolved names that already carry a reconcile decision IN THIS BOOK — so a resumed batch skips them
    // (idempotent). Scoped by docId: the same name in another book is a DIFFERENT cluster (different scenes,
    // possibly a different person) and must get its own decision, so a global skip would drop real work.
    async getDecidedClusterNames(docId) {
      const rows = await db.queryAll(`SELECT payload FROM entity_decisions WHERE target_kind='mention-cluster'`);
      const s = new Set();
      for (const r of rows) {
        try {
          const p = JSON.parse(r.payload || '{}');
          if (docId != null && (p.docId ?? p.doc_id) !== docId) continue;
          const n = p.resolvedAs ?? p.resolved_as; if (n) s.add(n);
        } catch { /* */ }
      }
      return s;
    },

    // Mention-clusters for reconcile: distinct resolved names in the book with frequency + the paragraphs
    // they occur in. Skips unresolved '?' and non-id roster markers.
    async getMentionClusters(docId, { minFreq = 1, filter, limit } = {}) {
      // arabic_form = the cluster's original Perso-Arabic surface (longest = most complete name), pulled from
      // entity_mentions_v2.surface. For Persian docs this is the STABLE identity key (transliteration is a lossy
      // model derivative); reconcile shows it to the model + recalls candidates by it. Null for Latin-only books.
      const params = [docId, docId];
      let where = `m.doc_id=? AND m.resolved_as IS NOT NULL AND m.resolved_as NOT LIKE '%not given%' AND m.resolved_as NOT LIKE '%?%'`;
      if (filter) { where += ` AND m.resolved_as LIKE ?`; params.push(`%${filter}%`); }
      let rows = await db.queryAll(`SELECT m.resolved_as, COUNT(*) freq, GROUP_CONCAT(DISTINCT m.para_id) paras,
        (SELECT s.surface FROM entity_mentions_v2 s WHERE s.resolved_as=m.resolved_as AND s.doc_id=? AND s.surface GLOB '*[؀-ۿ]*' ORDER BY length(s.surface) DESC LIMIT 1) arabic_form
        FROM entity_mentions_v2 m WHERE ${where} GROUP BY m.resolved_as ORDER BY freq DESC`, params);
      rows = rows.filter((r) => r.freq >= minFreq);
      if (limit) rows = rows.slice(0, limit);
      return rows.map((r) => ({ resolvedAs: r.resolved_as, freq: r.freq, paraIds: String(r.paras).split(','), arabicForm: r.arabic_form || null }));
    },

    // Candidate entities by transliteration-invariant name recall (RECALL ONLY — the caller binds by
    // evidence, never by this list). Recalls on BOTH the full resolved string AND its core name (before any
    // parenthetical/descriptor) — else a long "Name (the … leader, successor of …)" dilutes the skeleton and
    // misses the existing entity (seen live: Siyyid Káẓim-i-Rashtí wrongly proposed as a create).
    async findCandidateEntities(name, { type = 'person', limit = 6, arabicForm = null } = {}) {
      // Recall on the full string, the core name (before any parenthetical), the parenthetical alias, AND (for
      // Persian clusters) the original Arabic-script surface — an entity may be stored under either form, and the
      // Arabic key matches an entity that carries an Arabic alias regardless of transliteration divergence.
      const core = String(name).replace(/\([^)]*\)/g, '').split(/[,;—]| the | who | a /)[0].trim();
      const paren = (String(name).match(/\(([^)]+)\)/g) || []).map((s) => s.replace(/[()]/g, '')).join(' ');
      const keys = [...new Set([name, core, paren, arabicForm].filter(Boolean).flatMap((p) => [...nameKeys(p)]))];
      if (!keys.length) return [];
      const recall = (ks, order, n) => (ks.length ? db.queryAll(
        `SELECT lk.entity_id id, ge.canonical_name canonical, ge.entity_type type, ge.importance importance,
                er.summary, er.aliases aliases, COUNT(DISTINCT lk.skeleton_key) shared
           FROM entity_lookup_keys lk JOIN graph_entities ge ON ge.id=lk.entity_id
           LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
          WHERE lk.skeleton_key IN (${ks.map(() => '?').join(',')})${type ? ' AND ge.entity_type=?' : ''}
            AND ${LIVE_SQL('ge.')}
          GROUP BY lk.entity_id ORDER BY ${order} LIMIT ?`,
        [...ks, ...(type ? [type] : []), n]) : Promise.resolve([]));
      // Live only (entity-live.js): the old name-marker test let a TOMBSTONED duplicate — merged minutes earlier —
      // be offered as a candidate, so reconcile could link new mentions to a dead entity.
      // CORE NAME FIRST. Ranking only by keys shared with the WHOLE string let a descriptor's words out-vote the
      // name: for "the Báb (the Remembrance of God)" six earlier Báb duplicates + "the Maid of Heaven" filled the
      // list, the Báb (importance 100) was cut off, and 66 of 81 duplicates of prominent people were created that
      // way (duplicate-origins, 2026-09-26). The bearers of the core name (and of each parenthetical name) that
      // match ALL its keys come first by prominence; the whole-string recall fills the rest.
      const nameParts = [core, ...(String(name).match(/\(([^)]+)\)/g) || []).map((x) => x.replace(/[()]/g, ''))].filter(Boolean);
      const coreRows = [];
      for (const part of nameParts) {
        const pk = [...nameKeys(part)];
        const hit = await recall(pk, '(ge.importance IS NULL), ge.importance DESC', Math.ceil(limit / 2) + 12);
        // An entity whose own core name IS this name ("Muḥammad") outranks a compound that contains it
        // ("Siyyid ‘Alí-Muḥammad"); prominence orders within each.
        const same = (r) => [...nameKeys(String(r.canonical).replace(/\([^)]*\)/g, '').split(/[,;—]/)[0])].sort().join() === [...pk].sort().join();
        const full = hit.filter((r) => r.shared >= pk.length);
        coreRows.push(...[...full.filter(same), ...full.filter((r) => !same(r))].slice(0, Math.ceil(limit / 2)));
      }
      const fullRows = await recall(keys, 'shared DESC, (ge.importance IS NULL), ge.importance DESC', limit);
      let rows = [];
      for (const r of [...coreRows, ...fullRows]) if (!rows.some((x) => x.id === r.id)) rows.push(r);
      // Gazetteer boost: a central-cast form (title/epithet/nisba) must recall the SAME anchor entity as its
      // name (anti-split). If `name` folds to an anchor, ensure that entity is present and FIRST. And drop any
      // candidate the ≠guards mark as a distinct namesake of the query name OR its resolved anchor (never
      // re-merged) — guards are keyed to canonical names, so a form-query must guard by the anchor too.
      const gaz = loadGazetteer(GAZETTEER_PATH);
      // The whole string, else its core or any parenthetical name ("… (the Báb)") may be a gazetteer form.
      const anchor = anchorFor(gaz, name) || nameParts.map((p) => anchorFor(gaz, p)).find(Boolean) || null;
      if (anchor) {
        const existing = rows.find((r) => r.id === anchor.id);
        rows = rows.filter((r) => r.id !== anchor.id);
        const head = existing || (await db.queryAll(
          `SELECT ge.id id, ge.canonical_name canonical, ge.entity_type type, ge.importance importance, er.summary, er.aliases aliases
             FROM graph_entities ge
             LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
            WHERE ge.id=? AND ${LIVE_SQL('ge.')}`, [anchor.id]))[0];
        if (head) rows.unshift({ ...head, shared: head.shared ?? 0 });
      }
      if (gaz.guards?.length) {
        const names = [name, anchor?.canonical].filter(Boolean);
        rows = rows.filter((r) => r.id === anchor?.id || !names.some((n) => guardedPair(gaz, n, r.canonical)));
      }
      // Surface the candidate's own Arabic-script alias (if it carries one) so reconcile can compare Arabic-to-Arabic.
      return rows.slice(0, limit).map(({ aliases, ...r }) => {
        let arabicForm = null;
        try { const a = JSON.parse(aliases || '[]'); if (Array.isArray(a)) arabicForm = a.find((x) => /[؀-ۿ]/.test(String(x))) || null; } catch { /* */ }
        return { ...r, arabicForm };
      });
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
        `SELECT statement, relation, time_value AS whenv, time_basis, proof_verbatim FROM entity_claims
           WHERE entity_id=? AND (status IS NULL OR status='supported') ORDER BY (time_value IS NULL), time_value LIMIT ?`,
        [entityId, limit]);
      return { id: ent.id, name: ent.name, facts: facts.map((f) => ({ statement: f.statement, relation: f.relation, when: f.whenv, basis: f.time_basis, proof: f.proof_verbatim })) };
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
        // NOT a completion measure: this reads the questions THEMSELVES, so it legitimately wants rows that
  // have some. Completion is `${HYPE_DONE_SQL}` (the version stamp) — see pipeline/processed.js.
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

    // A document's paragraphs by external id, with text and disambiguation note — a figure's own passages as evidence.
    async getPassages(docId, paraIds) {
      if (!paraIds?.length) return [];
      return db.queryAll(`SELECT external_para_id pid, text, context FROM content WHERE doc_id=? AND external_para_id IN (${paraIds.map(() => '?').join(',')})`, [docId, ...paraIds]);
    },

    // The mention-cluster's OWN facts (EEWA P1) — claims the book asserts about THIS person, pulled from the
    // cluster's own paragraphs (para-indexed → fast) and filtered to the subject whose skeleton matches the
    // resolved name. The book's own testimony ("martyred at Ṭabarsí, brother of X") is the strongest identity
    // evidence; feeding it to the adjudicator is fact-to-fact resolution, not name-to-name. Claims are still
    // unbound (entity_id NULL) during the book's own reconcile — we match by subject text, not entity_id.
    async getClusterFacts(docId, resolvedAs, paraIds = [], { limit = 8 } = {}) {
      const pids = paraIds.slice(0, 40);
      if (!pids.length) return [];
      const core = String(resolvedAs).replace(/\([^)]*\)/g, '').split(/[,;—]| the | who /)[0].trim();
      const want = new Set([resolvedAs, core].filter(Boolean).flatMap((p) => [...skeletonKeys(p)]));
      const rows = await db.queryAll(
        `SELECT statement, relation, time_value, time_basis, proof_verbatim FROM entity_claims
           WHERE doc_id=? AND para_id IN (${pids.map(() => '?').join(',')}) AND (status IS NULL OR status='supported')
           ORDER BY (time_value IS NULL), time_value`, [docId, ...pids]);
      const out = [];
      for (const r of rows) {
        const subj = String(r.statement).split(/\s+[—-]\s+/)[0];        // "subject — relation object"
        if (![...skeletonKeys(subj)].some((k) => want.has(k))) continue; // only the claims ABOUT this cluster
        out.push({ statement: r.statement, relation: r.relation, when: r.time_value, basis: r.time_basis, proof: r.proof_verbatim });   // basis: a stated year vs one copied from the scene era
        if (out.length >= limit) break;
      }
      return out;
    },

    // Append proposed reconcile decisions to the immutable decision log (never edits the projection).
    // method_version = the adjudicator engine version that produced it (staleness signal for re-sweeps);
    // supersedes = the prior decision id this re-adjudication replaces (append-only; history never mutated).
    async saveDecisions(decisions) {
      if (!decisions.length) return 0;
      const stmts = decisions.map((d) => ({
        sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version, supersedes, valid_time)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [d.kind, d.targetKind, JSON.stringify(d.targetIds), JSON.stringify(d.payload), JSON.stringify(d.evidence), d.rationale, d.actor, d.actorTier, d.confidence, d.status, d.methodVersion ?? null, d.supersedes ?? null, null],
      }));
      await db.transaction(stmts);
      return decisions.length;
    },

    // Mention-cluster decisions with payload normalised to the library's shape (tolerates the legacy
    // snake_case payload from the pre-library reconcile prototype). Returns the LATEST NON-SUPERSEDED decision
    // per (docId,resolvedAs): a re-adjudication appends a new row with supersedes=<old id>, so the old one is
    // excluded and the improved decision projects (project re-binds by resolved_as). Applied rows are kept
    // (an already-applied superseded decision is still filtered out, so its binding is replaced, not doubled).
    async getProposedDecisions() {
      const rows = await db.queryAll(`SELECT id, kind, status, confidence, payload, method_version, supersedes FROM entity_decisions WHERE target_kind='mention-cluster' ORDER BY id`);
      const superseded = new Set(rows.map((r) => r.supersedes).filter((x) => x != null));
      const appliedEntityById = new Map();            // decision id -> the entity it bound (for supersede re-projection)
      const kindById = new Map();                     // decision id -> its kind (reuse a minted entity only if prior was a create)
      for (const r of rows) { kindById.set(r.id, r.kind); try { const pp = JSON.parse(r.payload || '{}'); if (pp.applied_entity_id != null) appliedEntityById.set(r.id, pp.applied_entity_id); } catch { /* */ } }
      const latest = new Map();                       // (docId||resolvedAs) → newest non-superseded row (max id wins)
      for (const r of rows) {
        if (superseded.has(r.id)) continue;           // an older version replaced by a later re-adjudication
        let p = {}; try { p = JSON.parse(r.payload || '{}'); } catch { /* */ }
        const resolvedAs = p.resolvedAs ?? p.resolved_as;
        const docId = p.docId ?? p.doc_id ?? null;
        // priorEntityId = what the decision THIS one supersedes had bound — so project REUSES a re-created entity
        // (never re-mints a duplicate) and can unbind when a re-adjudication pulls a link back to uncertain.
        const dec = { id: r.id, kind: r.kind, status: r.status, confidence: r.confidence, methodVersion: r.method_version ?? null,
          supersedes: r.supersedes ?? null, priorKind: r.supersedes != null ? (kindById.get(r.supersedes) ?? null) : null,
          priorEntityId: r.supersedes != null ? (appliedEntityById.get(r.supersedes) ?? null) : null,
          payload: { resolvedAs, entityId: p.entityId ?? p.entity_id ?? null, canonical: p.canonical ?? null, type: p.type ?? 'person', freq: p.freq, docId, appliedEntityId: p.applied_entity_id ?? null } };
        latest.set(`${docId} ${resolvedAs}`, dec);   // rows sorted by id → last write wins (newest)
      }
      return [...latest.values()];
    },

    // Improvable clusters for an incremental re-adjudication sweep (EEWA §5b). Returns ONLY clusters whose
    // CURRENT (latest non-superseded) decision is worth revisiting — kind=uncertain, OR confidence < maxConf,
    // OR decided by an engine older than sinceVersion (null/absent method_version = pre-versioning = stale),
    // OR never decided at all. Each carries `priorId` = the decision this re-adjudication will supersede
    // (null when none). Confident, current clusters are skipped → a sweep costs ~the improvable fraction.
    async getReadjudicationClusters(docId, { maxConf = 0.9, sinceVersion = null, includeUncertain = true, minFreq = 1 } = {}) {
      const rows = await db.queryAll(`SELECT id, kind, confidence, payload, method_version, supersedes FROM entity_decisions WHERE target_kind='mention-cluster' ORDER BY id`);
      const superseded = new Set(rows.map((r) => r.supersedes).filter((x) => x != null));
      const current = new Map();                       // resolvedAs → latest non-superseded decision (this doc)
      for (const r of rows) {
        if (superseded.has(r.id)) continue;
        let p = {}; try { p = JSON.parse(r.payload || '{}'); } catch { continue; }
        if ((p.docId ?? p.doc_id ?? null) !== docId) continue;
        current.set(p.resolvedAs ?? p.resolved_as, { id: r.id, kind: r.kind, confidence: r.confidence, methodVersion: r.method_version ?? null });
      }
      const verStale = (mv) => sinceVersion != null && (mv == null || Number(mv) < sinceVersion);
      const clusters = await db.queryAll(`SELECT m.resolved_as, COUNT(*) freq, GROUP_CONCAT(DISTINCT m.para_id) paras,
        (SELECT s.surface FROM entity_mentions_v2 s WHERE s.resolved_as=m.resolved_as AND s.doc_id=? AND s.surface GLOB '*[؀-ۿ]*' ORDER BY length(s.surface) DESC LIMIT 1) arabic_form
        FROM entity_mentions_v2 m WHERE m.doc_id=? AND m.resolved_as IS NOT NULL AND m.resolved_as NOT LIKE '%not given%' AND m.resolved_as NOT LIKE '%?%'
        GROUP BY m.resolved_as ORDER BY freq DESC`, [docId, docId]);
      const out = [];
      for (const c of clusters) {
        if (c.freq < minFreq) continue;
        const d = current.get(c.resolved_as);
        const improvable = !d || (includeUncertain && d.kind === 'uncertain')
          || (d.confidence != null && d.confidence < maxConf) || verStale(d.methodVersion);
        if (improvable) out.push({ resolvedAs: c.resolved_as, freq: c.freq, paraIds: String(c.paras).split(','), arabicForm: c.arabic_form || null, priorId: d?.id ?? null });
      }
      return out;
    },

    // Mint a new (bare) entity as a projection — invisible to the live browser until enriched. Returns its id.
    // Its lookup keys are written WITH it: the index was rebuilt only by the retired per-book shell flow
    // (process-book.sh step 10), so every record the grounding pipeline minted was unreachable by name (2026-09-28).
    async createEntity(canonical, type = 'person') {
      const r = await db.query(`INSERT INTO graph_entities (name, canonical_name, entity_type, last_assessed_version) VALUES (?,?,?,?)`, [canonical, canonical, type, 'reconcile-v1']);
      const id = r.lastInsertRowid;
      const keys = lookupKeyRows(id, canonical, type, null, 1);
      if (keys.length) await db.transaction(keys);
      return id;
    },

    // Bind a resolved-name cluster IN ONE DOCUMENT to an entity (the projection of an applied decision). A cluster
    // decision is judged on that book's evidence; binding by the string alone let one book's decision rewrite every
    // book's mentions of the name (8,250 mentions, measured 2026-09-27 by /server/identity-replay). docId is required.
    async bindMentions(resolvedAs, entityId, conf, docId) {
      if (docId == null) throw new Error('bindMentions: docId required — a cluster decision binds only its own document');
      const r = await db.query(`UPDATE entity_mentions_v2 SET entity_id=?, resolution_basis='reconcile', resolution_conf=? WHERE resolved_as=? AND doc_id=?`, [entityId, conf, resolvedAs, docId]);
      return r.rows?.[0]?.changes ?? 0;
    },

    // Unbind a cluster in ONE document — a re-adjudication that pulls a prior LINK/CREATE back to 'uncertain' returns
    // its mentions to the pool (entity_id NULL). Facts are retained, only the binding is withdrawn. Returns rows freed.
    async unbindMentions(resolvedAs, docId) {
      if (docId == null) throw new Error('unbindMentions: docId required — a re-adjudication unbinds only its own document');
      const r = await db.query(`UPDATE entity_mentions_v2 SET entity_id=NULL, resolution_basis='reconcile-unbind', resolution_conf=NULL WHERE resolved_as=? AND doc_id=? AND entity_id IS NOT NULL`, [resolvedAs, docId]);
      return r.rows?.[0]?.changes ?? 0;
    },

    // ── Identity projection (rag/entities/projection.js + materialize.js) ──
    // The replay's inputs: every mention (or one document's) with its stored binding, and the identity-bearing log.
    async getMentionIdentity({ docId = null } = {}) {
      const rows = await db.queryAll(`SELECT id, anchor, doc_id, resolved_as, entity_id, resolution_basis, method_version FROM entity_mentions_v2
        ${docId != null ? 'WHERE doc_id=?' : ''}`, docId != null ? [docId] : []);
      return rows.map((r) => ({ id: r.id, anchor: r.anchor, docId: r.doc_id, resolvedAs: r.resolved_as, entityId: r.entity_id, basis: r.resolution_basis || r.method_version || 'unknown' }));
    },
    async getIdentityLog() {
      const rows = await db.queryAll(`SELECT id, kind, target_kind, target_ids, status, supersedes, actor_tier, payload FROM entity_decisions
        WHERE target_kind IN ('mention-cluster','mention') OR kind IN ('merge','unmerge')`);
      return rows.map((r) => ({ id: r.id, kind: r.kind, targetKind: r.target_kind, targetIds: r.target_ids, status: r.status, supersedes: r.supersedes, actorTier: r.actor_tier, payload: r.payload }));
    },
    // Write projected bindings (diff rows {id, entityId}); basis 'projection' marks them as the log's output.
    async setMentionEntities(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        await db.transaction(rows.slice(i, i + 500).map(({ id, entityId }) => ({
          sql: `UPDATE entity_mentions_v2 SET entity_id=?, resolution_basis='projection' WHERE id=?`, args: [entityId, id] })));
      }
      return rows.length;
    },

    // Evidence dossiers for the pair judge (rag/entities/pair-judge.js): per record its resolved names, books, cited
    // claims (discriminating relations first), companions (co-named in a paragraph, with each companion's corpus-wide
    // mention total) and sample passages. `universal` = the most-mentioned people — co-occurring with them ties no one.
    async getIdentityDossiers(ids) {
      const ph = ids.map(() => '?').join(',');
      const dossiers = new Map();
      if (!ids.length) return { dossiers, universal: new Set(), totalMentions: 1 };
      const ents = await db.queryAll(`SELECT id, canonical_name, importance, ${LIVE_SQL('')} AS live FROM graph_entities WHERE id IN (${ph})`, ids);
      for (const e of ents) dossiers.set(e.id, { id: e.id, name: e.canonical_name, importance: e.importance, live: !!e.live, mentions: 0, names: [], docs: [], claims: [], companions: [], passages: [] });
      for (const r of await db.queryAll(`SELECT entity_id e, resolved_as n, COUNT(*) c FROM entity_mentions_v2 WHERE entity_id IN (${ph}) GROUP BY 1,2 ORDER BY c DESC`, ids)) {
        const d = dossiers.get(r.e); if (!d) continue; d.mentions += r.c; if (d.names.length < 8) d.names.push({ name: r.n, n: r.c });
      }
      for (const r of await db.queryAll(`SELECT m.entity_id e, m.doc_id id, d.title, COUNT(*) n FROM entity_mentions_v2 m JOIN docs d ON d.id=m.doc_id
          WHERE m.entity_id IN (${ph}) GROUP BY 1,2 ORDER BY n DESC`, ids)) { const d = dossiers.get(r.e); if (d && d.docs.length < 10) d.docs.push({ id: r.id, title: r.title, n: r.n }); }
      const PRIORITY = `CASE WHEN c.relation IN ('born','died','martyred','killed','executed','son-of','daughter-of','father-of','mother-of','wife-of','husband-of','brother-of','sister-of') THEN 0
        WHEN c.relation IN ('held-office','governor-of','ruler-of','titled','has-title','surnamed-by','resided-in','buried-in','letter-of-the-living') THEN 1 ELSE 2 END`;
      for (const r of await db.queryAll(`SELECT c.id, c.entity_id e, c.relation, c.statement, c.proof_verbatim proof, c.time_value, c.time_basis, d.title
          FROM entity_claims c JOIN docs d ON d.id=c.doc_id WHERE c.entity_id IN (${ph}) AND (c.status IS NULL OR c.status='supported')
          ORDER BY ${PRIORITY}, c.id`, ids)) {
        const d = dossiers.get(r.e); if (d && d.claims.length < 30) d.claims.push({ id: r.id, relation: r.relation, statement: r.statement, proof: r.proof, when: r.time_value, basis: r.time_basis, doc: r.title });
      }
      const co = await db.queryAll(`SELECT a.entity_id e, b.entity_id o, COUNT(*) n FROM entity_mentions_v2 a
          JOIN entity_mentions_v2 b ON b.doc_id=a.doc_id AND b.para_id=a.para_id AND b.entity_id IS NOT NULL AND b.entity_id!=a.entity_id
          WHERE a.entity_id IN (${ph}) GROUP BY 1,2 ORDER BY n DESC`, ids);
      const others = [...new Set(co.map((r) => r.o))];
      const meta = new Map();
      for (let i = 0; i < others.length; i += 500) {
        const chunk = others.slice(i, i + 500);
        for (const r of await db.queryAll(`SELECT ge.id, ge.canonical_name n, (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) total
            FROM graph_entities ge WHERE ge.id IN (${chunk.map(() => '?').join(',')})`, chunk)) meta.set(r.id, r);
      }
      for (const r of co) { const d = dossiers.get(r.e); if (d && d.companions.length < 40) d.companions.push({ id: r.o, name: meta.get(r.o)?.n ?? `#${r.o}`, n: r.n, total: meta.get(r.o)?.total ?? 0 }); }
      for (const id of ids) {
        const d = dossiers.get(id); if (!d) continue;
        d.passages = (await db.queryAll(`SELECT m.doc_id doc, m.para_id para, substr(c.text,1,420) text FROM entity_mentions_v2 m
            JOIN content c ON c.doc_id=m.doc_id AND c.external_para_id=m.para_id WHERE m.entity_id=? GROUP BY m.doc_id ORDER BY COUNT(*) DESC LIMIT 3`, [id]));
      }
      const top = await db.queryAll(`SELECT entity_id id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 12`);
      const totalMentions = (await db.queryAll(`SELECT COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IS NOT NULL`))[0]?.n || 1;
      return { dossiers, universal: new Set(top.map((r) => r.id)), totalMentions };
    },

    // Mark a decision applied + record which entity it resolved to (reversible provenance).
    async markDecisionApplied(id, entityId) {
      await db.query(`UPDATE entity_decisions SET status='applied', payload=json_set(COALESCE(payload,'{}'),'$.applied_entity_id',?) WHERE id=?`, [entityId, id]);
    },

    // Reset a doc's DERIVED substrate (mentions + claims) so a re-disambiguation re-derives them fresh from the new
    // notes. These are disposable projections of content.context — NOT entities and NOT decisions (both persist; the
    // fresh reconcile re-links to the same entities via supersede-reuse). Needed because mentions use a stable
    // surface anchor with INSERT OR IGNORE, so without a reset a re-run keeps the OLD resolved handle. Returns counts.
    async resetDocDerived(docId) {
      const m = await db.query(`DELETE FROM entity_mentions_v2 WHERE doc_id=?`, [docId]);
      const c = await db.query(`DELETE FROM entity_claims WHERE doc_id=?`, [docId]);
      return { mentions: m.rows?.[0]?.changes ?? 0, claims: c.rows?.[0]?.changes ?? 0 };
    },

    // Register a bound Persian cluster's ORIGINAL Arabic-script name(s) as ALIASES of the entity — so the lookup
    // index (build-lookup-index → nameKeys) accumulates Arabic keys and the SAME person in a later Persian book (or
    // its English-book self) is RECALLED as a candidate instead of duplicated. This is a RECALL aid built AFTER the
    // evidence-based bind; it is never itself an identity decision. Only distinctive full names (arabicKeys non-empty
    // after honorific-strip → excludes bare سید/آقا titles). Called by project per bound cluster; no-op for non-Persian.
    async registerArabicAliases(entityId, resolvedAs, docId = null) {
      const ent = (await db.queryAll(`SELECT canonical_name cn, entity_type et FROM graph_entities WHERE id=?`, [entityId]))[0];
      if (!ent) return 0;
      const surfaces = (await db.queryAll(
        `SELECT DISTINCT surface FROM entity_mentions_v2 WHERE resolved_as=? AND (? IS NULL OR doc_id=?) AND surface GLOB '*[؀-ۿ]*' ORDER BY length(surface) DESC LIMIT 5`, [resolvedAs, docId, docId]
      )).map((r) => r.surface).filter((s) => s && s.trim().length >= 3 && [...arabicKeys(s)].length >= 1);
      if (!surfaces.length) return 0;
      const row = (await db.queryAll(`SELECT aliases FROM entity_research WHERE canonical_name=? AND entity_type=?`, [ent.cn, ent.et]))[0];
      let aliases = []; try { const a = JSON.parse(row?.aliases || '[]'); if (Array.isArray(a)) aliases = a; } catch { /* */ }
      const have = new Set(aliases.map((a) => String(a)));
      let added = 0;
      for (const s of surfaces) if (!have.has(s)) { aliases.push(s); have.add(s); added++; }
      if (!added) return 0;
      const j = JSON.stringify(aliases);
      if (row) await db.query(`UPDATE entity_research SET aliases=? WHERE canonical_name=? AND entity_type=?`, [j, ent.cn, ent.et]);
      else await db.query(`INSERT INTO entity_research (canonical_name, entity_type, aliases) VALUES (?,?,?)`, [ent.cn, ent.et, j]);
      return added;
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

    // THE BILINGUAL LAYER (migration 120). Store the ORIGINAL beside a translated paragraph, and record who
    // rendered the English — 'shoghi-effendi' marks a rendering whose word-choice authoritatively FIXES
    // which sense of a polysemous original is operative, which downstream analysis must be able to see.
    //
    // synced is NOT touched: this adds a parallel-text layer, it does not change `text`, so nothing needs
    // re-indexing and a backfill of 1,400 paragraphs must not queue a Meilisearch re-sync of all of them.
    async saveParagraphOriginals(rows) {
      if (!rows.length) return 0;
      const stmts = rows.map((r) => ({
        sql: `UPDATE content SET original_text=?, original_lang=?, translation_authority=?, align_ref=?,
                                 word_alignment=?
               WHERE id=? AND deleted_at IS NULL`,
        args: [r.originalText, r.originalLang, r.translationAuthority, r.alignRef, r.wordAlignment ?? null, r.paraId],
      }));
      await db.transaction(stmts);
      return rows.length;
    },

    // Coverage read-out for the bilingual layer. Counting the doc's paragraphs alongside the aligned ones is
    // the difference between "the backfill ran" and "the backfill covered the book" — the distinction this
    // pipeline keeps losing.
    async getOriginalCoverage(docId) {
      const [row] = await db.queryAll(
        `SELECT COUNT(*) total,
                SUM(original_text IS NOT NULL) aligned,
                SUM(translation_authority='shoghi-effendi') se_rendered
           FROM content WHERE doc_id=? AND deleted_at IS NULL AND COALESCE(blocktype,'paragraph')='paragraph'`,
        [docId]);
      return { docId, total: row?.total ?? 0, aligned: row?.aligned ?? 0, seRendered: row?.se_rendered ?? 0 };
    },

    // A concept entity (for the interfaith link stage).
    /**
     * pid → the cited claim statements this paragraph establishes. The knowledge feed for fact-informed HyPE.
     *
     * THIS PORT DID NOT EXIST. retrieval.js reads it through an OPTIONAL binding that falls back to {} — so
     * "v2 knowledge-informed HyPE" and its concept-awareness have been running fact-blind and concept-blind
     * since they were written, reporting success the whole time. An optional port that degrades silently is
     * indistinguishable from a working one until you look at what it fed (stats.factFed, which stayed 0).
     */
    async getParaClaims(docId) {
      const rows = await db.queryAll(
        `SELECT para_id, statement FROM entity_claims
          WHERE doc_id = ? AND para_id IS NOT NULL AND statement IS NOT NULL
            AND COALESCE(status,'supported') = 'supported' AND superseded_at IS NULL
          ORDER BY id`, [docId]);
      const out = {};
      for (const r of rows) (out[r.para_id] ||= []).push(r.statement);
      return out;
    },

    /**
     * pid → the doctrinal claims this paragraph establishes, each with its original-language root.
     *
     * The root is included deliberately: it is what lets HyPE write a question a reader can actually ask
     * about the ORIGINAL term ("what does ʿirfán mean in the Íqán") rather than only about the English gloss,
     * which is the whole reason the bilingual layer exists.
     */
    async getParaConceptClaims(docId) {
      const rows = await db.queryAll(
        `SELECT para_id, subject, relation, target, root FROM concept_claims
          WHERE doc_id = ? AND para_id IS NOT NULL AND proof_ok = 1
          ORDER BY id`, [docId]);
      const out = {};
      for (const r of rows) {
        (out[r.para_id] ||= []).push(
          `${r.subject}${r.root ? ` (${r.root})` : ''} — ${r.relation}${r.target ? ` ${r.target}` : ''}`);
      }
      return out;
    },

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
    // Relations come from concepts/relations.js — the ONE classification — never an inlined list. The
    // whitelist used to live in this SQL string and silently dropped 'signifies', losing the Íqán's
    // "the clouds signifies the annulment of laws" from the lexicon entirely (2026-08-25).
    async getConceptInterpretations(docId) {
      const ph = INTERPRETATION_RELATIONS.map(() => '?').join(',');
      return db.queryAll(
        `SELECT subject, relation, target, statement, proof_verbatim, para_id, doc_id FROM concept_claims
          WHERE doc_id=? AND relation IN (${ph})`, [docId, ...INTERPRETATION_RELATIONS]);
    },

    // DETECTOR for the open-producer/closed-consumer gap: relations present in concept_claims that the
    // lexicon classifies neither way. Non-empty means the extractor invented a verb we are dropping.
    async getUnclassifiedRelations() {
      const rows = await db.queryAll(`SELECT DISTINCT relation FROM concept_claims WHERE relation IS NOT NULL`);
      return unknownRelations(rows.map((r) => r.relation));
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
    async getDuplicateGroups({ type = 'person', minSize = 2, limit, minImportance = null, maxSize = 12 } = {}) {
      const ents = await db.queryAll(
        `SELECT ge.id, ge.canonical_name canonical, ge.importance, er.summary,
                (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
           FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type=ge.entity_type
          WHERE ge.entity_type=? AND ${LIVE_SQL('ge.')}`, [type]);   // exclude already-merged (dead) entities
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      // Group by the CORE name — before any "(descriptor)" or ", descriptor", leading article dropped. Grouping by
      // the whole string never put "the Báb (the Remembrance of God)" beside "the Báb", so descriptor duplicates
      // (the Báb ×6, Ṭáhirih ×6 …) were invisible to merge. A shared core name is only a CANDIDATE group; the
      // adjudicator keeps namesakes apart on evidence ("Mullá Ḥusayn (son of Mullá Iskandar)").
      const coreKey = (s) => norm(String(s || '').replace(/\([^)]*\)/g, ' ').split(/[,;—]/)[0]).replace(/^(the|a) /, '');
      const groups = {};
      for (const e of ents) { const k = coreKey(e.canonical); if (!k) continue; (groups[k] = groups[k] || []).push(e); }
      let out = Object.entries(groups).filter(([, es]) => es.length >= minSize)
        .filter(([, es]) => minImportance == null || es.some((e) => (e.importance || 0) >= minImportance))
        // Very common names gather dozens of namesakes; the richest maxSize are adjudicated (a bounded prompt).
        .map(([key, es]) => { const top = es.sort((a, b) => b.mentions - a.mentions).slice(0, maxSize); return { key, ids: top.map((e) => e.id), entities: top }; });
      out.sort((a, b) => b.entities[0].mentions - a.entities[0].mentions);   // richest groups first
      if (limit) out = out.slice(0, limit);
      return out;
    },

    // Merge: repoint mentions + claims from the merged ids onto the canonical, record an append-only merge
    // decision (reversible), and TOMBSTONE the merged graph_entities rows. Returns count merged.
    //
    // The tombstone is `last_assessed_version='merged-into-<id>'` — the one column every reader checks
    // (entity-live.js owns the definition). This used to append ' ⟨merged→N⟩' to canonical_name instead,
    // which no API-layer filter looked at, so 6,668 merged rows were served as live people until 2026-08-24.
    // It also concatenated onto the previous value, so re-merging stacked markers up to nine deep. Assigning
    // a constant makes the write idempotent: merging the same id twice leaves the identical tombstone.
    // A record whose own passages never carry its name (a guessed label) takes the name the text gives. Its lookup keys
    // follow, so the old name stops finding it; the decision keeps the old name so the rename can be undone.
    async renameEntity(id, name, d) {
      const ge = await db.queryOne(`SELECT canonical_name cn, entity_type et, importance FROM graph_entities WHERE id = ?`, [id]);
      if (!ge) return 0;
      await db.transaction([
        { sql: `UPDATE graph_entities SET canonical_name = ? WHERE id = ?`, args: [name, id] },
        { sql: `UPDATE entity_research SET canonical_name = ? WHERE canonical_name = ? AND entity_type = ?`, args: [name, ge.cn, ge.et] },
        { sql: `DELETE FROM entity_lookup_keys WHERE entity_id = ? AND surface = ?`, args: [id, ge.cn] },
        ...lookupKeyRows(id, name, ge.et, ge.importance, 1),
        { sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, status, method_version) VALUES ('rename','entity',?,?,?,?,?,?, 'applied', ?)`,
          args: [JSON.stringify([id]), JSON.stringify({ from: ge.cn, name }), JSON.stringify(d?.evidence ?? null), d?.rationale ?? null, d?.actor ?? 'model', d?.actorTier ?? 2, d?.methodVersion ?? null] },
      ]);
      return 1;
    },

    // Move ONE book's cluster (its label for a person) from a record that holds two people to the right one — the split.
    // Claims have no mention anchor yet (plan step 3), so a claim follows only from paragraphs where the record keeps no
    // other mention; a paragraph naming both is left and counted, never guessed. The decision is a cluster LINK, so the
    // identity replay reproduces the split and a later decision can undo it.
    async repointCluster(from, to, docId, resolvedAs, d) {
      const ms = await db.queryAll(`SELECT id, para_id FROM entity_mentions_v2 WHERE entity_id = ? AND doc_id = ? AND resolved_as = ?`, [from, docId, resolvedAs]);
      if (!ms.length) return { moved: 0, claims: 0, held: 0 };
      const paras = [...new Set(ms.map((m) => m.para_id))];
      const ph = (a) => a.map(() => '?').join(',');
      const stay = new Set((await db.queryAll(`SELECT DISTINCT para_id FROM entity_mentions_v2 WHERE entity_id = ? AND doc_id = ? AND resolved_as <> ? AND para_id IN (${ph(paras)})`,
        [from, docId, resolvedAs, ...paras])).map((r) => r.para_id));
      const movable = paras.filter((p) => !stay.has(p));
      const held = stay.size ? (await db.queryOne(`SELECT COUNT(*) n FROM entity_claims WHERE (entity_id = ? OR target_entity_id = ?) AND doc_id = ? AND para_id IN (${ph([...stay])})`, [from, from, docId, ...stay]))?.n ?? 0 : 0;
      const claims = movable.length ? (await db.queryOne(`SELECT COUNT(*) n FROM entity_claims WHERE (entity_id = ? OR target_entity_id = ?) AND doc_id = ? AND para_id IN (${ph(movable)})`, [from, from, docId, ...movable]))?.n ?? 0 : 0;
      await db.transaction([
        { sql: `UPDATE entity_mentions_v2 SET entity_id = ?, resolution_basis = 'review' WHERE id IN (${ph(ms)})`, args: [to, ...ms.map((m) => m.id)] },
        ...(movable.length ? [
          { sql: `UPDATE entity_claims SET entity_id = ? WHERE entity_id = ? AND doc_id = ? AND para_id IN (${ph(movable)})`, args: [to, from, docId, ...movable] },
          { sql: `UPDATE entity_claims SET target_entity_id = ? WHERE target_entity_id = ? AND doc_id = ? AND para_id IN (${ph(movable)})`, args: [to, from, docId, ...movable] },
        ] : []),
        { sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version) VALUES ('link','mention-cluster',?,?,?,?,?,?,NULL,'applied',?)`,
          args: [JSON.stringify([to]), JSON.stringify({ docId, resolvedAs, applied_entity_id: to, from }), JSON.stringify(d?.evidence ?? null), d?.rationale ?? null, d?.actor ?? 'model', d?.actorTier ?? 2, d?.methodVersion ?? null] },
      ]);
      return { moved: ms.length, claims, held };
    },

    // Move individual MENTIONS (by anchor) off a record — for a cluster that holds two people, where the book's one
    // label covered both. Same claim rule as repointCluster: a claim follows only from a paragraph the record no
    // longer appears in. The decision is a mention-level SPLIT, which the identity replay lets govern the cluster's.
    async repointMentions(anchors, from, to, d) {
      const ph = (a) => a.map(() => '?').join(',');
      const ms = await db.queryAll(`SELECT id, doc_id, para_id FROM entity_mentions_v2 WHERE entity_id = ? AND anchor IN (${ph(anchors)})`, [from, ...anchors]);
      if (!ms.length) return { moved: 0, claims: 0, held: 0 };
      await db.transaction([{ sql: `UPDATE entity_mentions_v2 SET entity_id = ?, resolution_basis = 'review' WHERE id IN (${ph(ms)})`, args: [to, ...ms.map((m) => m.id)] }]);
      let claims = 0, held = 0;
      const stmts = [];
      for (const key of new Set(ms.map((m) => `${m.doc_id}\u0001${m.para_id}`))) {
        const [doc, para] = key.split('\u0001');
        const stays = (await db.queryOne(`SELECT COUNT(*) n FROM entity_mentions_v2 WHERE entity_id = ? AND doc_id = ? AND para_id = ?`, [from, Number(doc), para]))?.n ?? 0;
        const n = (await db.queryOne(`SELECT COUNT(*) n FROM entity_claims WHERE (entity_id = ? OR target_entity_id = ?) AND doc_id = ? AND para_id = ?`, [from, from, Number(doc), para]))?.n ?? 0;
        if (stays) { held += n; continue; }
        claims += n;
        stmts.push({ sql: `UPDATE entity_claims SET entity_id = ? WHERE entity_id = ? AND doc_id = ? AND para_id = ?`, args: [to, from, Number(doc), para] },
          { sql: `UPDATE entity_claims SET target_entity_id = ? WHERE target_entity_id = ? AND doc_id = ? AND para_id = ?`, args: [to, from, Number(doc), para] });
      }
      stmts.push({ sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version) VALUES ('split','mention',?,?,?,?,?,?,NULL,'applied',?)`,
        args: [JSON.stringify(anchors), JSON.stringify({ from, to }), JSON.stringify(d?.evidence ?? null), d?.rationale ?? null, d?.actor ?? 'model', d?.actorTier ?? 2, d?.methodVersion ?? null] });
      await db.transaction(stmts);
      return { moved: ms.length, claims, held };
    },

    // Retire a record no text supports. REFUSES a record anything still anchors — a mention, a claim on either side,
    // a scene participant: those came from a passage, so the record is evidence, not a husk.
    async retireEntity(id, reason, d) {
      const ge = await db.queryOne(`SELECT last_assessed_version lav FROM graph_entities WHERE id = ?`, [id]);
      if (!ge) return 0;
      const held = await db.queryOne(`SELECT (SELECT COUNT(*) FROM entity_mentions_v2 WHERE entity_id = ?) + (SELECT COUNT(*) FROM entity_claims WHERE entity_id = ? OR target_entity_id = ?)
          + (SELECT COUNT(*) FROM scene_participants WHERE entity_id = ?) n`, [id, id, id, id]);
      if (held?.n) throw new Error(`entity ${id} is anchored by ${held.n} passage rows — not retired`);
      await db.transaction([
        { sql: `UPDATE graph_entities SET last_assessed_version = ? WHERE id = ?`, args: [retiredStamp(reason), id] },
        { sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, status, method_version) VALUES ('retire','entity',?,?,?,?,?,?, 'applied', ?)`,
          args: [JSON.stringify([id]), JSON.stringify({ from: ge.lav ?? null, stamp: retiredStamp(reason) }), JSON.stringify(d?.evidence ?? null), d?.rationale ?? null, d?.actor ?? 'model', d?.actorTier ?? 2, d?.methodVersion ?? null] },
      ]);
      return 1;
    },

    async applyMerge(canonicalId, mergeIds, reason, meta = {}) {
      if (!mergeIds.length) return 0;
      const ph = mergeIds.map(() => '?').join(',');
      await db.transaction([
        { sql: `UPDATE entity_mentions_v2 SET entity_id=? WHERE entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE entity_claims SET entity_id=? WHERE entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE entity_claims SET target_entity_id=? WHERE target_entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        // Relations follow the person too (group membership, kinship edges). Leaving them on the tombstone is how two
        // Letters of the Living fell out of their group (2026-09-26). UNIQUE(source,target,type): a row the survivor
        // already has is kept once — the leftover and any self-loop the repoint creates are dropped.
        { sql: `UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        { sql: `DELETE FROM graph_relations WHERE source_entity_id IN (${ph}) OR target_entity_id IN (${ph})`, args: [...mergeIds, ...mergeIds] },
        { sql: `DELETE FROM graph_relations WHERE source_entity_id=? AND target_entity_id=?`, args: [canonicalId, canonicalId] },
        // Scene participants follow the person too (entity_scenes, migration 125). PRIMARY KEY(scene_id, name) — the
        // repoint changes only entity_id, so no collision is possible.
        { sql: `UPDATE scene_participants SET entity_id=? WHERE entity_id IN (${ph})`, args: [canonicalId, ...mergeIds] },
        // The survivor keeps the highest importance of the records it absorbs (a curated station floor must not be lost).
        { sql: `UPDATE graph_entities SET importance=(SELECT MAX(importance) FROM graph_entities WHERE id IN (?, ${ph})) WHERE id=?`, args: [canonicalId, ...mergeIds, canonicalId] },
        { sql: `UPDATE graph_entities SET last_assessed_version=? WHERE id IN (${ph})`, args: [tombstoneFor(canonicalId), ...mergeIds] },
        // The decision carries its evidence (claims, companions, the model's cited tie) so the merge can be proved and re-assessed.
        { sql: `INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, confidence, status, method_version, valid_time) VALUES ('merge','entity',?,?,?,?,?,?,?, 'applied', ?, NULL)`,
          args: [JSON.stringify(mergeIds), JSON.stringify({ canonical: canonicalId, merged: mergeIds }), meta.evidence ? JSON.stringify(meta.evidence) : null, reason || null,
            meta.actor || 'model', meta.actorTier ?? 2, meta.confidence ?? null, meta.methodVersion ?? null] },
      ]);
      return mergeIds.length;
    },
  };
}
