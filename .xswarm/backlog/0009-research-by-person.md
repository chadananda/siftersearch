---
id: "0009"
title: Build a research profile by person
state: refined
proposal: true
traces_to: .xswarm/GOAL.md
priority: P2
size: L
depends_on: ["0003"]
acceptance:
  - text: given a person, produce a sourced profile drawn from the corpus
  - text: every claim carries a citation
  - text: it states what it could not find, rather than omitting silently
---

## Problem
Chad, 2026-09-06: special research capability — a research profile by person.

## Depends on
Person entity quality (0003). A profile generator over weak entities produces
confident, wrong biographies — worse than none, because they read as authoritative.
