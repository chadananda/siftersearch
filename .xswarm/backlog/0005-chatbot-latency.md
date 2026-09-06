---
id: "0005"
title: Anis is slow — blocking queries up to 8.4s
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
acceptance:
  - text: no query in the answer path exceeds 2s at p95
  - text: the named hot loops are indexed or restructured, and named in the report rather than logged as UNNAMED
  - text: a latency budget for an Anis answer is written down and measured against
---

## Finding
Chad: the chatbot is "currently very slow". The ops report agrees —
4–13 blocking queries a day over 5000ms, worst 8.4s, plus unnamed hot loops:
19 min/day on an embedding scan, 12 min/day on pipeline-snapshot counts,
10 and 8 min/day on `content WHERE doc_id IN (...)` in the API path.

The API path ones are the chatbot. The queries are logged as UNNAMED, so
nobody can tell which code issued them — naming them is part of the fix.
