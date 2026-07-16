# Persian-document identity processing — analysis + improvement plan (2026-07-15)

## Diagnosis
The identity system keys on ROMANIZED Latin only (`api/lib/translit-key.js` `skeletonKeys` does
`replace(/[^a-z\s-]/g,' ')` → strips all non-Latin). For English sources (GPB/DB/Balyuzi/Taherzadeh) the
transliteration IS the source form (Shoghi Effendi, consistent). For PERSIAN sources (Mázandarání vols
15228/15257/15254/20028/15256/20035/20037/15255/15259) the transliteration is Haiku's per-paragraph rendering
of Arabic script → inconsistent → **intra-book splits** + **cross-book duplicates** (Persian figure can't match
its English-book self: `شيخ جعفر` vs `Shaykh Ja'far` share no key). Concentrated in the obscure long-tail (the
unique value of Máz); famous figures are gazetteer-anchored and fine.

## KEY FACT (evidence, doc 15228)
- `entity_mentions_v2.surface` PRESERVES the Arabic script: 1326/1701 (78%) mentions have Arabic surfaces.
- `entity_claims.proof_verbatim` = 100% Arabic. So the Arabic form is ALREADY in the data — just unused for matching.
- `resolved_as` = Haiku's CONTEXT-RESOLVED handle (e.g. سید→"Siyyid Káẓim-i-Rashtí"); it, not the bare surface,
  is the correct cluster key (surface too coarse for titles). So Arabic = comparison/verify signal, not blind key.
- Persian routing (profile.js LANG_ROUTING): fa = HAIKU for disambig/hype/extract. Reconcile also Haiku for fa.

## Levers (prioritized)
1. **[BIGGEST, CHEAP — data exists] Arabic-script match key fed into reconcile + verify-gate.** Add an Arabic
   normalizer (fold ك/ک ي/ی ة/ه, hamza أإآ→ا, strip harakat/ZWNJ, drop Arabic honorifics حضرت/آقا/ميرزا/ملا/شيخ/سيد,
   drop ال) → Arabic consonantal skeleton. Use in findCandidateEntities recall + verify-gate NISBA axis (nisba
   یزدی≠ترشیزی unambiguous in Arabic, lossy in translit). Feed the cluster's Arabic surface(s) into reconcile
   buildUser so the model compares Arabic-to-Arabic. APPLIES TO MÁZ NOW (surface stored → re-reconcile, no
   re-disambiguation). Store: expose surface/arabic-key per cluster from the adapter.
2. **Detect failure modes with Arabic:** one distinctive full-name Arabic surface across many resolved_as = translit
   SPLIT (merge); one resolved_as over inconsistent full-name Arabic surfaces = OVER-MERGE (flag).
3. **Backfill Arabic names onto major/English entities** (entity dict / Bahaipedia / propagate surface on link) →
   Persian figures merge INTO canonical GPB entity instead of duplicating. Closes cross-book gap.
4. **Sonnet (not Haiku) for Persian DISAMBIGUATION** — the make-or-break Persian stage (reads Persian, resolves
   identity, sets the transliteration everything inherits). Worth the cost on these ~10 dense high-value books.
   Only helps re-disambiguation / Phase-B full-grounds → default for the ungrounded Persian volumes.
5. **Nisba as first-class field** — extract from Arabic, hard identity component (Persian names disambiguated by
   place-nisba). Strengthens merge+split. Ref [[feedback_nisba_disconflation]] [[feedback_transliteration_vs_aliases]].

## Recommendation / plan
- Don't disrupt the running readjudicate sweep (still a real improvement).
- NEXT code change (after current book): lever 1+2 (Arabic key in reconcile + verify-gate). Then a re-reconcile of
  the Máz volumes with Arabic-fed reconcile (no re-disambiguation needed).
- Phase-B ungrounded Persian volumes: full-ground with Sonnet disambiguation + Arabic key from the start.
- PENDING USER DECISIONS: (a) green-light Arabic-key work as next change? (b) Sonnet for Persian disambig on Phase-B (~7 vols)?
