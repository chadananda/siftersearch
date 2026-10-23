# Media speaker identities — audit 2026-10-23

Chad 10-23: *"we need more flexible identities for authors. We cannot make a new author because of a variant in spelling."*

How it works: `api/lib/media/identity.js` resolves every speaker string to one person in `data/media-speaker-people.json` (house-style name, name forms, lifespan, station, works). Forms fold diacritics, ’ ' ‘, hyphens and titles; initials fit full given names in order (A.Q. ↔ Abu’l-Qásim). A surname alone, or a name more than one person fits, is never merged on the name: the evidence decides (a work of the person in the title/series/collection, the full name in the channel, the recording year against the lifespan), otherwise the case is held for review below. A Covenant-breaker is never linked. New talks resolve at catalogue time; published talks are fixed by the `media-identity` job.

Run over 243 published talks with a speaker (dry run 06:45, before the fix below).

## Merged — one person, many name forms

| Person (display) | Station | Name forms seen (talks) | Basis |
|---|---|---|---|
| Abu’l-Qásim Faizí | hand | A.Q. Faizi (5); A. Q. Faizi (5); Abu'l-Qásim Faizi (7); Abu'l-Qasim Faizi (1); Abu'l-Qásim Fayzí (1); Abu'l-Qásim Faizí (5); A. Q. Faizí (2); A.Q. Faizí (1) | initials fit one person, name form |
| Rúhíyyih Khánum | hand | Rúhíyyih Khánum (11); Ruhiyyih Khanum (4); Amatu’l-Bahá Rúḥíyyih Khánum (1); Amatu'l-Bahá Rúhíyyih Khánum (8); 'Amatu'l-Bahá Rúhíyyih Khánum (2); Mary Sutherland Maxwell (Amatu'l-Bahá Rúhíyyih Khánum) (1); Amatu'l-Bahá Rúḥíyyih Khánum (1) | name form |
| ‘Alí-Akbar Furútan | hand | Alí-Akbar Furútan (2); 'Alí-Akbar Furútan (3); ‘Alí-Akbar Furútan (1); A. Furútan (2); Ali-Akbar Furútan (3) | initials fit one person, name form |
| Dhikru’lláh Khádem | hand | D Khadem (8); D. Khadem (2); Zikru'llah Khadem (1) | initials fit one person, name form |
| ‘Alí-Muḥammad Varqá | hand | ʻAlí Muhammad Varqá (1); Alí-Muhammad Varqá (1) | name form |
| Adib Taherzadeh | uhj | Taherzadeh (46); Adib Taherzadeh (1) | name form; surname + series works + years |
| Hooper Dunbar | uhj | Hooper C. Dunbar (1); Hooper Dunbar (4) | name form |
| Martha Root | hand | Martha Root (6); Martha Louise Root (2) | name form |
| William Sears | hand | William Sears (37); Bill Sears (1) | name form |
| ‘Alí Nakhjavání | uhj | ‘Alí Nakhjavání (6) | name form |
| Corinne True | hand | Corinne True (1) | name form |
| Dorothy Baker | hand | Dorothy Baker (2) | name form |
| Enoch Olinga | hand | Enoch Olinga (2) | name form |
| Hartmut Grossmann | uhj | Grossmann (27) | surname + series works + years |
| Leroy Ioas | hand | Leroy Ioas (1) | name form |
| Peter Khan | uhj | Peter Khan (1) | name form |
| Raḥmatu’lláh Muhájir | hand | Rahmatu'llah Muhájir (1) | name form |
| Ugo Giachery | hand | Ugo Giachery (1) | name form |
| Violette Nakhjavání | — | Violette Nakhjavání (1) | name form |

Surname-only forms merged above were merged on EVIDENCE, not the name: *Taherzadeh* (46 talks) → Adib Taherzadeh by the series titles (Revelation of Bahá’u’lláh, Covenant of Bahá’u’lláh, Child of the Covenant, Steadfastness in the Covenant, Covenant of the Báb, Purpose of Life) with recording years 1992–1998 inside his lifespan; *Grossmann* (27) → Hartmut Grossmann by the series (World Order, Individual Rights and Freedoms, The Greatness of This Day, The Secret of Divine Civilization, The Four Year Plan; 1989–1999, after Hermann Grossmann's death in 1968). *D Khadem* (10) → Dhikru’lláh Khádem: the only Khadem whose given name starts with D (Javidukht, Riaz and Jena Khadem are kept apart).

## Held for review — not merged

| Name as given | Talks | Why | Candidates |
|---|---|---|---|
| Nakhjavání | 10 | surname only — 2 known people named nakhjavani, evidence insufficient | ali-nakhjavani, violette-nakhjavani |
| Furútan | 8 | surname only — 1 known person named furutan, evidence insufficient | ali-akbar-furutan |
| Furutan | 1 | surname only — 1 known person named furutan, evidence insufficient | ali-akbar-furutan |
| Taherzadeh | 1 | surname only — 1 known person named taherzadeh, evidence insufficient | adib-taherzadeh |
| Hartmut Grossmann | 1 | 2 people fit "Hartmut Grossmann" | hermann-grossmann, hartmut-grossmann |
| Grossmann | 1 | surname only — 2 known people named grossmann, evidence insufficient | hartmut-grossmann, hermann-grossmann |
| Faizi | 1 | surname only — 2 known people named faizi, evidence insufficient | abul-qasim-faizi, gloria-faizi |

*Hartmut Grossmann* (1) was a matcher bug (his full name also fit Hermann's alias “H. Grossmann”); fixed — a full given name now outranks an initials-only alias. To confirm a surname-only form after review, add it to that person's `confirmed` list in `data/media-speaker-people.json` (e.g. `"confirmed": ["Furútan"]` on ‘Alí-Akbar Furútan); the next `media-identity` run merges those talks.

**Needs Chad:** *Furútan* (9 talks): one known Furútan, but nothing in the titles names him — confirm? *Nakhjavání* (10): ‘Alí or Violette Nakhjavání — the files do not say. *Faizi* (1): Abu’l-Qásim or Gloria.

## Dates after the speaker's death

A YouTube year is the UPLOAD year unless the title or description gives the recording year. Where the year is after the speaker's death the talk now carries `uploaded_year` and no recording year (shown as “uploaded 2017”), and `date_flag` records it.

| Speaker | Talks flagged | Upload years |
|---|---|---|
| Abu’l-Qásim Faizí | 16 | 2017, 2018, 2020, 2021, 2022, 2025 |
| Rúhíyyih Khánum | 7 | 2012, 2013, 2014, 2015, 2020, 2026 |
| ‘Alí-Akbar Furútan | 3 | 2017, 2022 |
| Martha Root | 2 | 2006, 2020 |
| Dorothy Baker | 1 | 2020 |

## Changes written

155 talks get a new display name, person key and/or year (meta.json + an `update` re-run each: re-render, search, catalogue). Box sets on /media group by the person key, so each person has one set with the real portrait and station.

