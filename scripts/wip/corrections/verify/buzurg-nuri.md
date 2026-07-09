# Verify: Mírzá Buzurg-i-Núrí (father) vs Mírzá Áqá Khán-i-Núrí (PM) — both "Núrí"

## VERDICT

### Figure A — Mírzá Buzurg (Bahá'u'lláh's father), keeper = **619601**
Merge into 619601:
- **1219778** Mírzá Buzurg-i-Núrí (2 mentions) — exact canonical full-name form of the father; mentions are mis-attached (Mullá Ḥusayn / Archives paras) but the NAME unambiguously denotes the father. Merge name+content under keeper; mis-attached mentions are stale and harmless.
- **638386** Buzurg (1 mention) — Dawn-Breakers ch.5 TOC fragment ("…Buzurg / His visit to Núr") referring to the father.

Father identity locked by corpus (GPB/DB): "His father, Mírzá 'Abbás-i-Núrí, known as Mírzá Buzurg, held a very important ministerial position in the court of the Sháh" (5097971); "PAINTING OF MÍRZÁ BUZURG (FATHER OF BAHÁ'U'LLÁH)" (21053870); "INSCRIPTION PLACED BY THE VAZÍR, MÍRZÁ BUZURG, ABOVE ENTRANCE DOOR OF HIS HOUSE IN TÁKUR" (21054009). Canonical name = Mírzá Buzurg-i-Núrí (b. Mírzá 'Abbás), vizier/calligrapher of Núr, d. ~1839.

### Figure B — Mírzá Áqá Khán-i-Núrí (the Grand Vizier), keeper = **1219740**
No fragments require merging — the keeper already holds the full cluster (31 mentions). Identity locked: "Náṣiri'd-Dín Sháh ordered his prime minister, Mírzá Áqá Khán, to send troops to the province of Núr… The prime minister — who also came from Núr" (5098327, 6955238); "He was succeeded by Mírzá Áqá Khán-i-Núrí" [after Amír-Nizám] (21054878); "the ministers of the state, headed by Mírzá Áqá Khán-i-Núrí, the I'timádu'd-Dawlih, the successor [of the Amír-Nizám]" (21055573). In office during the Síyáh-Chál (1852). Web (Wikipedia/Encyclopaedia Iranica): E'temād-od-Dowleh Áqá Khán Núrí, PM of Qajar Iran 1851–1858, succeeded Amír Kabír (Amír-Nizám) under Náṣiri'd-Dín Sháh. CONFIRMED.

## CONFIDENCE
- 619601 (father): **HIGH** — explicit corpus captions naming him father/vazír of Núr.
- 1219740 (PM): **HIGH** — explicit corpus + web concordance (succeeded Amír-Nizám, I'timádu'd-Dawlih, from Núr).
- Merge of 1219778/638386 into father: **MEDIUM-HIGH** — names match the father exactly; 1219778's two mentions are topically off (likely stale extractor mis-link) but the entity name is the father's.

## FIREWALLS (held — do NOT merge)
1. **Father ≠ PM.** Mírzá Buzurg-i-Núrí (the FATHER, vizier under Fatḥ-'Alí/Muḥammad Sháh, d. ~1839) is a different man from Mírzá Áqá Khán-i-Núrí (the PM, in office 1851–1858). Both from Núr — name-coincidence + shared province, NOT the same person. Corpus even contrasts them: Ḥájí Mírzá Áqásí "completely alienated from Bahá'u'lláh's father" yet favoured the son (21054025).
2. **Mírzá Buzurg ≠ Áqá Buzurg = Badí'.** Entity **1220521** "Áqá Buzurg of Khurásán" is explicitly Badí' ("the illustrious 'Badí'' … 'Pride of Martyrs' … bearer of the Tablet to Náṣiri'd-Dín Sháh"), keeper **1219596**. Firewalled — belongs to Badí', not the father.
3. **PM ≠ Mírzá Áqá Khán-i-Kirmání.** The Azalí writer Mírzá Áqá Khán-i-Kirmání exists as separate entities (**1055792**, **1077786**). Untouched, firewalled.
4. **Neither keeper ≠ Mírzá Buzurg Khán (the Baghdad Consul-General).** Entity **1055795** "Mírzá Buzurg Khán" (12 mentions) is a THIRD distinct man: the Persian Consul-General in Baghdad (~1276 A.H./1860), Bahá'u'lláh's "implacable enemy" allied with Shaykh 'Abdu'l-Ḥusayn (6011818, 6955778, 21055917). NOT the father, NOT the PM. Left standalone.

## FLAGS
- **DO NOT bulk-merge 618623 "Aqa Khan"** (2 mentions) — it conflates ≥2 men: mention 6436494 = "Áqá Khán-i-Qá'im-Maqámí, grandson of Qá'im-Maqám, eminent Bahá'í" (a DIFFERENT person, firewall); mention 21656461 (Balyuzi French footnote, "sigh of relief… torture the Bábís") fits the PM era. This entity is dirty — needs per-mention re-adjudication, not a clean merge. Excluded from both keepers.
- **1055795 "Mírzá Buzurg Khán" (Baghdad Consul-General)** has no keeper yet; flag for its own dictionary entry. Easy to confuse with the father by name — explicit firewall note recommended.
- All mention counts are STALE (graph.db entity_mentions not pruned on delete); used only as fragment-discovery signal, not authority.
- 1219778's two mentions are topically mismatched to the father — flag for mention-level cleanup post-merge.
