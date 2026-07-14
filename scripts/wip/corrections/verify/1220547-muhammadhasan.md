# Muḥammad-Ḥasan (entity_id 1220547)
VERDICT: SPLIT(6-way) — confidence H — NEEDS-VERIFY? Y (one incidental Qajar-court mention)

Entity 1220547 is an alias-pollution over-merge. Its `graph_entities.mention_count` reads 1, but
~17 mentions are bound to the id and its 7 aliases name at least SIX genuinely distinct men of three
religions/roles (two Bábís, three Muslim divines/figures, one servant) across four corpora. Every
distinctive alias (`Najafí`, `Sabzivárí`, `Fatá'l-Qazvíní`, `the notorious mujtahid of Yazd`) maps
ONLY to 1220547 — no other entity claims them — confirming this id is a dumping ground, not a person.
SPLIT burden is met: distinct nisba/lineage, distinct role, distinct dates, distinct fate, NO linking
clause joins any pair. (Several are explicitly contrasted: a persecutor of Bábís vs. a Bábí martyr-companion.)

## Clusters (SPLIT)

### Cluster A — Shaykh Muḥammad-Ḥasan-i-Najafí (Ṣáḥib-i-Jawáhir)
- keeper: NEW (or merge to an existing "author of the Jawáhir" entity if one exists)
- canonical: Shaykh Muḥammad-Ḥasan-i-Najafí
- nisba/lineage: Najafí; chief mujtahid of Najaf
- role-arc: "one of the most celebrated ecclesiastics of Shí'ah Islám"; author of *Jawáhiru'l-Kalám*
  ("the author of the Jawáhir", "Chief of Scholars"); the divine before whom Mullá 'Alíy-i-Basṭámí
  fearlessly proclaimed the Báb's mission at Najaf.
- dates: d. 1266 AH / 1849
- side: Muslim (Shí'í establishment), NOT Bábí
- fate: died of natural causes 1849
- content_ids: 21053981 (Dawn-Breakers para_306)
- DISCRIMINATOR: Najaf-based mujtahid, †1849, Jawáhir author (corpus cids 5758919, 13824006,
  17043355 independently identify him). No linking clause to Sabzivárí or any Bábí. ≥2 sources
  (Dawn-Breakers + corpus biographical paras + general Shí'í history).

### Cluster B — Shaykh Muḥammad-Ḥasan-i-Sabzivárí ("the notorious mujtahid of Yazd"; "Tyrant of the Land of Yá")
- keeper: EXISTING 638951 "Muḥammad-Ḥasan-i-Sabzivárí" (mention_count 4) — route this cluster there
- nisba/lineage: Sabzivárí; resident mujtahid of Yazd
- role-arc: leading divine of Yazd; issued death-warrant against Ḥájí Muḥammad-Ṭáhir; ordered the
  sick Áqá Siyyid Muḥammad-'Alíy-i-Gazur to drag chained prisoners to Iṣfahán; instigator of the
  1891 Yazd pogrom under governor Jalálu'd-Dawlih (son of Ẓillu's-Sulṭán). Denounced by Bahá'u'lláh
  as "Tyrant of the Land of Yá (Yazd)".
- dates: active mid-to-late 19th c.; the great Yazd massacre was 1891
- side: Muslim persecutor, NOT Bábí/Bahá'í
- fate: persecutor (no martyr fate)
- content_ids: 6955408 (doc 429 / Taherzadeh), 6006043 (doc 430), 7515419 (doc 430),
  21055840 (God Passes By para_466 — the Yazd pogrom under the mujtahid + Jalálu'l-Dawlih)
- DISCRIMINATOR: Yazd nisba Sabzivárí, persecutor role, 1891 pogrom (web-confirmed: bahaipedia Yazd,
  h-net taqiya note — "Shaykh Ḥasan-i-Sabzivárí instigated a pogrom… under Jalálu'd-Dawlih").
  Explicitly opposed to the Faith; cannot be the Najaf Jawáhir author (different city, different era,
  different role). No linking clause.

### Cluster C — Muḥammad-Ḥasan-i-Qazvíní, surnamed Fatá (Fatá'l-Qazvíní)
- keeper: NEW
- nisba/lineage: Qazvíní; surnamed/styled "Fatá" → "Fatá'l-Qazvíní"
- role-arc: young Bábí; Ṭáhirih's messenger and travelling companion; accompanied her from Badasht
  toward Khurásán; present at the Badasht assembly where (under Quddús's apparent rebuke) he
  "stretched forth his neck to receive the fatal blow" before Ṭáhirih appeared unveiled.
- dates: active 1848 (Badasht)
- side: Bábí
- fate: unresolved here (NEEDS-SOURCE for later fate)
- content_ids: 21054291 (Dawn-Breakers para_810), 21054309 (para_838), 21054310 (para_839 —
  the "Muḥammad-Ḥasan, who had seated himself at the feet of Quddús" continuation = same Fatá)
- DISCRIMINATOR: explicit corpus self-identification — "Muḥammad-Ḥasan-i-Qazvíní, surnamed Fatá …
  upon whom the name of Fatá'l-Qazvíní had been [conferred]". A Bábí companion, opposite side from
  Clusters A/B. The para_839 bare "Muḥammad-Ḥasan" is bound to this cluster by an INTERNAL linking
  clause (same Badasht scene, seated at Quddús's feet) — correctly grouped with Fatá, NOT split off.

### Cluster D — Muḥammad-Ḥasan, brother of Mullá Ḥusayn-i-Bushrú'í
- keeper: NEW
- nisba/lineage: of Bushrúyih, Khurásán; brother of Mullá Ḥusayn (and uncle to Muḥammad-Báqir? — text:
  Muḥammad-Báqir is "his nephew")
- role-arc: accompanied Mullá Ḥusayn from Bushrúyih; with him at Karbilá→Najaf and the Masjid-i-Kúfih
  forty-day retreat; listed among the early band of disciples.
- dates: active 1844
- side: Bábí (Shaykhí→Bábí circle of Mullá Ḥusayn)
- fate: NEEDS-SOURCE (likely Shaykh Ṭabarsí, unverified here)
- content_ids: 21053917 (Dawn-Breakers para_227), 21053969 (para_288 disciple roster)
- DISCRIMINATOR: kin-tag "Muḥammad-Ḥasan, his [Mullá Ḥusayn's] brother" — a fixed familial identity
  distinct from the Qazvíní/Najafí/Sabzivárí figures. No linking clause to any other cluster.

### Cluster E — Muḥammad-Ḥasan, caretaker of the Pilgrim House
- keeper: NEW
- role-arc: caretaker/servant of the Pilgrim House ('Akká era, Taherzadeh narrative)
- side: Bahá'í servant/believer
- content_ids: 7531234 (doc 431 para_431 "Muḥammad-Ḥasan, the caretaker of the Pilgrim House"),
  7531238 (doc 431 "Muḥammad-Ḥasan had returned, I was in a deep sleep")
- DISCRIMINATOR: role-tag "caretaker of the Pilgrim House"; humble servant, not a divine or a
  Letter-of-the-Living companion. Different era ('Akká) and station. No linking clause.

### Cluster F — incidental / misattributed (Qajar-court "Muḥammad-Ḥasan")
- content_ids: 21656763 (doc 40108 h1694) — a Qajar-court horseback-ride scene ("the king went out
  for a ride…"); the matched "Muḥammad-Ḥasan" is an incidental court figure (likely a Muḥammad-Ḥasan
  Khán), unrelated to A–E.
- VERDICT for F: FIREWALL OUT — do not attach to any Bábí/Bahá'í who's-who entity. NEEDS-SOURCE to
  positively identify (candidate sibling 615826 "Muhammad-Hasan Khan-i-Sardar" or 639659/1142542
  "Muḥammad-Ḥasan Khán").

## Mis-linked mention to drop
- 21054517 (Dawn-Breakers para_1128): role row tagged via the `Najafí` alias, but the para text is
  about "two sons of Karbilá'í Abú-Muḥammad" and Siyyid Aḥmad — contains NO Muḥammad-Ḥasan. Spurious
  alias hit; detach from 1220547 entirely.
- 21053927 (para_238): an image-caption row ("STEPS LEADING TO THE DECLARATION CHAMBER") — no person;
  spurious. Detach.

## DESCRIBE (per keeper)
- Cluster A (corpus-verified + sourced:dawn-breakers + web): Shaykh Muḥammad-Ḥasan-i-Najafí (d. 1849),
  author of the 43-volume *Jawáhiru'l-Kalám* and the foremost Shí'í jurist of Najaf in his day; it was
  before him and his disciples that the Bábí emissary Mullá 'Alíy-i-Basṭámí openly proclaimed the new
  revelation, an event that triggered Basṭámí's trial.
- Cluster B (sourced:taherzadeh + sourced:god-passes-by + web): Shaykh Muḥammad-Ḥasan-i-Sabzivárí,
  the mujtahid of Yazd whom Bahá'u'lláh styled the "Tyrant of the Land of Yá"; he issued death-warrants
  and instigated the 1891 Yazd massacre of Bahá'ís in concert with governor Jalálu'd-Dawlih.
- Cluster C (corpus-verified:dawn-breakers): Muḥammad-Ḥasan-i-Qazvíní, surnamed Fatá ("the youth"),
  Ṭáhirih's trusted Bábí messenger who escorted her from Badasht toward Khurásán in 1848.
- Cluster D (sourced:dawn-breakers): Muḥammad-Ḥasan of Bushrúyih, brother of Mullá Ḥusayn-i-Bushrú'í,
  among the earliest companions of the Báb's first disciple.
- Cluster E (sourced:taherzadeh): Muḥammad-Ḥasan, caretaker of the Pilgrim House at 'Akká.

## EVIDENCE (cid → external_para_id → claim)
- 21053981 → para_306 → Najaf mujtahid before whom Mullá 'Alí proclaimed (Cluster A)
- 5758919 / 13824006 / 17043355 → Jawáhir authorship, †1266 AH/1849 (Cluster A corroboration)
- 6955408 → para_429-area → "Shaykh Muḥammad-Ḥasan-i-Sabzivárí… Tyrant of the Land of Yá" (B)
- 6006043 → para_430 → "Shaykh Muḥammad-Ḥasan-i-Sabzivárí, the notorious mujtahid of Yazd" (B)
- 7515419 → para_430 → "sent it to Shaykh Muḥammad-Ḥasan-i-Sabzivárí in Yazd" (B)
- 21055840 → GPB para_466 → Yazd pogrom under the mujtahid + Jalálu'l-Dawlih (B)
- 21054291 → para_810 → "Muḥammad-Ḥasan-i-Qazvíní, surnamed Fatá" escorting Ṭáhirih (C)
- 21054309 → para_838 → "Muḥammad-Ḥasan-i-Qazvíní… name of Fatá'l-Qazvíní had been [conferred]" (C)
- 21054310 → para_839 → "Muḥammad-Ḥasan, who had seated himself at the feet of Quddús" (C, internal link)
- 21053917 → para_227 → "Muḥammad-Ḥasan, his brother" (of Mullá Ḥusayn) (D)
- 21053969 → para_288 → disciple roster: "Muḥammad-Ḥasan, his brother" (D)
- 7531234 → doc 431 → "Muḥammad-Ḥasan, the caretaker of the Pilgrim House" (E)
- 7531238 → doc 431 → "Muḥammad-Ḥasan had returned" (E)
- 21656763 → doc 40108 h1694 → Qajar-court ride scene, incidental (F, firewall)

## FLAGS
- DATA QUALITY: 1220547 is a 7-alias over-merge dumping ground with stale mention_count=1 vs ~17 bound
  mentions. The aliases conflate a Najaf mujtahid, a Yazd persecutor, a Bábí messenger, Mullá Ḥusayn's
  brother, and an 'Akká servant — three of three "sides" (Shí'í establishment, Bábí, Bahá'í).
- ROUTING: Cluster B → existing 638951 "Muḥammad-Ḥasan-i-Sabzivárí". Clusters A, C, D, E → NEW entities.
  Re-survey siblings 620336/625478 (Áqá Muḥammad-Ḥasan, 15/14 mentions) and 628463/638396 before
  minting NEW — some may already hold these people.
- FIREWALL: Cluster F (doc 40108) must NOT attach to any who's-who person entity; NEEDS-SOURCE to a
  Muḥammad-Ḥasan Khán court figure (candidates 615826/639659/1142542/1220531).
- SPURIOUS MENTIONS TO DETACH: 21054517 (no Muḥammad-Ḥasan in text), 21053927 (image caption).
- NEEDS-SOURCE: later fates of Cluster C (Fatá) and Cluster D (brother of Mullá Ḥusayn) not established
  from current pulls.
