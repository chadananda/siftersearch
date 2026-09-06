---
id: "0023"
title: Perceived performance — make it feel instant before it is
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: L
acceptance:
  - text: something useful appears within 300ms of a question being asked, every time
  - text: partial answers stream as they resolve rather than arriving whole
  - text: repeat and near-repeat questions are served from cache
  - text: the answer cache actually hits — it currently holds 522 entries and has 15 lifetime hits
  - text: no perceived-performance trick ships that degrades correctness
---

## The brief
Chad, 2026-09-06:

> User experience is key. Caching partial answers, caching questions, instant
> partial feedback, partial responses, etc can be used to give the chatbot a
> responsiveness not technically fully possible on the back end. We need to
> break all rules by focusing on delivering both quality and perceived
> performance until the two seem to blend into one.

## The measurable defect underneath it
`answer cache: 522 entries (0 new 24h, 15 lifetime hits)`. Five hundred cached
answers, fifteen hits ever. The cache is keyed too strictly to match how people
actually ask — semantic near-match keying is the obvious first move.

Blocking queries run 5-9.7s, and the API-path hot loops named in the ops report
(`content WHERE doc_id IN (...)`, 10 and 8 min/day) are on the answer path.

## The one rule that cannot bend
Perceived performance must never be bought with correctness. Streaming a
confident wrong answer faster makes the Mullá Ḥusayn failure worse, not better.
Speed tricks apply to *delivery*, never to how sure the system is.
