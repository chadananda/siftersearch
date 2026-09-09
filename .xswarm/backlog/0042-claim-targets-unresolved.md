---
id: "0042"
title: 91% of claim targets are strings — the graph edges point nowhere
state: ready
priority: P0
size: L
acceptance:
  - text: target_entity_id resolution is measured before and after, and reported
  - text: reverse queries work — "who met X" returns the same evidence as "X met whom"
  - text: unresolvable targets are recorded as unresolved, never silently dropped
  - text: resolution runs as a re-runnable pass, not a one-off migration
---

## Measured on production, 2026-09-09
First direct query of Tower-NAS since it came back (11 days off the tailnet — the
node key had expired; `tailscale up` was insufficient, `tailscale login` fixed it).

    total claims          615,211
    subject resolved      306,635   (50%)
    TARGET resolved        55,451   ( 9%)

**91% of claim targets are unresolved strings.** This is the structural defect
behind every symptom recorded in 0035, and it is a bigger problem than ranking or
tokenisation, which are real but cosmetic beside it.

## What it explains
* **Forward queries partly work** — "what did the Báb do" hits the 50% of claims
  whose SUBJECT resolved.
* **Reverse queries cannot work** — "who met the Báb" requires resolved TARGETS.
  9% is indistinguishable from broken.
* **Siyyid Káẓim's 46 claims sit as text on the Báb's card.** That is exactly what
  an unresolved target looks like from the outside. He was never "missing"; the
  edge simply had no destination.
* Even forward, half of all claims attach to no entity whatsoever.

## Why it is 9% and not 90%
`claims.js` defers identity deliberately: "Identity is DEFERRED (subject/object
entity ids null; reconcile binds by evidence)." That is a sound design — binding
at extraction time would guess. But **the reconcile pass that was supposed to bind
them has evidently run for subjects and barely at all for targets.**

So this is probably not a re-extraction job. It is a resolution pass over claims
that already exist, which is far cheaper — and it should be measured before and
after rather than assumed to have worked.

## Order this implies
0042 (edges point somewhere) → 0038 (names resolve) → 0035 (ranking) → 0037
(episodes). An earlier note put ranking first; that was wrong. Ranking a graph
whose edges are strings improves nothing.

## Do not
Silently drop targets that cannot be resolved. An unresolved target is evidence
of a person or place the archive knows about but has not catalogued — that is a
finding, not noise, and it is how the coverage gap stays visible.
