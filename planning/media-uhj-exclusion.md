# Media: newer-generation UHJ members excluded (Chad 10-23)

Rule `newer-generation` (data/media-exclusions.json): "I'm trying to bring in people with a historical perspective."
Excluded: Douglas Martin, Farzam Arbab, Kiser Barnes, Firaydoun Javaheri, Payman Mohajer, Paul Lample, Gustavo Correa,
plus every member first elected after 2000: Shahriar Razavi, Stephen Birkland, Stephen Hall, Chuungu Malitonga,
Ayman Rouhani, Juan Francisco Mora, Praveen Mallik. **Kept:** Hartmut Grossmann, Hooper Dunbar, every earlier member, and the
Hand of the Cause Raḥmatu'lláh Muhájir under any spelling.

## How a talk is decided (api/lib/media/exclusions.js `decide`, one answer for job / index / rank / runItem)

Chad: "spelling is not trustworthy". People live in data/media-speaker-people.json (`exclude`, `exclude_match`,
`exclude_title`, `exclude_surname`, `exclude_surname_title`, `exclude_keep`).

- **Excluded**: the GIVEN NAME is present — in the title or the YouTube/source title ("2015. Farzam Arbab. US National
  Convention"), or in a full-name speaker attribution when no title names only the surname.
- **Unsure** (listed for Chad, NOT excluded): surname only ("Dr. Mohajer", "Mr Birkland", "Dr Javaheri").
- **Never matched**: `exclude_keep` — anything naming Raḥmatu'lláh (the Hand Muhájir).

## Applied 10-23 (run 9558, write; dry run 9551 had the same list)

| Person | Unpublished (were on /media) | Dequeued (queued imports) |
|---|---|---|
| Farzam Arbab | 3 | 14 |
| Firaydoun Javaheri | 2 | 26 |
| Gustavo Correa | 1 | 3 |
| J. Douglas Martin | 1 | 12 |
| Paul Lample | 1 | 19 |
| Stephen Birkland | 3 | 14 |
| Juan Francisco Mora | 0 | 6 |
| Kiser Barnes | 0 | 5 |
| Shahriar Razavi | 0 | 2 |
| Stephen Hall | 0 | 1 |
| Praveen Mallik | 0 | 3 |
| Payman Mohajer, Chuungu Malitonga, Ayman Rouhani | 0 | 0 |
| **Total** | **11** | **105** |

Each one: `media_items.state = 'excluded'` with the reason (no lane picks it up, every /media route answers 404), its
transcript document soft-deleted (11 documents; the outbox takes them out of the search layers), archive files kept.
Targets in planning/media-targets/youtube-talks.json not yet registered are skipped by the rank job, so they never come in.
No runs were in flight (0 cancelled).

Published talks removed: arbab-us-national-convention-2015, arbab-development-a-challenge-to-bahai-scholars-1982,
arbab-theme-of-the-three-year-plan-1992, javaheri-protecting-the-cause-of-god-2007, javaheri-opposition-and-perseverance-2006,
correa-working-for-betterment-of-society-2008, turning-point-for-the-world-1992 (Douglas Martin by attribution only: the
title "1992 Bahá'í World Congress: Turning Point for the World" names no one), lample-becoming-champions-of-justice-2007,
birkland-greenlake-bahai-1988, birkland-atl-regional-conference-bahai-2008,
birkland-1991-steve-birkland-auxiliary-board-member-greenlake-wiscons.

## Unsure: Chad decides (still published or queued)

| Talk | State | Evidence | Might be |
|---|---|---|---|
| lawh-i-ihtiraq-fire-tablet-2013 "Lawḥ-i-Iḥtiráq (Fire Tablet)", Persian, channel Bahai Glory | published | speaker label "Dr. Mohajer"; 2013 is the YouTube upload date, not the recording date | Payman Mohajer, or the Hand Raḥmatu'lláh Muhájir (needs a listen) |
| 2013-09-21-mr-birkland-at-son "2013 09 21 Mr Birkland at SON" | published | title has the surname only | Stephen Birkland |
| #1100 "Dr Javaheri - 9 May letter of the House of Justice" | queued | title has the surname only | Firaydoun Javaheri |
| #1401 "vancouver conference /Dr Birkland" | queued | title has the surname only | Stephen Birkland |

To confirm one, add its distinguishing text to the person's `exclude_match` / `exclude_title`, or (for the Hand) link the
talk to `rahmatullah-muhajir`, then rerun:
`node scripts/ops/ops.mjs report media-exclude --params '{"write":false}' --wait` (check the list), then `'{"write":true}'`.
