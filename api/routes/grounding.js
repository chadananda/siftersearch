// grounding — the internal HTTP control plane for the entity-grounding pipeline. THIN wrappers over the shared
// executor (api/lib/pipeline/run-grounding.js via the complete-book CLI) + state (api/lib/pipeline/state.js) +
// the entity store: live status/queue reads, idempotent start/stop, reversible merge, entity backup. Operator,
// orchestrator, and UI drive grounding through this ONE surface instead of ad-hoc SSH/SQL.
// Mounted at /api/admin (requireInternal — X-Internal-Key === DEPLOY_SECRET or admin JWT). Writes route to the
// single writer (the API process sets SIFTER_WRITER_URL), so no direct-write contention.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import * as state from '../lib/pipeline/state.js';
import * as queue from '../lib/pipeline/queue.js';
import * as processor from '../lib/pipeline/plan.js';   // plan/override/general mode processor (chooses next work)
import * as digest from '../lib/pipeline/digest.js';    // hourly progress-digest email
import { graphBandHolder } from '../lib/pipeline/lock.js';
import { spawn } from 'node:child_process';   // used by /grounding/backup (was missing → endpoint threw ReferenceError)
import { spawnGrounding } from '../lib/pipeline/spawn.js';
import { makeStore } from '../lib/rag-adapter/store.js';
import { repairMergeTombstones, mergeTombstoneDivergence, naturalKeyCollisions, breakMergeCycles } from '../lib/entity-merge-repair.js';
import { guttedCanonicals, liveDuplicateCanonicals } from '../lib/canonical-integrity.js';
import { getIntegrationProgress, gradedPlanDocIds } from '../lib/bio.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const parseRun = (rj) => { try { return rj ? JSON.parse(rj) : null; } catch { return null; } };
// Live only if the run heartbeated within 150s (executor refreshes every 30s). A crashed/killed book stops
// heartbeating → treated as not-running so /start can relaunch it instead of 409-ing on a stale marker.
const isLive = (run) => {
  if (!run || !run.stage || run.stage === 'done') return false;
  const ts = run.updatedAt ? Date.parse(run.updatedAt) : 0;
  return Date.now() - ts < 150000;
};

export default async function groundingRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  // LIVE status — the full roadmap + the driver-reported active book (the same payload the UI reads).
  fastify.get('/grounding/status', admin, async () => getIntegrationProgress());

  // VERIFIER (2026-08-06): prove reachedBoundBulk() ≡ per-doc reachedBound() over the graded plan docs, so the
  // roadmap's bulk done-check (the migration-97 perf fix) can't silently diverge from the pipeline's own test.
  // Read-only; expect mismatchCount:0. Kept as a cheap regression probe.
  fastify.get('/grounding/verify-done-bulk', admin, async () => {
    const ids = gradedPlanDocIds();
    const bulk = await queue.reachedBoundBulk(ids, {});
    const single = new Set();
    for (const id of ids) { if (await queue.reachedBound(id, {})) single.add(Number(id)); }
    const mismatches = ids.filter((id) => bulk.has(Number(id)) !== single.has(Number(id)));
    return { total: ids.length, bulkDone: bulk.size, singleDone: single.size, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 50) };
  });

  // The enabled worklist in priority order: each doc's coarse stage status + live run.
  fastify.get('/grounding/books', admin, async () => {
    const rep = await state.statusReport();
    return { totals: rep.totals, books: rep.enabled.map(({ run_json, ...b }) => ({ ...b, run: parseRun(run_json) })) };
  });

  // One book's full pipeline row.
  fastify.get('/grounding/books/:docId', admin, async (req) => {
    const row = await state.getRow(Number(req.params.docId));
    if (!row) throw ApiError.notFound('doc not in pipeline');
    const { run_json, ...rest } = row;
    return { ...rest, run: parseRun(run_json) };
  });

  // START grounding a book — spawns the executor detached (replaces manual `ssh nohup`). Idempotent: 409 if live.
  // Supports FULL runs and RE-PROCESSING runs: `from=<stage>` resumes from a stage, `only=<stage>` runs one stage
  // (e.g. only=research to re-resolve just the uncertains) — both report live via run_json exactly like a full run.
  fastify.post('/grounding/start', admin, async (req) => {
    const { docId, from, only, to, readjudicate, rehype, cc } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    if (isLive(await state.getRun(Number(docId)))) throw ApiError.conflict(`doc ${docId} is already grounding`);
    const pid = spawnGrounding(docId, { from, only, to, readjudicate, rehype, cc });   // the ONE launcher (shared with the queue)
    return { started: true, docId: Number(docId), pid, from: from || null, only: only || null, cc: Number(cc) || 8 };
  });

  // ── QUEUE: the API owns the work ORDER and advances it ──────────────────────────────────────────────────────
  // Enqueue books and the supervisor starts each one as a slot frees — so processing continues without an operator
  // (or an agent loop) alive to launch the next book. `to` bounds a run (e.g. to:'research' keeps it out of the
  // shared-graph tail, letting it co-run with a full book).
  fastify.post('/grounding/queue', admin, async (req) => {
    const { docId, docIds, ...opts } = req.body || {};
    const ids = docIds || (docId ? [docId] : []);
    if (!ids.length) throw ApiError.badRequest('docId or docIds required');
    const rows = [];
    for (const id of ids) rows.push(await queue.enqueue({ docId: id, ...opts }));
    queue.tick().catch(() => {});                       // start immediately if a slot is free
    return { queued: rows.length, items: rows.map(({ opts_json, ...r }) => r) };
  });

  /**
   * POST /concepts/run — run the CONCEPTUAL track on one document.
   *
   * The conceptual track has been code-complete since 08-19 and had never run on a single document, because
   * the only way to invoke it was scripts/rag.mjs on the box — and control belongs on the internal API, not
   * SSH. GROUNDING_STAGES has no concept stage either, so the person pipeline could never reach it.
   *
   * ORDER IS LOAD-BEARING (conceptual-track §3, §7): the lexicon must accumulate from the higher texts BEFORE
   * lower texts bind their symbols to it, and HyPE reads the disambiguation context, so a concept-carrying
   * note has to exist before questions are generated. Hence the default order below, and hence `stages` is
   * validated against it rather than accepted as free text.
   *
   * SPENDS. Every stage makes model calls; dryRun runs the read side and writes nothing.
   */
  fastify.post('/concepts/run', admin, async (req) => {
    const ORDER = ['disambiguate', 'extract', 'lexicon', 'reconcile', 'promote'];
    const { docId, stages, dryRun = false, ...opts } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const want = stages?.length ? stages : ORDER;
    const unknown = want.filter((s) => !ORDER.includes(s));
    if (unknown.length) throw ApiError.badRequest(`unknown concept stage(s): ${unknown.join(', ')} — known: ${ORDER.join(', ')}`);
    // Run in canonical order regardless of the order asked for: a caller who lists extract before
    // disambiguate is asking for concepts off an un-disambiguated text, which the design forbids outright.
    const ordered = ORDER.filter((s) => want.includes(s));
    const { rag } = await import('../lib/rag-adapter/index.js');
    const out = { docId, dryRun, ran: [], stats: {} };
    for (const stage of ordered) {
      const fn = stage === 'lexicon' ? rag.concepts.lexicon.seed : rag.concepts[stage];
      if (typeof fn !== 'function') { out.stats[stage] = { error: 'stage not available in this build' }; break; }
      try {
        out.stats[stage] = await fn.call(rag.concepts, docId, { ...opts, dryRun });
        out.ran.push(stage);
      } catch (err) {
        // Stop at the first failure: a later stage consuming a half-built lexicon produces confidently wrong
        // bindings, which is worse than no bindings.
        out.stats[stage] = { error: err.message };
        out.stoppedAt = stage;
        break;
      }
    }
    // Index what was just extracted. Without this the concepts exist only as rows: searchable claims hanging
    // off paragraphs, but not concepts a reader can query in their own right across traditions (§6). Indexing
    // as part of the run means "extracted" and "findable" cannot drift apart — the failure mode that left
    // `context` written-but-unindexed for a month.
    if (!dryRun && out.ran.length) {
      try {
        const { syncConcepts } = await import('../lib/search/concepts.js');
        const { syncLexicon } = await import('../lib/search/concepts.js');
        out.indexed = { entities: await syncConcepts(), lexicon: await syncLexicon() };
      } catch (err) {
        out.indexed = { error: err.message };   // reported, never silent — the run still succeeded
      }
    }
    return out;
  });

  /**
   * POST /concepts/start — launch a DETACHED concept run and return immediately.
   *
   * /concepts/run executes in-request, which only works for bounded runs: the disambiguate stage is
   * sequential, so a whole book exceeds the edge timeout. This is the path for a real book, and it mirrors
   * how grounding has always been launched (detached CLI + per-doc log), so an operator-launched run and an
   * API-launched one are the same thing.
   */
  fastify.post('/concepts/start', admin, async (req) => {
    const { docId, only, from, limit, dry = false } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const { spawnConcepts } = await import('../lib/pipeline/spawn.js');
    const pid = spawnConcepts(Number(docId), { only, from, limit, dry });
    return { started: true, docId: Number(docId), pid, log: `logs/concepts-${docId}.log`, dry };
  });

  /**
   * GET /concepts/status — what the conceptual track has actually produced.
   *
   * Without this a concept run is invisible: extract writes concept_claims, lexicon writes concept_lexicon,
   * and only later stages create concept_entities — so /concepts/sync reporting 0 entities says nothing about
   * whether extraction worked. Counting each table separately is the difference between "it ran" and "it
   * produced something", which is the distinction this pipeline keeps losing.
   */
  fastify.get('/concepts/status', admin, async (req) => {
    const docId = req.query?.docId ? Number(req.query.docId) : null;
    const scope = docId ? ' WHERE doc_id = ?' : '';
    const args = docId ? [docId] : [];
    const one = async (sql, a = args) => (await queryOne(sql, a, 'diag:concepts-status'))?.n ?? 0;
    const [claims, proofOk, lexicon, entities, decisions, links] = await Promise.all([
      one(`SELECT COUNT(*) n FROM concept_claims${scope}`),
      one(`SELECT COUNT(*) n FROM concept_claims${scope ? scope + ' AND' : ' WHERE'} proof_ok = 1`),
      docId ? one(`SELECT COUNT(*) n FROM concept_lexicon WHERE proof_doc_id = ?`) : one(`SELECT COUNT(*) n FROM concept_lexicon`, []),
      one(`SELECT COUNT(*) n FROM concept_entities`, []),
      one(`SELECT COUNT(*) n FROM concept_decisions`, []),
      one(`SELECT COUNT(*) n FROM concept_links`, []),
    ]);
    const byDoc = docId ? null : await queryAll(
      `SELECT doc_id, COUNT(*) n FROM concept_claims GROUP BY doc_id ORDER BY n DESC LIMIT 20`, [], 'diag:concepts-bydoc');
    // A SAMPLE, not just counts. 740 lexicon entries tells you the stage ran; reading five of them tells you
    // whether it produced authoritative interpretations or restatements — which is the actual question.
    const sample = await queryAll(
      `SELECT symbol, interpretation, authority, authority_tier, layer, proof_verbatim
         FROM concept_lexicon${docId ? ' WHERE proof_doc_id = ?' : ''}
        ORDER BY (authority_tier IS NULL), authority_tier, id DESC LIMIT 8`, args, 'diag:concepts-sample');
    // WHEN, not just how many. I asserted the track "had never run" on the strength of entities=0 — the wrong
    // table — and then found 2,086 claims on two books I never launched. A count without a timestamp cannot
    // tell tonight's work from someone else's, so the ages ship with the counts (2026-08-20).
    const ages = await queryOne(
      `SELECT MIN(created_at) first_at, MAX(created_at) last_at FROM concept_lexicon${docId ? ' WHERE proof_doc_id = ?' : ''}`,
      args, 'diag:concepts-ages');
    return { docId, claims, claims_proof_ok: proofOk, lexicon_entries: lexicon, entities, decisions, links,
      first_at: ages?.first_at ?? null, last_at: ages?.last_at ?? null, byDoc, sample };
  });

  /** POST /concepts/sync — reindex concept entities without re-extracting. Full refresh; cheap, no model calls. */
  // GET /concepts/lexicon?symbol=…&limit= — every recorded interpretation of one symbol.
  // Feeds tests/quality/score-concepts.mjs, which measures TWO things the lexicon conflates: whether we
  // captured all the senses a symbol genuinely carries (recall), and whether what we stored are distinct
  // senses or restatements of one (distinctness). Without symbol-level read-out neither is measurable.
  fastify.get('/concepts/lexicon', admin, async (req) => {
    const symbol = String(req.query?.symbol || '').trim();
    const limit = Math.min(500, Number(req.query?.limit) || 200);
    if (!symbol) {
      // No symbol → the polysemy overview: which symbols carry the most recorded interpretations.
      const rows = await queryAll(
        `SELECT symbol, COUNT(*) entries, COUNT(DISTINCT interpretation) distinctText
           FROM concept_lexicon GROUP BY symbol HAVING entries > 1
          ORDER BY entries DESC LIMIT ?`, [limit]);
      return { overview: true, symbols: rows };
    }
    // Surface forms drift: the fixture says "Bayán", the lexicon stores "the Bayán". Matching exactly
    // reported 0 entries and read as "never extracted" (2026-08-25) — an empty result that was our own
    // lookup's fault, not the data's. So match on a NORMALISED surface: article stripped, diacritics
    // folded, case-insensitive. `matched` reports which stored surfaces answered, so a caller can see
    // that it was a variant rather than assuming an exact hit.
    const norm = (v) => `LOWER(TRIM(REPLACE(REPLACE(${v}, char(8217), ''''), '"', '')))`;
    const stripArticle = (t) => String(t).replace(/^\s*(the|a|an)\s+/i, '').trim();
    const bare = stripArticle(symbol);
    const entries = await queryAll(
      `SELECT id, symbol, interpretation, authority, authority_tier, layer, proof_doc_id, proof_verbatim
         FROM concept_lexicon
        WHERE ${norm('symbol')} = ${norm('?')}
           OR ${norm('symbol')} = ${norm("'the ' || ?")}
           OR ${norm("REPLACE(REPLACE(symbol,'The ',''),'the ','')")} = ${norm('?')}
        ORDER BY authority_tier IS NULL, authority_tier, id LIMIT ?`,
      [symbol, bare, bare, limit]);
    return { symbol, requested: symbol, count: entries.length,
      matchedSurfaces: [...new Set(entries.map((e) => e.symbol))], entries };
  });

  /**
   * POST /concepts/align-originals {docId, dryRun=true} — populate the bilingual layer (migration 120).
   *
   * Stores the ORIGINAL beside Shoghi Effendi's rendering on each paragraph, and records that the rendering
   * is his — which downstream analysis needs, because his word-choice authoritatively FIXES which sense of a
   * polysemous original is operative (Chad, 2026-08-25).
   *
   * MUST RUN HERE, not from a workstation: the dev DB is a stale 7,622-doc copy that does not contain these
   * books, so a local run reports 0/0 and reads exactly like "nothing to align".
   *
   * dryRun DEFAULTS TRUE. The pairing is a derived claim about two texts; the dry run reports coverage, the
   * score spread and the unmatched paragraphs by name, which is what tells you the pairing is real before it
   * is written. Idempotent and re-runnable either way.
   */
  fastify.post('/concepts/align-originals', admin, async (req) => {
    const { docId, work, dryRun = true, minScore } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const { rag } = await import('../lib/rag-adapter/index.js');
    return rag.concepts.alignOriginals(Number(docId), {
      work,                                   // a doc may hold several works; name one
      dryRun: dryRun !== false,
      ...(minScore ? { minScore: Number(minScore) } : {}),
      log: logger,
    });
  });

  /**
   * GET /concepts/source-survey — which canonical works are translations, and where each one's original
   * can actually be got (in-corpus original-language doc · CTAI · nothing found).
   *
   * Answers "can we fetch the source for every translated canonical?" with measurement instead of a guess.
   * `route: 'none'` is reported explicitly: a work we cannot source is a fact the extraction plan has to
   * account for, not a blank to skip quietly.
   */
  fastify.get('/concepts/source-survey', admin, async (req) => {
    const { surveyTranslatedCanonicals } = await import('../lib/rag/concepts/source-survey.js');
    return surveyTranslatedCanonicals({
      limit: Math.min(1000, Number(req.query?.limit) || 500),
      ...(req.query?.minTitleScore ? { minTitleScore: Number(req.query.minTitleScore) } : {}),
    });
  });

  /**
   * GET /concepts/resolve-works — which of OUR documents holds each aligned work, decided by TEXT.
   *
   * Title matching is how a plan ends up pointing at nothing: it put grounding on empty duplicates
   * (6555→12511), proposed "On divine origination" as the original of "The Secret of Divine Civilization",
   * and showed a soft-deleted tombstone beside a live canonical. The work's own English, looked up in our
   * corpus, is the identity test — and it self-checks, because a husk has no text to match.
   *
   * A split or tied vote resolves to null. That is a HOLD, not a failure.
   */
  fastify.get('/concepts/resolve-works', admin, async (req) => {
    const { resolveWorkDoc } = await import('../lib/rag/concepts/resolve-work.js');
    const { CTAI_WORK_BY_DOC } = await import('../lib/rag/concepts/ctai.js');
    const { keywordSearch } = await import('../lib/search.js');
    const only = req.query?.work;
    const works = only ? [only] : [...new Set([
      'kitab-i-iqan', 'gleanings', 'the-hidden-words', 'epistle-to-the-son-of-the-wolf',
      'prayers-and-meditations', 'tablet-of-the-holy-mariner', 'will-and-testament',
      'fire-tablet', 'kitab-i-ahd', 'tablet-of-ahmad', 'tablet-of-carmel',
    ])];
    // Adapt the app's search to the port the resolver expects. Paragraph hits carry their doc; the resolver
    // dedupes per probe, so a long document matching many paragraphs still counts once.
    const search = async (q, { limit = 10 } = {}) => {
      const r = await keywordSearch(q, { limit });
      return (r?.hits || []).map((h) => ({
        docId: h.doc_id ?? h.documentId, title: h.doc_title ?? h.title, sourceSite: h.source_site ?? null,
      }));
    };
    const known = Object.fromEntries(Object.entries(CTAI_WORK_BY_DOC).map(([id, w]) => [w, Number(id)]));
    const out = [];
    for (const work of works) {
      const r = await resolveWorkDoc(work, { search, log: logger });
      // Report agreement with the hand-curated map explicitly: a mismatch is the interesting case, and
      // silently preferring either side would hide it.
      out.push({ ...r, curated: known[work] ?? null,
        agrees: known[work] == null ? null : known[work] === r.resolved });
    }
    return { works: out };
  });

  /**
   * POST /concepts/align-oceanoflights {docId, stemPrefix, dryRun=true, limit}
   *
   * Enrich OUR document with the original-language text, using oceanoflights.org as a RESEARCH SOURCE.
   * Chad, 2026-08-26: "use it as a research point to find the parallel content" — nothing is ingested,
   * replaced or re-pointed; the only field written is original_text on paragraphs we already own.
   *
   * Reaches the books CTAI cannot: the Aqdas, Some Answered Questions, Selections from the Writings of
   * ‘Abdu’l-Bahá and of the Báb, the Tablets of the Divine Plan — every one a NON-Shoghi-Effendi rendering,
   * which is where the original carries the most weight because the English fixes no sense.
   */
  fastify.post('/concepts/align-oceanoflights', admin, async (req) => {
    const { docId, stemPrefix, stems: explicitStems, dryRun = true, limit } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    if (!stemPrefix && !explicitStems?.length) {
      throw ApiError.badRequest('stemPrefix or stems[] required');
    }
    const { originalsForDoc } = await import('../lib/rag/concepts/oceanoflights.js');
    const { rag } = await import('../lib/rag-adapter/index.js');
    const store = makeStore();

    // Stems come from the SCRAPED pages we already hold — those pages are navigation chrome, but their
    // filenames are the parallel-corpus index. The text itself is fetched from the linked file.
    // EXPLICIT STEMS take priority. The site's WHOLE-BOOK files (bahaullah-st-015 = the Kitáb-i-Aqdas) are
    // NOT in our scraped corpus — we only ever scraped its topical excerpt pages — so mining file_path can
    // never find them. Their ids come from the site's own best-known-works tables, captured in
    // data/oceanoflights-works.json (Chad, 2026-08-26: "all books have their titles at the top of the book").
    let stems;
    if (explicitStems?.length) {
      stems = [...new Set(explicitStems.map((x) => String(x).trim()).filter(Boolean))];
    } else {
      const rows = await queryAll(
        `SELECT DISTINCT file_path FROM docs
          WHERE source_site='oceanoflights.org' AND deleted_at IS NULL AND file_path LIKE ?
          ORDER BY file_path`, [`%${stemPrefix}%`], 'ool:stems');
      const { stemOf } = await import('../lib/rag/concepts/oceanoflights.js');
      stems = [...new Set(rows.map((r) => stemOf(r.file_path)).filter(Boolean))].sort();
    }
    if (limit) stems = stems.slice(0, Number(limit));
    if (!stems.length) throw ApiError.badRequest(`no oceanoflights stems for '${stemPrefix || 'the given list'}'`);

    const resolved = await store.resolveCanonicalDoc(Number(docId));
    const paras = await store.getParagraphs(resolved);
    const ours = paras.map((p) => ({ key: p.id, text: p.text }));
    const { matches, stats } = await originalsForDoc(ours, stems, { log: logger });

    const out = { docId: resolved, ...(resolved !== Number(docId) ? { resolvedFrom: Number(docId) } : {}),
      stemPrefix: stemPrefix || null, stemCount: stems.length, dryRun, ...stats, written: 0,
      samples: matches.slice(0, 3).map((m) => ({ score: m.score, lang: m.originalLang, stem: m.stem })) };
    if (dryRun || !matches.length) return out;

    out.written = await store.saveParagraphOriginals(matches.map((m) => ({
      paraId: m.ourKey, originalText: m.originalText, originalLang: m.originalLang,
      // NOT shoghi-effendi: these are the works he did not translate. Claiming his authority for a rendering
      // that is not his would grant a translator sense-fixing power they do not have.
      translationAuthority: 'committee',
      wordAlignment: null,
      alignRef: JSON.stringify({ source: 'oceanoflights.org', stem: m.stem, score: m.score,
        alignedAt: new Date().toISOString() }),
    })));
    void rag;
    return out;
  });

  /**
   * POST /concepts/align-ool-work {docId, stem, dryRun=true}
   *
   * Enrich OUR document from a WHOLE WORK on oceanoflights, read from the PAGE (Chad, 2026-08-26: "you can
   * always download the page… and extract content"). The page separates what the .docx flattens: footnotes
   * sit in their own blocks and can be removed, and the ORIGINAL states its verse numbers.
   *
   * TWO independent anchors before anything is written — the source's verse number pairs original to
   * English, then our own paragraph is found by ENGLISH-to-ENGLISH match against that pairing.
   */
  fastify.post('/concepts/align-ool-work', admin, async (req) => {
    const { docId, stem, dryRun = true, minScore = 0.7, force = false } = req.body || {};
    if (!docId || !stem) throw ApiError.badRequest('docId and stem required');
    const { fetchPageParagraphs, pairByVerse } = await import('../lib/rag/concepts/ool-page.js');
    const { alignSequences, detectSourceLang } = await import('../lib/rag/concepts/align.js');
    const store = makeStore();

    // ALREADY COVERED? Then do not go looking for a source we do not need — and decide this BEFORE any
    // network call, so a covered book costs zero fetches. The Kitáb-i-Íqán is 290/292 from CTAI and I still
    // put it in a hand-typed list and pulled two pages for it (Chad, 2026-08-26: "Iqan is not needed… Why is
    // this even in the list?"). The target list belongs to the DATA — what is actually missing — not to my
    // memory of which books exist. force:true overrides for a deliberate re-run.
    {
      const pre = await store.resolveCanonicalDoc(Number(docId));
      const c = await store.getOriginalCoverage(pre);
      if (!force && c.total && c.aligned / c.total >= 0.9) {
        return { docId: pre, stem, skipped: 'already covered', aligned: c.aligned, total: c.total,
          pct: Math.round((100 * c.aligned) / c.total), written: 0 };
      }
    }
    const en = await fetchPageParagraphs(stem, 'en', { log: logger });
    if (!en?.length) throw ApiError.badRequest(`oceanoflights served no English for '${stem}'`);
    // ASK THE SITE which language is the original rather than preferring Arabic. Arabic-first would have
    // filed oceanoflights' ARABIC TRANSLATION of the Secret of Divine Civilization as its "original" — the
    // work is Persian — and nothing downstream could ever have detected it.
    const { findOriginalLanguage } = await import('../lib/rag/concepts/ool-page.js');
    const orig = await findOriginalLanguage(stem, { log: logger });
    if (!orig) throw ApiError.badRequest(`no page of '${stem}' declares itself the original`);
    const src = await fetchPageParagraphs(stem, orig.lang, { log: logger });
    if (!src?.length) throw ApiError.badRequest(`oceanoflights served no original for '${stem}' (${orig.lang})`);

    const paired = pairByVerse(en, src);
    if (!paired.rows.length) {
      return { docId: Number(docId), stem, paired: 0, basis: paired.basis, reason: paired.reason, written: 0 };
    }

    const resolved = await store.resolveCanonicalDoc(Number(docId));

    const ours = (await store.getParagraphs(resolved)).map((p) => ({ key: p.id, text: p.text }));
    const theirs = paired.rows.map((r, i) => ({ key: i, text: r.en }));
    const { matches, stats } = alignSequences(ours, theirs, { minScore, window: theirs.length });

    const rows = matches.map((m) => {
      const r = paired.rows[m.theirKey];
      return { paraId: m.ourKey, originalText: r.source, originalLang: detectSourceLang(r.source),
        translationAuthority: 'committee', wordAlignment: null,
        alignRef: JSON.stringify({ source: 'oceanoflights.org', stem, verse: r.n,
          basis: paired.basis, score: m.score, alignedAt: new Date().toISOString() }) };
    }).filter((r) => r.originalLang);

    const out = { docId: resolved, stem, originalLang: orig.lang, declared: orig.role, basis: paired.basis, paired: paired.rows.length,
      ...stats, candidates: rows.length, dryRun, written: 0,
      samples: rows.slice(0, 2).map((r) => ({ lang: r.originalLang, original: r.originalText.slice(0, 60) })) };
    if (dryRun || !rows.length) return out;
    out.written = await store.saveParagraphOriginals(rows);
    return out;
  });


  /**
   * POST /concepts/segment-ool-work {docId, stems?, dryRun=true, force=false}
   *
   * Populate the bilingual layer for a work whose original is a CONTINUOUS STREAM — no verse numbers, no
   * meaningful paragraphing to pair against. Chad, 2026-08-26: "the original has no original paragraph
   * segmentation. if it has any, they are artificial… Length is not relevant. Comprehension must be used."
   *
   * So a model reads both and says where each English paragraph BEGINS in the original, answering with a LINE
   * NUMBER (Chad: "Otherwise it will output slightly wrong text and you will not be able to find it").
   *
   * THREE THINGS ARE ESTABLISHED BEFORE THE MODEL IS PAID, each of which has already failed once here:
   *   1. the source page must DECLARE itself the original — preferring Arabic filed a translation as an
   *      original for the Secret of Divine Civilization, undetectably
   *   2. our paragraphs are bounded to the work by a deterministic English-to-English match — doc 20811 holds
   *      the Four Valleys as well, and the model must not be asked to place it in a Seven Valleys stream
   *   3. an already-covered book is skipped before any fetch
   */
  fastify.post('/concepts/segment-ool-work', admin, async (req) => {
    const { docId, stems: wantStems, dryRun = true, force = false, parasPerChunk = 150, minScore = 0.55 } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const { targetFor, NOT_THE_ORIGINAL } = await import('../lib/rag/concepts/originals-targets.js');
    const { fetchPageParagraphs, findOriginalLanguage } = await import('../lib/rag/concepts/ool-page.js');
    const { alignSequences, detectSourceLang, largestCluster, matchedRegion } = await import('../lib/rag/concepts/align.js');
    const seg = await import('../lib/rag/concepts/segment-original.js');
    const { withAIContext } = await import('../lib/ai-context.js');
    const { chatCompletion } = await import('../lib/ai.js');
    const { BILINGUAL_MODEL } = await import('../lib/pipeline/profile.js');
    const store = makeStore();

    const notOriginal = NOT_THE_ORIGINAL[Number(docId)];
    const target = targetFor(docId);
    const stems = wantStems?.length ? wantStems : target?.stems;
    if (!stems?.length) {
      // Name the reason. "No stems" and "the only source is a translation" are different situations, and the
      // second is a finding rather than a gap.
      throw ApiError.badRequest(notOriginal
        ? `doc ${docId} (${notOriginal.work}): ${notOriginal.why}`
        : `doc ${docId} is not in ORIGINALS_TARGETS and no stems[] was given`);
    }

    const resolved = await store.resolveCanonicalDoc(Number(docId));
    const cov = await store.getOriginalCoverage(resolved);
    if (!force && cov.total && cov.aligned / cov.total >= 0.9) {
      return { docId: resolved, skipped: 'already covered', ...cov, written: 0 };
    }

    const ours = (await store.getParagraphs(resolved)).map((p) => ({ key: p.id, text: p.text }));
    const model = BILINGUAL_MODEL;
    const perStem = [];
    const rows = [];

    for (const stem of stems) {
      const orig = await findOriginalLanguage(stem, { log: logger });
      if (orig?.role !== 'original') {
        perStem.push({ stem, skipped: `no page declares itself the original (${orig?.lang || 'none'}: ${orig?.role || 'none'})` });
        continue;
      }
      const [srcParas, enParas] = await Promise.all([
        fetchPageParagraphs(stem, orig.lang, { log: logger }),
        fetchPageParagraphs(stem, 'en', { log: logger }),
      ]);
      if (!srcParas?.length || !enParas?.length) {
        perStem.push({ stem, skipped: `page served no ${!srcParas?.length ? orig.lang : 'en'} text` });
        continue;
      }
      // The stream. Their paragraph breaks are discarded deliberately — they are the arbitrary ones.
      const originalText = srcParas.map((p) => p.text).join(' ');

      // BOUND OUR PARAGRAPHS TO THIS WORK, deterministically, before spending anything.
      const theirEn = enParas.map((p, i) => ({ key: i, text: p.text }));
      // matchedRegion, NOT alignSequences: locating a work needs a neighbourhood, and the monotonic aligner
      // is fragile for that job. One coincidental match (our ¶90 to their ¶29) came early in the sequence and
      // forbade every later match from using their ¶0-28 — silently costing the 25 paragraphs at the head of
      // the Four Valleys, which then looked like text the site did not publish.
      const idx = matchedRegion(ours, theirEn, { minScore });
      if (!idx.length) { perStem.push({ stem, skipped: 'none of our paragraphs match this work' }); continue; }
      // The outer range of the matches is NOT the work: doc 20811 holds both Valleys, and a handful of
      // coincidental matches inside the Seven Valleys stretched the Four Valleys' bound to [90, 209],
      // re-offering 32 paragraphs that had already been aligned to a different original. Take the dense
      // cluster instead — a work occupies a contiguous stretch, a lone distant match is a coincidence.
      const [lo, hi] = largestCluster(idx);
      const slice = ours.slice(lo, hi + 1);

      const lines = seg.numberLines(originalText);
      const chunks = seg.planChunks(slice.length, { parasPerChunk });
      const anchors = [];
      let floorLine = 1;
      for (const ch of chunks) {
        const win = seg.lineWindowFor({ floorLine, paraCount: ch.end - ch.start,
          englishCount: slice.length, lineCount: lines.length });
        const shown = lines.slice(win.from - 1, win.to);
        const prompt = seg.buildSegmentPrompt(slice.slice(ch.start, ch.end).map((p) => p.text), shown);
        const reply = await withAIContext(
          // sourceLang is what authorises the spend: the model is being handed Persian, which deepseek cannot read.
          { docId: resolved, stage: 'concept-segment-original', sourceLang: orig.lang, caller: 'segment-ool-work' },
          () => chatCompletion([{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
            { provider: 'anthropic', model, temperature: 0, maxTokens: 8000 }),
        );
        const text = reply?.content ?? reply?.text ?? '';
        for (const a of seg.parseAnchors(text)) {
          // English numbers ARE chunk-local ([1] restarts each chunk) and become book-absolute here. LINE
          // numbers are NOT: renderLines emits each line's own `n`, so a window starting at line 1297 shows
          // "1297|" and the model answers in absolute numbers already. Shifting them too put chunk 2 of the
          // Secret of Divine Civilization at lines 2488-2501 of an 1833-line book — every anchor past the
          // first chunk rejected as out of range, which is the good outcome of a bad bug.
          anchors.push({ ...a, index: a.index + ch.start });
        }
        const last = anchors.filter((a) => a.line != null).at(-1);
        if (last) floorLine = last.line;
      }

      const { spans, rejected, unconfirmed, exact, coverage } = seg.spansFromAnchors(originalText, anchors, slice.length);
      // READABLE PAIRS, on the dry run. A coverage number cannot tell a correct alignment from a confidently
      // wrong one — only reading the two texts side by side can, and that is the whole check this stage has.
      // Evenly spaced across the work, plus every UNCONFIRMED span, since those are where the model's own
      // words did not come from the line it named.
      const pairs = [];
      if (dryRun) {
        const want = Math.min(Number(req.body?.preview) || 12, spans.length);
        const step = want ? Math.max(1, Math.floor(spans.length / want)) : 1;
        const pick = new Set(spans.filter((_, i) => i % step === 0).slice(0, want).map((s) => s.index));
        for (const sp of spans) if (pick.has(sp.index) || !sp.confirmed) {
          pairs.push({ index: sp.index, line: sp.line, confirmed: sp.confirmed, exact: sp.exact,
            en: String(slice[sp.index - 1]?.text || '').slice(0, 220),
            original: sp.text.slice(0, 220) });
        }
      }
      for (const sp of spans) {
        const para = slice[sp.index - 1];
        if (!para) continue;
        const lang = detectSourceLang(sp.text);
        if (!lang) continue;
        rows.push({ paraId: para.key, originalText: sp.text, originalLang: lang,
          translationAuthority: 'committee', wordAlignment: null,
          alignRef: JSON.stringify({ source: 'oceanoflights.org', stem, basis: 'ai-segmentation',
            model, line: sp.line, confirmed: sp.confirmed, exact: sp.exact, alignedAt: new Date().toISOString() }) });
      }
      perStem.push({ stem, originalLang: orig.lang, originalWords: originalText.split(/\s+/).length,
        lines: lines.length, chunks: chunks.length, ourParagraphsInWork: slice.length,
        boundRange: [lo, hi], matchedOutsideCluster: idx.filter((i) => i < lo || i > hi).length,
        anchors: anchors.length, spans: spans.length,
        unconfirmed, exact, rejected: rejected.length, coverage,
        rejectedSamples: rejected.slice(0, 4).map((r) => ({ index: r.index, why: r.why })),
        ...(pairs.length ? { pairs } : {}) });
    }

    const out = { docId: resolved, work: target?.work ?? null, dryRun, model,
      ourParagraphs: ours.length, candidates: rows.length, perStem, written: 0,
      samples: rows.slice(0, 3).map((r) => ({ paraId: r.paraId, lang: r.originalLang, original: r.originalText.slice(0, 80) })) };
    if (dryRun || !rows.length) return out;
    out.written = await store.saveParagraphOriginals(rows);
    return out;
  });

  /**
   * GET /concepts/originals-gap — for EVERY canonical translation: has it got its original, and if not, is
   * one reachable? Chad, 2026-08-26: "I want to be sure we have found the original for all the documents
   * that are translations (and where original exists)." This counts it rather than asserting it.
   *
   * 'unreachable' is NOT 'no original exists' — a work recorded from talks genuinely has none, while a
   * tablet whose original we have not located is unfinished business. Kept apart so the second is visible.
   */
  fastify.get('/concepts/originals-gap', admin, async (req) => {
    const { originalsGapReport } = await import('../lib/rag/concepts/source-survey.js');
    return originalsGapReport({ limit: Math.min(1000, Number(req.query?.limit) || 500) });
  });

  /** GET /concepts/original-coverage?docId= — how much of the bilingual layer is actually populated. */
  fastify.get('/concepts/original-coverage', admin, async (req) => {
    const { CTAI_DOC_BY_WORK, CTAI_WORK_BY_DOC } = await import('../lib/rag/concepts/ctai.js');
    const ids = req.query?.docId ? [Number(req.query.docId)] : [...new Set(Object.values(CTAI_DOC_BY_WORK))];
    const store = makeStore();
    const docs = [];
    for (const id of ids) docs.push({ ...(await store.getOriginalCoverage(id)), work: CTAI_WORK_BY_DOC[id] || null });
    return { docs };
  });

  fastify.post('/concepts/sync', admin, async () => {
    // BOTH kinds. Entities have no writer yet (nothing in the codebase INSERTs concept_entities), so syncing
    // only those would keep reporting 0 while 1,651 real cited interpretations sat unindexed.
    const { syncConcepts, syncLexicon } = await import('../lib/search/concepts.js');
    const [entities, lexicon] = await Promise.all([syncConcepts(), syncLexicon()]);
    return { entities, lexicon };
  });

  fastify.get('/grounding/queue', admin, async () => ({ items: await queue.list() }));

  fastify.delete('/grounding/queue/:id', admin, async (req) => {
    const row = await queue.cancel(req.params.id);
    if (!row) throw ApiError.notFound('queue item not found');
    return row;
  });

  // Release books the storm-guard parked. The guard quarantines a doc after repeated identical failures so a
  // broken book cannot burn tokens forever; once the underlying bug is FIXED, the parked set has to be released
  // or the fix reaches nothing. Needing an ssh + raw-SQL session to do that is a missing endpoint, so: this is
  // it. `reason` defaults to the storm signature; the follower re-enqueues on its next tick (no restart).
  // Deliberately NOT automatic — releasing means real model spend on those books, which is an operator's call.
  fastify.post('/grounding/queue/unquarantine', admin, async (req) => {
    const reason = req.body?.reason || 'did not reach verify';
    const note = req.body?.note || `quarantine cleared ${new Date().toISOString().slice(0, 10)}`;
    const like = `%${reason}%`;
    const affected = await queryAll(
      `SELECT id, doc_id FROM grounding_queue
        WHERE status='failed' AND (COALESCE(error,'') LIKE ? OR COALESCE(note,'') LIKE ?)`, [like, like]);
    if (!affected.length) return { released: 0, docs: [] };
    // query() routes writes through the single writer, same as /queue/reset above.
    await query(
      `UPDATE grounding_queue SET error = ?,
         note = CASE WHEN COALESCE(note,'') LIKE ? THEN NULL ELSE note END
        WHERE status='failed' AND (COALESCE(error,'') LIKE ? OR COALESCE(note,'') LIKE ?)`,
      [note, like, like, like]);
    const docs = [...new Set(affected.map((r) => r.doc_id))];
    return { released: affected.length, docs };
  });

  // Force a supervisor pass (normally on a 20s timer) — useful right after enqueuing or stopping a run.
  fastify.post('/grounding/queue/tick', admin, async () => queue.tick());

  // Reset the working queue: SIGTERM any running procs, drop all queued/running rows, clear stale run_json. In
  // plan/general mode the processor re-derives the next work from the plan on its next tick, so this is the
  // API-native way to recover a tangled queue — no direct DB access. Writes route through the single writer.
  fastify.post('/grounding/queue/reset', admin, async () => {
    const running = await queryAll(`SELECT pid FROM grounding_queue WHERE status='running' AND pid IS NOT NULL`);
    let killed = 0;
    for (const r of running) { try { process.kill(Number(r.pid), 'SIGTERM'); killed++; } catch { /* already gone */ } }
    const before = (await queryOne(`SELECT COUNT(*) n FROM grounding_queue WHERE status IN ('queued','running')`))?.n || 0;
    await query(`DELETE FROM grounding_queue WHERE status IN ('queued','running')`);
    await query(`UPDATE doc_pipeline SET run_json=NULL WHERE run_json IS NOT NULL`);
    return { cleared: before, killed };
  });

  // ── MONITOR: everything an operator needs in ONE call ───────────────────────────────────────────────────────
  // live runs + the work order + spend per book + budget. Exists so babysitting is a single cheap poll instead of
  // a pile of ad-hoc SQL: the watcher reports, the API decides.
  fastify.get('/grounding/monitor', admin, async () => {
    const [runs, items, spend, bandHolder, budget] = await Promise.all([
      state.activeRuns(),
      queue.list({ limit: 12 }),
      queryAll(`SELECT CAST(document_id AS INT) docId, provider, COUNT(*) calls,
                  ROUND(SUM(estimated_cost_usd), 4) usd
                FROM ai_usage WHERE caller='corpus-rag' AND document_id IS NOT NULL
                GROUP BY docId, provider ORDER BY usd DESC`),
      graphBandHolder().catch(() => null),
      queue.budgetStatus().catch(() => []),
    ]);
    const byProvider = {};
    for (const s of spend) byProvider[s.provider] = Math.round(((byProvider[s.provider] || 0) + s.usd) * 100) / 100;
    const queued = items.filter((i) => i.status === 'queued');
    // A single health verdict the cloud health-check reads to decide whether to ping the user AT ALL.
    const overBudget = budget.filter((b) => b.over).map((b) => b.provider);
    const warnBudget = budget.filter((b) => b.warn && !b.over).map((b) => b.provider);
    const peakBlocked = budget.filter((b) => b.peakBlocked);
    const offPeakResumesAt = peakBlocked.length
      ? Math.min(...peakBlocked.map((b) => b.offPeakResumesAt).filter((t) => t)) : null;
    const health = {
      ok: overBudget.length === 0,
      overBudget,                                   // providers at ceiling → new books of theirs are paused
      warnBudget,                                   // providers ≥ warn_frac → heads-up
      queuedBlocked: overBudget.length > 0 && queued.length > 0,  // work waiting behind a budget wall
      // DELIBERATE off-peak hold: work IS queued but held for cheap hours → the UI shows "waiting for off-hour
      // rates · [countdown]" (offPeakResumesAt) so a paused-for-savings pipeline never reads as stuck.
      peakWaiting: peakBlocked.length > 0 && queued.length > 0,
      offPeakResumesAt,
      liveCount: runs.length,
    };
    return {
      live: runs.map((r) => ({ docId: r.doc_id, stage: r.stage, toStage: r.toStage ?? null, pid: r.pid,
        itemsDone: r.itemsDone, itemsTotal: r.itemsTotal, startedAt: r.startedAt, updatedAt: r.updatedAt })),
      queue: queued,
      recent: items.filter((i) => i.status !== 'queued'),
      graphBandHolder: bandHolder,   // docId currently in the project→dedup mutex, or null
      spend: { byBook: spend, byProvider, total: Math.round(spend.reduce((a, b) => a + b.usd, 0) * 100) / 100 },
      budget,                        // [{provider, spent, ceiling, frac, over, warn}] — the server-side spend gate
      health,
    };
  });

  // SET/UPDATE a provider budget ceiling — the server-side spend backstop for unattended runs. Baseline is captured
  // automatically as the current spend for that provider, so `ceiling_usd` is the INCREMENTAL allowance from now.
  fastify.post('/grounding/budget', admin, async (req) => {
    const { provider, ceilingUsd, warnFrac, offpeakOnly, peakWindows } = req.body || {};
    if (!provider || !(Number(ceilingUsd) > 0)) throw ApiError.badRequest('provider + positive ceilingUsd required');
    const pw = Array.isArray(peakWindows) ? JSON.stringify(peakWindows) : null;   // NULL → server DEFAULT_PEAK_WINDOWS
    const base = await queryOne(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage WHERE provider=? AND caller='corpus-rag'`, [provider]);
    // baseline_at is what makes the spend check BOUNDED: every later read sums only rows after this moment
    // instead of rescanning all billing history (migration 110). Captured from the DB clock, not the app's,
    // so it is comparable to ai_usage.timestamp even if the two ever disagree.
    await query(`INSERT INTO grounding_budget (provider, ceiling_usd, baseline_usd, warn_frac, offpeak_only, peak_windows, updated_at, baseline_at)
                 VALUES (?, ?, ?, ?, ?, ?, unixepoch(), datetime('now'))
                 ON CONFLICT(provider) DO UPDATE SET ceiling_usd=excluded.ceiling_usd, baseline_usd=excluded.baseline_usd,
                   warn_frac=excluded.warn_frac, offpeak_only=excluded.offpeak_only, peak_windows=excluded.peak_windows,
                   updated_at=unixepoch(), baseline_at=datetime('now')`,
      [provider, Number(ceilingUsd), base?.s || 0, Number(warnFrac) > 0 ? Number(warnFrac) : 0.8, offpeakOnly ? 1 : 0, pw]);
    logger.info({ provider, ceilingUsd, baseline: base?.s || 0, offpeakOnly: !!offpeakOnly }, 'grounding budget set');
    return { provider, ceilingUsd: Number(ceilingUsd), baselineUsd: base?.s || 0, offpeakOnly: !!offpeakOnly, budget: await queue.budgetStatus() };
  });

  // STOP a live run — signal the reported pid (best-effort) and clear the run marker so the UI goes idle.
  fastify.post('/grounding/stop', admin, async (req) => {
    const { docId } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const run = await state.getRun(Number(docId));
    if (!run?.pid) throw ApiError.notFound(`no live run for doc ${docId}`);
    let signalled = false;
    try { process.kill(run.pid, 'SIGTERM'); signalled = true; } catch { /* already gone */ }
    await state.setRun(Number(docId), null);
    logger.info({ docId: Number(docId), pid: run.pid, signalled }, 'grounding stopped via control API');
    return { stopped: true, docId: Number(docId), pid: run.pid, signalled };
  });

  // MERGE entities — reversible (repoints mentions+claims, records an append-only decision). Replaces raw SQL merges.
  fastify.post('/grounding/merge', admin, async (req) => {
    const { canonicalId, mergeIds, reason } = req.body || {};
    if (!canonicalId || !Array.isArray(mergeIds) || !mergeIds.length) throw ApiError.badRequest('canonicalId + non-empty mergeIds[] required');
    const ids = mergeIds.map(Number).filter((n) => n && n !== Number(canonicalId));
    if (!ids.length) throw ApiError.badRequest('no valid mergeIds (distinct from canonicalId)');
    const merged = await makeStore().applyMerge(Number(canonicalId), ids, reason || 'merge via control API');
    logger.info({ canonicalId: Number(canonicalId), mergeIds: ids, reason }, 'entities merged via control API');
    return { merged, canonicalId: Number(canonicalId), mergeIds: ids };
  });

  // BACKUP the small entity tables (gz) — the operator's manual dump, on demand.
  fastify.post('/grounding/backup', admin, async () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const out = `/tank/backups/entity/entity-tables-${stamp}.sql.gz`;
    const cmd = `sqlite3 ${process.cwd()}/data/sifter.db ".dump graph_entities entity_research entity_mentions_v2 entity_decisions entity_claims" | gzip > ${out}`;
    await new Promise((res, rej) => {
      const c = spawn('sh', ['-c', cmd], { stdio: 'ignore' });
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`backup exit ${code}`))));
      c.on('error', rej);
    });
    logger.info({ out }, 'entity tables backed up via control API');
    return { backedUp: true, path: out };
  });

  // Processor MODE: plan (follow the history plan) | override (agents hand-enroll) | general (whole library).
  // GET returns the current mode; POST switches it at runtime (in-memory → a restart reverts to the safe default).
  // Hourly progress digest: emails what finished in (since, now]. Driven by a cron that tracks the window in a
  // state file (robust across restarts). `preview=1` renders without sending. `now` (upper bound) is returned so
  // the cron persists it as the next window's `since` → contiguous, no gaps or overlaps.
  fastify.post('/grounding/digest', admin, async (req) => {
    const b = req.body || {};
    const now = (await queryOne('SELECT unixepoch() n'))?.n ?? Math.floor(Date.now() / 1000);
    const since = Number(b.since) || (now - 3600);
    if (b.preview) { const d = await digest.buildDigest(since); return { since, now, count: d.books.length, processing: d.processing.length, html: digest.renderDigestHtml(d) }; }
    const r = await digest.sendDigest(since, { force: !!(b.test || b.force) });   // test/force → always send (verify email)
    return { since, now, ...r };
  });

  // Trigger a plan-follower pass now (normally on a ~3-min timer) — repopulates the queue with the next books in
  // plan order (incl. the pilgrim/period primary-source groups). Useful right after a queue reset.
  fastify.post('/grounding/plan/tick', admin, async (req) => {
    const lookahead = Number((req.body || {}).lookahead) || Number(process.env.GROUNDING_LOOKAHEAD || 8);
    return processor.followPlanTick({ lookahead });
  });

  fastify.get('/grounding/mode', admin, async () => ({ mode: processor.getMode(), modes: ['plan', 'override', 'general'] }));

  // GET /grounding/exhaustion — is there any plan work the follower could actually START?
  // The roadmap grades a book "not done" from claim coverage; the follower separately decides whether it can
  // ground it at all. When every remaining book is a husk (zero prose), language-parked, or quarantined, the
  // queue drains to empty and STAYS empty — indistinguishable, to a queue-depth alarm, from a wedged pipeline.
  // system-checks reads this so `Grounding progress` can say "plan exhausted" instead of crying CRITICAL forever.
  fastify.get('/grounding/exhaustion', admin, async () => processor.planExhaustion());

  // ── Merge-tombstone integrity (2026-08-24). applyMerge used to mark merged duplicates by appending
  //    ' ⟨merged→N⟩' to canonical_name — a form no API reader checked — so 6,668 hollow entities were served
  //    as live people. The writer is fixed; these repair the rows it already wrote.
  //
  // GET  /entities/merge-divergence   — the DETECTOR. servedButMerged must be 0.
  // POST /entities/repair-merge-tombstones {dryRun=true, chunkSize=200}
  //      Rewrites each marked row to `last_assessed_version='merged-into-<finalSurvivor>'` (chain-resolved)
  //      and restores canonical_name. Idempotent; dry-run by default; unresolvable rows are reported, never guessed.
  fastify.get('/entities/merge-divergence', admin, async () => mergeTombstoneDivergence());
  fastify.get('/entities/key-collisions', admin, async () => naturalKeyCollisions());

  // GET /content/gutted-canonicals — the DETECTOR for a canonical work emptied of its content.
  // 20 OceanLibrary canonicals sat with all 14,588 paragraphs soft-deleted for two months (2026-06-12 →
  // 08-25) because the existing tripwire alarms on live-content DROPS and these were already-deleted rows
  // sitting still. `orphaned` must be 0; `suppressed` (a duplicate_of target that genuinely holds prose) is
  // the one benign case and is counted separately, never summed into the alarm.
  fastify.get('/content/gutted-canonicals', admin, async () => guttedCanonicals());

  // GET /content/duplicate-canonicals — canonical titles with MORE THAN ONE LIVE copy holding content.
  // A tombstone is not a duplicate: 8301 "Prayers and Meditations" was soft-deleted in May with
  // duplicate_of → 20805, but a listing with no deleted_at filter returned it beside the live canonical and
  // read as a dedupe failure. Counting rows that bear a title answers nothing; only live rows with prose do.
  fastify.get('/content/duplicate-canonicals', admin, async () => liveDuplicateCanonicals());
  // Rows merged into EACH OTHER (A→B, B→A) — no chain terminates, so the main repair skips them.
  // Survivor is chosen by evidence (claims+mentions), ties by lowest id; the rest tombstone to it.
  fastify.post('/entities/break-merge-cycles', admin, async (request) =>
    breakMergeCycles({ dryRun: (request.body || {}).dryRun !== false }));
  fastify.post('/entities/repair-merge-tombstones', admin, async (request) => {
    const b = request.body || {};
    return repairMergeTombstones({ dryRun: b.dryRun !== false, chunkSize: Math.min(500, +b.chunkSize || 200) });
  });
  fastify.post('/grounding/mode', admin, async (req) => {
    const m = (req.body || {}).mode;
    if (!m) throw ApiError.badRequest('mode required (plan|override|general)');
    try { return { mode: processor.setMode(m) }; } catch (e) { throw ApiError.badRequest(e.message); }
  });

  // The supervisor + processor live with the control plane: same process, same lifecycle. NEVER under test (they
  // would spawn real books against the real corpus); GROUNDING_SUPERVISOR=0 disables them in any environment.
  if (process.env.NODE_ENV !== 'test' && process.env.GROUNDING_SUPERVISOR !== '0') {
    await queue.killStrayGroundingProcs(); // clean slate: kill any detached procs a restart left behind, else the fresh
                                     // supervisor re-derives the same books → duplicate-spawn runaway (2026-08-07)
    queue.startSupervisor();     // runs the queue serially
    processor.startProcessor();  // chooses the next work per the active mode (plan by default)
  }
}
