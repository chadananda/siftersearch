# SifterChat Widget — Execution Plan (grounded in the real architecture)

**Derived from:** `~/Downloads/sifter-widget-prd.md` (goals adopted; its infra assumptions discarded)
**Status:** Draft for review — 2026-08-08

## Goals (restated, system-agnostic)

- **G1 Embed:** one script tag gives any host site an AI chat answering from the religion libraries, scoped per site.
- **G2 Site-aware:** the assistant also searches the host site's own content and can navigate visitors to its pages.
- **G3 Tiers:** anonymous free tier → Google sign-in unlocks bigger quota, persistent history, save/share.
- **G4 Flywheel:** best conversations become shared pages on siftersearch.com + an RSS feed the webmaster can republish.
- **G5 Self-serve:** webmaster registers a site, configures, embeds, sees analytics.
- **G6 One platform:** per-profile branding/config; one codebase; SifterSearch gets distribution + accounts.

## Architecture: everything maps onto what exists

**No new data plane.** No D1/KV/R2 state, no Hetzner, no site2rag revival. One SQLite source of truth via the
single writer; Cloudflare stays edge-cache/tunnel/Pages only.

| Capability | Lives in | Notes |
|---|---|---|
| Widget bundle | Svelte 5 custom element → static asset on siftersearch.com | ships via the existing pre-commit CF Pages deploy |
| Widget API | NEW `api/routes/widget.js` on the existing Fastify API | public via api.siftersearch.com (tunnel); config GET edge-cached via Cache-Control |
| Chat | thin wrapper over the **Jafar pipeline** (`/chat/stream` SSE pattern) | profile injects: library filter, persona fragment, site scope, model tier |
| Sessions/quotas | `api/lib/anonymous.js` (fingerprint, rate-limit) + new `widget_sessions` | sid 128-bit, origin-bound, 30-day sliding; Turnstile verified server-side (siteverify — no Worker needed) |
| Retrieval incl. host-site | `multiIndexSearch` + `scope_config` (3-class site scoping, already serving) | dual corpus+site with host boost = a scope/weight config, not new code |
| Site ingestion | `sites-ingester` + `site-adapters` + `sites.yaml` | needs ONE new **generic adapter** (sitemap + extraction); replaces the PRD's site2rag dependency entirely |
| Accounts | `api/lib/auth.js` JWT + users table; One Tap was already on the 2026Q1 roadmap | intermediate iframe on siftersearch.com; popup fallback is a first-class path |
| Save/share pages | the existing dialog publication pipeline (save→rate→anonymize→publish) + `published_conversations` + Astro Live Content Collections | `/c/{slug}` = same pattern as docs pages; edge-cached; no rebuild |
| RSS | trivial Fastify route over `published_conversations` filtered by origin profile | edge-cached |
| Spend safety | `ai_usage` metering + the `grounding_budget` ceiling pattern, per-profile | same fail-closed style as grounding budgets |
| Analytics | `widget_events` table via single writer (batched inserts) + daily rollups | Workers Analytics Engine explicitly rejected |
| Profiles/config | new `widget_profiles` table (token, domains[], config_json, tier) + admin CRUD | Phase 1: rows created by hand via admin API; wizard is Phase 5 |

**Model policy:** widget chat defaults to the cheap tier (DeepSeek for en/ar/he per the standing spend policy;
paid models remain Persian-only). Per-profile daily ceiling + global cap, fail-closed, graceful widget message.

## Phases — each independently shippable and testable

### Phase 0 — Skeleton (1 session)
Migration: `widget_profiles`. `GET /api/v1/widget/config/:token` (origin-checked, edge-cached).
Bare `<sifter-chat>` custom element: bubble → panel, fetches config, renders theme vars, stub reply.
Build target: standalone compiled element, <30KB gz budget from day one.
**Test:** embed on a local page + one real page; origin lock rejects others. Vitest: config resolution
(defaults ← profile ← tag attributes).

### Phase 1 — Corpus chat MVP (dogfood)
`POST /widget/session` (Turnstile + origin bind) · `GET /widget/session/:sid` (rehydrate) ·
`POST /widget/chat/:sid` → Jafar wrapper (library scope + persona, SSE streaming, citations linking to the
canonical library pages). Anonymous quotas (per-sid + per-IP) → 429 `{upgrade:true}` → styled "sign in to
continue" stub. Conversations/messages persisted (reuse/extend existing conversation tables).
**Ship:** dogfood on one owned site. **Test:** vitest for session/quota/chat-shape; manual battery of scoped
questions; spend metering visible per profile in ai_usage.

### Phase 2 — Host-site awareness
The **generic site adapter** (sitemap-first crawl, robots.txt, readability extraction, page cap per tier,
daily diff re-index) — the only genuinely new engine work in the project. **Design rule:** keep a clean
crawler→ingester boundary (crawler emits pages; ingester consumes) so site2rag can replace the crawler in
Phase 6 without touching anything downstream. Profile flag "index my site" →
sites.yaml entry → ingest → scope_config dual retrieval with host-site boost + find/navigate intent weighting.
`navigateTo` tool in the widget chat toolset; `#sifter=` deep links; session survives navigation via sid.
**Test:** adapter vitest on fixture sitemaps; retrieval battery fixtures for host-vs-corpus ranking.

### Phase 3 — Accounts (One Tap)
Auth iframe page on siftersearch.com (Intermediate Iframe API) + popup OAuth fallback → `POST /widget/upgrade`
(Google ID token → users row → JWT) → link anon history to account; signed-in quota tier; cross-device history.
**Test:** the fallback path is primary-tested (third-party-cookie reality); token verification vitest.

### Phase 4 — Share + RSS (flywheel)
Widget save/title/share UI → existing publication pipeline (clean/anonymize/polish) → `/c/{slug}` Astro page
(Live Content Collections, OG tags, citations, "ask your own question" CTA embedding the widget) →
unshare=410 · `GET /feed/{profile}.xml` (drafts-only framing; canonical URLs point at share pages).
Moderation: existing admin review pattern + per-profile hide.
**Test:** publish-pipeline vitest already exists — extend for widget-origin conversations.

### Phase 6 (FUTURE — explicitly deferred) — site2rag merge
Decision 2026-08-08 (Chad): site2rag integration is IN, but as a future phase — the projects are not ready
to merge yet. When they are: site2rag becomes the crawler service behind the Phase-2 boundary (its listing
gives new profiles instant site-awareness; widget opt-ins feed its catalog — the PRD §4.2 feeder dynamic).
Until then the in-repo generic adapter carries site awareness. Do not couple to site2rag before this phase.

### Phase 5 — Portal + analytics
Astro portal (server-side auth per the established middleware pattern): profile wizard (domain verify via
DNS TXT/meta, theme suggestion + live preview, embed snippet), webmaster dashboard (conversations/day, top
questions = content-gap report, host pages surfaced, click-throughs, upgrades), admin scope (all profiles,
spend vs caps, moderation queue). `widget_events` ingest (sendBeacon batches) + daily rollups.

## Locked decisions (2026-08-08, Chad)

- **site2rag:** IN, but future phase only (Phase 6) — projects not ready to merge; interim = in-repo generic adapter behind a swap-clean crawler boundary.
- **Dogfood sites (Phase 1):** bahai-education.org + the Long Beach community website — first two `widget_profiles` rows.
- **Model tier:** DeepSeek default for widget chat (standing spend policy: paid models Persian-only), per-profile daily ceiling fail-closed.

## Decisions adopted from PRD open questions

1. Phase 1 = origin-allowlist trial, no registration. 2. Shares = polished Q&A (what the pipeline already
does) with transcript toggle. 3. RSS drafts-only default, auto-publish per-feed opt-in. 4. Starting knobs:
5 msgs/session, 15/IP/day, 500 pages/site. 5. History per-site in widget; unified view on siftersearch.com
only. 6. Site content: single index + filterable site attr (matches existing supplemental-sites scoping).

## Risks / watch items

- **Generic adapter quality** is the real engineering risk (arbitrary-site extraction). Mitigate: start
  sitemap-only + readability, per-tier page caps, manual QA on first 3 sites.
- **One Tap browser policy churn** — treat popup fallback as ~half of upgrades, not an edge case.
- **API blast radius** (widget on N sites → tower-nas): quotas + Turnstile + edge-cached config + spend
  ceilings; revisit an edge session layer ONLY if p95 latency or volume demands it (measured, not assumed).
- **Bundle budget** <30KB gz enforced in CI from Phase 0 (a Svelte element + fetch/SSE fits comfortably).
