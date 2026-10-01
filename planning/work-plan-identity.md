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

## Training Laya on identity decisions (Chad 10-01)
"Entity extraction and merging is one of those areas where we should train Laya hard so that it becomes useful later.
We can budget the very best frontier-model decisions at the outset, but make sure to use those decisions to train
Laya." (Laya = open System-1 on boss; switch-over and two-opinion rules: planning/search-strategy-layer.md.)

**Decision families** (each a typed question; mention detection itself stays generative extraction):
1. bind — mention (centred context) → which candidate entity card · `new` · `unclear`
2. same — are these two clusters / records the same person? (merge; two-opinion family)
3. namesake — does this mention belong to a different bearer of the name? (split; two-opinion family)
4. role — speaker · subject · addressee · mentioned
5. refer — title / epithet / pronoun → which person in the working set (the F1 recall gap)
6. is-person — is this span a person (vs title of a work, place, office, index line)?

**Labels, best first** (all written to `entity_decisions` with evidence + actor tier — append-only, so every label
is also a usable, reversible decision):
- tier 3: Chad's gold (existing regression suite) — never in training, always in the held-out test.
- **frontier**: the best current model, given the mention passage, the candidate cards (every name and title, all
  scripts) and the origin passages, returning the decision + the evidence spans it relied on. Budgeted at the outset.
- session review of flagged items; Jev answers only when confident AND later confirmed.

**What to label (the budget goes where Laya will be weak):** stratified by language (ar · fa · en) and difficulty —
namesakes, titles/epithets (باب الباب), Persian-only forms, pronouns, cross-script names, retrospective/figurative
references, index lines — plus ~20% ordinary cases for calibration. After the first round, active learning: label
next where Jev and Laya disagree or both are unconfident.

**Laya input shape** (fits its budget: 1,024 tokens, 256 for question + options; 8k when needed): state = the
mention-centred window (≤ ~600 tokens; centring is a lesson from the Mullá Ḥusayn audit) + compact candidate cards
(≤ ~80 tokens each: names in all scripts, titles, era, place, role, key relations); options = ≤ ~10 candidate ids +
`new` + `unclear` (Laya degrades past ~20 options).

**Loop:** frontier labels (round 1) → fine-tune laya-multilingual per family (80/20 split, stratified) → temperature
refit → evaluate on held-out + tier-3 gold vs Jev and vs the frontier model → active-learning round → repeat. Laya
becomes primary per family only under the switch-over rule; merges/splits keep two opinions + escalation.

**Budget to set before spending:** cost per frontier decision ≈ (~2–3k tokens in: passage + 3–6 cards + origin
passages; ~150 out: choice + evidence spans) × model price; first round sized per family (e.g. 2–3k decisions each).
Quote the exact figure from current pricing and get approval before the run.

## Status
- [x] 1 projection + replay check (2026-09-27) — `rag/entities/projection.js`, `/api/admin/server/identity-replay`.
  Replay of the log reproduces 207,534 / 216,533 mentions (95.85%) in ~2s. Every divergence explained:
  cross-doc string-wide bind 8,250 · cross-doc unbind 522 · propagate script (no decision) 149 · split overwritten by
  a later cluster re-bind 57 · merge ping-pong representative 15 · genuine mismatch ~3. Worst visible effect: Shaykh
  Aḥmad-i-Aḥsá'í and Siyyid Káẓim each split across two LIVE records (1261152/1299242, 1260454/1297046) in the DB.
- [~] 2 pipeline first — DONE: bind/unbind scoped to the decision's document (docId required); per-book global merge
  retired; projection: anchor-keyed mention decisions, unmerge (supersede), precedence (specific > general unless
  outranked; later > earlier unless lower tier); materialize stage (`rag.entities.materialize`, script
  identity-materialize.mjs, POST /server/identity-materialize, dry by default, rollback on write).
  DRY RUN (2026-09-27 19:28): 723 safe corrections (57 lost splits restored, 522 cross-book unbinds re-bound,
  143 abstention bindings removed — incl. 141 anonymous "Bábí martyr … not given" folded into ONE record by
  propagate-bindings — 1 unbound) + 6 recorded rule decisions. HELD 8,253 mentions = 253 (stored, replay) pairs,
  nearly all ONE person recorded twice (Mírzá Yaḥyá ×3, Siyyid Káẓim, Shaykh Aḥmad, Ásíyih Khánum, Esslemont…) —
  the string bind was masking per-book duplicate creation. WRITTEN 19:55 (Chad approved): 723 corrections + 6 rule
  decisions; replay now == DB except the held pairs (208,265 match; 8,253 held; 15 representative). Rollback:
  logs/identity-materialize-rollback-2026-09-27T19-55-41-922Z.json. Claim re-link dry run in progress.
- [~] 4 evidence judge — DONE: verify-link rewritten for production-shaped claims (real nisbas; offices/side = flags;
  stated years only; named parent from "X — son-of Y"); claims record date basis stated vs inherited.
  DONE (held for push): doctrine rewrite (no merge on name; default UNSURE; innermost context; prominence ≠ evidence);
  pair judge (signals + model, merge only when both agree, veto → distinct, rest proposed) + dossiers; research-resolve
  reads the figure's own passages (F8); dedup-guard queries by fact objects (F9); disambiguation resolves EVERY named
  person and drops the prominence default (F1/F3 — effective on next run); claims accept any note (F17: the 2026-08-15
  rule mentions got, claims never did); occurrence-indexed mentions (F4).
  NEXT (Chad chose 'evidence judge + you'): pair-judge dry run on the 253 held pairs → review → write → publish the
  'review' remainder to Chad with dossiers.
  was-NEXT: identity dossier (names, docs, discriminator claims w/ proof, companions excl. ubiquitous, stated years,
  sample passages) → pair scoring (shared companions/docs weighted by rarity; name weight by how many live persons
  share it; veto) → model on the residue, side by side incl. "neither" → human for disagreements. First queue: the
  253 held pairs; gold = Chad's merge-review decisions.

### 2026-09-27 evening — results
- Claim re-link written (950 claims). Pair judge WRITTEN: 90 merges (both judges agreed; evidence on each decision),
  8 recorded distinct (both agreed), 154 proposed → merge-review page (v2, 736 candidates incl. 123 new "judges
  disagreed"). Karbilá duplicate 1288406 merged into Mullá Ḥusayn 1247564. Replay after: 208,555 match; representative
  1,014 (merged pairs now one person); cross-doc held 6,962.
- Entity battery 6/6 + Karbilá still GAP. Root cause now visible: scenes carry no year and claim dates are unreliable
  (era-inherited: a Persian proof "in Shíráz" dated 1825), and "prior to X" can't see X in original script. Added
  chronological "prior to" ranking (encounters.js). Do NOT tune further toward this test — the fix is increment 7
  (frame-aware dates: scenes + claims carry the innermost frame's stated date) + original-script place names.
- NEXT: Chad reviews held pairs on the page → apply his decisions; materialize with include for pairs judged distinct;
  then increment 3 (claims bind to mention anchors), 6 (mention recall — disambiguate fix is live for new runs), 7.

### 2026-09-28 — merge review settled, passage-less records explained

- **Chad's calls recorded (human tier 3):** Bábu'l-Báb→Mullá Ḥusayn, Dhikru'lláh→the Báb, Ghuṣn-i-A'ẓam→'Abdu'l-Bahá
  (merged); the two Sám Khán records distinct. "Mírzá Yaḥyá Núrí" 1288528 was a guessed label: all 4 mentions are the
  unnamed Nayríz Bábí who fled to Ṭihrán → renamed + distinct from Azal (model tier).
- **Reader batch (model tier 2):** 84 same / 158 different → 59 merges (chains grouped: one survivor per person, e.g.
  six Yaḥyá/Azal records → 1301670, 2,162 mentions) + 155 distinct. Stage: `rag/entities/reviewed.js`,
  `POST /server/identity-reviewed` (dry by default), items in planning/merge-review/*.json.
- **No-basis explained** (`GET /server/entity-provenance`): the retired graph-pipeline dropped unmatched mentions and
  the promoter minted records from strings. 356 with no passage anywhere → **retired** (`retired:no-passage`, new
  non-live state in entity-live.js; refused if anything anchors the record). 182 have passages (162 in graph.db,
  20 via scenes) → rescue.
- **Disambiguation stamp → v2** (processed.js DISAMBIG_WRITE; v1+v2 both accepted as notes). The 09-27 prompt change
  had no bump, so old and new notes were indistinguishable.
- **Rescue in progress:** 999 unread paragraphs in 46 books (`GET /server/record-passages`). Pilot 13437 (Cyprus
  Exiles, 92 paras) queued `to:'link'`, held for off-peak. NEXT: read pilot spend → estimate the 46 → queue →
  then each rescued record: all its passages bound to one entity ⇒ merge into it; mixed ⇒ retire (the passages
  are already held by the right people).

### 2026-09-28 afternoon — search target everywhere; splits; lookup holes

- **Search target** now in plannedSearch (chat, Anís, public API, /multi): keyword-only per name, waits until 1.2s
  or the passage search ends. Type battery 66/82 (baseline 65); a 62 run was load.
- **Splits** (`repoint` verdict + `GET /server/cluster-passages`): readers judged 235 clusters of 11 mixed records;
  113 moved (590 mentions, 786 claims; 39 claims left where a paragraph names both). Held for Chad/next pass:
  7 (label-only, thin, mixed clusters, two Jalálu'd-Dawlih records); plus 14 unsure clusters (several need
  MENTION-level splitting — a cluster can hold two people).
- **Lookup holes** (see memory project_lookup_index_gaps): 9,357 unindexed records backfilled; "Yaḥyá" had no key.
- **Duplicates to judge:** 1291988 (Baku 'Alí-Akbar Nakhjavání) vs 1269643; 1260005 "Yaḥyá Azal" vs 1301670;
  Mahd-i-'Ulyá 1288106 needs its name corrected (it is Bahá'u'lláh's wife, not Jahán Khánum) and 1288066
  (Fáṭimih Khánum) folded into it.

### 2026-09-28 evening — Jev in the loop; cards; rescue running

- Two-stage Jev audit live (stage 2: "different" ≥0.4 or weak "profile" <0.6 → reader); Ṭáhirih/Ḥujjat/Vaḥíd/Quddús
  audited, 57 read, ~30 real errors fixed (43 mentions, 76 claims). Mullá Ḥusayn: 25 mentions fixed.
- System-1 identity gate in reconcile (confident "different" → uncertain). Fired once in the pilot.
- Profile cards (migration 127, entity_cards, 11,176 people) — majority-built; contradictory kin = conflation signal.
- Jev as occurrence linker measured: disagrees with 93% of wrong bindings; 92% right when confident (planning/jev-system1.md).
- **Blocked:** TypeSafe credits exhausted (402) since ~17:45 — all Jev paths fail open; card-linking benchmark waits.
- Rescue: 45 books queued to link. Deploy-kill root cause fixed (treekill:false). 6 failed books re-queued.
  NEXT when drained: sweep failed → re-queue; then per rescued record: passages bound to one person ⇒ merge, else retire.
