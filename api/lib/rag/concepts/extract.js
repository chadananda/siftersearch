// concepts/extract — lift concepts to first-class claims. For the significant concepts/symbols a passage
// develops, extract cited doctrinal claims (concept → what it teaches/means), each gated by a VERBATIM proof
// span. Concept identity is DEFERRED (concept_id null; reconcile binds it against the interpretive lexicon).
// English-canonical concept names; the original-language ROOT captured where identifiable; proof stays
// verbatim in the source language. Gated on disambiguation. Mirrors entities/claims (proof-gate + deferral).
import { createHash } from 'node:crypto';
import { assertDisambiguated } from '../kernel/gate.js';
import { profileFor } from '../kernel/profile.js';
import { pool } from '../kernel/run.js';
import { buildBilingualSystem, buildBilingualUser } from './bilingual.js';
import { englishIsOriginal, coreEntry, CLASS } from './core-roster.js';

export async function run(ctx, docId, opts = {}) {
  await assertDisambiguated(ctx, docId, { threshold: opts.threshold ?? 0.98 });
  // ACCEPT EITHER DISAMBIGUATION. concepts/disambiguate is documented as "an ALTERNATIVE gate for doctrinal
  // works, not a second pass" and writes to the SAME context column — but it stamps 'concept-disambig-v1'
  // while this stage filtered for 'deepseek-disambig-v1' alone. So the concept track's own disambiguation
  // produced notes its own extractor silently skipped, leaving `paras: 0` on a fully-noted book: a stage
  // that reports success having read nothing. Same open-producer/closed-consumer shape as the heading
  // whitelist and the phrase re-rank. Verified 2026-08-26.
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1';
  const conceptVersion = ctx.config.versions?.conceptDisambig ?? 'concept-disambig-v1';
  const acceptedVersions = new Set([version, conceptVersion]);
  const extractor = opts.extractor ?? ctx.config.versions?.conceptExtract ?? 'concept-extract-v1';
  const batch = opts.batch ?? extractor;
  const profile = await profileFor(ctx, docId);
  let paras = (await ctx.store.getParagraphs(docId))
    .filter((p) => p.context && acceptedVersions.has(p.contextModel) && (p.kind ?? 'paragraph') === 'paragraph');
  if (opts.limit) paras = paras.slice(0, opts.limit);          // small reviewed slices before a full run
  const system = buildSystem(profile);
  // WHOSE RENDERING IS THIS? The prompt inverts on the answer — his word-choice FIXES which sense is
  // operative, a committee's does not — so getting it wrong mis-states the doctrine to the model.
  //
  // TWO SOURCES, DB FIRST, ROSTER AS BACKSTOP. Relying on the column alone means any future path that
  // populates an original without setting the authority silently UNDER-CREDITS him: his rendering would be
  // read as one translator's opinion. The roster knows which works he translated, so it can answer even
  // when the column is empty. Reported per run (authorityCount) so an 'unattributed' book is visible rather
  // than quietly taking the cautious path.
  const rosterAuthority = (id) => {
    const cls = coreEntry(id)?.cls;
    if (cls === CLASS.GUARDIAN_TRANSLATION) return 'shoghi-effendi';
    if (cls === CLASS.DESIGNATED) return 'committee';
    return null;
  };
  const authorityFor = (p) => p.translationAuthority ?? rosterAuthority(docId);
  const authorityCount = {};
  // BILINGUAL WHERE WE HAVE IT. A paragraph carrying its aligned original is read with BOTH texts in view:
  // the original fixes WHICH TERM (English collapses Ṣalát/Duʿá/Dhikr into "prayer", ʿadl/inṣáf into
  // "justice"), and an authorised rendering fixes WHICH SENSE. Per paragraph, not per book — a book's
  // alignment is never complete, and a paragraph without one must degrade honestly rather than be skipped.
  // Built PER AUTHORITY, not once: whose rendering the English is decides which text governs, so a doc whose
  // paragraphs carry different authorities must not share one prompt.
  const docMeta = await ctx.store.getDocMeta(docId);
  const systemFor = new Map();
  const bilingualSystemFor = (authority) => {
    if (!systemFor.has(authority)) systemFor.set(authority, buildBilingualSystem(profile, docMeta, { translationAuthority: authority }));
    return systemFor.get(authority);
  };
  // TWO routes, chosen PER PARAGRAPH below. A book is not uniformly bilingual — the Íqán is fa 272 / ar 18,
  // and paragraphs with no aligned original at all stay on the cheap English path.
  const route = { model: opts.model ?? profile.models.extract, fallback: opts.fallback ?? profile.fallback };
  const bilingualRoute = { model: opts.bilingualModel ?? profile.models.bilingualExtract ?? route.model,
    fallback: opts.bilingualModel ?? profile.models.bilingualExtract ?? route.fallback };
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 6000 : 3000);
  // proofFrom answers "which text is this doctrine cited from" — the number that would have shown, on the
  // first run, that every Persian-quoted proof was being thrown away.
  const stats = { paras: paras.length, claims: 0, written: 0, dropped: 0, failed: 0, escalated: 0, bilingual: 0, proofFrom: {}, dropSamples: [] };
  // A bare `paras: 0` is indistinguishable from "this book has no concepts". Name the reason.
  if (!paras.length) {
    const all = await ctx.store.getParagraphs(docId);
    stats.skippedReason = all.length
      ? `no paragraph carries an accepted disambiguation note (${[...acceptedVersions].join(' | ')}); run disambiguate first`
      : 'document has no prose paragraphs';
  }

  const rows = [];   // dry-run review buffer only
  // Write INCREMENTALLY per paragraph so a long run is resilient (a crash keeps prior work) and observable.
  await pool(opts.concurrency ?? 5, paras, async (p) => {
    const hasOriginal = Boolean(p.original);
    // Declare the ORIGINAL's language for this paragraph, so the spend policy can see the actual capability
    // case: deepseek cannot read Persian at all. Without this the gate has only the DOC's language (English)
    // and refuses the very call the exception exists to permit.
    const { withAIContext } = await import('../../ai-context.js');
    // Route by the ORIGINAL's language, not the document's: showing a Persian original to a model that
    // cannot read Persian is paying for a context window nobody uses.
    //
    // EXCEPT where the English IS the original (Chad, 2026-08-26: "unless we are referring to books
    // originally composed in English, like Nabil or Shoghi Effendi's letters"). God Passes By, The World
    // Order of Bahá'u'lláh, The Advent of Divine Justice, Citadel of Faith and the Messages were written by
    // him in English — there is no other text to consult, so the cheap English path is not a compromise
    // there, it is the correct reading. Checked explicitly rather than relying on original_text simply
    // being absent, so a stray alignment written onto such a book can never buy it a paid model.
    const bilingual = hasOriginal && ['ar', 'fa'].includes(p.originalLang) && !englishIsOriginal(docId);
    if (bilingual) authorityCount[authorityFor(p) ?? 'unattributed'] = (authorityCount[authorityFor(p) ?? 'unattributed'] || 0) + 1;
    const { parsed, escalated } = await withAIContext(
      { stage: 'concept-extract', docId, originalLang: bilingual ? p.originalLang : null },
      () => ctx.model.runLadder({
      route: bilingual ? bilingualRoute : route,
      system: bilingual ? bilingualSystemFor(authorityFor(p)) : system,
      user: bilingual
        ? buildBilingualUser(p, { source: p.original, translation: p.text })
        : buildUser(p),
      parse: parseConceptClaims, maxTokens }));
    if (bilingual) stats.bilingual++;
    if (escalated) stats.escalated++;
    if (!parsed || !parsed.length) { stats.failed++; return; }
    // BOTH TEXTS ARE CITABLE. The English is checked first because it is the common case; the original is
    // offered whenever the paragraph carries one, whether or not this call was bilingual — a proof quoted
    // from the source is valid regardless of which prompt produced it.
    const haystacks = [{ lang: 'en', norm: proofNorm(p.text) }];
    if (hasOriginal) haystacks.push({ lang: p.originalLang || 'src', norm: proofNorm(p.original), raw: p.original });
    const paraRows = [];
    for (const c of parsed) {
      stats.claims++;
      const proofLang = (c.concept && c.relation && c.proof) ? conceptProofOk(c.proof, haystacks) : null;
      if (!proofLang) {
        stats.dropped++;
        // A STAGE THAT DISCARDS MOST OF ITS OWN WORK MUST SAY WHAT IT DISCARDED. Two runs reported
        // "claims: 103, written: 1" and neither said why, so the first fix was aimed at a guess and missed.
        // Keeping a few rejected proofs beside the text they failed against turns a mystery into a diff.
        if (stats.dropSamples.length < 6) {
          stats.dropSamples.push({
            concept: c.concept ?? null,
            missing: !c.concept ? 'concept' : !c.relation ? 'relation' : !c.proof ? 'proof' : 'not-verbatim',
            proof: String(c.proof ?? '').slice(0, 160),
            enHead: String(p.text || '').slice(0, 160),
            srcHead: String(p.original || '').slice(0, 160),
          });
        }
        continue;
      }
      stats.proofFrom[proofLang] = (stats.proofFrom[proofLang] || 0) + 1;
      paraRows.push(conceptClaimRow(c, { docId, pid: p.pid, methodVersion: version, extractor, batch, proofLang }));
    }
    if (opts.dryRun) rows.push(...paraRows);
    else if (paraRows.length) stats.written += await ctx.store.saveConceptClaims(paraRows);
  });
  stats.byTranslationAuthority = authorityCount;
  ctx.log.info?.({ docId, ...stats }, 'concepts/extract');
  return opts.dryRun ? { ...stats, written: 0, rows } : stats;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function parseConceptClaims(raw) {
  const out = [];
  for (const o of String(raw).match(/\{[^{}]*\}/g) || []) {
    try { const j = JSON.parse(o); if (j && (j.concept || j.proof)) out.push(j); } catch { /* partial */ }
  }
  return out;
}

const proofNorm = (s) => String(s || '').replace(/\s+/g, ' ').toLowerCase().trim();

/**
 * Arabic/Persian normalisation for the proof check: diacritics and letter-form variants differ between
 * editions and a model re-quoting scripture will not reproduce them exactly.
 *
 * Without this, a CORRECT proof quoted from the original is rejected for a dropped hamza — the same failure
 * that made the segmenter discard good alignments, and with the same signature: a confident stage reporting
 * that nothing survived.
 */
const scriptNorm = (s) => proofNorm(s)
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ة/g, 'ه').replace(/[کك]/g, 'ك');

/**
 * Is this proof span verbatim in the passage?
 *
 * `haystacks` may be SEVERAL texts. In bilingual extraction the model reads the original beside the
 * translation and is told to keep the proof verbatim in the SOURCE — so it quotes Persian, and checking only
 * the English discarded 102 of 103 claims on the first real Íqán run. A proof verbatim in the original is
 * not a weaker citation than one in the rendering; for a translated work it is the stronger one.
 *
 * Returns WHICH text it was found in, because that is worth recording: a proof from Shoghi Effendi's English
 * carries his interpretive authority, and a proof from the original carries the author's own words.
 */
export function conceptProofOk(proof, haystacks) {
  const list = Array.isArray(haystacks) ? haystacks : [{ lang: 'en', norm: haystacks }];
  const p = proofNorm(proof);
  if (p.length <= 8) return null;
  const needle = p.slice(0, 120);
  for (const h of list) {
    if (!h?.norm) continue;
    if (h.norm.includes(needle)) return h.lang;
    // Script-insensitive retry for the original only: English needs no such tolerance and allowing it there
    // would only loosen a check that is already working.
    if (h.lang !== 'en' && scriptNorm(h.raw ?? h.norm).includes(scriptNorm(p).slice(0, 120))) return h.lang;
  }
  return null;
}

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

export function conceptClaimRow(c, { docId, pid, methodVersion, extractor, batch, proofLang }) {
  const semanticKey = `${nrm(c.concept)}|${c.relation}|${nrm(c.teaching || c.target || '')}|${pid}`;
  const statement = `${c.concept} — ${c.relation}${c.teaching ? ' ' + c.teaching : ''}`.slice(0, 300);
  return {
    claimHash: sha(`${docId}|${pid}|${semanticKey}`), concept: c.concept, relation: c.relation,
    target: c.teaching || c.target || null, root: c.root || null, statement, proofVerbatim: String(c.proof).slice(0, 240),
    docId, paraId: pid, semanticKey, methodVersion, extractor, confidence: 0.7, status: 'supported', proofOk: 1, batch,
    // Recorded on the extractor string rather than a new column: which text the proof is verbatim in changes
    // what the citation is EVIDENCE of, and a claim proved from the original must be distinguishable from one
    // proved from a rendering when this is read back.
    ...(proofLang && proofLang !== 'en' ? { extractor: `${extractor}+proof:${proofLang}` } : {}),
  };
}

// ── Prompt (pure) ────────────────────────────────────────────────────────────

export function buildSystem(profile) {
  return `Extract cited DOCTRINAL/CONCEPT claims from ONE passage of a ${profile.genre} work${profile.lang !== 'en' ? ` (written in ${profile.lang}; write concept/relation/teaching in ENGLISH, keep proof verbatim in the source)` : ''}. For each SIGNIFICANT concept, symbol, or metaphor the passage develops (NOT generic words), state what the passage teaches about it.
Rules:
• concept = the English canonical name of the idea/symbol (e.g. "the Covenant", "the clouds", "the Manifestation").
• relation = one of: means | teaches | interprets | symbolizes | fulfills | is-station-of | ranks.
• teaching = what the passage asserts (the interpretation / development), in a short clause.
• proof = a span copied VERBATIM and EXACTLY from the passage (≤200 chars) supporting the claim; if you cannot, OMIT.
• root = the original-language term behind the concept IF the passage/context makes it identifiable (else omit).
• ONLY what the passage states — NO outside doctrine. Skip generic words; capture load-bearing doctrinal assertions.
Return ONLY JSON: {"claims":[{"concept":"..","relation":"..","teaching":"..","proof":"..","root":".."}]}`;
}

export function buildUser(p) {
  return `NOTE: ${p.context}\n\nPASSAGE [${p.pid}]:\n${p.text}`;
}
