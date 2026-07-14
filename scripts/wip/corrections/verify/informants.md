# Dawn-Breakers Preface Informants — Cross-Corpus Verification

Method: per informant, located graph id (mention_count column is STALE — counts via
live `entity_mentions` in graph.db), pulled mention contexts from sifter.db `content`,
firewalled against namesakes, cross-checked DB Preface vs Balyuzi/Bahaipedia web sources.

Anchor paragraph (content id 21053850, Nabíl's Preface roster) lists all five informants
verbatim: "Mírzá Aḥmad-i-Qazvíní, the Báb's amanuensis; Siyyid Ismá‘íl-i-Ḏhabíḥ;
S̱hayḵh Ḥasan-i-Zunúzí; S̱hayḵh Abú-Turáb-i-Qazvíní; and ... Mírzá Músá, Áqáy-i-Kalím."
(Mírzá Aḥmad-i-Qazvíní & Mírzá Músá already consolidated.)

Note on entity fragmentation: the graph holds many legacy duplicate entities for these
names (e.g. 9+ "Shaykh Hasan-i-Zunúzí" spellings, 5 "Abu-Turáb" spellings). All legacy
fragments carry ZERO live `entity_mentions` — only the v2-extraction entities below hold
mentions, so consolidation is clean.

---

## 1. Siyyid Ismá‘íl-i-Dhabíḥ — "the Sacrifice"

**VERDICT: keeper 1060866 "Dhabíḥ" ← merge 1220155 "Siyyid Ismá‘íl-i-Zavári'í" (3 mentions)**
- 1060866 "Dhabíḥ" — 19 live mentions
- 1220155 "Siyyid Ismá‘íl-i-Zavári'í" — 3 mentions — **SAME PERSON, MERGE**
- Co-reference proof: paragraphs 21055701 & 21055702 are shared between both ids and read
  "a native of Zavárih, Siyyid Ismá‘íl by name, surnamed Ḏhabíḥ (the Sacrifice) ... when it
  was definitely established that Ḏhabíḥ had died by his own hand."
- (Suggested canonical_name after merge: **Siyyid Ismá‘íl-i-Zavári'í (Dhabíḥ)** — full name
  + epithet; "Dhabíḥ" alone is just the surname/epithet.)

**Confidence: HIGH (0.97)** — corpus + web (Bahá'í-Library, Bahaipedia) both give the same
full name and the same fate; the two graph fragments quote identical Shoghi Effendi prose.

**FIREWALL**
- ≠ **Karbilá'í Ismá‘íl the Sang-Sar martyr** — no live-mention Ismá‘íl entity matches that
  identity; the Sang(e)sar entities (646942, 946466, 1064475, 1066061) are place/other
  persons, none named Ismá‘íl. No collision.
- ≠ **Shaykh Ismá‘íl** (1220088, 5 mentions) — the Kurdish dervish/Shaykh of Sulaymáníyyih
  who sought out Bahá'u'lláh by a dream (content 21055670/21055672). Different man. Separate.
- ≠ **‘Azízu’lláh-i-Jadhdhab** (1055803, "Jadhdhab" = the Attracted, a businessman, content
  6441643). Different surname/epithet. Separate.
- Other Ismá‘íls (1220410 Káshání, 1145909 Ustád, 1220453 Káshí, 1221159 Áqá) unrelated —
  no merge.

**DESCRIBE**: Siyyid of Zavárih, formerly a noted divine of holy (Siyyid) lineage;
taciturn, meditative, severed from worldly ties. Recognised the Báb's Cause; en route to
Shaykh Ṭabarsí (converted the young Nabíl at Qum, 1265 AH / 1849). In Baghdád he made
sweeping the approaches of Bahá'u'lláh's house his self-appointed task, then **offered up
his life by his own hand as a sacrifice in the path of Bahá'u'lláh** (hence "Dhabíḥ").
Nabíl drew on his recollections before his death. **side = Bábí→Bahá'í** (final allegiance
Bahá'í — died for Bahá'u'lláh).

**FLAGS**: Requires a 2-into-1 MERGE (1220155 → 1060866). Recommend keeper canonical_name be
upgraded from bare "Dhabíḥ" to the full "Siyyid Ismá‘íl-i-Zavári'í (Dhabíḥ)".

---

## 2. Shaykh Ḥasan-i-Zunúzí

**VERDICT: keeper 1219469 "Shaykh Ḥasan-i-Zunúzí" (no merge needed)**
- 1219469 — 28 live mentions; sole live entity for this person.
- ~8 legacy spelling-duplicates (620172, 628566, 628613, 641572, 946121, 1013102, 1183883,
  1227571) all have ZERO live mentions — dormant, optional cosmetic cleanup only.

**Confidence: HIGH (0.97)** — corpus passage (content 21053888) is the verbatim Dawn-Breakers
account; web (Bahaipedia, Bahá'í Chronicles) corroborates identity and fate.

**FIREWALL (critical)**
- **≠ Anís** = **Mírzá Muḥammad-‘Alíy-i-Zunúzí** (1219652, 1 mention, content 21055559): the
  youth bound to the same pillar and **martyred WITH the Báb** in the Tabríz barracks square
  (1850). Different given name, different fate (died with the Báb vs survived). Confirmed
  separate; do NOT merge. (The legacy 1238735/1238280/1240939 "Muḥammad-‘Alíy-i-Zunúzí" and
  1238281 "Siyyid ‘Alíy-i-Zunúzí" / 632244 "Ali Zunuzi" are zero-mention dupes of Anís or
  other ‘Alís — keep off the keeper.)

**DESCRIBE**: Early Shaykhí; devoted disciple of Siyyid Káẓim-i-Rashtí at Karbilá. Recognised
and served the Báb (amanuensis; companion during the Báb's later captivity, Chihríq period).
Before His martyrdom the Báb directed him to return to Karbilá to meet "the promised Ḥusayn";
in Karbilá (Oct 1851) he became **the first to recognise Bahá'u'lláh** as the Promised One
(bidden to keep silence). Survived the Báb; a named informant to Nabíl. **side = Bábí→Bahá'í.**

**FLAGS**: No merge required. Many dormant zero-mention spelling duplicates exist (cosmetic).

---

## 3. Shaykh Abú-Turáb-i-Qazvíní

**VERDICT: keeper 625336 "Shaykh Abu-Turab" (no merge needed)**
- 625336 — 19 live mentions; sole live entity for this person.
- Legacy zero-mention dupes: 628392 "Shaykh Abú-Turáb", 1181472/1181473 "O Abu-Turab"
  (vocative artifacts). Dormant only.

**Confidence: HIGH (0.95)** — Preface roster names "S̱hayḵh Abú-Turáb-i-Qazvíní"; corpus
content 16491111 quotes "I have heard S̱hayḵh Abú-Turáb recount the following ... I, together
with a number of the disciples of Siyyid Káẓim ..." — establishing him as a Shaykhí disciple
and a firsthand source Nabíl heard directly.

**FIREWALL**
- **≠ Shaykh Abu-Turáb-i-Ishtahárdí** (1055357) — a DIFFERENT Abu-Turáb (different nisba:
  Ishtahárd vs Qazvín). Zero live mentions, but keep firewalled — never merge into keeper.
- ≠ the "O Abu-Turab" vocative entities (1181472/1181473) — invocation artifacts, not people.

**DESCRIBE**: Shaykh of Qazvín; among the disciples of Siyyid Káẓim-i-Rashtí. A trustworthy
firsthand informant whom Nabíl heard recount episodes from the Shaykhí circle awaiting the
Promised One. **side = Bábí/Bahá'í** (Bábí-era disciple; named among Nabíl's recognised
informants — final allegiance Bahá'í).

**FLAGS**: nisba must be carried (Qazvíní) to keep him distinct from Abu-Turáb-i-Ishtahárdí.
Description text grounded in corpus; web detail on his later life is thin (caveat below).

---

## Summary of actions
| Informant | Keeper | Merge in | Mentions (keeper) |
|---|---|---|---|
| Siyyid Ismá‘íl-i-Dhabíḥ | 1060866 | 1220155 | 19 (+3) |
| Shaykh Ḥasan-i-Zunúzí | 1219469 | — | 28 |
| Shaykh Abú-Turáb-i-Qazvíní | 625336 | — | 19 |

Read-only verification only — no DB writes performed.
