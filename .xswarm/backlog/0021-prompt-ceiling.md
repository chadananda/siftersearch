---
id: "0021"
title: Prompt iteration has a documented ceiling — stop tuning, fix the data
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: S
acceptance:
  - text: no further prompt-tuning work is filed without evidence it can pass the recorded ceiling
  - text: the ceiling finding is stated in the project GOAL, so it is not rediscovered
---

## Finding
`docs/dialog-overnight-iteration-log.md`, April 2026, under the heading
**"The wall: prompt iteration alone has a ceiling"**:

    v1    58%   over-hedging, generic
    v3    69%   naturalness 72 — fabricated quotes from training
    v3.1  66%   rigid, less specific
    …     62.3% regression from v3
    …     58%   further regression

Final batch, 97 conversations: range 55-76%, **6 scored ≥70%**, ~21 below 60%.

Two things in that table matter more than the numbers. Iteration **regressed**
past a point — later versions scored worse than earlier ones. And the
highest-scoring version, v3 at 69%, **fabricated quotes from training data**,
which is the worst possible failure for a research companion. The score went up
because the answers read better while being less true.

## Why this matters today
Chad's complaint on 2026-09-06 — that Anis is "limited by poor search results"
and that entity quality is poor — is consistent with this ceiling rather than
separate from it. A prompt cannot retrieve what the index does not contain.

The Mullá Ḥusayn failure is the same shape: the archive holds biographical
summaries and kinship, no encounters. No posture instruction produces a meeting
that was never extracted.

## The conclusion to record
The next gain is in **the data** — encounters (0017), what claims already exist
(0019), coverage (0006) — not in the prompt. Prompt work was already taken to
its limit and past it.
