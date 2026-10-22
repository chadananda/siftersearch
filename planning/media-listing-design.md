# /media — The Listening Room (design, 2026-10-22)

Live: https://siftersearch.com/media · code: `src/components/media/listening/`, `src/lib/media-listing.js`,
`src/lib/media-preview.svelte.js`, `api/lib/media/listing-index.js` (GET /api/media/index), tokens `--radio-*` / `--era-*`
in `src/styles/global.css`. Tests: `tests/api/media-listing.test.js`, `tests/api/media-listing-route.test.js`.

## Concept
A 1940s broadcast set rather than a catalogue. Light mode is cream paper, walnut and brass with an amber dial; dark
mode keeps the walnut and lets the amber glow like a valve amplifier. Two display faces: **Gloock** (a high-contrast
serif with a period feel) for headlines, questions and names, and **Big Shoulders Display** (condensed Chicago
signage) for the dial numerals, call signs, preset keys and the odometer. Quotations stay in the site's Libre Caslon
italic. Movement is constant but gentle, and every moving part also means something: the needle shows the year, the
waveform is the talk's own, and the spines are the speaker's real talks.

## The page, top to bottom
1. **On Air (hero).** A walnut cabinet with an ON AIR lamp and a VU meter. The tuning dial runs 1930–2030, with `?`
   for undated talks. The needle drifts and, every 8 s, retunes with an overshoot to another highlight: the talk's
   pull-quote (or else its question), the speaker on a slowly wobbling record, and a breathing waveform. "Hear 20 s"
   plays the highlight window from our own audio, on click only. The first frame is SSR'd complete. The talk with the
   longest line is shown first, and the lines are clamped, so a later rotation never counts as a later LCP.
2. **Ticker.** A WSFT call-sign crawl: just added, new voices, short quotations heard, the oldest recording, the
   longest listen.
3. **Tuner.** One big field ("A speaker, a topic, a phrase…"). It filters the whole index in the browser as you
   type, with diacritics folded, prefixes and a one-letter typo allowed in words of five or more letters. The knob
   turns when it has focus. Chunky radio preset keys: Hands of the Cause, House of Justice, Scholars & teachers,
   Pilgrim notes, Persian, Q&A, Video. A row of decade keys (decades with no talks are disabled). Presets and decades
   combine with the text. An aria-live count ("6 of 33 talks"). After a pause, matching transcript passages appear
   under "Heard in the transcripts". The URL mirrors ?q / ?p / ?era / ?speaker, and the server honours them too.
4. **The voices.** Each speaker appears ONCE, as a record on a drifting rack (two rows going opposite ways when
   there are more than 14). Hover spins the record. A click narrows the jukebox to that voice (the link also works
   without JS). This solves the "200 cards with the same face" problem.
5. **The jukebox.** A dense grid on a 7.25 rem row unit where the card's form encodes what the talk holds:
   * **Box set**: any speaker with 3 or more talks in view becomes ONE walnut case, with one portrait (4:5,
     face-centred) and a slowly riffling stack of record spines. Each spine links to a talk, and its edge is tinted
     by the talk's era. "All N talks by …" narrows to that voice.
   * **Pull-quote**: cream paper, a huge era-tinted quotation mark, Caslon italic, the citation, and "Quoted by X in
     *Title*" (the title is the link).
   * **Question**: deep walnut with an era-tinted glow. The generated question is the headline and links to that
     moment.
   * **Waveform disc**: generative art from the talk's 48 peaks as a sound ring around its own play button, tinted
     by era. The grade is a period label (Studio clear … Archival).
   * **Portrait**: always portrait-shaped. A 5:8 face-centred crop is anchored to the top, so the head is never
     cut. A portrait card never repeats a face that appeared in the previous six cards.
   * Sizes (wide, tall, lg) come from significance (quotations, cross-references, length, grade). The layout is
     seeded per day, so it is stable across reloads and identical in SSR and on the client, and reads as curated.
     Filtering reflows with FLIP, and new cards come in staggered. A scroll-driven rise uses the CSS `view()`
     timeline. On a phone the cards size to their content.
6. **On the program.** The topics most talks share, as gently bobbing chips. A chip tunes in that topic.
7. **Through the decades.** A sticky odometer rolls to the decade in view while that decade's talks float in (CSS
   `view()` timeline, with an IntersectionObserver fallback). Each decade heading tunes the jukebox to it.
8. **Dock.** One shared preview player (only one sound at a time), with progress, pause/stop, the title linking to
   the moment, Media Session metadata and the portrait as artwork.

## Faces
Every portrait goes through the image worker with `fo-face`. That is a DETR person box with the focal point biased to
the head. The worker has no zoom-out or padding parameter, so the design avoids crops that can lose a head: circles
use face-centred squares, box sets use 4:5, and portrait cards use 5:8 at `object-position: top`. No 16:9 crop
anywhere. A speaker without a portrait gets a generated record label: initials over a sunburst, ring or chevron
pattern hashed from the name, tinted by era, never a grey tile.

## Motion discipline
Only transforms and opacity are animated. Every loop pauses offscreen (IntersectionObserver → `.lr-paused`) and on
hover or focus. Ambient motion starts about 2.5 s after load or on the first interaction, so the first paint is a
complete still frame. `prefers-reduced-motion` gives a still page with scrollable shelves, no rotation and no drift.
CLS is 0.

## Data
GET /api/media/index returns one compact row per talk (about 1 KB: title, speaker, year, duration, language, kind,
grade, best printed quotation, top 3 subheaders with questions first, 4 topics, 48-point waveform, 20 s highlight
window, version) plus one row per speaker (portrait, count, years, role). Rows come from the repo
(`mediaIndexRows`), and each item's files are cached by updated_at in a temp file. A request re-reads at most 25
changed items; the rest finish in the background. Edge-cached for 300 s. SSR renders the first 30 cards, the hero,
the eras and JSON-LD (ItemList of AudioObject). The island fetches the full index at idle or on the first keystroke.

## Measured (production, Lighthouse 12, mobile)
Performance 89–95 (three runs; the /biography baseline is 75), accessibility 96, SEO 100, TBT 0–10 ms, CLS 0.
The remaining lever is site-wide: the render-blocking Google Fonts CSS (Amiri + Libre Caslon) in `Layout.astro`.

## Screenshots (production, 2026-10-22; `tmp/media-listing-shots/`)
final-desktop-light-{0,1,2}, final-desktop-dark-{0,1,2}, final-phone-light-{0,1}, final-phone-dark-{0,1},
final-phone-reduced-0 (reduced motion).

## Taste calls for Chad
* The call sign "WSFT" and the copy ("tuned to 1997", "On the program", "Through the decades").
* Box-set threshold: 3+ talks in view. With 1,400 YouTube talks it may want to be 5.
* "Scholars & teachers" is everyone who is not a Hand or a House member. The Hands and House lists are hard-coded
  in `listing-index.js`.
* Ambient motion waits about 2.5 s after load (this is for performance), and the hero retunes every 8 s.
* `/media/<slug>` keeps its own design; the old `MediaBrowser.svelte` is no longer used by /media.

## The talk page (/media/<slug>), same language
* **Broadcast card**: the speaker on a record (face-centred square; it spins while playing), a call-sign
  breadcrumb, the Gloock title, the speaker linked to their voice in the tuner, and tube labels (audio grade and issue,
  audience when the pipeline sets it, quotations linked). The summary, then the player on the amber dial glass: the
  waveform scrubber with the subheaders as brass station ticks and moments as needle-red pins, the time in dial
  figures, the section now playing, and the speed control. YouTube, standalone-page and download chips.
* **Slim sticky bar** once the hero's player scrolls away: record, title, section now playing, slim scrubber, time.
* **Transcript as a typeset document**: Caslon in a measured column, hyphenation, a drop cap, and the subheaders as
  section breaks with log times (questions marked). Quotation, person and work links are styled apart. Paragraph play
  buttons sit in the margin; an amber rule marks the paragraph now playing.
* **Breakouts**: the Writings appear as "studio inserts" (paper with an era stripe for quotations, walnut for
  cross-references; italic Caslon; the citation is the link). The speaker's own **moments** are on-air cards on the
  amber dial glass in Gloock, with play-this-excerpt, the moment page link and a share row. A Highlights strip above
  the transcript leads to them.
* **Program log** (margin TOC, current segment marked; collapsible on phones), topics linking into the tuner, and
  related talks (same voice first, at most 3, then shared topics).
* Behaviour is unchanged: word click, paragraph buttons, FAB + Follow, ?t= ranges, selection links, Media Session,
  keyboard. New: ?m=<key> opens at a moment with its range set.
* JSON-LD AudioObject (with transcript) + BreadcrumbList.

## Moments (shareable)
* Canonical **/media/<slug>/m/<key>**; **/m/<key>** 301s there, and a renamed talk 301s to its current slug. The
  page has the quote set large, the speaker's record, the excerpt's own waveform with play, "Hear it in context"
  (talk at ?t= range + #moment), YouTube from that time, the Writings it touches, more moments, more from the
  speaker, and back to the library. Share: copy, X, Facebook, WhatsApp, email, native. JSON-LD Quotation isPartOf
  the AudioObject.
* **Quote card** (og/twitter image): GET /api/media/moments/:key/card.jpg is a 1200×630 JPEG rendered on tower with
  sharp + Pango and the bundled OFL fonts (api/assets/fonts). It is cached per process and at the edge for a week.
  Bump `CARD_V` in the page when the design changes.
* The display faces are self-hosted in public/fonts, preloaded, with metric fallbacks.

## Measured (talk and moment pages, production, Lighthouse 12 mobile)
Talk pages score 74–88 on performance (they vary run to run; CLS 0, TBT ≤ 40 ms), 96 on accessibility and 100 on
SEO. FCP/LCP are bound by TTFB through the tunnel (~650 ms) and the render-blocking site-wide Google Fonts CSS
(Amiri + Libre Caslon) in Layout.astro. Making that CSS non-blocking is the next lever; it is a site-wide change.
