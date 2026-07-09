# VERIFY: Bayán (the Báb's revealed scripture) — D-D modeling case

**Status:** modeled, 1 NEEDS-USER flag (concept-vs-work policy, same as "Revelation")
**Confidence:** HIGH on the two-work firewall; MEDIUM on concept-sense assignment (corpus conflates it)
**Date:** 2026-06-16 — read-only verification, cross-corpus + WebSearch

---

## SUMMARY OF THE CONFLATION

"Bayán" (lit. *Exposition / Utterance*) is a true many-to-one ambiguity in the corpus. It denotes:

- **(a) Persian Bayán** (Bayán-i-Fársí) — the Báb's major work, ~9 of an intended 19 Váḥids, written/revealed at Mákú. Shoghi Effendi: "the most weighty, the most illuminating and comprehensive of all His works… a eulogy of the Promised One." **A WORK.**
- **(b) Arabic Bayán** (Bayán-i-‘Arabí) — a separate, shorter doctrinal-legal work of the same Mákú/Chihríq period, 11 Váḥids. **A DISTINCT WORK — must be firewalled from (a).** Web + corpus both confirm they are two books with parallel-but-different structure (doc 7165: "At the beginning of both the Persian Bayán and the Arabic Bayán…").
- **(c) "the Bayán" / "The Bayán"** — used loosely for the Báb's Revelation / the body of His scripture / His Dispensation ("the Holy Book of the Báb"; "the whole of the Bayán is only a leaf…"; "People/Mirrors/scholars of the Bayán"). **CONCEPT / DISPENSATION sense** — the locus of the NEEDS-USER policy call.
- **(d) place/other** — NOT found. No place-named "Bayán" in corpus. (The derivative title fragments below are dispensation-concept, not place.)

---

## VERDICT — fragment ledger

### KEEPER 1 — Persian Bayán (WORK)
- **keeper id = 1219348** `Persian Bayán` (work, 215 mentions counted)
- DESCRIBE: The Báb's pre-eminent Persian-language revealed Book (Mákú, 1264/1848), ~9 Váḥids of an intended 19, laws + precepts of the Bábí Dispensation, dominated by the announcement of "Him Whom God shall make manifest." Acknowledged by Bahá'u'lláh/Shoghi Effendi as the chief repository of Bábí law.
- Strong-sense fragments concentrated in doc **8632** (134 mentions — a Persian-Bayán study/translation) and doc **7165** (35 — the Kitáb-i-Badí‘ study). These are the textually-correct "Persian Bayán" mentions.
- **CAVEAT:** 1219348 is contaminated — its mentions in Dawn-Breakers (doc 21308/21310) and in the Nicolas-type front-matter (16275, 11445) include passages that merely *co-occur* near the title or are generic "Bayán" references. Roughly 165/215 ≈ **77% are genuine Persian-Bayán**; ~23% are bleed from sense (c). Re-scope on merge.

### KEEPER 2 — Arabic Bayán (WORK) — ★ FIREWALL ★
- **keeper id = 1219474** `Arabic Bayán` (work, 40 mentions counted)
- DESCRIBE: The Báb's shorter Arabic-language Book (Bayán-i-‘Arabí), 11 Váḥids, same Áẕhirbáyján imprisonment period; doctrinal-legal, parallel structure to the Persian Bayán but a separate composition.
- ~37/40 ≈ **92% genuine**, concentrated in doc **8632** (22) and **7165** (15) — both passages that explicitly name "the Arabic Bayán" and contrast it with the Persian.
- **FIREWALL RULE:** never merge 1219474 into 1219348. They are co-authored, co-dated, near-co-named, structurally parallel — exactly the profile that invites a bad merge. Keep `duplicate_of` NULL between them; if any auto-dedup link exists, sever it. Distinguishing token is the language qualifier ("Persian"/"Arabic" / "-i-Fársí"/"-i-‘Arabí").

### SENSE 3 — "the Bayán" (CONCEPT / DISPENSATION) — NEEDS-USER
- Primary fragments:
  - **1219353** `Bayán` (work, 281) — the LARGEST fragment; mislabeled `work` but its mentions are dominantly the loose "Holy Book of the Báb / the Revelation" sense. Spread across docs 8632(76), 7165(75), 429(31), 430(27), 426(22), 21310(20) — i.e. it is the catch-all bucket. **~60–70% concept-sense, ~30% bleed to one of the two works.**
  - **1244758** `The Bayán` (work, 56) — entirely in study docs 8632(37)/7165(19); usage is "according to the Bayán", "references in the Bayán", "Mirrors/scholars of the Bayán" = the corpus/dispensation, NOT a specific one of the two books.
- DESCRIBE: "the Bayán" as metonym for the Báb's Revelation / scripture-as-a-whole / His Dispensation. Sometimes the speaker *means* the Persian Bayán specifically but the text is under-specified; often it genuinely means the whole Bábí revelation.
- **★ NEEDS-USER — concept-vs-work modeling policy (identical to the "Revelation" case):**
  - **Option A (recommended):** keep ONE concept/dispensation entity "the Bayán (Revelation of the Báb)" = canonicalize **1219353**, retype `work`→`concept`, fold **1244758** into it. Leave the two work-entities (1219348, 1219474) clean. Under-specified mentions stay on the concept node rather than being force-assigned to a work.
  - **Option B:** treat "the Bayán" with no qualifier as a *surface alias of the Persian Bayán* (since PB is the pre-eminent text) and fold 1219353/1244758 into 1219348. Higher recall for PB, but pollutes the work-entity with dispensation-sense mentions and risks pulling Arabic-Bayán passages under PB.
  - Recommend **A** to preserve the firewall. Flagging because this is the same concept-vs-work judgment you reserved on "Revelation" — your call, not mine.

---

## OUT OF SCOPE (separate entities — do NOT fold into the above)
These are derivative dispensation/title concepts that legitimately stand alone:
- 1219534 `the Point of the Bayán` (37) + 1237917 `Point of the Bayán` (4) → title of the Báb Himself (the Báb = the Point). Distinct PERSON-title sense; the two should likely merge with each other, not with the Book.
- 1219521 `People of the Bayán` (org, 27) + 1219529 (concept, 8) + 1219533 `Congregation of the Bayán` (3) → the Bábí community. Merge-candidates among themselves.
- 1239562 / 1240377 `(the) Promised One of the Bayán` (25+3) → "Him Whom God shall make manifest" / Bahá'u'lláh. Distinct.
- 1219531 `Váḥid of the Bayán` (5), 1219977 `Letters of the Bayán` (4), 1219352 `Dispensation of the Bayán` (4), 1219351 (1), 1219958 (1) → dispensation-structure concepts.
- 1221207 `Amínu'l-Bayán` (1) → a PERSON title ("Trustee of the Bayán"), doc 21310 Dawn-Breakers; NOT the Book. Mis-typed `work`. Excise.

---

## FLAGS
- **FIREWALL:** 1219348 (Persian) ⟂ 1219474 (Arabic) — never merge. HIGH priority.
- **NEEDS-USER:** concept-vs-work policy for sense (c) — Option A recommended; mirrors the "Revelation" decision you reserved.
- **RETYPE:** 1219353 and 1244758 are typed `work` but are concept/dispensation; 1221207 is a person-title typed `work`.
- **RE-SCOPE ON MERGE:** ~23% of 1219348's mentions and ~30–40% of 1219353's are cross-bleed; a clean re-classification pass (study docs 8632/7165 carry the disambiguating language qualifier) would tighten both.
- `mention_count` column not trusted — all counts above are live `entity_mentions` counts.

## SOURCES (web)
- Persian Bayán — Hurqalya Publications (UC Merced): https://hurqalya.ucmerced.edu/node/1121/
- Arabic Bayán (al-Wāḥid al-Awwāl) — Hurqalya: https://hurqalya.ucmerced.edu/node/1171
- Persian Bayán — Wikipedia: https://en.wikipedia.org/wiki/Persian_Bay%C3%A1n
- Bayán (overview) — Wikipedia: https://en.wikipedia.org/wiki/Bay%C3%A1n
- The Báb in the words of Shoghi Effendi — bahai.org: https://www.bahai.org/the-bab/articles-resources/the-bab-words-shoghi-effendi
