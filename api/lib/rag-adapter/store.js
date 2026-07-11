// SifterSearch Store adapter — implements the CorpusRAG `Store` port (see api/lib/rag/ports.js) over the
// application's SQLite schema. THIS is where every table and column name lives; the library core sees only
// the neutral domain shapes returned here. Writes go through db.js, which auto-routes them to the single
// writer when SIFTER_WRITER_URL is set. Grown method-by-method as stages need data.
import * as db from '../db.js';        // shared SQLite wrapper (reads direct, writes routed to the single writer)
import content from '../content.js';   // paragraph write helpers (updateContextOnly routes through the writer)

// Blocktypes that carry readable prose we enrich (skip figures, nav, etc.). App-specific → stays here.
const PROSE = "blocktype IN ('paragraph','quote')";

export function makeStore() {
  return {
    // Document metadata for profiling. Maps DB columns → the port's neutral DocMeta shape.
    async getDocMeta(docId) {
      return (await db.queryAll(
        `SELECT id, title, author, religion, collection, year, description, lang FROM docs WHERE id=?`, [docId]
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
        `SELECT id, COALESCE(external_para_id, 'p' || id) pid, paragraph_index pidx, heading, text,
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
  };
}
