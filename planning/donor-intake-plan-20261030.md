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
- ~42k photos: in scope? later pass?

## Progress (10-30)
- A done (5ae8dfa0). Matching fixed (e365bbe8, f8d0a425): catalogue verdict from its reason; copies collapsed by fingerprint; books/scans vs
  librarian title index; junk+copies set aside. GOLDEN AGE: 283,964 files → 143,705 items; main 25,076, covenant-breaker 34.
- C done (622427e9, 1b9a8431): /admin/imports + /api/admin/imports/*. Gaps: creator mostly empty (CB authors); "More info" only records the
  request (no worker deep look yet); no printable report page yet (API only).
- Covenant-breaker authors (00be3b68, api/lib/archives/covenant-breakers.js: name + approximate year of the break) match on creator/title/path,
  not only the folder; the why says whose and whether written before the break. Re-adopt run 53357 (10:37): covenant-breaker 34 → 346,
  main 24,764, set-aside 118,595. Matches: new 15,982 · held 2,769 · unsure 6,294 · better version 65.
- Next: B = worker samples (first-minute transcript + 60 s clip for talks, title-page OCR for scans) on workers, never tower.

## Order
A: repo + tables + donors/drives + adopt golden-age catalog; grouping + match (pure, tested). B: recommendation + worker samples. C: admin page + decisions. D: import + report. E: backfill old collections.
