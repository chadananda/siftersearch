# Work plan — every player, every scene, linked (started 2026-09-27)

Chad: "We need every connection, every scene, every player, disambiguated and linked so that we have accurate
query. It is simply not acceptable that such a scene as this not show up instantly in a query."

Trigger: Eminent Bahá'ís ¶54 (#5183786) — Siyyid Káẓim, Mullá Ḥusayn, the Báb and Mullá Ṣádiq in one room
(rawḍih-khání, Karbilá, ~1841). Pipeline produced 4 pairwise claims, none placing Mullá Ḥusayn with the Báb;
mentions recorded 4 names, missing Mullá Ḥusayn-i-Bushrú'í and Mullá Ṣádiq (named outright).

## Root causes
1. Claims are PAIRS; a scene (N people together) collapses to a few pairs. Backlog 0036/0037 (episode layer) never built.
2. Mention stage recall is poor (this book: 768 mentions for 1,233 paragraphs) → claims cannot bind subjects.
3. Disambiguation note dates are unreliable ("~c. 1844" for a ~1841 scene).
4. doc_pipeline state does not reflect what was actually run (book 3887 shows all 'pending').

## Stages (each: measure → dry run → review → write, reversible)
- [ ] 1. Mention coverage audit (read-only): per paragraph, known persons named (unique safe name forms) vs mentions.
- [ ] 2. Mention backfill: unambiguous names only, method_version 'name-backfill-v1' (DELETE by it). Dry run first.
- [ ] 3. Re-link (entity-relink, fill-and-correct policy) after backfill.
- [ ] 4. Scene layer: table entity_scenes + scene_participants; DeepSeek per encounter paragraph; proof verbatim;
       participants bound via paragraph mentions; verification. Pilot: Eminent Bahá'ís (3887) + The Dawn-Breakers.
- [ ] 5. Encounter search reads scenes; re-verify; refresh index; scene test battery (Karbilá rawḍih-khání ¶54,
       Badasht, Declaration night, Shaykh Ṭabarsí, Síyáh-Chál …) — each must answer in one query.

## Constraints
Watcher stays off. Entity data writes: dry run + rollback first. Spend: DeepSeek only (policy). Accuracy over recall.
