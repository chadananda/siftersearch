# Donor intake: drive → assess → approve → import → printed report (Chad 10-30)

"Duane might send me 20 drives over time … copy over, assess, import, generate a printed report, mail it back with the drive.
Likewise for every person who sends me a collection … This will encourage people to send me collections."

## Model
donor (Duane Troxel, Kanz, Phelps…) → drive / shipment (custody: received, copied + verified, returned) → item (a book, a talk, a photo set;
many files) → decision (approve / deny / more info) → import (Dewey book intake or media pipeline, provenance label) → report.
Tables via a repo (`api/lib/repos/archives-repo.js`), never direct DB from scripts. Draft schema: planning/dewey-archives-20261028.md (extend with donors, drives custody, items).

## Steps per drive
1. Copy to /tank/archives/<id> (done for golden-age: 1.9 TB, 284k files) — rsync, ionice idle, sifter-bulk slice.
2. Catalog (done for golden-age in ~/archive-sifter/golden-age.db) → move into the repo tables.
3. Group files into items: PDF/EPUB = book; folder of TIF/JPG pages = scanned book/newspaper; audio/video = talk; photo folder = photo set; junk set aside but listed.
4. Match vs library: sha (findMediaBySha, findBySha, dewey_checks), title+duration (talks), title+author (books) → new | held | better version | unsure.
5. Sample on WORKERS (tower placement): first-minute transcript + 60 s clip (R2), first pages OCR / title page.
6. Recommend: score + one-paragraph why + proposed metadata + destination. New & rare, early recordings, early believers/Hands, better copies first.
7. /admin/imports: tab per drive (grouped per donor), sections by type sorted by score; Approve / Deny / More info (worker deep look, item returns with answer); bulk approve a group.
8. Import approved: Dewey intake (books), media-scan (talks), label "Donated by <donor>".
9. Report: printable page per drive and per donor (cumulative): thank-you header, drive custody dates, imported items (title, type, link), counts already held / not taken. Print CSS.
10. Backfill: earlier collections (Kanz, Phelps, Collection 08, golden-age 292) from `.source.json` sidecars where provenance exists.

## Decided (Chad 10-30)
- New collections: Chad names the donor and where the data is (a /tank folder or a drive plugged into tower). Add = register donor + drive,
  copy to /tank/archives/<id> (attached drives mounted read-only) as an ops job (`archive-copy`), then catalog. Never an ad-hoc ssh copy.
- Covenant-breaker books: a SEPARATE section in the drive's tab, never in the main ranking. Each shows author, book date and the author's
  covenant-breaking date, so Chad can take the ones written before. Source: the drive's own folder (e.g. Books_by_Covenant-Breakers) + an author list.

## Open
- (none)

## Decided (Chad 10-31)
- Photos are NOT in scope for now. The copied archive on /tank/archives is kept whole, so photos (and anything else) can be explored later.
  Current focus: historical TALKS and BOOKS. Photo sets stay listed under set-aside, never recommended.
- Chad wants to see and approve the intake process before more is built or imported (process laid out 10-31: steps 1–9 above).

## Progress (10-30)
- A done (5ae8dfa0). Matching fixed (e365bbe8, f8d0a425): catalogue verdict from its reason; copies collapsed by fingerprint; books/scans vs
  librarian title index; junk+copies set aside. GOLDEN AGE: 283,964 files → 143,705 items; main 25,076, covenant-breaker 34.
- C done (622427e9, 1b9a8431): /admin/imports + /api/admin/imports/*. Gaps: creator mostly empty (CB authors); "More info" only records the
  request (no worker deep look yet); no printable report page yet (API only).
- Covenant-breaker authors (00be3b68, api/lib/archives/covenant-breakers.js: name + approximate year of the break) match on creator/title/path,
  not only the folder; the why says whose and whether written before the break. Re-adopt run 53357 (10:37): covenant-breaker 34 → 346,
  main 24,764, set-aside 118,595. Matches: new 15,982 · held 2,769 · unsure 6,294 · better version 65.
- Next: B = worker samples (first-minute transcript + 60 s clip for talks, title-page OCR for scans) on workers, never tower.

## Progress (10-31)
- Steps 5–7 built (30502acf, 3a1ffec3, 4062ecce): `archive-sample` ops job stages each candidate to the LAN queue (type `intake`,
  stage intake-talk | intake-book); `scripts/media/worker/intake-agent.mjs` + `intake_sample.py` on HOME hosts (aorus: talks 1 GPU + books 2;
  boss: books 4, `--can intake-book`) write first-minute transcript + 60 s clip / title-page image + OCR; tower pulls → R2 (clips stage bucket,
  title pages `siftersearch` bucket via /img) + `sample` + re-recommendation (`api/lib/archives/sample-rec.js`, no LLM, $0). "More info" →
  deep look (5 min / 12 pages) → item returns undecided with the answer. /admin/imports shows sample, title image (svcFixed), answer.
  A window PER STAGE (queue stats `queued_by_stage`): GPU talks waiting must not idle the CPU book slots.
- Step 8 built: `archive-import` (lane archive) — approved talks → hard link under DEWEY_MEDIA_DIR/donors/<drive>/ → media-scan; approved
  books (a document file; page-image folders skipped until a PDF exists) → <ingest>/_add-anyway/donors/<drive>/ → dewey-ingest-folder
  (appraisal + QUALITY GATE still apply). Every file gets `<file>.source.json` ("Donated by <donor>", drive, original path, approval);
  Dewey keeps it as `identified.provenance` and writes `provenance:` into the markdown front matter; media items keep it as `source.archive`.
  Later runs fill each item's public link (/media/<slug>, /document/<id>) for the report. Archive never written (hard link / copy).
    `node scripts/ops/ops.mjs report archive-import --params '{"drive":"golden-age"}'`
- Step 1 built: `archive-copy` (own lane `copy`) — refuses a read-write mount; registers donor + drive (copying, received_at); rsync
  (ionice idle, nice 19, resumable, yields to a drain); verifies file count + bytes; custody → cataloged. archive-sifter catalogues the
  copy within 10 min, then archive-adopt. NEW DRIVE (on tower: `sudo mount -o ro /dev/sdX1 /mnt/<drive>` first):
    `node scripts/ops/ops.mjs report archive-copy --params '{"drive":"<id>","donor":"<donor-id>","donorName":"<Name>","label":"<label on the drive>","source":"/mnt/<drive>"}'`
    then `node scripts/ops/ops.mjs report archive-adopt --params '{"drive":"<id>","donor":"<donor-id>","donorName":"<Name>","label":"<label>"}'`
- Step 9 (1f00dbae): printable drive + donor reports; no images on them (nothing to route through the image helper).
- GOLDEN AGE sampling running (archive-sample requeues itself every 20 min). Talks on aorus share the GPU with remastering (GPU lease
  admission), so they run in the gaps; books on CPU (aorus 2 + boss 4).

## Order
A: repo + tables + donors/drives + adopt golden-age catalog; grouping + match (pure, tested). B: recommendation + worker samples. C: admin page + decisions. D: import + report. E: backfill old collections.
