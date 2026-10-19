# Dewey's scouts — finding what the library lacks (2026-10-18)

Chad: "the library research advisor which researches each religion's core books and tries to build a list of important
books we are missing and finds sources for them … the same thing but specifically for Baha'i documents … every pilgrim
note ever published … important Baha'i publications" · "not open sources only. We also want scanned copies or pdf or
whatever we can find. If nothing can be found and the book appears important, then it goes on my list to purchase and
scan. But books are expensive, so I need the research agent to exhaust all possibilities first."

## Two scouts, one engine
| scout | where its list comes from |
|---|---|
| **library advisor** (`core-books`, one tradition per run) | web research (Parallel.ai, cited): the works a serious library of that tradition must hold — scripture, classical commentary, history, the standard modern scholarship — each with why it matters |
| **Bahá'í scout** (`bahai-library`, `bahai-publications`) | bahai-library.com's collections as structured RIS (Pilgrims' notes: 263 entries; other collections the same way) + researched lists of important Bahá'í publications (histories, biographies, scholarship) |

## For every work on a list
1. **Held already?** Title and author against the library; when a copy's text can be fetched, its TEXT decides
   (the same full compare as uploads). Held → recorded, never offered.
2. **Exhaust the sources**, every channel searched and logged (so "nothing found" means something):
   bahai-library.com · bahai.works · archive.org (downloadable, and borrow-only noted) · Google Books (full view /
   PDF / EPUB) · HathiTrust (full view) · Open Library (ebook access) · Project Gutenberg · web search for the full
   text — PDFs, scans, author and publisher pages, academia.edu, university repositories, personal sites.
   Shadow libraries (LibGen, Anna's Archive, Z-Library, Sci-Hub and the like) are never searched or used.
3. **A copy found** → downloaded to the NAS (outside Dropbox), its text checked against the library (a different
   title for the same book is caught here) and read as a whole work (no fragments, previews or samples) → an
   **offer** in Dewey with where it came from. Chad says yes; intake does the rest with every guard.
4. **Nothing anywhere, and important** → **to buy**: every channel searched, used-copy prices, and the author or
   publisher to ask for permission or a copy.

## Pieces
`api/lib/dewey/scout/` — `ris.js` (bahai-library RIS) · `lists.js` (where lists come from) · `channels.js` (each
source channel → found copies) · `scout.js` (held? → hunt → offer / to-buy). Ops job `dewey-scout` in its own lane
(`scout`), polite to every site (one request at a time, a pause between). Items: state `offered` (by dewey-scout) or
`to-buy`, with `identified.scout = { list, why, channels: [{ channel, searched, found }] }`.
