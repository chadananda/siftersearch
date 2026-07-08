# Entity Architecture — cited biographical identity, claims, and evidence

> Status: living design doc (started 2026-07-08). Describes where the entity system is,
> where it's going, and *why* — grounded in prior art (see "Industry audit"). The
> foundation here is built to survive the ROB ingest (~1,180 → ~3,600 people) and beyond.

## The one idea: the **cited claim is the atom**

Every phase of the system is an operation on a single unit — a **claim**: *this entity*, in
*this relation*, asserts *this statement*, proven by *this verbatim span* at *this
(document, paragraph)*, optionally about *this target entity*, with a *confidence*, a
*provenance tier*, and *verification flags*. If the claim is modeled once — rigorously,
with provenance and verification built in — the three phases inherit cleanliness, speed,
and accuracy. Today the claim is modeled three different ways across the phases, and the
seams between them are where bugs live (see case study).

A claim with no citation is a **hypothesis**, not a fact. Identity itself (aliases,
merges) is just another kind of cited claim.

**Corollary — identity is mention-anchored; a bare name is not an entity.** "Aḥmad" is
meaningless on its own — there are a hundred Aḥmads. It becomes a specific person only as
*the Aḥmad referred to at this paragraph, in this context*. So the **mention** (a
name/epithet/pronoun **at a text position**, read in context) is the atom of *identity*,
exactly as the cited claim is the atom of *knowledge*. An **entity is the resolved cluster
of its mentions**; the canonical name is only a label on that cluster. Therefore **every
entity, alias, and claim must carry provenance — the text position(s) it came from** — and
an entity with no cited mentions is not an entity but a hypothesis to quarantine. Resolution
never matches bare name strings (the "hundred Aḥmads" trap); it resolves *positions in
context* by evidence consistency (nisba, era, role, associates). Enforced structurally:
`entity_aliases.source_para_id`, claims' `doc_id/para_id/proof_verbatim`, and the write-time
`proof_ok` gate — nothing enters the graph without recording where it came from.

## The three phases

1. **GATHER** — read source text (coreference-complete: name, title, epithet, role,
   pronoun), extract entities and **cited claims** with verbatim proof spans. Output:
   staged claims, each already carrying its (doc, paragraph) citation.
2. **INTEGRATE** — resolve-or-create against the existing collection. **Merge** the same
   person under variant names; **split** different people under the same name — decided by
   **evidence consistency**, not string similarity. Reversible.
3. **SEARCH** — let AI research tools pivot on people / relations / claims / involvement
   *fast*, and **muster citations to match or exclude** a candidate.

Each must be clean, efficient, effective, fast, and accurate.

### Entity creation discipline — source-driven, coverage-ordered; research never creates

**Only a mention in the source text may mint an entity.** Every entity is therefore born
with a birth provenance (the paragraph where it first occurs). Coverage **expands book by
book in a fixed order** — **GPB alone → GPB + Dawn-Breakers → + ROB → …** — each step adding
only the entities its new source introduces, resolved against everything already seeded (see
[[project_entity_extraction_order_gpb_seed]]).

**Research (web/AI) is question-answering + enrichment ONLY — it must never create an entity
or add an uncited alias.** It attaches *cited* facts to source-born entities and helps
*disambiguate* existing ones. If research surfaces a person not yet in the ingested coverage,
that is **not an entity** — it is a held note until the source that names them is ingested.
The `promotion_queue` / `promoter` / `research` / `enrich` passes that minted names outside
the source text are the root cause of the provenance-less aliases; that path is retired.

**Consequence (self-correcting cleanup):** a source-first re-expansion re-derives every
legitimate name *with* its citation; anything research invented simply doesn't reappear. So
the fix for the contaminated entity set is not manual deletion but **rebuild from source in
coverage order** — the write-time `proof_ok` gate then makes an uncited entity/alias
impossible to create in the first place.

**But research DOES help with aliases — the line is create vs. describe.** An alias is not an
entity; it is a claim *about* an already-source-born entity, so enriching one with research is
allowed. Research plays two legitimate alias roles: **(1) resolution (the main one)** — it
doesn't add names, it decides *which entity the source's names belong to*: "Temüjin" and
"Genghis Khán" both occur in the text and research judges they co-refer → the two mentions
cluster onto one entity (and conversely it splits same-named different people). **(2) external
equivalence** — a real name the source didn't use (birth/regnal name, standard variant) may be
recorded, but as a **provenanced, lower-tier alias claim** (`kind: research`, cited to its
external source, auditable/removable), never a bare string. So every alias carries provenance +
tier: `source` (a `source_para_id` text position — primary) or `research` (an external
citation — secondary, ranked below source). Research may never (a) mint an entity, or (b) add a
name with no provenance of either kind — the exact defect of the old `enrich`/`promoter` passes.

## Current state (2026-07) — what exists and its debts

**Good foundations already in place (keep + extend):**
- `entity_mentions` — normalized, id-keyed, `extractor_version`-tagged (reversible binds).
- `entity_aliases` — normalized: `entity_id, surface, surface_norm, lang, confidence,
  source`, unique on `(entity_id, surface_norm, lang)`, indexed on `surface_norm` +
  `entity_id`. This is the *correct* pattern.
- Citation scheme: `${source_url}?paraId=para_NNNN` (verbatim, clickable, verified).
- Deterministic connection recall via shared-episode slugs (`bio.js`).

**Structural debts (the foundation work):**
1. **Facts are an unnormalized JSON blob.** `research_notes` holds *four* overlapping
   arrays — `facts`, `facts2`, `characterizations`, `episodes` — with no per-fact id, no
   provenance columns, no dedup, no cross-entity queryability. You cannot ask "which
   entities cite para_369, and does its subject match them?" — which is why the case-study
   bug was invisible.
2. **Two alias systems, unsynced, in effect one is empty.** The pipeline resolves against
   `er.aliases` (JSON); `resolveAlias()` reads the normalized `entity_aliases` table, which
   is unpopulated for these entities. One store must win (the normalized, typed one).
3. **String-keyed identity.** `entity_research` joins `graph_entities` on `canonical_name`
   (a string) — rename orphans the research, duplicates make the join ambiguous. Everything
   else is id-keyed.
4. **Verification is reactive, not a gate.** `fix-citations`, `scan-misbound-facts`,
   `fix-alias-contamination` are cleanup *after* bad data reached users. The checks they
   encode belong at write time.
5. **Search lets the LLM select and stretch evidence** (see case study residual).

## Case study — the Qurbán-‘Alí / Muṣṭafá fabrication (2026-07-07)

A search for *"Seven Martyrs of Ṭihrán who met Bahá'u'lláh"* returned **Mírzá Qurbán-‘Alí**
(an eminent Ni‘matu'lláhí *leader*, Bábí, martyred **1850**, converted by Mullá Ḥusayn) with
fabricated evidence about "cooking and eating, replied bluntly, transformed by the
conversation." Chain of failure:

1. The bare name **"Muṣṭafá"** — a *different* person (Bahá'u'lláh's roadside dervish,
   Dawn-Breakers **para_369**) — had been absorbed as an **alias** of Qurbán-‘Alí.
2. Because of the bad alias, the fact `"Muṣṭafá — dervish converted by Bahá'u'lláh"` was
   **mis-filed** under him.
3. Search grabbed that stray fact to satisfy "met Bahá'u'lláh," and the renderer
   **embroidered** it into an invented narrative.

**Lesson (drives this whole design):** identity is decided by **evidence consistency**, not
token/structural heuristics. A first attempt ("a lone single-name alias can't vouch
identity") was *wrong* — single-token **title-aliases** are legitimate and common (Navváb =
Ásíyih Khánum; Mu‘tamid = Manúchihr Khán; Quddús; Ṭáhirih). Of 6 flagged facts, only **1**
was real contamination; the rest were legit titles or transliteration variants. The true
discriminator is: *does the claim contradict the person's established profile?*
(dispensation, dates, nisba/place, role, converter). "Muṣṭafá converted by Bahá'u'lláh"
contradicts a Bábí martyred in 1850; "Navváb wife of Bahá'u'lláh" is consistent with Ásíyih
Khánum.

## Target architecture — the spine

```
entities(id, type, canonical_name_view, side, importance, era_start, era_end, ...)   -- id-keyed EVERYWHERE;
                                                                                     -- canonical name is a VIEW over aliases
entity_aliases(id, entity_id, surface, surface_norm, script_key, phonetic_key,       -- ONE alias store, typed
               kind, lang, is_display, confidence, source_para_id)   -- kind ∈ {name,title,epithet,translit}
alias_priors(surface_norm, entity_id, count)   -- self-improving P(e|m) = count(surface,entity) candidate-gen prior

relations(key, label, datatype, inverse, cardinality, ...)   -- CONTROLLED vocabulary (Wikidata-property style)

entity_claims(id, entity_id, relation, statement, proof_verbatim,
              doc_id, para_id, target_entity_id NULL,                 -- connection target is an ID, not a string
              valid_from, valid_to, asserted_at, superseded_at,       -- BI-TEMPORAL: world-time (era gate) + system-time
              source_belief, system_belief,                          -- CRMinf two layers: source-sure vs. we-judge
              rank,                                                   -- preferred | normal | deprecated (conflicts coexist)
              status,                                                 -- SUPPORTED | REFUTED | NOT-ESTABLISHED | CONTESTED
              proof_ok, subject_ok, consistency_ok,                  -- WRITE-TIME verification gates
              confidence, provenance_tier, extractor_version, claim_hash)   -- 3 orthogonal axes; hash = dedup/idempotent
claim_references(claim_id, source_doc_id, para_id, proof_verbatim, provenance_tier, retrieved_at)  -- MANY per claim
claim_evidence(claim_id, stance[support|refute], para_id, proof_verbatim, provenance_tier)         -- signed evidence

entity_relations(subject_id, object_id, relation, proof_para_id, confidence, valid_from, valid_to)  -- person↔person/work
identity_links(a_id, b_id, kind[same|probably-same|possibly-same|distinct], evidence_para_id, confidence)  -- link, don't merge
episodes(id, doc_id, slug, name, when) + episode_participants(episode_id, entity_id, role, proof_para_id)
research_notes  -- ONLY freeform, uncited working notes; never the fact-of-record

claims_best   -- MATERIALIZED projection: preferred-rank (else normal), deprecated excluded — the fast pivot surface
```

What this buys that the JSON blob cannot:
- **`target_entity_id`** — "met Bahá'u'lláh" is a claim whose target is an *id*; search
  hard-filters query-target-id == evidence-target-id. The "met the Báb ≠ met Bahá'u'lláh"
  class dies structurally.
- **`rank` + `claims_best` + multi-`claim_references`** — conflicting readings coexist (never
  deleted); the fast projection answers "the corpus's view" while the full table can
  *muster citations to exclude* a rejected reading. Corroboration is one claim, many refs.
- **Bi-temporal `valid_from/to`** — era-gating is a cheap deterministic index scan
  (dead-before/born-after excludes a candidate with no LLM call).
- **The three `_ok` flags + `claim_hash`** — verification computed once at write and
  re-checkable forever (cleanup scripts become continuous invariants); the hash makes
  re-ingest idempotent and apply/undo reversible.
- **Typed aliases (`kind`) + `script_key`/`phonetic_key` + `alias_priors`** — "Navváb"
  (title) is legitimate; a proposed `name` alias gets a stricter evidence check; matching is
  on the Arabic-script/phonetic key (not romanization); and every confirmed binding grows the
  `P(e|m)` prior — the cheapest strong candidate-generator in the literature.
- **`identity_links` (not merges)** — same/probably/possibly/distinct as evidenced, reversible
  assertions; the displayed entity is a *derived cluster*, so un-merge is free.

## The reusable heart — one **evidence comparator**

The whole lesson ("identity is decided by evidence consistency") becomes a single component,
not scattered logic. It takes two evidence sets (or a query predicate vs a candidate claim)
and returns `consistent | contradictory | insufficient` **with the axis**:

- **dispensation** (Bábí ≠ Bahá'í — a 1850 Bábí martyr can't be "converted by Bahá'u'lláh")
- **timeline / era** (died 1850 can't be at Riḍván 1863)
- **nisba / place** (Yazdí ≠ Turshízí — near-definitive)
- **role / station** (roadside dervish ≠ Ni‘matu'lláhí leader)
- **converter-chain, kinship, connection-target**

Called by **Integrate** (staged entity vs candidate → merge / split / hold), **Search**
(query predicate vs claim → qualify / reject), and **Verify** (claim vs profile → sets
`consistency_ok`). One comparator, three consumers.

**Scoring model (Fellegi-Sunter, adapted).** Each axis contributes a **signed weight**:
agreements add, contradictions subtract. Two properties from the ER literature make it
robust for our corpus:
- **Term-frequency weighting** — agreement on a *rare* name/nisba is strong evidence;
  agreement on a common one ("Khán", "Muḥammad", "Ḥusayn") is near-zero. Formalizes our
  "common honorific ≠ identifier."
- **Negative-evidence veto** — a nisba/dispensation/era contradiction carries enough negative
  weight to veto a merge regardless of how many weak positives agree (Yazdí ≠ Turshízí is
  near-definitive). This is the split half of the job that pure similarity scoring misses.

Two thresholds partition the score: **merge / HOLD / split**. The middle **HOLD** band is
the formal home of hold-ambiguous — it routes to the DeepSeek→Opus adjudication tier rather
than forcing a merge-or-create. Every decision stores its **weight breakdown** (which claims
added/subtracted) so a reviewer sees *why*, and can reverse it (merges are derived, not
destructive).

## Industry audit synthesis

We audited five disciplines that each independently solved part of this problem. The
striking result: **they converge on one architecture** — the same one this doc proposes.
Our two hardest-won practices (source-authority tiering + verbatim-proof-span-as-gate) are
things the frontier does *worse* than we already do; keep them first-class.

**The five closest prior arts (one per discipline):**
- **Digital prosopography — the FACTOID model** (King's College London; Bradley & Short;
  Prosopography of the Byzantine World, People of Medieval Scotland). *Our single closest
  precedent.* A factoid = "*a spot in a source S, at reference R, that states F about
  person P*" — it reifies **what a source asserts, not what is true**. Persons are near-empty
  identity hubs; everything known hangs off them as a typed, cited assertion. This is exactly
  our claim-as-atom, and it validates the posture that a fact with no citation isn't a fact.
- **Knowledge graphs — the Wikidata statement model.** Item → property → value, plus
  **qualifiers** (context), **references** (provenance, *multiple per statement*), and
  **rank** (preferred / normal / deprecated). Conflicting claims coexist as parallel
  statements; rank + a materialized "best" view arbitrate at read time. Never delete to
  resolve conflict.
- **Entity resolution — Fellegi-Sunter + Splink/Senzing.** Merge/split is a **weighted
  evidence vector**: each shared/contradicting attribute contributes a signed log-weight;
  two thresholds → merge / HOLD / split. **Term-frequency weighting** (a rare-name match is
  strong; "Khán"/"Muḥammad" near-zero) formalizes our "common honorific ≠ identifier."
  Merges are **derived clusters over immutable claims** (reversible, sequence-neutral).
- **Coreference / entity linking — cluster-then-link (BLINK/ReFinED/joint coref+EL).**
  Resolve a *coreference cluster* (name+title+epithet+pronoun) to *one* entity, so "the
  Master" inherits its link from a named mention in the cluster. **NIL detection → NIL
  clustering** is the collision-safe way to mint new people. Accumulate `count(surface,
  entity)` as a self-improving prior — "the cheapest, strongest single feature in the
  literature."
- **Claim/evidence stores — GraphRAG covariates + Graphiti bi-temporal + FEVER.** Store
  claims as first-class **covariates**; give edges **bi-temporal** stamps (valid-time for
  era-gating, transaction-time for audit); muster evidence with **three-lane hybrid
  retrieval** (structured IDs + BM25 spans + vectors, fused by RRF) and a **FEVER verdict
  per candidate** (SUPPORTS / REFUTES / NOT-ENOUGH-INFO, with citation) to match or exclude.

**The twelve convergent principles → our decisions:**

1. **Reify the assertion, not the fact.** `entity_claims` stores "source S asserts F about
   P," never "F is true." (factoid model, Wikidata, nanopublications)
2. **Two belief layers.** Separate *source-belief* (how sure the source is) from
   *system/scholar-belief* (how sure we are) — CRMinf's I2/I7. Implements our "source STATES
   vs. our inference" and "not established" doctrine as columns, not prose.
3. **Three orthogonal axes, never one number:** `confidence` (extraction certainty) ≠
   `provenance_tier` (source authority: GPB > DB > ROB) ≠ `rank` (editorial selection:
   preferred/normal/deprecated). (Wikidata + ER + our own tiering)
4. **Multiple references per claim.** GPB *and* Dawn-Breakers corroborating one fact = one
   claim, two references — a `claim_references` child table, not a citation column.
5. **Keep conflicting claims; never delete.** Rank + a materialized **best-rank projection**
   serve both "the corpus's answer" and "every source's claim, including the rejected one"
   (needed to *exclude* with a citation). Superseded ⇒ `deprecated`/expired, not deleted.
6. **Identity is an evidenced, defeasible, reversible assertion — link, don't merge.**
   SNAP:DRGN models same/probably/possibly/distinct as typed, rated relations between
   person-records; Senzing makes the merged entity a *derived cluster*. Both give free
   un-merge. No destructive string-match merge, ever.
7. **Merge/split by a signed evidence vector with veto.** Shared nisba/dates/kinship add
   weight; contradictions (nisba Yazdí≠Turshízí, dispensation, era) carry large **negative**
   weight that can veto any pile of weak positives. Middle band → **HOLD** (clerical-review /
   hold-ambiguous). Weight name agreement by corpus rarity.
8. **Appellations are first-class typed objects; canonical is a *view*.** Every name-string
   (incl. honorific+nisba and transliterations) is an alias row with `kind`
   (name/title/epithet/translit), a normalized **Arabic-script key**, and its own source.
   Match on the script/phonetic key; display the most-used romanization.
9. **Cluster-then-link coreference; NIL-cluster new people.** Bind whole coreference clusters
   to one entity; when nothing matches above threshold, mint a NIL id and cluster later
   unlinkable mentions to it. Never force a new person into an existing same-name entity.
10. **Bi-temporal, deterministic era-gating.** A candidate is **excluded** cheaply (no LLM)
    when an event interval lies outside a person's life/era interval (dead-before /
    born-after). Store valid-time + transaction-time.
11. **Three-lane hybrid retrieval, pivot on IDs.** Structured (entity_id, relation,
    target_id, place, era) + BM25 (proof spans, rare epithets) + vector (paraphrase), fused
    by RRF; constrain relation-verification to the **entity-pair**. Index IDs, not surface
    names.
12. **Evidence mustering = FEVER per candidate.** Structured+temporal pre-filter → per
    candidate NLI/LLM verdict over its proof span → SUPPORTS (include) / REFUTES (exclude) /
    NEI (hold), always with the citation. The LLM *judges pre-selected evidence*; it never
    selects or invents.

**Relations become a controlled vocabulary** (Wikidata properties): a typed `relations`
table enables per-relation validation (a death-year is a date; a `teacher-of` target is an
entity_id), constraint checks (≤1 birth), and fast pivots. Free-text relations kill
pivotability.

**Named anti-patterns to avoid** (all five audits agree): destructive/string-match merges;
hard `owl:sameAs` (non-defeasible, transitively contagious); one confidence scalar;
one-citation-per-claim; free-text relations; vector-only retrieval (misses epithets/rare
nouns); deleting superseded facts; transitive-closure over-merge through common-name
bridges; forcing every mention to link (no NIL path); over-normalization that collapses
distinct people; and — our own scar — a brittle "every proper noun must appear" guard on top
of the proof-span (it nuked all of ‘Abdu'l-Bahá's facts because GPB calls him "the Master").

**Sources (representative):** factoid model — Bradley & Short 2005, Pasin & Bradley 2015
(PBW, PoMS); Wikidata Help:Statements / Help:Ranking; PROV-O; nanopub.net; schema.org
ClaimReview; CIDOC-CRM + CRMinf; SNAP:DRGN; Fellegi-Sunter 1969, Splink (MoJ), Senzing,
Dedupe, Zingg; BLINK, ReFinED, GENRE/mGENRE, joint coref+EL; Microsoft GraphRAG, Zep/
Graphiti (arXiv 2501.13956), FEVER, HippoRAG, GraphCheck.

## Consolidation + scaling to thousands of books

**Decision (2026-07-08):** one database — `sifter.db` — is the single home for the entity
layer. Today the layer is split across two files: `sifter.db` holds `graph_entities` (36,447),
`entity_research` (2,373; `er.aliases` JSON = 6,456 alias strings) and 145K mentions, while a
separate `graph.db` holds a *richer, normalized* `entity_aliases` (**56,588** rows, id-keyed,
with `source`/`confidence`/script forms) and 160K mentions — read only by `resolveAlias()` and
written **outside** the single-writer. The two alias stores have diverged (the "Muṣṭafá"
contamination lived only in the JSON). We consolidate the normalized tables into `sifter.db`,
make typed `entity_aliases` the single source of truth, demote `er.aliases` JSON to a derived
mirror, retire `graph.db`, and route every write through the single-writer.

**Scale target: 2,000–3,000 books.** Extrapolating from the seed set: millions of entities,
tens of millions of claims, hundreds of millions of mentions. The design that stays
*scalable, lightweight, simple, accurate, and fast* at that size rests on one structural idea
plus six rules.

**The structural idea — radical uniformity: *everything is an entity, a name, or a cited
claim.*** Events are entities (`type='event'`); involvement is a claim
(`relation='participated-in'`, `target=event`) — so an episode roster is a claim pivot, and
the episode tables vanish. Identity equivalence is a claim (`relation='same-as' |
'probably-same' | 'distinct-from'`, `target=other entity`) — so a "merge" is a *derived
cluster over preferred same-as claims*, reversible, and the identity-link table vanishes.
Corroboration/refutation are just more claim rows grouped by `claim_group`, not child tables.
Characterization, kinship, office, death are claims with different `relation` values. This
collapses ~8 tables to **four new ones** and gives one uniform, index-friendly access pattern.
(It is a *typed* claim table — `entity_id`/`relation`/`target_entity_id`/proof/citation are
real indexed columns — **not** a generic subject-predicate-object EAV blob, which the audit
warns against.)

**Six rules that keep it fast at hundreds of millions of rows:**
1. **Nothing queryable in JSON.** Every claim/alias is a normalized, indexed row. (A JSON-blob
   scan-and-parse per query is the one thing that cannot scale — it's today's bottleneck.)
2. **Integer id-keys + covering indexes on every pivot** (`entity_id`, `target_entity_id`,
   `relation`, `surface_norm`, `script_key`, `phonetic_key`, `para_id`). Pivots are seeks, not
   scans. Pivot on **IDs, never surface names** (namesake safety at the retrieval layer).
3. **Per-import-batch provenance on every row** (`doc_id`, `import_batch`) → a book is
   added/removed/re-run atomically and reversibly; **incremental** ingest, no global recompute.
4. **Append-only + content-hash id** (`claim_hash`) → idempotent re-ingest (re-processing a
   book 500× never duplicates), supersede-don't-rewrite (fewer single-writer conflicts), free
   undo. Best-rank is computed per-entity at query time (small N per entity) — **no materialized
   projection to maintain** until a cross-entity query proves it necessary.
5. **Hot / cold split.** The hot working set — `entity_claims`, `entity_aliases`,
   `alias_priors`, `graph_entities` — stays small and page-cache-resident. `entity_mentions`
   (the largest, coldest table, hundreds of millions of rows) is an append-only log the hot
   path never scans: candidate-generation reads the `alias_priors` **aggregate**, not raw
   mentions. Mentions are a split-out-to-its-own-file candidate at scale.
6. **Meili is the discovery lane; SQLite is truth.** Index only what needs fuzzy/semantic
   recall — entity aliases (for resolution + search) and claim statements/proof spans (for
   evidence discovery) — as lean id+text+filter docs; fetch full records from SQLite by id.
   Structured pivots, provenance, and era-gating stay in SQLite. `bio.js`'s "load 900 rows and
   JSON.parse" becomes an indexed SQL pivot + a Meili recall call.

**Split-readiness (honoring "one DB now, scale later").** The entity-graph tables reference
content only by `doc_id`/`para_id` **values** — no hard SQL foreign keys into the content
tables — so the whole entity-graph can be lifted into its own file and `ATTACH`-ed later with
**zero schema change** if `sifter.db` grows unwieldy. One DB now for simplicity; a clean seam
for when it matters.

**Proposed DDL — four new tables in `sifter.db` (`CREATE … IF NOT EXISTS`, additive, DROP-reversible):**

```sql
CREATE TABLE relations (            -- tiny controlled vocabulary — the guard against free-text chaos
  key TEXT PRIMARY KEY, label TEXT NOT NULL,
  category TEXT,          -- identity | kinship | event | office | death | characterization | connection
  target_type TEXT,       -- entity | date | place | none
  inverse_key TEXT, cardinality TEXT);

CREATE TABLE entity_aliases (       -- typed appellations; canonical = is_display=1 (name is a VIEW, not a column)
  id INTEGER PRIMARY KEY, entity_id INTEGER NOT NULL,
  surface TEXT NOT NULL, surface_norm TEXT NOT NULL,
  script_key TEXT, phonetic_key TEXT,  -- Arabic/Persian-script key = true match key; phonetic = romanization blocking
  kind TEXT DEFAULT 'name',            -- name|title|epithet|translit
  lang TEXT DEFAULT 'en', is_display INTEGER DEFAULT 0,
  confidence REAL DEFAULT 1.0, source TEXT, source_para_id TEXT, import_batch TEXT,
  created_at INTEGER DEFAULT (unixepoch()));
CREATE INDEX idx_ea_entity ON entity_aliases(entity_id);
CREATE INDEX idx_ea_norm   ON entity_aliases(surface_norm);
CREATE INDEX idx_ea_script ON entity_aliases(script_key);
CREATE INDEX idx_ea_phon   ON entity_aliases(phonetic_key);
CREATE UNIQUE INDEX idx_ea_uniq ON entity_aliases(entity_id, surface_norm, lang, kind);

CREATE TABLE alias_priors (         -- self-improving P(e|m) candidate-gen prior (aggregate of confirmed bindings)
  surface_norm TEXT NOT NULL, entity_id INTEGER NOT NULL, count INTEGER DEFAULT 1,
  PRIMARY KEY (surface_norm, entity_id));
CREATE INDEX idx_ap_surface ON alias_priors(surface_norm);

CREATE TABLE entity_claims (        -- THE atom: EVERY cited assertion — fact, kinship, participation, death,
  id INTEGER PRIMARY KEY,           --   characterization, AND identity-equivalence. Typed statement table, NOT EAV.
  claim_hash TEXT UNIQUE,           -- content hash → idempotent re-ingest / reversible apply
  claim_group TEXT,                 -- clusters corroborating/conflicting assertions about the same (entity,relation,target)
  entity_id INTEGER NOT NULL, relation TEXT NOT NULL,      -- relation → relations.key (controlled)
  target_entity_id INTEGER,         -- connection/identity/event target as an ID (never a string)
  statement TEXT NOT NULL, proof_verbatim TEXT,            -- the support-gate span
  doc_id INTEGER, para_id TEXT,     -- citation
  valid_from TEXT, valid_to TEXT,   -- world-time (era gating — cheap deterministic exclude)
  asserted_at INTEGER DEFAULT (unixepoch()), superseded_at INTEGER,   -- system-time; append-only, supersede don't rewrite
  rank TEXT DEFAULT 'normal',       -- preferred|normal|deprecated (conflicts coexist; never delete)
  status TEXT DEFAULT 'supported',  -- supported|refuted|not-established|contested
  proof_ok INTEGER, subject_ok INTEGER, consistency_ok INTEGER,       -- write-time verification gates
  confidence REAL, provenance_tier INTEGER, extractor_version TEXT, import_batch TEXT);
CREATE INDEX idx_ec_entity   ON entity_claims(entity_id);
CREATE INDEX idx_ec_target   ON entity_claims(target_entity_id);
CREATE INDEX idx_ec_relation ON entity_claims(relation);
CREATE INDEX idx_ec_ent_rel  ON entity_claims(entity_id, relation);
CREATE INDEX idx_ec_group    ON entity_claims(claim_group);
CREATE INDEX idx_ec_para     ON entity_claims(para_id);
CREATE INDEX idx_ec_batch    ON entity_claims(import_batch);
```

`graph_entities` (add `type='event'`) and `entity_mentions` already exist. Two belief layers
(source-vs-system) and a materialized `claims_best` are deliberately **deferred** (YAGNI) —
`status` + `provenance_tier` + per-entity query-time best-rank cover today's needs; add them
only when a concrete case demands it.

**Migration sequence (each reversible, dry-run first):**
1. **DDL** — create the four tables (empty, additive) via a numbered migration.
2. **Aliases** — union `graph.db.entity_aliases` (56,588) + `er.aliases` JSON (6,456) → typed
   `entity_aliases`; dedup by `(entity_id, surface_norm, kind)`; derive `script_key`/`phonetic_key`,
   infer `kind`, flag `is_display`; re-run the contamination scan against the unified store.
3. **Claims** — backfill `facts`/`facts2`/`characterizations`/`episodes` JSON → `entity_claims`
   (compute `claim_hash` + the three `_ok` gates + `provenance_tier`; events become entities,
   participation becomes claims); seed `alias_priors` from confirmed mentions.
4. **Mentions** — reconcile the `graph.db` + `sifter.db` mention tables into one (cold log).
5. **Repoint** `bio.js` + entity-read to the normalized tables; keep `er.aliases`/`research_notes`
   as a read-only fallback during dual-read, then stop reading them.
6. **Meili** — build the lean `claims` + `aliases` discovery indexes.
7. **Retire** `graph.db`.

### Built + verified (2026-07-08)
- **Migration 84** creates the spine (`relations`, `entity_aliases_v2`, `alias_priors`,
  `entity_claims` + indexes) — additive, empty, reversible by DROP.
- **`unify-aliases.mjs`** (dry-run) computes **57,390** unified typed alias rows from the 56,588
  `graph.db` rows + 6,442 JSON strings + 2,215 canonicals; script-key on 2,616, phonetic-key on
  53,659. It surfaces the **969 JSON-only aliases** (the store divergence / higher-risk set —
  mostly legitimate coreference epithets like "the solace of mine eyes", but the place to scan
  for contamination before cutover).
- **`test-index-coverage.mjs`** runs `EXPLAIN QUERY PLAN` for **every pivot and facet** (each
  claim-relationship direction, each alias-resolution key, the P(e|m) prior, mentions, and
  entity facets) and fails on any full scan / temp-b-tree. It already caught two gaps on the
  *existing* schema: (a) the person-list `ORDER BY importance` did a **TEMP B-TREE** sort of
  every entity per search → fixed by **migration 85** (`idx_ge_type_importance`); (b) **`side`
  is not on the entity row** (it's in `entity_research`) so it can't be faceted efficiently →
  the claims backfill **denormalizes `side` (and any hot facet) onto `graph_entities` + indexes
  it**, so "persons of side X" becomes an index seek. This test is the standing gate: every new
  relation/facet must be added to it and must hit an index.

## Implementation path

**Quick wins (no migration):**
1. **Unify the alias store** — make `entity_aliases` (typed) the single source; backfill from
   `er.aliases`; `bio.js` reads it. (Closes the case-study bug class at its source.)
2. **Connection-target precision in `bio.js`** — evidence must name the queried target.
   *(Shipped 2026-07-08.)*
3. **Promote the three checks to write-time gates** in the `apply-*` scripts; run
   `scan-misbound-facts` + `fix-citations` as scheduled invariants.

**Foundational (migration — do BEFORE ROB ingest):**
4. **`entity_claims` table** — collapse the four JSON arrays into one normalized, verified,
   id-keyed store; keep `research_notes` for uncited notes only.
5. **Re-key `entity_research` ↔ `entities` on `entity_id`**, retiring the string join.
6. **Extract the evidence comparator** as a shared module used by integrate + search + verify.

Build normalized tables alongside, backfill, dual-read, cut over, then drop the JSON arrays.
