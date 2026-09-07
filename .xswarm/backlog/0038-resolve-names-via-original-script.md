---
id: "0038"
title: Resolve names through the original script, not transliteration folding
state: ready
priority: P0
size: M
acceptance:
  - text: a token beginning with a dot-below character matches — Ḥusayn, Ṣádiq, Ṭáhirih, Ẓuhúr
  - text: search consults aliases, including the original-script ones, not only the primary name
  - text: an unseen transliteration resolves to the right entity via its original-script form
  - text: entities carry an original-script canonical form where the corpus attests one
  - text: a regression test covers Ḥ Ṣ Ṭ Ẓ Ḍ initial tokens and at least one Arabic-script query
---

## Two problems, and the second is the real one
Chad, 2026-09-06: "why are we fighting diacritics? the model should be able to
recognize the original script from transliterations. from any transliteration."

### 1. The narrow bug — token-initial dot-below characters
Measured on production:

    Káẓim / káẓim   → 119   (dot-below is MEDIAL)
    Bushrú'í        →  12
    Mullá Husayn    →   3
    ─────────────────────
    Ḥusayn/ḥusayn   →   0
    Ṣádiq/ṣádiq     →   0
    Ṭáhirih/ṭáhirih →   0
    Ẓuhúr/ẓuhúr     →   0

Any TOKEN that begins with a dot-below character fails; case is irrelevant;
medial occurrences are fine. One bad token kills a multi-word query, which is
why `Mullá Ḥusayn` returns nothing while `Mullá Husayn` returns three
namesakes. It is a tokenizer/normaliser defect, and it lands precisely on
Ḥ Ṣ Ṭ Ẓ — the letters that open a large share of Bahá'í proper names.

Consequence already observed: `Mullá Ḥusayn` (entity 1247564, **importance 88**,
2,657 claims, 1,398 mentions) is unreachable by his own name, and Ask AI
returned his brother instead.

### 2. The architecture — the original script is the invariant
Folding cannot solve this. The sources use incompatible systems: Nicolas writes
*Séyyèd Ali Mohammed*, Browne differently, modern Persian differently, Shoghi
Effendi's orthography differently again. No fold table unifies them, and each
new source adds forms nobody anticipated.

The original script does not vary. **The anchor already exists in the data**:
Mullá Ḥusayn carries 116 aliases of which **97 are Arabic/Persian script** —
`ملا حسین`, `ملا حسین بشرویی`, `باب الباب`.

But `q=ملا حسین` also returns **0**. Search consults neither the original-script
aliases nor the Latin ones — only the primary name. So the anchor is present and
unused.

## DESIGNATIONS ARE FIRST-CLASS — not one canonical form per person
Chad, 2026-09-06: "are we talking about doing this for the most common form of
the name only? Every person can be designated many ways (Ali Muhammad Shirazi /
Ali qabl-i-Nabil / Ali / Siyyid-i-Bab / The Bab etc.)"

No — every designation must resolve. There are TWO orthogonal axes, and an
earlier draft of this item conflated them:

    DESIGNATION   which appellation is used   'Alí-Muḥammad · Shírází ·
                                              'Alí qabl-i-Nabíl · the Gate · the Báb
    ORTHOGRAPHY   how that one is written     Qá'im / Qá’im / قائم / Qa'im

### What exists today
The Báb carries 342 aliases (325 script, 17 Latin) as a FLAT UNTYPED ARRAY:
`["the Primal Point", "the Gate", "the Forerunner"]`. Three defects:

* designation and orthography are mixed — `the Qá'im` vs `the Qá’im` differ only
  by apostrophe, while `the Gate` vs `Siyyid ‘Alí-Muḥammad` are different kinds
  of thing entirely;
* Chad's own examples are ABSENT — no `'Alí qabl-i-Nabíl`, no `Shírází`;
* some entries are malformed: `Siyyid ‘Alí-Muḥammad, the Báb (Qá’im /
  Ṣáḥibu’z-Zamán battle` — truncated mid-parenthesis.

### Required fields, each justified by an observed failure
    type            personal-name | patronymic | nisba | title | epithet |
                    cipher | office | honorific
    valid_from      "the Báb" is anachronistic before 1844; "Bahá'u'lláh"
                    before ~1863
    discriminating  does this form ALONE identify the person?
    script          arabic | latin
    orthography     bahai | ascii | academic | other

**`type` + `discriminating` fix a failure already observed.** `Bushrú'í` is a
NISBA, shared by Mullá Ḥusayn and his brother Mírzá Muḥammad-Ḥasan-i-Bushrú'í.
That is why Ask AI answered the Mullá Ḥusayn question with the brother. A
resolver that knows a form is a nisba knows it cannot resolve on it alone.

### Preserve the designation actually used — do not normalise it away
The context NOTE already resolves designation → entity (`"Siyyid ‘Alí-Muḥammad"
= the Báb`), but the claim then stores only the canonical name. Which form a
source chose is EVIDENCE — of period, of the narrator's stance, of deference or
hostility. Balyuzi's paragraph 164 uses the period-correct `Siyyid
‘Alí-Muḥammad` for the 1841 Karbilá scene; the archive records `the Báb`, a
title he did not yet bear. Store the surface form beside the resolved id.

## Proposed
1. Fix the tokenizer for dot-below initials, with a regression test.
2. **Index aliases** — all of them, both scripts. Alone this makes `Bábu'l-Báb`,
   `باب الباب` and every recorded variant resolve.
3. Give each entity an original-script canonical form where the corpus attests
   one. The 17,285 Persian and 7,699 Arabic documents are the evidence base, and
   0026's alignment work produces exactly these correspondences — the two
   projects share a prerequisite.
4. For an unseen transliteration, resolve via model to original script, then
   match the anchor. Cache the mapping so it is a hash lookup thereafter; only
   genuinely novel forms cost a call.

## Why this order
Step 2 is cheap and probably recovers most of the loss on its own. Step 3 is the
durable fix and is worth doing because it also serves entity merging: Mullá
Ṣádiq currently exists as at least four separate entities whose claims never
aggregate, and an original-script key is what would unify them.
