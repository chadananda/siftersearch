# Entity Verification — Kitáb-i-Aqdas (the Most Holy Book)

## VERDICT
**UNIFY** — keeper = **1219401** (Kitáb-i-Aqdas, entity_type=`work`, confirmed correct)

Merge the following same-work title/spelling fragments into 1219401:
- **1238117** — "Most Holy Book" (English title of the same book; mentions explicitly equate it: *"The name of the Kitáb-i-Aqdas—'The Most Holy Book'"*)
- **1228889** — "Kitab-i-Aqdas" (un-diacritic spelling; *"read the text of the Kitab-i-Aqdas soon after it was revealed"*)
- **1225587** — "Kitáb-i Aqdas" (missing hyphen variant; *"Bahá'u'lláh's Kitáb-i Aqdas: laws and ordinances"*)
- **1223379** — "Laws of the Aqdas" (refers to the Aqdas's own laws; phrase-alias, not a distinct work)
- **1224365** — "the Laws of the Aqdas" (same as above; the/Laws-of phrasing of the Aqdas)

These are orthographic/title variants or self-referential law-phrases of the one book. Burden of proof for splitting is not met; default-merge applies.

## CONFIDENCE
**High (0.97)** for the core spelling/title merges (1238117, 1228889, 1225587). **Medium-high (0.85)** for the two "Laws of the Aqdas" phrase-entities — they could alternatively be kept as a sub-concept, but corpus usage points back to the Aqdas itself, so merging as alias-phrases is the safe default.

## EVIDENCE
- Keeper 1219401 carries 727 mentions — by far the dominant node; all variants are low-count satellites (18, 4, 1, 2, 2).
- Corpus confirms equivalence: doc 7165 states *"The name of the Kitáb-i-Aqdas—'The Most Holy Book'—itself indicates the position…"* — directly identifying 1238117 with 1219401.
- Spelling-only differences (hyphen/diacritic) for 1228889 and 1225587; same referent in context (Jamál-i-Burújirdí reading "the text of the Kitab-i-Aqdas soon after it was revealed").
- WebSearch corroborates the Kitáb-i-Aqdas as the central book ("Mother-Book"), written 1873, distinct from the post-Aqdas tablets.

## ALIASES (consolidated on 1219401)
Existing keeper aliases already comprehensive: the Kitáb-i-Aqdas, Kitáb-i-Aqdas, the Most Holy Book, Aqdas, Most Holy Book, His Most Holy Book, Mother Book / Mother-Book, the Aqdas, the Holy Book, the Book of God, the Book of Laws, KA, al-Kitáb al-Aqdas (Kitab-ul-Akdas), the Most Holy Tablet, etc.
Add from merged fragments: **Kitab-i-Aqdas**, **Kitáb-i Aqdas**, **Laws of the Aqdas**, **the Laws of the Aqdas**.
Note housekeeping: keeper alias list contains OCR garbage to prune later — "Kit&-i-Aqdas", "Ki&-i-Aqdas", "extracts, 2, 3, and 4", "that name". Not a merge concern.

## DESCRIBE (the work)
The Kitáb-i-Aqdas ("the Most Holy Book"; Arabic *al-Kitáb al-Aqdas*) is the central book of laws of the Bahá'í Faith, revealed by Bahá'u'lláh in Arabic c. 1873 while He was confined in the house of 'Údí Khammár in Akká (ʻAkká). Described by Shoghi Effendi as the "Mother-Book" of the Bahá'í Dispensation and the repository of its laws, ordinances, prohibitions, exhortations, and the foundations of the Administrative Order. The authorized English translation was published by the Universal House of Justice in 1992.

## FLAGS — DISTINCT WORKS TO FIREWALL (do NOT merge into 1219401)
Related but separate work-entities — keep apart (optionally relate to 1219401):
- **1222933 / 1228063** — "Synopsis and Codification of the Kitáb-i-Aqdas" (compilation prepared by Shoghi Effendi; a separate derivative work). *These two are duplicates of each other and should merge together, keeper among them, but NOT into 1219401.*
- **1232855** — "Questions and Answers" (*Suʼál va Javáb*; a separate work by Bahá'u'lláh, published as an appendix-companion clarifying Aqdas laws — distinct work).
- **1231527** — "Lawh-i-Aqdas" (the "Most Holy Tablet" / "Tablet to the Christians," addressed to Fáris Effendi — an entirely different tablet, NOT the book).
- **1220520** — "Tablets of Bahá'u'lláh Revealed After the Kitáb-i-Aqdas" (a separate published collection of post-Aqdas tablets).
- **1222410** — "Appendix to the Kitáb-i-Aqdas" (editorial appendix material; separate).

## FLAGS — WRONG-TYPE NON-WORKS (not this work; leave as-is)
- **634646** — "Haram-i-Aqdas" (entity_type=`place`; the Most Holy Shrine/precincts at Bahjí — a place, unrelated to the book).
- **1219558** — "System envisaged in the Kitáb-i-Aqdas" (entity_type=`concept`).
- **1223196** — "Revelation of the Most Holy Book" (entity_type=`event`).
