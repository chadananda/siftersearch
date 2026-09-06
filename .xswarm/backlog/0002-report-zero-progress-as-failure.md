---
id: "0002"
title: Report zero progress as a failure, not as nominal
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: S
class: low
acceptance:
  - text: a 24h window with 0 books processed produces a warning or critical, never a green subject line
  - text: an unchanged backlog (571 pending, was 571) is reported as stalled, not as ok
  - text: any check whose remedy is "a human must do X" surfaces as a decision, not as a passing tick
  - text: the subject line states the actual condition — a report whose subject says nominal while the body says nothing happened is the defect
  - text: a check's severity depends on the observed condition, never on whether a diagnostic endpoint answered
  - text: an unreachable diagnostic endpoint is itself reported, not folded into the check it was meant to explain
---

## Problem
Chad, 2026-09-06: "I should be getting regular email reports detailing progress
but most of them do not show any progress."

They do not show progress because there is none, and the report presents that
as success. Three examples from a single green report:

* subject: "all nominal · **0 books done 24h · $0.00 spend**"
* `✓ Embedding backlog — 571 pending (**was 571**)` — unchanged, reported ok
* `✓ Grounding progress — plan exhausted ... switch mode when ready to spend`
  — a passing check whose meaning is "stopped, waiting for a human"

## The same state reports as both green and red
Observed 2026-09-06. Two reports, one condition — nothing queued, running or
completed:

    GREEN  ✓ Grounding progress — plan exhausted — no enqueueable work left;
             switch mode to "general" when ready to spend
    RED    ✗ Grounding progress: plan mode but nothing queued/running/completed
             in 24h (exhaustion endpoint unreachable — cause unverified)

The check flips on whether it can reach the exhaustion endpoint to explain
itself, **not on whether any work happened**. So the signal tracks the health of
a diagnostic endpoint rather than the health of the pipeline, and a reader
learns to treat both colours as noise.

Severity must follow the condition: nothing processed in 24h is the same
problem whether or not the cause could be verified. Unverifiable cause makes it
*worse*, not greener.

## Why this is P1
Every other item here was invisible for days because of this. Monitoring that
cannot distinguish idle from healthy is worse than none: it converts a stall
into a green tick and trains the reader to ignore the channel.
