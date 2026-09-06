---
id: "0003"
title: Person entity quality — the search cannot answer a basic factual question
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: L
acceptance:
  - text: "when did Mullá Husayn first meet the Báb" returns the correct answer with a citation
  - text: a set of similar factual questions is written down as a regression suite before any tuning starts
  - text: the suite runs on demand and its pass rate is reported
  - text: the answer names the person it is answering about, so a wrong subject is visible
  - text: sibling and same-surname cases are in the suite explicitly
---

## Localised by test, 2026-09-06 — then corrected by Chad

An earlier version of this item said the biography answer was correct and only
synthesis failed. **That was wrong, and the correction matters more than the
original finding.**

**Biography browse — also wrong, differently.** It returns:

> Mullá Ḥusayn-i-Bushrú'í … became the first to recognize the Báb **on the
> night of 22–23 May 1844**

That is the **declaration**, not their first meeting. Chad, 2026-09-06: The
Dawn-Breakers establishes the Báb's **pre-revelation Karbilá period**, and
**Balyuzi** narrates a meeting of the two in the home of **Mullá Ṣádiq
(Ismu'lláhu'l-Aṣdaq, Muqaddas)** — years before 1844.

So both surfaces answer a question that was not asked. "When did they first
meet" is being answered with "when did he first believe."

**The encounter is absent from the archive.** Muqaddas exists as a full entity
card — the adhán at Shíráz, arrest by Ḥusayn Khán, later a Hand of the Cause —
with no mention of hosting that meeting. Querying "Karbilá" returns people
mentioned near Karbilá, not the Báb's period there.

**Ask AI — wrong.** Asked "when did Mulla Husayn first meet the Bab", it answered:

> Muḥammad-Ḥasan-i-**Bushrú'í** [visited the Báb « I left His house » 1843];
> Mullá Ḵhudá-Baḵhs̱h-i-Qúc̱hání met the Báb in Shíráz on the fifth hour of the
> evening of the fifth day of Jamádíyu'l-Avval, 1260 A.H

Neither is the subject. The first is **Mullá Ḥusayn's brother** — the same
family name, `Bushrú'í`. The second is an unrelated Mullá who also met the Báb.
The correct card appears further down the results, so retrieval surfaced the
right record and synthesis chose the wrong ones.

## What this means — a modelling gap, not a search gap

The archive holds **biographical summaries, not encounters**. Its only
relationships are kinship: `brother:`, `father:`, `uncle:`. There is no
representation of *A met B, at place P, in period T, attested by source S*.

So "when did X first meet Y" is unanswerable by construction, however good
retrieval becomes. Two separate failures were visible in one question:

1. **No event model.** The meeting is not in the data, so nothing can retrieve it.
2. **Synthesis substitutes.** Rather than saying it does not know, Ask AI
   answered with two other men — Mullá Ḥusayn's brother Muḥammad-Ḥasan-i-Bushrú'í,
   and Mullá Ḵhudá-Baḵhs̱h-i-Qúc̱hání — with a confident, sourced, precisely
   dated answer about the wrong people.

The second is the dangerous one. A reader has no way to tell.

## The standard to hit
Chad: "that type of connection is obvious to the student who has read those
books and should be explicit to the entity database." The Dawn-Breakers gives
the Karbilá context; Balyuzi gives the meeting at Mullá Ṣádiq's home. A student
who read both connects them. **Cross-source event synthesis is the requirement**,
not better ranking over per-book summaries.

## Why the test suite comes first
Without a written set of questions with known answers, "better" is unmeasurable
and every tuning pass is guesswork. The question above is the first entry.

## Note
Sibling and same-family-name confusion is the specific case to test against:
Mullá Ḥusayn vs Muḥammad-Ḥasan-i-Bushrú'í. The archive already records the
relationship — the Mullá Ḥusayn card lists `brother: Muḥammad-Ḥasan` — so the
disambiguating fact is present and unused.
