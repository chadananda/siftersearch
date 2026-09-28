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
