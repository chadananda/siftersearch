# Work plan — provable, re-assessable identity (started 2026-09-27)

Chad: "rescue collected data instead of rejecting it. Correctness and provability are paramount and must be part of
our pipeline. We must be able to re-assess previous assertions based on new information … Whenever we make a fix to
our data, the fix must first be integrated into our ingestion pipeline … our merges must be reversible."

Design of record: `docs/entity-improvable-architecture.md` (entity = projection of mentions + append-only decision
log). This plan makes the code obey it. Research basis: factoid prosopography (PASE/SNAP), HIPE, ʿilm al-rijāl,
PARC nesting, Fellegi–Sunter / Getoor collective ER, LIFE-M (see session notes 2026-09-27).

## Invariants (every increment must keep them)
1. **Identity is asserted on MENTIONS** (anchors), never on name strings. Entities are computed, never edited.
2. **Every identity decision carries its evidence** (mention anchors, claim ids, proof spans, discriminators) +
   method_version + actor tier. No decision without evidence is ranked above tier 1.
3. **Append-only.** Correction = a superseding decision. Any past state is replayable.
4. **Claims attach to mentions** (subject/object anchor); entity ids on claims are projection output.
5. **A fix is a stage first.** No data repair that the ingestion pipeline would not reproduce on a new book.
6. **New evidence re-opens decisions.** Ingestion queues re-assessment of the entities a new book touches.
7. **Gold decisions (tier 3, Chad's) are a regression suite** a new method must reproduce before it applies.

## Review findings (2026-09-27, code read + measured)
Upstream (where identity is first asserted):
- F1 `enrich/disambiguate.js:165` — the note resolves ONLY "bare/elided/variant/ambiguous" names and SKIPS names in
  full. `mentions.js` builds mentions ONLY from the note's resolve list ⇒ fully-named people (Mullá Ṣádiq in EB ¶54)
  have NO mention, their claims cannot bind (the 50% subject-bound rate). Root of the recall gap.
- F2 disambiguate carries ONE flat place/era STATE forward; an embedded story inherits the narration's place/era and
  leaks it back after. No frame stack. `claims.js:169` then copies that era into every claim's `when`.
- F3 the note records a resolution with no reason/evidence; the CAST instruction defaults a bare name to "the
  most-prominent match" (the Muḥammad→Prophet class). Unprovable at the root.
- F4 `mentions.js:39` anchor = (doc, para, surface, occurrence=0): the same surface twice in a paragraph naming two
  people keeps only the first. Anchors depend on para_id/doc_id stability (re-segmentation orphans them).
Resolution:
- F5 cluster = `resolved_as` STRING per book; `bindMentions`/`unbindMentions` apply it to EVERY book
  (store.js:535/542). Measured: 683 strings decided differently across books; 35,111 mentions on them.
- F6 `reconcile.js:121` labels name-recalled "grounded evidence" DECISIVE; `searchGrounded` is token-LIKE on
  statements (LIMIT 40 unordered) — arbitrary namesake facts presented as decisive.
- F7 `verify-link.js` gate (measured with node): vetoes correct links — any name token ending in -í is read as a
  nisba (Ḥájí, ‘Alí, Mihdí → "Ḥájí Mírzá Ḥasan" ≠ "Mírzá Ḥasan-i-Yazdí"); office compares whole statements incl. the
  subject's name ("Mullá Ḥusayn — held-office leader" ≠ same for "Mullá Ḥusayn-i-Bushrú'í" ⇒ VETO — a likely origin
  of the Mullá Ḥusayn duplicate behind the Karbilá gap). Misses real conflicts: kinship parser expects "son of …" but
  statements are "X — son-of Y"; 'death-place' and 'side' are not in the relation vocabulary (dead axes); death year
  comes from `when`, which is often the note's scene era.
- F8 `research-resolve.js:65` judges an uncertain figure from its NAME + other books' passages — never its own
  paragraphs. Resolution without the figure's own context.
- F9 `dedup-guard.js:30` "searches by facts, never its name" — but statements begin with the subject's name, so the
  token search is name recall again.
- F10 `evidence-doctrine.js` contradicts itself: "SAME only when a discriminative fact matches" vs "a qualified name
  merges on ABSENCE of contradiction" — and name+nisba counts as that discriminative fact, so the name is counted
  twice. Rijāl's muttafiq wa-muftariq: identical name+nisba can be different people.
- F11 `merge.js` judge sees name + mention count only (facts never selected; claims never read); prompt says merge
  thin records into richer. `run-grounding.js:93` runs this GLOBAL merge after EVERY book ⇒ ~7.9k decisions /
  7,227 ids merged (July). `maxSize:12` truncates large groups.
- F12 project auto-applies on self-reported model confidence ≥0.9 (uncalibrated); lower ones leave mentions unbound
  (74k of 216k mentions unbound).
Projection / reversibility:
- F13 `applyMerge` overwrites mention/claim/relation/scene entity ids and keeps no prior owner; July merges wrote no
  rollback. 5,021/7,227 merged ids are recoverable from create/link decisions; 2,206 are not (legacy seeds).
- F14 `markDecisionApplied` mutates the log row (status + applied_entity_id) — projection state stored in the log.
- F15 `resetDocDerived` DELETEs a doc's claims — orphaning verifications/scenes keyed on claim ids (precious layer).
- F16 my own 2026-09-26/27 repairs (relink, mention-backfill, verify-encounters, catalog review/apply, group facts,
  scenes, title-merge) are scripts outside `pipeline/stages.js` — the patchwork this plan removes.

## Target shape
```
disambiguate (frame-aware: frame stack, resolves EVERY person named, reason per resolution)
 → mentions (every person-name occurrence in the text, occurrence-indexed; note resolution = a proposal)
 → claims + scenes (subject/object = mention anchors; frame chain; place/time from innermost frame)
 → resolve (per mention-cluster WITHIN a doc: candidates side by side incl. NIL; evidence = own paragraphs,
            claims, companions, period; deterministic veto on true conflicts; decision records anchors + evidence)
 → project (replay log → union-find over anchors → entities; materialize ids onto mentions/claims/scenes; diffable)
 → reassess (entities whose evidence changed or whose decisions are below method version / tier 1)
 → verify (claims vs proof; identity vs gold)
```

## Increments (each: failing test → code → dry-run on prod → diff reviewed → apply; reversible)
1. **Projection engine + replay check** (no model spend). Pure `project(mentions, decisions) → assignment` with
   union-find over anchors; scope decisions to (doc, anchors). Acceptance: replaying the log reproduces today's
   `entity_mentions_v2.entity_id` for every mention, or lists each divergence with its cause (F5 collisions, F13
   unrecoverable, manual scripts). Read-only endpoint + report.
2. **Record merge/relink history as decisions**: backfill the log with explicit decisions for every current binding
   the log cannot explain (tier 0 "legacy-state", evidence: none) so projection == today exactly. July merges stay,
   tagged tier 1 `merge-v1-evidence-free`. Switch `applyMerge` to append-only + reproject. Remove global bind.
3. **Claims bind to mentions** (subject/object anchor columns); link stage becomes deterministic anchor binding;
   entity ids on claims become projection output. Retire entity-relink.
4. **Fix the resolver's evidence + gate** (F6–F10): own-paragraph evidence, discriminator extraction from claims
   (object-level, vocabulary-correct), frequency-weighted names, conflict veto, NIL, side-by-side. Unit cases from
   the measured false vetoes. Gold = merge-review decisions.
5. **Reassess stage** replacing `merge`: re-judge tier-1 July merges with evidence (confirm → supersede with evidence;
   contradict → split). Sample-measure error rate first (100 random, shown to Chad).
6. **Mention recall at the source** (F1, F4): disambiguate resolves every named person; mentions occurrence-indexed.
   Absorbs mention-backfill. Re-run core books first (DeepSeek), then corpus.
7. **Frame stack** (F2): disambiguate emits frames (narrator chain, place, time); claims/scenes inherit innermost.
   Absorbs scenes into the pipeline; claim `when` from frame.
8. Absorb remaining scripts as stages (verify-encounters, catalog classification into resolve, group facts).

## Status
- [ ] 1 projection + replay check
