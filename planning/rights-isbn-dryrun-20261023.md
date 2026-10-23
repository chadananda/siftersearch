# Rights: ISBN rule — dry run (2026-10-23)

Chad 10-23: "with non-canonical books with ISBN codes, we should consider them copyright encumbered and the first 40 paragraphs is all we do" — narrowed: "This applies to published books." Only the document’s OWN ISBN counts (metadata, or its copyright/title page in the first 40 paragraphs beside a ©/publisher line; a cited ISBN never counts).

Report `rights-isbn`, run 8103 (dry run, nothing written). Code: api/lib/rights/{canonical,isbn,preview}.js, api/lib/ops/rights-isbn-job.js.

## Totals

- live documents scanned: 80,399
- canonical (never touched): 58,739 — institutional 1,170, collection 74, writings 54,067, oceanlibrary 564, scripture 2,864
- non-canonical: 21,660
- own ISBN found (all on a copyright page; no metadata ISBNs yet): 130
- **would become encumbered: 20** (books already encumbered: 62)

## By document type (non-canonical)

| type | documents | own ISBN found | would change |
|---|---|---|---|
| web-page | 14,394 | 33 | 0 |
| short | 2,591 | 4 | 0 |
| paper | 1,605 | 6 | 0 |
| news | 967 | 0 | 0 |
| pilgrim-notes | 649 | 3 | 0 |
| book | 561 | 82 | 20 |
| media | 403 | 0 | 0 |
| talk | 263 | 0 | 0 |
| letter | 104 | 0 | 0 |
| compilation | 92 | 2 | 0 |
| newsletter | 27 | 0 | 0 |
| thesis | 3 | 0 | 0 |
| metadata | 1 | 0 | 0 |

Only `book` changes. Papers, letters, talks, pilgrim notes, compilations, institutional documents, web pages, theses, newsletters, news, media and short items (< 100 paragraphs) keep their current rights even when an ISBN was found in them.

## Would change, by tradition / shelf

| tradition / collection | books |
|---|---|
| Baha'i / Books | 13 |
| Islam / History and Biography | 3 |
| Baha'i / Reference | 2 |
| Baha'i / Shaykhi and Babi Studies | 1 |
| Hindu / Modern | 1 |

All 20 are files in the main library (none scraped from a site).

## Sample titles (all 20 — fewer than 30 qualify)

| id | title | author | collection |
|---|---|---|---|
| 919261 | Quddus | johnson | Books |
| 919262 | Tahirih | johnson | Books |
| 956159 | One Bird, One Cage, One Flight: Homage to Emily Dickinson | Roger White | Books |
| 956162 | The Mantle of the Prophet: Religion and Politics in Iran | Roy Mottahedeh | History and Biography |
| 956168 | Emergence: Dimensions of a New World Order | Charles Lerche (editor); contributors include Loni Brarnson- | Books |
| 956174 | The Phoenix and the Ashes: The Bahá’í Faith and the Modern Apocalypse | Geoffrey Nash | Books |
| 956201 | The Bābī and Bahā’ī Religion | Sufi A. Q. Niyaz | Shaykhi and Babi Studies |
| 956231 | The Glory of the Father: The Case for Christ and Bahá’u’lláh | Hushidar Hugh Motlagh | Books |
| 956242 | Islam: From the Prophet Muhammad to the Capture of Constantinople, Vol. I: Politics and War | Bernard Lewis | History and Biography |
| 956243 | Lidia: The Life of Lidia Zamenhof, Daughter of Esperanto | Wendy Heller | Books |
| 956245 | Islam: From the Prophet Muhammad to the Capture of Constantinople, Volume 2: Religion and Society (A Documentary History of Western Civilization) | Bernard Lewis (editor and translator) | History and Biography |
| 956258 | Lord of Lords, Volume II: Prophecies of the Second Coming | Hushidar Motlagh | Books |
| 956262 | Bahá'í Lore | David Michael Piff | Books |
| 956271 | These Things Shall Be | Eric Bowes | Books |
| 956273 | Mark Tobey: Art and Belief | Arthur L. Dahl and others (essays by Dahl, William C. Seitz, | Books |
| 956281 | A Basic Baha'i Dictionary | Wendi Momen (General Editor) | Reference |
| 956333 | Names and Numbers: A Baha'i History Reference Guide | Elias Zohoori | Reference |
| 967487 | The Pure in Heart: The Historical Development of The Baha'i Faith in China, Southeast Asia and Far East | Jimmy Ewe Huat Seow | Books |
| 967488 | The Reincarnation Mystery Revealed | Dr. H. M. Munje | Modern |
| 967518 | Minimalism: A Bridge between Classical Philosophy and the Bahá'í Revelation | William S. Hatcher | Books |

## False-positive check — 10 random flagged books with their evidence line

| id | title | ISBN-13 | para | evidence |
|---|---|---|---|---|
| 956243 | Lidia: The Life of Lidia Zamenhof, Daughter of Esperanto | 9780853981954 | 6 | 'It was a real pleasure to read this book. The author is a rare combination of a lively writer and a thorough scientific researcher who, above an must have the facts correct. The r |
| 956271 | These Things Shall Be | 9780909991159 | 4 | P.O. Box 285, Mona Vale, N.S.W. 2103, Australia Authorised by the National Spiritual Assembly of the Baha'is of Australia Incorporated ALL RIGHTS RESERVED First Published 1980 ISBN |
| 956333 | Names and Numbers: A Baha'i History Reference Guide | 9789768012432 | 3 | Copyright © 1990 by Elias Zohoori All Rights Reserved Approved by The National Spiritual Assembly of the Bahá'ís of Jamaica Printed by the University Printers ISBN 976-8012-43-9 To |
| 967518 | Minimalism: A Bridge between Classical Philosophy and the Ba | 9789889745127 | 19 | ISBN 988-97451-2-7 This book has been produced with the consent of the original authors or rights holders. Authors or rights holders retain full rights to their works. Requests to  |
| 956168 | Emergence: Dimensions of a New World Order | 9781870989220 | 2 | © Bahá’í Publishing Trust 27 Rutland Gate London SW7 1PD ISBN 1 870989 22 8 Contents *Introduction*vii An Analysis of the Bahá’í World Order Model Loni Brarnson‑Lerche 1 From Leagu |
| 956174 | The Phoenix and the Ashes: The Bahá’í Faith and the Modern A | 9780853981992 | 1 | BY THE SAME AUTHOR IRAN’S SECRET POGROM — THE CONSPIRACY TO WIPE OUT THE BAHÁ’ÍS (Neville Spearman) THE PHOENIX AND THE ASHES The Bahá’í Faith and the Modern Apocalypse by GEOFFREY |
| 919262 | Tahirih | 9780908420292 | 22 | ISBN 0 908420 29 3 |
| 956162 | The Mantle of the Prophet: Religion and Politics in Iran | 9780394748658 | 7 | Iran-Politics and government-1941-1979. I. Title. BP192.7.168M67 1986 955l.053 86-15092 ISBN 0-394-74865-4 Manufactured in the United States of America First Pantheon Paperback Edi |
| 956242 | Islam: From the Prophet Muhammad to the Capture of Constanti | 9780802720238 | 8 | Published simultaneously in Canada by Fitzhenry & Whiteside, Limited, Toronto. ISBN: 0-8027-2023-4 Library of Congress Catalog Card Number: 72-7229 Printed in the United States of  |
| 956231 | The Glory of the Father: The Case for Christ and Bahá’u’lláh | 9780937661291 | 3 | ISBN 0-937661-29-5 Library of Congress Catalog Card No. 98-94046 Cover design by Lori Block The New English Bible (NEB) |

Reviewed: each of the 20 is a published book whose ISBN sits on its own copyright/title or back-cover page (George Ronald, Bahá’í Publishing Trust UK/India, Walker & Co., Knopf, Global Perspective, Bahá’í Publications Australia …). No bibliography or citation ISBN was taken (a bibliography case is in tests/api/rights-isbn.test.js).
Worth Chad's eye before applying:
- 967518 Hatcher, *Minimalism* — its page says it was "produced with the consent of the original authors or rights holders" (may be meant to be shared).
- 956271 *These Things Shall Be*, 956333 *Names and Numbers*, 967487 *The Pure in Heart* — individual authors, but "authorised/approved by" an NSA or issued by a BIC committee. Treated as books (the author is a person), not institutional texts.
- 956162 Mottahedeh, 956242/956245 Lewis (Islam / History and Biography), 967488 Munje (Hindu / Modern) — the other-tradition modern-scholarship shelves.

## Not applied
Awaiting Chad’s review of the list above. Apply with: `node scripts/ops/ops.mjs report rights-isbn --params '{"write":true}' --wait` (records the ISBN on all 130 documents; encumbers only the 20 books; never un-encumbers).
