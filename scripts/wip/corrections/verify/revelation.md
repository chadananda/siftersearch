# Entity Verification — 1219277 "Revelation"

**Current record:** id=1219277, name/canonical="Revelation", entity_type=**work** (mistyped — it is currently typed as a single WORK but behaves as a polluted CONCEPT bucket), mention_count field says 1 but graph.db holds **777 resolved mentions**.

**Flag confirmed:** This is an over-merged bucket conflating a religious/theological CONCEPT (divine revelation), several *distinct* dispensational referents, a biblical book, and at least two multi-volume book TITLES. The 80+ aliases range from `the Bahá'í Revelation` (0.7) to `the Revelation of St. John the Divine` (1.0) to `Revelation 13:18` (1.0) to `The Revelation of Bahá'u'lláh, vol. I` (0.7) — i.e. they are not coreferent.

---

## VERDICT: SPLIT into senses + RETYPE book-titles to WORK. NEEDS-USER (concept-modeling policy).

This is concept-modeling, the same modeling question raised for "Bayán" (Báb's Bayán the WORK vs. the broader sense). The bucket should not survive as one entity. Recommended decomposition into distinct **concept** entities per dispensation, a separate **work** for the biblical book, and **retype** of book-title mentions to their respective WORK entities.

### Sense breakdown (777 mentions; proportions estimated from doc-context defaults + pattern probes)

| Sense | Est. share | Est. mentions | Where (cids = doc_id) | Evidence |
|---|---|---|---|---|
| **(a) Bahá'í Revelation** (Bahá'u'lláh's) — the CONCEPT | ~55% | ~430 | 26(71, UHJ), 149, 11445, 7165, 4346(63), 429–432 in-text, 524, 15921, most modern docs | Dominant default. `Revelation of Bahá'u'lláh` matched 86 cases by text alone; the unqualified "this Revelation/His Revelation" in modern Bahá'í docs resolve here by context. |
| **(b) Bábí Revelation** (the Báb's) — the CONCEPT | ~32% | ~250 | 21310(GPB,53), 21308(DB,59), 8632(Gate of the Heart,111), 40108, 4359/4360/4366/4367/4369 | GPB/DB/Gate cover the Heroic Age; "the Báb's Revelation", "Revelation of the Báb", "the new-born Revelation announced by the Báb". |
| **(c) Qur'ánic / Islamic Revelation** — the CONCEPT | ~3% | ~20 | 4346 ("Qur'ánic Revelation", "Muḥammad's Revelation", "the Muḥammadan Revelation"), scattered | Distinct prior-dispensation referent; should not merge with (a)/(b). |
| **(d) Biblical "Revelation" / Apocalypse (Book of Revelation, St John the Divine)** — a **WORK** | <2% | ~5–8 | 429 ("in the Revelation of St. John", "four and twenty elders"), aliases `Revelation 13:18`/`13:16–17` (conf 1.0/0.95), `Revelation of St John the Divine` | A specific scriptural book, not the concept. Retype to a WORK entity (or merge into an existing "Book of Revelation" work if one exists). |
| **(e) Book-TITLE mentions → WORK (mistyped concept)** | ~3–5% of mentions, but high-value | ~25–40 | 429–432 = Taherzadeh **The Revelation of Bahá'u'lláh** vols 1–4; 7165 = Saiedi **Logos and Civilization**; 8632 = Saiedi **Gate of the Heart**; alias `Revelation and Social Reality` is also a book title | Title self-references (e.g. cid 429 "This book is an attempt to describe…the Revelation of Bahá'u'lláh"; "An Advanced Study Course In the Revelation of Bahá'u'lláh") must NOT be concept mentions. Aliases `The Revelation of Bahá'u'lláh, vol. I`, `Revelation and Social Reality`, `The Bahá'í World, Volume IX` are pure title pollution and must be stripped/retyped. |

> Note: (a) and (e) collide textually — "the Revelation of Bahá'u'lláh" is BOTH the concept and Taherzadeh's book title. Disambiguation must be per-mention (a title-citation context → WORK; a theological context → concept). Pattern matching alone cannot separate them; AI per-mention adjudication required.

### RETYPE notes
- **Strip from this entity** the title aliases: `The Revelation of Bahá'u'lláh, vol. I`, `Revelation of Bahá'u'lláh` (when title-cited), `Revelation and Social Reality`, `The Bahá'í World, Volume IX`. These belong to WORK entities, not the concept.
- **Biblical aliases** `the Revelation of St John the Divine`, `Revelation of St. John`, `Revelation 13:18`, `Revelation 13:16–17`, `Revelations 13:18` → split to a biblical-WORK entity ("Revelation / Apocalypse of St John").
- Garbage aliases to drop entirely: `Revelation of Baha"ul llih` (OCR), `Revelation,`, `this revealed and manifest Letter[^1]`, `place of revelation`, `realms of revelation and of creation`.
- The mislabeled `His revelation of the Suriy-i-Muluk` (0.9) is an event/act, not this concept.

### Recommended model
1. **Do NOT keep 1219277 as a single entity.** Retype the surviving core from `work` → `concept`.
2. **Split into per-dispensation concept entities:**
   - `Bahá'í Revelation` (concept) — absorbs sense (a), ~430 mentions. Likely the canonical heir of 1219277.
   - `Bábí Revelation` (concept) — sense (b), ~250 mentions.
   - `Qur'ánic Revelation` (concept) — sense (c), ~20 mentions (or link to an existing Islam/Muḥammad dispensation concept).
3. **Biblical book** → WORK entity "Book of Revelation (Apocalypse of St John)", sense (d).
4. **Retype book-title mentions** (sense e) to existing WORK entities: Taherzadeh *The Revelation of Bahá'u'lláh* (docs 429–432 self-titles), Saiedi *Logos and Civilization* (7165) and *Gate of the Heart* (8632), *Revelation and Social Reality*.
5. Optionally retain a generic `divine revelation` concept for purely abstract/theological uses (sense in 8632 "revelation of a transcendent Absolute") — but most resolve cleanly into a/b/c by document.

### ⚠ NEEDS-USER — concept-modeling policy decision
Same open question as **Bayán (D-D)**: does the dictionary want **concept entities at all**, and if so at what granularity?
- **Option A (recommended):** per-dispensation concept entities (Bahá'í / Bábí / Qur'ánic Revelation) + biblical WORK + retyped book-WORKs. Most faithful, most work.
- **Option B:** demote "Revelation" out of the who's-who entirely (it is not a person/place/work-as-title) and keep only the biblical WORK + the book-TITLE WORKs; drop concept senses as non-entities.
- **Option C:** single `Bahá'í Revelation` concept (collapse a+e-concept), discard the rest.

Per-mention split of the a/e collision and the b/c boundary requires AI adjudication, not regex. Flagging for user direction before any write.

---
_Read-only verification. No DB writes performed._
