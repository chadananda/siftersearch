# Dewey v2 — from intake clerk to librarian and research agent (design, 2026-10-28)

Status: design only, nothing built. Author: Claude, for Chad.
Chad's complaint: Dewey cannot scrape pages, check progress, take ZIPs, fetch files from URLs, or send a completion summary with publish links; email and chat are separate. How do we make Dewey a full librarian/research agent?

Rules this design obeys (CLAUDE.md): data only through `api/lib/repos/*` + the internal ops API; tower serves, decides and publishes, workers do anything heavy (fetch big files, crawl, unzip, OCR, ffmpeg) through the job processor / worker image; edge-cached pages; no model-written mail (templates); HTML email only.

---

## 1. Audit — what exists (verified in code)

Chad's five claims are mostly true, but the picture is "partly there, in the wrong shape": a lot of the hard parts (holdings check, quality gate, OCR hand-off, scouts, mail door rules, R2 uploads) are good and reusable. What is missing is a **spine** (one job/case record) and a **tool belt** that is safe for tower.

| Capability | Status | Where in code / notes |
|---|---|---|
| Web chat (streaming, tools, photos/files/URL attach) | works | `src/components/dewey/DeweyChat.svelte`, `POST /api/dewey/chat` (`api/routes/dewey.js`), `api/lib/dewey/agent.js` (`deweyTurn`, 7 tools: check_holdings, add_to_wanted, attach_source, appraise_work, add_offered, add_media, list_wanted). Max 5 tool rounds. |
| Check progress ("how is it going?") | partial | Email: regex `STATUS` in `lib/dewey/mail.js` → fixed template of the sender's items (`itemsCreatedBy`). Chat: `list_wanted` (last 30 items) and the right-column "activity" (`GET /api/dewey/activity`, `import-board.js`). No per-job steps, no ETA, no "what is it doing right now". |
| Fetch a file from a URL | partial / unsafe | `identifyUrl` (`lib/dewey/identify.js`) fetches on tower, 20 s, whole body in memory, PDF/DOCX only, else reads HTML for a title. `attach_source` stores a URL on an item; the intake job downloads it. The scouts download copies (`lib/dewey/scout/*`). No resumable download, no size cap, no yt-dlp for pages, **no SSRF guard** (the only guard in the tree is `api/routes/covers.js`). Media: `add_media` queues `media-scan` (YouTube works). Violates tower placement for big files. |
| Scrape a page / crawl a site | missing | Only title sniffing in `identifyUrl` and per-site scout adapters (Wikisource, archive.org style APIs). No readability extraction, robots.txt, rate limit, sitemap sweep or page budget as a user-facing capability. |
| ZIP / archive upload | missing | Upload kinds in `worker/dewey-upload.js` (`KINDS`) have no archive kind; mail `planVerbs` answers "not a kind of file I can read". `jszip` is used only to read DOCX/EPUB internals (`convert.js`). Folder sweeps read a directory in place (`dewey-ingest-folder-job.js`), which is the closest thing to "many files at once". |
| File upload (large) | works | Browser → Worker → R2 multipart, resumable 3 days (`worker/dewey-upload.js`, `api/routes/dewey-upload.js`, `DeweyUploads.svelte`), quota 500 GB/member, 300 starts/h. `finish` creates a `received` item; `dewey-received` job streams docs ≤100 MB to the ingest folder; bigger/media wait. |
| Email in | works | Cloudflare Email Routing → `worker/mail/dewey.js` email() → D1 `mail_messages` (mailbox `dewey`), attachments in R2 `dewey-mail/`; door rules (bounces, auto-replies, list mail, CC, dupes, unauthenticated), Jev screen (`POST /api/v1/dewey-mail/screen`, `lib/dewey/screen.js`), debounce, then `/process` as an async job. |
| Email verbs | works, rigid | `planVerbs` (pure regex → photos/files/urls/media/titles/status; model never reads the letter as instructions) → `deweyMailTurn`. Limits: 5 files, 6 photos, 10 titles, 5 URLs, 25 MB per file. A "COMMAND" regex refuses instructions. Deliberate and safe, but it means mail cannot ask Dewey to *do* anything new. |
| Email out | partial | ZeptoMail via `worker/mail/zepto.js`; HTML templates (`letter.js`, `mail-render.js`); receipts (one work → summary, several → table), "now live" daily notes, book requests (approval-gated), digest to Chad, pause link, per-sender caps. **No job-completion email with publish links** — "now live" is a daily batch for email-contributed ingests only, and web-chat contributors get nothing. |
| Unified email + chat thread | missing | Chat thread = `dewey_messages(user_id, role, content, parts)` (migr 160, `appendMessage/threadOf`), shared across phone/desktop. Mail = separate D1 `mail_messages` with `threadKey`. They never meet: an email reply does not appear in chat and vice versa. |
| Holdings check (title/author/text/photo/preview) | works (strongest part) | `holdings.js` (+`holdings-worker.js`, `holdings-child.mjs` off-thread), `identify.js` (vision), `compare.js` full-text relations same/inside/partial/overlap, `check-memo.js` (`dewey_checks` by sha256, migr 161), `title-index.js`, `media-holdings.js`, `preview.js`, `whole.js`, `truncation.js`. |
| Quality gate / OCR / conversion | works | `prepare.js` (gate; in sites ingester, intake, main ingester), `quality.js`, `clean.js`, `convert.js`, `dewey-ocr-job.js`, `searchlayer.js`; jobs `dewey-intake`, `dewey-quality`, `dewey-archive`, `dewey-completeness`, `dewey-retitle`, `dewey-reimport`. Run via `ops_reports` queue (`ops-report-repo.js`: enqueue/claimNext/finish) in `siftersearch-reports`. |
| Offers / review / receipts | works | `dewey_items` (migr 158; states wanted→researched→source→processing→needs-ocr/needs-human→ingested, plus offered/declined/lead/to-buy), `review.js`, `DeweyReview.svelte`, signed public item page `GET /api/v1/dewey-mail/item/:id?t=`. |
| Scouts / daily pulse / folder sweeps | works | `lib/dewey/scout/*`, `dewey-scout-job.js`, pulse planned in `reports-worker.js` (auto-add top finds ≤15/day), folder sweeps (1,006 files swept per memory). Separate machinery, not on any shared job record. |
| Research tools | partial | `appraise.js` (Perplexity `perplexity.js` + Parallel `parallel-ai.js`, then a model verdict on scope/shelf/value/price/free text) and `research.js` (OpenLibrary + Google Books: ISBN, publisher, cover). Single-shot per work; no multi-step dossier, no crawl of candidate sources. |
| Memory / notes | missing | Only the last 12 messages go to the model (`deweyTurn`); `dewey_messages.parts`; `users.dewey_profile` column exists (migr user 8), unused as memory. Per-contributor stats only for book requests. |
| Permissions | works | `users.dewey_access`, tiers admin etc. (`canUseDewey`, `api/lib/auth.js:231`), `dewey_allowlist` (user migr 11; verified account with listed email gets access), API keys with the `dewey` permission; mail re-checks the contributor in `/process` ("the whitelist decides, not the caller"). Strangers get a how-to note. |
| What a "job" is today | partial, three kinds | (1) `ops_reports` runs (queued, claimed by the reports worker; params, result, resume) — durable, in DB; (2) `async-jobs.js` file-backed jobs (`data/jobs/`, keyed, idempotent, pid reaping) — used by `/dewey-mail/process` and Anís; (3) `dewey_items` rows with a `log` of state changes. Progress lives in item `log` + `import-board` stage inference. There is no record that says "this ZIP request = 38 files, 31 checked, 5 dupes, 2 waiting for you". |
| Cost accounting | partial | `metered()` in mail routes (`turn-meta.js`, usd per turn), `ai_usage`, Jev `systemone.ask` logs per task. No per-user/day cap for Dewey; no cap for research spend. |
| Abuse resistance | partial | Allowlist; mail door rules + screen; upload kind/size/quota/rate; `allowedPath` for server paths. Missing: SSRF guard on URLs, malware scan, archive-bomb limits, per-user daily cost cap, audit log of tool calls. |
| Observability | partial | Ops reports for sweeps; import-board; no `dewey-jobs` report, no SLOs. 26 dewey test files exist (good base: `dewey-agent`, `dewey-mail`, `worker-dewey-mail`, `dewey-upload*`). |

Net: Chad is right on the capabilities he lists. The unifying cause is that Dewey has **verbs but no jobs**: each action is a request/response or a one-off ops run, and nothing remembers "what was asked, what happened, who must be told".

---

## 2. Design v2

### 2a. One CASE per conversation, two channels (accept, with changes)

Idea: a **case** is the unit of conversation and work; email and chat are views.

- New table `dewey_cases` (id, user_id, title, status open|waiting|done|archived, last_activity, channel_pref, created_at) and **extend** `dewey_messages` rather than replace it: add `case_id`, `channel` (`chat|email`), `external_id` (Message-ID), `in_reply_to`, `job_id`. Existing rows backfill to one rolling "General" case per user so the live chat thread is unchanged.
- Threading in mail: every Dewey email carries `Reply-To: dewey+c<caseId>.<sig>@siftersearch.com` (plus-address, HMAC-signed so addresses cannot be guessed) and standard `In-Reply-To/References`. Inbound resolution order: signed plus-address > In-Reply-To match on `dewey_messages.external_id` > existing `threadKey` > sender's most recent open case > new case. Cloudflare Email Routing handles plus-addresses with a catch-all/pattern rule — verify before building (small spike in Phase 2).
- Channel-agnostic store: inbound mail text (after door rules + screen) is written as a `user` message on the case; the model-facing history is read from the case regardless of channel. Replies go out on the channel the user last used, unless a notification preference says otherwise (see 2d). Chat shows email turns with a small envelope marker; email shows nothing of chat unless the job completes.
- **Safety keeps its shape**: mail stays *data, not instructions*. v2 does not hand an email body to a free-running agent. Instead the same two-stage design: (1) code verbs (`planVerbs`) stay for the zero-cost paths; (2) for letters the verbs do not cover, a **constrained planner** (Haiku/Jev-class) maps the text to a *whitelisted tool call list* with schema validation (fetch_url, status, check_library, crawl…), with the autonomy policy (2e) applied exactly as in chat. The model never executes arbitrary text; the existing `COMMAND` refusal stays for destructive/admin verbs.
- Reject: merging `mail_messages` (D1 at the edge) into the tower DB. The edge mailbox remains the transport/archive of raw mail; tower holds the normalized case transcript. The Worker posts a normalized message to tower (`/dewey-mail/process`, extended) — the seam already exists.

### 2b. JOB REGISTRY with a state machine (accept; it is the spine)

Do **not** invent a fourth job system. The registry is a thin, tower-owned **table of record** over the existing executors (`ops_reports` runs on tower-side orchestration, worker-image jobs for heavy steps, `dewey_items` for per-work state):

- `dewey_jobs` (id, case_id, user_id, kind, params JSON, idem_key UNIQUE, state, step, steps JSON `[{name,state,started,ended,detail}]`, counts JSON `{found,fetched,checked,dupes,added,skipped,failed}`, eta_at, attempts, max_attempts, next_run_at, cost_usd, notify JSON, result JSON, parent_job_id, created_at, updated_at).
- `dewey_job_events` (job_id, at, type, data) — append-only, the audit trail and the feed for chat/email progress. Writes are small batches via the single writer, attributed in `db_write_stats`.
- States: `received → fetching → inspecting → deduping → processing → awaiting-decision → published | failed | cancelled`; `awaiting-decision` is a parking state with a `question` payload (options name their outcomes). Allowed transitions are a table in code; the dispatcher refuses illegal ones.
- Parent/child: a ZIP or crawl job is a **parent** with one child job per file/page (child = existing intake path: check → appraise → offer → quality gate → ingest). Parent state is derived from children counts; that gives "31 of 38 checked" and the completion trigger.
- Idempotency: `idem_key = sha256(kind + canonical params + user)`; URLs canonicalized; files keyed by sha256 (reuse `dewey_checks` and `findBySha`). Re-sending a link returns "already in progress, here is the status".
- Retries: per-step policy (fetch 3 with backoff, ocr 2, ingest 1 then `needs-human`); the stale reaper from `async-jobs.js` (`abandonReason`) is reused as logic so a killed worker never leaves a job "running".
- Execution: tower only *schedules and decides*. A small dispatcher in `siftersearch-reports` (already the Dewey runner) picks `dewey_jobs` due, and hands heavy steps to the worker job processor (`scripts/media/worker/`, image `ghcr.io/chadananda/sifter-media-worker`) with a typed work order; the worker streams to R2, reports step events back through the internal API (`POST /api/admin/ops/dewey-jobs/:id/event`, X-Internal-Key). Light decisions (dedupe verdicts, appraisal) stay on tower. Existing `dewey-*` ops jobs become **steps** the dispatcher calls (no rewrite in Phase 1).
- `status` tool: `status({job_id?|case_id?|query?})` reads `dewey_jobs` + counts + last events and renders in plain words ("Your ZIP: 38 files; 31 checked, 4 already held, 3 new waiting for your yes. About 6 minutes left."). Email "how is it going?" answers from the same function (replace the `itemsCreatedBy`-only template, keep it as fallback).
- ETA: rolling median seconds per step per kind from `dewey_job_events`; show "about N minutes" only after 3 samples, otherwise "a few minutes".

### 2c. TOOL BELT (agent-visible tools, each a thin function over the registry)

All tools enqueue a job and return a `job_id` immediately (long work is a job, per continuous-deploy rules). The model sees structured results only.

| Tool | Does | Where it runs | Guards |
|---|---|---|---|
| `fetch_url(url, kind?)` | any file type; HEAD first, size and type limits, resumable (Range), streams to R2 `dewey-fetch/<job>/`; media pages → `yt-dlp` (existing media path for YouTube) | worker | SSRF guard (resolve DNS, block private/link-local/metadata ranges, re-check on redirect, ports 80/443 only), max bytes per kind (doc 500 MB, archive 2 GB, media via media queue), content-type sniff by magic bytes, per-host rate limit, honest User-Agent |
| `scrape_page(url)` | readability extraction → clean markdown + metadata + outlinks; JS-render only when needed (Browser Rendering on the edge, or worker headless) | worker (tower only receives the extracted text) | robots.txt, 1 req/s/host, page size cap |
| `crawl(seed, scope, budget)` | sitemap or section sweep, same-host/path prefix, depth and **page budget** (default 50, user-raisable to 500 with approval), dedupe by canonical URL; each page → child job | worker, children via registry | robots, rate, budget, kill switch per job |
| `extract_archive(file)` | ZIP/TAR/7z/gz, nested to depth 2, to R2 children | worker | zip-slip path check, ratio and entry-count bomb limits (e.g. 20 000 entries, 20x ratio, 5 GB expanded), skip symlinks, executables listed and refused |
| `inspect_file(file)` | type (magic), language, text-layer vs scan (OCR need), page count, sha256 + near-dup fingerprint, malware scan (ClamAV in worker) | worker for bytes; tower for the verdict | refuse on scan hit, record in audit |
| `check_library(...)` | existing `check_holdings` (title/author/text/photo/preview/media) | tower, off-thread (existing) | unchanged |
| `appraise(item)` | existing `appraiseWork/appraiseDocument` extended with scope, shelf, value, **rights** (public domain / permission needed), edition/translation relation, scan quality | tower (calls Perplexity/Parallel) | per-day research cap |
| `research(question, depth)` | multi-step web research producing a **dossier** per candidate (sources list, where to get a copy, price, rights, relation to holdings) | worker-light/tower orchestrator, async | depth budget, cost cap |
| `ingest(items)` | routes documents into the existing convert/OCR/quality gate/ingest path; media into the media job queue; never converts on tower | existing jobs | autonomy policy |
| `status`, `notify`, `ask_user` | `status` above; `notify` queues a completion/progress message by channel pref; `ask_user` sets `awaiting-decision` with buttons | tower | `ask_user` options are fixed outcomes ("Add all 31", "Add only English", "Skip") and are signed one-click links in email |

Agent loop changes: raise rounds only for planning (tools are non-blocking so rounds stay short), keep `emit` streaming events and add `job` events so the chat shows a live progress card (`DeweyJobCard.svelte`, `liveRefresh` per the convention). Memory: a small `dewey_notes(user_id, key, value)`/case summary written by the model at case close (title, outcome, preferences like "prefers English translations") fed into the system prompt — replaces the "last 12 messages" cliff for long cases.

### 2d. Completion notifications (accept; the main perceived win)

- Trigger: parent job reaching `published`, `awaiting-decision` (once per batch, not per file), or `failed`. One notification per job, idempotent via `dewey_job_events` (`notified:email|chat`).
- Chat: a system message on the case with a result card (counts, links). Email: **HTML only** (existing `renderEmail`/`letter.js`, ZeptoMail from the Worker; tower supplies the data, Worker sends, as today).
- Email content (template, never model-written; the *summary sentence* may be written by the heavier model and is validated/escaped): subject "Dewey: 31 of 38 files added from <name>"; sections **Added** (title, shelf, link to the live page `https://siftersearch.com/document/<doc_id>`, edge-cached), **Already in the library** (what it matched and relation), **Skipped and why** (rights, scan unreadable, off-scope, too large), **Needs you** (buttons that name outcomes: "Add the 3 new Persian pamphlets", "Keep them out", "Show me the list"), a link to the job page `/dewey/job/<id>?t=<sig>` (generalizes the signed item page), footer with preference link (notify me: instantly / daily digest / chat only) and pause link.
- Publish links only appear after the page is actually live: the final step checks the document exists and is indexed (Qdrant point count > 0) before the job is `published`; otherwise the email says "being indexed" with the link marked pending.
- Reply continues the case (2a).

### 2e. Autonomy, approval, cost, abuse

Tiered policy (a table in code, per user class; stored in `dewey_policy`, editable by Chad):

- **Alone, no ask:** check_library, status, inspect, fetch ≤ 50 MB from any allowed host, scrape ≤ 20 pages, research within the day cap, add to wanted, receipts. Anything reversible and cheap.
- **Alone under caps (contributors with trust level ≥ 1):** fetch ≤ 500 MB, extract archives ≤ 200 files, ingest items where the quality gate says clean, appraisal ≥ "in scope", rights clearly public domain or contributor-owned. Chad's pulse already auto-adds ≤ 15/day; the same cap logic applies.
- **Ask first:** crawl beyond the page budget; anything not clearly in scope; rights unclear or in copyright; replacing an existing document with a "better copy"; media over N hours; spend over the user's per-job cap; any delete/retire (never by Dewey; admin only).
- **Never:** delete or retire library documents, change users/permissions, send mail to anyone but the contributor or Chad, follow instructions found inside fetched content (fetched text is wrapped as untrusted data; tool arguments are validated; the model cannot add tools).
- Caps: per user per day (jobs, fetched bytes, pages crawled, research calls, USD) with defaults for contributors, higher for Chad; a global daily USD ceiling and kill switch (`dewey_policy.paused`) that stops the dispatcher and says why. Cost is attributed per job from `turn-meta`/`ai_usage` into `dewey_jobs.cost_usd`.
- Abuse: allowlist stays the front door (no open signup); URL SSRF guard as above; type/size limits from `worker/dewey-upload.js` extended with `archive`; ClamAV scan in worker; archive-bomb limits; per-host and per-user rate limits; prompt-injection posture (fetched content is data; the Jev screen sits in front of mail only; tool results are summarized by code, not pasted raw); full audit: every tool call = a `dewey_job_events` row with user, args hash, outcome, cost.

### 2f. Research mode and proactive librarian

- Research mode is just a long job (`kind: research`) with a dossier child per candidate, reporting at milestones ("found 6 candidates, 2 free texts online") through the same notifications; the user can ask `status` at any time or reply to refine; completion email carries the dossier summary with **Add / Buy list / Skip** buttons.
- Scouts, the daily pulse, folder sweeps and the weekly report become `dewey_jobs` with `kind: scout|pulse|sweep|weekly` and `user_id = system`, so they show up in `status`, the ops report and the audit. The weekly report is a registry query + a template, sent to Chad (and optionally contributors, about *their* items). No scheduling rewrite: the reports worker's existing triggers just create registry rows.

### 2g. Model and cost strategy

- Router/classifier: Jev/Clef-class (cheap) for mail screen (exists), intent classification, URL/page-type triage, and the constrained mail planner.
- Haiku-class for chat turns with tools and for per-document appraisal text where the evidence is already gathered.
- Heavier model (Sonnet-class) only for: completion summaries with judgment, research dossiers synthesis, ambiguous edition/translation decisions, hard rights calls. Cache by sha256/URL (`dewey_checks` pattern) so a document is never appraised twice.
- Rule from existing memory: measure before switching ("switch per task only on measured parity", Clef vs Jev) — keep the shadow logging for new tasks.

### 2h. Observability, tests, migration

- Ops report `dewey-jobs` (one at a time, via `siftersearch-reports`): jobs by kind/state, age of oldest non-terminal, stuck jobs (no event > N min), failure reasons top-10, cost per day/user, notification delivery. Added to `api/lib/ops/reports.js` with a test; **no direct queries from scripts**. `GET /api/admin/ops/dewey-jobs` for details.
- SLOs: ack within 10 s of any message (status line, as chat does today); `fetch_url` first progress event < 30 s; completion notification < 2 min after the last step; 99% of non-terminal jobs have an event in the last 15 min; zero publish links to non-live pages.
- Simulation harness: `tests/dewey/sim/` with a fake worker (in-memory executor implementing the work-order contract), fake mail transport, fake clock, fixture sites served from a local http server (robots.txt, sitemap, redirect-to-private-IP, zip bomb, nested zip, zip-slip entry, huge Content-Length, HTML with injected "ignore your instructions"). Scenario tests assert state-machine transitions, idempotency (send twice), crash/retry (kill worker mid-fetch), email-then-chat continuity, notification content (HTML only, links live), caps and SSRF blocks. Extends the existing `dewey-agent`, `dewey-mail`, `worker-dewey-mail`, `dewey-upload*` suites.
- Migration without breaking the live mailbox: additive only. (1) New tables, columns nullable (`dewey_jobs`, `dewey_job_events`, `dewey_cases`, `dewey_policy`; `dewey_messages` + `case_id/channel/...`). (2) Dual-write: existing paths (`/process`, chat) also create a registry row but behave as before. (3) Switch reads (status, notifications) behind a `DEWEY_V2` setting per user (Chad first, then contributors); the Worker keeps both reply paths until parity is measured on a week of mail. (4) Verbs in `planVerbs` stay as fast path; new tools are added to chat first, mail second. Migrations run as small statements, indexes created after a quick table create, and no backfill in one transaction (backfill in batches via the single writer) so the writer is never frozen (see the slow-query lesson, memory 08-13).

---

## 3. Phased plan

Effort in focused build-days for one engineer (me with Chad reviewing).

### Phase 1 — quick wins (about 8–10 days) — "ask for a thing and be told when it is done"
Gives Chad: status on demand; paste a link and Dewey fetches the file safely; upload a ZIP (web) or mail one and get every file checked; a completion email and chat card with publish links and decision buttons.
1. Job registry: migrations + `dewey-jobs-repo.js` + dispatcher + `status` tool (3 d).
2. `fetch_url` + SSRF guard + size/type limits; worker mode `dewey-fetch` writing to R2 (2 d). Replaces `identifyUrl` for downloads and `attach_source` downloads.
3. ZIP: add `archive` kind to upload policy (web), `extract_archive` worker mode, fan-out to children using the existing `dewey-received` → ingest-folder → check/appraise/offer path; archive-bomb limits (2–3 d). Mail: accept `.zip` up to the 25 MB mail cap, otherwise point to upload.
4. Completion notifications: result aggregator, HTML template, chat card, signed job page, button links (`ask_user`/outcomes) (2 d). Worker sends mail as today.
Minimum code changes (files):
- new: `api/lib/repos/dewey-jobs-repo.js`, `api/lib/dewey/jobs/{registry,dispatch,fetch,archive,notify,policy}.js`, `api/lib/dewey/net-guard.js` (SSRF), `api/lib/ops/dewey-job-tick-job.js`, `api/routes/dewey-jobs.js` (+ schemas), `scripts/media/worker/dewey_fetch.py` and `dewey_unpack.py` (worker image), `src/components/dewey/DeweyJobCard.svelte`, tests under `tests/api/dewey-jobs*.test.js`.
- edit: `api/lib/migrations/*` (new migration number, create tables only), `api/lib/dewey/agent.js` (add `status`, `fetch_url`, `extract_archive` tools; `list_wanted` kept), `api/lib/dewey/mail.js` (status via registry; accept zip), `api/routes/dewey-mail.js` (`/process` creates a job; new `/job/:id` signed page), `worker/dewey-upload.js` (archive kind), `api/routes/dewey-upload.js` (start job on finish), `worker/mail/dewey.js` (render completion email from `/notify` payload, send via zepto), `api/lib/ops/reports.js` (`dewey-jobs` report), `tests/api/tower-placement-ratchet` (nothing new heavy on tower; the ratchet should pass untouched).
Dependencies: worker image rebuilt with yt-dlp (media already), 7z/unzip, ClamAV; R2 prefix `dewey-fetch/` with a lifecycle rule (delete after 7 days); the job processor accepting a new work-order type; the reports worker as dispatcher. Risks: the worker contract is new (mitigate with the fake-worker harness first); single-writer load from per-file events (batch events, ≤ 1 write/s/job); notification spam (one per job, digest option); boss/aorus availability (jobs wait with `WorkerWait`-style retry, never fall back to tower).

### Phase 2 — scraping, crawling and unified threads (about 8–10 days)
Gives Chad: "get everything in this section of that site" with a budget; email and chat as one conversation.
- `scrape_page`, `crawl` (robots, rate, budget, sitemap), worker mode `dewey-crawl` (4–5 d).
- Cases: `dewey_cases`, message columns, plus-address Reply-To with HMAC, inbound resolution, chat shows email turns, preference for channel (4–5 d). Spike first: Email Routing plus-address handling.
- Constrained mail planner (tool-call whitelist) behind `DEWEY_V2`, verbs retained.

### Phase 3 — research dossiers and the autonomy policy (about 7–9 days)
Gives Chad: ask a research question and get a dossier async; Dewey acts alone within caps; spend can never run away.
- `research` job + dossier schema + dossier email/page (3–4 d); `appraise` rights/edition/scan-quality extension (2 d); `dewey_policy`, caps, kill switch, cost accounting per job (2–3 d); malware scan hard-fail wiring if not in Phase 1.

### Phase 4 — proactive librarian (about 5–7 days)
Gives Chad: scouts, pulse, sweeps and a weekly report all visible in one place, with the same notifications and approvals.
- Scouts/pulse/sweeps recorded as registry jobs; weekly report template (queries + one heavier-model paragraph); contributor-facing "your items this week"; notification digests; `dewey-jobs` SLO alerts in `system-checks` (3–4 d + 2 d polish).

Total about 28–36 days; Phase 1 alone is useful and shippable by itself.

---

## 4. Decisions for Chad (with recommendations)

1. **Autonomy level.** How much may Dewey do without asking? Recommend: fetch, inspect, check, appraise, research alone; add to the library alone only when in scope + clean quality gate + clearly public domain or contributor-owned, up to 15 new documents per day (matching the pulse); everything else asks. Revisit after two weeks of audit data.
2. **Channels.** Make email and chat one case per user? Recommend yes, with default reply on the channel last used, completion notices on both (chat card always, email when the job was started by email or took longer than 2 minutes).
3. **Caps.** Per-user per-day defaults? Recommend contributors: 10 jobs, 2 GB fetched, 100 crawled pages, 20 research calls, 1.00 USD; Chad: 5x; global ceiling 25 USD/day with a kill switch and a note to you when 80% is reached.
4. **Allowed sources.** Which kinds of sources may Dewey fetch or crawl? Recommend: any public http(s) host that passes the SSRF guard and robots.txt; per-host rate 1 req/s; no login-walled or paywalled sites, no bypassing; media only via the existing media path; a deny list you can edit; copyright-unclear material goes to `awaiting-decision`, never auto-ingested.
5. **Who gets access.** Keep the invite-only allowlist and `dewey_access`? Recommend yes, add a trust level (0 new, 1 proven) so crawl, archives >50 files and auto-add need trust 1 (promote after N accepted items, e.g. 15, matching book-request logic) — admin can override.
6. **Notification preferences.** Recommend default: one HTML email per finished job (not per file), instant for jobs the person started, daily digest for scout/pulse/weekly items; per-user setting in the footer link (instant / daily / chat only); Chad gets a daily digest of all auto-added items with a one-click undo list (via admin API).
7. **Archive and page budgets.** Recommend ZIP ≤ 2 GB and ≤ 500 entries to start; crawl default 50 pages, up to 500 with your approval; nested archives depth 2.
8. **Publishing rule.** Should "published" in the email mean searchable too? Recommend yes: a link goes out only after the page renders and the Qdrant points exist; before that, the email says "being indexed" and a follow-up is not sent unless it fails.
9. **Model spend.** Recommend cheap Jev-class for routing, Haiku for chat/tool turns, a heavier model only for completion summaries, dossiers and hard judgments, with shadow logging and measured parity before any swap.
10. **Rollout.** Recommend building Phase 1 behind `DEWEY_V2` for your account only, dual-writing for a week against the live mailbox, then enabling contributors; verbs stay as the zero-cost fast path permanently.

Open spikes before Phase 2: Cloudflare Email Routing plus-address behaviour; whether Browser Rendering is needed for JS-only sites or workers headless suffices.

## 5. Decision recorded (Chad 10-28): browser service
If Dewey needs a real browser (JS-only sites, login-free dynamic pages), use **ego-browser** (the Chromium built for humans and AI agents), NOT Playwright. Constraints that still hold: it runs on a worker (never on tower), obeys robots.txt and the per-host rate limit, the SSRF guard applies, and no login-walled or paywalled sites. Phase 2 spike: confirm how ego-browser is driven headlessly from the worker image (CLI/API), its footprint inside the image, and a fallback to plain fetch + readability for the 90% of pages that do not need a browser.

## 6. Phase 1 built (10-28) — status
Live behind the operator valve (`DEWEY_V2=0` / `paused` flag; default ON, everyone): job registry (migration 185), `status` tool + email status, `fetch_url`, ZIP upload + fetched archives, completion notices (chat always; HTML email only when asked or started by email), caps + ceiling + `dewey-jobs` report + system-checks lines. Code map: `api/lib/dewey/jobs/CLAUDE.md`. Worker side: `scripts/dewey/worker/dewey-worker.mjs` (run on aorus/boss; NOT yet inside the one-image worker, see worker-image-design). Decisions taken in code: new works from anyone but the operator wait for a yes (`offered`); auto-add only when rights are asserted + trust 1 + under 15/day (`dewey:auto`); trust 0 contributors get 50 files per archive; ZIP only (tar/7z later); crawl, scrape, research dossiers, unified cases = Phase 2/3.

## Update 10-28 (later): books wait for Chad; trust is for MEDIA only
No book/document is added without Chad's yes: fetch_url, uploads, ZIP children, scouts/daily pulse (BOOKS_NEED_APPROVAL) and folder sweeps all stop at state `offered` ("waiting for approval", title/author/why on the job page and in the email); a person moving a file to `_add-anyway/` or a declined file re-placed is the yes. Rights flag: kept as data for books (null = unknown; encumbered books are normal and served under the encumbered-aware link rules); media defaults to unencumbered. Contributor trust and the 100/day allowance apply to media (talks) only.
