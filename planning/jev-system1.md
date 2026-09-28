# Jev as System 1 — what it does well, and where it goes in the pipeline

Chad, 2026-09-28: *"Having a very fast decision-making tool should change our architecture."* Jev (TypeSafe System One)
answers typed choices with a calibrated confidence in ~150ms, several questions per call. The pattern everywhere:
**Jev decides the confident majority and flags the rest; the flags go to a careful reader** (this session, or a
model where volume forbids). Measure every use — its strengths and failures are specific.

## Measured (identity cluster audit, Mullá Ḥusayn, 341–357 clusters)

| | result |
|---|---|
| Speed | 357 clusters in 12 s (6 per call); a richer profile made calls slower — 8 s timeout lost 30, now 20 s |
| Confident "same" (≥0.75) | **30/30 correct** in a random sample (EN/FA/FR/DE/ES, titles, epithets) — safe to pass |
| "different" / "unclear" flags | ~1 in 3 real errors (16 of 47 on run 1). False flags: titles (باب الباب), figurative or retrospective references, index lines |
| Profile with the names the texts use | flags 47 → 21, real errors kept; found 2 more a reader had missed |
| Real errors it surfaced | namesakes only visible in Persian (ملا حسين گنجه, دخيل, جوان تبريزي, گوهر), the brother Muḥammad-Ḥasan, the Prophet Muḥammad, Mírzá Muḥíṭ addressed as "السائل المحيط", Siyyid Káẓim addressed as "سيدنا" |

Lessons: give Jev the entity's own names (titles, original script) or it flags every title; centre the text window on
the mention (a fixed cut-off hid the name from Jev and readers alike); a failed call must flag, never pass.

## Where System 1 goes next (ordered by accuracy gained per cost)

1. **Gate new identity links at the source (reconcile).** Before a cluster decision binds a book's label to a record,
   one Jev check against the record's profile; "different" → `uncertain`, not `link`. Prevents the contamination the
   audit has been cleaning up, for every future book (the new original-language tablets included).
2. **Replace blanket re-disambiguation with flagged re-disambiguation.** Plan step 6 re-reads the core books (~60k
   paragraphs) because notes were written under the old "most prominent bearer" prompt. Instead: Jev asks, per
   paragraph, "does the note name a DIFFERENT person than the text supports for each name?" — re-disambiguate only the
   flagged paragraphs. Likely a large cost cut on the rescue and core-book re-reads.
3. **Claim proof check.** 615k claims; ask Jev "does the proof span state this claim?" (the `proof_ok` question) —
   flag unsupported claims for review instead of trusting extraction.
4. **Pair judge first pass.** Jev same/different/unclear on every candidate pair; only unclear and "same" go to the
   evidence judge. Titles of people ("title of X" proposals) are exactly what Jev must be given names for.
5. **Top-100 audit, then top-1000.** Jev over every cluster; the session reads only non-"same" flags. Needs a second
   filter before scaling: ~20 flags per person × 100 people is too many to read here. Candidates: a second Jev pass
   with more context (two more paragraphs), or DeepSeek on flags only, session on its "different".
6. **Ingestion.** Per-paragraph original language (the "Íqán is Persian" lesson), block type (heading / verse /
   footnote / index — index lines produced many false entities), OCR garbage in names ("p,aha• allah" became a
   record), document metadata (author, tradition, translation authority) sanity, "are these two documents the same
   work?" for the duplicate problem.
7. **Extraction.** Is this surface a person, a title, a place, or a pronoun? Pronoun mentions ("I", "He" — an 88-mention
   "He" cluster) are where windows are least reliable; a Jev check that the pronoun resolves to the person is cheap.
8. **HyPE.** Is this hypothetical question answerable from the paragraph? Drop the rest before indexing.

Already live: search scope and plan, source resolution, Anís triage and persona check, entity cluster audit
(`POST /api/admin/server/identity-cluster-audit`, read-only).

## Extraction itself — Jev where the decision is a CHOICE (2026-09-28)

**Diagnosis.** Identity is decided twice, both times as free text: disambiguation writes a label per name
("Mullá Ḥusayn (the Bábu'l-Báb)"), reconcile maps the label to a record. Every error class cleaned up today comes from
that: prominence defaults (every Fáṭimih → Ṭáhirih), one label covering several people (three in one 1926 cluster),
common words taken for names ("ولي" = "but"), addressees confused ("سيدنا" = Siyyid Káẓim), index lines as prose. The
real decision is always a choice among a few people — Jev's shape. The LLM keeps what only it can do: find the names,
write the note.

**Measured — Jev as an occurrence LINKER** (77 hand-judged occurrences, mostly where the pipeline was wrong; candidates =
the name's lookup hits + the bound record + the truth; 7 s total):

| subset | Jev picks the right person | Jev confident (≥0.75) |
|---|---|---|
| pipeline WRONG (61) | 34 (56%) — and repeats the wrong binding only **4 of 61** | 14/16 |
| pipeline right (16) | 12 (75%) | 8/8 |
| named surfaces (65) | 45 (69%) | — |
| honorific / pronoun surfaces (12: "آنجناب", "جناب باب", "the leader") | 3 (25%) | — |

Reading: Jev **disagrees with 93% of wrong bindings** and is right 92% of the time when confident. Weak where the
passage does not name the person (honorifics, pronouns) — the referent is in earlier paragraphs.

**Design (in build order, each measured before the next):**
1. **Profile cards** for every person: name, titles and original-script forms, era, place, role, key relations — what
   Jev chooses between. Many candidates today have no summary; the audit showed names in the profile cut false flags by
   half. One-time cost, reused by linking, audit and pair judge.
2. **Occurrence linking beside the LLM label** (shadow mode first): per name occurrence, Jev chooses among lookup hits +
   people active in the book + "a person not listed" + "not a person". Agreement → accept. Jev confident and
   different → review queue (this session). Measure the agreement rate and the review volume per book before letting
   Jev decide anything alone.
3. **Local coreference** for honorifics and pronouns: candidates = the people named in the previous 3 paragraphs (a
   tiny set). Re-measure the 12 deictic cases.
4. **Paragraph router** before any LLM call: names people? index / table / bibliography? doctrinal? language? → skip
   entity extraction on index lines (a source of false people), send doctrine to the concept track.
5. **Scene continuity** per adjacent pair ("same time and place as the previous paragraph?") → dates inherited only
   within a scene (plan step 7, the Karbilá failure).
6. **Typed mention features** (gender, role class, era bucket, named relative) → deterministic namesake separation and
   pair-judge evidence. Gender alone catches the man at Cornell filed under May Maxwell.

Benchmark script: planning/merge-review/jev_link_bench.py (gitignored with its gold data; the gold set grows with every
reviewed decision — each review is a test case).
