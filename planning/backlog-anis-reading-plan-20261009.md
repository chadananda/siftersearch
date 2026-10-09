# Backlog — Anís reading plans (an atomic reading habit)

**Requested:** Chad, 2026-10-09. **Status:** not started.

## The request
Anís helps a user **plan a year-long reading plan**, **modifies it along the way**, and **helps them through it**:
- **reads it to them part by part** using **OceanLibrary's audio** and **discusses each paragraph**;
- **remembers the plan and the user's position**;
- **congratulates** the user and **helps them move through the plan each day**.
The aim is the tools for an **atomic reading habit** — small, daily, sustained.

## What a plan is
- A list of **readings** (books or portions — chapters / sections from the heading path, or paragraph ranges) laid out
  over days, sized to the user's stated daily time ("10 minutes a day", "one chapter a week").
- Built in conversation: goals ("read all of Bahá’u’lláh's major works this year", "Dawn-Breakers by Ridván"), pace,
  rest days, language. Anís proposes; the user adjusts; the plan is versioned so changes don't lose progress.
- **Re-planning, not failing:** a missed day shifts or compresses the plan (the user chooses), never a "you fell behind".

## Daily loop
1. **Today's reading** arrives on the user's channel: the app (backlog-anis-app-20261009.md), email, or the plugin.
2. **Listen or read:** OceanLibrary's narration of exactly that portion (blocks are narrated, `data-audio`; ilm ids are
   stored — content.block_attrs.ilm_id — so the audio for a paragraph range can be found), or text with range links.
3. **Discuss:** Anís can talk through each paragraph — with the study-note machinery
   (backlog-anis-study-guides-20261009.md: people, terms, Tablets, who is speaking), at the reader's level.
4. **Mark done → encouragement:** streaks, milestones (first week, a book finished, 100 days), short and sincere, not
   gamified noise. Progress shown as the year's map.
5. **Gentle nudges** at the user's chosen time; never more than they asked for (the engagement rules already in the mail
   system: caps, pause link, quiet hours).

## What it needs
- Per user: plan (versioned), position, history of readings done, preferred time/channel, streak — in Anís's D1 history.
- Readings resolved to concrete ranges (doc, first/last paragraph) so position is exact and audio/range links work.
- Audio: a lookup from OceanLibrary block id to its narration file / timing (ask Solvve how audio is addressed — part of
  the publication-API conversation); voice playback ties to backlog-anis-voice-20261009.md.
- Scheduled sends: the Worker cron already runs Anís mail jobs (`0 * * * *` planners) — a daily reading job fits there.

## Open questions
1. Which channel first — email daily reading (works today) or the app?
2. Audio rights/hosting: can the plugin/app stream OceanLibrary narration directly?
3. Shared plans: a study circle reading together (same plan, shared discussion)?
4. Plan templates to start from (a year of the Writings, a history track, a single book)?

## Done when
A user can ask Anís for a year plan, get one sized to their time, receive and listen to each day's portion with the
OceanLibrary narration, discuss it, have the plan adjust after missed days, and see their progress and streak — and
Anís picks up exactly where they are each day.
