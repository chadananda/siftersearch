# Book metadata hunt + publisher rights rule — dry run (2026-10-23)

Chad 10-23: "I think we should go on an ISBN hunt. Books from George Ronald, for instance, are copyright encumbered. … We have to look for author image, publishing date, Amazon link etc. anyway."

Code: api/lib/books/{hunt,publishers}.js, api/lib/ops/book-hunt-job.js (reports `book-hunt`, `book-hunt-apply`, `book-meta-coverage`, `rights-publisher`), migration 177.

## The hunt

Books hunted: 569 (561 non-canonical + 8 canonical published books), errors 0, sent to review 127.

Fields found, by confidence (only `high` is ever applied):

| field | high | medium |
|---|---|---|
| isbn13 | 100 | 109 |
| publisher | 203 | 67 |
| year | 203 | 69 |
| edition | 63 | 6 |
| purchase_url | 100 | 109 |
| cover | 108 | 118 |
| author_image | 72 | 20 |
| author_born | 51 | 34 |
| author_died | 25 | 32 |

Sources, cheapest first: the book’s own copyright page → Open Library (ISBN edition, title+surname search, editions, author) → Google Books (its free daily quota was exhausted for part of the run) → Wikidata/Commons portraits (speaker-gallery rules: short side ≥ 400 px, one person, a licence) → our verified speaker photos. Jev only between different matching works: 139 calls over three runs, $0.01. No other paid model or API. Covers: 72 stored (36 Open Library ISBNs had no cover).

## Coverage before → after (applied: high confidence only, empty fields only)

| | books | ISBN | publisher | year | purchase link | author image | cover |
|---|---|---|---|---|---|---|---|
| noncanonical before | 561 | 0 | 0 | 0 | 0 | 0 | 2 |
| noncanonical after | 561 | 100 | 201 | 202 | 100 | 71 | 74 |
| canonical before | 8 | 0 | 0 | 0 | 0 | 0 | 1 |
| canonical after | 8 | 0 | 2 | 1 | 0 | 1 | 1 |

Author photos: 72 from our verified speaker gallery or Wikidata P18 (the gallery's size/single-person/licence rules; no face
check is run here, and Commons photos are linked, not yet copied to R2). Dates where known: "b. 1921" when no death year.
The reader shows the author photo + dates, publisher · year · edition, ISBN and "Buy this book" (Amazon search by ISBN).
127 books have medium-confidence finds (an edition we cannot identify, a fuzzy match) — kept in book_hunt, not applied.

## Publisher rule — DRY RUN, not applied

Rule: a non-canonical book whose own copyright page (or a high-confidence catalogue match) names a commercial or private press → encumbered (`rights_reason: publisher-commercial`); a book with a high-confidence ISBN of its own edition → encumbered (`isbn-noncanonical`). Bahá’í Publishing Trusts and similar national Bahá’í houses (also Association for Bahá’í Studies, Wilmette Institute) → REVIEW, pending Chad. Institutional publishers → never. Nothing is ever un-encumbered.

- non-canonical books: 561; already encumbered: 92
- **would become encumbered: 34** (publisher-commercial 31, isbn-noncanonical 3)
- review (Publishing Trusts etc.): 63; institutional publisher: 18; no publisher/ISBN evidence: 354

| publisher | would encumber |
|---|---|
| George Ronald | 19 |
| Oneworld Publications | 3 |
| Kalimát Press | 2 |
| Global Perspective | 2 |
| Naturegraph | 1 |
| Simon and Schuster | 1 |
| Islam International Publications Ltd | 1 |
| Walker & Company | 1 |
| Caribbean Printers Ltd. | 1 |
| Juxta Publishing | 1 |

### Sample of 20 with evidence

| id | title | author | publisher / ISBN | reason | evidence |
|---|---|---|---|---|---|
| 956281 | A Basic Baha'i Dictionary | Wendi Momen (General Editor) | George Ronald | publisher-commercial | Wendi Mornen GEORGE RONALD |
| 967532 | The Search for a Just Society | John Huddleston | George Ronald | publisher-commercial | The Earth is But One Country (BAHA'i PUBLISHING TRUST) Achieving Peace by the Year 2000 (ONEWORLD) <piii> THE SEARCH FOR A JUST SOCIETY {by} |
| 919243 | ABU3253 | inventory-ABU3253 | George Ronald | publisher-commercial | 'ABDU'L-BAHA 'ABDV'L-BAHA The Centre of the Covenant of Bahd'u' lJah by H. M. BALYUZI GEORGE RONALD OXFORD First published by George Ronald  |
| 956159 | One Bird, One Cage, One Flight: Homage to Emily Dickinson | Roger White | Naturegraph | publisher-commercial | Title. PR9199.3.W453051983 811'.54 83-22119 ISBN 0-87961-141-3, paperback ISBN 0-87961-140-5, cloth Naturegraph Publishers, Inc. |
| 956273 | Mark Tobey: Art and Belief | Arthur L. Dahl and others (ess | G. Ronald | publisher-commercial | /books/OL2969019M |
| 956282 | The Chinese Religion and the Baha'i Faith | Phyllis Ghim Lian Chew | George Ronald | publisher-commercial | GEORGE RONALD OXFORD |
| 967488 | The Reincarnation Mystery Revealed | Dr. H. M. Munje | 9788186953020 | isbn-noncanonical | The Reincarnation Mystery Revealed by Dr. H. M. Munje Bahá'í Publishing Trust 6 Canning Road P.B. No. 19 New Delhi-110001 India (c ) Nationa |
| 982946 | The Baha'i Faith in America: Early Expansion 1900–1912, Volu | Robert H. Stockman | George Ronald | publisher-commercial | UK George Ronald by Robert H. Stockman |
| 956175 | Door of Hope: A Century of the Baha'i Faith in the Holy Land | David S. Ruhe | George Ronald | publisher-commercial | Hosea 2.15 GEORGE RONALD OXFORD. |
| 956261 | Olya's Story: A Survivor's Dramatic Account of the Persecuti | Olya Roohizadegan | Oneworld Publications | publisher-commercial | Olya Roohizadegan ONEWORLD |
| 956130 | A For Effort: And Other Stories for Today's Young Heroes | Susan J. Allen | Oneworld Publications | publisher-commercial | Susan J. Allen ONEWORLD |
| 956334 | Resurrection and Renewal: The Making of the Babi Movement in | Abbas Amanat | Kalimát Press | publisher-commercial | Paperback Edition 2005 is distributed by Kalimat Press as volume twenty of the series STUDIES IN THE BAB! AND BAHA’I' RELIGIONS. |
| 967518 | Minimalism: A Bridge between Classical Philosophy and the Ba | William S. Hatcher | Juxta Publishing | publisher-commercial | JUXTA PUBLISHING LTD. (HONG KONG) |
| 919212 | AB01763 | inventory-AB01763 | George Ronald | publisher-commercial | Leaves of the Twin Divine Trees Leaves of the Twin Divine Trees An In-depth Study of the Lives of Women Closely Related to the Bab and Baha' |
| 956176 | Preparing for a Bahá’í/Christian Dialogue, Volume 2: Underst | Michael W. Sours | Oneworld Publications | publisher-commercial | Michael W. Sours ONEWORLD |
| 956195 | Islam and the Baha'i Faith, Chapter 4: Islamic Prophecies | Moojan Momen | George Ronald | publisher-commercial | Islam & the Baha'i Faith by Moojan Momen (c) 2000 Moojan Momen 2000 Published by George Ronald, Oxford, England Chapter 4 +87 Chapter 4 Isla |
| 956333 | Names and Numbers: A Baha'i History Reference Guide | Elias Zohoori | Caribbean Printers Ltd. | isbn-noncanonical | /books/OL494208M |
| 956179 | Other People, Other Places | Marzieh Gail | George Ronald | publisher-commercial | GEORGE RONALD O X F O R D +iv GEORGE RONALD, Publisher High Street, Kidlington, Oxford 0x5 2DN @ Marzieh Gail 1982 All Rights Reserved Repri |
| 956243 | Lidia: The Life of Lidia Zamenhof, Daughter of Esperanto | Wendy Heller | George Ronald | publisher-commercial | Wendy Heller GEORGE RONALD |
| 956245 | Islam: From the Prophet Muhammad to the Capture of Constanti | Bernard Lewis (editor and tran | Walker & Company | publisher-commercial | /books/OL11209475M |

### George Ronald — all 90

| id | title | author | already encumbered | evidence |
|---|---|---|---|---|
| 426 | The Child of the Covenant | Adib Taherzadeh | yes | George Ronald Oxford |
| 427 | The Covenant of Bahá’u’lláh | Adib Taherzadeh | yes | GEORGE RONALD Publisher Limited |
| 429 | The Revelation of Bahá’u’lláh vol. 1 | Adib Taherzadeh | yes | GEORGE RONALD OXFORD |
| 430 | The Revelation of Bahá’u’lláh vol. 2 | Adib Taherzadeh | yes | George Ronald |
| 462 | Bahá’u’lláh -- The King of Glory | H.M. Balyuzi | yes | George Ronald, Publisher 46 High Street, Kidlington, Oxford, OX5 2DN |
| 463 | Bahá’u’lláh, a Brief Life -and- The Word Made Flesh | H.M. Balyuzi | yes | GEORGE RONALD LONDON |
| 464 | Edward Granville Browne and The Bahá’í Faith | H.M. Balyuzi | yes | George Ronald London [pg iv] |
| 465 | Muḥammad and the Course of Islam | H.M. Balyuzi | yes | GEORGE RONALD OXFORD [pg iv] (c) H. M. Balyuzi 1976 Reprint 1976 [pg v] |
| 466 | The Báb - The Herald of the Days | H.M. Balyuzi | yes | The Báb - The Herald of the Days By H. M. Balyuzi George Ronald, Oxford [pg iv] |
| 491 | Dawn Over Mount Hira | Marzieh Gail | yes | GEORGE RONALD OXFORD |
| 494 | Summon Up Remembrance | Marzieh Gail | yes | George Ronald Oxford |
| 522 | Bahá’í Ethics in Light of Scripture, Vol. 1 | Udo Schaefer | yes | George Ronald Oxford |
| 523 | Bahá’í Ethics in Light of Scripture, Vol. 2 | Udo Schaefer | yes | George Ronald Oxford |
| 527 | Making the Crooked Straight | Udo Schaefer | yes | GEORGE RONALD OXFORD |
| 531 | The Light Shineth in Darkness | Udo Schaefer | yes | George Ronald, Oxford Reprinted 1980 [pg v] |
| 539 | Thief in the Night | William Sears | yes | Published by George Ronald |
| 3789 | ’Abdu’l-Bahá -- The Centre of the Covenant of Bahá’u’lláh | H.M. Balyuzi | yes | George Ronald London [pg iv] |
| 3887 | Eminent Bahá’ís in the Time of Bahá’u’lláh | H.M. Balyuzi | yes | GEORGE RONALD OXFORD [pg vi] ... (c) Mary Balyuzi 1985 [pg vii] [pg viii] [pg ix] |
| 6289 | Arches of the Years | Marzieh Gail | yes | GEORGE RONALD OXFORD [pg iv] [pg v] [pg vi] [pg vii] [pg viii] [pg ix] [pg x] |
| 7132 | Lights of Fortitude: Glimpses into the Lives of the Hands of | Barron Deems Harper | yes | George Ronald Oxford [pg iv] |
| 7143 | Shoghi Effendi in Oxford | Riaz Khadem | yes | George Ronald Oxford |
| 7160 | Immortal Heroines | Jacqueline Mehrabi | yes | GEORGE RONALD OXFORD |
| 7173 | Lua Getsinger: Herald of the Covenant | Velda Piff Metalmann | yes | George Ronald Oxford |
| 7174 | From Vision to Victory | Eunice Braun | yes | GEORGE RONALD OXFORD |
| 7176 | The Heavens are Cleft Asunder | Huschmand Sabet | yes | George Ronald - Oxford [pg ii] |
| 7181 | The March of the Institutions | Eunice Braun | yes | GEORGE RONALD |
| 7199 | The Most Mighty Branch | Hitjo Garst | yes | GEORGE RONALD OXFORD |
| 7201 | Forces of Our Time: The Dynamics of Light and Darkness | Hooper C. Dunbar | yes | George Ronald Oxford |
| 7226 | George Townshend, Hand of the Cause of God | David Hofman | yes | GEORGE RONALD |
| 7274 | The Promise of All Ages | George Townshend | yes | George Ronald, Publisher [pg iv] [pg v] |
| 8228 | The Prince of Martyrs | Abu'l-Qásim Faizi | yes | Publisher: George Ronald |
| 8256 | A Commentary on the Will and Testament of 'Abdu'l-Bahá | David Hofman | yes | GR GEORGE RONALD OXFORD [pg ii] |
| 8257 | Christ and Bahá'u'lláh | George Townshend | yes | GR GEORGE RONALD Oxford |
| 8258 | Stories of Bahá'u'lláh | 'Alí-Akbar Furútan | yes | GR GEORGE RONALD Oxford |
| 8276 | The Mission of Bahá'u'lláh and Other Literary Pieces | George Townshend | yes | GEORGE RONALD |
| 8279 | The Bahá’í Religion: A Short Introduction to its History and | Peter Smith | yes | GR GEORGE RONALD OXFORD |
| 8280 | A Reader's Guide: The Development of Bahá’í Literature in En | Eunice Braun | yes | GEORGE RONALD OXFORD |
| 8282 | Bahá'u'lláh, The Prince of Peace: A Portrait | David Hofman | yes | GR GEORGE RONALD OXFORD [pg v] |
| 8290 | Ásíyih Khánum: The Most Exalted Leaf entitled Navváb | Baharieh Rúḥáni Ma'ani | yes | GEORGE RONALD OXFORD |
| 8310 | Corinne True: Faithful Handmaid of 'Abdu'l-Bahá | Nathan Rutstein with Edna M. T | yes | GEORGE RONALD OXFORD [pg iv] |
| 8322 | Bahá'u'lláh, A Brief Life: The Word Made Flesh | Hasan M. Balyuzi | yes | London: George Ronald, 1963 |
| 8465 | Robe of Light: The Persian Years of the Supreme Prophet Bahá | David S. Ruhe | yes | GEORGE RONALD OXFORD |
| 8467 | Her Eternal Crown: Queen Marie of Romania and the Bahá’í Fai | Della L. Marcus | yes | George Ronald Oxford |
| 8488 | Hinduism and the Bahá’í Faith | Moojan Momen | yes | George Ronald Oxford |
| 9095 | Abdu'l-Bahá in Their Midst | Earl Redman | yes | This book is dedicated to ’Abdu’l-Bah‡ for His example and inspiration It is also dedicated to my wife, Sharon O'Toole,  |
| 11169 | The Great African Safari | Violette Nakhjavani | yes | GEORGE RONALD OXFORD [pg iv] |
| 11177 | The Babi and Bahá’í Religions 1844-1944: Some Contemporary W | Moojan Momen (editor) | yes | GEORGE RONALD, Publisher 46 High Street, Kidlington, Oxford, OX5 2DN |
| 11224 | The Sheltering Branch | Marzieh Gail | yes | London: George Ronald, 1959 |
| 11236 | The Flame | William Sears, Robert Quigley | yes | Oxford: George Ronald, 1972 |
| 11249 | Arches of the Years | Marzieh Gail | yes | Oxford: George Ronald, 1991 |
| 11263 | Shoghi Effendi: Recollections | Ugo Giachery | yes | Oxford: George Ronald, 1973 |
| 11266 | From Copper to Gold: The Life of Dorothy Baker | Dorothy Freeman Gilstrap | yes | Oxford: George Ronald, 1984 |
| 11340 | Memories of Nine Years in 'Akká | Youness Afroukhteh | yes | GEORGE RONALD OXFORD |
| 11345 | Milly: A Tribute to The Hand of the Cause of God Amelia E. C | Abu'l-Qásim Faizi | yes | First published by George Ronald 46 High Street, Kidlington, Oxford, OX5 2DN |
| 11355 | Maḥmúd's Diary | Mírzá Maḥmúd-i-Zarqání | yes | George Ronald Oxford |
| 16729 | Badi Bushrui, Ahmad Sohrab, 1915, Habibullh Muayyad, Bad Bus | Habibu''llah Mu''ayyad, Badi'' | yes | Ḥabíbu’lláh Mu’ayyad (1888–1971) came to Haifa in 1907 on pilgrimage, and on ’Abdu’l-Bahá’s instructions went to Beirut  |
| 919212 | AB01763 | inventory-AB01763 | **no → would be** | Leaves of the Twin Divine Trees Leaves of the Twin Divine Trees An In-depth Study of the Lives of Women Closely Related  |
| 919217 | AB02410 | inventory-AB02410 | **no → would be** | GEORGE RONALD, PUBLISHER Oxford www.grbooks.com © Violette Nakhjavani 2011 All Rights Reserved Reprinted 2011 A catalogu |
| 919243 | ABU3253 | inventory-ABU3253 | **no → would be** | 'ABDU'L-BAHA 'ABDV'L-BAHA The Centre of the Covenant of Bahd'u' lJah by H. M. BALYUZI GEORGE RONALD OXFORD First publish |
| 956132 | Tristan | Suzanne Schuurman | yes | Suzanne Shuurman GEORGE RONALD |
| 956172 | Portraits of Some Baha'i Women | O.Z. Whitehead | yes | Whitehead George Ronald Oxford +iii GEORGE ROLAND, Publisher High Street, Kidlington, Oxford 0x5 2DN O.Z. WHITEHEAD 1996 |
| 956174 | The Phoenix and the Ashes: The Bahá’í Faith and the Modern A | Geoffrey Nash | **no → would be** | /books/OL2303487M |
| 956175 | Door of Hope: A Century of the Baha'i Faith in the Holy Land | David S. Ruhe | **no → would be** | Hosea 2.15 GEORGE RONALD OXFORD. |
| 956178 | Some Early Baha'is of the West | O. Z. Whitehead | yes | Z. WHITEHEAD GEORGE RONALD OXFORD +iv George Ronald High Street, Kidlington, Oxford O O. Z. WHITBHEAD 1976 ALL RIGHTS RE |
| 956179 | Other People, Other Places | Marzieh Gail | **no → would be** | GEORGE RONALD O X F O R D +iv GEORGE RONALD, Publisher High Street, Kidlington, Oxford 0x5 2DN @ Marzieh Gail 1982 All R |
| 956183 | Ethel Jenner Rosenberg: The Life and Times of England's Outs | Robert Weinberg | **no → would be** | +v Preface It was in the summer of 1990 that a casual conversation with Dr Wendi Momen, chairman of the National Spiritu |
| 956191 | The Baha'i Faith in America: Early Expansion 1900–1912, Volu | Robert H. Stockman | **no → would be** | The Baha'i Faith in America Early Expansion 1900 ‑‑ 1912 Volume 2 UK George Ronald by Robert H. Stockman less than 1 MB  |
| 956195 | Islam and the Baha'i Faith, Chapter 4: Islamic Prophecies | Moojan Momen | **no → would be** | Islam & the Baha'i Faith by Moojan Momen (c) 2000 Moojan Momen 2000 Published by George Ronald, Oxford, England Chapter  |
| 956243 | Lidia: The Life of Lidia Zamenhof, Daughter of Esperanto | Wendy Heller | **no → would be** | Wendy Heller GEORGE RONALD |
| 956244 | The Seven Martyrs of Hurmuzak | Muhammad Labib (translated fro | yes | Muhammad Labib • Translated from the Persian and with a foreword by Moojan Mornen • GEORGE RONALD OXFORD |
| 956248 | When We Grow Up | Bahíyyih Nakhjavání | **no → would be** | \ GEORGE RONALD, Publisher 46 High Street. Kidlington, Oxford OX 5 2D N Contents ALL RIGHTS RESE RVED © Bahiyyi h NaJill |
| 956260 | Poems of the Passing | Ruhiyyih Rabbani | yes | POEMS OF THE PASSING BY RUHiYYIH RABBANI GEORGE RONALD OXFORD |
| 956262 | Bahá'í Lore | David Michael Piff | **no → would be** | George Ronald Oxford |
| 956267 | Some Baha'is to Remember | O.Z. Whitehead | **no → would be** | GEORGE RONALD OXFORD |
| 956268 | Leroy Ioas: Hand of the Cause of God | Anita Ioas Chapman | yes | Hand if the Cause if God by ANITA IOAS CHAPMAN GEORGE RONALD OXFORD |
| 956272 | Response | Bahiyyih Nakhjavani | yes | GEORGE RONALD OXFORD |
| 956273 | Mark Tobey: Art and Belief | Arthur L. Dahl and others (ess | **no → would be** | /books/OL2969019M |
| 956274 | A Cry from the Heart: The Baha'is in Iran | William Sears | yes | WILLIAM SEARS GEORGE RONALD |
| 956279 | A Crown of Beauty | Unknown | yes | 15. H. M. Balyuzi 'Abdu'l- Bahd (George Ronald, |
| 956281 | A Basic Baha'i Dictionary | Wendi Momen (General Editor) | **no → would be** | Wendi Mornen GEORGE RONALD |
| 956282 | The Chinese Religion and the Baha'i Faith | Phyllis Ghim Lian Chew | **no → would be** | GEORGE RONALD OXFORD |
| 967481 | Studying the Writings of Shoghi Effendi | Morten Bergsmo (editor) | yes | <piii> GEORGE RONALD, Publisher 46 High Street, Kidlington, Oxford, OX5 2DN (c) Morten Bergsmo, 1991 ALL RIGHTS RESERVED |
| 967502 | Four on an Island | Bahiyyih Nakhjavani | yes | <pi> Four on an Island by Bahiyyih Nakhjavani GEORGE RONALD OXFORD <pii> GEORGE RONALD, Publisher 46 High Street, Kidlin |
| 967519 | Asking Questions: A Challenge to Fundamentalism | Bahiyyih Nakhjavani | **no → would be** | Asking Questions {A Challenge to Fundamentalism} by Bahiyyih Nakhjavani GEORGE RONALD OXFORD <piv> GEORGE RONALD, Publis |
| 967520 | Studying the Writings of Shoghi Effendi | Morten Bergsmo (editor) | yes | <piii> GEORGE RONALD, Publisher 46 High Street, Kidlington, Oxford, OX5 2DN (c) Morten Bergsmo, 1991 ALL RIGHTS RESERVED |
| 967522 | Consultation: A Universal Lamp of Guidance | John E. Kolstoe | yes | JOHN E. KOLSTOE GEORGE RONALD |
| 967525 | He Cometh with Clouds: A Baha'i view of Christ's Return | Gary L. Matthews | yes | Equally pivotal has been the support of the staff at George Ronald, Publisher -- particularly Wendi Momen, my editor, an |
| 967526 | The Eternal Quest for God: An Introduction to the Divine Phi | Julio Savi | yes | An Introduction to the Divine Philosophy of 'Abdu'l-Baha Julio Savi George Ronald • Oxford George Ronald, Publisher 46 H |
| 967532 | The Search for a Just Society | John Huddleston | **no → would be** | The Earth is But One Country (BAHA'i PUBLISHING TRUST) Achieving Peace by the Year 2000 (ONEWORLD) <piii> THE SEARCH FOR |
| 982946 | The Baha'i Faith in America: Early Expansion 1900–1912, Volu | Robert H. Stockman | **no → would be** | UK George Ronald by Robert H. Stockman |

### Review list — Bahá’í Publishing Trusts and similar (63)

| id | title | publisher | evidence |
|---|---|---|---|
| 422 | Nine Holy Days | Bahá’í Publishing Trust | London: Bahá’í Publishing Trust, 1975 |
| 515 | The Guardian of the Bahá’í Faith | Bahá’í Publishing Trust | Bahá’í Publishing Trust, 27 Rutland Gate, London SW71PD Copyright Rúḥíyyih Rabbání 1988 All rights reserved |
| 3782 | God Passes By -- Study Guide | Bahá’í Publishing Trust | BAHÁ’Í PUBLISHING TRUST |
| 3786 | Sources for studying the life and writings of 'Abdu'l-Bahá:  | Wilmette Institute | Compiled for the Wilmette Institute. |
| 3788 | God Passes By -- Study Guide | Bahá’í Publishing Trust | BAHÁ’Í PUBLISHING TRUST |
| 6290 | The Sheltering Branch | Bahá’í Publishing Trust | BAHÁ’Í PUBLISHING TRUST WILMETTE ILLINOIS |
| 7116 | Raising the Tent of Unity | Bahá’í Publishing Trust | Baha'i Publishing Trust |
| 7142 | The Life of Thomas Breakwell | Bahá’í Publishing Trust | Copyright (c) 1998 The Bahá’í Publishing Trust |
| 7158 | The Christianity of Jesus | Bahá’í Publishing Trust | THE AUTHOR was a lecturer in Belfast Technical College and was for some years a part-time manager of the Bahá’í Publishi |
| 7164 | Martha Root: Herald of the Kingdom | Bahá’í Publishing Trust | BAHÁ’Í PUBLISHING TRUST |
| 7220 | From Strength to Strength: The First Half-Century of the For | Bahá’í Publishing Trust | BAHÁ’Í PUBLISHING TRUST, WILMETTE, ILLINOIS 60091 |
| 8291 | Bahá'u'lláh: The Great Announcement of the Qur'án | Bahá’í Publishing Trust | Bahá’í Publishing Trust Dhaka, Bangladesh [pg vi] |
| 8296 | 239 Days: 'Abdu'l-Bahá's Journey in America | Bahá’í Publishing Trust | Allan L. Ward Bahá’í Publishing Trust / Wilmette, Illinois 60091 |
| 8313 | The Bahá’í Proofs (Hujaja'l-Bahíyyih) | Bahá’í Publishing Trust | Bahá’í Publishing Trust Wilmette, Illinois 60091 |
| 8632 | Gate of the Heart: Understanding the Writings of the Báb | Association for Bahá’í Studies | Many people have contributed in various ways to the realization of this book, and although it is impossible to mention t |
| 8633 | Dr Muḥájir: Hand of the Cause of God, Knight of Bahá'u'lláh | Bahá’í Publishing Trust | Bahá’í Publishing Trust [pg iv] |
| 9094 | Abdu'l-Bahá in America | Bahá’í Publishing Trust | Bahá’í Publishing Trust Wilmette, Illinois |
| 11178 | Fire on the Mountain-top | Bahá’í Publishing Trust | THE BAHÁ’Í PUBLISHING TRUST 27 RUTLAND GATE LONDON SW7 1PD [pg 2] |
| 11180 | Crown of Glory: Memoirs of Jinab-i-Aziz'u'llah Azizi | Bahá’í Publishing Trust | Persian Edition Bahá’í Publishing Trust of Iran 132 Bahá’í Era |
| 11226 | Enoch Olinga | Bahá’í Publishing (US) | Bahá’í Publishing Agency |
| 11256 | The Chosen Highway | Bahá’í Publishing Trust | Wilmette, IL: Bahá’í Publishing Trust, 1940/1967 |
| 11300 | Amatu'l-Bahá Visits India | Bahá’í Publishing Trust | New Delhi: Bahá’í Publishing Trust, 1966 |
| 11334 | History of the Bahá’í Faith in Japan 1914-1938 | Bahá’í Publishing Trust | edited by [Barbara R. Sims](https://bahai-library.com/author/Barbara%20R.%20Sims). Tokyo: Bahá’í Publishing Trust of Jap |
| 11335 | The Chosen Highway | Bahá’í Publishing Trust | Bahá’í Publishing Trust |
| 11339 | Badí'u'lláh's Confession: An Epistle to the Bahá’í World | Bahá’í Publishing (US) | Published by BAHÁ’Í PUBLISHING SOCIETY Chicago, Ill., U.S.A. |
| 11349 | The Australian-New Zealand Bahá’í Connections | Association for Bahá’í Studies | #### Rosebery: Association for Bahá'í Studies Australia, 1996 |
| 11361 | The Family and Early Life of Ṭáhirih Qurrat al-‘Ayn | Association for Bahá’í Studies | 5 Ḥaḍrat-i-Ṭāhirih, Dundas, Ont.: Association for Baha’i Studies in Persian, 2000. The material presented here |
| 11369 | Jamál Effendi and the Early History of the Bahá’í Faith in S | Association for Bahá’í Studies | #### London: Association for Bahá'í Studies English-Speaking Europe, 1999 |
| 15940 | Unfurling the Divine Flag in Tokyo: An Early Bahá’í History | Bahá’í Publishing Trust | Tokyo: Bahá'í Publishing Trust of Japan, 1998 |
| 15941 | Taiwan Bahá’í Chronicle: An Historical Record of the Early D | Bahá’í Publishing Trust | Bahá’í Publishing Trust of Taiwan, 1994 |
| 15953 | Hilda Brooks and the Australian Bahá’í Community | Association for Bahá’í Studies | published in The Role of Women in an Advancing Civilization, ed. Sitarih 'Ala'í & Colleen Daws Sydney: Association for B |
| 16291 | Traces That Remain: A Pictorial History of the Early Days of | Bahá’í Publishing Trust | Tokyo: Bahá'í Publishing Trust of Japan, 1989 |
| 16732 | Twenty-Five Years of the Guardianship | Bahá’í Publishing (US) | Wilmette: Bahá'í Publishing Committee, 1948 |
| 16733 | The Passing of Shoghi Effendi: 1896-1957 | Bahá’í Publishing Trust | London: Bahá'í Publishing Trust, 1958 |
| 16740 | The Guardian of the Bahá’í Faith | Bahá’í Publishing Trust | London: Bahá’í Publishing Trust, 1988 |
| 20331 | Awakening: A History of the Bábi and Bahá’í Faiths in Nayriz | Bahá’í Publishing (US) | /books/OL29675704M |
| 919336 | The Coming of The Glory | Bahá’í Publishing (US) | Bahá’í Publishing Committee, |
| 920408 | faizi_frazelle_fuego_montana | Bahá’í Publishing Trust | ⁅s1⁆El Fuego en la Cima de la Montaña Traducción al español de "Fire on the Mountain-Top” (1973) por Gloria Faizi The Ba |
| 956134 | The Ocean of His Words: A Reader's Guide to the Art of Baha' | Bahá’í Publishing Trust | By John S. Hatcher Baha'i Publishing Trust |
| 956161 | The Station and Claims of Baha'u'llah | Bahá’í Publishing Trust | +iii THE STATION AND CLAIMS OF BAHA’U’LLAH Michael Sours +iv Copyright 0 1997 by Michael Sours ALL RIGHTS RESERVED. No p |
| 956163 | Bahá'í Bibliography | Bahá’í Publishing Trust | Nigeria: Bahá'í Publishing Trust; 1988. [22] pages. |
| 956168 | Emergence: Dimensions of a New World Order | Bahá'í  Pub. Trust | /books/OL842643M |
| 956170 | The New Garden: An introduction to the Bahá’í Faith | Bahá’í Publishing Trust | The New Garden An introduction to the Bahá’í Faith Hushmand Fathea’zam Bahá’í Publishing Trust P. O. Box 19 New Delh |
| 956181 | Immortals | Bahá’í Publishing Trust | DIPCHAND KHIANRA BAHA'I PUBLISHING TRUST, P.O. BOX 19, NEW DELHI-110001 Copyright © National Spiritual Assembly of the B |
| 956185 | Zikrullah Khadem: Itinerant Hand of the Cause of God: With L | Bahá’í Publishing Trust | To Move the World: Louis G. Gregory and the Advancement of Racial Unity in America by Gayle Morrison Martha Root: Liones |
| 956187 | To Move the World: Louis G. Gregory and the Advancement of R | Bahá’í Publishing Trust | Bahá’í Publishing Trust |
| 956192 | Martha Root: Lioness at the Threshold | Bahá’í Publishing Trust | GARIS Baha'i PUBLISHING TRUST ILLINOIS +iv Baha'i Publishing Trust, Wilmette, IL 60091 Copyright þ 1983 by the National  |
| 956198 | The Wine of Astonishment | Wilmette Institute | 2005 Digitized by Duane K. Troxel for the Wilmette Institute |
| 956204 | Bahá’í Education for Children, Book 2: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 2 For children 7 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956205 | Bahá’í Education for Children, Book 5: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 5 For children 10 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956206 | Bahá’í Education for Children, Book 3: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 3 For children 8 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956207 | Bahá’í Education for Children, Book 1: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 1 For children from 5 to 6 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956208 | Bahá’í Education for Children, Book 6: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 6 For children 11 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956219 | Bahá’í Education for Children, Book 4: A Teacher’s Guide for | Bahá’í Publishing Trust | Book 4 For children 9 years old A Teacher’s Guide by A. A. Furútan Bahá’í Publishing Trust South Africa |
| 956241 | A Nest on the Highest Branch: Reflections on Human Success,  | Bahá’í Publishing Trust | © National Spiritual Assembly of the Baha'is of India First Edition: October 2003 Reprint: 2005 ISBN: 81-7896-022-2 \Roy |
| 956259 | A Manual for Pioneers | Bahá’í Publishing Trust | RUHIYYIH RABBANI • Baha'i Publishing Trust |
| 956271 | These Things Shall Be | Bahá’í Publications Australia | BAHA'I PUBLICATIONS AUSTRALIA |
| 956278 | Bahá'u'llah: An Introduction to the Bahá'í Faith | Bahá’í Publishing Trust | 4!l BAHA' I Baha'i Publishing Trust |
| 956285 | Ali's Dream: The Story of Baha'u'llah | Bahá’í Publishing Trust | Baha'i Publishing Trust, Wilmette, IL 60091-2844 Copyright © 1980, 1998 by John Hatcher All rights reserved. First editi |
| 967487 | The Pure in Heart: The Historical Development of The Baha'i  | Bahá’í Publications Australia | ----- Baha'i International Community Committee for China 15 October 1990 ISBN 0-909991-41-3 9 780909 991418 <pi> The Pur |
| 967534 | The Baha'i World: A Biennial International Record, Volume IV | Bahá’í Publishing Trust | BAHA BAHA'I PUBLISHING TRUST |
| 967541 | The Baha'i World: A Biennial International Record, Volume X  | Bahá’í Publishing Trust | BAHAI BAHA'I PUBLISHING TRUST XVilmette, Illinois <p8> Copyright 1949, by National Spiritual Assembly of the Baha'is of  |
| 967544 | The Baha'i World: A Biennial International Record, Volume XI | Bahá’í Publishing Trust | ~ BAHAI BAHA'I PUBLISHING TRUST Wilmette, Illinois <p4> © Copyright 1956, by National Spiritual Assembly of the Baha'is  |

### Institutional publisher (18) — not encumbered

| id | title | publisher | evidence |
|---|---|---|---|
| 493 | Six Lessons on Islam | National Spiritual Assembly | Copyright (c) 1953 by the National Spiritual Assembly of the Bahá’ís of the United States |
| 513 | The Ministry of the Custodians 1957-1963 | Bahá’í World Centre | BAHÁ’Í WORLD CENTRE HAIFA |
| 5649 | Various - undefined | Bahá’í World Centre | #### Haifa, Israel: Bahá'í World Centre, 1986 |
| 7223 | Our Beloved Guardian | National Spiritual Assembly | The National Spiritual Assembly of the Bahá’ís of South Africa Johannesburg [pg 4] |
| 11193 | Our Beloved Guardian: An Introduction to the Life and Work o | National Spiritual Assembly | Johannesburg: National Spiritual Assembly of South Africa, 1993 |
| 11213 | Remember My Days: The Life-Story of Bahá’u’lláh | National Spiritual Assembly | Johannesburg: National Spiritual Assembly of the Bahá’ís of South and West Africa, 1980 |
| 11284 | The Last Refuge: Fifty Years of the Universal House of Justi | Universal House of Justice | The Last Refuge: Fifty Years of the Universal House of Justice |
| 11338 | 'Abdu'l-Bahá in New York, The City of the Covenant | Bahá’í World Centre | ALL PUBLICATIONS are entered in the Bahá’í World Centre Library Collection, Haifa, Israel, including a Philosophy of Sci |
| 11368 | The History of the Bahá’í Faith in Arizona: The First Fifty  | National Spiritual Assembly | members o f the National Spiritual Assembly. |
| 16737 | Mullá Ḥusayn | National Spiritual Assembly | National Spiritual Assembly of the Bahá’ís of South and West Africa, 1982 |
| 919054 | Australian Baha'i Studies: Vol. 3 | Bahá’í World Centre | A Presentation delivered at the Bahá’í World Centre September 8, 2000 |
| 919074 | Some Thoughts on the Lesser Peace | Universal House of Justice | 5. The functioning of the Universal House of Justice as the supreme organ of the Bahá’í Super-State |
| 919097 | Some Answered Questions: Study Guide | Bahá’í World Centre | ʻAbdu'l-Bahá's answers were first written down in Persian by a secretary, and afterwards revised twice by ʻAbdu'l-Bahá.  |
| 919261 | Quddus | National Spiritual Assembly | The National Spiritual Assembly |
| 919262 | Tahirih | National Spiritual Assembly | The National Spiritual Assembly |
| 956182 | The Prophecies of Jesus | Universal House of Justice | 16. The Seat of the Universal House of Justice 163 |
| 956188 | The Earth Is But One Country | National Spiritual Assembly | ©1976 The National Spiritual Assembly of The Bahá’ís of The United Kingdom 3rd Edition 1988 British Library Cataloguing  |
| 956276 | Claire Gung: Mother of Africa | National Spiritual Assembly | The National Spiritual Assembly of the Baha'is of South Mrica Johannesburg |

## To apply the rights rule (after Chad’s review)
`node scripts/ops/ops.mjs report rights-publisher --params '{"write":true}' --wait` — encumbers the would-encumber list only.

## Follow-ups done (10-23, standing rules — no Chad decision needed)
- **Author-photo audit** (`scripts/books/author_photo_audit.py`, the speaker-gallery checks): YuNet one dominant face; identity by
  OpenCV SFace against a reference (another verified gallery photo of the speaker, or the person's Wikipedia image when it
  differs from the Wikidata P18; cos ≥ 0.363 same person), else by eye on the contact sheet (tmp/author-photos/sheet*.jpg).
  36 distinct photos on 72 books: 23 passed by reference, 12 by eye, **2 books lost their photo**: Charles Mason Remey (a group
  photo, 10 faces) and Peter Smith (a common name; the speaker photo could not be confirmed as the author's).
- **No hotlinks**: the 7 Commons portraits are stored in R2 cdn-assets (`book-authors/<slug>/<sha16>.jpg`, served by the
  image worker) with credit + licence in book_meta (`scripts/books/author_photo_publish.mjs` → `book-author-photo-set`).
  All 70 remaining photos are on siftersearch.com; covers were always stored (/img/covers). New Wikidata portraits are no
  longer auto-applied by `book-hunt-apply`: they go through this audit.
- **Google Books retry**: scheduled. `siftersearch-reports` queues `book-hunt {retryGoogle:true}` once a day after 09:00 UTC
  (bookGooglePulse); it re-asks only books Google never answered that still lack a high ISBN, resumes after a drain, and
  then `book-hunt-apply {"write":true}` fills what it found (run by hand, high confidence only).
