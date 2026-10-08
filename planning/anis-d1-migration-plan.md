# Anís on Cloudflare: one history in D1, tower as the library engine only

Status: draft for Chad, 2026-10-07. Nothing built yet.

## The rule (Chad, 2026-10-07)

> One history for Anis, stored on the D1 database. The Tower-NAS server should be kept intentionally minimal to what can
> only be done there: massive library and indexed search. … The Tower-NAS functionality should communicate cleanly only
> with the web server on CloudFlare and the user code should never touch it except through the Cloudflare supported and
> cached internal API.

So there are two layers with one seam between them:

| Layer | Owns | Never owns |
|---|---|---|
| **Cloudflare Worker + D1** | People, conversations, Anís turns, memory, companion state, profiles, consent, sharing, API keys and usage | The library, indexes, embeddings |
| **Tower (internal API)** | The library, Meilisearch / Qdrant, SourceHunt, entity graph, batch pipelines | Any per-person data |

## What sits on tower today and must move

Measured 2026-10-07 in `sifter.db` (`users.db` is empty):

| Table | Rows | Moves to D1 as |
|---|---|---|
| `users`, `user_profiles` | 6, 0 | `people` (one person across sites and channels) |
| `chat_sessions`, `chat_messages` | 271, 663 | `conversations`, `turns` (the Anís exchange log) |
| `published_conversations` | 21 | `shared_conversations` |
| `companion_relationship`, `companion_exposure`, `companion_dials_global` | 36, 40, 1 | `companion_*` |
| `companion_memory`, `_premise`, `_enrollment`, `_progress` | 0 | same names (created empty) |
| `api_keys` | 8 | `api_keys` (the Worker already fronts the public API) |

Small enough to copy in one pass. The work is in the code that writes these tables, not the data.

**Code touching per-person tables (2026-10-07):** 21 files, about 170 SQL statements. Two groups, moved in this order:

1. **Anís history** (the first move): `api/lib/anis/exchange-log.js` (12), `api/lib/threads.js` (2), `api/lib/companion/store.js`
   (29), `api/routes/companion.js` (4), published conversations in `api/routes/content.js` / `public-api.js`.
2. **Accounts and everything else personal** (later): `auth.js` + `routes/auth.js` (24), `routes/user.js` (12),
   `api-keys.js` + routes (9), `anonymous.js` (6), `billing.js`, `routes/donations.js`, `routes/forum.js` (10),
   `services/verification.js`, `routes/admin.js` (19, the user admin screens).

Sign-in (One Tap, email codes) and API keys already pass through the Worker, so moving them is mostly moving their tables.

## Where Anís runs

Today one Anís turn runs on tower: log → triage → search or source hunt → one model call → output check → log. Under the
rule the turn moves to the Worker, which asks tower only for library work:

```
browser / email ──► Worker (siftersearch.com)
                     ├─ D1: who is this, their memory, the conversation so far        (person)
                     ├─ triage (Jev, external)                                          (decision)
                     ├─ tower internal API: /search, /source-hunt, /entities, …         (library, cacheable)
                     ├─ the one model call (Workers AI / provider)                      (words)
                     └─ D1: write the turn, update memory                               (person)
```

Tower endpoints stay stateless: given a query and filters, return passages. They receive no person ids. That makes their
answers cacheable at the edge and keeps tower replaceable (hosted later, or partly rebuilt in Workers/Vectorize).

## Phases

1. **PersonStore seam (on tower, no behaviour change).** All reads and writes of the tables above go through one
   interface (`api/lib/person-store.js`): `getPerson`, `appendTurn`, `getConversation`, `getMemory`, `putMemory`, … Today it
   writes to SQLite. Tests pin the interface.
2. **D1 schema + Worker routes.** Create the D1 database and bind it in `wrangler.jsonc`; implement the same interface in the
   Worker (`worker/person-store.js`) with internal routes the tower implementation can call during the transition.
3. **Dual write, read from SQLite.** PersonStore writes both; a nightly check compares row counts and recent turns.
4. **Move the Anís turn into the Worker.** Port `api/lib/anis/{turn,respond,triage,canned,lint,quotes,formats}` (pure
   modules, mostly portable); tower keeps `/search`, `/source-hunt`, entity routes. The widget and email call the Worker only.
5. **Read from D1; stop writing to tower.** Copy history once, switch reads, drop the tower tables after a quiet week.

Phases 1–3 are safe to do any time. Phase 4 is the real move and should follow the demo.

## Decisions needed

- **D1 size and retention:** history kept indefinitely for connected people, 30 days for anonymous sessions? (Companion
  rule: connecting is the consent to be remembered.)
- **Model call location:** call the provider from the Worker (keys as Worker secrets), or Workers AI where quality allows.
- **Cache policy for tower endpoints:** which responses are cacheable (search: yes, keyed by query + filters; source hunt:
  yes; anything person-specific: never, because tower never sees a person).

## Requirements added 2026-10-07 (Chad)

- **Identity:** an anonymous visitor is a client-generated id in localStorage (the widget already keeps
  `sifter-chat-sid:<token>`). On login, every such id's conversations merge into the person's one history in D1. No login,
  no merge.
- **Host-site precedence:** when Anís is hosted on a site (e.g. oceanoflights.org), that site's materials come first:
  1. *ranking* — passages from the host's collection are preferred (not filtered: the whole library still answers);
  2. *links* — when the cited text also exists on the host site, the answer links to the host's page, ahead of the usual
     public-copy order (OceanLibrary › Ocean of Lights › Phelps › BLO).
  Today `chatbot_location → scope_config` only decides which site indexes are *included*; precedence is not built.
  Why it matters: site owners host the chat only if it sends readers to their pages.
