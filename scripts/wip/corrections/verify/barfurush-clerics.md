# Verify: Mázindarán Antagonist Clerics of the Ṭabarsí Period

Scope: consolidate the two chief antagonist clerics of the Shaykh Ṭabarsí upheaval —
the **Sa‘ídu'l-‘Ulamá of Bárfurúsh** and **Mírzá Muḥammad-Taqí, the mujtahid of Sárí**.
Read-only DB pass (sifter.db / graph.db) + WebSearch + corpus.

---

## VERDICT

### 1. Sa‘ídu'l-‘Ulamá of Bárfurúsh  — KEEPER
**Keeper:** `1060802` `Sa‘ídu’l-‘Ulamá` (person, Baha'i, mc 8)
**Merge into keeper (same referent, wrong type / variant spelling):**
- `1064453` `Sa‘ídu’l-‘Ulamá` (concept, mc 13) ← mistyped as concept
- `1077105` `Sa'idu'l-'Ulama` (concept, mc 4) ← ASCII variant
- `1219591` `Sa'ídu'l-'Ulamá` (person, mc 1) ← thin new-extractor fragment
- `1227608` `Sa'idu'l-'Ulama` (concept, mc 1) ← thin new-extractor fragment

**Confidence: HIGH.** Corpus is explicit and consistent. The Sa‘ídu'l-‘Ulamá is the chief
instigator who roused Bárfurúsh (Babul) against Quddús and Mullá Ḥusayn, wrote the inflammatory
letter to Náṣiri'd-Dín Sháh, and forced Quddús's execution at Bárfurúsh over Prince Mihdí-Qulí
Mírzá's objection (content ids 16836903 / 16836927 / 16836928, doc 16313; corroborated EN).
Title-as-person is the correct treatment here: "Sa‘ídu'l-‘Ulamá" ("most learned of the divines")
is a title borne by ONE specific Bárfurúsh cleric throughout the Ṭabarsí narrative — no competing
referent appears in the corpus. The corpus even carries an explicit alias-equation line
(id 7465066: "Sa‘ídu'l-'Ulama = Sa‘ídu'l-‘Ulamá").

### 2. Mírzá Muḥammad-Taqí, mujtahid of Sárí — KEEPER (NO SAFE GENERIC MERGE)
**Keeper:** `620195` `Mírzá Muḥammad-Taqí` (person, Baha'i, mc 34) — best canonical surface.
**Do NOT auto-merge** the high-count generic name-buckets into it (see FLAGS): they are polluted
by unrelated Muḥammad-Taqís. Only same-referent, Sárí-context fragments should be folded in after
per-mention adjudication; none could be cleanly isolated in this read-only pass.

**Confidence: MEDIUM-HIGH on identity / LOW on a clean graph merge.**
Identity is rock-solid from the corpus: Nabíl/Dawn-Breakers (id 21054322) — "Quddús ... was
confined in Sárí in the home of Mírzá Muḥammad-Taqí, the leading mujtahid of that town";
and id 7699795 / 7700661 — Mullá Ḥusayn dispatched Mullá Mihdí of Khuy + six horsemen to Sárí
to demand Quddús's release from "the chief priest Muḥammad-Taqí," who succumbed. Web corroborates:
~95-day incarceration in the house of Mírzá Muḥammad-Taqí (family connections), the mujtahid
eventually joining the clergy in the Ṭabarsí martyrdoms. The Momen detail (Siyyid Aḥmad-i-Sang-Sarí
cut to pieces on his order) is consistent with this antagonist role but was not independently
located in the indexed corpus.

---

## FIREWALL — THE THREE (actually FOUR) DISTINCT TAQÍS — DO NOT MERGE

1. **Mírzá Muḥammad-Taqí, mujtahid of Sárí** — keeper `620195`. Antagonist cleric, Ṭabarsí period.
   Held Quddús prisoner in Sárí. side=other.
2. **Mírzá Taqí Khán, the Amír-Niẓám (Amír Kabír)** — entities `619606`/`619608`/`614755`/`657157`
   (the "…Khán" forms; also legacy person id 1219327 cited in the brief). Náṣiri'd-Dín Sháh's
   Grand Vizier who ordered the Báb's execution. A statesman, NOT a Mázindarán cleric. ✗ distinct.
3. **Mullá (Ḥájí) Muḥammad-Taqí Baraghání** — entities `1076857` / `1005404` / `641556`
   (and the Baraghán/Baraghání cluster). Ṭáhirih's uncle, the Qazvín "third martyr." ✗ distinct.
4. **Mírzá Muḥammad-Taqí, Ibn-i-Abhar** — surfaced in content id 21054239 and WebSearch.
   A later Hand of the Cause appointed by Bahá'u'lláh. ✗ distinct — a FOURTH Taqí actively
   polluting the generic buckets; flagged so it is never folded into the Sárí cleric.

Also note `1060801` "Mírzá Muḥammad-Taqíy-i-Juvayní" — the stale extractor mis-linked the
Sárí-mujtahid passage (content 21054322) to this Juvayní entity. Juvayní ≠ Sárí; keep separate.

---

## DESCRIBE (proposed dictionary text)

- **Sa‘ídu'l-‘Ulamá of Bárfurúsh** — Title ("most learned of the divines") of the leading Shí‘í
  cleric of Bárfurúsh (Babul), Mázindarán. Chief instigator of the persecution of the Bábís during
  the Shaykh Ṭabarsí upheaval (1848–49); roused the populace against Quddús and Mullá Ḥusayn, wrote
  to Náṣiri'd-Dín Sháh denouncing the fort as a threat to the realm, and pressed for and secured
  Quddús's execution in Bárfurúsh.
- **Mírzá Muḥammad-Taqí-i-Sárí** — The foremost mujtahid of Sárí, Mázindarán; antagonist cleric of
  the Ṭabarsí period. Held the captive Quddús in his house (~95 days) before joining the clergy who
  condemned the Ṭabarsí martyrs; reported (Momen) to have ordered Siyyid Aḥmad-i-Sang-Sarí cut to
  pieces. Distinct from the Amír-Niẓám, the Baraghání martyr's uncle, and the Hand Ibn-i-Abhar.

## side
Both = **other** (antagonist Muslim clerics; never adherents of the Báb).

## FLAGS
- entity_mentions is STALE/partial (109,812 rows total; many target entities have 0 rows). Counts
  above are graph_entities.mention_count, themselves stale. Treat all numbers as advisory.
- The generic high-count buckets `620148` (Muḥammad-Taqí, mc 56), `620125` (Muḥammad Taqí, mc 51),
  and `620195` (Mírzá Muḥammad-Taqí, mc 34) are NAME-COLLISION buckets conflating ≥4 referents
  (Sárí cleric, Amír-Niẓám, Baraghání, Ibn-i-Abhar). DO NOT bulk-merge — requires per-mention
  AI adjudication before any fold-in.
- Recommend creating/keeping a discrete keeper for the Sárí cleric and re-routing only Sárí-context
  mentions to it; leave the polluted generic buckets for the dedup re-adjudication pass.
- Sang-Sarí "cut to pieces" detail sourced to Momen/web, not independently in the indexed corpus.
