---
id: "0031"
title: Language codes are not normalised, so every language filter undercounts
state: ready
priority: P2
size: S
acceptance:
  - text: language codes are normalised to lowercase ISO-639-1 on write, and existing rows are migrated
  - text: a non-canonical code cannot be stored — validated at the write boundary, not cleaned up later
  - text: corpus-status.mjs reports zero collision groups afterwards
  - text: the migration reports how many rows each variant moved, so the change is auditable
---

## Verified from production, 2026-09-06
`/api/library/stats` reports seven groups of the same language stored under
different codes:

    en=130,442  En=2,213  Eng=115
    fr=392      Fr=8      FR=2
    Es=55       es=27     ES=3
    de=7        De=1       |  Ger=6  ger=2
    NO=3        No=2
    It=2        it=2      IT=1

`en` and `En` and `Eng` are one language stored three ways, and `de`/`De` and
`Ger`/`ger` are one language stored four ways across two different standards.

## Why it matters more than the row counts suggest
Every query that filters by language silently undercounts, and returns a
plausible answer while doing it. A survey asking "how many English documents are
translations" misses 2,328 English documents and reports a clean number. This is
the failure mode that is worst for trust: not an error, but a confident answer
that is quietly short.

It also blocks the original-text work directly — that project selects the
translated population BY LANGUAGE, so it would inherit the undercount and then
report coverage against the wrong denominator.

## Fix
Normalise on write and migrate existing rows. Cleaning up periodically is the
wrong shape: the codes come back, because nothing prevents them. Validate at the
write boundary so a non-canonical code is impossible to store.
