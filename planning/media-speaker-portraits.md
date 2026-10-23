# Media speaker portraits — galleries (2026-10-23)

Chad 10-23: *"let's work a bit harder to get numerous photos of each speaker so we can rotate them and never be at a loss for an image like with Adib Taherzadeh."*

**How it works.** `scripts/media/speaker_gallery_harvest.py` gathers candidates per person (bahai.media category + file search, Wikimedia Commons via Wikidata, Wikipedia, the Wilmette Institute media library, hand/agent web finds in `web.json`, and YouTube talk stills cropped to head-and-shoulders above the lower third), keeps only images ≥ 400 px on the short side with ONE dominant face (YuNet), drops near-duplicates by dHash of the whole image and of the face, and lays each person out on a numbered contact sheet. Every candidate was then checked by eye against the person's reference portrait and its source page (wrong people rejected — see below). `scripts/media/speaker_gallery_publish.mjs` stores the approved originals once in the cdn-assets R2 bucket (`media-speakers/<key>/<sha16>.<ext>`), takes credits as the file pages state them (bahai.media templates expanded) and writes `data/media-speaker-gallery.json`; the `media-gallery` ops job syncs that into `media_speaker_photos` (migration 174) and, with `extend`, makes ONE Gemini-outpainted 9:16 master for a photo whose tall crop needs canvas (recorded as AI-extended: `ext_model`, `ext_usd`). Pages: `/api/media/index` speaker rows carry `g` (the gallery), box sets show one photo per person per day (`src/lib/speaker-gallery.js`), the talk page crossfades through the gallery in its one portrait slot with the credit line following (`src/lib/portrait-rotate.js`).

**Add photos later:** run the harvest for the key, review the contact sheet (write `review.json` / `review-web.json`), run publish, commit the manifest, then `node scripts/ops/ops.mjs report media-gallery --params '{"write":true}'` and `{"extend":true,"maxUsd":2}`.

## Coverage

Speakers of the queued + published talks (the 1,480 YouTube targets incl. duplicates, 1,372 distinct items with the local archive; 122 people after merging name forms):

| | 0 photos | 1 photo | 2 photos | 3+ photos |
|---|---|---|---|---|
| before | 36 | 86 | 0 | 0 |
| after | 12 | 30 | 24 | 56 |

Production catalogue view (`media-portrait-inventory`, items whose speaker is already known — 300 talks, 45 people): before 13 with none, 32 with one, 0 with 3+. After: 10 with none, 7 with one, 5 with two, 27 with 3+ (49 keys, 384 talks; most of the remaining none are name-form keys still to be merged by the identity work — stephen-phelps, hasan-muvaqqar-balyuzi, elsie-austin-knight, steve-birkland — or not a person: echoes-from-the-lotus).

Photos held: 335 across 99 people (plus the single portrait of everyone else who had one). AI-extended masters: 86 (marked ai_extended, the original pixels pasted back untouched); Gemini spend: $3.74 (gemini-3.1-flash-image: 69 masters $3.01 + 17 masters $0.74 — about $0.043 each, each made once).

## Inventory — ranked (Hands of the Cause, then UHJ members, then by talks)

| person | station | talks | photos before → after | sources |
|---|---|---|---|---|
| Rúhíyyih Khánum (`ruhiyyih-khanum`) | Hand of the Cause | 121 | 1 → 8 | current-primary, bahai.media, youtube-still |
| William Sears (`william-sears`) | Hand of the Cause | 78 | 1 → 5 | current-primary, bahai.media, youtube-still |
| Abu’l-Qásim Faizí (`abul-qasim-faizi`) | Hand of the Cause | 65 | 1 → 5 | current-primary, bahai.media |
| Martha Root (`martha-root`) | Hand of the Cause | 39 | 1 → 3 | current-primary, bahai.media |
| ‘Alí-Akbar Furútan (`ali-akbar-furutan`) | Hand of the Cause | 35 | 1 → 7 | current-primary, bahai.media, youtube-still |
| Enoch Olinga (`enoch-olinga`) | Hand of the Cause | 35 | 1 → 4 | current-primary, bahai.media |
| Dhikru’lláh Khádem (`zikrullah-khadem`) | Hand of the Cause | 30 | 1 → 3 | current-primary, youtube-still |
| Louis G. Gregory (`louis-gregory`) | Hand of the Cause | 21 | 0 → 3 | bahai.media |
| Adelbert Muhlschlegel (`adelbert-muhlschlegel`) | Hand of the Cause | 19 | 0 → 5 | bahai.media, web |
| H. Collis Featherstone (`collis-featherstone`) | Hand of the Cause | 19 | 1 → 5 | current-primary, youtube-still, bahai.media |
| Dorothy Baker (`dorothy-baker`) | Hand of the Cause | 16 | 1 → 6 | current-primary, youtube-still, bahai.media |
| Ugo Giachery (`ugo-giachery`) | Hand of the Cause | 14 | 1 → 6 | current-primary, bahai.media, youtube-still |
| ‘Alí-Muḥammad Varqá (`ali-muhammad-varqa`) | Hand of the Cause | 11 | 1 → 9 | current-primary, bahai.media |
| John Robarts (`john-robarts`) | Hand of the Cause | 11 | 1 → 3 | current-primary, bahai.media |
| Leroy Ioas (`leroy-ioas`) | Hand of the Cause | 11 | 1 → 6 | current-primary, bahai.media |
| Agnes Baldwin Alexander (`agnes-baldwin-alexander`) | Hand of the Cause | 9 | 0 → 4 | bahai.media |
| George Townshend (`george-townshend`) | Hand of the Cause | 9 | 0 → 1 | bahai.media |
| Raḥmatu’lláh Muhájir (`rahmatullah-muhajir`) | Hand of the Cause | 9 | 1 → 6 | current-primary, bahai.media, youtube-still |
| Clara Dunn (`clara-dunn`) | Hand of the Cause | 8 | 0 → 2 | bahai.media, youtube-still |
| Hasan M. Balyuzi (`hasan-balyuzi`) | Hand of the Cause | 8 | 1 → 2 | current-primary, bahai.media |
| John E. Esslemont (`john-esslemont`) | Hand of the Cause | 8 | 0 → 3 | bahai.media |
| Tarazullah Samandari (`tarazullah-samandari`) | Hand of the Cause | 8 | 1 → 5 | current-primary, bahai.media |
| Musa Banani (`musa-banani`) | Hand of the Cause | 6 | 1 → 3 | current-primary, bahai.media |
| Amelia E. Collins (`amelia-collins`) | Hand of the Cause | 4 | 0 → 2 | bahai.media |
| Corinne True (`corinne-true`) | Hand of the Cause | 4 | 1 → 3 | current-primary, bahai.media |
| John Henry Hyde Dunn (`john-henry-hyde-dunn`) | Hand of the Cause | 4 | 0 → 2 | bahai.media, web |
| Paul E. Haney (`paul-haney`) | Hand of the Cause | 4 | 1 → 4 | current-primary, bahai.media |
| William Sutherland Maxwell (`william-sutherland-maxwell`) | Hand of the Cause | 3 | 0 → 3 | bahai.media, web |
| Keith Ransom-Kehler (`keith-ransom-kehler`) | Hand of the Cause | 2 | 0 → 2 | bahai.media |
| Roy C. Wilhelm (`roy-wilhelm`) | Hand of the Cause | 2 | 0 → 2 | bahai.media |
| Shuaullah Alai (`shuaullah-alai`) | Hand of the Cause | 1 | 1 → 4 | current-primary, bahai.media |
| Hooper Dunbar (`hooper-dunbar`) | UHJ member | 304 | 1 → 13 | current-primary, bahai.media, youtube-still |
| Adib Taherzadeh (`adib-taherzadeh`) | UHJ member | 121 | 1 → 6 | current-primary, bahai.media |
| Hushmand Fatheazam (`hushmand-fatheazam`) | UHJ member | 92 | 1 → 4 | current-primary, bahai.media, youtube-still |
| ‘Alí Nakhjavání (`ali-nakhjavani`) | UHJ member | 85 | 1 → 8 | current-primary, bahai.media |
| Paul Lample (`paul-lample`) | UHJ member | 45 | 1 → 6 | current-primary, bahai.media, youtube-still, web |
| Firaydoun Javaheri (`firaydoun-javaheri`) | UHJ member | 44 | 1 → 8 | current-primary, youtube-still |
| Farzam Arbab (`farzam-arbab`) | UHJ member | 40 | 1 → 7 | current-primary, youtube-still, bahai.media |
| Peter Khan (`peter-khan`) | UHJ member | 39 | 1 → 4 | current-primary, bahai.media |
| Hartmut Grossmann (`hartmut-grossmann`) | UHJ member | 36 | 1 → 2 | current-primary, bahai.media |
| Glenford E. Mitchell (`glenford-mitchell`) | UHJ member | 26 | 1 → 8 | current-primary, bahai.media, youtube-still |
| Ian Semple (`ian-semple`) | UHJ member | 26 | 1 → 9 | current-primary, youtube-still, bahai.media |
| J. Douglas Martin (`douglas-martin`) | UHJ member | 25 | 0 → 5 | youtube-still, web |
| Stephen Birkland (`stephen-birkland`) | UHJ member | 19 | 1 → 3 | current-primary, bahai.media |
| Gustavo Correa (`gustavo-correa`) | UHJ member | 7 | 1 → 3 | current-primary, bahai.media, youtube-still |
| Juan Francisco Mora (`juan-francisco-mora`) | UHJ member | 6 | 0 → 0 | — |
| Kiser Barnes (`kiser-barnes`) | UHJ member | 5 | 1 → 1 | current-primary |
| Amoz Gibson (`amoz-gibson`) | UHJ member | 4 | 1 → 3 | current-primary, bahai.media |
| Shahriar Razavi (`shahriar-razavi`) | UHJ member | 4 | 0 → 1 | bahai.media |
| Charles Wolcott (`charles-wolcott`) | UHJ member | 3 | 1 → 4 | current-primary, bahai.media |
| David Hofman (`david-hofman`) | UHJ member | 3 | 1 → 3 | current-primary, bahai.media, web |
| Praveen Mallik (`praveen-mallik`) | UHJ member | 3 | 0 → 0 | — |
| David S. Ruhe (`david-ruhe`) | UHJ member | 1 | 1 → 3 | current-primary, bahai.media, web |
| Stephen Hall (`stephen-hall`) | UHJ member | 1 | 1 → 1 | current-primary |
| Steven Phelps (`steven-phelps`) | scholar / speaker | 59 | 1 → 2 | current-primary, web |
| Shahrokh Monjazeb (`shahrokh-monjazeb`) | scholar / speaker | 20 | 1 → 1 | current-primary |
| Todd Lawson (`todd-lawson`) | scholar / speaker | 7 | 1 → 4 | current-primary, youtube-still, web |
| Jena Khadem Khodadad (`jena-khadem-khodadad`) | scholar / speaker | 3 | 1 → 1 | current-primary |
| Augusto Lopez-Claros (`augusto-lopez-claros`) | scholar / speaker | 3 | 1 → 4 | bahai.media, current-primary, web |
| Robert Atkinson (`robert-atkinson`) | scholar / speaker | 3 | 1 → 2 | current-primary, web |
| Reba Carruth (`reba-carruth`) | scholar / speaker | 3 | 1 → 1 | current-primary |
| Curtis Kelsey (`curtis-kelsey`) | scholar / speaker | 3 | 1 → 2 | current-primary, bahai.media |
| John Hatcher (`john-hatcher`) | scholar / speaker | 2 | 1 → 2 | current-primary, web |
| Sovaida Maani Ewing (`sovaida-maani-ewing`) | scholar / speaker | 2 | 1 → 1 | current-primary |
| Gregory Dahl (`gregory-dahl`) | scholar / speaker | 2 | 1 → 1 | existing portrait |
| JoAnn Borovicka (`joann-borovicka`) | scholar / speaker | 2 | 1 → 2 | current-primary, web |
| Mariette Leong (`mariette-leong`) | scholar / speaker | 2 | 0 → 1 | web |
| Ben Schewel (`ben-schewel`) | scholar / speaker | 2 | 1 → 1 | existing portrait |
| Roya Akhavan (`roya-akhavan`) | scholar / speaker | 2 | 1 → 2 | current-primary, web |
| Kathryn Hogenson (`kathryn-hogenson`) | scholar / speaker | 2 | 1 → 1 | current-primary |
| Darius Shahrokh (`darius-shahrokh`) | scholar / speaker | 2 | 1 → 1 | existing portrait |
| Bob Harris (`bob-harris`) | scholar / speaker | 2 | 0 → 1 | web |
| Elsie Austin (`elsie-austin`) | scholar / speaker | 2 | 1 → 4 | current-primary, bahai.media, web |
| Rainn Wilson (`rainn-wilson`) | scholar / speaker | 1 | 1 → 5 | current-primary, bahai.media |
| Peter Smith (`peter-smith`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Siyamak Zabihi-Moghaddam (`siyamak-zabihi-moghaddam`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Baharieh Maani Rohani (`baharieh-maani-rohani`) | scholar / speaker | 1 | 1 → 2 | current-primary, web |
| Armin Eschraghi (`armin-eschraghi`) | scholar / speaker | 1 | 1 → 2 | current-primary, web |
| Michael Day (`michael-day`) | scholar / speaker | 1 | 0 → 1 | web |
| Ian Kluge (`ian-kluge`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Anne Perry (`anne-perry`) | scholar / speaker | 1 | 0 → 0 | — |
| Christopher Buck (`christopher-buck`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Moojan Momen (`moojan-momen`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Sandra Lynn Hutchison (`sandra-lynn-hutchison`) | scholar / speaker | 1 | 1 → 2 | current-primary, web |
| Susanne Alexander (`susanne-alexander`) | scholar / speaker | 1 | 1 → 6 | current-primary, web |
| Arthur Lyon Dahl (`arthur-lyon-dahl`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Baharieh Rouhani Maani (`baharieh-rouhani-maani`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Steve Friberg (`steve-friberg`) | scholar / speaker | 1 | 0 → 2 | web |
| Brian Aull (`brian-aull`) | scholar / speaker | 1 | 1 → 2 | current-primary, bahai.media |
| Vasu Mohan (`vasu-mohan`) | scholar / speaker | 1 | 0 → 2 | web |
| Trip Barthel (`trip-barthel`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Julio Savi (`julio-savi`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Roshan Danesh (`roshan-danesh`) | scholar / speaker | 1 | 1 → 2 | current-primary, web |
| Louis Venters (`louis-venters`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Annette Reynolds (`annette-reynolds`) | scholar / speaker | 1 | 0 → 0 | — |
| Hooshmand Badee (`hooshmand-badee`) | scholar / speaker | 1 | 1 → 4 | current-primary, youtube-still, web |
| Michael Penn (`michael-penn`) | scholar / speaker | 1 | 1 → 4 | current-primary, bahai.media, web |
| Sohrab Kourosh (`sohrab-kourosh`) | scholar / speaker | 1 | 0 → 1 | web |
| Robert Stockman (`robert-stockman`) | scholar / speaker | 1 | 1 → 5 | current-primary, web |
| Louise Profeit-LeBlanc (`louise-profeit-leblanc`) | scholar / speaker | 1 | 1 → 2 | current-primary, bahai.media |
| Paul Hanley (`paul-hanley`) | scholar / speaker | 1 | 1 → 2 | current-primary, web |
| Elena Mustakova-Possardt (`elena-mustakova-possardt`) | scholar / speaker | 1 | 1 → 1 | current-primary |
| Robert Weinberg (`robert-weinberg`) | scholar / speaker | 1 | 1 → 3 | current-primary, web |
| Valerie Phillips (`valerie-phillips`) | scholar / speaker | 1 | 0 → 1 | web |
| Leonard Swidler (`leonard-swidler`) | scholar / speaker | 1 | 1 → 4 | current-primary, web |
| Abdul-Missagh Ghadirian (`abdul-missagh-ghadirian`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Robin Chandler (`robin-chandler`) | scholar / speaker | 1 | 0 → 0 | — |
| Edward Prine (`edward-prine`) | scholar / speaker | 1 | 0 → 0 | — |
| Glen Cotten (`glen-cotten`) | scholar / speaker | 1 | 0 → 0 | — |
| Ismael Velasco (`ismael-velasco`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Anthony Vance (`anthony-vance`) | scholar / speaker | 1 | 1 → 1 | current-primary |
| Anne Pearson (`anne-pearson`) | scholar / speaker | 1 | 0 → 1 | web |
| Mikhail Sergeev (`mikhail-sergeev`) | scholar / speaker | 1 | 0 → 2 | web |
| Judy Hannen Moe (`judy-hannen-moe`) | scholar / speaker | 1 | 0 → 1 | web |
| Chad Jones (`chad-jones`) | scholar / speaker | 1 | 0 → 0 | — |
| Elsie Austin Knight (`elsie-austin-knight`) | scholar / speaker | 1 | 0 → 0 | — |
| Catharine Nourse (`catharine-nourse`) | scholar / speaker | 1 | 0 → 0 | — |
| Aziz Panahi (`aziz-panahi`) | scholar / speaker | 1 | 0 → 0 | — |
| Masud Khamsi (`masud-khamsi`) | scholar / speaker | 1 | 0 → 2 | web |
| Violette Nakhjavání (`violette-nakhjavani`) | scholar / speaker | 1 | 1 → 1 | current-primary |
| H. Baluyzi (`h-baluyzi`) | scholar / speaker | 1 | 1 → 1 | existing portrait |
| Ted Cardell (`ted-cardell`) | scholar / speaker | 1 | 0 → 0 | — |

## Still without a photo

- **Juan Francisco Mora** (`juan-francisco-mora`, UHJ member, 6 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; bahai.media API full-text file search + Category:<name> listing "Juan Francisco Mora"; bahai.media Category:Juan Francisco Mora (LA and Managua shots are crowd scenes, skipped; Juan_Francisco_Mora.png 240px); news.bahai.org obituary / retirement / election stories story 1661 (group photo only); commons.wikimedia.org file search; web search "Juan Francisco Mora" Bahá’í — held until a reference photo (bahai.org) confirms identity
- **Praveen Mallik** (`praveen-mallik`, UHJ member, 3 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; bahai.media API full-text file search + Category:<name> listing "Mallik" (only Praveen_Kumar_Mallik.png 300x372, too small, and group photo); news.bahai.org obituary / retirement / election stories story 1661; commons.wikimedia.org file search; web search "Praveen Mallik" Bahá’í / bahai.in
- **Anne Perry** (`anne-perry`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; greenacre.org event page (Dr. Anne Perry & Dr. Robert Stockman); wilmetteinstitute.org media 'anne perry' (Anne Gordon Perry, 200px); bahaiteachings author
- **Annette Reynolds** (`annette-reynolds`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; web: "Annette Reynolds" Wilmette Institute Bahá'í; web: Annette Reynolds South Carolina Bahá'í author Trudy; wilmetteinstitute.org WP REST media search 'reynolds'/'annette' (two uploads of the same file, 2016/06 and 2016/12); wilmetteinstitute.org/annette-reynolds-trudy-and-the-bahai-spiritual-path-in-south-carolina/; wilmetteinstitute.org/the-bahai-spiritual-path-in-south-carolina-first-2017-web-talk/; everand.com author page (no image)
- **Robin Chandler** (`robin-chandler`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; bahaiteachings.org/author/robin-chandler (bio confirms Northeastern emerita = Bahá'í author; gravatar placeholder only); cssh.northeastern.edu faculty page (no image); wgbh.org/people/robin-chandler (120px only); bhcc.edu 2018 artist-in-residence recap (all photos with other people); thebostoncalendar.com 'Medicine JOY' (artwork, not portrait); art.state.gov, aieregistry.org (fetch failed)
- **Edward Prine** (`edward-prine`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; YouTube oembed QTCP6AQUFoA -> title credits 'Ed Price' (not 'Edward Prine'): '4,000 Years of Divine Curriculum' (Wilmette Institute); wilmetteinstitute.org WP media API (price, edwardprice); bahaipedia.org/Edward_Price (no image); bahaiteachings.org/author/edward-price/; web search Edward Price Divine Curriculum / Spring Green Films / The Gate; Wikimedia Commons (none)
- **Glen Cotten** (`glen-cotten`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; YouTube oembed tU4d3-dSzlA: 'Truth, Beauty & Goodness ... True Education' | Glen Cotten | Wilmette Institute; wilmetteinstitute.org WP media API (cotten, glen); bahaiteachings.org/author/glen-cotten/ (gravatar default only); bahaistudies.ca/watch/authentic-dialogue-moral-empowerment-civilization-building (speaker image = same photo 240px; video frames are slides + tiny zoom inset); web search Glen Cotten Durham NC / moral education; Wikimedia Commons (none)
- **Chad Jones** (`chad-jones`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; web: "Chad Jones" Bahá'í; web: "Chad Jones" Ocean Bahá'í software; bahai.media file search "Chad Jones" (only periodical PDFs); bahai-education.org/about (team page); bahai-library.com/author/Chad+Jones (no photo)
- **Elsie Austin Knight** (`elsie-austin-knight`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills
- **Catharine Nourse** (`catharine-nourse`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; web: "Catharine Nourse" Bahá'í (only Elizabeth Nourse hits); bahai.media file search "Nourse"
- **Aziz Panahi** (`aziz-panahi`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; web: "Aziz Panahi" Bahá'í; web: "Aziz Panahi" OR "Azíz Panahi" Baha'i talk speaker; web Persian: "عزیز پناهی" بهائی; bahai.media file search "Panahi" (only Habibullah Panahi, a different person, killed 1980)
- **Ted Cardell** (`ted-cardell`, scholar / speaker, 1 talks) — searched: bahai.media/Bahaipedia, Wikimedia Commons/Wikidata, Wikipedia, Wilmette Institute media library, YouTube talk stills; web: "Ted Cardell" Bahá'í (Edmund John Cardell, Knight of Bahá'u'lláh for South West Africa; note: died 2 June 1999 in California per bahai-library, not ~2008); bahai.media file search "Cardell"; histories.bahai.org.uk/2015/08/07/cathy-cardell/ (5 photos, all groups); bahai.works BW vol 28 obituaries

## Still with one photo

George Townshend · Kiser Barnes · Shahriar Razavi · Stephen Hall · Shahrokh Monjazeb · Jena Khadem Khodadad · Reba Carruth · Sovaida Maani Ewing · Gregory Dahl · Mariette Leong · Ben Schewel · Kathryn Hogenson · Darius Shahrokh · Bob Harris · Peter Smith · Siyamak Zabihi-Moghaddam · Michael Day · Ian Kluge · Trip Barthel · Julio Savi · Sohrab Kourosh · Elena Mustakova-Possardt · Valerie Phillips · Abdul-Missagh Ghadirian · Ismael Velasco · Anthony Vance · Anne Pearson · Judy Hannen Moe · Violette Nakhjavání · H. Baluyzi


## Wrong people caught in review (never published)

- Rúhíyyih Khánum: wrong person (presenter with glasses) · wrong person (man)
- Martha Root: painting of Queen Marie of Romania - wrong person
- ‘Alí-Akbar Furútan: wrong person (young man selfie) · wrong person
- Enoch Olinga: wrong person: modern colour photo of an elderly man (Olinga d. 1979)
- Louis G. Gregory: award presentation - shows Roy Wilkins, wrong person · Peace Fest 1987 trumpeter - wrong person · Roy Wilkins - wrong person · woman host - wrong person · other man - wrong person · elderly speaker in video - wrong person
- H. Collis Featherstone: wrong person: woman at microphone · wrong person: young man with guitar
- ‘Alí-Muḥammad Varqá: WRONG PERSON: bearded man in fez = the martyr-poet Varqa (grandfather), not Hand 'Ali-Muhammad · WRONG PERSON: this is Furutan
- John Robarts: wrong person: heavy-framed glasses, different face; circular cut-out card
- Agnes Baldwin Alexander: Abigail Charlotte Baldwin Alexander - her mother, wrong person · award group photo 1975, not her · Prof. William DeWitt Alexander - her father, wrong person · elderly man - wrong person
- Hasan M. Balyuzi: Ali Nakhjavani presenting Balyuzi Memorial Lecture - wrong person · woman presenter - wrong person · woman presenter - wrong person
- John Henry Hyde Dunn: wrong person: a woman (likely his wife Clara Dunn)
- Keith Ransom-Kehler: wrong/unverifiable: colourised dark-haired woman does not match the two titled photos
- Farzam Arbab: wrong person: full grey hair, different face
- Glenford E. Mitchell: wrong person (woman) · wrong person (bearded man in beret)
- Jena Khadem Khodadad: WRONG PERSON: her father Dhikru'llah Khadem
- JoAnn Borovicka: WRONG PERSON: painting of a veiled woman (Tahirih), not the speaker
- Mariette Leong: historical man on talk thumbnail - wrong person · historical woman on talk thumbnail - wrong person/unverifiable
- Kathryn Hogenson: WRONG PERSON: historic photo of an elderly man (talk subject)

## Adib Taherzadeh

Before: the box set was keyed `taherzadeh` (the files say only "Taherzadeh"), a surname-only key with no portrait, so 47 talks showed an initials disc while the one talk keyed `adib-taherzadeh` had the photo. The identity work (data/media-speaker-people.json, media-identity) now files all 47 under `adib-taherzadeh`, and that person has a 6-photo gallery: the Bahá’í Media Bank portrait, 1971 at the microphones (The American Bahá’í vol. 2 no. 9), 1976 speaking (Bahá’í News 545), seated reading (The American Bahá’í vol. 5 no. 11), a titled portrait and a lecture photo from bahai.media. Two YouTube stills were rejected (both the same Media Bank portrait re-framed on a card). Live: the box set on /media and every Taherzadeh talk page rotate these.

## Credits (as each source states them)

### Abu’l-Qásim Faizí

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Abu%E2%80%99l-Q%C3%A1sim_Faiz%C3%AD) · `media-speakers/abul-qasim-faizi.jpg`
- bahai.media · 687×1035 · credit: The Bahá’í World. Vol 13, page 394. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Abu%27l-Qasim_Faizi.png) · `media-speakers/abul-qasim-faizi/c18351a5f172e1cd.png`
- bahai.media · 439×619 · credit: The Bahá’í World. Vol 18, page 659. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Abu%27l-Qasim_Faizi,_portrait_from_BW_Vol_18.png) · `media-speakers/abul-qasim-faizi/f7a297d9b6d4ce77.png`
- bahai.media · 646×843 · credit: Bahá’í News. Issue 523, page 9. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Abul_Qasim_Faizi.png) · `media-speakers/abul-qasim-faizi/82e1917ff3ccae29.png`
- bahai.media · 1600×1787 · credit: Bahá’í News. Issue 598, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Abul_Qasim_Faizi-2.png) · `media-speakers/abul-qasim-faizi/15a283afa5736668.png`

### Adelbert Muhlschlegel

- **primary** · bahai.media · 1503×2056 · credit: media.bahai.org The Bahá’í World. Vol 14, page 453. The Bahá’í World. Vol 15, page 574. The Bahá’í World. Vol 18, page 612. Bahá’í News. Issue 595, page -1. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · AI-extended 9:16 master · [source](https://bahai.media/File:Adelbert_M%C3%BChlschlegel.jpg) · `media-speakers/adelbert-muhlschlegel/13e94f00db32ea12.jpg`
- bahai.media · 701×1035 · credit: The Bahá’í World. Vol 13, page 387. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Adelbert_Muhlschlegel.png) · `media-speakers/adelbert-muhlschlegel/e2290fdc6bfae5ad.png`
- bahai.media · 746×1037 · credit: The Bahá’í World. Vol 12, page 114. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Adelbert_M%C3%BChlschlegel.png) · `media-speakers/adelbert-muhlschlegel/f68cb59c1dbb3bb3.png`
- web · 1976 · 1428×829 · credit: source: {{bns|545|4}} · licence: bahai.media licence template: Bn-excerpt · AI-extended 9:16 master · [source](https://bahai.media/File:Dr_Muhlschlegel.png) · `media-speakers/adelbert-muhlschlegel/b03c0b62fddfb912.png`
- web · 1961 · 543×500 · credit: source: {{bns|369|13}} · licence: bahai.media licence template: Bn-excerpt · [source](https://bahai.media/File:Dr_Muhlschlegel_question_and_answer_period.png) · `media-speakers/adelbert-muhlschlegel/ec7104c77f626393.png`

### Adib Taherzadeh

- **primary** · current-primary · 1500×2161 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Adib_Taherzadeh) · `media-speakers/adib-taherzadeh.jpg`
- bahai.media · 549×549 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Adib_Taherzadeh_portrait.png) · `media-speakers/adib-taherzadeh/26e91d71bcc29777.png`
- bahai.media · 1976 · 699×414 · credit: Bahá’í News. Issue 545, page 5. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Adib_Taherzadeh_1976.png) · `media-speakers/adib-taherzadeh/8e7c162263bce517.png`
- bahai.media · 1971 · 443×558 · credit: The American Bahá’í. Volume 2, Issue 9. Pg 1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Adib_Taherzadeh_1971.png) · `media-speakers/adib-taherzadeh/91051d8ca88872b0.png`
- bahai.media · 1176×927 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Adib_Taherzadeh_delivering_a_talk.png) · `media-speakers/adib-taherzadeh/da3a98062f41de79.png`
- bahai.media · 469×674 · credit: The American Bahá’í. Volume 5, Issue 11. Pg 5. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Adib_Taherzadeh-2.png) · `media-speakers/adib-taherzadeh/7e585ad3eac3c37f.png`

### Agnes Baldwin Alexander

- **primary** · bahai.media · 469×587 · credit: The Bahá’í World. Vol 15, page 424. The Bahá’í World. Vol 15, page 574. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Agnes_B._Alexander.png) · `media-speakers/agnes-baldwin-alexander/006c477d15479fcc.png`
- bahai.media · 703×1055 · credit: The Bahá’í World. Vol 13, page 390. Bahá’í News. Issue 561, page 3. Bahá’í News. Issue 633, page 4. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Agnes_Alexander.png) · `media-speakers/agnes-baldwin-alexander/5191a5df7043fcad.png`
- bahai.media · 1236×1849 · credit: media.bahai.org The Bahá’í World. Vol 14, page 455. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · AI-extended 9:16 master · [source](https://bahai.media/File:Agnes_Baldwin_Alexander.jpg) · `media-speakers/agnes-baldwin-alexander/6dc1f595d5a4f133.jpg`
- bahai.media · 1901 · 701×915 · credit: Bahá’í News. Issue 631, page 6. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Agnes_Baldwin_Alexander_December_1901.png) · `media-speakers/agnes-baldwin-alexander/575766c6441c85db.png`

### ‘Alí-Akbar Furútan

- **primary** · current-primary · 800×1120 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/%E2%80%98Al%C3%AD-Akbar_Fur%C3%BAtan) · `media-speakers/ali-akbar-furutan.jpg`
- bahai.media · 1554×2100 · credit: Bahá’í World News Service (#261) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Mr_Furutan.jpg) · `media-speakers/ali-akbar-furutan/a8ff81151650de41.jpg`
- bahai.media · 430×920 · credit: Bahá’í News. Issue 489, page 15. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Hand_of_the_Cause_%27Ali-Akbar_Furutan.png) · `media-speakers/ali-akbar-furutan/8e4193edc7cd3b8f.png`
- bahai.media · 405×621 · credit: The Bahá’í World. Vol 27, page 44. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Mr_Ali_Akbar_Furutan.png) · `media-speakers/ali-akbar-furutan/f2ad386a20a84e03.png`
- youtube-still · 419×524 · credit: Video still: Gustavo Cerrato (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=HH-oytJwHRo) · `media-speakers/ali-akbar-furutan/0d33f81e75f31be1.jpg`
- youtube-still · 426×533 · credit: Video still: Gustavo Cerrato (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=xbajWYRhmlU) · `media-speakers/ali-akbar-furutan/842037329139ab2d.jpg`
- bahai.media · 1951 · 1539×2212 · credit: Bahá’í World News Service (#261) The Bahá’í World. Vol 12, page 111. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Mr_Furutan,_1951.jpg) · `media-speakers/ali-akbar-furutan/e9bc364a6f92ee75.jpg`

### ‘Alí-Muḥammad Varqá

- **primary** · current-primary · 800×1120 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/%E2%80%98Al%C3%AD-Mu%E1%B8%A5ammad_Varq%C3%A1) · `media-speakers/ali-muhammad-varqa.jpg`
- bahai.media · 1500×2189 · credit: Bahá’í World News Service (#579) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:%27Ali-Muhammad_Varqa_portrait.png) · `media-speakers/ali-muhammad-varqa/5f84413d5473cec9.png`
- bahai.media · 665×949 · credit: The Bahá’í World. Vol 22, page 81. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Ali_Muhammad_Varqa_Trustee_of_Huququllah.png) · `media-speakers/ali-muhammad-varqa/e02a520f3583b97b.png`
- bahai.media · 1168×1475 · credit: Bahá’í World News Service (#579) The Bahá’í World. Vol 35, page 388. · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Dr_Ali-Muhammad_Varqa.jpg) · `media-speakers/ali-muhammad-varqa/88e4fd3e343f5ed9.jpg`
- bahai.media · 487×687 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:%27Ali-Muhammad_Varqa_in_his_later_years.png) · `media-speakers/ali-muhammad-varqa/ca2caedc319981ce.png`
- bahai.media · 1117×766 · credit: The Bahá’í World. Vol 20, page 622. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dr_Ali_Muhammad_Varqa.png) · `media-speakers/ali-muhammad-varqa/d79aa2e4894d0034.png`
- bahai.media · 832×1108 · credit: The Five Year Plan 2001-2006 (Summary), page 108. · licence: Copyright © Bahá’í World Centre. The copyright to this file belongs to the Bahá’í World Centre. · [source](https://bahai.media/File:Dr_Varqa_enjoys_the_tranquility_of_the_Ridvan_Garden.png) · `media-speakers/ali-muhammad-varqa/64dd9552a9c3cbc5.png`
- bahai.media · 1092×1401 · credit: Bahaipedia (bahai.media) · AI-extended 9:16 master · [source](https://bahai.media/File:Portrait_of_%27Ali-Muhammad_Varqa.png) · `media-speakers/ali-muhammad-varqa/88e80aef3c4c4983.png`
- bahai.media · 400×600 · credit: The Bahá’í World. Vol 13, page 390. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:%27Ali-Muhammad_Varqa_in_his_youth.png) · `media-speakers/ali-muhammad-varqa/1ef80b0a1d2dd4f8.png`

### ‘Alí Nakhjavání

- **primary** · current-primary · 1524×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/%E2%80%98Al%C3%AD_Nakhjav%C3%A1n%C3%AD) · `media-speakers/ali-nakhjavani.jpg`
- bahai.media · 2003 · 855×1114 · credit: Bahá’í World News Service (#206) The Bahá’í World. Vol 35, page 415. · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Ali_Nakhjavani,_2003.png) · `media-speakers/ali-nakhjavani/b2836f53a18f5a37.png`
- bahai.media · 1488×1868 · credit: Bahá’í World News Service (#352) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Ali_Nakhjavani_at_the_Changing_Times_seminar.jpg) · `media-speakers/ali-nakhjavani/d2db7ec7c15620a3.jpg`
- bahai.media · 1024×760 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Mr._Ali_Nakhjavani.png) · `media-speakers/ali-nakhjavani/d7968a732a3d5d13.png`
- bahai.media · 727×619 · credit: Bahá’í World News Service (#326) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Ali_Nakhjavani_presented_the_Hasan_M_Balyuzi_Memorial_Lecture.jpg) · `media-speakers/ali-nakhjavani/057da7a6f8e2df08.jpg`
- bahai.media · 800×888 · credit: Bahá’í World News Service (#299) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Mr_Ali_Nakhjavani_at_the_celebrations.jpg) · `media-speakers/ali-nakhjavani/f664698ed4377f18.jpg`
- bahai.media · 2012 · 1000×663 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Ali_Nakhjavani_in_Canada,_2012.jpg) · `media-speakers/ali-nakhjavani/e75dd74da1ccf6d4.jpg`
- bahai.media · 893×1115 · credit: The American Bahá’í. Volume 4, Issue 8. Pg 11. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Ali_Nakhjavani_explaining_Mount_Carmel_building_program.png) · `media-speakers/ali-nakhjavani/1768fd57778176b2.png`

### Amelia E. Collins

- **primary** · bahai.media · 1500×2100 · credit: http://media.bahai.org/subjects/7923/details · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Amelia_Engelder_Collins.jpg) · `media-speakers/amelia-collins/f91e38ec12af5c20.jpg`
- bahai.media · 771×1029 · credit: The Bahá’í World. Vol 12, page 109. The Bahá’í World. Vol 13, page 380. The Bahá’í World. Vol 13, page 835. The Bahá’í World. Vol 14, page 449. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Amelia_E._Collins.png) · `media-speakers/amelia-collins/e9a1b7efc146895b.png`

### Amoz Gibson

- **primary** · current-primary · 1499×2187 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Amoz_Gibson) · `media-speakers/amoz-gibson.jpg`
- bahai.media · 666×776 · credit: Bahá’í News. Issue 520, page 20. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Mr_Amoz_Gibson.png) · `media-speakers/amoz-gibson/d31db6c04b3a95dd.png`
- bahai.media · 862×1101 · credit: The American Bahá’í. Volume 5, Issue 9. Pg 10. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Mr_Amoz_Gibson-2.png) · `media-speakers/amoz-gibson/1d3f0df01e625dc2.png`

### Anne Pearson

- **primary** · web · 2017 · 667×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/wp-json/wp/v2/media?search=AnnePearson2017) · `media-speakers/anne-pearson/06423495afad81bc.jpg`

### Anthony Vance

- **primary** · current-primary · 400×400 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/anthony-vance-sq/) · `media-speakers/anthony-vance.jpg`

### Armin Eschraghi

- **primary** · current-primary · 252×440 · credit: Burhan Institute · [source](https://burhaninstitute.org/armin-eschraghi) · `media-speakers/armin-eschraghi.jpg`
- web · 792×720 · credit: — · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/img_5993/) · `media-speakers/armin-eschraghi/8137ae49b2bb9152.jpg`

### Arthur Lyon Dahl

- **primary** · current-primary · 200×254 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/faculty/arthur-dahl/) · `media-speakers/arthur-lyon-dahl.jpg`
- web · 2006 · 1620×1080 · credit: Photograph by Gemma Parsons (Bahá’í World News Service) · licence: Baha'i World News Service (bahai.media licence template) · [source](https://bahai.media/File:Arthur_Dahl_displays_the_front_page_of_The_Independent.jpg) · `media-speakers/arthur-lyon-dahl/87bb71df6936201d.jpg`
- web · 420×439 · credit: — · AI-extended 9:16 master · [source](https://weadapt.org/member/arthur-dahl/) · `media-speakers/arthur-lyon-dahl/ccc33659893071b5.jpg`

### Augusto Lopez-Claros

- **primary** · bahai.media · 1035×1408 · credit: Bahá’í World News Service (#309) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Augusto_Lopez-Claros.jpg) · `media-speakers/augusto-lopez-claros/2909915e671112de.jpg`
- current-primary · 208×242 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/meaningful-conversations-on-the-emergence-of-global-institutions/) · `media-speakers/augusto-lopez-claros.png`
- web · 700×890 · credit: — · [source](https://globalgovernanceforum.org/working-groups-member/augusto-lopez-claros/augusto-lopez-claros-2/) · `media-speakers/augusto-lopez-claros/41345fde0bb3f05c.jpg`
- web · 700×533 · credit: — · [source](https://globalgovernanceforum.org/global-governance-and-the-emergence-of-of-global-institutions-for-the-21st-century/augusto-talk-ontario/) · `media-speakers/augusto-lopez-claros/6a4a017d8da0fcfa.jpg`

### Baharieh Maani Rohani

- **primary** · current-primary · 371×400 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/baharieh-maani-web-talk/) · `media-speakers/baharieh-maani-rohani.jpg`
- web · 2012 · 400×400 · credit: — · [source](https://wilmetteinstitute.org/baharieh-rouhani-maani-2/) · `media-speakers/baharieh-maani-rohani/6db09eb58d1fb5e4.png`

### Baharieh Rouhani Maani

- **primary** · current-primary · 371×400 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/baharieh-maani-web-talk/) · `media-speakers/baharieh-rouhani-maani.jpg`
- web · 2020 · 400×400 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/baharieh-rouhani-maani-2/) · `media-speakers/baharieh-rouhani-maani/6db09eb58d1fb5e4.png`
- web · 2019 · 910×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/bahariehmaanispeaker/) · `media-speakers/baharieh-rouhani-maani/4b1d947010a85e97.png`

### Bob Harris

- **primary** · web · 1987 · 1451×1056 · credit: — · [source](https://bahai.media/File:Counsellor_Robert_Harris_conducting_class_at_28th_Green_Lake_Baha'i_Conference,_1987.jpg) · `media-speakers/bob-harris/9dd18328d56a604b.jpg`

### Brian Aull

- **primary** · current-primary · 599×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/sign-up-now-to-hear-dr-brian-aull-discuss-consultation-a-revolutionary-model-of-democratic-governance-on-february-14/) · `media-speakers/brian-aull.jpg`
- bahai.media · 708×874 · credit: Bahá’í News. Issue 634, page 11. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Brian_Aull.png) · `media-speakers/brian-aull/5f89aa115e57b16e.png`

### Charles Wolcott

- **primary** · current-primary · 1374×2115 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Charles_Wolcott) · `media-speakers/charles-wolcott.jpg`
- bahai.media · 1906 · 1600×2054 · credit: Bahá’í News. Issue 672, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Charles_F_Wolcott_1906-1987.png) · `media-speakers/charles-wolcott/f903a2e6ad7218f1.png`
- bahai.media · 441×584 · credit: Bahaipedia (bahai.media) · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Charles_Wolcott_Portrait_from_BW_Volume_20.png) · `media-speakers/charles-wolcott/4eafb813c09aae5d.png`
- bahai.media · 884×1111 · credit: The American Bahá’í. Volume 5, Issue 9. Pg 10. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Mr_Charles_Wolcott.png) · `media-speakers/charles-wolcott/8ddb067f5aaf2a8a.png`

### Christopher Buck

- **primary** · current-primary · 200×209 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/faculty/christopher-buck/) · `media-speakers/christopher-buck.png`
- web · 518×538 · credit: — · [source](https://wilmetteinstitute.org/chrisbuck3/) · `media-speakers/christopher-buck/22a6c25e9f6a8b41.png`
- web · 2014 · 548×595 · credit: — · [source](https://bahaiteachings.org/sing-the-ballad-of-alain-locke-burying-the-black-plato/chris-buck-by-headstone-of-alain-locke/#main) · `media-speakers/christopher-buck/235bf9c5b0ff1e14.jpg`

### Clara Dunn

- **primary** · bahai.media · 1510×2135 · credit: media.bahai.org The Bahá’í World. Vol 14, page 453. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Clara_Dunn1.jpg) · `media-speakers/clara-dunn/00bb3f025db456bc.jpg`
- youtube-still · 427×533 · credit: Video still: Wilmette Institute (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=Q7FWswOeaDg) · `media-speakers/clara-dunn/1843eb531bd56028.jpg`

### H. Collis Featherstone

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Collis_Featherstone) · `media-speakers/collis-featherstone.jpg`
- youtube-still · 426×533 · credit: Video still: Graham Hassall (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=SWHS22WpazE) · `media-speakers/collis-featherstone/73c1aead06d26b25.jpg`
- bahai.media · 705×1045 · credit: The Bahá’í World. Vol 13, page 393. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Collis_Featherstone.png) · `media-speakers/collis-featherstone/61e88dd3665b88f6.png`
- youtube-still · 426×533 · credit: Video still: Gustavo Cerrato (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=8OYoYfMFfzg) · `media-speakers/collis-featherstone/6fca8864fd3e4efa.jpg`
- bahai.media · 797×612 · credit: Bahá’í News. Issue 575, page 17. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. 152 29 202 205 797 612 Collis Featherstone (Bahaipedia · Images ) · [source](https://bahai.media/File:Errol_Pike_interviews_the_Hand_of_the_Cause_of_God,_Collis_Featherstone.png) · `media-speakers/collis-featherstone/e9556a76bbeb037a.png`

### Corinne True

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Corinne_True) · `media-speakers/corinne-true.jpg`
- bahai.media · 727×1150 · credit: The Bahá’í World. Vol 13, page 386. The Bahá’í World. Vol 13, page 847. Bahá’í News. Issue 500, page 3. Bahá’í News. Issue 538, page 1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_Corinne_True.png) · `media-speakers/corinne-true/bbf6e4fcbdf017da.png`
- bahai.media · 742×1071 · credit: The Bahá’í World. Vol 12, page 113. The Bahá’í World. Vol 14, page 454. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Corinne_True.png) · `media-speakers/corinne-true/368765e2abcfa720.png`

### Curtis Kelsey

- **primary** · current-primary · 480×659 · credit: — · [source](https://bahaipedia.org/Curtis_Kelsey) · `media-speakers/curtis-kelsey.png`
- bahai.media · 633×937 · credit: The American Bahá’í. Volume 1, Issue 3. Pg 2. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Curtis_D._Kelsey.jpg) · `media-speakers/curtis-kelsey/887b8fcee08c16ee.jpg`

### David Hofman

- **primary** · current-primary · 1089×1517 · credit: — · [source](https://bahaipedia.org/David_Hofman) · `media-speakers/david-hofman.jpg`
- bahai.media · 793×800 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:David_Hofman,_late_50%27s_or_early_60%27s.png) · `media-speakers/david-hofman/1b76ecd489e4af8c.png`
- web · 694×951 · credit: source: {{bns|709|5}} · licence: bahai.media licence template: Bn-excerpt · [source](https://bahai.media/File:David_Hofman_Universal_House_of_Justice.png) · `media-speakers/david-hofman/128503855d69f113.png`

### David S. Ruhe

- **primary** · current-primary · 1550×2404 · credit: — · [source](https://bahaipedia.org/David_Ruhe) · `media-speakers/david-ruhe.jpg`
- bahai.media · 1166×800 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:David_Ruhe_at_US_National_Center,_early_60s.png) · `media-speakers/david-ruhe/a9fbf7d3fd51d3cf.png`
- web · 1988 · 698×1096 · credit: source: {{bns|692|5}} · licence: bahai.media licence template: Bn-excerpt · [source](https://bahai.media/File:Dr_David_Ruhe_at_Maxwell_Bahai_School.png) · `media-speakers/david-ruhe/2a16b475db7a368d.png`

### Dorothy Baker

- **primary** · current-primary · 1509×2168 · credit: — · [source](https://bahaipedia.org/Dorothy_Baker) · `media-speakers/dorothy-baker.png`
- youtube-still · 426×533 · credit: Video still: Baháʼí Concepts (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=gGrGwdFWsuo) · `media-speakers/dorothy-baker/3047a937434c85cf.jpg`
- bahai.media · 688×1035 · credit: The Bahá’í World. Vol 13, page 383. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dorothy_B._Baker.png) · `media-speakers/dorothy-baker/4a7e19750724179b.png`
- bahai.media · 1453×2059 · credit: Bahá’í News. Issue 514, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Portrait_of_Dorothy_Beecher_Baker.png) · `media-speakers/dorothy-baker/9767f143b51c5656.png`
- bahai.media · 741×944 · credit: The Bahá’í World. Vol 12, page 670. Bahá’í News. Issue 514, page 13. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dorothy_Beecher_Baker.png) · `media-speakers/dorothy-baker/e989ebb6b995b763.png`
- bahai.media · 1438×1003 · credit: Bahá’í News. Issue 276, page 5. Bahá’í News. Issue 561, page 8. From Copper to Gold · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dorothy_Baker%27s_last_public_appearance.png) · `media-speakers/dorothy-baker/ca510a7ef217791b.png`

### J. Douglas Martin

- **primary** · youtube-still · 408×510 · credit: Video still: Baha'i Perspective (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=24hyAkGs3iY) · `media-speakers/douglas-martin/2417f007d2bec779.jpg`
- youtube-still · 426×533 · credit: Video still: Unity Museum (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=-3iTlERpf_I) · `media-speakers/douglas-martin/7a61f4fd597c1d62.jpg`
- web · 2007 · 1474×853 · credit: Photo by Louis Brunet; bahainews.ca/en/070910shrine · [source](https://bahai.media/File:Douglas_Martin_2007.jpg) · `media-speakers/douglas-martin/25553af9780bbf32.jpg`
- web · 2005 · 1777×1927 · credit: Bahá’í World News Service story 387 (via bahai.media) · licence: bahai.media licence template: Baha'i World News Service · [source](https://bahai.media/File:Douglas_Martin_urged_scholars_to_pay_attention_to_the_process_of_learning.jpg) · `media-speakers/douglas-martin/c18d5413cdee4337.jpg`
- web · 1987 · 705×1202 · credit: source: {{bns|681|7}} · licence: bahai.media licence template: Bn-excerpt · [source](https://bahai.media/File:Douglas_Martin_ABS_Conference.png) · `media-speakers/douglas-martin/74652adc255e05a1.png`

### Elena Mustakova-Possardt

- **primary** · current-primary · 450×540 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/a-library-of-web-talks-24-7-365-a-psychology-that-responds-to-our-times/) · `media-speakers/elena-mustakova-possardt.jpg`

### Elsie Austin

- **primary** · current-primary · 1400×2100 · credit: — · [source](https://bahaipedia.org/Elsie_Austin) · `media-speakers/elsie-austin.jpg`
- bahai.media · 498×505 · credit: Bahá’í News. Issue 534, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Dr_H_Elsie_Austin.png) · `media-speakers/elsie-austin/862cda23aeb4c836.png`
- bahai.media · 1312×956 · credit: Bahá’í World News Service (#338) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Dr_Elsie_Austin.jpg) · `media-speakers/elsie-austin/4eea727fbcd30b29.jpg`
- web · 474×623 · credit: — · AI-extended 9:16 master · [source](https://home.nps.gov/mamc/learn/historyculture/h-elsie-austin.htm) · `media-speakers/elsie-austin/ee23ea077e87ed3b.jpg`

### Enoch Olinga

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Enoch_Olinga) · `media-speakers/enoch-olinga.jpg`
- bahai.media · 690×1050 · credit: The Bahá’í World. Vol 13, page 391. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Enoch_Olinga.png) · `media-speakers/enoch-olinga/c7ccd9b18f26686c.png`
- bahai.media · 445×624 · credit: The Bahá’í World. Vol 14, page 456. The Bahá’í World. Vol 15, page 575. The Bahá’í World. Vol 18, page 618. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Enoch_Olinga_portrait.png) · `media-speakers/enoch-olinga/192bd2c05c28b63b.png`
- bahai.media · 452×625 · credit: The American Bahá’í. Volume 2, Issue 2. Pg 8. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_Enoch_Olinga.png) · `media-speakers/enoch-olinga/378f70c903f96ae1.png`

### Farzam Arbab

- **primary** · current-primary · 998×1327 · credit: — · [source](https://bahaipedia.org/Farzam_Arbab) · `media-speakers/farzam-arbab.jpg`
- youtube-still · 427×533 · credit: Video still: Comunidad Bahá'í de Colombia (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=3G2q3TkSCBw) · `media-speakers/farzam-arbab/f1cd2aed46ba918e.jpg`
- youtube-still · 426×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=4pFMJ8LkyCo) · `media-speakers/farzam-arbab/c643f5de87aa144d.jpg`
- youtube-still · 426×533 · credit: Video still: Universitas Nueva Civilización (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=TmdYTvKNRA8) · `media-speakers/farzam-arbab/7e7b0e6260342ce0.jpg`
- bahai.media · 1600×1067 · credit: Bahá’í World News Service (#1453) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Dr_Farzam_Arbab-3.jpg) · `media-speakers/farzam-arbab/337938f586e7e026.jpg`
- bahai.media · 1214×1245 · credit: Bahá’í World News Service (#334) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Dr_Farzam_Arbab.jpg) · `media-speakers/farzam-arbab/afc8d3399a200f32.jpg`
- bahai.media · 1600×1067 · credit: Bahá’í World News Service (#1275) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Dr_Farzam_Arbab_spoke_on_Bahai_history_Norte_del.jpg) · `media-speakers/farzam-arbab/56dd9532be425576.jpg`

### Firaydoun Javaheri

- **primary** · current-primary · 399×497 · credit: — · [source](https://bahaipedia.org/Firaydoun_Javaheri) · `media-speakers/firaydoun-javaheri.jpg`
- youtube-still · 426×533 · credit: Video still: FOPCAtalks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=3oJ-2GNIp94) · `media-speakers/firaydoun-javaheri/7ec81985df43b334.jpg`
- youtube-still · 426×533 · credit: Video still: ICE CUBE  (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=0D0CdWYUOUI) · `media-speakers/firaydoun-javaheri/3a1989db92bcad07.jpg`
- youtube-still · 426×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=N9XEUOFCwyU) · `media-speakers/firaydoun-javaheri/7b6de4e38f23c3e6.jpg`
- youtube-still · 426×533 · credit: Video still: Susan Sheper (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=WED2X80R1PI) · `media-speakers/firaydoun-javaheri/dc20caf6ae8eccc8.jpg`
- youtube-still · 426×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=N4uweZTboos) · `media-speakers/firaydoun-javaheri/37c453c09d567640.jpg`
- youtube-still · 426×533 · credit: Video still: Bahá’í Community of London, Canada (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=DZN9JPzfPww) · `media-speakers/firaydoun-javaheri/f9e594c300dde8aa.jpg`
- youtube-still · 427×533 · credit: Video still: Secretariat NSA Japan (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=1R7uwUfAPa4) · `media-speakers/firaydoun-javaheri/6600be68235b19b9.jpg`

### George Townshend

- **primary** · bahai.media · 1500×2100 · credit: media.bahai.org Bahá’í News. Issue 225, page 2. Bahá’í News. Issue 506, page 8. The Bahá’í World. Vol 12, page 110. The Bahá’í World. Vol 13, page 384. The Bahá’í World. Vol 13, page 842. The Bahá’í World. Vol 14, page 451. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:George_Townshend.jpg) · `media-speakers/george-townshend/5502f3ed7ce6bc21.jpg`

### Glenford E. Mitchell

- **primary** · current-primary · 808×1072 · credit: — · [source](https://bahaipedia.org/Glenford_E._Mitchell) · `media-speakers/glenford-mitchell.jpg`
- bahai.media · 693×1329 · credit: Bahá’í News. Issue 618, page 1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Glenford_E_Mitchell.png) · `media-speakers/glenford-mitchell/b26be8224cb1ad69.png`
- youtube-still · 426×533 · credit: Video still: Baha'is of the United States (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=ePP0UjpnNWg) · `media-speakers/glenford-mitchell/c223d8e632483d37.jpg`
- youtube-still · 426×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=L1rnKZumsHc) · `media-speakers/glenford-mitchell/8533a18562247561.jpg`
- youtube-still · 426×533 · credit: Video still: Glenford Mitchell - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=fCb_GgwWrPc) · `media-speakers/glenford-mitchell/ed736db695197ed9.jpg`
- youtube-still · 411×514 · credit: Video still: Glenford Mitchell - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=XAPNr9X1lZE) · `media-speakers/glenford-mitchell/3b0a18441ae4dc31.jpg`
- youtube-still · 426×533 · credit: Video still: WebChannel9com (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=OZwiWTZWhVk) · `media-speakers/glenford-mitchell/950e1a44a4e70990.jpg`
- bahai.media · 1439×1119 · credit: Bahá’í News. Issue 617, page 5. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Glenford_E_Mitchell_tells_of_US_response.png) · `media-speakers/glenford-mitchell/5ccbd0adce94cc82.png`

### Gustavo Correa

- **primary** · current-primary · 375×511 · credit: — · [source](https://bahaipedia.org/Gustavo_Correa) · `media-speakers/gustavo-correa.jpg`
- bahai.media · 697×878 · credit: Bahá’í News. Issue 634, page 11. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dr_Gustavo_Correa.png) · `media-speakers/gustavo-correa/c604e47843f61728.png`
- youtube-still · 426×533 · credit: Video still: Toward Peace (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=tp5Shx1AFeg) · `media-speakers/gustavo-correa/1f13575df49e442e.jpg`

### Hartmut Grossmann

- **primary** · current-primary · 1600×1593 · credit: — · [source](https://bahaipedia.org/Hartmut_Grossmann) · `media-speakers/hartmut-grossmann.png`
- bahai.media · 807×1072 · credit: Bahá’í World News Service (#622) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Hartmut_Grossmann.jpg) · `media-speakers/hartmut-grossmann/7ee56cb229e24ba7.jpg`

### Hasan M. Balyuzi

- **primary** · current-primary · 1500×2100 · credit: — · [source](https://bahaipedia.org/Hasan_Balyuzi) · `media-speakers/hasan-balyuzi.jpg`
- bahai.media · 445×587 · credit: The Bahá’í World. Vol 18, page 636. Bahá’í News. Issue 589, page -1. Bahá’í News. Issue 591, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Hasan_M._Balyuzi.png) · `media-speakers/hasan-balyuzi/0e6531804a504545.png`

### Hooper Dunbar

- **primary** · current-primary · 817×1072 · credit: — · [source](https://bahaipedia.org/Hooper_Dunbar) · `media-speakers/hooper-dunbar.png`
- bahai.media · 512×512 · credit: Flickr · AI-extended 9:16 master · [source](https://bahai.media/File:Dunbar.png) · `media-speakers/hooper-dunbar/32aeaed1fdcf8e27.png`
- bahai.media · 1024×683 · credit: Flickr · AI-extended 9:16 master · [source](https://bahai.media/File:Dunbar.jpg) · `media-speakers/hooper-dunbar/3703cb3d885ec634.jpg`
- youtube-still · 426×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=gMaYVIYjexo) · `media-speakers/hooper-dunbar/6ddb6a06e6f2f3b1.jpg`
- youtube-still · 427×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=7cSD_0KQ1yY) · `media-speakers/hooper-dunbar/8ac7ce1bacdc8d66.jpg`
- youtube-still · 426×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=73ksyT-MB54) · `media-speakers/hooper-dunbar/ddf50f4dbacd70a9.jpg`
- youtube-still · 427×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=gqUjUxnqg5Q) · `media-speakers/hooper-dunbar/84c64a60ed3c8141.jpg`
- youtube-still · 426×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=dasQrPNyNSU) · `media-speakers/hooper-dunbar/8dbbca91420f865a.jpg`
- youtube-still · 426×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=iF21N27TzR4) · `media-speakers/hooper-dunbar/8b6e9c9e758811d9.jpg`
- youtube-still · 427×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=UvEfsdi_D1s) · `media-speakers/hooper-dunbar/a853e7c44965e081.jpg`
- youtube-still · 426×533 · credit: Video still: Hooper C Dunbar - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=R3eUc2BbxRY) · `media-speakers/hooper-dunbar/226d450d30d1b439.jpg`
- bahai.media · 1280×853 · credit: Bahá’í World News Service (#1129) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Hooper_Dunbar_talks_about_Bahai_Pioneering_Women.jpg) · `media-speakers/hooper-dunbar/36aef9935ff7382f.jpg`
- bahai.media · 700×1654 · credit: Bahá’í News. Issue 690, page 9. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hooper_Dunbar_talking_stick.png) · `media-speakers/hooper-dunbar/9eea953c5e32df8d.png`

### Hooshmand Badee

- **primary** · current-primary · 804×861 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/hooshmand-badee-is-there-a-bahai-economic-system/) · `media-speakers/hooshmand-badee.jpg`
- youtube-still · 426×533 · credit: Video still: Wilmette Institute (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=RZ0pkSxClPw) · `media-speakers/hooshmand-badee/35c5714df08c6cd8.jpg`
- web · 2018 · 757×720 · credit: — · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/hooshmand2018/) · `media-speakers/hooshmand-badee/cf875d11346111a5.jpg`
- web · 2012 · 960×720 · credit: — · [source](https://wilmetteinstitute.org/hooshmandbadee/) · `media-speakers/hooshmand-badee/caf689e5648b0d40.jpg`

### Hushmand Fatheazam

- **primary** · current-primary · 1416×2000 · credit: — · [source](https://bahaipedia.org/Hushmand_Fatheazam) · `media-speakers/hushmand-fatheazam.jpg`
- bahai.media · 2003 · 855×1111 · credit: Bahá’í World News Service (#206) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Hushmand_Fatheazam,_2003.png) · `media-speakers/hushmand-fatheazam/167304097a232313.png`
- youtube-still · 427×533 · credit: Video still: Hushmand Fatheazam - Talks (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=-4HIO4aaXSg) · `media-speakers/hushmand-fatheazam/fd0c06c49730d24f.jpg`
- bahai.media · 1600×1240 · credit: Bahá’í World News Service (#655) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Hushmand_Fatheazam1.jpg) · `media-speakers/hushmand-fatheazam/f010d5ab1662ae95.jpg`

### Ian Semple

- **primary** · current-primary · 1600×1988 · credit: — · [source](https://bahaipedia.org/Ian_Semple) · `media-speakers/ian-semple.jpg`
- youtube-still · 426×533 · credit: Video still: WebChannel9com (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=qqjKAxkjsFU) · `media-speakers/ian-semple/afa6044dcbfa675a.jpg`
- bahai.media · 1600×1067 · credit: Bahá’í World News Service (#390) The Bahá’í World. Vol 34, page 43. · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Ian_Semple_in_Germany.jpg) · `media-speakers/ian-semple/8cd2f6ca6b2c146c.jpg`
- youtube-still · 427×533 · credit: Video still: Ian Semple - Talks (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=S65uGqXcC04) · `media-speakers/ian-semple/c21460a7cab6355e.jpg`
- youtube-still · 426×533 · credit: Video still: WebChannel9com (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=ZEjRhpfpx9I) · `media-speakers/ian-semple/4918295e813a417a.jpg`
- youtube-still · 426×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=-hZm19PEaZ0) · `media-speakers/ian-semple/d9f8620f8ded4e8b.jpg`
- youtube-still · 426×533 · credit: Video still: WebChannel9com (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=kWVkbhE9fe4) · `media-speakers/ian-semple/e4bdae398270ad36.jpg`
- youtube-still · 427×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=BOCXCsMzw10) · `media-speakers/ian-semple/01e4ffece09a4468.jpg`
- youtube-still · 427×533 · credit: Video still: Embracing Unity (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=3N4GG9aMeDY) · `media-speakers/ian-semple/98a30ea7f7f0f766.jpg`

### Jena Khadem Khodadad

- **primary** · current-primary · 1085×967 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/jena-khodadad/) · `media-speakers/jena-khadem-khodadad.png`

### JoAnn Borovicka

- **primary** · current-primary · 313×315 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/jo-ann-borovicka-ten-plagues-of-the-exodus-in-the-light-of-the-bahai-writings/) · `media-speakers/joann-borovicka.jpg`
- web · 632×721 · credit: — · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/joannborovickaspeaker/) · `media-speakers/joann-borovicka/a7379a943573704e.png`

### John E. Esslemont

- **primary** · bahai.media · 1478×2160 · credit: media.bahai.org · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:J.E._Esslemont_Baha%27i_Media_Bank_portrait.jpg) · `media-speakers/john-esslemont/0b7355d199c6878c.jpg`
- bahai.media · 876×1024 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:John_Esslemont_portrait.png) · `media-speakers/john-esslemont/c1e16f2f1722f745.png`
- bahai.media · 1912 · 566×627 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:John_Esslemont,_1912.png) · `media-speakers/john-esslemont/16a6299f8b1c9da7.png`

### John Hatcher

- **primary** · current-primary · 875×1206 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/a-library-of-web-talks-247365-john-hatcher-on-the-bicentenary-and-paul-hanley-on-eleven/) · `media-speakers/john-hatcher.jpg`
- web · 682×720 · credit: — · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/john-hatcher/) · `media-speakers/john-hatcher/09ba380fb92e1b3a.jpg`

### John Henry Hyde Dunn

- **primary** · bahai.media · 1500×2100 · credit: https://media.bahai.org/detail/3350358/ The Bahá’í World. Vol 9, page 594. The Bahá’í World. Vol 14, page 449. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Hyde_Dunn.jpg) · `media-speakers/john-henry-hyde-dunn/110c5ff90a9279eb.jpg`
- web · 1290×1965 · credit: Messages to the Antipodes, between pp. 232–233 (via bahai.media) · [source](https://bahai.media/File:Hyde_Dunn-MA.jpg) · `media-speakers/john-henry-hyde-dunn/d9859e9949f42650.jpg`

### John Robarts

- **primary** · current-primary · 1507×2135 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/John_Robarts) · `media-speakers/john-robarts.jpg`
- bahai.media · 1600×1150 · credit: Bahá’í News. Issue 519, page 16. The American Bahá’í. Volume 5, Issue 6. Pg 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:John_Robarts.png) · `media-speakers/john-robarts/4179a432e3d27d0b.png`
- bahai.media · 708×1021 · credit: The Bahá’í World. Vol 13, page 392. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. John Robarts (Bahaipedia · Images ) · AI-extended 9:16 master · [source](https://bahai.media/File:John_Robarts_portrait_from_BW_Vol_13.png) · `media-speakers/john-robarts/db5b6d25c4a84e97.png`

### Judy Hannen Moe

- **primary** · web · 400×533 · credit: — · [source](https://www.bahaiblog.net/articles/books/aflame-with-devotion-a-new-biography-about-the-hannen-and-knobloch-families/) · `media-speakers/judy-hannen-moe/56a201cd4caf58cf.jpg`

### Kathryn Hogenson

- **primary** · current-primary · 1600×1846 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/what-listeners-say-hogensons-web-talk-first-western-pilgrimage/) · `media-speakers/kathryn-hogenson.jpg`

### Keith Ransom-Kehler

- **primary** · bahai.media · 425×600 · credit: media.bahai.org The Bahá’í World. Vol 14, page 447. · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Keith_Ransome-Kehler.jpg) · `media-speakers/keith-ransom-kehler/2bba31bc7cd0200a.jpg`
- bahai.media · 652×874 · credit: The Bahá’í World. Vol 5, page 390. Bahá’í News. Issue 518, page 11. Bahá’í News. Issue 616, page 13. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Portrait_of_Keith_Ransom-Kehler.png) · `media-speakers/keith-ransom-kehler/3f94a8530d93e25e.png`

### Kiser Barnes

- **primary** · current-primary · 598×796 · credit: — · [source](https://bahaipedia.org/Kiser_Barnes) · `media-speakers/kiser-barnes.jpg`

### Leonard Swidler

- **primary** · current-primary · 800×1097 · credit: Ingrid Shafer (Drshafer) · licence: CC BY-SA 3.0 · [source](https://commons.wikimedia.org/wiki/File:Swidler_17_Nov_2005.jpg) · `media-speakers/leonard-swidler.jpg`
- web · 900×600 · credit: — · [source](https://www.dialogueinstitute.org/our-founder) · `media-speakers/leonard-swidler/e279e968a959ada5.webp`
- web · 2025 · 1200×658 · credit: — · [source](https://kurdistanchronicle.com/b/3673) · `media-speakers/leonard-swidler/231a9627bbef9d8d.jpg`
- web · 2025 · 1718×1360 · credit: — · [source](https://kurdistanchronicle.com/b/3673) · `media-speakers/leonard-swidler/d1614efd609387a5.png`

### Leroy Ioas

- **primary** · current-primary · 328×460 · credit: Bahá'í International Community · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Leroy_Ioas) · `media-speakers/leroy-ioas.jpg`
- bahai.media · 787×996 · credit: Bahaipedia (bahai.media) · AI-extended 9:16 master · [source](https://bahai.media/File:Hand_Cause_Leroy_Ioas.jpg) · `media-speakers/leroy-ioas/02c78ac27a6ad5f8.jpg`
- bahai.media · 762×1037 · credit: The Bahá’í World. Vol 12, page 109. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Leroy_C._Ioas.png) · `media-speakers/leroy-ioas/2f1ba3eb38dc23b4.png`
- bahai.media · 794×899 · credit: The Bahá’í World. Vol 14, page 293. The Bahá’í World. Vol 14, page 451. Bahá’í News. Issue 417, page 3. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Leroy_Ioas_portrait.png) · `media-speakers/leroy-ioas/f7e9a5b0120eeb60.png`
- bahai.media · 1600×1650 · credit: Bahá’í World News Service (#252) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Leroy_Ioas.jpg) · `media-speakers/leroy-ioas/6c1eb24aa90c1406.jpg`
- bahai.media · 1188×800 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Leroy_Ioas_speaking_at_Geyserville_Unity_Feast.png) · `media-speakers/leroy-ioas/ec929fcfe5025cb5.png`

### Louis G. Gregory

- **primary** · bahai.media · 1099×1431 · credit: Bahá’í World News Service (#188) The Bahá’í World. Vol 12, page 666. The Bahá’í World. Vol 14, page 447. Bahá’í News. Issue 455, page 1. Bahá’í News. Issue 477, page 8. Bahá’í News. Issue 525, page 4. Bahá’í News. Issue 619, page 18. The American Bahá’í. Volume 1, Issue 6. Pg 7. The American Bahá’í. Volume 3, Issue 7. Pg 1. The American Bahá’í. Volume 3, Issue 9. Pg 2. The American Bahá’í. Volume 3, Issue 11. Pg 1. The American Bahá’í. Volume 4, Issue 4. Pg 6. · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Hand_of_the_Cause_Louis_G_Gregory.jpg) · `media-speakers/louis-gregory/297d1d3265eba423.jpg`
- bahai.media · 1152×1452 · credit: Bahá’í News. Issue 619, page 20. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Louis_G_Gregory_studio_portrait.png) · `media-speakers/louis-gregory/01866374f3a7592b.png`
- bahai.media · 486×758 · credit: Star of the West. Volume 2, Issue 9. Pg 13. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Louis_G._Gregory.png) · `media-speakers/louis-gregory/d2743d2f059c35f9.png`

### Louis Venters

- **primary** · current-primary · 250×349 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/how-did-the-bahai-community-of-south-carolina-emerge-from-the-jim-crow-south-sign-up-for-dr-louis-venters-web-talk-on-december-4/) · `media-speakers/louis-venters.jpg`
- web · 2020 · 900×600 · credit: — · [source](https://www.fmarion.edu/history/faculty/) · `media-speakers/louis-venters/6b61bc0b485f93bd.jpg`
- web · 400×600 · credit: — · [source](https://www.bahaiblog.net/?p=42094) · `media-speakers/louis-venters/7283c1f0767b083a.png`

### Louise Profeit-LeBlanc

- **primary** · current-primary · 457×635 · credit: De.wong91 · licence: CC BY-SA 4.0 · [source](https://commons.wikimedia.org/wiki/File:Louise_Profeit-LeBlanc_2019_(cropped).jpg) · `media-speakers/louise-profeit-leblanc.jpg`
- bahai.media · 878×897 · credit: The Bahá’í World. Vol 20, page 417. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Louise_Profeit_Leblanc_presentation.png) · `media-speakers/louise-profeit-leblanc/caa2935658e899d5.png`

### Mariette Leong

- **primary** · web · 587×720 · credit: — · [source](https://wilmetteinstitute.org/marietteleong/) · `media-speakers/mariette-leong/cf5ac74934a15836.jpg`

### Martha Root

- **primary** · current-primary · 700×935 · credit: — · [source](https://siftersearch.com/biography/1248174) · `biography/1248174.png`
- bahai.media · 1972 · 1600×2059 · credit: Bahá’í News. Issue 497, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Martha_Root_-_Herald_of_the_Kingdom,_1972.png) · `media-speakers/martha-root/a07fed35218e2655.png`
- bahai.media · 1923 · 689×1426 · credit: Bahá’í News. Issue 632, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Martha_Root_China_1923_24.png) · `media-speakers/martha-root/9d72b27c7b644277.png`

### Masud Khamsi

- **primary** · web · 1620×2000 · credit: — · [source](https://bahai.media/File:Mas’ud_Khamsi.jpg) · `media-speakers/masud-khamsi/4ddc58ae2e6817c3.jpg`
- web · 556×873 · credit: — · AI-extended 9:16 master · [source](https://bahai.media/File:Mas'ud_Khamsi.png) · `media-speakers/masud-khamsi/06a7126939b5e63a.png`

### Michael Day

- **primary** · web · 471×513 · credit: — · [source](https://wilmetteinstitute.org/michael-v-day/) · `media-speakers/michael-day/ca019dcf868a1b47.jpg`

### Michael Penn

- **primary** · current-primary · 1600×1664 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/michaelpennboard/) · `media-speakers/michael-penn.png`
- bahai.media · 1600×1064 · credit: Bahá’í World News Service (#247) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Dr_Michael_Penn.jpg) · `media-speakers/michael-penn/983fe09d5c685573.jpg`
- bahai.media · 955×685 · credit: Bahá’í World News Service (#84) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Michael_Penn_at_the_Hebrew_University_in_Jerusalem.jpg) · `media-speakers/michael-penn/714d98f2b0554a81.jpg`
- web · 2015 · 604×466 · credit: — · [source](https://wilmetteinstitute.org/michael-penn-web-talk/) · `media-speakers/michael-penn/15e24df94a615a75.jpg`

### Mikhail Sergeev

- **primary** · web · 3171×2304 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/wp-json/wp/v2/media?search=SergeevPortrait) · `media-speakers/mikhail-sergeev/f4290bf664ec91ea.jpg`
- web · 624×720 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/wp-json/wp/v2/media?search=Misha) · `media-speakers/mikhail-sergeev/3f4bc042b995561d.jpg`

### Moojan Momen

- **primary** · current-primary · 200×293 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/twentieth-anniversary-web-talks-success-continues-with-dr-moojan-momens-discussion-of-the-re-creation-and-utilization-of-a-communitys-memories-shoghi-effendi-and-baha/) · `media-speakers/moojan-momen.jpg`
- web · 2022 · 450×675 · credit: Courtesy of Immersed Photography · [source](https://www.bahaiblog.net/?p=30562) · `media-speakers/moojan-momen/75d38f6f9cef4c76.jpg`
- web · 850×655 · credit: — · [source](https://wilmetteinstitute.org/moojanmomenspeaker/) · `media-speakers/moojan-momen/e3f008770b75c1f7.png`

### Musa Banani

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/M%C3%BAs%C3%A1_Ban%C3%A1n%C3%AD) · `media-speakers/musa-banani.jpg`
- bahai.media · 737×1054 · credit: The Bahá’í World. Vol 12, page 111. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Musa_Banani.png) · `media-speakers/musa-banani/e34139ae3cf7143e.png`
- bahai.media · 745×1024 · credit: The Bahá’í World. Vol 15, page 422. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Mu%E2%80%99sa_Banani.png) · `media-speakers/musa-banani/1abfed05183af016.png`

### Paul E. Haney

- **primary** · current-primary · 1498×2160 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Paul_Haney) · `media-speakers/paul-haney.jpg`
- bahai.media · 442×622 · credit: The Bahá’í World. Vol 18, page 615. Bahá’í News. Issue 623, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Paul_Haney,_portrait_from_Baha%27i_World_Vol_18.png) · `media-speakers/paul-haney/0214331c4087c1bf.png`
- bahai.media · 1959 · 790×800 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Paul_Haney_in_the_Holy_Land,_1959_or_60.png) · `media-speakers/paul-haney/d9d8c0663f591583.png`
- bahai.media · 744×1036 · credit: The Bahá’í World. Vol 12, page 113. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Paul_E._Haney.png) · `media-speakers/paul-haney/9280c669ef30d499.png`

### Paul Hanley

- **primary** · current-primary · 424×521 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/a-library-of-web-talks-247365-john-hatcher-on-the-bicentenary-and-paul-hanley-on-eleven/) · `media-speakers/paul-hanley.jpg`
- web · 2020 · 848×797 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/paulhanley2020/) · `media-speakers/paul-hanley/0b0d8e8d194740fa.png`

### Paul Lample

- **primary** · current-primary · 521×596 · credit: Bahá'í World News Service · licence: BWNS photo (bahai.media 'Baha'i World News Service' licence template) · [source](https://bahai.media/File:Paul_Lample.JPG) · `media-speakers/paul-lample.jpg`
- bahai.media · 2016 · 574×486 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Paul_Lample_in_2016.png) · `media-speakers/paul-lample/47e9a4e98bda80f1.png`
- bahai.media · 1600×1384 · credit: Bahá’í World News Service (#655) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Paul_Lample_speaking.jpg) · `media-speakers/paul-lample/2bc2a819241e87a9.jpg`
- youtube-still · 426×533 · credit: Video still: Association for Bahá’í Studies (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=HQHxanMuUDE) · `media-speakers/paul-lample/9d289228e925d32a.jpg`
- youtube-still · 427×533 · credit: Video still: Baha'is of the United States (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=NnBZzCofdM4) · `media-speakers/paul-lample/c78ecd24c3fe5b3e.jpg`
- web · 2024 · 3456×5184 · credit: Association for Bahá’í Studies · [source](https://www.bahaistudies.ca/watch/a-still-more-superb-mission) · `media-speakers/paul-lample/b8ea450eebf1b25d.jpg`

### Peter Khan

- **primary** · current-primary · 810×1072 · credit: — · [source](https://bahaipedia.org/Peter_Khan) · `media-speakers/peter-khan.jpg`
- bahai.media · 1600×1331 · credit: Bahá’í World News Service (#474) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Peter_Khan_at_ABS.jpg) · `media-speakers/peter-khan/d4aca1a6073103de.jpg`
- bahai.media · 1983 · 555×848 · credit: Bahá’í News. Issue 588, page 11. Bahá’í News. Issue 626, page 8. Bahá’í News. Issue 628, page 4. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Dr._Peter_Khan,_1983.jpg) · `media-speakers/peter-khan/2702ef841f67c4ee.jpg`
- bahai.media · 830×1024 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Peter_Khan_in_his_youth.png) · `media-speakers/peter-khan/8474f727a362528c.png`

### Raḥmatu’lláh Muhájir

- **primary** · current-primary · 1245×1679 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Ra%E1%B8%A5matu%E2%80%99ll%C3%A1h_Muh%C3%A1jir) · `media-speakers/rahmatullah-muhajir.jpg`
- bahai.media · 1979 · 980×1232 · credit: Bahá’í News. Issue 587, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Rahmatullah_Muhajir_1979.png) · `media-speakers/rahmatullah-muhajir/9901641959cb3fd3.png`
- bahai.media · 850×1020 · credit: Bahá’í News. Issue 539, page 12. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Rahmatullah_Muhajir_teaching_conferences.png) · `media-speakers/rahmatullah-muhajir/dfe015d646c1e061.png`
- youtube-still · 420×525 · credit: Video still: Baha'i Perspective (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=-02RNc0o5CU) · `media-speakers/rahmatullah-muhajir/03dc64e0896a7e2e.jpg`
- bahai.media · 1976 · 987×1186 · credit: Bahá’í News. Issue 604, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_of_God_Rahmatullah_Muhajir.png) · `media-speakers/rahmatullah-muhajir/fab7742d92ef87cc.png`
- bahai.media · 704×998 · credit: Bahá’í News. Issue 528, page 7. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_Rahmatullah_Muhajir_Uruguay.png) · `media-speakers/rahmatullah-muhajir/e42d029b0fa8888d.png`

### Rainn Wilson

- **primary** · current-primary · 500×625 · credit: John Manard · licence: CC BY-SA 4.0 · [source](https://www.wikidata.org/wiki/Q349548) · `media-speakers/rainn-wilson.jpg`
- bahai.media · 2011 · 1920×2520 · credit: David Shankbone · licence: CC BY 3.0 · [source](https://commons.wikimedia.org/wiki/File:Rainn_Wilson_2011_Shankbone.JPG) · `media-speakers/rainn-wilson/4d0402d51fd837c0.jpg`
- bahai.media · 1600×2400 · credit: Bahá’í World News Service (#548) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Rainn_Wilson.jpg) · `media-speakers/rainn-wilson/825bf5b9dbf5e478.jpg`
- bahai.media · 2009 · 872×918 · credit: Rainn_Wilson_2009.jpg: Kristin Dos Santos
derivative work: Beao · licence: CC BY-SA 2.0 · [source](https://commons.wikimedia.org/wiki/File:Rainn_Wilson_2009_cropped.jpg) · `media-speakers/rainn-wilson/f1f15243408ffd1e.jpg`
- bahai.media · 1480×2000 · credit: Bahá’í World News Service (#1877) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · [source](https://bahai.media/File:Rainn_Wilson_at_Capitol_Hill.jpg) · `media-speakers/rainn-wilson/9c564d87030501ba.jpg`

### Reba Carruth

- **primary** · current-primary · 404×471 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/four-february-web-talks-the-spiritual-destiny-of-america-bahai-artist-mark-tobey-and-bahaullahs-letter-to-nasirid-din-shah/) · `media-speakers/reba-carruth.jpg`

### Robert Atkinson

- **primary** · current-primary · 556×640 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/robert-atkinson-webinar-series/) · `media-speakers/robert-atkinson.jpg`
- web · 1466×1000 · credit: — · AI-extended 9:16 master · [source](https://www.robertatkinson.net/home/bobatkinsonm/) · `media-speakers/robert-atkinson/1c0b973599b31b76.jpg`

### Robert Stockman

- **primary** · current-primary · 760×878 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/wilmette-institute-at-american-academy-of-religion/) · `media-speakers/robert-stockman.jpg`
- web · 960×960 · credit: — · [source](https://clas.iusb.edu/philosophy/faculty-and-staff/stockman.html) · `media-speakers/robert-stockman/e2a863d8f91b6afd.jpg`
- web · 2003 · 3008×2000 · credit: Images International · AI-extended 9:16 master · [source](https://imagesinternational.org/people/mr-robert-stockman) · `media-speakers/robert-stockman/a90c4b4aaeca5eee.jpg`
- web · 2017 · 596×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/robert-stockman) · `media-speakers/robert-stockman/0121fcd0d3113de0.jpg`
- web · 2017 · 533×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/) · `media-speakers/robert-stockman/1e9a0ce4cbd7971a.jpg`

### Robert Weinberg

- **primary** · current-primary · 841×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/spiritual-and-intellectual-gifts-in-march-web-talks/) · `media-speakers/robert-weinberg.jpg`
- web · 746×960 · credit: — · [source](https://www.bahaiblog.net/?p=10103) · `media-speakers/robert-weinberg/d3cc2864d9bba9e6.jpg`
- web · 2021 · 1304×1681 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/robertweinberg/) · `media-speakers/robert-weinberg/2af33733b1a50cdc.jpg`

### Roshan Danesh

- **primary** · current-primary · 400×378 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/roshan-danesh-imagining-bahai-law/) · `media-speakers/roshan-danesh.jpg`
- web · 2024 · 853×1280 · credit: Mary Danesh (per thebcreview.ca filename 'photo-credit_-mary-danesh' and festivalofauthors.ca 'credit-Mary-Danesh') · [source](https://dafoefoundation.ca/?p=726) · `media-speakers/roshan-danesh/693a0571df24a548.jpg`

### Roy C. Wilhelm

- **primary** · bahai.media · 1500×2100 · credit: http://media.bahai.org/subjects/7920/details · licence: Copyright © Bahá'í International Community. The copyright to this file, which was published on the website of the Bahá’í Media Bank, belongs to the Bahá’í International Community. The file is reproduced not-for-profit with permission of the Bahá’í International Community as allowed by these terms. · [source](https://bahai.media/File:Roy_C._Wilhelm.jpg) · `media-speakers/roy-wilhelm/1928016054ed4ef5.jpg`
- bahai.media · 745×1124 · credit: The Bahá’í World. Vol 12, page 663. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Roy_C._Wilhelm.png) · `media-speakers/roy-wilhelm/dea79c8bfed09429.png`

### Roya Akhavan

- **primary** · current-primary · 366×400 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/a-new-look-an-august-web-talk-on-tahirih-beyond-emancipation/) · `media-speakers/roya-akhavan.jpg`
- web · 569×720 · credit: — · [source](https://wilmetteinstitute.org/royaakhavan2-2/) · `media-speakers/roya-akhavan/8ee2603321fda9c1.jpg`

### Rúhíyyih Khánum

- **primary** · current-primary · 350×456 · credit: — · [source](https://bahaipedia.org/R%C3%BA%E1%B8%A5%C3%ADyyih_Kh%C3%A1num) · `media-speakers/ruhiyyih-khanum.jpg`
- bahai.media · 500×682 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Amatulbaha1.jpg) · `media-speakers/ruhiyyih-khanum/3f4069084515a13c.jpg`
- youtube-still · 426×533 · credit: Video still: Ezzatollah Rohani Seissan (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=87VvDW9kBuo) · `media-speakers/ruhiyyih-khanum/f81ff4fdfbca45f0.jpg`
- bahai.media · 1952 · 855×1158 · credit: The American Bahá’í. Volume 5, Issue 5. Pg 11. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Amatul_Baha_Ruhiyyih_Khanum_1952.png) · `media-speakers/ruhiyyih-khanum/83d4d09bbbdcb62a.png`
- bahai.media · 1976 · 707×833 · credit: Bahá’í News. Issue 538, page 19. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Amatul_Baha_Ruhiyyih_Khanum_speaking_at_podium_New_York_1976.png) · `media-speakers/ruhiyyih-khanum/9fa5a34886a0ff3b.png`
- bahai.media · 1114×765 · credit: The Bahá’í World. Vol 20, page 622. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Amatul_Baha_Ruhiyyih_Khanum.png) · `media-speakers/ruhiyyih-khanum/eda41e03c4a5d206.png`
- bahai.media · 1600×1253 · credit: Filmstrip: The Green Light Expedition, Part 3 · licence: From Bahá’í Media, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1971-1976. · [source](https://bahai.media/File:Slide_037_-_Remarkably_gentle_pets.png) · `media-speakers/ruhiyyih-khanum/f46843844dc67588.png`
- bahai.media · 936×1047 · credit: The Bahá’í World. Vol 13, page 379. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Amatu%E2%80%99l-Baha_Ruhiyyih_Khanum.png) · `media-speakers/ruhiyyih-khanum/0d4b6eae9a71d279.png`

### Sandra Lynn Hutchison

- **primary** · current-primary · 329×370 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/faculty/sandra-hutchison/) · `media-speakers/sandra-lynn-hutchison.jpg`
- web · 648×960 · credit: — · [source](https://www.elixir-journal.org/about.php) · `media-speakers/sandra-lynn-hutchison/15d613e97fe5503a.jpg`

### Shahriar Razavi

- **primary** · bahai.media · 2003 · 547×582 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:Shahriar_Razavi,_2003.png) · `media-speakers/shahriar-razavi/71b409894f991537.png`

### Shahrokh Monjazeb

- **primary** · current-primary · 200×289 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/a-video-feast-for-the-fast/) · `media-speakers/shahrokh-monjazeb.jpg`

### Shuaullah Alai

- **primary** · current-primary · 1502×2206 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Shu%E2%80%98%C3%A1%E2%80%98u%E2%80%99ll%C3%A1h_%E2%80%98Al%C3%A1%E2%80%99%C3%AD) · `media-speakers/shuaullah-alai.jpg`
- bahai.media · 698×1030 · credit: The Bahá’í World. Vol 13, page 387. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Shu%27a%27u%27llah_%27Ala%27i_portrait_from_BW13.jpg) · `media-speakers/shuaullah-alai/335fda563a20cc6d.jpg`
- bahai.media · 438×615 · credit: The Bahá’í World. Vol 12, page 114. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Shu%27a%27u%27llah_Ala%27i_in_the_1950s.jpg) · `media-speakers/shuaullah-alai/e384a496ef61f78f.jpg`
- bahai.media · 400×580 · credit: Bahá’í News. Issue 646, page -1. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Shuaullah_Ala%27i_in_later_years.jpg) · `media-speakers/shuaullah-alai/5ef9b7a1f85d7023.jpg`

### Sohrab Kourosh

- **primary** · web · 2017 · 431×434 · credit: — · [source](https://wilmetteinstitute.org/letter-to-the-editor-the-seven-valleys/) · `media-speakers/sohrab-kourosh/3ed8efa322f63213.jpg`

### Sovaida Maani Ewing

- **primary** · current-primary · 200×200 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/faculty/sovaida-maani-ewing/) · `media-speakers/sovaida-maani-ewing.jpg`

### Stephen Birkland

- **primary** · current-primary · 1482×2000 · credit: — · [source](https://bahaipedia.org/Stephen_Birkland) · `media-speakers/stephen-birkland.jpg`
- bahai.media · 1600×1064 · credit: Bahaipedia (bahai.media) · AI-extended 9:16 master · [source](https://bahai.media/File:Stephen_Birkland_delivering_a_talk.jpg) · `media-speakers/stephen-birkland/b7a52a8d34a68d0a.jpg`
- bahai.media · 640×480 · credit: Post-London Regional Baha'i conference blog · [source](https://bahai.media/File:Stephen_Birkland_speaking.JPG) · `media-speakers/stephen-birkland/4af2ff4fa778514d.jpg`

### Stephen Hall

- **primary** · current-primary · 1500×2000 · credit: — · [source](https://bahaipedia.org/Stephen_Hall) · `media-speakers/stephen-hall.jpg`

### Steve Friberg

- **primary** · web · 2019 · 1216×1120 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/faculty/stephen-friberg/) · `media-speakers/steve-friberg/2419bbb4889f807e.jpg`
- web · 2013 · 602×484 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/stephen-friberg-2/) · `media-speakers/steve-friberg/cf0b58f3e560bf04.jpg`

### Steven Phelps

- **primary** · current-primary · 536×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/i-am-the-mystic-fane-the-nature-of-the-manifestation-in-the-bahai-writings-a-web-talk-on-may-15-by-dr-steven-phelps/) · `media-speakers/steven-phelps.jpg`
- web · 442×440 · credit: — · [source](https://wilmetteinstitute.org/self-1/) · `media-speakers/steven-phelps/0669ed2c4db6ce75.png`

### Susanne Alexander

- **primary** · current-primary · 547×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/be-brave-and-arise/) · `media-speakers/susanne-alexander.jpg`
- web · 1293×1084 · credit: — · AI-extended 9:16 master · [source](https://marriagetransformation.com/susanne-head-shot/) · `media-speakers/susanne-alexander/9684d5c96c8d9476.png`
- web · 940×788 · credit: — · [source](https://marriagetransformation.com/susanne-presenting/) · `media-speakers/susanne-alexander/a267516499317a7f.png`
- web · 791×1200 · credit: — · [source](https://marriagetransformation.com/susanne-m-alexander-headshot-in-red/) · `media-speakers/susanne-alexander/3d9f4abd16935b92.jpg`
- web · 1077×1548 · credit: — · [source](https://wilmetteinstitute.org/susanne-m-alexander-sitting-in-blackb/) · `media-speakers/susanne-alexander/e10cffa4265347ce.jpg`
- web · 579×720 · credit: — · [source](https://wilmetteinstitute.org/susanne-m-alexander-2/) · `media-speakers/susanne-alexander/4e6db93c4ba936e9.jpg`

### Tarazullah Samandari

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/%E1%B9%ACar%C3%A1%E1%BA%93u%E2%80%99ll%C3%A1h_Samandar%C3%AD) · `media-speakers/tarazullah-samandari.jpg`
- bahai.media · 693×636 · credit: Bahá’í News. Issue 529, page 13. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Tarazullah_Samandari.png) · `media-speakers/tarazullah-samandari/6c0557dbc8bbf98f.png`
- bahai.media · 438×622 · credit: The Bahá’í World. Vol 12, page 111. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:%E1%B9%ACar%C3%A1%E1%BA%93u%E2%80%99ll%C3%A1h_Samandar%C3%AD_portrait_from_Baha%27i_World,_Vol._12.jpg) · `media-speakers/tarazullah-samandari/ed6076e772ea88f8.jpg`
- bahai.media · 1967 · 1042×1153 · credit: Bahá’í News. Issue 441, page 16. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_Tarazullah_Samandari_1967.png) · `media-speakers/tarazullah-samandari/da558abc63087af7.png`
- bahai.media · 1025×1052 · credit: Bahá’í News. Issue 441, page 19. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Hand_of_the_Cause_Tarazullah_Samandari.png) · `media-speakers/tarazullah-samandari/e44087b8f8fd0bdf.png`

### Todd Lawson

- **primary** · current-primary · 529×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/dr-todd-lawson-three-web-talks-on-the-quran-excellent-for-interfaith-dialogue-and-significant-conversations-essential-for-bahais-learning-to-defend-islam/) · `media-speakers/todd-lawson.jpg`
- youtube-still · 426×533 · credit: Video still: Wilmette Institute (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=CWoKmcI87kw) · `media-speakers/todd-lawson/41587b2d66a0efb7.jpg`
- youtube-still · 426×533 · credit: Video still: Wilmette Institute (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=XvGBQsPlRew) · `media-speakers/todd-lawson/970d9f4c47c920f3.jpg`
- web · 600×462 · credit: — · [source](https://wilmetteinstitute.org/todd-lawson-2/) · `media-speakers/todd-lawson/b2759701375c88ec.jpg`

### Ugo Giachery

- **primary** · current-primary · 800×1115 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/Ugo_Giachery) · `media-speakers/ugo-giachery.png`
- bahai.media · 469×585 · credit: The Bahá’í World. Vol 15, page 573. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Ugo_Giachery_portrait_from_BW_Vol_15.png) · `media-speakers/ugo-giachery/034b44549840cc79.png`
- bahai.media · 592×771 · credit: The Bahá’í World. Vol 20, page 778. Bahá’í World News Service (#252) · licence: &copy; Bahá’í World News Service The copyright to this file belongs to the Bahá’í World News Service. The file is reproduced not-for-profit with permission of the Bahá'í World News Service as allowed by these terms. Restrictions on reuse: The terms of the Bahá’í World News Service specify that: 1) t · AI-extended 9:16 master · [source](https://bahai.media/File:Ugo_Giachery.png) · `media-speakers/ugo-giachery/12ac3811d1ced296.png`
- bahai.media · 744×508 · credit: The Bahá’í World. Vol 17, page 109. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Ugo_Giachery_was_the_representative_in_Helsinki.png) · `media-speakers/ugo-giachery/c7971b6b52c9375e.png`
- bahai.media · 1037×1298 · credit: Bahá’í News. Issue 411, page 15. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:Dr_Ugo_Giachery_Bahai_Braille_Library_Tucson.png) · `media-speakers/ugo-giachery/2a5fb0070c66403f.png`
- youtube-still · 426×533 · credit: Video still: Gustavo Cerrato (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=d0Y2eh_AGQo) · `media-speakers/ugo-giachery/d1249677532a6833.jpg`

### Valerie Phillips

- **primary** · web · 2015 · 709×616 · credit: Wilmette Institute · AI-extended 9:16 master · [source](https://wilmetteinstitute.org/valerie-jean-phillips/) · `media-speakers/valerie-phillips/7e369ddda956a668.jpg`

### Vasu Mohan

- **primary** · web · 2017 · 482×720 · credit: Wilmette Institute · [source](https://wilmetteinstitute.org/vasumohannew/) · `media-speakers/vasu-mohan/594d8cd29c0ece0a.jpg`
- web · 939×877 · credit: Sojourners · [source](https://sojo.net/node/219111) · `media-speakers/vasu-mohan/881d6073b845a413.jpg`

### Violette Nakhjavání

- **primary** · current-primary · 1512×1785 · credit: — · [source](https://bahaipedia.org/Violette_Nakhjavani) · `media-speakers/violette-nakhjavani.jpg`

### William Sears

- **primary** · current-primary · 1500×2100 · credit: — · licence: Bahá’í Media Bank (media.bahai.org terms) · [source](https://bahaipedia.org/William_Sears) · `media-speakers/william-sears.jpg`
- bahai.media · 745×978 · credit: The Bahá’í World. Vol 20, page 797. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:William_Sears_Portrait.png) · `media-speakers/william-sears/e5720175c0be796c.png`
- bahai.media · 854×1024 · credit: Bahaipedia (bahai.media) · [source](https://bahai.media/File:William_Sears_portrait.png) · `media-speakers/william-sears/ef25146e06245c79.png`
- youtube-still · 426×533 · credit: Video still: ICE CUBE  (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=-I4VGC3D2PM) · `media-speakers/william-sears/3dc31d6e991240b1.jpg`
- bahai.media · 685×627 · credit: The American Bahá’í. Volume 1, Issue 2. Pg 2. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · AI-extended 9:16 master · [source](https://bahai.media/File:Hand_of_the_Cause_of_God,_Mr._William_Sears.jpg) · `media-speakers/william-sears/208619859b74d8b7.jpg`

### William Sutherland Maxwell

- **primary** · bahai.media · 1500×2100 · credit: media.bahai.org Bahá’í World News Service (#252) Bahá’í News. Issue 499, page 4. The Bahá’í World. Vol 12, page 659. The Bahá’í World. Vol 13, page 380. The Bahá’í World. Vol 14, page 451. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:William_Maxwell.jpg) · `media-speakers/william-sutherland-maxwell/771547ae28444b63.jpg`
- bahai.media · 748×1068 · credit: The Bahá’í World. Vol 12, page 109. · licence: From the Bahá’í Publications, by permission of the copyright owner, National Spiritual Assembly of the Bahá’ís of the United States © 1910-2021. · [source](https://bahai.media/File:William_Sutherland_Maxwell.png) · `media-speakers/william-sutherland-maxwell/4bcb7e1440f0b829.png`
- web · 1913 · 530×749 · credit: Wm. Notman & Son; McCord Stewart Museum II-197989 · licence: Public domain · [source](https://commons.wikimedia.org/wiki/File:William_Sutherland_Maxwell.jpg) · `media-speakers/william-sutherland-maxwell/9a1531ea092be5ec.jpg`

### Dhikru’lláh Khádem

- **primary** · current-primary · 592×795 · credit: — · [source](https://bahaipedia.org/Zikrullah_Khadem) · `media-speakers/zikrullah-khadem.png`
- youtube-still · 427×533 · credit: Video still: Wilmette Institute (YouTube) · licence: YouTube video frame (talk recording) · [source](https://www.youtube.com/watch?v=ZGj3AuAkKwI) · `media-speakers/zikrullah-khadem/6c6a0f5a3eb306cf.jpg`
- youtube-still · 426×533 · credit: Video still: Baha'i Perspective (YouTube) · licence: YouTube video frame (talk recording) · AI-extended 9:16 master · [source](https://www.youtube.com/watch?v=YCwPxvFDOY8) · `media-speakers/zikrullah-khadem/178fce2c90568110.jpg`
