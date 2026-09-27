# Anis — Hyper-Engagement PRD

_Draft for discussion, 2026-09-27. Built from the three sources below plus an inventory of the code as it stands._

| Source | What it gives |
|---|---|
| **Hyper-Engagement Playbook**, from CTAI's Jafar (claude.ai artifact QSKEZX5h3uPBEsPo6cEJ4B) | The machine: System-1 decides and the LLM formats. Catalogs, the gate and tarpit, channels, identity, summary chain, profile, writing first, and learning. |
| **Seeker Companion PRD** (`~/Desktop/prd planning/Bahai-ai-compantion-plan.md`; code in `api/lib/companion/`) | The ethics: authority classes, answer-first, consent, no funnel from vulnerability, silence over weak outreach, and fading as independence grows. |
| **`.xswarm/ANIS.md`** | The mandate: hyper-engage across channels (chat and email, with more later). The falsifier: *return conversations*. |

The alpha runs on siftersearch.com as `anis@siftersearch.com` and moves to `anis@oceanlibrary.com` later. Everything here is built so that move is a configuration change.

---

## 0. The product in one paragraph

Anis is a companion for study. It answers from the corpus with its sources shown and remembers each person across chat and email. It writes first when a conversation goes quiet and there is something genuinely worth saying. Every decision is made by Jev (typed, about 150 ms) or by deterministic code choosing from catalogs tuned in advance. One LLM call writes the words a person reads, in Anis's voice, and adds no facts. **Success is people coming back to continue a conversation** (ANIS.md), counted on a person, never on a session.

### Where the two source documents meet, and where they conflict

The playbook optimises for engagement; the Companion PRD warns against optimising for it. They agree more than they differ:
- both prefer silence to a weak message;
- both stop absolutely on a stop signal;
- both use human framing and exact substance;
- both show people what they did and never what was inferred.

Where they conflict, **the Companion invariants win**, and this PRD makes that explicit:

| Playbook says | Companion says | Resolution |
|---|---|---|
| Consent comes from the relationship; the growing back-off replaces an unsubscribe link | External channels need explicit consent; every message has pause controls | **Decision D1** below |
| Hyper-engagement; return conversations are the measure | Engagement proxies are diagnostics; fade support as independent study grows; never create dependence | Return conversations are the *health* metric. Hooks that point at **primary texts and the person's own study** outrank hooks that point back at Anis. A person who now reads on their own is a success, not churn. |
| Profile page: never show anything inferred | Transparency: memory view, why-this-response | Show what they did **plus what they explicitly asked Anis to remember** (consented memory). Never show inferred interests or scores. |
| The insider voice is allowed | Never "we Bahá'ís"; no institutional representation; state that it is AI | The Companion rule stands: a companion *among* seekers, never a spokesman. |

---

## 1. What exists today (inventory, 2026-09-27)

✅ built · ◐ partial · ✗ missing. File references come from the code sweep.

| Playbook area | State | What is there |
|---|---|---|
| Jev as System-1 | ◐ | `search-plan.js` makes one Jev call: tradition, author, `shape` (quote/fact/topic/define/lookup/enumerate/**converse**), `about`. `source-resolve.js` has `jevJudge`. Nothing classifies message kind, stance, malice or engagement. |
| Triage gate, canned replies, strikes, tarpit, output check | ✗ | Only `shape === 'converse'`, which switches the prompt. Rate limits are generic (100/min). The Companion `FORBIDDEN` list is described as "validator-checked", but **no validator exists**. |
| Log before answer | ✗ | **The Anis path (`/api/chat/stream`) saves nothing.** `/api/v1/chat` (Jafar) saves only *after* answering. |
| Recipes and findings | ◐ | Planned search runs deterministic layers; `peopleAnswer` gives MET / NOT MET / CONTESTED with proofs; `quotes.js` gates quotes. There is no typed findings contract with a `status` field, and no fallback loop inside Anis. |
| Format catalog | ✗ | One prose shape, plus a people block. |
| Channel registry | ✗ | `respond.js` is transport-neutral, and a test checks the email shape, but no registry or email adapter exists. |
| Soul (four layers), lint, soul battery | ◐ | Voice is in `anis/prompt.js`. The Companion constitution, dials, modes and interventions are in `companion/*`. There is no soul.md, no house-style layer, no per-answer stance or level, no lint and no battery. The `tests/chat/` rubric harness is the seed of a battery. |
| Identity | ◐ | `participantId()`: JWT, then `x-user-id`, then the `sifter_sid` cookie. `connectParticipant` merges on login. **Widget One Tap writes `widget_connections` but never calls `connectParticipant`**, so a widget connect doesn't merge. The widget's localStorage id is sent only with analytics. No rotation, no expiry, no email-only users. |
| One history and threads | ◐ | `chat_sessions.participant_id` and `threads.js` handle ownership, titles and merge on connect. There are no cross-channel threads, no 30-minute idle split, no summary chain and no compaction. |
| Profile page | ◐ | Account basics and delete. `user.js /conversations` reads the **legacy** table. Threads live only in the chat drawer. The share path is deliberately unshipped: the sanitizer is verified, but shipping needs your go-ahead. No export, no registry of per-person tables. |
| Email | ◐ | Outbound only: `services/email.js`, queue via ZeptoMail (the one provider). **The widget welcome email promises "reply 'stop'" with nothing behind it.** No inbound handling, no bounce or complaint handling, no suppression list. |
| Outreach, onboarding, news | ✗ | The Companion has `connect_offer` with a 168-hour cooldown and `S12_NO_OUTREACH`; backlog 0011 is open. |
| Learning loop | ◐ | `companion_exposure` log and `widget_events`. No classification of replies and no bandits. |

**Defects to fix before any outreach, whatever else is decided:** the Anis path saves nothing; widget One Tap skips the merge; the welcome email's "stop" promise has no machinery; there is no validator for `FORBIDDEN`.

---

## 2. Architecture

```
inbound (widget chat · site chat · email · later WhatsApp/Slack)
  │ adapters normalise to  { channel, person_ref, thread_ref, text, attachments, headers }
  ▼
EXCHANGE LOG  (write first: status=pending)                       code
  ▼
TRIAGE  one Jev call: malicious · complete · kind · stance · intent · stop? · reaction-to-last   System-1
  ├─ non-research → canned-reply catalog (in voice, zero LLM)     code
  ├─ strikes ≥ 2/24h → tarpit (same shapes, believable timing)    code
  ▼
RECIPE for intent → planned search / people / claims / scenes → FINDINGS[] with status     code + index
  ▼
CHECKS  citations exist · quotes verbatim · absences re-checked · links allow-listed        code
  ▼
DIRECT  one Jev call: finding support · format (from catalog ∩ data ∩ channel) · discovery? ·
        link/news welcome? · closing move · level                                           System-1
  ▼
FORMAT  ONE LLM call: soul + house style (cached prefix) | direction + evidence JSON | channel frame   LLM
  ▼
OUTPUT CHECK  persona break / instruction leak (Jev yes/no) · voice lint (log only)         System-1 + code
  ▼
RECORD  exchange row complete · path · format · timings · L0 summary (async)                code
```

**Placement.** Everything runs in the tower-nas API, which already hosts Anis, Jev and the corpus. Per-person state is in the user DB, which is directly writable, like the `companion_*` tables; exchanges and threads go in `chat_sessions` / `chat_messages`, extended. The outreach scheduler is a cron app next to the existing ones. Inbound email arrives through a **Cloudflare Email Worker** that POSTs to the API: the domain is already on Cloudflare, and the Worker is already the seam we use (**D3**).

**Port boundary.** Everything per-person sits behind one `PersonStore` interface, so ANIS.md's `@ol/anis` Worker with its own D1 can replace it later without touching the pipeline (**D2**).

**Budgets per answer (targets, measured before and after each phase):**
- chat: median under 3 s to the first token, 1 LLM call;
- email: under 60 s end to end, 1 LLM call (a stronger model is allowed);
- open-ended fallback loop on under 10% of research messages.

---

## 3. Feature specifications

Each feature lists what it is, why, the contract, who decides each part, and acceptance criteria. Tests are in §4.

### F1 · Exchange log and one history
- Every inbound message is written as an `exchanges` row with status `pending` **before any model runs**: channel, person_ref, thread_id, text, received_at, raw headers for email.
- On completion the row gets: answer, status `answered | canned | tarpit | failed`, path (gate result, recipe, fallback yes/no, format id), timings, and the ids of the LLM call and Jev calls.
- A replay worker re-runs rows still `pending` or `failed` after a timeout. An outage becomes a queue, not lost letters. Email replays send; chat replays only record.
- **Threads:** a chat thread closes after 30 minutes idle (the server decides). An email thread is keyed by `Message-ID`/`In-Reply-To`, falling back to the normalised subject. One person owns all their threads across channels.
- The Anis path gets persistence (currently none). `/api/v1/chat` moves from saving after the answer to saving before it.
- **Acceptance:**
  - Kill the formatter mid-answer, restart, and the replay answers it.
  - A chat question and an email about the same topic appear under one person.
  - Memory crosses venues: an email can refer to the chat thread.

### F2 · Triage gate, canned replies, strikes, hidden tarpit
- **One Jev call per inbound message** (schema below). It shares the call budget with the search plan: either merged into `planSearch`, or run in parallel so wall-clock time doesn't grow.
  ```
  malicious: prob            complete: prob            stop_request: prob
  kind: research | about_anis | thanks | feedback | off_topic | unclear | personal
  stance: curious | skeptical | confused | disputing | delighted | grieving_personal
  reaction_to_last: delighted | satisfied | confused | disagreed | deeper | new_topic | none
  hostile: prob
  ```
- **Thresholds:**
  - malicious ≥ 0.9: refuse from a varied in-voice pool, and count a strike;
  - 0.5–0.9: a guarded lane (fewer steps, no shared caches). A scholar quoting "instructions" from a text must never be refused;
  - two strikes in 24 hours: tarpit.
- **Canned-reply catalog, per channel:** refusals (a pool), a meta answer ("what are you / what can you do", with one real example), thanks, "that seems cut off", off-topic pointer, feedback thanks. All written in the soul's voice, and **zero LLM tokens**.
- **The tarpit must be undetectable:**
  - same response shape;
  - no "gated" field;
  - text from the normal refusal and "nothing found" pools;
  - timing drawn from the real distributions for refusals and research.
  Strike counters are server-side, keyed by hash(participant or IP).
- **Output check:** a Jev yes/no on the final text asks whether it breaks persona or reveals instructions. If it fails, replace the text with a canned reply and log it. This is also the missing `FORBIDDEN` validator: a code lint for the forbidden phrasings ("God wants you to", "we Bahá'ís", "the Bahá'í position is" + interpretation), with hits logged.
- **Fail open:** if Jev is unreachable, run the plain research path with no extras (no link, no news, no nudge).
- **Acceptance:** the triage battery (§4) scores ≥ 95% on attacks, ≥ 98% on legitimate questions not refused, and Persian and Arabic hold parity. Tarpit responses are statistically indistinguishable in shape and latency.

### F3 · Intents, recipes and the findings contract
- The **intent catalog** starts from the Jev shapes we already have and splits them where recipes differ. About 15 to begin with:
  - find a half-remembered passage;
  - what the writings say about X;
  - define a term, with the original and its transliteration;
  - who was X;
  - did X meet Y (people or encounters);
  - who was at an event (scenes);
  - list members;
  - what happened when or where (claims with dates);
  - compare traditions on X;
  - what a book is about;
  - reading suggestion;
  - the original of this translation (bilingual layer);
  - authority question ("is this Scripture or interpretation?");
  - about Anis;
  - personal or reflective.
- **Recipe per intent:** deterministic, indexed, returning `findings[]`:
  ```
  { id, claim, kind: text_shows | documented | reading | absence | count,
    status: verified | hedged | dropped, authority: B1..G (companion/authority.js),
    citations: [{doc, para, quote}], data: {dates?, counts?, people?, terms?, original?} }
  ```
- **Checks in code:**
  - each citation exists;
  - quoted terms appear in the cited passage (`quotes.js`);
  - an **absence** claim is re-checked against the index before it is stated;
  - authority class is attached from the source registry, never guessed by a model.
- **Fallback:** when no recipe covers the intent, an LLM loop with search tools runs. It still ends in a forced `submit_findings` call with the same contract. Its rate is tracked and driven down.
- **Acceptance:** 25 real questions (taken from logs) show before-and-after latency and LLM calls, and every answer's findings carry a status and an authority class.

### F4 · Answer-format catalog, chosen from the data
- **Code builds a data profile:** row count, distinct terms or people, has dates, has counts, has two-term comparison, one decisive finding, absence, has original script, authority mix, channel.
- **Code removes impossible formats:** no table for one row, no timeline without dates, no table in a channel that can't show one. **Jev chooses** from what remains by reading each entry's `when` against the question, the data and the channel.
- **v1 catalog: about 25 entries, grown from logs.** Each has `when`, `how` and `needs` (a capability).
  - single decisive passage;
  - **the range is the answer**: several examples across authors (ANIS.md);
  - term with original and transliteration;
  - authority-separated answer (Scripture / interpretation / guidance / history / synthesis);
  - met / did not meet / contested, with proofs;
  - scene: who was there;
  - timeline;
  - comparison table;
  - interfaith side by side (primary sources, no tradition used as a foil);
  - "not in the corpus" as an honest absence, with the nearest real thing;
  - reading suggestion with its reason;
  - short essay (email only);
  - yes/no with one proof;
  - "here is the original";
  - a study question back to the person.
- **Charts and tables are rendered by code from the data.** The LLM writes a placeholder, never a number. Charts are content-addressed PNG or SVG, cached.
- **Acceptance:** a format battery of 40 questions where the person specified no format, each with an expected format set. At least 85% land in the set, and no impossible format ever appears.

### F5 · Channel registry
- Each channel is one entry: `description` (for Jev), `frame` (length and tone), `capabilities` (tables, charts, headings, links, right-to-left text, images), `budgets`, `link_cap`, `news_cap`, `renderer`, `model`.
- v1 entries:
  - `widget-chat`: about 150 words, 1 link, Markdown;
  - `site-chat`: same;
  - `email`: a letter of up to about 600 words, 3 links, inline-styled HTML, PNG charts, a quoting convention for the reply chain, and the removal link in the footer.
- An unknown channel falls back to the most conservative entry. **Privileged frames (the long email) are granted only by our own adapters, never claimed by a caller.**
- **Acceptance:** adding a channel is data plus one adapter, with no pipeline change. A test registers a dummy "sms" channel and runs the battery through it.

### F6 · The soul in four layers
- **Layer 1, `api/lib/anis/soul.md`, cached prefix.** It lives in the repo so it can be edited and tweaked as we learn, and it stays **very compact** (about 450 words). It defines personality and core principles, not only tone: the **attitude**, and **where Anís lives between reconciliation and argument**. A knowledgeable friend who doesn't always agree, but disagrees for your betterment, gently and without threat: find what is true first; say it once with the passage; leave the choice with you; never win, never flatter; wrong is ordinary. Everything that is really a decision (whether to share a discovery, whether to challenge, format, length) stays OUT of the soul and lives in layers 3 and 4. The Companion's MUST and FORBIDDEN lists are compressed into "What you hold to". **The soul contains no subject facts**, not even in its examples: the calibration is a pattern with placeholders. A fact in the persona prompt would let Anís answer without retrieving, which would hide retrieval failures and corrupt knowledge tests such as the Karbilá question.
- **Layer 2, house style, cached:**
  - transliteration conventions (Shoghi Effendi's system);
  - original beside transliteration;
  - citation form;
  - authority labels (`labelForClass`);
  - link rules, including encumbered works linking to a preview.
- **Layer 3, direction, per answer, decided by Jev and code:**
  - format;
  - channel frame;
  - reader level (from history);
  - stance note (table below);
  - discovery yes/no;
  - closing move: none by default, an invitation to a second look, or an S08 reading;
  - Companion intervention (S01–S12) and challenge level, from `companion/decision.js`.
- **Layer 4, evidence, JSON:** findings, at most one "delight" observation (found by a detector, never invented), links and news.
- **Stance notes:**
  - curious: follow their curiosity;
  - skeptical: show the evidence plainly;
  - confused: one idea at a time;
  - disputing: check first; if Anis was wrong, say so first;
  - delighted: brief;
  - grieving or personal: gentle, no discovery, no funnel (a Companion invariant).
- **Delight detectors (research, not prose):**
  - an original word behind a translation;
  - two of the person's interests meeting in one passage;
  - a rare variant;
  - a scene connection;
  - a surprising count.
- **Lint (log only):** generic praise, scriptural register outside quotes, a reading stated as a fact, "we Bahá'ís", "God wants you".
- **Soul battery** must include packets that exercise the convictions: a question that reverses causation (law and force as the source of order), a comparison built on outward likeness, a popular belief that the tradition's own literature contradicts, a question about coercing moral behaviour, and a person struggling with effort. Scored for fairness to the other view, convictions marked as Anís's own, and freedom left with the person.
- **Soul battery:** 30 fixed evidence packets across stances, formats and channels. Whenever the soul changes, regenerate, and Jev scores each reply on answered-first, specific, stayed within evidence, at most one discovery, warmth and authority separation. It is a regression test for personality.
- **Acceptance:** soul-battery thresholds are pinned in CI (live tier, see §4). The formatter prompt prefix is byte-identical across answers, which proves the cache.

### F7 · Identity
- **Three kinds of person:**
  - **signed in**;
  - **email-only**: a first-class user record created by the first inbound email; a later sign-in with the same email *attaches* to it;
  - **anonymous browser**.
- **Anonymous token:** the widget sends its localStorage UUID with every chat message (today only analytics get it), validated server-side. It is unified with the `sifter_sid` cookie so a blocked third-party cookie doesn't split the person.
  - On sign-in, only this browser's anonymous history within 30 days merges. The token **rotates at sign-in and at sign-out**, so a shared computer starts fresh.
  - Unmerged anonymous history expires after 90 days.
- **Fix:** widget One Tap calls `connectParticipant` (merge plus consent `source:'connect'`).
- **Acceptance:** an identity battery covering anonymous → connect → merge, a shared computer, email-only → sign-in attaching, cookie blocked while the header carries continuity, and 90-day expiry.

### F8 · Memory: the summary chain
- **Level 0, exchange:** `{asked, found, terms[], citations[], reaction}`, written by a small model through a forced tool call, asynchronously after each answer. Reaction comes from the next message's triage.
- **Level 1, thread:** `{arc, conclusions[], open_questions[], stance, mood}`, written when a thread goes quiet.
- **Level 2, person:** `{story_so_far[], through_lines[], unfinished[]}`, weekly.
- **Consent-scoped:** Level 2 exists only for connected or remembered people (Companion R2+). Anonymous people get thread memory only.
- **Never stored or inferred** (Companion 7.1): political identity, trauma, mental state, religious susceptibility.
- **Thread replay:** the last 4 exchanges verbatim, older ones as one-line Level-0 summaries. Past a threshold the full text is compacted to the summary. An exchange without a summary is never compacted.
- Replaces `respond.js`'s "last 6 turns trimmed".
- **Acceptance:** a 40-exchange synthetic thread keeps its facts (a recall test on L0/L1), the prompt stays under budget, and nothing is compacted without a summary.

### F9 · Email channel (`anis@siftersearch.com`)
- **Inbound:** Cloudflare Email Routing sends mail to an Email Worker, which POSTs the parsed message to `/api/v1/anis/inbound` (signed with a shared secret). Then:
  - quoted history is stripped;
  - the person is resolved by address, and an email-only user created if none exists;
  - the thread is resolved by headers;
  - the message goes into F1.
- **Outbound:** the existing `services/email.js` queue via **ZeptoMail** (the one provider), from `Anis <anis@siftersearch.com>` with the right `In-Reply-To`/`References`. SPF, DKIM and DMARC are set on the domain.
- **Stop machinery (before anything else is sent):**
  - ZeptoMail's bounce and complaint webhooks feed a **suppression list** (hash of the address) that blocks all mail to it;
  - every inbound reply gets Jev `stop_request` and `hostile` checks at a **low threshold**. Either ends outreach while replies to their own letters continue;
  - the welcome email's promised "reply 'stop'" becomes real.
- **Footer:** a signed one-click link, per your directive, to pause letters and to **remove my history** (no login needed). This is the deletion experience; there is no memory viewer in chat.
- **Acceptance:** an email battery with recorded MIME fixtures (Gmail, Outlook, Apple Mail; with quoted history; right-to-left text; attachments ignored) produces the right person, thread and stripped text. A reply is threaded correctly. Stop, bounce and complaint are each honoured. The footer link works without login.

### F10 · Profile page
- **Shown:**
  - name, email, member since, sign-in method;
  - counts of conversations and questions;
  - **threads and a topic browser** over `chat_sessions` (not the legacy `conversations` table), with a filter;
  - what they explicitly asked Anis to remember (consented memory), which they can remove;
  - **Share a discussion**;
  - **Download my data**;
  - **Delete my account**.
- **Never shown:** inferred interests, weights, engagement state, nudge history.
- **Share:**
  - rounds come from `chat_messages` by conversation_id, **never from the client**, gated on `ownsThread` and rate-limited;
  - the regex floor plus the LLM sanitizer (already verified), then a Jev yes/no asking whether personal detail remains;
  - an editable preview with a flag warning; the server scrubs the edits again;
  - publish to `/dialogue/`; unpublish at any time. This ships the path held back on 2026-08-12, and **needs your go-ahead (D8)**.
- **Export and delete from one registry:** a `PERSON_DATA` registry listing every table with a person-keyed column, its key and its action (delete / anonymise / keep hashed).
  - A test fails if the schema gains a person-keyed column that isn't registered.
  - Export (JSON) and delete are generated from the registry.
  - Legal-retention rows are anonymised. The suppression list keeps a hash only.
- **Acceptance:** the registry-coverage test; export completeness (every registered table present); deletion leaves zero rows by key; share cannot publish another person's thread; BDD with ARIA locators.

### F11 · Onboarding (writing first, for people who just connected)
- **Trigger:** connect (One Tap, email sign-in) or the first inbound email. **Wait until any chat thread has gone quiet**, so the letter can refer to what they just asked.
- **No history:** up to three parts, days apart:
  1. an introduction with one vivid, real, cached example;
  2. and 3. "I neglected to mention, I can also…", each showing a capability they haven't used with a real cached example: find a half-remembered passage; show the original behind a translation; tell you who was in the room; trace a term.
  Stop for good after part three if they don't reply.
- **Has chat history:** an introduction that picks up their question ("You asked me about…, and I've been thinking about it since") with a researched follow-up. Then the re-engagement cadence applies.
- **Any reply** turns the sequence into ordinary correspondence.
- **Alpha:** sends only to an allowlist. **The first send of every sequence is approved by you** (backlog 0011), through an admin queue that shows the exact letter.

### F12 · Re-engagement
- **Cadence** (runtime config, no deploy): gaps grow, starting at 3, 5, 12, 25 and 44 days after their last message. Any reply resets it. One budget spans all channels. It stops after the last step and enters `RQ_QUIET`.
- **Research hooks** (about 20 for our corpus; code checks preconditions against the person's history, runs each as an indexed query, and drops anything they've seen):
  - an open question from their thread, now answerable;
  - two of their interests meeting in one passage;
  - **the entity graph**: a person they asked about appears in a scene or a claim they haven't seen (the Karbilá kind);
  - **the original behind a translation** they read;
  - a new text in their area (the texts you're preparing), from the news feed;
  - a correction they made that has since been fixed;
  - a date: a Holy Day, or an anniversary of an event they studied (from claims);
  - a primary-text reading that advances their inquiry (Companion S08, preferred because it points at the text rather than at Anis);
  - a course track after sustained interest (S10, **never triggered by vulnerability**).
- **Scoring (Jev):** relevance, surprise, fit, depth against level, and a **veto** if it could unsettle them. Code combines these with evidence strength and their record of what worked. **Silence beats a weak message:** below the quality floor, nothing is sent this cycle.
- **Opening templates** (about 40, filtered by stage: early ones fuller, later ones lighter, the last with an explicit easy close). Jev picks the opening and one LLM call writes the letter from the template, findings and register, adding no facts.
- **Companion guards:**
  - no contact from distress or personal disclosure;
  - never escalate urgency after silence;
  - fade as independent study grows (fewer nudges to someone who reads on their own);
  - `S12_NO_OUTREACH` is a first-class outcome, logged with its reason.

### F13 · News that rides along
- A "what's new" feed:
  - content items created automatically at ingest (a new text, a new translation or original, a new scene layer);
  - feature items added by hand in admin.
- At most one relevant, unseen item joins a person's own answer or letter. Never in back-to-back answers, never on a yes/no, a dispute or a grief message, never twice. **There is no way to send to everyone.**

### F14 · The learning loop
- Every inbound reply's `reaction_to_last` (from F2) attaches to the format, hook, opening and closing move that preceded it. An exchange the gate routed away ("wow, fascinating") still counts.
- Per-person Thompson-sampling bandits over hooks and openings, seeded from global rates, with about 10% exploration. Global rates by stage move the cadence (for example, first nudge later). **This has P1 status** in the Companion PRD (a constrained contextual bandit), so it ships last and is audited.
- Path logging (recipe or fallback, format, options removed) feeds catalog tuning.
- Admin dashboards:
  - return conversations per person (the headline);
  - replies per letter;
  - stop and complaint rates (**guard metrics, alarmed**);
  - fallback rate;
  - gate statistics;
  - format mix;
  - latency and LLM calls per answer.

### F15 · Controls and safety
- A global outreach kill switch, plus one per sequence.
- Alpha allowlist; dry-run mode (letters rendered into the admin queue, not sent); your approval of the first send of each sequence.
- Every outbound letter is stored with its evidence packet, template id, scores and the decision that sent it (auditable like identity decisions).
- Rate caps per person and globally.
- Minors: no outreach without separate review (a Companion non-goal).

---

## 4. Test suites

Tiers follow the project's existing contract: a clean API seam with vitest and no browser, BDD critical paths located by ARIA only, and live batteries that measure the model rather than the code and stay out of CI.

| Suite | Tier | What it pins |
|---|---|---|
| `exchange-log.test.js` | unit + contract (in-memory SQLite) | written before the model runs; replay of pending/failed; statuses; one history across channels; 30-minute thread split; email header threading |
| `triage-schema.test.js` | golden | recorded Jev responses → routing: canned, research, guarded, strike, tarpit; fail open when Jev is down |
| **triage battery** (`tests/anis/triage.yaml`, live) | live Jev | ~120 messages: jailbreaks (incl. repeats), meta, thanks, cut-offs, off-topic, feedback, **scholar quoting "instructions"**, Persian and Arabic parity, personal/grief. Targets: attacks ≥ 95%, legitimate never refused ≥ 98% |
| `tarpit-indistinguishable.test.js` | unit | response shapes identical; latency drawn from the real distributions; no field differs; counters are server-side only |
| `findings-contract.test.js` | unit | every recipe returns a typed findings array; citation-exists, quote-verbatim and absence re-check; authority class attached |
| **recipe battery** (25 logged questions, live) | live | latency, LLM calls per answer, fallback rate, before and after each phase |
| `format-choice.test.js` | unit | the data profile; impossible formats removed per channel (no table for one row, no timeline without dates) |
| **format battery** (40 unspecified-format questions, live) | live Jev | ≥ 85% in the expected set; zero impossible |
| `channel-registry.test.js` | unit | unknown → conservative; privileged frames only from our adapters; a dummy channel runs end to end |
| `soul-layers.test.js` | unit | cached prefix is byte-stable; direction and evidence are per answer; research calls never see the soul |
| **soul battery** (30 packets, live) | live Jev scorer | answered first, specific, within evidence, ≤ 1 discovery, warmth, authority separation, no FORBIDDEN phrasing; regression gate whenever soul.md changes |
| `voice-lint.test.js` | unit | the lint flags each forbidden and generic pattern; logs without blocking |
| `identity.test.js` | contract | anonymous → connect merge (only this browser, only 30 days); rotation at sign-in and sign-out; email-only → sign-in attaches; widget One Tap merges; 90-day expiry |
| `summary-chain.test.js` | unit + golden | L0/L1/L2 shapes via forced tool call; compaction never drops an unsummarised exchange; consent gate on L2; recall on a 40-exchange synthetic thread |
| **email battery** (`tests/anis/email/*.eml`) | contract | MIME parsing per client; quote stripping; person and thread resolution; reply threading headers; right-to-left text |
| `email-stop.test.js` | unit + golden | bounce/complaint → suppression; "stop" and hostility at a low threshold → outreach off, replies still answered; signed footer link works with no login |
| `person-data-registry.test.js` | contract | **fails if any person-keyed column is unregistered**; export includes every registered table; delete leaves zero rows |
| `share-thread.test.js` | contract | rounds come from the DB, not the client; the owner gate returns 404 for others; sanitizer recall (existing suite) + Jev PII check; preview edits re-scrubbed; unpublish |
| `outreach-due.test.js` | unit | the cadence from config; reset on reply; one budget across channels; RQ_QUIET; kill switches; allowlist; dry run |
| `hooks.test.js` | contract | each hook's preconditions against synthetic histories; drops what they've seen; cached packets |
| **outreach battery** (synthetic people, live) | live | right hook or **silence**; never after distress; opening fits the stage; letter adds no facts (claims diffed against the packet) |
| `news-rides-along.test.js` | unit | at most one; never back to back, on yes/no, disputes, grief, or twice; no broadcast path exists |
| `learning.test.js` | unit | reaction attaches to the right prior choices; bandit seeding and exploration; guard metrics alarm |
| BDD `anis-profile.feature`, `anis-share.feature`, `anis-connect.feature` | e2e, ARIA locators | the critical user paths |
| `tests/chat/` companion rubric (existing) | live | kept; becomes part of the soul battery |

**Measurement discipline** (from the playbook and our own lessons): each phase publishes before-and-after figures on a fixed set of real questions: latency, LLM calls per answer, path, and a quality spot-check. An improvement that adds a model call has to earn it. Report coverage next to quality, so a scorer that skips empties doesn't flatter itself.

---

## 5. Phases

**Status 2026-09-27:** P0 LIVE (v2.187.200+): exchange log before answer, Jev triage gate, canned replies, hidden
tarpit, output check, voice lint, channel registry, widget One Tap merge + signed connection cookie, footer pause link,
and the SSE session-cookie fix (widget visitors had no identity at all). P1 partial: soul.md + house style as the cached
system prompt with per-reply DIRECTION (stance, channel, guarded) LIVE; format catalog, findings contract and the soul
battery are next.


| Phase | Ships | Gate to next |
|---|---|---|
| **P0 · Foundation** | F1 exchange log + Anis persistence + replay; F2 gate (Jev triage, canned catalog, strikes, tarpit, output check, FORBIDDEN lint); F5 registry skeleton; the three defects (One Tap merge, stop machinery stub, validator) | triage battery at target; nothing lost across a forced crash |
| **P1 · Voice and shape** | F6 soul.md + house style + direction + stance; F4 format catalog v1 (~25) with data-aware choice; F3 findings contract on existing recipes (people, claims, scenes, define, find-passage) | soul battery and format battery at target; latency and LLM calls not worse |
| **P2 · Person** | F7 identity hardening; F8 summary chain; F10 profile (threads/topic browser, consented memory, export/delete registry; share **if D8 = yes**) | identity + registry + share suites green |
| **P3 · Email** | F9 inbound Worker, outbound threading, suppression, stop, footer removal link; email frame + renderer | email battery; a real round-trip with internal testers |
| **P4 · Onboarding** | F11 sequences, admin approval queue, dry run, allowlist | your approval of the first send of each sequence |
| **P5 · Re-engagement** | F12 cadence, hooks, scoring, openings; F13 news | outreach battery; guard metrics quiet for 2 weeks of alpha |
| **P6 · Learning** | F14 reply classification → bandits, dashboards | enough alpha data to seed global rates |

P0 and P1 improve every answer Anis gives today, with or without email, and cost little. P3 onward is where the new channel and the ethics decisions come in.

---

## 6. Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Consent to **write first** | (a) the playbook: connecting or writing in is consent; the back-off plus a footer pause/remove link does the rest. (b) the Companion/backlog 0011: explicit opt-in to letters. | **Hybrid.** Connecting = consent to *remember* (your 2026-08-12 rule) and to the onboarding sequence, whose first letter says plainly that Anis will write occasionally and how to pause. Re-engagement letters only after the person has **replied at least once**, since a relationship they took part in is real consent. A pause/remove link in every footer. |
| **D2** | Home of per-person memory | tower-nas user DB now (like the `companion_*` tables) vs. the `@ol/anis` Worker + D1 (ANIS.md) | **tower-nas behind a `PersonStore` interface**; port when Anis ships on client sites |
| **D3** | Inbound email | ZeptoMail is send-only, so inbound needs its own path: Cloudflare Email Routing + Worker → API · a third-party inbound parser | **Cloudflare Email Worker**: our domain, our seam, free; outbound stays on ZeptoMail |
| **D4** | Formatter model per channel | same model everywhere vs. a stronger model for email letters | chat keeps `ANIS_LLM`; **email gets a stronger model** (a letter can take 30 s and deserves care) |
| **D5** | Where the Companion's invariants override the playbook | as in the table in §0 | confirm the table |
| **D6** | Humour | none vs. light | **none** (the playbook's default on sensitive subjects) |
| **D7** | Alpha audience | internal testers only vs. also siftersearch.com visitors who connect | **internal allowlist** for any email; chat changes (P0–P1) go to everyone |
| **D8** | Ship the user-facing share path | held since 2026-08-12, sanitizer verified 2026-08-17 | **yes, in P2**, with preview + Jev PII check + unpublish |
| **D9** | Name in letters and sign-off | "Anis", "Anís", "Anis — Ocean Library" | "Anís" in prose, `Anis <anis@…>` as the sender |
| **D10** | Soul authorship | — | **Drafted** as `api/lib/anis/soul.md` (2026-09-27) for your edits: compact, personality + principles + the reconciliation/argument stance |

---

## 7. Open questions to settle in discussion
1. Hyper-engagement vs. fading: does "fade as independent study grows" mean *fewer letters*, or *letters that point at the texts rather than at Anis*? (This PRD assumes the second, with fewer letters as a consequence.)
2. Courses (Companion §8): part of re-engagement hooks in the alpha, or later?
3. Human handoff (S11, local community): is there a real destination yet (LSAs, cluster contacts), or leave it out?
4. Multiple sites: does a person who talks to Anis on drbi.org and on siftersearch.com have **one** history? (ANIS.md: "Sites report; Anis remembers; nothing crosses back" suggests yes for memory, no for site content.)
5. Languages: should outbound letters follow the language of the person's messages (Persian speakers), with the same corpus rules?
