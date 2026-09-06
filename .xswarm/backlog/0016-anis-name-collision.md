---
id: "0016"
title: Two different things are called Anis
state: done
blocked_on: Chad — are these one product or a name collision?
traces_to: .xswarm/GOAL.md
priority: P1
size: S
class: never
acceptance:
  - text: it is settled whether these are one product or two, and one of them is renamed if two
---

## Finding, 2026-09-06
Chad: "We will generally call it Anis, as that is the code-name for the chat
companion project." Two distinct things already carry the name:

**`open-local.org/apps/anis`** — package `@ol/anis`, its own Worker and D1.
Its README:

> The Anis service — a separate Worker with its own D1, holding the two
> genuinely network-scoped things: **seeker identity and the do-not-recommend
> flag**. Sites report; Anis remembers; nothing crosses back. A site never
> learns whether a flag was already set, and a site never holds the list.

That is an identity and consent service. It is not a chatbot.

**`siftersearch.com/src/widget/`** — `element.js`, `SifterChat.svelte`,
`WidgetManager.svelte`. This is the chat, and it is called SifterChat.

## Resolved 2026-09-06 — one product

Chad: SifterSearch publishes a chatbot as a web component that can be added to
any website. **That is the Anis project.** Broader in scholarship than Jafar on
CTAI, with a mandate to hyper-engage the user across channels — chatbot and
email for now.

So `@ol/anis` is the **memory** layer of that product, not a different thing
wearing the same name. Only the interface is misnamed: SifterChat becomes Anis.
See `.xswarm/ANIS.md`.

## The two readings, as they stood
* **One product.** A companion that follows a seeker across sites needs exactly
  what `@ol/anis` provides — identity and a do-not-recommend flag. Then Anis is
  the product, SifterChat is its interface, and `@ol/anis` is its memory. The
  naming is already right and only SifterChat needs renaming.
* **A collision.** They were named independently and one must change.

## Why this is worth settling now
Anis is about to be deployed to client sites. A name meaning two things across
several repositories is the kind of confusion that is cheap to fix today and
expensive once it is in three deployments and a README.
