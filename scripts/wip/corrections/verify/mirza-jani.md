# Verify: Ḥájí Mírzá Jání-i-Káshání

## VERDICT
- **keeper = 1221935** (`Ḥájí Mírzá Jání`, person) ← merge **641615** (`Mirza Jani`, English-corpus fragment)
- **Related WORK (do NOT merge):** `1232859` (`Nuqtatu'l-Kaf`, work) — his history. Additional work-fragments of the same book also relate, not merge: `628068` (`Kitáb-i-Nuqtatu'l-Káf`), `1219822` (`Káfí`, work).
- Relation: keeper —[author_of]→ 1232859 (Nuqṭatu'l-Káf).

## CONFIDENCE
**High** for the person merge (1221935 ← 641615). The 641615 contexts are all narrative quotations attributed to "Mirza Jani" as a historical source (Ṭabarsí events, Mullá Ḥusayn, Quddús, Siyyid Yaḥyá, the women of Mount Biyábán) — same historian, unaccented transliteration. Identity, hosting of the Báb at Káshán, authorship of the earliest Bábí history, and 1852 martyrdom all corroborated cross-corpus (DB contexts + GPB/Dawn-Breakers narrative + Bahaipedia/Momen).
**Medium** confidence on which work-entity is the canonical Nuqṭatu'l-Káf node (the work landscape is badly fragmented — see FLAGS); 1232859 chosen as the proper `work`-typed node.

## FIREWALL (≠)
- ≠ `1055314` Mírzá Maḥmúd-i-Káshání, `1220410` Ḥájí Muḥammad Ismá'íl-i-Káshání (other Káshánís).
- ≠ Zanjání/Láríjání figures surfaced by the broad scan (co-occurring in Ṭabarsí narrative only).
- ≠ the **Nuqṭatu'l-Káf itself** — that is his WORK, a separate work-entity (relate, never merge). The Azalí-attributed/Browne-published *Nuqṭatu'l-Káf* is the contested edition of HIS chronicle; the contestation is about the text, not his authorship of the underlying history.
- ≠ `1238625` 'Usúl-i-Káfí, `660039`/`646354` al-Káfí (the Shí'í hadith work — name coincidence on "Káf").

## DESCRIBE
Ḥájí Mírzá Jání-i-Káshání: Bábí merchant of Káshán; first Bábí of Káshán; hosted the Báb overnight (three days, per tradition) on His way to Tabríz. Author of the earliest Bábí history (the chronicle later published, in tampered/contested form, as the Nuqṭatu'l-Káf / Kitáb-i-Nuqṭatu'l-Káf) — a key early source repeatedly quoted in later histories. Martyred in the 1852 Ṭihrán persecution following the attempt on Náṣiri'd-Dín Sháh.

## SIDE
**Bábí** (the Báb's dispensation; pre-1852, no allegiance question — final-allegiance rule N/A).

## FLAGS
- Mention counts are STALE (no removal-on-delete; task #2 pending). 1221935 = 30, 641615 = 4 are nominal, not authoritative.
- **Work-entity fragmentation is severe:** ~25 near-duplicate Nuqṭatu'l-Káf nodes exist with inconsistent `entity_type` (`work`/`document`/`concept`/`person`/`place`) — e.g. `628068` document, `633013`/`633282`/`641386`/`645970` person, `633101`/`633279` concept, `1232859`/`1219822` work. These need a separate WORK-consolidation pass (out of scope here — this task is person consolidation). Flagged for follow-up.
- Several "Káf"/"Káfí" nodes are the Shí'í hadith collection (al-Káfí / 'Usúl-i-Káfí), NOT this work — must stay firewalled in any future work merge.
