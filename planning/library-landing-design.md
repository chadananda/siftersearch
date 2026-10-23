# /library landing — design rationale (2026-10-22)

Chad's brief: "terribly boring … needs to be fast regardless of Tower-NAS … look like a real library with tens of
thousands of beautiful books awaiting exploration … an import process explanation and counter."

## Two passes

1. **The Reading Room** (rejected, same day): a CSS-3D aisle of stacks, walnut bays of generated spines, brass
   signage, a card-catalogue drawer, a book cart. Chad: "an old outdated Apple skeuomorphic style … shows many empty
   shelves and does not take advantage of our beautiful covers." He was right on all three counts: spines hid the
   art we already own, a shelf is mostly empty wood, and the texture work dated the page.
2. **Editorial, cover-first** (shipped). A modern bookshop / museum collection page: confident type, generous space,
   colour taken from the covers themselves, and only what exists is rendered.

## What the page is made of

| Part | What it does | Data |
|---|---|---|
| Masthead | "The Library" in Gloock, a one-line promise, the as-you-type finder, the live readout (books · traditions · paragraphs · +N this week, live dot while Dewey imports) | `/api/library/landing` (SSR + `liveRefresh` every minute) |
| Featured works | Hero carousel of signature works (curated list, ≤3 per tradition, daily order); cover large, opening words beside it; the panel is washed in the cover's own colour (12-px probe of the art, averaged) | shelves index + `/api/library/documents/:id?paragraphLimit=4` at SSR |
| New arrivals | Newest books Dewey catalogued (talks excluded — they live in the Fireside Room), with the day they arrived | `landing.arrivals` |
| Not copies. Editions. | The seven stages every book passes (acquire → restore → structure → attribute → link → pair originals → index for meaning), each with its live figure | `landing.process` (telemetry rings + import board) |
| Traditions | Each tradition led by a signature work, then its shelves as sideways rows of real covers, then its collections as chips that open into rows | shelves index; `/api/library/shelves/items` on demand |
| The whole library | A wall of covers: the illustrated editions in today's order, then every collection of every tradition round-robin, 48 at a time as you scroll, fading in | shelves index + `/shelves/items` |
| Preview | A plain click on any book opens a sheet: cover, tradition, title, author, opening paragraphs, "Read <title>" | `/api/library/documents/:id` |

## Covers

- **Art**: ~280 OceanLibrary books have illustrated covers (`/img/covers/<id>?v=…`), transparent-edged, ~18:25.
  Served through the image service with width-only transforms (`coverImg` → `imgSet`, `fo: null`): never cropped,
  never stretched, `object-fit: contain` in an 18:25 box so nothing shifts. Lazy below the fold; the first featured
  cover is preloaded with `fetchpriority=high`.
- **Typographic covers** for the ~69k books without art (`coverSpec`/`renderBook`): bound cloth in the tradition's
  colours taken from the real covers (oxblood/navy/forest for Bahá'í, emerald for Islam, lacquer red for Buddhism…),
  gilt Gloock title sized by container-query units, four variants (gilt frame, rule, eight-point star, parchment with a
  coloured title band — the Shoghi Effendi editions' idiom). Seeded by the book, so a book always looks the same.
- The typographic cover sits under every piece of art and takes over if the art fails (captured `error`).
  With JS, art fades in on load over a quiet placeholder; without JS it simply shows.

## No empty space

Only real content renders: empty shelves are dropped (`sectionsFrom`), rows hold only books, the "+N more" card only
exists where there is more, and it keeps unrolling the row as you scroll along it. Collections are chips (name and
count), not placeholder slots. The wall never shows slots — chunks are appended only when their books arrive.

## Pages never wait

SSR reads only edge-cached data (`/api/library/shelves`, `/api/library/landing`, `/api/library/documents/:id`), so the
Worker renders from cache whatever tower's link is doing; the HTML itself is edge-cached (s-maxage 120, swr 600) and
warmed after deploy. Live parts refresh through `src/lib/library-feed.js` (one `liveRefresh` shared by the islands).
If the shelves are unavailable on a cold render the page says so and retries itself (≤3 times); that render is
never cached.

## Motion

Transforms and opacity only. The carousel advances every 7 s while on screen and never while hovered/focused; the
light runs along the process rule; covers lift on hover; new arrivals and loaded books rise in; the wall fades in.
Ambient motion waits for `.lib-live` (1.2 s after load). `prefers-reduced-motion` stills everything and the page is
complete without it.

## Type and colour

Gloock (display), Libre Caslon Text (reading, italics), IBM Plex Mono (labels and figures) — all self-hosted, the
display face preloaded, `font-display: optional` with metric-matched fallbacks. Tokens in `global.css`: `--lib-*`
(paper and ink by day, gallery-dark by night), `--trad-*` (section tints from the covers), `--cloth-*`/`--cover-*`.

## Code

- `src/pages/library/index.astro` — SSR page (`?view=…` keeps the full browser).
- `src/lib/library-stacks.js` — pure: fold, covers, sections, featured, catalogue search, wall sources, stages.
  Tests: `tests/api/library-stacks.test.js`.
- `src/lib/library-stacks-client.js` — rows, drag, collections, wall, art fallback, live counts.
- `src/lib/library-feed.js` — the shared live feed and the shelves index fetch.
- `src/components/library/stacks/` — Ledger, Finder, Featured, Arrivals, Process, Preview, Rolling.
- `api/lib/library/landing.js` + `GET /api/library/landing` — the live numbers (tests: `tests/api/library-landing.test.js`).

## Open taste calls for Chad

- Featured list: curated by title prefix in `FEATURE` (library-stacks.js); swap freely.
- The headline counts **visible** traditions only (69,848 now): the hidden "Other" tradition (~10k docs) is excluded
  everywhere, so the corpus-wide 80k figure never appears here.
- Typographic covers use four variants; more (e.g. per-collection marks) are easy to add in `coverSpec`.
