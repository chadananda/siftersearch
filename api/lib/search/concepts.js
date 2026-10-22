// concepts/index sync — push concept_entities into Meili so a concept is searchable in its own right.
//
// The payoff this exists for (conceptual-track §6): a reader asks about "the Covenant", "grace", or "the
// Word" and reaches the corresponding concept in EACH tradition, in that tradition's own terms. That needs
// concepts as first-class searchable records, not only as claims hanging off paragraphs.
//
// Identity is the ROOT, not the English label. One English word collapses distinct concepts — insáf (انصاف,
// personal equity) and ‘adl (عدل, societal justice) both gloss "justice" — so the root is indexed and
// searchable alongside the canonical, exactly as a person's identity is the Arabic-script name rather than
// the romanization.
import { getMeili, INDEXES } from '../search.js';
import { queryAll } from '../db.js';
import { rowsForDoc } from '../repos/block-attrs-repo.js';
import { createHash } from 'node:crypto';

export const CONCEPT_SELECT = `
  SELECT id, canonical, root, renderings, concept_type, tradition, importance, summary
    FROM concept_entities`;

/** DB row → the neutral index document. Pure, so the shape is testable without Meili or a DB. */
export function conceptDoc(row) {
  let renderings = row?.renderings;
  if (typeof renderings === 'string') {
    try { renderings = JSON.parse(renderings); } catch { renderings = [renderings]; }
  }
  return {
    id: row.id,
    canonical: row.canonical || '',
    root: row.root || null,
    // Flattened to a string: Meili searches strings, and the spectrum of renderings is exactly what makes a
    // concept findable by whichever word the reader happens to know.
    renderings: Array.isArray(renderings) ? renderings.filter(Boolean).join(' · ') : (renderings || null),
    concept_type: row.concept_type || 'concept',
    tradition: row.tradition || null,
    importance: typeof row.importance === 'number' ? row.importance : null,
    summary: row.summary || null,
  };
}

/**
 * Push every concept entity into the index. Small table (concepts are entities, not paragraphs), so this is a
 * full refresh rather than a dirty-flag cycle — and a full refresh cannot develop the drift that left
 * `context` unsynced for a month when its flag lost its consumer.
 * @returns {Promise<{indexed:number, taskUid?:number, skipped?:string}>}
 */
export async function syncConcepts({ limit = 20000 } = {}) {
  if (!getMeili()) return { indexed: 0, skipped: 'meilisearch retired' };   // storage plan R8
  const rows = await queryAll(`${CONCEPT_SELECT} LIMIT ?`, [limit], 'concepts:sync-read');
  // Ensure the index EXISTS even with nothing to write. Meili creates an index lazily on first document
  // write, so an empty concepts table left the index absent — a query for it 404s rather than returning
  // "no results", and the settings registered in search.js had nothing to attach to. Verified: the API had
  // restarted after those settings shipped and the index still did not exist. Don't depend on startup-loop
  // timing for something a caller can guarantee directly.
  try {
    await getMeili().createIndex(INDEXES.CONCEPTS, { primaryKey: 'id' });
  } catch (err) {
    if (!/already exists|index_already_exists/i.test(err?.message || '')) throw err;
  }
  if (!rows.length) return { indexed: 0, skipped: 'no concept entities yet', indexReady: true };
  const docs = rows.map(conceptDoc);
  const task = await getMeili().index(INDEXES.CONCEPTS).addDocuments(docs, { primaryKey: 'id' });
  return { indexed: docs.length, taskUid: task?.taskUid };
}

// ── lexicon entries as index records ─────────────────────────────────────────────────────────────────────
// concept_entities has NO WRITER anywhere in this codebase (verified 2026-08-20: zero INSERT/UPDATE against
// it; the promotion stage that would create entities was never built). An index reading only that table can
// therefore never fill, however many concepts are extracted.
//
// The LEXICON does exist and is the thing worth searching: 1,651 cited interpretations, each with its
// authority, tier and verbatim proof. That is what makes §6's "ask one concept across traditions" possible
// today. Records are tagged kind='lexicon' and their ids namespaced, so promoted entity records can share the
// index later without either overwriting the other.
export const LEXICON_SELECT = `
  SELECT id, symbol, interpretation, authority, authority_tier, layer, proof_doc_id, proof_para_id, proof_verbatim
    FROM concept_lexicon`;

/** DB row → index document. Pure. */
export function lexiconDoc(row) {
  return {
    id: `lex_${row.id}`,
    kind: 'lexicon',
    symbol: row.symbol || '',
    interpretation: row.interpretation || '',
    authority: row.authority || null,
    authority_tier: typeof row.authority_tier === 'number' ? row.authority_tier : null,
    layer: row.layer ?? null,
    proof_doc_id: row.proof_doc_id ?? null,
    proof_para_id: row.proof_para_id ?? null,
    proof_verbatim: row.proof_verbatim || null,
    paragraph_id: row.paragraph_id ?? null,
  };
}

const flat = (s) => String(s || '').replace(/⁅[^⁆]*⁆/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

/** The content row a lexicon proof points at: the block id (para_N) when the rows carry it, else the row whose text
 *  holds the verbatim proof. Pure over the doc's rows. */
export function proofParagraph(rows, { proof_para_id, proof_verbatim }) {
  const byBlock = proof_para_id && rows.find((r) => { try { return JSON.parse(r.block_attrs || '{}').id === proof_para_id; } catch { return false; } });
  const v = flat(proof_verbatim).slice(0, 80);
  if (byBlock && (!v || flat(byBlock.text).includes(v))) return byBlock.id;
  return (v && rows.find((r) => flat(r.text).includes(v))?.id) || byBlock?.id || null;
}

/** A lexicon symbol is NAMED by the question when every content word of it appears there ("the sun" in "what does
 *  the sun symbolise"; "Sun of Truth" is not named by it). Pure. */
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'his', 'her', 'its', 'my', 'thy', 'in', 'to', 'god', "god's"]);
export function symbolNamed(symbol, query) {
  const words = flat(symbol).split(/[^a-z0-9'á-ž]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return false;
  const q = new Set(flat(query).split(/[^a-z0-9'á-ž]+/).flatMap((w) => [w, w.replace(/'s$/, ''), w.replace(/s$/, '')]));
  return words.every((w) => q.has(w) || q.has(w.replace(/s$/, '')));
}

/** CONCEPT LAYER: the authoritative interpretation of a symbol the question names (concept_lexicon, cited) → its proof
 *  paragraph, as a ranked list for multiIndexSearch. Empty unless a symbol is actually named. */
// The lexicon IN MEMORY (10-20: Meilisearch retired — Chad): a few thousand cited entries, loaded from SQLite with each
// proof resolved to its content row once, refreshed every 30 min, never on a search's path (the first searches after a
// boot simply find no concept until the load lands).
const LEX_TTL_MS = 30 * 60 * 1000;
let lexicon = null, lexAt = 0, lexLoading = null;
// Each book's rows INDEXED once (block id → row, folded text) — proofParagraph per entry re-parsed every row's block_attrs
// and re-folded every text, ~29,000 entries × thousands of rows: it blocked the API's event loop for minutes at boot
// (10-20 outage). Resolution is now a map lookup, the text scan only a fallback, yielding every 200 entries.
export function indexRows(rows) {
  const byBlock = new Map();
  const flats = rows.map((r) => { try { const id = JSON.parse(r.block_attrs || '{}').id; if (id) byBlock.set(id, r); } catch { /* none */ } return [r.id, flat(r.text)]; });
  return { byBlock, flats };
}
export function proofParagraphIndexed({ byBlock, flats }, { proof_para_id, proof_verbatim }) {
  const hit = proof_para_id ? byBlock.get(proof_para_id) : null;
  const v = flat(proof_verbatim).slice(0, 80);
  if (hit && (!v || flat(hit.text).includes(v))) return hit.id;
  return (v && flats.find(([, f]) => f.includes(v))?.[0]) || hit?.id || null;
}
/** What the proof resolution depends on, as one string: unchanged rows → the previous resolution is reused as is. Pure. */
export function lexiconSignature(rows) {
  const h = createHash('sha1');
  for (const r of rows) h.update(`${r.id}\u0001${r.symbol}\u0001${r.interpretation}\u0001${r.authority}\u0001${r.authority_tier}\u0001${r.layer}\u0001${r.proof_doc_id}\u0001${r.proof_para_id}\u0001${r.proof_verbatim}\u0002`);
  return `${rows.length}:${h.digest('hex')}`;
}
// previous: { sig, entries } from the last load. A REFRESH of an unchanged lexicon costs one SELECT: re-reading every proof
// book (0.2–0.6 s of synchronous SQLite each, ~4 s in all) is what made the first search of a fresh API process 6–10 s (10-22).
export async function loadLexicon({ rows: given = null, rowsOf = rowsForDoc, previous = null } = {}) {
  const rows = given || await queryAll(LEXICON_SELECT, [], 'concepts:lexicon-load');
  const sig = lexiconSignature(rows);
  if (previous?.sig === sig && previous.entries) return Object.assign(previous.entries, { sig });
  const idx = new Map();
  for (const d of new Set(rows.map((r) => r.proof_doc_id).filter(Boolean))) {
    idx.set(d, indexRows(await rowsOf(d).catch(() => [])));
    await new Promise((r) => setImmediate(r));
  }
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out.push(lexiconDoc({ ...r, paragraph_id: r.proof_doc_id ? proofParagraphIndexed(idx.get(r.proof_doc_id) || indexRows([]), r) : null }));
    if (i % 200 === 199) await new Promise((res) => setImmediate(res));
  }
  return Object.assign(out, { sig });
}
function startLexiconLoad() {
  lexLoading = loadLexicon({ previous: lexicon ? { sig: lexicon.sig, entries: lexicon } : null })
    .then((l) => { lexicon = l; lexAt = Date.now(); }).catch(() => {}).finally(() => { lexLoading = null; });
  return lexLoading;
}
function lexiconNow() {
  if (!lexLoading && (!lexicon || Date.now() - lexAt > LEX_TTL_MS)) startLexiconLoad();
  return lexicon || [];
}
/** Load (or reuse) the lexicon OFF the request path — boot warm-up and the warm keeper. Resolves when it is in memory. */
export const warmLexicon = () => { lexiconNow(); return lexLoading || Promise.resolve(); };
/** Re-read now, whatever its age (the warm keeper, before the TTL makes a search do it); an unchanged lexicon is reused. */
export const refreshLexicon = () => lexLoading || startLexiconLoad();
export const lexiconLoaded = () => !!lexicon;

/** CONCEPT LAYER: the authoritative interpretation of a symbol the question names (concept_lexicon, cited) → its proof
 *  paragraph, as a ranked list for multiIndexSearch. Empty unless a symbol is actually named. entries: tests. */
export async function searchConceptProofs(_deps, query, { limit = 8, entries = null } = {}) {
  if (!query) return { hits: [] };
  const seen = new Set();
  const hits = (entries || lexiconNow()).filter((h) => h.paragraph_id && symbolNamed(h.symbol, query))
    .sort((a, b) => (a.authority_tier ?? 99) - (b.authority_tier ?? 99))
    .filter((h) => !seen.has(h.paragraph_id) && seen.add(h.paragraph_id)).slice(0, limit);
  return { hits: hits.map((h) => ({ paragraph_id: h.paragraph_id, doc_id: h.proof_doc_id, concept: { symbol: h.symbol, interpretation: h.interpretation, authority: h.authority } })) };
}

/** Push lexicon entries into the concepts index. Full refresh, same reasoning as syncConcepts. */
export async function syncLexicon({ limit = 50000 } = {}) {
  if (!getMeili()) return { indexed: 0, skipped: 'meilisearch retired' };   // storage plan R8
  const rows = await queryAll(`${LEXICON_SELECT} LIMIT ?`, [limit], 'concepts:sync-lexicon');
  try {
    await getMeili().createIndex(INDEXES.CONCEPTS, { primaryKey: 'id' });
  } catch (err) {
    if (!/already exists|index_already_exists/i.test(err?.message || '')) throw err;
  }
  if (!rows.length) return { indexed: 0, skipped: 'no lexicon entries yet', indexReady: true };
  // Resolve each proof to its content row once, here (a handful of interpreter works), so search reads ids only.
  const byDoc = new Map();
  for (const d of new Set(rows.map((r) => r.proof_doc_id).filter(Boolean))) byDoc.set(d, await rowsForDoc(d).catch(() => []));
  const docs = rows.map((r) => lexiconDoc({ ...r, paragraph_id: r.proof_doc_id ? proofParagraph(byDoc.get(r.proof_doc_id) || [], r) : null }));
  const task = await getMeili().index(INDEXES.CONCEPTS).addDocuments(docs, { primaryKey: 'id' });
  return { indexed: docs.length, located: docs.filter((d) => d.paragraph_id).length, taskUid: task?.taskUid };
}
