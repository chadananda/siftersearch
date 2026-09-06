---
id: "0015"
title: Remove the home page chat; unify on the Anis widget button
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: M
class: low
acceptance:
  - text: the bespoke home page chat interface is gone
  - text: the home page uses the same widget button that client sites will embed
  - text: one chat implementation exists, not two
  - text: it is a web component, embeddable in a site that is not SifterSearch
  - text: renamed from SifterChat to Anis, including in the widget manager
  - text: the question path is unchanged — same answers, same citations, through the widget
  - text: site builds and the responsive sweep passes
    check: "pnpm build"
---

## Decision, Chad 2026-09-06
Drop the home page chat interface and use the chatbot button instead. That
makes SifterSearch a *host* of the companion rather than a special case, and
the experience identical to what client sites will embed —
bahai-education.org, drbi.org and others.

## Why it matters beyond tidiness
Two chat surfaces means two answer paths, and the one you test is not the one
visitors get. Unifying now means every later improvement — latency, entity
disambiguation, follow-up — lands once and everywhere.

## Name — settled
The companion is **Anis** (0016 resolved). `SifterChat` becomes Anis. The
component published here is the same one every client site embeds, so the name
travels with it.
