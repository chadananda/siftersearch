# W8 — Anís for the launch audience: *The Dawn-Breakers* + *Gate of the Heart* (2026-11-03)

Workstream W8 (a, b, d) of planning/anis-launch-sprint-20261103.md. Audience: Chad's employer + Dawn-Breakers Challenge
participants (co-taught with Nader Saiedi). Everything below was measured against production through the API
(`http://tower-nas:7839`, X-API-Key / ops reports); no database was read. Battery file:
`tests/quality/questions/audience-dawnbreakers-goth.jsonl`; scorer: `tests/quality/score-audience-battery.mjs`.

## (a) Presence, findability, rights

| | *The Dawn-Breakers* (Nabíl, tr. Shoghi Effendi) | *Gate of the Heart* (Saiedi 2008) |
|---|---|---|
| doc id | **21308** | **8632** |
| paragraphs | 1,900 total (1,224 in the public list) | 2,113 |
| find by title (`/api/v1/library/find-document?title=`) | yes | yes (`documents?q=Saiedi` misses it) |
| verbatim passage search → rank | 0 (top hit) | 0 (top hit) |
| paragraph links | oceanlibrary.com/dawn-breakers_nabil/?paraId=… | siftersearch.com/library/bahai/bahai-books/nader-saiedi_gate-of-the-heart-…#pN |
| topical / concept search surfaces the book | rarely — authority ranking favours primary works | rarely |
| metadata | year, collection, slug **null**; stub duplicates 21871 / 174691 / 624576 | slug ok; **zero headings**, ~665 junk ¶ (`[.]`, `[pg N]`, loose footnotes) — chapter structure lost at ingestion |
| rights class | public (Bahá'í Publishing Trust) | `encumbered = 0`, full text served to anonymous readers |

**Gate of the Heart rights.** `rights-isbn` (dry, run 169214) finds no ISBN of its own in the text; `rights-publisher`
(run 12342) classifies it **institutional** — publisher "Association for Bahá'í Studies", ISBN 9780920904381 from the
copyright page — so under Chad's 10-23 rule (ABS / Publishing Trusts / Wilmette → open) it is deliberately OPEN and the
40-¶ preview rule (`api/lib/rights/preview.js`) does **not** apply. ⚠ Chad decision: ¶7 names the co-publisher
**Wilfrid Laurier University Press** (commercial, holds the trade edition). If WLU's share matters, flip 8632 to
encumbered (`rights-isbn --apply` or the admin rights endpoint) and the server-enforced preview takes over. Default
taken here: leave open.

Nothing to import: both books are present. Clean-ups for the dossier owner: Dawn-Breakers year/collection/slug and the
three stub duplicates; GotH heading reconstruction (chapter/section headings are what make a concept book citable by
chapter).

## (b) Battery

42 fresh questions, none from the held-out Immerse 61: history-story 7, who-was 8, date-place 6, timeline 5,
explain-passage 6 (verbatim lines checked against 21308 before writing), goth-concept 10. Each item carries the
expected linked work (`extra.work`) and `expect.docs`. Run: `research-battery.mjs --questions … --tag w8-audience`
(production Anís, variant `current`, vs Perplexity sonar, blind Opus judge), then `score-audience-battery.mjs`.
Spend: estimated $5–7 before the run (42 × Anís ≈$0.04–0.10 + Perplexity ≈$0.01 + judge ≈$0.06), cap $10.

Measures: **wins+ties** = judge score Anís ≥ Perplexity (bar ≥85% per type); **linked work** = a markdown link in the
reply reaches the expected book (named-only = title in prose, no link); **invented quote** = a quoted run of ≥6 words
whose 5-word n-grams are <50% found in the best `/api/v1/search` hit (verbatim ≥90%, partial 50–90%).

### Results (run `tmp/anis-battery-w8-audience-2026-11-03T16-25-22-993Z.json`, production Anís, 42/42 answered)

| type | n | wins+ties | Anís | Perplexity | linked work | quotes | invented |
|---|---|---|---|---|---|---|---|
| history-story | 7 | 7/7 (100%) | 8.6 | 5.3 | 7/7 (100%) | 33 | 0 |
| who-was | 8 | 7/8 (88%) | 7.4 | 4.6 | 8/8 (100%) | 34 | 4 |
| date-place | 6 | 6/6 (100%) | 8.3 | 5 | 4/6 (67%) | 12 | 1 |
| timeline | 5 | 5/5 (100%) | 8.1 | 4.6 | 5/5 (100%) | 17 | 1 |
| explain-passage | 6 | 4/6 (67%) ⚠ | 6.5 | 5.5 | 6/6 (100%) | 29 | 4 |
| goth-concept | 10 | 10/10 (100%) | 8.5 | 4.9 | 10/10 (100%) | 107 | 7 |
| all | 42 | 39/42 (93%) | 7.9 | 5 | 40/42 (95%) | 232 | 17 |

* **Wins+ties: 39/42 (93 %)**; Anís mean 7.9 vs Perplexity 5.0. Bar ≥85 % met for every type except **explain-passage 4/6
  (67 %)** — the two losses there and the one in who-was are the only three losses in the battery.
* **Right linked work: 40/42 (95 %)** (bar 100 %). Misses: db-16, db-20 (date-place) — answered from *God Passes By*,
  Balyuzi and external chronologies, *The Dawn-Breakers* never linked. Smoke run also showed db-30 citing a
  Dawn-Breakers passage from *The Bahá'í World* vol. V instead of the book (fixed itself in the full run — ranking noise).
* **Invented quotations: 0 confirmed.** The scorer flagged 17 of 232 quoted runs; every flag was checked by hand
  (table below): 13 are verbatim in a library work the 10-hit search did not surface or are legitimately elided with
  "…", 5 are verbatim in Jack McLean's review of *Gate of the Heart* on bahai-library.com (fetched and checked), and
  2 cannot be verified from here — db-16's Islamic date is cited to a **dead link** (bahai-library.com/rabbani_khatirathayat
  → 404) and db-29's dream detail to Balyuzi's *King of Glory*, which the API serves only as a 40-¶ preview (encumbered).
  Neither reads as an invention; both are citation-hygiene defects.
* **Latency:** Anís median 40.5 s, p90 65 s, max 78 s (Perplexity median 5.2 s). 40/42 went through the research agent;
  the two misroutes (`yes_no_with_proof`, `letter`) answered without any research and scored 1 and 2.
* **Authority notes from the judge (minor):** db-06 credits Shoghi Effendi but cites Nicolas's *Seven Proofs*; db-31 and
  db-32 route the Guardian's words through a secondary article / a House of Justice letter when *God Passes By* has them.
* **Spend:** the runner records no dollars (flag: add usage to `research-battery.mjs`). By list price the run is
  ≈$3–6 (Perplexity sonar 42 calls, Opus judge 42 calls ≈ $1–2, Anís server-side ≈ $2–4) — under the $10 cap.

| flagged quote | reply | resolved as |
|---|---|---|
| "a number of the betrayed companions of Quddús" | db-08 | verbatim, *God Passes By* #21310 |
| "Go forth… and seek out your Lord" | db-09 | verbatim (elided), *Memorials of the Faithful* #20907 ¶550 |
| "remained faithful to the Covenant of God" | db-11 | verbatim, Dawn-Breakers — a `[pg 382]` marker inside the paragraph broke the match (data defect) |
| "the Name of God the Most Truthful" | db-13 | verbatim, *Sūrat al-ism* #16203 |
| "5 Jamadiu'l-Avval 1260 A.H. [22 May 1844]" | db-16 | **unverifiable — cited link is 404** |
| "about a month after Mulla Husayn" | db-25 | verbatim, *'Alí Bastamí, Mullá* #16745 |
| "holding a finger between his teeth" | db-29 | **unverifiable — *King of Glory* #462 is a 40-¶ preview** |
| "feeble and impotent… dejected and timid" | db-30 | verbatim (elided), Dawn-Breakers |
| "a basis for specific forecasts concerning dynasties" / "which contains the past and future knowledge" | db-32 | verbatim, *Muqaddimah* #21338 / *Hayat al-Qulub* #21051 |
| "may be likened unto the sun" | goth-03 | verbatim, *Garden of the Heart* #23706 |
| 6 phrases from McLean's review | goth-06, goth-08 | verbatim on bahai-library.com/mclean_saiedi_gate_heart (external, not library) |
| 7 "partial" runs | db-06, db-07, db-17, db-25, db-30, goth-01, goth-10 | elided with "…" or spanning two paragraphs; source text matches |

### Top defects for W4 (one example each)

1. **Jev misroutes history questions away from research.** "Who were the Seven Martyrs of Ṭihrán, and how did each die?"
   (db-15) → `yes_no_with_proof`; "Nabíl writes: 'The siyyid's message stung Ḥájí Mírzá Karím Khán…' Who was the siyyid?"
   (db-28) → `letter`. No research ran; both opened "Dear friend", named nobody, and db-28 called the siyyid "the Báb"
   (it is Siyyid Káẓim). Scores 1 and 2 — the battery's only bad answers. A quoted passage + "who/what" must route to
   the researcher.
2. **The researcher cannot read a long Dawn-Breakers window.** db-31 (Amír-Niẓám's death at Fín): Anís admits it "could
   not read Nabíl's year-by-year list" and leaves the answer unfinished with an offer to look further. Give the agent a
   read-paragraph-range tool on the linked work (and let it read across `[pg N]` markers).
3. **Date/place questions skip the book the course is reading.** db-16 (Declaration date and place), db-20 (Ṭáhirih's
   death): answered from *God Passes By* + bahai-library.com chronology, no Dawn-Breakers link. When the question's work is
   in the library, link it first, then the Guardian's summary.
4. **External and dead citations where the library has the text.** db-16 cites bahai-library.com/rabbani_khatirathayat
   (404); goth-06/goth-08 quote McLean's *review* for Saiedi's thesis ("I could not find a passage where Saiedi explains
   the title himself") — because *Gate of the Heart* #8632 has no headings and ~665 junk paragraphs, so the chapter on
   the Gate is unfindable. Citation order (Chad 11-01): best published in-library source first; verify external URLs.
5. **Primary source quoted through a secondary.** db-06 credits Shoghi Effendi but cites Nicolas's *Seven Proofs*;
   db-31/db-32 route *God Passes By* wording through McLean / a UHJ letter. Also latency: median 40 s, p90 65 s —
   a seminar audience will not wait a minute per answer.

## (d) Pull the two book dossiers forward? (Chad decides)

1. **Yes, pull both forward — cheaply, as data fixes, not new features.** The battery shows Anís already beats
   Perplexity on both books (39/42); what is missing is findability of the books themselves, not answering.
2. *Gate of the Heart* (#8632): re-ingest with headings and strip the ~665 `[.]`/`[pg N]`/footnote paragraphs — one
   Dewey re-run. Without chapter headings Anís falls back to McLean's review for Saiedi's own argument (goth-08).
3. *The Dawn-Breakers* (#21308): fill year/collection/slug, retire the three stubs (21871, 174691, 624576), and move
   `[pg N]` markers out of paragraph text — they break verbatim matching and reading windows.
4. Both books need a "dossier" only in the thin sense: a find_work alias list (Nabíl / Nabil-i-A'zam / Zarandí;
   Saiedi / Gate of the Heart) and chapter outlines the agent can read by range. Skip timelines/bios until W4's
   routing fix lands — the misroutes (defect 1) cost more points than any dossier would add.
5. Chad decisions: (a) leave #8632 open (ABS institutional) or flip to encumbered for the WLU co-publisher — the doc's
   own `metadata.publicationName` says "Wilfrid Laurier University Press", so the publisher report and the record
   disagree; (b) approve the two data re-runs above (no new imports needed).
