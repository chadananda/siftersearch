---
id: "0024"
title: Break chat engagement out as its own KPI and cost line
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
acceptance:
  - text: engagement is reported separately — conversations, turns per conversation, return conversations
  - text: cost per conversation is reported alongside it
  - text: both appear on the standup board, not only in the ops email
  - text: return conversations are distinguished from sessions — the mandate is engagement, not visits
---

## Problem
Chad, 2026-09-06: "Chat engagement is a big KPI and cost. So we might break
that out."

It is both the measure of whether Anis works and one of the larger running
costs, and it is currently neither reported nor bounded. Today: `widget 24h:
0 events / 0 sessions`.

## Why return conversations, specifically
`.xswarm/ANIS.md` records the mandate as hyper-engagement across channels. A
visit is not engagement. The falsifier recorded there is that visitors ask once
and never return — which only a return metric can detect.
