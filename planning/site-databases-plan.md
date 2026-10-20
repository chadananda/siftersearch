# One database per scraped site (Chad 10-20)

"maintain a separate site-content db with each imported site so that we maintain them separately" — "but not for
OceanLibrary.com since this contains the canonical English collection which deserves to be in the primary sifter db".

## Target
| store | holds | why |
|---|---|---|
| `data/sifter.db` (primary) | the library files + **OceanLibrary.com** (canonical English) | the doctrinal core: authoritative, curated |
| `data/sites/bahai-library.db` | bahai-library.com (~1.8M paragraph rows, 75k docs incl. 62,750 retired junk) | supplemental — re-scrapes, cleanups, retirements never touch the core |
| `data/sites/oceanoflights.db` | oceanoflights.org (~1.9M rows) | supplemental |
| `data/sites/bahaiteachings.db` | bahaiteachings.org (site-only; already its own SQLite) | unchanged, now also in Qdrant |

Qdrant stays ONE index (phrases, paragraphs_kw, hype): every point carries `scope` + `site`; search ranks across all and
hydrates each hit from its own store. Authority already treats scraped-site copies as secondary (doctrinal-rank ×0.7).

## Why now
- The primary DB is 57 GB against a ~35 GB ZFS ARC — search hydration reads cold pages (searches 3–14 s at worst). The
  sites are a large share of content rows; moving them out shrinks the core toward what fits in RAM.
- Isolation: a site's re-scrape or bulk retirement churns its own file, not the core's indexes or the writer's hot path.
- Meilisearch retirement needs `site` in the Qdrant payload anyway (site-only scopes).

## Contracts (CLAUDE.md data-access rule holds)
- Reads/writes ONLY through repos; `paragraphs-repo` / `docs-repo` gain a store resolver: `storeFor({ site })` → connection.
  Callers that hydrate search hits group ids by `site` (payload) and read each group from its store.
- Single writer: the writer holds one connection per store (or ATTACH); write batches name their store; `db_write_stats`
  attributes per store.
- Jobs that walk content (authorship, HyPE, coverage, keyword-fill) take a `store` param; default primary.

## Steps
1. [~] (stamp-site job 953f952a, queued 10-20) Stamp `site` on Qdrant supplemental points (phrases, paragraphs_kw, hype) — payload-only job, by doc batches (like stamp-voices).
2. [ ] Store resolver in the repos + writer multi-store support. EXISTING base (10-20): db.js getSiteDb(siteId, prefix) → data/sites/<prefix>.db with runSiteMigrations (site schema), already used for site-only bahaiteachings by sites-ingester (isSiteOnly) and the worker's site-only sync — extend to supplemental sites; check the site schema covers what search/authorship/HyPE read; tests on an in-memory primary + site DB.
3. [ ] Hydration by site (paragraphsByIds groups by store) — search unchanged for callers.
4. [ ] Migrate **bahai-library** first: copy its docs/content (+ dependants: alignment, authors, sections, coverage rows) to
   `data/sites/bahai-library.db` → verify counts + spot reads through the API → delete from primary → `VACUUM INTO` a new
   primary file (needs ~57 GB free on /fast; a short write pause) → swap. Measure DB size, ARC fit, search p50 before/after.
5. [ ] Migrate **oceanoflights** the same way.
6. [ ] Index **bahaiteachings** into Qdrant (phrase + BM25, `site` payload) — closes the Meilisearch site-only gap.
7. [ ] Retire Meilisearch (planning/meili-retirement-plan.md steps 5–6).

## Not moved
OceanLibrary.com — the canonical English collection stays in the primary DB (Chad 10-20).

## Order / timing
After the overnight authorship (#923 + pilgrim/SW runs) and HyPE runs finish — they read these tables. No migration while a
search battery runs. Each step is reversible until the delete in step 4 (the site DB is a full copy first).
