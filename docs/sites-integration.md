# Sites Integration — Architecture & Plan

The general problem of integrating external library/content sites into the SifterSearch corpus, plus the sites.yml schema for declaring how each site is integrated.

---

## The actual situation

The current Dropbox collection is *supplemental*. We are **the search index for a constellation of sites** — some we mirror locally for indexing + search, some we call via API, some we track only structurally for navigation.

**Override authority is asymmetric.** OceanLibrary.com is the only external site whose content totally overrides our own — they ship the most rigorously proofread version of any work they have, so on duplicate matches they win. For every other site, **our copy keeps winning** because it has value-added proofing or segmentation; we accept their content as an alternate (or skip ingestion entirely) and surface them via back-link.

**Every mirrored doc gets a back-link** to its source site, regardless of which version is primary. A canonical work like *Some Answered Questions* might appear in our corpus once but have back-links to OceanLibrary.com (paragraph-deep), bahai-library.com (page-level), and oceanoflights.org (work-level). All three external homes get linked from the same document — that's discovery linking, separate from override authority.

---

## Sites by integration type

There are four distinct integration patterns. Picking the right one per site avoids over- or under-engineering.

### Type A — Full mirror (highest authority sources)

Full content ingested into our paragraph index. Search ranks these first; back-links point to the source site, not to siftersearch.com.

| Site | Tier | Authority |
|---|---|---|
| **OceanLibrary.com** | primary | All religions, highly proofread; the canonical version of any work it has |
| **Oceanoflights.org** | primary | Bahá'í central-figures tablet collection; largest original-language Bahá'í doctrinal source |
| **bahai-library.com** | tertiary | Vast secondary Bahá'í collection — pilgrim notes, scholarship, periodicals; markdown content only (the OCR'd PDFs are separately indexed) |
| **bahai-education.org** | secondary | Educational resources + full text of *Star of the West* (5,000+ pages) |

### Type B — API-fetch (no local mirror)

We call out to the site's API at request time. Don't store its content; do store the sitemap as a discovery index so we know what's available.

| Site | Authority | Use |
|---|---|---|
| **ctai.info** | tool | JAFAR root analysis + translation reports — already used by `translation-subagent.js`. We index the sitemap so the chat assistant can reference what's available. |

### Type C — Sitemap-only (navigation, not content)

We don't ingest the body of these sites. We store the sitemap and one-line summaries per page so the chat assistant can recommend specific URLs when relevant. *"For a creative perspective on this, see [page] on bahaiblog.net."*

| Site | Purpose |
|---|---|
| **bahaiteachings.org** | Bahá'í blog — article navigation, current-generation opinion sampling |
| **bahaiblog.net** | Arts/media collection — artistic content + articles. Also a chat partner (we offer them SifterSearch chat). |
| Top-10 interfaith sites | Outreach — meaningful-conversation chatbot deployment partners |

### Type D — Feed monitoring (events, not content)

Periodic poll of an XML/RSS feed to surface time-sensitive items to interested users.

| Site | Feed | Use |
|---|---|---|
| **OceanLibrary.com /courses** | XML upcoming-courses feed | When a user shows interest in a topic, the chat assistant can mention an upcoming course on it |

---

## Schema: `sites.yml`

A single declarative file at `-sites/sites.yml` (inside the Ocean Library Dropbox folder) describes every integrated site. The ingestion + sync orchestration reads from this file; no code change needed to add a Type C navigation-only site.

```yaml
# -sites/sites.yml
schema_version: 1

sites:
  # ─── Type A: Full mirror, primary tier ───────────────────────────────
  - id: oceanlibrary
    domain: oceanlibrary.com
    integration: mirror
    tier: primary
    authority_for: [interfaith, all-religions]
    duplicate_policy: wins         # overrides our supplemental on duplicates
    encumbered: false
    discovery:
      type: sitemap
      url: https://oceanlibrary.com/sitemap.xml
    content_url_template: "https://oceanlibrary.com/document/{source_doc_id}#p{source_paragraph_index}"
    update_strategy:
      type: poll
      interval_hours: 24
    feeds:
      - name: courses
        url: https://oceanlibrary.com/courses/feed.xml
        type: rss
        purpose: outreach-recommendations

  - id: oceanoflights
    domain: oceanoflights.org
    integration: mirror
    tier: primary
    authority_for: [bahai-original-language, central-figures, shoghi-effendi]
    duplicate_policy: wins
    encumbered: false
    discovery:
      type: sitemap
      url: https://oceanoflights.org/sitemap.xml
    content_url_template: "https://oceanoflights.org/{slug}#p{source_paragraph_index}"
    update_strategy:
      type: poll
      interval_hours: 24

  # ─── Type A: Full mirror, lower tiers ────────────────────────────────
  - id: bahai-library
    domain: bahai-library.com
    integration: mirror
    tier: tertiary
    authority_for: [bahai-secondary, pilgrim-notes, scholarship]
    duplicate_policy: skip          # never override better sources
    encumbered: variable             # per-doc check during parse
    discovery:
      type: sitemap
      url: https://bahai-library.com/sitemap.xml
    content_url_template: "https://bahai-library.com/{source_path}#p{source_paragraph_index}"
    parser:
      mode: custom-md
      ocr_pdf_strategy: separate-folder   # PDFs go to staging; reviewed/converted manually
    update_strategy:
      type: poll
      interval_hours: 168           # weekly — large corpus, slow update cadence

  - id: bahai-education
    domain: bahai-education.org
    integration: mirror-selective
    tier: secondary
    authority_for: [star-of-the-west, baha-education]
    duplicate_policy: skip
    encumbered: false
    discovery:
      type: sitemap
      url: https://bahai-education.org/sitemap.xml
      include_paths:
        - /star-of-the-west
        - /biographies
    content_url_template: "https://bahai-education.org{source_path}#p{source_paragraph_index}"
    update_strategy:
      type: poll
      interval_hours: 168

  # ─── Type B: API-fetch (sitemap indexed, content not stored) ─────────
  - id: ctai
    domain: ctai.info
    integration: api
    tier: tool
    api_url: https://ctai.info/api/v1
    api_key_env: CTAI_KEY
    discovery:
      type: sitemap
      url: https://ctai.info/sitemap.xml
    content_url_template: "https://ctai.info/{source_path}"
    purpose: translation-grounding

  # ─── Type C: Sitemap-only (navigation, no content ingest) ────────────
  - id: bahaiteachings
    domain: bahaiteachings.org
    integration: sitemap-only
    tier: navigation
    purpose: blog-navigation
    discovery:
      type: sitemap
      url: https://bahaiteachings.org/sitemap.xml
    update_strategy:
      type: poll
      interval_hours: 168

  - id: bahaiblog
    domain: bahaiblog.net
    integration: sitemap-only
    tier: navigation
    purpose: arts-media-navigation
    discovery:
      type: sitemap
      url: https://bahaiblog.net/sitemap.xml
    chat_partner: true                # we host their chat; deeper integration possible
    update_strategy:
      type: poll
      interval_hours: 168
```

### Field reference

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique site identifier — used in code, URLs, DB columns |
| `domain` | yes | Canonical hostname |
| `integration` | yes | One of `mirror`, `mirror-selective`, `api`, `sitemap-only` |
| `tier` | yes | `primary`, `secondary`, `tertiary`, `navigation`, `tool` — drives duplicate resolution and search ranking |
| `authority_for` | optional | Tags — what categories this site is authoritative on |
| `duplicate_policy` | required for mirrors | `wins`, `skip`, `flag-for-review` |
| `encumbered` | required for mirrors | `false`, `true`, `variable` |
| `discovery` | yes | How we enumerate the site's content (`sitemap`, `feed`, `api-list`, `manual`) |
| `content_url_template` | required for mirrors | URL template using `{source_doc_id}`, `{source_paragraph_index}`, `{slug}`, `{source_path}` placeholders. Used everywhere we render a back-link. |
| `parser` | optional | Custom parser hints (e.g., `mode: custom-md`, OCR strategies, language detection overrides) |
| `update_strategy` | required for mirrors | `{ type: 'poll' \| 'feed' \| 'webhook', interval_hours: N, ... }` |
| `feeds` | optional | Array of secondary feeds (RSS, Atom) the chat assistant can surface — courses, events, announcements |
| `purpose` | optional | Free-text note for navigation-only sites — what they're useful for |
| `chat_partner` | optional | Boolean — is this a site we provide our chat to? Affects deep-integration possibilities |

### Link-pattern variables

The `content_url_template` is the single most important field for mirror sites — it determines how we link back to source from search results, citations, and chat replies.

| Placeholder | Source | Example |
|---|---|---|
| `{source_doc_id}` | The site's internal ID for a document, captured during ingestion as `docs.source_id` | OceanLibrary.com's per-doc numeric ID |
| `{source_paragraph_index}` | Paragraph index from `content.paragraph_index` (preserved across our ingestion) | Per-paragraph deep link |
| `{slug}` | URL slug from `docs.slug` (we already have this) | Human-readable URL component |
| `{source_path}` | The site's URL path captured during fetch as `docs.source_url` | Used when site URLs aren't templatable from a numeric ID |

The orchestrator validates that every `mirror`-integration site has at least one of `{source_doc_id}` or `{source_path}` in its template.

---

## Schema additions to `docs`

To support all of this, the `docs` table needs columns the current schema doesn't have:

| Column | Purpose |
|---|---|
| `source_site` | The `id` from sites.yml — `'oceanlibrary'`, `'bahai-library'`, etc. NULL for direct-uploaded supplemental content. |
| `source_id` | The site's internal document identifier (used in `content_url_template`) |
| `source_url` | The canonical URL on the source site (verbatim back-link, used when template doesn't suffice) |
| `source_path` | URL path component (without domain) — alternative to `source_id` for path-based sites |
| `source_hash` | Content hash at last sync — detects when source changes |
| `last_synced_at` | When we last pulled this doc |
| `canonical_doc_id` | When this doc is an alternate version of another doc in our corpus, points at the canonical (primary) one |
| `is_primary` | Boolean — true for the version search prefers |

Migration adds these as nullable columns; existing supplemental docs keep working unchanged.

---

## Sitemaps + page-summary index

For Type C (and the discovery layer of Types A/B), we need a separate table:

```sql
CREATE TABLE site_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,           -- references sites.yml id
  url TEXT NOT NULL,
  title TEXT,
  summary TEXT,                     -- short one-line description (LLM-generated from page metadata)
  category TEXT,                    -- "blog post", "course", "video", "article"
  tags_json TEXT,                   -- JSON array — auto-extracted topical tags
  published_at TEXT,
  last_seen_at TEXT,
  status TEXT DEFAULT 'active',     -- active | removed | redirected
  UNIQUE(site_id, url)
);
CREATE INDEX idx_site_pages_site ON site_pages(site_id);
CREATE INDEX idx_site_pages_category ON site_pages(category);
```

For Type A/B sites: `site_pages` is a fast discovery index — what's on the site, what changed since last sync. Source of truth for content remains the `docs` + `content` tables.

For Type C sites: `site_pages` IS the source of truth. The chat assistant queries it for navigation: *"User asked about Bahá'í art — `SELECT title, url, summary FROM site_pages WHERE site_id='bahaiblog' AND tags_json LIKE '%art%' ORDER BY published_at DESC LIMIT 5`."*

For Type D feeds: a parallel `site_feed_items` table holds upcoming events, courses, etc., with `expires_at` so stale items don't stick around.

---

## Near-term: per-paragraph `is_duplicate` flag

The full duplicate-detection pipeline + override policy described below is the **eventual** state. For the initial site integrations we ship a much simpler primitive:

```sql
ALTER TABLE content ADD COLUMN is_duplicate INTEGER DEFAULT 0;
CREATE INDEX idx_content_not_duplicate ON content(is_duplicate) WHERE is_duplicate = 0;
```

A paragraph marked `is_duplicate = 1` is:
- **NOT synced to Meili** (paragraph search skips it)
- **NOT enriched** (HyPE thesis pipeline skips it)
- **NOT served by the public API** (default queries filter it out)

We can mark duplicates manually or via a one-shot script as we identify them (content-hash match, normalized-title-author match). Later, when we want to reclaim disk + index space, a separate prune job hard-deletes paragraphs where `is_duplicate = 1`.

This is a **deliberate simplification**: rather than build full merge logic now, we just stop indexing the redundant version. The richer override-and-back-link architecture below remains the target — we can layer it in later when we have more sites mirrored and concrete merge cases to handle.

The tier/policy tables in the next section describe the *eventual* behavior. For Phase 0, all you need is the boolean flag plus a way to set it.

---

## Eventual: full duplicate detection + override policy

Three detection layers, increasing in cost:

1. **Content-hash match** → exact duplicate; record back-link, decide replace-or-skip per policy.
2. **(title, author, language) normalized key match** → likely duplicate; check phrases.
3. **Phrase-fingerprint similarity** → strong overlap is duplicate; ambiguous gets flagged.

When a duplicate is detected, behavior is driven by the **incoming site's `duplicate_policy`**:

| Policy | Behavior on duplicate | Sites with this policy |
|---|---|---|
| `override` | Replace our version with theirs. Preserve our paragraph IDs where text matches (paragraph-fingerprint diff, see Q3); re-enrich only changed paragraphs. Add back-link entry pointing to source. | **OceanLibrary.com only** |
| `back-link-only` | Keep our version untouched. Add a back-link entry pointing to the source so users can click out to that site for context. Do NOT ingest the duplicate as a paragraph. | **bahai-library, bahai-education, oceanoflights** (when matching existing canonical works) |
| `flag-for-review` | Don't ingest; queue for manual decision. Used when phrase-fingerprint similarity is in the ambiguous middle band. | Used by all sites for borderline cases |

For unique content (no duplicate detected), policy doesn't apply — the doc is ingested as new with `source_site` set. Oceanoflights.org will mostly have unique content (original-language) that pairs with our English versions via `original_doc_id`.

## External-link table — multi-source provenance

A single doc in our corpus can have **multiple external homes**. The same *Some Answered Questions* might appear at oceanlibrary.com (paragraph-deep links), bahai-library.com (page-level), and bahai-education.org (excerpted in *Star of the West*). All three back-links live alongside the doc:

```sql
CREATE TABLE doc_external_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES docs(id),
  site_id TEXT NOT NULL,                     -- references sites.yml id
  source_url TEXT NOT NULL,                  -- their canonical URL for this work
  source_doc_id TEXT,                        -- their internal doc ID (used by url template)
  source_path TEXT,                          -- URL path component
  link_pattern TEXT NOT NULL DEFAULT 'work', -- 'work' | 'paragraph' | 'section'
  is_primary_source BOOLEAN DEFAULT 0,       -- 1 if this site's content is primary in our corpus
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified_at TEXT,
  UNIQUE(doc_id, site_id)
);
CREATE INDEX idx_doc_external_links_doc ON doc_external_links(doc_id);
CREATE INDEX idx_doc_external_links_site ON doc_external_links(site_id);
```

`link_pattern` values:
- `paragraph` — site supports per-paragraph deep links (OceanLibrary). Render with `{source_paragraph_index}` from the matched paragraph in our corpus.
- `section` — site supports per-section linking via heading anchors.
- `work` — site links only at the document level. The back-link goes to the doc's home URL regardless of which paragraph the user clicked from.

Search results render every applicable back-link in priority order (primary source first, then secondary alternates). The chat assistant cites with the most-deep-linked source it has — paragraph-deep when OceanLibrary is in the link set, page-level otherwise.

---

## Search-time integration

On `/api/v1/search` and `/library/documents`:

- **Default**: returns our-corpus docs (the override policy means our copy is normally primary except where OceanLibrary won).
- **`source` filter** — `?source=oceanlibrary` returns only matching docs.
- **Result metadata**: every hit includes its `doc_external_links` entries so the UI / chat can render back-links to all the external homes. Paragraph-deep links (OceanLibrary) take precedence over work-level links when the user is interacting with a specific paragraph.

For chat: the orchestrator biases toward primary content on doctrinal queries; tertiary sources surface when the user explicitly asks for breadth ("any pilgrim notes about...", "scholarly articles on...").

## Chat API — `host_site` parameter

The chat endpoint accepts an optional `host_site` field identifying which site the user is currently browsing when they invoke the chat. This lets the assistant act site-aware:

```jsonc
// POST /api/chat/stream
{
  "messages": [...],
  "host_site": "bahaiblog"           // sites.yml id
}
```

When `host_site` is set:

1. **Site-relative navigation first** — for any recommendation that could be answered by the host site's content, the assistant prefers it. *"This is covered in the article you saw on bahaiblog.net last month — [link]."*
2. **Context-aware prompt addendum** — the system prompt gets a one-line addendum (`"The user is currently on bahaiblog.net, an arts-and-media collection."`) so the assistant's tone and recommendations align with that context.
3. **Cross-site enrichment** — when the host site lacks content for the question, the assistant can pull from other tracked sites with explicit attribution: *"Beyond what's on this site, the canonical treatment is in 'Abdu'l-Bahá's *Some Answered Questions* — [link to oceanlibrary.com]."*
4. **Sitemap-only sites benefit most** — for chat-partner sites (bahaiblog, bahaiteachings) we don't have body content indexed, only sitemap + page summaries. `host_site` gives the chat enough context to recommend specific pages on the host site by URL from the `site_pages` table.

The parameter is optional; when absent, the chat behaves as today (no site context).

## Library watcher — special handling for `-sites/`

The library-watcher currently infers `religion` from the top-level Dropbox folder structure. That breaks for `-sites/oceanlibrary/` — we don't want OceanLibrary content tagged with `religion = 'oceanlibrary'`.

The convention:

- Any path containing `-sites/<site-id>/...` is recognized as **mirrored content from a tracked site**.
- The watcher consults `sites.yml` for the site config rather than parsing folder names for metadata.
- The site-specific subfolder structure (e.g., `-sites/oceanlibrary/bahai/bahaullah/hidden-words.md`) is parsed normally for religion + author + work hierarchy, the same way as the regular Dropbox tree — but with `source_site` populated from the path's `<site-id>` segment.
- Each ingested doc gets `source_site = <site-id>`, `source_path = <path-after-site-id>`, and either `source_id` or `source_url` populated from frontmatter or filename convention (per-site adapter decides).
- For sitemap-only and api sites (`-sites/ctai/`, `-sites/bahaiblog/`, etc.), the watcher sees the `sitemap.cache.xml` / `pages.cache.json` files and routes to a different ingestion path that populates `site_pages` rather than `docs` + `content`.

This means **you can drop OceanLibrary content into `-sites/oceanlibrary/` whenever ready** and the existing watcher + parser pick it up correctly without inferring "oceanlibrary" as a religion.

## API purposes — documenting how each site is used

Each site's `purpose` field in sites.yml is loaded into the chat assistant's context as a brief description of when each external resource matters:

```yaml
sites:
  - id: ctai
    purpose: |
      Translate Persian/Arabic passages with Shoghi Effendi-grounded
      concordance. Use when the user asks for original-language alignment,
      term meanings, or passage translation. Called by the translation
      subagent automatically; available as the `translate_passage` tool
      for explicit user requests.

  - id: oceanlibrary
    purpose: |
      Primary canonical interfaith library. When you cite a canonical work
      (Aqdas, Iqán, Hidden Words, Gleanings, Bible, Quran, etc.), link to
      OceanLibrary's paragraph-deep URL via doc_external_links. This is
      our default canonical reference URL.

  - id: oceanoflights
    purpose: |
      Bahá'í central-figures tablet collection in original language.
      Use when the user asks for the Persian/Arabic original of a
      passage, or for material from minor tablets not in Gleanings.

  - id: bahai-library
    purpose: |
      Vast Bahá'í secondary collection. Use for breadth-research queries
      (pilgrim notes, talks, scholarship, periodicals) when our primary
      corpus doesn't have the material the user is asking about. Always
      flag the secondary nature in the response.

  - id: bahai-education
    purpose: |
      Star of the West full text + Bahá'í educational biographies.
      Use when researching early Bahá'í Western community history,
      figures around 'Abdu'l-Bahá's American journey, or for biography
      lookups on specific figures.

  - id: bahaiteachings
    purpose: |
      Modern Bahá'í blog with articles by contemporary writers.
      Use to surface current-generation perspectives on a topic;
      recommend specific articles by link rather than quoting.

  - id: bahaiblog
    purpose: |
      Bahá'í arts and media collection. Use for creative/artistic
      content recommendations — music, poetry, visual art on a topic.
      Recommend by link.
```

These purpose strings are exposed to the orchestrator as part of the system prompt (concatenated under a "Tracked sites" header). The chat assistant uses them to decide when to call which tool or which back-link to surface.

---

## Implementation phasing

| Phase | Work | Effort |
|---|---|---|
| **0: Schema + sites.yml loader** | Migration adding `source_*` columns + `site_pages` + `site_feed_items` tables. Loader that parses sites.yml at boot. | 0.5 day |
| **1: Generic mirror adapter framework** | `api/lib/sources/` interface (`enumerate`, `fetch`, `parse`). Three-layer duplicate detector. Tier-driven resolution policy. | 1 day |
| **2: OceanLibrary adapter + bulk import** | Site-specific discover/fetch/parse. One-time bulk pull. Authority promotion: every canonical work in OceanLibrary becomes the primary; current supplemental versions become alternates. | 2-3 days |
| **3: bahai-library.com adapter** | Custom parser for their markdown content. PDF staging strategy (don't auto-ingest OCR'd PDFs; queue for review). | 2-3 days |
| **4: oceanoflights.org adapter** | Specifically for original-language Bahá'í material. May need extra care on Persian/Arabic segmentation alignment. | 1-2 days |
| **5: Sitemap-only + feed-monitoring** | Type C and D sites — sitemap pull, page-summary generation (cheap LLM pass per page), feed polling. | 1-2 days |
| **6: Search-side integration** | `source` filter, `include_alternates`, back-link rendering using `content_url_template`. UI surfacing of source provenance. | 0.5 day |

Total: ~9-12 dev-days for the full integration of all five mirror/API sites + sitemap navigation for the rest.

---

## Open questions before Phase 0

1. **OceanLibrary access mechanics** — is there a structured dump (preferred) or do we sitemap-crawl + scrape pages? The scraping path is significantly more work.
2. **bahai-library.com's content licensing** — what's our legal basis for mirroring their text vs surfacing only metadata + back-links? If it's the latter, Type C may be more appropriate than Type A for some sections.
3. **Re-enrichment cost on replacement** — when OceanLibrary's *Gleanings* replaces our existing enriched copy, do we re-run HyPE thesis on the new version (~$1-2 per canonical work) or can we copy the existing thesis if paragraph alignment is identical?
4. **ID stability across versions** — when a site updates content, does it preserve their `source_id`? If yes, our update sync works cleanly. If no, we have a much harder identity-tracking problem.
5. **Original-language alignment** — when oceanoflights.org provides the Persian *Iqán* and OceanLibrary provides the English *Iqán*, our `original_doc_id` linkage (migration 54) is what unifies them. The cross-site duplicate detector needs to recognize "same work, different language" and link rather than dedup.

These don't block Phase 0 (schema + loader), but should be resolved before Phase 2 starts.
