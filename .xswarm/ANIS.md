# Anis

_Confirmed by Chad, 2026-09-06. The chat companion published by SifterSearch._

## What it is

**A chatbot published as a web component**, embeddable in any website.
SifterSearch is where it is built and where its scholarship comes from; the
component is what ships.

Similar in kind to **Jafar** on CTAI.info — but **much broader in scholarship**.
Jafar is expert in one thing, Shoghi Effendi's translations, drawn from the
jafar database. Anis draws on the whole SifterSearch corpus.

## Its mandate

**Hyper-engage the user across multiple channels.** For now: the chatbot itself
and email. The channel list is expected to grow.

That mandate is what separates it from a search box with a chat skin. A search
box answers and forgets. Anis is meant to continue a conversation with a person
across time and surfaces.

## Where it goes

SifterSearch first — replacing the bespoke home page chat, so the site uses the
same component every client does (item 0015). Then client sites:
bahai-education.org, drbi.org, and others.

## Its parts

    interface   the web component — src/widget/ (currently named SifterChat)
    scholarship the SifterSearch corpus, entities, claims and search
    memory      @ol/anis — seeker identity and the do-not-recommend flag,
                a separate Worker with its own D1. Sites report; Anis
                remembers; nothing crosses back.

Chad confirmed 2026-09-06 that these are **one product**, not a name collision.
Only the interface needs renaming: SifterChat becomes Anis.

## What would falsify it

If visitors ask one question and never return, the engagement mandate is
unfounded and Anis is a search box with extra machinery. Return conversations
are the measure — not sessions, not questions answered.

Today: `widget 24h: 0 events / 0 sessions`. Nobody is using it at all, so
nothing about the mandate is currently being tested.

## What it inherits from Jafar

CTAI's three open Jafar items are the same problems one level narrower, and
whatever is learned there should transfer:

* an expert memory crystallised from a commissioned report, rather than
  answering only from retrieved examples
* always give several examples, not one — the range is the answer
* always give transliteration beside the original script, so an answer is
  readable by someone who cannot read it
