# MASTER Correction Set — GPB + Dawn-Breakers seed (VERIFIED, READ-ONLY)

> Synthesis of 5 cohort files (this dir): `gpb.md`, `db-nayriz-tabarsi.md`, `db-zanjan-babarc.md`, `works.md`, `db-roster-attribution.md`.
> Produced autonomously 2026-06-16. **NO DB writes performed.** Every op is a proposal awaiting approval + a resolved write-path.
> All entity_ids are REAL live `graph_entities.id`, verified to have mentions in doc 21308 (Dawn-Breakers) / 21310 (GPB) this session.

---

## ★ READ FIRST — 4 cross-cutting findings that reshape the plan

### 1. SCOPE SHIFT: the sidecar is MISSING much of the seed cast → this is partly a CREATE job, not just cleanup
The MD analysis files' "dump NNN" numbers are **legacy sifter.db NER ids, NOT live sidecar entity_ids.** Mapping every finding onto the *current* graph.db sidecar showed a large share of the seed cast was **never extracted into the canonical layer at all**:
- **~60 Nayríz/Ṭabarsí figures** absent (incl. the betrayer, ‘Abbás-Qulí Khán-i-Láríjání, Sa‘ídu'l-‘Ulamá', most martyrs).
- **3 of the Seven Martyrs of Ṭihrán** (Qumí, Turshízí, Kirmání) absent.
- Majdu'd-Dawlih, Khadíjih Bagum, the Zunúzí person-variants — 0 mentions in 21308.
So the real op mix is **MERGE/RETYPE/DROP on what exists + a big CREATE set for what's missing.** → **Strategic decision needed (D-A below).**

### 2. TWO primary-text REVERSALS of the error catalogue (verification working as intended)
- **Siyyid Káẓim-i-Zanjání is NOT an NER artifact.** Nabíl names him verbatim — para_568: *"a certain Siyyid Káẓim-i-Zanjání, who was later martyred in Mázindarán, and whose brother, Siyyid Murtaḍá, was one of the Seven Martyrs."* **Do NOT drop** (my catalogue said drop). → D-B.
- **"Amír Arslán Khán, son of the Sálár" is verbatim Nabíl** (para_712) — the Khurásán rebel (live id **1060805**), a DISTINCT man from the Zanján governor Majdu'd-Dawlih. **Firewall, do NOT merge** (my catalogue said merge + discard the gloss). → D-B.

### 3. The two test questions are answered (and show exactly what's needed)
- **Ṭabarsí betrayer (Q2): Mírzá Ḥusayn-i-Mutavallíy-i-Qumí ("Siyyid-i-Qumí")** — ONE man across fort betrayal (para_1075) → desertion to the prince's camp (para_1107) → Bárfurúsh, smiting the dying Quddús (para_1140). side=opponent. **Not a live entity → CREATE + bind all 3 mentions.**
- **‘Abdu'l-Khaliq (Q1)** — see §Test-Q1 below: split the blurry `Abd al-Khaliq` (641532) into Iṣfahání (Badasht, forsook Faith) ≠ Yazdí (Shaykhí scholar) ≠ son-of-‘Abdu'l-Qani. Both answers require the SAME work: clean entities + bound mentions.

### 4. Pervasive defects confirmed across ALL cohorts
- **Every keeper entity has an EMPTY description** (raw NER) → DESCRIBE is universal.
- **Image alt-text pseudo-persons** (`613854` "Báb", `613760` "Quddús") → DROP, not merge.
- **Titles/collectives/pronouns typed as person** everywhere → RETYPE/DROP (Mujtahid×2, Imám-Jum‘ih, ‘ulamás(52!), the Prophet(20), Himself, His Name…).
- **Per-section author misattribution** is real and measured (see §Attribution).
- **Bad aliases** (e.g. `Mullá Ḥusayn-i-Zanjání` on Bushrú'í) → ALIAS-REMOVE.

---

## Aggregate operation counts (≈370 ops across 5 cohorts; detail in the cohort files)
| TYPE | ≈count | notes |
|---|---|---|
| MERGE (fragment-collapse) | ~60 | Báb, Bahá'u'lláh, 'Abdu'l-Bahá, Náṣiri'd-Dín Sháh, Ṭáhirih, Vaḥíd, Quddús, Ḥujjat, Nabíl(7-id), + 23 works |
| CREATE (missing cast) | ~67+ | Nayríz/Ṭabarsí casts, 3 Seven-Martyrs, the betrayer, Báb's Will, Siyyid Káẓim-i-Zanjání |
| RETYPE (title/concept) | ~33 | bare titles→title; Anís work→person; "Point of the Bayán" work→title-of-the-Báb |
| DROP (collective/pronoun/image) | ~58 | plurals, pronoun artifacts, image alt-text |
| FIREWALL (assert distinct) | ~45 | the 3 Báqirs, 8 Mihdís, 3 Branches, 2 Nabíls, Dalá'il≠Khaṣá'il, commentary≠súrih… |
| LINK-DOC (work→doc) | ~45 | all confirmed author-match; all 10 flag-K; all curiosities |
| DESCRIBE | ~25+ | every keeper (all currently blank) |
| RELATE | ~25 | kin/informant/recipient/part-of edges |
| ALIAS-REMOVE | 5 | bad nisbas/wrong-person aliases |
| ATTRIBUTE (section/side/quote) | ~10 | 6 section→author + side flips + quote-speaker |
| SPLIT (conflation) | 5 | Mullá Báqir, Mullá Mihdí(≥5), the Sháh, Bayán(5-way), 641532 ‘Abdu'l-Khaliq |
| NEEDS-USER (flagged) | ~30 | consolidated agenda below |

---

## Test-Q1 worked correction — ‘Abdu'l-Khaliq (fold into the CREATE/split set)
- **SPLIT** `641532` "Abd al-Khaliq" (no description, conflates ≥3 men) →
  - **‘Abdu'l-Khaliq-i-Iṣfahání** — Badasht (1848); at Ṭáhirih's unveiling cut his own throat and fled, then **forsook the Faith**. EVIDENCE para_550 (cid 21054311). side: Bábí→apostate.
  - **Mullá ‘Abdu'l-Khaliq-i-Yazdí** — Shaykhí scholar, "authority and learning", tablet recipient (doc 5840). EVIDENCE para_102/107 (cid 21053863/21053868). FIREWALL ≠ Iṣfahání.
  - **‘Abdu'l-Khaliq son of Mullá ‘Abdu'l-Qani** — later figure (*Fire on the Mountain-top*, doc 11178). FIREWALL.
- NEEDS-USER: the three are likely all CREATE (verify which, if any, the 641532 mentions actually back).

---

## DECISIONS NEEDED FROM YOU (consolidated agenda — start here on return)

**D-A · Scope of CREATE (biggest call).** The sidecar never extracted ~60+ seed-cast figures. Do we: (a) create them now from the verified MD records as part of this pass; (b) re-run extract-v2 on the seed books first to capture them, then clean; or (c) clean what exists now and defer creation? This sets the size of everything.

**D-B · The two reversals** (grounded in verbatim Nabíl):
- ✅ **RESOLVED (user, 2026-06-16): Siyyid Káẓim-i-Zanjání = real, CREATE.** A companion of the Báb; **FIREWALL ≠ Siyyid Káẓim-i-Rashtí** (619152/1055345, the late leader of the Shaykhí School). Verified record: **accompanied the Báb on the journey from Shíráz to Iṣfahán** (summer 1262 A.H./1846), the episode of the Báb's letter to **Manúchihr Khán, the Mu‘tamidu'd-Dawlih** (cid 21054165); also in the Báb's company (with His maternal uncle) at the Shíráz arrest (¶568, cid 21054157; Seven Proofs docs 11432/15139); **brother of Siyyid Murtaḍá-y-i-Zanjání** (619820, a Seven Martyr → RELATE brother); later **martyred in Mázindarán**. side: Bábí. (Text says he *accompanied* the Báb; the "sent ahead to carry the letter" nuance not stated. Isfahán locus CONFIRMED — earlier missed only because Meili ranked the arrest passage higher.) → CREATE op (pending write-path).
- ✅ **CONFIRMED (user + text, 2026-06-16): two distinct ‘Abbás-Qulí Kháns.** `‘Abbás-Qulí Khán-i-Láríjání` (Ṭabarsí; led the renewed assault, killed Mullá Ḥusayn — the tree-shooting; betrayer wrote to him, cid 21054481) **≠** `‘Abbás-Qulí Khán` (Nayríz; on whose "suggestion" Vaḥíd was dragged by his turban to his death, cid 21054677). FIREWALL by nisba (Láríjání = Mázandarán) + battle + act. = the cohort's F-LARIJANI, now user-confirmed. Both opponents; both likely CREATE (neither a clean live entity).
- ⏳ **PENDING: Amír Arslán Khán** (1060805) — un-merge / **firewall** from Majdu'd-Dawlih (he's the Khurásán rebel "son of the Sálár", para_712). Confirm.

**D-C · Nabíl keeper-merge** (high blast radius): merge 7 author-fragments → one keeper (proposed **620216**), EXCLUDING Nabíl-i-Akbar 1220146. Confirm keeper id + fragment set before this runs (it rewrites narrator across the whole body).

**D-D · "Bayán" modeling ruling:** how the dictionary represents the work-vs-concept split (Persian Bayán / Arabic Bayán = works; Revelation-of-the-Báb + people-of-the-Bayán = concepts; generic = drop), and routing 1219353's 25 mentions.

**D-E · Sang-Sar survivor contradiction:** both DB passages (para 21054519/21054542) **martyr Siyyid Aḥmad** and have **Abú-Ṭálib survive** — the reverse of the roster you supplied earlier. Which stands?

**D-F · Per-cohort ambiguous (lower stakes):** GPB "the Sháh" anaphora split (Muḥammad vs Náṣiri'd-Dín); "Siyyid Muḥammad" (619821) collision; 3 Ḥusayn Kháns; 'Alí-Aṣghar (Grand Vizir vs Shaykhu'l-Islám); Azalí man-vs-sect; Mírzá Na‘ím (cohort resolved ONE man — confirm); Báb's Will & Testament create; Khaṣá'il Phelps code + adhán claim.

**D-G · Write-path — investigated; concrete recommendation to approve (not an open design question anymore).** Read-only trace of `db.js` / `write-server.js` / `graph-db.js` / the graph workers shows:
- **sifter.db writes** (`graph_entities`, `graph_relations`) route through the single-writer **:7849** (`applyWriteBatch`, one atomic txn; `isWriteSql` gate).
- **graph.db writes** (`entity_mentions`, `entity_aliases`, `paragraph_roles`) are **DIRECT, not routed** — the live graph workers write them via `graphQuery` wrapped in **`graphQueryWithRetry` (5× SQLITE_BUSY retry; WAL + 30s busy_timeout)**.
- **`graph-db.js`'s `mergeEntities`/`splitEntity`/`addAlias` already split correctly**: `mainQuery` (→ single-writer when `SIFTER_WRITER_URL` set) for entities/relations, `graphQuery` (→ direct graph.db) for mentions/aliases.

**Recommended mechanism:** a gated admin endpoint (`INTERNAL_API_KEY`) — or a script **you** run on tower-nas (I won't run on prod, per no-server-dev) — that reads the approved correction set and calls the existing `mergeEntities`/`splitEntity`/`addAlias` (+ direct `paragraph_roles` narrator/speaker updates) with `SIFTER_WRITER_URL` set, using the workers' busy-retry pattern for graph.db. Reuses tested code; honors the single-writer rule; coexists with the running workers.

**Two sub-decisions:** (1) **pause the 4 graph workers** during the apply batch (cleaner, halts extraction briefly) vs rely on busy-retry while they run; (2) `mergeEntities` **DELETEs** the merged `graph_entities` rows — hard-delete OK, or do you want **soft-delete + audit retention** (mirroring the content soft-delete chokepoint), given how destructive a wrong merge would be across 3M relations?

---

## Cohort files (full op detail)
- `gpb.md` — GPB (21310): ~22 merges, title/collective/pronoun cleanup, 15 firewalls, rulers/works/events.
- `db-nayriz-tabarsi.md` — Nayríz + Ṭabarsí: the betrayer (M4), Mullá Báqir/Mihdí splits, ~60 CREATE, Sang-Sar.
- `db-zanjan-babarc.md` — Zanján + Báb-arc + hard cases: the 2 reversals (FLAG 1/2), Sulaymán-Khán split, Seven Martyrs, Anís.
- `works.md` — Báb + Bahá'u'lláh works: 23 merges, Bayán 5-way split, Ṣád-of-Ṣamad→Quddús strip, ~45 doc-links, curiosities kept.
- `db-roster-attribution.md` — live-roster cleanup + section→author attribution (Townshend/Nabíl/Shoghi Effendi) + informant relations.

## Status
Consolidation + verification COMPLETE. Blocked on the decisions above (esp. D-G write-path) before any write. No writes made; no prod processes touched.
