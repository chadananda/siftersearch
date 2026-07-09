# Ṭabarsí-era consolidation: Báqir-i-Qá'iní & Taqíy-i-Juvayní

## VERDICT

**Mírzá Muḥammad-Báqir-i-Qá'iní — keeper = 638692** (`Mírzá Muḥammad-Báqir`, person, side=Bábí).
- 16 mentions (entity_mentions count is STALE/indicative, not authoritative).
- No other Báqir fragment merges into this keeper — the Báqir mentions are correctly split (see FIREWALL). 638692's mentions are coherently the Bábíyyih-builder / fort-defender Báqir (para_978 "Mírzá Muḥammad-Báqir, who had built the Bábíyyih"; para_1080/1094/1100/1118 leading sorties out of the fort). No merge action required; keeper stands as-is.
- Canonical death-notice para_1150 ("…his fellow-companion, Mírzá Muḥammad-Báqir, were impaled on spears…") is currently UNLINKED to any entity (content id 23666767 has zero entity_mentions) → FLAG: re-link to 638692.

**Mírzá Muḥammad-Taqíy-i-Juvayní — keeper = 1060801** (`Mírzá Muḥammad-Taqíy-i-Juvayní`, person, side=Bábí).
- 16 mentions reported, but the keeper is CONTAMINATED (see below). The single true Juvayní passage — para_1150, a native of Sabzihvar, literary, "often entrusted by Mullá Ḥusayn with the task of leading the charge," martyred and beheaded alongside Báqir — is UNLINKED. Web (Dawn-Breakers ch. XIX/XX) corroborates: drew a dagger from Khusraw's robe, fearless charge-leader, head paraded through Bárfurúsh.
- Keeper retained at 1060801; no sibling Juvayní fragment exists to merge. Action is CLEANUP, not merge.

## CONTAMINATION (confirmed — Sárí agent's flag is correct)

Entity 1060801 (Juvayní, a Bábí DEFENDER) has wrongly absorbed the **Sárí-mujtahid** Taqí — the man who IMPRISONED Quddús in Sárí for 95 days, an enemy/non-Bábí cleric "the leading mujtahid of that town." These are a DIFFERENT person.

Mentions classified (15 distinct para links inspected):
- **SARI (mis-linked, must be removed from 1060801):** para_359, 856, 988, 991, 994, 996, 1007, 1129, 1130 — all the Quddús-incarceration / "mujtahid of Sárí" / Naẓar-Khán-conversion-attempt narrative. Co-occur with place-entity `Sárí` (1219593, type=place) and `Mujtahid` (617083/1220865). para_991 is literally the image caption "HOUSE OF MÍRZÁ MUḤAMMAD-TAQÍ, THE MUJTAHID, IN SÁRÍ".
- **BÁQIR (belongs to 638692, not a Taqí at all):** para_978 (Bábíyyih builder) — bleed-over.
- **JUVAYNI / ambiguous-defender:** para_968, 1150, 104 — the genuine Ṭabarsí-defender material; only these (esp. 1150) legitimately belong to 1060801.

Net: roughly 9 of 16 mentions on 1060801 are the Sárí mujtahid; the keeper is majority-contaminated.

## FIREWALL

The Báqirs (all distinct, kept separate — correct):
- **638692 Mírzá Muḥammad-Báqir-i-Qá'iní** — KEEPER, Bábí Ṭabarsí defender / Bábíyyih builder.
- 620166 Mullá Báqir-i-Tabrízí — Letter of the Living. ≠
- 1220515 Shaykh Muḥammad-Báqir — "the Wolf" (Iṣfahán persecutor). ≠
- 628263 Mullá Báqir; 950443 Mírzá Báqir-i-Shírází; 872491 Muḥammad-Báqir; 1061678 Mullá Báqir Majlisí; 1125877 Imám Báqir; 1145907 Muḥammad-Báqir-i-Qahvih-chí — all distinct, no merge. ≠

The Taqís — Juvayní is the FIFTH Bábí-defender Taqí; firewalled from:
- 619606 Mírzá Taqí Khán — Amír-Niẓám (Grand Vizier). ≠
- (Baraghání) — Mullá Muḥammad-Taqí Baraghání family. ≠
- **the Sárí mujtahid** (jailer of Quddús) — NOT a separate keeper in this set; he is the contamination polluting 1060801. He is in effect a SIXTH Muḥammad-Taqí (enemy cleric) and should NOT live under the Bábí-defender Juvayní entity. ≠
- Ibn-i-Abhar (Ḥájí Mírzá Muḥammad-Taqí, 1221166 / 1220159 candidates). ≠
- 620148 Muḥammad-Taqí, 633454 Mírzá Taqí, 1060780 Harátí, 1220539 Najafí, 1227577 Núrí — distinct. ≠

## DESCRIBE (proposed)

- **638692** — Mírzá Muḥammad-Báqir-i-Qá'iní: Bábí of Qá'in; brave swordsman and chief field-commander of Fort Shaykh Ṭabarsí; built the Bábíyyih and led repeated mounted sorties (raising "Yá Ṣáḥibu'z-Zamán!"); martyred, head impaled beside Juvayní's. side=Bábí.
- **1060801** — Mírzá Muḥammad-Taqíy-i-Juvayní: native of Sabzihvár, distinguished for literary accomplishments; entrusted by Mullá Ḥusayn to lead charges at Ṭabarsí; drew Khusraw's own dagger to slay him; martyred and beheaded alongside Báqir-i-Qá'iní. side=Bábí. (After cleanup of Sárí mentions.)

## FLAGS

1. **Strip Sárí-mujtahid mentions from 1060801** (para_359, 856, 988, 991, 994, 996, 1007, 1129, 1130). They belong to a distinct enemy cleric (Quddús's jailer), not the Bábí defender. Consider creating/assigning a separate "Mírzá Muḥammad-Taqí, mujtahid of Sárí" entity for them.
2. **Re-link the unlinked canonical para_1150** (content id 23666767) to BOTH 638692 (Báqir) and 1060801 (Juvayní) — currently it carries zero entity_mentions, so the keepers are missing their single best identifying passage.
3. **para_978** (Báqir the Bábíyyih builder) is mis-attached to the Juvayní entity 1060801; reassign to 638692.
4. Both 638692 and 1060801 have EMPTY description fields — populate from DESCRIBE above.
5. Mention counts are stale; do not treat the "16/16" symmetry as meaningful — it is coincidental and partly an artifact of contamination.

Confidence: **HIGH** (corpus para_1150 + co-occurring place/role entities + Dawn-Breakers ch. XIX–XX web corroboration all converge).
