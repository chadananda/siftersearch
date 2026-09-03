# Handoff — Conversation Threads (list + share, tied to Dialogue)

**Goal (user's words):** a threads table to track conversation threads; users see their previous
conversations (AI-named) and can share them. "Discussions" (the **Dialogue** section) already exists —
tie the two together.

## ⭐ The key insight: most of this is ALREADY BUILT. This is a WIRING job, not a green-field build.

Do **not** create a new "threads" table. It exists as **`chat_sessions` + `chat_messages`** (migration 51,
`api/lib/migrations/v46-v58.js`). The publish/share pipeline and the Dialogue UI also exist. The gap is that
the **site's live chat endpoint doesn't persist to these tables**, and there's no "my conversations" UI.

## What already exists (verified 2026-08-08)

### Schema (migration 51, v46-v58.js)
- **`chat_sessions`** — `id` (`conv_<uuid>`), `tenant_id`, `user_id` (nullable → anon ok), **`title`**
  (generated lazily once rounds ≥ 2), `started_at`, `last_activity`, `message_count`,
  `status` (active|published|archived|deleted), **`published_slug`**, `metadata_json`. ← **this IS the threads table.**
- **`chat_messages`** — `session_id` FK (ON DELETE CASCADE), `round_index`, `role`, `content`,
  `tool_calls_json`, `tool_name`, `created_at`.
- **`published_conversations`** (migration 51 too) — the shareable, AI-named, anonymized artifact:
  `tenant_id`, `slug` (unique per tenant), `title` (question form), `description`, `question`, `topic`,
  `tags_json`, `keywords_json`, `excerpt`, `hero_image`, `rounds_json`, `share_url`,
  **`conversation_id`** (→ `chat_sessions.id`), `published_at`. ← the "Discussions"/Dialogue rows.

### Backend endpoints
- **`POST /api/v1/chat`** (`api/routes/public-api.js` ~line 1054) — **DOES persist**: accepts
  `conversation_id`, loads prior `chat_messages`, creates a `chat_sessions` row on first message, tracks
  rounds. This is the tenant/API chat path.
- **`GET /api/v1/conversations/:slug`** (public-api.js ~215) + **`GET /api/v1/conversations/:tenant/:slug`**
  (content.js ~182) — PUBLIC read of a published conversation.
- **`POST /api/v1/admin/conversations/save`** (`api/routes/content.js` ~452) — the **publish/share** flow:
  calls `generatePublishMetadata` (AI title/slug/tags/excerpt, question-form title), `anonymizeUserTurns`
  (regex + gpt-4o-mini PII scrub), `generateRoundSummaries` → writes `published_conversations` → returns
  `https://siftersearch.com/dialogue/{slug}/`. SSE-streams progress.
- Publish logic lib: **`api/lib/publish-pipeline.js`** (`generatePublishMetadata`, `generateRoundSummaries`,
  `anonymizeUserTurns`, `pairRounds`).

### Frontend (Dialogue = "Discussions")
- `src/pages/dialogue/index.astro`, `dialogue/[slug].astro`, `dialogue/category/[topic].astro`,
  `dialogue/tag/[tag].astro`, `dialogue/assessment.astro` — render `published_conversations`. Nav label = **Dialogue**.
- Site chat component: **`src/components/ChatInterface.svelte`** (mega-file, 5,371 lines) — calls
  **`/api/chat/stream`** (line 141), the SSE endpoint in **`api/routes/chat.js`**.
- `src/lib/api.js` (~537) references the OTHER path, `/api/v1/chat`.

## ⭐ DESIGN DECISION (Chad, 2026-08-08): sanitize at INGEST, not just at publish

**Store a sanitized RESTATEMENT of each user turn — raw PII never enters durable storage.**
This supersedes "sanitize only in the publish pipeline" as the primary privacy mechanism.

- **Per-turn pre-pass** in `/api/chat/stream`: one fast model call (piggyback on the existing
  query-understanding calls — `query-intent.js` / `query-decompose.js`) returning
  `{restated_turn, pii_found, abuse: {flagged, category}}`. `chat_messages.content` stores ONLY
  the restatement; the raw text exists only in request memory.
- **Feed Jafar the RESTATEMENT, not the raw turn.** This structurally eliminates the
  assistant-echo leak (the answer can't contain a name the model never saw). No assistant-turn
  scrubbing needed.
- **Surgical, not summarizing:** replace identifying details (names, cities, employers, ages,
  family-member names — INCLUDING third parties, anti-doxxing) but KEEP situational/emotional
  context ("my father just died" survives; "I'm Sarah Chen, a nurse at Providence Portland" →
  "I'm a healthcare worker"). Referents must stay stable across turns ("my daughter" stays
  "my daughter") so multi-turn coreference keeps working.
- **Abuse gate at the same choke point:** OpenAI moderation endpoint (free, ~100ms) + the LLM
  flag as backstop. Outcomes: clean → normal; sensitive → answered but session marked
  never-publishable (excluded from share/RSS/quality-corpus IN THE SQL, not just UI);
  abusive → declined/generic reply, session flagged, repeats rate-limit the anon id.
- **Publish gate stays as defense-in-depth:** existing `anonymizeUserTurns` + a verification
  grade + a user-facing sanitized preview before publish. AND fix the fail-open bug:
  `content.js` ~463 currently publishes the RAW transcript if sanitization throws — must
  fail closed (abort or `status='pending'`).
- Side benefit: an already-sanitized corpus is directly usable for conversation-quality
  assessment and hype-question mining with no privacy review step.
- Note: the AI-generated dialogs currently in `/dialogue/` are TEST content (quality-assessment
  scaffolding) — don't treat them as the bar for the user-share flow.

## Review findings (2026-08-08 implementation review)

- **RSS missing but advertised:** `sitemap-dialogue.xml.js` emits `/dialogue/rss.xml`, which
  doesn't exist (302s live). Build it, plus the per-tenant feed the product wants:
  `GET /api/v1/conversations/:tenant/rss.xml` from `published_conversations WHERE tenant_id=?`.
- **No user share path:** `POST /admin/conversations/save` is admin-key-only and hardcodes
  `DIALOG_TENANT='siftersearch'`. Need `POST /api/v1/conversations/share` (user/anon auth,
  rate-limited, tenant from widget key) → sanitize → preview → publish.
- **Dangling linkage:** `published_conversations.conversation_id` exists but the save endpoint
  never writes it; nothing sets `chat_sessions.published_slug`. Wire both on publish.
- **Widget threads = same store, different chrome:** thread support is a server-side property.
  Anon id in host-page localStorage → `chat_sessions` key; history drawer (slide-over) instead
  of sidebar; auto-resume last active thread; share → copy-link card. Per-thread delete +
  retention TTL on anon sessions (e.g. 90d idle purge).

## THE GAP (what to actually build)

1. **The live site chat does not persist.** `ChatInterface.svelte` → `/api/chat/stream` (`chat.js`) writes
   **nothing** to `chat_sessions`/`chat_messages` (grep-confirmed: only a docstring mentions "thread"). That's
   why conversations are in-memory only and a reload wipes them (confirmed in browser QA 2026-08-08).
   **Fix (pick one):**
   - (A) Add persistence to `/api/chat/stream`: mint/reuse `conversation_id`, append user+assistant rounds to
     `chat_messages`, bump `chat_sessions.message_count`/`last_activity`, lazy-generate `title` at round ≥ 2.
     All writes via the **single writer** (`query()` routes to :7849). ← recommended (least frontend churn).
   - (B) Migrate `ChatInterface.svelte` onto `/api/v1/chat` (already persists) — bigger frontend change; that
     path may not stream the same way. Verify SSE parity first.
2. **"My conversations" list UI.** New endpoint e.g. `GET /api/v1/chat/sessions` → the caller's `chat_sessions`
   (title, last_activity, published_slug), newest first. Logged-in = filter by `user_id`; anonymous = need a
   stable client id (the widget already emits a client session id; the site sets an anon fingerprint — see
   `api/lib/anonymous.js`). Frontend: a sidebar/drawer in `ChatInterface.svelte` listing titles; clicking one
   loads it back (`GET /api/v1/chat/:conversation_id` replaying `chat_messages`).
3. **Share from the chat UI.** Wire a "Share" button → existing `POST /api/v1/admin/conversations/save`
   (note: currently under `/admin` — decide whether user-initiated share needs a non-admin, rate-limited
   variant, or reuse with the user's session). On success set `chat_sessions.status='published'` +
   `published_slug`, show the `/dialogue/{slug}/` link.
4. **Tie threads ↔ Dialogue.** `chat_sessions.published_slug` ↔ `published_conversations.slug` /
   `.conversation_id`. In the "my conversations" list, show a "shared" badge linking to the Dialogue page.
   The AI naming for the private thread (`chat_sessions.title`) can reuse `generatePublishMetadata`'s
   title logic (question-form) or a lighter title-only prompt.

## ⭐ TESTING CONTRACT (Chad, 2026-08-08): clean API seam + ARIA-driven BDD

**Architecture rule: the chat component ↔ server relationship is a clean API contract.** The
Svelte UI holds no business logic that the API can't be tested without. Concretely:

1. **API layer — trivially testable, no browser.** Every threads endpoint
   (persist-on-stream, `GET /sessions` list, `GET /:conversation_id` load-back, share/publish,
   RSS) gets vitest coverage in `tests/api/` (`npm run test:api`, in-memory better-sqlite3 per
   existing convention). The ingest sanitize/abuse pre-pass is a pure function in `api/lib/` —
   unit-test restatement rules (identity stripped, flavor kept, stable referents) and gate
   outcomes (clean/sensitive/abusive) with mocked model calls, no HTTP needed.
2. **UI critical path — Gherkin BDD in the existing cucumber-js harness** (`tests/features/`,
   tagged + profiled like the rest: e.g. `threads.feature` with `@critical` scenarios, run via
   `npm run test:bdd:critical`). Critical path: send message → thread persists → reload →
   thread listed by AI name → open thread → history intact → share → sanitized preview →
   published link works. Use the QA test-admin for authed scenarios.
3. **ARIA attributes are the ONLY locator strategy** — dual purpose: accessibility AND
   testability. Every new interactive element in the drawer/share flow ships with explicit
   roles/labels (e.g. `role="navigation" aria-label="Conversation history"`, list items as
   `role="listitem"` with `aria-label` = the AI title, `aria-label="Share conversation"`,
   `aria-current` on the active thread, `aria-live="polite"` on the streaming answer region).
   Step definitions bind ONLY to `getByRole`/`getByLabel` — no CSS/test-id selectors. The
   `bdd-playwright` skill encodes this convention; load it when writing the tests.
- **Single-writer only** — all DB writes via `query()` → `:7849`; never direct sqlite. (`chat.js` is on the
  read-only API process, so persistence there MUST go through `query()`, which already routes writes.)
- **Anonymize before publish** — `published_conversations` are public; the save pipeline already scrubs PII.
  Keep that gate; never publish raw `chat_messages`.
- Frontend changes ship via the **pre-commit hook** (astro build + `wrangler pages deploy`), NOT `--no-verify`.
  Backend changes ship via git push → updater. Bump version before deploy (minor for code).
- `ChatInterface.svelte` is a 5,371-line mega-file with **no automated tests** — manual browser verification
  required (use the QA test-admin: `test-admin@siftersearch.com`).
- Decide the **anonymous vs logged-in** story early — it drives whether the list endpoint keys on `user_id`
  or an anon id, and whether anon threads are even listable across devices (probably not).

## Suggested first steps for the fresh session
1. Read `api/routes/public-api.js` lines ~1040–1130 (the working persist logic in `/api/v1/chat`) — copy its
   session/round handling into `/api/chat/stream` (or lift into a shared helper in `api/lib/`).
2. Read `api/routes/chat.js` end-to-end to see the SSE round loop and where to hook the persistence writes.
3. Confirm the anon-identity source for the site chat (`api/lib/anonymous.js`) before designing the list endpoint.
4. THEN design the UI (conversations drawer + share button) in `ChatInterface.svelte`.

## Related open items from this session (not blocking, but adjacent)
- Cross-tradition retrieval contamination (Bahá'í Q pulled in Sikh/Hindu passages) — search relevance, separate.
- Follow-up pronoun mis-resolution + ungrounded fallback when retrieval is empty — chat quality, separate.
- QA test-admin now exists + is self-healing (see memory `project_qa_test_admin_user`).
