---
title: Anís
description: The research companion — a chat on many sites and an email address — answering from the library, in the reader's interest
role: Interactive · Research companion
icon: message-circle
order: 1
---

# Anís

**"Anís" means companion.** Anís is the product: an AI research assistant people talk to on any host site (a web
component) and by email at **anis@oceanlibrary.com**. Everything else in SifterSearch (the library, the index, the
search strategies) exists so Anís can answer well.

## Soul

The live prompt is the source of truth: `api/lib/anis/soul.md` in the repository.
In short:

- **Loves every tradition** and helps people find wonder in traditions not their own, while keeping apart what a
  tradition's own literature says, what its authorized interpreters say, and what is popularly believed.
- **On the person's side, not their opinion's.** Answer first; name what is right in what they said; question rather
  than pronounce; disagree once, with the passage, and let it rest.
- **The texts speak; Anís explains.** Facts come only from the sources in hand. Its own readings are marked as its own.
  "I can't find that" is an honest answer.
- **No pressure, ever.** No urgency, guilt, flattery or conversion; never uses grief or doubt as an opening.
- **An AI, and says so.** An experimental research assistant with its own email address; speaks as a companion among
  seekers, never for a community or institution.
- **Voice:** warm, plain, alive to wonder; no imitation of scriptural language outside quotation.

## Purpose

- Answer questions about the world's sacred texts **from the library**, with the passages shown and linked
  (OceanLibrary range links, originals where we hold them).
- Help people **keep studying**: the next text, the next question, a reading plan, a letter that follows up.
- Send readers **to the host site's own pages first** — sites host Anís because it sends readers to them (planned).

## How a turn works

One pipeline for every channel (`api/lib/anis/turn.js`):

1. **Write it down first** — the message is logged as a pending turn before any model runs (exchange log).
2. **Triage** (Jev, System-1): real question, small talk, junk or abuse → canned reply / hidden tarpit / research.
   Non-research replies cost zero LLM tokens.
3. **Research** (`respond.js`): Jev plans the search; retrieval is raw search with **no LLM in the loop**; findings
   (people, claims, scenes, terms) are gathered in code.
4. **One answer**, streamed, in one of 17 formats chosen against the question, the data and the channel.
5. **Checks** — unverified quotes are dropped, the output is checked for persona breaks, voice lint.

## Tools

| Tool | What it gives Anís | Where |
|---|---|---|
| Planned search | passages from the whole library, every tradition; question frames stripped, quoted voices tiered | `api/lib/planned-search.js` |
| Source resolution | each quote served from its original work, copies listed as "also in" | `api/lib/source-resolve.js` |
| People and encounters | who someone was, who met whom, who was at an event — with cited evidence | `api/lib/people-answer.js` |
| Term study | the Arabic/Persian word, its root, how Shoghi Effendi rendered it, paired passages (CTAI concordance) | `api/lib/anis/ctai-term.js` |
| Deep research | stored, checked research on recurring questions | `api/lib/deep-research.js` |
| Answer formats | direct answer, yes/no with proof, decisive passage, range of voices, authority layers, popular vs literature, term with original, find passage, people record, list, timeline, comparison (+table), reading suggestion, study question, honest absence, letter | `api/lib/anis/formats.js` |
| Channels | widget chat, site chat, email — each with its own length, tone and capabilities | `api/lib/anis/channels.js` |
| Mail | inbound threading, drafts, stop/pause, bounces; outbound via SES | `worker/mail/` |

## Sample scenarios

1. **"Where does Bahá'u'lláh say the earth is but one country?"** → find-passage format: the decisive passage from
   Gleanings, linked to its exact range on OceanLibrary, with the Persian original beside it and "also quoted in …".
2. **"What does 'Sun of Truth' mean?"** → term with original: the Arabic, its root, how Shoghi Effendi rendered it, two
   passages that use it, and the Íqán's own explanation.
3. **"Did Ṭáhirih meet Quddús?"** → people record: met · contested · no evidence, each with the cited passage and date.
4. **"Do all religions teach the Golden Rule?"** → range of voices: one passage per tradition, then — marked as Anís's
   own reading — what is shared and what differs beneath the shared words.
5. **An email, two weeks later:** "I neglected to mention — I can also show you the original Arabic of any passage you
   quote." (Onboarding letters; drafts reviewed by Chad unless the sender was invited.)
6. **"asdf lol"** → canned reply, zero model cost. Repeated abuse → hidden tarpit.

## Memory strategy

**Today**
- One history per person across channels: each turn is logged before it is answered (`exchange-log.js`); a thread is the
  person's most recent active one.
- The prompt carries the last few turns verbatim.
- Email threads live in Cloudflare D1 (`anis` database); web history still lives on tower.

**Planned (PRD P2, `planning/anis-d1-migration-plan.md`)** — the rule of 10-07: *one history for Anís, in D1; tower is
the library and search only.*
- **Identity:** a temporary id in the browser, merged into the person's record when they connect (One Tap or email).
- **L0** recent turns verbatim · **L1** a rolling summary of each thread · **L2** a short person profile (interests,
  level, traditions) — consented, viewable, exportable, deletable.
- Retention: connected people kept; anonymous history expires (period to decide).

## Status

Built: answering (P0/P1), 17 formats, term study, email with threading and safety, onboarding letters (partial).
Next: **P2** — identity and history in D1, memory, profile. Then host-site precedence, any-language, the Anís app,
reading plans, study guides, voice. Detail: `planning/anis-hyper-engagement-prd.md`,
`planning/functionality-plan-20261010.md` §4.1.
