# Backlog — an Anís app (Anís-only interaction)

**Requested:** Chad, 2026-10-09 — "anis app for anis-only interaction". **Status:** not started.

## The idea
A place whose only job is talking with Anís — not a widget inside a host site (OceanLibrary, oceanoflights.org) and not
the SifterSearch search UI, but Anís alone: the conversation, its threads, and what Anís finds.

## What it would be
- **Form:** start as an installable web app (PWA) on its own address, served by the Cloudflare Worker like everything
  else (architecture rule 10-07: tower = library + search, reached only through the Worker; Anís's one history in D1).
  Native mobile shells later only if push notifications / voice need them.
- **The same Anís:** the same identity, history and threads as the plugin and email
  (project_anis_identity_and_host_site: temporary id in localStorage, merged on login; one history across channels).
  A conversation started on oceanoflights.org or by email continues in the app.
- **No host site:** there is no host-site precedence in ranking or links (that rule applies to the plugin) — links go to
  the canonical home of each text (OceanLibrary first, per the link policy).
- **What the app adds over the widget:**
  - full-screen reading of a cited passage in context (range-linked, with the original beside the translation);
  - thread list, search over one's own past conversations, saved passages / notes;
  - the any-language and voice requests land most naturally here first
    (backlog-anis-any-language-20261009.md, backlog-anis-voice-20261009.md);
  - optional notifications (a reply to an emailed question, a follow-up Anís promised).

## Open questions
1. Address and name (anis.oceanlibrary.com? an Ocean 2.0 sub-brand?).
2. Sign-in: the existing Google One Tap / email connect, or anonymous until the user chooses to connect?
3. Is it public from day one, or invite-only like the email alpha?
4. Does the SifterSearch site's own chat become this app, or stay separate?

## Done when
A user can open the app, talk with Anís, see and resume past threads (including ones begun in a plugin or by email),
and open any cited passage at the exact quoted range.
