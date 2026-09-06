---
id: "0030"
title: The commit gate reports environment breakage as code failure
state: ready
traces_to: .xswarm/backlog/0028-gate-excludes-prerequisites.md
priority: P2
size: S
acceptance:
  - text: a native-module ABI mismatch is detected and named before the suite runs
  - text: the gate distinguishes "your environment is stale" from "your change broke something", and says which
  - text: the stale-environment path suggests the fix (npm rebuild) rather than only aborting
  - text: no green/red claim is made about a suite that could not execute
---

## What happened, 2026-09-06
A markdown-only commit was aborted with "Tests failed! Commit aborted." and a
count of 95 failures across 22 files. None of them were real. `better-sqlite3`
was compiled against NODE_MODULE_VERSION 137 and the local Node wanted 141, so
every test touching the database failed at migration. `npm rebuild
better-sqlite3` took seconds; the suite then ran 2083 passed, 0 failed.

The 95 had been carried for some time as though it were a real quality debt.
It was never code.

## Why this matters more than the bug
The gate was right that something was wrong and wrong about what. That is the
worse of the two failure modes, because:

* It misattributes. A developer reads "95 tests failing" as a code problem and
  either starts debugging the wrong thing or writes the number down as debt.
* It teaches bypass. The honest response to a gate that fails for reasons
  unrelated to your change is to skip it — and a gate that gets routinely
  skipped is not a gate. This commit came close to being pushed with the test
  gate disabled, which would have been the correct call for the wrong reason
  and would have set the habit.

Same family as 0028: a check that reports confidently on something it did not
actually measure. Here the suite never ran; "95 failed" described the
environment, not the code.

## Fix
Cheap. Before the suite, open the DB once. On an ABI error, exit with a
distinct message and status naming the rebuild — never with the language of
test failure. A gate may say "I could not run"; it must not say "you failed"
when it means that.
