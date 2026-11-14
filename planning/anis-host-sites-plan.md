# Anís on partner sites: the host's own results first

Planning only (Chad 11-14). Nothing here is built yet.

> "We will be able to persuade Oceanoflights.org to host Anis so long as it provides Oceanoflights.org results prioritized.
> Likewise for bahailibrary.com and maybe the phelps collection. … If we can act as a navigational aide inside a host
> website, it will be very attractive to the site owner."

**The idea in one line.** A host deployment (a widget profile) names its *home* (the host's own collection and link style).
Anís then answers from the whole library as usual, but puts the host's copy first wherever the same words exist, puts the
host's passages first within each authority tier, links every citation to the host's own page, and helps the reader move
around the host site. The home changes **order and links, never what the reader can find** (priority = order, not a filter).

---

## 1. Coverage: what maps to each host today

Measured 11-14 from the public library API (`/api/library/stats`, `/api/library/documents`). Library total: **206,171 docs,
9,765,788 paragraphs**.

| host | how a doc points at it (code: `api/lib/source-links.js`) | docs we can name today | paragraphs | host pages NOT in the library |
|---|---|---|---|---|
| **oceanoflights.org** | `metadata.bookid` → `oceanoflights.org/<bookid lowercased, _→->/` (`oceanoflightsUrl`), or a `source_url` on that host (OoL `.docx` downloads are rewritten to the page by `oolPageUrl`) | the **Core Tablets** collection holds **24,121** docs; most carry a `bookid` (sample: doc 921742 → `Abdul-Baha-BKW22-2_17_fa`). The **Partial Inventory** subfolder of Core Tablets is Phelps-keyed, not OoL. Exact OoL share: **not determined** | not determined | **not determined**: OoL's `sitemap.xml` lists only 13 navigation URLs, no works |
| **bahai-library.com** | `docs.source_url` or `metadata.sourceUrl` on that host | spread over Papers (1,691), News (1,018), Pilgrim Notes (676), Books (2,408) and others; no per-host count exists | not determined | **not determined**: no sitemap (`/sitemap.xml` is 404) |
| **Phelps (Partial Inventory browser)** | `metadata.pin` → `portlandiator.github.io/PI_browser/?id=<pin>` (`inventoryUrl`) | the **Tablet Translations** collection holds **26,512** docs, its sampled files all under `Stephen Phelps (provisional)/` (BH….md); plus the Partial Inventory part of Core Tablets | not determined | not determined: the browser is one JS page over the inventory data |

**Why the numbers are missing.** No ops report groups docs or paragraphs by link host, and the public document list has
no host filter. A direct query would break the repos rule. **Phase 0 adds that report** (below); it gives exact docs and
paragraphs per host, and for OoL and Phelps it also checks their catalogues against our ids to find the host pages we don't
hold.

## 2. Config: one `home` per deployment

Rides the existing widget profile (`widget_profiles.config_json`, the same place as `mission` and `audience`; edited in
`/admin/anis` → `WidgetManager.svelte`; served by `GET /api/v1/widget/config/:token`; read at the edge by `personaOf()` in
`worker/anis/index.js`). No host name appears in code paths; the profile carries it.

```json
"home": {
  "label": "Ocean of Lights",            // shown on cards: "on Ocean of Lights" / "from the wider library"
  "hosts": ["oceanoflights.org"],        // link hosts that count as home (matched by tierOf's host test)
  "match": { "metaKeys": ["bookid"] },   // optional: metadata keys that imply home (bookid → OoL, pin → Phelps)
  "links": "host",                       // "host" = cite the host's page whenever one exists; "best" = today's policy
  "deep": "auto",                        // paragraph deep link style; "auto" = whatever linkFor already builds for that host
  "find": { "search": "https://oceanoflights.org/search?q={q}" }   // optional: the host's own search URL template
}
```

Anything absent → today's behaviour. The profile's `domains` (already enforced on `/widget/config`) stay the guard that only
the host's own pages can load its deployment.

## 3. Ranking: where the home boost applies

All four places already exist; each gets one extra input, `home`, passed down from the turn.

| place | today | with a home |
|---|---|---|
| **search ordering** (passage heads ordered by `sourceTier()`, `api/lib/assistant/source-tier.js`) | writings > guardian > compilation > reported > house > secondary | same tiers; **within a tier**, home passages first |
| **`research_lookup` / `fused_search`** (edge tools, `worker/anis/agent-tools.json`) | whole library | whole library; result order as above; each passage tagged `home: true/false` |
| **source tracing** (`source_trace`, `own-source.js`) | quoted words → the writer's own work | unchanged first step; then, among copies of that work's words, the home copy |
| **same-passage copy choice** (`identicalCopies` in `copies-repo.js` + `linkFor` tiers in `source-links.js`: OceanLibrary → OoL → Phelps → bahai-library → publisher → us) | best publisher wins | home host moves to the top of `TIERS` for this turn only (`linkFor(doc, i, { prefer: home.hosts })`) |

**Proposed rule (needs Chad's OK):**
1. **Same passage** (identical normalized text) → always the host's copy, if the host has one.
2. **Different passages** → host first *within the same authority tier*.
3. **Never** lift a lower tier above a higher one on a teaching question: a bahai-library paper never outranks a Writings
   passage held elsewhere. On a non-teaching question (history, "where is…", "what's on this site") the tier order still
   holds but the home site's catalogue tools run first (section 5).

Interfaith rule untouched: the home says *where to link*, not *what tradition the reader holds*. The `audience` line stays
the only tradition hint a deployment gives.

## 4. Links

- Every citation and book card on a host deployment links to the host page when one exists (`links: "host"`):
  - **OoL**: `#~q=` marker → `#(start)(end)` range from the page's own text (`ool-range.js`), already built.
  - **Phelps**: `?id=<pin>` (document level; the browser has no paragraph anchor today).
  - **bahai-library**: the stored `source_url`, plus a `#:~:text=` fragment (`textFragmentUrl` in `ocean-links.js`, used at
    the edge by `worker/anis/links.js`).
- Off-host results carry a small visible mark: "from the wider Ocean library" (label from the profile), linking to
  OceanLibrary / our reader as today. The host can see its readers are not being sent away silently.
- Implementation point: the edge's `links.js` already makes the reply's links; it takes `home` and asks `linkFor` with
  `prefer`. No tower round-trip.

## 5. Navigation aid

| ability | what it does | new or existing |
|---|---|---|
| **Page awareness** | the widget sends `page: { url, title }` with each turn (host page only, not the reader's history). The edge resolves the URL to our doc (by bookid/pin/source_url) and Anís can answer "what am I reading?", "where else is this discussed?", "what comes next in this book?" | **new**: widget field + a `page_lookup` tool (URL → doc + paragraph range). The answers then use existing tools: `whole_lookup`, `context_lookup`, `research_lookup` |
| **Where else is this discussed** | passages that quote or discuss the current page's text, home first | existing `source_trace` / `research_lookup` with the page's doc as `about` |
| **What's next in this book** | next section / next tablet in the host's own order | existing `context_lookup` (`after`), plus the host's catalogue order for OoL (bookid sequence) |
| **Find on this site** | "do you have the Tablet of …?", "where are the Persian prayers?" → host pages, with the host's own search link as fallback | existing `document_search` / `book_card` with a `home` filter (here a filter is right: the reader asked about *this site*), plus `home.find.search` for a link into the host's search |
| **Sections of the host** | the host's collections/shelves as browsable cards | **new, small**: the home's collection list from the shelves API (`/api/library/shelves`) narrowed to home docs |

## 6. Value for the site owner

- **Report per host** (privacy-safe): the widget events table already records `open`, `message_sent`, `answer_served`,
  `site_link_clicked` per profile, and `GET /api/v1/widget/admin/profiles/:id/analytics` shows daily counts and recent
  questions. Add: clicks *to the host's own pages* by page (top 50), share of answers that cited the host, and the questions
  the host's own pages could not answer (their content gaps). No reader identities, no IPs; question text only as today
  (admin scope). A monthly HTML email to the owner, same data.
- **Embed snippet**: the existing one-line loader with the profile token; the admin page shows it.
- **Branding**: their name for the assistant if they want (profile `name`, already supported), with "Anís, Ocean AI Research
  Assistant" as the engine line in the panel footer.
- **Cost model**: Anís costs per turn are already metered per caller. Add a per-profile monthly cap (`home.cap_usd`) that
  slows to the cheaper speed when reached; real readers are never cut off (standing rule: real readers metered, not capped).
  Phase 1: free to the host; we carry the cost as outreach.

## 7. Phases

| phase | scope | size |
|---|---|---|
| **0. Measure** | ops report `host-coverage`: docs + paragraphs per link host (bookid/pin/source_url), and for OoL/Phelps the host ids we don't hold (from their catalogue data). Test + report entry | ~½ day |
| **1. Ocean of Lights, smallest useful** | `home` in profile + admin form; `linkFor` `prefer`; edge `links.js` honours it; same-passage rule + in-tier home ordering; off-host mark; per-host clicks in analytics. Demo profile on a test page with oceanoflights.org in `domains` | ~2–3 days |
| **2. Navigation** | widget sends page url/title; `page_lookup` tool; "what am I reading / what's next / where else"; find-on-this-site with home filter | ~2–3 days |
| **3. bahai-library.com** | same profile shape; `#:~:text=` deep links; their sections; owner report email | ~1–2 days |
| **4. Phelps** | pin links; inventory-order "next"; only if Stephen Phelps wants it | ~1 day |
| **5. Owner report + caps** | monthly email, per-profile cap | ~1 day |

## Open questions for Chad (each with a recommended default)

1. **The ranking rule in section 3**: same passage → host copy; host first only within a tier; never above the Writings.
   *Default: yes, as written.*
2. **On a host deployment, does OceanLibrary still win the link for a book OoL also holds?** *Default: no, the host's copy
   wins when it holds the same words; OceanLibrary only when the host has no copy.*
3. **Page awareness: send the page URL and title to us?** *Default: yes, the host page only, never stored beyond the turn
   except as the aggregate "questions asked on page X" in the owner's report.*
4. **Phelps: link-level only (no paragraph anchor) acceptable?** *Default: yes for now; ask Stephen Phelps whether the
   browser can take a paragraph id.*
5. **Cost to the host.** *Default: free in phases 1–3, with a per-profile cap we set; revisit when there are three hosts.*
6. **Branding.** *Default: host's name for the assistant allowed; footer "Anís, Ocean AI Research Assistant" always shown.*
7. **Off-host mark wording.** *Default: "from the wider Ocean library".*
