// concepts/source-survey — WHICH canonical works are translations, and where each one's original can
// actually be got. The prerequisite for "fetch the source for every translated canonical" (Chad,
// 2026-08-25): before fetching anything we need to know what is fetchable, from where, and what is not.
//
// THREE POSSIBLE SOURCES, in descending order of directness:
//
//   in-corpus  — an original-language document of the same work already in our library. Best case: no
//                external dependency, no rate limit, and the text is already under our provenance rules.
//                The corpus holds 245 Arabic and 23 Persian documents attributed to the Báb alone.
//   ctai       — the CTAI concordance. Measured coverage (2026-08-25): 11 works only — Gleanings,
//                Kitáb-i-Íqán, the Hidden Words, the Epistle, Prayers and Meditations, the Will and
//                Testament, and the tablets of the Holy Mariner / Aḥmad / Carmel / the Kitáb-i-‘Ahd /
//                the Fire Tablet. It is a concordance of Shoghi Effendi's renderings, so works he did not
//                translate — the Kitáb-i-Aqdas, Some Answered Questions, the Tablets of the Divine Plan —
//                are NOT in it and never will be.
//   none       — no original located. Reported explicitly, because a work we cannot source is a fact the
//                extraction plan has to account for, not a blank to be quietly skipped.
//
// The survey RANKS candidates but does not bind them. Title matching across languages and transliteration
// systems is recall, not identification — the same doctrine that governs person names. A candidate is a
// proposal for the alignment pass to confirm by actual text overlap; it is never itself the answer.
// Deps: db (read-only), ctai.js (the work map).

import { queryAll } from '../../db.js';
import { CTAI_WORK_BY_DOC, CTAI_DOC_BY_WORK } from './ctai.js';

// Authors who wrote in Arabic or Persian. An English document by one of these is BY DEFINITION a
// translation, whoever rendered it — which is the population Chad asked to cover, not just the six works
// Shoghi Effendi translated.
const ORIGINAL_LANGUAGE_AUTHORS = /(bah[áa].?u.?ll[áa]h|abdu.?l.?bah[áa]|the b[áa]b|b[áa]b\b|shoghi)/i;

const ORIGINAL_LANGS = ['ar', 'fa'];

/** Title key for cross-language recall: strip diacritics, articles, punctuation. RECALL ONLY. */
export function titleKey(title) {
  return String(title || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`ʻʼ"".,:;!?()[\]]/g, '')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Overlap of two title keys by word set, 0..1. Pure. */
export function titleSimilarity(a, b) {
  const A = new Set(titleKey(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(titleKey(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return (2 * hit) / (A.size + B.size);
}

/**
 * Survey every canonical English document that is a translation, and rank where its original might come from.
 *
 * `minTitleScore` gates the in-corpus candidate list. It is deliberately permissive — this is the recall
 * step, and the alignment pass is what decides. Returning too few candidates hides real originals; returning
 * a few extra costs one cheap comparison each.
 */
export async function surveyTranslatedCanonicals({ query = queryAll, minTitleScore = 0.34, limit = 500 } = {}) {
  // CANONICAL only: oceanlibrary.com or the main library (source_site NULL). The corpus holds 147,477
  // scraped documents against oceanlibrary's 565, so an unfiltered title search returns scrapes ~128:1.
  const canonicals = await query(`
    SELECT d.id, d.title, d.author, d.language, d.collection, d.source_site,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) paras,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL
                                             AND c.original_text IS NOT NULL) aligned
      FROM docs d
     WHERE d.deleted_at IS NULL
       AND (d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL)
       AND COALESCE(d.language, 'en') = 'en'
       AND d.duplicate_of IS NULL
     ORDER BY paras DESC
     LIMIT ?`, [limit], 'survey:canonical-en');

  // Every original-language document we hold, canonical or not. An original does not have to be canonical
  // to BE the original — provenance governs which English text we cite, not which source text we consult.
  const originals = await query(`
    SELECT d.id, d.title, d.author, d.language, d.source_site,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) paras
      FROM docs d
     WHERE d.deleted_at IS NULL
       AND d.language IN (${ORIGINAL_LANGS.map(() => '?').join(',')})
     ORDER BY paras DESC`, ORIGINAL_LANGS, 'survey:originals');

  const withParas = originals.filter((o) => o.paras > 0);
  const rows = [];

  for (const d of canonicals) {
    if (d.paras === 0) continue;                                  // gutted doc — invariant 12's problem, not this one
    const isTranslation = ORIGINAL_LANGUAGE_AUTHORS.test(d.author || '');
    if (!isTranslation) continue;

    const ctaiWork = CTAI_WORK_BY_DOC[d.id] || null;
    const candidates = withParas
      .map((o) => ({ ...o, score: Number(titleSimilarity(d.title, o.title).toFixed(3)) }))
      .filter((o) => o.score >= minTitleScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    rows.push({
      docId: d.id, title: d.title, author: d.author, collection: d.collection,
      paragraphs: d.paras, alreadyAligned: d.aligned,
      // The best available route, named. 'none' is a REPORTED state, not an omission.
      route: ctaiWork ? 'ctai' : candidates.length ? 'in-corpus' : 'none',
      ctaiWork,
      candidates: candidates.map((c) => ({ id: c.id, title: c.title, lang: c.language,
        paras: c.paras, sourceSite: c.source_site, score: c.score })),
    });
  }

  const by = (r) => rows.filter((x) => x.route === r);
  return {
    canonicalEnglishChecked: canonicals.length,
    translations: rows.length,
    originalLanguageDocs: withParas.length,
    routes: { ctai: by('ctai').length, inCorpus: by('in-corpus').length, none: by('none').length },
    paragraphs: {
      total: rows.reduce((n, r) => n + r.paragraphs, 0),
      alreadyAligned: rows.reduce((n, r) => n + r.alreadyAligned, 0),
      reachable: rows.filter((r) => r.route !== 'none').reduce((n, r) => n + r.paragraphs, 0),
      unreachable: by('none').reduce((n, r) => n + r.paragraphs, 0),
    },
    rows,
  };
}

/**
 * THE GAP REPORT: for every canonical translation, has it got its original, and if not, is one reachable?
 *
 * Chad, 2026-08-26: "I want to be sure we have found the original for all the documents that are
 * translations (and where original exists)." An assurance from me is not evidence; this counts it.
 *
 * Four states, and the distinction between the last two is the point:
 *   covered      — ≥90% of prose paragraphs carry an original. Done.
 *   partial      — some but not most. Usually a compilation where only part of the work is parallel.
 *   reachable    — none yet, but a source exists (CTAI holds the work, or oceanoflights serves the stem).
 *   unreachable  — no source located. NOT the same as "no original exists": a work recorded from talks
 *                  (Paris Talks) genuinely has none, whereas a tablet whose original we simply have not
 *                  found is unfinished business. Reported separately so the second kind is not lost among
 *                  the first.
 */
export async function originalsGapReport({ query = queryAll, limit = 500 } = {}) {
  // FILTER TO TRANSLATIONS IN SQL, THEN LIMIT. The first version ordered ALL canonical English docs by
  // paragraph count, took 500, and filtered to translations afterwards — so the limit fell on the wrong
  // population and dropped every book we had actually finished. It reported "0 covered" while the Íqán,
  // Gleanings and Prayers and Meditations were sitting at 99%, 94% and 96%. A truncation applied before the
  // selection is the same error as measuring one population and concluding about another (2026-08-26).
  const AUTHOR_SQL = `(d.author LIKE '%Bah%u%ll%h%' OR d.author LIKE '%Abdu%l-Bah%'
                       OR d.author LIKE '%The B%b%' OR d.author LIKE '%Shoghi%')`;
  const rows = await query(`
    SELECT d.id, d.title, d.author, d.collection,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL
                                             AND COALESCE(c.blocktype,'paragraph') IN ('paragraph','quote')) paras,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL
                                             AND c.original_text IS NOT NULL) aligned
      FROM docs d
     WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
       AND (d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL)
       AND COALESCE(d.language,'en') = 'en'
       AND ${AUTHOR_SQL}
     ORDER BY paras DESC LIMIT ?`, [limit], 'survey:gap-report');

  const ctaiDocs = new Set(Object.keys(CTAI_WORK_BY_DOC).map(Number));
  const out = { covered: [], partial: [], reachable: [], unreachable: [] };
  for (const d of rows) {
    if (!d.paras) continue;
    if (!ORIGINAL_LANGUAGE_AUTHORS.test(d.author || '')) continue;   // English-composed → no original to find
    const pct = d.aligned / d.paras;
    const entry = { docId: d.id, title: d.title, paras: d.paras, aligned: d.aligned,
      pct: Math.round(pct * 100), ctai: ctaiDocs.has(d.id) || Boolean(CTAI_DOC_BY_WORK[d.id]) };
    if (pct >= 0.9) out.covered.push(entry);
    else if (d.aligned > 0) out.partial.push(entry);
    else if (entry.ctai) out.reachable.push({ ...entry, via: 'ctai' });
    else out.unreachable.push(entry);
  }
  const sum = (a) => a.reduce((n, x) => n + x.paras, 0);
  return {
    // If the limit was actually hit, SAY SO — a coverage report that silently omits books is worse than none.
    ...(rows.length >= limit ? { truncated: true, warning: `hit the ${limit}-doc limit; raise ?limit= for the full picture` } : {}),
    translations: out.covered.length + out.partial.length + out.reachable.length + out.unreachable.length,
    counts: { covered: out.covered.length, partial: out.partial.length,
      reachable: out.reachable.length, unreachable: out.unreachable.length },
    paragraphs: { covered: sum(out.covered), partial: sum(out.partial),
      reachable: sum(out.reachable), unreachable: sum(out.unreachable) },
    ...out,
  };
}
