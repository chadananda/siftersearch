# World Rulers Bahá'u'lláh Addressed — Entity Verification

Source: GPB (doc 21310), Súriy-i-Haykal (5 kings: Pius IX, Napoleon III, Alexander II, Victoria, Náṣiri'd-Dín Sháh) + Súriy-i-Mulúk (Sulṭán ‘Abdu'l-‘Azíz individually). Mention counts from `g.entity_mentions` (column STALE — counts are raw, not authoritative). READ-ONLY pass: no DB writes performed; verdicts below are the proposed consolidation for manual application.

---

## 1. Napoleon III (Emperor of France)

**VERDICT:** KEEPER **622821** "Napoleon III" (person, 16) ← merge **1233867** "Napoleon III" (4, exact-name duplicate fragment).
**CONFIDENCE:** High.
**TYPE / RELIGION / ERA:** person / Catholic (nominal) / 19th-c. (r. 1852–1870, French Second Empire).
**FIREWALL (critical):**
- **616469 "Napoleon" (9) = Napoleon I / Bonaparte — KEEP SEPARATE.** Context is the "siege of Napoleon" at St. Jean d'Acre (1799 campaign) — that is Napoleon I, not Napoleon III. Do NOT merge into 622821.
- **1220772 "Conqueror of Napoleon III" (1) = William I of Prussia/Germany — KEEP SEPARATE.** Text: "William I, the pride-intoxicated newly-acclaimed conqueror of Napoleon III." This is the victor of the Franco-Prussian War, a different person; it is a relational epithet, not Napoleon III himself.
- **1220800 "Napoleonic" (1, organization) = the Napoleonic empire** (in a list of dissolving empires) — not a person; leave as-is, do not merge.
**DESCRIBE:** Napoleon III (Louis-Napoléon Bonaparte), Emperor of the French 1852–1870; received two Tablets from Bahá'u'lláh; the second rebuked him after his dismissive response ("If this is from God…"); his fall in the Franco-Prussian War (1870) is cited in GPB/PDC as fulfilment.
**FLAGS:** Related WORK entities (not to be merged into the person): 1220366 "First Tablet to Napoleon III" (work). Watch that future extraction does not re-collapse Napoleon I into III via the bare surname "Napoleon".

## 2. Queen Victoria

**VERDICT:** KEEPER **622823** "Queen Victoria" (person, 13). No same-referent person fragments to merge.
**CONFIDENCE:** High.
**TYPE / RELIGION / ERA:** person / Anglican (Church of England) / 19th-c. (r. 1837–1901, British Empire).
**FIREWALL:**
- **621269 "Victoria" (5) = PLACE (Australia / state of Victoria)** — context is Thelma travelling Bahá'í communities in Australia. KEEP SEPARATE (already typed `place`).
- **1222551 "sister-queens" (person)** and **1221720 "Grand-daughter of Queen Victoria" (person)** are relational/derived references (granddaughter = likely Marie of Romania, who was Victoria's granddaughter AND Czar Alexander II's granddaughter). Do NOT merge into the Queen; they denote other people.
- Related WORKs (keep separate): 1220577 "Tablet to Queen Victoria", 1220600 "Epistle to Queen Victoria".
**DESCRIBE:** Queen Victoria of the United Kingdom (r. 1837–1901); addressed by Bahá'u'lláh in the Lawḥ-i-Malikih (Súriy-i-Haykal); commended for abolishing the slave trade and for entrusting government to the people's representatives; invited to hold fast to the "Lesser Peace."
**FLAGS:** "Grand-daughter of Queen Victoria" worth its own entity resolution (Marie of Romania) in a later pass.

## 3. Czar Alexander II (Emperor of Russia)

**VERDICT:** KEEPER **623817** "Alexander II" (person, 1) as canonical name, BUT the highest-count co-referent is **1060841** "Nicolaevitch Alexander II" (3) and **1220779** "Czar" (13). Recommend consolidating the same-referent cluster under one keeper — preferred canonical id **1222551**?  NO. Use **623817 "Alexander II"** or rename. Merge set (all = Czar Alexander II of Russia):
- 623817 "Alexander II" (1) — "O Czar of Russia!"
- 1060841 "Nicolaevitch Alexander II" (3) — "the all-powerful Czar of Russia"
- 1220779 "Czar" (13) — the bare-title anaphora; every sampled context = Alexander II ("To the Sháh… / Nicolaevitch Alexander II, the all-powerful Czar of Russia")
- 1222551? NO — that is "sister-queens", do not include.
**Suggested keeper:** **1060841** (highest specific-name count, 3) renamed/canonicalized to "Czar Alexander II of Russia"; OR keep 623817 as canonical and absorb the others. Either works; pick the one already linked in the dictionary. Net merged person-mentions ≈ 17.
**CONFIDENCE:** High on identity; Medium on which id to elect keeper (curator's call).
**TYPE / RELIGION / ERA:** person / Russian Orthodox / 19th-c. (r. 1855–1881).
**FIREWALL (bare-title + namesakes):**
- **1220779 "Czar" is bare-title anaphora — bound to Alexander II** (all sampled contexts resolve to him; no rival Czar in corpus). Safe to merge.
- **623844 "Alexander III" (2) = KEEP SEPARATE** (Alexander II's successor son, r. 1881–1894).
- **616465 "Alexander the Great" (1), 618626 "Alexander" (Christopher Alexander, architect/design), 619214 "Agnes Alexander", 625926 "Alexander Graham Bell", 1221397 "Alexander Giesswein", 1225002 "Christopher Alexander"** — all KEEP SEPARATE (surname/given-name collisions, not the Czar).
- **1222551 "Alexander II of Russia" (1)** — duplicate of the Czar; MERGE into the keeper as well (note: id 1222551 returned BOTH as "sister-queens" and "Alexander II of Russia" across two query reads — verify the row before merging; the name "Alexander II of Russia" is the Czar).
**DESCRIBE:** Tsar Alexander II Nikolaevich, Emperor of Russia (r. 1855–1881); Bahá'u'lláh addressed him the Lawḥ-i-Malik-i-Rús while imprisoned in the ‘Akká barracks, thrice warning him and acknowledging the Russian minister's earlier intervention on His behalf in Ṭihrán; assassinated 1881.
**FLAGS:** Re-pull id **1222551** before any merge — it gave conflicting names ("sister-queens" vs "Alexander II of Russia") in two reads, so the row needs a fresh single-row SELECT to confirm true name. Related WORK: 1220009 "Epistle addressed to the Czar of Russia".

## 4. Pope Pius IX

**VERDICT:** KEEPER **1220589** "Pope Pius IX" (person, 4) ← merge **622822** "Pius IX" (1) and **1223331** "Sovereign Pontiff" (1, "Well might the Sovereign Pontiff recall…").
**CONFIDENCE:** High.
**TYPE / RELIGION / ERA:** person / Roman Catholic (Pope) / 19th-c. (r. 1846–1878).
**FIREWALL (critical — anaphora trap):**
- **1221688 "Pope" (9) and 634464 "Pope" (1) = Pope John Paul II — KEEP SEPARATE.** Context is the 1986 Assisi interfaith gathering: "The representatives of the religions were introduced to the Pope as he entered the Auditorium to a standing ovation" + press dossier. Modern Bahá'í-history narrative, NOT Pius IX. Do NOT bind these bare "Pope" titles to Pius IX.
- **1226401 "Pope John Paul II" (6)** is the correct keeper for those modern mentions — KEEP SEPARATE from Pius IX (out of scope for this task, but flag the firewall).
- **1220801 "Roman Pontiff" (concept), 1220807, 1221689, 1220792 (concepts re temporal sovereignty)** — these are concept-typed; "temporal sovereignty of the Roman Pontiff" refers to Pius IX's loss of the Papal States (1870) but they are concepts, not the person. Leave as concepts.
**DESCRIBE:** Pope Pius IX (Giovanni Maria Mastai-Ferretti), longest-reigning pope (1846–1878); addressed by Bahá'u'lláh in the Lawḥ-i-Páp (Súriy-i-Haykal), bidden to "leave thy palaces unto such as desire them" and to arise to proclaim the Cause; his loss of temporal sovereignty over the Papal States (1870) cited in PDC.
**FLAGS:** Bare-title "Pope" is the single biggest anaphora hazard here — it splits across two different popes a century apart. Keep the Pius IX cluster strictly to named "Pius IX / Pope Pius IX / Sovereign Pontiff" references.

## 5. Sulṭán ‘Abdu'l-‘Azíz (Ottoman)

**VERDICT:** KEEPER **1219414** "Sulṭán 'Abdu'l-'Azíz" (person, 13) ← merge **1240243** "Sulṭān ’Abdu’l-‘Azíz" (1, "Addressing Sulṭán ’Abdu’l-‘Azíz… in the Suriy-i-Muluk"). Bind bare-title anaphora **"the Sulṭán of Turkey" / "the Sulṭán" within the ‘Akká-banishment narrative** to this keeper (the farmán, the Grand Vizir ‘Alí Páshá, the exile to ‘Akká all resolve to him).
**CONFIDENCE:** High on identity; the bare-title binding is contextual (Medium where context is thin).
**TYPE / RELIGION / ERA:** person / Sunni Muslim (Ottoman Caliph-Sultan) / 19th-c. (r. 1861–1876).
**FIREWALL (critical — heavy namesake field on "Sulṭán" / "‘Azíz"):**
- **1142618 "Sulṭán" (55) = Shaykh Sulṭán (the Kurd) / mixed bare-title — KEEP SEPARATE.** Despite the huge count, sampled contexts are "Shaykh Sulṭán has related…" (a companion in Kurdistán), NOT the Ottoman Sultan. This is a conflated/over-broad fragment; do NOT merge into ‘Abdu'l-‘Azíz. (It likely itself needs splitting in a later pass.)
- **1227914 "‘Azíz" (41) = ‘Azíz Khán-i-Mukrí (Sardár-i-Kull) — KEEP SEPARATE.** Contexts = the military commander at Zanján, a Bábí-era persecutor; NOT the Sultan. Same for 615928/615929 "Aziz Khan(-i-Mukri)", 1219799 "'Azíz Khán-i-Sardár".
- Other ‘Azíz/Sulṭán namesakes — all KEEP SEPARATE: 631723 "Shaykh Sulṭán", 1220310/1220311 "Sulṭán Salím" (+ mosque places), 1219486 "Sulṭán 'Abdu'l-Majíd" (his predecessor brother), 1220716 "Sulṭán 'Abdu'l-Ḥamíd" (later sultan), 1220510 "Ẓillu's-Sulṭán", 1154735 "Sháh Sulṭán Khánum", 1220152 "Sulṭánu'sh-Shuhadá", 1219391 "Sulṭánu'l-'Ulamá", 620232 "Sulṭán Muḥammad", 1521… "Sulṭán-Ábád" (place), 1220345/1060884 "'Azíz Páshá", 957978/639258/1242257/643048/1240178 (other Azíz persons), 623817-cluster (the Czar, separate task above).
- **1233753 "Sulṭán of Turkey" (concept) / 1233867? NO** — "Sulṭán of Turkey" concept may be bound descriptively to ‘Abdu'l-‘Azíz but is concept-typed; leave as concept.
**DESCRIBE:** Sulṭán ‘Abdu'l-‘Azíz, Ottoman Emperor (r. 1861–1876); the only monarch Bahá'u'lláh reproved individually at length (Súriy-i-Mulúk), faulting him for entrusting affairs to untrustworthy ministers; his government issued the farmán banishing Bahá'u'lláh to the penal colony of ‘Akká (1868); deposed and died 1876.
**FLAGS:** The bare "Sulṭán" (1142618, count 55) is a polluted catch-all dominated by Shaykh Sulṭán — its high count must NOT lure a merge. Re-pull and consider splitting it independently. Bind only the ‘Akká/farmán/Grand-Vizir anaphoric "the Sultan" to the keeper; flag any ambiguous bare "the Sultan" outside that narrative.

---

## Náṣiri'd-Dín Sháh — FIREWALL ONLY (do not redo)
Existing keeper **1227689**. Out of scope. Ensure no ruler-fragment above is mis-bound to him; none of the sampled fragments referenced the Persian Sháh except by the contrasting phrase "To the Sháh of Persia We sent Our messenger" (which belongs to his keeper, not to any of the five above).

## Anaphora summary (bare titles)
- "the Czar" (1220779) → Alexander II — bind (no rival).
- "the Pope" (1221688/634464) → **John Paul II**, NOT Pius IX — DO NOT bind to Pius IX.
- "the Sulṭán / Sulṭán of Turkey" → ‘Abdu'l-‘Azíz **only within the ‘Akká-banishment narrative**; bare "Sulṭán" (1142618) is Shaykh Sulṭán — do not bind.
- "Napoleon" (616469) → Napoleon I, NOT III — do not bind.
