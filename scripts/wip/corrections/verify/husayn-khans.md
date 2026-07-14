# Ḥusayn Khán Disambiguation

Ledger flagged a "3-Ḥusayn-Khán collision" around keeper **1219374**. Cross-corpus
verification (Dawn-Breakers / Shíráz chapters in DB + Balyuzi *The Báb* p.466 footnote
in corpus doc 432 + web). Mention counts from `entity_mentions` are STALE — used only
for triage, not as truth.

Result: the collision resolves to **2 distinct real Ḥusayn-Khán people** that exist as
corpus entities (the Fárs governor + the Constantinople ambassador). The apparent "third"
is false-positive bleed into adjacent entities (Mullá Ḥusayn, Amír-Niẓám), NOT a third
governor needing its own keeper. No distinct *Írávání* or *Ṭabarsí-era officer* Ḥusayn
Khán surfaced as a corpus entity with mentions.

---

## KEEPER 1 — Ḥusayn Khán, governor of Fárs (the principal one)

- **VERDICT:** KEEP `1219374` "Ḥusayn Khán" as the canonical keeper for the Fárs
  governor. No merges performed (read-only; this records the intended keeper).
- **ROLE / ERA:** Governor of Fárs (Shíráz), c. 1844–1848, under Muḥammad Sháh Qájár.
  The first to persecute the Báb: interrogated/scourged Quddús and Mullá Ṣádiq, burned
  their beards, ordered the Báb's arrest after the Shíráz "call to prayer" episode,
  held the Báb under house arrest in his own home, was dismissed by imperial edict when
  plague struck Shíráz, released the Báb on condition He quit the city.
- **TITLES:** styled the **Niẓámu'd-Dawlih** (Dawn-Breakers) / **Áṣafu'd-Dawlih**; the
  historical person is **Ḥusayn Khán Ajúdán-Báshí** (Hossein Khan Ajudanbashi), Governor
  of Fárs 1844–1848. (Note: Dawn-Breakers most often names him simply "Ḥusayn Ḵhán,
  the governor of Fárs/Shíráz.")
- **side:** other (a Qájár official / persecutor, not a believer).
- **CONFIDENCE:** HIGH for identity as the Fárs governor / Báb's first persecutor. MEDIUM
  on the exact title cluster (Niẓámu'd-Dawlih vs Áṣafu'd-Dawlih vs Ajúdán-Báshí) — sources
  vary; keep all three as aliases rather than asserting one.
- **EVIDENCE (doc|para):** 21308|442,443,448,508,510,562,564,576,1598 ;
  21310|39,40,45,181 ; 22221|h57 ; 40108|h577 ("released the Báb on condition of his
  quitting the city").

### FIREWALLS (keeper 1219374)
- ≠ **Mullá Ḥusayn** (1219326) — first Letter of the Living, Báb's first believer,
  hero of Ṭabarsí. Opposite valence (devotee, side=Bábí). DO NOT MERGE.
- ≠ **Siyyid Ḥusayn-i-Yazdí** amanuensis (1219427 "Siyyid Ḥusayn") — the Báb's
  secretary. DO NOT MERGE.
- ≠ **Imám Ḥusayn** (1219357) — third Shíʿih Imám. DO NOT MERGE.
- ≠ **Ḥusayn-ʿAlí** = **Bahá'u'lláh**. DO NOT MERGE.
- ≠ **Mírzá Ḥusayn Khán, Mushíru'd-Dawlih** (1220222) — see Keeper 2 below (later,
  different man, Constantinople).
- ≠ **Amír-Niẓám** (1219327) = Mírzá Taqí Khán Amír Kabír, prime minister — different
  person despite shared "Niẓám" element; the title-collision is the trap here.

### FLAGS — ambiguous / false-positive mentions on 1219374
- **21310|para_68** ("...revealed in the presence of Mullá Ḥusayn, on the night of...")
  is a FALSE POSITIVE — that is **Mullá Ḥusayn** (1219326), not the governor. Should be
  re-attributed.
- **21310|para_73, 97** (Tablet to Muḥammad Sháh / Máh-Kú & Chihríq context) — context
  mentions, governor not the subject; low-value, likely co-occurrence noise.
- TOC/index rows in doc 16275 and 22221 (link-list anchors) are structural, not prose
  mentions — harmless but inflate the count.

---

## KEEPER 2 — Mírzá Ḥusayn Khán, the Mushíru'd-Dawlih (Persian Ambassador)

- **VERDICT:** KEEP `1220222` "Mírzá Ḥusayn Khán" as a SEPARATE keeper. Do NOT fold
  into 1219374.
- **ROLE / ERA:** Persian Ambassador to the Sublime Porte (Constantinople), 1860s;
  titled the **Mushíru'd-Dawlih**. Chief instigator of Bahá'u'lláh's banishment from
  Constantinople to Adrianople and onward to ʿAkká; worked with ʿAlí Páshá and Fu'ád
  Páshá. Distinct generation, locale, and target from the Fárs governor.
- **side:** other.
- **CONFIDENCE:** HIGH. Corpus is explicit: doc 432 footnote "'Mírzá' Ḥusayn Khán,
  Mushíru'd-Dawlih, Persian ambassador to Constantinople" (Balyuzi); also 21310|322,
  354, 403 and docs 426/430 (Constantinople/banishment chapters).
- **EVIDENCE (doc|para):** 21310|320,322,354,403 ; 426 (multiple) ; 430 (multiple) ;
  432 footnote 68.

### FIREWALLS (keeper 1220222)
- ≠ **Ḥusayn Khán governor of Fárs** (1219374) — earlier (1840s Shíráz) vs later
  (1860s Constantinople); persecutor of the Báb vs persecutor of Bahá'u'lláh.
- ≠ Mullá Ḥusayn / amanuensis / Imám Ḥusayn / Bahá'u'lláh — same firewalls as above.

---

## The "third" Ḥusayn Khán — NOT a separate keeper

The ledger's third slot does not correspond to a distinct corpus entity. Candidates
investigated and dismissed:
- **Ḥusayn Khán-i-Írávání** — no corpus entity with mentions found (searched name +
  "Íráván"/"Iravan"); not present as a person row with `entity_mentions`. FLAG: if a
  source naming an Írávání officer is later ingested, create a new keeper — do NOT
  attach to 1219374.
- **Ḥusayn Khán the Ṭabarsí-era officer** — no distinct entity; "Ṭabarsí + Ḥusayn"
  matches in corpus point to **Mullá Ḥusayn** (the fort's defender), already firewalled
  as 1219326. The collision was a name-coincidence, not a third governor.
- The triage also surfaced **Amír-Niẓám** (1219327, =Amír Kabír) and **Vazír-Niẓám**
  (1220142) via the "Niẓám" title search — these are title-neighbors, NOT Ḥusayn Kháns;
  listed only to document why the ledger over-counted.

---

## Summary table

| Keeper | Canonical | Person | Era / locale | side | Conf |
|---|---|---|---|---|---|
| 1219374 | Ḥusayn Khán | Governor of Fárs (Niẓámu'd-Dawlih / Áṣafu'd-Dawlih / Ajúdán-Báshí); Báb's first persecutor | 1844–48, Shíráz | other | HIGH (id) / MED (title) |
| 1220222 | Mírzá Ḥusayn Khán | Mushíru'd-Dawlih, Persian Ambassador; instigated Bahá'u'lláh's banishment | 1860s, Constantinople | other | HIGH |

**Top caveat:** title cluster for keeper 1 is unsettled across sources
(Niẓámu'd-Dawlih / Áṣafu'd-Dawlih / Ajúdán-Báshí) — keep all as aliases, don't assert one.
Also re-attribute false-positive 21310|para_68 from 1219374 to Mullá Ḥusayn (1219326).
