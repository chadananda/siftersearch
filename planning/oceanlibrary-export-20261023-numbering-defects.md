# OceanLibrary export 23-Oct-2026: display-number defects

For Oleksandr (ILM). A display number (`num`) should be unique within its book. This report lists every number that more than one block of a book carries, and every opening invocation that carries a number. It was generated from the raw export by `api/lib/library/ol-display-ids.js` (`numberingDefects`). Every block id and snippet is listed in `oceanlibrary-export-20261023-numbering-defects.tsv`, which sits beside this file (12 MB).

## How blocks are classified

- **content**: an ordinary paragraph. Two content paragraphs sharing a number is the serious defect, because neither can be cited by its number.
- **source**: a citation line under a quotation, such as "(From a letter written on behalf of Shoghi Effendi…)", or a block with the class `.reference`. It should carry no number.
- **signature**: a closing or signature line, such as "Shoghi", "Your true brother," or "(signed) …". It should carry no number.
- **header**: a header block whose number repeats another block's number.
- **lead-in**: a short block carrying the SAME number as the paragraph after it, such as a salutation, an invocation, or a hadith reference ("H 1179, Ch. 110, h 1") followed by its chain. This is probably intended, as one numbered unit shown as two blocks. It is listed so you can confirm.
- **invocation**: an opening invocation ("In the name of…", "He is God") that carries a number. Some editions number it (Yusuf Ali's basmala, for example) and others do not. Please check each against the book's first publication.

## Totals

- Books in export: 627
- Books with at least one defect: 326
- Books whose content paragraphs collide: 142 (Bahá'í: 45 of 137)
- Content-paragraph collisions (two or more content paragraphs share one number): **10,888**
- Opening invocations carrying a number: **864**
- Header numbers colliding with another block: **6,886**
- Signature / closing lines carrying a number: **1,075**
- Source / citation lines carrying a number: **2,579**
- Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain): **11,844**

## A known specific defect

- **The Kitáb-i-Aqdas** (`kitab_i_aqdas_bahai_en`):
  - The invocation "In the name of Him Who is the Supreme Ruler…" (`bl2z`) is numbered `1`.
  - "The first duty prescribed by God…" (`bl30`) and "They whom God hath endued with insight…" (`bl31`) are both numbered `2`.
  - The 1992 edition leaves the invocation unnumbered, makes "The first duty…" ¶1 and "They whom God…" ¶2.
  - From "O ye peoples of the world!" (¶3) onward, the export matches the 1992 edition.

## Books, by severity

Books are ordered by content-paragraph collisions first, then by all other defects.

| # | book | bookid | content | invocation | header | signature | source | lead-in |
|---|---|---|---|---|---|---|---|---|
| 1 | Ṣaḥíḥ al-Bukhárí | `a_i_al_bukhari_islam_ocean_en` | 1997 | 0 | 0 | 0 | 4 | 123 |
| 2 | Kitab Al-Kafi 2 | `kitab_al_kafi_part_2_ocean_islam_en` | 1312 | 4 | 234 | 0 | 2 | 803 |
| 3 | Kitab Al-Kafi 6 | `kitabal_kafi_vol6_ocean_islam_en` | 1100 | 1 | 24 | 0 | 2 | 1417 |
| 4 | Kitab Al-Kafi 5 | `kitab_al_kafi_v5_of_8_ocean_islam_en` | 1042 | 2 | 307 | 0 | 3 | 837 |
| 5 | Bihar al-Anwaar Volume 4 | `bihar_al_anwaar_volume_4_islam_ocean_en` | 601 | 7 | 7 | 0 | 3 | 667 |
| 6 | Yashts | `yashts_zoroastrianism_ocean_en` | 460 | 0 | 19 | 0 | 0 | 101 |
| 7 | Kitab Al-Kafi 4 | `kitab_al_kafi_v4_ocean_islam_en` | 442 | 3 | 251 | 0 | 1 | 1337 |
| 8 | Messages to Canada | `messages_to_canada_baha_i_ocean_en` | 385 | 0 | 12 | 264 | 14 | 13 |
| 9 | Kitab Al-Kafi 7 | `kitab_al_kafi_vol7_ocean_islam_en` | 378 | 4 | 142 | 0 | 0 | 507 |
| 10 | Bihar al-Anwaar Volume 1 | `bihar_al_anwaar_volume_1_islam_ocean_en` | 340 | 0 | 3 | 18 | 4 | 432 |
| 11 | Bihar al-Anwaar Vol 2 | `bihar_al_anwaar_volume_2_islam_ocean_en` | 332 | 44 | 25 | 0 | 3 | 0 |
| 12 | Kitab Al-Kafi 1 | `kitab_al_kafi_part_1_ocean_islam_en` | 255 | 5 | 7 | 0 | 0 | 868 |
| 13 | The Beginning of Wisdom | `kabbalah_the_beginning_of_wisdom_judaism_ocean_en` | 181 | 0 | 0 | 0 | 1 | 27 |
| 14 | The Light of Divine Guidance (Volume I) | `light_of_divine_guidance_volume_1_ocean_en` | 180 | 0 | 0 | 33 | 80 | 188 |
| 15 | Uncompiled Published Letters | `published_uncompiled_letters_from_shoghi_effendi_b2a6b4c2e078beaa6f19ad12bc5c92b39` | 128 | 1 | 11 | 136 | 416 | 404 |
| 16 | Lights of Guidance | `lights_of_guidance_baha_i_ocean_en` | 127 | 0 | 42 | 1 | 1418 | 78 |
| 17 | The Book Of Mormon | `book_of_mormon_en` | 117 | 0 | 8 | 0 | 0 | 25 |
| 18 | Letters from the Guardian to Australia and New Zealand | `letters_to_australia_and_new_zealand_baha_i_ocean_8921a9228813de646299e8bf47d2d4ba` | 111 | 0 | 0 | 61 | 0 | 2 |
| 19 | Bahá’í Administration | `baha_i_administration_selected_messages_1922_1932_3521e4ac6904cefdca84fce2627329c7` | 79 | 1 | 48 | 26 | 0 | 20 |
| 20 | Kitab Al-Kafi 3 | `kitab_al_kafi_v3_ocean_islam_en` | 76 | 2 | 273 | 0 | 4 | 1352 |
| 21 | The Shahnama of Firdausi | `shahnameh_islam_ocean_en` | 70 | 0 | 4 | 0 | 0 | 35 |
| 22 | Sutra Collection (EFG) | `buddhasutra_efg_buddhism_ocean_en_en` | 65 | 0 | 23 | 0 | 0 | 19 |
| 23 | Sutra Collection (HIJK) | `sutra_collection_hijk_ocean_buddhism_en` | 56 | 0 | 65 | 0 | 0 | 4 |
| 24 | Unfolding Destiny | `unfolding_destiny_bahai_ocean_en` | 51 | 0 | 73 | 67 | 109 | 233 |
| 25 | Messages to the Indian Subcontinent | `messages_to_the_indian_subcontinent_en` | 47 | 1 | 56 | 2 | 0 | 167 |
| 26 | The Religious Ceremonies and Customs of the Parsees | `abandonment_or_absolute_surrender_en` | 47 | 0 | 14 | 0 | 0 | 0 |
| 27 | Messages to Canada | `messagestocanada_v2_bahai_ocean_en` | 40 | 0 | 50 | 324 | 16 | 238 |
| 28 | Book of Common Prayer [King's Chapel] | `book_of_common_prayer_king_s_chapel_cristianity_oca1f9382002c7fa23a00bfba7a67e3579` | 40 | 1 | 177 | 1 | 1 | 13 |
| 29 | Kalpa Sūtra | `kalpa_sutra_ocean_jainism_en` | 36 | 0 | 1 | 0 | 0 | 2 |
| 30 | Mūlamadhyamakakārikā | `nagarjuna_s_mulamadhyamakakarika_buddhism_ocean_en` | 36 | 0 | 0 | 1 | 0 | 1 |
| 31 | The Religion of the Sikhs | `religion_of_the_sikhs_en` | 31 | 1 | 0 | 0 | 5 | 17 |
| 32 | The Priceless Pearl | `the_priceless_pearl_baha_i_ocean_en` | 30 | 3 | 15 | 23 | 0 | 17 |
| 33 | A Modern Zoroastrian | `a_modern_zoroastrian_zoroastrian_ocean_en` | 30 | 0 | 14 | 0 | 0 | 2 |
| 34 | Black Yajur Veda | `black_yajurveda_ocean_hinduism_en` | 29 | 0 | 1 | 0 | 0 | 23 |
| 35 | Salat -The Muslim Prayer Book | `salat_the_muslim_prayer_book_islam_ocean_en` | 28 | 6 | 11 | 0 | 0 | 75 |
| 36 | آيات الهی جلد دوّم | `ayat_i_ilahi_jild_2_fa` | 27 | 12 | 25 | 0 | 0 | 0 |
| 37 | The Amitâyur-dhyâna-sûtra | `amitayurdhyana_sutra_buddhism_ocean_en` | 26 | 0 | 1 | 0 | 0 | 1 |
| 38 | Pahlavi Texts, Part II | `pahlavi_texts_part_ii_zoroastrianism_en` | 25 | 2 | 11 | 0 | 0 | 0 |
| 39 | Jaina Sutras Part I | `jaina_sutras_part_i_en` | 24 | 0 | 33 | 0 | 0 | 1 |
| 40 | Revival of Religious Learnings Vol-I | `revival_of_religious_sciences_v1_ocean_islam_en` | 22 | 0 | 22 | 0 | 0 | 43 |
| 41 | Kaushitaki Upanishad | `kaushtaki_upanishad_ocean_en` | 22 | 0 | 0 | 0 | 0 | 6 |
| 42 | The Texts of Taoism Part II | `test_taoism_part_ii_en` | 22 | 0 | 1 | 0 | 0 | 2 |
| 43 | Tablets of the Divine Plan | `tablets_of_the_divine_plan_bahai_ocean_en` | 19 | 10 | 1 | 0 | 0 | 3 |
| 44 | The Soul or Rational Psychology | `the_soul_or_rational_psychology_chistianity_ocean_f9c05033595f14a31e77eb71b662104c` | 19 | 0 | 4 | 0 | 0 | 48 |
| 45 | Sutra Collection (D) | `buddhasutra_d_buddhism_ocean_en` | 18 | 0 | 30 | 0 | 0 | 1 |
| 46 | Bahá’u’lláh and the New Era | `baha_u_llah_and_the_new_era_bahai_ocean_en` | 17 | 0 | 19 | 2 | 141 | 20 |
| 47 | The Yasna | `avesta_yasna_zoroastrianism_ocean_en` | 15 | 0 | 3 | 0 | 1 | 6 |
| 48 | Selections from the Writings of the Báb | `selections_from_the_writings_of_the_bab_bahai_en` | 13 | 9 | 7 | 0 | 40 | 0 |
| 49 | White Yajur Veda | `white_yajurveda_ocean_hinduism_en` | 13 | 0 | 1 | 0 | 0 | 2 |
| 50 | Fountain of Wisdom : Tablets of Bahá’u’lláh | `tablets_of_baha_u_llah_revealed_after_the_kitab_i_73dc612de775bf9a04f878e400a2ce69` | 12 | 4 | 6 | 0 | 0 | 6 |
| 51 | PALESTRAS DE ‘ABDU’L-BAHÁ | `palestras_de_abdu_l_baha_pt` | 12 | 0 | 9 | 0 | 0 | 37 |
| 52 | St. Augustine’s City of God and Christian Doctrine | `the_city_of_god_1_christianity_ocean_en` | 11 | 0 | 26 | 0 | 0 | 2 |
| 53 | The Call of the Divine Beloved | `the-call-of-the-divine-beloved_en` | 11 | 0 | 5 | 0 | 0 | 35 |
| 54 | Sutra Collection (C) | `buddhasutra_c_buddhism_ocean_en` | 10 | 0 | 29 | 0 | 0 | 18 |
| 55 | The Muqaddimah | `al_muqaddimah_ocean_islam_en` | 10 | 1 | 5 | 0 | 0 | 4 |
| 56 | The Mahabharata 12 | `mahabharata_12_hindu_ocean_en` | 10 | 0 | 4 | 0 | 0 | 0 |
| 57 | Munkidh min al-Dalal (Deliverance from Error) | `deliverance_from_error_islam_ocean_en` | 10 | 0 | 1 | 0 | 0 | 1 |
| 58 | Sutra Collection (B) | `buddhasutra_b_buddhism_ocean_en` | 9 | 0 | 15 | 0 | 0 | 58 |
| 59 | Sutra Collection (TU) | `sutra_collection_tu_ocean_buddhism_en` | 9 | 0 | 26 | 0 | 0 | 4 |
| 60 | Zohar Volume 1 | `kabbalah_zohar_judaism_ocean_en` | 9 | 0 | 1 | 0 | 0 | 0 |
| 61 | The Apocryphal Acts of Paul, Peter, John, Andrew and Thomas | `the_apocryphal_acts_deuterocanonical_christianity_64041fd8223b172c0534decb38a1ddf2` | 8 | 0 | 19 | 0 | 1 | 1 |
| 62 | The Babylonian Talmud | `the_babylonian_talmud_judaism_ocean_en` | 8 | 0 | 5 | 0 | 0 | 2 |
| 63 | Kitab al Khazari | `kitab_al_khazari_judaism_ocean_en` | 8 | 0 | 0 | 0 | 0 | 0 |
| 64 | Atharva Veda | `atharvaveda_hinduism_ocean_en` | 7 | 4 | 574 | 0 | 0 | 0 |
| 65 | Selections from al-Futuhat al-Makkiyya | `the_meccan_revelations_islam_ocean_en` | 7 | 0 | 1 | 0 | 79 | 30 |
| 66 | The Teachings of Zoroaster | `the_teachings_of_zoroaster_zoroastrian_ocean_en` | 7 | 0 | 3 | 0 | 0 | 41 |
| 67 | The Alawite Book | `alawi_prayers_islam_ocean_en` | 6 | 35 | 1 | 0 | 0 | 151 |
| 68 | The Light of Divine Guidance (Volume II) | `light_of_divine_guidance_volume_2_ocean_en` | 6 | 0 | 1 | 3 | 55 | 193 |
| 69 | Sutra Collection (RS) | `sutra_collection_rs_ocean_buddhism_en` | 6 | 0 | 69 | 1 | 0 | 14 |
| 70 | The Universal Tree and the Four Birds (Mystical Treatises) | `mystical_writings_islam_ocean_en` | 6 | 0 | 6 | 1 | 0 | 5 |
| 71 | Revival of Religious Learnings Vol-II | `revival_of_religious_sciences_vol_2_ocean_islam_en` | 5 | 0 | 10 | 0 | 0 | 53 |
| 72 | Kitab Al-Kafi 8 | `kitab_al_kafi_vol8_ocean_islam_en` | 5 | 1 | 4 | 0 | 0 | 28 |
| 73 | The National Spiritual Assembly | `the_national_spiritual_assembly_bahai_compilation_b925513a4f5ff7428891706712858edf` | 5 | 0 | 2 | 0 | 13 | 2 |
| 74 | Revival of Religious Learnings Vol-IV | `the_revival_of_religious_learning_vol4_islam_ocean50a36bcc2251e1182f42f2dfde95a466` | 5 | 0 | 1 | 0 | 0 | 34 |
| 75 | The Dawn-Breakers | `dawn-breakers-prod-version_en` | 5 | 0 | 7 | 0 | 1 | 0 |
| 76 | Memorials of the Faithful | `abdu-l-baha-memorials-of-the-faithful_en` | 5 | 0 | 1 | 0 | 0 | 3 |
| 77 | Call to the Nations | `call_to_the_nations_bahai_ocean_en` | 5 | 0 | 0 | 0 | 0 | 1 |
| 78 | The Mahabharata 1 | `mahabharata_1_hinduism_ocean_en` | 4 | 0 | 232 | 0 | 0 | 0 |
| 79 | Sutra Collection (S) | `sutracollection_s_ocean_buddhism_en` | 4 | 0 | 29 | 0 | 1 | 1 |
| 80 | Sutra Collection (M, Part-2) | `sutra_collection_m_part_2_ocean_buddhism_en` | 4 | 0 | 24 | 0 | 0 | 7 |
| 81 | The World Order of Bahá’u’lláh | `shoghi_effendi_world_order_of_baha_u_llah_ocean_en` | 4 | 0 | 8 | 0 | 0 | 1 |
| 82 | The Holy Qur-an (Yusuf Ali) | `the_holy_quran_tr_by_yusuf_ali_islam_ocean_en` | 3 | 9 | 113 | 0 | 0 | 106 |
| 83 | Summons of the Lord of Hosts | `summons_of_the_lord_of_hosts_bahai_en` | 3 | 5 | 2 | 0 | 0 | 0 |
| 84 | Pahlavi Texts, Part I | `pahlavi_texts_part_i_zoroastrianism_ocean_en` | 3 | 3 | 6 | 0 | 0 | 0 |
| 85 | Hayat Al-Qulub Vol.1 | `stories_of_the_prophets_vol_1_islam_ocean_en` | 3 | 3 | 1 | 0 | 0 | 1 |
| 86 | Tabernacle of Unity | `tabernacle_of_unity_bahai_en` | 3 | 2 | 6 | 0 | 0 | 0 |
| 87 | The Texts of Taoism Part I | `chuang_tse_taoism_ocean_en` | 3 | 0 | 6 | 0 | 0 | 2 |
| 88 | The Political Regime | `the_political_regime_al_farabi_islam_ocean_en` | 3 | 0 | 6 | 0 | 0 | 0 |
| 89 | A Compendium on the Soul | `ibn_sina_avicenna_islam_ocean_en` | 3 | 0 | 0 | 0 | 0 | 7 |
| 90 | The Story of Layla and Majnun | `layli_and_majnun_islam_ocean_en` | 3 | 0 | 1 | 0 | 0 | 2 |
| 91 | Bihar al-Anwaar Volume 3 | `bihar_al_anwaar_volume_3_islam_ocean_en` | 2 | 105 | 12 | 1 | 0 | 6 |
| 92 | Dawn of a New Day | `dawn_of_a_new_day_ocean_en` | 2 | 0 | 74 | 9 | 104 | 0 |
| 93 | Fire and Light | `fire_and_light_baha_i_ocean_en` | 2 | 13 | 6 | 0 | 0 | 0 |
| 94 | Âkârâṅga Sûtra | `akaranga_sutra_ocean_jainism_en` | 2 | 0 | 8 | 9 | 0 | 1 |
| 95 | Sutra Collection (A, Part-2) | `buddhasutra_a_part_2_ocean_buddhism_en` | 2 | 0 | 0 | 0 | 0 | 40 |
| 96 | The Confessions of Al Ghazzali | `the_confessions_of_al_ghazzali_ocean_en` | 2 | 1 | 3 | 0 | 0 | 0 |
| 97 | Divine Philosophy | `abdu_l_baha_on_divine_philosophy_bahai_ocean_en` | 2 | 1 | 2 | 0 | 0 | 0 |
| 98 | Copy-The Kitáb-I-Íqán 06.08 | `the_brothers_karamazov_ffa_en` | 2 | 1 | 0 | 0 | 0 | 0 |
| 99 | The Call of Kumayl | `du_a_kumayl_islam_ocean_en` | 2 | 1 | 0 | 0 | 0 | 0 |
| 100 | Pearl of Great Price | `pearl_of_great_price_christianity_ocean_en` | 2 | 0 | 3 | 0 | 0 | 0 |
| 101 | The Mahabharata 13 | `mahabharata_13_hindu_ocean_en` | 2 | 0 | 3 | 0 | 0 | 0 |
| 102 | The Rámáyan of Válmíki | `ramaya_a_hinduism_ocean_en` | 2 | 0 | 2 | 0 | 0 | 0 |
| 103 | Rig Veda. Book 1 | `rigveda_1_hindu_ocean_en` | 2 | 0 | 0 | 0 | 1 | 0 |
| 104 | The Advent of Divine Justice | `advent_of_divine_justice_v2_ocean_baha_i_en` | 2 | 0 | 0 | 1 | 0 | 0 |
| 105 | The Persian Mystics. Jalálu’d-dín Rúmí | `persian_mystics_ocean_en` | 2 | 0 | 0 | 0 | 0 | 0 |
| 106 | مكاتيب عبدالبهاء جلد اول | `makatib_abd_v1_fa` | 1 | 3 | 132 | 0 | 0 | 0 |
| 107 | Tahafut Al-Tahafut (The Incoherence of the Incoherence) | `ibn_rushd_s_tahafut_al_tahafut_islam_ocean_en` | 1 | 1 | 3 | 0 | 0 | 418 |
| 108 | Messages to the Bahá’í World postponed | `messages_to_the_baha_i_world_1950_1957_bahai_oceaneaa3dac48b2d9723140635f2b51a605a` | 1 | 0 | 85 | 0 | 0 | 0 |
| 109 | The Promised Mahdi, Part I | `the_promised_mahdi_part_1_islam_ocean_en` | 1 | 1 | 36 | 0 | 0 | 0 |
| 110 | Hayat Al-Qulub Vol.3 | `hayat_al_qulub_vol_3_islam_ocean_en` | 1 | 0 | 3 | 0 | 0 | 145 |
| 111 | A History of Indian Philosophy Volume I | `history_of_indian_philosophy_volume_en` | 1 | 0 | 27 | 0 | 0 | 0 |
| 112 | Chinese Literature | `chineseliterature_en` | 1 | 0 | 20 | 0 | 0 | 0 |
| 113 | Sutra Collection (M, Part-1) | `sutra_collection_m_part_1_ocean_buddhism_en` | 1 | 0 | 16 | 0 | 0 | 2 |
| 114 | Japan Will Turn Ablaze! | `japan_will_turn_ablaze_baha_i_ocean_en` | 1 | 0 | 15 | 0 | 0 | 1 |
| 115 | Bahá’í Burial | `bahai_burial_bahai_ocean_en` | 1 | 0 | 3 | 0 | 10 | 0 |
| 116 | Revival of Religious Learnings Vol-III | `revival_of_religious_sciences_v_3_ocean_islam_en` | 1 | 0 | 11 | 0 | 0 | 2 |
| 117 | Epistle to the Son of the Wolf | `epistle_to_the_son_of_the_wolf_bahai_en` | 1 | 2 | 1 | 0 | 0 | 0 |
| 118 | Avesta - Selections | `avesta_selections_ocean_zoroastrianism_en` | 1 | 0 | 9 | 0 | 0 | 0 |
| 119 | The Mahabharata 7 | `mahabharata_7_hindu_ocean_en` | 1 | 0 | 5 | 0 | 2 | 0 |
| 120 | A Traveler’s Narrative | `abdu-l-baha-traveler-s-narrative-ocean_en` | 1 | 1 | 1 | 0 | 0 | 1 |
| 121 | Scroll of Wisdom | `pand_nameh_islam_ocean_en` | 1 | 1 | 1 | 0 | 0 | 1 |
| 122 | The Secret of Divine Civilization | `abdu_l_baha_secret_of_divine_civilization_ocean_en` | 1 | 1 | 1 | 0 | 0 | 0 |
| 123 | The Kitáb-i-Aqdas | `kitab_i_aqdas_bahai_en` | 1 | 1 | 1 | 0 | 0 | 0 |
| 124 | Seleção dos Escritos de ‘Abd'u’l-bahá | `selecao_dos_escritos_de_abdu_l_baha_pt` | 1 | 0 | 6 | 0 | 0 | 0 |
| 125 | Selections from the Writings of ‘Abdu’l-Bahá | `selections_from_the_writings_of_the_abdu_l_baha_en` | 1 | 1 | 0 | 0 | 0 | 3 |
| 126 | The Guide for The Perplexed | `a_guide_for_the_perplexed_judaism_ocean_en` | 1 | 0 | 4 | 0 | 0 | 0 |
| 127 | Crisis and Victory | `crisis_and_victory_bahai_ocean_en` | 1 | 0 | 0 | 0 | 3 | 0 |
| 128 | Paris Talks | `abdu-l-baha-paris-talks_en` | 1 | 0 | 1 | 0 | 0 | 8 |
| 129 | The Philosophy and Theology | `ibn_rushd_averroes_islam_ocean_en` | 1 | 0 | 3 | 0 | 0 | 0 |
| 130 | Issues Related to the Study of the Bahá'í Faith | `issues_related_to_the_study_of_the_baha_i_faith_oc7169d422fc6c75c3a64bc1c50c1bb7cc` | 1 | 0 | 0 | 0 | 0 | 10 |
| 131 | Qabbalah: Writings of Solomon The Philosophical Writings of Solomon Ben Yehudah Ibn Gebirol | `qabbalah_writings_of_solomon_ibn_gebirol_judaism_oe99e8ee3898c494b58a7a1dcabf8e138` | 1 | 0 | 1 | 0 | 1 | 2 |
| 132 | The Dawn-Breakers | `dawn_breakers_temporary_copy_en` | 1 | 0 | 1 | 0 | 1 | 0 |
| 133 | Jerusalem Volume 2 | `jerusalem_volume_2_bahai_ocean_en` | 1 | 0 | 1 | 0 | 0 | 4 |
| 134 | Visparad | `avesta_visperad_ocean_zoroastrianism_en` | 1 | 0 | 1 | 0 | 0 | 0 |
| 135 | Bahá’í Funds and Contributions | `bahai_funds_ocean_compilation_ocean_en` | 1 | 0 | 0 | 0 | 1 | 0 |
| 136 | Sahih Muslim (Book 26-32) | `sahih_muslim_books26to32_islam_ocean_en` | 1 | 0 | 1 | 0 | 0 | 0 |
| 137 | Buddhacarita | `life_of_buddha_ocean_buddhism_en` | 1 | 0 | 1 | 0 | 0 | 0 |
| 138 | Sahih Muslim (Book  1) | `sahih_al_muslim_vol_1_islam_ocean_en` | 1 | 0 | 0 | 0 | 0 | 0 |
| 139 | Sahih Muslim (Book 19-25) | `sahihmuslim_books19to25_islam_ocean_en` | 1 | 0 | 0 | 0 | 0 | 0 |
| 140 | Poems from the Divan of Hafiz | `divan_islam_ocean_en` | 1 | 0 | 0 | 0 | 0 | 0 |
| 141 | Ibn Sina, Abu 'Ali al-Husayn (980-1037) | `miscellaneous_islam_ocean_en` | 1 | 0 | 0 | 0 | 0 | 0 |
| 142 | The Sutta Nipata | `suttanipata_en` | 1 | 0 | 0 | 0 | 0 | 0 |
| 143 | Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1-3 | `tablets_of_abdu_l_baha_abbas_v1_3_bahai_ocean_en` | 0 | 2 | 749 | 0 | 1 | 4 |
| 144 | The Qur'an (Rodwell) | `quran_ocean_islam_en` | 0 | 116 | 4 | 0 | 0 | 1 |
| 145 | The Qur’ân (Palmer) | `quran_by_palmer_islam_ocean_en` | 0 | 114 | 0 | 0 | 0 | 0 |
| 146 | مكاتيب عبدالبهاء الجزء الثالث | `makatib_abd_3_fa` | 0 | 86 | 5 | 0 | 0 | 0 |
| 147 | Bihar al-Anwaar Volume 8 | `bihar_al_anwaar_volume_8_islam_ocean_en` | 0 | 62 | 1 | 0 | 0 | 1 |
| 148 | Bihar al-Anwaar Volume 6 | `bihar_al_anwaar_volume_6_islam_ocean_en` | 0 | 58 | 4 | 0 | 0 | 0 |
| 149 | Summa Theologica | `summa_theologica_pars_prima_secundae_treatise_on_la653b2090af2b5e21f611a288fab7c60` | 0 | 0 | 191 | 0 | 0 | 0 |
| 150 | This Decisive Hour | `this_decisive_hour_messages_to_america_1932_1946_b297e9a0235499a7665114820e0eb2017` | 0 | 0 | 164 | 0 | 0 | 0 |
| 151 | Deepening | `deepening_compilation_ocean_en` | 0 | 0 | 153 | 0 | 7 | 0 |
| 152 | Bahá’í Prayers | `baha_i_prayers_bahai_ocean_en` | 0 | 14 | 6 | 83 | 0 | 3 |
| 153 | Bahá’í Sacred Writings | `baha_i_sacred_writings_en` | 0 | 1 | 104 | 0 | 0 | 0 |
| 154 | Dear Co-worker (Messages to the Benelux countries) | `messages_to_latin_america_baha_i_ocean_en` | 0 | 0 | 107 | 0 | 0 | 0 |
| 155 | مكاتيب حضرت عبدالبهاء  جلد ٢ | `makatib_i_hadrat_i_abdu_l_baha_jild_2_fa` | 0 | 0 | 105 | 0 | 0 | 0 |
| 156 | Citadel of Faith. Messages to America 1947-1957 | `citadel_of_faith_messages_to_america_1947_1957_en` | 0 | 0 | 83 | 0 | 0 | 0 |
| 157 | Messages to the Bahá’í World | `messages_to_the_bahai_world_new_edition_ocean_en` | 0 | 0 | 82 | 0 | 0 | 0 |
| 158 | Arohanui | `arohanui_letters_to_new_zealand_baha_i_ocean_en` | 0 | 0 | 81 | 0 | 0 | 0 |
| 159 | Social Action | `social_action_ocean_en` | 0 | 0 | 76 | 0 | 0 | 0 |
| 160 | The Cloud of Unknowing | `cloud_of_unknowing_christianity_en` | 0 | 0 | 75 | 0 | 0 | 0 |
| 161 | ألواح الخطّة الإلهيّة | `alwah_ul_khitta_al_ilahiya_new_ar` | 0 | 14 | 2 | 0 | 0 | 0 |
| 162 | Additional Tablets and Extracts from Tablets Revealed by Bahá’u’lláh | `additional_tablets_and_extracts_bahai_ocean_en` | 0 | 13 | 0 | 0 | 0 | 0 |
| 163 | I Ching | `i_ching_confucianism_ocean_en` | 0 | 0 | 64 | 0 | 0 | 0 |
| 164 | Dīghanikāya: Long Discourses | `digha_nikaya_the_long_discourses_of_the_buddha_oce34d6013d3e9976d7693ba158a056b8e3` | 0 | 0 | 61 | 0 | 0 | 0 |
| 165 | Living the Life | `living_the_life_bahai_ffa_en` | 0 | 0 | 56 | 0 | 0 | 0 |
| 166 | Sutra Collection (A, Part-1) | `budhist_sutra_part_a_ocean_buddhism_en` | 0 | 0 | 47 | 0 | 2 | 25 |
| 167 | Sutra Collection (N,O,P) | `sutra_collection_nop_ocean_buddhism_en` | 0 | 0 | 51 | 0 | 0 | 12 |
| 168 | The Standard Prayer Book | `siddur_machzor_judaism_ocean_en` | 0 | 0 | 52 | 0 | 0 | 1 |
| 169 | Scholarship | `scholarship_bahai_ocean_en` | 0 | 0 | 37 | 0 | 6 | 0 |
| 170 | Prayers of ‘Abdu’l-Bahá | `prayers_revealed_by_abdu_l_baha_bahai_ocean_en` | 0 | 8 | 0 | 0 | 0 | 1 |
| 171 | Additional Prayers Revealed by Bahá’u’lláh | `additional-prayers-revealed-by-baha-u-llah_en` | 0 | 8 | 0 | 0 | 0 | 0 |
| 172 | Pahlavi Texts, Part IV | `pahlavi_texts_part_iv_zoroastrianism_ocean_en_en` | 0 | 1 | 34 | 0 | 0 | 1 |
| 173 | Directives from the Guardian | `directives_from_the_guardian_en` | 0 | 0 | 35 | 0 | 0 | 0 |
| 174 | The Meaning of the Glorious Qur’án (Pickthall) | `the-qur-an_en` | 0 | 6 | 0 | 0 | 0 | 0 |
| 175 | The Incoherence of the Philosophers | `incoherence_of_the_philosophers_islam_ocean_en` | 0 | 1 | 24 | 0 | 0 | 3 |
| 176 | Sutra Collection (VY) | `sutra_collection_vy_ocean_buddhism_en` | 0 | 0 | 27 | 0 | 0 | 9 |
| 177 | Uttaradhyayana | `uttaradhyayana_ocean_jainism_en` | 0 | 0 | 27 | 0 | 0 | 2 |
| 178 | God Passes By | `god_passes_by_ocean_en` | 0 | 0 | 25 | 0 | 0 | 0 |
| 179 | Sûtrakritâṅga | `sutrakrtanga_ocean_jainism_en` | 0 | 0 | 21 | 0 | 1 | 10 |
| 180 | The Power of Divine Assistance | `the_power_of_divine_assistance_bahai_ocean_en` | 0 | 0 | 17 | 0 | 4 | 0 |
| 181 | The Promised Mahdi, Part II | `the_promised_mahdi_partii_islam_ocean_en` | 0 | 3 | 6 | 0 | 0 | 0 |
| 182 | البيان العربي | `arabic_bayan_ar` | 0 | 2 | 11 | 0 | 0 | 0 |
| 183 | The Awakening of the Soul | `awakening_of_the_soul_en` | 0 | 0 | 20 | 1 | 0 | 0 |
| 184 | The Gulistan of Sa’di | `gulistan_islam_ocean_en` | 0 | 0 | 21 | 0 | 0 | 0 |
| 185 | Additional Prayers Revealed by ‘Abdu’l-Bahá | `additional-prayers-revealed-by-abdu-l-baha_en` | 0 | 4 | 0 | 0 | 0 | 0 |
| 186 | Shri Guru Granth Sahib Volume 3 | `shri_guru_granth_sahib_volume_3_en` | 0 | 4 | 0 | 0 | 0 | 0 |
| 187 | The Analects | `theanalects_ocean_confucius_en` | 0 | 0 | 20 | 0 | 0 | 0 |
| 188 | Vendīdād | `avesta_vendidad_zoroastrianism_ocean_en` | 0 | 0 | 17 | 0 | 0 | 0 |
| 189 | Prayer and Devotional Life | `prayer_and_devotional_life_ocean_en` | 0 | 0 | 17 | 0 | 0 | 0 |
| 190 | Ḥuqúqu’lláh — The Right of God | `uququ_llah_the_right_of_god_ocean_en` | 0 | 0 | 17 | 0 | 0 | 0 |
| 191 | The Li Ki Part I | `li_ki_part_i_en` | 0 | 0 | 16 | 0 | 0 | 0 |
| 192 | Shri Guru Granth Sahib Volume 1 | `shri_guru_granth_sahib_volume_1_en` | 0 | 2 | 6 | 0 | 0 | 0 |
| 193 | RESPOSTAS A ALGUMAS PERGUNTAS | `respostas_a_algumas_perguntas_pt` | 0 | 0 | 14 | 0 | 0 | 0 |
| 194 | Sutra Collection (L) | `sutra_collection_l_ocean_buddhism_en` | 0 | 0 | 13 | 0 | 0 | 2 |
| 195 | “By the Fig and the Olive” ‘Abdu’l-Bahá’s Commentary in Ottoman Turkish on the Qur’ánic Sura 95 | `by_fig_and_olive_abdu_l_baha_s_commentary_sura_95_ca44c9552f2257275814069351152859` | 0 | 2 | 3 | 0 | 0 | 0 |
| 196 | Hymns of the Samaveda | `samaveda_hinduism_ocean_en` | 0 | 0 | 13 | 0 | 0 | 0 |
| 197 | The Qur’an Commentary of Sayyid ‘Alí Muhammad, the Báb: Doctoral Dissertation | `the_qur_an_commentary_of_sayyid_ali_muhammad_the_b9786d3192fbeba2c78776b3f284cf841` | 0 | 0 | 13 | 0 | 0 | 0 |
| 198 | Rig Veda. Book 10 | `rigveda_10_hindu_ocean_en` | 0 | 0 | 12 | 0 | 0 | 0 |
| 199 | Bahá’í World Faith (‘Abdu’l-Bahá section) | `baha_i_world_faith_en` | 0 | 1 | 7 | 0 | 0 | 0 |
| 200 | The Mahabharata 3 | `mahabharata_3_hinduism_ocean_en` | 0 | 0 | 11 | 0 | 0 | 0 |
| 201 | The Mahabharata 2 | `mahabharata_2_hinduism_ocean_en` | 0 | 0 | 11 | 0 | 0 | 0 |
| 202 | Hayat Al-Qulub Vol.2 | `hayat_al_qulub_vol_2_islam_ocean_en` | 0 | 1 | 5 | 0 | 0 | 1 |
| 203 | Avicenna: His Life and Works | `avicenna_his_life_and_works_islam_ocean_en` | 0 | 0 | 9 | 1 | 0 | 1 |
| 204 | Shri Guru Granth Sahib Volume 2 | `shri_guru_granth_sahib_volume_2_en` | 0 | 2 | 0 | 0 | 0 | 0 |
| 205 | Some Answered Questions | `some-answered-questions-prod-version_en` | 0 | 0 | 9 | 0 | 0 | 0 |
| 206 | Additional Tablets, Extracts and Talks | `abdu_l_baha_additional_tablets_extracts_and_talks_430a4c77afa01f6eb5e4f2c4028e655d` | 0 | 0 | 0 | 0 | 0 | 33 |
| 207 | The Institution of the Mashriqu’l-Adhkár | `the_institution_of_the_mashriqu_l_adhkar_ocean_en` | 0 | 0 | 8 | 0 | 0 | 0 |
| 208 | Peace | `peace_compilation_bahai_ocean_en` | 0 | 0 | 8 | 0 | 0 | 0 |
| 209 | Pahlavi Texts, Part III | `pahlavi_texts_part_iii_zoroastrianism_ocean_en_en` | 0 | 1 | 3 | 0 | 0 | 0 |
| 210 | Statement to the Special U.N. Committee on Palestine, 1947 | `special_un_committee_on_palestine_1947_bahai_ocean11ae336bb52626b3cf292e0e8c2e4461` | 0 | 0 | 8 | 0 | 0 | 0 |
| 211 | A Treatise On Jainism | `treatise_on_jainism_janaism_ocean_en` | 0 | 0 | 7 | 0 | 0 | 2 |
| 212 | Days of Remembrance | `days_of_remembrance_ocean_en` | 0 | 0 | 7 | 0 | 0 | 0 |
| 213 | The Gospel of Buddha | `gospel_of_buddha_en` | 0 | 0 | 7 | 0 | 0 | 0 |
| 214 | The Yoga Sutras of Patanjali | `yoga_sutras_of_patanjali_gutenberg_hinduism_ocean_40d450a643f725b9e4e909c3d70dfe6e` | 0 | 1 | 2 | 0 | 0 | 0 |
| 215 | The Improvement of Human Reason | `the_improvement_of_human_reason_islam_ocean_en` | 0 | 1 | 1 | 0 | 0 | 2 |
| 216 | Centres of Bahá’í Learning | `centres_of_bahai_learning_bahai_ocean_en` | 0 | 0 | 4 | 0 | 2 | 1 |
| 217 | The Promulgation of Universal Peace | `promulgation_of_universal_peace_ocean_en` | 0 | 0 | 1 | 0 | 5 | 1 |
| 218 | Rig Veda. Book 4 | `rig_veda_4_hinduism_ocean_en` | 0 | 1 | 1 | 0 | 0 | 0 |
| 219 | Buddhist Prayers | `buddhist_prayers_buddhism_ocean_en` | 0 | 0 | 1 | 5 | 0 | 0 |
| 220 | Commentary on the Surah of the Sun | `commentary_on_the_surah_of_the_sun_bahai_ocean_en` | 0 | 1 | 0 | 0 | 1 | 0 |
| 221 | The Rosenberg Tablet | `the_rosenberg_tablet_bahai_ocean_en` | 0 | 1 | 1 | 0 | 0 | 0 |
| 222 | Psalms | `psalms-ot_en` | 0 | 1 | 0 | 0 | 0 | 2 |
| 223 | The Bustan of Saadi | `the_bustan_of_sadi_islam_ocean_en` | 0 | 1 | 0 | 0 | 0 | 1 |
| 224 | 2 Samuel | `9-samuel-2-ot_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 225 | Job | `job-ot_en_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 226 | The Mahabharata 6 | `mahabharata_6_hindu_ocean_en` | 0 | 0 | 5 | 0 | 0 | 0 |
| 227 | Feast | `feast_bahai_compilation_ocean_en` | 0 | 0 | 4 | 0 | 1 | 0 |
| 228 | Rig Veda. Book 3 | `rigveda_3_hinduism_ocean_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 229 | 1 Chronicles | `38-chronicles-1-ot_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 230 | Deuteronomy | `deuteronomy-ot_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 231 | Sura LV. The Merciful | `sura_lv_the_merciful_quran_ocean_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 232 | To Set the World in Order: Building and Preserving Strong Marriages | `to_set_the_world_in_order_ocean_en` | 0 | 0 | 5 | 0 | 0 | 0 |
| 233 | Divrei Yamim A (Book of I Chronicles) | `hebrewbible_1_chronicles_judaism_ocean_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 234 | Tehillim (Psalms) | `ketuvim_jps_1917_hallel_psalms_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 235 | Eyov (Book of Job) | `ketuvim_jps_1917_iyov_job_en_en` | 0 | 1 | 0 | 0 | 0 | 0 |
| 236 | ‘Abdu’l-Bahá’s Commentary on the Quránic Verses concerning the Overthrow of the Byzantines: The Stages of the Soul | `abdu_l_baha_s_commentary_qur_anic_verses_overthrow10fed145a1e79efbad132092d6fc1f31` | 0 | 1 | 0 | 0 | 0 | 0 |
| 237 | The Seven Valleys and the Four Valleys | `the_seven_valleys_and_the_four_valleys_bahai_ocean57d037872745fcdc2d5688ad19afa952` | 0 | 1 | 0 | 0 | 0 | 0 |
| 238 | Additional Taoist Texts | `additional_taoist_texts_en` | 0 | 0 | 4 | 0 | 0 | 2 |
| 239 | Original Hebrew of a Portion of Ecclesiasticus | `original_hebrew_of_ecclesiasticus_judaism_ffa_en` | 0 | 0 | 4 | 0 | 0 | 2 |
| 240 | 2500 Adages of Imam Ali | `adages_islam_ocean_en` | 0 | 0 | 1 | 0 | 0 | 13 |
| 241 | The Mahabharata 5 | `mahabharata_5_hindu_ocean_en` | 0 | 0 | 4 | 0 | 0 | 0 |
| 242 | The Mahabharata 15 | `mahabharata_15_hindu_ocean_en` | 0 | 0 | 4 | 0 | 0 | 0 |
| 243 | Bahá’í Meetings | `bahai_meetings_ocean_en` | 0 | 0 | 4 | 0 | 0 | 0 |
| 244 | Stories of the Prophets | `al_anbiya_islam_ocean_en` | 0 | 0 | 4 | 0 | 0 | 0 |
| 245 | The Li Ki Part II | `sacred_books_of_china_part_iv_li_ki_en` | 0 | 0 | 4 | 0 | 0 | 0 |
| 246 | Selected Aphorisms And Other Texts | `selected_aphorisms_and_other_texts_of_al_farabi_is1b91d18247d10de64e348918356a2bc0` | 0 | 0 | 4 | 0 | 0 | 0 |
| 247 | Messages to America | `messages_to_america_new_ocean_en` | 0 | 0 | 1 | 0 | 0 | 11 |
| 248 | Taittriyaka Upanishad | `taittriyaka_upanishad_ocean_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 249 | The Mahabharata 9 | `mahabharata_9_hindu_ocean_en` | 0 | 0 | 1 | 0 | 2 | 0 |
| 250 | Guidelines for Teaching | `guidelines_for_teaching_bahai_compilation_ocean_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 251 | The Importance of Obligatory Prayer and Fasting | `the_importance_of_obligatory_prayer_and_fasting_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 252 | Heaven and Hell | `heaven_and_hell_christianity_ocean_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 253 | Kabbalah Neerav | `kabbalah_neerav_ocean_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 254 | The Shu King or Book of Historical Documents | `sacred_books_of_china_the_shu_king_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 255 | Songs of Kabîr | `songs_of_kabir_hinduism_ocean_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 256 | The Ethics | `the_ethics_spinoza_ocean_judaism_en` | 0 | 0 | 3 | 0 | 0 | 0 |
| 257 | The Mahabharata 11 | `mahabharata_11_hindu_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 258 | The Mahabharata 14 | `mahabharata_14_hindu_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 259 | Bahá’í Education | `bahai_education_bahai_ocean_en` | 0 | 0 | 0 | 0 | 2 | 0 |
| 260 | Cultural Diversity in the Age of Maturity | `cultural_diversity_in_the_age_of_maturity_bahai_oc2420aa5bec9cdd33e3cc4f85438b734b` | 0 | 0 | 2 | 0 | 0 | 0 |
| 261 | Excellence in All Things | `excellence_in_all_things_bahai_compilation_ocean_eec37e97a93bd0732649e9012049867ee` | 0 | 0 | 2 | 0 | 0 | 0 |
| 262 | Health and Healing | `health_and_healing_bahai_compilation_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 263 | Opposition | `opposition_bahai_compilation_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 264 | The Importance of Prayer, Meditation and the Devotional Attitude | `prayer_meditation_and_the_devotional_attitude_baha6cc9efb4fb5e8323effff4c4fb388976` | 0 | 0 | 1 | 0 | 1 | 0 |
| 265 | Preserving Bahá’í Marriages | `preserving_bahai_marriages_bahai_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 266 | Doctrine and Covenants | `doctrine_and_covenants_christianity_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 267 | The Mahabharata 10 | `mahabharata_10_hindu_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 268 | The Mahabharata 4 | `mahabharata_4_hindu_ocean_en` | 0 | 0 | 1 | 0 | 0 | 4 |
| 269 | Arem 09.2023 | `arem_sprint_159_audio_import_2_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 270 | A Proclamação de BAHÁ´U´LLÁH  AOS REIS E LÍDERES DO MUNDO | `a_proclamacao_de_baha_u_llah_pt` | 0 | 0 | 2 | 0 | 0 | 0 |
| 271 | Aitareya-Āraṇyaka | `aitareya_ara_yaka_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 272 | Bahá‘u’lláh as fulfilment of the theophanic promise in the Sermons of Imam ‘Alí ibn Abí Ṭálib | `sermons_of_imam_ali_islam_ocean_en` | 0 | 0 | 2 | 0 | 0 | 0 |
| 273 | The Alchemy Of Happiness | `the_alchemy_of_happiness_islam_ocean_en` | 0 | 0 | 1 | 0 | 0 | 3 |
| 274 | Mencius | `mencius_confucius_ocean_en` | 0 | 0 | 1 | 0 | 0 | 2 |
| 275 | Buddha, Krishna, Zoroaster and Related Subjects | `buddha_krishna_zoroaster_and_related_subjects_bahaacbeb81f0f09b1cf7593df29248d5f4b` | 0 | 0 | 1 | 0 | 0 | 1 |
| 276 | ‘Abdu’l-Bahá in London | `abdu_l_baha_in_london_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 1 |
| 277 | Autobiography of a Yogi | `autobiography_of_a_yogi_en` | 0 | 0 | 1 | 0 | 0 | 1 |
| 278 | Jerusalem: A Treatise On Ecclesiastical Authority And Judaism | `jerusalem_volume_1_judaism_ocean_en` | 0 | 0 | 0 | 1 | 0 | 1 |
| 279 | Light of the World | `light_of_the_world_baha_i_ocean_en` | 0 | 0 | 1 | 0 | 0 | 1 |
| 280 | The Promised Day is Come | `the_promised_day_is_come_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 1 |
| 281 | Bel and the Dragon | `bel_and_the_dragon_deuterocanocical_christianity_o218cf85c97f89bac5055430ad2efd9be` | 0 | 0 | 1 | 0 | 0 | 0 |
| 282 | Prayer of Azariah | `prayer_of_azariah_deuterocanonical_christianity_ocaf1dfe08bd2d8430deec1ad6a7872004` | 0 | 0 | 1 | 0 | 0 | 0 |
| 283 | Mundaka-Upanishad | `mundaka_upanishad_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 284 | The Mahabharata 17 | `mahabharata_17_hindu_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 285 | The Mahabharata 18 | `mahabharata_18_hindu_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 286 | The Mahabharata 8 | `mahabharata_8_hindu_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 287 | A Chaste and Holy Life | `a_chaste_and_holy_life_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 288 | Family Life | `family_life_bahai_compilation_ocean_en` | 0 | 0 | 0 | 0 | 1 | 0 |
| 289 | Music | `music_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 290 | Prohibition of Intoxicating Drinks | `prohibition_of_intoxicating_drinks_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 291 | The Nineteen Day Feast | `the_nineteen_day_feast_bahai_compilation_ocean_en` | 0 | 0 | 0 | 0 | 1 | 0 |
| 292 | The Sanctity and Nature of Bahá’í Elections | `the_sanctity_and_nature_of_bahai_elections_bahai_cf8591a44573db188858eceea36b50f7d` | 0 | 0 | 0 | 0 | 1 | 0 |
| 293 | Nyayish | `nyayish_zoroastrianism_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 294 | Rig Veda. Book 5 | `rig_veda_5_ocean_hinduism_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 295 | Rig Veda. Book 6 | `rig_veda_6_ocean_hindu_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 296 | Rig Veda. Book 7 | `rigveda_7_ocean_hinduism_no_audio_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 297 | Arem book | `arem_sprint_162_alt_tag_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 298 | Torah - Vayikra (Leviticus) | `torah_vayikra_judaism_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 299 | The Will and Testament of ‘Abdu’l-Bahá | `abdu-l-baha-the-will-and-testament_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 300 | آيات الهی  جلد اوّل | `ayat_i_ilahi_jild_1_fa` | 0 | 0 | 1 | 0 | 0 | 0 |
| 301 | The Doctrine of the Mean | `doctrine_of_the_mean_confucian_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 302 | Haggadah for Pesach | `haggada_for_pesach_judaism_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 303 | Jaina Sutras Part II | `jaina_sutras_part_ii_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 304 | الكلمات المكنونة | `kalamat_maknuneh_arabic_ar` | 0 | 0 | 1 | 0 | 0 | 0 |
| 305 | The Kitáb-i-Íqán | `kitab-i-iqan-prod-version_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 306 | مكاتيب عبدالبهاء جلد چهارم | `makatib_i_hadrat_i_abdu_l_baha_jild_4_fa` | 0 | 0 | 1 | 0 | 0 | 0 |
| 307 | مکاتيب عبدالبهآء جلد پنجم | `makatib_i_hadrat_i_abdu_l_baha_jild_5_fa` | 0 | 0 | 1 | 0 | 0 | 0 |
| 308 | مكاتيب عبدالبهاء جلد هشتم | `makatib_i_hadrat_i_abdu_l_baha_jild_8_fa` | 0 | 0 | 1 | 0 | 0 | 0 |
| 309 | مناجاة | `munajat_ar` | 0 | 0 | 1 | 0 | 0 | 0 |
| 310 | نداء رب الجنود | `neda_rabul_jonood_fa` | 0 | 0 | 1 | 0 | 0 | 0 |
| 311 | The Hsiao King or Classic of Filial Piety | `sacred_books_of_china_hsiao_king_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 312 | The Shih King or Book of Poetry | `sacred_books_of_china_the_shih_king_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 313 | Salaman and Absal | `salaman_and_absal_islam_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 314 | Selected Religious Poems | `selected_religious_poems_of_solomon_ibn_gabirol_ju73debe30d5673d28a1980af775f26eb3` | 0 | 0 | 1 | 0 | 0 | 0 |
| 315 | The Shorter Sukhâvatî-vyûha | `short_sukhavativyuha_sutra_amitabha_sutra_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 316 | Tablets to the Hague | `tablets_to_the_hague_new_editon_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 317 | Taoist Prayers | `taoist_prayers_ocean_taoism_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 318 | The World Religion : Letter of June 1933 to the High Commissioner of Palestine | `the_baha_i_faith_the_world_religion_bahai_ocean_en` | 0 | 0 | 1 | 0 | 0 | 0 |
| 319 | Sahih Muslim (Book  8) | `sahih_muslim_book_8_islam_ocean_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 320 | The Chicago-Prashnottar | `chicago_prashnottar_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 321 | Constitution of Medina (Dustur al-Medinah) | `dustur_al_madinah_ocean_islam_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 322 | Musings of a Chinese Mystic | `musings_of_a_chinese_mystic_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 323 | Pahlavi Texts, Part V | `pahlavi_texts_part_v_zoroastrian_ocean_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 324 | Religious Affections | `religious_affections_christianity_ocean_en` | 0 | 0 | 0 | 0 | 0 | 1 |
| 325 | The Quest of the Historical Jesus | `the_quest_of_the_historical_jesus_christianity_oce83bb301c8a36bcb6197faef1b1498ba8` | 0 | 0 | 0 | 0 | 0 | 1 |
| 326 | Writings of Imam Ja'afar as-Sadiq | `writings_of_imam_ja_afar_as_sadiq_islam_ocean_en` | 0 | 0 | 0 | 0 | 0 | 1 |

## Detail per book

Content collisions and numbered invocations are listed in full, up to 60 per book; any beyond that are in the TSV. The other kinds show 5 examples each.

### Ṣaḥíḥ al-Bukhárí (`a_i_al_bukhari_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1997)

- `1:2.41`: `4b` (content) “Narrated by ‘Abdu’lláh bin ‘Amr”; `blb6b` (content) “Narrated ‘Ubada bin As-Samit:”
- `1:3.21`: `6j` (content) “Narrated by Abu Waqid Al-Laithi”; `73` (content) “Narrated by Ibn ‘Abbás”
- `1:3.23`: `6l` (content) “Narrated by ‘Abdur Rahman bin Abi Bakra’s father”; `77` (content) “Narrated by Ibn ‘Abbás”
- `1:3.25`: `6n` (content) “Narrated by Ibn Mas’ud”; `79` (content) “Narrated by Abu Musa”; `7b` (content) “Narrated by Anas”
- `1.4.3`: `an` (content) “Narrated by Nu’am Al-Mujmir”; `aq` (content) “My uncle asked Alláh’s Apostle about a person who imagined to have pas”
- `1.4.5`: `ap` (content) “Narrated by ‘Abbás bin Tamim”; `au` (content) “Alláh’s Apostle proceeded from ‘Arafat till when he reached the mounta”
- `1.4.7`: `ar` (content) “Narrated by Kuraib”; `ay` (content) “The Prophet said, “If anyone of you on having sexual relations with hi”
- `1.4.9`: `at` (content) “Narrated by Usama bin Zaid”; `b2` (content) “Once the Prophet entered a lavatory and I placed water for his ablutio”
- `1.4.11`: `av` (content) “Narrated by ‘Ata’ bin Yasar”; `b6` (content) “People say, “Whenever you sit for answering the call of nature, you sh”
- `1.4.13`: `ax` (content) “Narrated by Ibn ‘Abbás”; `ba` (content) “The Prophet said to his wives, “You are allowed to go out to answer th”
- `1.4.17`: `b1` (content) “Narrated by Ibn ‘Abbás”; `bi` (content) “Whenever Alláh’s Apostle went to answer the call of nature, I along wi”
- `1.4.19`: `b3` (content) “Narrated by Abu Aiyub Al-Ansari”; `bm` (content) “Alláh’s Apostle said, “Whenever anyone of you drinks water, he should ”
- `1.4.21`: `b5` (content) “Narrated by ‘Abdu’lláh bin ‘Umar”; `bq` (content) “I followed the Prophet while he was going out to answer the call of na”
- `1.4.25`: `b9` (content) “Narrated by ‘Aisha”; `by` (content) “(the slave of ‘Uthman) I saw ‘Uthman bin ‘Affan asking for a tumbler o”
- `1.4.27`: `bb` (content) “Narrated by ‘Abdu’lláh bin ‘Umar”; `c2` (content) “Alláh’s Apostle said, “If anyone of you performs ablution he should pu”
- `1.4.29`: `bd` (content) “Narrated by ‘Abdu’lláh bin ‘Umar”; `c6` (content) “(the freed slave of ‘Uthman bin ‘Affan) I saw ‘Uthman bin ‘Affan askin”
- `1.4.31`: `bf` (content) “Narrated by Anas bin Malik”; `ca` (content) “I asked ‘Abdu’lláh bin ‘Umar, “O Abu ‘Abdur-Rahman! I saw you doing fo”
- `1.4.33`: `bh` (content) “Narrated by Anas”; `ce` (content) “The Prophet used to like to start from the right side on wearing shoes”
- `1.4.35`: `bj` (content) “Narrated by Anas bin Malik”; `ci` (content) “I said to ‘Ablda, “I have some of the hair of the Prophet which I got ”
- `1.4.37`: `bl` (content) “Narrated by Abu Qatada”; `cm` (content) “Alláh’s Apostle said, “If a dog drinks from the utensil of anyone of y”
- `1.4.39`: `bn` (content) “Narrated by Abu Qatada”; `cq` (content) “I asked the Prophet (about the hunting dogs) and he replied, “If you l”
- `1.4.41`: `bp` (content) “Narrated by Abu Huraira”; `cu` (content) “My uncle said: The Prophet said, “One should not leave his prayer unle”
- `1.4.43`: `br` (content) “Narrated by ‘Abdu’lláh”; `cy` (content) “I asked ‘Uthman bin ‘Affan about a person who engaged in intercourse b”
- `1.4.45`: `bt` (content) “Narrated by Ibn ‘Abbás”; `d2` (content) ““When Alláh’s Apostle departed from ‘Arafat, he turned towards a mount”
- `1.4.47`: `bv` (content) “Narrated by ‘Abdu’lláh bin Zaid”; `d6` (content) “That he stayed overnight in the house of Maimuna the wife of the Proph”
- `1.4.49`: `bx` (content) “Narrated by Humran”; `da` (content) “A person asked ‘Abdu’lláh bin Zaid who was the grandfather of ‘Amr bin”
- `1.4.51`: `bz` (content) “Narrated by Abu Huraira”; `de` (content) “Alláh’s Apostle came to us at noon and water for ablution was brought ”
- `1.4.53`: `c1` (content) “Narrated by Abu Huraira”; `di` (content) “My aunt took me to the Prophet and said, “O Alláh’s Apostle! This son ”
- `1.4.55`: `c3` (content) “Narrated by ‘Abdu’lláh bin ‘Amr”; `dm` (content) “My father said, “I saw Amr bin Abi Ḥasan asking ‘Abdu’lláh bin Zaid ab”
- `1.4.57`: `c5` (content) “Narrated by Humran”; `blb6a` (content) “Narrated by ‘Abdullah bin ‘Umar:”
- `1.4.59`: `c7` (content) “Narrated by Muḥammad Ibn Ziyad”; `dq` (content) “Alláh’s Apostle came to visit me while I was sick and unconscious. He ”
- `1.5.3`: `gv` (content) “Narrated by Maimuna”; `gy` (content) “The Prophet and I used to take a bath from a single pot called ‘Faraq’”
- `1.5.5`: `gx` (content) “Narrated by ‘Aisha”; `h2` (content) “While I and my father were with Jabir bin ‘Abdu’lláh, some People aske”
- `1.5.7`: `gz` (content) “Narrated by Abu Salama”; `h6` (content) “Alláh’s Apostle said, “As for me, I pour water three times on my head.”
- `1.5.9`: `h1` (content) “Narrated by Abu Ja’far”; `ha` (content) “Jabir bin ‘Abdu’lláh said to me, “Your cousin (Ḥasan bin Muḥammad bin ”
- `1.5.11`: `h3` (content) “Narrated by Ibn ‘Abbás”; `he` (content) “Whenever the Prophet took the bath of Janaba (sexual relation or wet d”
- `1.5.13`: `h5` (content) “Narrated by Jubair bin Mutim”; `hi` (content) “The Prophet took the bath of Janaba. (sexual relation or wet dream). H”
- `1.5.15`: `h7` (content) “Narrated by Jabir bin ‘Abdu’lláh”; `hm` (content) “Whenever Alláh’s Apostle took a bath of Janaba, he washed his hands fi”
- `1.5.17`: `h9` (content) “Narrated by Abu Ja’far”; `hq` (content) “The Prophet and one of his wives used to take a bath from a single pot”
- `1.5.19`: `hb` (content) “Narrated by Maimuna”; `hu` (content) “I placed water for the bath of Alláh’s Apostle and put a screen. He po”
- `1.5.21`: `hd` (content) “Narrated by ‘Aisha”; `hy` (content) “Anas bin Malik said, “The Prophet used to visit all his wives in a rou”
- `1.5.23`: `hf` (content) “Narrated by Maimuna”; `i2` (content) “On the authority of his father that he had asked ‘Aisha about the sayi”
- `1.5.25`: `hh` (content) “Narrated by Maimuna”; `i6` (content) “(On the authority of his father) ‘Aisha said, “Whenever Alláh’s Apostl”
- `1.5.27`: `hj` (content) “Narrated by Aisha”; `ia` (content) “Once the call (Iqama) for the prayer was announced and the rows were s”
- `1.5.29`: `hl` (content) “Narrated by ‘Aisha”; `ie` (content) “Whenever any one of us was Junub, she poured water over her head thric”
- `1.5.31`: `hn` (content) “Narrated by ‘Aisha”; `blb6h` (content) “Narrated by Abu Huraira:”
- `1.5.33`: `hp` (content) “Narrated by Anas bin Malik”; `ii` (content) “I went to Alláh’s Apostle in the year of the conquest of Mecca and fou”
- `1.5.35`: `hr` (content) “Narrated by Maimuna”; `im` (content) “(The mother of the believers) Um Sulaim, the wife of Abu Talha, came t”
- `1.5.37`: `ht` (content) “Narrated by Maimuna bint Al-Harith”; `iq` (content) “The Prophet used to visit all his wives in one night and he had nine w”
- `1.5.39`: `hv` (content) “Narrated by Muḥammad bin Al-Muntathir”; `iu` (content) “I asked ‘Aisha “Did the Prophet use to sleep while he was Junub?” She ”
- `1.5.41`: `hx` (content) “Narrated by Qatada”; `i5` (content) “Narrated by Hisham bin ‘Urwa”; `iy` (content) “Whenever the Prophet intended to sleep while he was Junub, he used to ”
- `1.5.43`: `hz` (content) “Narrated by ‘Alí”; `j2` (content) “‘Umar bin Al-Khattab told Alláh’s Apostle, “I became Junub at night.” ”
- `1.5.45`: `i1` (content) “Narrated by Muḥammad bin Al-Muntathir”; `i7` (content) “Narrated by Maimuna”; `j6` (content) “The Prophet said, “When a man sits in between the four parts of a woma”
- `1.5.47`: `i3` (content) “Narrated by ‘Aisha”; `i9` (content) “Narrated by Abu Huraira”; `ja` (content) “I asked Alláh’s Apostle about a man who engages in sexual intercourse ”
- `1.5.51`: `id` (content) “Narrated by Aisha”; `ix` (content) “Narrated by ‘Aisha”
- `1.5.53`: `if` (content) “Narrated by Abu Huraira”; `ip` (content) “Narrated by Anas bin Malik”; `iz` (content) “Narrated by ‘Abdu’lláh”
- `1.5.55`: `ih` (content) “Narrated by Um Hani bint Abi Talib”; `ir` (content) “Narrated by Abu Huraira”; `j1` (content) “Narrated by ‘Abdu’lláh bin ‘Umar”
- `1.5.57`: `ij` (content) “Narrated by Maimuna”; `it` (content) “Narrated by Abu Salama”; `j3` (content) “Narrated by Hisham”
- `1.5.59`: `il` (content) “Narrated by Um-Salama”; `iv` (content) “Narrated by ‘Umar bin Al-Khattab”; `j5` (content) “Narrated by Abu Huraira”
- `1.6.3`: `jf` (content) “Narrated by ‘Aisha”; `ji` (content) “A person asked me, “Can a woman in menses serve me? And can a Junub wo”
- … 1937 more in the TSV

**Source / citation lines carrying a number** (4)

- `2.23.131`: `20f` (content) “Narrated by ‘Amir bin Rabi’a”; `240` (source) “(From the daughter of Khalid bin Sa’id bin Al-‘Asi) who said that she ”
- `2.26.179`: `2gj` (content) “Narrated by Az-Zubair bin ‘Arabi”; `2l8` (source) “From the Prophet: (as above).”
- `3.31.97`: `2xt` (content) “Narrated by ‘Aisha”; `30i` (source) “(the slave of Ibn Azhar) I witnessed the ‘Id with ‘Umar bin Al-Kattab ”
- `5.59.53`: `5wf` (content) “Narrated by ‘Abdu’lláh”; `5xs` (source) “(the wife of the Prophet) Abu Hudhaifa, one of those who fought the ba”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (123)

- `1.4.1`: `al` (lead-in) “Narrated by Abu Huraira”; `am` (content) “Alláh’s Apostle said, “The prayer of a person who does, Hadath (passes”
- `1.5.1`: `gt` (lead-in) “Narrated by ‘Aisha”; `gu` (content) “Whenever the Prophet took a bath after Janaba he started by washing hi”
- `1.6.1`: `jd` (lead-in) “Narrated by Al-Qasim”; `je` (content) “‘Aisha said, “We set out with the sole intention of performing Hajj an”
- `1.7.1`: `lh` (lead-in) “Narrated by ‘Aisha”; `li` (content) “(the wife of the Prophet) We set out with Alláhs Apostle on one of his”
- `1.8.1`: `md` (lead-in) “Narrated by Abu Dhar”; `me` (content) “Alláh’s Apostle said, “While I was at Mecca the roof of my house was o”
- … 118 more in the TSV

### Kitab Al-Kafi 2 (`kitab_al_kafi_part_2_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1312)

- `1.1.2`: `bl32` (content) “H 1438, CH 1a, h 1”; `bl38` (content) ““Allah, the Majestic, the Glorious, created the believers from the cla”
- `1.1.1`: `bl33` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”; `bl35` (content) ““Allah, the Majestic, the Glorious, created the prophets from the clay”
- `1.1.4`: `bl36` (content) “H 1439, CH 1a, h 2”; `bl3j` (content) ““I heard abu Ja’far, recipient of divine supreme covenant, saying, ‘Al”
- `1.1.3`: `bl37` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Hassan from al-Na”; `bl3c` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from Sali”; `bl3d` (content) ““May Allah keep my soul of service to you, from what kind of material ”
- `1.1.6`: `bl3b` (content) “H 1440, CH 1a, h 3”; `bl3i` (content) “Muhammad ibn Yahya and others have narrated from Ahmad ibn Muhammad ib”; `bl3n` (content) ““He (the Imam) said, ‘O ibn Kaysan, Allah, the Majestic, the Glorious,”
- `1.1.8`: `bl3h` (content) “H 1441, CH 1a, h 4”; `bl3l` (content) “A number of our people have narrated from Sahl ibn Ziyad, who has narr”; `bl3y` (content) ““When Allah, the Majestic, the Glorious, willed to create Adam He sent”
- `1.1.10`: `bl3k` (content) “H 1442, CH 1a, h 5”; `bl49` (content) ““Once a man asked abu Ja’far, recipient of divine supreme covenant, ab”
- `1.1.13`: `bl3o` (content) “H 1443, CH 1a, h 6”; `bl3x` (content) “Ali ibn Muhammad has narrated from Salih ibn abu Hammad from al-Husayn”; `bl4k` (content) ““Abu Ja’far, recipient of divine supreme covenant, has said, ‘As Allah”
- `1.1.11`: `bl3p` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl4a` (content) ““He (the Imam), while his father, recipient of divine supreme covenant”
- `1.1.15`: `bl3w` (content) “H 1444, CH 1a, h 7”; `bl42` (content) “Abu Ali al-Ash’ari and Muhammad ibn Yahya have narrated from Muhammad ”; `bl4n` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad and Ali ibn Ib”; `bl4o` (content) ““I heard abu Ja’far, recipient of divine supreme covenant, saying, ‘Th”
- `1.2.1`: `bl41` (content) “H 1445, CH 1b, h 1”; `bl58` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-Hassan”; `bl59` (content) ““Certain persons of Quraysh asked, ‘O messenger of Allah, by what mean”
- `1.1.20`: `bl47` (content) “H 1446, CH 1b, h 2”; `bl4c` (content) “Ali ibn Ibrahim has narrated from his father from Ahmad ibn Muhammad i”
- `1.1.17`: `bl48` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl53` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Husayn from Muham”
- `1.1.22`: `bl4b` (content) “H 1447, CH 1b, h 3”; `bl4j` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”
- `1.3.1`: `bl57` (content) “H 1451, CH 2, h 1”; `bl5s` (content) ““Once I asked abu ‘Abd Allah, recipient of divine supreme covenant, ‘H”; `bl6t` (header) “The Coloring (referred to in the Holy Quran) Is Islam”
- `1.2.3`: `bl5l` (lead-in) “H 1453, CH 2, h 3”; `bl5m` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Husayn from Ali i”; `bl5n` (content) ““The messenger of Allah was asked, ‘By what means have you surpassed o”
- `1.4.1`: `bl5x` (content) ““I asked ( the Imam) about the words of Allah, ‘. . . the invention of”; `bl83m` (content) “Al-Husayn ibn Muhammad has narrated from Mu’alla ibn Muhammad from al-”
- `1.4.3`: `bl61` (content) “H 1457, CH 4, h 3”; `bl63` (content) ““Once I asked abu ‘Abd Allah, recipient of divine supreme covenant, ab”
- `1.5.1`: `bl6d` (content) “H 1459, CH 5, h 1”; `bl6e` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘The ”
- `1.6.1`: `bl6p` (content) “H 1461, CH 6, h 1”; `bl6r` (content) ““In paradise there is a tree called al-Muzn. When Allah wants to creat”
- `1.10.10`: `bl9o` (content) “Abu Ali al-Ash’ari has narrated from Muhammad ibn ‘Abd al-Jabbar from ”; `bl9r` (content) ““Abu Ja’far, recipient of divine supreme covenant, has said, ‘Islam is”
- `10.35`: `blgb` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `blgd` (lead-in) “H 1513, CH 15, h 5”; `blge` (content) “From him from his father from al-Nadr ibn Suwayd from Yahya ibn ‘Imran”
- `13.3`: `bliu` (lead-in) “H 1526, CH 18, h 3”; `bliv` (content) “Ali ibn Ibrahim has narrated from his father from Ali ibn Ma’bad from ”; `bliw` (lead-in) “H 1527, CH 18, h 4”; `blix` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ‘Abd”
- `17.1`: `blk5` (lead-in) “H 1533, CH 21, h 1”; `blk6` (content) “Through the same chain of narrators as the above Hadith it is narrated”; `blkh` (lead-in) “H 1534, CH 22, h 1”; `blki` (content) “Abu Ali al-Ash’ari has narrated from Muhammad ibn Salim from Ahmad ibn”
- `22.6`: `blov` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `blox` (lead-in) “H 1572, CH 27, h 6”; `bloy` (content) “Abu Ali al-Ash’ari has narrated from Muhammad ibn ‘Abd al-Jabbar from ”
- `28.5`: `blus` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bluu` (lead-in) “H 1621, CH 33, h 5”; `bluv` (content) “It is narrated from him (narrator of the Hadith above) from his father”
- `1.35.1`: `blwt` (lead-in) “H 1640, CH 35, h 1”; `blwu` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `blwv` (content) ““About the words of Allah, the Most Majestic, the Most Holy, ‘. . . fo”
- `1.35.2`: `blwx` (content) “H 1641, CH 35, h 2”; `blwz` (content) ““Abu Ja’far, recipient of divine supreme covenant, has said, ‘On the D”
- `1.35.3`: `blwy` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”; `blx0` (lead-in) “H 1642, CH 35, h 3”; `blx1` (content) “Ali has narrated from Muhammad ibn ‘Isa from Yunus from those whom he ”; `blx2` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Of t”
- `1.35.4`: `blx8` (lead-in) “H 1643, CH 35, h 4”; `blx9` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blxb` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘The ”
- `1.36.1`: `blxk` (lead-in) “H 1646, CH 36, h 1”; `blxl` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ali ibn I”; `blxm` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, has said, ‘O”
- `1.36.2`: `blxn` (lead-in) “H 1647, CH 36, h 2”; `blxo` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”; `blxp` (content) ““About the words of Allah, the Most Majestic, the Most Holy, ‘Believer”
- `1.36.3`: `blxt` (lead-in) “H 1648, CH 36, h 3”; `blxu` (content) “A number of our people have narrated from Sahl ibn Ziyad from ‘Abd al-”; `blxv` (content) ““About the words of Allah, the Most Majestic, the Most Holy, ‘Believer”
- `1.36.6`: `bly0` (lead-in) “H 1650, CH 36, h 5”; `bly1` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `bly2` (content) ““Allah, the Most Blessed, the Most High, has said, ‘The most beloved m”
- `1.38.1`: `bly5` (lead-in) “H 1651, CH 37, h 1”; `bly6` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blyz` (lead-in) “H 1657, CH 38, h 1”; `blz0` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `blz1` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘It i”
- `1.37.3`: `blyb` (lead-in) “H 1653, CH 37, h 3”; `blyc` (content) “Abu Ali al-Ash’ari has narrated from ‘Isa ibn Ayyub from Ali ibn Mahzi”; `blyd` (content) ““Abu Ja’far, recipient of divine supreme covenant, has said, ‘There is”
- `1.37.4`: `blyf` (lead-in) “H 1654, CH 37, h 4”; `blyg` (content) “It is narrated from him (narrator of the Hadith above) from Fadalah ib”; `blyp` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, would say, ‘”
- `1.37.5`: `blyq` (lead-in) “H 1655, CH 37, h 5”; `blyr` (content) “It is narrated from him (narrator of the Hadith above) from Fadalah ib”; `blys` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, would say, ‘”
- `1.37.6`: `blyt` (lead-in) “H 1656, CH 37, h 6”; `blyu` (content) “A number of our people have narrated from Ahmad ibn Muhammad from Muha”; `blyv` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Be c”
- `1.38.4`: `blz8` (lead-in) “H 1660, CH 38, h 4”; `blz9` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `blza` (content) “‘“Isa ibn ‘Abd Allah once said to abu ‘Abd Allah, recipient of divine ”
- `1.38.5`: `blzf` (lead-in) “H 1661, CH 38, h 5”; `blzg` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from Jami”; `blzh` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Ther”
- `1.38.7`: `blzl` (lead-in) “H 1663, CH 38, h 7”; `blzm` (content) “Al-Husayn ibn Muhammad has narrated from Mu’alla ibn Muhammad from al-”; `blzn` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, has said, ‘O”
- `1.39.1`: `blzq` (lead-in) “H 1664, CH 39, h 1”; `blzr` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from Mali”; `blzs` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, has said, ‘T”
- `1.39.3`: `blzw` (lead-in) “H 1666, CH 39, h 3”; `blzx` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `bl102` (content) ““The poor believing servant (of Allah) says, ‘O Lord bestow upon me su”
- `1.39.4`: `bl103` (lead-in) “H 1667, CH 39, h 4”; `bl104` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl105` (content) ““I asked abu ‘Abd Allah, recipient of divine supreme covenant, about w”
- `1.40.1`: `bl10b` (lead-in) “H 1669, CH 40, h 1”; `bl10c` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl10d` (content) ““The Messenger of Allah has said, ‘For every form of worship there is ”
- `1.41.1`: `bl10k` (lead-in) “H 1671, CH 41, h 1”; `bl10l` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl10p` (content) ““The Messenger of Allah has said, ‘This religion is strong (and vast).”
- `1.41.2`: `bl10q` (lead-in) “Muhammad ibn Sinan has narrated from Muqrin from Muhammad ibn Sawqah f”; `bl10r` (lead-in) “H 1672, CH 41, h 2”; `bl10s` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn Isma’il ”; `bl84g` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Do n”
- `1.41.4`: `bl10w` (lead-in) “H 1674, CH 41, h 4”; `bl10x` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `bl10y` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Once”
- `1.41.5`: `bl10z` (lead-in) “H 1675, CH 41, h 5”; `bl110` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl111` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘I st”
- `1.41.6`: `bl112` (lead-in) “H 1676, CH 41, h 6”; `bl113` (content) “Hamid ibn Ziyad has narrated from al-Khashshab from ibn Baqqah from Mu”; `bl114` (content) ““The Messenger of Allah once said, ‘O Ali, this religion is strong (an”
- `1.43.1`: `bl11j` (lead-in) “H 1679, CH 43, h 1”; `bl11k` (content) “A number of our people have narrated from Sahl ibn Ziyad from al-Hassa”; `bl11l` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Pati”
- `1.43.2`: `bl11m` (lead-in) “H 1680, CH 43, h 2”; `bl11n` (content) “Abu Ali al-Ash’ari has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl11o` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Pati”
- `1.43.3`: `bl11q` (lead-in) “H 1681, CH 43, h 3”; `bl11r` (content) “Ali ibn Ibrahim has narrated from his father from Ali ibn Muhammad al-”; `bl11s` (content) ““Once abu ‘Abd Allah, recipient of divine supreme covenant, said, ‘O H”
- `1.43.8`: `bl122` (lead-in) “H 1682, CH 43, h 4”; `bl123` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl124` (content) ““Ali ibn al-Husayn, recipient of divine supreme covenant, has said, ‘P”
- `1.43.9`: `bl129` (lead-in) “H 1683, CH 43, h 5”; `bl12a` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”; `bl12b` (content) ““Abu ‘Abd Allah, recipient of divine supreme covenant, has said, ‘Pati”
- `1.43.10`: `bl12c` (lead-in) “H 1684, CH 43, h 6”; `bl12d` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl12e` (content) ““I heard abu ‘Abd Allah, recipient of divine supreme covenant, saying,”
- `1.43.11`: `bl12f` (lead-in) “H 1685, CH 43, h 7”; `bl12g` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl845` (content) ““Abu Ja’far, recipient of divine supreme covenant, has said, ‘Paradise”
- `1.43.12`: `bl12h` (lead-in) “H 1686, CH 43, h 8”; `bl12i` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from ‘Abd”; `bl12j` (content) ““When a believer is placed in his grave, prayer will be on his right a”
- `1.43.13`: `bl12k` (lead-in) “H 1687, CH 43, h 9”; `bl12l` (content) “Ali has narrated from his father from Ja’far ibn Muhammad al-Ash’ari f”; `bl12m` (content) ““Once Amir al-Mu’minin (Ali ibn abu Talib), recipient of divine suprem”
- … 1252 more in the TSV

**Opening invocations carrying a number** (4)

- `1`: `bl2v` “In the name of Allah, the Beneficent, the Merciful”
- `1.203.8`: `bl8cs` “In the name of Allah, the Beneficent, the Merciful”
- `2.60.73`: `bl713` “In the name of Allah, the Beneficent, the Merciful”
- `3.14.33`: `bl7g7` “In the name of Allah, the Beneficent, the Merciful”

**Header numbers colliding with another block** (234)

- `1`: `bl2v` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl2w` (header) “Part One”; `bl84n` (struct) “”
- `2`: `bl833` (header) “The Book of Belief and Disbelief”; `bl5kb` (header) “Part Two”
- `1.2`: `bl3z` (header) “Chapter One (b)”; `bl40` (header) “The Clay from Which the Believers and Unbelievers Are Made (Additional”; `bl4h` (header) “The Clay from which the Believers and Unbelievers Are Made (Additional”; `bl55` (header) “Chapter Two”
- `1.3`: `bl4g` (header) “Chapter One (c)”; `bl56` (header) “The Messenger of Allah, recipient of divine supreme covenant, Was the ”; `bl5o` (header) “Chapter Three”
- `1.6`: `bl6m` (header) “Chapter Six”; `bl6n` (header) “When Allah, the Majestic, the Glorious, Wills to Create a Believer (In”
- … 229 more in the TSV

**Source / citation lines carrying a number** (2)

- `1.135.22`: `bl49k` (source) “(The word Za’m in Arabic may mean to believe, to think, to guess, to s”; `bl49v` (content) ““Amir al-Mu’minin, Ali ibn abu Talib, recipient of divine supreme cove”
- `1.163.10`: `bl4tq` (source) “(This is part of the previous Hadith. The compiler has presented it in”; `bl4tr` (content) ““Amir al-Mu’minin, Ali ibn abu Talib, recipient of divine supreme cove”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (803)

- `1.2.2`: `bl83f` (lead-in) “Ahmad ibn Muhammad has narrated from Muhammad ibn Khalid from certain ”; `bl5f` (content) ““Once I said to abu ‘Abd Allah, recipient of divine supreme covenant, ”
- `10.1`: `blen` (lead-in) “H 1509, CH 15, h 1”; `bleo` (content) “Ali ibn Ibrahim has narrated from his father from Bakr ibn Salih from ”
- `10.32`: `blg1` (lead-in) “H 1510, CH 15, h 2”; `blg2` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”
- `10.33`: `blg4` (lead-in) “H 1511, CH 15, h 3”; `blg5` (content) “Abu Ali al-Ash’ari has narrated from Muhammad ibn ‘Abd al-Jabbar from ”
- `10.36`: `blgg` (lead-in) “H 1514, CH 15, h 6”; `blgh` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- … 798 more in the TSV

### Kitab Al-Kafi 6 (`kitabal_kafi_vol6_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1100)

- `1`: `bl2y` (content) “In the name of Allah, the Beneficient, the Merciful”; `bl6df` (header) “Part One”; `bl6pw` (header) “The Book of Talaq (Divorces)”; `bl6q2` (header) “The Book of Slaughtering Animals for Food”; `bl6pa` (header) “Blood that Falls in the Cooking Pot”; `bl6p8` (content) “H 11098, Ch. 15, h 1”; `bl6q3` (header) “The Book of Food”; `bl6pd` (content) “H 11143, Ch. 5, h 1”; `bl6pg` (content) “H 11199, Ch. 17, h 1”; `bl6pk` (content) “H 11437, Ch. 56, h 1”; `bl6q4` (header) “The Book of Drinks”
- `l.1.3`: `bl34` (content) “H 10242, Ch. 1, h 2”; `bl38` (content) “A number of our people have narrated from Ahmad ibn Muhammad from al-Q”
- `l.1.6`: `bl37` (content) “H 10243, Ch. 1, h 3”; `bl3h` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”
- `l.1.7`: `bl3a` (content) “H 10244, Ch. 1, h 4”; `bl3k` (content) “It is narrated from the narrator of the previous Hadith from Bakr ibn ”
- `l.1.9`: `bl3d` (content) “H 10245, Ch. 1, h 5”; `bl3r` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”
- `l.1.11`: `bl3g` (content) “H 10246, Ch. 1, h 6”; `bl3x` (content) “Through the same chain of narrators as that of the previous Hadith, th”
- `l.3.3`: `bl4g` (content) “H 10257, Ch. 3, h 2”; `bl4k` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- `l.3.5`: `bl4j` (content) “H 10258, Ch. 3, h 3”; `bl4q` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”
- `l.3.7`: `bl4m` (content) “H 10259, Ch. 3, h 4”; `bl4x` (content) “It is narrated from the narrator of the previous Hadith from Ali ibn M”
- `l.3.9`: `bl4p` (content) “H 10260, Ch. 3, h 5”; `bl53` (content) “Ahmad ibn Muhammad al-‘Asemiy has narrated from Ali ibn al-Hassan al-T”
- `l.3.11`: `bl4s` (content) “H 10261, Ch. 3, h 6”; `bl59` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”
- `l.4.3`: `bl5i` (content) “H 10269, Ch. 4, h 2”; `bl5m` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”
- `l.4.5`: `bl5l` (content) “H 10270, Ch. 4, h 3”; `bl5s` (content) “Al-Husayn ibn Muhammad has narrated from Ahmad ibn Muhammad from al-Sa”
- `l.4.7`: `bl5o` (content) “H 10271, Ch. 4, h 4”; `bl5z` (content) “It is narrated from the narrator of the previous Hadith from certain p”
- `l.4.9`: `bl5r` (content) “H 10272, Ch. 4, h 5”; `bl65` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-‘ Abba”
- `l.4.12`: `bl5v` (content) “H 10273, Ch. 4, h 6”; `bl6d` (lead-in) “H 10279, Ch. 4, h 12”; `bl6e` (content) “Al-Husayn from Muhammad has narrated from Mu‘alla’ ibn Muhammad from a”
- `l.18.1`: `bl9r` (content) “H 10315, Ch. 12, h 1”; `blad` (content) “H 10322, Ch. 13, h 1”; `bldd` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-‘Abbas”
- `l.12.4`: `bl9y` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bla0` (lead-in) “H 10318, Ch. 12, h 4”; `bla1` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”
- `l.19.1`: `blav` (content) “H 10328, Ch. 14, h 1”; `bldj` (lead-in) “H 10357, Ch. 19, h 1”; `bldk` (content) “Ali ibn Ibrahim has narrated from his father and Afi ibn Muhammad from”
- `l.23.1`: `blc1` (content) “H 10341, Ch. 16, h 1”; `blf0` (lead-in) “H 10373, Ch. 23, h 1”; `blf1` (content) “Ali ibn Ibrahim has narrated from Harun ibn Muslim from Mas‘adah ibn S”
- `l.17.10`: `blcv` (lead-in) “H 10350, Ch. 17, h 8”; `blcw` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bld2` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”
- `l.27.1`: `bldc` (content) “H 10355, Ch. 18, h 1”; `blgx` (content) “H 10394, Ch. 27, h 1”
- `l.26.1`: `bl6eh` (content) “H 10389, Ch. 25, h 1”; `blgn` (content) “H 10391, Ch. 26, h 1”
- `l.27.3`: `blh0` (lead-in) “H 10395, Ch. 27, h 2”; `blh1` (content) “Ali ibn Ibrahim has narrated from his father from Abu Ja‘far ibn Muham”; `blh3` (content) “H 10396, Ch. 27, h 3”
- `l.28.3`: `blha` (lead-in) “H 10398, Ch. 28, h 2”; `blhb` (content) “Muhammad ibn Yahya has narrated from Salmah ibn al-Khattab from Muhamm”; `blhe` (content) “Muhammad has narrated from Ahmad ibn Muhammad ibn ‘Isa from Muhammad i”
- `l.30.3`: `blia` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `blic` (lead-in) “H 10409, Ch. 30, h 3”; `blid` (content) “It is narrated from the narrator of the previous Hadith from al-Kahili”
- `l.30.7`: `blil` (lead-in) “H 10412, Ch. 30, h 6”; `blim` (content) “A number of our people have narrated from Sahl ibn Ziyad Ahmad ibn Muh”; `blip` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”
- `l.30.11`: `bliv` (content) “H 10415, Ch. 30, h 9”; `blj2` (content) “Muhammad ibn Yahya has narrated from al-‘Amrakiy ibn Ali from Ali ibn ”
- `l.30.14`: `blj1` (content) “H 10417, Ch. 30, h 11”; `bljb` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”
- `l.34.1`: `blku` (lead-in) “H 10437, Ch. 34, h 1”; `blkv` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus from Du”; `blli` (content) “H 10443, Ch. 35, h 1”
- `l.34.5`: `bll5` (content) “H 10440, Ch. 34, h 4”; `blla` (lead-in) “H 10441, Ch. 34, h 5”; `bllb` (content) “It is narrated from the narrator of the previous Hadith from Muhammad ”
- `l.35.6`: `bllu` (lead-in) “H 10447, Ch. 35, h 5”; `bllv` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blly` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”
- `l.35.7`: `bllx` (content) “H 10448, Ch. 35, h 6”; `blm2` (content) “Ali ibn Muhammad ibn Bandar has narrated from Ahmad ibn abu ‘Abd Allah”
- `l.35.9`: `blm1` (content) “H 10449, Ch. 35, h 7”; `blm8` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”
- `l.36.1`: `bl6ej` (lead-in) “H 10452, Ch. 36, h 1”; `blmb` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn Khalid fro”; `blmn` (content) “H 10456, Ch. 38, h 1”
- `l.38.1`: `blmo` (content) “Abu Ali al-Ash‘ariy has narrated from narrated from Muhammad ibn Hassa”; `blmq` (lead-in) “H 10457, Ch. 38, h 2”; `blmr` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”
- `l.39.1`: `bl6ek` (lead-in) “H 10464, Ch. 1, h 1”; `blnf` (content) “Narrated to us certain persons of our people from Ahmad ibn Muhammad f”; `bl6ep` (content) “H 10469, Ch. 2, h 1”
- `l.42.1`: `blot` (lead-in) “H 10480, Ch. 4, h 1”; `blou` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ali ibn I”; `blqf` (content) “H 10498, Ch. 5, h 1”
- `l.43.1`: `blqg` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blqp` (content) “H 10501, Ch. 6, h 1”
- `l.44.1`: `blqq` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad and Muhammad i”; `blr6` (content) “H 10506, Ch. 7, h 1”
- `l.46.1`: `blrd` (lead-in) “H 10508, Ch. 8, h 1”; `blre` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar and ”; `bls8` (content) “H 10517, Ch. 9, h 1”
- `l.47.1`: `bls9` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad ibn Sama‘ah ”; `blsn` (content) “H 10521, Ch. 10, h 1”
- `2.9.5`: `blsk` (content) ““Ibn Sama‘ah has said that the meaning of the words of the messenger, ”; `blsl` (content) ““Humayd ibn Ziyad has narrated from ibn Sama‘ah from Ali ibn al-Hassan”
- `l.48.1`: `blso` (content) “A number of our people have narrated from Ahmad ibn Muhammad from Sahl”; `blt0` (content) “H 10525, Ch. 11, h 1”
- `l.50.1`: `bl6f0` (lead-in) “H 10529, Ch. 12, h 1”; `bltd` (content) “Ali ibn Ibrahim has narrated from his father from Ahmad ibn Muhammad f”; `bltw` (content) “H 10535, Ch. 14, h 1”
- `l.51.1`: `bltg` (lead-in) “H 10530, Ch. 13, h 1”; `blth` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bluc` (content) “H 10540, Ch. 15, h 1”
- `l.52.1`: `bltx` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ali ibn I”; `blum` (content) “H 10543, Ch. 16, h 1”
- `l.53.1`: `blud` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Mahbu”; `bluq` (content) “H 10544, Ch. 17, h 1”
- `2.15.3`: `blui` (content) “H 10542, Ch. 15, h 3”; `bluk` (content) ““About the case of a man, who divorces his wife in the presence of two”
- `l.55.1`: `blur` (content) “Ali ibn Ibrahim has narrated from his father from al-Hassan ibn Mahbub”; `bl6ow` (content) “H 10550, Ch. 18, h 1”
- `l.56.1`: `blva` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blvn` (content) “H 10554, Ch. 19, h 1”; `blvu` (content) “H 10556, Ch. 20, h 1”
- `l.58.1`: `blvv` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `bl6f7` (content) “H 10559, Ch. 21, h 1”
- `l.59.1`: `blw5` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blww` (content) “H 10568, Ch. 22, h 1”
- `2.23.1`: `blxy` (content) “H 10580, Ch. 23, h 1”; `bly0` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `2.24.1`: `blyl` (content) “H 10587, Ch. 24, h 1”; `blyn` (content) ““There is the case of a man who divorces a girl who is not mature yet ”
- `l.63.6`: `blys` (lead-in) “H 10589, Ch. 24, h 3”; `blyt` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar and ”; `blyv` (lead-in) “H 10590, Ch. 24, h 4”; `blyw` (content) “A number of our people have narrated from Sahl ibn Ziyad from ibn abu ”
- `2.25.1`: `blz7` (content) “H 10593, Ch. 25, h 1”; `blz9` (content) ““I once asked abu al-Hassan, ‘Alayhi al-Salam, about the case of a man”
- `2.26.1`: `blzb` (content) “H 10594, Ch. 26, h 1”; `blzd` (content) ““I once said to abu Ja‘far, ‘Alayhi al-Salam, ‘I pray to Allah to keep”
- `2.27.1`: `bl10c` (content) “H 10605, Ch. 27, h 1”; `bl10e` (content) ““I heard Rabi‘ al-Ra’iy saying, ‘It is my opinion that al-‘Iqra’ which”
- `l.67.1`: `bl10q` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘ Umayr from”; `bl11y` (content) “H 10623, Ch. 29, h 1”
- … 1040 more in the TSV

**Opening invocations carrying a number** (1)

- `1`: `bl2y` “In the name of Allah, the Beneficient, the Merciful”

**Header numbers colliding with another block** (24)

- `a.2`: `bl6di` (header) “Excellence of Son”; `bl6dg` (header) “Resemblance of a Child”
- `l.18`: `bl6dq` (header) “Foods Preferable for a Pregnant or a Woman during Childbirth to Eat”; `bl6dy` (header) “On the Seventh Day from Birth the Newborn’s Head is Shaved and a Name ”
- `l.27`: `bl6dw` (header) “‘Aqiqah is not Equal to al-‘Adhiyah (animal offered as sacrificial off”; `bl6e9` (header) “The Rare Ahadith”
- `l.29`: `bl6e1` (header) “The Mother should not Eat from the Meat of ‘Aqiqah”; `bl6ea` (header) “Breastfeeding”
- `l.24`: `bl6e6` (header) “Cleansing, Circumcision”; `bl6e7` (header) “Lowering for Girls”
- … 19 more in the TSV

**Source / citation lines carrying a number** (2)

- `l.17.4`: `blch` (source) “(Al-Qabilah according to hadith number three, chapter ninety-three is ”; `blci` (content) “H 10346, Ch. 17, h 4”
- `5.2.2`: `bl2bg` (source) “(The above Hadith is from ‘Ammah narrators and its style is very diffe”; `bl2bj` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Of the beasts that which”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1417)

- `l.1.1`: `bl31` (lead-in) “H 10241, Ch. 1, h 1”; `bl32` (content) “Ali ibn Ibrahim has narrated from his father from af-Nawfafiy from af-”
- `l.2.1`: `bl43` (lead-in) “H 10253, Ch. 2, h 1”; `bl44` (content) “Ali ibn Ibrahim has narrated from his father from af-Nawfafiy from af-”
- `l.3.1`: `bl4d` (lead-in) “H 10256, Ch. 3, h 1”; `bl4e` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”
- `l.4.1`: `bl5f` (lead-in) “H 10268, Ch. 4, h 1”; `bl5g` (content) “Ali ibn Ibrahim has narrated from Salih ibn al-Sindiy, from Ja‘far ibn”
- `l.4.11`: `bl6a` (lead-in) “H 10278, Ch. 4, h 11”; `bl6b` (content) “A number of our people have narrated from Sahl ibn Ziyad from Musa ibn”
- … 1412 more in the TSV

### Kitab Al-Kafi 5 (`kitab_al_kafi_v5_of_8_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1042)

- `1`: `bl2w` (header) “Part One”; `bl5l5` (content) “H 9099, Ch. 115, h 1”; `bl5mq` (content) “H 9740, Ch. 76, h 1”; `bl5p6` (content) “H 10023, Ch. 154, h 1”
- `1.1.1`: `bl5fz` (lead-in) “H 8158, Ch. 1, h 1”; `bl2y` (content) “A number of our people have narrated from Ahmad ibn Muhammad from Ali ”; `bl2z` (content) ““The Messenger of Allah has said, ‘All good things are with the sword,”
- `1.1.8`: `bl3d` (lead-in) “H 8162, Ch. 1, h 5”; `bl3e` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl3f` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Jihad (serving in the”
- `1.1.9`: `bl3g` (lead-in) “H 8163, Ch. 1, h 6”; `bl3h` (content) “Ahmad ibn Muhammad ibn Sa‘id has narrated from Ja’far ibn ‘Abd Allah a”; `bl3i` (content) ““Thereafter, (my praising Allah) you must take notice that Jihad (serv”
- `1.1.18`: `bl47` (lead-in) “H 8171, Ch. 1, h 14”; `bl48` (content) “Ali has narrated from father, from al-Nawfaliy from al-Sakuniy who has”; `bl4c` (content) ““All goodness is in the sword, under the sword and under the shadow of”
- `1.1.19`: `bl4a` (lead-in) “H 8172, Ch. 1, h 15”; `bl4b` (content) ““Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn al-Hajjal”; `bl4d` (content) ““I heard him saying, ‘Goodness, all of it, is tied to the forehead of ”
- `1.2.1`: `bl4f` (lead-in) “H 8173, Ch. 2, h 1”; `bl4g` (content) “Ali ibn Ibrahim has narrated from his father from abu al-Jawza’ from a”; `bl4h` (content) ““Amir al-Mu’minin, ‘Alayhi al-Salam, has said, ‘Allah has made Jihad o”
- `1.3.1`: `bl4j` (lead-in) “H 8174, Ch. 3, h 1”; `bl4k` (content) “Ali ibn Ibrahim has narrated from his father and Ali ibn Muhammad al-Q”; `bl4l` (content) ““This is concerning my question before abu ‘Abd Allah, ‘Alayhi al-Sala”
- `1.6.2`: `bl66` (lead-in) “H 8182, Ch. 6, h 2”; `bl67` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `bl68` (content) ““Once Muhammad ibn ‘Abd Allah said to al-Rida’, ‘Alayhi al-Salam, when”
- `1.6.3`: `bl69` (lead-in) “H 8183, Ch. 6, h 3”; `bl6a` (content) “Muhammad ibn al-Hassan al-Tatriy has narrated from those who he has me”; `bl6b` (content) ““I once said to abu ‘Abd Allah, ‘Alayhi al-Salam, ‘I saw a dream in wh”
- `1.7.1`: `bl6d` (lead-in) “H 8184, Ch. 7, h 1”; `bl6e` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl6f` (content) ““I was sitting in the presence of abu ‘Abd Allah, ‘Alayhi al-Salam, in”
- `1.8.10`: `bl7j` (lead-in) “H 8194, Ch. 8, h 9”; `bl7k` (content) “A number of our people have narrated from Ahmad ibn Muhammad from al-W”; `bl7l` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that whenever the Messenge”
- `1.10.1`: `bl84` (lead-in) “H 8200, Ch. 9b, h 1”; `bl85` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl90` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, was asked about challenging (to fig”
- `1.11.1`: `bl8o` (lead-in) “H 8205, Ch. 9c, h 1”; `bl8p` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl97` (content) ““If you take a prisoner who is not able to walk and you do not have a ”
- `1.11.4`: `bl8r` (content) “H 8206, Ch. 9c, h 2”; `bl9g` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, spoke about feeding the prisoners o”
- `1.11.2`: `bl8s` (content) “A number of our people have narrated from Sahl ibn Ziyad from Muhammad”; `bl9a` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that feeding the prisoner ”
- `1.11.3`: `bl8u` (lead-in) “H 8207, Ch. 9c, h 3”; `bl8v` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy, from al”; `bl9d` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that feeding the prisoner ”
- `1.12.1`: `bl8y` (content) “H 8208, Ch. 10, h 1”; `bl9k` (content) ““Once a group of men of Quraysh came to see Ali ibn al-Husayn, ‘Alayhi”
- `1.12.2`: `bl8z` (content) “Hamid ibn Ziyad has narrated from al-Khashshab from ibn Baqqah from Mu”; `bl9n` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Amir al-Mu’minin, ‘Al”
- `1.14.1`: `bl9i` (lead-in) “H 8214, Ch. 12, h 1”; `bl9j` (content) “Ali ibn Ibrahim has narrated from his father, from al-Qasim ibn Muhamm”; `blao` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that once, the Messenger o”
- `1.15.8`: `bla1` (content) “H 8218, Ch. 13a, h 3”; `bla4` (lead-in) “H 8219, Ch. 13a, h 4”; `bla5` (content) “In a Hadith from Malik ibn A’yan the following is narrated:”
- `1.16.1`: `blag` (lead-in) “H 8221, Ch. 13b, h 1”; `blah` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `blby` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that our slogan on the day”
- `1.16.2`: `blaj` (lead-in) “H 8222, Ch. 13b, h 2”; `blak` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blc1` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that certain people from M”
- `1.17.1`: `bl5gj` (lead-in) “H 8223, Ch. 14, h 1”; `blan` (content) “Ali ibn Ibrahim has narrated from his father, from al-Nawfafiy from al”; `blc7` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that horses were wild in A”
- `1.18.1`: `blaq` (lead-in) “H 8224, Ch. 15a, h 1”; `blar` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from Mu‘a”; `bldm` (content) ““I asked abu Ja’far, ‘Alayhi al-Salam, about a thief who may enter my ”
- `1.18.3`: `blat` (lead-in) “H 8225, Ch. 15a, h 2”; `blau` (content) “Ali ibn Ibrahim has narrated from his father from and Ali ibn Muhammad”; `blds` (content) ““Once a man came to Amir al-Mu’minin, ‘Alayhi al-Salam, and said, ‘O A”
- `1.18.4`: `blaw` (lead-in) “H 8226, Ch. 15a, h 3”; `blax` (content) “Abu Ali al-Ash’ariy has narrated from Muhammad ibn Salim from Ahmad ib”; `bldv` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Amir al-Mu’minin, ‘Al”
- `1.19.1`: `blbh` (lead-in) “H 8232, Ch. 15b, h 1”; `blbi` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bldz` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.19.2`: `blbk` (lead-in) “H 8233, Ch. 15b, h 2”; `blbl` (content) “Muhammad ibn Ahmad has narrated from Ali ibn al-Hakam from Fudayl ibn ”; `ble2` (content) ““The Messenger of Allah, O Allah, grant compensation to Muhammad and h”
- `1.19.3`: `blbn` (lead-in) “H 8234, Ch. 15b, h 3”; `blbo` (content) “Ali ibn Ibrahim has narrated from his father from and Ali ibn Muhammad”; `ble5` (content) ““This is concerning my question before abu ‘Abd Allah, ‘Alayhi al-Sala”
- `1.21.1`: `blbw` (lead-in) “H 8236, Ch. 16, h 1”; `blbx` (content) “Ali ibn Ibrahim has narrated from his father from Ahmad ibn Muhammad i”; `blfg` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said, ‘During the last era of time ”
- `1.21.2`: `blbz` (lead-in) “H 8237, Ch. 16, h 2”; `blc0` (content) “Ali ibn Ibrahim has narrated from his father from certain persons of h”; `blfh` (content) “‘Asking people to do good and to prohibit them from committing evil is”
- `1.21.3`: `blc2` (lead-in) “H 8238, Ch. 16, h 3”; `blc3` (content) “It also is narrated that the slogan of the Muslims on the day of Badr ”; `blfk` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘A people, who does not t”
- `1.22.13`: `blcy` (content) “H 8248, Ch. 17, h 10”; `bld1` (lead-in) “H 8249, Ch. 17, h 11”; `bld2` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”
- `1.22.17`: `blda` (lead-in) “H 8252, Ch. 17, h 14”; `bldb` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blde` (content) “H 8253, Ch. 17, h 15”
- `1.17.15`: `bldc` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Contest is permissible o”; `bldf` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”
- `1.23.1`: `bl5g9` (lead-in) “H 8255, Ch. 18, h 1”; `bldl` (content) “Ahmad ibn Muhammad al-Kufiy has narrated from Muhammad ibn Ahmad al-Qa”; `blhp` (content) ““The Messenger of Allah, O Allah, grant compensation to Muhammad and h”
- `1.23.2`: `bldn` (lead-in) “H 8256, Ch. 18, h 2”; `bldo` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”; `blhs` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.23.3`: `bldq` (lead-in) “H 8257, Ch. 18, h 3”; `bldr` (content) “The narrator of the previous through his chain of narrators has said t”; `blhv` (content) ““The Messenger of Allah, O Allah, grant compensation to Muhammad and h”
- `1.24.1`: `bldx` (lead-in) “H 8259, Ch. 19, h 1”; `bldy` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `blhz` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Allah, the most Majestic”
- `1.24.2`: `ble0` (lead-in) “H 8260, Ch. 19, h 2”; `ble1` (content) “It is narrated from the narrator of the previous Hadith from abu Marya”; `bli2` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Allah, the most Majestic”
- `1.24.3`: `ble3` (lead-in) “H 8261, Ch. 19, h 3”; `ble4` (content) “It is narrated from the narrator of the previous Hadith from Ahmad ibn”; `bli5` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Allah, the most Bless”
- `1.24.4`: `ble6` (lead-in) “H 8262, Ch. 19, h 4”; `ble7` (content) “It is narrated from the narrator of the previous Hadith from Ahmad fro”; `bli8` (content) ““I heard abu ‘Abd Allah, ‘Alayhi al-Salam, saying, ‘Believers must not”
- `1.24.5`: `ble9` (lead-in) “H 8263, Ch. 19, h 5”; `blea` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `blib` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘A believer must not humi”
- `1.31.8`: `blht` (content) “H 8301, Ch. 23, h 3”; `bli0` (content) “H 8303, Ch. 24, h 2”
- `1.31.9`: `blhu` (content) “The narrator of the previous Hadith through his chain of narrators has”; `bli1` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ‘Uth”
- `1.31.12`: `blhx` (content) “H 8302, Ch. 24, h 1”; `bli4` (content) “Ali ibn Ibrahim has narrated from his father from ‘Uthaman ibn ‘Isa fr”
- `2.2.2`: `bliz` (content) “H 8310, Ch. 2, h 2”; `blj1` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Zuhd (restraint from wor”
- `2.3.1`: `bl5gz` (content) “H 8312, Ch. 3, h 1”; `blj7` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `49`: `blk1` (content) “A number of our people have narrated from Ahmad ibn Muhammad from ibn ”; `blk3` (content) “H 8323, Ch. 3, h 12”
- `2.4.2`: `blkg` (content) “H 8327, Ch. 4, h 1”; `blkl` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Amir al-Mu’minin, ‘Al”
- `2.4.3`: `blkh` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn ‘Isma’il”; `blko` (content) ““I once came face to face with abu ‘Abd Allah, ‘Alayhi al-Salam, in on”
- `2.4.5`: `blkj` (content) “H 8328, Ch. 4, h 2”; `blkt` (lead-in) “H 8331, Ch. 4, h 5”; `blku` (lead-in) “Ahmad ibn abu ‘Abd Allah has narrated from Sharif ibn Sabiq from al-Fa”; `blkv` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that ‘Amir al-Mu’minin, ha”
- `2.4.6`: `blkk` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `blkw` (lead-in) “H 8332, Ch. 4, h 6”; `blkx` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Fadda”; `blky` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said that a man once visited Amir a”
- `2.4.8`: `blkm` (content) “H 8329, Ch. 4, h 3”; `bll2` (lead-in) “H 8334, Ch. 4, h 8”; `bll3` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `bll4` (content) ““I once visited abu ‘Abd Allah, ‘Alayhi al-Salam. He (the Imam) asked ”
- `2.4.9`: `blkn` (content) “A number of our people have narrated from Sahl ibn Ziyad from ‘Abd All”; `bll5` (lead-in) “H 8335, Ch. 4, h 9”; `bll6` (lead-in) “A number of our people have narrated from Sahl ibn Ziyad from Ibn Mahb”; `bll7` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that ’Amir al-Mu’minin, ‘A”
- `2.4.4`: `blkp` (lead-in) “H 8330, Ch. 4, h 4”; `blkq` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blkr` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that ‘Amir al-Mu’minin, ‘A”
- `2.4.7`: `blkz` (lead-in) “H 8333, Ch. 4, h 7”; `bll0` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bll1` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `2.4.13`: `blli` (lead-in) “H 8339, Ch. 4, h 13”; `bllj` (content) “A number of our people have narrated from Ahmad ibn ‘Abd Allah from hi”; `bllk` (content) ““I once saw abu ‘Abd Allah, ‘Alayhi al-Salam, with a shovel in his han”
- `2.4.16`: `bllp` (content) “H 8341, Ch. 4, h 15”; `blls` (lead-in) “H 8342, Ch. 4, h 16”; `bllt` (lead-in) “Ali ibn Muhammad has narrated from Ahmad ibn abu ‘Abd Allah from Muham”; `bllu` (content) ““Once abu ‘Abd Allah, ‘Alayhi al-Salam, gave me seven hundred dinars a”
- … 982 more in the TSV

**Opening invocations carrying a number** (2)

- `1.31.25`: `blih` “In the name of Allah, the Beneficient, the Merciful”
- `2.157.60`: `bl36h` “In the name of Allah, the Beneficient, the Merciful”

**Header numbers colliding with another block** (307)

- `1.2`: `bl5fy` (header) “Virtue and Excellence of Serving in the Army”; `bl4e` (header) “Chapter 2”
- `1.3`: `bl5g2` (header) “Jihad of Man and Woman”; `bl4i` (header) “Chapter 3”
- `1.4`: `bl5g0` (header) “Kinds of Jihad (struggle)”; `bl53` (header) “Chapter 4”
- `1.5`: `bl5g6` (header) “To Whom Does the Obligation of Jihad Apply, and to Whom it Does not Ap”; `bl5u` (header) “Chapter 5”
- `1.6`: `bl5fu` (header) “Mobilization Along with People when there is Fear for al-Islam”; `bl62` (header) “Chapter 6”
- … 302 more in the TSV

**Source / citation lines carrying a number** (3)

- `2.19.10`: `blt1` (content) ““I heard abu al-Hassan, Musa, ‘Alayhi al-Salam, read the following: ‘O”; `blti` (source) “(Fatwa best explains this Hadith)”
- `2.58.8`: `bl5qf` (source) “(Al-Saduq in Ma‘ani al-Akhbar has said the following to be of the qual”; `bl1gw` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘You must not intermingle”
- `3.191.1`: `bl5fm` (content) “(It is of words of Yunus) Ali ibn Ibrahim has narrated from his father”; `bl5fn` (source) “(This passage is of the words of Yunus, not a Hadith from ’A’immah ‘Al”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (837)

- `1.1.2`: `bl30` (lead-in) “H 8159, Ch. 1, h 2”; `bl31` (lead-in) “Ali ibn Ibrahim has narrated from his father, from al-Nawfaliy from al”; `bl32` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.1.3`: `bl33` (lead-in) “H 8160, Ch. 1, h 3”; `bl34` (lead-in) “Through the chains of his narrator Ali ibn Ibrahim has narrated the fo”; `bl35` (content) ““The Messenger of Allah, O Allah, grant compensation to Muhammad and h”
- `1.1.4`: `bl36` (lead-in) “H 8161, Ch. 1, h 4”; `bl37` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl38` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, once wrote in a letter to a certain ind”
- `1.1.10`: `bl3k` (lead-in) “H 8164, Ch. 1, h 7”; `bl3l` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl3m` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Allah, the Most Majes”
- `1.1.11`: `bl3n` (lead-in) “H 8165, Ch. 1, h 8”; `bl3o` (lead-in) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl3p` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- … 832 more in the TSV

### Bihar al-Anwaar Volume 4 (`bihar_al_anwaar_volume_4_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (601)

- `1.3.1`: `bl5c` (content) “1 - يد، ن: اهلمداين، عن علي، عن أبيه، عن علي بن معبد، عن احلسني بن خال”; `bl6d` (content) “1 - يد، مع: أيب، عن سعد، عن ابن يزيد، عن العباس بن هالل قال: سألت الرض”; `bl6e` (content) “My father, from Sa’ad, from Ibn Yazeed, from Al Abbas Bin Hilal who sa”
- `1.3.2`: `bl5e` (content) “فقال: قاتلهم اهلل لقد حذفوا أول احلديث، إن رسول اهلل صلى اهلل عليه وال”; `bl6f` (lead-in) “2 - ويف رواية الربقي: هدى من يف السماوات وهدي من يف االرض.”; `bl6g` (content) “And in a report of Al Barqy — ‘A Guide for the ones in the skies, and ”
- `1.3.3`: `bl5g` (content) “2 - مع: أيب، عن علي، عن أبيه، عن ابن أيب عمري، عن ابن اذينة، عن حممد ب”; `bl6h` (content) “3 - ج: عن العباس بن هالل: قال سألت أبا احلسن عليه السالم عن قول اهلل ع”; `bl6i` (content) “From Al Abbas Bin Hilal who said, ‘I asked Abu Al-Hassan about the Wor”
- `1.3.4`: `bl5i` (content) “3 - يد، مع: غري واحد من أصحابنا، عن االسدي، عن الربمكي، عن احلسني ابن ”; `bl6j` (content) “4 - يد، مع: إبراهيم بن هارون اهليسيت، عن حممد بن أمحد بن أيب الثلج، عن”; `bl6k` (content) “Ibrahim Bin Haroun Al Haysati, from Muhammad Bin Ahmad Bin Abu Al Salf”
- `1.3.5`: `bl5k` (content) “فقال: إن الروح متحرك كالريح، وإمنا مسي روحا النه اشتق امسه من الريح، و”; `bl6l` (content) “قال: قلت: ” مثل نوره “ قال يل: حممد صلى اهلل عليه واله، قلت: ” كمشكوة ”; `bl6m` (content) “He (the narrator) said, ‘I said, ‘An example of His Light [24:35]’. He”
- `1.3.6`: `bl5m` (content) “4 - ج: محران بن أعني قال: سألت أبا جعفر عليه السالم عن قول اهلل عزوجل:”; `bl6n` (content) “قلت: ” كأهنا “ قال: الي شئ تقرأ كأهنا ؟ قلت:وكيف جعلت فداك ؟ قال: كأنه”; `bl6o` (content) “I said, ‘as if it’. He said: ‘For which thing would you read ‘As if it”
- `1.3.7`: `bl5o` (content) “5 - مع: غري واحد، عن االسدي، عن الربمكي، عن علي بن العباس، عن عبيس ابن”; `bl6p` (content) “قلت: ” يكاد زيتها يضيئ ولو مل متسسه نار “ قال: يكاد العلم خيرج من فم ا”; `bl6q` (content) “I said, ‘Its oil almost illuminates and even though fire does not touc”
- `1.3.8`: `bl5q` (content) “6 - يد: القطان، عن السكري، عن احلكم بن أسلم، عن ابن عيينة، عن اجلريري،”; `bl6r` (content) “5 - فس: محيد بن زياد، عن حممد بن احلسني، عن حممد بن حيىي، عن طلحة بن ز”; `bl6s` (content) “Humeyd Bin Ziyad, from Muhammad Bin Al Husayn, from Muhammad Bin Yahya”
- `1.3.10`: `bl5t` (content) “8 - يد: السناين واملكتب والدقاق مجيعا، عن االسدي: عن الرب مكي، عن علي ”; `bl6v` (lead-in) “مث قال: فاملؤمن من يتقلب يف مخسة من النور ” مدخله نور، وخمرجه نور، وعل”; `bl6w` (content) “Then he said: ‘So, the Momin is one who turn in five of ‘النور ‘the li”
- `1.3.11`: `bl5v` (content) “9 - يد: ابن املتوكل، عن علي، عن أبيه، عن ابن أيب عمري، عن ابن اذينة، ع”; `bl6x` (lead-in) “قلت: جلعفر عليه السالم: جعلت فداك يا سيدي إهنم يقولون: مثل نور الرب، ق”; `bl6y` (content) “I said to Ja’far, ‘May I be sacrificed for you! O my Masters! They are”
- `1.3.12`: `bl5x` (content) “10 - يد: أيب، عن سعد، عن ابن عيسى، عن ابن فضال، عن احلليب وزرارة، عن أ”; `bl6z` (content) “6 - فس: حممد بن مهام، عن جعفر بن حممد، عن حممد بن احلسن الصائغ، عن احل”; `bl70` (content) “Muhammad Bin Hamam, form Ja’far Bin Muhammad, from Muhammad Bin Al Has”
- `1.3.13`: `bl5z` (content) “11 - شى: عن زرارة ومحران، عن أيب جعفر، وأيب عبد اهلل عليه السالم يف قو”; `bl71` (content) “ال شرقية وال غربية &#8221 ال يهودية وال نصرانية، &#8220 يكاد زيتها &#8”; `bl72` (content) “Its oil almost illuminates — illumination of the knowledge, which almo”
- `1.3.14`: `bl61` (content) “12 - شى: عن حممد بن مسلم، عن أيب جعفر عليه السالم قال: سألته عن قول اه”; `bl73` (content) “7 - كا: علي بن حممد، عن علي بن العباس، عن علي بن محاد، عن عمرو بن مشر،”; `bl74` (content) “Ali Bin Muhammad, from Ali Bin al Abbas, from Ali Bin Hamad, from Amro”
- `1.3.15`: `bl63` (content) “13 - شى: عن حممد بن اور مة، عن أيب جعفر االحوال، عن أيب عبد اهلل عليه ”; `bl75` (content) “وقوله: &#8221 املصباح يف زجاجة &#8220 يقول: إين اريد أن أقبضك فاجعل ال”; `bl76` (content) “And His Words: the lamp is in a glass, He is Saying: “I Wanted to Make”
- `1.3.16`: `bl65` (content) “14 - شى: يف رواية مساعة عنه عليه السالم خلق آدم فنفخ فيه، وسألته عن ال”; `bl77` (lead-in) “” وهو قول اهلل عزوجل: “ إن اهلل اصطفى آدم ونوحا وآل إبراهيم وآل عمران ”; `bl78` (content) “And these are the Words of Allah Mighty and Majestic: Surely Allah cho”
- `1.3.17`: `bl67` (content) “15 - يد: ابن الربقي، عن أبيه، عن جده أمحد، عن أبيه، عن عبد اهلل بن حبر”; `bl79` (content) “” ال شرقية وال غربية &#8220 يقول: لستم بيهود فتصلوا قبل املغرب، وال نص”; `bl7a` (content) “(As for): neither eastern nor western [24:35] — He is saying: “You are”
- `1.3.18`: `bl69` (content) “الزهري روي عن احلسن أنه كان يقول: مر رسول اهلل صلى اهلل عليه واله برجل”; `bl7b` (content) “” وقوله عزوجل: &#8220 يكاد زيتها يضيئ ولو مل متسسه نار نور على نور يهد”; `bl7c` (content) “And the Words of the Mighty and Majestic: Its oil almost illuminates a”
- `1.3.9`: `bl6t` (content) “” زيتونة ال شرقية وال غربية “ قال: على سواء اجلبل ال غربية أي ال شرق ه”; `bl6u` (content) “Olive tree neither eastern nor western, upon the evenness of (the moun”
- `1.4.1`: `bl7f` (content) “1 - يد: ما جيلويه، عن عمه، عن الربقي، عن أبيه، عن حممد بن سنان، عن أيب”; `bl7g` (content) “Majaylawiya, from his uncle, from Al Barqy, from his father, from Muha”
- `1.4.2`: `bl7h` (content) “قلت: يا أمري املؤمنني وما احلجزة ؟ قال: اهلل أعظم من أن يوصف حبجزة أو ”; `bl7i` (content) “I said, ‘O Amir Al-Momineen! And what is the ‘Hujzat’?’ He said: ‘Alla”
- `1.4.3`: `bl7j` (content) “2 - يد، ن: أيب، عن سعد، عن ابن عيسى، عن احلسن بن علي اخلزاز، عن أيب اح”; `bl7k` (content) “My father, from Sa’ad, from Ibn Isa, from Al Hassan Bin Ali Al Khazaz,”
- `1.4.4`: `bl7l` (content) “3 - ن، يد: الدقاق، عن االسدي، عن الربمكي، عن علي بن العباس، عن احلسن ب”; `bl7m` (content) “Al Dqaqaq, from Al Asady, from Al Barmakky, from Ali Bin Al Abbas, fro”
- `1.5.3`: `bl7x` (content) “1 - ىل: أمحد بن علي بن إبراهيم بن هاشم، عن علي بن معبد، عن واصل، عن عب”; `bl7y` (content) “Ahmad Bin Ali Bin Ibrahim Bin Hashim, from Ali Bin Ma’bad, from Wasil,”
- `1.5.4`: `bl7z` (content) “قال: مل تره العيون مبشاهدة العيان، ورأته القلوب حبقائق االميان، اليعرف”; `bl80` (content) “He: ‘The eyes do not seen Him with the witnessing of the eyes, and the”
- `1.5.6`: `bl83` (content) “2 - يد، ىل: القطان والدقاق والسناين، عن ابن زكريا القطان، عن حممد ابن ”; `bl84` (content) “Al Qatan, and Al Daqaq, and Al Sinany, from Ibn Zakariyya Al Qatan, fr”
- `1.5.7`: `bl85` (content) “قال: ويلك مل تره العيون مبشاهدة االبصار، ولكن رأته القلوب حبقائق االمي”; `bl86` (content) “He said: ‘Woe be unto you! The eyes do not see Him with the witnessing”
- `1.5.8`: `bl87` (content) “لطيف اللطافة ال يوصف باللطف،عظيم العظمة ال يوصف بالعظم، كبري الكربياء ”; `bl88` (content) “A Subtle, the subtleness cannot be described by the subtlety; A Magnif”
- `1.5.9`: `bl89` (content) “هو يف االشياء على غري ممازجة، خارج منها على غري مباينة، فوق كل شئ وال ”; `bl8a` (content) “He is in the things upon without a mixture, outside from it upon witho”
- `1.5.10`: `bl8b` (content) “3 - يل: علي بن أمحد بن موسى، عن الصويف، عن الروياين، عن عبد العظيم احل”; `bl8c` (content) “Ali Bin Ahmad Bin Musa, from Al Sowfy, from Al Ruyani, from Abdul Azee”
- `1.5.11`: `bl8d` (content) “4 - ىل: املكتب، عن حممد االسدي، عن ابن بزيع، عن الرضا عليه السالم يف ق”; `bl8e` (content) “Al Maktab, from Muhammad al Asady, from Ibn Yazie, ‘From Al-Reza regar”
- `1.5.12`: `bl8f` (content) “5 - يل: الطالقاين، عن ابن عقدة، عن املنذر بن حممد، عن علي بن إمساعيل ا”; `bl8g` (content) “Al Talaqany, from Inn Aqdat, from Al Manzar Bin Muhammad, from Ali Bin”
- `1.5.13`: `bl8h` (content) “6 - يد، ن، ىل: اهلمداين، عن علي، عن أبيه، عن اهلروي قال: قلت لعلي ابن ”; `bl8i` (content) “Al Hamdany, from Ali, from his father, from Al Harwy who said, ‘I said”
- `1.5.14`: `bl8j` (content) “فقال عليه السالم: يا أبا الصلت إن اهلل تبارك وتعاىل فضل نبيه حممدا صلى”; `bl8k` (content) “So, he said: ‘O Abu Salt! Allah Blesses and Exalted merited His Prophe”
- `1.5.15`: `bl8l` (content) “قال اهلل عزوجل: ” من يطع الرسول فقد أطاع اهلل “ وقال: ” إن الذين يبايع”; `bl8m` (content) “The Mighty and Majestic Said: ‘There is one who obeys the Rasool, so h”
- `1.5.17`: `bl8p` (content) “فقال عليه السالم: يا أبا الصلت من وصف اهلل بوجه كالوجوه فقد كفر، ولكن ”; `bl8q` (content) “He said: ‘O Abu Salt! One who described Allah with a face like the fac”
- `1.5.18`: `bl8r` (content) “وقال اهلل عزوجل: ” كل من عليها فإن ويبقى وجه ربك “ وقال عزوجل: ” كل شئ”; `bl8s` (content) “And Allah Mighty and Majestic Said: Everyone upon it will perish [55:2”
- `1.5.19`: `bl8t` (content) “وقد قال النيب صلى اهلل عليه واله: من أبغض أهل بييت وعرتيت مل يرين ومل ”; `bl8u` (content) “And the Prophet has said: ‘One who hates the People of my Household, a”
- `1.5.20`: `bl8v` (content) “7 - يل: ابن ناتانة، عن علي، عن أبيه، عن ابن أيب عمري، عن إبراهيم الكرخ”; `bl8w` (content) “Ibn Natanat, from Ali, from his father, from Ibn AbuUmeyr, from Ibrahi”
- `1.5.21`: `bl8x` (content) “8 - شا، ج: روى أهل السري أن رجال جاء إىل أمري املؤمنني عليه السالم فقا”; `bl8y` (content) “It is reported by the travelling people that a man came to Amir Al-Mom”
- `1.5.24`: `bl93` (content) “9 - ج: يف خرب الزنديق الذي سأل أمري املؤمنني عليه السالم عما تومهه من ”; `bl94` (content) “In a Hadeeth of the atheist who asked Amir Al-Momineen about what he t”
- `1.5.26`: `bl97` (content) “فعند ذلك اثيبوا بدخول اجلنة والنظر إيل ما وعدهم اهلل عزوجل، فذلك قوله:”; `bl98` (content) “So, during that, they would be Rewarded by the entering the Paradise a”
- `1.5.28`: `bl9b` (content) “وقوله يف آخر اآلية: ” ما زا البصر وما طغى لقد رأى من آيات ربه الكربى “”; `bl9c` (content) “And His Words in another Verse: Neither did the sight deviate nor did ”
- `1.5.29`: `bl9d` (content) “10 - ج: يونس بن ظبيان قال: دخل رجل على أيب عبد اهلل عليه السالم قال: أ”; `bl9e` (content) “Yunus Bin Zabyan who said, ‘A man came to Abu Abdullah and said, ‘Do y”
- `1.5.30`: `bl9f` (content) “11 - ج: عن عبد اهلل بن سنان، عن أيب عبد اهلل عليه السالم يف قوله: ” ال”; `bl9g` (content) “From Abdullah Bin Sinan, ‘From Abu Abdullah regarding His Words: Visio”
- `1.5.32`: `bl9j` (content) “12 - ج: أمحد بن إسحاق قال: كتبت إيل أيب احلسن علي بن حممد عليهما السال”; `bl9k` (content) “Ahmad Bin Is’haq who said, ‘I wrote to Abu Al-Hassan Ali Bin Muhammad ”
- `1.5.33`: `bl9l` (content) “13 - يد: ابن إدريس، عن أبيه، عن أمحد بن إسحاق قال: كتبت إىل أيب احلسن ”; `bl9m` (content) “Ibn Idrees, from his father, from Ahmad Bin Is’haq who said, ‘I wrote ”
- `1.5.34`: `bl9n` (content) “14 - يد: الدقاق، عن الكليين، عن أمحد بن إدريس، عن حممد بن عبد اجلبار، ”; `bl9o` (content) “Al Daqaq, from Al Kulayni, from Ahmad Bin Idrees, from Muhammad Bin Ab”
- `1.5.36`: `bl9r` (content) “فقال أبو احلسن عليه السالم: فمن املبلغ عن اهلل عزوجل إىل الثقلني اجلن ”; `bl9s` (content) “Abu Al-Hassan said: ‘So, who delivered from Allah Mighty and Majestic ”
- `1.5.37`: `bl9t` (content) “قال: فكيف جييئ رجل إيل اخللق مجيعا فيخربهم أنه جاء من عند اهلل وأنه يد”; `bl9u` (content) “He said: ‘How can a man come over to the people and he informs them th”
- `1.5.38`: `bl9v` (content) “قال أبو قرة: فإنه يقول: ” ولقد رآه نزلة اخري “ فقال أبو احلسن عليه الس”; `bl9w` (content) “Abu Qarat said, ‘But He is Saying: And certainly he saw it [53:13] (me”
- `1.5.40`: `bl9z` (content) “فقال أبو قرة فتكذب الروايات ؟ فقال أبو احلسن عليه السالم: إذا كانت الر”; `bla0` (content) “So, Abu Qarat said, ‘So (then) you are belying the reports’. Abu Al-Ha”
- `1.5.41`: `bla1` (content) “15 - يد: أيب، عن حممد العطار، عن ابن عيسى، عن البزنطي، عن الرضا عليه ا”; `bla2` (content) “My father, from Muhammad Al Attar, from Ibn Isa, from Al Bazanty, ‘Fro”
- `1.5.42`: `bla3` (content) “16 - يد: ابن الوليد، عن الصفار، عن أمحد بن حممد، عن أيب هاشم اجلعفري، ”; `bla4` (content) “Ibn Al Waleed, from Al Saffar, from Ahmad Bin Muhammad, from Abu Hashi”; `bla5` (content) “17 - يد: الدقاق، عن االسدي، عمن ذكره، عن حممد بن عيسى، عن أيب هاشم اجل”
- `1.5.43`: `bla6` (content) “Al Daqaq, from Al Asady, from the one who mentioned it, from Muhammad ”; `bla7` (content) “18 - يد: الدقاق، عن االسدي، عن الربمكي، عن ابن أبان، عن بكر بن صاحل، ع”
- `1.5.44`: `bla8` (content) “Al Daqaq, from Al Asady, from Al Barmakky, from Ibn Aban, from Bakr Bi”; `bla9` (content) “فخر ساجدا مث قال: سبحانك ما عرفوك وال وحدوك فمن أجل ذلك وصفوك، سبحانك ”
- `1.5.46`: `blab` (lead-in) “سبحانك كيف طاوعتهم أنفسهم أن شبهوك بغريك إهلي ال أصفك إال مبا وصفت به ”; `blac` (content) “Glory be to You! How they obeyed their own selves and resembled You wi”; `blad` (content) “مث التفت إلينا فقال: ما تو مهتم من شئ فتومهوا اهلل غريه.”
- `1.5.48`: `blag` (content) “Then he said: ‘We, the Progeny of Muhammad of the central modality whi”; `blah` (content) “قال: قلت: جعلت فداك من كانت رجاله يف خضرة ؟ قال: ذاك حممد صلى اهلل علي”
- `1.5.49`: `blai` (content) “He (the narrator) said, ‘I said, ‘May I be sacrificed for you! Who wou”; `blaj` (content) “19 - يد: ابن الوليد، عن إبراهيم بن هاشم، عن ابن أيب عمري، عن مرازم، عن”
- `1.5.51`: `blal` (content) “And that the ratification of that is what Ibn Al Waleed narrated to us”; `blam` (content) “20 - يد: أيب، عن سعد، عن االصفهاين، عن املنقري، عن حفص أو غريه قال سأل”
- `1.5.52`: `blan` (content) “My father, from Sa’ad, from Al Isfahany, from Al Manqary, from Hafs or”; `blao` (content) “21 - يد: الدقاق، عن االسدي، عن علي بن أيب القاسم، عن يعقوب بن إسحاق قا”
- … 541 more in the TSV

**Opening invocations carrying a number** (7)

- `1.5.80`: `blc7` “فتبسم عليه السالم مث قال: يا معاوية ما أقبح بالرجل يأيت عليه سبعون سنة أو مثانون سنة يعيش يف ملك اهل”
- `2.3.170`: `blz6` “وقال: فكل أمر يريده اهلل فهو يف علمه قبل أن يصنعه، ليس شئ يبدو له إال وقد كان يف علمه، إن اهلل ال يب”
- `3.4.9`: `bl1e1` “He is the One Who Shapes you in the wombs however He so Desires to; there is no god except Him, the ”
- `3.4.79`: `bl1hx` “He is the One Who Shows you the lightning Causing fear and hope and Raises the heavy cloud [13:12]”
- `3.4.81`: `bl1hy` “ويسبح الرعد حبمده واملالئكة من خيفته ويرسل الصواعق فيصيب هبا من يشاء وهم جيادلون يف اهلل وهو شديد اح”
- `3.4.188`: `bl1nz` “He is the First and the Last, and the Apparent and the Hidden, and He is a Knower of all things [57:”
- `3.4.197`: `bl1oh` “He is the One Who Created you all, so from you is a Kafir and from you is a Momin, and Allah Sees wh”

**Header numbers colliding with another block** (7)

- `1`: `bl30` (source) “(أبواب تأويل االيات) (واالخبار الموهمة لخالف ما سبق)”; `bl31` (header) “Section 1 — Chapters of the Interpretations of the Verses and the Impo”
- `1.1`: `bl32` (source) “(باب 1) (تأويل قوله تعالى: خلقت بيدى، وجنب اهلل، ووجه اهلل،) (ويوم يكش”; `bl33` (header) “Chapter 1 — Interpretation of the Words of the Exalted: Created by My ”
- `2.3`: `bl36` (content) “2 - يد، مع: ابن عصام، عن الكليين، عن العالن، عن اليقطيين قال: سألت أبا”; `blps` (header) “Chapter 3 — The Change of Decision and the Abrogation ‘Badah’”
- `2.4`: `bl38` (content) “ومعناه إذ قالوا: إن االرض مجيعا قبضته يوم القيامة والسماوات مطويات بيم”; `blzz` (header) “Chapter 4 – The Power and the Will (Intention)”
- `2.5`: `bl3a` (content) “كما قال عزوجل: وما قدروا اهلل حق قدره &#8221 إذ قالوا: ما أنزل اهلل عل”; `bl13g` (header) “Chapter 5 — Allah the Exalted is the Creator of All Things, and the Ex”
- … 2 more in the TSV

**Source / citation lines carrying a number** (3)

- `1.3.19`: `bl6b` (source) “(باب 3) (تأويل آية النور)”; `bl7d` (source) “(باب 4) (معنى حجزة اهلل عزوجل)”
- `1.5.94`: `bld0` (content) “And if that recognition which is from an aspect of the sighting, would”; `bld1` (source) “(ابواب الصفات)”
- `2.2.174`: `blp1` (content) “34 - كشف: من دالئل احلمريي، عن اجلعفري مثله، ويف آخره: تعاىل اجلبار ال”; `blp2` (source) “From the evidence of Al-Humeyri, from Al-Ja’fary is similar to it, and”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (667)

- `1.4.5`: `bl7n` (lead-in) “واهلل ما نزعم أهنا حجزة االزار ولكنها أعظم من ذلك، جييئ رسول اهلل صلى ”; `bl7o` (content) “By Allah! We do not claim that it is a mid-part of the trouser, but it”
- `1.4.6`: `bl7p` (lead-in) “4 - وقد روي عن الصادق عليه السالم أنه قال: الصالة حجزة اهلل، وذلك أهنا”; `bl7q` (content) “And it has been reported from Al-Sadiq having said: ‘Al-Salat is a ‘Hu”
- `1.5.1`: `bl7t` (lead-in) “االيات: النساء ” 4 :“ يسألك أهل الكتاب أن تنزل عليهم كتابا من السماء ف”; `bl7u` (content) “The Verses — (Surah) Al-Nisaa: The People of the Book ask you to bring”
- `1.5.2`: `bl7v` (lead-in) “االنعام ” 6 :“ ال تدركه االبصار وهو يدرك االبصار وهو اللطيف اخلبري 103”; `bl7w` (content) “(Surah) Al-Anaam: Visions cannot comprehend Him, and He Comprehends th”
- `1.5.5`: `bl81` (lead-in) “قال: فخرج الرجل وهو يقول: اهلل أعلم حيث جيعل رسالته.”; `bl82` (content) “He (the narrator) said, ‘So, the man went out and he was saying, ‘Alla”
- … 662 more in the TSV

### Yashts (`yashts_zoroastrianism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (460)

- `1.1`: `bl2v` (content) “I praise well-thought, well-spoken, and well-done thoughts, words, and”; `bl2w` (content) “I give sacrifice and prayer unto you, O Amesha-Speṇtas! even with the ”; `bl2x` (content) “I recite the 'Praise of Holiness :’”; `bl2z` (lead-in) “I confess myself a worshipper of Mazda, a follower of Zarathustra, one”; `bl203` (lead-in) “For sacrifice prayer, propitiation, and glorification unto [Hâvani] th”; `bl30` (content) “For sacrifice, prayer, propitiation, and glorification unto [Sâvanghi ”; `bl34` (content) “Zarathustra asked Ahura Mazda: ‘O Ahura Mazda, most beneficent Spirit,”
- `1.2`: `bl2y` (content) “'Ashem Vohû: Holiness is the best of all good. Well is it for it, well”; `bl31` (content) “For sacrifice, prayer, propitiation, and glorification unto the Master”; `bl204` (lead-in) “'What of the Holy Word is the strongest? What is the most victorious? ”; `bl36` (content) “‘What is the most fiend-smiting? What is the best-healing? What destro”
- `1.3`: `bl32` (content) “Unto AHURA MAZDA, bright and glorious, be propitiation, with sacrifice”; `bl205` (content) “Ahura Mazda answered: 'Our Name, O Spitama Zarathustra! who are the Am”
- `1.4`: `bl33` (content) “Yathâ ahû vairyô: The will of the Lord is the law of holiness: the ric”; `bl37` (content) “‘That is the most fiend-smiting; that is the best-healing; that destro”
- `1.9`: `bl3j` (lead-in) “‘My eleventh name is He who produces weal.”; `bl3k` (content) “‘My twelfth name is AHURA (the Lord)”; `bl3t` (content) “‘Worship me, O Zarathustra, by day and by night, with offerings of lib”
- `1.10`: `bl3l` (content) “‘My thirteenth name is the most Beneficent.”; `bl3u` (content) “‘If thou wantest, O Zarathustra, to destroy the malice of Daêvas and M”
- `1.11`: `bl3m` (content) “‘My fourteenth name is He in whom there is no harm”; `bl3v` (content) “And of the hordes with the wide front, with the many spears with the s”
- `1.12`: `bl3n` (content) “‘My fifteenth name is the unconquerable One.”; `bl3w` (content) “‘I am the Keeper I am the Creator and the Maintainer I am the Discerne”
- `1.13`: `bl3o` (content) “‘My sixteenth name is He who makes the true account”; `bl3x` (content) “‘My name is the bestower of health; my name is the best bestower of he”; `bl45` (content) “‘My name is the Protector; my name is the Well-wisher; my name is the ”
- `1.14`: `bl3p` (content) “‘My seventeenth name is the All-seeing One.”; `bl3y` (content) “‘My name is the Âthravan my name is the most Âthravan-like of all Âthr”; `bl46` (content) “‘My name is the Discerner; my name is the Best Discerner.”; `bl4a` (content) “‘My name is He who does not deceive; my name is He who is not deceived”
- `1.15`: `bl3q` (content) “‘My eighteenth name is the healing One.”; `bl3z` (content) “‘My name is Ahura (the Lord).”; `bl47` (content) “‘My name is the Prosperity-producer my name is the Word of Prosperity”; `bl4b` (content) “‘My name is the good Keeper; my name is He who destroys malice; my nam”; `bl4c` (lead-in) “‘My name is All weal; my name is Full weal; my name is the Master of w”; `bl4d` (content) “‘My name is He who can benefit at his wish; my name is He who can best”
- `1.16`: `bl3r` (content) “‘My nineteenth name is the Creator.”; `bl40` (content) “‘My name is Mazdāu (the all-knowing).”; `bl48` (content) “‘My name is the King who rules at his will; my name is the King who ru”; `bl4e` (lead-in) “‘My name is the Beneficent One; my name is the Energetic One; my name ”; `bl4f` (lead-in) “‘My name is Holiness; my name is the Great One; my name is the good So”; `bl4g` (lead-in) “‘My name is the Wise One; my name is the Wisest of the Wise; my name i”; `bl4h` (content) “‘These are my names.”
- `1.17`: `bl3s` (content) “My twentieth name is MAZDA (the All-knowing One).”; `bl41` (content) “‘My name is the Holy; my name is the most Holy.”; `bl49` (content) “‘My name is the liberal King my name is the most liberal King.”; `bl4i` (lead-in) “‘And he who in this material world, O Spitama Zarathustra! shall recit”; `bl206` (content) “'He who shall pronounce them, when he rises up or when he lays him dow”
- `1.18`: `bl42` (content) “‘My name is the Glorious; my name is the most Glorious.”; `bl4j` (content) “‘That man, neither in that day nor in that night, shall be wounded by ”
- `1.19`: `bl43` (content) “‘My name is the Full-seeing; my name is the Fullest-seeing.”; `bl4k` (content) “‘But those names shall come in to keep him from behind and to keep him”
- `1.20`: `bl44` (content) “‘My name is the Far-seeing; my name is the Farthest-seeing.”; `bl4l` (content) ““Who is he who will smite the fiend in order to maintain thy ordinance”
- `1.22`: `bl4n` (content) “'Yathâ ahû vairyô: The will of the Lord . . . .”; `bl4p` (content) “‘We worship the Ahuna Vairya We worship Asha-Vahista, most fair, undyi”
- `1.23`: `bl4o` (content) “'Ashem Vohû: Holiness is the best of all good. . . .”; `bl4q` (lead-in) “‘Yênghê hâtãm All those beings of whom Ahura Mazda knows the goodness ”; `bl4r` (content) “'Yathâ ahû vairyô: The will of the Lord is the law of holiness . . . .”
- `1.24`: `bl4s` (content) “‘I bless the sacrifice and the prayer unto Ahura Mazda, bright and glo”; `bl4u` (content) “'O Zarathustra! keep thou for ever that man who is friendly [to me] fr”
- `1.25`: `bl4t` (content) “(Bahman Yaśt”; `bl4v` (content) “'Here is Vohu-Manô, my creature, O Zarathustra! here is Asha-Vahista, ”
- `1.27`: `bl4x` (content) “‘A thousand remedies, ten thousand remedies”; `bl50` (content) “‘[We worship] the well-shapen, tall-formed Strength; Verethraghna, mad”
- `1.28`: `bl4y` (content) “‘A thousand remedies, ten thousand remedies!”; `bl51` (content) “'And with the help of Spenta-Ârmaiti, break ye asunder their malice, t”
- `1.29`: `bl4z` (content) “‘A thousand remedies, ten thousand remedies!”; `bl52` (lead-in) “‘When, O Mazda! shall the faithful smite the wicked When shall the fai”; `bl53` (content) “Then Zarathustra said: ‘I threw you back into the earth and by the eye”
- `1.32`: `bl56` (content) “‘We worship the understanding of Ahura Mazda, to study the Holy Word.”; `bl59` (content) “'We worship that creation [of Ahura's], Speṇta-Ârmaiti; and the holy c”
- `1.33`: `bl57` (content) “‘We worship the tongue of Ahura Mazda, to speak forth the Holy Word.”; `bl5a` (content) “‘Here I take as lord and master the greatest of all, Ahura Mazda; to s”; `bl5b` (lead-in) “'Ashem Vohû: Holiness is the best of all good. . . .”; `bl5c` (content) “‘[Give] unto that man brightness and glory, give him health of body, g”
- `1.34`: `bl58` (content) “‘We worship the mountain that gives understanding, that preserves unde”; `bl5d` (content) “‘May it come according to my blessing”; `bl5f` (content) “‘Come to me for help, O Mazda!”; `bl5h` (content) “‘We worship Râma Hvâstra, and Vayu who works highly and is more powerf”
- `1.35`: `bl5e` (content) “‘A thousand remedies, ten thousand remedies (three times.)”; `bl5g` (content) “‘We worship the well-shapen, tall-formed Strength, and Verethraghna, m”; `bl5i` (content) “'Ashem Vohû: Holiness is the best of all good . . . .'”
- `2.1`: `bl5u` (content) “May Ahura Mazda be rejoiced ! . . . .”; `bl5y` (header) “I.”; `bl5z` (content) “To Ahura Mazda, bright and glorious, and to the Amesha-Speṇtas;”
- `2.2`: `bl5v` (content) “Ashem Vohû: Holiness is the best of all good . . . .”; `bl61` (content) “To Asha-Vahista, the fairest; to the much-desired Airyaman; to the ins”; `bl6c` (header) “II.”
- `2.3`: `bl5w` (content) “I confess myself a worshipper of Mazda, a follower of Zarathustra, one”; `bl62` (content) “To the good Spenta-Ârmaiti, and to the good Râta, with eyes of love, m”
- `2.4`: `bl5x` (content) “For sacrifice, prayer, propitiation, and glorification unto [Hâvani], ”; `bl65` (content) “(At the Gâh Hâvan): To Mithra, the lord of wide pastures and to Râma H”
- `2.1.6`: `bl69` (content) “(At the Gâh Usahin): To the holy, devout, fiend-smiting Sraosha, who m”; `bl6a` (lead-in) “Be propitiation, with sacrifice, prayer, propitiation, and glorificati”; `bl6b` (content) “Yathâ ahû vairyô: The will of the Lord is the law of holiness . . . .”
- `2.7`: `bl6e` (content) “We sacrifice unto Vohu-Manô, the Amesha-Speṇta; we sacrifice unto Peac”; `bl6f` (content) “We sacrifice unto Asha-Vahista, the fairest, the Amesha-Speṇta; we sac”
- `2.9`: `bl6i` (content) “We sacrifice unto Haurvatâṭ, the Amesha-Speṇta; we sacrifice unto the ”; `bl6k` (content) “(At the Gâh Hâvan): We sacrifice unto Mithra, the lord of wide pasture”
- `2.10`: `bl6j` (content) “We sacrifice unto Ameretâṭ, the Amesha-Speṇta; we sacrifice unto fatne”; `bl6l` (lead-in) “(At the Gâh Rapithwin): We sacrifice unto Asha-Vahista and Âtar, the s”; `bl6m` (content) “(At the Gâh Uzîren): We sacrifice unto Apãm Napât, the swift-horsed, t”; `bl6n` (content) “(At the Gâh Aiwisrûthrem): We sacrifice unto the good, powerful, benef”
- `2.11`: `bl6o` (content) “(At the Gâh Usahin): We sacrifice unto the holy, tall-formed, fiend-sm”; `bl6q` (content) “Let the Yatus be crushed, O Zarathustra both Daêvas and men”
- `2.17`: `bl6y` (lead-in) “I bless the sacrifice and the prayer, the strength and vigour”; `bl6z` (lead-in) “Of Ahura Mazda, bright and glorious, and of the Amesha-Speṇtas;”; `bl70` (lead-in) “Of Vohu-Manô; of Peace, whose breath is friendly . . . .”; `bl71` (lead-in) “Of Asha-Vahiśta, the fairest; of the much-desired Airyaman . . . .”; `bl72` (lead-in) “Of Khshathra-Vairya, of the metals”; `bl73` (content) “Of the good Speṇta-Ârmaiti and of the good Râta . . . .”; `bl76` (content) “(At the Gâh Hâvan): Of Mithra . . . .”; `bl78` (lead-in) “(At the Gâh Uzîren): Of the high lord Apãm Napât . . . .”; `bl79` (lead-in) “(At the Gâh Aiwisrûthrem): Of the Fravashis of the faithful . . .”; `bl23z` (content) “(At the Gâh Usahin): Of the holy, devout, fiend-smiting Sraosha, who m”; `bl7b` (lead-in) “Ashem Vohû: Holiness is the best of all good . . .”; `bl7c` (content) “Give unto that man brightness and glory, give him health of body, give”
- `2.18`: `bl74` (lead-in) “Of Haurvatât, the master . . . .”; `bl75` (content) “Of Ameretât, the master . . . .”; `bl77` (content) “(At the Gâh Rapithwin): Of Asha-Vahista . . .”
- `3.1`: `bl7g` (content) “May Ahura Mazda be rejoiced! . . . .”; `bl7i` (content) “I confess myself a worshipper of Mazda, a follower of Zarathustra, one”; `bl208` (lead-in) “Unto Asha-Vahiśta, the fairest; unto the much-desired Airyaman, made b”; `bl7j` (lead-in) “Be propitiation, with sacrifice, prayer, propitiation, and glorificati”; `bl7k` (content) “Yathâ ahû vairyô: The will of the Lord is the law of holiness . . . .”; `bl7m` (content) “Ahura Mazda spake unto Spitama Zarathustra, saying: 'That thou mayest ”
- `3.2`: `bl7h` (content) “Ashem Vohû: Holiness is the best of all good . . . .”; `bl7n` (content) “Zarathustra said: ‘Say unto me the right words, such as they are, O Ah”
- `3.15`: `bl209` (lead-in) ““He will smite the deadliest of all deaths, he will afflict the deadli”; `bl81` (lead-in) ““He will smite the most fiendish of all fiends, he will afflict the mo”; `bl82` (content) ““He will smite the most counter-working of all counter-works, he will ”; `bl84` (lead-in) ““He will smite the most oppressive of the oppressors of men, he will a”; `bl85` (content) ““He will smite the snakiest of the Snake’s brood, he will afflict the ”
- `3.16`: `bl83` (content) ““He will smite the unholy Ashemaogha, he will afflict the unholy Ashem”; `bl86` (lead-in) ““He will smite the most wolfish of the Wolf’s brood, he will afflict t”; `bl87` (content) ““He will smite the worst of the two-legged brood, he will afflict the ”; `bl89` (lead-in) ““He will smite Scorn, he will afflict Scorn;”; `bl8a` (lead-in) ““He will smite the hottest of hot fevers, he will afflict the hottest ”; `bl8b` (lead-in) ““He will smite the most slanderous of slanders, he will afflict the mo”; `bl8c` (lead-in) ““He will smite the most discordant of discords, he will afflict the mo”; `bl8d` (lead-in) ““He will smite the worst of the Evil Eye, he will afflict the worst of”; `bl8e` (content) ““He will smite the most lying words of falsehood, he will afflict the ”
- `3.17`: `bl88` (content) ““He will smite Pride, he will afflict Pride;”; `bl20a` (lead-in) ““He will smite the Gahi, addicted to the Yâtu, he will afflict the Gah”; `bl8f` (lead-in) ““He will smite the Gahi, who makes one pine, he will afflict the Gahi,”; `bl8g` (lead-in) ““He will smite the wind that blows from the North, he will afflict the”; `bl8h` (content) “'The Drug will perish away, the Drug will perish; the Drug will rush, ”
- `3.20`: `bl20b` (content) “'I bless the sacrifice and prayer and the strength and vigour of Asha-”; `bl8l` (lead-in) “'Ashem Vohû: Holiness is the best of all good . . . .”; `bl8m` (content) “'[Give] unto that man brightness and glory, give him health of body; .”
- `4.1`: `bl8s` (lead-in) “May Ahura Mazda be rejoiced! . . . .”; `bl8t` (lead-in) “Ashem Vohû: Holiness is the best of all good . . . .”; `bl8u` (content) “I confess myself a worshipper of Mazda, a follower of Zarathustra, one”; `bl8w` (lead-in) “Unto Haurvatāṭ, the master; unto the prosperity of the seasons and unt”; `bl8x` (lead-in) “Be propitiation, with sacrifice, prayer, propitiation, and glorificati”; `bl8y` (lead-in) “Yathâ ahû vairyô: The will of the Lord is the law of holiness . . . .”; `bl8z` (lead-in) “We sacrifice unto Haurvatâṭ, the Amesha-Speṇta; we sacrifice unto the ”; `bl90` (content) “Ahura Mazda spake unto Spitama Zarathustra, saying: 'I created for the”
- `4.2`: `bl8v` (content) “For sacrifice, prayer, propitiation, and glorification unto [Hâvani], ”; `bl91` (content) “'He who against the thousands of thousands of those Daêvas, against th”
- `5.1`: `bl9h` (content) “May Ahura Mazda be rejoiced! . . . .”; `bl9m` (content) “Be propitiation, with sacrifice, prayer, propitiation, and glorificati”; `bl9p` (content) “Ahura Mazda spake unto Spitama Zarathustra, saying: ‘Offer up a sacrif”
- `5.2`: `bl9i` (content) “Ashem Vohû: Holiness is the best of all good . . . .”; `bl9n` (content) “Yathâ ahû vairyô: The will of the Lord is the law of holiness. . . .”; `bl9q` (content) “‘Who makes the seed of all males pure who makes the womb of all female”
- `5.3`: `bl9j` (content) “I confess myself a worshipper of Mazda, a follower of Zarathustra, one”; `bl9r` (content) “‘The large river, known afar, that is as large as the whole of the wat”
- `5.4`: `bl9k` (content) “For sacrifice, prayer, propitiation, and glorification unto [Hâvani]. ”; `bl9s` (content) “‘All the shores of the sea Vouru-Kasha are boiling over, all the middl”
- `5.5`: `bl9l` (content) “Unto the good Waters, made by Mazda; unto the holy water-spring ARDVI ”; `bl9t` (content) “‘From this river of mine alone flow all the waters that spread all ove”
- `5.10`: `bl9y` (content) “‘Yênhê hâtãm All those beings of whom Ahura Mazda . . . .”; `bla0` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto this spring of mine”
- `5.12`: `bla2` (content) “'For her brightness and glory, I will offer her a sacrifice, worth bei”; `bla4` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto this spring of mine”
- `5.13`: `bla5` (content) “‘Whom four horses carry, all white, of one and the same colour, of the”; `bla6` (content) “'For her brightness and glory, I will offer her a sacrifice . . . .”
- `8.3`: `blaa` (content) “'For her brightness and glory, I will offer her a sacrifice . . .”; `blhd` (content) “‘For his brightness and glory, I will offer unto him a sacrifice worth”
- `5.20`: `blag` (content) “'For her brightness and glory, I will offer her a sacrifice . . . .”; `blai` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto this spring of mine”
- `5.24`: `blam` (content) “'For her brightness and glory, I will offer her a sacrifice . . .”; `blao` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto this spring of mine”
- `5.28`: `blas` (content) “'For her brightness and glory, I will offer her a sacrifice . . . .”; `blau` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto this spring of mine”
- `5.32`: `blay` (content) “'For her brightness and glory, I will offer her a sacrifice . . . .”; `blb0` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto Ardvi Sûra Anâhita ”
- `5.36`: `blb4` (content) “'For her brightness and glory, I will offer her a sacrifice . . .”; `blb6` (content) “'Offer up a sacrifice, O Spitama Zarathustra! unto Ardvi Sûra Anâhita ”
- … 400 more in the TSV

**Header numbers colliding with another block** (19)

- `2`: `bl2u` (content) “May Ahura Mazda be rejoiced! May Angra Mainyu be destroyed! by those w”; `bl5t` (header) “II. HAPTÂN YAST.”
- `3`: `bl6p` (header) “III.”; `bl7f` (header) “III. ARDIBEHIST YAST.”
- `4`: `bl7l` (header) “I.”; `bl7q` (header) “II.”; `bl8r` (header) “IV. KHORDÂD YAST.”
- `6`: `bl9o` (header) “I.”; `bl9z` (header) “II.”; `blah` (header) “VI.”; `blan` (header) “VII.”; `blat` (header) “VIII.”; `blaz` (header) “IX.”; `blb5` (header) “X.”; `blbb` (header) “XI.”; `blbh` (header) “XII.”; `blbn` (header) “XIII.”; `blbt` (header) “XIV.”; `blbz` (header) “XV.”; `blc5` (header) “XVI.”; `blce` (header) “XVII.”; `blck` (header) “XVIII.”; `blcq` (header) “XIX.”; `blcx` (header) “XX.”; `bld3` (header) “XXI.”; `bldo` (header) “XXII.”; `bldt` (header) “XXIII.”; `bldx` (header) “XXIV.”; `ble3` (header) “XXV.”; `ble9` (header) “XXVI.”; `blef` (header) “XXVII.”; `blel` (header) “XXVIII.”; `bleq` (header) “XXIX.”; `blev` (header) “XXX.”; `blfm` (header) “VI. KHÔRSHÊD YAST. (YAST TO THE SUN.)”
- `7`: `bla3` (header) “III.”; `blga` (header) “VII. MÂH YAST.”
- … 14 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (101)

- `1.8`: `bl3b` (lead-in) “‘My second name is the Herd-giver”; `bl3c` (lead-in) “‘My third name is the Strong One”; `bl3d` (lead-in) “‘My fourth name is Perfect Holiness”; `bl3e` (lead-in) “‘My fifth name is All good things created by Mazda, the offspring of t”; `bl3f` (lead-in) “‘My seventh name is the One with understanding.”; `bl3g` (lead-in) “‘My eighth name is Knowledge;”; `bl3h` (lead-in) “‘My ninth name is the One with Knowledge.”; `bl3i` (content) “‘My tenth name is Weal;”
- `2.1.4`: `bl63` (lead-in) “To Haurvatâṭ, the master; to the prosperity of the seasons and to the ”; `bl64` (content) “And to Ameretâṭ, the master; to fatness and flocks; to the plenty of c”
- `2.1.5`: `bl66` (lead-in) “(At the Gâh Rapithwin): To Asha-Vahista and to Âtar, the son of Ahura ”; `bl67` (content) “(At the Gâh Uzîren): To Apãm Napât, the tall lord, and to water, made ”
- `2.8`: `bl6g` (lead-in) “We sacrifice unto Khshathra-Vairya; we sacrifice unto the metals; we s”; `bl6h` (content) “We sacrifice unto the good Speṇta-Ârmaiti; we sacrifice unto the good ”
- `2.12`: `bl6r` (lead-in) “Who is he in whose house, O Spitama Zarathustra! every Drug is destroy”; `bl6s` (content) “. . . . . . . . . ?”
- … 96 more in the TSV

### Kitab Al-Kafi 4 (`kitab_al_kafi_v4_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (442)

- `1.1.3`: `bl119` (content) “H 5966, Ch. 1, h 2”; `bl11c` (content) “H 5967, Ch. 1, h 3”; `bl11e` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, has said, ‘I like performing Hajj more ”
- `1.1.2`: `bl11a` (content) “Muhammad ibn Isma‘il has narrated from al-Fadl ibn Shadhan and Ahmad i”; `bl11b` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said, ‘Benevolence and charity remo”
- `1.1.4`: `bl11d` (content) “A number of our people have narrated from Ahmad ibn Muhammad from abu ”; `bl11f` (lead-in) “H 5968, Ch. 1, h 4”; `bl11g` (lead-in) “A number of our people have narrated from Sahl ibn Ziyad from al-Nawfa”; `bl11h` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, that the Messenger of All”
- `1.1.7`: `bl11l` (content) “H 5970, Ch. 1, h 6”; `bl11o` (lead-in) “H 5971, Ch. 1, h 7”; `bl11p` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl11q` (content) ““I heard abu ‘Abd Allah, ‘Alayhi al-Salam, say, ‘Giving charity by one”
- `1.1.8`: `bl11r` (content) “H 5972, Ch. 1, h 8”; `bl11t` (content) ““I heard abu ‘Abd Allah, ‘Alayhi al-Salam, narrate this Hadith. ‘It is”
- `1.1.9`: `bl11s` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl11u` (lead-in) “H 5973, Ch. 1, h 9”; `bl11v` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl11w` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that it is preferable for ”
- `1.2.3`: `bl12b` (content) “H 5978, Ch. 2, h 3”; `bl12d` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘One day a Jewish man pas”
- `1.2.4`: `bl12c` (content) “Ali ibn Muhammad has narrated from Ahmad ibn Muhammad from Muhammad ib”; `bl12e` (lead-in) “H 5979, Ch. 2, h 4”; `bl12f` (lead-in) “Ali ibn Ibrahim has narrated from his father, from al-Nawfaliy from al”; `bl12g` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Ali, ‘Alayhi al-Salam”
- `1.2.5`: `bl12h` (content) “H 5980, Ch. 2, h 5”; `bl12j` (content) ““I heard abu ‘Abd Allah, ‘Alayhi al-Salam, say, ‘The Messenger of Alla”
- `1.2.6`: `bl12i` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `bl12k` (lead-in) “H 5981, Ch. 2, h 6”; `bl12l` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl12m` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said, ‘Giving charity repels sevent”
- `1.2.8`: `bl12r` (lead-in) “H 5983, Ch. 2, h 8”; `bl12s` (content) “Ali ibn Muhammad ibn ‘Abd Allah has narrated from Ahmad ibn Muhammad f”; `bl12t` (content) ““Abu al-Hassan, ‘Alayhi al-Salam, once in response to the words of Ism”
- `1.2.11`: `bl130` (lead-in) “H 5986, Ch. 2, h 11”; `bl131` (content) “Ali ibn Muhammad has narrated from ‘Abd Allah from Ahmad ibn Muhammad ”; `bl132` (content) ““I was in the presence of abu Ja‘far, ‘Alayhi al-Salam, in the Masjid ”
- `1.3.2`: `bl137` (lead-in) “H 5988, Ch. 3, h 2”; `bl138` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad from Al”; `bl139` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, once said to me, ‘O ‘Ammar, giving ”
- `1.3.3`: `bl13a` (lead-in) “H 5989, Ch. 3, h 3”; `bl13b` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl13c` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said that the Messenger of Allah, O”
- `1.4.1`: `bl13e` (content) “H 5990, Ch. 4, h 1”; `bl13g` (content) ““When it became dark and a part of the night had passed, abu ‘Abd Alla”
- `1.4.2`: `bl13f` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn abu ‘”; `bl13h` (lead-in) “H 5991, Ch. 4, h 2”; `bl13i` (lead-in) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”; `bl13j` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.5.4`: `bl13u` (content) “H 5995, Ch. 5, h 3”; `bl13y` (lead-in) “H 5996, Ch. 5, h 4”; `bl13z` (lead-in) “The narrator of the above Hadith has said that Ali ibn Hassan narrated”; `bl140` (content) ““Abu al-Hassan, ‘Alayhi al-Salam, has said, ‘Make the means of sustena”
- `1.7.1`: `bl6os` (lead-in) “H 6001, Ch. 7, h 1”; `bl14f` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ahmad ibn”; `bl14g` (content) ““Ali ibn al-Husayn, ‘Alayhi al-Salam, has said, ‘Of the people among y”
- `1.7.12`: `bl15d` (lead-in) “H 6012, Ch. 7, h 12”; `bl15e` (content) “Ali has narrated from Muhammad ibn Bandar from Ahmad ibn abu ‘Abd Alla”; `bl15f` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.10.1`: `bl6ot` (content) “H 6018, Ch. 9, h 1”; `bl163` (lead-in) “H 6020, Ch. 10, h 1”; `bl164` (content) “A number of our people have narrated from Ahmad ibn Muhammad from Muha”; `bl165` (content) ““I asked abu ‘Abd Allah, ‘Alayhi al-Salam, about giving charity to the”
- `1.9.2`: `bl15z` (lead-in) “H 6019, Ch. 9, h 2”; `bl160` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl161` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, was asked about giving charity to a”
- `1.11.3`: `bl16j` (lead-in) “H 6025, Ch. 11, h 3”; `bl16k` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl16l` (content) ““Allah, the Most Majestic, the Most Glorious, spoke to Moses about cer”
- `1.11.5`: `bl16m` (content) “H 6026, Ch. 11, h 4”; `bl16p` (lead-in) “H 6027, Ch. 11, h 5”; `bl16q` (content) “Ali ibn Muhammad ibn ‘Abd Allah has narrated from Ahmad ibn abu ‘Abd A”; `bl16r` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.11.4`: `bl16n` (content) “A number of our people have narrated from Sahl ibn Ziyad from al-Hassa”; `bl16o` (content) ““I visited Ali ibn al-Husayn, ‘Alayhi al-Salam, one day after he had p”
- `1.12.1`: `bl16w` (lead-in) “H 6029, Ch. 12, h 1”; `bl16x` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl16y` (content) ““Once I was in the presence of abu ‘Abd Allah, ‘Alayhi al-Salam, when ”
- `1.13.1`: `bl173` (lead-in) “H 6031, Ch. 13, h 1”; `bl174` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl175` (content) ““He (the Imam) has said, ‘When you give charity, ask them to pray; the”
- `1.13.2`: `bl176` (lead-in) “H 6032, Ch. 13, h 2”; `bl177` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl178` (content) ““You must not ignore anyone’s prayers; the prayers of Jews and Christi”
- `1.16.1`: `bl17k` (content) “H 6036, Ch. 15, h 1”; `bl17v` (lead-in) “A number of our people have narrated from Sahl ibn Ziyad from al-Hassa”; `bl17w` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Ali ibn al-Husayn, ‘A”
- `1.15.2`: `bl17n` (lead-in) “H 6037, Ch. 15, h 2”; `bl17o` (content) “The narrator of the above Hadith has said that narrated to us Bakr ibn”; `bl17p` (content) ““I once said to abu al-Hassan, ‘Alayhi al-Salam, ‘Please instruct me w”
- `1.15.3`: `bl17q` (lead-in) “H 6038, Ch. 15, h 3”; `bl17r` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `bl17s` (content) ““I asked him (the Imam), ‘What kind of charity is more excellent?’ He ”
- `1.17.1`: `bl17u` (content) “H 6039, Ch. 16, h 1”; `bl185` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl186` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Never beg people for fin”
- `1.16.2`: `bl17x` (lead-in) “H 6040, Ch. 16, h 2”; `bl17y` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl17z` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has stated this Hadith. ’Amir al-Mu”
- `1.16.3`: `bl180` (lead-in) “H 6041, Ch. 16, h 3”; `bl181` (content) “Ali ibn Muhammad has narrated from Ahmad ibn abu ‘Abd Allah from Ya’qu”; `bl182` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If a servant asks for he”
- `1.18.1`: `bl184` (content) “H 6042, Ch. 17, h 1”; `bl6p2` (lead-in) “H 6050, Ch. 18, h 1”; `bl18t` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl18u` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has stated this Hadith. ‘The Messen”
- `1.17.4`: `bl18d` (lead-in) “H 6045, Ch. 17, h 4”; `bl18e` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl18f` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.17.6`: `bl18k` (lead-in) “H 6047, Ch. 17, h 6”; `bl18l` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl18m` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Allah grants mercy to on”
- `1.17.7`: `bl18n` (lead-in) “H 6048, Ch. 17, h 7”; `bl18o` (content) “Ali ibn Muhammad and Ahmad ibn Muhammad have narrated from Ali ibn al-”; `bl18p` (content) ““Once I visited abu ‘Abd Allah, ‘Alayhi al-Salam, and mentioned to him”
- `1.20.3`: `bl19n` (lead-in) “H 6059, Ch. 20, h 3”; `bl19o` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl19p` (content) ““I heard abu Ja‘far, ‘Alayhi al-Salam, say, ‘The most beloved servant ”
- `1.21.3`: `bl19x` (lead-in) “H 6062, Ch. 21, h 3”; `bl19y` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn ‘Isa ”; `bl19z` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘I see Benevolent Assista”
- `1.21.5`: `bl1a1` (lead-in) “H 6063, Ch. 21, h 4”; `bl1a2` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ja’far i”; `bl1a3` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has narrated from his ancestors fro”
- `1.21.8`: `bl1aa` (lead-in) “H 6066, Ch. 21, h 7”; `bl1ab` (content) “Ali ibn Muhammad ibn Bandar and others have narrated from Ahmad ibn ab”; `bl1ac` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, once said to ‘Ammar, ‘O ‘Ammar, are”
- `1.21.9`: `bl1ae` (lead-in) “H 6067, Ch. 21, h 8”; `bl1af` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl1ag` (content) “‘Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If a believing person ma”
- `1.23.1`: `bl1au` (content) “H 6072, Ch. 22, h 1”; `bl1ay` (lead-in) “H 6073, Ch. 23, h 1”; `bl1az` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ja’far i”; `bl1b0` (content) ““Abu ‘Abd Allah, has narrated this Hadith from his ancestors, ‘Alayhim”
- `1.22.1`: `bl1av` (content) “A number of our people have narrated from Sahl ibn Ziyad from ‘Abd All”; `bl1aw` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that ‘Amir al-Mu’minin, ‘A”
- `1.23.2`: `bl1b1` (content) “H 6074, Ch. 23, h 2”; `bl1b3` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has narrated this Hadith. ‘The Mess”
- `1.23.3`: `bl1b2` (content) “Ali ibn Ibrahim has narrated from his father, from al-Nawfaliy from al”; `bl1b4` (lead-in) “H 6075, Ch. 23, h 3”; `bl1b5` (lead-in) “Ali ibn Ibrahim has narrated from his father from Muhammad ibn Yahya f”; `bl1b6` (content) ““I heard abu Ja‘far, ‘Alayhi al-Salam, say, ‘Providing Benevolent Assi”
- `1.25.1`: `bl1b8` (content) “H 6076, Ch. 24, h 1”; `bl1bl` (content) “H 6080, Ch. 25, h 1”; `bl1bn` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that a complete Benevolent”
- `1.24.1`: `bl1b9` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl1ba` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has narrated this Hadith. ‘Once, co”
- `1.24.2`: `bl1bb` (lead-in) “H 6077, Ch. 24, h 2”; `bl1bc` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl1bd` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that providers of Benevole”
- `1.24.3`: `bl1be` (content) “H 6078, Ch. 24, h 3”; `bl1bg` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said, ‘The Messenger of Allah, O Al”
- `1.24.4`: `bl1bf` (content) “Ahmad ibn Idris has narrated from Muhammad ibn ‘Abd al-Jabbar from Saf”; `bl1bh` (lead-in) “H 6079, Ch. 24, h 4”; `bl1bi` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl1bj` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that in paradise there is ”
- `1.25.2`: `bl1bm` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl1bo` (lead-in) “H 6081, Ch. 25, h 2”; `bl1bp` (lead-in) “Ahmad ibn Muhammad has narrated from Muhammad ibn Khalid from Khalaf i”; `bl1bq` (content) ““I heard abu Ja’far, ‘Alayhi al-Salam, say, ‘Everything has a fruit. T”
- `1.26.3`: `bl1by` (content) “H 6084, Ch. 26, h 3”; `bl1c0` (content) ““Once a group of Shi’ah people came to ’Amir al-Mu’minin, ‘Alayhi al-S”
- `1.26.4`: `bl1bz` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl1c3` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl1c4` (content) ““I heard Abu ‘Abd Allah, ‘Alayhi al-Salam, say, ‘If people achieve wha”
- `1.26.5`: `bl1c2` (content) “H 6085, Ch. 26, h 4”; `bl1c5` (lead-in) “H 6086, Ch. 26, h 5”; `bl1c6` (lead-in) “Ali ibn Muhammad has narrated from Ahmad ibn abu ‘Abd Allah from Musa ”; `bl1c7` (content) ““I heard abu ‘Abd Allah, ‘Alayhi al-Salam, say, ‘Allah has granted you”
- `1.27.2`: `bl1cc` (lead-in) “H 6088, Ch. 27, h 2”; `bl1cd` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl1ce` (content) ““Abu al-Hassan, Musa, ‘Alayhi al-Salam, has said, ‘You must not provid”
- `1.27.3`: `bl1cf` (lead-in) “H 6089, Ch. 27, h 3”; `bl1cg` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ali ibn ”; `bl1ch` (content) ““One of the two Imam, (abu Ja’far or abu ‘Abd Allah), ‘Alayhim al-Sala”
- `1.28.1`: `bl1cj` (lead-in) “H 6090, Ch. 28, h 1”; `bl1ck` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn ‘Isa ”; `bl1cl` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that Allah has condemned t”
- `1.29.2`: `bl1cw` (lead-in) “H 6094, Ch. 29, h 2”; `bl1cx` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn Isma‘il ”; `bl1cy` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘For every believing pers”
- `1.30.2`: `bl1dc` (lead-in) “H 6099, Ch. 30, h 2”; `bl1dd` (content) “Muhammad ibn Yahya has narrated from ‘Abd Allah ibn Muhammad from Ali ”; `bl1de` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- … 382 more in the TSV

**Opening invocations carrying a number** (3)

- `a.712`: `bl113` “In the name of Allah, the Beneficient, the Merciful”
- `1.43.8`: `bl1o0` “In the name of Allah, the Beneficient, the Merciful”
- `2.2.36.9`: `bl2ub` “In the name of Allah, the Beneficient, the Merciful”

**Header numbers colliding with another block** (251)

- `1`: `bl114` (header) “Part One”; `bl115` (header) “Chapters on Charities”; `bl6oq` (header) “Giving Charity Increases One’s Wealth”; `bl6qi` (header) “Disciplines for Providing Benevolent Assistance”; `bl6t7` (header) “What Is Dawn, When Does It Come and When Is It Unlawful to Eat?”; `bl3mt` (content) “H 6972, Ch. 49, h 1”; `bl70j` (header) “Al-Hajj Followed by Pilgrimage (Visits)”
- `2`: `bl6nz` (header) “The Book of Zakat”; `bl1o1` (header) “Part Two”; `bl3mu` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”
- `1.2`: `bl6on` (header) “Virtue of Charity”; `bl124` (header) “Chapter 2”
- `1.4`: `bl6r9` (header) “The Virtue of Giving Charity Out of Public Sight”; `bl13d` (header) “Chapter 4”
- `1.5`: `bl6op` (header) “Giving Charity During the Night”; `bl13n` (header) “Chapter 5”
- … 246 more in the TSV

**Source / citation lines carrying a number** (1)

- `3.2.8.1`: `bl6gf` (source) “(It seems as if it is part of Hadith 5 of previous Chapter narrated fr”; `bl6gg` (content) ““When you go to the grave in al-Baqi‘ keep it in front of you and say,”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1337)

- `1.1.1`: `bl6oo` (lead-in) “H 5965, Ch. 1, h 1”; `bl117` (lead-in) “Ali ibn Ibrahim ibn Hashim has narrated from his father, from al-Husay”; `bl118` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.1.5`: `bl11i` (lead-in) “H 5969, Ch. 1, h 5”; `bl11j` (lead-in) “Ali ibn Muhammad has narrated from Ahmad ibn Muhammad, from Muhammad i”; `bl11k` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Cure your illnesses by g”
- `1.1.6`: `bl11m` (lead-in) “Ahmad ibn ‘Abd Allah has narrated from his grandfather from Muhammad i”; `bl11n` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.1.10`: `bl11x` (lead-in) “H 5974, Ch. 1, h 10”; `bl11y` (lead-in) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `bl11z` (content) ““I informed abu al-Hassan al-Rida, ‘Alayhi al-Salam, about the passing”
- `1.1.11`: `bl121` (lead-in) “H 5975, Ch. 1, h 11”; `bl122` (lead-in) “More than one person from our people has narrated from Ahmad ibn abu ‘”; `bl123` (content) ““This is a narration of abu ‘Abd Allah, ‘Alayhi al-Salam, from the Mes”
- … 1332 more in the TSV

### Messages to Canada (`messages_to_canada_baha_i_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (385)

- `1.2`: `blcc` (content) “— Will and Testament of ‘Abdu’l-Bahá, 11”; `blcl` (content) “It is a great pleasure and privilege to me to enter into direct and I ”
- `2.1`: `blcg` (source) “[From the Guardian:]”; `blci` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout C”; `blck` (content) “Dear friends!”; `bl2zi` (signature) “20 April 1923”; `blcy` (content) “I was deeply interested and immensely gratified to read the newly rece”
- `3.1`: `blct` (source) “[From the Guardian:]”; `blcv` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout t”; `blcx` (content) “My dearly beloved friends!”; `bl2xp` (signature) “[13] December 1923”; `bld7` (content) “ASSURE YOU MY PRAYERS AND AFFECTIONS.”
- `4.1`: `bld4` (source) “[From the Guardian:]”; `bld6` (content) “To the Montreal Assembly”; `bl2zk` (signature) “1 February 1924”; `bldd` (content) “Your spiritually beautiful letter of December 16th sent through our be”
- `5.1`: `bldb` (lead-in) “To an individual believer”; `bldc` (content) “My dear Bahá’í Sister,”; `bl2zl` (signature) “4 February 1924”; `bldv` (content) “My close companionship during the last few days with that zealous and ”
- `5.8`: `bldk` (lead-in) “Your humble brother in His love and service,”; `bldl` (content) “Azízu’lláh S. Bahadur”; `bldn` (content) “My dear Bahá’í sister:”
- `6.1`: `bldr` (source) “[From the Guardian:]”; `bldt` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout C”; `bldu` (content) “Esteemed fellow-labourers in the Vineyard of God!”; `bl2vq` (signature) “16 October 1924”; `ble6` (content) “Your highly spiritual letter of August 24th written to our beloved Gua”
- `7.1`: `ble4` (lead-in) “To an individual believer”; `ble5` (content) “Dear Bahá’í Sister,”; `bl30b` (signature) “January 1926”; `blef` (content) “After reading your short yet delightful letter, Shoghi Effendi passed ”
- `7.4`: `ble9` (content) “Your humble brother in His love,”; `blea` (signature) “Azízu’lláh S. Bahadur”; `blei` (content) “At present we are having Mrs. Maxwell and Mrs. Schopflocher with us. T”
- `8.1`: `bled` (lead-in) “To an individual believer”; `blee` (content) “My dear Mr. … :”; `bl30c` (signature) “9 August 1926”; `bleq` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `8.5`: `blek` (content) “Yours most sincerely,”; `blel` (signature) “Ruhi Afnan”; `bley` (content) “Your touching letter has been read by me with deep sympathy and intere”
- `9.1`: `bleo` (lead-in) “To an individual believer”; `blep` (content) “My dear Mr. …:”; `bl2xb` (signature) “2 December 1926”; `blf4` (content) “ASSURE CANADIAN FRIENDS LOVINGLY REMEMBERED ASCENSION NIGHT.”
- `9.4`: `bleu` (signature) “Yours in His Name,”; `blev` (content) “Ruhi Afnan”; `blex` (content) “My dear brother:”
- `10.1`: `blf1` (source) “[From the Guardian:]”; `blf3` (content) “To the Montreal Assembly”; `blfb` (content) “Your welcome letter, breathing the spirit of loving devotion to the in”
- `11.1`: `blf7` (source) “[From the Guardian:]”; `blf9` (lead-in) “To an individual believer”; `blfa` (content) “Dear co-worker:”; `bl2zr` (signature) “10 March 1927”; `blfm` (content) “The beloved Guardian has asked me to write to you on his behalf, and t”
- `12.1`: `blfk` (lead-in) “To an individual believer”; `blfl` (content) “Dear Bahá’í Friend,”; `bl2z5` (signature) “12 April 1927”; `blg1` (content) “Shoghi Effendi thanks you very much for your letter to him dated March”
- `12.5`: `blfq` (lead-in) “Your sincere fellow-worker in this great service,”; `blfr` (content) “Ethel J. Rosenberg”; `blft` (content) “My dear co-worker:”; `blg5` (content) “‘Abdu’l-Bahá once said to me that we should use the Hidden Words as a ”
- `13.1`: `blfz` (lead-in) “To an individual believer”; `blg0` (content) “Dear Bahá’í Brother,”; `bl2zt` (signature) “13 April 1927”; `blgi` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `13.6`: `blg7` (lead-in) “Your sincere fellow-worker in this great Service,”; `blg8` (content) “Ethel J. Rosenberg”; `blga` (content) “My dear spiritual brother:”
- `14.1`: `blgg` (lead-in) “To the Montreal Spiritual Assembly”; `blgh` (content) “Dear Spiritual brothers and sisters:”; `bl2zu` (signature) “4 May 1927”; `blgw` (content) “Shoghi Effendi desires me to thank you very much for your letter maile”
- `14.4`: `blgl` (signature) “Yours in His Service,”; `blgm` (content) “Ruhi Afnan”; `blgo` (content) “My dear and valued co-workers:”; `blgz` (content) “He will pray at the Holy Shrines for you and your family, and the dear”
- `14.5`: `blgq` (content) “Wishing you the fullest success,”; `blgr` (signature) “Shoghi”; `blh4` (content) “Your sweet letter has brought joy to my heart. To feel that such an ar”
- `15.1`: `blgu` (lead-in) “To an individual believer”; `blgv` (content) “Dear Bahá’í Friend,”; `bl38q` (signature) “25 August 1927”; `blhb` (content) “Our dear Guardian has instructed me to acknowledge the receipt of your”
- `15.5`: `blh0` (lead-in) “Your fellow-worker in this great service,”; `blh1` (content) “Ethel J. Rosenberg”; `blh3` (content) “My dear and precious sister in ‘Abdu’l-Bahá,”; `blhj` (content) “Your welcome letter was a cheer and inspiration to my heart and I will”
- `16.1`: `blh9` (lead-in) “To an individual believer”; `blha` (content) “Dear Friend,”; `bl38r` (signature) “27 October 1927”; `blhq` (content) “I thank you so much on behalf of our dear Guardian for your very kind ”
- `16.4`: `blhf` (signature) “Yours very sincerely,”; `blhg` (content) “R. Rabbani”; `blhi` (content) “My dear and valued co-worker:”; `blht` (content) “Naturally it depends mostly upon the individual effort of the friends,”
- `17.1`: `blho` (lead-in) “To an individual believer”; `blhp` (content) “My dear Bahá’í Friend,”; `bl38s` (content) “7 March 1928”
- `17.5`: `blhv` (lead-in) “Sincerely in His service,”; `blhw` (content) “Soheil Afnan”; `blhy` (content) “My dear co-worker:”; `bli9` (content) “He wishes me to assure you of his heartfelt good wishes and prayers, t”
- `18.2`: `bli4` (lead-in) “To an individual believer”; `bli5` (content) “My dear Friend,”; `blin` (content) “He was very much touched by your letter so full of hope, of faith and ”
- `18.6`: `blib` (lead-in) “Sincerely in His service,”; `blic` (content) “Soheil Afnan”; `blie` (content) “My dear co-worker:”; `bliv` (content) “I just wish to add a few words in person in order to assure you of my ”
- `19.2`: `blik` (lead-in) “To an individual believer”; `blil` (content) “My dear …,”; `blj3` (content) “He was much interested in what you had written him as regards oil mine”
- `19.6`: `blir` (lead-in) “Sincerely yours,”; `blis` (content) “Soheil Afnan”; `bliu` (content) “My dear co-worker:”; `bljb` (content) “I advise you to consult our dear, trusted and capable brother in the F”
- `20.1`: `blj0` (lead-in) “To an individual believer”; `blj1` (content) “My dear Bahá’í Sister,”; `bl300` (signature) “10 October 1928”; `blji` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter to ”
- `20.6`: `blj7` (lead-in) “Sincerely yours in His service,”; `blj8` (content) “Soheil Afnan”; `blja` (content) “My dear co-worker:”
- `21.1`: `bljg` (lead-in) “To an individual believer”; `bljh` (content) “Dear Mr. …:”; `bl301` (signature) “25 October 1928”; `bljv` (content) “I am directed by Shoghi Effendi to thank you for your letter of Septem”
- `21.4`: `bljl` (signature) “Yours very sincerely,”; `bljm` (content) “Ruhi Afnan”; `bljy` (content) “He is always glad to hear from you and awaits your good news of progre”
- `22.2`: `bljt` (lead-in) “To an individual believer”; `blju` (content) “My dear Mrs. …,”; `blkc` (content) “The news of the co-operation of the Bahá’í young men and women in Mont”
- `22.6`: `blk0` (lead-in) “Sincerely yours in His service,”; `blk1` (content) “Soheil Afnan”; `blk3` (content) “My dear co-worker:”; `blkk` (content) “I was delighted by the tone of your letter, and the news it conveyed a”
- `23.1`: `blk9` (lead-in) “To an individual believer”; `blka` (content) “My Dear Mr. …,”; `bl38y` (signature) “4 June 1929”; `blkq` (content) “Shoghi Effendi wishes me to thank you for your letter dated May 19th a”
- `23.5`: `blkg` (lead-in) “Sincerely yours,”; `blkh` (content) “Soheil Afnan”; `blkj` (content) “My dear and precious co-worker:”; `blky` (content) “I deeply appreciate the effort you have exerted in connection with my ”
- `24.1`: `blko` (lead-in) “To Siegfried Schopflocher”; `blkp` (content) “Dear Fred:”; `bl2zh` (signature) “20 September 1929”; `bll6` (content) “I am directed by our Guardian to thank you for your letter of July 9th”
- `24.5`: `blku` (signature) “Yours ever sincerely,”; `blkv` (content) “Ruhi Afnan”; `blkx` (content) “My dear and precious co-worker:”; `blla` (content) “I am also asked to express Shoghi Effendi’s deep appreciation of your ”
- `25.2`: `bll4` (lead-in) “To an individual believer”; `bll5` (content) “My dear Mrs. …,”; `blln` (content) “Shoghi Effendi wants me to assure you of his prayers for he has great ”
- `26.1`: `bllk` (lead-in) “To an individual believer”; `blll` (content) “Dear …:”; `bl306` (signature) “3 January 1932”; `blm1` (content) “KINDLY CABLE APPROXIMATE SIZE COST AND TIME REQUIRED RESTORATION TEMPL”
- `26.5`: `bllq` (content) “With best wishes I remain,”; `bllr` (signature) “Yours ever sincerely,”; `blls` (content) “Ruhi Afnan”
- `27.1`: `blly` (source) “[From the Guardian:]”; `blm0` (content) “To Fred Schopflocher”; `bl307` (signature) “18 January 1932”; `blm7` (content) “Shoghi Effendi gave me your letter of December 20th, 1931, sent throug”
- `28.1`: `blm5` (lead-in) “To an individual believer”; `blm6` (content) “Dear Mr. …:”; `bl2zm` (signature) “10 February 1932”; `blml` (content) “ACCEDE REQUEST PROFOUND LOVING APPRECIATION.”
- `29.1`: `blmi` (source) “[From the Guardian:]”; `blmk` (content) “To Fred Schopflocher”; `bl2qv` (signature) “1 April 1932”; `blmr` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `30.1`: `blmp` (lead-in) “To an individual believer”; `blmq` (content) “Dear Mr. …:”; `bl2rv` (signature) “26 April 1932”; `bln3` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your joint lett”
- `30.4`: `blmu` (signature) “Yours ever sincerely,”; `blmv` (content) “Ruhi Afnan”; `bln6` (content) “In his moments of prayer at the blessed Shrines Shoghi Effendi will th”
- `31.1`: `bln1` (lead-in) “To the Bahá’ís of Montreal”; `bln2` (content) “Dear Bahá’í brothers and sisters:”; `bl2s5` (signature) “20 August 1932”; `blnj` (content) “Shoghi Effendi was deeply touched by your letter of July 18th, 1932 an”
- `31.5`: `bln8` (signature) “Yours ever sincerely,”; `bln9` (content) “Ruhi Afnan”; `blnb` (content) “Dearly-beloved co-workers:”; `blnn` (content) “The Guardian is anxiously waiting to see the friends once more united ”
- `32.1`: `blnh` (lead-in) “To individual believers”; `blni` (content) “Beloved Friends in the Faith of Bahá’u’lláh,”; `bl2u9` (signature) “10 September 1932”; `blnz` (content) “It was with a great satisfaction and joy that Shoghi Effendi received ”
- `32.6`: `blno` (signature) “Yours in His Service,”; `blnp` (content) “H. Rabbani”; `blnr` (content) “Dear and precious co-workers:”
- `33.1`: `blnx` (lead-in) “To the Spiritual Assembly of Montreal”; `blny` (content) “Beloved co-workers in the Faith,”; `bl2r8` (signature) “21 October 1932”; `bloc` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `33.4`: `blo2` (signature) “Yours in His Service,”; `blo3` (content) “H. Rabbani”; `blo5` (content) “Dear co-workers:”; `blof` (content) “To divide the inheritance as it is prescribed by Bahá’u’lláh we have t”
- `34.1`: `bloa` (lead-in) “To an individual believer”; `blob` (content) “Dear Mr. …:”; `bl2tw` (signature) “1 June 1933”; `blos` (content) “If Shoghi Effendi knew the address of the place where you order his st”
- `35.1`: `bloq` (lead-in) “To an individual believer”; `blor` (content) “Dear …:”; `bl309` (source) “[From the Guardian:]”; `bl2su` (signature) “8 March 1934”; `blp2` (content) “BAHÁ’Í WORLD GREATLY INDEBTED YOUR OVERWHELMING SHARE PROMOTING ITS NA”
- `36.1`: `blp1` (content) “To Siegfried Schopflocher”; `bl2sk` (signature) “30 April 1934”; `blp9` (content) “The Guardian wishes me to acknowledge on his behalf the receipt of you”
- `37.1`: `blp7` (lead-in) “To an individual believer”; `blp8` (content) “Dear Bahá’í Friend,”; `blpl` (content) “The Guardian has directed me to acknowledge on his behalf the receipt ”
- … 325 more in the TSV

**Header numbers colliding with another block** (12)

- `3`: `blcs` (header) “Letter of 20 April 1923”; `bld3` (header) “Letter of [13] December 1923”
- `24.7`: `bll0` (signature) “Your true brother,”; `bll1` (signature) “Shoghi”; `bl31a` (struct) “”
- `53.8`: `bluv` (signature) “Shoghi”; `bl32t` (struct) “”
- `55.10`: `blvr` (signature) “Your true brother,”; `blvs` (signature) “Shoghi”; `bl32v` (struct) “”
- `98.2`: `bl33d` (struct) “”; `bl1b7` (content) “He is very pleased to see you have a Canadian Radio Committee now, as ”
- … 7 more in the TSV

**Signature / closing lines carrying a number** (264)

- `p.7`: `blbp` (content) “National Spiritual Assembly of the Bahá’ís of Canada”; `blbq` (signature) “April 1998”
- `1.3`: `blce` (signature) “January 2, 1923”; `blcm` (content) “Though its people be firmly entrenched in their religious sectarianism”
- `2.8`: `blcp` (content) “With all good wishes, Your brother and co-worker,”; `blcq` (signature) “Shoghi”
- `3.4`: `bld1` (content) “I am your brother and co-worker,”; `bld2` (signature) “Shoghi”
- `4.2`: `bld8` (signature) “SHOGHI”; `blde` (content) “He has instructed me to answer your letter and convey to you his lovin”
- … 259 more in the TSV

**Source / citation lines carrying a number** (14)

- `f.10`: `blb7` (source) “[From the Guardian:]”; `blb8` (content) ““[The] purchase of the site of the Mother Temple of the Dominion of Ca”
- `f.14`: `blbb` (source) “[From the Guardian]”; `blbd` (content) “Here, we touch with that mystery that ‘Abdu’l-Bahá termed “the secret ”
- `67.8`: `blzx` (content) “R. Rabbani”; `blzy` (source) “[From the Guardian:]”
- `69.8`: `bl10u` (source) “[From the Guardian:]”; `bl10v` (content) “Dear and valued co-worker:”
- `90.6`: `bl18a` (source) “[From the Guardian:]”; `bl18q` (content) “Assuring you of my loving prayers for your spiritual advancement, and ”
- … 9 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (13)

- `f.17`: `blbg` (lead-in) “Douglas Martin”; `blbh` (content) “Haifa, 28 February 1998”
- `46.1`: `blru` (lead-in) “To an individual believer”; `blrv` (content) “Dear Bahá’í Brother,”; `bl2w2` (signature) “11 February 1938”
- `89.7`: `bl17s` (lead-in) “Yours with Bahá’í love,”; `bl17t` (content) “R. Rabbani”
- `94.5`: `bl19t` (lead-in) “With Bahá’í love,”; `bl19u` (content) “R. Rabbani”; `bl19v` (source) “[From the Guardian:]”
- `119.4`: `bl1gh` (lead-in) “With Bahá’í love,”; `bl1gi` (content) “R. Rabbani”; `bl1gj` (source) “[From the Guardian:]”
- … 8 more in the TSV

### Kitab Al-Kafi 7 (`kitab_al_kafi_vol7_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (378)

- `1.1.1`: `bl2z` (lead-in) “H 12749, Ch. 1, h 1”; `bl30` (content) “Narrated to us Ali ibn Ibrahim from Ali ibn Ishaq from al-Hassan ibn H”; `bl31` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that the Messenger of Alla”
- `1.1.6`: `bl37` (lead-in) “H 12751, Ch. 1, h 3”; `bl38` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl3c` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the will. He (th”
- `1.1.7`: `bl3a` (lead-in) “H 12752, Ch. 1, h 4”; `bl3b` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl3f` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, has said, ‘Making a will is a right tha”
- `1.2.3`: `bl3n` (lead-in) “H 12756, Ch. 2, h 3”; `bl3o` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan and Ali ib”; `bl3p` (content) ““About the meaning of the words of Allah, most Majestic, most Glorious”
- `1.2.6`: `bl3t` (content) “H 12758, Ch. 2, h 5”; `bl3w` (lead-in) “H 12759, Ch. 2, h 6”; `bl3x` (lead-in) “Muhammad ibn Ahmad has narrated from ibn al-Salt from Yunus ibn ‘Abd a”; `bl3y` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the meaning of t”
- `1.3.1`: `bl45` (content) “H 12761, Ch. 3, h 1”; `bl47` (content) ““If one makes a will and appoints a certain person as the executor of ”
- `1.3.3`: `bl4b` (lead-in) “H 12763, Ch. 3, h 3”; `bl4c` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”; `bl4d` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If a man makes a will in”
- `1.4.1`: `bl4o` (lead-in) “H 12767, Ch. 4, h 1”; `bl4p` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn ‘Isa ”; `bl4q` (content) ““I once heard abu ‘Abd Allah, ‘Alayhi al-Salam, saying, ‘The owner of ”
- `1.4.2`: `bl4r` (lead-in) “H 12768, Ch. 4, h 2”; `bl4s` (content) “Ahmad ibn Muhammad has narrated from Ali ibn al-Hassan from Ali ibn As”; `bl4t` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘A man is more rightful t”
- `1.4.5`: `bl4x` (lead-in) “H 12770, Ch. 4, h 4”; `bl4y` (content) “Ahmad ibn Muhammad has narrated from Ali ibn al-Hassan from his brothe”; `bl52` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.4.6`: `bl50` (lead-in) “H 12771, Ch. 4, h 5”; `bl51` (content) “Muhammad ibn Yahya and others has narrated from Muhammad ibn Ahmad fro”; `bl55` (content) ““About the case of a man who gives a certain amount of his property du”
- `1.4.7`: `bl53` (lead-in) “H 12772, Ch. 4, h 6”; `bl54` (content) “Muhammad ibn ‘Isma’il has narrated from al-Fadl ibn Shadhan from and A”; `bl58` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.4.8`: `bl56` (lead-in) “H 12773, Ch. 4, h 7”; `bl57` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad ibn Sama‘ah ”; `bl5c` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.4.9`: `bl5a` (lead-in) “H 12774, Ch. 4, h 8”; `bl5b` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Hassan from ‘Abd ”; `bl5f` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘A man is more rightful t”
- `1.4.10`: `bl5d` (lead-in) “H 12775, Ch. 4, h 9”; `bl5e` (content) “Ali ibn Ibrahim has narrated from his father from ‘Uthman ibn Sa‘id fr”; `bl5i` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.5.3`: `bl5n` (content) “H 12778, Ch. 5, h 2”; `bl5q` (lead-in) “H 12779, Ch. 5, h 3”; `bl5r` (lead-in) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan from Safwa”; `bl5s` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, has said, ‘Making a will for the heir i”
- `1.5.6`: `bl5u` (content) “H 12780, Ch. 5, h 4”; `bl5x` (lead-in) “H 12781, Ch. 5, h 5”; `bl5y` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `bl5z` (content) ““I once asked abu Ja‘far, ‘Alayhi al-Salam, about making a will for th”
- `1.6.1`: `bl64` (lead-in) “H 12783, Ch. 6, h 1”; `bl65` (content) “Ali ibn Ibrahim has narrated from his father from and Muhammad ibn ‘Is”; `bl66` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that al-Bara’ ibn Ma’rur a”
- `1.6.3`: `bl6a` (lead-in) “H 12785, Ch. 6, h 3”; `bl6b` (content) “A number of our people have narrated from Ahmad ibn Muhammad from al-H”; `bl6c` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.6.4`: `bl6d` (lead-in) “H 12786, Ch. 6, h 4”; `bl6e` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ali ibn I”; `bl6f` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, in this statement refers to the words o”
- `1.6.6`: `bl6h` (lead-in) “H 12787, Ch. 6, h 5”; `bl6i` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad and Muh”; `bl6j` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If one makes a will abou”
- `1.6.8`: `bl6k` (content) “H 12788, Ch. 6, h 6”; `bl6n` (lead-in) “H 12789, Ch. 6, h 7”; `bl6o` (lead-in) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”; `bl6p` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said that ’Amir al-Mu’minin has”
- `1.9.2`: `bl7b` (content) “H 12796, Ch. 8, h 2”; `bl7d` (content) ““I once asked abu Ja‘far, ‘Alayhi al-Salam, about the case of a man wh”
- `1.9.3`: `bl7c` (content) “Muhammad ibn Yahya has narrated from ‘Imran ibn Musa from Musa ibn Ja‘”; `bl7e` (content) “H 12797, Ch. 8, h 3”; `bl7g` (content) ““I once asked him (the Imam), ‘Alayhi al-Salam, about the case of man ”
- `1.11.1`: `bl7z` (content) “H 12803, Ch. 11, h 1”; `bl81` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a wo”
- `1.11.2`: `bl80` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn ‘Isa ”; `bl82` (lead-in) “H 12804, Ch. 11, h 2”; `bl83` (content) “Muhammad ibn Ja‘far al-Raziy has narrated from Muhammad ibn ‘Isa and M”; `bl84` (content) ““I once asked al-‘Askariy, ‘Alayhi al-Salam, in al-Madinah about the c”
- `1.12.2`: `bl86` (content) “H 12805, Ch. 12, h 1”; `bl89` (lead-in) “H 12806, Ch. 12, h 2”; `bl8a` (lead-in) “Ali ibn Ibrahim has narrated from his father from al-Rayyan ibn Shabib”; `bl8b` (content) ““Maridah made a will for the Christians who worked as maintenance peop”
- `1.13.1`: `bl87` (content) “Ali ibn Ibrahim has narrated from his father from abu Talib ‘Abd Allah”; `bl8d` (content) “H 12807, Ch. 13, h 1”; `bl8f` (content) ““About the case of a man who makes a will about more than one-third of”
- `1.13.2`: `bl8e` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl8g` (lead-in) “H 12808, Ch. 13, h 2”; `bl8h` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-Husayn”; `bl8i` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If a man when about to d”
- `1.13.5`: `bl8p` (lead-in) “H 12811, Ch. 13, h 5”; `bl8q` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”; `bl8r` (content) ““I once said to abu ‘Abd Allah, ‘Alayhi al-Salam, ‘Alqamah ibn Muhamma”
- `1.13.7`: `bl8v` (lead-in) “H 12813, Ch. 13, h 7”; `bl8x` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ‘Isma‘il has”; `bl8y` (content) ““This is about the case of a man who dies but makes a will to perform ”
- `1.13.10`: `bl95` (lead-in) “H 12816, Ch. 13, h 10”; `bl96` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl97` (content) ““I once asked the virtuous servant of Allah, ‘Alayhi al-Salam, about t”
- `1.13.12`: `bl9b` (lead-in) “H 12818, Ch. 13, h 12”; `bl9c` (content) “A number of our people have narrated from Ahmad ibn Muhammad from al-H”; `bl9d` (content) ““I once asked abu Ja’far, ‘Alayhi al-Salam, about a slave-girl who was”
- `1.13.13`: `bl9e` (content) “H 12819, Ch. 13, h 13”; `bl9g` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.13.14`: `bl9f` (content) “A number of our people have narrated from Sahl ibn Ziyad and Muhammad ”; `bl9h` (lead-in) “H 12820, Ch. 13, h 14”; `bl9i` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl9j` (content) ““A woman of our family made a will about one-third of her legacy and a”
- `1.13.15`: `bl9l` (lead-in) “H 12821, Ch. 13, h 15”; `bl9m` (content) “A number of our people have narrated from Sahl ibn Ziyad and Muhammad ”; `bl9n` (content) ““About the case of a man who at the time of his death makes a will to ”
- `1.15.1`: `bl9y` (content) “H 12825, Ch. 14, h 1”; `bla5` (lead-in) “H 12827, Ch. 15, h 1”; `bla6` (content) “Ali ibn Ibrahim has narrated from his father and Humayd ibn Ziyad has ”; `bla7` (content) ““A man made a will and asked me to pay for al-Hajj from his legacy, bu”
- `1.16.2`: `blai` (lead-in) “H 12831, Ch. 16, h 2”; `blaj` (content) “It is narrated from the narrator of the previous Hadith from his fathe”; `blak` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.16.4`: `blal` (lead-in) “H 12832, Ch. 61, h 3”; `blam` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Husayn from Ali i”; `blaq` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about al-Mudabbar. He ”
- `1.17.1`: `blas` (content) “H 12834, Ch. 17, h 1”; `blau` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘The shroud is paid for f”
- `1.17.2`: `blat` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Mahbu”; `blav` (lead-in) “H 12835, Ch. 17, h 2”; `blaw` (content) “A number of our people have narrated from Sahl ibn Ziyad and Muhammad ”; `blax` (content) ““I once asked him (the Imam), ‘Alayhi al-Salam, about the case of a ma”
- `1.18.1`: `blb2` (content) “H 12837, Ch. 18, h 1”; `blb4` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, has said that ’Amir al-Mu’minin has sai”
- `1.18.2`: `blb3` (content) “Ali ibn Ibrahim has narrated from his father and A number of our peopl”; `blb5` (lead-in) “H 12838, Ch. 18, h 2”; `blb6` (lead-in) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad from ce”; `blb7` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.18.3`: `blb8` (lead-in) “H 12839, Ch. 18, h 3”; `blb9` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn ‘Isma‘il”; `blba` (content) ““Once we were with abu Ja‘far, ‘Alayhi al-Salam. We were in a group wa”
- `1.19.1`: `blbp` (lead-in) “H 12844, Ch. 19, h 1”; `blbq` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn ‘Isma‘il”; `blbr` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, once asked me, ‘Is there a differen”
- `1.19.3`: `blbs` (lead-in) “H 12845, Ch. 19, h 2”; `blbt` (content) “Ali ibn Ibrahim has narrated from his father [from ibn abu ‘Umayr] fro”; `blby` (content) ““This is about the case of a man who frees his slave at the time of hi”
- `1.21.1`: `blc4` (lead-in) “H 12848, Ch. 21, h 1”; `blc5` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ahmad ibn”; `blc6` (content) ““Abu Ja‘far, ‘Alayhi al-Salam, has said, ‘When a boy becomes ten years”
- `1.21.4`: `blca` (content) “H 12850, Ch. 21, h 3”; `blcd` (lead-in) “H 12851, Ch. 21, h 4”; `blce` (lead-in) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad ibn Sama‘ah ”; `blcf` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘When a boy becomes ten y”
- `1.21.3`: `blcb` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad from ce”; `blcc` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘When a boy becomes ten y”
- `1.22.4`: `blcq` (lead-in) “H 12855, Ch. 22, h 4”; `blcr` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad and Ali ibn Ib”; `blcs` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.23.2`: `blcy` (lead-in) “H 12857, Ch. 23, h 2”; `blcz` (content) “It is narrated from the narrator of the previous Hadith from his fathe”; `bld0` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Giving charity or settin”
- `1.23.3`: `bld1` (lead-in) “H 12858, Ch. 23, h 3”; `bld2` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ahmad ibn”; `bld3` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘Charity has emerged newl”
- `1.23.11`: `bldp` (lead-in) “H 12866, Ch. 23, h 11”; `bldq` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bldr` (content) ““Abu ‘Abd Allah, ‘Alayhi al-Salam, has said, ‘If the gift still exists”
- `1.23.17`: `ble2` (content) “H 12870, Ch. 23, h 15”; `ble5` (lead-in) “H 12871, Ch. 23, h 16”; `ble6` (lead-in) “A number of our people have narrated from Ahmad ibn abu as from ‘Uthma”; `ble7` (content) ““I once asked him (the Imam), ‘Alayhi al-Salam, about the case of a ma”
- `1.23.18`: `ble8` (lead-in) “H 12872, Ch. 23, h 17”; `ble9` (content) “Abu Ali al-Ash‘ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”; `blea` (content) ““I once said to abu al-Hassan, ‘Alayhi al-Salam, that my mother gave m”
- `1.23.24`: `blen` (lead-in) “H 12877, Ch. 23, h 22”; `bleo` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bleq` (lead-in) “H 12878, Ch. 23, h 23”; `bler` (lead-in) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Husayn from Safwa”; `bles` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.23.29`: `blf6` (lead-in) “H 12883, Ch. 23, h 28”; `blf7` (content) “A number of our people have narrated from Ahmad ibn abu ‘Abd Allah fro”; `blf8` (content) ““About an issue of a legacy for distribution I once faced differences ”
- `1.23.30`: `blf9` (lead-in) “H 12884, Ch. 23, h 29”; `blfa` (content) “A number of our people have narrated from Sahl ibn Ziyad and Ahmad ibn”; `blfb` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the case of a ma”
- `1.23.31`: `blfd` (lead-in) “H 12885, Ch. 23, h 30”; `blfe` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa and A”; `blff` (content) ““I once wrote to abu Ja‘far ‘Alayhi al-Salam, that so and so has bough”
- `1.23.37`: `blfv` (lead-in) “H 12891, Ch. 23, h 36”; `blfw` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad and Abu Ali al”; `blfx` (content) ““I once asked abu al-Hassan, ‘Alayhi al-Salam, about the case of a man”
- … 318 more in the TSV

**Opening invocations carrying a number** (4)

- `1`: `bl2w` “In the name of Allah, the Beneficient, the Merciful”
- `1.35.14`: `blk1` ““In the name of Allah, the Beneficent, the Merciful”
- `1.35.22`: `blkc` ““In the name of Allah, the Beneficent, the Merciful”
- `1.35.25`: `bl2fc` ““In the name of Allah, the Beneficent, the Merciful”

**Header numbers colliding with another block** (142)

- `1`: `bl2w` (content) “In the name of Allah, the Beneficient, the Merciful”; `bl2x` (header) “Part One”; `bl2eg` (header) “The Matters for which one can Make a Will and what is Preferable in th”; `bl2eq` (header) “An Executor of the Will is held Responsible for Changing a Lawful Will”; `bl2f1` (header) “The Will for a Part of One’s Assets”; `bl2h9` (header) “Inheritance of the Crying Newborn Child”; `bl2io` (header) “The Case of a Man who hears a Testimony but does not Witness it”; `bl2hy` (header) “The Case of One who Testifies, then Retracts it”; `bl2ih` (header) “The Testimony of an Accuser and an Ex-convict”
- `2`: `bl2ea` (header) “The Book of Wills”; `blpi` (header) “Part Two”
- `3`: `bl2eb` (header) “The Will and What it Must Consist of”; `bl1iq` (header) “Part Three:”
- `1.3`: `bl2ec` (header) “The Witness for the Will”; `bl44` (header) “Chapter 3”; `bl2ee` (header) “A Man Makes a Will and Appoints an Executor but he Refuses to Accept i”
- `1.5`: `bl2ed` (header) “The Owner is more Rightful to his Property as Long as he is Living”; `bl5j` (header) “Chapter 5”
- … 137 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (507)

- `1.1.4`: `bl34` (lead-in) “H 12750, Ch. 1, h 2”; `bl35` (lead-in) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad from al”; `bl36` (content) ““Once a Mawla’ of abu ‘Abd Allah, ‘Alayhi al-Salam, accompanied me (on”
- `1.1.8`: `bl3d` (lead-in) “H 12753, Ch. 1, h 5”; `bl3e` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad, from ibn Mahb”
- `1.2.1`: `bl3h` (lead-in) “H 12754, Ch. 2, h 1”; `bl3i` (lead-in) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl3j` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the meaning of t”
- `1.2.2`: `bl3k` (lead-in) “H 12755, Ch. 2, h 2”; `bl3l` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl3m` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, if it is permissible f”
- `1.2.4`: `bl3q` (lead-in) “H 12757, Ch. 2, h 4”; `bl3r` (lead-in) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan, from ibn ”; `bl3s` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, if a woman’s bearing w”
- … 502 more in the TSV

### Bihar al-Anwaar Volume 1 (`bihar_al_anwaar_volume_1_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (340)

- `1.1.2`: `bl38` (content) “آل عمران: وما يذكر إال اولوا االلباب 7 ” وقال تعاىل ”: قد بينا لكم اآل”; `bl39` (content) “(Surah) Aal-e-Imran: — And none (would) mention except those with the ”
- `1.1.19`: `bl46` (content) “1 - مع، ىل: احلافظ، عن أمحد بن عبد اهلل الثقفي، عن عيسى بن حممد الكاتب”; `bl47` (content) “In accordance to Al Hafiz, from Ahmad Bin Abdullah Al Saqafy, from Isa”
- `1.1.20`: `bl48` (content) “2 - ىل: العطار، عن أبيه، عن سهل، عن حممد بن عيسى، عن البزنطي، عن مجيل ”; `bl49` (content) “According to Al Attar, from his father, from Sahl, from Muhammad Bin I”
- `1.1.21`: `bl4a` (content) “3 - ىل: ابن إدريس، عن أبيه، عن ابن هاشم، عن ابن مرار، عن يونس، عن ابن ”; `bl4b` (content) “According to Ibn Idrees, from his father, from Ibn Hashim, from Ibn Ma”
- `1.1.23`: `bl4e` (content) “4 - ل: أيب، عن سعد، عن ابن يزيد، عن إمساعيل بن قتيبة البصري، عن أيب خا”; `bl4f` (content) “According to my father, from Sa’ad, from Ibn Yazeed, from Ismail Bin Q”
- `1.1.25`: `bl4i` (content) “6 - ىل: ابن موسى، عن حممد بن يعقوب، عن علي بن حممد بن عبد اهلل، عن إبر”; `bl4j` (content) “According to Ibn Musa, from Muhammad Bin Yaqoub, from Ali Bin Muhammad”
- `1.1.27`: `bl4m` (content) “فقال: إن الثواب على قدر العقل، إن رجال من بين إسرائيل كان يعبد اهلل عز”; `bl4n` (content) “So he said: ‘The Rewards are in accordance to the intellect. There use”
- `1.1.28`: `bl4o` (content) “فأراه اهلل عزوجل ذلك، فاستقله امللك، فأوحى اهلل عزوجل إليه أن اصحبه فأ”; `bl4p` (content) “So Allah Mighty and Majestic Showed that to him, but the Angel conside”
- `1.1.29`: `bl4q` (content) “فلما أصبح قال له امللك: إن مكانك لنزهة، قال: ليت لربنا هبيمة، فلو كان ”; `bl4r` (content) “So, when it was morning, the Angel said to him, ‘Your place is natural”
- `1.1.33`: `bl4y` (content) “8 - ل، ىل: ابن الربقي، عن أبيه، عن جده، عن عمرو بن عثمان، عن أيب مجيلة”; `bl4z` (content) “According to Ibn Al Barqy, from his father, from his grandfather, from”
- `1.1.36`: `bl52` (content) “فقال جربئيل للحياء والدين: انصرفا ودعاه فقاال له: يا جربئيل إنا امرنا ”; `bl54` (content) “9 - ل: ابن الوليد، عن الصفار، عن حممد بن عيسى، عن عثمان بن عيسى، عن اب”; `bl55` (content) “According to Ibn Al Waleed, from Al Saffar, from Muhammad Bin Isa, fro”
- `1.1.39`: `bl5a` (content) “12 - ما: املفيد رمحه اهلل، عن أيب حفص عمر بن حممد، عن ابن مهرويه، عن د”; `bl5b` (content) “Al Mufeed, from Abu Hafs Umar Bin Muhammad, from Ibn Mahrawiya, from D”
- `1.1.40`: `bl5c` (content) “13 - ما: املفيد، عن احلسني بن حممد التمار، عن حممد بن قاسم االنباري، ع”; `bl5d` (content) “Al Mufeed, from Al Husayn Bin Muhammad Al Tammar, from Muhammad Bin Qa”
- `1.1.41`: `bl5e` (content) “يا بين ال فقر أشد من اجلهل، وال عدم أشد من عدم العقل، وال وحدة وال وحش”; `bl5f` (content) “‘O my son! There is no poverty more severe than ignorance, nor any dep”
- `1.1.44`: `bl5k` (content) “يا بين إن من البالء الفاقة، وأشد من ذلك مرض البدن، وأشد من ذلك مرض الق”; `bl5l` (content) “O my son! Surely, from the afflictions, there is the destitution, and ”
- `1.1.45`: `bl5m` (content) “يا بين للمؤمن ثالث ساعات: ساعة يناجي فيها ربه، وساعة حياسب فيها نفسه، ”; `bl5n` (content) “O my son! For the Momin there are three timings — a time during which ”
- `1.1.46`: `bl5o` (content) “14 - ما: املفيد، عن ابن قولويه، عن الكليين، عن علي بن إبراهيم، عن اليق”; `bl5p` (content) “Al Mufeed, from Ibn Qawlaqiyah, from Al Kulayni, from Ali Bin Ibrahim,”
- `1.1.47`: `bl5q` (content) “15 - ما: املفيد، عن إمساعيل بن حممد الكاتب، عن عبد الصمد بن علي، عن حم”; `bl5r` (content) “Al Mufeed, from Ismail Bin Muhammad the scribe, from Abdul Samad Bin A”
- `1.1.48`: `bl5s` (content) “االجتهاد يف عبادة اهلل أربح جتارة، وال مال أعود من العقل، وال فقر أشد ”; `bl5t` (content) “‘The striving in the worship of Allah is the most profitable of trades”
- `1.1.49`: `bl5u` (content) “16 - ع: ابن املتوكل، عن السعد آبادي، عن الربقي، عن أبيه، عن ابن أيب عم”; `bl5v` (content) “Ibn Al Mutawakkal, from Al Sa’ad Abady, from Al Barqy, from his father”
- `1.1.50`: `bl5w` (content) “17 - ع: ابن الوليد، عن الصفار، عن أمحد بن حممد، عن ابن حمبوب، عن بعض أ”; `bl5x` (content) “Ibn Al Waleed, from Al Saffar, from Ahmad Bin Muhammad, from Ibn Mahbo”
- `1.1.52`: `bl60` (content) “19 ثو: أيب، عن أمحد بن إدريس، عن االشعري، عن حممد بن حسان، عن أيب حممد”; `bl61` (content) “My father, from Ahmad Bin Idrees, from Al Ashary, from Muhammad Bin Ha”
- `1.1.53`: `bl62` (content) “20 - ثو: هبذ االسناد، عن أيب حممد، عن ابن عمرية، عن إسحاق بن عمار، قال”; `bl63` (content) “By this chain, from Abu Muhammad, from Ibn Umeyr, from Is’haq Bin Amma”
- `1.1.54`: `bl64` (content) “21 - سن: أيب، عن حممد بن سنان، عن رجل من مهدان، عن عبيد اهلل بن الوليد”; `bl65` (content) “My father, from Muhammad Bin Sinan, from a man from Hamdan, from Ubeyd”
- `1.1.58`: `bl6c` (content) “22 - سن: بعض أصحابنا رفعه قال: قال رسول اهلل (صلى اهلل عليه وآله): ما ”; `bl6d` (content) “One of our companions raised it, said, ‘Rasool-Allah said: ‘Allah has ”
- `1.1.60`: `bl6e` (content) “وال بعث اهلل رسوال وال نبيا حىت يستكمل العقل، ويكون عقله أفضل من عقول ”; `bl6g` (content) “وما أدى العاقل فرائض اهلل حىت عقل منه، وال بلغ مجيع العابدين يف فضل عب”; `bl6h` (content) “And the intellectual does not perform the Obligations of Allah until h”
- `1.1.63`: `bl6m` (content) “فقال: ليس هؤالء ممن خاطب اهلل يف قوله: يا اويل االلباب. إن اهلل خلق ال”; `bl6n` (content) “So he said: ‘Those aren’t from the one whom Allah Addressed in His Wor”
- `1.1.64`: `bl6o` (content) “24 - سن: النوفلي، وجهم بن حكيم املدائين، عن السكوين، عن أيب عبد اهلل، ”; `bl6p` (content) “Al Nowfaly and Jahm Bin Hakeem Al Madainy, from Al Sakuny, ‘From Abu A”
- `1.1.71`: `bl70` (content) “27 - ضه: قال أمري املؤمنني (عليه السالم) صدر العاقل صندوق سر ه، وال غى”; `bl72` (content) “28 - ضه: روي عن ابن عباس، انه قال: أساس الدين بين على العقل، وفرضت الف”; `bl73` (content) “It is reported from Ibn Abbas having said, ‘The foundation of the Reli”
- `1.1.77`: `bl7e` (content) “34 - وقال (عليه السالم): ال مال أعود من العقل، وال مصيبة أعظم من اجلهل”; `bl7f` (content) “And he said: ‘There is no wealth more supportive than the intellect, n”
- `1.1.78`: `bl7g` (content) “35 - ما: مجاعة، عن أيب املفضل: عن حنظلة بن زكريا القاضي، عن حممد بن عل”; `bl7h` (content) “A group, from Abu Al Mufazzal, from Hanzalat Bin Zakariyya the judge, ”
- `1.1.87`: `bl7y` (content) “44 - كنز الكراجكي قال النيب (صلى اهلل عليه وآله): لكل شيئ آلة وعدة وآل”; `bl7z` (content) “(The book) Kunz of Al-Karajaky — The Prophet said: ‘For everything the”
- `1.2.1`: `bl8n` (content) “1 - ىل: ابن املتوكل، عن احلمريي، عن ابن عيسى، عن ابن حمبوب، عن العالء ”; `bl8o` (content) “Ibn Al Mutawakkal, from Al Humeyri, from Ibn Isa, from Ibn Mahboub, fr”
- `1.2.4`: `bl8s` (content) “3 - سن: حممد بن علي، عن وهيب بن حفص، عن أيب بصري، عن أيب عبد اهلل (علي”; `bl8t` (content) “Muhammad Bin Ali, from Waheyb Bin Hafs, from Abu Baseer, ‘From Abu Abd”
- `1.2.5`: `bl8u` (content) “4 - سن: السندي بن حممد، عن العالء، عن حممد، عن أيب جعفر، وأيب عبد اهلل”; `bl8v` (content) “Al Sindy Bin Muhammad, from Al A’ala, from Muhammad, ‘From Abu Ja’far ”
- `1.2.6`: `bl8w` (content) “5 - سن: علي بن احلكم، عن هشام، قال: قال أبو عبد اهلل (عليه السالم): مل”; `bl8x` (content) “Ali Bin Al Hakam, from Hisham who said, ‘Abu Abdullah said: ‘When Alla”
- `1.2.7`: `bl8y` (content) “6 - سن: أيب، عن عبد اهلل بن الفضل النوفلي، عن أبيه، عن أيب عبد اهلل (ع”; `bl8z` (content) “My father, from Abdullah Bin Al Fazl Al Nowfaly, from his father, ‘Fro”
- `1.2.9`: `bl90` (content) “فأعطى اهلل حممدا (صلى اهلل عليه وآله) تسعة وتسعني جزءا، مث قسم بني الع”; `bl92` (lead-in) “7 - غو: قال النيب (صلى اهلل عليه وآله): أول ما خلق اهلل نوري.”; `bl93` (content) “The Prophet said: ‘The first of what Allah Created was my Noor (Light)”
- `1.2.11`: `bl96` (content) “9 - وروي بطريق آخر أن اهلل عزوجل ملا خلق العقل قال له أقبل فأقبل، مث ق”; `bl97` (content) “And it is reported by another source that Allah Mighty and Majestic, w”
- `1.2.12`: `bl98` (content) “10 - ع: أيب، عن سعد، عن ابن هاشم عن ابن معبد، عن احلسني بن خالد، عن إس”; `bl99` (content) “From Sa’ad, from Ibn Hashim, from Ibn Ma’bad, from Al Husayn Bin Khali”
- `1.2.13`: `bl9a` (content) “فقال: يا إسحاق أو ما تدري مل هذا ؟ قلت ال. قال الذي تكلمه ببعض كالمك ف”; `bl9b` (content) “So he said: ‘O Is’haq! Or do you not know why this is so?’ I said, ‘No”
- `1.2.14`: `bl9c` (content) “11 - ختص: قال الصادق (عليه السالم): إن اهلل تبارك وتعاىل ملا خلق العقل”; `bl9d` (content) “Al-Sadiq said: ‘Allah Blessed and Exalted, when He Created the intelle”
- `1.2.16`: `bl9g` (content) “13 - ع: ابن الوليد، عن الصفار، عن ابن عيسى، عن البزنطي، عن أيب مجيلة ع”; `bl9h` (content) “Ibn Al Waleed, from Al Saffar, from Ibn Isa, from Al Bazanty, from Abu”
- `1.2.18`: `bl9k` (content) “قال: خلقه ملك له رؤوس بعدد اخلالئق من خلق و من خيلق إىل يوم القيامة، و”; `bl9l` (content) “He said: ‘He Created it as an Angel having heads for it of the number ”
- `1.3.1`: `bl9q` (content) “1 - ج: يف خرب ابن السكيت قال: فما احلجة على اخللق اليوم ؟ فقال الرضا (”; `bl9r` (content) “In a Hadeeth of Ibn Al-Sakeet who said, ‘So what is the proof upon the”
- `1.3.2`: `bl9s` (content) “2 - مع: أيب، عن علي بن إبراهيم، عن حممد بن عيسى، عن ابن أيب عمري، عن ي”; `bl9t` (content) “My father, from Ali Bin Ibrahim, from Muhammad Bin Isa, from Ibn Abu U”
- `1.3.3`: `bl9u` (content) “إين نظرت يف كتاب لعلي (عليه السالم) فوجدت يف الكتاب أن قيمة كل امرئ وق”; `bl9v` (content) “I looked into the Book of Ali, and I found in the Book that the value ”
- `1.3.4`: `bl9w` (content) “3 - سن: احلسن بن علي بن يقطني، عن حممد بن سنان، عن أيب اجلارود، عن أيب”; `bl9x` (content) “Al Hassan Bin Ali Bin Yaqteen, from Muhammad Bin Sinan, from Abu Al Ja”
- `1.3.6`: `bla0` (content) “5 - سن: النوفلي وجهم بن حكيم املدائين، عن السكوين، عن أيب عبد اهلل، عن”; `bla1` (content) “Al Nowfaly and Jahm Bin Hakeem Al Madainy, from Al Sakuny, ‘From Abu A”
- `1.4.1`: `bla4` (content) “1 - ل: أيب، عن سعد، عن الربقي، عن أبيه رفعه قال: قال رسول اهلل (صلى اه”; `bla5` (content) “My father, from Sa’ad, from Al Barqy, from his father, raising it, sai”
- `1.4.2`: `bla6` (content) “2 - ل: ماجيلويه، عن حممد العطار، عن حممد بن أمحد، عن سهل، عن جعفر بن ح”; `bla7` (content) “Majaylawiya, from Muhammad Al Attar, from Muhammad Bin Ahmad, from Sah”
- `1.4.3`: `bla8` (content) “3 - ع، ل: أمحد بن حممد بن عبد الرمحن املروزي، عن حممد بن جعفر املقري ا”; `bla9` (content) “Ahmad Bin Muhammad Bin Abdul Rahman Al Maruzy, from Muhammad Bin Ja’fa”
- `1.4.4`: `blaa` (content) “قال رسول اهلل (صلى اهلل عليه وآله): إن اهلل خلق العقل من نور خمزون مكن”; `blab` (content) “Rasool-Allah said: ‘Allah Created the intellect from treasured Light c”
- `1.4.7`: `blaf` (content) “مث قال عزوجل: أدبر فأدبر، مث قال له: أقبل فأقبل. مث قال له: تكلم فقال:”; `blag` (content) “Then the Mighty and Majestic Said: “Turn back!” So it turned back. The”
- `1.4.8`: `blah` (content) “فقال الرب تبارك وتعاىل: وعزيت وجاليل ما خلقت خلقا أحسن منك، وال أطوع ي”; `blai` (content) “So the Lord Blessed and Exalted Said: “By My Mighty and My Majesty! I ”
- `1.4.12`: `blao` (content) “4 - ل: أيب، عن سعد، عن أمحد بن هالل، عن امية بن علي، عن ابن املغرية، ع”; `blap` (content) “From Sa’ad, from Ahmad Bin Hilal, from Ameet Bin Ali, from Ibn Al Mugh”
- `1.4.13`: `blaq` (content) “منا الناس رجالن: فرجل هو خري منه وأتقى، وآخر هو شر منه وأدىن، فإذا رأى”; `blar` (content) “But rather, the people are two men (types) — A man who is better than ”
- `1.4.14`: `blas` (content) “5 - ما: املفيد، عن حممد بن عمر اجلعايب، عن أمحد بن حممد بن سعيد، عن اح”; `blat` (content) “Al Mufeed, from Muhammad Bin Umar Al Ja’aby, from Ahmad Bin Muhammad B”
- `1.4.15`: `blau` (content) “6 - ع: ابن الوليد، عن الصفار، عن إبراهيم بن هاشم، عن أيب إسحاق إبراهيم”; `blav` (content) “Ibn Al Waleed, from Al Saffar, from Ibrahim Bin Hashim, from Abu Is’ha”
- `1.4.16`: `blaw` (content) “7 - ل: أيب، عن سعد واحلمريي معا، عن الربقي عن علي بن حديد، عن مساعة قا”; `blax` (content) “From my father, from Sa’ad and Al Humeyri both together, from Al Barqy”
- … 280 more in the TSV

**Header numbers colliding with another block** (3)

- `1`: `bl30` (header) “(كتاب العقل والعلم والجهل)”; `bl32` (header) “Section One”
- `2`: `bl31` (header) “The Book of Intellect, and the Knowledge and the Ignorance”; `blpl` (header) “Section Two”
- `2.1`: `bl35` (content) “االيات، البقرة: اليات لقوم يعقلون 164 " وقال تعاىل ": كذلك يبني اهلل ل”; `blpn` (header) “Chapter 1 — Obligation of (Acquiring) the Knowledge, and the Obligatio”

**Signature / closing lines carrying a number** (18)

- `1.1.7`: `bl3i` (signature) “هود: ولكين أريكم قوما جتهلون 29”; `bl3j` (content) “(Surah) Hud : — They will meet their Lord, but I see you as an ignoran”
- `1.1.8`: `bl3k` (signature) “يوسف: إنا أنزلناه قرآنا عربيا لعلكم تعقلون 2”; `bl3l` (content) “(Surah) Yusuf : — Surely, We have Revealed it as an Arabic Quran, so y”
- `1.1.9`: `bl3m` (signature) “الرعد: إمنا يتذكر اولو االلباب 19”; `bl3n` (content) “(Surah) Al Ra’ad: — But rather, the ones with the understanding will b”
- `1.1.10`: `bl3o` (signature) “ابراهيم: وليذكر اولوا االلباب 52”; `bl3p` (content) “(Surah) Ibrahim : — and for the ones of understanding to be mindful [1”
- `1.1.11`: `bl3q` (signature) “طه: إن يف ذلك آليات الويل النهى 54”; `bl3r` (content) “(Surah) Ta Ha: — Surely, in that are Signs for the possessors of intel”
- … 13 more in the TSV

**Source / citation lines carrying a number** (4)

- `1.4.112`: `blg8` (content) “17 - ضه، غو: عن النيب (صلى اهلل عليه وآله) قال: رأس العقل بعد االميان ”; `blg9` (source) “From the Prophet having said: ‘The head of the intellect, after the Em”
- `1.4.114`: `blgc` (content) “18 - ضه: عن النيب (صلى اهلل عليه وآله)، قال: رأس العقل بعد االميان باه”; `blgd` (source) “From the Prophet having said: ‘The head of the intellect, after the Em”
- `1.5.4`: `blpj` (source) “(أبواب العلم وآدابه وأنواعه وأحكامه)”; `blpm` (content) “باب 1 (فرض العلم، ووجوب طلبه، والحث عليه، وثواب العالم والمتعلم)”
- `2.6.51`: `bl184` (content) “37 - سر: من كتاب جعفر بن حممد بن سنان الدهقاين، عن عبيد اهلل، عن درست،”; `bl185` (source) “From the book of Ja’far Bin Muhammad Bin Sinan Al Dahqany, from Ubeydu”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (432)

- `1.1.3`: `bl3a` (lead-in) “املائدة: ذلك بأهنم قوم ال يعقلون 85 ” وقال تعاىل ”: فاتقوا اهلل يا اوي”; `bl3b` (content) “(Surah) Al-Ma’idah: — that is because they are a people who are not un”
- `1.1.4`: `bl3c` (lead-in) “االنعام: ولكن أكثرهم جيهلون 111 ” وقال ”: وللدار اآلخرة خري للذين يتقو”; `bl3d` (content) “Surah Al-Anam: — but most of them are ignorant [6:111]. And Said: And ”
- `1.1.5`: `bl3e` (lead-in) “االنفال: إن شر الدواب عند اهلل الصم البكم الذين ال يعقلون 22”; `bl3f` (content) “(Surah) Al-Anfaal: — Surely, the vilest animals in the Presence of All”
- `1.1.6`: `bl3g` (lead-in) “يونس: أفأنت تسمع الصم ولو كانوا ال يعقلون 42 ” وقال تعاىل ”: وجيعل الر”; `bl3h` (content) “(Surah) Yunus: — But can you make the deaf to hear and even though the”
- `1.1.12`: `bl3s` (lead-in) “النور: كذلك يبني اهلل لكم اآليات لعلكم تعقلون 61”; `bl3t` (content) “(Surah) Al-Noor: — Like that, Allah Clarifies the Verses, perhaps you ”
- … 427 more in the TSV

### Bihar al-Anwaar Vol 2 (`bihar_al_anwaar_volume_2_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (332)

- `8.1`: `bl4y` (content) “االيات، هود: أال لعنة اهلل على الظاملني الذين يصدون عن سبيل اهلل ويبغو”; `bl2e9` (content) “الآيات - (سورة) الأعراف: وقرأوا عليهم ما قدمنا ​​لهم آياتنا ، لكنه انف”
- `8.2`: `bl4z` (content) “The Verses: (Surah) Hud Indeed, the Curse of Allah is upon the unjust ”; `bl2eb` (content) “The Verses — (Surah) Al A’raaf: And recite to them the one We Gave Our”
- `8.3`: `bl50` (content) “ابراهيم: الذين يستحبون احلياة الدنيا على اآلخرة ويصدون عن سبيل اهلل وي”; `bl2ec` (content) “املؤمن: فلما جاءهتم رسلهم بالبينات فرحوا مبا عندهم من العلم وحاق هبم م”
- `8.4`: `bl51` (content) “(Surah) Ibrahim: Those who are loving the life of the world over the H”; `bl2ed` (content) “(Surah) Al Momin: Then when their Rasools came to them with the clear ”
- `8.5`: `bl52` (content) “” وقال تعاىل “: وجعلوا هلل أندادا ليضلوا عن سبيله قل متتعوا فإن مصريكم”; `bl2ee` (content) “محعسق: وما تفرقوا إال من بعد ما جائهم العلم بغيا بينهم 13”
- `8.6`: `bl53` (content) “And they are making rivals to be for Allah in order to stray (people) ”; `bl2ef` (content) “(Surah Al Shurah): And they did not become divided except from after t”
- `8.7`: `bl54` (content) “النحل: ليحملوا أوزارهم كاملة يوم القيامة، ومن أوزار الذين يضلوهنم بغري”; `bl2eg` (content) “اجلمعة: مثل الذين محلوا التورية مث مل حيملوها كمثل احلمار حيمل أسفارا ”
- `8.8`: `bl55` (content) “(Surah) Al-Nahl: They would be bearing their burdens entirely on the D”; `bl2eh` (content) “That is the Grace of Allah. He Gives it to ones He so Desires to, and ”
- `8.9`: `bl56` (content) “”وقال تعاىل“ ادع إىل سبيل ربك باحلكمة واملوعظة احلسنة 125”; `bl2ei` (content) “1- ب: هارون، عن ابن صدقة، عن جعفر، عن أبيه عليهما السالم: أن عليا عليه”
- `8.10`: `bl57` (content) “Call to the Way of your Lord with the wisdom and goodly exhortation [1”; `bl2ek` (content) “‘From Ja’far asws , from his asws father asws : ‘Ali asws said: ‘Bewar”
- `8.11`: `bl58` (content) “االنبياء: وجعلناهم أئمة يهدون بأمرنا 73”; `bl2ep` (content) “2 - ل: أيب، عن حممد العطار، عن ابن عيسى، عن أبيه، عن ابن اذينة، عن أبا”
- `8.12`: `bl59` (content) “(Surah) Al-Anbiya: And We made them as Imams guiding by Our Command [2”; `bl2er` (content) “‘From Amir Al-Momineen asws , from the Prophet saww having said in a s”
- `8.13`: `bl5a` (content) “القصص: وال يصدنك عن آيات اهلل بعد إذ انزلت إليك وادع إىل ربك 87”; `bl2eu` (content) “ثم قال أمير المؤمنين: "نعم! أكثر ما أخافه عليك هو سمتان - السعي وراء ا”
- `8.14`: `bl5b` (content) “(Surah) Al-Qasas: And do not let them block you from the Signs of Alla”; `bl2ev` (content) “Then Amir Al-Momineen asws said: ‘Indeed! The most scared of what I as”
- `8.15`: `bl5e` (content) “العنكبوت : وقال الذين كفروا للذين آمنوا اتبعوا سبيلنا ولنحمل خطاياكم و”; `bl2ew` (content) “3 - ل: الفامي، عن ابن بطة، عن الربقي، عن أبيه بإسناده يرفعه إىل أمري ا”
- `8.16`: `bl5f` (content) “(Surah) Al-Ankabout: And those who commit Kufr say to those who believ”; `bl2f0` (content) “‘Raising it to Amir Al-Momineen asws having said: ‘Two (types of) men ”
- `8.17`: `bl5g` (content) “التنزيل: وجعلنا منهم أئمة يهدون بأمرنا ملا صربوا كانوا بآياتنا يوقنون ”; `bl2f8` (content) “4 - ل: ابن املتوكل، عن السعد آبادي، عن الربقي، عن أبيه، عن حممد بن سنا”
- `8.18`: `bl5h` (content) “And We Made Imams from them, guiding by Our Command, due to their bein”; `bl2fb` (content) “‘Amir Al-Momineen asws said: ‘The Fitna (strife) are three — love for ”
- `8.19`: `bl5i` (content) “االحزاب: يا أيها الذين آمنوا اتقوا اهلل وقولوا قوال سديدا يصلح لكم أعم”; `bl2fd` (content) “فمن أحب النساء مل ينتفع بعيشه، ومن أحب األشربة حرمت عليه اجلنة، ومن أح”
- `8.20`: `bl5j` (content) “(Surah) Al-Ahzaab: O you those who believe! Fear Allah and speak the c”; `bl2fe` (content) “So, one who loves the women would not benefit by his life, and one who”
- `8.21`: `bl5k` (content) “السجدة: وقال الذين كفروا ال تسمعوا هلذا القرآن والغوا فيه لعلكم تغلبون”; `bl2fg` (content) “5 - وقال: قال عيسى ابن مرمي عليه السالم: الدينار داء الدين، والعامل طب”
- `8.22`: `bl5l` (content) “(Surah) Al-Sajda: And those who commit Kufr (disbelief) say, ‘Do not l”; `bl2fi` (content) “‘Isa as Bin Maryam as said: ‘The Dinar is a disease of the Religion, a”
- `8.23`: `bl5p` (content) “” وقال تعاىل “: ومن أحسن قوال ممن دعا إىل اهلل و عمل صاحلا وقال إنين م”; `bl2fk` (content) “6 - ل: أيب، عن احلمريي، عن هارون، عن ابن زياد، عن جعفر بن حممد، عن أبي”
- `8.24`: `bl5q` (content) “And the Exalted Said: And who is better in words than the one who supp”; `bl2fn` (content) “‘From Ja’far asws Bin Muhammad asws , from his asws father asws , from”
- `8.25`: `bl5r` (content) “الذاريات: وذ كر فإن الذكرى تنفع املؤمنني 55”; `bl2fo` (content) “قال: العلماء الفجرة، والقراء الفسقة، واجلبابرة الظلمة، والوزراء اخلونة”
- `8.26`: `bl5s` (content) “(Surah) Al-Zariyaat: And continue to do Zikr, for surely the Zikr bene”; `bl2fp` (content) “He asws said: ‘The immoral scholars, and the immoral readers, and the ”
- `8.27`: `bl5t` (content) “االعلى: فذكر إن نفعت الذكرى 9”; `bl2fu` (content) “وإن يف النار ملدينة يقال هلا: احلصينة أفال تسألوين ما فيها ؟ فقيل: وما”
- `8.28`: `bl5w` (content) “(Surah) Al-A’ala: Therefore do Zikr, surely the Zikr is beneficial [87”; `bl2fx` (content) “And in the Fire there is a city called Al Haseyna. Will you not ask me”
- `8.29`: `bl5x` (content) “الغاشية: فذكر إمنا أنت مذكر 22”; `bl2fy` (content) “7 - ع: ابن الوليد، عن الصفار، عن القاشاين، عن اإلصفهاين، عن املنقري، ع”
- `8.30`: `bl5y` (content) “(Surah) Al-Ghashiya: Therefore do Zikr. But rather, you are a Zikr [88”; `bl2g1` (content) “‘From Abu Abdullah asws having said: ‘When you see the scholar loving ”
- `8.31`: `bl5z` (content) “العصر: وتواصوا باحلق وتواصوا بالصرب 3”; `bl2g2` (content) “8 - وقال: أوحى اهلل عز وجل إىل داود عليه السالم: ال جتعل بيين وبينك عا”
- `8.32`: `bl60` (content) “(Surah) Al-Asr: and enjoin each other with the Truth, and enjoin each ”; `bl2g3` (content) “And he asws said: ‘Allah azwj Mighty and Majestic Revealed unto Dawood”
- `8.33`: `bl61` (content) “1 - م، ج: بإسناده إىل أيب حممد العسكري عليه السالم قال: حدثين أيب، عن ”; `bl2g5` (content) “9 -: أيب، عن سعد، عن ابن أيب حممد اخلطاب، عن ابن حمبوب، عن محاد ابن عث”
- `8.34`: `bl63` (content) “By his chain going up to Abu Muhammad Al-Askari asws having said: ‘My ”; `bl2g8` (content) “‘From Abu Ja’far asws regarding the Words of Allah azwj Mighty and Maj”
- `8.35`: `bl66` (content) “أال فمن كان من شيعتنا عاملا بعلومنا وهذا اجلاهل بشريعتنا املنقطع عن مش”; `bl2g9` (content) “10 - ل: ابن الوليد، عن الصفار، عن ابن أيب اخلطاب، عن حممد بن أسلم اجلب”
- `8.36`: `bl67` (content) “Indeed! The one who was from our asws Shias being knowledgeable with o”; `bl2gj` (content) “‘Raising it to Amir Al-Momineen asws having said: ‘Allah azwj Mighty a”
- `8.37`: `bl69` (content) “2 - م، ج: باإلسناد إىل أيب حممد العسكري عليه السالم قال: قال علي بن أي”; `bl2gl` (content) “11 - ل: ماجيلويه، عن حممد العطار، عن حممد بن أمحد، عن اخلشاب، عن ابن م”
- `8.38`: `bl6a` (content) “By the chain going up to Abu Muhammad Al-Askari asws having said: ‘Ali”; `bl2go` (content) “‘Abu Abdullah asws said: ‘From the scholars is one who loved to hoard ”
- `8.39`: `bl6f` (content) “مث ينادي مناد يا عباد اهلل هذا عامل من تالمذة بعض علماء آل حممد أال فم”; `bl2gp` (content) “ومن العلماء من إذا وعظ أنف وإذا وعظ عنف فذاك يف الدرك الثاين من النار،”
- `8.40`: `bl6g` (content) “Then a Caller would Call out: ‘O servants of Allah azwj ! This scholar”; `bl2gq` (content) “And from the scholars is one, when he preaches he is proud, and when h”
- `8.41`: `bl6i` (content) “3 - م: قال أبو حممد العسكري عليه السالم: حضرت امرأة عند الصديقة فاطمة ”; `bl2gr` (content) “ومن العلماء من يرى أن يضع العلم عند ذوي الثروة والشرف وال يرى له يف ام”
- `8.42`: `bl6j` (content) “‘Abu Muhammad Al Askari asws said: ‘A woman came to the presence of th”; `bl2gs` (content) “And from the scholars is one who see that he should place the knowledg”
- `8.43`: `bl6l` (content) “فأجابتها فاطمة عليها السالم عن ذلك، فثنت فأجابت مث ثلثت إىل أن عشرت فأ”; `bl2gt` (content) “ومن العلماء من يذهب يف علمه مذهب اجلبابرة والسالطني فإن رد عليه شئ من ”
- `8.44`: `bl6m` (content) “So (Syeda) Fatima asws answered her about that. Then she asked a secon”; `bl2gu` (content) “And from the scholars is one who goes in his knowledge with a way of t”
- `8.45`: `bl6o` (content) “قالت فاطمة: هايت وسلي عما بدا لك، أرأيت من اكرتي يوما يصعد إىل سطح حبم”; `bl2gv` (content) “ومن العلماء من يطلب أحاديث اليهود والنصارى ليغزر به علمه ويكثر به حديث”
- `8.46`: `bl6q` (content) “(Syeda) Fatima asws said: ‘Give (your questions) to me asws and ask me”; `bl2gw` (content) “And from the scholars is one who seeks the Ahadeeth of the Jews and th”
- `8.47`: `bl6r` (content) “فقالت: اكرتيت أنا لكل مسألة بأكثر من ملء ما بني الثرى إىل العرش لؤلؤا ”; `bl2h0` (content) “ومن العلماء من يضع نفسه للفتيا ويقول: سلوين ولعله ال يصيب حرفا واحدا و”
- `8.48`: `bl6t` (content) “She asws said: ‘I asws have been hired, for every question, with more ”; `bl2h1` (content) “And from the scholars is one who places himself for the Fatwas and is ”
- `8.49`: `bl70` (content) “مث ينادي منادي ربنا عز وجل: أيها الكافلون أليتام آل حممد - صلى اهلل عل”; `bl2h3` (content) “ومن العلماء من يتخذ علمه مروة وعقال فذاك يف الدرك السابع من النار.”
- `8.50`: `bl71` (content) “Then a Caller of the Mighty and Majestic would Call out: “O you guaran”; `bl2h4` (content) “And from the scholars is one who takes his knowledge (from) opinions a”
- `8.51`: `bl73` (content) “مث إن اهلل تعاىل يقول: أعيدوا على هؤالء العلماء الكافلني لأليتام حىت ت”; `bl2h5` (content) “12 - ما: املفيد، عن أيب احلسن أمحد بن حممد بن احلسني، عن أبيه، عن الصف”
- `8.52`: `bl74` (content) “Then Allah azwj the Exalted would Say: “Repeat upon those scholars, th”; `bl2h8` (content) “‘I heard Abu Abdullah Ja’far asws Bin Muhammad asws saying: ‘Isa as Bi”
- `8.53`: `bl75` (content) “وقالت فاطمة عليها السالم: يا أمة اهلل إن سلكة من تلك اخللع ألفضل مما ط”; `bl2h9` (content) “ويلكم علماء السوء ! االجرة تأخذون، والعمل ال تصنعون، يوشك رب العمل أن ”
- `8.54`: `bl76` (content) “And (Syeda) Fatima asws said: ‘O maid of Allah azwj ! A thread from th”; `bl2ha` (content) “Woe be unto, O evil scholars! You are taking recompense, and you are n”
- `8.55`: `bl77` (content) “4 - م، ج: باإلسناد إىل أيب حممد العسكري عليه السالم قال: قال احلسن بن ”; `bl2hc` (content) “13 - ثو: أيب، عن علي، عن أبيه، عن النوفلي، عن السكوين، عن الصادق، عن آ”
- `8.56`: `bl7b` (content) “By the chain going up to Abu Muhammad Al-Askari asws having said: ‘Al-”; `bl2hf` (content) “‘From Al-Sadiq asws , from his asws forefathers asws having said: ‘Ras”
- `8.57`: `bl7e` (content) “5 - م، ج: باإلسناد إىل أيب حممد العسكري عليه السالم قال: قال احلسني بن”; `bl2hl` (content) “14 - ثو: هبذا اإلسناد قال: قال رسول اهلل صلى اهلل عليه واله: سيأيت على”
- `8.58`: `bl7g` (content) “By the chain going up to Abu Muhammad Al-Askari asws having said: ‘Al-”; `bl2hn` (content) “‘Rasool-Allah saww said: ‘There would be coming an era upon my saww co”
- `8.59`: `bl7k` (content) “6 - م: قال أبو حممد العسكري عليه السالم: قال علي بن احلسني عليه الصالة”; `bl2hp` (content) “15 - غو، روي عن النيب صلى اهلل عليه واله أنه قال: الفقهاء أمناء الرسل ”
- `8.60`: `bl7m` (content) “And Abu Muhammad Al-Askari asws said: ‘Ali asws Bin Al-Husayn asws sai”; `bl2hr` (content) “It is reported from the Prophet saww having said: ‘The jurists are the”
- … 272 more in the TSV

**Opening invocations carrying a number** (44)

- `8.157`: `bld7` “فذهب الرجل وحضر املوضع وحضروا وكلم الرجل فأفحمه وصريه ال يدري يف السماء هو أو يف األرض”
- `8.305`: `blmx` “قالوا: بلى يا ابن رسول اهلل قال: أعظم من هذا القتل أن تقتله قتال ال ينجرب وال حييا بعده أبدا. قالوا:”
- `9.55`: `blss` “مث قال: وتدري ما معىن قوله: أو ليقبل بوجوه الناس إليه ؟ قلت: ال، قال: يعين واهلل بذلك ادعاء اإلمامة ”
- `9.147`: `bly5` “فإن العامل العامل بغري علمه كاجلاهل احلائر الذي ال يستفيق من جهله، بل احلجة عليه أعظم، واحلسرة له أل”
- `4.17`: `bl16m` “وأما صاحب االستطالة واخلتل فإنه يستطيل على أشباهه من أشكاله، ويتواضع لألغنياء من دوهنم، فهو حللوائهم”
- `5.33`: `bl1fm` “مث يقول: بسم اهلل، حسيب اهلل، توكلت على اهلل، وال حول وال قوة إال باهلل العلي العظيم، اللهم ثبت جناي”
- `6.85`: `bl1m4` “وإذا سألوك عن التوحيد فقل - كما قال اهلل عز وجل: قل هو اهلل أحد اهلل الصمد مل يلد ومل يولد ومل يكن ل”
- `6.89`: `bl1m9` “وإذا سألوك عن السمع فقل - كما قال اهلل عز وجل -: هو السميع العليم. كلم الناس مبا يعرفون.”
- `7.201`: `bl2az` “بني لكم فاهتدوا، وبقول العلماء فانتفعوا، والسبيل يف ذلك إىل اهلل فمن يهدي اهلل فهو املهتدي، ومن يضلل”
- `8.13`: `bl2eu` “ثم قال أمير المؤمنين: "نعم! أكثر ما أخافه عليك هو سمتان - السعي وراء الرغبات والآمال الطويلة. أما ال”
- `8.19`: `bl2fd` “فمن أحب النساء مل ينتفع بعيشه، ومن أحب األشربة حرمت عليه اجلنة، ومن أحب الدينار والدرهم فهو عبد الدن”
- `9.47`: `bl2kw` “النور: وتقولون بأفواهكم ما ليس لكم به علم وحتسبونه هينا وهو عند اهلل عظيم 16”
- `9.63`: `bl2lf` “الصف: ومن أظلم ممن افرتى على اهلل الكذب وهو يدعى إىل اإلسالم 6”
- `9.154`: `bl2sb` “قال النبي: أجرأكم جميعا بالفتوى أجرأكم على الله عز وجل. أم ألا يعلم المفتي أنه هو الذي يدخل بين الله”
- `10.186`: `bl35l` “فقال: بل خيصمه صيب من صبيان الكتاب فقلت: جعلت فداك هو أجدل من ذلك وقد خاصم مجيع أهل األديان فخصمهم ف”
- `10.194`: `bl360` “يا أبا عبيدة خالط الناس بأخالقهم وزائلهم بأعماهلم. يا أبا عبيدة إنا ال نعد الرجل فقيها عاملا حىت يعر”
- `10.210`: `bl372` “ذروا املراء فأنا زعيم بثالثة أبيات يف اجلنة: يف رياضها، وأوسطها، وأعالها، ملن ترك املراء وهو صادق، ذ”
- `11.33`: `bl39v` “قال: فاسرتجعت. فقال: ما لك تسرتجع ؟ فقلت: ملا أمسع منك. فقال: ليس حيث تذهب إمنا أعين اجلحود، إمنا هو”
- `16.1`: `bl3se` “االيات، النجم: وما ينطق عن اهلوى إن هو إال وحي يوحى 3، 4”
- `18.22`: `bl3z7` “ذكرت ما اختلف فيه موايل، فإذا كانت الوصية والكرب فال ريب، ومن جلس مبجالس احلكم فهو أوىل باحلكم، أحسن”
- `19.33`: `bl41f` “إمنا معناه أن ال حيتمله يف قلبه من حالوة ما هو يف صدره حىت خيرجه إىل غريه.”
- `19.111`: `bl470` “مث قال: يا جابر إن اإلنكار هو الكفر باهلل العظيم.”
- `19.207`: `bl4ec` “فقال: هو واهلل التسليم وإال فالذبح. - وأهوى بيده إىل حلقه -.”
- `19.235`: `bl4gk` “قال: فرتحم عليه مث قال: أتدرون ما التسليم ؟ فسكتنا، فقال: هو واهلل اإلخبات، قول اهلل: الذين آمنوا وع”
- `19.298`: `bl4l3` “فقال له موسى - وهو خاضع له يستنطقه على نفسه كى يقبله -: ستجدين إن شاء اهلل صابرا وال أعصي لك أمرا، و”
- `19.330`: `bl4n7` “فقمت من فوريت فأتيت عليا عليه السالم فقلت: يا أمري املؤمنني حديث أخربين به األصبغ عنك قد ضقت به ذرعا”
- `22.3`: `bl4u7` “وقال تعاىل ”: وإن كثريا ليضلون بأهوائهم بغري علم إن ربك هو أعلم باملعتدين 118”
- `22.49`: `bl4w4` “وقوله صلى اهلل عليه واله: علي يقضي ديين وينجز موعدي وهو خليفيت عليكم بعدي.”
- `22.123`: `bl50v` “قلت: فإنه يرد عنكم احلديث يف الشئ عن رسول اهلل صلى اهلل عليه واله مما ليس يف الكتاب وهو يف السنة مث ”
- `22.338`: `bl5es` “وأما أبو اخلطاب فكذب علي وقال: إين أمرته أن ال يصلي هو وأصحابه املغرب حىت يروا كواكب كذا، فقال القند”
- `24.1`: `bl5hr` “الآية - (سورة) الشورى: وما اختلفت فيها من شيء فقرارها لله. هذا هو الله ربي. أعتمد عليه وألجأ إليه 10”
- `26.3`: `bl5pn` “وقال تعالى: هو الذي خلق لكم كل ما في الأرض 29.“”
- `26.79`: `bl5s4` “إىل قوله تعاىل ”: هو الذي أنزل من السماء ماء لكم منه شراب ومنه شجر فيه تسيمون”
- `26.137`: `bl5tz` “امللك: هو الذي جعل لكم األرض ذلوال فامشوا يف مناكبها كلوا من رزقه وإليه النشور 15”
- `26.261`: `bl622` “قال: فما تقول يف هذه اآلية: واحملصنات من الذين اوتوا الكتاب من قبلكم ؟ قلت: فقوله: وال تنكحوا املشرك”
- `26.309`: `bl65r` “قلت: فإين قد علمت أنه قد أصابه ومل أدر أين هو فأغسله ؟ قال: تغسل من ثوبك الناحية اليت ترى أنه قد أصا”
- `27.169`: `bl6gn` “قال: فقنع رأسه وخرج وهو يقول: أعلم الناس ومل نره عند عامل.”
- `27.194`: `bl6i8` “فجعل يأيت أصحابه الذين أجابوه فيقول هلم، إن الذي دعوتكم إليه باطل وإمنا ابتدعته فجعلوا يقولون له: كذ”
- `27.202`: `bl6ir` “قال: قال رسول اهلل صلى اهلل عليه واله: من عمل باملقائيس فقد هلك وأهلك، ومن أفىت الناس وهو ال يعلم ال”
- `27.290`: `bl6pd` “قال: قلت: ضاع منه شئ ؟ قال: ال، هو عند أهله.”
- `28.79`: `bl71i` “مث قال: أما األلف فاهلل الذى ال إله إال هو احلي القيوم،”
- `28.137`: `bl73b` “فقال رسول اهلل صلى اهلل عليه واله: هذا هو القول الذي رضي اهلل عز وجل لنفسه من مجيع خلقه. فأسلم اليهو”
- `28.141`: `bl73g` “فقال رسول اهلل صلى اهلل عليه واله: أما أبو جاد فهو كنية آدم - على نبينا وآله وعليه السالم - اىب أن ي”
- `28.171`: `bl750` “فأسلم مث قال: واهلل إين وجدت يف التورية أنه يكون يف آخر األنبياء نيب وهو يفسر ما يقول الناقوس.”

**Header numbers colliding with another block** (25)

- `1`: `bl4w` (header) “(باب 8) (ثواب الهداية والتعليم، وفضلهما، وفضل العلماء، وذم اضالل الناس”; `bl75f` (struct) “”
- `8`: `bl4x` (header) “Chapter 8 - Rewards of the Guidance and the Teaching and their Merits,”; `bl2e7` (header) “(باب 15) (ذم علماء السوء ولزوم التحرز عنهم)”; `bl2e8` (header) “Chapter 15 – Condemnation of the Evil Scholars and the Necessity of Gu”
- `8.97`: `bl9u` (content) “أال فمن قواهم بفقهه وعلمه حىت أزال مسكنتهم مث سلطهم على األعداء الظاهر”; `bl2j7` (struct) “”
- `9`: `blpr` (header) “Chapter 9 – Utilisation of the Knowledge, and the Sincerity in Seeking”; `bl2j8` (header) “(باب 16) (النهى عن القول بغير علم، واالفتاء بالرأى، وبيان شرائطه)”; `bl2j9` (header) “Chapter 16 – The Forbiddance of Speaking without Knowledge, and Issuin”
- `10`: `bl120` (header) “Chapter 10 – Right of the Scholar”; `bl2v4` (header) “(باب 17) (ما جاء في تجويز المجادلة والمخاصمة في الدين والنهى عن المراء”; `bl2v5` (header) “Chapter 17 – What Has Come Regarding Permission of the Argument, and t”
- … 20 more in the TSV

**Source / citation lines carrying a number** (3)

- `9.100`: `blvb` (source) “From the Prophet asws said: ‘The knowledge is two (types of) knowledge”; `bl2o2` (content) “13- ع: ابن املتوكل، عن السعد آبادي، عن الربقي، عن عبد العظيم احلسين، ع”
- `9.106`: `blvr` (source) “From the Prophet saww having said: ‘The knowledge is called out by the”; `bl2oh` (content) “14 - العجالي ، عن ابن زكريا القطان ، عن ابن حبيب ، عن ابن بهلول ، عن أ”
- `19.168`: `bl4bf` (source) “Muhammad Bin Isa, from Ibn Abu Umeyr, from Muhammad Bin Humran, from M”; `bl4bg` (content) “‘From Abu Abdullah asws having said: ‘I asws tend to speak with senten”

### Kitab Al-Kafi 1 (`kitab_al_kafi_part_1_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (255)

- `1`: `bl57o` (struct) “”; `bl2u` (header) “Part One”; `bl2v` (header) “The Book of Intelligence and Ignorance Chapter One”; `bl5la` (content) “H 255, Ch. 9, h 2”; `bl5j5` (content) “H 269, Ch. 10, h 4”; `bl5lh` (content) “H 300, Ch. 14, h 7”; `bl5pl` (content) “H 304, Ch. 15, h 4”; `bl5qp` (content) “H 307, Ch. 16, h 3”; `bl5po` (content) “H 328, Ch. 19, h 8”; `bl5r4` (content) “H 512, Ch. 13, h 4”; `bl5sa` (content) “H 527, Ch. 17, h 3”
- `2`: `bl2t` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl64` (header) “Part Two”; `bl5qn` (content) “H 305, Ch. 16, h 1”
- `1.1.1`: `bl2w` (content) “Hadith 1, Chapter 1, hadith 1”; `bl2x` (content) “Abu Ja’far Muhammad ibn Ya’qub has narrated from a number of our peopl”; `bl2y` (content) ““When Allah created Intelligence He induced it to speak and said, ‘Com”
- `1.1.2`: `bl585` (content) “(The Text of this Hadith):”; `bl2z` (content) ““Once Jibril (Gabriel) came to Adam, recipient of divine supreme coven”
- `1.1.3`: `bl586` (lead-in) “H 2, Ch. 1, h 2”; `bl588` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad, from ‘Amr ibn ‘Uthm”; `bl587` (content) “Adam then said, ‘I choose Intelligence.’ Jibril (Gabriel) then asked B”
- `1.1.6`: `bl30` (content) “H 3, Ch. 1, h 3”; `bl58a` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl35` (content) ““Once, I said to abu al-Hassan, ‘We know certain people who have a gre”
- `1.1.5`: `bl31` (content) “Ahmad ibn ‘Idris has narrated from Muhammad ibn ‘Abd al-Jabbar, from c”; `bl33` (content) ““I heard (Imam) al-Rida, recipient of divine supreme covenant, saying,”
- `1.1.8`: `bl589` (content) “H 4, Ch. 1, h 4”; `bl36` (content) “Ahmad ibn Idris has narrated from Muhammad ibn Hassa’n from abu Muhamm”; `bl39` (content) ““Allah, on the Day of Judgment, will hold everyone accountable, propor”
- `1.1.10`: `bl58b` (content) “H 5, Ch. 1, h 5”; `bl38` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl3a` (content) “Ali ibn Muhammad ibn ‘Abd Allah has narrated from Ibrahim ibn Ishaq al”; `bl3e` (content) ““The Holy Prophet has said, ‘If you hear good things about a man, you ”
- `1.1.7`: `bl34` (content) “It is narrated from him from Ahmad ibn Muhammad from ibn Faddal from a”; `bl37` (content) ““One who has Intelligence has religion also and one who has religion e”
- `1.1.12`: `bl58c` (content) “H 6, Ch. 1, h 6”; `bl3g` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Mahbu”; `bl3i` (content) ““Allah has not distributed anything among people more excellent than I”
- `1.1.14`: `bl58d` (content) “H 7, Ch. 1, h 7”; `bl58g` (content) “A number of our people have narrated Ahmad ibn Muhammad ibn Khalid fro”; `bl58j` (content) ““O Hisham, it is certain that Allah, the Most Gracious, the Most High,”
- `1.1.16`: `bl58e` (content) “H 8, Ch. 1, h 8”; `bl57s` (content) ““O Hisham, Allah has mentioned the above facts as proof of His existen”
- `1.1.18`: `bl599` (content) “H 9, Ch. 1, h 9”; `bl57v` (content) ““In the heavens and the earth there is evidence (of the Truth) for the”
- `1.1.11`: `bl3c` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfali from al-S”; `bl3h` (content) ““I mentioned a person, who would overdo acts of his Wudu and prayer, t”
- `1.1.20`: `bl5a4` (content) “H 10, Ch. 1, h 10”; `bl58q` (content) ““In the earth there are adjacent pieces of land, vineyards, farms, dat”
- `1.1.22`: `bl5b0` (content) “H 11, Ch. 1, h 11”; `bl581` (content) ““(Muhammad), say, ‘Allow me to tell you about what your Lord has comma”
- `1.1.24`: `bl58h` (content) “H 12, Ch. 1, h 12”; `bl582` (content) ““O Hisham, Allah then has given good advice to the people of intellige”
- `1.1.88`: `bl59d` (content) “H 13, Ch. 1, h 13”; `bl4d` (content) ““When al-Qa’im (the one who will rise with Divine Authority), the guar”
- `1.1.90`: `bl3o` (content) “H 14, Ch. 1, h 14”; `bl4i` (content) ““Intelligence is the support for man. From Intelligence come insightfu”
- `1.1.79`: `bl3p` (content) “A number of our people have narrated from Ahmad ibn Muhammad from Ali ”; `bl41` (content) ““No one other than a prophet or his successor or a true believer, whos”
- `1.1.101`: `bl59g` (content) “H 15, Ch. 1, h 15”; `bl4p` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla ibn Muhammad from al-”; `bl5p` (content) ““Amir al-Mu’minin Ali, recipient of divine supreme covenant, would oft”
- `1.1.81`: `bl59f` (content) “A group of our people has narrated from Ahmad ibn Muhammad ibn ‘Isa fr”; `bl46` (content) ““Greed motivates the hearts of ignorant people; longings and yearnings”
- `1.1.103`: `bl44` (content) “H 16, Ch. 1, h 16”; `bl4v` (content) “Muhammad ibn al-Hassan has narrated from Sahl ibn Ziyad from ibn abu N”; `bl5q` (content) ““The first, the beginning, the force and the structure of something is”
- `1.1.82`: `bl45` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad from al-Nawfali from”; `bl47` (content) ““The most perfect in Intelligence are those who are the best in moral ”
- `1.1.105`: `bl5a8` (content) “H 17, Ch. 1, h 17”; `bl5am` (content) “A number of our people have narrated from Ahmad ibn Muhammad from al-H”; `bl5s` (content) “(b) Ali ibn Muhammad has narrated from certain persons of his people f”
- `1.1.83`: `bl5a9` (content) “Ali ibn Ibrahim has narrated from his father from Ja‘far ibn Muhammad ”; `bl48` (content) ““Once, we were in the presence of Imam al-Rida, recipient of divine su”
- `1.1.107`: `bl59i` (content) “H 18, Ch. 1, h 18”; `bl5v` (content) “This is the end of the Book of Intelligence and Ignorance. All praise ”
- `1.1.84`: `bl59h` (content) “Ali has narrated from his father from abu Hashim al-Ja‘fari who has sa”; `bl49` (content) ““Once I asked Imam abu ‘Abd Allah, recipient of divine supreme covenan”
- `1.1.87`: `bl59k` (content) “Ali ibn Ibrahim has narrated from his father from Yahya ibn al-Mubarak”; `bl59m` (content) ““Allah sent Prophet Muhammad, recipient of divine supreme covenant, at”
- `1.1.89`: `bl4a` (content) “Al-Husayn ibn Muhammad has narrated from Ahmad ibn Muhammad al-Sayyari”; `bl4f` (content) ““The authority of Allah among the people (His criterion to discern rig”
- `1.1.93`: `bl4c` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla ibn Muhammad from al-”; `bl4w` (content) ““When Allah created Intelligence He said, ‘Come forward.’ It came forw”
- `1.1.95`: `bl4e` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad from Muhammad ibn Su”; `bl51` (content) “A number of our people have narrated from Ahmad ibn Muhammad from cert”; `bl52` (content) ““The Holy Prophet, recipient of divine supreme covenant, has said, ‘Wh”
- `1.1.97`: `bl4h` (content) “A number of our people have narrated from Ahmad ibn Muhammad in a murs”; `bl58` (content) ““If one guarantees for me to firmly establish in himself one good qual”
- `1.1.99`: `bl4m` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad from ’Isma‘il ibn Mi”; `bl5i` (content) ““Our people mentioned Intelligence and spoke about it in the presence ”
- `1.2.1.3`: `bl5bs` (content) “H 36, Ch. 1, h 2”; `bl5a6` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus ibn ‘Ab”
- `1.2.1.5`: `bl5a7` (content) “H 37, Ch. 1, h 3”; `bl5aa` (content) “A number of our people have narrated from Ahmad ibn Muhammad al-Barqi ”
- `1.2.1.7`: `bl5b1` (content) “H 38, Ch. 1, h 4”; `bl6s` (content) “Ali ibn Muhammad ibn ‘Abd Allah has narrated from Ahmad ibn Muhammad i”
- `1.2.1.9`: `bl5ab` (content) “H 39, Ch. 1, h 5”; `bl6y` (content) “Muhammad ibn ’Isma‘il has narrated from al-Fadl ibn Shadhan from ibn a”
- `1.2.2.2`: `bl5ah` (content) “H 44, Ch. 2, h 1”; `bl7c` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- `1.2.2.3`: `bl5ba` (content) “H 45, Ch. 2, h 2”; `bl7f` (content) “Al-Hassan ibn Muhammad has narrated from Mu‘alla ibn Muhammad from al-”
- `1.2.2.5`: `bl5ai` (content) “H 46, Ch. 2, h 3”; `bl5bc` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- `1.2.2.9`: `bl5bd` (content) “H 48, Ch. 2, h 5”; `bl5c9` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr and M”
- `2.2.6`: `bl7p` (content) “Ahmad ibn Idris has narrated from Muhammad ibn Hassa’n from Idris ibn ”; `bl7q` (content) ““O Bashir, there is nothing good in those of our people (followers) wh”
- `1.2.3.3`: `bl5bj` (content) “H 54, Ch. 3, h 2”; `bl8c` (content) “Muhammad ibn Yahya has narrated from ‘Abd Allah ibn Muhammad from Ali ”
- `1.2.4.3`: `bl5cg` (content) “H 58, Ch. 4, h 2”; `bl5bp` (content) “Ali ibn Ibrahim has narrated from Ahmad ibn Muhammad al-Barqi from Ali”
- `2.4.4`: `bl5cl` (content) “H 60, Ch. 4, h 4”; `bl8v` (content) ““Whoever teaches a subject of guidance will receive a reward equal to ”
- `1.2.5.2`: `bl5bt` (content) “H 63, Ch. 5, h 1”; `bl9c` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus from Ha”
- `1.2.5.4`: `bl5bu` (content) “H 64, Ch. 5, h 2”; `bl5cp` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa and M”
- `1.2.5.6`: `bl5bv` (content) “H 65, Ch. 5, h 3”; `bl9r` (content) “Through the same chain of narrators it is narrated from Muhammad ibn K”
- `2.7.2`: `blab` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `blac` (content) ““When a true believer who is a Faqih dies, it causes an irreparable da”
- `1.2.7.5`: `bl5de` (content) “H 73, Ch. 7, h 3”; `blah` (content) “From him (Muhammad ibn Yahya) from Ahmad from ibn Mahbub from abu Ayyu”
- `2.7.6`: `blak` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad from Ali ibn Asbat f”; `blar` (content) ““Imam Ali ibn al-Husayn, recipient of divine supreme covenant, would s”
- `1.2.8.7`: `bl57k` (content) “H 80, Ch. 8, h 4”; `blb1` (content) “Ali ibn Ibrahim has narrated from his father from al-Qasim ibn Muhamma”
- `2.8.4`: `bl5b7` (content) “Muhammad ibn ‘Isma’il has narrated from al-Fadl ibn Shadhan from ibn a”; `blaz` (content) ““The Holy Prophet has said, ‘Association with religious people is an h”
- `1.2.9.3`: `bl5b9` (content) “H 83, Ch. 9, h 2”; `blbg` (content) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad from Ja’far ibn Muha”
- `1.2.9.5`: `bl5c3` (content) “H 84, Ch. 9, h 3”; `blbj` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa ibn ‘Ubayd from Yu”
- `1.2.9.8`: `bl5c5` (content) “H 85, Ch. 9, h 4”; `blbs` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- `1.2.10.3`: `bl5cc` (content) “H 92, Ch. 10, h 2”; `bl5cd` (content) “Through the same chain of narrators he has narrated from his father fr”
- `1.2.11.3`: `bl5da` (content) “H 96, Ch. 11, h 2”; `blcy` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- … 195 more in the TSV

**Opening invocations carrying a number** (5)

- `2`: `bl2t` “In the name of Allah, the Beneficent, the Merciful”
- `1.1.149`: `bl62` “In the name of Allah, the Beneficent, the Merciful”
- `1.2.22.27`: `blps` “In the name of Allah, the Beneficent, the Merciful”
- `1.3.35.11`: `bl1hh` “In the name of Allah, the Beneficent, the Merciful”
- `1.4.81.98`: `bl3f0` “In the name of Allah, the Beneficent, the Merciful”

**Header numbers colliding with another block** (7)

- `1.4.7`: `bl1i0` (content) “Ali ibn Ibrahim has narrated from his father from al-Hassan ibn Ibrahi”; `bl5lx` (header) “Divine Authority Is Ever-present”
- `1.4.11`: `bl1i5` (content) “Ali ibn Ibrahim has narrated from his father from those he mentioned f”; `bl5mz` (header) “They (‘A’immah) (plural of Imam), Recipients of Divine Supreme Covenan”; `bl1r8` (header) “‘A’immah, Recipient of Divine Supreme Covenant, Possess Divine Authori”
- `1.4.22`: `bl1ih` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn ‘Isa ”; `bl1y7` (header) “Those Whom Allah Has Called People of Knowledge in His Book they Are ‘”
- `1.4.12.1`: `bl5mu` (content) “H 500, Ch. 11, h 1”; `bl1rv` (header) “‘A’immah, Recipients of Divine Supreme Covenant, Are the Deputies of A”
- `1.4.14.5`: `bl5sc` (content) “H 510, Ch. 13, h 2”; `bl1vt` (header) “The Signs of Which Allah, the Most Holy, the Most High, Has Spoken in ”
- … 2 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (868)

- `1.1.13`: `bl58i` (lead-in) “Abu ‘Abd Allah al-Ash‘ari has narrated from certain persons of our peo”; `bl3j` (content) ““Abu al-Hassan Musa ibn Ja’far, recipient of divine supreme covenant, ”
- `1.1.77`: `bl5a1` (lead-in) “Ali ibn Muhammad has narrated from Sahl ibn Ziyad in a marfu‘ manner A”; `bl597` (content) ““Intelligence for one is a complete cover (protection). Extra knowledg”
- `1.2.1.1`: `bl6g` (lead-in) “H 35, Ch. 1, h 1”; `bl6h` (content) “Muhammad ibn Ya‘qub has narrated from Ali ibn Ibrahim ibn Hashim from ”
- `2.1.8`: `bl6v` (lead-in) “Al-Husayn ibn Muhammad has narrated from Ja‘far ibn Muhammad from al-Q”; `bl6w` (content) ““I heard abu ‘Abd Allah, recipient of divine supreme covenant, saying,”
- `1.2.3.1`: `bl5ap` (lead-in) “H 53, Ch. 3, h 1”; `bl86` (content) “Ali ibn Muhammad from Sahl ibn Ziyad and Muhammad ibn Yahya from Ahmad”
- … 863 more in the TSV

### The Beginning of Wisdom (`kabbalah_the_beginning_of_wisdom_judaism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (181)

- `1.2`: `blnk` (content) “פרק ראשון - בו מדובר ענין הספירות, וההנהגות ושמותן, ובו ל"ג סעיפים [א]”; `bl2v` (content) “Since G-d is not confined to time and space or any other limitations, ”; `blnm` (content) “[ב] ידוע שהא"ס ב"ה אסור לחשוב בו כלל וכלל כו׳, וכל מה שאנו מדברים בו ו”
- `1.3`: `bl2w` (content) “The prohibition against the contemplation of G-d’s essence is widely k”; `blnn` (content) “[ג] והנה בענין דרכי הנהגתו יתברך את העולמות, עשר ספירות הן. ואלה שמותן”
- `1.4`: `bl2x` (content) “There are ten Sefirot by which G-d, Blessed Be He, creates and conduct”; `blno` (content) “[ד] כל ספירה הוא מדה אחת מן המדות של הא"ס ב׳׳ה, אשר ברא בם את העולמות ”
- `1.7`: `bl3a` (content) “Keter influences great and unbounded kindness and mercy without discer”; `blnr` (content) “[ז] ספירת החכמה גם כן חסד גדול, גם למי שאין לו זכות כל כך. אך לא חסד כ”
- `1.8`: `bl3b` (content) “Chochmah, too, is free of Judgement, influencing the world with great ”; `blns` (content) “[ח] כל השלשה הנ"ל: כתר, חכמה, בינה, נקראו ג׳ ראשונות או ג' עליונות, וה”
- `1.9`: `bl3c` (content) “Keter, Chochmah, and Binah are called the first or upper three sefirot”; `blnt` (content) “[ט] ספירת החסד הוא החסד הגמור, רק הוא למי שמגיע לו בעד מעשיו (כמו בגן ”
- `1.10`: `bl3d` (content) “Chesed is Pure Kindness, though only to the meritorious, as is the rew”; `blnu` (content) “[י] הנצח הוא הנהגת החסד, אבל אינו חסד גמור, רק חסד ממוזג בדין קצת. ובכ”
- `1.11`: `bl3e` (content) “Netzach is Kindness tempered with Judgment, for example, sometimes the”; `blnv` (content) “[יא] ההוד הוא הנהגת הדין. אבל אינו דין גמור, רק ממוזג בחסד קצת. ובכלל ”
- `1.12`: `bl3f` (content) “Hod is Judgment tempered with Kindness, for example, sometimes the wic”; `blnw` (content) “[יב] כל הששה ספירות הנ"ל: חסד, גבורה, ת"ת, נצח, הוד, יסוד, הם הכל לפי ”
- `1.13`: `bl3g` (content) “The six sefirot (Chesed, Gevurah, Tiferet, Netzach, Hod, and Yesod) ar”; `blnx` (content) “[יג] ובאשר הכתר הוא הרחמים גדולים באין קץ וכנ"ל, לכן נקרא ארך אפים, וב”
- `1.14`: `bl3h` (content) “Keter is called Arich Anpin — Patient, because it represents unqualifi”; `blny` (content) “[יד] ספירת מלכות, הוא הנהגה להשגיח בתחתונים, ולגלות מלכותו בעולם שתהי׳”
- `1.15`: `bl3i` (content) “Malchut is the medium for Divine providence through which the kingdom ”; `blnz` (content) “[טו] מה שנקראו ספירות, הוא לשון מספר (פירוש הגר"א ז"ל בספר יהל אור בפי”
- `1.17`: `bl3k` (content) “Scripture states: “All the hosts of heaven stand by Him to His right a”; `blo1` (content) “[יז] ולכן, אם נכתוב הספירות ונרצה להורות בסדר כתיבתם את ענין הנהגותיהם”
- `1.18`: `blo2` (lead-in) “באמצע. כזה: כתר חכמה בינה (דעת) חסד גבורה תפארת נצח הוד יסוד מלכות”; `bl3l` (content) “A diagram of the sefirot conveying this concept would therefore appear”; `blo3` (content) “[יח] וסדר הנ"ל נקרא בדרך משל סדר עמידתם, והוא בדרך משל כנ"ל, וכשנצייר ”
- `1.20`: `bl3n` (content) “There is also a diagram of concentric circles in which Keter encompass”; `blo5` (content) “[כ] ספירת המלכות, הנהגתה יותר דין מששה ספירות חג"ת נה"י הנ"ל שנקראו הנ”
- `1.21`: `bl3o` (content) “Malchut is more severe than the six sefirot of Zeir Anpin, which repre”; `blo6` (content) “[כא] והנה הנהגה כללית שמתנהגת בדין, נקרא בלשון נקבה. וכמו שכתוב בפרשת ”
- `1.23`: `bl3q` (content) “Binah is somewhat severe relative to Chochmah, since discernments begi”; `blo8` (content) “[כג] והנה מדובר בספירות בשני בחינות, בחינת פנימיות, ובחינת חיצוניות. ה”
- `1.24`: `bl3r` (content) “The sefirot have both revealed and concealed aspects. The revealed is ”; `blo9` (content) “[כד] והנה לפעמים נמנה עוד במנין הספירות דבר הנקרא שמה דרך משל דעת, והי”
- `1.25`: `bl3s` (content) “Sometimes instead of Keter, Daat is enumerated amongst the sefirot. Th”; `bloa` (content) “[כה] וביאור הדברים הנ"ל הוא, שהנהגת הכתר, שהוא רחמים גדולים מאד, לפי ה”
- `1.26`: `bl3t` (content) “This is because the quality of Keter - Great Mercy is not presently re”; `bl3u` (content) “All that is revealed and is known to us of Keter is that this world is”; `blob` (content) “[כז] ובזה מבואר מה שכתבנו למעלה (בשם המשנת חסידים והגר"א ז"ל) שבבחינת ”
- `1.27`: `bl3v` (content) “This explains the above statement that Keter is counted regarding the ”; `bloc` (content) “[כח] ולכן באשר בבחינת התגלות, ההתחלה הוא מחכמה ובינה, לכן נקרא חכמה בש”
- `1.28`: `bl3w` (content) “Thus, since the revealed aspect begins with Chochmah and Binah, they a”; `blod` (content) “[כט] העולה מכל הנ"ל, שהעשר ספירות הנ"ל בדרך כלל נחלקו לחמשה מיני הנהגו”
- `1.29`: `bl3x` (content) “The sefirot can therefore be categorized into five general modes of co”; `bloe` (content) “[ל] ולפעמים נקראו העשר ספירות בכלל חמשה חסדים וחמשה גבורות. והיינו: כת”
- `1.30`: `bl3y` (content) “Sometimes the ten sefirot are categorized as the five kindnesses and t”; `blof` (content) “[לא] הששה ספירות: חסד, גבורה, ת"ת, נצח, הוד, יסוד – נקראו בספרים ששה ק”
- `1.31`: `bl3z` (content) “The six sefirot of Zeir Anpin are called Vav Kitzvot (The Six Corners)”; `blog` (content) “[לב] והנה השם יתברך ברא את האדם באיבריו וחלקיו, וחִלקם במספר חלקים כנג”
- `1.32`: `bl40` (content) “G-d formed all the limbs and organs of man corresponding to the supern”; `bloh` (content) “[לג] ולפעמים נקראו הספירות עצמן גם כן באותן השמות של איברי האדם שמרמזי”
- `2.2`: `bl43` (source) “(Within which is explained the matter of the six hundred and thirteen ”; `bl44` (content) “Above, the limbs of man and their spiritual counterparts were categori”; `blol` (content) “[לה] ועוד נחלק יותר לפרטיות, שכל ספירה של הספירות המחולקים כנ"ל, נחלקו”
- `2.3`: `bl45` (content) “Each particular sefirah contains ten further subdivisions. Keter of Ke”; `blom` (content) “[לו] וכן באדם שנברא באופן שחלקיו מרמזין על הספירות, יש בו גם כן עוד חל”
- `2.5`: `bl47` (content) “The Skull and it’s Membrane which correspond to Keter, has ten compone”; `bloo` (content) “[לח] ונקראו חלקי ספירות הכתר, בשמות הדברים שמרמזים עליהם, ועל דרך הנ"ל”
- `2.6`: `bl4q` (content) “Kabbalah sometimes refers to the subdivisions of Keter by the names of”; `blop` (content) “[לט] והנה כללות ההנהגה בכלל המה שלשה, היינו: החסד הגמור, והדין הגמור, ”
- `2.7`: `bl4r` (content) “Each sefirah contains the three general modes of conduct: Pure Kindnes”; `bloq` (content) “[מ] ולעיל כתבנו שזרוע ימין האדם רומז לספירת חסד – יש בו גם כן שלשה פרק”
- `2.8`: `bl4s` (content) “Each of man’s limbs contains three components corresponding to these t”; `blor` (content) “[מא] ולכן נקראו חלקי חד"ר שבספירות בשמות הנ"ל, בדרך משל: חסד שבחסד נקר”
- `2.9`: `bl4w` (content) “The general modes of conduct as they exist in the sefirot are sometime”; `blos` (content) “[מב] ולכן כשתמצא בספרים חזה, תדע שהכוונה על חסד שבתפארת, טבור הכונה על”
- `2.10`: `bl5c` (content) “Therefore, when the term Chazeh — Chest, is used in Kabbalistic litera”; `blot` (content) “[מג] וכן בכתר נדרש בו לפעמים תלת רישין נגד שלש בחינות הנ"ל, חסד, דין, ”
- `2.11`: `bl5d` (content) “Although Keter is absolute mercy, it is the root of all subsequent con”; `blou` (content) “[מד] ולפי מה שכתבנו שגם הכתר נחלק לעשר ספירות, והרישין הנ"ל הם בחינת ר”
- `2.12`: `bl5e` (content) “These three heads constitute the highest of the ten sefirot of Keter. ”; `blov` (content) “[מה] ולפי שהעיקר בהנהגה הם החסד והדין (והרחמים הוא הממוזג משניהם) לכן ”
- `2.13`: `bl5f` (content) “They are also called Ohr Kadmon — The Primal Light, Ohr Tzach — The Br”; `blow` (content) “[מו] ונגד שלש ההנהגות: חסד, דין, ורחמים – יש בעולם שלשה דברים: מים, אש”
- `2.14`: `bl5g` (content) “The three elements Air, Water, and Fire, correspond to Mercy, Kindness”; `blox` (content) “[מז] וכל הנ"ל הוא בכללות. ובפרטות, נחלקו ההנהגות לתרי"ג מיני הנהגות, א”
- `2.15`: `bl5l` (content) “There are a total of six hundred thirteen (613) conducts, correspondin”; `bloy` (content) “[מח] וביאור והסבר הענין מה שנחלק לתרי"ג מיני הנהגות הוא, שהנה כל הנברא”
- `2.16`: `bl5m` (content) “The entire creation, consisting of both the upper spiritual worlds and”; `bloz` (content) “[מט] והנה הנהגת השם יתברך והשפעתו על חלקי הבריאה, אינו דומה על אחד, לְ”
- `2.17`: `bl5n` (content) “Since each part of creation has its special quality, each receives a u”; `blp0` (content) “[נ] ועל פי זה מבואר מה שכתבנו לעיל, שההנהגה השלימה המתפשטת על כל חלקי ”
- `2.18`: `bl5o` (content) “Accordingly, a conduct which influences the entire Creation, is consid”; `blp1` (content) “[נא] והנה כל התרי"ג חלקים יחד, נקרא אדם כנ"ל, ונקרא פרצוף, ולכן ההנהגה”
- `2.19`: `blp4` (content) “The six hundred thirteen (613) components in their entirety are allego”; `blp2` (content) “[נב] והנה החמש הנהגות כוללות שזכרנו למעלה, והם: כתר, חכמה, בינה, שש ספ”
- `2.21`: `bl5w` (content) “The function of Malchut is to reveal G-d’s kingdom and presence in the”; `blp5` (content) “[נד] וכעין זה כתב הגר"א ז"ל בליקוטיו שבסוף ספר ספרא דצניעותא שם ד"ה וכ”
- `2.22`: `bl5x` (content) “The apparent multiplicity of G-d’s influence in the world is the resul”; `blp6` (content) “[נה] וכיון שהאיברים הם נגד חלקי הבריאה והעולמות, לכן באותו שם שנקרא אב”
- `2.25`: `bl60` (content) “So too, the Mitzvot of the Torah number six hundred thirteen (613), co”; `blp9` (content) “[נח] וכן בפרטים של איברי האדם, ובכל עניני טבעיות שבראו השם יתברך, וכל ”
- `2.26`: `bl61` (content) “Furthermore, all man’s organs, natural characteristics, and life stage”; `blpa` (content) “[נט] ועיין בעץ חיים שער פרקי הצלם פרק ששי שנמצא שם עוד דרך איך נחלקו ה”
- `3.2`: `bl6a` (content) “(In which is explained the matter of the Divine names and the principl”; `blpc` (content) “[סא] ולכן על פי דרך הנ"ל המה השמות שהוזכרו בספירות ובפרטותיה. שכנגד כל”
- `3.4`: `bl6d` (content) “The Ancients, therefore, mention ten unerasable names, corresponding t”; `blpe` (content) “[סג] וכן בשם הוי"ה לבד מרומז הנהגת כל העשר ספירות. והיינו קוצו של יו"ד”
- `3.5`: `bl6p` (content) “In addition, the name YHVH also alludes to all the ten Sefirot, as fol”; `blpf` (content) “[סד] וכתבנו למעלה בסעיף כ"ה וכ"ו, שהנהגת הכתר בהתגלות יהי׳ לעולם הבא, ”
- `3.6`: `bl6v` (content) “YHVH indicates that G-d was, is, and will be, and is the source of all”; `blpg` (content) “[סה] ובזה יש לתרץ מה שנמצא בעץ חיים, ששם אהי"ה מורה על דין יותר משם הו”
- `3.7`: `bl6w` (content) “Eheyeh represents Keter and Arich Anpin, which is great and unqualifie”; `blph` (content) “[סו] וכן יש נגד עשר ספירות עשר מיני נקודות. היינו נגד כל ספירה שם הוי"”
- `3.8`: `bl6x` (content) “There are ten vowels, corresponding to the inner lights of the ten Sef”; `blpi` (content) “[סז] השם של הדעת הוא אהו"ה, שהוא אותיות ראשונות של שם אהי"ה, ואותיות א”
- `3.9`: `bl78` (content) “The vessel of Daat is EHVH (אהו”ה) which combines the first two letter”; `blpj` (content) “[סח] והנה כשנכתב אות אחד מלא באותיותיו כמו שנקרא, נקרא מילוי, כזה: א"ל”
- `3.10`: `bl7d` (content) “The Divine names may be expanded by spelling out their individual lett”; `blpk` (content) “[סט] ועל פי הרוב, נדרש בספרים את שם הוי"ה במילואו על ד׳ אופנים. אופן ה”
- `3.11`: `bl7m` (content) “There are four general expansions of YHVH; The first is YOD HY VYV HY ”; `blpl` (content) “[ע] והנה הארבעה מילואי שם הוי"ה הנ"ל: ע"ב, ס"ג, מ"ה, ב"ן, הם גם כן נגד”
- `3.12`: `bl7r` (content) “The expansions of YHVH, (Av-72, Sag-63, Mah-45, and Ban-52) correspond”; `blpm` (content) “[עא] וביאור הדבר למה הארבעה מילואים באופנים הנ"ל הוא, כי אות יו"ד מורה”
- `3.13`: `bl7w` (content) “The letters Yod (י), Aleph (א), and Hey (ה), represent the three modes”; `blpn` (content) “[עב] שם מ"ה הנ"ל הוא כולו באלפין, שהוא כולו הנהגה ממוצעת, ורק נוטה קצת”
- `3.14`: `bl7x` (content) “Mah-45 is merciful and inclines toward kindness (as does the Sefirah o”; `blpo` (content) “[עג] ולכן בכלל שם ע"ב כולו חסד, שם ס"ג חסד עם מקצת הנהגה ממוצעת, שם מ"”
- `3.16`: `bl80` (content) “Each of these expansions, Av, Sag, Mah, and Ban may be subdivided as f”; `blpq` (content) “[עה] ולפעמים גם אחד מחלקים הנ"ל מתחלק עוד לד׳ בחינות הנ"ל. בדרך משל, ע”
- … 121 more in the TSV

**Source / citation lines carrying a number** (1)

- `4.8`: `blu4` (source) “(104, 105, and 106 are charts of all the above).”; `blql` (content) “[קה] ואלה הדברים שנחשב כנגד הששה ספירות חג"ת נה"י שנחשבים לאחת: כתר - ”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (27)

- `1.5`: `bl38` (lead-in) “The Sefirot are those divine faculties which G-d utilizes to create an”; `blnp` (content) “[ה] בענין ההנהגה, יש החסד הגמור, ויש הדין הגמור, ויש הנהגה ממוצעת בין ”
- `1.6`: `bl39` (lead-in) “G-d governs the world with three general modes of conduct; Pure Kindne”; `blnq` (content) “[ו] ספירת הכתר הוא חסד גדול ורחמים עד אין קץ, שהוא לפי התכלית לו יתברך”
- `1.16`: `bl3j` (lead-in) “The term Sefirot means Numbers — Mispar. The concept of sefirot can th”; `blo0` (content) “[טז] והנה אמרו חז"ל על המקרא (מלכים א׳ כ"ב, י"ט מובא בפירש"י שם): "וכל”
- `1.19`: `bl3m` (lead-in) “This diagram is allegorically called the Ten Upright Sefirot — Esser S”; `blo4` (content) “[יט] ולפעמים נצייר העשר ספירות בדרך משל כמו עיגולים זה בתוך זה, כתר מק”
- `1.22`: `bl3p` (lead-in) “A general conduct which is an expression of judgment, such as Malchut,”; `blo7` (content) “[כב] וכן הבינה, אשר בערך החכמה היא קצת דין, שדינין מתעוררין ממנה וכנ"ל”
- … 22 more in the TSV

### The Light of Divine Guidance (Volume I) (`light_of_divine_guidance_volume_1_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (180)

- `18.7`: `bl89` (content) “My dear and precious co-workers:”; `bl8b` (content) “Persevere in your efforts, and be assured of my prayers. The Master wi”
- `31.1`: `blbh` (content) “14 June 1933”; `blbj` (content) “Many thanks for your letter of June 4th 1933. I presented it together ”
- `31.2`: `blbi` (content) “Dear Dr. Mühlschlegel:”; `blbk` (content) “He kept the report but wishes me to inform you that as the Bahá’í Worl”
- `32.1`: `blbp` (content) “27 June 1933”; `blbr` (content) “Shoghi Effendi wishes me to acknowledge on his behalf the receipt of y”
- `32.2`: `blbq` (content) “Dear Dr. Mühlschlegel:”; `blbs` (content) “In regard to the transliteration of Oriental names and words into Germ”
- `33.1`: `blc1` (content) “9 August 1933”; `blc3` (content) “I am directed by Shoghi Effendi to inform you of the receipt of your l”
- `33.2`: `blc2` (content) “Dear Dr. Mühlschlegel:”; `blc4` (content) “Your petition, though short is, nevertheless, strongly worded and very”
- `34.1`: `blcb` (content) “1 October 1933 (Summer School)”; `blcd` (content) “The Guardian has just received your beautiful message of Sep. 3rd, 33,”
- `34.2`: `blcc` (content) “Dear Bahá’í co-workers,”; `blce` (content) “Shoghi Effendi hopes that your summer school will increasingly develop”
- `35.1`: `blcl` (content) “11 February 1934”; `blcn` (content) “I am charged by the Guardian to thank you for your letter of Jan. 30th”
- `35.2`: `blcm` (content) “Dear Bahá’í Brother,”; `blco` (content) “At the outset it should be made indubitably clear that the Bahá’í Caus”
- `36.1`: `bld0` (content) “21 February 1934”; `bld2` (content) “At the instructions of the Guardian I am writing these few lines, requ”
- `36.2`: `bld1` (content) “Dear Dr. Mühlschlegel:”; `bld3` (content) “In view of the fact that the Biennial is an international Bahá’í organ”
- `37.1`: `bld8` (content) “8 May 1934”; `blda` (content) “I am directed by the Guardian to thank you for your letter dated Apr. ”
- `37.2`: `bld9` (content) “Dear Dr. Mühlschlegel:”; `bldb` (content) “With the renewed assurance of the Guardian’s good wishes and of his su”
- `38.1`: `bldg` (content) “30 July 1934”; `bldi` (content) “Your letter of June 19th written on your behalf by Miss Köstlin has be”
- `38.2`: `bldh` (content) “Dear Bahá’í Friends,”; `bldj` (content) “In view of the fact that there are no competent and fully reliable per”
- `39.1`: `bldq` (content) “8 September 1934 (Summer School)”; `blds` (content) “On behalf of the Guardian I wish to thank you for your deeply-apprecia”
- `39.2`: `bldr` (content) “Dear Friends and co-workers,”; `bldt` (content) “The Guardian is ardently supplicating on behalf of you all, and is pra”
- `40.1`: `bldz` (content) “25 September 1934”; `ble1` (content) “I am directed by the Guardian to acknowledge the receipt of your lette”
- `40.2`: `ble0` (content) “Dear Dr. Mühlschlegel,”; `ble2` (content) “The term “afnán” means literally small branch, and refers to the relat”
- `40.6`: `ble6` (content) “Dear and valued co-worker:”; `ble8` (content) “You are indeed a pillar of the Administrative Order, which, despite th”
- `41.1`: `bleb` (content) “3 November 1934”; `bled` (content) “The Guardian has received and deeply appreciated your message dated Oc”
- `41.2`: `blec` (content) “Dear Dr. Mühlschlegel,”; `blee` (content) “He is, indeed, gratified to learn of your projected visit to the Holy ”
- `44.1`: `blf6` (content) “4 February 1935”; `blf8` (content) “The Guardian has duly received your letter of the 29th of January last”
- `44.2`: `blf7` (content) “Dear Dr. Mühlschlegel,”; `blf9` (content) “First, he wishes me to express the hope that your next National Assemb”
- `45.1`: `blfk` (content) “5 March 1935”; `blfm` (content) “The Guardian has received and carefully considered your letter of the ”
- `45.2`: `blfl` (content) “Dear Dr. Mühlschlegel,”; `blfn` (content) “With reference to your questions concerning the “Kitáb-i-Aqdas”, he do”
- `46.1`: `blfv` (content) “7 May 1935”; `blfx` (content) “The Guardian has just received your warm and encouraging message of th”
- `46.2`: `blfw` (content) “Dear Bahá’í co-workers,”; `blfy` (content) “The Guardian has been greatly impressed by the unusually wide attendan”
- `47.1`: `blg5` (content) “5 July 1935”; `blg7` (content) “On behalf of the Guardian I wish to acknowledge the receipt of your we”
- `47.2`: `blg6` (content) “Beloved Bahá’í Brother,”; `blg8` (content) “In closing may I assure you again of Shoghi Effendi’s best wishes and ”
- `48.1`: `blgf` (content) “10 August 1935”; `blgh` (content) “On behalf of the Guardian I wish to acknowledge the receipt of your be”
- `48.2`: `blgg` (content) “Beloved Bahá’í Friends,”; `blgi` (content) “He is, indeed, very much pleased, and feels greatly encouraged, to lea”
- `49.1`: `blgq` (content) “12 October 1935”; `blgs` (content) “I am directed by the Guardian to thank you for your letter dated Septe”
- `49.2`: `blgr` (content) “Dear Dr. Mühlschlegel,”; `blgt` (content) “With regard to the “Kitáb-i-‘Ahd” and the Will and Testament of ‘Abdu’”
- `50.1`: `blh2` (content) “22 October 1935”; `blh4` (content) “Your message of the first of this month has been received by our belov”
- `50.2`: `blh3` (content) “Dear Bahá’í Friends,”; `blh5` (content) “The Guardian is fervently praying that this progress, which has been s”
- `51.1`: `blhc` (content) “12 November 1935”; `blhe` (content) “The Guardian is in receipt of your letter of October 26th, and feels v”
- `51.2`: `blhd` (content) “Dear Dr. Grossmann,”; `blhf` (content) “Regarding the publication of the manuscript, he sees no objection that”
- `52.1`: `blhn` (content) “5 April 1936”; `blhp` (content) “Your most welcome message of the first Naw-Rúz has just arrived and it”
- `52.2`: `blho` (content) “Dear Bahá’í Friends,”; `blhq` (content) “The most vital matter on which the Guardian wishes you to fully concen”
- `53.1`: `blhx` (content) “10 May 1936”; `blhz` (content) “Your letter dated May 1st with the enclosed message from the Annual Co”
- `53.2`: `blhy` (content) “Dear Dr. Mühlschlegel,”; `bli0` (content) “He is indeed pleased to learn of the results of your national election”
- `54.1`: `bli7` (content) “10 May 1936 (Convention)”; `bli9` (content) “Dr. Mühlschlegel has kindly transmitted to the Guardian your very warm”
- `54.2`: `bli8` (content) “Dear Friends and co-workers,”; `blia` (content) “The Annual Convention is indeed a very important gathering at which bo”
- `55.1`: `blih` (content) “10 September 1936 (Summer School)”; `blij` (content) “Our dear friend Miss Köstlin has kindly transmitted to the Guardian th”
- `55.2`: `blii` (content) “Beloved Bahá’í Friends,”; `blik` (content) “What has particularly rejoiced and cheered his heart is the realisatio”
- `55.7`: `blip` (content) “Dear and valued friends:”; `blir` (content) “Gratefully and affectionately, Shoghi”
- `56.1`: `blit` (content) “9 December 1936”; `bliv` (content) “Shoghi Effendi is just in receipt of the message you have written him ”
- `56.2`: `bliu` (content) “Beloved Bahá’í Brothers and Sisters,”; `bliw` (content) “Esslingen is not only one of the oldest centers of the Cause in German”
- `57.1`: `blj4` (content) “17 March 1937”; `blj6` (content) “Your message of the seventh of March is just at hand, and I wish to ha”
- `57.2`: `blj5` (content) “Dear Bahá’í Friends:”; `blj7` (content) “The Guardian’s message to you is that you should constantly strive to ”
- `65.1`: `bllj` (content) “5 November 1945”; `blll` (content) “The message signed by you and other of our dear Bahá’í-friends, and da”
- `65.2`: `bllk` (content) “Dear Bahá’í-Brother:”; `bllm` (content) “Tell them that it was a source of deep comfort and gratification to hi”
- `66.1`: `bllw` (content) “30 December 1945”; `blly` (content) “Your letter of April 4th has just been received by our beloved Guardia”
- `66.2`: `bllx` (content) “Beloved Bahá’í Friends:”; `bllz` (content) “It was with feelings of great pride and deep sorrow that he read of th”
- `67.1`: `blmb` (content) “Dec. 30th, 1945”; `blmd` (content) “It was with great joy that the beloved Guardian received your letter o”
- `67.2`: `blmc` (content) “Dear Bahá’í Friends:”; `blme` (content) “During these long, sad, years of separation his thoughts have constant”
- `68.1`: `blmp` (content) “8 April 1946”; `blmr` (content) “Your loving message, addressed to our beloved Guardian, brought him gr”
- … 120 more in the TSV

**Signature / closing lines carrying a number** (33)

- `30.5`: `blbd` (content) “Dear and precious co-worker:”; `blbf` (signature) “Shoghi”
- `32.7`: `blbx` (content) “Dear and valued co-worker:”; `blbz` (signature) “Your true brother, Shoghi”
- `33.5`: `blc7` (content) “Dear and prized co-worker:”; `blc9` (signature) “Your true and affectionate brother, Shoghi”
- `34.5`: `blch` (content) “Dear co-workers:”; `blcj` (signature) “Your true brother, Shoghi”
- `38.5`: `bldm` (content) “Dear and precious co-workers:”; `bldo` (signature) “Your true and grateful brother, Shoghi”
- … 28 more in the TSV

**Source / citation lines carrying a number** (80)

- `18.6`: `bl88` (source) “[From the Guardian:]”; `bl8a` (content) “I am so pleased to have received your noble assurance of faith and loy”
- `29.5`: `blb3` (source) “[From the Guardian:]”; `blb4` (content) “May the Beloved guide your steps, cheer your hearts, enable you to pro”
- `30.4`: `blbc` (source) “[From the Guardian:]”; `blbe` (content) “I was so pleased to receive your letter. I long to hear more fully and”
- `32.6`: `blbw` (source) “[From the Guardian:]”; `blby` (content) “This is to assure you how glad and gratified I feel to learn that the ”
- `33.4`: `blc6` (source) “[From the Guardian:]”; `blc8` (content) “Your prompt and able response to my request has greatly touched me, an”
- … 75 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (188)

- `1.1`: `bl2v` (lead-in) “17 December 1922”; `bl2w` (lead-in) “Blest and beloved ones of ‘Abdu’l-Bahá!”; `bl2x` (content) “To have been unable, owing to sad circumstances over which I have had ”
- `2.1`: `bl33` (lead-in) “19 January 1923”; `bl34` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout G”; `bl35` (lead-in) “My dearly-beloved friends!”; `bl36` (content) “Ever since I have resumed my work in the Holy Land I have been awaitin”
- `3.1`: `bl3l` (lead-in) “16 February 1923”; `bl3m` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout G”; `bl3n` (lead-in) “My dearest brethren and sisters in ‘Abdu’l-Bahá!”; `bl3o` (content) “I have received with mixed feelings of sadness and gratitude your long”
- `4.1`: `bl3x` (lead-in) “4 December 1923”; `bl3y` (lead-in) “To the dearly-beloved friends throughout Germany. Care of the National”; `bl3z` (lead-in) “My well-beloved friends:”; `bl40` (content) “What a joy to correspond with you again, and express, after a long and”
- `5.1`: `bl4a` (lead-in) “28 December 1923”; `bl4b` (lead-in) “To the beloved of the Lord and the handmaids of the Merciful in Leipzi”; `bl4c` (lead-in) “My dearest brethren and sisters in ‘Abdu’l-Bahá:”; `bl4d` (content) “I need not emphasize the deep and genuine pleasure I felt when I recei”
- … 183 more in the TSV

### Uncompiled Published Letters (`published_uncompiled_letters_from_shoghi_effendi_b2a6b4c2e078beaa6f19ad12bc5c92b39`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (128)

- `30.1`: `bl89` (content) “Mr. Albert Vail Miss Edna True Dr. Zia M. Bag̱hdádí Mírzá Aḥmad Sohrab”; `bl8c` (content) “I have read with deep interest the recent numbers of the STAR OF THE W”
- `69.9`: `blgm` (content) “Your brother in the service of the Beloved, J. E. Esslemont”; `blgo` (content) “Your letter with its refreshing news rejoiced my heart. Surely the see”
- `206.1`: `blbof` (content) “Jan. 24, 1929”; `bl164` (content) “I thank you for the beautiful & touching poem you sent me as well as f”
- `360.1`: `bl299` (source) “EXTRACTS FROM SHOGHI EFFENDI’S LETTERS”; `bl29a` (content) “TO RUTH J. MOFFETT AND ROBERT LEE MOFFETT”; `bl29c` (content) ““…Concerning your association with the Fellowship of Faiths, Shoghi Ef”
- `366.1`: `bl2cw` (source) “Letter received by the Publishing Committee”; `bl2cx` (content) “Persian Colony”; `bl2cz` (lead-in) “12-29-31.”; `bl2d0` (lead-in) “Dear Mrs. Little:”; `bl2d1` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter, wr”
- `372.1`: `bl2h6` (content) “Persian Colony”; `bl2h9` (lead-in) “Dear Roy:”; `bl2ha` (content) “… Concerning the general letter he has sent lately to the Western frie”
- `378.1`: `bl2j7` (content) “Persian Colony”; `bl2j9` (lead-in) “31-1-32”; `bl2ja` (lead-in) “Dear Miss Craighead:”; `bl2jb` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `440.2`: `bl36b` (content) “. . . . . . .”; `bl36c` (content) “Your prolonged stay in Bulgaria, so providential, so timely, has been ”
- `449.5`: `bl39c` (signature) “Yours in His Service”; `bl39d` (signature) “H. Rabbání”; `bl39e` (signature) “Ḥusayn Rabbání”; `bl39f` (content) “[The following is in the same file as the above msg. It is not obvious”; `bl39g` (lead-in) “Dearly-Beloved Co-Workers:”; `bl39h` (content) “Your message redolent of your great attachment and devotion to Bahá’u’”
- `459.2`: `bl3c6` (content) “This refers to the appeal which the Guardian made in his letter dated ”; `bl3c7` (content) “Within the past few months, the Spiritual Assembly of Honolulu has tak”; `bl3c8` (content) “It is for the best interests of the Cause that as many individual beli”
- `475.8`: `bl3gy` (signature) “Yours ever sincerely,”; `bl3gz` (content) “Rúḥí Afnán.”; `bl3h3` (content) “I/we the undersigned …………….. do hereby give power of attorney to Mr. R”
- `493.3`: `bl3n4` (content) “…in the letter published as “The Golden Age of the Cause of Bahá’u’llá”; `bl3nf` (content) “The reply was dated Haifa, Palestine, October 22, 1932, and consisted ”
- `512.2`: `bl3tr` (content) “Edward Keith-Roach OBE (Born 1885 Gloucester, England — died 1954). Ke”; `bl3ts` (content) “He approved exemption from duties and established a policy that was co”
- `514.1`: `bl3tx` (content) “Haifa, Nov. 26, 1932”; `bl3ty` (content) “I am sure you will be interested to learn that I am taking the necessa”
- `514.2`: `blbne` (content) “Dear Mr. Keith-Roach:”; `bl3tz` (content) “I have approached the Municipal Engineer and found him very sympatheti”
- `559.7`: `bl498` (content) “Rúḥí.”; `bl499` (source) “(In the Guardian’s hand-writing.)”; `bl49a` (lead-in) ““Dear and precious co-workers:”; `bl49b` (content) “I greatly value the Tablets addressed to Sarah Farmer and I thank you ”
- `563.1`: `bl4av` (content) “Germany, France, Italy, and Switzerland”; `bl4aw` (source) “Compiled by Research Department of the Universal House of Justice.”; `bl4ax` (source) “Published in Bahá’í Studies Review 4:1”; `bl4ay` (content) “The Cause is surely making wonderful progress in Germany. Shoghi Effen”
- `586.1`: `bl4ii` (source) “SHOGHI EFFENDI”; `bl4il` (content) “Guardian of the Bahá’í Faith”; `bl4im` (source) “(From a letter written by Shoghi Effendi to the High Commissioner for ”; `bl4io` (content) “THE Revelation proclaimed by Bahá’u’lláh, His followers believe, is di”
- `597.4`: `blbok` (content) “With his deepest Bahá’í love and best wishes,”; `blbom` (signature) “Yours in His Service,”; `blbf6` (lead-in) “H. Rabbání.”; `blboj` (content) “May the Beloved give you the strength and wisdom you need in the prose”
- `598.4`: `bl4mw` (content) “With his deepest Bahá’í love and best wishes,”; `bl4mx` (signature) “Yours in His Service,”; `bl4my` (content) “H. Rabbání.”; `bl4mz` (signature) “Postscript in Shoghi Effendi’s own handwriting”; `bl4n1` (signature) “Your true and grateful brother,”
- `604.1`: `bl4of` (content) “…the Guardian….in a letter dated September 6, 1933, through his secret”; `bl4p2` (content) “On the subject of the Temple, written to the National Assembly in his ”
- `603.2`: `bl4oh` (content) ““Regarding the nature of the Nineteen Day Feasts, the Guardian feels t”; `bl4ov` (content) “This institution, established by Bahá’u’lláh, has been described by th”; `bl4ow` (content) “In a general letter issued to Local Spiritual Assemblies several years”; `bl4ox` (content) “These meetings may be regarded as the very heart of our Bahá’í comrnun”
- `606.1`: `bl4pm` (content) “Dear Bahá’í Sister,”; `bl4q4` (lead-in) “Dear Bahá’í Sister,”; `bl4q5` (content) “Shoghi Effendi wishes me to acknowledge on his behalf the receipt of y”
- `605.3`: `bl4pp` (content) “With the assurance of his best wishes and of his fervent prayers on be”; `bl4pq` (signature) “Yours in His Service,”; `bl4pr` (lead-in) “H. Rabbání.”; `bl4ps` (lead-in) “Note in Shoghi Ejfendi’s handwriting:”; `bl4pt` (lead-in) “Dear and valued co-worker:”; `bl4pu` (content) “I cannot refrain from giving expression in person to my deep sense of ”
- `605.4`: `bl4px` (content) “It was during our pilgrimage to the Bahá’í World Center at Haifa, Pale”; `bl4py` (content) “When we returned to America, Lubo sent me two designs for a Bahá’í Tem”; `bl4pz` (content) “The correspondence continues to this day. They are grandparents, but s”
- `606.3`: `bl4q7` (content) “With the assurance of his best wishes and of his fervent prayers on be”; `bl4q8` (signature) “Yours in His Service,”; `bl4q9` (lead-in) “H. Rabbání.”; `bl4qa` (lead-in) “Dear and valued co-worker:”; `bl4qb` (content) “I cannot refrain from giving expression in person to my deep sense of ”
- `615.1`: `bl4t5` (content) “HAIFA,”; `bl4t7` (lead-in) “Dear Bahá’í Sister:”; `bl4t8` (content) “The Guardian wishes me to acknowledge on his behalf the receipt of you”
- `615.3`: `bl4ta` (content) “With the assurance of his best wishes and of his fervent prayers on yo”; `bl4tb` (lead-in) “H — RABBÁNÍ”; `bl4td` (content) “May the Beloved assist you in your efforts to extend the scope of your”
- `751.4`: `bl619` (content) “H. Rabbání”; `bl61c` (content) “Dear and valued co-worker:”
- `751.5`: `bl61b` (content) “Postscript in Shoghi Effendi’s handwriting”; `bl61d` (content) “I wish to assure you again of my deep and abiding appreciation of your”
- `796.5`: `bl6d0` (lead-in) “Assuring you of the Guardian’s great love and prayers for you both, yo”; `bl6d1` (content) “Rúḥíyyih Ḵhánum”; `bl6d3` (content) “It gives me great & genuine pleasure to append a few words to the lett”
- `796.6`: `bl6d2` (content) “Dearest co-worker:”; `bl6d5` (content) “Kindly assure Mr. Maxwell of my great love & affection for him. I have”
- `797.4`: `bl6dh` (content) “H. Rabbání”; `bl6dj` (content) “It is such a joy and relief to hear from you after such a long silence”
- `804.6`: `bl6f1` (content) “Then this statement in the Guardian’s hand:”; `bl6f2` (content) ““I am eagerly awaiting the news of the progress of the activities init”
- `845.2`: `bl6oe` (content) “I send you my deepest love, ever your own loving daughter,”; `bl6oh` (content) “I feel proud of the initial success that has signalized the resumption”
- `846.2`: `bl6op` (content) “— October 30, 1937.”; `bl6oq` (source) “(The Guardian’s postscript to the above.)”; `bl6or` (content) “I am delighted with the progress of the Plan and I pray that the contr”
- `855.2`: `bl6qz` (content) “As to your question regarding the possibility of an artificial product”; `bl6r6` (content) “— January 14, 1938, to Amelie Willard Bodmer.”
- `877.7`: `bl6w6` (content) “With his most loving greetings, also to Mrs. Greeven,”; `bl6w7` (content) “H. Rabbání”; `bl6w9` (content) “Just a word to assure you of my ever-deepening gratitude and admiratio”
- `901.6`: `bl72o` (content) “742 East Marquette”; `bl72r` (lead-in) “Dear Shoghi Effendi,”; `bl72s` (content) “This is to inform you that we have submitted our names to the Inter-Am”
- `941.2`: `bl7ec` (content) “— SHOGHI EFFENDI, through his secretary, to Allen B. McDaniel, Chairma”; `bl7ee` (content) “Two views of this casting in the garden at Haifa were published in Bah”
- `959.2`: `bl7ii` (content) “Dear Mrs. Bowditch:”; `bl7ik` (content) “As you already know, he considers such pageants of value to the Cause ”
- `963.1`: `bl7jt` (content) “Abstract:”; `bl7jx` (content) “Letter to Jináb-i-Áqá Mírzá Bádí’u’lláh Ḵhán of Abádih”; `bl7k1` (content) “The letter put forward by that spiritual and dear friend dated 9 Bahma”
- `963.2`: `bl7ju` (content) “Answers four questions: (1) re “Crimson Scroll”; (2) re the “Sacred Ni”; `bl7jy` (content) “by Shoghi Effendi”; `bl7k2` (content) “With regard to the crimson scroll mentioned in the unapproachable Tabl”
- `963.3`: `bl7jv` (content) “Notes:”; `bl7jz` (content) “translated by Juan Cole.”; `bl7k3` (content) “As for the Sacred Night, the recitation of blessed prayers and Tablets”
- `963.4`: `bl7jw` (content) “Sec. Shoghi Effendi/Jináb-i-Áqá Mírzá Bádí’u’lláh Ḵhán of Abádih. 23 ”; `bl7k4` (content) “As concerns the blessed Tablet of the Bell, and the story of how it wa”
- `975.10`: `bl7nc` (signature) “R. Rabbání”; `bl7nd` (content) “P.S. He thanks you for the enclosed photographs of yourselves on your ”; `bl7nf` (content) “Dear friends,”
- `1029.2`: `bl7zd` (content) “Dear Bahá’í Sister,”; `bl7zf` (content) “He was very happy to hear that you are now well established in Peru, a”
- `1065.1`: `bl87c` (source) “LETTER TO LOUHELEN JUNIOR YOUTH SESSION OF JULY 1944”; `bl87d` (content) “Haifa”; `bl87h` (content) “Your loving message, dated July 23rd, has been received and the Guardi”
- `1065.2`: `bl87e` (content) “25 August 1944”; `bl87i` (content) “He hopes that you will develop into Bahá’ís in character as well as in”
- `1065.3`: `bl87f` (content) “To the Bahá’ís who were present at the Junior Youth Session of Louhele”; `bl87j` (content) “He will pray for you, each and every one, that you may be of great hel”
- `1065.4`: `bl87g` (content) “Dear Bahá’í Friends:”; `bl87k` (content) “With Bahá’í love,”
- `1104.5`: `blab9` (content) “R. Rabbání”; `bl8gm` (content) “With the assurance of my lively and abiding appreciation of your truly”
- `1113.1`: `bl8ix` (source) “Dear Co-worker: Messages from Shoghi Effendi to the Benelux countries,”; `bl8iy` (content) “5 March 1946”; `bl8j0` (content) “Your letter of February 20th has been received, and the beloved Guardi”
- `1113.2`: `bl8iz` (content) “Dear Bahá’í Sister:”; `bl8j1` (content) “He is most happy to welcome you as a co-worker in our glorious Cause, ”
- `1116.5`: `bl8jx` (content) “With Bahá’í love,”; `bl8k0` (content) “The services which you & your dear wife have rendered in Latin America”
- `1129.1`: `bl8n2` (content) “Haifa”; `bl8n6` (content) “Owing to pressure of his work our beloved Guardian was not able to ans”
- `1129.2`: `bl8n3` (content) “4 April 1947”; `bl8n7` (content) “He is always very happy to see the youth preparing themselves for thei”
- `1129.3`: `bl8n4` (content) “To the members of the ‘Junior Youth Class’ who were present at Geyserv”; `bl8n8` (content) “You may be sure he will pray for you all and for the success of your B”
- `1129.4`: `bl8n5` (content) “Dear Bahá’í Friends:”; `bl8n9` (signature) “With loving greetings,”; `bl8nf` (content) “[Your True Brother: Messages to Junior Youth Written by or on Behalf o”
- `1134.7`: `bl8pg` (content) “R. Rabbání”; `bl8pi` (content) “I am delighted to hear of the plan you have conceived, and I pray from”
- … 68 more in the TSV

**Opening invocations carrying a number** (1)

- `1186.9`: `bl93l` “He is the Bestower, the Bounteous!”

**Header numbers colliding with another block** (11)

- `25`: `bl74` (header) “– 25 –”; `bl75` (header) “1923-01-23 Awaken and Quicken Land of China”
- `595`: `bl4l3` (header) “1933-08-12 Lunt re Adminstrative Issues”; `bl4ll` (header) “– 595 –”
- `596`: `bl4lm` (header) “1933-08-12 Relationship of NSA & National Conv”; `bl4lw` (header) “– 596 –”
- `597`: `bl4lx` (header) “1933-08-12 The Cause and Personalities”; `bl4m1` (header) “– 597 –”
- `598`: `bl4m2` (header) “1933-08-13 To Caroline Nelson re Service in Holland”; `bl4mo` (header) “– 598 –”
- … 6 more in the TSV

**Signature / closing lines carrying a number** (136)

- `344.7`: `bl22r` (signature) “Yours in His Service,”; `bl22v` (content) “I have corroborated, in my recent letter to Mr. Lunt, the statement th”
- `359.6`: `bl293` (signature) “[In Guardian’s handwriting]”; `bl294` (content) “… Your splendid services, rendered with such faith, such humility, suc”
- `372.3`: `bl2hn` (signature) “Yours every sincerely,”; `bl2hq` (content) “This is a reference to the World Order letter titled “The Goal Of A Ne”
- `377.3`: `bl2j1` (signature) “Yours ever sincerely,”; `bl2j2` (signature) “RUHI AFNAN.”
- `378.4`: `bl2je` (signature) “With best wishes”; `bl2jf` (signature) “Yours ever sincerely”; `bl2jg` (signature) “Rúḥí Afnán”; `bl2jh` (content) “With the assurance of my best wishes and fervent prayers for your spir”
- … 131 more in the TSV

**Source / citation lines carrying a number** (416)

- `139.1`: `bltb` (source) “USBN #16 — March 1927 — page 6”; `bltc` (content) ““Mountfort (Mills), America’s distinguished representative rendering m”
- `336.1`: `bl1zp` (source) “Leroy Ioas, Hand of the Cause of God, Chapman, p58”; `bl1zq` (content) “The Geyserville Summer School should be considered as one of the best ”
- `344.2`: `bl228` (content) “He wishes me also to inform you of the receipt of the picture of the f”; `bl2qs` (source) “(To Mrs. Claude Gaudreaux, Yonkers, New York, through Rúḥí Afnán, Haif”
- `349.1`: `bl26j` (source) “Leroy Ioas, Hand of the Cause of God, Chapman, p58”; `bl26k` (content) “… Those who assemble there, then disperse throughout the Western state”
- `351.1`: `bl271` (source) “Important Cable from Shoghi Effendi dated November 2, 1931”; `bl272` (content) ““Urge all English speaking Believers concentrate study Nabíl’s immorta”
- … 411 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (404)

- `273.2`: `bl1jw` (lead-in) “My dear and precious co-worker;”; `bl1jx` (content) “The photos you sent me have all reached safely, and I am deeply apprec”
- `337.4`: `bl202` (lead-in) ““Marie’s response” is a ref to material the material she sent of use i”; `bl203` (content) “Princess Ileana had just gotten married.”
- `339.1`: `bl20d` (source) “The Artist’s Daughter, Nancy Douglas Bowditch, p254-5”; `bl20e` (lead-in) “Dear Mrs. Bowditch:”; `bl20f` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter wri”
- `339.7`: `bl20l` (signature) “Yours ever sincerely,”; `bl20m` (lead-in) “Rúḥí Afnán.”; `bl20n` (lead-in) “Dear and valued co-worker:”; `bl20o` (content) “I very much regret the unavoidable delay in answering your most welcom”
- `340.1`: `bl20v` (source) ““The Artist’s Daughter”, Nancy Douglas Bowditch, p254-5”; `bl20w` (source) “Letter from The Guardian via Rúḥí Afnán to Nancy Bowditch. Dated 8-10-”; `bl20x` (lead-in) “Dear Mrs. Bowditch:”; `bl20y` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter wri”
- … 399 more in the TSV

### Lights of Guidance (`lights_of_guidance_baha_i_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (127)

- `2`: `bla3` (content) “Cannot be Identified with Principles of Present-Day Democracies”; `blaj` (header) “C. Bahá’í Local Spiritual Assemblies”; `blwv` (header) “[pg 88] II. BACKBITING, CRITICISM, FAULT-FINDING, GOSSIP, LIES, SLANDE”; `blww` (content) “The Hidden Words of Bahá'u'lláh”
- `3`: `bla6` (header) “B. Bahá’í Administration”; `bla7` (content) “The Ideal Instrument to Make Spiritual Laws Function Properly”; `blyq` (header) “[pg 95] III. BAHA'I”; `blys` (content) “Bahá'u'lláh Admonishes Care in Preservation of the Tablets”
- `1.226.2`: `bl61b` (content) ““He wishes the essentials to be maintained as per the New York By-Laws”; `blq7` (content) “Matter of Belief in Bahá'u'lláh Not of Availability for Participation”
- `1.229.2`: `bl60i` (content) ““In this connection he would like to mention your Local By-Laws: He fe”; `blqe` (content) “Decisions of Local and National Assemblies Subject to Review by Higher”
- `1.230.2`: `blqg` (content) ““The House of Justice instructs us to explain that wherever ‘final’ ju”; `blqk` (content) “Incorporation is Not Necessarily Lost by the Temporary Dissolution of ”
- `1.245.2`: `bl62y` (content) “"He is a true Bahá'í who strives by day and by night to progress along”; `bl4oe` (content) “The Primary Reason for Becoming a Bahá'í”
- `1.247.2`: `bl624` (content) “"Naturally there will be periods of distress and difficulty, and even ”; `blrq` (content) “New Believers Must Not Be Left to Their Own Devices”
- `1.251.2`: `bl62a` (source) “(From a letter written on behalf of Shoghi Effendi to an individual be”; `bl645` (content) ““Also there is no reason why a prisoner should not be accepted as a de”; `bls1` (content) “Convert Advised Not to Become Alienated from Parents”
- `1.252.2`: `bl62b` (content) ““Under no circumstances, however, should she allow her parents to beco”; `bls6` (content) “Assembly Should Not Prevent Enrollment of Persons With Questionable Mo”
- `1.253.2`: `bl61h` (content) ““Your Local Spiritual Assembly is responsible to guide and assist this”; `bls8` (content) “May Be Occasions When Enrollment Must Be Postponed”
- `1.258.2`: `bl62k` (content) ““We have noted that you have advised the Local Spiritual Assemblies to”; `bl4ok` (content) “Mental Instability Has No Bearing Upon Acceptance of an Enrollment”
- `1.259.2`: `bl61p` (content) ““The acceptance of a person into the Bahá’í community should be based ”; `blsl` (content) “In These Special Cases, Steps Should Be Taken to Deepen Their Understa”
- `1.263.2`: `bl63q` (content) ““You are free to accept declarations of faith from inmates of a prison”; `blsx` (content) “Signature on Card is to Satisfy Administrative Requirements — There is”
- `1.264.2`: `bl62t` (content) “'There is a difference between character and faith; it is often very h”; `blsz` (content) “Enrolment Card — Not a Universal Requirement”
- `1.286.3`: `blv1` (content) “If Bahá'ís Undermine Leaders”; `blv4` (content) “Believers Have the Right to Express Their Criticism Action of Assembly”
- `2.311.3`: `bl5u0` (content) “"You also ask what one should do to 'handle depression and anger with ”; `blxk` (content) “Backbiting — The Most Great Sin”
- `2.312.3`: `bl5u3` (content) “"It is related that His Holiness Christ — May my life be a sacrifice t”; `blxn` (content) “Backbiting "Quencheth the Light of the Heart"”
- `3.326.3`: `bl5u5` (content) “"Truly, none must be careless in the matter of safeguarding the divine”; `blyv` (content) “Tablets and Verses to be Gathered into the Archives”
- `3.331.3`: `bl5v3` (content) “"Now that the Cause is rapidly passing through so many different phase”; `blz9` (content) “Bahá'í Archives to be Established in Each Bahá'í Administrative Centre”
- `3.337.2`: `bl5va` (content) “"It is always good to remember that this more artistic presentation of”; `blzm` (content) “Art Can Better Awaken Noble Sentiments”
- `3.338.2`: `bl5w9` (content) “"It is through such presentations that we can arouse the interest of t”; `blzo` (content) “Taking Part in Dramas — Dancing”
- `3.348.2`: `bl5vp` (content) “"Bahá'í authors may submit their works for review to any National Spir”; `bl109` (content) “Review of Magazine Articles Written by Individual Believers”
- `3.349.2`: `bl5xi` (content) “"The Guardian says the Local Assemblies can pass upon such articles; i”; `bl10b` (content) “The Reviewing Committee”
- `3.350.2`: `bl5yi` (content) “"...In general the function of a reviewing committee is to say whether”; `bl10d` (content) “Obligation of Bahá'ís to Present the Faith in Dignified Manner”
- `3.351.2`: `bl9pt` (content) “"It is an obligation of all Bahá'ís to present the Faith in a dignifie”; `bl10f` (content) “The Function and Purpose of Reviewing”
- `3.354.2`: `bl5s8` (content) “"Generally speaking, works of fiction which the writers hope will help”; `bl10l` (content) “Journalists”
- `3.356.2`: `bl5v0` (content) “"What you could do, and should do, is to use your stories to become a ”; `bl10p` (content) “The Faith Needs Bahá'í Authors”
- `3.357.2`: `bl5vy` (content) “"He feels that the best thing for you to do is to devote your studies ”; `bl10r` (content) “Doctoral Theses and Similar Treatises”
- `3.360.2`: `bl5wz` (content) “'With reference to your letter of October 31st asking why the circulat”; `bl10y` (content) “Usage in Spanish Texts of Accents on Persian and Arabic Words”
- `3.362.2`: `bl5w6` (content) “"Permission to quote from publications of Publishing Trusts should be ”; `bl112` (content) “Copyright Clearance on Sacred Writings Not Necessary for Assemblies an”
- `3.363.2`: `bl5x5` (content) “"The ruling is made to ensure that the Sacred Scriptures of our Faith ”; `bl114` (content) “Capitalizing Pronouns in English”
- `3.365.2`: `bl5sd` (content) “"Your Committee must conscientiously study this question, and then do ”; `bl118` (content) “Quotation Marks — Must Uphold Rigid Standard Inculcated by the Cause”
- `3.367.2`: `bl5sf` (content) “"Regarding the transliteration of Persian and Arabic words the House o”; `bl11c` (content) “Guidelines for the Translation of Bahá'í Sacred Writings”
- `3.369.2`: `bl6s5` (content) “a) When an individual is commissioned by an Assembly to make a transla”; `bl11g` (content) “Translation of Bahá'í Literature into Everyday Language — Simplificati”
- `3.370.2`: `bl5ub` (content) “'We have noticed a tendency in a number of countries to attempt to tra”; `bl11i` (content) “Translators Should Utilize Most Recent Editions of Books”
- `4.378.2`: `bl5xg` (content) “"He is pleased to see you have naturally, with conviction and good wil”; `bl121` (content) “Bahá'ís Must Cling to Their Faith and to Each Other”
- `4.380.2`: `bl5yh` (content) “"Not all of us are capable of serving in the same way, but the one way”; `bl125` (content) “How to Acquire Peace of Mind”
- `4.384.2`: `bl5tk` (content) “"What the Cause needs is such ardent and self-sacrificing servants and”; `bl12d` (content) “Evolution of the Soul”
- `4.386.2`: `bl5wu` (content) “"Self-sacrifice means to subordinate this lower nature and its desires”; `bl12h` (content) “The Ego is the Animal Within Us”
- `4.387.2`: `bl5ww` (content) “"There is no contradiction between Gleanings P 66 and P 262. In one pl”; `bl12j` (content) “Life is a Constant Struggle Against Forces Around Us and Our Own "Egos”
- `4.392.2`: `bl5x0` (content) “"Man can certainly recall past experiences in his evolution, and even ”; `bl12t` (content) “Man's Evolution is Both Individual and Collective”
- `4.394.2`: `bl5ss` (content) “"He will certainly pray for the work of the beloved Cause there and es”; `bl12x` (content) “Our Thoughts Should Be Turned Determinedly, Intelligently and Unemotio”
- `4.395.2`: `bl5ul` (content) “"There is a tremendous darkness in the world today, the darkness cause”; `bl12z` (content) “We Should Focus on the Glory of the Cause and Not on Our Failures”
- `4.396.2`: `bl5w8` (content) “"There is, unfortunately, no way that one can force his own good upon ”; `bl131` (content) “Do Not Dwell on Others' Thoughts and Attitudes”
- `4.399.2`: `bl5x7` (content) “"The House of Justice does not wish at the present time to go beyond t”; `bl138` (content) “Pioneer Living in a Remote Area Lacking Protection: Circumstances Unde”
- `5.409.2`: `bl5z9` (content) “'By the sacred verse: "Begging is forbidden, and it is also prohibited”; `bl13w` (content) “Beggars — Most Despised of Men in the Sight of God”
- `5.411.2`: `bl5zc` (content) “"But, of course, this extension of assistance to the poor, in whatever”; `bl141` (content) “Contributions to Charity by Assemblies and Individuals”
- `5.412.2`: `bl5xm` (content) “"The third principle concerns contributions made to charity by Bahá'ís”; `bl143` (content) “Surest Way of Lifting Once and for All Burden of Hunger and Misery”
- `5.414.2`: `bl5yp` (content) “"There are many ways in which help can be rendered. Every Bahá'í has t”; `bl147` (content) “Bahá'ís Have the Divinely-Given Remedy for the Ills of Mankind”
- `5.415.2`: `bl5u2` (content) “"Because of such an attitude, as also because of our refusal to become”; `bl149` (content) “When a Bahá'í Finds It Essential to Seek the Help of Others”
- `5.417.2`: `bl5zi` (content) “"They must promote by every means in their power the material as well ”; `bl14d` (content) “How a Bahá'í May Help His Fellow-Believer Through the Institutions”
- `5.419.2`: `bl5zm` (content) “"Please God, the poor may exert themselves and strive to earn the mean”; `bl14i` (content) “The Greatest Gift We Can Give to the Poor”
- `6.424.2`: `bl6rk` (content) “'Chaos and confusion are daily increasing in the world. They will atta”; `bl14t` (content) “If Bahá'ís Fail They Are Partly Responsible for Agony of Mankind”
- `6.428.2`: `bl5u7` (content) “"In letters to other believers who have asked questions similar to you”; `bl151` (content) “It is Important that Bahá'ís Have Correct Attitude Regarding Pending C”
- `6.443.2`: `bl5za` (content) “"Nevertheless a greater and greater number of thoughtful and fair-mind”; `bl15v` (content) “A Yawning Gulf Threatens”
- `6.445.2`: `bl60a` (content) “"...Nothing but a fiery ordeal, out of which humanity will emerge, cha”; `bl15z` (content) “When Crisis Sweeps Over the World, Bahá'ís Should Not Let Hardships We”
- `6.447.2`: `bl5zf` (content) “"In such a process of purgation, when all humanity is in the throes of”; `bl163` (content) “Dangers Facing America”
- `6.448.2`: `bl5zl` (content) “"He does not feel that the Bahá'ís should waste time dwelling on the d”; `bl165` (content) “Man's Outlook on Life Too Crude and Materialistic”
- `6.449.2`: `bl5ud` (content) “"The universal crisis affecting mankind is, therefore, essentially spi”; `bl167` (content) “Mental Tests to be Suffered by Believers in the West”
- `6.450.2`: `bl5zn` (content) “"Ours then is the duty and privilege to labour, by day, by night, amid”; `bl169` (content) “A Civilization Torn by Strife”
- … 67 more in the TSV

**Header numbers colliding with another block** (42)

- `1`: `bl4ng` (header) “A Bahá'í Reference File”; `bla0` (header) “[pg 1] I. ADMINISTRATIVE ORDER”; `bla1` (content) “Established First in America — Not American Production”
- `4`: `blaa` (content) “Purpose of Administration”; `blyr` (header) “A. Bahá'í Archives”; `bl11t` (header) “IV. BAHÁ'Í LIFE, EGO, SACRIFICE, SELF AND SERVICE”
- `5`: `blad` (content) “Social Order of Bahá’u’lláh”; `bl11u` (header) “A. Bahá'í Life”; `bl13s` (header) “V. BEGGING, CHARITIES AND THE POOR”
- `6`: `blah` (content) “Relationship of the Cause to the Administration”; `bl13t` (header) “A. Begging”; `bl14m` (header) “VI. CALAMITIES AND CRISES”
- `9`: `blao` (content) “Purpose of Spiritual Assemblies”; `bl177` (header) “A. Adopted Children and Orphans”; `bl1bg` (header) “IX. CHURCHES”
- … 37 more in the TSV

**Signature / closing lines carrying a number** (1)

- `19.824.4`: `bl1vd` (source) “(From a letter written on behalf of the Guardian to an individual beli”; `bl1ve` (signature) “Shoghi Effendi Provided for the Period of Consultation”

**Source / citation lines carrying a number** (1418)

- `1.82`: `bl4r7` (source) “(From a letter of the Guardian to the friends in Persia, January 30, 1”; `bl6pn` (source) “(From a letter written on behalf of the Universal House of Justice to ”
- `1.146`: `bl4qz` (source) “(From a letter of the Universal House of Justice to the National Spiri”; `bl4sf` (source) “(From a letter written on behalf of the Universal House of Justice to ”
- `1.223.2`: `bl5sw` (source) “(From a letter written on behalf of Shoghi Effendi to an individual be”; `bl5sx` (content) “"In the event of a committee member disagreeing with the rest of his f”
- `1.225.2`: `bl6pb` (source) “(Ibid.)”; `blq4` (content) “New York Version of By-Laws More Correct”
- `1.227.2`: `bl61c` (source) “(From a letter of the Universal House of Justice to the National Spiri”; `bl4ql` (content) “The National Spiritual Assembly Must Defend and Uphold Provisions of B”
- … 1413 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (78)

- `1.232.1`: `blqn` (lead-in) “The Cause of God Has Room for All”; `blqo` (content) “"The Cause of God has room for all. It would, indeed, not be the Cause”
- `1.267.1`: `bl4ox` (lead-in) “Being a Bahá'í Essentially an Inner Thing”; `blt3` (content) “"It is good for the Bahá'ís to learn that being a Bahá'í is essentiall”
- `1.293.1`: `blvo` (lead-in) “Voting List, Names Should Not Be Removed from”; `blvq` (content) “"Your Assembly should not remove the names of Bahá'ís from the voting ”
- `3.334.1`: `blze` (lead-in) “Three Central Figures Cannot Be Portrayed”; `blzf` (content) “"...the Faith can certainly be dramatized, but two things must be reme”
- `3.344.1`: `blzy` (lead-in) “Prohibition on Representing Manifestations of God in Paintings or Draw”; `blzz` (content) “"The prohibition on representing the Manifestation of God in paintings”
- … 73 more in the TSV

### The Book Of Mormon (`book_of_mormon_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (117)

- `1`: `bl2v` (content) “Wherefore, it is an abridgment of the record of the people of Nephi, a”; `bl2w` (content) “An abridgment taken from the Book of Ether also, which is a record of ”; `bl2z` (signature) “OLIVER COWDERY DAVID WHITMER MARTIN HARRIS”; `bl5ma` (header) “THE TESTIMONY OF THE PROPHET JOSEPH SMITH”; `bl36` (header) “THE FIRST BOOK OF NEPHI”; `bl37` (content) “An account of Lehi and his wife Sariah, and his four sons, being calle”; `bl5mt` (content) “An account of Alma and the people of the Lord, who were driven into th”; `bl5js` (content) “Helaman recounts the taking of Antiparah and the surrender and later t”
- `2`: `bl2x` (content) “TRANSLATED BY JOSEPH SMITH, JUN.”; `bl32` (content) “CHRISTIAN WHITMER JACOB WHITMER PETER WHITMER, JUN. JOHN WHITMER HIRAM”; `bll1` (header) “THE SECOND BOOK OF NEPHI”
- `1.1`: `bl5jc` (content) “HIS REIGN AND MINISTRY”; `bl38` (header) “CHAPTER 1”; `bl5fa` (content) “Nephi begins the record of his people — Lehi sees in vision a pillar o”; `bl5fy` (content) “Redemption comes through the Holy Messiah — Freedom of choice (agency)”; `bl5fz` (content) “Joseph in Egypt saw the Nephites in vision — He prophesied of Joseph S”; `bl5g0` (content) “Lehi counsels and blesses his posterity — He dies and is buried — Neph”; `bl5g1` (content) “The Nephites separate themselves from the Lamanites, keep the law of M”; `bl5g2` (content) “Jacob recounts Jewish history: The Babylonian captivity and return; th”; `bl5g3` (content) “Jacob continues reading from Isaiah: Isaiah speaks messianically — The”; `bl5g5` (content) “Jacob continues reading from Isaiah: In the last days, the Lord will c”; `bl5g4` (content) “Jacob explains that the Jews will be gathered in all their lands of pr”; `bl5g6` (content) “Jacob explains that the Jews will crucify their God — They will be sca”; `bl5g7` (content) “Jacob saw his Redeemer — The law of Moses typifies Christ and proves H”; `bl5g8` (content) “Isaiah sees the latter-day temple, gathering of Israel, and millennial”; `bl5g9` (content) “Judah and Jerusalem will be punished for their disobedience — The Lord”; `bl5ga` (content) “Zion and her daughters will be redeemed and cleansed in the millennial”; `bl5gb` (content) “The Lord’s vineyard (Israel) will become desolate, and His people will”; `bl5gc` (content) “Isaiah sees the Lord — Isaiah’s sins are forgiven — He is called to pr”; `bl5gd` (content) “Ephraim and Syria wage war against Judah — Christ will be born of a vi”; `bl5ge` (content) “Christ will be as a stone of stumbling and a rock of offense — Seek th”; `bl5gf` (content) “Isaiah speaks messianically — The people in darkness will see a great ”; `bl5gg` (content) “The destruction of Assyria is a type of the destruction of the wicked ”; `bl5gh` (content) “The stem of Jesse (Christ) will judge in righteousness — The knowledge”; `bl5gi` (content) “In the millennial day all men will praise the Lord — He will dwell amo”; `bl5gj` (content) “The destruction of Babylon is a type of the destruction at the Second ”; `bl5gk` (content) “Israel will be gathered and will enjoy millennial rest — Lucifer was c”; `bl5gl` (content) “Nephi glories in plainness — Isaiah’s prophecies will be understood in”; `bl5gm` (content) “Christ will minister to the Nephites —Nephi foresees the destruction o”; `bl5gn` (content) “Darkness and apostasy will cover the earth in the last days — The Book”; `bl5go` (content) “Many false churches will be built up in the last days — They will teac”; `bl5gp` (content) “Many Gentiles will reject the Book of Mormon — They will say, We need ”; `bl5gq` (content) “Converted Gentiles will be numbered with the covenant people — Many La”; `bl5gr` (content) “Nephi tells why Christ was baptized — Men must follow Christ, be bapti”; `bl5gs` (content) “Angels speak by the power of the Holy Ghost — Men must pray and gain k”; `bl5gt` (content) “Nephi’s words are true — They testify of Christ — Those who believe in”; `bl5gu` (content) “Jacob and Joseph seek to persuade men to believe in Christ and keep Hi”; `bl5gv` (content) “Jacob denounces the love of riches, pride, and unchastity — Men may se”; `bl5gw` (content) “The pure in heart receive the pleasing word of God — Lamanite righteou”; `bl5gx` (content) “All the prophets worshiped the Father in the name of Christ — Abraham’”; `bl5gy` (content) “Jacob quotes Zenos relative to the allegory of the tame and wild olive”; `bl5gz` (content) “The Lord will recover Israel in the last days — The world will be burn”; `bl5h0` (content) “Sherem denies Christ, contends with Jacob, demands a sign, and is smit”; `bl5h5` (content) “King Benjamin teaches his sons the language and prophecies of their fa”; `bl5h6` (content) “King Benjamin addresses his people — He recounts the equity, fairness,”; `bl5h7` (content) “King Benjamin continues his address — The Lord Omnipotent will ministe”; `bl5h8` (content) “King Benjamin continues his address — Salvation comes because of the A”; `bl5h9` (content) “The Saints become the sons and daughters of Christ through faith — The”; `bl5ha` (content) “King Benjamin records the names of the people and appoints priests to ”; `bl5hb` (content) “Ammon finds the land of Lehi-Nephi, where Limhi is king — Limhi’s peop”; `bl5hc` (content) “Ammon teaches the people of Limhi — He learns of the twenty-four Jared”; `bl5he` (content) “King Laman dies — His people are wild and ferocious and believe in fal”; `bl5hf` (content) “King Noah rules in wickedness — He revels in riotous living with his w”; `bl5hg` (content) “Abinadi is imprisoned for prophesying the destruction of the people an”; `bl5hi` (content) “Abinadi is protected by divine power — He teaches the Ten Commandments”; `bl5hh` (content) “Isaiah speaks messianically — The Messiah’s humiliation and sufferings”; `bl5hj` (content) “How Christ is both the Father and the Son — He will make intercession ”; `bl5hk` (content) “God redeems men from their lost and fallen state — Those who are carna”; `bl5hl` (content) “Alma believes and writes the words of Abinadi — Abinadi suffers death ”; `bl5hn` (content) “Gideon seeks to slay King Noah — The Lamanites invade the land — King ”; `bl5ho` (content) “Some Lamanite daughters are abducted by the priests of Noah — The Lama”; `bl5hp` (content) “Limhi’s people are smitten and defeated by the Lamanites — Limhi’s peo”; `bl5hq` (content) “Plans are made for the people to escape from Lamanite bondage — The La”; `bl5hr` (content) “Alma refuses to be king — He serves as high priest — The Lord chastens”; `bl5hs` (content) “Amulon persecutes Alma and his people — They are to be put to death if”; `bl5ht` (content) “The descendants of Mulek at Zarahemla become Nephites — They learn of ”; `bl5hu` (content) “Many members of the Church are led into sin by unbelievers — Alma is p”; `bl5hv` (content) “Mosiah forbids persecution and enjoins equality — Alma the younger and”; `bl5hw` (content) “The sons of Mosiah go to preach to the Lamanites — Using the two seer ”; `bl5hx` (content) “Mosiah proposes that judges be chosen in place of a king — Unrighteous”; `bl5hy` (content) “Nehor teaches false doctrines, establishes a church, introduces priest”; `bl5hz` (content) “Amlici seeks to be king and is rejected by the voice of the people — H”; `bl5i0` (content) “The Amlicites had marked themselves according to the prophetic word — ”; `bl5i1` (content) “Alma baptizes thousands of converts — Iniquity enters the Church, and ”; `bl5i2` (content) “To gain salvation, men must repent and keep the commandments, be born ”; `bl5i4` (content) “Christ will be born of Mary — He will loose the bands of death and bea”; `bl5i5` (content) “Alma preaches and baptizes in Melek — He is rejected in Ammonihah and ”; `bl5i6` (content) “Alma commands the people of Ammonihah to repent — The Lord will be mer”; `bl5i7` (content) “Lehi descended from Manasseh — Amulek recounts the angelic command tha”; `bl5i8` (content) “The Nephite monetary system is set forth — Amulek contends with Zeezro”; `bl5i9` (content) “Alma speaks to Zeezrom — The mysteries of God can be given only to the”; `bl5ia` (content) “Men are called as high priests because of their exceeding faith and go”; `bl5ib` (content) “Alma and Amulek are imprisoned and smitten — The believers and their h”; `bl5ic` (content) “Alma and Amulek go to Sidom and establish a church — Alma heals Zeezro”; `bl5id` (content) “The Lamanites destroy the people of Ammonihah — Zoram leads the Nephit”; `bl5ie` (content) “The sons of Mosiah have the spirit of prophecy and of revelation — The”; `bl5if` (content) “King Lamoni supposes that Ammon is the Great Spirit — Ammon teaches th”; `bl5ig` (content) “Lamoni receives the light of everlasting life and sees the Redeemer — ”; `bl5ih` (content) “The Lord sends Ammon to Middoni to deliver his imprisoned brethren — A”; `bl5ii` (content) “Aaron teaches the Amalekites about Christ and His Atonement — Aaron an”; `bl5ij` (content) “Aaron teaches Lamoni’s father about the Creation, the Fall of Adam, an”; `bl5ik` (content) “Religious freedom is proclaimed — The Lamanites in seven lands and cit”; `bl5il` (content) “The Lamanites come against the people of God — The Anti-Nephi-Lehies r”; `bl5im` (content) “Lamanite aggressions spread — The seed of the priests of Noah perish a”; `bl5in` (content) “Ammon glories in the Lord — The faithful are strengthened by the Lord ”; `bl5ix` (content) “Alma testifies to Helaman of his conversion after seeing an angel — He”; `bl5iy` (content) “The plates of brass and other scriptures are preserved to bring souls ”; `bl5iz` (content) “Shiblon was persecuted for righteousness’ sake — Salvation is in Chris”; `bl5j0` (content) “Sexual sin is an abomination — Corianton’s sins kept the Zoramites fro”; `bl5j1` (content) “Christ brings to pass the resurrection of all men — The righteous dead”; `bl5j2` (content) “In the Resurrection men come forth to a state of endless happiness or ”; `bl5j3` (content) “Mortality is a probationary time to enable man to repent and serve God”; `bl5j4` (content) “Alma and his sons preach the word — The Zoramites and other Nephite di”; `bl5j5` (content) “Moroni commands the Lamanites to make a covenant of peace or be destro”; `bl5j6` (content) “Helaman believes the words of Alma — Alma prophesies the destruction o”; `bl5j7` (content) “Amalickiah conspires to be king — Moroni raises the title of liberty —”
- `2.1`: `bl5fb` (content) “Lehi takes his family into the wilderness by the Red Sea — They leave ”; `bll3` (header) “CHAPTER 1”; `bl5io` (content) “The Lord commands Ammon to lead the people of Anti-Nephi-Lehi to safet”; `bl5ip` (content) “The Lamanites are defeated in a tremendous battle — Tens of thousands ”
- `3.1`: `bl5fd` (content) “Lehi’s sons return to Jerusalem to obtain the plates of brass — Laban ”; `bl17r` (header) “CHAPTER 1”; `bl5iq` (content) “Alma desires to cry repentance with angelic zeal — The Lord grants tea”; `bl5ir` (content) “Korihor, the anti-Christ, ridicules Christ, the Atonement, and the spi”; `bl5iu` (content) “Zenos taught that men should pray and worship in all places, and that ”; `bl5iv` (content) “Amulek testifies that the word is in Christ unto salvation — Unless an”; `bl5iw` (content) “The preaching of the word destroys the craft of the Zoramites — They e”
- `4.1`: `bl5fe` (content) “Nephi slays Laban at the Lord’s command and then secures the plates of”; `bl5mg` (header) “CHAPTER 1”; `bl5is` (content) “Alma heads a mission to reclaim the apostate Zoramites — The Zoramites”; `bl5it` (content) “Alma teaches the poor whose afflictions had humbled them — Faith is a ”
- `1.8.1`: `bl5fi` (content) “Lehi sees a vision of the tree of life — He partakes of its fruit and ”; `bl7y` (content) “And it came to pass that we had gathered together all manner of seeds ”
- `9.1`: `bl5fj` (content) “Nephi makes two sets of records — Each is called the plates of Nephi —”; `bl22w` (content) “The account of Alma, who was the son of Alma the first, and chief judg”; `bl22x` (header) “CHAPTER 1”
- `10.1`: `bl5fk` (content) “Lehi predicts that the Jews will be taken captive by the Babylonians —”; `bl3nk` (content) “An account of the Nephites. Their wars and contentions, and their diss”; `bl3nl` (header) “CHAPTER 1”
- `11.1`: `bl5fl` (content) “Nephi sees the Spirit of the Lord and is shown in vision the tree of l”; `bl41v` (content) “And Helaman was the son of Helaman, who was the son of Alma, who was t”; `bl41w` (header) “CHAPTER 1”
- `14.1`: `bl5fo` (content) “An angel tells Nephi of the blessings and cursings to fall upon the Ge”; `bl4wl` (content) “The record of the Jaredites, taken from the twenty-four plates found b”; `bl4wm` (header) “CHAPTER 1”
- `8.8.22`: `bl5md` (content) “The Record of Zeniff — An account of his people, from the time they le”; `bl5m7` (content) “Comprising chapters 9 through 22.”
- `9.2.1`: `bl23w` (content) “And it came to pass in the commencement of the fifth year of their rei”; `bl24z` (content) “And it came to pass that the Nephites who were not slain by the weapon”
- `9.2.2`: `bl23x` (content) “Now this Amlici had, by his cunning, drawn away much people after him;”; `bl250` (content) “Now many women and children had been slain with the sword, and also ma”
- `9.2.3`: `bl23y` (content) “Now this was alarming to the people of the church, and also to all tho”; `bl251` (content) “And now as many of the Lamanites and the Amlicites who had been slain ”
- `9.2.4`: `bl23z` (content) “Therefore, if it were possible that Amlici should gain the voice of th”; `bl252` (content) “And the Amlicites were distinguished from the Nephites, for they had m”
- `9.2.5`: `bl240` (content) “And it came to pass that the people assembled themselves together thro”; `bl253` (content) “Now the heads of the Lamanites were shorn; and they were naked, save i”
- `9.2.6`: `bl241` (content) “And thus they did assemble themselves together to cast in their voices”; `bl254` (content) “And the skins of the Lamanites were dark, according to the mark which ”
- `9.2.7`: `bl242` (content) “And it came to pass that the voice of the people came against Amlici, ”; `bl255` (content) “And their brethren sought to destroy them, therefore they were cursed;”
- `9.2.8`: `bl243` (content) “Now this did cause much joy in the hearts of those who were against hi”; `bl256` (content) “And this was done that their seed might be distinguished from the seed”
- `9.2.9`: `bl244` (content) “And it came to pass that they gathered themselves together, and did co”; `bl257` (content) “And it came to pass that whosoever did mingle his seed with that of th”
- `9.2.10`: `bl245` (content) “Now when Amlici was made king over them he commanded them that they sh”; `bl258` (content) “Therefore, whosoever suffered himself to be led away by the Lamanites ”
- `9.2.11`: `bl246` (content) “Now the people of Amlici were distinguished by the name of Amlici, bei”; `bl259` (content) “And it came to pass that whosoever would not believe in the tradition ”
- `9.2.12`: `bl247` (content) “Therefore the people of the Nephites were aware of the intent of the A”; `bl25a` (content) “And it is they who have kept the records which are true of their peopl”
- `9.2.13`: `bl248` (content) “And thus they were prepared to meet the Amlicites at the time of their”; `bl25b` (content) “Now we will return again to the Amlicites, for they also had a mark se”
- `9.2.14`: `bl249` (content) “And it came to pass that Amlici did arm his men with all manner of wea”; `bl25c` (content) “Thus the word of God is fulfilled, for these are the words which he sa”
- `9.2.15`: `bl24a` (content) “And it came to pass that the Amlicites came upon the hill Amnihu, whic”; `bl25d` (content) “And again: I will set a mark upon him that mingleth his seed with thy ”
- `9.2.16`: `bl24b` (content) “Now Alma, being the chief judge and the governor of the people of Neph”; `bl25e` (content) “And again: I will set a mark upon him that fighteth against thee and t”
- `9.2.17`: `bl24c` (content) “And they began to slay the Amlicites upon the hill east of Sidon. And ”; `bl25f` (content) “And again, I say he that departeth from thee shall no more be called t”
- `9.2.18`: `bl24d` (content) “Nevertheless the Lord did strengthen the hand of the Nephites, that th”; `bl25g` (content) “Now the Amlicites knew not that they were fulfilling the words of God ”
- `9.2.19`: `bl24e` (content) “And it came to pass that the Nephites did pursue the Amlicites all tha”; `bl25h` (content) “Now I would that ye should see that they brought upon themselves the c”
- `9.2.20`: `bl24f` (content) “And it came to pass that when Alma could pursue the Amlicites no longe”; `bl25i` (content) “Now it came to pass that not many days after the battle which was foug”
- `9.2.21`: `bl24g` (content) “And Alma sent spies to follow the remnant of the Amlicites, that he mi”; `bl25j` (content) “And it came to pass that there was an army sent to drive them out of t”
- `9.2.22`: `bl24h` (content) “Now those whom he had sent out to watch the camp of the Amlicites were”; `bl25k` (content) “Now Alma himself being afflicted with a wound did not go up to battle ”
- `9.2.23`: `bl24i` (content) “And it came to pass that on the morrow they returned into the camp of ”; `bl25l` (content) “But he sent up a numerous army against them; and they went up and slew”
- `9.2.24`: `bl24j` (content) “Behold, we followed the camp of the Amlicites, and to our great astoni”; `bl25m` (content) “And then they returned again and began to establish peace in the land,”
- `9.2.25`: `bl24k` (content) “And they are upon our brethren in that land; and they are fleeing befo”; `bl25n` (content) “Now all these things were done, yea, all these wars and contentions we”
- `9.2.26`: `bl24l` (content) “And it came to pass that the people of Nephi took their tents, and dep”; `bl25o` (content) “And in one year were thousands and tens of thousands of souls sent to ”
- `9.2.27`: `bl24m` (content) “And behold, as they were crossing the river Sidon, the Lamanites and t”; `bl25p` (content) “For every man receiveth wages of him whom he listeth to obey, and this”
- `9.48.1`: `bl5jj` (content) “Amalickiah incites the Lamanites against the Nephites — Moroni prepare”; `bl38h` (content) “And now it came to pass that, as soon as Amalickiah had obtained the k”
- `9.49.1`: `bl5jk` (content) “The invading Lamanites are unable to take the fortified cities of Ammo”; `bl397` (content) “And now it came to pass in the eleventh month of the nineteenth year, ”
- `9.50.1`: `bl5jg` (content) “Moroni fortifies the lands of the Nephites — They build many new citie”; `bl3a2` (content) “And now it came to pass that Moroni did not stop making preparations f”
- `9.51.1`: `bl5jh` (content) “The king-men seek to change the law and set up a king — Pahoran and th”; `bl3b7` (content) “And now it came to pass in the commencement of the twenty and fifth ye”
- `9.52.1`: `bl5jn` (content) “Ammoron succeeds Amalickiah as king of the Lamanites — Moroni, Teancum”; `bl3c9` (content) “And now, it came to pass in the twenty and sixth year of the reign of ”
- `9.53.1`: `bl5jo` (content) “The Lamanite prisoners are used to fortify the city Bountiful — Dissen”; `bl3de` (content) “And it came to pass that they did set guards over the prisoners of the”
- `9.54.1`: `bl5jp` (content) “Ammoron and Moroni negotiate for the exchange of prisoners — Moroni de”; `bl3e2` (content) “And now it came to pass in the commencement of the twenty and ninth ye”
- `9.55.1`: `bl5jl` (content) “Moroni refuses to exchange prisoners — The Lamanite guards are enticed”; `bl3er` (content) “Now it came to pass that when Moroni had received this epistle he was ”
- `9.56.1`: `bl5jm` (content) “Helaman sends an epistle to Moroni, recounting the state of the war wi”; `bl3fr` (content) “And now it came to pass in the commencement of the thirtieth year of t”
- `9.58.1`: `bl5jt` (content) “Helaman, Gid, and Teomner take the city of Manti by a stratagem — The ”; `bl3ie` (content) “And behold, now it came to pass that our next object was to obtain the”
- `9.60.1`: `bl3jx` (content) “And it came to pass that he wrote again to the governor of the land, w”; `bl5jr` (content) “Pahoran tells Moroni of the insurrection and rebellion against the gov”
- `9.61.1`: `bl3ky` (content) “Behold, now it came to pass that soon after Moroni had sent his epistl”; `bl5jx` (content) “Moroni marches to the aid of Pahoran in the land of Gideon — The king-”
- `9.62.1`: `bl3lk` (content) “And now it came to pass that when Moroni had received this epistle his”; `bl5jy` (content) “Shiblon and later Helaman take possession of the sacred records — Many”
- `10.1.1`: `bl5ju` (content) “Pahoran the second becomes chief judge and is murdered by Kishkumen — ”; `bl3nm` (content) “And now behold, it came to pass in the commencement of the fortieth ye”
- `10.2.1`: `bl5k0` (content) “Helaman, the son of Helaman, becomes chief judge — Gadianton leads the”; `bl3ol` (content) “And it came to pass in the forty and second year of the reign of the j”
- `10.3.1`: `bl5jw` (content) “Many Nephites migrate to the land northward — They build houses of cem”; `bl3p0` (content) “And now it came to pass in the forty and third year of the reign of th”
- `10.4.1`: `bl5k2` (content) “Nephite dissenters and the Lamanites join forces and take the land of ”; `bl3q2` (content) “And it came to pass in the fifty and fourth year there were many disse”
- `10.5.1`: `bl5k3` (content) “Nephi and Lehi devote themselves to preaching — Their names invite the”; `bl3qt` (content) “And it came to pass that in this same year, behold, Nephi delivered up”
- `10.6.1`: `bl5jz` (content) “The righteous Lamanites preach to the wicked Nephites — Both peoples p”; `bl3sa` (content) “And it came to pass that when the sixty and second year of the reign o”
- `10.6.42`: `bl5mo` (content) “The Prophecy of Nephi, the Son of Helaman — God threatens the people o”; `bl5mp` (content) “Comprising chapters 7 through 16.”
- `10.7.1`: `bl5k5` (content) “Nephi is rejected in the north and returns to Zarahemla — He prays upo”; `bl3tg` (content) “Behold, now it came to pass in the sixty and ninth year of the reign o”
- … 57 more in the TSV

**Header numbers colliding with another block** (8)

- `3`: `bl30` (header) “THE TESTIMONY OF EIGHT WITNESSES”; `bl17o` (header) “THE BOOK OF JACOB”
- `5.1`: `bl5ff` (content) “Sariah complains against Lehi — Both rejoice over the return of their ”; `bl5mb` (header) “CHAPTER 1”
- `6.1`: `bl5fg` (content) “Nephi writes of the things of God — Nephi’s purpose is to persuade men”; `bl5m9` (header) “CHAPTER 1”
- `7.1`: `bl5fh` (content) “Lehi’s sons return to Jerusalem and invite Ishmael and his household t”; `bl5mf` (header) “CHAPTER 1”
- `12.1`: `bl5fm` (content) “Nephi sees in vision the land of promise; the righteousness, iniquity,”; `bl5n4` (header) “CHAPTER 1”
- … 3 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (25)

- `9.6.1`: `bl5ji` (lead-in) “The Church in Zarahemla is cleansed and set in order — Alma goes to Gi”; `bl283` (content) “And now it came to pass that after Alma had made an end of speaking un”
- `9.35.17`: `bl5mm` (lead-in) “The commandments of Alma to his son Helaman.”; `bl5mc` (content) “Comprising chapters 36 and 37.”
- `9.37.48`: `bl5mi` (lead-in) “The commandments of Alma to his son Shiblon.”; `bl5me` (content) “Comprising chapter 38.”
- `9.44.25`: `bl5mh` (lead-in) “The account of the people of Nephi, and their wars and dissensions, in”; `bl5mn` (content) “Comprising chapters 45 through 62.”
- `9.47.1`: `bl5j8` (lead-in) “Amalickiah uses treachery, murder, and intrigue to become king of the ”; `bl37f` (content) “Now we will return in our record to Amalickiah and those who had fled ”
- … 20 more in the TSV

### Letters from the Guardian to Australia and New Zealand (`letters_to_australia_and_new_zealand_baha_i_ocean_8921a9228813de646299e8bf47d2d4ba`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (111)

- `14`: `bl38` (signature) “Your brother in His service Shoghi”; `bl15i` (lead-in) “for my beloved brethren and sisters in Australia and New Zealand— Shog”; `bl120` (content) “Haifa, Palestine, December 2, 1923.”; `bl3e` (content) “May 15th, 1934.”; `bl3h` (content) “Assuring you again of the Guardian’s fervent prayers for the continued”
- `18`: `bl3i` (signature) “Yours in His Service, H. Rabbani.”; `bl3q` (content) “July 26th, 1934.”; `bl3u` (content) “With warm greetings to you and to all the friends in Adelaide,”
- `23`: `bl43` (content) “October 17th, 1934.”; `bl48` (content) “Concerning the Healing Prayer, the Guardian wishes me to inform you th”
- `37`: `bl4b` (content) “H. Rabbani.”; `bl5b` (content) “Dear Bahá’í Sister, The Guardian has received your letter dated May 8t”
- `31`: `bl4j` (content) “January 16th, 1935.”; `bl4s` (content) “Dear and valued co-workers: The repeated evidences of the strenuous ef”
- `36`: `bl4p` (content) “H. Rabbani.”; `bl56` (content) “Dear and valued co-worker: I fully approve of the decisions arrived at”
- `48`: `bl4u` (signature) “Shoghi.”; `bl5n` (content) “September 26th, 1935.”; `bl65` (content) “As you know for over ten years she has been devotedly working for the ”
- `38`: `bl4x` (content) “April 24th, 1935.”; `bl5d` (content) “With regard to your question as to the advisability of disclosing to a”
- `54`: `bl53` (content) “H. Rabbani.”; `bl61` (content) “January 3rd, 1936.”; `bl6g` (content) “The Guardian would appreciate receiving detailed reports of the activi”
- `44`: `bl5a` (content) “June 19th, 1935.”; `bl5s` (content) “In closing will you also convey his love and greetings to the members ”
- `61`: `bl5f` (signature) “Yours in His Service, H. Rabbani.”; `bl6c` (content) “April 15th, 1936.”; `bl6x` (content) “[Appended by the Guadian] May the Almighty bless you and your dearly-l”
- `63`: `bl5k` (content) “Rest assured and persevere. Shoghi.”; `bl74` (content) “He is rejoiced to learn of the projected formation of a Spiritual Asse”
- `71`: `bl5y` (content) “Persevere and be happy. Shoghi.”; `bl7m` (content) “Concerning the Greatest Name; this term refers both to “Alláh-u-Abhá” ”
- `67`: `bl6p` (content) “April 26th, 1936.”; `bl7c` (content) “Dear and valued co-worker: The incessant efforts so devotedly exerted ”
- `80`: `bl78` (content) “With loving Bahá’í greetings, Yours in His Service, H. Rabbani.”; `bl7h` (content) “September 23rd, 1936.”; `bl84` (signature) “With warmest greetings,”
- `88`: `bl7p` (signature) “Yours in His Service, H. Rabbani.”; `bl7x` (content) “September 25th, 1936.”; `bl8p` (content) “He is ardently praying to the Almighty to ever bless and guide your As”
- `95`: `bl87` (content) “November 17th, 1936.”; `bl9a` (content) “The Guardian is delighted to learn that the necessary arrangements for”
- `100`: `bl8h` (signature) “Your true and grateful brother, Shoghi.”; `bl8k` (content) “December 1st, 1936.”; `bl9o` (content) “The success of this year’s Convention, as evidenced by the report of t”
- `105`: `bl8q` (signature) “Yours in His Service, H. Rabbani.”; `bl8t` (content) “February 4th, 1937.”; `bl9w` (content) “Dear and valued co-worker: I am delighted with the manifold evidences ”
- `111`: `bl94` (content) “Gratefully and affectionately, Shoghi.”; `bl97` (content) “March 18th, 1937.”; `blaf` (content) “He wishes you to write the Auckland Assembly assuring them of his appr”
- `117`: `bl9i` (signature) “Shoghi.”; `bl9k` (content) “August 29th, 1937.”; `blat` (content) “In connection with the article published in the October number of the ”
- `126`: `bl9y` (lead-in) “Gratefully and affectionately, Shoghi.”; `bla0` (content) “August 30th, 1937.”; `blbd` (content) “Dear and valued co-worker: I truly admire the manner in which the nati”
- `131`: `bla9` (signature) “Your true brother, Shoghi.”; `blac` (content) “January 31st, 1938.”; `blbo` (content) “The projected visit of Miss Martha Root to your shores next winter, th”
- `137`: `blan` (signature) “Shoghi.”; `blap` (content) “March 30th, 1938.”; `blc4` (content) “With renewed and heartfelt thanks for your very kind letter, and recip”
- `144`: `blb1` (signature) “Shoghi.”; `blb3` (content) “June 22nd, 1938.”; `blcn` (content) “Dear and valued co-worker: How deeply I appreciate what you and your d”
- `151`: `blbf` (signature) “Shoghi.”; `blbi` (content) “November 2nd, 1938.”; `bld8` (content) “Dear Miss Brooks, Your communications dated April 22nd and August 23rd”
- `158`: `blbq` (signature) “Yours in His Service, H. Rabbani.”; `blbt` (content) “Dear and valued co-workers: The visit of our dear and cherished sister”; `bldp` (content) “The friends should indeed make a careful study of this statement, so a”
- `159`: `blbv` (signature) “Your true brother, Shoghi.”; `blby` (content) “February 15th, 1939.”; `bldq` (content) “The Guardian has been particularly pleased to note that the response o”
- `166`: `blca` (signature) “Your true and grateful brother, Shoghi.”; `blcd` (content) “March 17th, 1939.”; `ble6` (content) “The truly remarkable services of Hyde Dunn will never be forgotten. Th”
- `173`: `blcp` (signature) “Your true and grateful brother, Shoghi.”; `blcs` (content) “July 12th, 1939.”; `bleg` (content) “Dear and valued co-workers: The community of the Most Great Name in th”
- `180`: `bld4` (signature) “Your true and grateful brother, Shoghi.”; `bld7` (content) “November 4th, 1940.”; `bleu` (content) “He most deeply appreciates your own untiring services in promotion of ”
- `188`: `bldj` (signature) “Your true and grateful brother, Shoghi.”; `bldm` (content) “January 3rd, 1941.”; `blfa` (content) “No. 3. Zoroaster was not Abraham; the Muslims, some of them, contend t”
- `196`: `bldz` (signature) “Your true and grateful brother, Shoghi.”; `ble2` (content) “Haifa, April 19th, 1941.”; `blfi` (content) “No. 11. The intercalary days are specially set aside for hospitality, ”
- `209`: `blen` (content) “July 30th, 1941.”; `blg4` (content) “He feels the believers must continue to do their utmost to acquaint th”
- `220`: `blf3` (signature) “Shoghi.”; `blf4` (content) “Haifa, December 26th, 1941.”; `blgo` (content) “Regarding the matter of Mother Dunn’s letter; the N.S.A., will, he fee”
- `242`: `blfr` (content) “Yours in the service of the beloved Faith, R. Rabbani.”; `blht` (content) “P.S. He found the newspaper clippings you forwarded of great interest,”
- `243`: `blfw` (signature) “Your true and grateful brother, Shoghi.”; `blfz` (content) “Haifa, Feb. 23rd, 1942.”; `blhu` (content) “Dear and valued co-workers: The activities of the beloved friends in A”
- `252`: `blgd` (signature) “Shoghi.”; `blgg` (content) “Haifa, April 18th, 1942.”; `blii` (content) “Dear Bahá’í Sister: The beloved Guardian has instructed me to write yo”
- `265`: `blgu` (content) “R. Rabbani.”; `blj4` (content) “Dear and valued co-workers: The teaching responsibilities confronting ”
- `266`: `blgy` (signature) “Your true and grateful brother, Shoghi.”; `blh1` (content) “Haifa, March 19th, 1943.”; `blja` (content) “Dear Bahá’í Sister: The beloved Guardian has instructed me to answer y”
- `274`: `blha` (content) “With Bahá’í love, R. Rabbani.”; `bljj` (content) “Regarding the position of Summer Schools in Australia: much of what yo”
- `277`: `blhg` (signature) “Your true and grateful brother, Shoghi.”; `blhj` (content) “Haifa, March 14th, 1944.”; `bljm` (content) “He feels that the duty of your Assembly is to not give up Yerrinbool b”
- `284`: `blhr` (content) “With Bahá’í love, R. Rabbani.”; `blk1` (content) “He cannot too strongly point out to you all that any condition of inha”
- `286`: `blhx` (signature) “Your true and grateful brother, Shoghi.”; `bli0` (content) “Haifa, Oct. 17th, 1944.”; `blk3` (content) “He feels that Mrs. … and Miss … , both of whom love their religion and”
- `294`: `bli9` (content) “With Bahá’í love, R. Rabbani.”; `blkk` (content) “He feels that the Yerrinbool Summer School should hold longer sessions”
- `295`: `blie` (signature) “Your true and grateful brother, Shoghi.”; `blih` (content) “Haifa, Dec. 12th, 1944.”; `blkl` (content) “There can be no schism in the Bahá’í Faith because the Guardianship is”
- `254`: `blil` (content) “He pointed out this same principle of not multiplying the number of Su”; `blju` (content) “Read and approved, Shoghi.”
- `301`: `blio` (signature) “Yours in His Service, R. Rabbani.”; `blir` (content) “Haifa, March 13th, 1945.”; `bll0` (content) “He trusts that by the time this letter reaches you the complications w”
- `308`: `bliz` (content) “With Bahá’í love, R. Rabbani.”; `bllg` (content) “He also feels that, if the N.S.A. considers such a course of action fe”
- `311`: `blj6` (signature) “Your true and grateful brother, Shoghi.”; `blj9` (content) “Haifa, May 13th, 1945.”; `bllm` (content) “Dear and valued co-workers: The ever-expanding activities of the Bahá’”
- `328`: `bljr` (content) “With Bahá’í love, R. Rabbani.”; `blmh` (content) “He was delighted over the report of the work in Brisbane; this is a st”
- `329`: `bljx` (content) “Haifa, Aug. 8th, 1945.”; `blmi` (content) “You may be sure he deeply values the loyal and persevering efforts of ”
- `337`: `blka` (signature) “Your true brother, Shoghi.”; `blkd` (content) “Haifa, March 25th, 1946.”; `blmz` (content) “He hopes the N.S.A. is progressing with its teaching plans, and assure”
- `349`: `blku` (signature) “Your true and grateful brother, Shoghi.”; `blkx` (content) “Haifa, May 25th, 1946.”; `blnq` (content) “This has again, during the last few years, been demonstrated even more”
- `356`: `bll9` (signature) “Your true brother, Shoghi.”; `bllc` (content) “Haifa, July 16th, 1946.”; `blo1` (content) “It is not for them, however, at the present stage of their evolution, ”
- `363`: `bllo` (signature) “Your true and grateful brother, Shoghi.”; `bllr` (content) “Haifa, July 31st, 1946.”; `bloc` (content) “In regard to the various matters raised in your letters:”
- `369`: `blm1` (signature) “Your true brother, Shoghi.”; `blm4` (content) “March 14th, 1947.”; `bloi` (content) “There is also another, perhaps even more pertinent reason, why he does”
- `383`: `blmj` (content) “With Bahá’í greetings, R. Rabbani.”; `blp6` (content) “The news that there is now a spiritual assembly in every capital city ”
- `388`: `blms` (signature) “Your true and grateful brother, Shoghi.”; `blmv` (content) “Haifa, April 7th, 1947.”; `blpb` (content) “He was very happy to see that New Zealand friends were present at the ”
- `392`: `bln0` (content) “With Bahá’í greetings, R. Rabbani.”; `bln3` (content) “Haifa, July 22nd, 1947.”; `blpi` (content) “Dear and valued co-workers: The notable progress achieved in recent mo”
- … 51 more in the TSV

**Signature / closing lines carrying a number** (61)

- `22`: `bl3n` (signature) “Shoghi.”; `bl47` (content) “In regard to your question as to whether it is permissible to substitu”
- `26`: `bl3v` (signature) “Yours in His Service, H. Rabbani.”; `bl4e` (content) “Dearly beloved co-worker: My constant prayers for the extension of the”
- `29`: `bl40` (signature) “Shoghi.”; `bl4n` (content) “May I also in closing express the Guardian’s appreciation of your effo”
- `39`: `bl4g` (signature) “Shoghi.”; `bl5e` (content) “With loving greetings from the Guardian to you and to the members of t”
- `56`: `bl58` (signature) “Your true and grateful brother, Shoghi.”; `bl6l` (content) “Dear and valued co-worker: I am so glad to have received your letter a”
- … 56 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `97`: `bl85` (signature) “Yours in His Service, H. Rabbani.”; `bl9e` (lead-in) “H.R.”; `bl9g` (content) “Dear and valued co-worker: I am truly gratified and delighted to recei”
- `183`: `blez` (lead-in) “R. R.”; `blf1` (content) “Dear and valued co-workers: It is indeed thrilling to note the rapidit”

### Bahá’í Administration (`baha_i_administration_selected_messages_1922_1932_3521e4ac6904cefdca84fce2627329c7`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (79)

- `1.2`: `blsc` (content) “At this early hour when the morning light is just breaking upon the Ho”; `bl30` (content) “It is idle for me to emphasize how much the sorrowful ladies of the Ho”
- `2.2`: `blsd` (content) “It is with words of regret and disappointment that I desire to open th”; `bl3b` (content) “At this grave and momentous period through which the Cause of God in c”
- `3.2`: `blse` (content) “This servant, after that grievous event and great calamity, the ascens”; `bl40` (content) “For this reason, unable to do otherwise, I have left for a time the af”
- `5.2`: `blsg` (lead-in) “Dear fellow-workers in the Holy Vineyard of Bahá!”; `blsf` (content) “Now that my long hours of rest and meditation are happily at an end, I”; `bl4d` (content) “I am now confident that the energies of my beloved brethren and sister”
- `6.2`: `blsi` (lead-in) “Esteemed co-workers in the Vineyard of God:”; `blsh` (content) “To have been unable, owing to unforeseen and unavoidable circumstances”; `bl4n` (content) “I cannot refrain from expressing in this, my first letter to you my de”
- `6.13`: `bl4y` (content) “I am, as ever, your brother in His Service, Shoghi.”; `bl50` (content) “P.S. I would be pleased and gratified if you could inform all the vari”
- `7.2`: `blsk` (lead-in) “Beloved co-workers in the Cause of God!”; `blsj` (content) “In the midst of your unceasing labors for the progress of the Movement”; `bl56` (content) “Only the other day, in the course of my study of various Bahá’í docume”
- `8.2`: `blsm` (lead-in) “Beloved brothers and sisters in ‘Abdu’l-Bahá:”; `blsl` (content) “Our dear friend, Jináb-i-Fáḍil-i-Mázindarání, accompanied by his famil”; `bl5i` (content) “Deeply appreciative of the sentiments of warm and abiding affection wh”
- `9.2`: `blso` (content) “Dear friends:”; `bl5s` (content) “I trust that in the course of time I will be enabled to send you regul”
- `9.3`: `blv3` (content) “It is a great pleasure for me to share with you the translation of som”; `bl5t` (content) “I shall await very eagerly any suggestions you would like to give me o”
- `9.5`: `bl5v` (content) “Haifa, Palestine, January 17th, 1923.”; `blva` (content) “I have just completed the translation of a number of selections from t”
- `10.2`: `blsq` (content) “Dearest friends:”; `bl60` (content) “You will realize, as you read them, the unshakable confidence of ‘Abdu”
- `11.2`: `blss` (content) “Fellow-workers in the Vineyard of God!”; `bl68` (content) “The year has been to the outside world a year of fear and suffering, o”
- `11.3`: `blsr` (content) “Over a year has elapsed since that calamitous Hour, when the glorious ”; `bl69` (content) “From the East and from the West, from the North and from the South, th”
- `11.46`: `bl7o` (signature) “Shoghi.”; `bl7p` (content) “Haifa, Palestine, March 12, 1923.”; `bl7r` (content) “P.S. On another page is given the list of the best known and most curr”
- `12.2`: `blvm` (content) “Dearly beloved brothers and sisters in ‘Abdu’l-Bahá: On this auspiciou”; `bl7w` (content) “You stand at this challenging hour in the history of the Cause at the ”
- `13.2`: `blsv` (lead-in) “Dearest friends:”; `blsu` (content) “I have lately received your long-awaited reports on the present situat”; `bl85` (content) “I am much impressed and feel deeply gratified to learn of your devoted”
- `14.2`: `blsx` (lead-in) “Beloved fellow-workers in the Cause:”; `blsw` (content) “I am not sure whether I have sent you before a copy of this glorious T”; `bl8s` (content) “I am also enclosing my rendering of various passages of the Kitáb-i-Aq”
- `15.2`: `blsz` (lead-in) “My friends and fellow-workers in the Cause of God!”; `blsy` (content) “Your most welcome message, imparting the glad news of a successful Con”; `bl90` (content) “I am certain that, as the newly elected representatives of the Bahá’í ”
- `16.2`: `blt1` (content) “Fellow-laborers in the Divine Vineyard:”; `bl9d` (content) “The two years that have elapsed since the passing of our beloved Maste”
- `16.3`: `blt0` (content) “Upon my return, after a forced and prolonged absence, to the Holy Land”; `bl9e` (content) “On one hand the remarkable revelations of the Beloved’s Will and Testa”
- `17.2`: `blt3` (content) “Friends and fellow-workers in the Vineyard of God!”; `bl9v` (content) “Your three letters, dated June 8th, July 10th and October 12th, have b”
- `17.3`: `blt2` (content) “After a long and unbroken silence, it gives me the greatest joy to be ”; `bl9w` (content) “How often I have wished and yearned to be nearer to the field of your ”
- `19.2`: `blt7` (content) “My dear fellow-workers:”; `blb9` (content) “Though such signs should appear from time to time, and however unrepre”
- `19.3`: `blt6` (content) “I gather from various sources that the Cause of Bahá’u’lláh, in the co”; `blbb` (content) “That the Cause of God should, in the days to come, witness many a chal”
- `20.2`: `blt9` (content) “Dear friends:”; `blbz` (content) “My prolonged absence, my utter inaction should not, however, be solely”
- `20.3`: `blt8` (content) “I return to the Holy Land with an overpowering sense of the gravity of”; `blc0` (content) “I venture to request you to join me in yet another prayer, this time m”
- `21.2`: `bltb` (lead-in) “Dearest friends:”; `blta` (content) “The day is drawing near when, for the third time, we shall commemorate”; `blcf` (content) “We have but to turn our eyes to the world without to realize the fierc”
- `22.2`: `bltd` (lead-in) “My friends and fellow-workers:”; `bltc` (content) “The letters which our able and devoted friend, Mr. Horace Holley, has ”; `blcv` (content) “The splendid contribution you have made to the efforts of your fellow-”
- `23.3`: `blte` (content) “The three communications dated November 19, November 22 and December 2”; `bldl` (content) “The efforts recently displayed by the Publishing Committee so clearly ”
- `24.2`: `blth` (content) “My well-beloved and precious fellow-workers:”; `ble1` (content) “The matter of the revision of the English version of the Hidden Words,”
- `24.3`: `bltg` (content) “I have perused your recent communication, dated December 29th, and sig”; `ble2` (content) “In connection with the fundamental questions of general policy referre”
- `25.2`: `bltj` (lead-in) “My dearly-beloved fellow-workers:”; `blti` (content) “The communications lately received from your distinguished secretary, ”; `bleh` (content) “Great as is the promise of the Movement for the future, it has already”
- `26.2`: `bltl` (content) “Dearly-beloved fellow-workers:”; `blez` (content) “Regarding the method to be adopted for the election of the National Sp”
- `26.3`: `bltk` (content) “I have read with deep interest your two recent communications dated Ap”; `blf0` (content) ““At whatever time all the beloved of God in each country appoint their”
- `27.2`: `bltn` (content) “Fellow-laborers in the Vineyard of God:”; `blfd` (content) “May I at the outset reaffirm my feelings of gratitude and keen appreci”
- `27.3`: `bltm` (content) “Once again the hand of divine power has gathered together the chosen r”; `blff` (content) “And now regarding this forthcoming Convention, I feel that the dominat”
- `28.2`: `bltp` (content) “My well-beloved friends:”; `blft` (content) “The notable advance achieved by this year’s memorable Convention is, I”
- `28.3`: `blto` (content) “The numerous communications which your distinguished Secretary has lat”; `blfu` (content) “I rejoice to learn that ways and means have been found to enable the N”
- `29.2`: `bltr` (content) “My dear fellow-workers:”; `blgd` (content) “I rejoice to learn of the prompt and well-considered measures you have”
- `29.3`: `bltq` (content) “Two recent communications of your able secretary, dated Oct. 14th and ”; `blgf` (content) “The sad and sudden crisis that has arisen in connection with the owner”
- `30.2`: `bltt` (content) “Dear fellow-workers:”; `blgx` (content) “He bore his sufferings with admirable fortitude, with calm resignation”
- `30.3`: `blts` (content) “It is with feelings of overwhelming sorrow that I communicate to you t”; `blgy` (content) “With tearful eyes I supplicate at the Threshold of Bahá’u’lláh — and r”
- `31.2`: `bltv` (content) “Dearly-beloved fellow-workers in the Vineyard of God!”; `blh7` (content) “The multiplicity of vital and pressing issues, arising out of the stea”
- `31.3`: `bltu` (content) “Your letter dated Nov. 9, 1925, has been received and read with feelin”; `blh8` (content) “I rejoice to learn of the marvelous effect which your resourcefulness,”
- `32.2`: `bltx` (content) “Fellow-laborers in the Divine Vineyard:”; `blhv` (content) “From the meagre reports which have thus far been received from that di”
- `32.3`: `bltw` (content) “In the midst of the many vicissitudes which the creative Word of God i”; `blhw` (content) “Fully alive to the gravity of the occasion, and realizing the urgency ”
- `33.2`: `bltz` (lead-in) “Fellow-laborers in the Vineyard of God:”; `blty` (content) “Various happenings of recent months, highly disquieting in their sudde”; `blia` (content) “Grave and manifold as are the problems confronting the struggling Fait”
- `34.2`: `blu1` (lead-in) “Dearly-beloved brothers and sisters in ‘Abdu’l-Bahá:”; `blu0` (content) “In the course of the few months that have elapsed since my last commun”; `blit` (content) “You have, most of you, I presume, read with thrilling joy in one of th”
- `36.2`: `blu3` (content) “Dearly-beloved fellow-workers:”; `bljk` (content) “Your letters, dated June 17, July 11, July 20, August 3 and 16, and Oc”
- `36.3`: `blu2` (content) “I have on two recent occasions given expression to the profound sense ”; `bljm` (content) “The range and character of the problems confronting you, as revealed b”
- `37.2`: `blu4` (content) “Dearly-beloved friends:”; `blk2` (content) “The situation as I see it calls for the devoted efforts of one or two ”
- `37.3`: `blu5` (content) “The progress of various events, both within and outside the Bahá’í wor”; `blk3` (content) “The gradual expansion of foreign as well as officially subsidized educ”
- `38.2`: `blu7` (content) “Dearly-beloved brothers and sisters in ‘Abdu’l-Bahá:”; `blkc` (content) “Of all the diverse issues which today are gradually tending to consoli”
- `38.3`: `blu6` (content) “The trend of various events, affecting directly and indirectly the int”; `blke` (content) “A closer study of the text of the decision will, however, reveal the f”
- `39.2`: `blu9` (content) “Dear and precious fellow-workers in the Vineyard of God: —”; `blkt` (content) “In connection with the World Unity Conferences, which you have organiz”
- `39.3`: `blu8` (content) “The communications addressed to me by your indefatigable and distingui”; `blku` (content) “As to the policy that should be adopted with regard to these Conferenc”
- `40.2`: `blub` (content) “Dearly-beloved friends:”; `bllc` (lead-in) “Inter-racial Amity”; `blld` (content) “I have also received and read with the keenest interest and appreciati”
- `40.3`: `blua` (content) “Your recent communications, dated February 17 and March 2, 17 and 21, ”; `blle` (content) “As this problem, in the inevitable course of events, grows in acutenes”
- `41.2`: `blud` (lead-in) “Dearly-beloved friends:”; `bluc` (content) “With feelings of horror and indignation I communicate to you the tale ”; `bllw` (content) “Our martyred brother, Aminu’l-’Ulama’ by name, had for some time past ”
- … 19 more in the TSV

**Opening invocations carrying a number** (1)

- `3.1`: `bl3z` “IN THE NAME OF GOD”

**Header numbers colliding with another block** (48)

- `1`: `blsb` (struct) “”; `bl2x` (header) “– 1 –”
- `2`: `bl2y` (header) “Letter of January 21st, 1922.”; `bl38` (header) “– 2 –”
- `3`: `bl39` (header) “Letter of March 5, 1922.”; `bl3c` (header) “The Mission of the Cause”; `bl3g` (header) “Local and National Spiritual Assemblies”; `bl3r` (header) “Committees of the National Assembly”; `bl3x` (header) “– 3 –”
- `4`: `bl3y` (header) “Letter of Circa May, 1922 (undated).”; `bl44` (header) “– 4 –”
- `5`: `bl45` (header) “Letter of Circa May, 1922 (undated).”; `bl4a` (header) “– 5 –”
- … 43 more in the TSV

**Signature / closing lines carrying a number** (26)

- `6.14`: `bl4z` (content) “Haifa, Palestine, December 23rd, 1922.”; `bl51` (signature) “Shoghi.”
- `12.5`: `bl7z` (signature) “Your devoted brother, Shoghi.”; `bl80` (content) “Haifa, Palestine. April 8, 1923.”
- `19.16`: `blbt` (signature) “Shoghi.”; `blbu` (content) “Haifa, Palestine, February 23, 1924.”
- `20.9`: `blc8` (signature) “Shoghi.”; `blc9` (content) “Haifa, Palestine. September 24, 1924.”
- `21.11`: `blcp` (signature) “Shoghi.”; `blcq` (content) “Haifa, Palestine, November 24th, 1924.”
- … 21 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (20)

- `2.18`: `bl3u` (lead-in) “Your brother and co-worker in His Cause, Shoghi.”; `bl3v` (content) “Haifa, Palestine. March 5, 1922.”
- `3.3`: `bl41` (lead-in) “The servant of His Threshold, Shoghi.”; `bl42` (content) “Haifa, Palestine. Circa May, 1922 (undated).”
- `5.6`: `bl4h` (lead-in) “Your brother and co-worker, Shoghi.”; `bl4i` (content) “Haifa, Palestine, December 16, 1922.”
- `7.7`: `bl5c` (lead-in) “I am your devoted brother, Shoghi.”; `bl5d` (content) “Haifa, Palestine, January 12, 1923.”
- `8.6`: `bl5m` (lead-in) “Your brother and co-worker, Shoghi.”; `bl5n` (content) “Haifa, Palestine. January 16, 1923.”
- … 15 more in the TSV

### Kitab Al-Kafi 3 (`kitab_al_kafi_v3_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (76)

- `1.1.2`: `bl118` (lead-in) “H 3784, Ch. 1, h 2”; `bl119` (content) “Muhammad ibn Yahya and others have narrated from Muhammad ibn Ahmad fr”; `bl1vw` (content) “H 4126, Ch. 1, h 2”
- `1.4.9`: `bl13f` (lead-in) “H 3809, Ch. 4, h 7”; `bl13g` (content) “Ahmad ibn Idris has narrated from Muhammad ‘Abd al-Jabbar from Safwan ”; `bl13m` (lead-in) “H 3811, Ch. 4, h 9”; `bl13n` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”
- `1.7.3`: `bl155` (lead-in) “H 3828, Ch. 7, h 3”; `bl156` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `bl158` (lead-in) “H 3829, Ch. 7, h 4”; `bl159` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad al-Wash”
- `1.9.3`: `bl168` (lead-in) “H 3840, Ch. 9, h 3”; `bl169` (content) “Ahmad ibn Muhammad from has narrated from Ali ibn al-Hakam from al-Kah”; `bl16b` (lead-in) “H 3841, Ch. 9, h 4”; `bl16c` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”
- `1.9.7`: `bl16i` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Muhammad ”; `bl16k` (lead-in) “H 3844, Ch. 9, h 7”; `bl16l` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan from Hamma”
- `1.10.2`: `bl16t` (content) “Certain persons of our people have narrated from ibn Jumhur from Muham”; `bl16v` (content) “H 3847, Ch. 10, h 2”
- `1.10.4`: `bl16y` (lead-in) “H 3848, Ch. 10, h 3”; `bl16z` (content) “Al-Husayn ibn Muhammad has narrated from ‘Abd Allah ibn ‘Amir from Ali”; `bl172` (lead-in) “H 3849, Ch. 10, h 4”; `bl173` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from abu Yahya”
- `1.12.3`: `bl17x` (lead-in) “H 3859, Ch. 12, h 3”; `bl17y` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ibrahim i”; `bl180` (lead-in) “H 3860, Ch. 12, h 4”; `bl181` (content) “Ahmad ibn Idris has narrated from Ahmad ibn Muhammad from Ahmad ibn al”
- `1.12.7`: `bl189` (lead-in) “H 3863, Ch. 12, h 7”; `bl18a` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”; `bl18d` (lead-in) “H 3864, Ch. 12, h 8”; `bl18e` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn ‘Isma‘il”
- `1.12.11`: `bl18n` (lead-in) “H 3867, Ch. 12, h 11”; `bl18o` (content) “Muhammad ibn al-Hassan has narrated from Sahl from Musa ibn al-Qasim f”; `bl18q` (content) “H 3868, Ch. 12, h 12”
- `1.16.1`: `bl6nh` (lead-in) “H 3898, Ch. 16, h 1”; `bl1be` (content) “Al-Husayn ibn Muhammad has narrated from Mu‘alla’ ibn Muhammad from al”; `bl1bg` (lead-in) “H 3899, Ch. 16, h 2”; `bl1bh` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Shadhan i”
- `1.18.8`: `bl1d1` (lead-in) “H 3916, Ch. 18, h 7”; `bl1d2` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu Najran from ”; `bl1d4` (lead-in) “H 3917, Ch. 18, h 8”; `bl1d5` (content) “It is a narration from him (narrator of the previous Hadith) by his fa”
- `1.23.16`: `bl1gx` (lead-in) “H 3960, Ch. 23, h 14”; `bl1gy` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Mu’ammar ”; `bl1h4` (lead-in) “H 3962, Ch. 23, h 16”; `bl1h5` (content) “Ali ibn Muhammad has narrated from ibn Jumhur from those whom he has m”
- `1.23.17`: `bl1h0` (lead-in) “H 3961, Ch. 23, h 15”; `bl1h1` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan and Muhamm”; `bl1h7` (lead-in) “H 3963, Ch. 23, h 17”; `bl1h8` (content) “Ahmad ibn Idris and Muhammad ibn Yahya have narrated from Muhammad ibn”
- `1.38.4`: `bl1q8` (content) “Ali ibn Ibrahim has narrated from his father, from Hammad, from Hariz,”; `bl1qa` (lead-in) “H 4065, Ch. 38, h 4”; `bl1qb` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy from al-”
- `1.39.2`: `bl1qt` (content) “H 4071, Ch. 39, h 1”; `bl1qw` (lead-in) “H 4072, Ch. 39, h 2”; `bl1qx` (content) “Hammad ibn ‘Isa has narrated from Hariz from Muhammad ibn Muslim who h”
- `1.38.26`: `bl1r3` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus from ce”; `bl1r5` (lead-in) “H 4075, Ch. 39, h 5”; `bl1r6` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Mahbu”
- `1.40.4`: `bl1rj` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Husayn from Safwa”; `bl1rl` (lead-in) “H 4080, Ch. 40, h 4”; `bl1rm` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus from ib”
- `1.43.1`: `bl1ss` (content) “Ali ibn Ibrahim has narrated from his father from ‘Abd Allah ibn al-Mu”; `bl1t4` (lead-in) “H 4097, Ch. 43, h 1”; `bl1t5` (content) “Ali ibn Ibrahim has narrated from his father and Muhammad ibn Yahya fr”
- `1.46.4`: `bl1u6` (content) “H 4108, Ch. 46, h 3”; `bl1u9` (lead-in) “H 4109, Ch. 46, h 4”; `bl1ua` (content) “Muhammad ibn Yahya has narrated from Salmah ibn al-Khattab from Ibrahi”
- `2.1.2`: `bl1vo` (lead-in) “H 4124, Ch. 1, h 2”; `bl1vp` (lead-in) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl1vq` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about the words of All”; `bl1vx` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan and Ali ib”
- `2.13.1`: `bl20w` (content) “H 4174, Ch. 12, h 1”; `bl21h` (lead-in) “H 4180, Ch. 13, h 1”; `bl21i` (content) “Muhammad ibn abu ‘Abd Allah has narrated from Mu‘awiyah ibn Hukaym fro”
- `3.5.3`: `bl27j` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl27l` (lead-in) “H 4245, Ch. 5, h 3”; `bl27m` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn Khalid, wh”
- `3.6.1`: `bl27p` (content) “H 4246, Ch. 6, h 1”; `bl27s` (content) “H 4247, Ch. 6, h 2”
- `3.6.2`: `bl27q` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ali ibn ”; `bl27t` (content) “Ali ibn Ibrahim has narrated from his father from ‘Abd Allah ibn al-Mu”
- `3.8.3`: `bl28i` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”; `bl28k` (lead-in) “H 4256, Ch. 8, h 3”; `bl28l` (content) “It is a narration from him (narrator of previous Fladith) by Ahmad ibn”
- `3.8.8`: `bl28x` (content) “Abu Ali al-Ash’ariy has narrated from al-Hassan ibn Ali from ‘Abd Alla”; `bl290` (lead-in) “H 4261, Ch. 8, h 8”; `bl291` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from ibn Mahbu”
- `3.10.2`: `bl2aa` (content) “Ali has narrated from his father from ibn abu ‘Umayr from al-Husayn ib”; `bl2ac` (lead-in) “H 4275, Ch. 10, h 2”; `bl2ad` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-Husayn”
- `3.11.2`: `bl2aq` (content) “H 4279, Ch. 11, h 1”; `bl2at` (lead-in) “H 4280, Ch. 11, h 2”; `bl2au` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad from Muhamma”
- `3.13.1`: `bl2b0` (lead-in) “H 4282, Ch. 12, h 1”; `bl2b1` (content) “Abu Ali al-Ash’ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”; `bl2b7` (lead-in) “H 4284, Ch. 13, h 1”; `bl2b8` (content) “A number of our people have narrated from Sahl ibn Ziyad from ibn Fadd”
- `3.13.6`: `bl2bo` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from al-Husayn”; `bl2bq` (content) “H 4289, Ch. 13, h 6”
- `3.13.7`: `bl2br` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `bl2bt` (content) “H 4290, Ch. 13, h 7”
- `3.13.8`: `bl2bu` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad al-Kindiy fr”; `bl2bw` (lead-in) “H 4291, Ch. 13, h 8”; `bl2bx` (content) “Aban ibn ‘Uthman has narrated from ‘Uqbah who had heard abu ‘Abd Allah”
- `3.14.3`: `bl2ct` (content) “It is narrated from him (narrator of the above Hadith) from Yunus from”; `bl2cv` (lead-in) “H 4302, Ch. 14, h 3”; `bl2cw` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub from al-M”
- `3.18.4`: `bl2dn` (content) “A number of our people have narrated from Sahl ibn Ziyad from al-Hassa”; `bl2dp` (lead-in) “H 4310, Ch. 18, h 4”; `bl2dq` (content) “It is a narration from him (narrator of previous Hadith) by Muhammad i”
- `3.24.7`: `bl2i0` (lead-in) “H 4358, Ch. 24, h 6”; `bl2i1` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”; `bl2i3` (lead-in) “H 4359, Ch. 24, h 7”; `bl2i4` (content) “Ali ibn Ibrahim has narrated from his father from ‘Abd Allah ibn al-Mu”
- `3.28.3`: `bl2jq` (content) “It is a narration from him (narrator of previous Hadith) by certain pe”; `bl2js` (content) “H 4378, Ch. 28, h 3”
- `3.29.5`: `bl2k6` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad al-kindiy fr”; `bl2k8` (lead-in) “H 4383, Ch. 29, h 5”; `bl2k9` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”
- `3.29.7`: `bl2kc` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad from Ali ibn a”; `bl2ke` (lead-in) “H 4385, Ch. 29, h 7”; `bl2kf` (content) “A number of our people have narrated from Sahl ibn Ziyad from Ahmad ib”
- `3.29.11`: `bl2kq` (content) “Sahl ibn Ziyad has narrated from ibn Mahbub from ibn Ri’ab from al-Hal”; `bl2ks` (lead-in) “H 4389, Ch. 29, h 11”; `bl2kt` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”
- `3.32.2`: `bl2lx` (content) “Ali ibn Muhammad ibn ‘Abd Allah has narrated from Ibrahim ibn ‘Ishaq f”; `bl2lz` (lead-in) “H 4402, Ch. 32, h 2”; `bl2m0` (content) “Ali ibn Ibrahim has narrated from his father from al-Nawfaliy, from al”
- `3.33.3`: `bl2ma` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl2mc` (lead-in) “H 4406, Ch. 33, h 3”; `bl2md` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”
- `3.45.1`: `bl2q3` (content) “A number of our people have narrated from Sahl ibn Ziyad Ahmad ibn Muh”; `bl2qo` (content) ““I once asked abu ‘Abd Allah, ‘Alayhi al-Salam, about a man who perfor”
- `3.44.4`: `bl2q9` (content) “A number of our people have narrated from Sahl ibn Ziyad from Muhammad”; `bl2qb` (lead-in) “H 4450, Ch. 44, h 4”; `bl2qc` (content) “Abu Ali al-Ash’ariy has narrated from Muhammad ibn ‘Abd al-Jabbar from”
- `3.44.6`: `bl2qf` (content) “H 4451, Ch. 44, h 5”; `bl2qi` (lead-in) “H 4452, Ch. 44, h 6”; `bl2qj` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad ibn Sama‘ah ”
- `3.48.3`: `bl2rn` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl2rp` (lead-in) “H 4465, Ch. 48, h 3”; `bl2rq` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan and abu Al”
- `3.50.1`: `bl2s0` (content) “A number of our people have narrated from Sahl ibn Ziyad from al-Hassa”; `bl2sf` (lead-in) “H 4473, Ch. 50, h 1”; `bl2sg` (content) “Humayd ibn Ziyad has narrated from al-Hassan ibn Muhammad ibn Sama‘ah ”
- `3.56.1`: `bl2u1` (content) “H 4490, Ch. 55, h 1”; `bl6oq` (header) “Salat (Prayer) For a Person of Weak Understanding of Faith and One Who”; `bl2uc` (content) “Ali ibn Ibrahim has narrated from his father from Hammad ibn ‘Isa from”
- `3.56.9`: `bl2ui` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”; `bl6q1` (content) “H 4499, Ch. 57, h 1”
- `3.74.5`: `bl332` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”; `bl334` (lead-in) “H 4592, Ch. 74, h 5”; `bl335` (content) “Ali ibn Ibrahim has narrated from his father from ibn Mahbub ibn Sinan”
- `3.84.5`: `bl39p` (content) “H 4665, Ch. 84, h 4”; `bl39t` (content) “It is narrated from him (narrator of above Hadith) from Muhammad ibn S”
- `3.85.2`: `bl39x` (content) “Ali ibn Ibrahim has narrated from his father from ‘Amr ibn ‘Uthman and”; `bl3a0` (lead-in) “H 4668, Ch. 85, h 2”; `bl3a1` (content) “Sahl ibn Ziyad has narrated from al-Hassan ibn Ali from Bashir al-Dahh”
- `3.86.2`: `bl3ae` (content) “Abu Ali al-Ash’ariy has narrated from Muhammad ibn ‘Abd Al-Jabbar from”; `bl3ag` (lead-in) “H 4672, Ch. 86, h 2”; `bl3ah` (content) “A number of our people have narrated from Sahl ibn Ziyad from ‘Abd al-”
- `3.86.6`: `bl3aq` (content) “It is narrated from him (narrator of above Hadith) from Ahmad ibn Muha”; `bl3as` (lead-in) “H 4676, Ch. 86, h 6”; `bl3at` (content) “A number of our people have narrated from Ahmad ibn Muhammad ibn Khali”
- `3.86.16`: `bl3b2` (content) “H 4679, Ch. 86, h 9”; `bl3bu` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus who has”
- `3.88.5`: `bl6uf` (content) “H 4694, Ch. 89, h 1”; `bl3p5` (content) “H 4832, Ch. 7, h 2”
- `4.26.5`: `bl44l` (content) “H 5001, Ch. 26, h 4”; `bl44o` (lead-in) “H 5002, Ch. 26, h 5”; `bl44p` (content) “A group has narrated from Ahmad ibn Muhammad from al-Husayn ibn Sa‘id ”
- `4.28.9`: `bl47y` (content) “H 5036, Ch. 28, h 8”; `bl481` (lead-in) “H 5037, Ch. 28, h 9”; `bl482` (content) “Ahmad ibn Muhammad from Sahl ibn Ziyad from Muhammad ibn al-Walid from”
- `4.30.3`: `bl49f` (lead-in) “H 5053, Ch. 30, h 2”; `bl49g` (content) “Through the same chain of narrators as that of the previous Hadith, it”; `bl49i` (lead-in) “H 5054, Ch. 30, h 3”; `bl49j` (content) “A group has narrated from Ahmad ibn Muhammad ibn ‘Isa from al-Husayn i”
- `4.32.10`: `bl4bs` (content) “H 5080, Ch. 32, h 9”; `bl4bw` (lead-in) “H 5081, Ch. 32, h 10”; `bl4bx` (content) “Muhammad ibn Isma’il has narrated from al-Fadl ibn Shadhan from Hammad”
- … 16 more in the TSV

**Opening invocations carrying a number** (2)

- `f.66`: `bl6m7` “In the name of Allah, the Beneficient, the Merciful”
- `3.87.213`: `bl3im` “In the name of Allah the Beneficent, the Merciful”

**Header numbers colliding with another block** (273)

- `1`: `bl6m6` (header) “Part One”; `bl6m1` (header) “Women’s Using Medicine to Have Hayd (menses) after It Stops”; `bl6ub` (header) “Ghusl (bath) for Children and Salat (Prayer) for Them”
- `1.3`: `bl6ma` (header) “The Quantity of Water that Always Remains Clean”; `bl128` (header) “Chapter 3”
- `1.4`: `bl6mb` (header) “The Case of a Small Quantity of Water, the Water with a Dead Body in i”; `bl12v` (header) “Chapter 4”
- `1.5`: `bl6nl` (header) “The Case of a Well and Things that May Fall in It”; `bl6nx` (header) “Chapter 5”
- `1.6`: `bl13z` (header) “A Well near a Cesspool”; `bl14c` (header) “Chapter 6”
- … 268 more in the TSV

**Source / citation lines carrying a number** (4)

- `3.11.1`: `bl2a8` (source) “(If Dying Becomes Difficult and the Agony of Death Intense)”; `bl2ar` (content) “Ali ibn Ibrahim has narrated from his father from ibn abu ‘Umayr from ”
- `4.21/22.10`: `bl413` (content) ““Abu Ja’far, ‘Alayhi al-Salam, has said, ‘It is undesirable to recite ”; `bl414` (source) “(Ahadith 7-11 are best explained in the form of fatwa.)”
- `4.21/22.19`: `bl41w` (content) ““I said to abu al-Hassan, ‘Alayhi al-Salam, ‘May Allah keep my soul in”; `bl41x` (source) “(Ahadith 12-19 are best explained in the form of fatwa.)”
- `4.21/22.28`: `bl42o` (content) ““I once asked him (the Imam), ‘Alayhi al-Salam, about one who does not”; `bl42p` (source) “(Ahadith 20-28 are best explained in the form of fatwa.)”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1352)

- `L1.1`: `bl115` (lead-in) “H 3783, Ch. 1, h 1”; `bl116` (content) “Abu Ja‘far, Muhammad ibn Ya’qub al-Kulayniy (rh) has said that narrate”
- `1.1.3`: `bl11b` (lead-in) “H 3785, Ch. 1, h 3”; `bl11c` (content) “Muhammad ibn Yahya has narrated from Muhammad ibn al-Hassan from abu D”
- `1.1.4`: `bl11e` (lead-in) “H 3786, Ch. 1, h 4”; `bl11f` (content) “Ali ibn Ibrahim has narrated from Muhammad ibn ‘Isa from Yunus ibn ‘Ab”
- `1.1.5`: `bl11h` (lead-in) “H 3787, Ch. 1, h 5”; `bl11i` (content) “Muhammad ibn Yahya has narrated from Ahmad ibn Muhammad ibn ‘Isa from ”
- `1.2.1`: `bl6m9` (lead-in) “H 3788, Ch. 2, h 1”; `bl11l` (content) “Muhammad ibn ‘Isma‘il has narrated from al-Fadl ibn Shadhan from Safwa”
- … 1347 more in the TSV

### The Shahnama of Firdausi (`shahnameh_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (70)

- `2.1.1`: `bl3q` (content) “THE most trustworthy materials for the life of Firdausi are to be foun”; `blb0` (content) “ARGUMENT”
- `2.1.5`: `bl3u` (content) “The poet was a Muhammadan of the Shi’ite sect. This is clear from his ”; `blb7` (content) “ARGUMENT”
- `1.7.12`: `bla5` (content) “§1 In the Name of God the Merciful, the Pitiful”; `bla8` (content) “§2 Discourse in Praise of Wisdom”; `blaa` (content) “§3 Of the Making of the World”; `blad` (content) “§4 Of the Nature of Man”; `blaf` (content) “§5 Of the Nature of the Sun”; `blah` (content) “§6 Of the Nature of the Moon”; `blal` (content) “§8 On the Compilation of the Shahnama”; `blao` (content) “§9 Of the poet Dakiki”
- `1.7.26`: `blas` (content) “§11 In Praise of Abu Mansur, Son of Muhammad”; `blau` (content) “§12 The Praise of Sultan Mahmud”
- `5.5.43`: `blf1` (content) “§4 How Faridun questioned his Mother about his Origin”; `blf2` (content) “What is my lineage, whom shall I declare Myself in public? Let me have”
- `5.5.78`: `blg5` (content) “§8 The Story of Faridun and the Minister of Zahhak”; `blg7` (content) “Being bid approach He told the Shah the secrets of his office And was ”
- `5.5.88`: `blgg` (content) “§9 How Faridun bound Zahhak”; `blgi` (content) “The warriors and citizens were blent Together as they fought — a mass ”
- `5.6.15`: `blhn` (content) “§2 How Faridun sent Jandal to Yaman”; `blhp` (content) “Having heard he undertook The fair emprise, for he was shrewd and upri”
- `5.6.29`: `bli2` (content) “§4 How the Sons of Faridun went to the King of Yaman”; `bli4` (content) “They answered as they had been taught, and so Sewed up the eyelids of ”
- `5.6.31`: `bli5` (content) “§5 How Sarv proved the Sons of Faridun by Sorcery”; `bli8` (content) “When tidings that the princes had returned Reached Faridun he went to ”
- `5.6.32`: `bli7` (content) “§6 How Faridun made Trial of his Sons”; `bli9` (content) “Then he showed his back And fled. The father turned toward the next, H”
- `5.6.37`: `blid` (content) “§7 How Faridun divided the World among his Sons”; `blig` (content) “Much time rolled on, while fate reserved its secrets, Till wise Shah F”
- `5.6.38`: `blif` (content) “§8 How Salm grew Envious of Iraj”; `blih` (content) “Three sons were we who graced our father’s throne, And now the younges”
- `5.6.42`: `blik` (content) “§9 How Salm and Tur sent a Message to Faridun”; `blim` (content) “The priest at this harsh message kissed the ground, Then turned and mo”
- `5.6.48`: `blir` (content) “§10 How Faridun made Answer to his Sons”; `blit` (content) “The envoy hearing kissed the ground and went; Thou wouldst have said: ”
- `5.6.51`: `bliv` (content) “§11 How Iraj went to his Brothers”; `blix` (content) “They sealed The letter with the signet of the Shah. Iraj set forth wit”
- `5.6.57`: `blj1` (content) “§12 How Iraj was Slain by his Brothers”; `blj4` (content) “Tur heard the words and little heeded them, But, angry that Iraj shoul”
- `5.6.67`: `bljc` (content) “§13 How Faridun received Tidings of the Murder of Iraj”; `bljf` (content) “The prince’s Arabs splashed with indigo. Both Shah and warriors fared ”
- `5.6.77`: `bljn` (content) “§14 How a Daughter was Born to Iraj”; `bljr` (content) “The world-divider’s lips were full of smiles; Thou wouldst have said: ”
- `5.6.78`: `bljp` (content) “§15 The Birth of Minuchihr”; `bljs` (content) “He prayed so earnestly that God vouchsafed To give his sight back. Whe”
- `5.6.83`: `bljv` (content) “§16 How Salm and Tar had Tidings of Minuchihr”; `blk0` (content) “The Shah, when he had heard the message sent By his two wicked sons, s”
- `5.6.84`: `bljx` (content) “§17 How Faridun received his Sons’ Message”; `blk1` (content) “No one hath sought revenge for him as yet Because I saw the back of fo”
- `5.6.85`: `bljz` (content) “§18 How Faridun made Answer to his Sons”; `blk2` (content) “He sped Like rushing wind, his head full of the message, His heart of ”
- `5.6.92`: `blk7` (content) “§19 How Faridun sent Minuchihr to fight Tur and Salm”; `blka` (content) “He ordered that Karan, who loved the fray, Should cross the frontier t”
- `5.6.100`: `blkg` (content) “§20 How Minuchihr attacked the Host of Tar”; `blkj` (content) “They went back to their tents, All purposing revenge.”
- `5.6.105`: `blkm` (content) “§21 How Tur was Slain by the Hand of Minuchihr”; `blkp` (content) ““They make air blaze, earth gleam like diamonds.” The clashing of the ”
- `5.6.109`: `blkr` (content) “§22 How Minuchihr wrote to Announce his Victory to Faridun”; `blku` (content) “By virtue of thy Grace I reached Turan, Arrayed the host and fought by”
- `5.6.114`: `blkx` (content) “§23 How Karan took the Castle of the Alans”; `bll0` (content) “He chose six thousand veterans of name, Who when the sky grew ebon pla”
- `5.6.123`: `bll7` (content) “§24 How Kakwi, the Grandson of Zahhak, attacked the Iranians”; `blla` (content) “Thou art exhausted with thy late exploit, Thy marching and revenge; it”
- `5.6.136`: `blll` (content) “§26 How the Head of Salm was sent to Faridun”; `bllp` (content) “Then Faridun Returning home sent word to Sam, the son Of Nariman: “Com”
- `5.6.142`: `blls` (content) “§27 The Death of Faridun”; `bllw` (content) “One who found profit in adversity. Then Mimichihr put off the royal cr”
- `5.7.9`: `blm9` (content) “§1 How Minuchihr ascended the Throne and made an Oration”; `blmc` (content) “Thereat rose Sam, the chief of paladins, And said to Minuchihr: “O jud”
- `5.7.13`: `blme` (content) “§2 The Birth of Zal”; `blmh` (content) ““May Sam the hero’s days be fortunate, And may his foemen’s hearts be ”
- `5.7.21`: `blmn` (content) “§3 How Sam had a Dream touching the Case of his Son”; `blmq` (content) “So next day and in sore distress Sam went to Mount Alburz, and when ni”
- `5.7.34`: `bln1` (content) “§4 How Minuchihr took Knowledge of the Case of Sam and Zal”; `bln4` (content) “The Shah marked with amaze that lofty stature And goodly face, “the ab”
- `5.7.38`: `bln6` (content) “§5 How Zal went back to Zabulistan”; `bln9` (content) “The Shah rejoiced and Sam’s heart ceased from care. The ruler of the e”
- `5.7.42`: `blnb` (content) “§6 How Sam gave the Kingdom to Zal”; `blne` (content) “Zal answered: “Can I live on here? If one Was ever born defective it w”
- `5.7.47`: `blnh` (content) “§7 How Zal visited Mihrab of Kabul”; `blnk` (content) “One of the noble chieftains said to Zal: — “He hath a daughter in his ”
- `5.7.57`: `blns` (content) “§8 How Rudaba took Counsel with her Damsels”; `blnv` (content) “Of all the warrior-paladins of earth Not one can tread his steps; ther”
- `5.7.68`: `blo4` (content) “§9 How Rudabas Damsels went to see Zal”; `blo7` (content) “Zal’s heart beat fast, and being love-distraught He walked attended by”
- `5.7.85`: `blom` (content) “§10 How the Damsels returned to Rudaba”; `blop` (content) ““This day is just like any other one: There is no foul div in the rosa”
- `5.7.98`: `blp0` (content) “§11 How Zal went to Rudaba”; `blp4` (content) “The fairy-faced one heard the chieftain’s words And doffed her scarlet”
- `5.7.108`: `blpb` (content) “How Zal consulted the Archimages in the Matter of Rudaba”; `blpg` (content) “The chieftain bade a scribe to come, poured forth His heart and wrote ”
- `5.7.112`: `blpf` (content) “§13 How Zal wrote to Sam to Explain the Case”; `blpk` (content) “The messenger Went, like the wind, upon a steed of steel. When he was ”
- `5.7.119`: `blpo` (content) “§14 How Sam consulted the Archmages in the Matter of Zal”; `blpt` (content) “He gave a largess to the messenger And said to him: “Arise and tarry n”
- `5.7.127`: `blpy` (content) “§15 How Sindukht heard of the Case of Rudaba”; `blq3` (content) “Sindukht said: “Show them And quench my wrath.””
- `5.7.139`: `blqb` (content) “§16 How Mihrab was made Aware of his Daughter’s Case”; `blqg` (content) “She hung her head and bent her cypress-form, Her eyes dropped dew upon”
- `5.7.160`: `blqw` (content) “§17 How Minuchihr heard of the Case of Zal and Rudaba”; `blr4` (content) “The Shah, on hearing what his chieftain said, Raised to the moon his g”
- `5.7.164`: `blr2` (content) “§18 How Sam came to Minuchihr”; `blr9` (content) “In great concern he hasted on his journey, With much to think about an”
- `5.7.175`: `blre` (content) “§20 How Zal went on a Mission to Minuchihr”; `blrm` (content) ““Here is the key,” he said, “One must not always grieve at spending tr”
- `5.7.177`: `blrh` (content) “§21 How Mihrab was Wroth with Sindukht”; `blrp` (content) “She took his pledge, Then boldly faced the danger, clad herself All in”
- `5.7.185`: `blrq` (content) “§22 How Sam comforted Sindukht”; `blry` (content) “Sam grasped Her hand and took the oath, on hearing which, And marking ”
- `5.7.201`: `bls6` (content) “§23 How Zal came to Minuchihr with Sam’s Letter”; `blsg` (content) “In Persia never more and never less?” The second said: “O noble youth!”
- `5.7.206`: `blsd` (content) “§24 How the Archmages questioned Zal”; `blsl` (content) “Where streams abound and herbage groweth strong, To which a fierce man”
- `5.7.224`: `blsw` (content) “§25 How Zal answered the Archmages”; `blt5` (content) “They never catch each other as they go, But follow as a hound pursueih”
- `5.7.254`: `bltr` (content) “§26 How Zal displayed his Accomplishment before Minuchihr”; `blu1` (content) “Exalted o’er the rest and in high favour Zal sent to Sam to say: “I le”
- `5.7.261`: `bltz` (content) “§27 Minuchihr’s Answer to Sam’s Letter”; `blua` (content) “Zal sped like bird on wing or ship at sea And all that heard of his ap”
- `5.7.270`: `blu9` (content) “§28 How Zal came to Sam”; `bluj` (content) “They sought the chamber arabesqued with gold, Where all was jocund Spr”
- `5.7.282`: `blum` (content) “§29 The Story of the Birth of Rustam”; `blux` (content) “Came like a rushing wind the messenger To Zal of ardent and exulting h”
- `5.7.294`: `bluz` (content) “§30 How Sam came to see Rustam”; `blvb` (content) “He heard, and urged by hardihood ran forth, Snatched up Sam’s mace and”
- … 10 more in the TSV

**Header numbers colliding with another block** (4)

- `1`: `bl2t` (signature) “FIRDAUSI”; `bl12z` (header) “Chapter I”
- `3.4`: `bl11k` (header) “Genealogical Table of the Pishdadians (According to the Shahnama)”; `bl11t` (header) “Genealogical Table of the Pishdadians (According to the Bundahis)”; `bl11u` (header) “Kings and Heroes of Turan (Shahnama and Bundahish Combined)”; `bl11m` (header) “Abbreviations”
- `5.2`: `blb5` (header) “I Gaiumart”; `blbj` (header) “Hushang”
- `b.2`: `blb6` (header) “He Reigned for Thirty Years”; `bl11a` (header) “He Reigned Forty Years”; `bl11b` (header) “Tahmuras, the Binder of the Div, Reigned Thirty Years”; `bl115` (header) “He Reigned Seven Hundred Years”; `bl116` (header) “He Reigned a Thousand Years”; `bl11e` (header) “His Reign Was Five Hundred Years”; `bl11n` (header) “He Reigned One Hundred and Twenty Years”; `bl11x` (header) “He Reigned for Seven Years”; `bl11h` (header) “He Reigned Five Years”; `bl11i` (header) “His Reign Was Nine Years”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (35)

- `5.1.10`: `blbh` (lead-in) “§3 How Hushang and Gaiumart went to Fight the Black Div”; `blbi` (content) “The blessed Siyamak had left a son, His grandsire’s minister, a prince”
- `5.2.3`: `blbp` (lead-in) “§1 The Accession of Hushang and his civilising Arts”; `blbq` (content) “Hushang, a just and prudent sovereign, Assumed his grandsire’s crown. ”
- `5.2.5`: `blbu` (lead-in) “§2 How the Feast of Sada was Founded”; `blbv` (content) “One day he reached a mountain with his men And saw afar a long swift d”
- `5.3.4`: `blc4` (lead-in) “§1 Tahmuras ascends the Throne, invents new Arts, subdues the Divs, an”; `blc5` (content) “Hushang possessed a wise and noble son Hight Tahmuras — the Binder of ”
- `5.4.39`: `bldi` (lead-in) “§4 How the Fortunes of Jamshid went to Wrack”; `bldj` (content) “Thereafter tumult, combating and strife Arose throughout Iran, the bri”
- … 30 more in the TSV

### Sutra Collection (EFG) (`buddhasutra_efg_buddhism_ocean_en_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (65)

- `1.1`: `bl3p` (content) “[with commentary]”; `bl3r` (source) “(Translated from the Vietnamese by Truong Giam Tan and Carole Melkonia”; `bl3s` (content) “Wholeheartedly, day and night, a disciple of the Buddha should recite ”
- `5.24`: `bl8d` (content) “THE KINDNESS OF PROVIDING PROTECTION AND CARE WHILE THE CHILD IS IN TH”; `bl8i` (content) “The pregnancy lasts for ten lunar months And culminates in difficult l”
- `5.27`: `bl8h` (content) “THE KINDNESS OF BEARING SUFFERING DURING BIRTH”; `bl8p` (content) “The mother is willing to be wet So that the child can be dry. With her”
- `5.28`: `bl8j` (content) “THE KINDNESS OF FORGETTING ALL THE PAIN ONCE THE CHILD HAS BEEN BORN”; `bl8t` (content) “The kind mother is like the great earth. The stern father is like the ”
- `5.30`: `bl8m` (content) “THE KINDNESS OF EATING THE BITTER HERSELF AND SAVING THE SWEET FOR THE”; `bl8w` (content) “THE KINDNESS OF WASHING AWAY THE UNCLEAN”; `bl8z` (content) “The death of loved ones is difficult to endure. But separation is also”
- `5.31`: `bl8o` (content) “THE KINDNESS OF MOVING THE CHILD TO A DRY PLACE AND LYING IN THE WET H”; `bl8y` (content) “THE KINDNESS OF ALWAYS THINKING OF THE CHILD WHEN IT HAS TRAVELLED FAR”; `bl93` (content) “How heavy is parental kindness and emotional concern! Their kindness i”
- `5.29`: `bl8s` (content) “THE KINDNESS OF SUCKLING THE CHILD AT HER BREAST, NOURISHING AND BRING”; `bl8x` (content) “Originally, she had a pretty face and a beautiful body, Her spirit was”
- `5.32`: `bl92` (content) “THE KINDNESS OF DEEP CARE AND DEVOTION”; `bl98` (content) “The kindness of parents is profound and important. Their tender concer”
- `5.33`: `bl97` (content) “THE KINDNESS OF ULTIMATE COMPASSION AND SYMPATHY”; `bl9g` (content) “The Buddha told Ánanda, “When I contemplate living beings, I see that ”
- `7.9`: `bld3` (content) “Here Ends the Account of What Passed Under the Bodhi Tree.”; `bld5` (content) “Then the Blessed One, at the end of those seven days, arose from that ”
- `8.1`: `bl167` (content) “Now the Blessed One thought: To whom shall I preach the Dharma first? ”; `bl1ab` (content) “Introduction”
- `9.2`: `bl19a` (content) “But when the Blessed One approached in a dignified manner, they involu”; `bl1ad` (content) “Thus have I heard.”
- `10.4`: `bl1ag` (content) ““Where do you come from?” The Laywoman asked the Buddha,”; `bl1ca` (lead-in) “Section 1”; `bl1cb` (content) “Leaving Home and Becoming an Arhat”
- `10.5`: `bl1ah` (content) ““World-Honored One, if someone were to ask a magically produced being ”; `bl1cd` (lead-in) “Section 2”; `bl1ce` (content) “Eliminating Desire and Ending Seeking”
- `10.6`: `bl1ai` (content) “The World Honored One told her,”; `bl1cg` (lead-in) “Section 3”; `bl1ch` (content) “Severing Love and Renouncing Greed”
- `10.7`: `bl1aj` (content) ““A magically produced being neither comes nor goes, is neither born no”; `bl1cj` (content) “Section 4”
- `10.8`: `bl1ak` (content) “Then the laywoman asked,”; `bl1ck` (content) “Clarifying Good and Evil”; `bl1cm` (lead-in) “Section 5”; `bl1cn` (content) “Reducing the Severity of Offenses”
- `10.9`: `bl1al` (content) ““Is it not true that all things are illusory, like magic?””; `bl1cp` (lead-in) “Section 6”; `bl1cq` (content) “Tolerating Evil-doers and Avoiding Hatred”
- `10.10`: `bl1am` (content) “The Buddha said,”; `bl1cs` (lead-in) “Section 7”; `bl1ct` (content) “Evil Returns to the Doer”
- `10.11`: `bl1an` (content) ““Yes indeed, what you say is true””; `bl1cv` (lead-in) “Section 8”; `bl1cw` (content) “Abusing Others Defiles Oneself”
- `10.12`: `bl1ao` (content) “Gangottara asked,”; `bl1cy` (lead-in) “Section 9”; `bl1cz` (content) “By Returning to the Source, You Find the Way”
- `10.13`: `bl1ap` (content) ““If all things are illusory, like magic, why did you ask me where I ca”; `bl1d1` (lead-in) “Section 10”; `bl1d2` (content) “Joyful Charity Brings Blessings”
- `10.16`: `bl1as` (content) “The Laywoman replied,”; `bl1d6` (lead-in) “Section 11”; `bl1d7` (content) “The Increase in Merit Gained by Bestowing Food”
- `10.17`: `bl1at` (content) ““As I see it, if my own body were different from a magically produced ”; `bl1d9` (lead-in) “Section 12”; `bl1da` (content) “A List of Difficulties and an Exhortation to Cultivate”
- `10.18`: `bl1au` (content) ““Furthermore, World Honored One, nirvana’s very nature is such that it”; `bl1dc` (lead-in) “Section 13”; `bl1dd` (content) “Questions about the Way and Past Lives”
- `10.20`: `bl1aw` (content) ““Do you not seek the state of nirvana?””; `bl1dg` (lead-in) “Section 14”; `bl1dh` (content) “Asking about Goodness and Greatness”
- `10.21`: `bl1ax` (content) “Gangottara asked in turn,”; `bl1dj` (lead-in) “Section 15”; `bl1dk` (content) “Asking about Strength and Brilliance”
- `10.23`: `bl1az` (lead-in) “The Buddha replied,”; `bl1b0` (content) ““That which has never come into being is nirvana itself””; `bl1dn` (lead-in) “Section 16”; `bl1do` (content) “Casting Aside Love and Attaining the Way”
- `10.24`: `bl1b1` (content) “Gangottara asked,”; `bl1dq` (content) “Section 17”
- `10.25`: `bl1b2` (content) ““Are not all things identical with nirvana?””; `bl1dr` (content) “When Light Arrives, Darkness Departs”; `bl1dt` (lead-in) “Section 18”; `bl1du` (content) “Thoughts and So Forth Are Basically Empty”
- `10.26`: `bl1b3` (content) “The Buddha replied,”; `bl1dw` (lead-in) “Section 19”; `bl1dx` (content) “Contemplating Both the False and the True”
- `10.27`: `bl1b4` (content) ““So they are, so they are.””; `bl1dz` (lead-in) “Section 20”; `bl1e0` (content) “Realize that the Self Is Truly Empty”
- `10.28`: `bl1b5` (content) ““World Honored One, if all things are identical with nirvana why did y”; `bl1e2` (lead-in) “Section 21”; `bl1e3` (content) “Fame Destroys Life Roots”
- `10.29`: `bl1b6` (content) ““Furthermore World Honored One, if a magically produced being asked an”; `bl1e5` (lead-in) “Section 22”; `bl1e6` (content) “Wealth and Sex Cause Suffering”
- `10.30`: `bl1b7` (content) “The World Honored One told her,”; `bl1e8` (lead-in) “Section 23”; `bl1e9` (content) “A Family Is Worse than a Prison”
- `10.31`: `bl1b8` (content) ““I raised the question because there are in this assembly good men and”; `bl1eb` (lead-in) “Section 24”; `bl1ec` (content) “Sexual Desire Obstructs the Way”
- `10.32`: `bl1b9` (content) “Gangottara said,”; `bl1ee` (lead-in) “Section 25”; `bl1ef` (content) “The Fire of Desire Burns”
- `10.33`: `bl1ba` (content) ““If so, why all the accumulation of good roots for the attainment of e”; `bl1eh` (lead-in) “Section 26”; `bl1ei` (content) “Demons from the Heavens Try to Tempt the Buddha”
- `10.35`: `bl1bd` (lead-in) “Gangottara asked,”; `bl1be` (content) ““What do you mean by ‘no discriminative thought’?””; `bl1el` (lead-in) “Section 27”; `bl1em` (content) “One Attains the Way after Letting Go of Attachments”
- `10.36`: `bl1bf` (content) “The World Honored One answered,”; `bl1eo` (lead-in) “Section 28”; `bl1ep` (content) “Don Indulge the Wild Mind”
- `10.37`: `bl1bg` (content) ““The absence of discriminative thought cannot be understood or grasped”; `bl1er` (lead-in) “Section 29”; `bl1es` (content) “Proper Contemplation Counteracts Sexual Desire”
- `10.38`: `bl1bh` (lead-in) “Gangottara inquired,”; `bl1bi` (content) ““If all things are like empty space, why does the World Honored One sp”; `bl1eu` (lead-in) “Section 30”; `bl1ev` (content) “Stay Far Away from the Fire of Desire”
- `10.39`: `bl1bj` (lead-in) “The Buddha told Gangottara,”; `bl1bk` (content) ““When I speak of a ‘self’, for example, although I express the concept”; `bl1ex` (lead-in) “Section 31”; `bl1ey` (content) “When the Mind Is Still, Desire Is Dispelled”
- `10.46`: `bl1bs` (lead-in) “Seeing this, the venerable Ánanda thought to himself,”; `bl1bt` (content) ““The Tathágata, the worthy one, the supremely enlightened one, does no”; `bl1f6` (lead-in) “Section 32”; `bl1f7` (content) “Emptying out the Self Quells Fear”
- `10.47`: `bl1bu` (content) “He rose from his seat, uncovered his right shoulder, knelt on his righ”; `bl1f9` (lead-in) “Section 33”; `bl1fa` (content) “Wisdom and Clarity Defeat the Demons”
- `10.48`: `bl1bv` (content) ““Why did the Buddha smile?””; `bl1fc` (lead-in) “Section 34”; `bl1fd` (content) “By Staying in the Middle, One Attains the Way”
- `10.49`: `bl1bw` (lead-in) “The Buddha replied,”; `bl1bx` (content) ““Recall that, in the past, a thousand Tathágatas also taught this dhar”; `bl1ff` (lead-in) “Section 35”; `bl1fg` (content) “When One Is Purified of Defilements, the Brilliance Remains”
- `10.50`: `bl1by` (lead-in) “Ánanda asked the Buddha,”; `bl1bz` (content) ““What name should be given to this Sutra and how should we accept and ”; `bl1fi` (lead-in) “Section 36”; `bl1fj` (content) “The Sequence that Leads to Success”
- `11.1`: `bl1c7` (content) “Having attained Buddhahood, the World-honored One thought thus: “To be”; `bl1m0` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `11.38`: `bl1ew` (content) “The Buddha said, “People who cultivate the Way are like dry grass: it ”; `bl1n5` (content) “Translated from the Pali by Thanissaro Bhikkhu.”
- `11.40`: `bl1f0` (content) ““The Buddha spoke a verse for him:”; `bl1na` (content) “Translated from the Pali by I. B. Horner”
- `12.65`: `bl1id` (content) “End of the First Bhànavàra”; `bl1if` (content) “I. At that time there assembled in a certain residence [or district] o”
- `13.1`: `bl1m1` (content) “At Savatthi. There the Blessed One said: “Monks, from an inconstruable”; `bl1oj` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `14.1`: `bl1n6` (content) ““Monks, it is just as if a donkey were following right after a herd of”; `bl1oe` (content) “Translated from the Pali by Thanissaro Bhikkhu.”; `bl1oy` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `16.1`: `bl1of` (content) ““Monks, it’s just as if there were a boil that had been building for m”; `bl1pk` (content) “Translated from the Pali by Nyanaponika Thera”
- `18.1`: `bl1oz` (content) ““Suppose there was a mountain cow — foolish, inexperienced, unfamiliar”; `bl1qg` (content) “Translated from the Pali by Thanissaro bhikkhu.”
- `19.1`: `bl1pl` (content) “Once the Blessed One dwelt at Vesali, in the Great Forest, at the Gabl”; `bl1qr` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `20.1`: `bl1qh` (content) ““There are these three types of sick people to be found existing in th”; `bl1r9` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `21.1`: `bl1qs` (content) “On that occasion Citta the householder was diseased, in pain, severely”; `bl1re` (content) “Translated from the Pali by Piyadassi Thera”
- `22.1`: `bl1ra` (content) “I have heard that on one occasion Ven. Anuruddha was staying near Sava”; `bl1tw` (content) “Translation by Lord Chalmers”; `bl1uf` (content) “Translation by Lord Chalmers”; `bl1ug` (source) “(London, 1926)”
- … 5 more in the TSV

**Header numbers colliding with another block** (23)

- `1`: `bl2s` (header) “The First Teaching”; `bl3o` (header) “Sutra on the Eight Realizations”
- `2`: `bl3q` (header) “By Thich Nhat Hanh”; `bl5r` (header) “The Enlightenment Sutra”
- `4`: `bl63` (header) “[The Polished Plate] [The Purification of Alms-Food] [Complete Purity ”; `bl68` (header) “The Purification of Alms-Food”; `bl73` (header) “Esukaari Sutta”; `bl74` (header) “To the Brahmin Esukari”
- `6`: `blae` (header) “The First Discourse Of The Buddha”; `blaf` (header) “By the Adipati Sayadaw”; `blak` (header) “Two Extremes”; `blat` (header) “The Middle Path”; `blbp` (header) “Sacca”; `blbt` (header) “The First Noble Truth”; `blc1` (header) “The Second Noble Truth”; `blc7` (header) “The Third Noble Truth”; `blci` (header) “Fourth Noble Truth”; `bld4` (header) “Section Two”; `blgl` (header) “Section Nine”; `blgu` (header) “Section Ten”; `blgx` (header) “Section Eleven”; `blh5` (header) “Section Twelve”; `blhd` (header) “Section Thirteen”; `blhh` (header) “Section Fourteen”; `blhu` (header) “Section Fifteen”; `blif` (header) “Section Sixteen”; `blim` (header) “Section Seventeen”; `bliq` (header) “Section Eighteen”; `blit` (header) “Section Nineteen”; `blj2` (header) “Section Twenty”; `blkf` (header) “Section Twenty-One”; `blko` (header) “Section Twenty-Two”; `bllf` (header) “Section Twenty-Three”; `bllv` (header) “Section Twenty-Four”; `blmg` (header) “Section Twenty-Five”; `blna` (header) “Section Twenty-Six”; `blng` (header) “Section Twenty-Seven”; `blo5` (header) “Section Twenty-Eight”; `blol` (header) “Section Twenty-Nine”; `blos` (header) “Section Thirty”; `blpa` (header) “Section Thirty-One”; `blpy` (header) “Section Thirty-Two”; `blq6` (header) “Section Thirty-Three”; `blqa` (header) “Section Thirty-Four”; `blqc` (header) “Section Thirty-Five”; `blqf` (header) “Section Thirty-Six”; `blr2` (header) “Section Thirty-Seven”; `blr6` (header) “Section Thirty-Eight”; `blru` (header) “Section Thirty-Nine”; `blsb` (header) “Section Forty”; `blsn` (header) “Section Forty-One”; `blsr` (header) “Section Forty-Two”; `blsy` (header) “Section Forty-Three”; `blt2` (header) “Section Forty-Four”; `blt6` (header) “Section Forty-Five”; `blt8` (header) “Section Forty-Six”; `bltd` (header) “Section Forty-Seven”; `bltg` (header) “Section Forty-Eight”; `bltm` (header) “Section Forty-Nine”; `bltz` (header) “Section Fifty”; `blu5` (header) “Section Fifty-One”; `blu9` (header) “Section Fifty-Two”; `blud` (header) “Section Fifty-Three”; `blur` (header) “Section Fifty-Four”; `blv6` (header) “Section Fifty-Five”; `blva` (header) “Section Fifty-Six”; `blve` (header) “Section Fifty-Seven”; `blvs` (header) “Section Fifty-Eight”; `blvw` (header) “Section Fifty-Nine”; `blw0` (header) “Section Sixty”; `blw4` (header) “Section Sixty-One”; `blw7` (header) “Section Sixty-Two”; `blwg` (header) “Section Sixty-Three”; `blwq` (header) “Section Sixty-Four”; `blwu` (header) “Section Sixty-Five”; `blwx` (header) “Section Sixty-Six”; `blx1` (header) “Section Sixty-Seven”; `blx7` (header) “Section Sixty-Eight”; `blxb` (header) “Section Sixty-Nine”; `blxl` (header) “Section Seventy”; `blxx` (header) “Section Seventy-One”; `bly4` (header) “Section Seventy-Two”; `blye` (header) “Section Seventy-Three”; `blyr` (header) “Section Seventy-Four”; `blz1` (header) “Section Seventy-Five”; `blz5` (header) “Section Seventy-Six”; `bl105` (header) “Section Seventy-Seven”; `bl108` (header) “Section Seventy-Eight”; `bl10h` (header) “Section Seventy-Nine”
- `7`: `blcs` (header) “First Khandhaka”; `blct` (header) “The Admission to the Order of Bhikkhus”; `blcu` (header) “Section One”; `blfr` (header) “Section Seven”; `blgf` (header) “Section Eight”; `bl166` (header) “Background of His Decision to Preach”; `bl16e` (header) “Encounter with Upaka, the Naked Ascetic”; `bl16k` (header) “The First Five Converts”; `bl16v` (header) “The First Sermon The Setting in Motion the Wheel of the Dharma”; `bl17b` (header) “The Monks Become Arahants”
- … 18 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (19)

- `1.11`: `bl42` (lead-in) “COMMENTARY: THE ORIGIN OF THE SUTRA”; `bl44` (content) “This sutra was translated from Pali to Chinese by the Parthian monk, A”
- `1.13`: `bl46` (lead-in) “THE CONTENT OF THE SUTRA”; `bl47` (content) “The Sutra on the Eight Realizations of the Great Beings contains eleve”
- `1.49`: `bl57` (lead-in) “PRACTICING AND OBSERVING THE SUTRA ON THE EIGHT REALIZATIONS”; `bl58` (content) “To practice and observe The Sutra on the Eight Realizations of the Gre”
- `1.52`: `bl5b` (lead-in) “Afterword:”; `bl5c` (content) “In 1978, I asked the La Boi Press to give this sutra away in order to ”
- `4.1`: `bl75` (lead-in) “I heard thus.”; `bl76` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- … 14 more in the TSV

### Sutra Collection (HIJK) (`sutra_collection_hijk_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (56)

- `11.1`: `blbp` (content) “I hear tell,”; `bldy` (content) “All the teachings given by Buddha Shakyamuni were based upon true real”
- `14.1`: `blpn` (content) “I heard thus:”; `blqi` (content) “At Savatthi. As he was sitting to one side, King Pasenadi Kosala said ”
- `17.1`: `bls3` (content) “Thus Have I Heard:”; `blsg` (content) “I have heard that on one occasion the Blessed One was staying near Sav”
- `20.3`: `blur` (content) “[The Buddha:]”; `blvg` (content) ““Suppose that an archer or archer’s apprentice were to practice on a s”
- `22.1`: `blvn` (content) “I heard thus:”; `blvv` (content) “I have heard that on one occasion the Blessed One was staying near Raj”
- `26.1`: `blxp` (content) “I heard thus:”; `blz0` (content) “Dwelling at Savatthi… Then Ven. Kaccayana Gotta approached the Blessed”
- `40.1`: `bl1bi` (content) “Thus have I heard:”; `bl1c9` (content) “I have heard that on one occasion the Blessed One was living among the”
- `40.7`: `bl1bp` (content) “[The Buddha:]”; `bl1d6` (content) “Then Kasi Bharadvaja, having heaped up milk-rice in a large bronze ser”
- `39.14`: `bl1bv` (content) “[The Buddha:]”; `bl1by` (content) ““To whom, then Venerable Gotama, shall I give this milk rice?””
- `40.6`: `bl1ch` (content) “[The Buddha:]”; `bl1ci` (content) “and stress.”
- `47.1`: `bl1h8` (content) “This is what I heard:”; `bl1iq` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1nj` (content) “Renouncing violence for all living beings, harming not even a one, you”
- `47.2`: `bl1ir` (content) “interpreting the calls of birds and animals —”; `bl1nl` (content) “For a sociable person there are allurements; on the heels of alluremen”
- `47.3`: `bl1j9` (content) “he abstains from wrong livelihood, from lowly arts such as these.””; `bl1nm` (content) “One whose mind is enmeshed in sympathy for friends and companions, neg”
- `47.4`: `bl1ja` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1nn` (content) “Like spreading bamboo, entwined, is concern for offspring and spouses.”
- `47.5`: `bl1jb` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1no` (content) “As a deer in the wilds, unfettered, goes for forage wherever it wants:”
- `47.6`: `bl1jc` (content) “thus there will be triumph, thus there will be defeat —”; `bl1nq` (content) “In the midst of companions — when staying at home, when going out wand”
- `47.7`: `bl1jj` (content) “he abstains from wrong livelihood, from lowly arts such as these.””; `bl1nt` (content) “There is sporting and love in the midst of companions, and abundant fo”
- `47.8`: `bl1jk` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1nw` (content) “Without resistance in all four directions, content with whatever you g”
- `47.9`: `bl1jl` (content) “such will be the result of the lunar eclipse…the rising, setting, dark”; `bl1ny` (content) “They are hard to please, some of those gone forth, as well as those li”
- `47.10`: `bl1jy` (content) “he abstains from wrong livelihood, from lowly arts such as these.””; `bl1nz` (content) “Cutting off the householder’s marks, like a kovilara tree that has she”
- `47.11`: `bl1jz` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1o1` (content) “If you gain a mature companion, a fellow traveler, right living and wi”
- `47.12`: `bl1k0` (content) “or they earn their living by counting, accounting, calculation, compos”; `bl1o3` (content) “If you don’t gain a mature companion, a fellow traveler, right-living ”
- `47.13`: `bl1k5` (content) “he abstains from wrong livelihood, from lowly arts such as these.””; `bl1o4` (content) “We praise companionship — yes!”
- `47.14`: `bl1k6` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1o5` (content) “Those on a par, or better, should be chosen as friends. If they’re not”
- `47.15`: `bl1k7` (content) “worshipping the sun, worshipping the Great Brahma, bringing forth flam”; `bl1o7` (content) “Seeing radiant bracelets of gold, well made by a smith, clinking, clas”
- `47.16`: `bl1kb` (content) “he abstains from wrong livelihood, from lowly arts such as these.””; `bl1o8` (content) “[Thinking:]”
- `47.17`: `bl1kc` (content) ““Whereas some priests and contemplatives, living off food given in fai”; `bl1o9` (content) ““In the same way, if I were to live with another, there would be carel”
- `47.18`: `bl1kd` (content) “promising gifts to deities in return for favors; fulfilling such promi”; `bl1oa` (content) “Because sensual pleasures, elegant, honeyed, and charming, bewitch the”
- `47.19`: `bl212` (content) “he abstains from wrong livelihood, from lowly arts such as these. This”; `bl1oc` (content) ““Calamity, tumor, misfortune, disease, an arrow, a danger for me.” See”
- `47.20`: `bl1kn` (content) ““A monk thus consummate in virtue sees no danger anywhere from his res”; `bl1oe` (content) “Cold and heat, hunger and thirst, wind and sun, horseflies and snakes:”
- `47.21`: `bl1kp` (content) ““And how does a monk guard the doors of his senses? On seeing a form w”; `bl1of` (content) “As a great white elephant, with massive shoulders, renouncing his herd”
- `47.22`: `bl1kr` (content) ““And how is a monk possessed of mindfulness and alertness? When going ”; `bl1oh` (content) ““There’s no way that one delighting in company can touch even momentar”
- `47.23`: `bl1kt` (content) ““And how is a monk content? Just as a bird, wherever it goes, flies wi”; `bl1oi` (content) “Transcending the contortion of views, the sure way attained, the path ”
- `47.24`: `bl1kv` (content) ““Endowed with this noble aggregate of virtue, this noble restraint ove”; `bl1ol` (content) “With no greed, no deceit, no thirst, no hypocrisy — delusion and blemi”
- `47.25`: `bl1kw` (content) ““Abandoning covetousness with regard to the world, he dwells with an a”; `bl1om` (content) “Avoid the evil companion disregarding the goal, intent on the out-of-t”
- `47.26`: `bl1kx` (content) ““Suppose that a man, taking a loan, invests it in his business affairs”; `bl1on` (content) “Consort with one who is learned, who maintains the Dhamma, a great and”
- `47.27`: `bl1ky` (content) ““Now suppose that a man falls sick — in pain and seriously ill. He doe”; `bl1op` (content) “Free from longing, finding no pleasure in the world’s sport, love, or ”
- `47.28`: `bl1kz` (content) ““Now suppose that a man is bound in prison. As time passes, he eventua”; `bl1oq` (content) “Abandoning offspring, spouse, father, mother, riches, grain, relatives”
- `47.29`: `bl1l0` (content) ““Now suppose that a man is a slave, subject to others, not subject to ”; `bl1os` (content) ““This is a bondage, a baited hook. There’s little happiness here, next”
- `47.30`: `bl1l1` (content) ““Now suppose that a man, carrying money and goods, is traveling by a r”; `bl1ot` (content) “Shattering fetters, like a fish in the water tearing a net, like a fir”
- `47.31`: `bl1l2` (content) ““In the same way, when these five hindrances are not abandoned in hims”; `bl1ox` (content) “Eyes downcast, not footloose, senses guarded, with protected mind, not”
- `47.32`: `bl1l4` (content) ““Quite withdrawn from sensual pleasures, withdrawn from unskillful men”; `bl1oz` (content) “Taking off the householder’s marks, like a coral tree that has shed it”
- `47.33`: `bl1l5` (content) ““This, too, is called the miracle of instruction.””; `bl1p0` (content) “Showing no greed for flavors, not careless, going from house to house ”
- `47.34`: `bl1l6` (content) ““Furthermore, with the stilling of directed thought and evaluation, he”; `bl1p1` (content) “Abandoning barriers to awareness, expelling all defilements — all — no”
- `47.35`: `bl1l7` (content) ““This, too, is called the miracle of instruction.””; `bl1p2` (content) “Turning your back on pleasure and pain, as earlier with sorrow and joy”
- `47.36`: `bl1l8` (content) ““And furthermore, with the fading of rapture, he remains in equanimity”; `bl1p4` (content) “With persistence aroused for the highest goal’s attainment, with mind ”
- `47.37`: `bl1l9` (content) ““This, too, is called the miracle of instruction.””; `bl1p6` (content) “Not neglecting seclusion, absorption, constantly living the Dhamma in ”
- `47.38`: `bl1la` (content) ““And furthermore, with the abandoning of pleasure and stress — as with”; `bl1p7` (content) “Intent on the ending of craving and heedful, learned, mindful, not mud”
- `47.39`: `bl1lb` (content) ““This, too, is called the miracle of instruction.””; `bl1p9` (content) “Un-startled, like a lion at sounds. Un-snared, like the wind in a net.”
- `47.40`: `bl1ld` (content) ““With his mind thus concentrated, purified, and bright, unblemished, f”; `bl1pa` (content) “Like a lion — forceful, strong in fang, living as a conqueror, the kin”
- `47.41`: `bl1le` (content) ““This, too, is called the miracle of instruction.””; `bl1pc` (content) “At the right time consorting with the release through good will, compa”
- `47.42`: `bl1lg` (content) ““With his mind thus concentrated, purified, and bright, unblemished, f”; `bl1pe` (content) “Having let go of passion, aversion, delusion; having hattered the fett”
- `47.43`: `bl1lh` (content) ““This, too, is called the miracle of instruction.””; `bl1pg` (content) “People follow and associate for a motive. Friends without a motive the”
- `55.2`: `bl1sd` (content) ““He should respect his elders and not be envious of them. He should kn”; `bl1se` (content) ““When the time is right let him go to his teacher’s presence, unassumi”
- `59.1`: `bl1tf` (content) “I heard thus:”; `bl1ui` (content) “Now at that time a certain monk was sick with dysentery. He lay fouled”
- `64.1`: `bl1ww` (content) “I have heard this:”; `bl1x4` (content) “Whoever put this Sutta together must have been deeply imbued with the ”

**Header numbers colliding with another block** (65)

- `2.2`: `bl3w` (content) “Shariputra, form does not differ from emptiness; emptiness does not di”; `bl8b` (header) “On the Factors for Awakening”
- `5`: `bl8g` (header) “Conscience”; `bl8h` (header) “Samyutta Nikáya I. 18”; `bl8x` (header) “Hiri Sutta”
- `6`: `bl8y` (header) “(On Friendship)”; `bl8z` (header) “Sutta Nipata II.3”; `bl96` (header) “Hita Sutta”
- `7`: `bl97` (header) “Benefit”; `bl9c` (header) “Iddhipada Vibhanga Sutta”
- `8`: `bl9d` (header) “Analysis of the Bases of Power”; `bla0` (header) “Ina Sutta”
- … 60 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `56.2`: `bl1sl` (lead-in) “Being asked, please explain this to me.”; `bl1sr` (content) “The Buddha:”
- `57.1`: `bl1t2` (lead-in) “I heard thus:”; `bl1t3` (content) “At one time the Blessed One lived in Kusinaaraa, in a stretch of fores”
- `60.1`: `bl1v6` (lead-in) “Thus have I heard:”; `bl1v7` (content) “On one occasion the Blessed One was living in the Koliyan country: the”
- `65.1`: `bl1ye` (lead-in) “Thus have I heard:”; `bl1yf` (content) “The Blessed One once, when going on a tour through Magadha, with a gre”

### Unfolding Destiny (`unfolding_destiny_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (51)

- `1.4.3`: `bl4d` (content) “Dearest brethren and sisters in ‘Abdu’l-Bahá,”; `bl4f` (content) “I am much pleased and gratified to hear of the wonderful progress of t”
- `1.10.5`: `bl6m` (content) “My dear fellow-worker,”; `bl6o` (content) “Your brother, Shoghi”
- `1.20.8`: `bl9b` (content) “My most precious fellow-worker,”; `bl9d` (content) “I am your true and affectionate brother, Shoghi”
- `1.27.5`: `blb0` (content) “My dear self-sacrificing brother,”; `blb2` (content) “Your grateful brother, Shoghi”
- `1.36.6`: `bld8` (content) “My dear and valued friend:”; `blda` (content) “Lovingly, Shoghi”
- `1.40.7`: `ble9` (content) “My dear fellow-worker,”; `bleb` (content) “I will remember their needs and difficulties in my prayers at the Holy”
- `1.41.4`: `blej` (content) “My dear fellow-worker,”; `blel` (content) “Assuring you of my earnest prayers for your continued and unsparing ef”
- `1.47.5`: `blgc` (content) “With all best wishes to yourself.”; `blge` (content) “P.S. I have just remembered I have said nothing about the London area ”
- `1.47.6`: `blgd` (content) “Your sincere friend in His service, Ethel Rosenberg”; `blgf` (signature) “Yours ever, E. Rosenberg”; `blgg` (content) “Shoghi Effendi emphatically urges that the 19 friends elected as deleg”
- `1.47.7`: `blgh` (content) “Read and approved. Shoghi”; `blgj` (content) “From December 1926 to April 1927, while the secretary who was then hel”
- `1.47.8`: `blgi` (content) “Editor’s Note:”; `blgk` (content) “It is the only one from Miss Rosenberg which carried the handwriting o”
- `1.80.5`: `blmv` (content) “With best wishes for Mr. Slade and yourself, Yours in His Service,”; `blmx` (content) “May the Almighty bless richly your continued and self-sacrificing ende”
- `1.87.7`: `blp3` (content) “Dear and valued co-worker:”; `blp5` (content) “Praying for your success and protection.”
- `1.119.6`: `blwj` (content) “Dear and trusted co-worker,”; `blwl` (content) “With a heart filled with pride and gratitude I pray continually for th”
- `1.152.10`: `bl13h` (content) “Dearly beloved co-workers,”; `bl13j` (content) “With a heart brimful with love and gratitude, I will, when visiting th”
- `1.155.7`: `bl142` (source) “[From the Guardian:]”; `bl144` (content) “I am thrilled by the recent evidences of the noble determination of th”; `bl3xf` (content) “1941 (Summer School)”
- `1.155.8`: `bl143` (content) “Dear and prized co-workers,”; `bl3xs` (content) “Overjoyed success attending ever expanding institutions Faith. Continu”
- `1.168.9`: `bl16z` (content) “Dear and valued co-workers,”; `bl173` (content) “Appreciate message reciprocate loving greetings thankful divine protec”
- `1.179.12`: `bl19a` (content) “Dear and valued co-workers,”; `bl19e` (content) “Appreciate greetings praying great victories opening century.”
- `2.29.14`: `bl1f5` (content) “Dear and valued co-workers,”; `bl1f7` (content) “The Faith is too circumscribed at present, its resources too limited, ”
- `2.30.1`: `bl1fb` (content) “National Youth Committee”; `bl1fd` (content) “Your letter dated May 16th and written on behalf of the National Youth”
- `2.30.2`: `bl1fc` (content) “Dear Bahá’í Sister,”; `bl1fe` (content) “He is very happy to see that the Bahá’í Youth of the British Isles are”
- `2.38.1`: `bl1gu` (content) “National Youth Committee”; `bl1gw` (content) “Your letter of September 19th was received, and our beloved Guardian h”
- `2.38.2`: `bl1gv` (content) “Dear Bahá’í Sister,”; `bl1gx` (content) “This is an important new undertaking, and must be established as a fir”
- `2.45.10`: `bl1i3` (content) “Dear and valued co-workers,”; `bl1i5` (content) “The Bahá’ís of the British Isles are now, slowly, laboriously and in s”
- `2.52.16`: `bl1jm` (content) “Dear and valued co-workers,”; `bl1jo` (content) “The Plan itself when consummated will signalise the opening of a new e”
- `2.60.1`: `bl1ks` (content) “The National Bahá’í Youth Committee of the British Isles”; `bl1ku` (content) “Your letter to our beloved Guardian, dated August 21st, as well as the”
- `2.60.2`: `bl1kt` (content) “Dear Bahá’í Friends,”; `bl1kv` (content) “He is very happy to hear of the formation of the new Youth Groups you ”
- `2.65.11`: `bl1m8` (content) “Dear and valued co-workers,”; `bl1ma` (content) “A staggering responsibility rests on the shoulders of those who have b”
- `2.75.18`: `bl1nx` (content) “Dear and valued co-workers,”; `bl1nz` (content) “The establishment of the structural basis of the Administrative Order ”
- `2.87.12`: `bl1pp` (content) “Dearly-beloved friends and co-workers,”; `bl1pr` (content) “Theirs is the unrivalled opportunity, should they bestir themselves, t”
- `2.95.12`: `bl1r3` (content) “Dear and valued co-workers:”; `bl1r5` (content) “The Bahá’í world, in its entirety, is struck with amazement at the qua”
- `2.104.11`: `bl1so` (content) “Dear and valued co-workers,”; `bl1sq` (content) “The required number of pioneers who must arise, while there is yet tim”
- `3.4.22`: `bl1x1` (content) “Dear and valued co-workers,”; `bl1x3` (content) “So magnificent an achievement has, no doubt, endowed the entire commun”
- `3.20.18`: `bl1zw` (content) “Dear and valued co-workers,”; `bl1zy` (content) “The despatch of the first pioneer to Tanganyika, signalising the inaug”
- `3.35.17`: `bl22c` (content) “Dear and valued co-workers,”; `bl22e` (content) “A little over half-a-century ago, this community, now invested with a ”
- `3.58.20`: `bl274` (content) “Dear and valued co-workers,”; `bl276` (content) “In the conduct of this world-encompassing task, so vast in scope, so t”
- `4.52.27`: `bl2kb` (content) “Dear and valued co-workers,”; `bl2kd` (content) “Called into being through the dispensations of a watchful Providence, ”
- `4.78.26`: `bl2oy` (content) “Dear and valued co-workers,”; `bl2p0` (content) “The historic triumph achieved as a result of the successful prosecutio”
- `4.106.25`: `bl2tz` (content) “Dear and valued co-workers,”; `bl2u1` (content) “Its sister communities in both the East and the West, and particularly”
- `4.127.20`: `bl2yg` (content) “Dear and valued co-workers,”; `bl2yi` (content) “This present and crucial year must be signalised in the annals of Brit”
- `5.3.6`: `bl305` (content) “With Bahá’í Love,”; `bl308` (content) “I was so pleased and grateful to receive your message, and I wish to a”
- `5.4.6`: `bl30i` (content) “With warmest greetings to you all, Yours in His service,”; `bl30l` (content) “I wish to add a few words in person and assure every one of you of my ”
- `5.6.4`: `bl317` (content) “With Bahá’í love,”; `bl31a` (content) “I was so pleased and grateful to receive your welcome letter, and the ”
- `5.8.5`: `bl31x` (content) “Assuring you of his loving prayers, With warmest greetings,”; `bl31z` (content) “May the Almighty bless, guide, and sustain you and your dear co-worker”
- `5.18.6`: `bl359` (content) “My Dear co-worker,”; `bl35b` (content) “With my best wishes to your dear relatives,”
- `5.20.14`: `bl365` (content) “With Bahá’í love,”; `bl367` (content) “May the Almighty bless your efforts, guide and sustain you in your act”
- `5.22.6`: `bl36t` (content) “With Bahá’í love,”; `bl36w` (content) “I was pleased to hear from you and receive the assurance of your love,”
- `5.24.7`: `bl37j` (content) “With Bahá’í love,”; `bl37l` (content) “May the Beloved bless your efforts in the service of our beloved Faith”
- `5.25.6`: `bl37v` (content) “With Bahá’í love,”; `bl37y` (content) “Your message cheered my heart, and I wish to assure you that I greatly”
- `b.1`: `bl3db` (content) “These biographies appear strictly in the order the names first appear ”; `bl3pv` (header) “Dr. John E. Esslemont, Hand of the Cause of God”; `bl3px` (content) “Born in 1874 and accepted the Faith in early 1915, Dr. Esslemont was e”

**Header numbers colliding with another block** (73)

- `1`: `bl30` (header) “The Seeds Are Tended 1922–1944”; `bl3xg` (signature) “Your true brother, Shoghi”
- `3.3`: `bl1vy` (signature) “Shoghi”; `bl1w7` (header) “Letter of 9 June 1950”
- `6.1`: `bl2z8` (content) “The Assemblies are listed in alphabetical order but their letters are ”; `bl3ap` (header) “Letter of 25 November 1949”
- `6.2`: `bl2z9` (content) “Belfast Bristol Cardiff Dublin Eccles Edinburgh Glasgow Leeds Liverpoo”; `bl3at` (header) “Letter of 22 April 1950”
- `b.2`: `bl3py` (header) “Edward Theodore Hall”; `bl3q0` (content) “First heard of the Faith in 1910 in the Salford, Lancashire area and w”
- … 68 more in the TSV

**Signature / closing lines carrying a number** (67)

- `i.2`: `bl3x5` (signature) “Shoghi”; `bl2w` (content) ““…The annals of the British Bahá’í community, small in numbers, yet un”
- `1.8.8`: `bl5v` (content) “My dear friend,”; `bl5x` (signature) “Shoghi”
- `1.18.5`: `bl8o` (content) “My dearest friend,”; `bl8q` (signature) “Shoghi”
- `1.19.5`: `bl8y` (content) “My dear fellow-worker,”; `bl90` (signature) “Affectionately, Shoghi”
- `1.23.5`: `bla3` (content) “My precious fellow-worker,”; `bla5` (signature) “Your true brother, Shoghi”
- … 62 more in the TSV

**Source / citation lines carrying a number** (109)

- `1.7.6`: `bl5h` (source) “[From the Guardian:]”; `bl5k` (content) “Your brother, Shoghi”
- `1.8.7`: `bl5u` (source) “[From the Guardian:]”; `bl5w` (content) “I enclose a copy of my recent letter to the National Spiritual Assembl”
- `1.10.4`: `bl6l` (source) “[From the Guardian:]”; `bl6n` (content) “I always look forward with keen anticipation to any news from England ”
- `1.18.4`: `bl8n` (source) “[From the Guardian:]”; `bl8p` (content) “I wish to add a few words of assurance and sympathy in view of the hea”
- `1.19.4`: `bl8x` (source) “[From the Guardian:]”; `bl8z` (content) “I trust that the prolonged visit of Dr. Esslemont will prove to be in ”
- … 104 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (233)

- `1.1.1`: `bl33` (lead-in) “Dear Fellow-workers in the Cause of Bahá’u’lláh,”; `bl34` (content) “It is with words of regret and disappointment that I desire to open th”
- `1.2.2`: `bl3p` (lead-in) “My dearest brethren and sisters in the faith of God!”; `bl3q` (content) “May I at the very outset of this, my very first letter to you, convey ”
- `1.3.2`: `bl41` (lead-in) “Dearest Friends,”; `bl42` (content) “I have during the last few days been waiting eagerly for the first wri”
- `1.5.1`: `bl4p` (lead-in) “Dear Spiritual Brother,”; `bl4q` (content) “Your letter to Shoghi Effendi has been received and was read by him wi”
- `1.6.2`: `bl4y` (lead-in) “My dearly-beloved fellow-workers in the Vineyard of God!”; `bl4z` (content) “I am in receipt of your letter dated Nov. 17th 1923, and forwarded to ”
- … 228 more in the TSV

### Messages to the Indian Subcontinent (`messages_to_the_indian_subcontinent_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (47)

- `1.2`: `bl3s` (content) “Beloved co-workers in the Vineyard of God!”; `bl3u` (content) “What an alluring field of service India with all its possibilities unf”
- `1.1`: `bl3t` (content) “It has been my great pleasure and privilege to send you, since my retu”; `bl4m` (lead-in) “Mr. N. R. Vakíl, Mr. M. U. Abasi, Mr Hashmatu’llah, Ḥájí Aḥmad, Mr. A.”; `bl4n` (content) “Care of the Secretary, Dr. Kaushal Kishore, India.”
- `6.1`: `bl55` (content) “The beloved of the Lord and the handmaids of the Merciful in Mandalay,”; `bl57` (content) “The detailed report I have recently received from the tried and faithf”
- `7.1`: `bl5g` (content) “Mr. N. R. Vakíl, B. A. L. L. B. Hawadia, Chakale, Surat, India.”; `bl5i` (content) “Your letter of June 6th, written to our dear Shoghi Effendi, with the ”
- `9.1`: `bl5s` (content) “To the beloved of the Lord and the handmaids of the Merciful throughou”; `bl5u` (content) “It is a great pleasure and privilege for me to renew the bonds of fell”
- `10.1`: `bl63` (content) “To the members of the National Spiritual Assembly of India and Burma.”; `bl66` (content) “I have received your letter dated December 6th, 1923, and am glad to l”
- `14.1`: `bl6z` (content) “To my honoured friends, the editors and publishers of “The Dawn.” [pg ”; `bl71` (content) “I have read the recent issues of “The Dawn” which you have been so kin”
- `17.1`: `bl7r` (content) “[To N.R. Vakíl]”; `bl7t` (content) “Shoghi Effendi has asked me to thank you for your kind letter of 2nd A”
- `18.1`: `bl88` (content) “Alláh’u’Abhá”; `bl8a` (content) “Your loving letter of 9th April brought joy to the heart of our Belove”
- `19.1`: `bl8h` (content) “To the maid servant of God Halimeh (Pali-Ama-Ma-Myaing) c/o S. M. Roum”; `bl8j` (content) “Shoghi Effendi was much touched by the receipt of your kind letter of ”
- `29.1`: `blah` (content) “Mr. and Mrs. Pritam Singh College of Commerce, Cawnpore.[pg 28]”; `blaj` (content) “This is to acknowledge the receipt of your letter dated June 24th to S”
- `36.1`: `blc7` (content) “[To N.R. Vakíl][pg 34]”; `blc9` (content) “I thank you so much in behalf of our dear Guardian for your letters of”
- `62.1`: `bli8` (content) “URGENT The National Spiritual Assembly of India and Burma.[pg 57]”; `blia` (content) “I write in behalf of the Guardian to remind you that the next issue of”
- `79.1`: `bllx` (content) “[To The Local Spiritual Assembly Of Mandalay][pg 68]”; `bllz` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your joint lett”
- `83.1`: `blmx` (content) “[To N.R. Vakíl]”; `blmz` (content) “Your letter of 22/6/1931 was received and the Guardian charged me to e”
- `84.1`: `bln8` (content) “[To N.R. Vakíl]”; `blna` (content) “I am charged by Shoghi Effendi to acknowledge on his behalf the receip”
- `85.1`: `blnl` (content) “[To Siyyid Muṣṭafá Rumi]”; `blnn` (content) “I am directed by Shoghi Effendi to acknowledge on his behalf the recei”
- `86.1`: `blnz` (content) “[To Siyyid Muṣṭafá Rumi]”; `blo1` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `90.1`: `bloz` (content) “[To Siyyid Muṣṭafá Rumi]”; `blp1` (content) “One of the interests of Shoghi Effendi at present is to have the book ”
- `95.1`: `blqd` (content) “[To Siyyid Muṣṭafá Rumi]”; `blqf` (content) “Shoghi Effendi was very glad to receive your kind letter of June 13th,”
- `98.1`: `blqw` (content) “[To Siyyid Muṣṭafá Rumi]”; `blqy` (content) “Your message of condolence and sympathy dated July 18th, 1932 … was re”
- `99.1`: `blr4` (content) “[To Siyyid Muṣṭafá Rumi]”; `blr6` (content) “Shoghi Effendi has kindly read your letter of 29th August 1932 and is ”
- `102.1`: `blrz` (content) “[To Siyyid Muṣṭafá Rumi][pg 89]”; `bls1` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `104.1`: `blsg` (content) “[To Siyyid Muṣṭafá Rumi]”; `blsi` (content) “Shoghi Effendi wishes me to acknowledge the receipt of your letter dat”
- `106.1`: `blt2` (content) “[To the National Spiritual Assembly]”; `blt4` (content) “The Guardian wishes me to acknowledge the receipt of your letter dated”
- `108.1`: `bltj` (content) “[To Siyyid Muṣṭafá Rumi]”; `bltl` (content) “The Guardian was very pleased to read your letter of March 6th 1933, b”
- `110.1`: `blu4` (content) “[To N.R. Vakíl]”; `blu6` (content) “Your message of March 24th, 1933 addressed to our beloved Guardian was”
- `111.1`: `bluf` (content) “[To Prof. Pritam Singh]”; `bluh` (content) “I am directed by Shoghi Effendi to inform you of the receipt of your l”
- `112.1`: `blur` (content) “[To N.R. Vakíl]”; `blut` (content) “The Guardian has requested me to send you enclosed a rough copy of a m”
- `113.1`: `blv1` (content) “[To N.R. Vakíl]”; `blv3` (content) “Your letters addressed to the Guardian and dated June 16th and 23rd, a”
- `114.1`: `blve` (content) “[To N.R. Vakíl]”; `blvg` (content) “The Guardian has directed me to acknowledge on his behalf the receipt ”
- `115.1`: `blvp` (content) “[To Siyyid Muṣṭafá Rumi]”; `blvr` (content) “I have been requested by Shoghi Effendi to acknowledge the receipt of ”
- `116.1`: `blw0` (content) “[To Siyyid Muṣṭafá Rumi]”; `blw2` (content) “I have been requested by the Guardian to thank you for your letter dat”
- `117.1`: `blwa` (content) “[To N.R. Vakíl]”; `blwc` (content) “Your letter of September 13th, 1933, addressed to Shoghi Effendi… were”
- `118.1`: `blwk` (content) “[To N.R. Vakíl]”; `blwm` (content) “The Guardian was deeply gratified to receive your welcome letter of No”
- `119.1`: `blwv` (content) “[To The National Spiritual Assembly]”; `blwx` (content) “The Guardian was greatly pleased to read the minutes of the last meeti”
- `120.1`: `blx5` (content) “[To Professor Pritam Singh][pg 108]”; `blx7` (content) “Your welcome letter of December 21st has been duly received, and the G”
- `121.1`: `blxf` (content) “[To Siyyid Muṣṭafá Rumi][pg 110]”; `blxh` (content) “I wish to thank you most warmly on behalf of the Guardian for your let”
- `122.1`: `blxp` (content) “[To Professor Pritam Singh][pg 111]”; `blxr` (content) “Your letter of March 13th addressed to the Guardian has just been rece”
- `128.1`: `blz1` (content) “[To N.R. Vakíl][pg 116]”; `blz3` (content) “On behalf of the Guardian I wish to acknowledge receipt of your letter”
- `134.1`: `bl10f` (content) “[Addressed To Mr. and Mrs. Muḥammad Ishaq]”; `bl10h` (content) “The Guardian was deeply interested and gratified to learn, through Mr.”
- `136.1`: `bl110` (content) “[To Aḥmad Safdar, Pakistan][pg 123]”; `bl112` (content) “The Guardian has just been in receipt of a letter from Siyyid Muṣṭafá ”
- `137.1`: `bl117` (content) “The National Spiritual Assembly of the Bahá’ís of India and Burma.”; `bl119` (content) “The Guardian has directed me to forward to your Assembly the enclosed ”
- `140.1`: `bl124` (content) “[To N.R. Vakíl]”; `bl126` (content) “The Guardian wishes me to thank you for your letter dated July 18th wr”
- `142.1`: `bl12m` (content) “[To N.R. Vakíl][pg 130]”; `bl12o` (content) “I am charged by our beloved Guardian to acknowledge the receipt of you”
- `150.1`: `bl45o` (content) “[To The Bahá’í Youth of Karachi]”; `bl159` (content) “Your welcome and beautifully worded message of greetings and love has ”
- `420.1`: `bl2p0` (content) “[To The Local Spiritual Assembly Of The Bahá’ís of Bangalore]”; `bl2p2` (content) “Your loving letter of Jalál 14, 110, has been received by the beloved ”

**Opening invocations carrying a number** (1)

- `b.10`: `bl3ki` “He is the Glorious, the Most Glorious!”

**Header numbers colliding with another block** (56)

- `1`: `bl3ml` (header) “— 1 —”; `bl3q` (header) “January 9, 1923”; `bl44y` (content) “I am your brother and co-worker, Shoghi Haifa, Palestine”
- `2`: `bl3mk` (header) “— 2 —”; `bl43` (header) “February 5, 1923”; `bl4d` (header) “April 26, 1923”; `bl4k` (header) “June 1, 1923”; `bl4w` (header) “June 1, 1923”; `bl54` (header) “June 2, 1923”
- `7`: `bl3mq` (header) “— 7 —”; `bl5f` (header) “June 20, 1923”
- `###`: `bl5n` (header) “NOVEMBER 26, 1923”; `blds` (header) “November 16, 1927”; `blgt` (header) “March 9, 1929”; `blh1` (header) “March 12, 1929”; `blkc` (header) “May 6, 1930”; `blmf` (header) “January 14, 1931”; `blmm` (header) “June 12, 1931”; `bloa` (header) “January 7, 1932”; `blog` (header) “February 11, 1932”; `bloq` (header) “March 12, 1932”; `bloy` (header) “March 24, 1932”; `blp8` (header) “March 28, 1932”; `blph` (header) “April 5, 1932”; `blpr` (header) “April 12, 1932”; `blq1` (header) “May 31, 1932”; `blqc` (header) “July 10, 1932”; `blqn` (header) “JULY 14, 1932”; `blqr` (header) “JULY 27, 1932”; `blqv` (header) “August 25, 1932”; `blr3` (header) “October 1, 1932”; `blrc` (header) “October 12, 1932”; `blrl` (header) “October 19, 1932”; `blry` (header) “October 26, 1932”; `bls9` (header) “November 19, 1932”; `blsf` (header) “December 6,1932”; `blt1` (header) “February 8, 1933”; `blti` (header) “March 23, 1933”; `bltt` (header) “March 24, 1933”; `blu3` (header) “June 8, 1933”; `blue` (header) “June 13, 1933”; `blv0` (header) “August 6, 1933”; `blvd` (header) “September 10, 1933”; `blvo` (header) “September 10, 1933”; `blvz` (header) “October 5, 1933”; `blw9` (header) “October 27, 1933”; `blwj` (header) “November 26, 1933”; `blwu` (header) “December 27, 1933”; `blx4` (header) “January 2, 1934”; `blxe` (header) “February 19, 1934”; `blxo` (header) “April 10, 1934”; `blxy` (header) “April 11, 1934”; `bly6` (header) “May 29, 1934”; `blyf` (header) “June 2, 1934”; `blyl` (header) “June 5, 1934”; `blyr` (header) “July 11, 1934”; `blz0` (header) “August 13, 1934”; `blz9` (header) “August 20, 1934”; `blzh` (header) “November 3, 1934”; `blzr` (header) “November 20, 1934”; `blzv` (header) “November 25, 1934”; `bl108` (header) “November 27, 1934”; `bl10l` (header) “December 17, 1934”; `bl10z` (header) “January 2, 1935”; `bl116` (header) “January 20, 1935”; `bl11i` (header) “June 27, 1935”; `bl11t` (header) “July 8, 1935”; `bl123` (header) “August 12, 1935”; `bl12a` (header) “October 8, 1935”; `bl12l` (header) “October 14, 1935”; `bl12w` (header) “October 17, 1935”; `bl135` (header) “November 3, 1935”; `bl13f` (header) “November 15, 1935”; `bl13t` (header) “November 15, 1935”; `bl141` (header) “November 22, 1935”; `bl14f` (header) “January 3, 1936”; `bl14q` (header) “March 10, 1936”; `bl156` (header) “April 5, 1936”; `bl15f` (header) “May 1, 1936”; `bl15p` (header) “May 31, 1936”; `bl161` (header) “June 27, 1936”; `bl168` (header) “July 10, 1936”; `bl16e` (header) “July 16, 1936”; `bl16l` (header) “September 5, 1936”; `bl16x` (header) “September 16, 1936”; `bl177` (header) “September 25, 1936”; `bl17f` (header) “September 30, 1936”; `bl17m` (header) “October 22, 1936”; `bl17w` (header) “October 28, 1936”; `bl181` (header) “November 7, 1936”; `bl18b` (header) “November 9, 1936”; `bl18j` (header) “December 7, 1936”; `bl18u` (header) “January 7, 1937”; `bl193` (header) “February 28, 1937”; `bl19i` (header) “April 27, 1937”; `bl19u` (header) “JUNE 25, 1937”; `bl19y` (header) “July 12, 1937”; `bl1aa` (header) “July 17, 1937”; `bl1an` (header) “AUGUST 31, 1937”; `bl1ar` (header) “November 4, 1937”; `bl1ay` (header) “November 7, 1937”; `bl1b7` (header) “December 6, 1937”; `bl1bi` (header) “December 7, 1937”; `bl1bs` (header) “December 13, 1937”; `bl1c4` (header) “March 20, 1938”; `bl1ch` (header) “April 23, 1938”; `bl1cs` (header) “APRIL 28, 1938”; `bl1cw` (header) “April 30, 1938”; `bl1d6` (header) “June 22, 1938”; `bl1df` (header) “July 4, 1938”; `bl1dr` (header) “July 6th,”; `bl1dx` (header) “July 7, 1938”; `bl1e8` (header) “SEPTEMBER 22, 1938”; `bl1ec` (header) “December 1, 1938”; `bl1er` (header) “January 25, 1939”; `bl1f1` (header) “February 13, 1939”; `bl1f6` (header) “February 17, 1939”; `bl1fv` (header) “March 2, 1939”; `bl1g5` (header) “July 2, 1939”; `bl1gj` (header) “November 26, 1939”; `bl1gs` (header) “DECEMBER 5, 1939”; `bl1gw` (header) “December 8, 1939”; `bl1h5` (header) “MARCH 21, 1940”; `bl1hb` (header) “May 14, 1940”; `bl1hk` (header) “October 15, 1940”; `bl1hv` (header) “October 15, 1940”; `bl1i3` (header) “November 15, 1940”; `bl1ib` (header) “November 28, 1940”; `bl1ir` (header) “December 14, 1940”; `bl1j8` (header) “FEBRUARY 24, 1941”; `bl1jd` (header) “FEBRUARY 24, 1941”; `bl1ji` (header) “April 19, 1941”; `bl1jw` (header) “April 30, 1941”; `bl1k7` (header) “June 6, 1941”; `bl1ki` (header) “June 19, 1941”; `bl1kr` (header) “June 19, 1941”; `bl1l3` (header) “June 19, 1941”; `bl1ld` (header) “JUNE 25, 1941”; `bl1lh` (header) “June 29, 1941”; `bl1lt` (header) “July 3, 1941”; `bl1m6` (header) “August 1, 1941”; `bl1mi` (header) “October 5, 1941”; `bl1mt` (header) “October 5, 1941”; `bl1mx` (header) “October 5, 1941”; `bl1n2` (header) “December 16, 1941”; `bl1nf` (header) “December 27, 1941”; `bl1nq` (header) “December 27, 1941”; `bl1oe` (header) “DECEMBER 29, 1941”; `bl1ok` (header) “January 10, 1942”; `bl1oy` (header) “FEBRUARY 22, 1942”; `bl1p2` (header) “FEBRUARY 22, 1942”; `bl1p6` (header) “February 23, 1942”; `bl1ph` (header) “March 15, 1942”; `bl1pu` (header) “March 20, 1942”; `bl1q6` (header) “March 26, 1942”; `bl1qa` (header) “APRIL 22, 1942”; `bl1qe` (header) “May 8, 1942”; `bl1qv` (header) “June 27, 1942”; `bl1r7` (header) “June 27, 1942”; `bl1ri` (header) “JUNE 26, 1942”; `bl1rm` (header) “July 3, 1942”; `bl1ru` (header) “July 3, 1942”; `bl1s5` (header) “JULY 6, 1942”; `bl1s9` (header) “July 27, 1942”; `bl1sl` (header) “July 29, 1942”; `bl1t0` (header) “July 29, 1942”; `bl1tb` (header) “July 29, 1942”; `bl1tm` (header) “JANUARY 2, 1943”; `bl1tq` (header) “JANUARY 13, 1943”; `bl1tu` (header) “JANUARY 13, 1943”; `bl1ty` (header) “January 14, 1943”; `bl1u4` (header) “January 28, 1943”; `bl1uh` (header) “FEBRUARY 27, 1943”; `bl1up` (header) “MARCH 2, 1943”; `bl1ut` (header) “MARCH 12, 1943”; `bl1ux` (header) “APRIL 21, 1943”; `bl1v1` (header) “MAY 1, 1943”; `bl1v5` (header) “May 4, 1943”; `bl1ve` (header) “May 5, 1943”; `bl1vq` (header) “MAY 5, 1943”; `bl1vu` (header) “MAY 6, 1943”; `bl1vz` (header) “MAY 8, 1943”; `bl1w3` (header) “MAY 11, 1943”; `bl1w7` (header) “JUNE 3, 1943”; `bl1wb` (header) “June 22, 1943”; `bl1ws` (header) “JULY 8, 1943”; `bl1ww` (header) “JULY 27, 1943”; `bl1x0` (header) “AUGUST 5, 1943”; `bl1x4` (header) “AUGUST 29, 1943”; `bl1x8` (header) “OCTOBER 7, 1943”; `bl1xc` (header) “OCTOBER 15, 1943”; `bl1xg` (header) “October 26, 1943”; `bl1xt` (header) “NOVEMBER 11, 1943”; `bl1xx` (header) “DECEMBER 3, 1943”; `bl1y1` (header) “DECEMBER 24, 1943”; `bl1y5` (header) “DECEMBER 26, 1943”; `bl1yb` (header) “JANUARY 4, 1944”; `bl1yg` (header) “JANUARY 12, 1944”; `bl1yk` (header) “JANUARY 13, 1944”; `bl1yo` (header) “JANUARY 19, 1944”; `bl1ys` (header) “JANUARY 22, 1944”; `bl1yw` (header) “FEBRUARY 15, 1944”; `bl1z0` (header) “March 19, 1944”; `bl1zb` (header) “MARCH 21, 1944”; `bl1zg` (header) “MARCH 24, 1944”; `bl1zk` (header) “MARCH 31, 1944”; `bl1zo` (header) “APRIL 1, 1944”; `bl1zs` (header) “APRIL 19, 1944”; `bl1zw` (header) “APRIL 22, 1944”; `bl201` (header) “APRIL 25, 1944”; `bl206` (header) “MAY 5, 1944”; `bl20a` (header) “MAY 20, 1944”; `bl20e` (header) “MAY 23, 1944”; `bl20i` (header) “JUNE 15, 1944”; `bl20m` (header) “JUNE 18, 1944”; `bl20q` (header) “JULY 8, 1944”; `bl20u` (header) “August 12, 1944”; `bl219` (header) “JULY 28, 1944”; `bl21d` (header) “AUGUST 23, 1944”; `bl21h` (header) “OCTOBER 30 1944”; `bl21l` (header) “NOVEMBER 6, 1944”; `bl21p` (header) “NOVEMBER 25, 1944”; `bl21t` (header) “December 1, 1944”; `bl223` (header) “DECEMBER 14, 1944”; `bl228` (header) “December 20, 1944”; `bl22n` (header) “FEBRUARY 15, 1945”; `bl22r` (header) “March 28, 1945”; `bl233` (header) “MARCH 11, 1945”; `bl237` (header) “APRIL 2, 1945”; `bl23b` (header) “April 12, 1945”; `bl23n` (header) “APRIL 29, 1945”; `bl23r` (header) “MAY 4, 1945”; `bl23v` (header) “June 26, 1945”; `bl245` (header) “JULY 14, 1945”; `bl249` (header) “July 29, 1945”; `bl24h` (header) “August 9, 1945”; `bl24v` (header) “AUGUST 13, 1945”; `bl24z` (header) “NOVEMBER 7, 1945”; `bl253` (header) “December 18, 1945”; `bl25h` (header) “JANUARY 6, 1946”; `bl25l` (header) “JANUARY 7, 1946”; `bl25p` (header) “JANUARY 8, 1946”; `bl25u` (header) “FEBRUARY 24, 1946”; `bl25y` (header) “March 20, 1946”; `bl26e` (header) “MARCH 22, 1946”; `bl26i` (header) “March 24, 1946”; `bl26n` (header) “April 8, 1946”; `bl26y` (header) “April 8, 1946”; `bl277` (header) “APRIL 24, 1946”; `bl27b` (header) “APRIL 24, 1946”; `bl27f` (header) “APRIL 30, 1946”; `bl27j` (header) “MAY 21, 1946”; `bl27n` (header) “JUNE 7, 1946”; `bl27r` (header) “August 2, 1946”; `bl289` (header) “October 12, 1946”; `bl28r` (header) “JANUARY 14, 1947”; `bl28v` (header) “March 13, 1947”; `bl29a` (header) “APRIL 3, 1947”; `bl29e` (header) “APRIL 5, 1947”; `bl29i` (header) “APRIL 11, 1947”; `bl29m` (header) “APRIL 23, 1947”; `bl29q` (header) “APRIL 27, 1947”; `bl29u` (header) “APRIL 29, 1947”; `bl29y` (header) “May 2, 1947”; `bl2a8` (header) “MAY 4, 1947”; `bl2ac` (header) “May 8, 1947”; `bl2at` (header) “MAY 28, 1947”; `bl2ax` (header) “JUNE 4, 1947”; `bl2b1` (header) “JULY 2, 1947”; `bl2b6` (header) “AUGUST 6, 1947”; `bl2ba` (header) “October 24, 1947”; `bl2bq` (header) “OCTOBER 26, 1947”; `bl2bu` (header) “NOVEMBER 10, 1947”; `bl2by` (header) “NOVEMBER 20, 1947”; `bl2c2` (header) “DECEMBER 19, 1947”; `bl2c7` (header) “DECEMBER 27, 1947”; `bl2cd` (header) “APRIL 1, 1948”; `bl2ci` (header) “APRIL 19, 1948”; `bl2cm` (header) “APRIL 26, 1948”; `bl2cq` (header) “MAY 4, 1948”; `bl2cu` (header) “May 8, 1948”; `bl2dd` (header) “JUNE 18, 1948”; `bl2dj` (header) “JANUARY 7, 1949”; `bl2dn` (header) “MARCH 22, 1949”; `bl2dr` (header) “APRIL 8, 1949”; `bl2dv` (header) “April 9, 1949”; `bl2eh` (header) “MAY 7, 1949”; `bl2em` (header) “MAY 17, 1949”; `bl2eq` (header) “MAY 28, 1949”; `bl2eu` (header) “JUNE 4, 1949”; `bl2ey` (header) “JUNE 9, 1949”; `bl2f2` (header) “JULY 2, 1949”; `bl2f6` (header) “JULY 27, 1949”; `bl2fa` (header) “AUGUST 11, 1949”; `bl2fe` (header) “OCTOBER 15, 1949”; `bl2fi` (header) “November 6, 1949”; `bl2g5` (header) “November 21, 1949”; `bl2gf` (header) “NOVEMBER 25, 1949”; `bl2gj` (header) “December 19, 1949”; `bl2gu` (header) “JANUARY 15, 1950”; `bl2gy` (header) “APRIL 6, 1950”; `bl2h2` (header) “APRIL 19, 1950”; `bl2h6` (header) “MAY 7, 1950”; `bl2ha` (header) “MAY 8, 1950”; `bl2he` (header) “MAY 30, 1950”; `bl2hi` (header) “June 28, 1950”; `bl2i8` (header) “JULY 12, 1950”; `bl2ic` (header) “July 25, 1950”; `bl2im` (header) “AUGUST 1, 1950”; `bl2iq` (header) “September 9, 1950”; `bl2iu` (header) “September 11, 1950”; `bl2j1` (header) “September 30, 1950”; `bl2ja` (header) “NOVEMBER 7, 1950”; `bl2je` (header) “NOVEMBER 12, 1950”; `bl2ji` (header) “DECEMBER 17, 1950”; `bl2jo` (header) “JANUARY 11, 1951”; `bl2js` (header) “MARCH 4, 1951”; `bl2jw` (header) “March 10, 1951”; `bl2kr` (header) “MARCH 21, 1951”; `bl2kv` (header) “APRIL 24, 1951”; `bl2kz` (header) “APRIL 29, 1951”; `bl2l3` (header) “MAY 6, 1951”; `bl2l7` (header) “May 6, 1951”; `bl2lb` (header) “AUGUST 30, 1951”; `bl2lf` (header) “October 16, 1951”; `bl2ly` (header) “NOVEMBER 25, 1951”; `bl2m4` (header) “JANUARY 10, 1952”; `bl2m8` (header) “APRIL 28, 1952”; `bl2mc` (header) “June 15, 1952”; `bl2mo` (header) “June 30, 1952”; `bl2n8` (header) “JUNE 30, 1952”; `bl2nc` (header) “OCTOBER 4, 1952”; `bl2ng` (header) “OCTOBER 12, 1952”; `bl2nk` (header) “OCTOBER 17, 1952”; `bl2no` (header) “OCTOBER 17, 1952”; `bl2ns` (header) “OCTOBER 18, 1952”; `bl2nw` (header) “OCTOBER 18, 1952”; `bl2o0` (header) “OCTOBER 21, 1952”; `bl2o4` (header) “DECEMBER 28, 1952”; `bl2oa` (header) “MARCH 22, 1953”; `bl2oe` (header) “MARCH 27, 1953”; `bl2oi` (header) “APRIL, 1953”; `bl2om` (header) “April 7, 1953”; `bl2ov` (header) “APRIL 22, 1953”; `bl2oz` (header) “April 30, 1953”; `bl2p9` (header) “MAY 2, 1953”; `bl2pd` (header) “May 28, 1953”; `bl2pm` (header) “MAY 31, 1953”; `bl2pq` (header) “June 6, 1953”; `bl2q0` (header) “June 8, 1953”; `bl2qr` (header) “June 8, 1953”; `bl2r2` (header) “JUNE 19, 1953”; `bl2r6` (header) “June 21, 1953”; `bl2s6` (header) “JUNE 24, 1953”; `bl2sa` (header) “JULY 6, 1953”; `bl2se` (header) “JULY 27, 1953”; `bl2si` (header) “JULY 30, 1953”; `bl2sm` (header) “AUGUST 7, 1953”; `bl2sq` (header) “AUGUST 31, 1953”; `bl2su` (header) “SEPTEMBER 5, 1953”; `bl2sx` (header) “SEPTEMBER 29, 1953”; `bl2t1` (header) “OCTOBER 3, 1953”; `bl2t5` (header) “October, 1953”; `bl2tl` (header) “OCTOBER 8, 1953”; `bl2tp` (header) “OCTOBER 12, 1953”; `bl2tt` (header) “OCTOBER 15, 1953”; `bl2tx` (header) “OCTOBER 30, 1953”; `bl2u3` (header) “February 10, 1954”; `bl2u9` (header) “March 1, 1954”; `bl2ug` (header) “MARCH 9, 1954”; `bl2uk` (header) “MARCH 11, 1954”; `bl2uo` (header) “MARCH 16, 1954”; `bl2us` (header) “MARCH 21, 1954”; `bl2uw` (header) “MARCH 26, 1954”; `bl2v0` (header) “MARCH 27, 1954”; `bl2v4` (header) “MARCH 28, 1954”; `bl2v8` (header) “April 1, 1954”; `bl2vg` (header) “APRIL 13, 1954”; `bl2vj` (header) “April 24, 1954”; `bl2vq` (header) “APRIL 28, 1954”; `bl2vu` (header) “May 3, 1954”; `bl2w0` (header) “MAY 4, 1954”; `bl2w4` (header) “May 27, 1954”; `bl2wd` (header) “May 28, 1954”; `bl2wk` (header) “June 8, 1954”; `bl2ww` (header) “June 11, 1954”; `bl2x3` (header) “JULY 5, 1954”; `bl2x6` (header) “July 11, 1954”; `bl2xh` (header) “July 11, 1954”; `bl2xq` (header) “July 22, 1954”; `bl2xx` (header) “July 23, 1954”; `bl2y4` (header) “August 8, 1954”; `bl2yc` (header) “August 15, 1954”; `bl2yi` (header) “August 15, 1954”; `bl2yr` (header) “September 25, 1954”; `bl2z1` (header) “October 4, 1954”; `bl2z8` (header) “October 6, 1954”; `bl2zh` (header) “December 6, 1954”; `bl2zs` (header) “DECEMBER 12, 1954”; `bl2zw` (header) “December 13, 1954”; `bl303` (header) “December 31, 1954”; `bl30g` (header) “January 5, 1955”; `bl30m` (header) “JANUARY 27, 1955”; `bl30q` (header) “February 10, 1955”; `bl30w` (header) “February 12, 1955”; `bl312` (header) “February 20, 1955”; `bl31a` (header) “February 22, 1955”; `bl31i` (header) “February 23, 1955”; `bl31s` (header) “February 27, 1955”; `bl31z` (header) “March 1, 1955”; `bl328` (header) “March 1, 1955”; `bl32f` (header) “MARCH 20, 1955”; `bl32j` (header) “MARCH 25, 1955”; `bl32n` (header) “APRIL 15, 1955”; `bl32q` (header) “APRIL 20, 1955”; `bl32u` (header) “APRIL 26, 1955”; `bl32y` (header) “APRIL 29, 1955”; `bl332` (header) “APRIL 30, 1955”; `bl336` (header) “May 15, 1955”; `bl33e` (header) “May 22, 1955”; `bl33m` (header) “June 10, 1955”; `bl33t` (header) “August 7, 1955”; `bl343` (header) “September 2, 1955”; `bl34d` (header) “September 2, 1955”; `bl34j` (header) “September 23, 1955”; `bl34p` (header) “October 25, 1955”; `bl34w` (header) “October 25, 1955”; `bl354` (header) “November 30, 1955”; `bl35b` (header) “DECEMBER 12, 1955”; `bl35f` (header) “December 15, 1955”; `bl35m` (header) “December 15, 1955”; `bl35t` (header) “December 15, 1955”; `bl361` (header) “December 16, 1955”; `bl368` (header) “December 26, 1955”; `bl36i` (header) “January 27, 1956”; `bl36n` (header) “January 28, 1956”; `bl36t` (header) “JANUARY 29, 1956”; `bl36x` (header) “January 31, 1956”; `bl373` (header) “February 3, 1956”; `bl37a` (header) “March 10, 1956”; `bl37h` (header) “April 1, 1956”; `bl37n` (header) “April 9, 1956”; `bl37s` (header) “APRIL 24, 1956”; `bl37w` (header) “April 27, 1956”; `bl384` (header) “April 27, 1956”; `bl38c` (header) “April 27, 1956”; `bl38l` (header) “APRIL 28, 1956”; `bl38p` (header) “May 6, 1956”; `bl38v` (header) “MAY 16, 1956”; `bl38z` (header) “May 17, 1956”; `bl398` (header) “June 10, 1956”; `bl39f` (header) “June 11, 1956”; `bl39n` (header) “July 27, 1956”; `bl39u` (header) “August 10, 1956”; `bl3a0` (header) “August 25, 1956”; `bl3a9` (header) “August 25, 1956”; `bl3af` (header) “August 27, 1956”; `bl3ak` (header) “September 11, 1956”; `bl3aq` (header) “September 11, 1956”; `bl3ay` (header) “October 26, 1956”; `bl3b5` (header) “November 12, 1956”; `bl3bd` (header) “November 12, 1956”; `bl3bl` (header) “November 16, 1956”; `bl3bt` (header) “November 16, 1956”; `bl3c0` (header) “November 24, 1956”; `bl3cc` (header) “December 5, 1956”; `bl3ck` (header) “December 21, 1956”; `bl3cq` (header) “December 27, 1956”; `bl3d0` (header) “JANUARY 4, 1957”; `bl3d4` (header) “January 11, 1957”; `bl3da` (header) “January 18, 1957”; `bl3dh` (header) “January 19, 1957”; `bl3dp` (header) “January 19, 1957”; `bl3dx` (header) “January 26, 1957”; `bl3e5` (header) “January 27, 1957”; `bl3ec` (header) “February 2, 1957”; `bl3ei` (header) “February 17, 1957”; `bl3eo` (header) “February 23, 1957”; `bl3et` (header) “February 26, 1957”; `bl3f0` (header) “March 3, 1957”; `bl3f7` (header) “March 6, 1957”; `bl3fe` (header) “March 10, 1957”; `bl3fm` (header) “March 14, 1957”; `bl3ft` (header) “March 17, 1957”; `bl3g1` (header) “MARCH 21, 1957”; `bl3g5` (header) “April, 1957”; `bl3gd` (header) “APRIL 16, 1957”; `bl3gh` (header) “APRIL 17, 1957”; `bl3gk` (header) “April 18, 1957”; `bl3gs` (header) “APRIL 21, 1957”; `bl3gw` (header) “APRIL 21, 1957”; `bl3h0` (header) “APRIL 21, 1957”; `bl3h4` (header) “APRIL 26, 1957”; `bl3h8` (header) “May 25, 1957”; `bl3hg` (header) “MAY 25, 1957”; `bl3hk` (header) “June 19, 1957”; `bl3hq` (header) “JULY 8, 1957”; `bl3hu` (header) “June 29, 1957”; `bl3id` (header) “September 4, 1957”; `bl3in` (header) “October 19, 1957”; `bl3iv` (header) “October 20, 1957”; `bl3j3` (header) “OCTOBER 21, 1957”; `bl3j7` (header) “OCTOBER 21, 1957”; `bl3jb` (header) “OCTOBER 28, 1957”; `bl3jf` (header) “OCTOBER 28, 1957”; `bl3jj` (header) “October 30, 1957”; `bl3jp` (header) “November 7, 1957”; `bl3jw` (header) “November 8, 1957”
- `10`: `bl5r` (header) “December 5, 1923”; `bl3mt` (header) “— 10 —”; `bl62` (header) “December 27, 1923”
- … 51 more in the TSV

**Signature / closing lines carrying a number** (2)

- `42.4`: `bl3nr` (content) “General letter in Persian”; `bldy` (signature) “Your true brother, Shoghi.”
- `544.1`: `bl3d1` (content) “REGRET LOSS DEVOTED STEADFAST SELF SACRIFICING[pg 410] HANDMAID FAITH ”; `bl3d2` (signature) “SHOGHI’”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (167)

- `2.1`: `bl45` (lead-in) “Dearly beloved brethren and sisters in ‘Abdu’l-Bahá:”; `bl44x` (content) “How sweet and glorious to remember in these days of strife and turmoil”
- `3.1`: `bl4e` (lead-in) “My Dear Spiritual Brother:[pg 4]”; `bl4f` (content) “Shoghi Effendi was most pleased to receive your letter dated April 13t”
- `5.1`: `bl4x` (lead-in) “The beloved of the Lord and the handmaids of the Merciful in Rangoon, ”; `bl4y` (lead-in) “Dearly beloved brethren and sisters in ‘Abdu’l-Bahá:”; `bl455` (content) “Your most welcome letter has rejoiced my heart, and has redoubled my c”
- `12.1`: `bl6k` (lead-in) “Mr. N.R. Vakíl Hawadia, Chakla, Surat, India.”; `bl6l` (lead-in) “My Dear Bahá’í Brother,”; `bl43f` (content) “Your most spiritual letter of October 24th, addressed to our beloved G”
- `15.1`: `bl7a` (lead-in) “[To N.R. Vakíl]”; `bl7b` (lead-in) “My Dear Bahá’í Brother,”; `bl43g` (content) “Your letter of February 20th addressed to our dear Guardian was very g”
- … 162 more in the TSV

### The Religious Ceremonies and Customs of the Parsees (`abandonment_or_absolute_surrender_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (47)

- `5.13.1`: `blwk` (content) “The word paragnâ comes from para (Avesta para) before or and Sanskrit ”; `bl12e` (content) “The word Visperad is formed from the Avesta words vispa ratavo which h”
- `5.13.2`: `blwl` (content) “This Paragna ceremony consists of the following ceremonies: —”; `bl12f` (content) “The word ‘rad’ is a form of the Avesta word ‘ratu,’ which comes from A”
- `5.13.3`: `blwm` (content) “The Barsom ceremony. 2. The Aiwiyaonghan ceremony. 3. The Urvaram cere”; `bl12g` (content) “From the fact of the division of beings into two classes, the spiritua”
- `5.13.4`: `blwn` (content) “We will describe these different rituals of the Paragna of the Yasna c”; `bl12i` (content) “Of the different parts of the Avesta that treat of the ratus, the prin”
- `5.13.5`: `blwp` (content) “The following are required in a Yazashna-gah for the performance of th”; `bl12j` (content) “The spiritual beings. Ahuramazda and his Amesha Spentas and Yazatas. A”
- `5.13.6`: `blwq` (content) “(A) Khwân [Khwan] or Stone slabs.”; `bl12l` (content) “There is one thing which must be remembered in the consideration of th”
- `5.13.7`: `blwr` (content) “(B) Metallic requisites, known as Astama (Astâmâ) or Alat (Âlâ) i.e., ”; `bl12n` (content) “Thus, the meaning of the word rad or ratu enables us to understand, wh”
- `5.13.8`: `blws` (content) “(a) and (b) Havanim and Lala (Hâvanim and Lâla), i.e., mortar and pest”; `bl12o` (content) “The 24th chapter of the Bundahishn speaks of the different ratus of th”
- `5.13.9`: `blwt` (content) “(C) Organic requisites. Among these are: —”; `bl12p` (content) ““O Zoroastrian Mazdayasnians! Keep your feet, hands, and understanding”
- `5.13.10`: `blwu` (content) “(a) Aiwyaonghana (Aiwyâonghana), the leaf of a date-palm. (b) Urvaram ”; `bl12r` (content) “The Visperad is divided into 23 Kardas (Av. karêta) or sections. It is”
- `5.13.11`: `blwv` (content) “(D) Zaothra or Zor (Zôr), the consecrated water.”; `bl12t` (content) “It appears from the Visperad (3:1), that, at one time, more than two p”
- `5.13.12`: `blww` (content) “(E) Fire and its requisites. Under this head come: —”; `bl12w` (content) “Zaotar ... North, facing the fire-vase before him in the south.”
- `5.13.13`: `blwx` (content) “(a) Fire. (b) Afrinagan (Afarganiun, Afargâniun), a vase to hold the f”; `bl12y` (content) “Havanan ... On the right side of the Zotar or Zoti, in the north-west ”
- `5.13.14`: `blwy` (content) “Of all these requisites the principal that are often referred to as ap”; `bl130` (content) “Atravakhsha ... On the right side of the Zoti and facing the fire, i.e”
- `5.13.15`: `blx0` (content) “In all inner liturgical services, it is enjoined, that the utensils be”; `bl132` (content) “Fraberetar ... On the left side of the Zoti, on the north-east corner.”
- `5.13.16`: `blx1` (content) “Pure clean water is fetched from a well in utensils previously cleaned”; `bl134` (content) “Aberetar ... On the left side of the Zoti and facing the fire, i.e., o”
- `5.13.17`: `blx3` (content) “The Khwan is a stone slab used in the Yazashna-gah. Over it are spread”; `bl136` (content) “Asnatar ... On the right side of the Zoti and between the Zodgâh (i.e.”
- `5.13.18`: `blx4` (content) “(a) Alât no khwân, i.e., the table or slab for the instruments. (b) At”; `bl138` (content) “Rathwishkara ... On the left side of the Zoti and between the Zôd-gah ”
- `5.13.19`: `blx5` (content) “The positions of the slabs in the Yazashna-gah are shown below: —”; `bl13a` (content) “Sraoshavareza ... Opposite to the Zoti and in front of the fire-vase, ”
- `5.13.20`: `blx8` (content) “The Alât Khwân is the Khwân proper, because it serves as a table (Khwâ”; `bl13d` (content) “I give below a diagram to show the positions of the eight priests in t”
- `5.13.21`: `blx9` (content) “All the liturgical instruments and other requisites are arranged on th”; `bl13g` (content) “The Nirangistan seems to be the authority on which the positions for t”
- `5.13.22`: `blxb` (content) “Before all the above plates, cups and other requisites are placed over”; `bl13h` (content) “The Zaota. The word zaotar means one who performs the ceremony from zu”
- `5.13.23`: `blxd` (content) “It seems that the use of stone-slabs as the alât-gâh or the place for ”; `bl13i` (content) “The Hâvanân. It appears that in ancient times, there was a priest whos”
- `5.13.24`: `blxf` (content) “The stone-slab for fire is placed opposite the first Khwân or the Alat”; `bl13j` (content) “The Âtravakhsha. As the word itself shows, his function was to feed (v”
- `5.13.25`: `blxh` (content) “The third stone-slab is a small and round one. It is about 18 inches h”; `bl13k` (content) “The Fraberetâr. The function of this priest was to carry (bar, English”
- `5.13.26`: `blxj` (content) “This is a stone-slab, sufficiently large for the Zaota or the officiat”; `bl13l` (content) “The âberetâr. The function of this priest is to carry (bar) water (ap)”
- `5.13.27`: `blxl` (content) “The fire in the Yazashna-gah, besides being fed ordinarily, is fed wit”; `bl13m` (content) “The Âsnatâr. His function was to wash or clean (snâ, Fr. nâger) the ce”
- `5.13.28`: `blxn` (content) “I will now describe the metallic utensils, which are known as the Âlât”; `bl13n` (content) “The Rathwishkara. He was the priest whose proper function was to do (k”
- `5.13.29`: `blxs` (content) “As the principal ceremony in the Yasna liturgy is the preparation and ”; `bl13o` (content) “(8). Sraosha Vareza. Sraosha Vareza was a priest, who, to a certain ex”
- `5.13.30`: `blxt` (content) “The Lâlô or the pestle is the instrument with which the Haoma twigs ar”; `bl13q` (content) “The Visperad (1:3-9) gives us a list of the prayers which were held in”
- `5.13.31`: `blxv` (content) “The word tashta is the Avesta (Vend., XIX, 8,) tashta (Fr. tasse, Germ”; `bl13s` (content) “Among the list of prayers enumerated by the Visperad, the Staota Yasna”
- `5.13.32`: `blxw` (content) “The tashta or plates used in the ritual are five in number. One is kno”; `bl147` (content) “Among the prayers enumerated by the Visperad, three require a special ”
- `5.13.33`: `blxx` (content) “The fuliâns or the second kind of cups are also five in number. One of”; `bl149` (content) “The prayer is called Ahunwar (Ahuna vairya, Yasna, 19:3) from its seco”
- `5.13.34`: `blxy` (content) “The third is for holding the varas ring. The fourth is for holding som”; `bl14a` (content) “The Ahunwar is the very first prayer which a Zoroastrian child is taug”
- `5.13.35`: `bly0` (content) “The Mah-rui (lit. moon-faced) are two metallic stands about nine inche”; `bl14c` (content) “The following list gives the number of Ahunwars which one can recite i”
- `5.13.36`: `bly2` (content) “The Barsom forms an important part of the liturgical apparatus. In the”; `bl155` (content) “The Ahunwars for these Gathas are recited with a particular Baj, i.e.,”
- `5.13.37`: `bly3` (content) “The number of twigs required differ in different services. The Shayest”; `bl156` (content) “The Shayest ne-Shayest (Chap. 19) gives the following list of the Ahun”
- `5.13.38`: `bly4` (content) “In the ritual, the Barsom twigs or wires are placed on the above-menti”; `bl162` (content) “The later Rivayats give a list, slightly different from that of the Pa”
- `5.13.39`: `bly5` (content) “The second chapter of the Yasna shows that the Barsom was considered t”; `bl17a` (content) “This sacred prayer is made up of three metrical lines each containing ”
- `5.13.40`: `bly6` (content) “According to the Nirangistan, the Barsom ceremony existed in the time ”; `bl18k` (content) “Though it is a small prayer, scholars differ in their translation of i”
- `5.13.41`: `bly8` (content) “The Parsees have three forms of prayers to be recited as grace before ”; `bl18l` (content) “As Ahu (Ahura Mazda or the spiritual Lord) is an independent ruler (be”
- `5.13.42`: `blya` (content) “The Barsom is “identified with the Barhis or sacred grass (Kusha grass”; `bl18n` (content) “The prayer of Ashem Vohu is next to Ahunwar in importance and sanctity”
- `5.13.43`: `blyc` (content) “It appears from the Vendidad (19:18, 19), that the object of performin”; `bl18o` (content) “Such being the importance attached to this prayer, it is the second pr”
- `5.13.44`: `blyd` (content) “In the ritual, the holy water (the zaothra or jôr water) is poured ove”; `bl18p` (content) “Piety is the best good and happiness. Happiness to him who is pious fo”
- `5.13.45`: `blye` (content) “The celebrant is enjoined to look continuously to the Barsom during th”; `bl18r` (content) “This is the third of the three short but most important prayers or for”
- `5.13.46`: `blyg` (content) “The Denkard (Bk. VIII, Chap. 29:16), referring to the Husparum Nask, s”; `bl18s` (content) “Ahura Mazda knows (lit., is the knower of), who among the living is th”
- `2.40.96`: `bl1sc` (content) “Public Gahambars in Bombay.”; `bl1se` (content) “Gahambars, occasions of communial gatherings.”

**Header numbers colliding with another block** (14)

- `1.1`: `bl3d` (header) “Chapter I. Birth Ceremonies and Customs.”; `bl3f` (content) “The ceremonies and customs, that fall under the head of “Socio-Religio”; `bl3j` (header) “I. — Birth Ceremonies and Customs.”
- `1.2`: `bl3g` (content) “I. — Birth Ceremonies and Customs.”; `bl4n` (header) “Chapter II. Marriage Ceremonies and Customs.”
- `1.3`: `bl3h` (content) “II. — Marriage Ceremonies and Customs.”; `bl4o` (header) “Marriage, a good institution, according to Parsee books.”; `bl4r` (header) “To help marriage is a meritorious act.”; `bl7w` (header) “Eki Beki, i.e., odds and even.”; `bl8y` (header) “Chapter III. Funeral Ceremonies and Customs.”
- `1.4`: `bl3i` (content) “III. — Funeral Ceremonies and Customs.”; `bl90` (header) “I. Ceremonies that relate to the disposal of the body.”; `bl9t` (header) “Drawing the Kasha, or the boundary line.”
- `2.5`: `bld2` (header) “Introductory.”; `bldj` (header) “Four kinds of Purification Ceremonies.”; `ble1` (header) “II. Nahn, the second form of purification.”; `bleu` (header) “Chapter V. The Barashnom and the Riman.”
- … 9 more in the TSV

### Messages to Canada (`messagestocanada_v2_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (40)

- `1.2`: `blcc` (content) “— Will and Testament of ‘Abdu’l-Bahá, 11”; `blcz` (content) “It behoves us, now that the signs of that glorious and promised Day ar”
- `2.1`: `blcg` (source) “[From the Guardian:]”; `blci` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout C”; `blck` (content) “Dear friends!”; `bl2zi` (signature) “20 April 1923”; `blri` (content) “Our beloved Guardian has been inexpressibly touched by your letter of ”
- `2.8`: `blcp` (content) “With all good wishes, Your brother and co-worker,”; `blcq` (signature) “Shoghi”; `blry` (content) “Assuring you both of his keenest appreciation of your services in Mont”
- `3.1`: `blct` (source) “[From the Guardian:]”; `blcv` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout t”; `blcx` (content) “My dearly beloved friends!”; `bl2xp` (signature) “[13] December 1923”; `bl1cj` (content) “HEARTS UPLIFTED THANKSGIVING BAHÁ’U’LLÁH EPOCH-MAKING EVENT COMING AGE”
- `3.4`: `bld1` (content) “I am your brother and co-worker,”; `bld2` (signature) “Shoghi”; `bl1cw` (content) “WELCOME ITS CONTINUED ASSOCIATION AMERICAN SISTER COMMUNITY. FERVENTLY”
- `4.1`: `bld4` (source) “[From the Guardian:]”; `bld6` (content) “To the Montreal Assembly”; `bl2zk` (signature) “1 February 1924”; `bl1ye` (content) “OVERJOYED GRATEFUL TRIUMPHANT CONCLUSION FIVE YEAR PLAN MOST MOMENTOUS”
- `5.8`: `bldk` (lead-in) “Your humble brother in His love and service,”; `bldl` (content) “Azízu’lláh S. Bahadur”; `bldn` (content) “My dear Bahá’í sister:”
- `9.4`: `bleu` (signature) “Yours in His Name,”; `blev` (content) “Ruhi Afnan”; `blex` (content) “My dear brother:”
- `12.5`: `blfq` (lead-in) “Your sincere fellow-worker in this great service,”; `blfr` (content) “Ethel J. Rosenberg”; `blft` (content) “My dear co-worker:”
- `13.6`: `blg7` (lead-in) “Your sincere fellow-worker in this great Service,”; `blg8` (content) “Ethel J. Rosenberg”; `blga` (content) “My dear spiritual brother:”
- `14.4`: `blgl` (signature) “Yours in His Service,”; `blgm` (content) “Ruhi Afnan”; `blgo` (content) “My dear and valued co-workers:”
- `15.5`: `blh0` (lead-in) “Your fellow-worker in this great service,”; `blh1` (content) “Ethel J. Rosenberg”; `blh3` (content) “My dear and precious sister in ‘Abdu’l-Bahá,”
- `16.4`: `blhf` (signature) “Yours very sincerely,”; `blhg` (content) “R. Rabbani”; `blhi` (content) “My dear and valued co-worker:”
- `17.5`: `blhv` (lead-in) “Sincerely in His service,”; `blhw` (content) “Soheil Afnan”; `blhy` (content) “My dear co-worker:”
- `18.6`: `blib` (lead-in) “Sincerely in His service,”; `blic` (content) “Soheil Afnan”; `blie` (content) “My dear co-worker:”
- `19.6`: `blir` (lead-in) “Sincerely yours,”; `blis` (content) “Soheil Afnan”; `bliu` (content) “My dear co-worker:”
- `20.6`: `blj7` (lead-in) “Sincerely yours in His service,”; `blj8` (content) “Soheil Afnan”; `blja` (content) “My dear co-worker:”
- `22.6`: `blk0` (lead-in) “Sincerely yours in His service,”; `blk1` (content) “Soheil Afnan”; `blk3` (content) “My dear co-worker:”
- `23.5`: `blkg` (lead-in) “Sincerely yours,”; `blkh` (content) “Soheil Afnan”; `blkj` (content) “My dear and precious co-worker:”
- `24.5`: `blku` (signature) “Yours ever sincerely,”; `blkv` (content) “Ruhi Afnan”; `blkx` (content) “My dear and precious co-worker:”
- `26.5`: `bllq` (content) “With best wishes I remain,”; `bllr` (signature) “Yours ever sincerely,”; `blls` (content) “Ruhi Afnan”
- `31.5`: `bln8` (signature) “Yours ever sincerely,”; `bln9` (content) “Ruhi Afnan”; `blnb` (content) “Dearly-beloved co-workers:”
- `32.6`: `blno` (signature) “Yours in His Service,”; `blnp` (content) “H. Rabbani”; `blnr` (content) “Dear and precious co-workers:”
- `33.4`: `blo2` (signature) “Yours in His Service,”; `blo3` (content) “H. Rabbani”; `blo5` (content) “Dear co-workers:”
- `39.4`: `blq2` (signature) “Yours in His Service,”; `blq3` (content) “H. Rabbani”; `blq5` (content) “Dear and valued co-worker:”
- `42.4`: `blr0` (signature) “Yours in His Service,”; `blr1` (content) “H. Rabbani”; `blr3` (content) “Dear and valued co-worker:”
- `51.5`: `bltw` (signature) “Yours sincerely in His service,”; `bltx` (content) “H. Rabbani”; `bltz` (content) “Dearest Fred:”
- `53.7`: `bluq` (signature) “Yours in His Service,”; `blur` (content) “H. Rabbani”; `blut` (content) “Dear co-worker:”
- `56.5`: `blw1` (lead-in) “Yours most sincerely,”; `blw2` (content) “H. Rabbani”; `blw4` (content) “Dear and prized co-worker:”
- `64.8`: `blyj` (signature) “Yours in His service,”; `blyk` (content) “R. Rabbani”; `blyl` (source) “[From the Guardian:]”; `blym` (content) “Dear and valued co-worker:”
- `68.6`: `bl10b` (signature) “Yours in His service,”; `bl10c` (content) “R. Rabbani”; `bl10d` (source) “[From the Guardian:]”; `bl10e` (content) “Dear and valued co-workers:”
- `78.6`: `bl147` (lead-in) “With Bahá’í love,”; `bl148` (content) “R. Rabbani”; `bl149` (source) “[From the Guardian:]”; `bl14a` (content) “Dear and valued co-worker:”
- `79.5`: `bl14m` (signature) “Yours in His service,”; `bl14n` (content) “R. Rabbani”; `bl14o` (source) “[From the Guardian:]”; `bl14p` (content) “Dear and valued co-workers:”
- `85.6`: `bl16a` (lead-in) “With Bahá’í love,”; `bl16b` (content) “R. Rabbani”; `bl16c` (source) “[From the Guardian:]”; `bl16d` (content) “Dear and valued co-worker:”
- `116.6`: `bl1f7` (signature) “With warmest greetings,”; `bl1f8` (content) “R. Rabbani”; `bl1f9` (source) “[From the Guardian:]”; `bl1fa` (content) “Dear and valued co-workers:”
- `117.6`: `bl1fq` (lead-in) “With Bahá’í love,”; `bl1fr` (content) “Rúhíyyih”; `bl1fs` (source) “[From the Guardian:]”; `bl1ft` (content) “Dear and valued co-worker:”
- `124.6`: `bl1ho` (lead-in) “With Bahá’í love,”; `bl1hp` (content) “R. Rabbani”; `bl1hq` (source) “[From the Guardian:]”; `bl1hr` (content) “Dear and valued co-worker:”
- `140.4`: `bl1mz` (lead-in) “With Bahá’í love,”; `bl1n0` (content) “R. Rabbani”; `bl1n1` (source) “[From the Guardian:]”; `bl1n2` (content) “Dear and valued co-workers:”
- `180.13`: `bl20k` (signature) “With warmest Bahá’í love,”; `bl20l` (content) “R. Rabbani”; `bl20m` (source) “[From the Guardian:]”; `bl20n` (content) “Dear and valued co-workers:”
- `275.13`: `bl2w5` (signature) “With warm Bahá’í love,”; `bl2w6` (content) “R. Rabbani”; `bl2w7` (source) “[From the Guardian:]”; `bl2w8` (content) “Dear and valued co-workers:”

**Header numbers colliding with another block** (50)

- `1`: `blca` (header) ““O My Loving Friends!…””; `blcr` (header) “The Early Years 1923–1937”
- `3`: `blcs` (header) “Letter of 20 April 1923”; `blre` (header) “Letter of 27 June 1937”; `bl1ce` (header) “The Birth of the Independent Canadian Bahá’í Community and the Five Ye”
- `4`: `bld3` (header) “Letter of [13] December 1923”; `blrs` (header) “Letter of 11 August 1937”; `bl1y9` (header) “Canada’s Part in the Ten Year World Spiritual Crusade 1953–1957”
- `5`: `bld9` (header) “Letter of 1 February 1924”; `bls5` (header) “Letter of 11 February 1938”; `bl1ya` (header) “Letter of 19 April 1953”
- `6`: `bldq` (header) “Letter of 4 February 1924”; `blsi` (header) “Letter of 27 February 1938”
- … 45 more in the TSV

**Signature / closing lines carrying a number** (324)

- `p.7`: `blbp` (content) “National Spiritual Assembly of the Bahá’ís of Canada”; `blbq` (signature) “April 1998”
- `1.3`: `blce` (signature) “January 2, 1923”; `bld0` (content) “Our beloved Bahá’í sister, Mrs. May Maxwell, the pioneer of the Cause ”
- `4.2`: `bld8` (signature) “SHOGHI”; `bl1yk` (content) “PROFOUNDLY IMPRESSED MAGNIFICENT VICTORIES LOVE.”
- `6.6`: `ble0` (signature) “Your true brother in His service,”; `ble1` (signature) “Shoghi”
- `7.4`: `ble9` (content) “Your humble brother in His love,”; `blea` (signature) “Azízu’lláh S. Bahadur”
- … 319 more in the TSV

**Source / citation lines carrying a number** (16)

- `f.10`: `blb7` (source) “[From the Guardian:]”; `blb8` (content) ““[The] purchase of the site of the Mother Temple of the Dominion of Ca”
- `f.14`: `blbb` (source) “[From the Guardian]”; `blbd` (content) “Here, we touch with that mystery that ‘Abdu’l-Bahá termed “the secret ”
- `10.1`: `blf1` (source) “[From the Guardian:]”; `blf3` (content) “To the Montreal Assembly”
- `67.8`: `blzx` (content) “R. Rabbani”; `blzy` (source) “[From the Guardian:]”
- `69.8`: `bl10u` (source) “[From the Guardian:]”; `bl10v` (content) “Dear and valued co-worker:”
- … 11 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (238)

- `f.17`: `blbg` (lead-in) “Douglas Martin”; `blbh` (content) “Haifa, 28 February 1998”
- `5.1`: `bldb` (lead-in) “To an individual believer”; `bldc` (content) “My dear Bahá’í Sister,”; `bl2zl` (signature) “4 February 1924”
- `6.1`: `bldr` (source) “[From the Guardian:]”; `bldt` (lead-in) “The beloved of the Lord and the handmaids of the Merciful throughout C”; `bldu` (content) “Esteemed fellow-labourers in the Vineyard of God!”; `bl2vq` (signature) “16 October 1924”
- `7.1`: `ble4` (lead-in) “To an individual believer”; `ble5` (content) “Dear Bahá’í Sister,”; `bl30b` (signature) “January 1926”
- `8.1`: `bled` (lead-in) “To an individual believer”; `blee` (content) “My dear Mr. … :”; `bl30c` (signature) “9 August 1926”
- … 233 more in the TSV

### Book of Common Prayer [King's Chapel] (`book_of_common_prayer_king_s_chapel_cristianity_oca1f9382002c7fa23a00bfba7a67e3579`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (40)

- `1.2.6`: `bl45` (content) “Here, all standing up, the Minister shall say,”; `bl23m` (lead-in) “Answ. Be honour and glory, through Jesus Christ for ever and ever. 1 T”; `bl235` (lead-in) “Min. Praise ye the Lord.”; `bl234` (content) “Answ. the Lord's name be praised.”
- `3.1.2`: `bl1r5` (content) “O magnify the Lord with me, and let us exalt his name together; for wi”; `blby` (content) “Then shall follow the Confession and Prayer, to be said by the Ministe”
- `4.1.1`: `ble6` (content) “Though the Prayers and Thanksgivings which follow, are intended for a ”; `ble8` (content) “O GOD, who hast taught us at all times and in every condition to make ”
- `34.1.2`: `blmv` (content) “JESUS said unto his disciples, Now I go my way to him who sent me, and”; `bl156` (lead-in) “Then shall the Minister take the Child into his hands, and say to the ”; `bl157` (lead-in) “Name this child.”; `bl158` (content) “Then naming it after them, and either dipping it in the water, or spri”
- `40.1.2`: `blov` (content) “THERE was a certain rich man, who was clothed in purple and fine linen”; `bl1ak` (content) “And he may exhort the Sick Person after this Form, or some other.”
- `30.4.5`: `bl12l` (lead-in) “Then shall the Minister first receive the Communion in both kinds hims”; `bl12m` (lead-in) “I take, and eat this in remembrance of Christ;”; `bl12n` (lead-in) “Likewise, when he takes the Cup,”; `bl12o` (content) “I drink this in remembrance of Christ;”; `bl12q` (lead-in) “Take, and eat this in remembrance of Christ.”; `bl12t` (lead-in) “And when the Minister delivereth cup to the people shall say,”; `bl12u` (lead-in) “Drink this in remembrance of Christ.”; `bl12v` (content) “When all have received the Communion, a Psalm or Hymn may be sung; and”
- `37.9`: `bl197` (lead-in) “The Woman shall answer,”; `bl198` (lead-in) “I will.”; `bl199` (content) “Then shall the Minister say,”; `bl19h` (content) “Then shall they loose their hands, and the Man shall give unto the Wom”
- `37.10`: `bl19b` (content) “Then the Minister, receiving the Woman, at her Father’s or Friend’s ha”; `bl19k` (lead-in) “Then the Minister shall say,”; `bl19l` (content) “Let us pray.”
- `37.11`: `bl19f` (content) “Then shall the Woman likewise say after the Minister;”; `bl19n` (content) “Then shall the Minister speak unto the People.”
- `82.1.2`: `bl20y` (content) “For lo, the ungodly bend their bow, and make ready their arrows upon t”; `bl3i9` (content) “And then, instead of the Psalms for the Day of the Month, shall be sai”
- `86.1.1`: `bl1op` (content) “UNTO thee, O Lord, will I lift up my soul; my God, I have put my trust”; `bl3mu` (content) “This Service is to be introduced by the following Address from the Min”
- `86.1.2`: `bl2h1` (content) “For all they who hope in thee, shall not be ashamed; but such as wicke”; `bl3mz` (content) “People.”
- `89.1.5`: `bl26w` (content) “For his wrath endureth but the twinkling of an eye, and in his favour ”; `bl404` (content) “Then shall he read either of the following Prayers.”
- `90.1.2`: `bl29o` (content) “Blessed is the man unto whom the Lord imputeth no sin, and in whose sp”; `bl410` (content) “Then shall the Person who conducts the Service, say:”
- `90.1.3`: `bl295` (content) “For while I held my tongue, my bones consumed away through my daily co”; `bl416` (content) “Then shall he read either of the following Prayers.”
- `91.1.2`: `bl28h` (content) “My soul shall make her boast in the Lord; the humble shall hear thereo”; `bl42l` (content) “Then shall the Person who conducts the Service say;”
- `91.1.4`: `bl290` (content) “I sought the Lord, and he heard me; yea, he delivered me out of all my”; `bl42s` (content) “Then shall he read either of the following Prayers.”
- `92.1.2`: `bl2bk` (content) “For they shall be soon cut down like the grass; and be withered even a”; `bl43z` (content) “Then shall the Person who conducts the Service say;”
- `92.1.3`: `bl2c5` (content) “Put thou thy trust in the Lord, and be doing good; so shalt thou dwell”; `bl443` (content) “Then shall be read either of the following Prayers.”
- `94.1.4`: `bl2cd` (content) “Then will I go unto the altar of God, even unto the God of my joy and ”; `bl476` (content) “Then followeth the Psalm.”
- `96.1.1`: `bl204` (content) “HAVE mercy upon me, O God, after thy great goodness; according to the ”; `bl4ay` (content) “The Instructer shall begin with the following Exhortation in the words”
- `96.1.2`: `bl2et` (content) “Wash me thoroughly from my wickedness; and cleanse me from my sin.”; `bl4b3` (content) “Then shall the Children say;”
- `96.1.3`: `bl2es` (content) “For I acknowledge my faults, and my sin is ever before me.”; `bl4b7` (content) “Then the Children shall say, after the Instructer, the following Praye”
- `108.1.1`: `bl2e3` (content) “O LORD God, to whom vengeance belongeth; thou God, to whom vengeance b”; `bl2ey` (content) “O SING unto the Lord a new song; sing unto the Lord, all the earth.”
- `108.1.2`: `bl326` (content) “Arise thou Judge of the world, and reward the proud after their deserv”; `bl32h` (content) “Sing unto the Lord, and praise his name; be telling of his salvation f”
- `108.1.3`: `bl33q` (content) “Lord, how long shall the ungodly, how long shall the ungodly triumph?”; `bl33c` (content) “Declare his honour unto the heathen, and his wonders unto all the peop”
- `108.1.4`: `bl32w` (content) “How long shall all wicked doers speak so disdainfully, and make such p”; `bl33b` (content) “For the Lord is great, and cannot worthily be praised; he is more to b”
- `108.1.5`: `bl32v` (content) “They smite down thy people, O Lord, and trouble thine heritage.”; `bl32i` (content) “As for all the gods of the heathen, they are but idols; but it is the ”
- `108.1.6`: `bl32u` (content) “They murder the widow and the stranger, and put the fatherless to deat”; `bl32g` (content) “Glory and worship are before him; power and honour are in his sanctuar”
- `108.1.7`: `bl321` (content) “And yet they say, The Lord shall not see; neither shall the God of Jac”; `bl32f` (content) “Ascribe unto the Lord, O ye families of the people, ascribe unto the L”
- `108.1.8`: `bl32s` (content) “Take heed, ye most foolish of men; O ye fools, when will ye understand”; `bl31n` (content) “Ascribe unto the Lord the honour due unto his name; bring offerings, a”
- `108.1.9`: `bl31z` (content) “He who planted the ear, shall he not hear? or he who made the eye, sha”; `bl31m` (content) “O worship the Lord in the beauty of holiness; let the whole earth stan”
- `108.1.10`: `bl31y` (content) “He who chastiseth the nations, shall he not correct you? or he who tea”; `bl32c` (content) “Tell it out among the heathen, that the Lord is King; that it is he wh”
- `108.1.11`: `bl31x` (content) “The Lord knoweth the thoughts of man, that they are but vain.”; `bl32b` (content) “Let the heavens rejoice, and let the earth be glad; let the sea make a”
- `108.1.12`: `bl31w` (content) “Blessed is the man whom thou chastenest, O Lord, and teachest him in t”; `bl31j` (content) “Let the field be joyful and all that is in it; let all the trees of th”
- `108.1.13`: `bl31v` (content) “That thou mayest give him patience in time of adversity, until the pit”; `bl346` (content) “For he cometh, for he cometh to judge the earth; and with righteousnes”
- `149.1.47`: `bl47f` (lead-in) “And at the end of the Lesson he shall say, Here endeth the First Lesso”; `bl48j` (content) “Then shall be said, or sung, the following portion of the 103d Psalm.”; `bl3jl` (content) “THE Lord is full of compassion and mercy, long suffering, and of great”
- `156.1.14`: `bl3o7` (content) “People.”; `bl41j` (content) “ALMIGHTY and eternal God, we, the work of thy hands, and the subjects ”
- `86.2.10`: `bl236` (content) “Minister.”; `bl3ob` (content) “People.”
- `159.1.13`: `bl401` (content) “Then shall the Person who conducts the Service say;”; `bl462` (content) “BLESSED be God, who has brought us safe to the beginning of another ye”

**Opening invocations carrying a number** (1)

- `147.1.15`: `bl3pl` “He is the Lord our God; his judgments are in all the world.”

**Header numbers colliding with another block** (177)

- `1`: `bl2z` (header) “ACCORDING TO THE USE”; `bl30` (header) “Of”; `bl31` (header) “KING’S CHAPEL”; `bl33` (header) “TO THE FIRST EDITION. MDCCLXXXV.”; `bl4hb` (header) “Acts, ix. 1.”; `bl4ik` (header) “PSALM XCIV.”
- `P.2`: `bl39` (header) “PREFACE”; `bl3a` (header) “TO THE EDITION OF MDCCCL.”
- `1.2`: `bl3s` (header) “EXHORTATION.”; `bl6t` (header) “THE COLLECT FOR GRACE.”; `bl6v` (header) “THE LITANY,”; `bl8k` (header) “A PRAYER FOR THE CLERGY AND PEOPLE.”; `bl4dp` (header) “A PRAYER FOR ALL CONDITIONS OF MEN.”; `bl8p` (header) “A GENERAL THANKSGIVING.”; `bl8s` (header) “A CONCLUDING PRAYER.”
- `2`: `bl4b` (header) “Venite, exultemus Domino.”; `bl4p` (header) “Te Deum laudamus.”; `bl5k` (header) “Exaltabo te, Deus. Psalm CXLV.”; `bl67` (header) “Benedictus. St. Luke, I. 68.”; `bl6d` (header) “Jubilate Deo. Psalm C.”; `bl6r` (header) “THE COLLECT FOR PEACE.”; `bl8x` (header) “EVENING PRAYER”
- `11`: `bl9b` (header) “EXHORTATION.”; `bl9w` (header) “Magnificat. St. Luke, I. 46.”; `bla8` (header) “Cantate Domino. Psalm XCVIII.”; `blak` (header) “Nunc dimittis. St. Luke, II. 29.”; `blaq` (header) “Deus misereatur. Psalm LXVII.”; `blb7` (header) “THE COLLECT FOR PEACE.”; `blb9` (header) “THE COLLECT FOR AID AGAINST ALL PERILS.”; `blbb` (header) “A PRAYER FOR RULERS.”; `blbd` (header) “A PRAYER FOR THE CLERGY AND PEOPLE.”; `blbf` (header) “A PRAYER FOR ALL CONDITIONS OF MEN.”; `blbi` (header) “A GENERAL THANKSGIVING.”; `blbm` (header) “A CONCLUDING PRAYER.”; `blgv` (header) “The Sunday after Christmas Day.”
- … 172 more in the TSV

**Signature / closing lines carrying a number** (1)

- `33.3.2`: `bl14k` (content) “After which the Minister shall proceed according to the form before pr”; `bl14l` (signature) “END OF THE COMMUNION.”

**Source / citation lines carrying a number** (1)

- `3.1.1`: `blbr` (content) “The Minister shall begin the Service with the following Sentences of S”; `blbs` (source) “FROM the rising of the sun, unto the going down of the same, the Lord’”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (13)

- `1.1.1`: `bl3f` (lead-in) “At the beginning of Morning Prayer, the Minister shall read one or mor”; `bl1mp` (content) “When the wicked man turneth away from his wickedness which he hath com”
- `1.2.3`: `bl3w` (lead-in) “The People shall answer here, and at the end of every Prayer, Amen.”; `bl4d4` (content) “Then shall the Minister say this Prayer.”
- `1.1.76`: `bl68` (lead-in) “BLESSED be the Lord God of Israel; for he hath visited and redeemed hi”; `bl1st` (content) “And hath raised up a mighty salvation for us, in the house of his serv”
- `1.7.5`: `bl1t6` (lead-in) “Answ. And with thy spirit.”; `bl1tk` (content) “Min. Let us pray.”
- `1.7.6`: `bl1t7` (lead-in) “Answ. And grant us thy salvation.”; `bl1t5` (lead-in) “Min. O God, make clean our hearts within us;”; `bl1tl` (content) “Answ. And take not thy Holy Spirit from us.”
- … 8 more in the TSV

### Kalpa Sūtra (`kalpa_sutra_ocean_jainism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (36)

- `1.5.60`: `blai` (content) “End of the Fifth Lecture.”; `blak` (content) “End of the Life of Mahâvîra.”
- `2.4.17`: `blef` (content) “End of the Life of Rishabha.”; `bleh` (content) “End of the Lives of the Ginas.”
- `10.25`: `bl141` (lead-in) “α. The Tâmraliptikâ Sâkhâ,”; `bl12x` (lead-in) “β. The Kotivarshîyâ Sâkhâ,”; `bl12y` (lead-in) “γ. The Pundravardhanîyâ Sâkhâ, and [pg 289]”; `bl13k` (content) “δ. The Dâsîkharbatikâ Sâkhâ.”; `blfq` (content) “a. Nandanabhadra,”
- `10.26`: `bl12z` (content) “b. Agnidatta,”; `blfr` (content) “b. Upananda,”; `blgj` (content) “a. Ârya Rohana of the Kâsyapa gotra, founder of the Uddeha Gana, which”
- `10.27`: `bl146` (content) “c. Ganadatta,”; `blfs` (content) “c. Tishyabhadra”; `blgk` (content) “α. Udumbarikâ (Pr. Udumbariggiyâ),”; `bl14a` (content) “a. Ârya Indradatta (Pr. Indadinna) of the Kâsyapa gotra,”
- `10.28`: `bl12j` (content) “d. Somadatta.”; `blft` (content) “d. Yasobhadra,”; `blgl` (content) “β. Mâsapûrikâ,”; `bl13w` (content) “[pg 293] b. Priyagantha, founder of the Madhyamâ Sâkhâ,”; `bl14h` (content) “Ârya Datta (Pr. Dinna) of the Gautama gotra, who had two disciples:”
- `10.29`: `blfp` (content) “ii. Ârya Sambhutavigaya of the Mâthara gotra, who had twelve disciples”; `blfu` (content) “e. Sumanobhadra”; `blgm` (content) “γ. Matipatrikâ,”; `bl13u` (content) “c. Vidyâdharagopâla of the Kâsyapa gotra, founder of the Vidyâdharî Sâ”; `bl153` (content) “i. Ârya Sântisenika of the Mâthara gotra, founder of the Ukkanâgarî Sâ”
- `10.30`: `blfv` (content) “f. Manibhadra,”; `blgn` (content) “δ. Pûrnapatrikâ (Pr. Punnapattiyâ, Panna°, Sunna°, or Suvanna°);”; `bl14c` (content) “d. Rishidatta,”; `bl14i` (content) “a. Ârya Senika, founder of the Âryasenikâ Sâkhâ,”; `bl156` (content) “a. Dhanagiri,”
- `10.31`: `blfw` (content) “g. Punyabhadra,”; `blgo` (content) “and into six Kulas:”; `bl14g` (content) “e. Arhaddatta (Pr. Arihadatta).”; `bl13s` (content) “b. Ârya Tâpasa, founder of the Âryatâpasî Sâkhâ,”; `bl15t` (content) “b. Ârya Samita of the Gautama gotra, founder of the Brahmadvîpikâ Sâkh”; `blhm` (content) “i. Ârya Vagrasena, founder of the Aryanâgilâ Sâkhâ,”
- `10.32`: `blfx` (content) “h. Sthûlabhadra of the Gautama gotra,”; `bl14r` (content) “α´. Nâgabhûta,”; `bl14u` (content) “c. Ârya Kubera, founder of the Âryakuberâ Sâkhâ, and”; `bl15s` (content) “c. Ârya Vagra of the Gautama gotra, founder of the Âryavagrâ Sâkhâ,”; `blhn` (content) “ii. Ârya Padma, founder of the Âryapadmâ Sâkhâ,”; `blhp` (content) “Ârya Pushyagiri of the Kausika gotra. [pg 294]”
- `10.33`: `blfy` (content) “i. Rigumati,”; `bl12k` (content) “β´. Somabhûta,”; `bl154` (content) “d. Ârya Rishipâlita, founder of the Âryarishipâlitâ Sâkhâ.”; `blhl` (content) “d. Arhaddatta (Pr. Arihadinna).”; `blho` (content) “iii. Ârya Ratha of the Vatsa gotra, founder of the Âryagayantî Sâkhâ.”; `blhq` (content) “Ârya Phalgumitra of the Gautama gotra.”
- `10.34`: `blfz` (content) “k. Gambû,”; `bl132` (content) “γ´. Ullagakkha (or Ârdrakakkha?),”; `bl15q` (content) “ii. Ârya Simhagiri Gâtismara of the Gautama gotra, who had four discip”; `blhr` (content) “Ârya Dhanagiri of the Vâsishtha gotra.”
- `10.35`: `blg0` (content) “l. Dîrghabhadra, and”; `bl15f` (content) “δ´. Hastilipta (Pr. Hatthiligga),”; `blhs` (content) “Ârya Sivabhûti of the Kautsa gotra.”
- `10.36`: `blg1` (content) “m. Pândubhadra;”; `bl12m` (content) “ε´. Nândika (Pr. Nandigga),”; `blht` (content) “Ârya Bhadra of the Kâsyapa gotra.”
- `10.37`: `blg2` (content) “and seven female disciples:”; `bl12l` (content) “ζ´. Parihâsaka.”; `blhu` (content) “Ârya Nakshatra of the Kâsyapa gotra.”
- `10.38`: `bl12v` (content) “a. Yakshâ,”; `blgq` (content) “[pg 291] b. Bhadrayasas of the Bhâradvâga gotra, who founded the Uduvâ”; `blhv` (content) “Ârya Raksha of the Kâsyapa gotra.”
- `10.39`: `bl12b` (content) “b. Yakshadattâ (Yakshadinnâ),”; `bl128` (content) “α. Kampîyikâ (Pr. Kampiggiyâ),”; `blhw` (content) “Ârya Nâga of the Gautama gotra.”
- `10.40`: `bl13h` (content) “c. Bhûtâ,”; `bl127` (content) “β. Bhadrîyikâ (Pr. Bhaddiggiyâ),”; `blhx` (content) “Ârya Gehila of the Vâsishtha gotra.”
- `10.41`: `bl13i` (content) “d. Bhûtadattâ (Bhûtadinnâ),”; `bl12o` (content) “γ. Kâkandikâ,”; `blhy` (content) “Ârya Vishnu of the Mâthara gotra.”
- `10.42`: `bl13j` (content) “e. Senâ (also Enâ),”; `bl12n` (content) “δ. Mekhalîyikâ (Pr. Mehaliggiyâ);”; `blhz` (content) “Ârya Kâlaka of the Gautama gotra.”
- `10.43`: `bl145` (content) “f. Venâ,”; `blgs` (content) “and into three Kulas:”; `bli0` (content) “Ârya Sampalita and Bhadra, both of the Gautama gotra.”
- `10.44`: `blh1` (content) “g. Renâ.”; `bl12r` (content) “α´. Bhadrayaska (Pr. Bhaddagasiya),”; `bli1` (content) “Ârya Vriddha of the Gautama gotra.”
- `10.45`: `blg5` (content) “i. Arya Mahagiri of the Ailapatya gotra, who had eight disciples:”; `bl12u` (content) “β´. Bhadraguptika,”; `bli2` (content) “Ârya Saṅghapâlita of the Gautama gotra.”
- `10.46`: `blg6` (content) “a. Uttara,”; `bl12t` (content) “γ´. Yasobhadra (Pr. Gasabhadda).”; `bli3` (content) “Ârya Hastin of the Kâsyapa gotra.”
- `10.47`: `blg7` (content) “b. Balissaha, who both together founded the Uttarabalissaha Gana, whic”; `bl12s` (content) “c. Megha.”; `bli4` (content) “Ârya Dharma of the Suvrata gotra.”
- `10.48`: `blg8` (content) “a. Kausambikâ,”; `bl13a` (content) “d. Kâmarddhi (Pr. Kâmiddhi) of the Kundala gotra, who founded the Vesa”; `bli5` (content) “Ârya Simha of the Kâsyapa gotra.”
- `10.49`: `blg9` (content) “β. Sautaptikâ (Pr. Soittiyâ),”; `blfl` (content) “α. Srâvastikâ,”; `bli6` (content) “Ârya Dharma of the Kâsyapa gotra.”
- `10.50`: `blga` (content) “γ. Kautumbinî (or Kundadharî),”; `bl14m` (content) “β. Râgyapâlikâ (Pr. Raggapâliyâ),”; `bli7` (content) “Ârya Sândilya [pg 295]”
- `10.51`: `blgb` (content) “δ. Kandanâgarî.”; `bl140` (content) “γ. Antarañgikâ (Pr. Antariggiyâ),”; `bli8` (content) “Bowing down my head, I pay my reverence to the Sthavira Gambû of the G”
- `10.52`: `blhd` (content) “c. Dhanarddhi (Pr. Dhanaddha),”; `bl13z` (content) “δ. Kshemaliptikâ (Pr. Khemaliggiyâ);”; `bli9` (content) “I prostrate myself before the Sthavira Nandita of Kâsyapa gotra, who i”
- `10.53`: `blfn` (content) “d. Sirarddhi (Pr. Siriddha),”; `blgu` (content) “and into four Kulas:”; `blia` (content) “Then I adore the Kshamâsramana Desiganin of the Kâsyapa gotra, who, st”
- `10.54`: `blij` (content) “e. Kodinya,”; `bl158` (content) “α´. Ganika,”; `blib` (content) “Then I prostrate myself before the Kshamâsramana Sthiragupta of the Vâ”
- `10.55`: `blgf` (content) “f. Nâga,”; `bl143` (content) “β´. Maighika,”; `blic` (content) “Then I adore the Sthavira prince, Dharma, the virtuous Ganin, who stan”
- `10.56`: `blgg` (content) “g. Nâgaputra,”; `bl144` (content) “γ´. Kâmarddhika,”; `blid` (content) “I revere the Kshamâsramana Devarddhi of the Kâsyapa gotra, who wears, ”
- `10.57`: `blgh` (content) “h. Khaluka Rohagupta of the Kausika gotra, founder of the Trairâsika S”; `bl142` (content) “δ´. Indrapuraka.”
- `10.58`: `blgi` (content) “ii. Ârya Suhastin of the Vâsishtha gotra, who had twelve disciples:”; `bl14q` (content) “e. Srîgupta of the Hârita gotra, founder of the Kârana Gana, which was”

**Header numbers colliding with another block** (1)

- `3`: `bl35` (content) “End of the First Lecture.”; `bl4u` (header) “Life of Mahâvîra, Lecture 3”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `1`: `bl124` (header) “KALPA SÛTRA.”; `bl2w` (header) “[pg 216] LIVES OF THE GINAS.”; `bl2x` (header) “[pg 217] LIFE OF MAHÂVÎRA.”; `bl2y` (lead-in) “Obeisance to the Arhats!”; `bl2z` (lead-in) “Obeisance to the Liberated Ones!”; `bl30` (lead-in) “Obeisance to the Religious Guides!”; `bl31` (lead-in) “Obeisance to the Religious Instructors! Obeisance to all Saints in the”; `bl32` (content) “This fivefold obeisance, destroying all sins, is of all benedictions t”
- `10.15`: `blf6` (lead-in) “ii. Ârya Suhastin of the Vâsishtha gotra;”; `blf7` (content) “Susthita and Supratibuddha, surnamed Kotika and Kâkandaka, of the Vyâg”

### Mūlamadhyamakakārikā (`nagarjuna_s_mulamadhyamakakarika_buddhism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (36)

- `1`: `bl2u` (lead-in) “by Nagarjuna”; `bl2v` (content) “Romanization and Literal English Translation of the Tibetan Text”; `bl2x` (signature) “Stephen Batchelor”; `bl30` (header) “Preface”; `bl3v` (content) “No thing anywhere is ever born from itself, from something else, from ”; `bl4p` (content) “Then there is no going in what has gone; there is no going also in wha”; `bl6a` (content) “Seeing and hearing and smelling and tasting and touching, mind are the”; `bl6w` (content) “Apart from the cause of form, form is not perceived. Apart from “form””; `bl7j` (content) “Not the slightest bit of space exists prior to the characteristics of ”; `bl83` (content) “If a desirous one without desire exists before desire, desire would ex”; `bl8v` (content) “If birth were compounded, it would possess the three characteristics [”; `blb1` (content) “One who exists as an actor does not do that which exists as an act. On”; `blc1` (content) “Some say that whatever is involved in seeing, hearing etc. and feeling”; `blcu` (content) “If firewood were fire, actor and act would be one. If fire were other ”; `bldt` (content) “When asked, “is a before-extreme evident?” the great Muni said, “it is”; `bleg` (content) “Some assert that anguish arises from being made by self, made by other”; `blf8` (content) “The Bhagavan said that whatever dharma is deceptive, that is false. Al”; `blfx` (content) “[as] pairs or all [together].”; `blgi` (content) “Whatever essence arose from causes and conditions would be something t”; `blhd` (content) “If it is said that impulses are “samsara”, if they were permanent, the”; `bli2` (content) “Restraining oneself well and loving thoughts that benefit others are t”; `blk3` (content) “If the aggregates were self, it would be possessed of arising and deca”; `bll2` (content) “If the present and the future were contingent on the past, then the pr”; `blli` (content) “If a fruit is born from the combination of cause and conditions and ex”; `bln0` (content) “Passing does not exist without or together with rising. Rising does no”; `bloh` (content) “Not the aggregates, not other than the aggregates; the aggregates are ”; `blpr` (content) “It is said that desire, hatred, stupidity arise from conceptuality; th”; `blrg` (content) ““If all were empty, nothing could come about or perish. It would follo”; `bltr` (content) “If everything were empty, there would be no arising and perishing. Fro”; `blv9` (content) “In order to become again, those obscured by ignorance are moved into d”; `blwc` (content) “Those views such as “I occurred or did not occur in the past,” the wor”
- `a.5`: `bl3j` (content) “The title given in brackets below the title at the head of each chapte”; `bl3o` (content) “Herein lie the Root Verses of the Center called “Intelligence”. In the”; `bl3p` (lead-in) “[Nagarjuna’s homage]”; `bl3q` (content) “/gang gis rten cing ‘brel par ‘byung//’gag pa med pa skye med pa//chad”; `bl3r` (content) “I bow down to the most sublime of speakers, the completely awakened on”
- `2`: `bl3s` (header) “Investigation of Conditions”; `bl3x` (content) “There are four conditions: Causes, objects, immediate and dominant. Th”; `bl4m` (header) “Investigation of Coming and Going”; `bl4r` (content) “Where there is moving, there there is going. Furthermore, because movi”; `bl6d` (content) “Seeing does not see itself. How can what does not see itself see anyth”; `bl6x` (content) “[Ts. 128 gives “the eye etc.” as examples of “form” and “the four elem”; `bl6z` (content) “If there were form apart from the cause of form, it would follow that ”; `bl7l` (content) “A thing without characteristics does not exist anywhere at all. If a t”; `bl86` (content) “If there were no desirous one, how could there be desire? The same fol”; `bl8x` (content) “The three such as birth cannot individually be that which characterise”; `blb3` (content) “One who exists has no activity; [something] would also exist as an act”; `blc3` (content) “If [that] thing is not evident, how can there be seeing etc? Therefore”; `blcw` (content) “[Fire] would burn permanently and would not arise from causes for burn”; `bldv` (content) “For that without beginning [and] end, where can a middle be in that? T”; `blei` (content) “If it were made by self, therefore it would not be contingently arisin”; `blf9` (content) “[The key to this verse lies in the source of the statement of the Budd”; `blfb` (content) “If whatever is a deceptive phenomenon is false, what is deceptive abou”; `blg0` (content) “Likewise desire, desiring and the desired, the remaining afflictions a”; `blgl` (content) “Essences are not contrived and not dependent on anything else.”; `blhf` (content) “If it is said that persons “move around,” if they are non-existent whe”; `bli4` (content) “The great sage has taught all actions to be intention and what is inte”; `blk5` (content) “If the self did not exist, where could what is mine exist? In order to”; `bll4` (content) “If the present and future did not exist there, then how could the pres”; `bllk` (content) “If a fruit is born from the combination of cause and conditions and do”; `bln1` (content) “[The Sanskrit terms sambhava (‘byung ba/rising) and vibhava (‘jig pa/p”; `bln3` (content) “How can passing exist without rising? Is there death without birth? Th”; `blok` (content) “If the buddha depends on the aggregates, he does not exist from an own”; `blps` (content) “[K. 312 reads: “perversions regarding the pleasant and unpleasant (i.e”; `blpu` (content) “Whatever arises in dependence upon the pleasant, the unpleasant and co”; `blri` (content) ““Since the four ennobling truths would not exist, understanding, letti”; `bltt` (content) “If everything were not empty, there would be no arising and perishing.”; `blvc` (content) “Consciousness conditioned by formative impulses enters into destinies.”; `blwe` (content) “Those views such as I will occur or not occur at another time in the f”
- `3`: `bl3z` (content) “The essence of things does not exist in conditions and so on. If an ow”; `bl4t` (content) “How can going be possible within motion? Because motion that is not go”; `bl6f` (content) “The example of fire is not able to fully establish seeing. It, along w”; `bl71` (content) “If a cause of form existed apart from form, it would exist as a cause ”; `bl7n` (content) “Characteristics do not extend to that which has no characteristics; no”; `bl88` (content) “It is not reasonable for desire and the desirous one to arise as co-ex”; `bl8z` (content) “If birth, abiding and perishing had an other characteristic of being c”; `blb6` (content) “If one who does not exist as an actor did that which does not exist as”; `blc5` (content) “What configures/makes known that thing which is present before seeing ”; `blcy` (content) “Because [fire] does not depend on anything else, it would not arise fr”; `bldx` (content) “If birth were before and aging/death after, there would be birth witho”; `blej` (content) “[A difficulty with this entire chapter is to know what bdag (self) ref”; `blel` (content) “If that were other than this and if this were other than that, anguish”; `blfe` (content) “Things have no essential nature because they are seen to change into s”; `blg2` (content) “If the other connects to the other, because the seen and so forth do n”; `blgo` (content) “[For] the essence of the thingness of the other is said to be the thin”; `blhh` (content) “If one moves around in having clung [to something] and then clinging [”; `bli6` (content) “In this respect action spoken of as “intention” is regarded as being t”; `blk7` (content) “Whoever sees the one who does not grasp at me and mine does not see.”; `bll6` (content) “Without being contingent on the past neither can be established. Hence”; `bllm` (content) “If the fruit exists in the combination of cause and conditions, it wou”; `bln5` (content) “How could passing exist together with rising? Death does not exist at ”; `bloj` (content) “[Here and below the sanskrit for brten pa is upadaya (upadana). Only f”; `blom` (content) “It is not tenable for something dependent on other-nature to be self-e”; `blpv` (content) “[Although the Tibetan supports this reading by adding dang before phyi”; `blpx` (content) “The existence or non-existence of self is not established in any way. ”; `blrk` (content) ““Since they would not exist, the four fruits would also not exist. If ”; `bltv` (content) “No letting go, no attainment, no annihilation, no permanence, no cessa”; `blvf` (content) “When name and form develop, the six senses emerge. In dependence upon ”; `blwg` (content) “It is incorrect to say: “I occurred at a time in the past.” Whatever o”
- `4`: `bl41` (content) “There is no activity which has conditions. There is no activity which ”; `bl4v` (content) “For whomever there is going within motion, for him it will follow that”; `bl6h` (content) “When not seeing the slightest thing, there is no act of seeing. How ca”; `bl73` (content) “If form existed, a cause of form would be untenable; if form did not e”; `bl7p` (content) “If characteristics do not extend [to something] , something characteri”; `bl8a` (content) “Identity has no co-existence: something cannot be co-existent with its”; `bl91` (content) “The birth of birth gives birth to the root birth alone. The root birth”; `blb8` (content) “If there were no cause, effect and cause would not be evident. If they”; `blc7` (content) “If it were present even without seeing etc., there would be no doubt t”; `bld0` (content) “Concerning this, if one thinks that while burning it is firewood, if i”; `ble0` (content) “If birth were after and aging/death before, how could there be an unca”; `blem` (content) “[ Ts. 244 is happy with the reading of c-d by Buddhapalita and Sherab ”; `blep` (content) “If anguish were made by one’s own person, who would that person be who”; `blfh` (content) “If there were no essential nature, whose [nature] would it be to chang”; `blg4` (content) “it is invalid for anything simultaneous with something to be other [th”; `blgq` (content) “[There is a problem here with the Tibetan translation from Sanskrit. S”; `blgs` (content) “Apart from an essence and the thingness of the other, what things are ”; `blhj` (content) “And it is in no way feasible that living beings go beyond misery.”; `bli8` (content) “Whatever (1) speech and (2) movements and (3) “unconscious not-letting”; `blk9` (content) “[c-d are omitted on the grounds of their being a reiteration of a-b]”; `blkb` (content) “When one ceases thinking of inner and outer things as self and mine, c”; `bll8` (content) “These very stages can be applied to the other two. Superior, inferior,”; `bllo` (content) “If the fruit does not exist in the combination of cause and conditions”; `bln8` (content) “How could rising exist without passing? Things are never not impermane”; `blop` (content) “If self-nature does not exist, how can there be the existence of other”; `blq0` (content) “These afflictions are someone’s. But that [someone] is not established”; `blrm` (content) ““If those eight beings did not exist, the Community would not exist. S”; `bltx` (content) “Nirvana is not a thing. Then it would follow that it would have the ch”; `blvi` (content) “Just as [it] only arises in dependence on the eye, [visual] form and a”; `blwi` (content) “If you think that that became me, then that-which-is-clung-to would be”
- `5`: `bl43` (content) “Since something is born in dependence upon them, then they are known a”; `bl4w` (content) “Or, following the structure and wording of v. 10: “To claim that there”; `bl4y` (content) “If there were going within motion, it would follow that going would be”; `bl6j` (content) “Seeing does not see; non-seeing does not see. It should be understood ”; `bl75` (content) “Forms which do not have a cause are not at all tenable. Therefore, do ”; `bl7r` (content) “Therefore, something characterized does not exist and characteristics ”; `bl8c` (content) “If the identical were co-existent, [co-existence] would also occur bet”; `bl93` (content) “If your birth of birth gives birth to the root birth, how does that wh”; `blba` (content) “If activity etc. did not appear, dharma and adharma would not be evide”; `blc9` (content) “It is illuminated by them; they are illuminated by it. How could it ex”; `bld2` (content) “Because [fire] is other, it would not connect; if it did not connect, ”; `ble2` (content) “It is not suitable for birth and aging/death to be simultaneous; that ”; `bler` (content) “If anguish arose from another person, how could it be suitable for the”; `blfj` (content) “This itself does not change into something else. The other itself too ”; `blg7` (content) “The other is other in dependence upon the other. Without the other, th”; `blgu` (content) “[When] a thing becomes something else, people say that it is a non-thi”; `blhm` (content) “Impulses that have the properties of being born and dying are not boun”; `blia` (content) “(5) Goodness that arises from enjoyment/use and in the same manner (6)”; `blkd` (content) “Through the ceasing of action and affliction, there is freedom. Action”; `bll9` (content) “[a-b: this means that you could say the same about past and future in ”; `bllb` (content) “Non-dwelling time cannot be apprehended. Since time which can be appre”; `bllq` (content) “If the cause stops once it has given the cause to the fruit, there wou”; `blna` (content) “How could rising exist together with passing? Birth does not exist at ”; `bloo` (content) “[l. a-b cf. 2.c-d: /rang bzhin las ni gang med pa/ /de gzhan dngos las”; `blos` (content) “If there exists a tathagata [who is] not depending on the aggregates, ”; `blq2` (content) “Like [the self apprehended in] the view of one’s own body, the afflict”; `blro` (content) ““If the Community and the Dharma did not exist, how could Buddha exist”; `bltz` (content) “If nirvana were a thing, nirvana would be a conditioned phenomenon. Th”; `blvj` (content) “[Tsongkhapa has a rather tortured way of explaining this; he compares ”; `blvl` (content) “The gathering of the three: eye and [visual] form and consciousness, t”; `blwk` (content) “Were you [to say] that there exists no self apart from that-which-is-c”
- `6`: `bl45` (content) “It is impossible for something that either exists or not to have condi”; `bl50` (content) “If going were twofold, the goer also would be twofold, because going i”; `bl6l` (content) “Without letting go of [seeing] a seer does not exist; in letting go of”; `bl76` (content) “[Ts. 129-30 explains “rung min nyid” as being an added emphasis. To “n”; `bl78` (content) “It is untenable to say, “the fruit is like the cause.” It is also unte”; `bl7t` (content) “If there is not a thing, of what can there be a non-thing? By whom are”; `bl8d` (content) “[grogs med par is translated by K, G [and Gnoli] as “without associati”; `bl8f` (content) “If the different were co-existent, how would desire and the desirous o”; `bl95` (content) “If that which is born from your root birth gives birth to the root, ho”; `blbc` (content) “If there were no fruit, the path of liberation and higher states would”; `blcb` (content) “It is not evident prior to the totality of seeing etc. From among seei”; `bld4` (content) “Just as a woman connects with a man and a man too with a woman, althou”; `ble5` (content) “Why fixate on that birth, that aging/dying, for which the phases of be”; `blet` (content) “If anguish arose [from] another person, who would that other person be”; `blfl` (content) “If this itself changes into something else, milk itself would be curds”; `blg9` (content) “If the other was other than the other, then, without the other, it wou”; `blgx` (content) “Those who view essence, thingness of the other, things and non-things ”; `blho` (content) “And there would be no bondage without clinging. In what situation woul”; `blib` (content) “[This seven-fold division of acts is not traceable to any school of wh”; `blid` (content) “If the action remained until the time of ripening, it would become per”; `blkf` (content) “It is said that “there is a self,” but “non-self” too is taught. The b”; `blld` (content) “If time depended on things, where would time which is a non-thing exis”; `blls` (content) “If the cause stops without having given the cause to the fruit, those ”; `blnc` (content) “How can those that are not established either mutually together or not”; `blou` (content) “If there does not exist a tathagata [who is] not depending on the aggr”; `blq4` (content) “If confusion about the pleasant and unpleasant does not exist from its”; `blrq` (content) ““The existence of actions and fruits, what is not Dharma and what is D”; `blu1` (content) “If nirvana were a thing, how would nirvana not be dependent? There doe”; `blvo` (content) “Due to the condition of feeling, there is craving; one craves for what”; `blwm` (content) “The very that-which-is-clung-to is not the self: it arises and passes ”
- `7`: `bl47` (content) “When things cannot be established as either existent, non-existent or ”; `bl52` (content) “If there were no goer, going would be impossible. If there were no goi”; `bl6n` (content) “Just as it is said that a child emerges in dependence on a father and ”; `bl7a` (content) “Feeling and perception, impulses and mind and all things are comparabl”; `bl7u` (content) “[Ts. 140 understands “a thing” to refer to the obstructive matter of w”; `bl7w` (content) “Therefore, space is not a thing; it is not a non-thing; it is not some”; `bl8g` (content) “[this verse seems to say no more than v.7 below, but says it less neat”; `bl8i` (content) “If desire and the desirous were established as different, because of w”; `bl97` (content) “If that which has not been born is able to give birth to that, that of”; `blbf` (content) “One who exists and does not exist as an actor does not do what exists ”; `blcd` (content) “If it is not evident prior to the totality of seeing etc., how can it ”; `bld6` (content) “If fire and wood eliminated each other, even though fire is something ”; `ble7` (content) “It is not just samsara alone that has no before-extreme, cause and fru”; `bleu` (content) “[Ts. 246 points out that this verse is not found in Buddhapalita or Sh”; `blew` (content) “Since it is not established as made by self, how can anguish have been”; `blfo` (content) “If a bit of the non-empty existed, a bit of the empty would also exist”; `blgb` (content) “Otherness does not exist in the other. Nor does it exist in what is no”; `blgz` (content) “Through knowing things and non-things, the Buddha negated both existen”; `blhr` (content) “If binding existed prior to one who is bound, [that unbound person] wo”; `blif` (content) “The continuum of sprouts and so on clearly emerges from seeds, and fro”; `blkg` (content) “[Tsongkhapa (325) cites the Kasyapaparvrtti as a source here]”; `blki` (content) “That to which language refers is denied, because an object experienced”; `blle` (content) “dus brtag pa zhes bya ba ste rab tu byed pa bcu dgu pa’o // //”; `bllu` (content) “If the fruit were also born at the same time as the combination, it wo”; `blne` (content) “The finished does not rise; the unfinished too does not rise; the fini”; `blov` (content) “[v. 5 &6 mirror each other grammatically - (cf. Skt.) l.c of v. 6 is e”; `bloy` (content) “[Since] there is nothing to be grasped/dependent on, there can be no g”; `blq6` (content) “Colour/shape, sound, taste, tactile sensation, smell and dharmas: thes”; `blrs` (content) “An explanation for that: since you do not understand the need for empt”; `blu3` (content) “If nirvana were not a thing, how could it possibly be nothing? The one”; `blvr` (content) “When there is clinging, the becoming of the clinger fully arises. When”; `blwo` (content) “It is not correct for the self to be other than that-which-is-clung-to”
- `8`: `bl49` (content) “An existent phenomenon is clearly said to have no object at all. If th”; `bl54` (content) “When a goer does not go, a non-goer cannot go; what third one other th”; `bl6p` (content) “Because there is no what-is-seen and no seeing, the four such as consc”; `bl7c` (content) “When having argued by means of emptiness, everything of that one who o”; `bl7y` (content) “Those of small minds see things as existent and non-existent. They do ”; `bl8k` (content) “If one asserts them to be co-existent because they are not established”; `bl98` (content) “[v. 4-7: This is a clear example of another hand interfering with the ”; `bl9a` (content) “Just as lamplight illuminates itself and others, likewise birth too gi”; `blbh` (content) “One who exists as an actor does not do an act which is not existent. O”; `blcf` (content) “If the seer itself [were] the hearer and the feeler [were] it too, if ”; `bld8` (content) “If fire were dependent on wood and wood were dependent on fire, of wha”; `ble9` (content) “feeling and the feeler, whatever is suitable to bear meaning, also all”; `bley` (content) “Anguish is not made [by] self; that is not made by that itself. If it ”; `blfq` (content) “The Conquerors taught emptiness as the forsaking of all views. Those w”; `blgd` (content) “That does not connect with that. The other too does not connect with t”; `blh1` (content) “It is never the case that an essence could become something else.”; `blht` (content) “Those who are bound will not be free. And those who are not bound will”; `blih` (content) “Because continuums are from seedsand fruits emerge from continuums and”; `blkj` (content) “[Tsongkhapa (326) explains that c-d are an answer to the question impl”; `blkl` (content) “Everything is real, not real; both real and not real; neither not real”; `bllw` (content) “If the fruit were born prior to the combination, there would occur an ”; `blng` (content) “Rising and passing do not exist without the existence of things. Thing”; `blp0` (content) “If having examined in five ways, how can that tathagata who does not e”; `blq8` (content) “Colour/shape, sound, taste, tactile sensation, smell and dharmas: thes”; `blru` (content) “The Dharma taught by Buddhas perfectly relies on two truths: the ambig”; `blu5` (content) “If nirvana were nothing, how could nirvana possibly be not dependent? ”; `blvu` (content) “Becoming is the five aggregates; from becoming one is born. Aging, dea”; `blwq` (content) “In that way, it is not other than that-which-is-clung-to nor is it tha”
- `9`: `bl4b` (content) “If phenomena are not born, it is invalid for there to be cessation. Th”; `bl56` (content) “When a goer is impossible without going, then how is it possible to sa”; `bl6r` (content) “It should be understood that seeing explains hearing and smelling and ”; `bl7e` (content) “When having explained by means of emptiness, everything of that one wh”; `bl7z` (content) “khams brtag pa zhes bya ba ste rab tu byed pa lnga pa’o/ // /”; `bl8m` (content) “Since different things are not established, co-existent things are not”; `bl9b` (content) “[“itself and the thing of others” is the clumsy Tibetan form of svapar”; `bl9d` (content) “Wherever lamplight is present there is no darkness. What does lampligh”; `blbj` (content) “One who exists as an actor does not do what does not exist as an act a”; `blci` (content) “If the seer were different, the hearer different, the feeler different”; `blda` (content) “If fire were dependent on wood, [already] established fire would be es”; `blea` (content) “/sngon dang phyi ma’i mtha’ brtag pa zhes bya ste rab tu byed pa bcu g”; `bled` (content) “[Tib. has “Investigation of what is made by me and made by others” whi”; `blf1` (content) “If it is made by each, anguish would be made by both. Not made by self”; `blfr` (content) “[The source here is given by Candrakirti and Tsongkhapa as the Ratnaku”; `blfs` (content) “Tsongkhapa quotes a large chunk of the Kasyapaparivarta (‘od srungs ky”; `blft` (content) “‘du byed brtag pa zhes bya ba ste rab tu byed pa bcu sum pa’o // //”; `blge` (content) “phrad pa brtag pa zhes bya ste rab tu byed pa bcu bzhi pa’o // //”; `blh4` (content) “If essences did not exist, what could become something else? Even if e”; `blhv` (content) ““I, without clinging, am beyond misery. Nirvana is mine.” Those who gr”; `blij` (content) “The continuum of mind clearly emerges from mind, and from that fruits.”; `blkn` (content) “without conceptual thought, without differentiation: these are the cha”; `blly` (content) “If [when] a cause stops, it is forever transferred to the fruit, then ”; `blnj` (content) “Rising and passing are not possible for the empty; rising, passing are”; `blp3` (content) “That which is grasped/depended on does not exist from its own nature. ”; `blqa` (content) “How can the pleasant and unpleasant occur in those [things] which are ”; `blrw` (content) “Those who do not understand the division into two truths, cannot under”; `blu7` (content) “Whatever things come and go are dependent or caused. Not being depende”; `blvx` (content) “mental unhappiness, anxiety: these vividly emerge from birth. Likewise”; `blws` (content) “It is incorrect to say: “I did not occur at a time in the past.” Whate”
- `10`: `bl4d` (content) “Because the existence of essence-less things does not exist, it is inc”; `bl59` (content) “To claim that a goer goes implies that there could be a goer who does ”; `bl6s` (content) “dbang po brtag pa zhes bya ba ste rab tu byed pa gsum pa’o////”; `bl7f` (content) “phung po brtag pa zhes bya ba ste rab tu byed pa bzhi pa’o////”; `bl8o` (content) “In that way, desire and the desirous one are not established as co-exi”; `bl9f` (content) “If, when lamplight is being generated, it does not encounter darkness,”; `blbk` (content) “[Verses 9-11 are suspect. This degree of systematic nit-picking as wel”; `blbn` (content) “One who does not exist as an actor does not do what exists as an act a”; `blcl` (content) “Also it is not evident in the elements from which seeing and hearing e”; `bldc` (content) “If a thing (A) is established dependently (on B), [but] if what it dep”; `blf3` (content) “Not only does anguish alone not have the four aspects, external things”; `blh6` (content) ““Existence” is the grasping at permanence; “non-existence” is the view”; `blhx` (content) “When nirvana is not born and samsara not eliminated, then what is sams”; `blil` (content) “Because continuums are from minds and fruits emerge from continuums an”; `blkq` (content) “Whatever arises dependent on something else is at that time neither th”; `blm0` (content) “How can the production of fruit be produced by the stopping and disapp”; `blnm` (content) “Rising and passing cannot possibly be one; rising and passing also can”; `blp6` (content) “In that way, what is grasped/depended on and what grasps/depends are e”; `blqb` (content) “[K. 317 takes this to mean “how can pleasure or displeasure arise in p”; `blqd` (content) “Something is called “pleasant” in dependence on the unpleasant. Since ”; `blry` (content) “Without relying on conventions, the sublime meaning cannot be taught. ”; `blu9` (content) “The teacher taught [it] to be the letting go of arising and perishing.”; `blw0` (content) “The root of life is formative impulses. Therefore, the wise do not for”; `blwu` (content) “If this were other, it would arise even without that. Likewise, that c”
- `11`: `bl4f` (content) “There is no effect at all in the conditions individually or together. ”; `bl5b` (content) “If the goer goes, it would follow that going would be twofold: that wh”; `bl8p` (lead-in) “[Ts. 153 explains “all phenomena” to refer to hatred and the hater, st”; `bl8q` (content) “‘dod chags dang chags pa brtag pa zhes bya ba ste rab tu byed pa drug ”; `bl8s` (content) “[Skt. title is “investigation of the compounded - samskrta”]”; `bl9h` (content) “If darkness is dispelled even though it does not encounter lamplight, ”; `blbq` (content) “One who neither exists nor does not exist as an actor does not do that”; `blcn` (content) “If that to which seeing and hearing etc. and feeling etc. belong is no”; `blde` (content) “How can a thing (A) which is established dependently (on B) be depende”; `blf4` (content) “bdag gis byas pa dang gzhan gyis byas pa brtag pa zhes bya ba ste rab ”; `blh8` (content) ““Since that which exists by its essence is not non-existent,” is [the ”; `blhy` (content) “bcings pa dang thar pa brtag pa zhes bya ba ste rab tu byed pa bcu dru”; `blin` (content) “The ten paths of white action are the means of practising Dharma. Here”; `blkt` (content) “That ambrosial teaching of the buddhas, those guardians of the world, ”; `blm2` (content) “If cause and fruit are not related, what fruit can be produced? Causes”; `blno` (content) “If you think that you can see rising and passing, rising and passing a”; `blp5` (content) “[cf. v. 8; ‘dogs = prajnapyate]”; `blp8` (content) “Do not say “empty,” or “not empty,” or “both,” or “neither:” these are”; `blqf` (content) “Something is called “unpleasant” in dependence on the pleasant. Since ”; `bls0` (content) “If their view of emptiness is wrong, those of little intelligence will”; `blub` (content) “If nirvana were both a thing and nothing, it would follow that it woul”; `blw1` (content) “[mi mkhas = Skt. avidvan = the ignorant]”; `blw4` (content) “When ignorance stops, formative impulses too do not occur. The stoppin”; `blww` (content) “Cut off and actions wasted, acts committed by others would be experien”
- `12`: `bl4h` (content) “If, although the effect is not there, it is born from those conditions”; `bl5e` (content) “If a beginning of going does not exist in what has gone, [if] a beginn”; `bl9k` (content) “If lamplight illuminated itself and the thing of others, darkness too ”; `blbt` (content) “An actor depends on acts and acts too occur in dependence on an actor.”; `blcp` (content) “Reject the concepts “it exists,” “it doesn’t exist” about that which i”; `bldg` (content) “There is no fire that is dependent on wood; there is also no fire that”; `blh9` (content) “rang bzhin brtag pa zhes bya ba ste rab tu byed pa bco lnga pa’o // //”; `blip` (content) “If it were as that investigation, many great mistakes would occur. The”; `blks` (content) “[Buddhapalita commentary gives: /don gcig min don tha dad min//chad pa”; `blku` (content) “[Buddhapalita commentary: Not the same, not different, not severed, no”; `blkx` (content) “When perfect buddhas do not appear, and when their disciples have died”; `blm4` (content) “The simultaneous connection of a past fruit with a past, a future and ”; `blnq` (content) “Things are not created from things; things are not created from nothin”; `blpa` (content) “Where can the four such as permanence and impermanence exist in this p”; `blqh` (content) “If the pleasant does not exist, how can desire exist? If the unpleasan”; `bls2` (content) “Therefore, knowing how difficult it is for the weak to understand the ”; `blud` (content) “If nirvana were both a thing and nothing, nirvana would not be not-dep”; `blw7` (content) “By the stopping of the former, the latter will clearly not occur. The ”; `blwz` (content) “There is no occurence from what has not occured. In that case faults w”
- `13`: `bl4j` (content) “Effects [are of] the nature of conditions. Conditions do not have own ”; `bl5g` (content) “Before a beginning of going, there is not any motion or anything which”; `bl9m` (content) “How can unborn birth give birth to itself? If the born gives birth, wh”; `blbw` (content) “Likewise, one should understand clinging, because act and actor are di”; `blcq` (content) “snga rol na gnas pa brtag pa zhes bya ba ste rab tu byed pa dgu pa’o /”; `bldi` (content) “Fire does not come from something else; fire also does not exist in wo”; `blir` (content) “I will fully declare the investigation which is taught by the Buddhas,”; `blky` (content) “bdag dang chos brtag pa zhes bya ba ste rab tu byed pa bco brgyad pa’o”; `blm6` (content) “The simultaneous connection of a present fruit with a future, a past a”; `blnt` (content) “Things are not created from themselves, nor are they created from some”; `blpd` (content) “Those who hold the dense apprehension, “the tathagata exists” conceive”; `blql` (content) “If such an apprehension as “the impermanent is permanent” is confused,”; `bls4` (content) “Since [those] erroneous consequences do not apply to emptiness, whatev”; `bluf` (content) “How could nirvana be both a thing and nothing? Nirvana is unconditione”; `blw8` (content) “// srid pa’i yan lag bcu gnyis brtag pa zhes bya ba ste rab tu byed pa”; `blx2` (content) “Therefore, “the self occured, did not occur, both or neither:” all tho”
- `14`: `bl4l` (content) “Therefore, [it does] not have the nature of conditions, nor is there a”; `bl5i` (content) “If a beginning of going is simply not apparent in any way, examine: wh”; `bl9o` (content) “The born and the unborn, the being born do not in any way give birth. ”; `blbx` (content) “byed pa po dang las brtag pa zhes bya ba ste rab tu byed pa brgyad pa’”; `bldk` (content) “Wood itself is not fire; fire is also not something other than wood. F”; `blis` (content) “[The explicit denunciation of v. 12 and the strident certainty of v. 1”; `bliu` (content) “Just like a contract, irrevocable action is like a debt. In terms of r”; `blm8` (content) “The simultaneous connection of a future fruit with a present, a future”; `blnv` (content) “If you assert the existence of things, the views of eternalism and ann”; `blpe` (content) “[Ts. 378-9 says that while this version is found in Chandrakirti’s Pra”; `blph` (content) “For that one empty of own-nature, it is entirely inappropriate to thin”; `blqk` (content) “[Ts. 389 says that the other three confusions (re: happiness, purity a”; `blqn` (content) “If such an apprehension as “the impermanent is permanent” is confused,”; `bls6` (content) “Those for whom emptiness is possible, for them everything is possible.”; `bluh` (content) “How could nirvana exist as both a thing and nothing? Those two do not ”; `blx4` (content) ““I will occur at another time in the future,” “I will not occur:” all ”
- `15`: `bl5k` (content) “When a goer does not stay, a non-goer cannot stay; what third one othe”; `bl9r` (content) “When being born does not arise in what is born, then how can one say “”; `bldm` (content) “Through fire and wood is explained without exception all the stages of”; `bliv` (content) “[nb. “nature” = Skt. prakrti = Tib. rang bzhin]”; `blix` (content) “It is not let go of by letting go, but only let go of by cultivation. ”; `blma` (content) “When there is no connection, how can a cause produce fruit? Even when ”; `blnx` (content) “If you assert the existence of things, eternalism and annihilationism ”; `blpk` (content) “Those who make fixations about Buddha who is beyond fixations and with”; `blqp` (content) “[The means] by which one apprehends, the apprehension [itself], the ap”; `bls8` (content) “You are transferring your own mistakes onto me. This is like mounting ”; `bluj` (content) “The presentation of neither a thing nor nothing as nirvana will be est”; `blx6` (content) “If the divine were human, then there would be something permanent. The”
- `16`: `bl5m` (content) “When a goer is not possible without going, how then is it possible [to”; `bl9t` (content) “Whatever is dependently arising, that is by nature pacified. Therefore”; `bldo` (content) “I do not think those who teach the identity or difference of self and ”; `bliz` (content) “If it perished through being let go of by letting go and the transcend”; `blmc` (content) “If a cause is empty of fruit, how can it produce fruit? If a cause is ”; `blo0` (content) “If the continuity of the rising and passing of cause-effect is becomin”; `blpj` (content) “[K. 310. zad pa med pa = avyaya = non-variable/steadfast]”; `blpm` (content) “Whatever is the own-nature of the tathagata, that is the own-nature of”; `blqr` (content) “If there is neither confused nor right apprehension, who is confused a”; `blsa` (content) “If you view all things as existing from their own nature, then you wou”; `blul` (content) “If nirvana is neither a thing nor nothing, by who could “neither a thi”; `blx8` (content) “If the human were other than the divine, then there would be no perman”
- `17`: `bl5o` (content) “There is no reversal of motion, nor also of what has gone [and] what h”; `bl9u` (content) “[Ts. 174-6 gives a good summary of the identity of dependent arising a”; `bl9w` (content) “If any unborn thing existed anywhere, on being born that [unborn] thin”; `bldp` (content) “me dang bud shing brtag pa zhes bya ba ste rab tu byed pa bcu pa’o //”; `blj1` (content) “The very [irrevocability] of all actions in similar or dissimilar real”; `blmd` (content) “[Ts. 353 appears to read stong in this context as simply “absent”. Thi”; `blmf` (content) “Unempty fruit would not be produced; the unempty would not stop. That ”; `blo2` (content) “If things exist essentially, it would be unreasonable [for them] to be”; `blpn` (content) “de bzhin gshegs pa brtag pa zhes bya ba ste rab tu byed pa nyi shu gny”; `blqt` (content) “Confusions do not occur for those who are [already] confused; confusio”; `blsc` (content) “Cause and effect itself, agents, tools and acts, production and cessat”; `blun` (content) “After the Bhagavan has entered nirvana, one cannot perceive [him? it?]”; `blxa` (content) “If one part were divine and one part were human, there would be both p”
- `18`: `bl5r` (content) “It is inappropriate to say: “going and a goer are the same.” It is ina”; `bl9y` (content) “If that which has been born gives birth to what is being born, what [o”; `blj4` (content) “In the visible world there are two kinds. Actions of all [types] and t”; `blmh` (content) “How would empty [fruit] be produced? And how would the empty stop? It ”; `blo4` (content) “If the end stops, it is unreasonable for there to be a beginning of be”; `blqv` (content) “Confusions do not occur for those who are being confused. For whom do ”; `blse` (content) “Whatever is contingently related, that is explained as emptiness. That”; `bluq` (content) “Even when the Bhagavan is alive, one cannot perceive [him? it?] as “ex”; `blxd` (content) “If both permanence and impermanence were established, you would have t”
- `19`: `bl5t` (content) “If whatever is going were a goer, it would follow that the actor and t”; `bla0` (content) “If another [thing] that has been born gives birth [to it], this would ”; `blj6` (content) “When the fruit is transcendent and when one dies, that ceases. One sho”; `blmi` (content) “[ Ts. 354 gets round this by saying: “How would fruit which is empty o”; `blmk` (content) “It is never possible that cause and fruit are identical. It is never p”; `blo6` (content) “If the beginning is created while the end is stopping, the stopping wo”; `blqx` (content) “If confusions are not born, how can they exist? If confusions are not ”; `blsg` (content) “Because there are no things at all, which are not contingently emergen”; `blus` (content) “Samsara does not have the slightest distinction from Nirvana. Nirvana ”; `blxf` (content) “If something came from somewhere and went somewhere, then samsara woul”
- `20`: `bl5v` (content) “If going and a goer were conceived as different, there could be going ”; `bla2` (content) “Thus it is not reasonable for what exists or does not exist to be born”; `blj8` (content) “Emptiness is not annihilation and samsara is not permanent. The dharma”; `blmm` (content) “If cause and fruit were identical, produce and producer would be ident”; `blo9` (content) “If it is also unreasonable for stopping and creating to be together, a”; `blqz` (content) “Things are not born from themselves, not born from others. If they are”; `blsi` (content) “If all were not empty, nothing could come about or perish. It would fo”; `bluu` (content) “Whatever is the end of Nirvana, that is the end of Samsara. There is n”; `blxh` (content) “If there were nothing permanent at all, what thing could be impermanen”
- `21`: `bl5x` (content) “If things are not established as the same and as different, how can th”; `bla4` (content) “It is not tenable for a thing that is perishing to be born. It is not ”; `blja` (content) “Because actions are not born, in this way they have no nature. Therefo”; `blmo` (content) “If fruit existed essentially, what would a cause produce? If fruit did”; `blob` (content) “Likewise, if the continuity of becoming is not reasonable at any of th”; `blr0` (content) “[K. points out that this verse is missing in Kumarajiva’s translation ”; `blr2` (content) “If self and purity and permanence and happiness were existent, self an”; `blsk` (content) “If things were not contingently emergent, how could anguish exist? Imp”; `bluw` (content) “Views about who passes beyond, ends etc. and permanence etc. are conti”; `blxj` (content) “If this world had an end, how would the next world come to be? If this”
- `22`: `bl5z` (content) “That very going by which a goer is made evident does not [enable a goe”; `bla6` (content) “A thing that has remained does not remain. A thing that has not [yet] ”; `bljc` (content) “If actions existed [by] nature, without doubt they would be permanent.”; `blmp` (content) “[Ts. 354-5 has the same difficulty as in 16-18 with l. c-d. He explain”; `blmr` (content) “If it were not productive, the cause itself would be impossible. If th”; `bloc` (content) “‘byung ba dang ‘jig pa brtag pa zhes bya ba ste rab tu byed pa nyi shu”; `blof` (content) “[For Ts. 370, this and the following chapter on error both serve to “d”; `blr4` (content) “If self and purity and permanence and happiness were non-existent, sel”; `blsm` (content) “If it did exist from its own nature, why would it have an origin? Ther”; `bluy` (content) “In the emptiness of all things what ends are there? What non-ends are ”; `blxl` (content) “Because the continuity of the aggregates is similar to the light of a ”
- `23`: `bl61` (content) “[A going] which is other than the going by which a goer is made eviden”; `bla8` (content) “It is not possible for a thing that is perishing to remain. It is not ”; `blje` (content) “If actions were not done [by anyone], one would fear meeting what [one”; `blmt` (content) “If whatever is a combination of causes and conditions does not produce”; `blr6` (content) “Thus by stopping confusion, ignorance will stop. If ignorance is stopp”; `blso` (content) “If anguish existed by its own nature, there could be no cessation. Bec”; `blv0` (content) “Is there this? Is there the other? Is there permanence? Is there imper”; `blxn` (content) “If the former perished and that [future] aggregate did not arise in de”
- `24`: `bl63` (content) “One who is a goer does not go in the three aspects of going. Also one ”; `blaa` (content) “If all things at all times are aging and dying phenomena, what things ”; `bljg` (content) “All conventions also without doubt would be contradictory. Also the di”; `blmv` (content) “Therefore, there is no fruit which has been made by combination [or] m”; `blr8` (content) “If the afflictions of some existed by their own nature, how could they”; `blsq` (content) “If the path existed by its own nature, cultivation would not be approp”; `blv3` (content) “Totally pacifying all referents and totally pacifying fixations is pea”; `blxp` (content) “If the former did not perish and that [future] aggregate did not arise”
- `25`: `bl65` (content) “One who is and is not [a goer] also does not go in the three aspects o”; `blac` (content) “It is not reasonable for what remains to remain due to something else ”; `blji` (content) “[When] the ripening of that [action] has ripened it would ripen again ”; `blmw` (content) “tshogs pa brtag pa zhes bya ba ste rab tu byed pa nyi shu pa’o////”; `blr9` (content) “[Skt. gives svabhavam for yod pa in l.d]”; `blrb` (content) “If the afflictions of some did not exist by their own nature, how coul”; `blss` (content) “When anguish, origins and cessation cannot exist, what ceasing of angu”; `blv4` (content) “mya ngan las ‘das pa brtag pa zhes bya ba ste rab tu byed pa nyi shu l”; `blxs` (content) “If one part had an end and one part did not have an end, the world wou”
- `26`: `bl66` (content) “‘gro ba dang ‘ong ba brtag pa zhes bya ba ste rab tu byed pa gnyis pa’”; `blae` (content) “What has ceased does not cease. What has not ceased also does not ceas”; `bljk` (content) “This action has the character of affliction and afflictions are not re”; `blrc` (content) “phyin ci log brtag pa zhes bya ba ste rab tu byed pa nyi shu gsum pa’o”; `blsu` (content) “If non-understanding existed by its very own nature, how could one eve”; `blxu` (content) “How can one part of the one-who-clings perish while one part does not ”
- `27`: `blag` (content) “It is not possible for a thing which has remained to cease. It is also”; `bljm` (content) “Actions and afflictions are taught to be the conditions for bodies. If”; `blsw` (content) “In the same way, your letting go, realizing, cultivating and the four ”; `blxx` (content) “How can one part of that-which-is-clung-to perish while one part does ”
- `28`: `blah` (content) “[past tense “has remained” follows Skt. (K .175). Tib. and Ts. 183 cou”; `blaj` (content) “A particular state [of something] does not cause that particular state”; `bljo` (content) “People who are obscured by ignorance, those with craving, are the cons”; `blsy` (content) “How can any fruits, which totally hold their own nature and by their o”; `blxz` (content) “If both the presence and absence of an end were established, you would”
- `29`: `blak` (content) “[Ts. 184 illustrates this with the example of milk and curds (butter),”; `blam` (content) “When the birth of all phenomena is not possible, then the cessation of”; `bljq` (content) “Because the action does not emerge from conditions and does not emerge”; `blt0` (content) “If the fruits did not exist, there could be no abiding in the fruits. ”; `bly1` (content) “And because all things are empty, about what and in whom do views such”
- `30`: `blao` (content) “Cessation is not possible in an existent thing. Thingness and nothingn”; `bljs` (content) “If neither the action nor the agent exists, where can there be a fruit”; `blt2` (content) “Since there would be no ennobling truths, the sublime Dharma could als”; `bly3` (content) “I bow down to Gautama, whose kindness holds one close, who revealed th”
- `31`: `blaq` (content) “Cessation is not possible also in what is not a thing. This is similar”; `blju` (content) “Just as a teacher creates a creation by a wealth of magical powers, an”; `blt4` (content) “It would also follow that your Buddha does not depend on awakening. It”; `bly4` (content) “[Ts. recognizes that this verse can be treated as separate from the bo”; `bly5` (content) “lta ba brtag pa zhes bya ba ste rab tu byed pa nyi shu bdun pa’o////”; `bly7` (content) “dbu ma rtsa ba’i tshig le’ur byas pa shes rab ces bya ba theg pa chen ”; `bly8` (content) “dbang phyug dam pa’i mnga’ bdag rgyal po chen po dpal lha btsan po’i b”; `bly9` (content) “slad kyis ra sa ‘phrul snang gi gtsug lag khang du / rgya gar gyi mkha”
- `32`: `blas` (content) “Cessation does not exist by its own self, nor does cessation [exist] b”; `bljw` (content) “Like this, whatever action too done by that agent [is ]also like the a”; `blt6` (content) “For you, someone who by his very nature is not Buddha could not attain”
- `33`: `blau` (content) “Because birth and remaining and perishing are not established, there i”; `bljy` (content) “Afflictions, actions and bodies and agents and fruits are like a city ”; `blt8` (content) “No one would ever do what is Dharma and what is not Dharma. What can t”
- `34`: `blaw` (content) “Like a dream, like a magician’s illusion, like a city of gandharvas, l”; `bljz` (content) “las brtag pa zhes bya ba ste rab tu byed pa bcu bdun pa’o // //”; `blta` (content) “Even without Dharma and not-Dharma, you would have the fruits. You wou”
- `35`: `blax` (content) “skye ba dang gnas pa dang ‘jig pa brtag pa zhes bya ba ste rab tu byed”; `bltc` (content) “If you have the fruits which have arisen from the causes of Dharma and”

**Signature / closing lines carrying a number** (1)

- `p.11`: `bl3b` (signature) “Stephen Batchelor”; `bl3c` (signature) “Sharpham College”; `bl3d` (signature) “April, 2000”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `a.6`: `bl3k` (lead-in) “[Translator’s homage]”; `bl3l` (content) “dBu ma rtsa ba’i tshig le’ur byas pa Shes rab ces bya ba bzhugs so// /”

### The Religion of the Sikhs (`religion_of_the_sikhs_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (31)

- `4.151`: `blbs` (content) “XXIX”; `blbu` (content) “Make Him who hath strung the whole world on His string thy spiritual L”
- `4.154`: `blbw` (content) “Hail! Hail to Him,”; `blbz` (content) “One Māya in union with God gave birth to three acceptable children.”
- `4.156`: `blby` (content) “XXX”; `blc1` (content) “As it pleaseth God, He directeth them by His orders.”
- `4.160`: `blc3` (content) “Hail! Hail to Him,”; `blc6` (content) “His seat and His storehouses are in every world.”
- `4.165`: `blca` (content) “Hail! Hail to Him,”; `blcd` (content) “Were one tongue to become a hundred thousand, and a hundred thousand t”
- `4.166`: `blcc` (content) “XXXII”; `blce` (content) “I would utter the name of the one Lord of the world hundreds of thousa”
- `4.172`: `blcl` (content) “Guru Angad”; `blcn` (content) “Even with such light there would be appalling darkness without the Gur”
- `4.174`: `blco` (content) “Guru Nānak”; `blcq` (content) “Shall be left like spurious sesames in a reaped field.”
- `4.186`: `bld2` (content) “Guru Angad”; `bld4` (content) “The Khatris to exercise bravery, the Sudars to work for others;”
- `4.191`: `bld8` (content) “Guru Angad”; `blda` (content) “He who knoweth the secrets of the soul and of God,”
- `4.194`: `bldd` (content) “Guru Angad”; `bldf` (content) “Both his salutation and criticism are in vain; Nānak, such a person sh”
- `4.196`: `bldg` (content) “Guru Nānak”; `bldi` (content) “Why hast thou done such evil deeds as thou shalt suffer for?”
- `4.207`: `bldu` (content) “Guru Rām Dās”; `bldx` (content) “My friend and divine Guru, enlighten me with God’s name.”
- `4.217`: `ble5` (content) “Guru Arjan”; `ble8` (content) “O my God, they who meet the society of the saints are saved.”
- `4.226`: `bleg` (content) “Guru Rām Dās”; `blei` (content) “All meditate on Thee; all meditate on Thee; O God, Thou art the true C”
- `4.252`: `blf8` (content) “Guru Nānak”; `blfb` (content) “Sing the Sohila of my Fearless Lord; I am a sacrifice to that song of ”
- `4.261`: `blfi` (content) “Guru Nānak”; `blfl` (content) “O father, preserve the system”
- `4.267`: `blfp` (content) “Guru Nānak”; `blfs` (content) “What worship is this, O Thou Destroyer of birth? Unbeaten strains of e”
- `4.277`: `blg1` (content) “Guru Rām Dās”; `blg3` (content) “By predestination the Guru is found, and the soul is absorbed in the r”
- `4.287`: `blgc` (content) “Guru Arjan”; `blge` (content) “Earn here the profit of God’s name, and in the next world ye shall abi”
- `4.298`: `blgo` (content) “Hymns by Guru Nānak”; `blgq` (content) “So God day and night cherisheth and guardeth man and keepeth him in ha”
- `4.337`: `blhs` (content) “By Guru Angad”; `blhu` (content) “O Thou who art perfect, light of the soul, the Supreme God, my beloved”
- `4.348`: `bli4` (content) “By Guru Amar Dās”; `bli6` (content) “I wandered through the whole world calling out for my Beloved, yet my ”
- `4.352`: `bli8` (content) “By Guru Rām Dās”; `blib` (content) “He Himself is the True Guru; He is the Word; in every age His saints a”
- `4.358`: `blig` (content) “By Guru Arjan”; `blii` (content) “He Himself is blended with everything;”
- `4.378`: `blj1` (content) “Prayer by Guru Arjan”; `blj3` (content) “Dispeller of fear and terror, Abode of mercy, Treasury of excellencies”
- `4.387`: `bljb` (content) “Hymns By Guru Teg Bahādur”; `bljd` (content) “Adore God, adore God; thy life passeth away.”
- `4.398`: `bljn` (content) “By Guru Gobind Singh”; `bljp` (content) “Strength is thine; thy fetters are loosed; thou hast every resource.”
- `4.403`: `bljt` (content) “By Kabīr”; `bljv` (content) “What will be, will be; O my soul, hope not at all.”
- `4.422`: `blke` (content) “By Shaikh Farid”; `blkg` (content) “Make these three thy dress, O sister, and the Spouse shall come into t”
- `4.432`: `blkp` (content) “Hymn by Mirā Bāi”; `blkr` (content) “With His attributes, and I have sung of them.”

**Opening invocations carrying a number** (1)

- `4.201`: `bldo` “He is the Creator, the Omnipotent, the Bounteous; He provideth His creatures with sustenance.”

**Source / citation lines carrying a number** (5)

- `4.3`: `bl73` (source) “From the Jāpji”; `bl74` (content) “The Jāpji is considered by the Sikhs to be an epitome of the doctrines”
- `4.171`: `blci` (source) “From the Asa Ki Wār (Repeated by Sikhs in the morning.)”; `blcm` (content) “Were a hundred moons to rise, and a thousand suns to mount the sky;”
- `4.206`: `blds` (source) “From the Rahirās (Recited by Sikhs at sunset.)”; `bldw` (content) “We insects and worms seek Thy protection, O true Guru; mercifully enli”
- `4.251`: `blf6` (source) “From the Sohila (Repeated at bedtime by pious Sikhs.)”; `blfa` (content) “Sing the Sohila and remember the Creator.”
- `4.441`: `blkz` (source) “From the Granth of the Tenth Guru”; `bll2` (content) “The tenth Guru spoke with his holy mouth —”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (17)

- `4.5`: `bl76` (lead-in) “Repeat His name”; `bl77` (content) “The True One was in the beginning; the True One was in the primal age.”
- `4.7`: `bl79` (lead-in) “I”; `bl7a` (content) “By thinking I cannot obtain a conception of Him, even though I think h”
- `4.13`: `bl7g` (lead-in) “II”; `bl7h` (content) “By His orders bodies are produced; His order cannot be described.”
- `4.19`: `bl7n` (lead-in) “III”; `bl7o` (content) “Who can sing His power? Who hath power to sing it?”
- `4.33`: `bl82` (lead-in) “V”; `bl83` (content) “He is not established, nor is He created.”
- … 12 more in the TSV

### The Priceless Pearl (`the_priceless_pearl_baha_i_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (30)

- `1.1`: `bl2w` (content) “Salutation and praise, blessing and glory rest upon that primal branch”; `bl2x` (content) “Like a cloud-break in a stormy sky these words, even as a mighty shaft”
- `1.5`: `bl30` (content) “O Maidservant of God!”; `bl34` (content) “It may seem surprising that such an important Tablet was not known in ”
- `1.6`: `bl32` (content) “Upon thee be greetings and praise ‘Abdu’l-Bahá ‘Abbás”; `bl35` (content) “In another part of his diary Yunis Khan describes his first glimpse of”
- `1.39`: `bl40` (content) “He is God”; `bl43` (lead-in) “‘Abdu’l-Bahá”; `bl44` (content) “Shoghi Effendi was particularly attached to this nurse, who is mention”
- `1.40`: `bl41` (content) “Shoghi Mine This dream is a very good one. Rest assured that to have a”; `bl45` (content) “Shoghi Effendi entered the best school in Haifa, the Collège des Frère”
- `1.73`: `bl51` (signature) “July 28, 1920”; `bl52` (content) “My dearest Bahá’í sister:”; `bl54` (content) “Do pray for me, as I have requested you on the eve of my departure, th”
- `1.76`: `bl56` (signature) “8th August 1920”; `bl57` (content) “My dear Friend”; `bl59` (content) “I hope he will manage to get the training he seeks at Oxford. He came ”
- `2.8`: `bl64` (content) “Dearest Shoghi,”; `bl68` (content) “The friends have insisted on my spending a day or two of rest in this ”
- `2.15`: `bl6c` (content) “With prayer and faith in His Cause, I am your well-wisher in His servi”; `bl6d` (signature) “Shoghi”; `bl11a` (content) “Owing to passport difficulties Shoghi Effendi cabled Haifa he could no”
- `2.46`: `bl79` (content) “The reaction of Shoghi Effendi to the trend of these opinions and the ”; `bl7c` (content) “He is God!”
- `2.51`: `bl7g` (content) “On 8 April the Greatest Holy Leaf wrote a general letter to the friend”; `bl7l` (content) “Dear Mr. Hauser,”
- `2.53`: `bl7i` (content) “In the early years after ‘Abdu’l-Bahá’s passing, although Shoghi Effen”; `bl7o` (content) “Hoping to see you again, and never forgetting you,”
- `2.54`: `bl7j` (content) “Copies of correspondence in French with a German Swiss in whose home S”; `bl7s` (content) “My dear Mr. Hauser,”
- `2.76`: `bl87` (content) “PERSIA”; `bl8g` (content) ““May our reunion in the glorious arena of service prove in the spiritu”
- `2.77`: `bl89` (content) “AMERICA”; `bl8i` (content) ““Refreshed and reassured I now stretch to you across the distant seas ”
- `2.79`: `bl8b` (content) “GREAT BRITAIN”; `bl8m` (content) ““Back to these hallowed surroundings I extend towards you my hand of f”
- `2.81`: `bl8d` (content) “GERMANY”; `bl11g` (content) “On 18 December he cabled:”
- `2.83`: `bl8f` (content) “INDIA”; `bl8l` (content) “TURKEY”; `bl11h` (content) “And on 19 December he sent the two following cables:”
- `2.85`: `bl8h` (content) “JAPAN”; `bl8u` (content) ““Awaiting lovingly glad-tidings of Australian friends in Holy Land.””
- `2.82`: `bl8j` (content) “MESOPOTAMIA”; `bl8q` (content) ““Pray convey my Swiss friends assurance of my unfailing cooperation on”
- `2.84`: `bl8n` (content) “FRANCE”; `bl8s` (content) ““Convey Italian friends my best wishes on my return Holy Land.””
- `2.86`: `bl8p` (content) “SWITZERLAND”; `bl8v` (content) “Shoghi Effendi also sent telegrams to some of his relatives, which cle”
- `2.87`: `bl8r` (content) “ITALY”; `bl8w` (content) “Being by nature very methodical Shoghi Effendi in these early years ke”
- `2.89`: `bl8t` (content) “to DUNN”; `bl8y` (content) “My dearest brethren and sisters in the Faith of God!”
- `4.37`: `blca` (content) “Earlier, in April, Queen Marie and her daughter Ileana were on a visit”; `blce` (lead-in) “Her Majesty The Dowager Queen Marie of Rumania Bucarest”; `blch` (content) “Your Majesty”
- `4.49`: `blct` (content) “I remember Shoghi Effendi a number of times describing to me how the G”; `blcv` (content) “Your Majesty,”
- `4.56`: `bld1` (signature) “I am yours very sincerely,”; `bld3` (content) “After sending the Queen a copy of his recently translated Gleanings fr”; `bld5` (content) “Your Majesty,”
- `12.78`: `bl11p` (content) “PRIME MINISTER’S OFFICE”; `blqr` (lead-in) “His Eminence Shoghi Rabbani World Head of the Bahá'í Faith, Haifa.”; `blqu` (lead-in) “Your Eminence,”; `blqv` (content) “I am instructed to acknowledge receipt of your letter of the 16th May ”
- `12.79`: `blqp` (content) “Jerusalem, 19th May, 1952.”; `blqw` (content) “As you are no doubt aware, the dispute between yourself as the World H”
- `16.1`: `blz8` (content) “Well is it with him that seeketh the shelter of his shade that shadowe”; `blz9` (signature) “‘Abdu’l-Bahá”; `blza` (content) “The Guardian had fused in the alembic of his creative mind all the ele”

**Opening invocations carrying a number** (3)

- `1.39`: `bl40` “He is God”
- `1.49`: `bl4e` “He is God!”
- `2.46`: `bl7c` “He is God!”

**Header numbers colliding with another block** (15)

- `2`: `bl2v` (header) “The Childhood and Youth of Shoghi Effendi”; `bl5v` (header) “Chapter 2”
- `3`: `bl5w` (header) “The Passing of ‘Abdu’l-Baha and Its Immediate Consequences”; `bl9o` (header) “Chapter 3”
- `4`: `bl9p` (header) “Early Years of the Guardianship”; `blb4` (header) “Chapter 4”
- `5`: `blb5` (header) “Martha Root and Queen Marie of Rumania”; `bldg` (header) “Chapter 5”
- `6`: `bldh` (header) “The Principle of Light and Shadow”; `ble1` (header) “Chapter 6”
- … 10 more in the TSV

**Signature / closing lines carrying a number** (23)

- `2.3`: `bl60` (signature) “Greatest Holy Leaf”; `bl61` (content) “In notes he made of this terrible event and its immediate repercussion”
- `2.6`: `bl63` (signature) “The Home Sanatorium Bournemouth”; `bl66` (content) “After a few days in Miss Grand’s home Shoghi Effendi roused himself to”
- `2.38`: `bl11b` (content) “It would be unfortunate if the ever to be lamented death of Sir ‘Abdu’”; `bl72` (signature) “Yours sincerely,”
- `2.41`: `bl73` (signature) “Herbert Samuel”; `bl74` (content) “However friendly its tone, it demanded on the part of His Majesty’s Go”
- `2.52`: `bl7e` (signature) “The servant of His Threshold,”; `bl7f` (signature) “Shoghi”; `bl7h` (content) “It all looked very calm on paper but behind it was a raging storm in t”
- … 18 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (17)

- `2.2`: `bl5y` (lead-in) “Cyclometry London”; `bl5z` (content) “His Holiness ‘Abdu’l-Bahá ascended Abhá Kingdom. Inform friends.”
- `2.37`: `bl70` (lead-in) “Dear Mr. Rabbani,”; `bl71` (content) “I have to acknowledge receipt of your letter of Jan. 16., and to thank”
- `4.17`: `blbm` (lead-in) “Bran August 27th 1926”; `blbn` (lead-in) “Dear Sir,”; `blbo` (content) “I was deeply moved on reception of your letter.”
- `7.3`: `blfe` (lead-in) “Dearly-beloved Greatest Holy Leaf!”; `blff` (content) “Through the mist of tears that fill my eyes I can clearly see, as I pe”
- `10.42`: `blkp` (signature) “27th April, 1932”; `blkq` (lead-in) “My dear Shoghi Effendi,”; `blkr` (content) “It was most kind of you to remember me and send me copies of your two ”
- … 12 more in the TSV

### A Modern Zoroastrian (`a_modern_zoroastrian_zoroastrian_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (30)

- `1.10`: `bl46` (content) “Oh! yet we hope that somehow good Will be the final goal of ill.”; `bl49` (content) “This, and this alone, seems to me to afford a working hypothesis which”
- `3.14`: `bl5x` (lead-in) “Dimensions of Light-Waves.”; `bl5y` (content) “Red 39,000 477,000,000,000,000 Orange 42,000 506,000,000,000,000 Yello”; `bl62` (content) “These impulses are excessively minute, and when they occur in irregula”
- `3.22`: `bl6d` (content) “xdy + ydx = 2zdz”; `bl6i` (content) “If then x and y are connected by some fixed law, as must be the case i”
- `4.10`: `bl75` (content) “Man is man and master of his fate.”; `bl77` (content) “To pursue this farther would lead us far astray into the misty realm o”
- `5.13`: `bl8z` (content) “H — O — K”; `blno` (content) “This polarity of chemical elements manifests itself in different ways.”
- `8.18`: `blbq` (content) “Perfect woman, nobly planned To soothe, to comfort, and command; And y”; `blbv` (content) “It is not therefore from any wish to indulge in what Herbert Spencer c”
- `8.20`: `blbw` (content) “I am one of the ould sort of Bradies, My turn does not lie to hard wor”; `blc1` (content) “To return, however, to the more scientific aspects of the question, th”
- `10.4`: `blcs` (content) “Behold, I know not anything.”; `blcv` (content) “That this grey nerve-tissue is really the organ of thought has been fi”
- `11.18`: `blec` (lead-in) “such stuff As dreams are made on,”; `blee` (content) “and to be ‘rounded with a sleep’ was the final consummation devoutly t”; `bleg` (content) “Polytheism was bound to perish first, for slow as the advance of scien”
- `11.38`: `blff` (content) “Instance after instance has occurred in which phenomena which in forme”; `blfk` (content) “he wrote to a public to whom it was an undoubted article of faith that”
- `11.40`: `blfg` (content) “Jam satis terris nivis, atque diræ Grandinis misit Pater, et rubente D”; `blfm` (content) “In like manner demonology and witchcraft, with all their train of crue”
- `11.56`: `blg2` (content) “So far is this from being the case that, as individuals and societies ”; `blg5` (content) “if our happiness becomes more intense, so does our misery become more ”
- `11.59`: `blg3` (content) “Like the beasts with lower pleasures, Like the beasts with lower pains”; `blga` (content) “In fact, the good and evil resulting from the higher evolution of soci”
- `11.57`: `blg6` (content) “Accumulations of population and accumulations of capital are alike cau”; `blg8` (content) “how many struggles and how many heart-aches were avoided. When ‘merry ”
- `11.61`: `blg7` (content) “Passing rich with forty pounds a year,”; `blgg` (content) “Or declare with Hamlet that no one would bear the ills of life if”
- `11.65`: `blgc` (content) “When in disgrace with fortune and men’s eyes, I all alone bemoan my ou”; `blgn` (content) “The horrors of demonology and witchcraft had their origin in texts of ”
- `11.66`: `blgh` (content) “He himself could his quietus make With a bare bodkin.”; `blgo` (content) “Indeed a great deal of what is best in genuine Christianity seems to m”
- `13.26`: `bli8` (content) “Who dares to name Him, Who to say of Him, ‘I believe’? Who is there ev”; `blio` (content) “In like manner in the works of art which embrace a wider range, and ho”
- `13.27`: `blid` (lead-in) “Are God and Nature, then, at strife?”; `blie` (lead-in) “and paints in the sharpest contrast on the background of the unknown, ”; `blif` (lead-in) “God is love indeed, And love creation’s final law,”; `blih` (content) “and the harsh realities of nature, which”; `blik` (content) “or again in his later work, ‘The Ancient Sage,’ he says —”; `blis` (content) “The affinity between Zoroastrianism and art is easily explained when w”
- `13.29`: `blii` (content) “Red in tooth and claw With ravine shrieks against the creed;”; `bliu` (content) “Tried by this test, Zoroastrianism has made good its claim to be calle”
- `13.30`: `blil` (content) “Thou canst not prove the Nameless, O my son! For nothing worthy provin”; `bliv` (content) “The position of women affords perhaps the best test of the real civili”
- `13.31`: `blip` (lead-in) “Their honour rooted in dishonour stands,”; `bliq` (content) “appearing to ordinary mortals little less than ‘archangels ruined.’ Or”; `bliw` (content) “The Parsees in this respect stand high, far higher than any other Orie”
- `15.14`: `bljw` (content) “All down the sand Lies breathing in its sleep, Heard by the land —”; `bll1` (content) “The hermit smiled, and said, ‘Hold your hands, good sirs, for a single”
- `15.16`: `blk1` (content) “Heart looks down and up, Serene, secure; Warm as the crocus-cup, As sn”; `bll3` (content) “‘Father,’ they said, ‘we are fools. Grant us thy pardon for our folly ”
- `14.15`: `blk6` (content) “The still sad music of humanity, Not harsh nor grating, but of ample p”; `blka` (content) “This, rather than wrangling with his fellow-mortals about creeds and a”
- `15.3`: `blki` (content) “‘I was well, would be better, and here I am.’”; `blkk` (content) “The second knight, whose face was turned towards the rising sun, bore ”
- `15.4`: `blkl` (content) “Go thou aye forward, as was thy wont.”; `blkn` (content) “The knights met just where an ancient oak of mighty bulk stretched ove”
- `15.10`: `blku` (content) “Far on the ringing plains of windy Troy,”; `blkw` (content) “Just then an aged hermit appeared on the scene, drawn thither by the s”
- `15.20`: `bll7` (content) “Freedom has widened slowly down, From precedent to precedent,”; `bllb` (content) “The contrast of English and French colonisation affords a striking ins”
- `15.31`: `bllm` (content) “the man with soul so dead Who never to himself has said, This is my ow”; `bllq` (content) “The craven fear of being great,”; `blls` (content) “In this, as in all similar cases, it is evident that true statesmanshi”

**Header numbers colliding with another block** (14)

- `1`: `blnt` (header) “Preface.”; `bl3u` (header) “Chapter I. Introductory.”
- `2`: `bl3v` (header) “Experiment with Magnet — Principle of Polarity — Applies universally —”; `bl4m` (header) “Chapter II. Polarity in Matter — Molecules and Atoms.”
- `3`: `bl4n` (header) “Matter Consists of Molecules — Nature of Molecules — Laws of their Act”; `bl5j` (header) “Chapter III. Ether.”
- `4`: `bl5k` (header) “Ether proved by Light — Light-waves — Elasticity of Ether — Its Univer”; `bl6s` (header) “Chapter IV. Energy.”
- `5`: `bl6t` (header) “Energy of Motion and of Position — Energy can be Transformed, Not Crea”; `bl8m` (header) “Chapter V. Polarity in Matter.”
- … 9 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `11.23`: `bles` (lead-in) “are pure pantheism, and yet we cannot but feel ourselves to a great ex”; `blet` (content) “So also the well-known lines of a greater than Wordsworth, Shakespeare”
- `15.32`: `bllt` (lead-in) “The falsehood of extremes.”; `bllu` (content) “When Sir Robert Peel some forty years ago announced his conversion by ”

### Black Yajur Veda (`black_yajurveda_ocean_hinduism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (29)

- `i.8.1`: `au` (content) “a Anumati he offers a cake on eight potsherds; the sacrificial fee is ”; `av` (content) “Go away, hail! rejoicing in the oblation. This is thy share, O Nirrti;”
- `i.8.10`: `bd` (lead-in) “May the king, the slayer of Vrtra, Be our king and slay the foe.”; `be` (content) “There is (an offering) to Mitra and Brhaspati; in the milk of a white ”; `bg` (content) “a To Agni, lord of the house, he offers a cake of black rice on eight ”
- `ii.2.2`: `d3` (content) “He should make an offering to Indra and Agni on eleven potsherds who h”; `d5` (content) “To Agni, maker of paths, he should offer a cake on eight potsherds who”
- `ii.3.10`: `ec` (content) “He who desires a village should offer to the All-gods (the sacrifice) ”; `ee` (content) “e Him quicken, O Agni, for life, for radiance, Make dear his seed, O V”
- `ii.3.14`: `el` (content) “Indra departs with his power, Varuna seizes him with Varuna’s noose, w”; `en` (content) “a Thou from of old. b The wise contrivings. c Indra on all sides. d In”
- `ii.5.12`: `gc` (content) “The gods having repeated the Samidhenis could not see the sacrifice. P”; `ge` (content) “a Life to thee. b Life-giving, O Agni, c Swell up. d Together thee. e ”
- `iii.1.8`: `hu` (content) “For entry thee, for rest thee, for the overcoming of the Gayatri, of t”; `hv` (content) “They contend as to the deities and to expiration and inspiration, whos”; `hx` (content) “a Ye are the Nigrabhyas, heard by the gods. Delight my life, delight m”
- `iii.2.3`: `ij` (content) “Two oceans are there extended, unperishing; They revolve in turns like”; `ik` (content) “Whatever the gods did at the sacrifice the Asuras did. The gods saw th”; `im` (content) “a Surrounding Agni, surrounding Indra, surrounding the All-gods, surro”
- `iii.2.4`: `in` (content) “He who desires to be great should look (on the offerings); Prajapati i”; `ip` (content) “a The wooden sword is safety, the hammer is safety, the knife, the sac”
- `iii.2.7`: `ix` (content) “If a black bird touch the speckled butter, his slaves would be likely ”; `iz` (content) “a O God Savitr, he hath declared that to thee; that do thou impel and ”
- `iii.3.6`: `jp` (content) “Prajapati saw the Viraj; by it he created the past and the future; he ”; `jr` (content) “What the gods could not win by the sacrifice, that they won by the Par”
- `iii.3.9`: `jw` (content) “The sacrificer falls a victim to the two fires in that having made (th”; `jx` (content) “b That loan which I have not yet paid back, The tribute that I still o”; `jy` (content) “Yama is Agni, Yama is this (earth); the sacrificer becomes under a deb”; `k0` (lead-in) “The Special Animal Offerings”; `k3` (content) “a This young one I put around you, Playing with him that is dear do ye”
- `iii.4.5`: `kp` (content) “The gods and the Asuras were in conflict. Indra had recourse to Prajap”; `kr` (content) “a Agni overlord of creatures, may he help me; Indra of powers, Yama of”
- `iii.4.11`: `l2` (content) “In that evening and morning he offers the Agnihotra the sacrificer thu”; `l4` (content) “a Long life thou givest, O Agni, O god, to the giver, Sage, lord of th”
- `iii.5.2`: `lb` (content) “The Adityas and the Angirases piled up the fires, they desired to obta”; `ld` (content) “The Rsis could not see Indra face to face; Vasistha saw him face to fa”
- `iii.5.5`: `li` (content) “The gods are destroyers of the sacrifice, stealers of the sacrifice; t”; `lk` (content) “a May Surya, the god, protect me from the gods, Vayu from the atmosphe”
- `iii.5.11`: `lv` (content) “He draws the Prana, cups; so much is there as are these cups, these St”; `lx` (content) “a Bring onward with meditation divine The god, who knoweth all; May he”
- `v.5.8`: `vq` (content) “The bow of thine, O Rudra, in the east, may the wind blow after it for”; `vr` (lead-in) “Agni is Rudra; just as a tiger stands in anger, so he also (stands); w”; `vs` (lead-in) “The fires of the dust That have entered within the earth, Of them thou”; `vt` (content) “‘Thee, O Agni, with the mind have I obtained; thee, O Agni, with the f”; `vv` (content) “He pays reverence in front with the Gayatra (Saman); verily he confers”
- `v.5.9`: `vw` (content) “With the eastern quarter I place thee, with the Gayatri metre, with Ag”; `vx` (content) “He who piles the fire without its body is without a body in yonder wor”; `vz` (content) “a O Agni, the ocean, thy arrow called the young, with it be gentle to ”
- `v.6.5`: `xl` (content) “The year is the year, the Ayavas are the months, the red one the dawn,”; `xn` (content) “Having kept the fire in the pan for a year in the second year he shoul”
- `v.7.3`: `yz` (content) “The bricks are cattle, in each layer he puts down a bull (brick); veri”; `z0` (lead-in) “b The image of the year Which men revere in thee, O night, Making his ”; `z1` (content) “He puts down this Prajapati (brick); the sole eighth day is this (eart”; `z2` (lead-in) “c With the light wherewith the gods went upward, Wherewith the Adityas”; `z3` (content) “The fire is piled for the world of heaven; (with the words) With the l”; `z4` (content) “d (Homage) to the hundred-weaponed, him of a hundred powers, Him of a ”; `z7` (content) “a Thou art the thunderbolt of Indra, slaying foes; Guarding our bodies”
- `v.7.4`: `z8` (content) “The gods and the Asuras were in conflict; the Asuras sought to force t”; `z9` (lead-in) “b O Agni and Visnu, May these songs gladden you in unison; Come ye wit”; `za` (content) “The theologians say, ‘Since they do not offer to any deity, then what ”; `zc` (content) “a ‘To thought I offer with mind, with ghee’, he says; the oblation to ”
- `v.7.5`: `ze` (content) “He puts down these supporters of the realm; this is the realm supporti”; `zg` (content) “a Just as a son born dies, so dies he whose fire in the pan is extingu”
- `v.7.6`: `zi` (content) “The fire is Arka, the horse sacrifice is yonder sun; in that he offers”; `zk` (content) “a The fire is a bird; if the piler of the fire were to eat of a bird, ”
- `v.7.7`: `zm` (content) “The glory and power of him who has piled the fire go apart twofold, or”; `zo` (content) “a What has flowed from purpose, or heart, Or what is gathered from min”
- `v.7.9`: `zr` (content) “The fire is an extended sacrifice; what of it is performed, what not? ”; `zs` (content) “b To the four quarters let the fires advance; May he bear this sacrifi”; `zt` (content) “The tortoise is put down for the world of heaven; ‘To the four quarter”; `zv` (content) “a In me I take first Agni, For increase of wealth, for good offspring ”
- `v.7.10`: `zw` (content) “If the Adhvaryu without taking the fire in himself were to pile it, he”; `zy` (content) “Prajapati created the fire; it created ran away east from him; he cast”
- `vii.1.7`: `160` (content) “‘Smell the tub, O great one, with broad stream rich in milk; Let the d”; `161` (content) “Verily he unites him with offspring, with cattle, with wealth. He beco”; `162` (lead-in) “‘Ye twain have conquered; ye are not conquered; Neither of the two of ”; `163` (content) “The thousand is divided into three parts at the three-night festival; ”; `164` (lead-in) “‘O Ida, Ranti, Aditi, Sarasvati, Priya, Preyasi, Mahi, Viçruti, These,”; `165` (lead-in) “Verily she proclaims him among the gods, and the gods take note of him”; `167` (content) “By the thousandth the sacrifice goes to the world of heaven. She makes”
- `vii.5.11`: `1bt` (content) “They pierce the hide; verily they remove the sin of the (sacrificers).”; `1bv` (content) “The Horse Sacrifice (continued)”

**Header numbers colliding with another block** (1)

- `1`: `bl16l` (header) “TRANSLATED FROM THE ORIGINAL SANSKRIT”; `bl16m` (header) “PROSE AND VERSE”; `bl16n` (header) “BY”; `2t` (header) “Prapathaka I”; `2v` (content) “The New and Full Moon Sacrifices”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (23)

- `i.4.43`: `7y` (lead-in) “The Daksina Offerings”; `bls2` (content) “a His rays bear up the god Who knoweth all, The sun for all to see. b ”
- `i.5.5`: `8l` (lead-in) “The Reverence of the Fire”; `8o` (content) “a As we approach the sacrifice, Let us utter a hymn to Agni, Who heare”
- `i.7.7`: `a9` (lead-in) “The Vajapeya”; `ac` (content) “a O god Savitr, instigate the sacrifice, instigate the lord of the sac”
- `ii.5.7`: `g0` (lead-in) “The Part of the Hotr at the New and Full Moon Sacrifices”; `g3` (content) “The gods could not rest on the Rc or the Yajus. On the Saman only coul”
- `ii.6.7`: `gw` (lead-in) “The Part of the Hotr in the New and Full Moon Sacrifice”; `gz` (content) “Manu desired what of earth was sacrificial. He found the poured out gh”
- … 18 more in the TSV

### Salat -The Muslim Prayer Book (`salat_the_muslim_prayer_book_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (28)

- `2.2.4`: `bl4i` (content) “Transliteration:”; `bldn` (content) “When the Imām ends the congregational Prayer by saying the Salutation,”
- `2.1.20`: `bl59` (content) “The Imām then recites Sūrah Al-Fātihah. In certain Prayers, e.g., Fajr”; `bl5a` (content) “Transliteration:”
- `2.1.27`: `bl5k` (content) “In the name of Allah, the Gracious, the Merciful. Surely We have given”; `bl5m` (content) “Transliteration:”
- `2.1.28`: `bl5l` (content) “SŪRAH AL-IKHLĀṢ”; `bl5o` (content) “Translation:”
- `2.1.29`: `bl5n` (content) “Bismillāhir-Raḥmānir-Raḥim. Qul huwallāhu Aḥad. Allāhuṣ-Ṣamad. Lam yal”; `bl5r` (content) “Transliteration:”
- `2.1.30`: `bl5p` (content) “In the name of Allah, the Gracious, the Merciful. Say, He is Allah, th”; `bl5t` (content) “Translation:”
- `2.1.72`: `blb9` (content) “Transliteration:”; `blc1` (content) “Bless, O Allah, Muhammad and the people of Muhammad, as Thou didst ble”
- `2.1.73`: `blc2` (content) “Translation:”; `blbx` (content) “The invocation Durūd (Aṣṣalātū‘alan-nabī) is followed by a short praye”
- `2.1.75`: `blbz` (content) “Transliteration:”; `blbw` (content) “Our Lord, grant us good in this world as well as good in the world to ”
- `2.1.76`: `blbu` (content) “Translation:”; `bld5` (content) “Rabbij‘alnī muqīmāṣ-Ṣalāti wamin dhur-riyyatī. Rabbanā wa taqabbal du‘”
- `2.1.77`: `blbv` (content) “Transliteration:”; `bld0` (content) “My Lord, make me observe Prayer, and my children too. Our Lord! bestow”
- `2.1.78`: `bld4` (content) “Translation:”; `bld1` (content) “‘Allāhumma innī a‘ūdhu bika minal-hammi walhuzni, wa a‘ūdhu bika minal”
- `2.1.79`: `bld2` (content) “Transliteration:”; `blcz` (content) “O Allah, I seek Thy protection against problems and anxieties, and I s”
- `2.1.80`: `blcx` (content) “Translation:”; `blcu` (content) “Allāhumma innī ẓalamtu nafsī ẓulman kathīran, wa lā yaghfirudh-dhunūba”
- `2.1.81`: `blcy` (content) “Transliteration:”; `blcv` (content) “O Allah, I have been unjust to myself and no one grants pardon for sin”
- `2.1.82`: `blcw` (content) “Translation:”; `blct` (content) “Allāhumma innī a‘ūdhu bika min ‘adhābil-qabri wa a‘ūdhu bika min fitna”
- `2.1.83`: `blcr` (content) “Transliteration:”; `blco` (content) “O Allah, I seek Thy protection from the punishment of the grave, and I”
- `2.1.84`: `blcs` (content) “Translation:”; `blcq` (content) “After reciting one or more of these prayers, the Imām turns his face t”
- `2.3.14`: `bleh` (content) “Transliteration:”; `blec` (lead-in) “Translation:”; `blee` (content) “O my Lord, help me so that I can properly perform Thy remembrance and ”
- `2.8.38`: `bll5` (content) “When it seems that someone is approaching his time of death, the recit”; `bll4` (content) “Transliteration:”
- `2.8.51`: `blkq` (content) “If the deceased is an adult, male or female, the following Prayer is r”; `blkp` (content) “Transliteration:”
- `2.8.52`: `bll8` (content) “Allāhumaghfir liḥayyinā wa mayyitinā wa shāhidinā wa ghā’ibinā wa ṣagh”; `bll7` (content) “Translation:”
- `2.8.53`: `bllb` (content) “O Allah, forgive our living ones and our deceased ones and those of us”; `bll6` (content) “Transliteration:”
- `2.8.55`: `blld` (content) “O Allah make him our forerunner, and make him, for us, a reward and a ”; `bllj` (content) “Transliteration:”
- `2.8.61`: `bllk` (content) “The following should be recited when the body is being lowered into th”; `bllq` (content) “Transtiteration:”
- `2.8.64`: `bllo` (content) “As the body is placed in the grave, the sheet wrap should be loosened ”; `bllv` (content) “Transliteration:”
- `2.8.68`: `bllw` (content) “When the burial ceremony is complete, a brief silent congregational Pr”; `bllz` (content) “Transliteration:”
- `2.8.74`: `blm4` (content) “She may further abstain from wearing make-up, dressing up festively, u”; `blm9` (lead-in) “Adhān: The Islamic call to Prayer.”; `blmb` (lead-in) “‘Aṣr: The 3rd of the five daily Prayer services, offered any time betw”; `blma` (lead-in) “Ta‘awwudh: Set words for seeking the protection of God against Satan, ”; `blm6` (lead-in) “Tashahhud: A set prayer recited silently at the beginning of the Qa‘da”; `blm7` (lead-in) “Du‘ā’i Qunūt: Arabic name of the special prayer recited in the last Ra”; `blme` (lead-in) “Durūd: Invocation of blessings upon the Holy Prophet of Islam, Muhamma”; `blmd` (lead-in) “‘Īdul-Aḍḥā: The Islamic festival commemorating the obedience to God of”; `blmf` (lead-in) “‘Īdul-Fiṭr: The Islamic festival concluding the fasting of the month o”; `blmh` (lead-in) “Fajr: The 1st of the five daily Prayer services, offered any time duri”; `blmg` (lead-in) “Farā ’iḍ: Plural form of Farḍ.”; `blmc` (lead-in) “Farḍ (plural Farā ’iḍ): Compulsory or obligatory, used when describing”; `blmm` (content) “Farḍ-i-Kifāyah: Obligatory duty binding on all Muslims, but which is d”; `blmi` (lead-in) “Fiṭrānah: Money contributed by Muslims before the ‘Īdul-Fiṭr Prayer se”; `blmk` (lead-in) “Ḥajj: Pilgrimage to the Ka ‘bah in Makkah, Arabia; also known as the f”; `blmj` (lead-in) “Imām: The person who leads a congregational Prayer service.”; `blml` (lead-in) “Iqāmah: A shortened verse of the Adhān, which is recited loudly to ind”; `blmn` (lead-in) “‘Ishā’: The 5th and last of the five daily Prayer services, offered an”; `blms` (lead-in) “Jilsah: The Sitting position which occurs in between two prostrations ”; `blmo` (lead-in) “Kalimah: The credo of Islam, There is none worthy of worship except Al”; `blmq` (content) “Kalimah Shahādah (also called Kalimah): The declaration of Islamic fai”; `blmp` (lead-in) “Khusūf: Eclipse of the moon, during which a special Prayer is to be of”; `blmt` (lead-in) “Kusūf: Eclipse of the sun, during which a special prayer is to be offe”; `blmu` (content) “Maghrib: The 4th of the five daily Prayer services, which can be offer”; `blmw` (lead-in) “Makrūhāt: Acts which are considered undesirable or below the dignity o”; `blmv` (lead-in) “Mālikīs: One of the sects of Islam.”; `blmr` (lead-in) “Mu ’adhdhin: The person who says the Adhān, or Call to Prayer.”; `bln2` (lead-in) “Mustaḥab: (plural Mustaḥibbāt): Preferable or praiseworthy things, whe”; `blmx` (lead-in) “Nawāfil: Optional or supererogatory as applied to types or categories ”; `blmz` (lead-in) “Niyyah: The Formal intention which one makes in one’s mind before star”; `blmy` (lead-in) “Qa‘dah: Sitting position adopted towards the end of the second Rak‘at ”; `bln3` (lead-in) “Qaḍa: Offering a missed Prayer.”; `bln5` (content) “Qaṣr: The act of shortening one’s Prayer.”; `bln0` (lead-in) “Qiyām: The standing position in Prayer.”; `blna` (lead-in) “Rak‘at: One complete unit within Prayer, consisting of a number of dif”; `bln6` (lead-in) “Rak‘āt: Plural form of Rak‘at.”; `bln8` (lead-in) “Rukū‘: The Bowing down position in Prayer.”; `bln7` (lead-in) “Sajdah: (Sujūd) The position of Prostration in prayer.”; `blne` (lead-in) “Ṣalātul-Jumu‘ah: The Friday prayer service.”; `blnd` (lead-in) “Ṣalāt: Prayer in the prescribed form; also known as the second pillar ”; `bln9` (lead-in) “Ṣalātul-Hājjāt: Prayer offered when one is in need or in difficulty.”; `blnb` (lead-in) “Ṣalātul-Ishrāq: Optional Prayer offered in two phases in the forenoon.”; `blng` (lead-in) “Ṣalātuḍ-Ḍuḥā: The second phase of Ṣalātul-Ishrāq.”; `blnf` (lead-in) “Ṣaum: Fasting in the month of Ramadan; also known as the fourth pillar”; `blnh` (lead-in) “Shias: One of the sects of Islam.”; `blnc` (lead-in) “Sujūd: (Sajdah): The posture of Prostration in Prayer.”; `blnl` (lead-in) “Sujūdus-Sahv: Prostrations of condonement performed when a mistake has”; `blnn` (lead-in) “Sunan: Plural form of Sunnat.”; `blnm` (lead-in) “Sunnah or Sunnat: One of the types or categories of Prayer; less compu”; `blni` (lead-in) “Sunnis: One of the sects of Islam.”; `blnk` (lead-in) “Sūrah: Arabic word for 'chapter', and used for designating the chapter”; `blnj` (lead-in) “Sutra: An object which a worshipper places before him to mark the phys”; `blno` (lead-in) “Tahajjud: Optional Prayer of great merit offered in the latter part of”; `blnq` (lead-in) “Taḥmī’: The prescribed words recited by the congregation in response t”; `blnp` (lead-in) “Takbīr: A set formula, recited loudly in order to indicate that a cong”; `blnw` (content) “Takbīr-i-Taḥrīmah: The Arabic expression Allāhu Akbar (God is the Grea”; `blnv` (content) “Tarāvīḥ: Special Prayer offered after ‘Ishā’ Prayer during the month o”

**Opening invocations carrying a number** (6)

- `2.1.17`: `bl55` “Bismillāhir-Raḥmānir-Raḥīm”
- `2.1.18`: `bl57` “In the name of Allah, the Gracious, the Merciful.”
- `2.1.29`: `bl5n` “Bismillāhir-Raḥmānir-Raḥim. Qul huwallāhu Aḥad. Allāhuṣ-Ṣamad. Lam yalid, walam yūlad. Walam yakulla”
- `2.1.32`: `bl5s` “Bismillāhir-Raḥmānir-Raḥīm. Qul a‘ūdhu birabbil falaq. Min sharri mā khalaq. Wa min sharri ghāsiqin ”
- `2.1.35`: `bl5x` “Bismillāhir-Raḥmānir-Raḥīm. Qul a‘ūdhu birabbinnās, Mālikin-nās, Ilāhin-nās, Min sharril waswāsil kh”
- `2.8.63`: `blls` “In the name of Allah and with his blessings, upon the path set by the conduct of the Messenger of Al”

**Header numbers colliding with another block** (11)

- `1`: `bl6c` (header) “The Muslim Prayer Book”; `bl6w` (header) “CHAPTER ONE”
- `1.1`: `bl6v` (content) “The purpose of the creation of man, according to Islam, is that he sho”; `bl7i` (header) “OBLIGATION TO OFFER PRAYER”
- `1.2`: `bl6u` (content) “And I have not created the Jinn and the men but that they may worship ”; `bl7e` (header) “IMPORTANCE OF PRAYER”
- `1.3`: `bl6t` (content) “Worship means total obedience to the commands of Allah. The Holy Proph”; `bl83` (header) “THE TIMING OF PRAYERS”
- `1.4`: `bl6s` (content) “Islam has five basic duties which a Muslim has to perform. They are kn”; `bl7v` (header) “CONDITIONS FOR PRAYER”
- … 6 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (75)

- `f.2`: `bl6k` (lead-in) “ṢALĀT - THE MUSLIM PRAYER BOOK”; `bl6j` (content) “Prayer, in every religion is regarded as the pivot on which rests man’”
- `1.4.21`: `bl95` (lead-in) “Transliteration:”; `bl92` (content) “Allāhummaj‘alni minat-tawwābina waj‘alni minal mutaṭahhirīn.”
- `1.4.22`: `bl93` (lead-in) “Translation:”; `bl90` (content) “O Allah make me of those who seek forgiveness and make me of those who”
- `1.4.35`: `bl9x` (lead-in) “Transliteration:”; `bl9u` (content) “Innaddīna Yusrun.”
- `1.4.36`: `bl9v` (lead-in) “Translation:”; `bl9s` (content) “Indeed it is a religion of ease. (Bukhārī, Kitābul-Īmān)”
- … 70 more in the TSV

### آيات الهی جلد دوّم (`ayat_i_ilahi_jild_2_fa`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (27)

- `1.1`: `bl2x` (content) “اتلوا آيات اللّه فی کلّ صباح و مساء نيکوست حال کسی که در ليالی و ايّام”; `bl2z` (content) “قسم به خدا که هرگز ايّامی خوشتر از اين ايّام و فضلی اکبر از اين فضل در”
- `215.1`: `bles` (content) “بگو يا حزب اللّه، جهد نمائيد و قدر و مقام خود را بدانيد و بشناسيد. چند”; `blg9` (content) “بنام محبوب امکان”
- `216.1`: `blet` (content) “هو الله”; `blgc` (content) “جهد در تأليف قلوب احبّاء الله و هدايت خلق به حکمت و بيان محبوب است. طو”
- `217.1`: `blew` (content) “امروز روزی است که قرون اولی به ساعتی از آن معادله نمی نمايد. لَم يَزَل”; `blge` (content) “الاقدس الابهی”
- `218.1`: `bley` (content) “به نام محبوب امکان”; `blgh` (content) “بنام خداوند مهربان”
- `218.2`: `blez` (content) “نصايح الهيّه مائده معنويّه است که از سماء مشيّت رحمانيّه نازل شده. باي”; `blgi` (content) “ای امة اللّه ، الحمد لِلّه از دريای عرفان الهی آشاميدی و به افق ظهور ت”
- `219.1`: `blpa` (content) “انشاء الله به عنايات الهيّه و فيوضات رحمانيّه فائز باشيد و به مطلع اسم”; `blgk` (content) “طوبی از برای نفوسی که شئونات دنيا ايشان را از افق اعلی منع ننمود. دوست”
- `220.1`: `blf2` (content) “بنام مقصود آفاق”; `blgm` (content) “بنام بيننده دانا”
- `220.2`: `blf3` (content) “ای خديجه، بشنو ندای مطلع نور احديّه را که از افق سجن اعظم ترا ندا می ف”; `blgn` (content) “انشاء الله جميع اماء الله بما اَرادَهُ اللّه فائز شوند، لِلّه تکلّم نم”
- `221.1`: `blf5` (content) “ابرهای تيره هوی افق هدی را ستر نموده، و لکن سوفَ يُزيلُها اللّه بالحقّ”; `blgp` (content) “انشاء الله به دوام ملک و ملکوت به فيوضات فيّاض حقيقی فائز باشند، انّه ”
- `222.1`: `blf7` (content) “بنام مقصود عالميان”; `blgr` (content) “حمد و ثنای مقدّس از عرفان اهل انشاء مالک اشياء را لايق و سزا که رَغماً”
- `223.1`: `blfa` (content) “ساقی رحيق بقا مالک اسماء بوده. طوبی از برای نفسی که رحيق اطهر را در اي”; `blgt` (content) “به لسان پارسی احلی آيات مالک اسماء را اصغا نما. هر نفسی اليوم به اصغائ”
- `224.1`: `blfc` (content) “انشاء الله بايد کلّ به نصايح مشفقانه که از افق اراده مالک بريّه ظاهر ش”; `blgv` (content) “جميع علما و فقهای ارض از برای امروز و خدمت امر خلق شده‌اند و لکن يوم ظ”
- `225.1`: `blfe` (content) “ای دوستان حقّ، همّتتان خدمت احبّای حقّ باشد. ملاحظهٔ ضعفا لازم و اعانت”; `blgx` (content) “از صدر اسلام تا حين علمای ارض و فقهای آن از عرفان توحيد حقيقی محروم بو”
- `226.1`: `blff` (content) “عباد را مظهر غنای خود قرار فرمودم و در جميع آيه غنا از کلّ شیء مقرّر د”; `blgz` (content) “يا وهّاب، وهّاب می فرمايد قدر و مقدار فضل و عنايت الهی را بدان و در لي”
- `227.1`: `blfh` (content) “ای مهدی ، حَبّه وجودت را به تصرّف يد غالبه مقتدره الهی واگذار تا او را”; `blh1` (content) “يا حسن، به يقين مُبين بدان عرف بيان رحمن از بيان دونش واضح و ممتاز، طو”
- `228.1`: `blfj` (content) “آنچه در اين دنيا مشهود است استعداد زياده از اين در او موجود نه. اگر چه”; `blh3` (content) “يا حسين ، اين مظلوم کلّ را وصيّت فرموده و می فرمايد به اعمال طيّبه و ا”
- `229.1`: `blfl` (content) “بشنو نغمات الهی را و اليوم را قياس به يومی مکن و کلمات ابدع احلی را قي”; `blh5` (content) “يا اغصانی، در وجود قوّت عظيمه و قدرت کامله مکنون و مستور، به او و جهت ”
- `230.1`: `blfn` (content) “هر نفسی به آنچه موصوف شود اين اوصاف نظر به ايمانی است که در او بوده. و”; `blh7` (content) “يا محمّد علی، مظلوم ترا ندا می نمايد. تفکّر در اعمال شيعه و آنچه از اي”
- `231.1`: `blfp` (content) “ای امة اللّه، حال به لسان ابدع احلی نغمات الهی را به بيان فارسی بشنو و”; `blh9` (content) “يا اَبَا القاسم، ظنون و اوهام علمای ايران را از مشرق وحی و مطلع علم و ”
- `232.1`: `blfs` (content) “جميع عالم از برای خدمت اين يوم مبارک خلق شده‌اند. ای اهل ارض، قدر اين ”; `blhb` (content) “يا علی اکبر، اهل عالم در قرون و اعصار از فراق مالک قدر نوحه می نمودند ”
- `233.1`: `blfu` (content) “انشاء الله در جميع احوال و احيان به نار حبّش مشتعل باشی و به نور عرفان”; `blpe` (content) “يا رحيم، انشاء الله تو و اولياء حقّ فائز شويد به اعمالی که عند الله مق”
- `234.1`: `blfw` (content) “ای دوستان ، امروز بايد کلّ به شأنی از حرارت محبّت الهی مشتعل باشيد که ”; `blhe` (content) “يا محمّد علی، آنچه از قلم اعلی جاری به مثابه سراج است، اَمام وجه مذکور”
- `235.1`: `blfy` (content) “ای اهل بهاء ، قسم به بحر معانی که از هر کلمه بحر حَيَوان جاری. آيا می ”; `blhg` (content) “يا حزب اللّه .... امروز عالِم کسی است که به عرفان حقّ فائز گشت و متّقی”
- `236.1`: `blg0` (content) “بنام آفرينندهٔ يکتا”; `blhi` (content) “يا حزب اللّه، در خادعين و ماکِرين اهل فرقان تفکّر نمائيد. هزار و دويست”
- `237.1`: `blg3` (content) “يوم اللّه آمد. سرير بيان در قطب امکان ظاهر و مکلّم طور بر آن مستوی. فر”; `blhk` (content) “لِلّه الحمد آفتاب عنايت از افق سماء بيان لائح و نور فضل ساطع. طوبی از ”
- `238.1`: `blg6` (content) “به اسم دوست يکتا”; `blhm` (content) “وجود از کلمة اللّه موجود و کلمة اللّه از ظهور ظاهر، اوست کتاب مُبين و ”

**Opening invocations carrying a number** (12)

- `101.1`: `bl8d` “بسمی الّذی به ماجَ بحرُ العرفان”
- `107.1`: `bl8q` “بسمی المبيّنِ الخبير”
- `213.1`: `blem` “هو العزيزُ المحبوب”
- `216.1`: `blet` “هو الله”
- `293.1`: `blko` “بسمه المهيمن علی الاسماء”
- `300.1`: `bll5` “بسم ربّنا الاقدس الاعظم العليّ الابهی”
- `302.1`: `bllb` “هو الله تعالی شأنه العظمة و الاقتدار”
- `308.1`: `blo9` “بسم اللّه الابدع الاقدس”
- `315.1`: `blmc` “هو العزيز الحکيم”
- `320.1`: `blmq` “بسم ربّنا الاقدس الاعظم العليّ الابهی”
- `332.1`: `blnl` “بسمی السّميع البصير”
- `335.1`: `blns` “بسمی النّاطق فی کلّ الاحيان”

**Header numbers colliding with another block** (25)

- `1`: `bl2t` (content) “گلچينی از آثار حضرت بهاءاللّه برای تلاوت در هر صبح و شب”; `bl2w` (header) “مقدّمه ناشر”; `bl2y` (header) “اوّل شهر البهاء - ٢١ مارس”
- `216`: `blp9` (header) “هفتم شهرالعلم - ٢٢ اکتبر”; `blgb` (header) “دوازدهم شهرالقدرة - ١٥ نوامبر”
- `217`: `blev` (header) “هشتم شهرالعلم - ٢٣ اکتبر”; `blgd` (header) “سيزدهم شهرالقدرة - ١٦ نوامبر”
- `218`: `blex` (header) “نهم شهرالعلم - ٢٤ اکتبر”; `blgg` (header) “چهاردهم شهرالقدرة - ١٧ نوامبر”
- `219`: `blpb` (header) “دهم شهرالعلم - ٢٥ اکتبر”; `blgj` (header) “پانزدهم شهرالقدرة - ١٨ نوامبر”
- … 20 more in the TSV

### The Amitâyur-dhyâna-sûtra (`amitayurdhyana_sutra_buddhism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (26)

- `3`: `2x` (content) “Day after day did he come. The World-Honoured One sent also his worthy”; `2y` (content) “At that time, Ajātaśatru asked the warder [pg 163] of the gate whether”
- `5`: `30` (content) “When the queen raised her head as she finished homage to Buddha, she s”; `31` (content) “‘My only prayer,’ she continued, ‘is this: O World-Honoured One, mayst”
- `6`: `32` (content) “‘Now I throw my five limbs down to the ground before thee, and seek fo”; `33` (content) “One was a country consisting of seven jewels, another was a country al”; `34` (content) “Thereupon Vaidehī again spoke to Buddha: ‘O World-Honoured One, althou”; `35` (content) “Thereupon the World-Honoured One gently smiled upon her, and rays of f”
- `7`: `36` (content) “At that moment, the mental vision of that exalted king was perfectly c”; `37` (content) “Then the World-Honoured One said: ‘Now dost thou not know, O Vaidehī, ”
- `8`: `38` (content) “‘I now proceed to fully expound them for thee in many parables, and th”; `39` (content) “‘These three groups as enumerated are called the pure actions (leading”; `3a` (content) “Buddha then addressed Ānanda as well as Vaidehī: ‘Listen carefully, li”
- `9`: `3b` (content) “‘It is by the power of Buddha only that one can see that pure land (of”; `3c` (content) “‘When one sees the state of happiness of that country in its highest e”; `3d` (content) “‘Thou hast not as yet obtained the divine eye and canst not perceive w”; `3f` (content) “Buddha then replied: ‘Thou and all other beings besides ought to make ”
- `10`: `3g` (content) “‘After thou hast thus seen the sun, let (that image) remain clear and ”; `3h` (content) “‘Next thou shouldst form the perception of water; gaze on the water cl”
- `11`: `3i` (lead-in) “‘When thou hast thus seen the water thou shouldst form the perception ”; `3j` (content) “‘After that has been done, thou wilt see the ground consisting of lapi”; `3k` (content) “‘Each jewel has rays of five hundred colours which look like flowers o”; `3l` (content) “‘When this perception has been formed, thou shouldst meditate on its (”
- `12`: `3m` (content) “‘One who has obtained the Samādhi (the state of supernatural calm) is ”; `3n` (content) “‘Thou shouldst remember, O Ānanda, the Buddha words of mine, and repea”; `3o` (content) “Buddha then spoke to Ānanda and Vaidehī: ‘When the perception of the l”
- `13`: `3p` (content) “‘Among the dense foliage there blossom various beautiful flowers, upon”; `3q` (content) “‘Next, you should perceive the water (of that country). The perception”
- `14`: `3r` (content) “‘In the Land of Highest Happiness there are waters in eight lakes; the”; `3s` (content) “‘In the midst of each lake there are sixty millions of lotus-flowers, ”; `3t` (content) “‘Each division of that (Buddha) country, which consists of several jew”
- `15`: `1556762295106` (content) “‘If one has experienced this, one has expiated the greatest sinful dee”; `3u` (content) “‘Listen carefully! listen carefully! Think over what you have heard! I”
- `17`: `3w` (lead-in) “‘On that tower there are miraculously found four posts with jewelled b”; `3x` (content) “‘The jewelled veil over these banners is like that of the celestial pa”; `3y` (content) “Buddha, turning to Ānanda, said: ‘These excellent flowers were created”; `3z` (content) “‘When you have perceived this, you should [pg 178] next perceive Buddh”
- `18`: `40` (content) “‘When you have seen the seated figure your mental vision will become c”; `41` (content) “‘When these perceptions are gained the images of Buddha and the Bodhis”; `42` (content) “‘He who has practised this meditation is freed from the sins (which ot”; `43` (content) “‘Further, when this perception is gained, you should next proceed to m”
- `19`: `44` (content) “‘Thou shouldst know, O Ānanda, that the body of Buddha Amitāyus is a h”; `45` (lead-in) “‘The white twist of hair between the eyebrows all turning to the right”; `46` (lead-in) “‘The eyes of Buddha are like the water of the four great oceans; the b”; `47` (lead-in) “‘All the roots of hair of his body issue forth brilliant rays which ar”; `48` (content) “‘The halo of that Buddha is like a hundred millions of the Great Chili”; `49` (content) “‘Buddha Amitāyus has eighty-four thousand signs of perfection, each si”; `4a` (content) “‘If you pass through this experience, you will at the same time see al”; `4b` (content) “‘Those who have practised this meditation are said to have contemplate”; `4c` (content) “‘Those who have practised this meditation will, when they die, be born”; `4d` (content) “‘Therefore those who have wisdom should direct their thought to the ca”; `4e` (content) “‘When you have seen Buddha Amitāyus distinctly, you should then furthe”
- `20`: `4f` (lead-in) “‘Within the circle of light emanating from his whole body, appear illu”; `4g` (content) “‘On the top of his head is a heavenly crown of gems like those that ar”; `4h` (lead-in) “‘The face of Bodhisattva Avalokiteśvara is like Jāmbūnada gold in colo”; `4i` (content) “‘The soft hair between the eyebrows has all the colours of the seven j”; `4j` (content) “‘(He wears) a garland consisting of eight thousand rays, in which is s”; `4k` (content) “Buddha, especially addressing Ānanda, said: ‘whosoever wishes to medit”; `4l` (lead-in) “‘Whosoever will meditate on Bodhisattva Avalokiteśvara [pg 184] should”; `4m` (lead-in) “‘All the other signs should also be meditated on according to their or”; `4n` (content) “‘Next you should meditate on Bodhisattva Mahāsthāma, whose bodily sign”; `4o` (content) “‘If one but sees the ray that issues from a single root of the hair of”; `4p` (content) “‘For this reason this Bodhisattva is named the Unlimited Light; it is ”; `4q` (content) “‘When this Bodhisattva sits down, all the countries of seven jewels at”; `4r` (lead-in) “‘Those who practise this meditation are freed from the sins (which wou”; `4s` (content) “‘Those who have practised this meditation do not live in an embryo sta”; `4t` (content) “‘After thou hast had this perception, thou shouldst imagine thyself to”
- `21`: `4u` (content) “‘If thou hast passed through this experience thou art said to have see”; `4v` (lead-in) “‘The innumerable incarnate bodies of Amitāyus, together with those of ”; `4w` (content) “Buddha then spoke to Ānanda and Vaidehī: ‘Those who wish, by means of ”
- `22`: `4x` (lead-in) “‘But by the efficacy of the ancient prayer of that Tathāgata, those wh”; `4y` (content) “‘Even the mere perceiving of the image of that Buddha brings to one im”; `4z` (content) “‘All beings can recognise either of the two Bodhisattvas by simply gla”; `51` (content) “Buddha then spoke to Ānanda and Vaidehī: ‘The beings who will be born ”
- `23`: `52` (content) “‘There are also three classes of beings who are able to be born in tha”; `53` (content) “‘When one who has practised (these merits) is about to be born in that”; `54` (content) “‘Next, the beings who will be born in the middle form of the highest g”
- `24`: `55` (content) “‘When that man looks at his own body, he will find himself seated on t”; `56` (content) “‘Then he will descend from that golden seat and worship Buddha with fo”; `57` (content) “‘Next are those who are to be born in the lowest form of the highest g”
- `27`: `5a` (content) “‘He will hear a voice in the sky, praising him and saying: “O son of a”; `5b` (content) “‘After seven days that flower will unfold again, when the believer wil”; `5c` (lead-in) “‘In the lapse of half a kalpa he will become an Arhat.”; `5d` (content) “‘Next are the beings who will be born in the lowest form of the middle”
- `28`: `5e` (content) “‘After seven days he will meet Aval. and Mahās., from whom he will lea”; `5f` (content) “‘Next are the beings who will be born in the highest form of the lowes”
- `29`: `5g` (content) “‘A wise man also will teach him to stretch forth his folded hands and ”; `5h` (content) “‘After the lapse of seven weeks, the lotus-flower will unfold, when th”; `5i` (content) “Buddha continued: ‘Next are the beings who will be born in the middle ”
- `31`: `5l` (content) “‘On hearing them he will rejoice and will immediately direct his thoug”; `5n` (content) “When Buddha had finished this speech, Vaidehī, together with her five ”
- `33`: `5p` (content) “Buddha said in his reply to Ānanda: ‘O Ānanda, this Sūtra should be ca”; `5q` (content) “‘In case of a son or a daughter of a noble family, the mere hearing of”; `5s` (lead-in) “When Buddha concluded these words, the worthy disciples Mahāyāna, and ”; `5t` (content) “Thereupon the World-Honoured One came back, walking through the open s”
- `34`: `5r` (content) “‘Know that he who remembers that Buddha is the white lotus (puṇḍarīka)”; `5u` (content) “Here ends the Sūtra of the Meditation on Buddha Amitāyus, spoken by Bu”

**Header numbers colliding with another block** (1)

- `1`: `bl5y` (struct) “”; `2u` (header) “Part I.”; `2v` (content) “Thus it was heard by me: At one time the Buddha dwelt in Rājagṛha, on ”; `3e` (header) “Part II.”; `50` (header) “Part III.”; `5m` (header) “Part IV.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `30`: `5j` (lead-in) “‘Having heard this Law, he will instantaneously direct his thought tow”; `5k` (content) “‘Lastly, the beings who will be born in the lowest form of the lowest ”

### Pahlavi Texts, Part II (`pahlavi_texts_part_ii_zoroastrianism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (25)

- `1.1.1`: `bl2x` (content) “THE Pahlavi texts selected for translation in this volume are distingu”; `bly6` (content) “For all divisions into chapters and sections the translator is respons”
- `1.1.2`: `bl2y` (content) “His name, Mânûskîhar, son of Yûdân-Yim (or Gûsndam), is mentioned in e”; `bly7` (content) “Italics are used for any English words which are not expressed, or ful”
- `1.1.3`: `bl2z` (content) “Regarding his family we learn, from Ep. I, iii, 10, vii, 5, that his f”; `bly9` (content) “Italics occurring in Oriental words, or names, represent certain pecul”
- `1.1.4`: `bl30` (content) “The age in which Mânûskîhar lived is decided by the date attached to h”; `blyc` (content) “In Pahlavi words the only vowels expressed in the original text are th”
- `1.1.5`: `bl31` (content) “His writings, therefore, represent the state of the Zoroastrian religi”; `blyg` (content) “In the translation, words in parentheses are merely explanatory of tho”
- `1.1.6`: `bl32` (content) “The codex K35, which was brought from Persia by the late Professor Wes”; `blyl` (content) “For the meaning of the abbreviations used in the notes, see the end of”
- `1.1.7`: `bl33` (content) “That BK is descended from K35 is proved by its containing several fals”; `blyr` (content) “The manuscripts mentioned are: —”
- `1.1.8`: `bl34` (content) “A third manuscript of the first class, which may be even more importan”; `bl4m` (content) “BK, an old imperfect copy of K35 written in Kirmân, but now in Bombay.”
- `1.1.9`: `bl35` (content) “A recent copy of TK exists in the library of the high priest of the Pa”; `bl4n` (content) “J (about 60 years old), belonging to Dastûr Jâmâspji Minochiharji in B”
- `1.1.10`: `bl36` (content) “The manuscripts of the second class appear to be all descended from an”; `bl4o` (content) “K35 (probably written A.D. 1572), No. 35 in the University Library at ”
- `1.1.11`: `bl37` (content) “This manuscript J belongs to the library of Dastûr Jâmâspji Minochihar”; `bl4p` (content) “M5 (written A.D. 1723), a MS. of miscellaneous texts in Persian letter”
- `1.1.12`: `bl38` (content) “Another copy of this codex, or of the Dâdistân-î Dînîk contained in it”; `bl4q` (content) “M14 (a modern copy of a MS. in the library of the Parsi high-priest in”
- `1.1.13`: `bl39` (content) “This latter manuscript consists of two volumes, written in 1865 and 18”; `bl4r` (content) “TD, a MS. of the Bundahis belonging to Môbad Tehmuras Dinshawji in Bom”
- `1.2.1`: `bl3l` (content) “The term Dâdistân-î Dînîk, ‘religious opinions or decisions,’ is a com”; `bl4u` (content) “SOME chapters of the enquiries which Mitrô-khûrshêd, son of Âtûrŏ-mahâ”
- `1.3.1`: `bl3u` (content) “It has been already stated (see pp. xiii, xiv) that Zâd-sparam, a youn”; `bly8` (content) “Through the name and power and assistance of the creator Aûharmazd and”
- `1.3.2`: `bl3v` (content) “In reply to this complaint, which was sent by a special courier (Ep. I”; `bl4x` (content) “To those of the good religion, who are these enquirers owing to devout”
- `1.3.3`: `bl3w` (content) “It would appear that Yazdân-pânak was not very successful in his missi”; `bl4y` (content) “As to that which you ordered to write about wishes for an interview an”
- `1.3.4`: `bl3x` (content) “The matter in dispute between Zâd-sparam and the orthodox Mazda-worshi”; `bl4z` (content) “That which you ordered to write about the way of knowing and understan”
- `1.3.5`: `bl3y` (content) “In his mode of dealing with this matter Mânûskîhar displays at once th”; `bl50` (content) “The desires expressed, and the good wishes as to what is mine and has ”
- `1.3.6`: `bl3z` (content) “Indirectly these epistles throw some light upon the condition of the M”; `bl51` (content) “As to that which you ordered to write in much friendship and commendat”
- `1.3.7`: `bl40` (content) “But the statements which are most important to the Pahlavi scholar, in”; `bl52` (content) “That which is about the lengthy writing of questions, as to your world”
- `1.4.1`: `bl43` (content) “For the sake of elucidating certain matters, mentioned in the writings”; `bl5d` (content) “First you ask thus: Why is a righteous man created better than the sta”
- `1.4.2`: `bl44` (content) “To a brief summary of the Avesta legends, relating to the ancient hero”; `bl5e` (content) “The reply is this, that the greatness and goodness of advance in wisdo”
- `1.4.3`: `bl45` (content) “The Nîrang-i Kustî, or ceremony of tying the sacred thread-girdle, is ”; `bl5f` (content) “And such rulers are great and pre-eminent; yet every man is not for th”
- `1.4.4`: `bl46` (content) “It having become necessary to ascertain with certainty whether the ter”; `bl5g` (content) “And through that excellent, unblemished, brotherly work such a ruler m”

**Opening invocations carrying a number** (2)

- `6.1`: `blqy` “In the name of the sacred beings.”
- `5.1.3`: `blr0` “In the name of the sacred beings.”

**Header numbers colliding with another block** (11)

- `1`: `bl2u` (header) “Sacred Books of the East, Vol. 18”; `blyv` (header) “Part II The Dâdistân-î Dînîk and the Epistles of Mânûskîhar”; `bl2v` (header) “Introduction”; `bl4d` (header) “Dâdistân-Î Dînîk”
- `1.1`: `bl2w` (header) “General Remarks”; `bl4e` (header) “Observations”
- `1.2`: `bl3k` (header) “The Dâdistân-Î Dînîk”; `bl4t` (header) “Dâdistân-Î Dînîk”
- `1.3`: `bl3t` (header) “The Epistles of Mânûskîhar”; `bl4v` (header) “Chapter I”
- `1.4`: `bl42` (header) “The Appendix”; `bl5c` (header) “Chapter II”
- … 6 more in the TSV

### Jaina Sutras Part I (`jaina_sutras_part_i_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (24)

- `1.1.26`: `bl6g` (content) “End of the First Lecture, called Knowledge of the Weapon.”; `bl6k` (content) “Quality[pg 15] is the seat of the root, and the seat of the root is qu”
- `1.1.67`: `bl7u` (content) “End of the Second Lecture, called Conquest of the World.”; `bl7y` (content) “The[pg 28] unwise sleep, the sages always wake. Know, that in this wor”
- `1.1.96`: `bl8s` (content) “End of the Third Lecture, called Hot and Cold.”; `bl8y` (content) “Having adopted (the law), one should not hide it, nor forsake it. Corr”
- `1.1.115`: `bl9i` (content) “End of the Fourth Lecture, called Righteousness.”; `bl9o` (content) “Such a man has much wrath, much pride, much conceit, much greed; he de”
- `1.1.141`: `blah` (content) “End of the Fifth Lecture, called Essence of the World.”; `blan` (content) “Now look at those who are born in these families to reap the fruit of ”
- `1.1.171`: `blbj` (content) “End of the Sixth Lecture, called the Cleaning.”; `blbp` (content) “Some here are not well instructed as regards the subject of conduct; f”
- `1.1.242`: `bldt` (content) “End of the Seventh Lecture, called Liberation.”; `bldz` (content) “More than four months many sorts of living beings gathered on his body”
- `1.2.138`: `blkh` (content) “End of the First Lecture, called Begging of Food. [pg 120]”; `blkn` (content) “But if the lodging contains only few eggs or few living beings, &c., t”
- `1.2.222`: `bln2` (content) “End of the Second Lecture, called Begging for a Couch.”; `bln7` (content) “When a monk or a nun knows that in a village or scot-free town, &c. (s”
- `1.2.285`: `bloz` (content) “End of the Third Lecture, called Walking.”; `blp4` (content) “Well considering (what one is to say), speaking with precision, one sh”
- `1.2.321`: `blq4` (content) “End of the Fourth Lecture, called Modes of Speech.”; `blq9` (content) “A monk or a nun should not resolve to go further than half a yogana to”
- `1.2.376`: `blrs` (content) “End of the Fifth Lecture, called Begging of Clothes.”; `blrx` (content) “A monk or a nun should not resolve to go farther than half a Yogana to”
- `1.2.413`: `blsy` (content) “End of the Sixth Lecture, called Begging for a Bowl.”; `blt3` (content) “He may beg for a domicile in a traveller’s hall, &c. [pg 172] (see II,”
- `1.2.453`: `blu7` (content) “End of the Seventh Lecture, called Regulation of Possession.”; `bluf` (content) “Avoiding these occasions to sin, a mendicant may choose one of these f”
- `1.2.551`: `blxg` (content) “End of the Second Part, called the Seven Lectures.”; `blxm` (content) “When in this Avasarpini era, the Sushama-sushama period, the Sushama p”
- `1.2.702`: `bl11w` (content) “End of the Fifteenth Lecture, called the Clauses.”; `bl123` (content) “Despised by such-like people, the wise man, with undisturbed mind, sus”
- `2.1.4`: `bl12r` (content) “End of the First Lecture.”; `bl12t` (content) “In that period, in that age the Venerable Ascetic Mahavira, having on ”
- `2.1.29`: `bl13i` (content) “End of the Second Lecture.”; `bl13k` (content) “In that night in which the embryo of the Venerable Ascetic Mahavira wa”
- `2.1.47`: `bl148` (content) “End of the Third Lecture.”; `bl14a` (content) “When the Kshatriyani Trisala, having seen these fourteen illustrious, ”
- `2.1.87`: `bl15e` (content) “End of the Fourth Lecture.”; `bl15g` (content) “In that night in which the Venerable Ascetic Mahavira was born, there ”
- `2.1.131`: `bl16q` (content) “End of the Fifth Lecture.”; `bl16v` (content) “In[pg 271] that period, in that age lived the Arhat Parsva, the people”
- `2.1.132`: `bl16s` (content) “End of the Life of Mahavira.”; `bl16w` (content) “In that period, in that age, in the first month of summer, in the firs”
- `2.1.149`: `bl17d` (content) “End of the Life of Parsva.”; `bl17g` (content) “In[pg 276] that period, in that age lived the Arhat Arishtanemi, the f”
- `2.1.159`: `bl17q` (content) “End of the Life of Arishtanemi.”; `bl17t` (content) “Since[pg 280] the time that the Arhat Nami died, &c. (all down to) fre”

**Header numbers colliding with another block** (33)

- `1.2`: `bl5j` (header) “First Lecture, Called Knowledge of the Weapon”; `blg4` (header) “Second Book First Part”
- `1.3`: `bl5k` (header) “First Lesson”; `blg6` (header) “First Lecture, Called Begging of Food”; `blu9` (header) “Second Book Second Part”
- `1.4`: `bl5n` (header) “Second Lesson”; `blg7` (header) “First Lesson”; `blub` (header) “The Seven Lectures”
- `1.5`: `bl5r` (header) “Third Lesson”; `blgs` (header) “Second Lesson”; `blud` (header) “Eighth Lecture”
- `1.6`: `bl5w` (header) “Forth Lesson”; `blh3` (header) “Third Lesson”; `bluv` (header) “Ninth Lecture”
- … 28 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.1.314`: `blg0` (lead-in) “End of the Ninth Lecture, called the Pillow of Righteousness.”; `blg1` (content) “End of the First Book.”

### Revival of Religious Learnings Vol-I (`revival_of_religious_sciences_v1_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (22)

- `1`: `bl2y` (lead-in) “About the Book”; `bl2z` (lead-in) “The book is the English version of Imam Ghazzali’s Ihya Ulum-ud-Din. I”; `bl30` (content) “Imam Abu-Hamid al-Ghazzali is unquestionably the greatest theologian o”; `bl31` (content) “Starting his religious life as orthodox, Al-Ghazzali soon turned Sufi,”; `bl32` (content) “The mysticism of this work vitalized the law its orthodoxy leavened th”; `bl36` (header) “THE BOOK OF WORSHIP”; `bl5e` (header) “PREFACE OF IMAM GHAZZALI”; `bl5f` (header) “Take whatever the Apostle gave you and keep away from whatever he forb”; `bl66` (header) “CHAPTER I: ACQUISITION OF KNOWLEDGE”
- `1.26`: `bl7i` (content) “PROOF OF REASON”; `blva` (content) “1) what is sought for its own intrinsic value,”
- `3.1`: `blav` (content) “Knowledge is not held to be blameworthy except for one of three reason”; `blq5` (content) “The Holy Prophet said: Religion is founded on cleanliness. He said: Cl”; `blqh` (header) “SECTION 1. PURIFICATION FROM IMPURITIES”
- `3.2`: `blaw` (content) “(2) The second reason is that if a science causes much harm to the acq”; `blq6` (content) “Those who possess insight understand by these sayings that the most im”; `blqr` (header) “SECTION 2. PURIFICATION OF BODY FROM EXCREMENTS”
- `3.3`: `blb1` (content) “(3) The third reason that this science is blameworthy is that it becom”; `blq7` (content) “PURITY HAS GOT FOUR STAGES”; `blre` (header) “SECTION 3. CLEANSING THE EXTERNAL BODILY GROWTHS AND DISCHARGES”
- `3.4`: `blb2` (content) “A certain person once complained to a physician that his wife was ster”; `blq8` (content) “(1) The first stage is the purification of the external organs from ex”
- `3.5`: `blb6` (content) “SECOND MATTER: CHANGE OF THE MEANINGS OF SOME WORDS CONNECTED WITH KNO”; `bl1er` (content) “(2) The second stage is the purification of the bodily organs from sin”
- `3.6`: `blb9` (content) “The people have changed the original meanings of the words Fiqh, Ilm, ”; `bl1fm` (content) “(3) The third stage is the purification of the heart from evil traits ”
- `3.7`: `blba` (content) “FIQH (religious learning). It has now the meaning of the science of un”; `bl1fn` (content) “(4) The fourth stage is the purifications of the innerself from everyt”
- `3.8`: `blbb` (content) “Someone asked Sa’ad-b-Ibrahim: Who is the greatest Faqih in Medina? He”; `bl1fo` (content) “This is the stage of the Prophets and the saints. Every item of cleanl”
- `3.9`: `blbe` (content) “ILM is the science of religion, the science of the knowledge of God an”; `blq9` (content) “To purify the mind from these evils comprises half of its actions and ”
- `3.10`: `blbg` (content) “TAUHID (unity of God). The present meaning of Tauhid is scholastic the”; `blqc` (content) “Abu Hurairah and some immates of Suffa said: We ate meal and when the ”
- `3.11`: `blbi` (content) “Tauhid is therefore a precious fruit which is engaged into several hus”; `blqf` (content) “These things have now changed. The people termed cleanliness for irone”
- `3.12`: `blbj` (content) “God says: Have you seen such one who takes his passion as God — 25:43Q”; `blqg` (content) “The following are three matters of external purity — (1) purification ”
- `4.1`: `blc8` (content) “Know, O dear readers, that after the Prophet, the rightly-guided Calip”; `blrt` (content) “Prayer is the pillar of religion and safeguard and root of religious b”; `blru` (header) “SECTION 1. EXCELLENCE OF PRAYER”
- `5.1`: `bld3` (content) “These manners comprise ten duties.”; `blx2` (content) “God placed Zakat next to prayer and it is the second pillar of Islam o”; `blx4` (header) “SECTION 1. DIFFERENT KINDS OF ZAKAT”
- `5.2`: `bld4` (content) “(1) The first duty of a student is to keep himself free from impure ha”; `blx3` (content) “Abu Zarr said: I came to the Prophet who was then seated in the shade ”; `blxh` (header) “SECTION 2. PAYMENT OF ZAKAT AND ITS CONDITIONS”
- `6.1`: `blen` (content) “We have enumerated the excellence of knowledge and learned men, but a ”; `bl104` (content) “Fast is one-fourth of faith, as the Prophet said: Fast is half of pati”; `bl10a` (header) “SECTION 1. SIX COMPULSORY DUTIES OF FAST”
- `6.2`: `bles` (content) “Hazrat Osman said: I fear most for this nation the hypocrite learned m”; `bl105` (content) “The Prophet said: There are two joys for a fasting man — one joy at th”; `bl10r` (header) “SECTION 2. SECRETS OF FAST”
- `6.3`: `bleu` (content) ““Woe to one who buys misguidance in lieu of guidance; “Woe more to one”; `bl106` (content) “The Prophet said about a fasting man: God says: O My angels, look to M”; `bl115` (header) “SECTION 3. OPTIONAL FAST AND ITS RULES”
- `6.4`: `blf1` (content) “The Prophet said regarding a wicked learned man: Some learned men will”; `bl109` (content) “God says: If you help God, God will help you and will make your feet f”
- `7.1`: `bll9` (content) “The noble nature of knowledge has been revealed through intellect. Int”; `bl11g` (content) “Pilgrimage is one of the pillars of Islam, the beauty of divine servic”; `bl11h` (header) “SECTION 1”

**Header numbers colliding with another block** (22)

- `1.8`: `bl6m` (content) “Sayings of the sages: Hazrat Ali said to Kamil: O Kamil, knowledge is ”; `blma` (header) “CHAPTER II: FOUNDATIONS OF BELIEF”
- `2.1`: `bl7u` (content) “The Holy Prophet said: To seek learning is compulsory on every Muslim.”; `blmb` (header) “SECTION 1. FOUNDATION OF BELIEF”
- `2.2`: `bl80` (content) “Knowledge is of two kinds — knowledge of practical religion and knowle”; `blmu` (header) “SECTION 2. EXCELLENCE OF BELIEF”
- `2.3`: `bl81` (content) “These duties deal with actions and prohibitions. As regards actions, i”; `blmy` (header) “SECTION 3. PROOF OF BELIEF”
- `2.4`: `bl82` (content) “AS TO PROHIBITIONS: It depends upon circumstances and new events. It i”; `blpq` (header) “SECTION 4. RULES OF ARTICLES OF BELIEF”
- … 17 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (43)

- `1.15`: `bl6x` (lead-in) “SAYINGS OF SAGES:”; `bl6y` (content) “Hazrat Ibn Abbas said: When I sought knowledge, I became degraded, but”
- `1.17`: `bl72` (lead-in) “EXCELLENCE OF TEACHING”; `bl73` (content) “QURAN: God says: When they return to them, they warn their people, so ”
- `1.22`: `bl7e` (lead-in) “SAYINGS OF SAGES”; `bl7f` (content) “Hazrat Omar said: He who learns a Hadis and induces one to act up to i”
- `2.3.6`: `bln6` (lead-in) “FIRST PILLAR: The basic principles of faith for knowledge of God.”; `bln8` (content) “(1) The first basic principle is to have knowledge of the existence of”
- `2.3.21`: `blnz` (lead-in) “SECOND PILLAR OF FAITH: God’s attributes based on ten principles.”; `blo1` (content) “(1) First basic principle. It is that God is Almighty as He said: He i”
- … 38 more in the TSV

### Kaushitaki Upanishad (`kaushtaki_upanishad_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (22)

- `1:7`: `1557902225428` (lead-in) “Brahman says to him: ‘Who am I?’ He shall answer: ‘That which is, the ”; `1557902211669` (content) “Brahman asks: ‘What is the true?’ He says to him: ‘What is different f”; `35` (content) “This is also declared by a verse: ‘This great Ṛshi, whose belly is the”
- `1:8`: `1557847921514` (lead-in) “Brahman says to him: ‘How dost thou obtain my male names?’ He should a”; `1557847909190` (lead-in) “Brahman asks: ‘How my female names?’ He should answer: ‘By speech (vāc”; `1557847902733` (lead-in) “Brahman asks: ‘How my neuter names?’ He should answer: ‘By mind (manas”; `1557847891354` (content) “‘How smells?’ ‘By the nose.’ ‘How forms?’ ‘By the eye.’ ‘How sounds?’ ”; `1557847879179` (lead-in) “Brahman says to him: ‘Water indeed is this my world, the whole Brahman”; `1557847865805` (content) “Whatever victory, whatever might belongs to Brahman, that victory and ”
- `2:2`: `1557847024859` (content) “Now to that prāṇa, which is Brahman, all these deities (mind, speech, ”; `3g` (content) “Prāṇa (breath) is Brahman, thus says Paiṅgya. And in that prāṇa, which”
- `2:4`: `3i` (lead-in) “‘The deity called prāṇa (breath) is the attainer, may it attain this f”; `3j` (lead-in) “‘The deity called the eye is the attainer, may it attain this for me f”; `3k` (lead-in) “‘The deity called the car is the attainer, may it attain this for me f”; `3l` (lead-in) “‘The deity called mind (manas) is the attainer of it, may it attain th”; `3m` (lead-in) “‘The deity called prajñā (knowledge) is the attainer of it, may it att”; `3n` (content) “Then having inhaled the smell of the smoke, and having rubbed his limb”; `3o` (content) “Now follows the Daiva Smara, the desire to be accomplished by the gods”
- `2:9`: `3t` (lead-in) “The children of him (who thus adores the moon) do not indeed die befor”; `3u` (lead-in) “Now for one to whom no son is born as yet. He mutters the three Ṛc ver”; `3v` (lead-in) “‘May milk, may food go to thee’‘That ray which the Ādityas gladden.’”; `3w` (content) “Having muttered these three Ṛc verses, he says: ‘Do not increase by ou”; `3x` (content) “Then (thirdly) let him worship on the day of the full moon the moon as”
- `2:13`: `41` (content) “This Brahman shines forth indeed when the sun is seen, and it dies whe”; `42` (content) “This Brahman shines forth indeed when the moon is seen, and it dies wh”; `43` (lead-in) “This Brahman shines forth indeed when the lightning flashes, and it di”; `44` (content) “Thus all these deities (i. e. fire, sun, moon, lightning), having ente”; `45` (content) “This Brahman shines forth indeed when one speaks with speech, and it d”
- `2:14`: `46` (content) “This Brahman shines forth indeed when one sees with the eye, and it di”; `47` (content) “This Brahman shines forth indeed when one hears with the ear, and it d”; `48` (content) “This Brahman shines forth indeed when one thinks with the mind, and it”; `1551692581626` (content) “Thus all these deities (the senses, &c.), having entered breath or lif”; `4a` (content) “Next follows the Niḥśreyasādāna (the accepting of the pre-eminence of ”
- `2:16`: `4c` (content) “Then the son walks round his father keeping his right side towards him”; `4d` (content) “If the father recovers, let him be under the authority of his son, or ”
- `3:2`: `4h` (content) “Then, however, Indra did not swerve from the truth, for Indra is truth”; `4i` (content) “Indra said: ‘I am prāṇa, meditate on me as the conscious self (prajñāt”
- `3:3`: `4j` (content) “(Pratardana said): ‘Some maintain here, that the prāṇas become one, fo”; `4k` (lead-in) “‘Thus it is indeed,’ said Indra, ‘but nevertheless there is a pre-emin”; `4l` (content) “Man lives deprived of speech, for we see dumb people. Man lives depriv”
- `3:4`: `4m` (content) “Of this, this is the proof, this is the understanding. When a man is t”; `4n` (content) “Speech gives up to him (who is absorbed in prāṇa) all names, so that b”
- `4:4`: `4y` (content) “Ajātaśatru said to him: ‘No, no! do not challenge me (to a disputation”; `4z` (content) “Bālāki said: ‘The person that is in the moon, on him I meditate.’”
- `4:5`: `50` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `51` (content) “Bālāki said: ‘The person that is in the lightning, on him I meditate.’”
- `4:8`: `56` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `57` (content) “Bālāki said: ‘The person that is in the air, on him I meditate.’”
- `4:9`: `58` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `59` (content) “Bālāki said: ‘The person that is in the fire, on him I meditate.’”
- `4:11`: `5c` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5d` (content) “Bālāki said: ‘The person that is in the mirror, on him I meditate.’”
- `4:12`: `5e` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5f` (content) “Bālāki said: ‘The person that is in the echo, on him I meditate.’”
- `4:13`: `5g` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5h` (lead-in) “Bālāki said: ‘The sound that follows a man, on that I meditate.”; `5i` (content) “Ajātaśatru said to him: ‘Do not challenge me on [pg 305] this. I medit”
- `4:15`: `5k` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5l` (content) “Bālāki said: ‘The person that is embodied, on him I meditate.’”
- `4:18`: `5q` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5r` (content) “Bālāki said The person that is in the left eye, on him I meditate.’”
- `4:19`: `5s` (content) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5t` (content) “After this Bālāki became silent. Ajātaśatru said to him: ‘Thus far onl”
- `4:20`: `5u` (content) “Then Ajātaśatru said to him: ‘Vainly did you challenge me, saying: ‘Sh”; `5v` (content) “Thereupon Bālāki came, carrying fuel in his hand, saying: ‘May I come ”; `5w` (content) “And Ajātaśatru said to him: ‘Where this person here slept, where he wa”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (6)

- `3:5`: `4o` (lead-in) “Now we shall explain how all things become one in that prajñā (self-co”; `4p` (content) “Speech is one portion taken out of prajñā (self-conscious knowledge), ”
- `4:6`: `52` (lead-in) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `53` (content) “Bālāki said: ‘The person that is in the thunder, on him I meditate.’”
- `4:7`: `54` (lead-in) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `55` (content) “Bālāki said: ‘The person that is in the ether, on him I meditate.’”
- `4:10`: `5a` (lead-in) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5b` (content) “Bālāki said: ‘The person that is in the water, on him I meditate.’”
- `4:16`: `5m` (lead-in) “Ajātaśatru said to him: ‘Do not challenge me on this. I meditate on hi”; `5n` (content) “Bālāki said: ‘The Self which is conscious (prājña), and by whom he who”
- … 1 more in the TSV

### The Texts of Taoism Part II (`test_taoism_part_ii_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (22)

- `a6.49`: `blkw` (content) “Book XI.”; `blky` (content) “Hwang-Tî and Kwang Khäng-dze, his master, who discourses on the myster”
- `a6.52`: `bll0` (content) “Book XII.”; `bll2` (content) “Hsü Yû’s reply to Yâo on the character of Nieh Khüeh and his unfitness”
- `a6.61`: `blla` (content) “Book XIII.”; `bllc` (content) “Confucius, wishing to deposit some writings in the royal Library, is r”
- `a6.65`: `bllf` (content) “Book XIV.”; `bllh` (content) “Pei-män Khäng and Hwang-Tî;—a description of Hwang-Tî’s music, the Hsi”
- `a6.72`: `blln` (content) “Book XVI.”; `bllq` (content) “Pars. 1-7. The Spirit-earl of the Ho and Zo of the Northern Sea;—on va”
- `a6.73`: `bllp` (content) “Book XVII.”; `bllr` (content) “The khwei, the millipede, the serpent, the wind, the eye, and the mind”
- `a6.80`: `bllx` (content) “Book XVIII.”; `bllz` (content) “Mr. Deformed and Mr. One-foot;—their submission under pain and in pros”
- `a6.85`: `blm3` (content) “Book XIX.”; `blm5` (content) “Confucius and the hunchback, who was skilful at catching cicadas with ”
- `a6.97`: `blmg` (content) “Book XX.”; `blmi` (content) “Î-liâo of Shih-nan and the marquis of Lû;—how the former presses it on”
- `a6.106`: `blmq` (content) “Book XXI.”; `blms` (content) “Wän-po Hsüeh-dze and the scholars of the Middle States.”
- `a6.116`: `bln1` (content) “Book XXII.”; `bln3` (content) “Nieh Khüeh questioning Phei-î about the Tâo.”
- `a6.126`: `blnc` (content) “Book XXIII.”; `blne` (content) “Käng-sang Khû and his disciples. He repudiates being likened by them t”
- `a6.130`: `blnh` (content) “Book XXIV.”; `blnj` (content) “Hwang-Tî, with six attending sages, in quest of the Tâo, meets with a ”
- `a6.140`: `blns` (content) “Book XXV.”; `blnu` (content) “The ancient sovereign Zän-hsiang; Thang, the founder of the Shang dyna”
- `a6.150`: `blo3` (content) “Book XXVI.”; `blo5` (content) “The big fish caught by the son of the duke of Zän.”
- `a6.157`: `blob` (content) “Book XXVII.”; `blod` (content) “Confucius and his other disciples:—on Zäng-dze and his twice taking of”
- `a6.162`: `bloh` (content) “Book XXVIII.”; `bloj` (content) “Counsel of Dze-hwâ Dze to the marquis Kâo of Han.”
- `a6.172`: `blos` (content) “Book XXIX.”; `blou` (content) “Dze-kang and Mân Kâu-teh (Mr. Full of Gain-recklessly-got) on the purs”
- `a6.175`: `blow` (content) “Book XXX.”; `bloz` (content) “Confucius and the Old Fisherman;—including the story of the man who tr”
- `a6.176`: `bloy` (content) “Book XXXI.”; `blp1` (content) “Par. 1. Lieh-dze and the effect of his over-manifestation of his attra”
- `a6.177`: `blp0` (content) “Book XXXII.”; `blp2` (content) “The sad fate of Hwan of Käng, a Confucianist, who resented his father’”
- `a6.186`: `blpa` (content) “Book XXXIII.”; `blpc` (content) “The method of Mo Tî and his immediate followers.”

**Header numbers colliding with another block** (1)

- `19`: `bl2z` (header) “Part II. Section XI. Kih Lo, Or ‘Perfect Enjoyment.’”; `bl3c` (header) “Book XIX.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `a6.36`: `blki` (lead-in) “Book VII.”; `blkj` (content) “Par. 1. Nieh Khüeh, Wang Î, and Phû-î-dze. That Shun was inferior in h”
- `a6.42`: `blkp` (lead-in) “Book VIII.”; `blkq` (content) “Par. 4. How two shepherd slaves lose their sheep in different ways. Th”

### Tablets of the Divine Plan (`tablets_of_the_divine_plan_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (19)

- `1.2`: `bl9j` (content) “These are the days of Naw-Rúz. I am always thinking of those kind frie”; `bl31` (content) “The Northeastern States on the shores of the Atlantic — Maine, New Ham”
- `2.2`: `bl9k` (content) “A few days ago an epistle was written to those divine believers, but b”; `bl38` (content) “In the Southern States of the United States, the friends are few, that”
- `3.2`: `bl9l` (content) “For some time past correspondence has been delayed, and this has been ”; `bl3g` (content) “Although in the states of Illinois, Wisconsin, Ohio, Michigan and Minn”
- `4.2`: `bla7` (lead-in) “O ye sons and daughters of the Kingdom:”; `bl9m` (content) “Day and night I have no other occupation than the remembrance of the f”; `bl3n` (content) “God says in the great Qur’án: “Verily God is the helper of those who h”
- `5.2`: `bl9o` (content) “O ye daughters and sons of the Kingdom:”; `bl3x` (content) “Upon you be greeting and praise!”
- `5.3`: `bl9n` (content) “Although in most of the states and cities of the United States, praise”; `bl41` (content) “Revealed on April 8, 1916, in the garden outside the Shrine of Bahá’u’”
- `6.2`: `bl9q` (content) “O ye blessed souls:”; `bl43` (content) “Therefore I direct you to that which is conducive to your heavenly con”
- `6.3`: `bl9p` (content) “I desire for you eternal success and prosperity and beg perfect confir”; `bl44` (content) “It is this: Alaska is a vast country; although one of the maidservants”
- `7.2`: `bl9s` (content) “O ye real Bahá’ís of America:”; `bl4o` (content) “Consider! The station and the confirmation of the apostles in the time”
- `7.3`: `bl9r` (content) “Praise be to His Highness the Desired One that ye have become confirme”; `bl4p` (content) “The range of your future achievements still remains undisclosed. I fer”
- `8.2`: `bl9v` (content) “O ye Apostles of Bahá’u’lláh!”; `bl5h` (content) “These souls are the armies of God and the conquerors of the East and t”
- `8.3`: `bl9u` (content) “May my life be sacrificed for you!”; `bl5i` (content) “Any soul from among the believers of Bahá’u’lláh who attains to this s”
- `8.4`: `bl9t` (content) “The Blessed Person of the Promised One is interpreted in the Holy Book”; `bl5j` (content) “O ye kind friends! Uplift your magnanimity and soar high toward the ap”
- `9.2`: `bl9x` (lead-in) “O ye real friends:”; `bl9w` (content) “All countries, in the estimation of the one true God, are but one coun”; `bl6k` (content) “Likewise, the continent of America is, in the eyes of the one true God”
- `10.2`: `bl9y` (content) “The philosophers of the ancients, the thinkers of the Middle Ages and ”; `bl71` (content) “Now these sixteen Southern States of the United States are situated in”
- `11.2`: `bla0` (content) “O ye old believers and intimate friends:”; `bl7i` (content) “These twelve Central States of the United States are like unto the hea”
- `11.3`: `bl9z` (content) “God says in the great Qur’án: “He specializes for His Mercy whomsoever”; `bl7j` (content) “Now praise be to God that Chicago and its environs from the beginning ”
- `12.2`: `bla2` (lead-in) “O ye friends and the maidservants of the Merciful, the chosen ones of ”; `bla1` (content) “The blessed state of California bears the utmost similarity to the Hol”; `bl83` (content) “Likewise, in the state of California and other Western states, wonderf”
- `13.2`: `bla4` (lead-in) “O ye kind friends and the maidservants of the Merciful:”; `bla3` (content) “In the great Qur’án, God says: “Thou shalt see no difference in the cr”; `bl8j` (content) “‘Abdu’l-Bahá during his journey and sojourn through that Dominion obta”

**Opening invocations carrying a number** (10)

- `4.1`: `bl3m` “He is God!”
- `5.1`: `bl3w` “He is God!”
- `6.1`: `bl42` “He is God!”
- `7.1`: `bl4n` “He is God!”
- `8.1`: `bl5g` “He is God!”
- `9.1`: `bl6j` “He is God!”
- `11.1`: `bl7h` “He is God!”
- `12.1`: `bl82` “He is God!”
- `13.1`: `bl8i` “He is God!”
- `14.1`: `bl91` “He is God!”

**Header numbers colliding with another block** (1)

- `1`: `bl2x` (header) “1 -”; `bl2z` (content) “Revealed on March 26, 1916, in ‘Abdu’l-Bahá’s room at the house in Bah”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `6.14`: `bl4f` (lead-in) “Supplication”; `bl4g` (content) “O Thou Incomparable God! O Thou Lord of the Kingdom! These souls are T”
- `8.23`: `bl62` (lead-in) “Supplication”; `bl63` (content) “O GOD, my God! Thou seest how black darkness is enshrouding all region”
- `14.2`: `bla6` (lead-in) “O ye heavenly souls, sons and daughters of the Kingdom:”; `bla5` (lead-in) “God says in the Qur’án: “Take ye hold of the Cord of God, all of you, ”; `bl92` (content) “In the contingent world there are many collective centers which are co”

### The Soul or Rational Psychology (`the_soul_or_rational_psychology_chistianity_ocean_f9c05033595f14a31e77eb71b662104c`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (19)

- `14.29`: `blce` (content) “Hope and Despair.”; `blca` (content) “(225.) The love of an immortality of fame, or as it is commonly called”
- `14.30`: `blcc` (content) “The Love of an Immortality of Fame after Death.”; `blc9` (content) “From these and very many other proofs it is plainly established that t”
- `14.33`: `blc7` (content) “Generosity; Magnanimity; what the Loves of the World and of the Body a”; `blc5` (content) “(228.) Mundane in a strict sense applies to the earth and the universe”
- `14.39`: `bldc` (content) “Pusillanimity and Folly.”; `bld7` (content) “Still other things may be deduced on this subject from the above descr”
- `14.41`: `bld9` (content) “Avarice.”; `bld4` (content) “(234.) But, indeed, if wealth is sought not for the sake of ends but f”
- `14.45`: `bld1` (content) “Prodigality; Liberality; Contempt of Wealth.”; `blcy` (content) “(238.) There are some who are compassionate from nature, some from use”
- `14.46`: `blcz` (content) “Pity and Charity.”; `bldn` (content) “Pity from use emulates pity from nature, for it passes as it were into”
- `14.53`: `bldh` (content) “Fear and Dread.”; `ble7` (content) “(242.) Since the life of the animus and the life of the mind exist fro”
- `14.58`: `ble2` (content) “Fortitude; Intrepidity; Courage (Animosity).”; `ble3` (content) “(247.) Nothing more difficult is known than to discover whether braver”
- `14.64`: `bldv` (content) “Indignation; Anger; Fury; Zeal.”; `bldt` (content) “(253.) Zeal therefore is a natural affection with which the superior m”
- `14.69`: `bldp` (content) “Patience; Gentleness; Tranquillity of Mind; Impatience.”; `bldi` (content) “(258.) Patience also, like anger, is written in the body; something mi”
- `14.74`: `bldb` (content) “Shame.”; `ble5` (content) “(263.) There is this other difference between fear and shame, that fea”
- `14.79`: `blcx` (content) “Envy.”; `blcs` (content) “(268.) Particular envy is common to all, and most natural, for it is f”
- `14.82`: `blam` (content) “Revenge.”; `blec` (content) “(271.) As envy is particular and general, so also is revenge and its l”
- `14.85`: `blfu` (content) “Misanthropy; Love of Solitude.”; `blfp` (content) “(274.) There are misanthropes special and particular those, namely, wh”
- `14.88`: `blfn` (content) “Cruelty.”; `blfo` (content) “(277.) In all revenge there is cruelty, for he who is desirous of reve”
- `14.91`: `blfj` (content) “Clemency.”; `blfh` (content) “(280.) But if the love be that of vices, falsities, vanities, impiety,”
- `14.93`: `blfg` (content) “Intemperance; Luxury.”; `blfe` (content) “(282.) Thus intemperance denotes a perverse state of mind, very limite”
- `14.100`: `blf8` (content) “Temperance; Parsimony; Frugality.”; `blf9` (content) “In a word, explore that you may understand what is true and what is go”

**Header numbers colliding with another block** (4)

- `1`: `bl3g` (header) “Part First. The Senses.”; `bl3f` (header) “Chapter I. - The Simple Fibre, that it is Celestial in its Nature.”
- `10`: `bl9k` (header) “Part Second. The Intellect.”; `bl9h` (header) “Chapter X. - The Pure Intellect.”
- `13`: `bl3n` (header) “Part Third. The Affections.”; `bl3m` (header) “Chapter XIII. - Concerning Harmonies, And The Affections Thence Origin”
- `26`: `blmx` (header) “Part Fourth. Immortality.”; `blmt` (header) “Chapter XXVI. Concerning Death.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (48)

- `14.5`: `blqq` (lead-in) “Joy.”; `blb7` (content) “(201.) Joy is a general affection of pleasure, for all pleasant affect”
- `14.6`: `blb8` (lead-in) “Sadness.”; `blb5` (content) “(202.) Sadness, however, which is also termed sorrow and distress of m”
- `14.7`: `blb6` (lead-in) “Loves in General.”; `blb3` (content) “(203.) There are many species of affections of the animus which are ca”
- `14.8`: `blb4` (lead-in) “Venereal Love.”; `blb1` (content) “(204.) The venereal act of love is a conjunction itself and union of t”
- `14.10`: `blaz` (lead-in) “Venereal Hatred and Aversion.”; `blb0` (content) “(206.) There are those who from nature, and those who from principle o”
- … 43 more in the TSV

### Sutra Collection (D) (`buddhasutra_d_buddhism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (18)

- `15.1`: `bl62` (content) “I heard thus:”; `blst` (content) “On one occasion the Blessed One was living near Savatthi at Jetavana a”
- `18.1`: `blkj` (content) “Thus have I heard:”; `bltz` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- `10.1`: `blnn` (content) “I have heard that on one occasion the Blessed One was staying among th”; `bloa` (content) “I heard thus:”
- `21.1`: `blq4` (content) “I heard thus:”; `blx2` (content) “At one time the Lord was staying near Savatthi in the Jeta Grove at An”
- `22.1`: `blqw` (content) “I heard thus:”; `blxt` (content) “Monks, there are these seven treasures. Which seven? The treasure of c”; `bly5` (content) “Dhaniya the cattleman:”
- `24.1`: `blss` (content) “Thus have I heard:”; `blz2` (content) “At Savatthi. “Monks, the earth property is inconstant, changeable, alt”
- `27.1`: `blty` (content) “I heard thus:”; `bl15z` (content) “I have heard that on one occasion the Blessed One was dwelling among t”
- `28.1`: `blua` (content) “Reverence to the Blessed One, the Holy One, the Fully-Enlightened One.”; `bl16i` (content) “At one time the Blessed One lived on vultures’ peak where pigs were mo”; `bl16q` (header) “The Story of Prince Dighavu”
- `20.1`: `blwh` (content) “A monk endowed with these seven qualities is worthy of gifts, worthy o”; `blx1` (content) “Thus have I heard:”
- `22.2`: `blxu` (content) “And what is the treasure of conviction? There is the case where a disc”; `bly7` (content) “The Buddha:”
- `22.3`: `blxv` (content) “And what is the treasure of virtue? There is the case where a disciple”; `bly9` (content) “Dhaniya:”
- `22.4`: `blxw` (content) “And what is the treasure of conscience? There is the case where a disc”; `blyb` (content) “The Buddha:”
- `22.5`: `blxx` (content) “And what is the treasure of concern? There is the case where a discipl”; `blyd` (content) “Dhaniya:”
- `22.6`: `blxy` (content) “And what is the treasure of listening? There is the case where a disci”; `blyf` (content) “The Buddha:”
- `22.7`: `blxz` (content) “And what is the treasure of generosity? There is the case of a discipl”; `bl1lp` (content) “Dhaniya:”
- `22.8`: `bly0` (content) ““And what is the treasure of discernment? There is the case where a di”; `blyj` (content) “The Buddha:”
- `22.9`: `bly1` (content) “These, monks, are the seven treasures. The treasure of conviction, the”; `blyl` (content) “Dhaniya:”
- `37.1`: `bl16h` (content) “I heard thus.”; `bl1ha` (content) “I have heard that on one occasion the Blessed One was staying near Sav”

**Header numbers colliding with another block** (30)

- `1`: `bl2s` (header) “Dahara Sutta”; `bl2t` (header) “Young”
- `6`: `bl30` (content) “You shouldn’t look down on — for being young — a noble warrior of cons”; `bl60` (header) “Dantabhuumisuttam”; `bl61` (header) “The Sphere of Training”
- `7`: `bl31` (content) “For it’s possible that this lord of human beings, this noble warrior, ”; `bl6y` (header) “Expanding Decades”
- `8`: `bl32` (content) “You shouldn’t look down on — for being young — a serpent you meet in v”; `blkd` (header) “Datthabba Sutta”; `blke` (header) “To Be Known”
- `9`: `bl33` (content) “As that potent snake slithers along with vibrant colors, it may someda”; `blki` (header) “The Demonstration of the Inconceivable State of Buddhahood Sutra”; `blnk` (header) “Devadaha Sutta”
- … 25 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `2.1`: `bl3d` (lead-in) “I heard thus:”; `bl3e` (content) “At one time the Blessed One lived with the Sakyas in Nigrodha’s monast”

### Bahá’u’lláh and the New Era (`baha_u_llah_and_the_new_era_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (17)

- `1.1`: `bl2v` (struct) “”; `bl3b` (content) “The National Spiritual Assembly of the Bahá’ís of the United States Oc”; `bl49` (content) “The Promised One of all the peoples of the world hath appeared. All pe”; `bl1ft` (content) “If we study the story of the “ascent of man” as recorded in the pages ”
- `1.5`: `bl3i` (signature) “Bahá’í Publishing Committee”; `bl3j` (content) “January 1937”; `bl4g` (content) “Surely the advent of this “Educator of Mankind,” in the latter days, w”
- `1.8`: `bl3o` (signature) “Bahá’í Publishing Committee”; `bl3p` (content) “December 1950”; `bl4k` (content) “A century which has no history and can have little or none. A century ”
- `5.49`: `bld8` (content) “O people of God! I admonish you to observe courtesy, for above all els”; `bld9` (content) “Again and again He repeats:—”
- `12.24`: `bl1em` (source) “— Some Answered Questions.”; `blxe` (content) “Of the story of Adam and Eve He says:—”; `bl1w7` (content) “The Bahá’í teachings with regard to body and soul, and the life after ”
- `15.31`: `bl1lb` (content) ““The Guardian of the Cause of God,” 2. “The Hands of the Cause of God,”; `bl334` (content) “‘Abdu’l-Bahá appointed His eldest grandson, Shoghi Effendi, to the res”
- `15.100`: `bl164` (content) “Unification of the whole of mankind is the hall-mark of the stage whic”; `bl1fr` (source) “— March 11, 1936.”; `bl165` (content) “[The above letters have been published in one volume entitled The Worl”
- `ep.14`: `bl1i1` (struct) “”; `bl1j2` (content) “A Selected Bibliography”; `bl16m` (content) “Epistle to the Son of the Wolf. 1st pocket-size ed. Translated by Shog”; `bl1jr` (content) “Works of ‘Abdu’l-Bahá”
- `ep.15`: `bl1ie` (content) “Works of Bahá’u’lláh”; `bl16n` (content) “Gleanings from the Writings of Bahá’u’lláh. 1st pocket-size ed. Transl”; `bl16v` (content) “‘Abdu’l-Bahá in London: Addresses and Notes of Conversations. London: ”; `bl174` (content) “Works of Shoghi Effendi”; `bl176` (content) “Compilations”
- `ep.16`: `bl16o` (content) “The Hidden Words. Translated by Shoghi Effendi. Wilmette, IL: Bahá’í P”; `bl16w` (content) “Paris Talks: Addresses Given By ‘Abdu’l-Bahá in Paris in 1911. Wilmett”; `bl175` (content) “The World Order of Bahá’u’lláh: Selected Letters. 1st pocket-size ed. ”
- `ep.17`: `bl16p` (content) “The Kitáb-i-Aqdas: The Most Holy Book. 1st pocket-size ed. Wilmette, I”; `bl16x` (content) “Promulgation of Universal Peace: Talks Delivered by ‘Abdu’l-Bahá durin”; `bl177` (content) “Bahá’u’lláh, the Báb, and ‘Abdu’l-Bahá. Bahá’í Prayers: A Selection of”; `bl17j` (content) “Mírzá Huseyn of Hamadán, The Tárikh-i-Jadid or New History of Mirzá ‘A”
- `ep.18`: `bl16q` (content) “The Kitáb-i-Íqán: The Book of Certitude. Translated by Shoghi Effendi.”; `bl16y` (content) “The Secret of Divine Civilization. 1st pocket-size ed. Translated by M”; `bl178` (content) “Bahá’u’lláh and ‘Abdu’l-Bahá. Bahá’í Scriptures: Selections from the U”; `bl17k` (content) “Nábil-i-A‘zam [Muhammad-i-Zarandí]. The Dawn-Breakers: Nabíl’s Narrati”
- `ep.19`: `bl16r` (content) “The Seven Valleys and the Four Valleys. New ed. Translated by Ali-Kuli”; `bl16z` (content) “Selections from the Writings of ‘Abdu’l-Bahá. Compiled by the Research”; `bl179` (content) “Other Works”; `bl17l` (content) “Wilhelm, Roy and Mountford J. Mills. Glimpses of ‘Abdu’l-Bahá. N.p., n”
- `ep.20`: `bl16s` (content) “The Summons of the Lord of Hosts: Tablets of Bahá’u’lláh. Wilmette, IL”; `bl170` (content) “Some Answered Questions. Compiled and translated by Laura Clifford Bar”; `bl17a` (content) “The Bahá’í World: An International Record, vol. 5, 1932–1934. Compiled”; `bl17m` (content) “Star of the West, Chicago Bahá’í News Service. vol. 3, 1912–1913.”
- `ep.21`: `bl16t` (content) “Tablets of Bahá’u’lláh revealed after the Kitáb-i-Aqdas. Compiled by t”; `bl171` (content) “Tablets of Abdul-Baha Abbas. 3 vols. New York: Bahai Publishing Societ”; `bl17b` (content) “Blomfield, Lady and Shoghi Effendi. “The Passing of ‘Abdu’l-Bahá, Exce”; `bl17n` (content) “Star of the West, Chicago Bahá’í News Service. vol. 8, 1917–1918.”
- `ep.22`: `bl172` (content) “A Traveler’s Narrative Written to Illustrate the Episode of the Báb. T”; `bl17c` (content) “Browne, Edward G. “The Bábís of Persia: Their Literature and Doctrines”; `bl17o` (content) “• • •”
- `ep.23`: `bl173` (content) “Will and Testament of ‘Abdu’l-Bahá. Wilmette, IL: Bahá’í Publishing Tr”; `bl17d` (content) “Chase, Thornton. In Galilee. 2nd ed. Chicago: Bahá’í Publishing Societ”

**Header numbers colliding with another block** (19)

- `1`: `bl2t` (header) “An Introduction to the Bahá’í Faith”; `bl47` (header) “– 1 –”
- `2.7`: `bl1af` (struct) “”; `bl5p` (content) “As a youth He was noted for great personal beauty and charm of manner,”
- `3`: `bl48` (header) “The Glad Tidings”; `bl5q` (header) “Declaration”; `bl5v` (header) “Claims of the Báb”; `bl64` (header) “Tomb on Mount Carmel”; `bl6d` (header) “Resurrection, Paradise, and Hell”; `bl6n` (header) “– 3 –”; `bl6r` (header) “Birth and Early Life”
- `4.2`: `bl4a` (source) “–‘Abdu’l-Bahá”; `bl9d` (header) “Birth and Childhood”; `bl1hz` (content) “Abbás Effendi, Who afterwards assumed the title of ‘Abdu’l-Bahá (i.e. ”
- `4`: `bl72` (header) “Exile to Baghdád”; `bl76` (header) “Two Years in the Wilderness”; `bl7a` (header) “Opposition of Mullás”; `bl7h` (header) “Letters to Kings”; `bl7m` (header) “Imprisonment in ‘Akká”; `bl80` (header) “Life at Bahjí”; `bl8o` (header) “His Mission”; `bl99` (header) “– 4 –”; `bl9a` (header) “‘Abdu’l-Bahá: The Servant of Bahá”
- … 14 more in the TSV

**Signature / closing lines carrying a number** (2)

- `1.11`: `bl3u` (signature) “Bahá’í Publishing Trust”; `bl4o` (content) “Bahá’u’lláh taught that the Prophet, or “Manifestation of God,” is the”
- `1.13`: `bl3x` (signature) “Bahá’í Publishing”; `bl1fv` (content) “Bahá’u’lláh declared, plainly and repeatedly, that He was the long-exp”

**Source / citation lines carrying a number** (141)

- `2.5`: `bl43` (source) “J. E. ESSLEMONT”; `bl44` (source) “Fairford, Cults, By Aberdeen”; `bl5m` (content) “Yet, notwithstanding all this, the light of spiritual life was not ext”
- `2.3`: `bl1ag` (source) “— Signs of the Times.”; `bl5k` (content) “Yet, in the eighteenth and nineteenth centuries she had sunk to a cond”
- `1.10`: `bl1ah` (source) “— Frederick the Great, Book I, Chap. 1.”; `bl1fu` (content) “What is the cause of this sudden awakening throughout the world? Bahá’”
- `1.21`: `bl1ai` (source) “(Written by ‘Abdu’l-Bahá for this chapter.)”; `bl50` (content) “Bahá’u’lláh has written much in explanation of the prophecies of old, ”
- `1.25`: `bl1aj` (source) “— Deut. xviii, 22.”; `bl55` (content) “Beware of false prophets, which come to you in sheep’s clothing, but i”
- … 136 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (20)

- `3.45`: `bl8a` (lead-in) “He writes in the Book of Íqán:—”; `bl8b` (content) “We have already in the foregoing pages assigned two stations unto each”
- `4.70`: `bl1bf` (lead-in) “And again:—”; `bl1bg` (content) ““ … refer ye whatsoever ye understand not in the Book to Him Who hath ”
- `5.22`: `bl1br` (source) “— Tablet of the World.”; `bl1bo` (lead-in) “And again:—”; `bl1bp` (content) ““Blessed is he who prefers his brother before himself; such an one is ”
- `6.41`: `bl1ci` (source) “(Article in Fortnightly Review, Jan.–June 1911, by Miss E. S. Stevens.”; `blfp` (lead-in) “In another talk He said:—”; `blfq` (content) “In the highest prayer, men pray only for the love of God, not because ”
- `7.38`: `bl1cx` (source) “— Tablet to a Physician.”; `bli0` (lead-in) “And ‘Abdu’l-Bahá says:—”; `bl1cy` (content) ““Joy gives us wings. In times of joy our strength is more vital, our i”
- … 15 more in the TSV

### The Yasna (`avesta_yasna_zoroastrianism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (15)

- `1.2`: `bl2z` (content) “I announce and I (will) complete (my Yasna) to the Good Mind, and to R”; `blkx` (content) “It is weal; it is weal to this (man),”; `bl7m` (content) “I offer the Myazda (of the) meat-offering with a complete and sacred o”; `bl80` (content) “And Zarathustra asked him: Who art thou, O man! who art of all the inc”
- `1.3`: `bl30` (content) “And I announce and I (will) complete (my Yasna) to the Asnya, the day-”; `blky` (content) “When toward Righteousness Best there is right.”; `bl9c` (content) “I praise thee with my voice, while I grasp at first thy shoots. At thy”; `blcj` (source) “(As the Ahû is excellent, so (is) the Ratu (one who rules) from the ri”
- `1.5`: `bl32` (content) “I announce and complete (my Yasna) to Uzayêirina the holy lord of the ”; `blb4` (content) “Thus the two spirits thought, thus they spoke, and thus they did;”; `blbq` (content) “(Response): So let the Ratu from his righteousness, holy and learned, ”; `blby` (content) “And we worship the heaven and the earth of blessed gift, and the bount”
- `1.6`: `bl33` (content) “I announce and complete (my Yasna) to Aiwisrûthrima (and) Aibigaya the”; `blar` (content) “Thus and so in very deed might Ahura Mazda have indicated to Zarathust”; `blas` (content) “And so I myself, in whatsoever circumstances I may be placed, as a wor”; `blbh` (lead-in) “The Ratu speaks: As an Ahû (revered and) to be chosen, the Zaotar spea”; `blbi` (content) “The Zaotar: So let the Ratu from his Righteousness, holy and learned, ”
- `1.8`: `bl35` (content) “And I announce and I complete (my Yasna) to the Mâhya, the monthly fes”; `blb8` (content) “A blessing is the Right called the best, there is weal, there is weal ”
- `1.9`: `bl36` (content) “And I announce and complete (my Yasna) to the Yâirya, yearly feasts, t”; `bl9k` (content) “Who as a tender son caresses H(a)oma, forth to the bodies of such pers”
- `1.16`: `bl3d` (content) “And I announce and complete (my Yasna) to these places and these lands”; `blcx` (content) “The evil one at once arose (to oppose Him), but He (Ahura) repelled th”; `blcy` (content) “CATECHETICAL ZAND”
- `1.17`: `bl3e` (content) “And I announce and complete (my Yasna) to that lofty lord who is the r”; `bl9u` (content) “To Obedience am I given, and to deaf disobedience, not; to the saint d”
- `1.20`: `bl3h` (content) “O (thou) Hâvani, holy lord of the ritual order, and Sâvanghi, Rapithwi”; `bl8k` (lead-in) “This second blessing I beseech of thee, O H(a)oma, thou that drivest d”; `bl8l` (content) “This third blessing I beseech of thee, O H(a)oma, thou that drivest de”
- `1.21`: `bl3i` (content) “If I have offended thee whether by thought, or word, or deed, whether ”; `bl8n` (content) “This fifth blessing, O H(a)oma, I beseech of thee, thou that drivest d”
- `1.23`: `bl3k` (content) “I would confess myself a Mazda-worshipper, of Zarathustra’s order, a f”; `bl8r` (content) “H(a)oma grants to those (how many!) who have long sat searching books,”
- `1.26`: `bll2` (content) “(The Zaotar again): So let the Ratu from his Righteousness, holy and l”; `bld8` (content) “CATECHETICAL ADDITION”; `blda` (content) “[pg 268] The holy and the best, the one who rules with no capricious t”
- `47.2`: `blh4` (content) “Propitiation be to Sraosha, Obedience the blessed, the mighty, the inc”; `blh5` (content) “[pg 298] I.”
- `61.2`: `blix` (content) “And how shall we drive the Demon of the Lie from hence from us Aye, ho”; `blki` (content) “What is the completed delivery of the Gâthas 2. Upon this Zarathustra ”
- `61.19`: `blkq` (content) “And we sacrifice to the Praise-songs of the Yasna which were the produ”; `blkr` (content) “And we sacrifice to this Baresman having the Zaothra with it, and its ”; `blks` (content) “And we sacrifice to the souls of the dead, [which are the Fravashis of”

**Header numbers colliding with another block** (3)

- `1`: `bl2w` (header) “Yasna I.”; `bl7h` (content) “OFFERING OF THE MEAT-OFFERING IN PARTICULAR.”; `bl99` (header) “[pg 240] Yasna X.”
- `2`: `bl3m` (header) “Yasna II.”; `bl7x` (header) “Yasna IX.”; `bla2` (header) “Yasna XI.”; `blak` (header) “Yasna XII (Sp. XIII).”; `blax` (header) “Yasna XIII (Sp. XIV).”; `blbb` (header) “Yasna XIV (Sp. XV).”; `blbk` (header) “Yasna XV (Sp. XVI).”; `blbs` (header) “Yasna XVI (Sp. XVII).”; `blc5` (header) “Yasna XVII.”; `blch` (header) “Yasna XIX.”; `bld3` (header) “Yasna XX.”; `bldc` (header) “Yasna XXI.”; `bldh` (header) “[pg 270] Yasna XXII.”
- `59`: `blk5` (header) “[pg 325] Yasna LXIX (Sp. LXVIII).”; `blk8` (header) “Yasna LXX (Sp. LXIX).”

**Source / citation lines carrying a number** (1)

- `1.11`: `bl38` (content) “And I announce and complete (my Yasna) to the two, to Ahura and to Mit”; `blc3` (source) “(Response of the individual worshipper (?).) Wherefore whichever of pe”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (6)

- `1.1`: `bl2x` (lead-in) “THE SACRIFICE COMMENCES.”; `bl2y` (content) “I announce and I (will) complete (my Yasna) to Ahura Mazda, the Creato”; `blde` (source) “(The YêNhê. (To that one) of beings do we offer, whose superior (fidel”
- `1.25`: `bll0` (lead-in) “(The Zaotar speaks As the Ahû to be [pg 213] (revered and) chosen, let”; `bll1` (content) “(The Ratu responds): As the Ahû to be (revered and) chosen, let him wh”
- `6.19`: `bll4` (lead-in) “And we worship the wood-billets, and the perfume and thee, the Fire, A”; `bl6e` (content) “And we worship the good, heroic, bountiful Fravashis of the saints.”
- `7.22`: `bl76` (lead-in) “And I offer the wood-billets with the perfume for Thy propitiation, th”; `bl77` (content) “And I offer with a complete and sacred offering to the Fravashis of th”
- `35.0`: `bllb` (lead-in) “YASNA HAPTANGHÂITI.”; `bler` (content) “[pg 282] PRAISE TO AHURA AND THE IMMORTALS; PRAYER FOR THE PRACTICE AN”
- … 1 more in the TSV

### Selections from the Writings of the Báb (`selections_from_the_writings_of_the_bab_bahai_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (13)

- `1.2`: `bl2y` (content) “In the name of the Sovereign Lord, the Lord of Power.”; `bl3b` (content) “May the glances of Him Whom God shall make manifest illumine this lett”
- `1.3`: `bl2z` (content) “Glorified is He before Whom all the dwellers of earth and heaven bow d”; `bl3c` (lead-in) “He is the Most Glorious.”; `bl3d` (content) “He is God, no God is there but Him, the Almighty, the Best-Beloved. Al”; `blty` (header) “Tablet to the First Letter of the Living”; `bl3i` (content) “This is that which We have revealed for the First Believer in Him Whom”
- `1.4`: `bl3j` (lead-in) “In the Name of the Almighty, the Best-Beloved.”; `bl3k` (content) “Lauded and glorified is He Who is the sovereign Lord of the kingdoms o”; `bl3t` (content) “The substance wherewith God hath created Me is not the clay out of whi”
- `4.9`: `blf9` (content) “Say: God sufficeth all things above all things, and nothing in the hea”; `blfc` (content) “It is recorded in a tradition that of the entire concourse of the Chri”
- `6.10`: `blj1` (content) “Verily I am God, no God is there but Me, and aught except Me is but My”; `blj9` (content) “He is God, the Sovereign Lord, the All-Glorious.”
- `6.11`: `blja` (content) “Say: Praise be to God Who graciously enableth whomsoever He willeth to”; `bljf` (content) “He is God, the Supreme Ruler, the Sovereign Truth, He Whose help is im”
- `6.12`: `bljg` (content) “Glorified is He to Whom pertaineth the dominion of the heavens and of ”; `bljq` (content) “O thou who art the chosen one among women!”
- `6.16`: `blk6` (content) “Glory be unto Him Who is the Lord of all that are in the heavens and o”; `blk8` (content) “It behooveth you to await the Day of the appearance of Him Whom God sh”
- `7.1.2`: `blkf` (content) “Hallowed be the Lord in Whose hand is the source of dominion. He creat”; `blkg` (content) “Say: God sufficeth unto me; He is the One Who holdeth in His grasp the”
- `7.29`: `blnk` (content) “All praise be unto God Who was Ever-Existent ere created things were c”; `blnt` (content) “Thou art God, no God is there but Thee.”
- `7.30`: `blnu` (content) “Lauded and glorified art Thou, O Lord my God! Thou art supreme over th”; `blo0` (content) “Glory be unto Thee, O Lord my God! I beg Thee to forgive me and those ”
- `7.36`: `blos` (content) “Lauded and glorified art Thou, O Lord! Both the world of existence and”; `blp4` (content) “O my God, my Lord and my Master! I have detached myself from my kindre”
- `7.42`: `blpk` (content) “Say: O my God! O Thou Who art the Maker of the heavens and of the eart”; `blpo` (content) “Glorified art Thou, O Lord my God! Thou art in truth the King of kings”

**Opening invocations carrying a number** (9)

- `1.2`: `bl2y` “In the name of the Sovereign Lord, the Lord of Power.”
- `6.9`: `blj0` “In the Name of God, the Most Exalted, the Most High.”
- `6.10`: `blj9` “He is God, the Sovereign Lord, the All-Glorious.”
- `6.11`: `bljf` “He is God, the Supreme Ruler, the Sovereign Truth, He Whose help is implored by all.”
- `6.15`: `blk5` “He is the Almighty.”
- `7.1`: `blke` “In the Name of God, the Lord of overpowering majesty, the All-Compelling.”
- `7.28`: `blnj` “In the Name of God, the Compassionate, the Merciful.”
- `7.35`: `blor` “He is God, the Sovereign Ruler, the Ever-Living, He Whose help all men implore.”
- `7.41`: `blpj` “In the Name of Thy Lord, the Creator, the Sovereign, the All-Sufficing, the Most Exalted, He Whose h”

**Header numbers colliding with another block** (7)

- `1`: `bltw` (struct) “”; `bl39` (header) “1.2 -”; `bl3g` (header) “1.3 -”; `bl3r` (header) “1.4 -”; `bl4c` (header) “1.5 -”; `bl52` (header) “1.6 -”; `bl5k` (header) “1.7 -”; `bl5p` (header) “1.8 -”; `bl61` (header) “1.9 -”
- `2`: `blqa` (header) “Excerpts from the Qayyúmu’l-Asmá’”; `bl6d` (header) “2.1 -”; `bl6h` (header) “2.2 -”; `bl6k` (header) “2.3 -”; `bl6q` (header) “2.4 -”; `bl6u` (header) “2.5 -”; `bl6z` (header) “2.6 -”; `bl72` (header) “2.7 -”; `bl74` (header) “2.8 -”; `bl76` (header) “2.9 -”; `bl78` (header) “2.10 -”; `bl7a` (header) “2.11 -”; `bl7d` (header) “2.12 -”; `bl7f` (header) “2.13 -”; `bl7h` (header) “2.14 -”; `bl7m` (header) “2.15 -”; `bl7o` (header) “2.16 -”; `bl7q` (header) “2.17 -”; `bl7u` (header) “2.18 -”; `bl7x` (header) “2.19 -”; `bl80` (header) “2.20 -”; `bl83` (header) “2.21 -”; `bl85` (header) “2.22 -”; `bl87` (header) “2.23 -”; `bl89` (header) “2.24 -”; `bl8c` (header) “2.25 -”; `bl8e` (header) “2.26 -”; `bl8g` (header) “2.27 -”; `bl8k` (header) “2.28 -”; `bl8r` (header) “2.29 -”; `bl8u` (header) “2.30 -”; `bl8x` (header) “2.31 -”; `bl91` (header) “2.32 -”; `bl93` (header) “2.33 -”; `bl98` (header) “2.34 -”; `bl9c` (header) “2.35 -”; `bl9f` (header) “2.36 -”; `bl9i` (header) “2.37 -”; `bl9l` (header) “2.38 -”; `bl9o` (header) “2.39 -”; `bl9r` (header) “2.40 -”; `bl9u` (header) “2.41 -”; `bl9w` (header) “2.42 -”; `bla0` (header) “2.43 -”; `bla3` (header) “2.44 -”; `bla6` (header) “2.45 -”; `bla8` (header) “2.46 -”; `blac` (header) “2.47 -”; `blag` (header) “2.48 -”; `blai` (header) “2.49 -”; `blak` (header) “2.50 -”; `blao` (header) “2.51 -”; `blaq` (header) “2.52 -”; `blat` (header) “2.53 -”; `blaw` (header) “2.54 -”; `blb0` (header) “2.55 -”; `blb2` (header) “2.56 -”; `blb4` (header) “2.57 -”; `blb6` (header) “2.58 -”
- `3`: `blqc` (header) “Excerpts from the Persian Bayán”; `blba` (header) “3.1 -”; `blbd` (header) “3.2 -”; `blbi` (header) “3.3 -”; `blbl` (header) “3.4 -”; `blbn` (header) “3.5 -”; `blbq` (header) “3.6 -”; `blbt` (header) “3.7 -”; `blbx` (header) “3.8 -”; `blc2` (header) “3.9 -”; `blc6` (header) “3.10 -”; `blcb` (header) “3.11 -”; `blcf` (header) “3.12 -”; `blci` (header) “3.13 -”; `blcm` (header) “3.14 -”; `blco` (header) “3.15 -”; `blcs` (header) “3.16 -”; `blcu` (header) “3.17 -”; `blcw` (header) “3.18 -”; `blcy` (header) “3.19 -”; `bld0` (header) “3.20 -”; `bld3` (header) “3.21 -”; `bld5` (header) “3.22 -”; `bld7` (header) “3.23 -”; `blda` (header) “3.24 -”; `bldf` (header) “3.25 -”; `bldh` (header) “3.26 -”; `bldl` (header) “3.27 -”; `bldo` (header) “3.28 -”; `blds` (header) “3.29 -”; `bldv` (header) “3.30 -”; `bldz` (header) “3.31 -”; `ble1` (header) “3.32 -”; `ble4` (header) “3.33 -”; `ble6` (header) “3.34 -”; `ble9` (header) “3.35 -”; `blec` (header) “3.36 -”; `blef` (header) “3.37 -”; `blei` (header) “3.38 -”; `blek` (header) “3.39 -”
- `4`: `blqe` (header) “Excerpts from the Dalá’il-i-Sab‘ih (The Seven Proofs)”; `blep` (header) “4.1 -”; `bler` (header) “4.2 -”; `blet` (header) “4.3 -”; `blev` (header) “4.4 -”; `blex` (header) “4.5 -”; `blf1` (header) “4.6 -”; `blf4` (header) “4.7 -”; `blf7` (header) “4.8 -”; `blfb` (header) “4.9 -”; `blff` (header) “4.10 -”
- `5`: `blqg` (header) “Excerpts from the Kitáb-i-Asmá’ (The Book of Names)”; `blfo` (header) “5.1 -”; `blfu` (header) “5.2 -”; `blfy` (header) “5.3 -”; `blg2` (header) “5.4 -”; `blg4` (header) “5.5 -”; `blg7` (header) “5.6 -”; `blg9` (header) “5.7 -”; `blgi` (header) “5.8 -”; `blgo` (header) “5.9 -”; `blgt` (header) “5.10 -”; `blgx` (header) “5.11 -”; `blh2` (header) “5.12 -”; `blh5` (header) “5.13 -”; `blh9` (header) “5.14 -”; `blhd` (header) “5.15 -”; `blhi` (header) “5.16 -”; `blhk` (header) “5.17 -”; `blho` (header) “5.18 -”; `blhq` (header) “5.19 -”; `blhv` (header) “5.20 -”; `blhz` (header) “5.21 -”
- … 2 more in the TSV

**Source / citation lines carrying a number** (40)

- `2.5.4`: `bl6y` (content) “Some of the people of the city have declared: “We are the helpers of G”; `blqr` (source) “Chapter III.”
- `2.8`: `blqm` (source) “Chapter V.”; `bl75` (content) “Do men imagine that We are far distant from the people of the world? N”
- `2.9`: `blqt` (source) “Chapter VII.”; `bl77` (content) “Do not say, “How can He speak of God while in truth His age is no more”
- `2.10`: `blqu` (source) “Chapter IX.”; `bl79` (content) “Glorified is He besides Whom there is none other God. In His grasp He ”
- `2.11`: `blqv` (source) “Chapter XIII.”; `bl7b` (content) “O ye servants of God! Verily, be not grieved if a thing ye asked of Hi”
- … 35 more in the TSV

### White Yajur Veda (`white_yajurveda_ocean_hinduism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (13)

- `6:23`: `9o` (content) “These waters teem with sacred food: rich in that food, one longs for t”; `9q` (content) “Thee for the heart, thee for the mind, thee for the heaven, thee for t”
- `8:17`: `c0` (content) “May this please Savitar and liberal Dhātar, Prajāpati the Treasure-Gua”; `ca` (content) “O restless Purifying Bath, thou glidest onward restlessly. May I with ”
- `16:31`: `qp` (content) “Homage to the swift, and to the active be homage, and to the hasty and”; `qs` (content) “Homage to him in woods and to him in bushes, homage! Homage to him as ”
- `19:23`: `xe` (content) “Symbol of milk are barley-grains, symbol of curd are jujube-fruits. Wh”; `xj` (content) “By sacrificial texts are gained the Grahas, and by the Grahas lauds an”
- `19:33`: `xo` (content) “All essence of thine own in plants collected, all strength of Soma whe”; `xt` (content) “Agni, thou poorest life: send down upon us food and vigorous strength.”
- `21:43`: `138` (content) “Let the Hotar worship the Asvins. Let them eat of the he-goat, the sac”; `13a` (content) “Let the Hotar worship Indra, etc., as in 44 mutatis mutandis.”
- `22:23`: `14g` (content) “Hail to vital breath! Hail to out-breathing! Hail to diffusive breath!”; `14l` (content) “Hail to the lunar asterisms! Hail to those connected with the lunar as”
- `28:21`: `1bp` (content) “The grassy robe of water-plants, divine, hath heightened Indra’s stren”; `1bs` (content) “Let the Priest worship Agni, Indra, kindled, splendidly kindled, excel”
- `29:21`: `1d2` (content) “Symmetrical in flank, with rounded haunches, mettled like heroes, the ”; `1d5` (content) “The Steed is come unto the noblest mansion, is come unto his Father an”
- `29:59`: `1dv` (content) “He lays his blows upon their backs, He deals his strokes upon their th”; `1e4` (content) “To Agni Anīkavān is sacrificed a red-marked ox; two with white spots b”
- `33:38`: `1h6` (content) “In the sky’s lap the Sun this form assumeth that Varuna and Mitra may ”; `1ik` (content) “Approach ye, and be near to us. Drink, O ye Asvins, of the mead. Draw ”
- `34:15`: `1j9` (content) “Worthy to be revered, O Agni, God, preserve our wealthy patrons with t”; `1jb` (content) “In Idā’s place, the centre of the earth, will we deposit thee, That, A”
- `36:21`: `1lu` (content) “Homage to thee the lightning flash, homage to thee the thunder’s roar!”; `1lx` (content) “Through hundred autumns may we see that bright Eye, God-appointed, ris”

**Header numbers colliding with another block** (1)

- `1`: `bl1oq` (struct) “”; `2v` (header) “Book the First.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `27:13`: `1a4` (lead-in) “Tanūnapāt the Asura, all-possessing, God among Gods, the God with mead”; `1a5` (content) “With mead to sacrifice thou comest, Agni, earnest as friendly- minded ”
- `27:26`: `1ah` (lead-in) “What time the mighty waters came containing the universal germ, produc”; `1ai` (content) “Who in his might surveyed the floods enclosing productive force and ge”

### Fountain of Wisdom : Tablets of Bahá’u’lláh (`tablets_of_baha_u_llah_revealed_after_the_kitab_i_73dc612de775bf9a04f878e400a2ce69`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (12)

- `2.1`: `bl37` (content) “This is the Most Holy Tablet sent down from the holy kingdom unto the ”; `bl39` (content) “This is an Epistle from Our presence unto him whom the veils of names ”
- `2.2`: `bl38` (content) “In the name of the Lord, the Lord of great glory.”; `bl3a` (content) “Say, O followers of the Son! Have ye shut out yourselves from Me by re”
- `3.1`: `bl3z` (content) “This is the Call of the All-Glorious which is proclaimed from the Supr”; `bl41` (content) “God, the True One, testifieth and the Revealers of His names and attri”
- `3.2`: `bl40` (content) “He is the Expounder, the All-Knowing, the All-Informed.”; `bl42` (content) “O people of the earth!”; `bl44` (content) “The first Glad-Tidings which the Mother Book hath, in this Most Great ”
- `5.1`: `bl6o` (content) “This is the Epistle of God, the Help in Peril, the Self-Subsisting”; `bl6q` (content) “God testifieth that there is none other God but Him and that He Who ha”
- `5.2`: `bl6p` (content) “He is the One Who heareth from His Realm of Glory.”; `bl6r` (content) “Well is it with the man of discernment who hath recognized and perceiv”
- `7.2`: `bl9n` (content) “Praise and thanksgiving beseem the Lord of manifest dominion Who hath ”; `bl9o` (content) “Light and glory, greeting and praise be upon the Hands of His Cause, t”
- `8.1`: `blaw` (content) “This is the Epistle of God, the Help in Peril, the Self-Subsisting”; `blay` (content) “Praise be unto God, incomparable in majesty, power and beauty, peerles”
- `8.2`: `blax` (content) “He is God, exalted is He, the Lord of wisdom and utterance.”; `blaz` (content) “This Point is the focal center of the circle of Names and marketh the ”
- `9.1`: `bldf` (content) “This Tablet was addressed to Áqá Muḥammad, a distinguished believer fr”; `bldg` (content) “This is an Epistle which the All-Merciful hath sent down from the King”
- `13.1`: `blfl` (content) “Out of respect, the Bahá’ís, rather than addressing Bahá’u’lláh direct”; `blhz` (lead-in) “He is the Most Holy, the Most Great, the Most Exalted, the Most High”; `bli0` (content) “O My Name! Yield thou praise unto God for having graciously chosen the”
- `16.1`: `blio` (content) “This Tablet was revealed after the martyrdom of the King of Martyrs an”; `bljn` (content) “Praise be to Him Who hath honored the Land of Bá through the presence ”

**Opening invocations carrying a number** (4)

- `2.2`: `bl38` “In the name of the Lord, the Lord of great glory.”
- `3.2`: `bl40` “He is the Expounder, the All-Knowing, the All-Informed.”
- `5.2`: `bl6p` “He is the One Who heareth from His Realm of Glory.”
- `8.2`: `blax` “He is God, exalted is He, the Lord of wisdom and utterance.”

**Header numbers colliding with another block** (6)

- `1.3`: `bloy` (struct) “”; `bl31` (content) “No sooner had her voice reached that most exalted Spot than We made re”
- `4`: `bl43` (header) “The first Glad-Tidings”; `bl45` (header) “The second Glad-Tidings”; `bl47` (header) “The third Glad-Tidings”; `bl49` (header) “The fourth Glad-Tidings”; `bl4b` (header) “The fifth Glad-Tidings”; `bl4f` (header) “The sixth Glad-Tidings”; `bl4h` (header) “The seventh Glad-Tidings”; `bl4j` (header) “The eighth Glad-Tidings”; `bl4l` (header) “The ninth Glad-Tidings”; `bl4s` (header) “The tenth Glad-Tidings”; `bl4u` (header) “The eleventh Glad-Tidings”; `bl4w` (header) “The twelfth Glad-Tidings”; `bl4z` (header) “The thirteenth Glad-Tidings”; `bl53` (header) “The fourteenth Glad-Tidings”; `bl55` (header) “The fifteenth Glad-Tidings”; `bl5b` (header) “4 - Ṭarázát (Ornaments)”
- `5`: `bl5k` (header) “The first Ṭaráz”; `bl5n` (header) “The second Ṭaráz”; `bl5r` (header) “The third Ṭaráz”; `bl5w` (header) “The fourth Ṭaráz”; `bl61` (header) “The fifth Ṭaráz”; `bl65` (header) “The sixth Ṭaráz”; `bl6m` (header) “5 - Tajallíyát (Effulgences)”
- `6`: `bl6y` (header) “The first Tajallí”; `bl71` (header) “The second Tajallí”; `bl74` (header) “The third Tajallí”; `bl76` (header) “The fourth Tajallí”; `bl7g` (header) “6 - Kalimát-i-Firdawsíyyih (Words of Paradise)”
- `7`: `bl7z` (header) “First Leaf”; `bl81` (header) “Second Leaf”; `bl83` (header) “Third Leaf”; `bl86` (header) “Fourth Leaf”; `bl8a` (header) “Fifth Leaf”; `bl8c` (header) “Sixth Leaf”; `bl8e` (header) “Seventh Leaf”; `bl8g` (header) “Eighth Leaf”; `bl8k` (header) “Ninth Leaf”; `bl8r` (header) “Tenth Leaf”; `bl8u` (header) “Eleventh Leaf”; `bl9k` (header) “7 - Lawḥ-i-Dunyá (Tablet of the World)”
- … 1 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (6)

- `4.1`: `bl5d` (lead-in) “In My Name, which standeth supreme above all names”; `bl5e` (content) “Praise and glory beseem the Lord of Names and the Creator of the heave”
- `6.1`: `bl7i` (lead-in) “He is the One Who speaketh through the power of Truth in the Kingdom o”; `bl7j` (content) “O ye the embodiments of justice and equity and the manifestations of u”
- `8.3`: `blb0` (lead-in) “The preamble of this Epistle is being revealed twice, even as was the ”; `blb1` (content) “Praise be unto God Who hath manifested the Point, hath unfolded theref”
- `10.1`: `bleu` (lead-in) “In the Name of God, the Exalted, the Most High”; `blev` (content) “The source of all good is trust in God, submission unto His command, a”
- `11.1`: `blfm` (lead-in) “He is God, exalted is He, the Lord of Majesty and Power”; `blfn` (content) “A praise which is exalted above every mention or description beseemeth”
- … 1 more in the TSV

### PALESTRAS DE ‘ABDU’L-BAHÁ (`palestras_de_abdu_l_baha_pt`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (12)

- `56.1`: `blo2` (content) “11 de novembro”; `blpc` (content) ““Todos os preconceitos, sejam de religião, raça, política ou nação, de”
- `58.1`: `bloj` (content) “Avenida de Camões n. 4 — Paris — 12 de novembro”; `blqd` (content) “As Leis de Deus não são imposição de vontade, poder ou prazer, mas sim”
- `59.1`: `blpb` (content) “Avenida de Camões, n. 4 — Paris — 13 de novembro”; `blql` (content) ““Um Supremo Tribunal será estabelecido pelos povos e governos de todas”
- `60.1`: `blpz` (content) “Avenida de Camões, n. 4 — Paris”; `blqx` (content) “Na conduta da vida o homem é acionado por dois motivos principais: “A ”
- `62.1`: `blqk` (content) “Avenida de Camões, n. 4 — Paris”; `blry` (content) “No ensinamento de Bahá’u’lláh está escrito: “Somente o Poder do Espíri”
- `63.1`: `blqw` (content) “Avenida de Camões n. 4, Paris — 17 de novembro”; `blsh` (content) “Nestas reuniões, em que nos temos encontrado e mantido palestras, todo”
- `64.1`: `blrg` (content) “Avenida de Camões n. 4 — Paris — 14 de novembro”; `blsq` (content) ““Quando, há algum tempo, cheguei a Paris pela primeira vez, olhei em t”
- `65.1`: `blrx` (content) “Avenida de Camões n. 4 — Paris — 18 de novembro”; `blth` (content) “Há cerca de mil anos formou-se na Pérsia uma sociedade denominada “Soc”
- `66.1`: `blsg` (content) “Avenida de Camões n. 4 — Paris — 28 de novembro”; `blu4` (content) “— “Deve a Prece tomar a forma de ação?””
- `67.1`: `blsp` (content) “Rua Greuze no 15 — Paris 1o de dezembro”; `blu9` (content) “— “Que é o mal?””
- `68.1`: `bltf` (content) “ST. MARTIN’S LANE — LONDON, W.C. Domingo, 12 de janeiro de 1912”; `bluc` (content) “— “A alma faz maior progresso neste mundo através do sofrimento ou da ”
- `69.1`: `blu2` (content) “Cadogan Gardens, 97 — Londres 26 de dezembro de 1911”; `blun` (content) “Que poder é o amor! É a mais admirável, a maior de todas as forças exi”

**Header numbers colliding with another block** (9)

- `1`: `bl2t` (header) “PARIS 1911”; `bl3n` (header) “O DEVER DE BONDADE E SIMPATIA EM RELAÇÃO A ESTRANHOS E FORASTEIROS”
- `2`: `bl3p` (content) “16 e 17 de outubro de 1911”; `bl48` (header) “O PODER E O VALOR DO VERDADEIRO PENSAMENTO DEPENDEM DE SUA MANIFESTAÇÃ”
- `40`: `blls` (header) “SEGUNDA PARTE”; `blm5` (header) “SOCIEDADE TEOSÓFICA —- PARIS”
- `41`: `bllt` (header) “Os Onze Princípios do Ensinamento de Bahá’u’lláh explicados por ‘Abdu’”; `blmc` (header) “I —— Primeiro princípio de Bahá’u’lláh:”
- `43`: `blmd` (header) “Busca da Verdade”; `blmk` (header) “III —— Terceiro princípio de Bahá’u’lláh:”
- … 4 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (37)

- `2.1`: `bl4a` (lead-in) “18 de outubro”; `bl4b` (content) “A realidade do homem é o seu pensamento, não o seu corpo material. A f”
- `3.1`: `bl4k` (lead-in) “19 de outubro”; `bl4l` (content) “Toda a cura verdadeira vem de Deus! Há duas causas para a doença: uma ”
- `4.1`: `bl4x` (lead-in) “Sexta-feira, 20 de outubro”; `bl4y` (content) “No passado, como no presente, o Sol Espiritual da Verdade tem sempre r”
- `5.1`: `bl57` (lead-in) “Noite de sexta-feira, 20 de outubro”; `bl58` (content) “Realizam-se todos os dias em Paris numerosas reuniões com diferentes p”
- `6.1`: `bl60` (lead-in) “21 de outubro”; `bl61` (content) “Espero que vós todos estejais bem e felizes. Eu não estou feliz, e sim”
- … 32 more in the TSV

### St. Augustine’s City of God and Christian Doctrine (`the_city_of_god_1_christianity_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (11)

- `p.1.1`: `bl3r` (content) “The “City of God” is the masterpiece of the greatest genius among the ”; `bl2jk` (content) “THERE are certain rules for the interpretation of Scripture which I th”
- `p.1.2`: `bl3s` (content) “This was the only philosophy of history known throughout Europe during”; `bl2jg` (content) “There are some, then, likely to object to this work of mine, because t”
- `p.1.3`: `bl3t` (content) ““The City of God” is also highly appreciated by Protestant writers as ”; `bl2jj` (content) “To reply briefly to all these. To those who do not understand what is ”
- `p.1.4`: `bl3u` (content) “It would be unfair to judge “The City of God” by the standard of moder”; `bl2jc` (content) “But now as to those who talk vauntingly of Divine Grace, and boast tha”
- `p.1.5`: `bl3v` (content) “With all its defects the candid reader will be much instructed and edi”; `bl2ji` (content) “But if any one thinks that these stories are false, I do not strongly ”
- `p.1.6`: `bl3w` (content) “The present translation, the first accurate and readable one in the En”; `bl2jl` (content) “Let us beware of such dangerous temptations of pride, and let us rathe”
- `p.1.7`: `bl3x` (content) “But in this expectation the reader will be disappointed. The translati”; `bl2jm` (content) “And we know that the eunuch who was reading Isaiah the prophet, and di”
- `p.1.8`: `bl3y` (content) “I have included in this volume the four books of St. Augustin On Chris”; `bl2ju` (content) “In the last place, every one who boasts that he, through divine illumi”
- `p.1.9`: `bl3z` (content) “The translation was prepared by the Rev. Professor J. F. Shaw, of Lond”; `bl2kl` (content) “He who reads to an audience pronounces aloud the words he sees before ”
- `4.34.2`: `bll5` (content) “Augustin first discusses the doctrine of fate, for the sake of confuti”; `bll7` (content) “SINCE, then, it is established that the complete attainment of all we ”
- `5.26.2`: `blpz` (content) “hitherto the argument has been conducted against those who believe tha”; `blq1` (content) “IN the five former books, I think I have sufficiently disputed against”

**Header numbers colliding with another block** (26)

- `1`: `bl2ob` (header) “Philip Schaff, D.D., LL.D.,”; `bl2oh` (header) “PROFESSOR IN THE UNION THEOLOGICAL SEMINARY, NEW YORK”; `bl2q8` (header) “IN CONNECTION WITH A NUMBER OF PATRISTIC SCHOLARS OF EUROPE AND AMERIC”
- `1.1`: `bl5l` (header) “Book I”; `bl5x` (header) “Chapter 1—: Of the Adversaries of the Name of Christ, Whom the Barbari”
- `4.19`: `bl5m` (content) “augustin censures the pagans, who attributed the calamities of the wor”; `bljq` (header) “Chapter 19—: Concerning Fortuna Muliebris”
- `2.1.1`: `blb7` (content) “IF the feeble mind of man did not presume to resist the clear evidence”; `bl2l0` (header) “CHAPTER 1—: THE INTERPRETATION OF SCRIPTURE DEPENDS ON THE DISCOVERY A”
- `2.2.1`: `blbb` (content) “In the foregoing book, having begun to speak of the city of God, to wh”; `bl2ww` (header) “CHAPTER 1—: SIGNS, THEIR NATURE AND VARIETY”
- … 21 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `1.9`: `bl40` (lead-in) “Philip Schaff.”; `bl41` (content) “New York, December 10, 1886.”; `bl7y` (header) “Chapter 9—: Of the Reasons for Administering Correction to Bad and Goo”
- `2.13`: `bl4s` (lead-in) “Marcus Dods.”; `bl4t` (content) “Glasgow, 1871.”; `blce` (header) “Chapter 13—: That the Romans Should Have Understood that Gods Who Desi”

### The Call of the Divine Beloved (`the-call-of-the-divine-beloved_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (11)

- `2.61`: `5x` (content) “The wayfarer, after traversing the high planes of this supernal journe”; `5y` (content) “Although, to outward seeming, the wayfarers in this valley may dwell u”
- `2.72`: `69` (content) “Dost thou deem thyself a small and puny form, When thou foldest within”; `6b` (content) “Likewise, Luqmán, who had drunk from the wellspring of wisdom and tast”
- `2.89`: `6w` (content) “Shattered was the pen at once, Rent and torn in twain the page, When t”; `6y` (content) “O My friend! Many a hound hunteth this gazelle of the desert of onenes”
- `7.6`: `8q` (content) “Tell us not the tale of Laylí, nor speak of Majnún’s woe — Thy love ha”; `8r` (content) “And as to divine wisdom and heavenly admonitions:”
- `7.16`: `94` (content) “How can meagre reason comprehend the Book, Or the spider trap a phoeni”; `95` (content) “On this plane, the traveller meeteth with many a trial and reverse. No”
- `7.25`: `9f` (content) “The story of Thy beauty reached the hermit’s dell; Crazed, he sought t”; `9g` (content) “In this station, both instruction and apprenticeship are assuredly of ”
- `7.27`: `9h` (content) “The lovers’ teacher is the Loved One’s beauty, His face their lesson a”; `9k` (content) “Thus do I say: There is no power nor strength except in God, the Help ”
- `7.28`: `9j` (content) “O Lord, O Thou Whose grace fulfilleth every need! To mention aught bef”; `9l` (content) “If the mystic knowers be among them that have attained the beauty of t”
- `7.35`: `9u` (content) “This is the realm of pure awareness and utter self-effacement. Not eve”; `9v` (lead-in) “None may approach that well-belov’d Who harboreth his own desire; None”; `1556033526958` (content) “For this is the realm of God and is sanctified above every allusion of”
- `7.39`: `9z` (content) “How clear this crystal water that the enraptured Cup-Bearer passeth ro”; `a0` (content) “No more than this will I impart to thee: The riverbed can never hold t”
- `7.47`: `a8` (lead-in) “I seek thy nearness, more desired than heaven in mine eyes; I see thy ”; `a9` (content) “When I entrusted this message of love to My pen, it refused the burden”; `aa` (content) “Let us tell, some other day This parting hurt and woe; Let us write, s”; `1556033877955` (content) “Peace be upon thee, and upon them who circle round thee and attain thy”

**Header numbers colliding with another block** (5)

- `1`: `36` (header) “1”; `37` (header) “Ras̱hḥ-i-‘Amá”
- `2`: `38` (header) “(The Clouds of the Realms Above)”; `3t` (header) “2”; `3u` (header) “The Seven Valleys”
- `3`: `75` (header) “3”; `76` (header) “From the Letter Bá’ to the Letter Há’”
- `4`: `7h` (header) “Three Other Tablets”; `7i` (header) “4”
- `7`: `8g` (header) “7”; `8h` (header) “The Four Valleys”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (35)

- `2.1`: `3v` (lead-in) “An exposition of the mysteries enshrined in the stages of ascent for t”; `3w` (lead-in) “In the Name of God, the Merciful, the Compassionate!”; `3x` (content) “Praise be to God Who hath made being to come forth from nothingness; g”
- `2.16`: `blaj` (lead-in) “For the infidel, error — for the faithful, faith; For ‘Aṭṭár’s heart, ”; `4d` (content) “The steed of this valley is pain, and if there be no pain this journey”
- `2.19`: `4g` (lead-in) “A lover is he who is chill in hellfire; A knower is he who is dry in t”; `4h` (content) “Love accepteth no existence and wisheth no life: In death it seeth lif”
- `2.20`: `4i` (lead-in) “Ne’er will love allow a living soul to tread its way; Ne’er will the f”; `4j` (content) “Love setteth a world aflame at every turn and layeth waste every land ”
- `2.21`: `4k` (lead-in) “Love’s a stranger to earth and heaven too; In him are lunacies seventy”; `4l` (content) “Love hath bound a myriad victims in its fetters and pierced a myriad w”
- … 30 more in the TSV

### Sutra Collection (C) (`buddhasutra_c_buddhism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (10)

- `2.1`: `bl38` (lead-in) “Thus Have I Heard:”; `bl39` (content) “Once the Lord was staying among the Magadhans at Matula. Then he said:”; `bl58` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `4.1`: `bl4s` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `bl4x` (content) “At Savatthi: Then, early in the morning, Cala the nun put on her robes”
- `9.1`: `bl7j` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `bl7o` (lead-in) “Translated from the Pali by Thanissaro Bhikkhu.”; `bl7p` (content) ““For a person endowed with virtue, consummate in virtue, there is no n”
- `24.1`: `blfx` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `bljk` (content) “I have heard that on one occasion the Blessed One was staying at Savat”
- `25.1`: `blh0` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blho` (content) “Thus Have I Heard:”; `blkf` (content) “I have heard that on one occasion the Blessed One was staying near Raj”
- `28.1`: `blhw` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blij` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blo3` (content) “Thus have I heard: On one occasion the Blessed One was living at Savat”
- `29.1`: `bljj` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blov` (content) “On one occasion the Blessed One was staying near Savatthi in Jeta’s Gr”
- `31.1`: `blke` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blph` (lead-in) “I heard thus:”; `blpi` (content) “At one time the Blessed One was living in Nigrodhaa’s monastery in Kap”
- `34.1`: `blo2` (content) “Translated from the Pali by Ñanamoli Thera”; `blqw` (lead-in) “I heard thus:”; `blqx` (content) “At one time the Blessed One lived in the Pubba monastery, the palace o”
- `35.1`: `blou` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blrc` (lead-in) “I heard thus:”; `blrd` (content) “At one time the Blessed One was living in the monastery offered by Ana”

**Header numbers colliding with another block** (29)

- `2`: `bl2t` (header) “The Discourse at Catuma”; `bl36` (header) “Cakkavattisihananda Sutta”
- `3`: `bl37` (header) “The Lion’s Roar on the Turning of the Wheel”; `bl4q` (header) “Cakkhu Sutta”; `bl57` (header) “The Outcaste”
- `4`: `bl4r` (header) “The Eye”; `bl4v` (header) “Cala Sutta”
- `5`: `bl4w` (header) “Sister Cala”; `bl56` (header) “Candala Sutta”
- `7`: `bl5c` (header) “To the Brahmin Cankii”; `bl6y` (header) “Capala Sutta”
- … 24 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (18)

- `1.1`: `bl2u` (lead-in) “I heard thus:”; `bl2v` (content) “At one time the Blessed One was living in the Aamalaki forest in Catum”
- `6.1`: `bl5d` (lead-in) “I heard thus:”; `bl5e` (content) “At one time the Blessed One touring Kosala, with a large community of ”
- `7.1`: `bl70` (lead-in) “Translated from the Pali by Thanissaro Bhikkhu”; `bl71` (content) “Once the Blessed One was living among the Bhaggas in the Deer Park at ”
- `10.1`: `bl83` (lead-in) “I heard thus:”; `bl84` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- `11.1`: `bl8d` (lead-in) “I heard thus.”; `bl8e` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- … 13 more in the TSV

### The Muqaddimah (`al_muqaddimah_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (10)

- `1.1`: `bl5d` (content) “The excellence of historiography. — An appreciation of the various app”; `bl5f` (content) “IT SHOULD BE KNOWN that history is a discipline that has a great numbe”
- `11.1063`: `bl1ms` (content) “Let my excuse be a fickle time, Which deceives (people) with its flash”; `bl1mu` (content) “He will send a leader from his army, And he will remain there on a loo”
- `5.14.1`: `bl1xp` (content) “In the preceding section, we stated that a merchant must concern himse”; `bl1xu` (content) “This is because merchants are mostly occupied with buying and selling.”
- `5.14.2`: `bl1xq` (content) “These influences differ according to the different types of merchants.”; `bl1xv` (content) “If the character of (the merchant) then adopts the bad qualities that ”
- `5.14.3`: `bl1xr` (content) “There exists a second kind of merchant, which we mentioned in the prec”; `bl1xw` (content) ““God guides whomever He wants to guide” with His bounty and generosity”
- `6.1.1`: `bl237` (content) “On man’s ability to think, which distinguishes human beings from anima”; `bl239` (content) “IT SHOULD BE KNOWN that God distinguished man from all the other anima”
- `6.19c.1`: `bl2iz` (content) “Another subdivision of arithmetic is business (arithmetic). This is th”; `bl2j4` (content) “Another subdivision of arithmetic is inheritance laws. It is a craft c”
- `6.19c.2`: `bl2j1` (content) “In this connection, very many problems have been posed. Their purpose ”; `bl2j5` (content) “This craft, therefore, has something to do with jurisprudence, namely,”
- `6.19c.3`: `bl2j2` (content) “Spanish mathematicians have written numerous works on the subject. The”; `bl2j7` (content) “It is a very important discipline. The scholars who cultivate it have ”
- `6.52.1`: `bl333` (content) “It should be known that the Arabic language and Arab speech are divide”; `bl334` (content) “Each of the two branches comprises various sub-branches and ways of sp”

**Opening invocations carrying a number** (1)

- `3.50.7`: `bl1fw` “In the name of God, the Merciful, the Compassionate.”

**Header numbers colliding with another block** (5)

- `1`: `bl5c` (header) “Introduction”; `bl3j5` (header) “Chapter I”
- `10`: `blbi` (header) “The First Zone”; `blc9` (header) “The Second Zone”; `blci` (header) “Third Zone”; `bld4` (header) “The Fourth Zone”; `bldw` (header) “The Fifth Zone”; `blee` (header) “The Sixth Zone”; `bler` (header) “The Seventh Zone”; `bli9` (header) “Dream Words”; `blif` (header) “Other Types of Divination”; `blih` (header) “The Different Kinds of Supernatural Perception”; `bljh` (header) “Other Alleged Ways of Supernatural Perception”; `bljj` (header) “Geomancy”
- `4`: `blzy` (header) “The Succession.”; `bl1oa` (header) “Chapter IV”
- `8`: `bl3l2` (header) “The Za’irajah”; `bl2xi` (header) “Study of the Auxiliary Sciences should not be Prolonged, and their Pro”
- `11`: `bl3j7` (header) “Manuscripts”; `bl3j1` (header) “Editions”; `bl3j0` (header) “Gradual Growth of the Text”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `b.1`: `bl2x` (lead-in) “and reasons thereof.”; `bl2y` (content) “IT SHOULD be known that history, in matter of fact, is information abo”
- `i.1`: `bl4i` (lead-in) “IN THE NAME OF GOD; THE MERCIFUL, THE COMPASSIONATE. PRAY, O GOD, FOR ”; `bl4j` (content) “THE SERVANT of God who needs the mercy of God who is so rich in His ki”
- `d.2.1`: `bl3ng` (lead-in) “The parts of the earth where civilization is found. Some information a”; `bl3n9` (content) “IN THE BOOKS of philosophers who speculated about the condition of the”
- `n.1`: `bl3oi` (lead-in) “The northern quarter of the earth has more civilization than the south”; `bl3nv` (content) “WE KNOW FROM OBSERVATION and from continuous tradition that the first ”

### The Mahabharata 12 (`mahabharata_12_hindu_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (10)

- `132.1`: `lg` (content) ““Yudhishthira said, ‘What, besides this, should be done by a king that”; `lm` (content) ““Yudhishthira said, ‘When practices fraught with high morality and ben”
- `132.2`: `lh` (content) ““Bhishma said, ‘If the invading enemy be of pure heart and if he be co”; `ln` (content) ““Bhishma said, ‘When such a time sets in, the Brahmana should live by ”
- `175.1`: `sk` (content) ““YUDHISHTHIRA SAID, ‘THOU hast, O grandsire, discoursed upon the auspi”; `su` (content) ““Yudhishthira said, ‘Time, which is destructive of every created thing”
- `175.2`: `sl` (content) ““Bhishma said, ‘Religion hath many doors. The observance of (the dutie”; `sv` (content) ““Bhishma said, ‘In this connection, O king, is cited the old narrative”
- `175.3`: `sm` (content) ““Yudhishthira said, ‘Tell me, O grandsire, by what frame of soul shoul”; `sw` (content) ““The son said, ‘What should a wise man do, O father, seeing that the p”
- `175.4`: `sn` (content) ““Bhishma said, ‘When one’s wealth is lost, or one’s wife or son or sir”; `sx` (content) ““The sire said, ‘O son, observing the Brahmacharya mode of life, one s”
- `175.5`: `so` (content) ““Senajit said, ‘What is that intelligence, what is that penance, O lea”; `sy` (content) ““The son said, ‘When the world is thus surrounded on all sides and is ”
- `175.6`: `sp` (content) ““The Brahmana said, ‘Behold, all creatures,—the superior, the middling”; `sz` (content) ““The sire said, How is the world assailed? What is that by which it is”
- `175.7`: `sq` (content) ““Pingala said, ‘Alas, I have for many long years lived, all the while ”; `t0` (content) ““The son said, ‘Death is that by which the world is assailed. Decrepit”
- `175.8`: `sr` (content) ““Bhishma continued, ‘Convinced with these and other words uttered by t”; `t1` (content) ““Bhishma continued, ‘Do thou also, O monarch, conduct thyself in that ”

**Header numbers colliding with another block** (4)

- `1`: `bl1ns` (struct) “”; `2t` (header) “Section I”
- `2`: `2u` (header) “(Rajadharmanusasana Parva)”; `2z` (header) “Section II”
- `132`: `lf` (header) “(Apaddharmanusasana Parva)”; `ll` (header) “Section CXXXII”
- `175`: `sj` (header) “(Mokshadharma Parva)”; `st` (header) “Section CLXXV”

### Munkidh min al-Dalal (Deliverance from Error) (`deliverance_from_error_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (10)

- `1.1`: `bl2x` (content) “Abu Hamid Ibn Muhammad Ibn Muhammad al-Tusi al-Shafi’i al-Ghazali (Gha”; `bl3a` (content) “Glory be to God, whose praise should precede every writing and every s”
- `1.2`: `bl2y` (content) “Al-Ghazali’s major contribution lies in religion, philosophy and Sufis”; `bl3b` (content) “You have asked me, O brother in the faith, to expound the aim and the ”
- `1.3`: `bl2z` (content) “In philosophy, Ghazali upheld the approach of mathematics and exact sc”; `bl3c` (content) “Know then, my brothers (may God direct you in the right way), that the”
- `1.4`: `bl31` (content) “In religion, particularly mysticism, he cleansed the approach of sufis”; `bl3d` (content) “From the period of adolescence, that is to say, previous to reaching m”
- `1.5`: `bl32` (content) “He was a prolific writer. His books include Tahafut al-Falasifa (The I”; `bl3e` (content) “Sufism has no secrets into which I have not penetrated; the devout ado”
- `1.6`: `bl33` (content) “Al-Ghazali's influence was deep and everlasting. He is one of the grea”; `bl3f` (content) “Having noticed how easily the children of Christians become Christians”
- `1.7`: `bl35` (content) “The Munkidh min al-Dalal (Deliverance from Error), is a sort of intell”; `bl36` (lead-in) “The following, an excerpt from the Encyclopedia of Philosophy (New Yor”; `bl37` (content) “At the age of 36, Ghazali experienced a profound crisis, provoked by t”; `bl38` (content) “It is principally this aspect of Ghazali's work, developed in his Taha”; `bl3g` (content) “Struck with the contradictions which I encountered in endeavoring to d”
- `5.2`: `bl4b` (content) “(1) The Materialists. They reject an intelligent and omnipotent Creato”; `bl4c` (content) “(2) The Naturalists. These devote themselves to the study of nature an”; `bl4d` (source) “(3) The Theists. Among them should be reckoned Socrates, who was the t”; `bl4e` (content) “Aristotle also contended with success against the theories of Plato, S”
- `6.3`: `bl4k` (content) “(1) Mathematics. Mathematics comprises the knowledge of calculation, g”; `bl4l` (content) “Next, when he becomes aware of the unbelief and rejection of religion ”; `bl4m` (content) “The second evil comes from the sincere but ignorant Muslims who thinks”; `bl4n` (content) “It is therefore a great injury to religion to suppose that the defense”; `bl4o` (content) “(2) Logic. This science, in the same manner, contains nothing for or a”; `bl4p` (content) “It may be asked, What, then, this has to do with the grave questions o”; `bl4q` (content) “(3) Physics. The object of this science is the study of the bodies whi”; `bl4r` (content) “(4) Metaphysics. This is the fruitful breeding-ground of the errors of”; `bl4s` (content) “(5) Political Science. The professors of this confine themselves to dr”; `bl4t` (content) “(6) Moral Philosophy. The professors of this occupy themselves with de”; `bl4u` (content) “The danger for their opponent is serious. A narrow-minded man, finding”
- `8.16`: `bl60` (content) “(1) One can answer thus: "The learned man whom you accuse of disobeyin”; `bl61` (content) “(2) Or again, one may say to a simple and ignorant man: "The learned m”; `bl62` (content) “(3) Or one may answer, and this reason is the true one: "The truly lea”; `bl63` (content) “True knowledge, on the contrary, inspires in him who is initiate in it”

**Header numbers colliding with another block** (1)

- `1`: `bl2w` (header) “Introduction”; `bl39` (header) “Quoth the Imam Ghazali:”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `3.2`: `bl3w` (lead-in) “I. Scholastic theologians, who profess to follow theory and speculatio”; `bl3x` (lead-in) “II. The philosophers, who profess to rely upon formal logic.”; `bl3y` (lead-in) “III. The Sufis, who call themselves the elect of God and possessors of”; `bl3z` (content) “"The truth," I said to myself, "must be found among these three classe”

### Sutra Collection (B) (`buddhasutra_b_buddhism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (9)

- `2.1`: `bl184` (content) “Translated from the Pali by John D. Ireland.”; `bl18w` (source) “From The Udana: Inspired Utterances of the Buddha, translated from the”; `bl18t` (content) “Thus have I heard. At one time the Lord was staying near Savatthi in t”; `bl5p` (header) “The Discourse on Many Elements”
- `4.1`: `bl5q` (content) “I heard thus:”; `bl6g` (header) “To Bahuna”; `bl6h` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `8.1`: `bl86` (content) “I heard thus:”; `bl19i` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `9.1`: `bl19h` (content) “Dwelling at Savatthi. “When a fool is obstructed by ignorance and conj”; `bl1gu` (lead-in) “Translated from the Pali by Thanissaro Bhikkhu.”; `bl1gv` (content) “Translator’s Introduction”; `bld8` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `11.1`: `blaj` (content) “I heard thus:”; `bl1m8` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `ble4` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `15.1`: `bldn` (content) “I have heard that on one occasion Ven. Ánanda was staying in Kosambi, ”; `blfa` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `bln0` (content) “Translated from the Pali by Thanissaro Bhikkhu”
- `22.102`: `blrb` (content) “Failing to Request the Dharma or Make Offerings”; `blrd` (content) “If he does not act in this manner, he commits a secondary offense.”
- `26.12`: `bl1fz` (content) “(i) dark with a dark result, (ii) bright with a bright result, (iii) d”; `bl1g0` (content) “Dark (evil) kamma does not give a bright (happy) result, nor does brig”
- `26.69`: `bl1hw` (content) “the evil-doer who goes to hell (or some other low state of birth), the”; `bl1hx` (content) “The Buddha then shows how wrong views can arise from only partial unde”

**Header numbers colliding with another block** (15)

- `1`: `bl2s` (header) “Baalapandita Sutta”; `bl2t` (header) “To Recognize the Fool and the Wise One”
- `3`: `bl183` (header) “About Bahiya”; `bl53` (header) “Bahiya Sutta”; `bl54` (header) “About Bahiya”
- `5`: `bl6f` (header) “Bahuna Sutta”; `bl6m` (header) “The Discourse on Many Feelings”
- `7`: `bl7a` (header) “Bakkula Sutta”; `bl85` (header) “The Wonderful Things about Venerable Bakkula”
- `8`: `bl84` (header) “Bakkulasuttam”; `blai` (header) “A Single Auspicious Attachment”
- … 10 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (58)

- `3.1`: `bl55` (lead-in) “Translated from the Pali by Thanissaro Bhikkhu.”; `bl56` (content) “I have heard that on one occasion the Blessed One was staying near Sav”
- `22.93`: `blqy` (lead-in) “Disrespect toward Teachers and Friends”; `blqz` (content) “A disciple of the Buddha who is destined to become an emperor, a Wheel”
- `22.96`: `blr2` (lead-in) “On Consuming Alcoholic Beverages”; `blr3` (content) “A disciple of the Buddha should not intentionally consume alcoholic be”
- `22.97`: `blr4` (lead-in) “On Eating Meat”; `blr5` (content) “A disciple of the Buddha must not deliberately eat meat. He should not”
- `22.98`: `blr6` (lead-in) “On Five Pungent Herbs”; `blr7` (content) “A disciple of the Buddha should not eat the five pungent herbs — garli”
- … 53 more in the TSV

### Sutra Collection (TU) (`sutra_collection_tu_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (9)

- `5.4`: `bl4e` (content) “Thus among all of them there is none which is not made by the mind, wh”; `bl4g` (content) “Those who look with reverence at the Tathágata’s body how can they but”
- `7.156`: `blf7` (content) “End of the Short Paragraphs on Conduct.”; `blfa` (content) “‘Or whereas some Samana-Brâhmans, who live on the food provided by the”
- `9.19`: `blfs` (content) “‘Or whereas some Samana-Brâhmans, who live on the food provided by the”; `blif` (content) ““These, monks, are the four traits that may be known by means of these”
- `10.1`: `blhg` (content) “I heard thus:”; `blij` (content) “In the language of India, this teaching is called the Arya Vajra Cheda”
- `13.1`: `bl1ua` (content) “I have heard:”; `blwi` (content) “When a Bhikkhu has finished his robe-making and the frame is destroyed”
- `26.1`: `bl1e2` (content) “Thus Have I Heard:”; `bl1fs` (content) “Thus I have heard, at one time, the Buddha dwelt at Shravarsti in the ”
- `33.1`: `bl1ha` (content) “I heard thus:”; `bl1ir` (content) “Once Ven. Shariputra and Ven. Upasena were staying near Rajagaha in th”
- `37.4`: `bl1jd` (content) “Translator’s Foreword”; `bl1qh` (content) “The monk who has demolished conceit without leaving a trace, as a grea”
- `37.10`: `bl1jk` (content) “Foreword to the Second Edition”; `bl1qn` (content) “The monk who hasn’t slipped past or turned back, without greed, as “Al”

**Header numbers colliding with another block** (26)

- `2`: `bl2t` (header) “To Talaputa the Actor”; `bl32` (header) “Tamonata Sutta”
- `3`: `bl3a` (header) “Tanha Sutta”; `bl3b` (header) “Craving”
- `3.2`: `bl1td` (content) ““One who has conviction & belief that these phenomena are this way is ”; `bl1t9` (struct) “”
- `5`: `bl3e` (header) “To Tapussa”; `bl4a` (header) “The Discourse On The Ten Wholesome Ways Of Action”
- `8`: `bl97` (header) “On Knowledge Of The Vedas”; `bl98` (header) “Chapter I”; `blef` (header) “Chapter II”; `bleg` (header) “The Short Paragraphs On Conduct”; `bleh` (header) “The Kûla Sîlam”; `blf8` (header) “The Middle Paragraphs On Conduct”; `blf9` (header) “The Magghima Sîlam”; `blhe` (header) “Tevijjavacchagotta Sutta”
- … 21 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `5.1`: `bl4b` (lead-in) “Thus have I heard:”; `bl4c` (content) “At one time, the Buddha stayed in the palace of the Dragon King of the”
- `37.48`: `bl1kk` (lead-in) “Explanation of the Uposatha Sutta”; `bl1kl` (content) “Questions and Answers”
- `35.209`: `bl1on` (lead-in) “Glossary”; `bl1oo` (content) “Arahat; Arahant — One who has attained Nibbána.”
- `36.1`: `bl1pi` (lead-in) “Thus have I heard:”; `bl1pj` (content) “At one time the Blessed One was residing in Jetavana, the monastery of”

### Zohar Volume 1 (`kabbalah_zohar_judaism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (9)

- `1.167a.1`: `bl15d` (content) “who approaches him.”; `bl15r` (content) “This is because the Holy One, blessed be He, desires no other people o”
- `1.167a.2`: `bl15e` (content) “The chief heard and was frightened. He said, It is best to go meet and”; `bl15s` (content) “Those who are unholy find that defilement awaits them. Of them, the sc”
- `1.167a.3`: `bl15f` (content) “This is why Jacob said, “I have sojourned with Laban, and stayed there”; `bl15t` (content) “Rabbi Yitzchak said, Is it becoming for Jacob, who was holy, to say th”
- `1.167a.4`: `bl15g` (content) “Once he saw him, it is written, “Then Jacob was greatly afraid and dis”; `bl15u` (content) “Here also it is written, “I have oxen and donkeys,” that is, do not pa”
- `1.167a.5`: `bl15h` (content) “Come and behold, it is written of Bilaam, “And Elohim came to Bilaam a”; `bl15v` (content) “Rabbi Abba said, It is written that Jacob was “a plain man, dwelling i”
- `1.167a.6`: `bl15i` (content) “This is the testimony that the Holy One, blessed be He, commanded to p”; `bl15w` (content) ““And the messengers returned to Jacob, saying: ‘We came to your brothe”
- `1.167a.7`: `bl15j` (content) “It is written of Bilaam that “he went not, as at other times, to seek ”; `bl15x` (content) “Why was all this specified? Because the Holy One, blessed be He, alway”
- `1.167a.8`: `bl15k` (content) “This is the meaning of what Bilaam, Laban’s grandson, said, “Surely th”; `bl15y` (content) “Come and behold, Rabbi Shimon said that the prayer of the congregation”
- `1.167a.9`: `bl15l` (content) “Laban used ten kinds of divination and enchantments from the illuminat”; `bl15z` (content) “Rabbi Yehuda began the discussion with the verse, “Happy is the man wh”

**Header numbers colliding with another block** (1)

- `1.167a`: `bl15c` (header) “Volume 1:167a”; `bl15q` (header) “Volume 1:167b”

### The Apocryphal Acts of Paul, Peter, John, Andrew and Thomas (`the_apocryphal_acts_deuterocanonical_christianity_64041fd8223b172c0534decb38a1ddf2`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (8)

- `1.4.1`: `bldi` (content) “The discovery of the Acta Pauli in the Coptic has fully confirmed the ”; `ble8` (content) “In 1823 Prof. Rinck published at Heidelberg: das Sendschreiben der Kor”; `bled` (content) “The Coptic version, though fragmentary, is an important witness and is”; `blee` (content) “In the Coptic the correspondence is thus prefaced: “The Corinthians we”; `blei` (header) “[A. LETTER OF THE CORINTHIANS TO THE APOSTLE PAUL.]”; `bl2au` (header) “I”
- `1.4.2.1`: `blf8` (content) “The deacons Threptus and Eutychus took the letter to Philippi,”; `blfd` (content) “Paul, the prisoner of Jesus Christ, to the brethren at Corinth — greet”
- `1.4.2.2`: `blf9` (content) “So that Paul received it, being himself in prison because of Stratonik”; `blfe` (content) “Being in many afflictions, I marvel not, that the teachings of the evi”
- `1.4.2.3`: `blfa` (content) “And exclaimed saying: “it had been better, had I died and were with th”; `blff` (content) “For my Lord Jesus Christ will hasten his coming, since he can no longe”
- `1.4.2.4`: `blfb` (content) ““And to be in prison in the face of such great distress and behold suc”; `blfg` (content) “For I delivered unto you first of all what I received from the apostle”
- `1.4.2.5`: `blfc` (content) “And under much affliction Paul wrote the answer to the letter.”; `blfq` (content) “That our Lord Jesus Christ was born of Mary of the seed of David, the ”
- `2.4.22`: `blov` (content) “And she fell down to my feet and said, Man, who thou art, I know not. ”; `bln1` (content) ““Dearest and most beloved brethren, let us fast and pray to the Lord. ”
- `4.1`: `bl15o` (content) “Of Andrew, the brother of Peter (Matt. IV, 18; Mark I, 16; XIII, 3; Jo”; `blp9` (content) “Leucian Acts of Andrew, like those of other apostles, are mentioned fi”; `bl15s` (content) “Of the material of the Acts of Andrew, which still recently has come t”; `bl15t` (header) “I.”

**Header numbers colliding with another block** (19)

- `1`: `blq6` (struct) “”; `bl6b` (header) “THE APOCRYPHAL ACTS”
- `1.1`: `bl6c` (header) “I.”; `bl6d` (header) “THE ACTS OF PAUL.”
- `1.4.2`: `bl2b9` (header) “II”; `bl2c0` (header) “[B. PAUL'S EPISTLE TO THE CORINTHIANS.]”
- `2.5`: `blk8` (header) “[PETER'S AFFAIR WITH SIMON]”; `blk9` (header) “(Actus Vercellenses.)”; `blka` (header) “(Acta Apostolonim Apocrypha I, pp. 45-103)”; `bl2bu` (header) “[MARTYRDOM OF THE HOLY APOSTLE PETER]”
- `3.4`: `blvw` (header) “Lycomedes and Cleopatra.”; `blwn` (header) “THE PICTURE OF JOHN.”
- … 14 more in the TSV

**Source / citation lines carrying a number** (1)

- `2.2.5`: `bl2b8` (source) “(Pages 133-134 are wanting.)”; `blon` (content) “{the men of} (135) Ptolemy brought the girl, and leaving her before th”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `5.2.1`: `bloo` (lead-in) “{FIRST DEED OF THE APOSTLE JUDAS THOMAS. HOW THE LORD SOLD HIM TO THE ”; `bl197` (content) “At that time we the apostles were all in Jerusalem — Simon called Pete”

### The Babylonian Talmud (`the_babylonian_talmud_judaism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (8)

- `p.1`: `bl2t` (content) “THE translator of the Talmud, who has now reached the thirteenth volum”; `bl31` (content) “[To the first edition.]”; `bl1c3` (content) ““Abayi said: “May it be reckoned to me (for my reward in the world to ”
- `p.2`: `bl2u` (content) “This is certainly an encouragement to him to continue his work, with t”; `bl1c4` (content) “[Bearing the above motto in mind and as a matter of peculiar interest,”
- `p.3`: `bl2v` (content) “In revising this volume the translator had in mind the many criticisms”; `bl1c5` (content) “With all pious Israelites who were exclusively engaged in the study of”
- `p.4`: `bl2w` (content) “The translator will be very grateful to critics who will call his atte”; `bl1c6` (content) “We shall return to thee, Tract Sabbath, and mayest thou return to us! ”
- `p.5`: `bl2x` (content) “The translator further hopes that this and the succeeding volumes will”; `bl1c7` (content) “[This is to be repeated three times, when the following is to be recit”
- `p.6`: `bl2y` (content) “M. L. R.”; `bl1c8` (content) “May it be Thy will, O Lord, our God and God of our fathers, that Thy L”
- `p.7`: `bl2z` (content) “NEW YORK, June, 1901.”; `bl1c9` (content) “Make sweet, O Lord, our God, the words of Thy Law in our mouths, and i”
- `3.80`: `ble9` (content) “And R. Zera himself was deliberating: Did indeed R. Johanan say so? Ha”; `blee` (content) “MISHNA IX.: One may put a vessel underneath a lamp for the purpose of ”

**Header numbers colliding with another block** (5)

- `1`: `bl1cg` (struct) “”; `bl5j` (header) “Chapter I Regulations regarding Transfer on Sabbath”
- `p`: `bl2s` (header) “Preface to the Second Edition”; `bl1c2` (header) “The Prayer at the Conclusion of a Tract”
- `i.1`: `bl3h` (content) “ON this, the appearance of our latest literary undertaking, we deem a ”; `bl3r` (header) “Introduction to Tract Sabbath”
- `s.2`: `bl4n` (content) “After careful examination of the volumes, page by page, it has been de”; `blqc` (header) “Synopsis of Subjects of Volume II. Tract Sabbath”
- `11`: `blqd` (header) “Chapter XI”; `blqf` (header) “Chapter XII”; `blqh` (header) “Chapter XIII”; `blqj` (header) “Chapter XIV”; `blqn` (header) “Chapter XV”; `blqq` (header) “Chapter XVI”; `blqu` (header) “Chapter XVII”; `blqw` (header) “Chapter XVIII”; `blr0` (header) “Chapter XIX”; `blr3` (header) “Chapter XX”; `blr5` (header) “Chapter XXI”; `blr7` (header) “Chapter XXII”; `blrc` (header) “Chapter XXIII”; `blrg` (header) “Chapter XXIV”; `blrm` (header) “Chapter XI Regulations Concerning Throwing from One Ground into Anothe”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `p.13`: `bl3e` (lead-in) “THE EDITOR.”; `bl3f` (content) “CINCINNATI, May, 1896.”
- `i.1.28`: `bl4j` (lead-in) “MICHAEL L. RODKINSON.”; `bl4k` (content) “CINCINNATI, March, 1896.”

### Kitab al Khazari (`kitab_al_khazari_judaism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (8)

- `3.75`: `bl8r` (content) “['He] commanded' refers to jurisdiction. 'The Lord' refers to prohibit”; `bl8q` (content) “There is a wide difference between these injunctions and the verse. Th”; `bl8p` (content) “Al Khazari: Thou hast pleased me greatly, and strengthened my belief i”
- `4.27`: `blcb` (content) “THREE MOTHERS”; `blbu` (content) “Al Khazari: Why should the letters H W J or an angel or a sphere or ot”
- `4.28`: `blca` (content) “In the Universe: Air, Water, Fire.”; `blbt` (content) “The Rabbi: Just so, O King of the Khazars, by God! This is the truth, ”
- `4.29`: `blc9` (content) “In the Soul: Chest, Belly, Head.”; `blbs` (content) “Al Khazari: Give me now an idea of the Sages' accomplishments in natur”
- `4.30`: `blc8` (content) “In the Year: Moisture, Cold, Heat.”; `blbr` (content) “The Rabbi: I have already called thy attention to the fact that they w”
- `4.31`: `blc7` (content) “SEVEN DOUBLE [CONSONANTS].”; `blbq` (content) “Al Khazari: I wonder how it is that the books written for the purpose ”
- `4.32`: `blc6` (content) “Beth, Gimel, Daleth, Kaf, Pe, Resh, Tāv.”; `blbp` (content) “The Rabbi: Because their contents were retained in the minds of a few ”
- `4.33`: `blc5` (content) “In the Universe: Saturnus, Jupiter, Mars, Sun, Venus, Mercury, Moon.”; `blbo` (content) “Finished is Part Four, and we begin —”

### Atharva Veda (`atharvaveda_hinduism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (7)

- `3:29.1`: `rd` (content) “When yonder kings who sit beside Yama divide among themselves the sixt”; `ro` (content) “Freedom from hate I bring to you, concord and unanimity. Love one anot”
- `3:29.2`: `re` (content) “He satisfies each hope and want, prevailing, present and prepared. The”; `rp` (content) “One-minded with his mother let the son be loyal to his sire. Let the w”
- `3:29.3`: `rf` (content) “He who bestows a white-hooved ram, adequate to the place he holds. Asc”; `rq` (content) “No brother hate his brother, no sister to sister be unkind. Unanimous,”
- `3:29.4`: `rg` (content) “He who bestows a white-hooved ram, adequate to the place he holds. Off”; `rr` (content) “That spell through which Gods sever not, nor ever bear each other hate”
- `3:29.5`: `rh` (content) “He who bestows a white-hooved ram, adequate to the place he holds, Off”; `rs` (content) “Intelligent, submissive, rest united, friendly and kind, bearing the y”
- `3:29.6`: `ri` (content) “Like a refreshing draught, like sea, the mighty flood, he faileth not.”; `rt` (content) “Let what you drink, your share of food be common together, with one co”
- `3:29.7`: `rj` (content) “Whose gift was this, and given to whom? Kāma to Kāma gave the gift. Kā”; `ru` (content) “With binding charm I make you all united, obeying one sole leader and ”

**Opening invocations carrying a number** (4)

- `5:27.6`: `1fm` “He is the furtherer at glad oblations: there stood the Vasus and the treasure-givers.”
- `13:4.35`: `43p` “He is the offspring of the Earth: Earth hath her origin from him.”
- `13:4.37`: `43r` “He is the waters’ offspring: and from him the waters were produced.”
- `13:4.39`: `43t` “He is the son of sacrifice: and sacrifice was born from him.”

**Header numbers colliding with another block** (574)

- `1:1`: `2u` (header) “HYMN I”; `2v` (header) “A prayer to Vāchaspati for divine illumination and help.”
- `1:2`: `32` (header) “HYMN II [pg a2]”; `33` (header) “A charm against dysentery”
- `1:3`: `bl695` (header) “HYMN III [pg a3]”; `bl693` (header) “A charm against constipation and suppression of urine”
- `1:4`: `3n` (header) “HYMN IV [pg a5]”; `3o` (header) “To the waters, for the prosperity of cattle”
- `1:5`: `3u` (header) “HYMN V”; `3v` (header) “To the waters, for strength and power”
- … 569 more in the TSV

### Selections from al-Futuhat al-Makkiyya (`the_meccan_revelations_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (7)

- `1.13`: `bl4i` (content) “Section”; `blpb` (source) “(What is perceived by its essence, what is perceived by its action and”; `bl4k` (content) “Then we also looked into all that it other than Allah and found it in ”
- `1.20`: `blpc` (content) “Section”; `bl4y` (content) “The imaginative (khayaliyya) faculty only takes what the senses give i”
- `1.37`: `bl5q` (content) “The Blowing of a spirit (ruh) into a heart (ru’)”; `bl5r` (source) “(The portion of the heart from the two fingers from an unseen aspect)”; `bl5s` (content) “‘The two fingers’ are the secret of essential perfection which is such”
- `1.45`: `bl63` (content) “The blowing of a spirit into a heart”; `bl64` (source) “(The portion of the heart in the right and left hands: the right and l”; `bl65` (content) “When the Truly Real manifests Himself to the secret (sirr) of a slave ”
- `3.16`: `bl9j` (content) “Brief Elucidation”; `bl9m` (source) “(Man is the Microcosm)”; `bl9n` (content) “As man is the Microcosm by way of the body, so he is also inconsiderab”
- `3.38`: `blaq` (content) “Section”; `blar` (source) “(The beginning of the world and its model: dust and the Muhammadan rea”; `blas` (content) ““Allah was and nothing was with Him.” (al-Bukhari) Then he added to th”
- `7.1`: `bli8` (content) “On the reason for the increase and decrease of knowledges and the word”; `bli9` (content) “The tajalli of the existence of the Truly Real in the sphere of the se”

**Header numbers colliding with another block** (1)

- `1`: `bl2u` (header) “by Shaykh Muhyiddin Ibn al-‘Arabi”; `bl3n` (header) “Chapter Three”

**Source / citation lines carrying a number** (79)

- `1.5`: `bl3w` (source) “(All known things were borne by the First Intellect)”; `bl3x` (content) “Know that the bearer of all known things, celestial and terrestial, is”
- `1.6`: `bl3y` (source) “(..except the Bewildered World)”; `bl3z` (content) “Know that the Bewildered World does not learn anything from the First ”
- `1.7`: `bl42` (source) “(…and except the science of the isolation ( tajrid ) of tawhid )”; `bl43` (content) “The principle of the Intellect teaching those below it is transpires i”
- `1.8`: `bl45` (source) “(The intellect’s incapacity for gnosis of Allah)”; `bl46` (content) “Knowledge of Allah is too difficult for the faculty of perception of t”
- `1.11`: `bl4d` (source) “(Matrices of the demands of knowledge)”; `bl4e` (content) “The matrices of the demands of are four: is?, what?, how? and why?. ‘I”
- … 74 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (30)

- `1.1`: `bl3o` (lead-in) “On Allah being disconnected from any connection (tashbih) or embodimen”; `bl3p` (lead-in) ““Allah is Greatly exalted over what the wrongdoers say.” (17:43)”; `bl3q` (content) “In the slave’s looking at his Lord in the purity and disconnection of ”
- `2.1`: `bl7e` (lead-in) “The Cause of the Beginning of the World and the Ranks of the Most Beau”; `bl7f` (content) “In the cause of the beginning and its rules, and the end of fabricatio”
- `3.1`: `bl8v` (lead-in) “Concerning the spheres of the Macrocosm and the Microcosm”; `bl8z` (content) “Look at this well-planned existence. Our existence is like the designa”
- `3.18`: `bl9p` (lead-in) “The spirit of the Macrocosm is this Microcosm”; `bl9s` (content) “The spirit of the great existence is this small existence.”
- `4.1`: `blc0` (lead-in) “The Beginning of Human Bodies (The last thing to come into existence i”; `blc1` (content) “The reality of the inward of man grew into a strong kingdom with manif”
- … 25 more in the TSV

### The Teachings of Zoroaster (`the_teachings_of_zoroaster_zoroastrian_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (7)

- `i.45`: `bl5c` (content) “OF THE LIFE ON THE EARTH”; `bl5e` (content) “Imagination soars high at this picture of pastoral bliss, of peaceful ”
- `i.106`: `bl7f` (lead-in) ““INCREASE, LIVE THE WHOLE TIME OF THY LIFE, AS LONG AS THOU WILT LIVE.”; `bl7g` (content) ““OF THE LIFE HEREAFTER””; `bl7i` (content) “Slowly and solemnly, now I approach this subject of great theological ”
- `i.117`: `bl7x` (content) “RESURRECTION”; `bl7z` (content) “Zarathustra asked Ahura-Mazda, “Whence does a body form again which th”
- `i.132`: `bl94` (content) ““Purity is for man, next to life, the greatest good that purity is pro”; `bl95` (content) ““Make thyself pure, O righteous man! Any one in the world here below c”
- `3.13`: `bl9x` (content) “. . . . .”; `bl9z` (lead-in) “. . . . .”; `bla0` (content) ““In forming a store of good works thou shouldst be diligent, so that i”
- `31.3`: `blgs` (content) “. . . . .”; `blgu` (content) ““May Ahura-Mazda (God) send you gifts, Bahman, thinking with the soul;”
- `32.13`: `blhk` (content) “. . . . .”; `blhn` (content) ““‘In the first place the friend who will assist you is God; but to att”

**Header numbers colliding with another block** (3)

- `1`: `blm8` (header) “Extracts”; `blm7` (header) “Purity”; `bl96` (header) “Prayer of Ashem-Vohû”
- `3`: `bl97` (header) “From Khordah-Avesta”; `bl9g` (header) “Commandments for the Body and the Soul”
- `32`: `blgp` (header) “Admonitions”; `blgt` (header) “Blessings”; `blgw` (header) “The Vision of Ardâ-Virâf”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (41)

- `i.15`: `bl4c` (lead-in) ““YOU SHALL THEREFORE HEARKEN TO THE SOUL OF NATURE””; `bl4d` (content) “I shall now explain the theology and moral philosophy of the religion ”
- `i.25`: `bl4o` (lead-in) “. . . . .”; `bl4p` (content) “(4) “who created us, who formed us, who keeps us, the Holiest among th”
- `i.125`: `blma` (lead-in) “S. A. KAPADIA.”; `bl8a` (content) “INNER TEMPLE, LONDON, January 1905.”
- `2.2`: `bl9e` (lead-in) “. . . . .”; `bl9f` (content) ““So let all deeds thou doest be henceforth good… A full atonement for ”
- `3.4`: `bl9l` (lead-in) “. . . . .”; `bl9m` (content) ““FORM NO COVETOUS DESIRE, so that the demon of greediness may not dece”
- … 36 more in the TSV

### The Alawite Book (`alawi_prayers_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (6)

- `52.1`: `bl10w` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl12c` (content) “O Allah!”
- `53.1`: `bl12d` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl13x` (content) “I am linked with such a bond with Allah, there is no god but Him.”
- `54.1`: `bl12s` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl141` (content) “O Allah!”
- `55.1`: `bl142` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl1a6` (content) “And how many bounties of Allah are concealed.”
- `56.1`: `bl19y` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl1a7` (content) “Say: O Allah, Master of the Kingdom. You give the kingdom to whosoever”
- `57.1`: `bl1ah` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl1bp` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl1bo` (content) “O Allah!”

**Opening invocations carrying a number** (35)

- `1.2`: `blho` “He is the Administrator without any minister.”
- `1.4`: `blhc` “He is the First, Who cannot be described. He is Eternal and will live forever, (even) after the anni”
- `1.5`: `bl3g` “He is the greatest Lord, the Light of the earths and heavens.”
- `25.27`: `blri` “He is the possessor of pure knowledge.”
- `39.1`: `blyc` “In the name of Allah and by Allah, I seek refuge from the Honoured name of Allah, by the great name ”
- `41.1`: `blxz` “In the name of Allah, Allah is the Curer and there is no might or power except with Allah.”
- `43.1`: `bly7` “In the name of Allah, the Beneficent, the Merciful”
- `48.1`: `bl106` “In the name of Allah and by Allah, glorified is Allah in the name of Allah and there is no power or ”
- `50.1`: `bl10a` “In the name of Allah, the Beneficent, the Merciful”
- `50.10`: `bl10n` “In the name of Allah, the Beneficent, the Merciful.”
- `52.1`: `bl10w` “In the name of Allah, the Beneficent, the Merciful”
- `53.1`: `bl12d` “In the name of Allah, the Beneficent, the Merciful”
- `54.1`: `bl12s` “In the name of Allah, the Beneficent, the Merciful”
- `53.2`: `bl13w` “He is the one to give life to the dead and is their inheritor.”
- `55.1`: `bl142` “In the name of Allah, the Beneficent, the Merciful”
- `54.42`: `bl15l` “He is the Self-Existing and never inattentive.”
- `54.43`: `bl15k` “He is the forbearing and not debased.”
- `56.1`: `bl19y` “In the name of Allah, the Beneficent, the Merciful”
- `57.1`: `bl1ah` “In the name of Allah, the Beneficent, the Merciful”
- `65.1`: `bl1ec` “In the name of Allah, the Beneficent, the Merciful”
- `91.1`: `bl1ox` “In the name of Allah and for Allah is the praise Who has made water pure and has not declared it imp”
- `100.1`: `bl1o9` “In the name of Allah, In the name of Allah, In the name of Allah.”
- `115.1`: `bl1ru` “In the name of Allah I put my side on the bed.”
- `124.31`: `bl1ws` “He is the (eternal) Monarch; therefore downfall cannot be ascribed to Him.”
- `124.37`: `bl1wp` “He is the Forerunner Who has no predecessor.”
- `124.55`: `bl1w5` “He is the most High and the Great. Glory be to Allah Who raises up the souls when men are dead.”
- `124.63`: `bl1vx` “He is the King the most Holy the Bestower of conviction, the Guardian, the Supreme, the Great.”
- `124.65`: `bl1t7` “He is the Creator, Maker and Fashioner.”
- `126.3`: `bl1wl` “He is the Lord of the invulnerable strength, Excellent and Grantor of favour.”
- `126.13`: `bl1y3` “He is the Cleaver of the dawn; and has made the night for rest and the sun and the moon for reckonin”
- `126.24`: `bl1xk` “He is the greatest amongst all the judges and the quickest amidst all reckoners, Most Generous of al”
- `134.19`: `bl26y` “He is the First and the Last and the Manifest and the Hidden, and is the Knower of all things.”
- `147.15`: `bl2lm` “He is the Subtle, All-aware.”
- `150.23`: `bl2ss` “In the name of Allah.”
- `152.171`: `bl2z4` “He is the Lord of the Great Throne.”

**Header numbers colliding with another block** (1)

- `2`: `bli5` (header) “Famous as ''Dua-e-Yastasheer''”; `bl4r` (header) “(2) His Prayer for Eulogizing Allah and Expressing His greatness”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (151)

- `1.1`: `blhh` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl3d` (content) “All praise is due to Allah except Whom there is no god and He is the L”
- `2.1`: `bl4s` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl4t` (content) “Praise is for Allah Who is the foremost of the Praised and the one Who”
- `3.1`: `bl7m` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl7n` (content) “O Allah! You are ever-living Who will never die, You are the truthful ”
- `4.1`: `bl9e` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl9f` (content) “O True Safety! O believer! O True Protector! O possessor of Honour and”
- `5.1`: `bl9s` (lead-in) “In the name of Allah, the Beneficent, the Merciful”; `bl9t` (content) “O Allah! I ask from You not from others.”
- … 146 more in the TSV

### The Light of Divine Guidance (Volume II) (`light_of_divine_guidance_volume_2_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (6)

- `2.1`: `bl35` (lead-in) “5 January 1923”; `bl36` (content) “The beloved of the Lord and the handmaids of the Merciful throughout G”; `bl37` (content) “His honor, Jináb-i ‘Abdu’l-Ḥusayn-í Avárih, fired with the spirit of s”
- `10.1`: `bl4v` (lead-in) “8 June 1929”; `bl4w` (content) “The beloved of the Lord and the handmaids of the Merciful throughout E”; `bl4y` (content) “Dr. Yúnís Ḵhán Afrúḵhtih, an outstanding figure in the teaching and ”
- `10.2`: `bl4x` (content) “Dearly-beloved friends:”; `bl4z` (content) “I urge every individual believer, and particularly every local Assembl”
- `25.3`: `bl86` (content) “With hearty greetings and good wishes to you all,”; `bl87` (source) “[From the Guardian:]”; `bl88` (lead-in) “Dearly-beloved co-workers:”; `bl89` (content) “I was so pleased to receive your most welcome message. Any letter bear”
- `107.1`: `blq3` (content) “18 December 1949”; `blq6` (content) “Your letter of November 12 has been received by our Guardian, and he h”
- `107.2`: `blq4` (lead-in) “Bahá’í Youth Committee of Germany and Austria”; `blq5` (content) “Dear Bahá’í Friends:”; `blq7` (content) “He will certainly pray for the success of your very important branch o”

**Header numbers colliding with another block** (1)

- `6`: `bl33` (content) “I am yours very sincerely, Shoghi Rabbani (grandson of ‘Abdu’l-Bahá)”; `bl3z` (header) “Letter of 9 November 1926”

**Signature / closing lines carrying a number** (3)

- `11.5`: `bl58` (content) “My dear co-worker:”; `bl5a` (signature) “Your true brother, Shoghi”
- `65.5`: `blhh` (signature) “Your true brother, Shoghi March 1947”; `blhi` (content) “Bahá’u’lláh has given His wonderful teachings and His New World Order ”
- `101.6`: `blon` (source) “[From the Guardian:]”; `blop` (signature) “Your true and grateful brother, Shoghi”

**Source / citation lines carrying a number** (55)

- `5.3`: `bl3x` (source) “[From the Guardian:]”; `bl3y` (content) “Your welcome letter, indicative of your perseverance in service, despi”
- `6.2`: `bl42` (source) “[From the Guardian:]”; `bl43` (content) “This is just a word that I wish to add in person, assuring you and the”
- `11.4`: `bl57` (source) “[From the Guardian:]”; `bl59` (content) “I wish to assure you in person of my keen interest in your activities ”
- `12.4`: `bl5h` (source) “[From the Guardian:]”; `bl5i` (content) “With the assurance of my deep affection and fervent prayers at the hol”
- `13.3`: `bl5p` (source) “[From the Guardian:]”; `bl5q` (content) “…I will continue to pray for you from the depths of my heart. The test”
- … 50 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (193)

- `1`: `bl2u` (header) “Letter of 27 February (1922)”; `bl2w` (lead-in) “27 February (1922)”; `bl2x` (content) “Honoured Sir:”
- `3.1`: `bl3c` (lead-in) “18 December 1925”; `bl3d` (lead-in) “An die lieben Bahá’í Geschwister in Esslingen Meine geliebten Bahá’í G”; `bl3e` (content) “Euren schönen Brief vom 9. Kaul hat unser geliebter Hüter, Shoghi Effe”
- `3.5`: `bl3j` (lead-in) “My dearest friends:”; `bl3k` (content) “This is to assure you personally of my continued and earnest prayers f”
- `4.1`: `bl3n` (lead-in) “15 February 1926”; `bl3o` (content) “With regard to your first question on alcohol and drinking Bahá’u’lláh”
- `5.1`: `bl3u` (lead-in) “4 November 1926”; `bl3v` (content) “The wine mentioned in the Tablets has undoubtedly a spiritual meaning ”
- … 188 more in the TSV

### Sutra Collection (RS) (`sutra_collection_rs_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (6)

- `38.1`: `blxf` (content) “Thus have I heard:”; `bl103` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- `39.1`: `bl102` (content) “I heard thus:”; `bl10f` (content) “At one time the Blessed One was touring Kosala with a large Community ”
- `40.1`: `bl10e` (content) “I heard thus.”; `bl115` (content) ““There are these four grounds for the bonds of fellowship. Which four?”
- `42.1`: `bl119` (content) “Thus Have I Heard:”; `bl6v` (content) “Translator’s note: Although the Jains, like the Buddhists, teach a doc”
- `48.1`: `bl18d` (content) “I heard thus:”; `bl191` (content) ““Monks, these six are conditions that are conducive to amiability, tha”
- `52.1`: `bl1b2` (content) “Thus have I heard:”; `bl1bn` (content) “At that time the Blessed Buddha dwelt near Ràjagaha, on the Gigghakåña”

**Header numbers colliding with another block** (69)

- `2`: `bl7q` (header) “Alone”; `bl7x` (header) “Rahula Sutta”
- `3`: `bl7w` (header) “Advice to Rahula”; `bl84` (header) “Raja Sutta”
- `4`: `bl83` (header) “The King”; `bl8e` (header) “Ratana Sutta”
- `5`: `bl8d` (header) “The Jewel Discourse”; `bl91` (header) “Ratha-vinita Sutta”
- `6`: `bl90` (header) “Relay Chariots”; `blaa` (header) “Rathakara Sutta”
- … 64 more in the TSV

**Signature / closing lines carrying a number** (1)

- `37.11`: `blxb` (signature) “Bhikkhu Bodhi”; `blxg` (content) “On one occasion the Blessed One was living at Savatthi in Jeta’s Grove”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (14)

- `9.1`: `blb4` (lead-in) “I heard thus.”; `blb7` (content) “At one time the Blessed One was living with the Sakyas in their villag”
- `11.1`: `blco` (lead-in) “Thus have I heard:”; `blcr` (content) “On one occasion the Blessed One was living in the Deer Park at Isipata”
- `17.1`: `bl1tg` (lead-in) “I heard thus:”; `blhe` (content) “The Blessed One was living in the monastery offered by Anathapindika i”
- `18.1`: `bli4` (lead-in) “Translator’s Introduction”; `bli5` (content) “Despite the abstract format of this discourse, it deals with an emotio”
- `19.1`: `blja` (lead-in) “Thus have I heard:”; `bl1tp` (content) “On one occasion the Blessed One was wandering in the Kosalan country w”
- … 9 more in the TSV

### The Universal Tree and the Four Birds (Mystical Treatises) (`mystical_writings_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (6)

- `1.1`: `bl4t` (content) “It is He who is revealed in every face, sought in every sign, gazed up”; `bl4v` (content) “Ibn ʿArabī or Abū ‘Abd Allah Muḥammad ibn al-‘Arabī at-Ṭā’ī al-Ḥātimī ”
- `1.7`: `blgc` (content) “”; `bl5b` (content) “From my incompleteness to my completeness , and from my inclination to”
- `5.5`: `blaf` (content) “”; `blag` (content) “From Persian to Arab and from Arab to Persian, To explain the mysterie”
- `15.2`: `bloy` (content) “”; `bltx` (content) “In addition, the author continues to group things in pairs, five of wh”
- `14.28`: `blrc` (content) “Secrets of the Name Abū al-Fāwaris Ṣakhr [= Khālid] ibn Sinān”; `blst` (content) “Another word belonging to this root is “ṣamda,” which is “a rock firml”
- `14.32`: `blgi` (lead-in) “The Dedicatee”; `blt9` (content) “Khālid ibn Sinān, Prophet of the Barzakh”; `bltb` (content) “A barzakh is something that stands between and separates two other thi”

**Header numbers colliding with another block** (6)

- `2`: `bl4s` (header) “RAFI ZABOR”; `bl69` (header) “BIOGRAPHY OF IBN ‘ARABĪ”
- `4`: `bl7y` (header) “Overview”; `bl8l` (header) “Stylistic Considerations”
- `12`: `blmq` (header) “COMMENTARY”; `blmr` (header) “The Title”
- `13`: `blmt` (header) “Ittiḥād”; `bloj` (header) “Kawnī”; `blol` (header) “Ishhād”; `blow` (header) “‘Aynī”; `blp4` (header) “The Proemial Poems”
- `18`: `blvl` (header) “The Universal Tree’s Poem”; `blvn` (header) “The Ringdove (al-muṭawwaqa al-ivarqā’)”; `blx8` (header) “The Ringdove’s Poem”; `blxo` (header) “The Eagle (‘uqāb)”; `bly2` (header) “The Eagle’s Poem”; `blyc` (header) “The ‘Anqā’”
- … 1 more in the TSV

**Signature / closing lines carrying a number** (1)

- `1.2`: `bl4u` (signature) “Muḥyiddīn Ibn ʿArabī”; `bl4z` (content) “In it the reader will encounter a work of extraordinary literary and s”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (5)

- `1`: `bl3p` (lead-in) “I am in love with no other than myself, and my very separation is my u”; `bl1wm` (lead-in) “I am my beloved and my lover; I am my knight and my maiden.”; `bl3q` (content) “Muḥyiddīn Ibn ʿArabī”; `bl4r` (header) “OF THE TREE AND ITS FOUR BIRDS”
- `14.20`: `blrr` (lead-in) “Khāalid-eternal = ṣamad = rock = ṣakhr”; `blrs` (content) ““Khālid” is an active participle, deriving from the verb khalada: to r”
- `14.22`: `bls8` (lead-in) “Ṣakhr-rock = ḥajar = khālid = jabal”; `bls9` (content) “The word “ṣakhr” appears three times in the Qur’an: (1) “Didst thou se”
- `14.25`: `blsc` (lead-in) “Ṣamad”; `blsd` (content) ““Ṣamad” is a curious word that appears only once in the Qur’an, in Sur”
- `17.1`: `blun` (lead-in) “The Universal Tree ( al-shajara al-kullī)”; `bluo` (content) “If you ask: What is the Tree?, we answer: [It is] the Perfect Human Be”

### Revival of Religious Learnings Vol-II (`revival_of_religious_sciences_vol_2_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `4.1.20`: `blbz` (content) “DIFFERENT STAGES OF HALAL AND HARAM”; `blc1` (content) “(1) First stage is lowest and it is forbearance of just and ordinary M”
- `4.1.26`: `blc6` (content) “EXAMPLES OF THE ABOVE FOUR-STATES”; `blc9` (content) “(3) In the Third stage, it is the forbearance of the God-fearing peopl”
- `5.1.11`: `blga` (content) “DISTINCTION BETWEEN LOVE FOR GOD AND LOVE FOR WORLD”; `blge` (content) “Loves has got two conditions. Firstly, a thing is loved for its merits”
- `5.1.25`: `blh3` (content) “HATRED FOR GOD”; `blh8` (content) “Classes of sinners and treatment with them: There are two classes of s”
- `11.33`: `bl13g` (content) “(10) PROPHET’S BRAVERY AND HEROISM”; `bl13i` (lead-in) “(11) PROPHET’S MODESTY AND HUMILITY”; `bl13j` (content) “Inspite of the lofty position of the Prophet, he was the most humble a”

**Header numbers colliding with another block** (10)

- `2`: `bl2x` (header) “THE BOOK OF WORLDLY USAGES”; `bl5c` (header) “CHAPTER II: SECRETS OF MARRIAGE”
- `6`: `bl34` (header) “PART I”; `bll8` (header) “CHAPTER VI: DUTIES TO RELATIVES, NEIGHBOURS, SLAVES AND MUSLIMS”
- `1.1`: `bl37` (content) “All praise is due to God who conducts the whole creation in an orderly”; `bl39` (header) “SECTION I: RULES OF EATING ALONE”
- `1.2`: `bl38` (content) “The object of the wise is the vision of the Lord in the next world and”; `bl3o` (header) “SECTION 2: RULES FOR EATING WITH OTHERS”
- `3`: `bl5e` (header) “MERITS AND DEMERITS”; `bl8l` (header) “CHAPTER III: EARNINGS AND TRADE AND COMMERCE”
- … 5 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (53)

- `1.3.2`: `bl3w` (lead-in) “RULES OF EATING”; `bl150` (content) “(1) When enter the house of your friend to take your meal, don’t enter”
- `2.5`: `bl5l` (lead-in) “REASONS FOR NOT MARRYING”; `bl5m` (content) “The Prophet said: After two hundred years. A man who will have no wife”
- `2.7`: `bl5p` (lead-in) “BENEFITS OF MARRIAGE”; `bl5q` (content) “There are five benefits of marriage (1) to have children, (2) to contr”
- `2.3.29`: `bl87` (lead-in) “DIVORCE”; `bl88` (content) “Divorce is lawful, but of all the lawful things, the most detestable t”
- `2.3.30`: `bl89` (lead-in) “FOUR MATTERS AT THE TIME OF DIVORCE”; `bl15y` (content) “(1) The husband will divorce the wife in her pure state and not at the”
- … 48 more in the TSV

### Kitab Al-Kafi 8 (`kitab_al_kafi_vol8_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `1.1`: `blfv` (lead-in) “H 14449”; `bl30` (content) “Muhammad Ibn Yaqub Al-Kulayni has narrated that, ‘Narrated to me Ali I”; `bl31` (content) “‘Abu Abdullah, wrote this letter to his companions and commanded them ”; `bl5a` (header) “THE PARCHMENT OF ALI BIN AL-HUSAYN AND HIS SPEECH REGARDING THE ASCETI”
- `1.2`: `bl32` (content) “He said, ‘Narrated to me A-Hassan Ibn Muhammad, from Ja’far Ibn Muhamm”; `bl33` (content) “He said that, ‘I brought out this letter of Abu Abdullah to his compan”; `bl5x` (header) “SERMON OF AMIR -UL- MOMINEEN AND IT IS THE SERMON OF THE MEANS (AL-WAS”
- `1.1.1`: `blfz` (lead-in) “H 14450”; `bl5b` (content) “Muhammad Bin Yahya, from Ahmad Bin Muhammad Bin Isa, and Ali Bin Ibrah”; `bl5c` (content) “‘I have not heard of anyone who was more ascetic (pious) than Ali Bin ”
- `1.3.1`: `bl7k` (content) “Muhammad Bin Ali Bin Ma’mar, from Muhammad Bin Ali, from Abdullah Bin ”; `bl7l` (content) “Amir-ul-Momineen gave a sermon to the people at Al-Medina.”
- `2.8.1`: `blee` (content) “Abu Ali Al-Ashary, from Muhammad Bin Saalim and Ali Bin Ibrahim, from ”; `blef` (content) “Abu Ja’far having said: The Messenger of Allah came out for the displa”

**Opening invocations carrying a number** (1)

- `1`: `blfy` “In the name of Allah, the Beneficent, the Merciful”

**Header numbers colliding with another block** (4)

- `1`: `blfx` (struct) “”; `blfy` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl2t` (header) “Part I”
- `2`: `bl2x` (header) “The Book — Garden (of Flowers)”; `bl9h` (header) “Part II”
- `1.3`: `bl34` (content) “‘In the Name of Allah, the Beneficent, the Merciful. Having said that,”; `bl7j` (header) “SERMON OF AL-TAALUTIYYA”
- `1.4`: `bl35` (content) “So if you are tested with that from them, that they wish to harm you a”; `bl8o` (header) “HADEETH OF ABU ABDULLAH WITH AL-MANSOUR IN HIS PROCESSION”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (28)

- `1.1.16`: `blg4` (lead-in) “H 14451”; `bl5s` (lead-in) “Ahmad Bin Muhammad Bin Ahmad All Kufy, and he is Al-A’asmiy, from Abdu”; `bl5t` (content) “Abu Al-Hassan Musa having said: Amir-ul-Momineen used to bequeath to h”
- `1.94`: `blg0` (lead-in) “H 14452”; `bl5y` (content) “Muhammad Bin Ali Bin Ma’mar, from Muhammad Bin Ali Bin Ukaayat Al-Tami”
- `1.3.15`: `blga` (lead-in) “14454”; `bl7z` (lead-in) “A number from our companions, from Sahl Bin Ziyad, from Muhammad Bin S”; `bl80` (content) “‘I was in the presence of Abu Abdullah, when Abu Baseer came up to him”
- `1.180`: `blg6` (lead-in) “H 14455”; `bl8p` (content) “Muhammad Bin Yahya, from Ahmad Bin Muhammad, from one of his companion”
- `2.1`: `blg8` (header) “HADEETH OF MUSA”; `blg2` (lead-in) “H 14456”; `bl9m` (content) “Ali Bin Ibrahim, from his father, from Amro Bin Usman, from Ali Bin Is”
- … 23 more in the TSV

### The National Spiritual Assembly (`the_national_spiritual_assembly_bahai_compilation_b925513a4f5ff7428891706712858edf`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `21.2`: `bld1` (content) “It is my firm conviction that it is the bounden duty, in the interests”; `bl5b` (content) “The National Spiritual Assembly, however, in view of the unavoidable l”
- `21.3`: `bld0` (content) “The seating of delegates to the Convention, i.e. the right to decide u”; `bl5c` (content) “Nothing short of the all-encompassing, all-pervading power of His Guid”
- `23.2`: `bld4` (content) “The function of the Convention is purely advisory and though the advic”; `bl5j` (content) “The Guardian believes that the right to elect the Chairman and the Sec”
- `44.5`: `bld8` (content) “In the pursuit of their major task their function is to preserve the i”; `bl82` (content) “It is for the national representatives of the Bahá’í Cause to observe ”
- `87.2`: `bldd` (content) “He feels your Assembly must act with the greatest wisdom in such matte”; `blc5` (content) “The Guardian feels very strongly that everywhere, throughout the entir”

**Header numbers colliding with another block** (2)

- `80`: `blbg` (header) “— 80 —”; `blbh` (content) “He suggests you let the entire matter of your appeal drop. Unless a ve”
- `81`: `blbi` (source) “From a letter 8 December 1950 written on behalf of Shoghi Effendi to a”; `blbj` (header) “— 81 —”

**Source / citation lines carrying a number** (13)

- `4.3`: `blcw` (content) “If we but turn our gaze to the high qualifications of the members of B”; `bl3p` (source) “From a letter 3 June 1925 written by Shoghi Effendi to the delegates a”
- `13.2`: `blcx` (content) “Upon the Local Assemblies, whose special function and high privilege i”; `bl4j` (source) “In the handwriting of Shoghi Effendi, appended to a letter 30 January ”
- `22.2`: `bld2` (content) “Apart from the local elections, which universally are to be renewed on”; `bl5g` (source) “From a letter 24 October 1925 written by Shoghi Effendi to the Nationa”
- `24.4`: `bld6` (content) “Consultation, frank and unfettered, is the bedrock of this unique Orde”; `bl5t` (source) “From a letter 18 November 1933 written on behalf of Shoghi Effendi to ”
- `29.4`: `bld7` (content) “And when they are called upon to arrive at a certain decision, they sh”; `bl6f` (source) “From a letter 23 February 1924 written by Shoghi Effendi to the Bahá’í”
- … 8 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `23.5`: `bl5m` (lead-in) “Postscript in the handwriting of Shoghi Effendi:”; `bl5n` (content) “The utmost care and vigilance should be exercised lest any fresh misun”
- `24.3`: `bl5r` (lead-in) “Postscript in the handwriting of Shoghi Effendi:”; `bl5s` (content) “I wish to affirm, without the least hesitation or ambiguity, that the ”

### Revival of Religious Learnings Vol-IV (`the_revival_of_religious_learning_vol4_islam_ocean50a36bcc2251e1182f42f2dfde95a466`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `1.1.22`: `bl77` (content) “GOD IS AGENT OF ACTIONS”; `bl7n` (content) “Question: You have said that every opinion is true. Cite an example fo”
- `1.1.28`: `bl8l` (content) “EXAMPLES OF A SINNER AND A VIRTUOUS MAN”; `bl8y` (content) “So he who commits sin having faith is like the eater who eats food inj”
- `1.1.35`: `bla3` (content) “COMPULSORY TAUBA’S SYSTEMATIC DESCRIPTIONS”; `blan` (content) “Answer: Man is not free from greed from the beginning of his birth. So”
- `2.10.153`: `bl5vy` (content) “(14) God’s mercy”; `bl5w0` (content) “We have, by the grace of God, finished the book “The Revival of religi”
- `2.10.154`: `bl5vz` (content) “The end of the book “The Revival of religious learning””; `bl5w1` (content) “We pray to God for forgiveness for the mistakes we committed in this b”

**Header numbers colliding with another block** (1)

- `1.5`: `bl3h2` (header) “SECTION 2: RENUNCIATION OF THE WORLD”; `bl41d` (header) “CHAPTER V: TAUHID AND TAWAKKAL”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (34)

- `1.1.1`: `bl3m` (lead-in) “MEANING OF TAUBA”; `bl3n` (content) “Tauba means repentance for a sin by taking promise not to do the same ”
- `1.1.2`: `bl3v` (lead-in) “FOUR PRINCIPLES OF TAUBA”; `bl3w` (content) “Human nature is mixed up of two elements. Every man has got the nature”
- `1.1.7`: `bl4b` (lead-in) “FIRST PRINCIPLE — FORM OF TAUBA, KNOWLEDGE AND LIMIT”; `bl4d` (content) “Repentance consists of three elements — knowledge condition and action”
- `1.1.10`: `bl50` (lead-in) “MERITS OF TAUBA”; `bl51` (content) “Tauba is Wazeb or compulsory. There are different classes of sojourner”
- `1.1.47`: `blcz` (lead-in) “CONDITION OF ACCEPTANCE OF TAUBA”; `bld0` (content) “Every sincere Tauba is accepted. Those who observe with the inner ligh”
- … 29 more in the TSV

### The Dawn-Breakers (`dawn-breakers-prod-version_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `4.1`: `7i` (content) “THE news of the passing of his beloved master brought unspeakable sorr”; `bk` (content) “WITH these noble words ringing in his ears, Mullá Ḥusayn embarked upon”
- `4.5`: `7k` (content) “He continued in this manner, in the presence of the assembled disciple”; `bm` (content) “This severe rebuke, pronounced by Ḥájí Kalbásí, greatly disconcerted t”
- `4.8`: `7l` (content) “No sooner had Mullá Ḥusayn retired than the Siyyid charged one of his ”; `bq` (content) “Among the siyyids of Iṣfahán, a few, such as Mírzá Muḥammad-‘Alíy-i-Na”
- `4.16`: `7w` (content) ““I often felt the urge to seek alone the presence of that Hás̱himite Y”; `c0` (content) “During his stay in Ṭihrán, Mullá Ḥusayn each day would leave his room ”
- `4.21`: `81` (content) ““I continued to be closely associated with Him until that great encoun”; `c4` (content) ““‘I arose and, filled with joy, hastened back to Mullá Ḥusayn, and del”

**Header numbers colliding with another block** (7)

- `1`: `2t` (header) “Nabíl’s Narrative of the Early Days of the Bahá’í Revelation”; `2z` (header) “Shoghi Effendi”; `69` (header) “CHAPTER I”
- `3`: `7f` (header) “CHAPTER II”; `7g` (header) “THE MISSION OF SIYYID KÁẒIM-I-RAS̱HTÍ”; `km` (header) “His approach to Qum”
- `5`: `8r` (header) “CHAPTER III”; `c7` (header) “CHAPTER V”
- `9`: `en` (header) “CHAPTER VIII”; `ge` (header) “CHAPTER IX”
- `13`: `kk` (header) “CHAPTER XII”; `ls` (header) “CHAPTER XIII”
- … 2 more in the TSV

**Source / citation lines carrying a number** (1)

- `i.70`: `46` (content) “Now the great Movement for which the Báb had prepared the way began to”; `1549570548149` (source) “(Qurays̱h, ‘Abd-i-Manáf, Hás̱him, ‘Abdu’s̱h-S̱hams, ‘Abdu’l-Muṭṭálib, ”

### Memorials of the Faithful (`abdu-l-baha-memorials-of-the-faithful_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `3.3`: `1553869401071` (content) “Here is a sea with treasure to the brim; Its waves toss pearls under t”; `44` (content) “Like a fountain, his heart welled and jetted forth; meaning and truth,”
- `9.5`: `6o` (content) “I am lost, O Love, possessed and dazed, Love’s fool am I, in all the e”; `6s` (content) “He was like a bird with broken wings but he had the song and it kept h”
- `9.6`: `6p` (lead-in) “O Love, who sellest me this wine, O Love, for whom I burn and bleed, L”; `6q` (lead-in) “If Thou wishest me to live, Through me blow Thy holy breath. The touch”; `6r` (content) “Thou, both End and Origin, Thou without and Thou within — From every e”; `6t` (content) “Such was his condition, when he died. Many and many a time, Bahá’u’llá”
- `34.7`: `1553870646739` (content) “If to the fool my lore you’d bring, Or think my secrets can be told To”; `de` (content) “When all hope was gone, he ended the relationship, saying: “O my broth”
- `63.7`: `1553872435115` (content) “By owls the royal falcon is beset. They rend his wings, though he is f”; `lf` (content) “Briefly, that great man spent his time in the ‘Akká prison, praying, s”

**Header numbers colliding with another block** (1)

- `11`: `2z` (content) “There was, in the city of Najaf, among the disciples of the widely kno”; `7b` (header) “11 Darvís̱h Ṣidq-‘Alí”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `3.4`: `1553873636295` (lead-in) “Shall he the gift of life to others bear Who of life’s gift has never ”; `45` (content) “A teacher must proceed in this way: he must first teach himself, and t”
- `11.3`: `1554459995490` (lead-in) “A hundred hearts Thy curling locks ensnare, And it rains hearts when T”; `7f` (content) “That free and independent soul discovered, in Bag̱hdád, a trace of the”
- `56.5`: `1553871583791` (lead-in) “To our King though we bow the knee, We are kings of the morning star. ”; `j6` (content) “The Blessed Beauty, at the time of His departure from Constantinople, ”

### Call to the Nations (`call_to_the_nations_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (5)

- `1.1`: `bl44` (content) “A tempest, unprecedented in its violence, unpredictable in its course,”; `bl48` (content) “The powerful operations of this titanic upheaval are comprehensible to”
- `2.1`: `bl5x` (content) “Humanity, whether viewed in the light of man’s individual conduct or i”; `bl5y` (content) “No appeal for mutual tolerance which the worldly-wise might raise, how”
- `3.1`: `bl84` (content) “Few will fail to recognize that the Spirit breathed by Bahá’u’lláh upo”; `bl86` (content) “For Bahá’u’lláh, we should readily recognize, has not only imbued mank”
- `4.1`: `bl91` (content) “The contrast between the accumulating evidences of steady consolidatio”; `bl93` (content) ““Soon,” Bahá’u’lláh’s own words proclaim it, “will the present day Ord”
- `5.1`: `blaa` (content) “As we gaze in retrospect beyond the immediate past, and survey, in how”; `blab` (content) ““The winds of despair,” writes Bahá’u’lláh, as He surveys the immediat”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1`: `bl33` (lead-in) “Well is it with him who fixeth his gaze upon the Order of Bahá’u’lláh ”; `bl37` (content) ““It is towards this goal — the goal of a new World Order, Divine in or”; `bl42` (header) “I Humanity’s Ordeal”

### The Mahabharata 1 (`mahabharata_1_hinduism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (4)

- `18.1`: `9i` (content) ““Sauti said, ‘O ascetic, about this time the two sisters saw approachi”; `9p` (content) ““Sauti said, ‘There is a mountain called Mandara adorned with cloud-li”
- `18.2`: `9j` (content) ““Saunaka asked, ‘Why did the gods churn the Ocean for nectar, and unde”; `9q` (content) ““Sauti continued, ‘O son of Bhrigu! Vishnu with Brahman assented to it”
- `18.3`: `9k` (content) ““Sauti said, ‘There is a mountain named Meru, of blazing appearance, a”; `9r` (content) ““And the gods and the Asuras made of Mandara a churning staff and Vasu”
- `18.4`: `9l` (content) “So ends the seventeenth section in the Astika Parva of the Adi Parva.”; `9t` (content) ““Then, O Brahmana, out of the deep came a tremendous roar like unto th”

**Header numbers colliding with another block** (232)

- `3`: `55` (header) “Section III”; `56` (header) “(Paushya Parva)”
- `4`: `6j` (header) “Section IV”; `6k` (header) “(Pauloma Parva)”
- `5.1`: `6q` (header) “(Pauloma Parva continued)”; `6r` (content) ““Saunaka said, ‘Child, thy father formerly read the whole of the Puran”
- `6`: `71` (header) “Section VI”; `72` (header) “(Pauloma Parva continued)”
- `7`: `78` (header) “Section VII”; `79` (header) “(Pauloma Parva continued)”
- … 227 more in the TSV

### Sutra Collection (S) (`sutracollection_s_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (4)

- `14.12`: `bl1h1` (content) “Thus have I heard:”; `bl1mn` (content) ““Then young man, tell them.””
- `17.1`: `bl1i9` (content) “Thus have I heard:”; `bl1py` (content) ““Suppose that there is a foolish, inexperienced, unskillful cook who h”
- `19.1`: `bl1ji` (content) “Thus have I heard:”; `bl1q3` (content) ““Monks, I lived in refinement, utmost refinement, total refinement. My”
- `23.1`: `bl1kv` (content) “Thus Have I Heard:”; `bl1v3` (content) ““Endowed with these six qualities, a person is incapable of alighting ”

**Header numbers colliding with another block** (29)

- `1`: `bl47` (header) “Shurangama Sutra”; `bl48` (header) “Volume 1”
- `2`: `bl4o` (header) “Part Two”; `bl85` (header) “Volume 2”; `blcx` (header) “Volume 3”; `blew` (header) “Part Two”; `blkg` (header) “Part Two”; `bloj` (header) “Part Two”; `blvc` (header) “Volume 7”; `blxh` (header) “Part Two”; `bl139` (header) “Part Two”; `bl13y` (header) “Part Three”; `bl16b` (header) “Part Four”; `bl18c` (header) “Part Five”
- `3.1`: `blcz` (header) “Part One”; `bl1ds` (content) “On one occasion when Bhagavâ resided in Kalandaka-Nivâpa, in the Welu ”
- `4.1`: `blic` (header) “Part One”; `bl1fd` (content) “Dwelling at Savatthi. “Monks, gains, offerings, and fame are a cruel t”
- `5.1`: `blma` (header) “Part One”; `bl1fl` (content) “I have heard that on one occasion the Blessed One was staying near Ves”
- … 24 more in the TSV

**Source / citation lines carrying a number** (1)

- `14.5`: `bl1gm` (source) “(Nidana Samy., No. 22)”; `bl1n5` (content) ““Good Gotama, Brahmins say, the undertakings of householders, are with”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.1`: `bl49` (lead-in) “Thus I have heard:”; `bl2u` (content) “At one time the Buddha dwelt at the City of Shravasti in the sublime a”

### Sutra Collection (M, Part-2) (`sutra_collection_m_part_2_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (4)

- `11.1`: `blgc` (content) “This is what I heard:”; `blk0` (content) “Thus have I heard. Once the Lord was staying at Savatthi, in Anathapin”
- `19.1`: `blzu` (content) “Thus Have I Heard:”; `bl12m` (content) “At one time the Blessed One was in Rajagriha, on Eagles Peak, together”
- `20.1`: `bl12l` (content) “Thus have I heard:”; `bl148` (content) “On one occasion the Blessed One was living near Savatthi at Jetavana a”
- `21.1`: `bl147` (content) “Thus have I heard:”; `bl14g` (content) “The Venerable Mettagu: “I ask the Lord this question, may he tell me t”

**Header numbers colliding with another block** (24)

- `2`: `bl1aj` (struct) “Sutra Collection”; `bl2t` (header) “The Great Frames of Reference”; `bl5m` (header) “Maha Sunnata Sutta”
- `3`: `bl5n` (header) “The Greater Discourse On Emptiness”; `bl6u` (header) “Mahaakaccaanabhaddekarattasuttam”
- `4`: `bl6v` (header) “Venerable Mahaakaccaana’s Explanation Of The Single Auspicious Attachm”; `bl8b` (header) “Mahaasaccaka Sutta”
- `5`: `bl8c` (header) “The Major Discourse to Saccaka”; `bl9c` (header) “Mahaassapura Sutta”
- `6`: `bl9d` (header) “The Longer Discourse in Assapura”; `bla7` (header) “Mahadukkhakkhandha Sutta”
- … 19 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (7)

- `2.1`: `bl5o` (lead-in) “Thus Have I heard:”; `bl5p` (content) “On one occasion the Blessed One was living in the Sakyan country at Ka”
- `4.1`: `bl8d` (lead-in) “I heard thus:”; `bl8e` (content) “At one time the Blessed One lived in the gabled hall in the Great fore”
- `5.1`: `bl9e` (lead-in) “I heard thus:”; `bl9f` (content) “At one time the Blessed One lived in the Anga country, in a hamlet nam”
- `6.1`: `bla9` (lead-in) “Thus Have I Heard:”; `blaa` (content) “On one occasion the Blessed One was living at Savatthi in Jeta’s Grove”
- `7.1`: `blbi` (lead-in) “Thus Have I Heard:”; `blbj` (content) “Once the Lord was staying at Rajagaha, on Vultures Peak. And when the ”
- … 2 more in the TSV

### The World Order of Bahá’u’lláh (`shoghi_effendi_world_order_of_baha_u_llah_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (4)

- `1.2`: `1556277929479` (content) “I have been acquainted by the perusal of your latest communications wi”; `blhf` (content) “It would, however, be helpful and instructive to bear in mind certain ”
- `2.2`: `1556208548437` (content) “Amid the reports that have of late reached the Holy Land, most of whic”; `3p` (content) “Viewed in the light of past experience, the inevitable result of such ”
- `4.2`: `1556209629661` (content) “Significant as have been the changes that have lately overtaken a swif”; `6k` (content) “That a Faith which, ten years ago, was severely shaken by the sudden r”
- `5.2`: `1556277821671` (content) “Forty years will have elapsed ere the close of this coming summer sinc”; `85` (content) “Of pomp and circumstance, of any manifestations of public rejoicing or”

**Header numbers colliding with another block** (8)

- `7.115`: `1555333605407` (struct) “”; `gy` (content) “Who can doubt that such a consummation — the coming of age of the huma”
- `2`: `2y` (header) “The World Order of Bahá’u’lláh”; `3k` (header) “2 -”
- `3`: `2z` (header) “February 27, 1929”; `3l` (header) “The World Order of Bahá’u’lláh: Further Considerations”; `4i` (header) “The Greatest Drama of the World’s Spiritual History”; `4m` (header) “3 -”
- `4`: `3m` (header) “March 21, 1930”; `4n` (header) “The Goal of a New World Order”; `6g` (header) “4 -”
- `5`: `4o` (header) “November 28, 1931”; `6h` (header) “The Golden Age of the Cause of Bahá’u’lláh”; `81` (header) “5 -”
- … 3 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `3.1`: `1556278646628` (lead-in) “Fellow-believers in the Faith of Bahá’u’lláh:”; `4p` (content) “The inexorable march of recent events has carried humanity so near to ”

### The Holy Qur-an (Yusuf Ali) (`the_holy_quran_tr_by_yusuf_ali_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `2.2`: `bl3e` (content) “In the name of God, most Gracious, Most Merciful.”; `bl3h` (content) “This is the Book; In it is guidance sure, without doubt, To those who ”
- `5.1`: `blp0` (content) “In the name of God, Most Gracious Most Merciful.”; `blwt` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `blwv` (content) “O ye who believe! Fulfil (all) obligations Lawful unto you (for food) ”
- `8.1`: `bl1a1` (content) “In the name of God, Most Gracious, Most Merciful”; `bl1iz` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `bl1j1` (content) “They ask thee concerning (Things taken as) spoils of war. Say: “(Such)”

**Opening invocations carrying a number** (9)

- `1.1`: `bl33` “In the name of God, Most Gracious, Most Merciful.”
- `2.2`: `bl3e` “In the name of God, most Gracious, Most Merciful.”
- `5.1`: `blp0` “In the name of God, Most Gracious Most Merciful.”
- `5.121`: `bl12o` “In the name of God, Most Gracious, Most Merciful.”
- `6.18`: `bl13d` ““He is the Irresistible, (watching) From above over His worshippers; And He is the Wise, Acquainted ”
- `8.1`: `bl1a1` “In the name of God, Most Gracious, Most Merciful”
- `40.65`: `bl4wv` “He is the Living (One): There is no god but He: Call upon Him, giving Him Sincere devotion. Praise h”
- `42.25`: `bl51b` “He is the One that accepts Repentance from His Servants And forgives sins: And He knows all That ye ”
- `57.3`: `bl5u1` “He is the First And the Last, The Evident And the Immanent: And He has full knowledge Of all things.”

**Header numbers colliding with another block** (113)

- `2`: `bl31` (header) “Fātiḥa, or the Opening Chapter.”; `bl3c` (header) “Sūra II.”
- `3`: `bl3d` (header) “Baqara, or the Heifer.”; `bl3p` (header) “SECTION 2.”; `bl4o` (header) “SECTION 4.”; `bl55` (header) “SECTION 5.”; `bl60` (header) “SECTION 7.”; `bl65` (header) “SECTION 8.”; `bl7n` (header) “SECTION 12.”; `bl8e` (header) “SECTION 14.”; `bl8t` (header) “SECTION 15.”; `bl99` (header) “SECTION 16.”; `bl9r` (header) “SECTION 17.”; `bla2` (header) “SECTION 18.”; `bla9` (header) “SECTION 19.”; `blar` (header) “SECTION 20.”; `blcu` (header) “SECTION 26.”; `bld5` (header) “SECTION 27.”; `blde` (header) “SECTION 28.”; `bldr` (header) “SECTION 29.”; `bleq` (header) “SECTION 33.”; `blf7` (header) “SECTION 35.”; `blfe` (header) “SECTION 36.”; `blfo` (header) “SECTION 37.”; `blgf` (header) “SECTION 40.”; `blgn` (header) “Sūra III.”
- `4`: `blgo` (header) “Āl-i-’Imrān, or The Family of ’Imrān.”; `blh2` (header) “SECTION 2.”; `blhk` (header) “SECTION 3.”; `bli1` (header) “SECTION 4.”; `blj7` (header) “SECTION 7.”; `blji` (header) “SECTION 8.”; `bljy` (header) “SECTION 9.”; `blkd` (header) “SECTION 10.”; `blks` (header) “SECTION 11.”; `bll5` (header) “SECTION 12.”; `bllm` (header) “SECTION 13.”; `bllx` (header) “SECTION 14.”; `blmd` (header) “SECTION 15.”; `blmm` (header) “SECTION 16.”; `blmy` (header) “SECTION 17.”; `blno` (header) “SECTION 18.”; `blo1` (header) “SECTION 19.”; `blof` (header) “SECTION 20.”; `bloy` (header) “Sūra IV.”
- `5`: `bloz` (header) “Nisāa, or The Women.”; `blpe` (header) “SECTION 2.”; `blpn` (header) “SECTION 3.”; `blq0` (header) “SECTION 4.”; `blq6` (header) “SECTION 5.”; `blqj` (header) “SECTION 6.”; `blqw` (header) “SECTION 7.”; `blra` (header) “SECTION 8.”; `blrm` (header) “SECTION 9.”; `bls1` (header) “SECTION 10.”; `blsb` (header) “SECTION 11.”; `blsu` (header) “SECTION 12.”; `blt2` (header) “SECTION 13.”; `blta` (header) “SECTION 14.”; `bltg` (header) “SECTION 15.”; `bltm` (header) “SECTION 16.”; `blu2` (header) “SECTION 18.”; `bluj` (header) “SECTION 19.”; `blwg` (header) “SECTION 24.”; `blwr` (header) “Sūra V.”
- `6`: `blws` (header) “Māïda, or The Table Spread.”; `blx4` (header) “SECTION 2.”; `blxd` (header) “SECTION 3.”; `blxt` (header) “SECTION 4.”; `bly3` (header) “SECTION 5.”; `blyh` (header) “SECTION 6.”; `blyw` (header) “SECTION 7.”; `blza` (header) “SECTION 8.”; `blzl` (header) “SECTION 9.”; `bl102` (header) “SECTION 10.”; `bl10k` (header) “SECTION 11.”; `bl10v` (header) “SECTION 12.”; `bl11l` (header) “SECTION 14.”; `bl12c` (header) “SECTION 16.”; `bl12m` (header) “Sūra VI.”; `bl12n` (header) “An’ām, or Cattle.”
- … 108 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (106)

- `3.1`: `blgp` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `blgq` (content) “A. L. M.”
- `10.1`: `bl1rn` (lead-in) “In the name of God, Most Gracious, Most Merciful”; `bl1rp` (content) “A. L. R. These are the Āyats Of the Book of Wisdom.”
- `11.1`: `bl1wa` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `bl1wc` (content) “A. L. R. (This is) a Book, With verses basic or fundamental (Of establ”
- `12.1`: `bl21j` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `bl21l` (content) “A. L. R. These are The Symbols (or Verses) Of the Perspicuous Book.”
- `13.1`: `bl26n` (lead-in) “In the name of God, Most Gracious, Most Merciful.”; `bl26p` (content) “A. L. M. R. These are The Signs (or Verses) Of the Book: that which Ha”
- … 101 more in the TSV

### Summons of the Lord of Hosts (`summons_of_the_lord_of_hosts_bahai_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `1.13`: `bl3a` (content) “O Pen of the Most High! Hearken unto the Call of Thy Lord, raised from”; `bl66` (content) “My body hath borne imprisonment that your souls may be released from b”
- `1.75`: `bl50` (content) “We have brought forth all Lights from the Orb of Our name, the True On”; `bl51` (content) “Say: It is in Our power, should We wish it, to cause all created thing”
- `10.13`: `ble5` (content) “If ye pay no heed unto the counsels which, in peerless and unequivocal”; `ble6` (content) “Examine Our Cause, inquire into the things that have befallen Us, and ”

**Opening invocations carrying a number** (5)

- `1.2`: `bl2z` “He is the Most Wondrous, the All-Glorious!”
- `6.25`: `blh4` “He is God, exalted be His glory!”
- `7.1`: `blb1` “In His name, the All-Glorious!”
- `9.1`: `bld5` “He is the Most Holy, the Most Glorious!”
- `10.1`: `bldt` “He is the Almighty!”

**Header numbers colliding with another block** (2)

- `1`: `blh6` (struct) “”; `bl2x` (header) “Súriy-i-Haykal / Súrih of the Temple”
- `4`: `bl7h` (header) “Czar Alexander II”; `bl7l` (content) “Blessed be the king whom the veils of glory have not deterred from tur”

### Pahlavi Texts, Part I (`pahlavi_texts_part_i_zoroastrianism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `1.1.1`: `bl2y` (content) “THOUGH we must look to the Avesta for information regarding the main o”; `blxw` (content) “For all divisions into chapters and sections the translator is respons”
- `1.1.2`: `bl2z` (content) “To understand the relationship between these two classes of Parsi sacr”; `bly6` (content) “Italics are used for any English words which are not expressed, or ful”
- `1.1.3`: `bl30` (content) “Regarding the sacredness of these Pahlavi translations, in the eyes of”; `blyh` (content) “Oriental words are usually ‘spaced.’ Italics occurring in them, or in ”

**Opening invocations carrying a number** (3)

- `2.1.1`: `blwm` “In the name of the creator Aûharmazd.”
- `5.16.1`: `blzn` “In the name of God (yazdân) I write a paragraph (babâ) where the sins which are as it were small are”
- `5.23.1`: `blwn` “In the name of God and the good creation be health”

**Header numbers colliding with another block** (6)

- `1`: `bl2t` (header) “Sacred Books of the East Vol. 5”; `bl2w` (header) “Introduction”
- `1.2`: `bl32` (header) “The Pahlavi Language and Literature”; `bl8i` (header) “Bundahis”
- `2.2`: `bl8j` (header) “Chapter I”; `bl97` (header) “Chapter II”
- `3.1`: `blh2` (content) “THEY call these memoranda and writings the Selections (kîdakîhâ) of Zâ”; `blh3` (header) “Chapter I”
- `5.11.1`: `blqt` (header) “Chapter XI”; `blqv` (content) “The degrees of sin are these such as a Farmân, Srôshô-karanâm, Âgerept”
- … 1 more in the TSV

### Hayat Al-Qulub Vol.1 (`stories_of_the_prophets_vol_1_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `13.5.48`: `bl223` (content) “According to reliable narrations Tawus Yamani, who is one of the Ulama”; `bl224` (content) “And when We took a promise from you and lifted the mountain over you: ”
- `29.1.4`: `bl30m` (content) “The Qur’anic Verse:”; `bl30o` (content) “These words of the Prophet did not indicate his disbelief but were utt”
- `31.1.5`: `bl34o` (content) ““When the youths sought refuge in a cave, they said, “Our Lord! grant ”; `bl34r` (content) “Then We raised them up that we might know which of the two parties was”

**Opening invocations carrying a number** (3)

- `2.1.41`: `bl9y` “Bismillaahir Rah’maanir rah’eem Muh’ammadinw wa aalo Muh’ammadin Khairun min barrillaah.”
- `7.1.131`: `blym` ““He is the One who gives life and death.””
- `10.1.359`: `bl1qe` “In the name of Allah, the Beneﬁcent, the Merciful.”

**Header numbers colliding with another block** (1)

- `4.2`: `blo2` (header) “Proclamation of Nuh”; `blo3` (header) “Propagation — Disobedience of the People and an Account of Their Circu”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `5.1.46`: `blse` (lead-in) “In other reliable tradition the tafsir of the verse,”; `blsf` (content) ““Surely, We sent on them a tornado in a day of bitter ill-luck.” (54:1”

### Tabernacle of Unity (`tabernacle_of_unity_bahai_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `1.2`: `blcy` (content) “Praise be to the all-perceiving, the ever-abiding Lord Who, from a dew”; `bl3l` (content) “It is clear and evident, therefore, that the first bestowal of God is ”
- `3.2`: `bl85` (content) “All praise be to the sanctified Lord Who hath illumined the world thro”; `bl87` (content) “Thy letter was received, and We perused it and heard thy call. Within ”
- `4.2`: `bl95` (content) “O servants! The springs of divine bestowal are streaming forth. Quaff ”; `bl97` (content) “O servants! The fire that consumeth all veils hath been kindled by My ”

**Opening invocations carrying a number** (2)

- `1.1`: `bl3h` “In the Name of the One True God”
- `3.1`: `bl83` “In the Name of the Lord of Utterance, the All-Wise”

**Header numbers colliding with another block** (6)

- `1`: `bl34` (header) “Introduction”; `bl35` (content) “From the birth of the Bahá’í Revelation in a subterranean dungeon in Ṭ”
- `2`: `bl36` (content) “Prominent among these works is Bahá’u’lláh’s Tablet to Mánikchí Ṣáḥib.”; `blct` (header) “1 -”; `blcv` (header) “(Lawḥ-i-Mánikchí-Ṣáḥib)”; `bl4l` (header) “2 -”
- `3`: `bl37` (content) “The first Tablet, known as the Lawḥ-i-Mánikchí Ṣáḥib, is celebrated fo”; `bl80` (header) “3 -”
- `4`: `bl38` (content) “As inferred from the contents of a second Tablet, Mánikchí Ṣáḥib was n”; `bl81` (header) “Tablet of the Seven Questions”; `bl82` (header) “(Lawḥ-i-Haft Pursish)”; `bld8` (header) “Two Other Tablets”; `bl92` (header) “– 4 –”
- `5`: `bl39` (content) “The Tablet is noteworthy for its discussion of a range of questions re”; `bl93` (header) “The Beginning of all Utterance...”; `bl9u` (header) “– 5 –”
- … 1 more in the TSV

### The Texts of Taoism Part I (`chuang_tse_taoism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `2.72.17`: `blp7` (content) “Alia explicatio”; `blp9` (content) “Vectigalibus terra si non opprimitur, suâ quisque contentus alias terr”
- `3.2.1`: `blw5` (content) “It has been seen above that Sze-mâ Khien expressly ascribes the Book c”; `blx1` (content) “In the Northern Ocean there is a fish, the name of which is Khwän I do”
- `3.2.136`: `bl11b` (content) “Dze-yü and Dze-sang were friends. (Once), when it had rained continuou”; `bl11f` (content) “Nieh Khüeh put four questions to Wang Î not one of which did he know (”

**Header numbers colliding with another block** (6)

- `1`: `bl94` (header) “The Tâo Teh King, or the Tâo and Its Characteristics”; `bl97` (header) “Part I”
- `3`: `blrq` (header) “The Writings of Kwang-Dze”; `blrz` (header) “Book II. Khî Wû Lun”; `blww` (header) “The Writings of Kwang-dze”
- `3.2`: `bls9` (header) “Book III. Yang Shang Kû”; `blsi` (header) “Book IV. Zän Kien Shih”; `blsp` (header) “Book V. Teh Khung Fû”; `blsz` (header) “Book VI. Tâ Zung Shih”; `blt9` (header) “Book VII. Ying Tî Wang”; `bltg` (header) “Book VIII. Phien Mâu”; `bltm` (header) “Book IX. Mâ Thî”; `bltr` (header) “Book X. Khü Khieh”; `bltw` (header) “Book XI. Zâi Yû”; `blu6` (header) “Book XII. Thien Tî”; `blua` (header) “Book XIII. Thien Tâo”; `blue` (header) “Book XIV. Thien Yün”; `bluj` (header) “Book XV. Kho Î”; `bluo` (header) “Book XVI. Shan Hsing”; `blur` (header) “Book XVII. Khiû Shui”; `bluw` (header) “Book XVIII. Kih Lo”; `blv0` (header) “Book XIX. Tâ Shäng”; `blv3` (header) “Book XX. Shan Mû”; `blv5` (header) “Book XXI. Thien Dze-Fang”; `blv8` (header) “Book XXII. Kih Pei Yû”; `blvd` (header) “Book XXIII. Käng-Sang Khû”; `blvj` (header) “Book XXIV. Hsü Wû-Kwei”; `blvm` (header) “Book XXV. Zeh-yang”; `blvq` (header) “Book XXVI. Wâi Wû”; `blvu` (header) “Book XXVII. Yü Yen”; `blw0` (header) “Book XXVIII. Zang Wang”; `blw4` (header) “Book XXIX. Tâo Kih”; `blwa` (header) “Book XXXI. Yü-Fû”; `blwd` (header) “Book XXXII. Lieh Yü-Khâu”; `blwj` (header) “Book XXXIII. Thien Hsiâ”; `blwy` (header) “Book I”; `blwz` (header) “Part I. Section I.Hsiâo-Yâo Yû, or ‘Enjoyment in Untroubled Ease .’”
- `3.3`: `blw8` (header) “Book XXX. Yüeh Kien”; `blxh` (header) “Book II”; `blxi` (header) “Part I. Section II. Khî Wû Lun, or ‘The Adjustment of Controversies.’”; `blyq` (header) “Book III”; `blyz` (header) “Book IV”; `blzw` (header) “Book V”; `bl10e` (header) “Book VI”; `bl11d` (header) “Book VII”; `bl11u` (header) “Book VIII”; `bl124` (header) “Book IX”; `bl12b` (header) “Book X”; `bl12l` (header) “Book XI”; `bl137` (header) “Book XII”; `bl148` (header) “Book XIII”; `bl14w` (header) “Book XIV”; `bl15s` (header) “Book XV”; `bl166` (header) “Book XVI”; `bl16h` (header) “Book XVII”
- `3.5`: `blz0` (header) “Part I. Section IV. Zän Kien Shih, or ‘Man in the World, Associated wi”; `blzx` (header) “Part I. Section V. Teh Khung Fû, or ‘The Seal of Virtue Complete.’”
- … 1 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `p.37`: `bl45` (lead-in) “J. L.”; `bl46` (lead-in) “Oxford,”; `bl47` (content) “December 20, 1890.”
- `2.72.10`: `blp0` (lead-in) “Prima Explicatio Juxta interpretes”; `blp1` (content) “Populus, ubi jam principis iram non timet, nihil non audet ut jugum ex”

### The Political Regime (`the_political_regime_al_farabi_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `2.6.1`: `blf6` (content) “Contrary to the virtuous city are the [a] ignorant city, [b] immoral c”; `blij` (content) “The immoral cities are the ones whose inhabitants believed in, and for”
- `2.6.2`: `blf7` (content) “Then there are [e] the people who are bestial by nature. Now those who”; `blik` (content) “The kinds of these cities are as numerous as the kinds of ignorant cit”
- `2.7.1`: `blf9` (content) “The inhabitants of the ignorant [cities] are citizens, and their citie”; `blim` (content) “The errant cities are the ones whose inhabitants receive representatio”

**Header numbers colliding with another block** (6)

- `2`: `blk1` (header) “Part 1: The World Around Us”; `bljw` (header) “Part 2: The Political World”
- `1.6`: `blkc` (header) “B. Particulars Concerning the Incorporeal Substances”; `bl67` (header) “Incorporeal Substances Other than the First Cause”
- `1.9`: `blkf` (header) “C. Particulars Concerning the Corporeal Substances and Existence in Ge”; `bl8i` (header) “Basic Difference Between the Heavenly Bodies and the Nonheavenly Bodie”
- `2.3`: `blk9` (header) “B. The Virtuous City”; `blc3` (header) “The Active Intellect and Human Happiness”
- `2.6`: `blf5` (header) “C. The Different Kinds of Nonvirtuous Cities”; `blcu` (header) “The Cities Contrary to the Virtuous City”; `blcs` (header) “b. The Plutocratic City”; `blct` (header) “c. The Hedonistic City”; `blcm` (header) “d. The Timocratic City”; `blcg` (header) “e. The City of Domination”; `blbo` (header) “f. The Democratic City”; `blbk` (header) “g. Summary”; `blii` (header) “The Immoral Cities”
- … 1 more in the TSV

### A Compendium on the Soul (`ibn_sina_avicenna_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `2.1`: `bl49` (content) “Of the Division of the Spiritual Faculties and their Classification in”; `bl4b` (content) “It has been clearly shown by us in the foregoing that of things there ”
- `9.1`: `bl6t` (content) “in which the Proofs of the Essentiality of the Soul, and of Its Indepe”; `bl9h` (content) “— One of the logical proofs for establishing this Claim:”
- `10.1`: `bl7h` (content) “To Establish that there is a Mental Essence, Distinct from Bodies, whi”; `bl7i` (content) “As to the mental essence, we find it in infants devoid of every mental”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (7)

- `1.1`: `bl40` (lead-in) “To Establish the Existence of the Spiritual Faculties, the Detailed An”; `bl41` (content) “Whoso wishes to describe anything whatsoever before proceeding to esta”
- `3.1`: `bl4o` (lead-in) “To Establish that not One of the Faculties of the Soul Originates out ”; `bl4p` (content) “All the various things that are, however composite they may be, and wh”
- `4.1`: `bl4w` (lead-in) “Specification of the Vegetable (Plant) Powers, and Mention of the Need”; `bl4x` (content) “Souled bodies, I mean having souls, if considered from the side of the”
- `5.1`: `bl54` (lead-in) “Specification of the Animal Powers, and Mention of the Need there is f”; `bl55` (content) “I affirm that every animal is sentient, and hence it moves itself at w”
- `6.1`: `bl5j` (lead-in) “Treating in Detail of the Five Senses, and of How they perceive.”; `bl5k` (content) “As to the seeing power, philosophers have differed on the question of ”
- … 2 more in the TSV

### The Story of Layla and Majnun (`layli_and_majnun_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (3)

- `22.7`: `blz6` (content) “Dark as the night, like hers, your eyes! What I have lost you can’t re”; `blz8` (content) “Only then did the lonely wanderer halt. He crept into a cave groaning ”
- `35.8`: `bl259` (content) “Then the stranger remained unharmed. If, however, he intended to distu”; `bl25a` (content) “Had anyone ever known a shepherd like Majnun? Was there ever a shepher”
- `39.12`: `bl2mp` (content) “Her eyes are narcissi, flowering at the mouth of a spring and when you”; `bl2mq` (content) “After this attempt to describe Layla’s appearance, he continued:”

**Header numbers colliding with another block** (1)

- `1`: `bl58` (struct) “”; `bl5a` (struct) “”; `bl5c` (header) “I How the Story Began”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `11.5`: `blca` (lead-in) “The Fable of the Partridge and the Ant”; `blcb` (content) “‘There was once a partridge, which, when hunting, espied an ant, and s”
- `p.17`: `bl4ce` (lead-in) “R. Gelpke.”; `bl4cj` (content) “Editor’s Note: This is an abridged version of the original Postscript ”

### Bihar al-Anwaar Volume 3 (`bihar_al_anwaar_volume_3_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1`: `bl2s` (content) “بحار األنوار”; `bl2u` (content) “ج 3”; `bl5bm` (header) “Volume 3”; `bl5bo` (content) “بحار االنوار الجامعة لدرر أخبار االئمة االطهار”; `bl2w` (header) “Bihar Al-Anwaar – The summary of the pearls of the Ahadeeth of the Pur”; `bl5bj` (header) “The Book of Tawheed (Oneness)”; `bl34` (header) “(باب 1) (ثواب الموحدين والعارفين، وبيان وجوب المعرفة وعلته) (وبيان ما ”; `bl35` (header) “Chapter 1 – Rewards Of The Unitarians, And The Spiritualists, And Expl”
- `1.57`: `bl72` (content) “Ibn Al Mutawakkal, from Al Asady, from Muhammad Bin Al Husayn Al Sowfy”; `bl74` (content) “مسعت أيب موسى بن جعفر يقول: مسعت أيب جعفر بن حممد يقول: مسعت أيب حممد ”

**Opening invocations carrying a number** (105)

- `1.67`: `bl7q` “قال: وانطلق يف احلرة حىت مل أره وتوارى عين فأطال اللبث، مث إين مسعته عليه السالم وهو مقبل وهو يقول: ”
- `2.3`: `ble2` “قال: فلم ال تدركه حاسة البصر ؟ قال: للفرق بينه وبني خلقه الذين تدركهم حاسة االبصار، مث هو أجل من أن ”
- `3.11`: `blf1` “وهو الذي مد االرض وجعل فيها رواسي وأهنارا ومن كل الثمرات جعل فيها زوجني اثنني يغشي الليل النهار إن ي”
- `3.37`: `blft` “النحل: خلق االنسان من نطفة فإذا هو خصيم مبني”
- `3.47`: `blg5` “”وقال تعاىل ”: هو الذي أنزل من السماء ماء لكم منه شراب ومنه شجر فيه تسيمون”
- `3.55`: `blge` “وهو الذي سخر البحر لتأكلوا منه حلما طريا وتستخرجوا منه حلية تلبسوهنا وترى الفلك مواخر فيه ولتبتغوا م”
- `3.101`: `bli2` “وهو الذي خلق الليل والنهار والشمس والقمر كل يف فلك يسبحون 30 – 33”
- `3.113`: `blig` “وقال تعاىل ”: وهو الذي ذرأكم يف االرض وإليه حتشرون”
- `3.115`: `blii` “وهو الذي حيىي ومييت وله اختالف الليل والنهار أفال تعقلون 79، 80 “”
- `3.125`: `blis` “قل من بيده ملكوت كل شئ وهو جيري وال جيار عليه إن كنتم تعلمون”
- `3.143`: `blje` “وهو الذي جعل لكم الليل لباسا والنوم سباتا وجعل النهار نشورا”
- `3.145`: `bljg` “وهو الذي أرسل الرياح بشرا بني يدي رمحته وأنزلنا من السماء ماء طهورا”
- `3.149`: `bljk` “وقال تعاىل ”: وهو الذي مرج البحرين هذا عذب فرات وهذا ملح اجاج وجعل بينهما برزخا وحجرا حمجورا”
- `3.151`: `bljm` “وهو الذي خلق من املاء بشرا فجعله نسبا وصهرا و كان ربك قديرا 53، 54”
- `3.155`: `bljq` “وهو الذي جعل الليل والنهار خلفة ملن أراد أن يذكر أو أراد شكورا 61، 62”
- `3.193`: `bll0` “فانظر إىل آثار رمحت اهلل كيف حييي االرض بعد موهتا إن ذلك حملىي املوتى وهو على كل شئ قدير 48 - 50”
- `3.195`: `bll2` “”وقال تعاىل ”: أهلل الذي خلقكم من ضعف مث جعل من بعد ضعف قوة مث جعل من بعد قوة ضعفا وشيبة خيلق ما يشا”
- `3.203`: `blla` “ذلك بأن اهلل هو احلق وأن ما يدعون من دونه الباطل وأن اهلل هو العلي الكبر”
- `3.213`: `blln` “ما يفتح اهلل للناس من رمحة فال ممسك هلا وما ميسك فال مرسل له من بعده وهو العزيز احلكيم 1، 2 ””
- `3.251`: `blmt` “وقال سبحانه ”: أومل ير االنسان أنا خلقناه من نطفة فإذا هو خصيم مبني 77”
- `3.255`: `blmx` “الزمر: خلق السموات واالرض باحلق يكور الليل على النهار ويكور النهار على الليل وسخر الشمس والقمر كل جي”
- `3.261`: `bln5` “املؤمن: هو الذي يريكم آياته وينزل لكم من السماء رزقا وما يتذكر إال من ينيب 13”
- `3.265`: `blna` “ذلكم اهلل ربكم خالق كل شئ ال إله إال هو فأىن تؤفكون”
- `3.271`: `blni` “هو احلي ال إله إال هو فادعوه خملصني له الدين احلمد هلل رب العاملني”
- `3.275`: `blnm` “هو الذي خلقكم من تراب مث من نطفة مث من علقة مث خيرجكم طفال مث لتبلغوا أشدكم مث لتكونوا شيوخا ومنكم م”
- `3.277`: `blno` “هو الذي حييي ومييت فإذا قضى أمرا فإمنا يقول له كن فيكون 61 - 68”
- `3.299`: `bloc` “” وقال تعاىل ”: ومن آياته خلق السموات واالرض وما بث فيهما من دابة وهو على مجعهم إذا يشاء قدير 29”
- `3.389`: `blr4` “مث ارجع البصر كرتني ينقلب إليك البصر خاسئا و هو حسري”
- `3.397`: `blrc` “” وقال تعاىل ”: قل هو الذي أنشأكم وجعل لكم السمع واالبصار و االفئدة قليال ما تشكرون”
- `3.399`: `blrg` “قل هو الذي ذرأكم يف االرض وإليه حتشرون 23، 24”
- `3.401`: `blri` “” وقال سبحانه ”: قل هو الرمحن آمنا به وعليه توكلنا فستعلمون من هو يف ضالل مبني”
- `3.553`: `bly0` “فقال ابن أيب العوجاء: فهو يف كل مكان أليس إذا كان يف السماء كيف يكون يف االرض ؟ وإذا كان يف االرض كي”
- `3.577`: `blzc` “فقال أبو احلسن عليه السالم: إن يكن القول قولنا - وهو ما نقول - ألستم قد هلكتم وجنونا ؟ قال: رمحك اهل”
- `3.579`: `blzj` “قال: ويلك إن الذى ذهبت إليه غلط هو أين االين وكان وال أين، وهو كيف الكيف وكان وال كيف، فال يعرف بكيف”
- `3.695`: `bl16v` “فقد ثبت املعىن الثالث أن يل صانعا وهو اهلل رب العاملني، فقام وما أجاب جوابا.”
- `3.731`: `bl197` “وبث فيها من كل دابة ” منها ما هو الكلكم ومعايشكم، ومنها سباع ضارية حافظة عليكم النعامكم لئال تشذ علي”
- `4.73`: `bl1dg` “واعترب ذلك بأن من سيب من بلد إىل بلد وهو عاقل يكون كالواله احلريان فال يسرع يف تعلم الكالم وقبول اال”
- `1.4.536`: `bl1wf` “فلما كانت السباع تأكل السمك والطري يأكل السمك والناس يأكلون السمك والسمك يأكل السمك كان من التدبري ف”
- `1.4.860`: `bl29e` “فلو كان يف العامل تدبري جلرت االمور على القياس القائم، فكان الصاحل هو املرزوق، والطاحل هو احملروم، و”
- `1.4.910`: `bl2bv` “وقال آخرون: هو صفولطيف ينعقد من ماء البحر، وقال آخرون: هو أجزاء كثرية جمتمعة من النار، وقال آخرون: ه”
- `1.4.927`: `bl2cm` “مث ليس علم االنسان بأنه موجود يوجب له أن يعلم ما هو كما أن علمه بوجود النفس ال يوجب أن يعلم ما هي وك”
- `5.11`: `bl2ey` “والعجب من خملوق يزعم أن اهلل خيفى على عباده وهو يرى أثر الصنع يف نفسه برتكيب يبهر عقله، وتأليف يبطل ”
- `5.17`: `bl2f8` “فبينا هو يوما يدق ليخلطها دواءا احتجت إليه من أدويته، إذ عرض له شئ من كالمه الذي مل يزل ينازعين فيه”
- `5.77`: `bl2ip` “قلت: أو لست تعلم أن خالق االشياء واالهليلجة حكيم عامل مبا عاينت من قوة تدبريه ؟ قال: بلى. قلت: فهل ي”
- `5.135`: `bl2lw` “فلما تفكر القلب يف أمر الريح علم أن هلا حمركا هو الذي يسوقها حيث يشاء، ويسكنها إذا شاء، ويصيب هبا من”
- `5.251`: `bl2rg` “قلت: فكيف وقع هذا العلم الذي زعمت أن احلكماء من الناس وضعوه وأن الناس كلهم مولدون به وكيف عرفوا ذلك ”
- `5.303`: `bl2u5` “قال : قد جئت بأمر واضح ال يشكل على ذي عقل أن الفلك الذي تدور به النجوم هو أساسها الذي وضع هلا الهنا ”
- `5.353`: `bl2wh` “فكيف أدركت العقول واحلكمة واحلواس هذا وهو غائب يف اجلوف، والعروق يف اللحم، وفوقه اجللد ال يدرك بسمع ”
- `5.521`: `bl351` “فمن قال لالنسان: واحد فهذا له اسم وله شبيه، واهلل واحد وهو له اسم وال شئ له شبيه وليس املعىن واحدا،”
- `6.1`: `bl363` “االيات، البقرة: وإهلكم إله واحد ال إله إال هو الرمحن الرحيم 163 “”
- `6.5`: `bl367` “وقال سبحانه ”: اهلل ال إله إال هو احلي القيوم 255 “”
- `6.37`: `bl37a` “الرعد: له دعوة احلق والذين يدعون من دونه ال يستجيبون هلم بشئ إال كباسط كفيه إىل املاء ليبلغ فاه وما ”
- `6.43`: `bl37i` “وقال: قل هو ريب ال إله إال هو عليه توكلت وإليه متاب 30 “”
- `6.49`: `bl37o` “ابراهيم: وليعلموا أمنا هو إله واحد 52”
- `6.53`: `bl37s` “وقال تعاىل ": وقال اهلل ال تتخذو ا إهلني اثنني إمنا هو إله واحد فإياي فارهبون”
- `6.81`: `bl38q` “وقال تعاىل ”: لكنا هو اهلل ريب وال اشرك بريب أحدا 38 “”
- `6.135`: `bl3ag` “النمل: اهلل ال إله إال هو رب العرش العظيم 26”
- `6.157`: `bl3b6` “وال تدع مع اهلل إهلا آخر ال إله إال هو كل شئ هالك إال وجهه له احلكم وإليه ترجعون 87، 88”
- `6.163`: `bl3bc` “إن اهلل يعلم ما يدعون من دونه من شئ وهو العزيز احلكيم”
- `6.175`: `bl3bq` “أم أنزلنا عليهم سلطانا فهو يتكلم مبا كانوا به يشركون 31 - 35”
- … 45 more in the TSV

**Header numbers colliding with another block** (12)

- `2`: `bldv` (header) “(باب 2) (علة احتجاب اهلل عزوجل عن خلقه)”; `bldw` (header) “Chapter 2 – Reason For The Veiling Of Allah azwj Mighty And Majestic F”
- `3`: `blel` (header) “(باب 3) (اثبات الصانع واالستدالل بعجائب صنعه على وجوده) (وعلمه وقدرته ”; `blem` (header) “Chapter 3 – Proof Of The Maker, And The Evidence Of The Wonders Of His”
- `4`: `bl19y` (header) “(باب4) (الخبر المتشهر بتوحيد المفضل بن عمر)”; `bl19z` (header) “Chapter 4 – The Hadeeth Well Known as ‘Tawheed of Al-Mufazzal Bin Umar”
- `6`: `bl2ea` (header) “Chapter 5 – The Hadeeth Reported From Al-Mufazzal Bin Umar Regarding T”; `bl361` (header) “(باب 6) (التوحيد ونفى الشريك ومعنى الواحد واالحد والصمد) (وتفسير سورة ”; `bl362` (header) “Chapter 6 – The Tawheed (Oneness), and Negation of the Associate, And ”
- `7`: `bl3pg` (header) “(باب 7) (عبادة االصنام والكواكب واالشجار والنيرين وعلة حدوثها) (وعقاب ”; `bl3ph` (header) “Chapter 7 – Worshipping the Idols, and the Stars, and the Trees, and t”
- … 7 more in the TSV

**Signature / closing lines carrying a number** (1)

- `1.4.958`: `bl2e2` (content) “Al-Mufazzal said, ‘So, I left from the presence of my Master asws, no ”; `bl2e5` (signature) “”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (6)

- `1.24`: `bl4j` (lead-in) “Ibn Al Waleed, from Sa’ad, from Ahmad Bin Hilal, from Ibn Fazal, from ”; `bl4k` (content) “‘From Abu Ja’far asws , he (the narrator) said, ‘I heard him asws sayi”
- `1.34`: `bl55` (lead-in) “Ibn Al Waleed, from Al Saffar, from Ibn Abu Al Khattab, from Ibn Asbat”; `bl5b` (content) “‘From Abu Abdullah asws regarding the Words of Allah azwj Mighty and M”
- `1.38`: `bl5i` (lead-in) “Al Sinany, from Al Asady, from Al Nakhaie, from Al Nowfaly, from Ali B”; `bl5j` (content) “‘Abu Abdullah asws said: ‘Allah azwj Blessed and Exalted has Prohibite”
- `1.42`: `bl5r` (lead-in) “By the preceding chain from Sayf, from Al Hassan Bin Al Sabah, from An”; `bl5s` (content) “‘From the Prophet saww having said: ‘every stubborn tyrant [14:15], is”
- `2.8`: `blee` (lead-in) “Ali Bin Hatim, from Al Qasim Bin Muhammad, from Hamdan Bin Al Husayn, ”; `blef` (content) “‘I said to Ali asws Bin Al-Husayn asws, ‘For which reason did Allah az”
- … 1 more in the TSV

### Dawn of a New Day (`dawn_of_a_new_day_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1.46`: `bl5a` (content) “It is always a source of immeasurable joy and encouragement to our dea”; `bl5b` (content) “Shoghi Effendi is always interested to hear from you on the work in In”
- `1.320`: `bljq` (content) “He regrets very much that circumstances have prevented any active furt”; `blju` (content) “In reading your annual Convention report the Guardian has noted the re”

**Header numbers colliding with another block** (74)

- `1`: `bl2v` (content) ““…the dawn of a New Day shall break upon that land and the Rays of thi”; `bl36` (header) “Letters Addressed to the N.S.A. of India”
- `2`: `bl37` (header) “Letter to Believers in India & Burmah”; `bl17h` (header) “Assemblies Must Endeavour to Inspire Confidence”; `bl17n` (header) “Translation of Baha’u’llah & the New Era into Burmese”; `bl17i` (header) ““Kitab-i-Iqan” Translated in Many Languages”; `bl17j` (header) “Historic Step in Development of Administrative Order”; `bl17l` (header) “Systematized and Nation-wide Teaching Campaign”; `bl17p` (header) “Membership in Baha’i Assembly or Committee Is a Sacred Obligation”; `bl17o` (header) “Baha’is Can Accept Grants-in-aid from the Government”; `bl17q` (header) “19-Month Plan — Third of its Kind”; `bl17m` (header) “Message to the Inter Continental Conference, New Delhi”; `blxg` (header) “Letters Addressed to the Baha’i Youth of India”
- `3`: `bl3k` (header) “Excellent Field of Service”; `blxh` (header) “Letter of June 19, 1941”; `blyx` (header) “Letters Addressed to Individual Baha’is in India”
- `4`: `bl3p` (header) “Position of Baha’i Women”; `blxl` (header) “Letter of May 5, 1943”; `blyy` (header) “Letter of June 20, 1923”; `bl12t` (header) “Letters Addressed to Burmese Baha’is”
- `5`: `bl3w` (header) “The Baha’i News”; `blxp` (header) “Letter of June 6, 1941”; `blz1` (header) “Letter of November 5, 1924”; `bl12u` (header) “Letter of June 1, 1923”; `bl13a` (header) “Cablegrams”
- … 69 more in the TSV

**Signature / closing lines carrying a number** (9)

- `1.19`: `bl3v` (signature) “December 27, 1923”; `bl3z` (content) “Regarding the Baha’i News, I strongly urge those responsible for its p”
- `1.25`: `bl43` (signature) “June 1, 1923”; `bl48` (content) “I shall welcome with genuine satisfaction every effort which that tale”
- `1.31`: `bl4b` (signature) “December 5, 1923”; `bl4j` (content) “We were sorry to know of the state of tension that exists between Indi”
- `1.35`: `bl4h` (signature) “March 5, 1925”; `bl4q` (content) “The National Secretary should keep in as close touch as possible with ”
- `1.50`: `bl52` (signature) “November 18, 1925”; `bl5i` (content) “Shoghi Effendi received your letter dated June 11th and was very glad ”
- … 4 more in the TSV

**Source / citation lines carrying a number** (104)

- `1.14`: `bl3q` (source) “[From the Guardian:]”; `bl3r` (content) “Regarding the position of the Baha’i women in India and Burma, and the”
- `1.18`: `bl3x` (source) “[From the Guardian:]”; `bl3y` (content) “Your long-awaited letter, penned by our dear and devoted brother, Mr. ”
- `1.23`: `bl45` (source) “[From the Guardian:]”; `bl46` (content) “It is a great pleasure and privilege for me to renew the bonds of fell”
- `1.30`: `bl4f` (source) “[From the Guardian:]”; `bl4g` (content) “I always eagerly await detailed and frequent reports from the National”
- `1.32`: `bl4k` (source) “[From the Guardian:]”; `bl4l` (content) “I do hope and pray that the Indians and Burmese friends will once the ”
- … 99 more in the TSV

### Fire and Light (`fire_and_light_baha_i_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `2.1`: `bl3q` (content) “Excerpts from Selections from the Writings of the Bab”; `bl3s` (content) “The substance wherewith God hath created Me is not the clay out of whi”
- `3.1`: `bl5g` (content) “Excerpts from Fire and Light”; `bl5e` (content) “O Lord! These pure souls have ascended unto the realms on high. They h”

**Opening invocations carrying a number** (13)

- `1.3`: `bl4g` “He is God — Blessed and Exalted is He.”
- `2.10`: `bl47` “He is God, the Sovereign Lord, the All-Glorious!”
- `3.9`: `bl65` “He is God”
- `3.18`: `bl6s` “He is the All-Glorious”
- `3.27`: `bl6o` “He is the All-Glorious”
- `3.30`: `bl6j` “He is God!”
- `3.39`: `bl7k` “He is the All-Glorious!”
- `3.43`: `bl7e` “He is God!”
- `3.52`: `bl72` “He is God!”
- `3.60`: `bl9j` “He is the All-Glorious!”
- `3.66`: `bl9c` “He is God”
- `3.72`: `bl95` “He is God!”
- `4.20`: `bl7w` “He is God!”

**Header numbers colliding with another block** (6)

- `1`: `bl4f` (header) “I. EXCERPTS FROM THE BAHA'I SACRED WRITINGS”; `blab` (header) “BAHA'U'LLAH”
- `2`: `blac` (header) “I”; `blb7` (header) “II”; `blb8` (header) “III”; `bl4j` (header) “IV”; `bl2y` (header) “V”; `blb9` (header) “VI”; `bl3b` (header) “VIII”; `bl3h` (header) “IX”; `blba` (header) “X”; `bl3p` (header) “THE BAB”
- `3`: `bl3u` (header) “II”; `bl5d` (header) “XIV”; `bl5i` (header) “‘ABDU'L-BAHA”
- `4`: `bl5f` (header) “I”; `bl5c` (header) “II”; `bl67` (header) “III”; `bl6a` (header) “IV”; `bl66` (header) “V”; `bl5u` (header) “VI”; `bl6q` (header) “VII”; `bl6n` (header) “VIII”; `bl6m` (header) “IX”; `bl6k` (header) “X”; `bl7q` (header) “XI”; `bl7j` (header) “XII”; `bl7d` (header) “XIII”; `bl8m` (header) “EXCERPTS FROM THE WRITINGS OF SHOGHI EFFENDI”
- `5`: `bl71` (header) “XIV”; `bl9p` (header) “XV”; `bl9k` (header) “XVI”; `bl9d` (header) “XVII”; `bl96` (header) “XVIII”; `bl90` (header) “XIX”; `bl8t` (header) “XX”; `bl9t` (header) “VI”; `bla1` (header) “VII”; `bl9w` (header) “VIII”; `blb3` (header) “IX”
- … 1 more in the TSV

### Âkârâṅga Sûtra (`akaranga_sutra_ocean_jainism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `2.1.5.2.13`: `bl152` (content) “End of the Fifth Lecture, called Begging of Clothes.”; `bl158` (content) “CALLED”
- `2.2.15.151`: `bl1hs` (content) “End of the Fifteenth Lecture, called the Clauses.”; `bl1iy` (content) “CALLED”

**Header numbers colliding with another block** (8)

- `1`: `bl2t` (header) “FIRST BOOK”; `bl2u` (header) “FIRST LECTURE”; `bl2w` (signature) “KNOWLEDGE OF THE WEAPON.”
- `1.7.7`: `bl51` (content) “CALLED”; `bl52` (signature) “CONQUEST OF THE WORLD.”; `blix` (header) “SEVENTH LESSON.”
- `9`: `blbt` (header) “FIFTH LECTURE,”; `blkm` (header) “EIGHTH LECTURE,”
- `6`: `blgk` (header) “SEVENTH LECTURE,”; `blnu` (header) “FIRST PART.”
- `2.1.2.4`: `blox` (content) “But when he perceives that all have received their due share, and are ”; `blyj` (header) “THIRD LECTURE,”
- … 3 more in the TSV

**Signature / closing lines carrying a number** (9)

- `2.6.15`: `bl87` (content) “CALLED”; `bl88` (signature) “HOT AND COLD.”
- `8.8`: `blbu` (content) “CALLED”; `blbv` (signature) “ESSENCE OF THE WORLD.”
- `1.5.6.5`: `blea` (content) “CALLED”; `bleb` (signature) “THE CLEANING.”
- `1.6.5.10`: `blgl` (content) “CALLED”; `blgm` (signature) “LIBERATION.”
- `4.20`: `blnw` (content) “CALLED”; `blnx` (signature) “BEGGING OF FOOD.”
- … 4 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `2.4.16.11`: `bl1jc` (lead-in) “End of the Sixteenth Lecture, called the Liberation.”; `bl1jd` (lead-in) “End of the Second Book.”; `bl1je` (content) “End of the Akaranga Sutra.”

### Sutra Collection (A, Part-2) (`buddhasutra_a_part_2_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `16.1`: `blc6` (content) “Obstructions”; `blc8` (content) ““Endowed with these six qualities, a person is incapable of alighting ”
- `16.2`: `blc7` (content) “Translated from the Pali by Thanissaro Bhikkhu”; `blc9` (content) ““He is endowed with a present kamma obstruction, a defilement obstruct”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (40)

- `1.1`: `bl2t` (lead-in) “To Angulimala”; `bl2u` (lead-in) “I heard thus:”; `bl2v` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- `2.1`: `bl3n` (lead-in) “About Angulimala”; `bl3o` (lead-in) “Translated from the Pali by Thanissaro Bhikkhu.”; `bl3p` (content) “I have heard that on one occasion the Blessed One was staying near Sav”
- `2.10`: `bl3y` (lead-in) “[The Buddha:]”; `bl3z` (content) ““I have stopped, Angulimala, once & for all, having cast off violence ”
- `2.11`: `bl40` (lead-in) “[Angulimala:]”; `bl41` (content) ““At long last a greatly revered great seer for my sake has come to the”
- `3.1`: `bl5j` (lead-in) “To Angulimala”; `bl17u` (lead-in) “I heard thus:”; `bl5k` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- … 35 more in the TSV

### The Confessions of Al Ghazzali (`the_confessions_of_al_ghazzali_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `2.1`: `1556871832221` (content) ““He who knows himself knows God.” - Sayings of Muhammed.”; `4d` (content) “I then examined what knowledge I possessed, and discovered that in non”
- `2.6`: `3i` (content) “Northbrook Society, 185 Piccadilly, W.”; `4i` (content) “This possible condition is, perhaps, that which[pg 18] the Sufis call ”

**Opening invocations carrying a number** (1)

- `1.1`: `41` ““In the name of the most merciful God.””

**Header numbers colliding with another block** (3)

- `1`: `32` (header) “WISDOM OF THE EAST”; `3f` (header) “Editorial Note”; `40` (header) “Ghazzali’s Search for Truth”
- `2`: `34` (header) “TRANSLATED FOR THE FIRST TIME INTO ENGLISH”; `4c` (header) “The Subterfuges of the Sophists”
- `3`: `bl6w` (header) “by”; `3w` (header) “C.F.”; `4o` (header) “The Different Kinds of Seekers after Truth”

### Divine Philosophy (`abdu_l_baha_on_divine_philosophy_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1.44`: `bl7o` (content) “‘Abdu’l-Bahá arose with hands extended, palms upward, he uttered the f”; `bl7q` (content) “O God, O God, I glorify thee O my Lord, my Hope, my Beloved and the Ob”
- `7.23`: `blld` (content) “After ‘Abdu’l-Bahá had taken his seat, at the request of the friends h”; `bllf` (content) “O God, O my Lord, I supplicate to Thee and implore in Thy presence and”

**Opening invocations carrying a number** (1)

- `6.1`: `blk7` “He is God!”

**Header numbers colliding with another block** (2)

- `1`: `bln2` (struct) “”; `bl2v` (content) “© Bahá’í International Community”; `bln1` (struct) “”; `bl6a` (header) “Chapter I”
- `2`: `blbe` (header) “Chapter II”; `blbg` (header) “Knowledge is one of the greatest benefits of God. To acquire knowledge”

### Copy-The Kitáb-I-Íqán 06.08 (`the_brothers_karamazov_ffa_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1`: `bl2y` (content) “© Bahá’í International Community”; `bl32` (content) “No man shall attain the shores of the ocean of true understanding exce”
- `2`: `bl31` (content) “In the name of our Lord, the Exalted, the Most High.”; `bl33` (content) “The essence of these words is this: they that tread the path of faith,”

**Opening invocations carrying a number** (1)

- `2`: `bl31` “In the name of our Lord, the Exalted, the Most High.”

### The Call of Kumayl (`du_a_kumayl_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1`: `bl2t` (content) “The call (or pray) of Kumayl is in fact the call of Al-Khidhr (PUH), b”; `bl2v` (content) “O Lord I ask You by Your mercy that befell on everything and by Your p”
- `2`: `bl2u` (content) “In the name of Allah, the Beneficent, the Merciful”; `bl2w` (content) “Yâ Noor (O Light) Yâ Quddoos (O Most Holy) O The First of all and The ”

**Opening invocations carrying a number** (1)

- `2`: `bl2u` “In the name of Allah, the Beneficent, the Merciful”

### Pearl of Great Price (`pearl_of_great_price_christianity_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `5.1`: `blmc` (content) “God reveals Himself to Moses — Moses is transfigured — He is confronte”; `blmg` (content) “Adam and Eve bring forth children — Adam offers sacrifice and serves G”; `blmv` (header) “Chapter 1”
- `6.1`: `blmk` (content) “God creates the heavens and the earth — All forms of life are created ”; `blmh` (content) “Adam’s seed keep a book of remembrance — His righteous posterity preac”

**Header numbers colliding with another block** (3)

- `1`: `bln1` (header) “A Selection from the Revelations, Translations, and Narrations of Jose”; `bln7` (header) “First Prophet, Seer, and Revelator to The Church of Jesus Christ of La”; `blma` (header) “Selections from the Book of Moses”; `blmb` (content) “An extract from the translation of the Bible as revealed to Joseph Smi”
- `3.1`: `blml` (content) “God created all things spiritually before they were naturally upon the”; `blme` (header) “Chapter 1”
- `4.1`: `blmm` (content) “How Satan became the devil — He tempts Eve — Adam and Eve fall, and de”; `blm9` (header) “Chapter 1”

### The Mahabharata 13 (`mahabharata_13_hindu_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `143.1`: `xc` (content) “[pg 302]“Uma said, ‘O holy one, O thou that didst tear off the eyes of”; `10l` (content) ““Yudhishthira said, ‘It is seen that if a person happens to be unfortu”
- `143.2`: `xd` (content) ““The illustrious one said, ‘The status of a Brahmana, O goddess, is ex”; `10m` (content) ““Bhishma said, ‘If one, setting oneself to undertaking involving even ”

**Header numbers colliding with another block** (3)

- `1`: `bl10q` (header) “Book 13: Anusasana Parva”; `2u` (header) “Section I”
- `2`: `2v` (header) “(Anusasanika Parva)”; `3q` (header) “Section II”
- `143`: `xb` (header) “Section CXLIII”; `10k` (header) “Section CLXIII”

### The Rámáyan of Válmíki (`ramaya_a_hinduism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `3.32.3`: `bl2d6` (content) “The wounds Were on his body yet From wars where Gods and demons met. A”; `bl2d4` (content) “The bonds of law and right he spurned: To others’ wives his fancy turn”; `17s` (content) “She saw the ruthless monster there, Dread of the worlds, unused to spa”
- `6.24.3`: `bl2jc` (content) “Thus Ráma spoke: the chiefs obeyed; And all the Vánar hosts arrayed Sh”; `1v4` (content) “Yield or oppose him: choose between Thy safety and the Maithil queen.’”

**Header numbers colliding with another block** (2)

- `1`: `1557305571638` (header) “INVOCATION.”; `1557305472071` (header) “Book I”
- `6.60`: `1z7` (header) “Canto LIX: Rávans Sally”; `1zo` (header) “Canto LX: Kumbhakarna Roused”

### Rig Veda. Book 1 (`rigveda_1_hindu_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `179.2`: `bl1s9` (content) “The deified object of this omitted hymn is said to be Rati or Love, an”; `bl1sc` (content) “For even the men aforetime, law-fulfillers, who with the Gods declared”
- `179.3`: `bl1sa` (content) “M. Bergaigne is of opinion that the hymn has a mystical meaning, Agast”; `bl1sd` (content) “Non inutilis est labor cui Dii favent: nos omnes aemulos et aemulas vi”

**Source / citation lines carrying a number** (1)

- `179.1`: `bl1s8` (source) “(The following Hymn was originally only found in the Appendix, with ce”; `bl1sb` (content) “‘Through many autumns have I toiled and laboured, at night and morn, t”

### The Advent of Divine Justice (`advent_of_divine_justice_v2_ocean_baha_i_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `2`: `2z` (content) “Best-beloved brothers and sisters in the love of Bahá’u’lláh:”; `31` (content) “The resourcefulness which the national representatives of the American”
- `3`: `30` (content) “It would be difficult indeed to adequately express the feelings of irr”; `32` (content) “For such demonstrations of the interpositions of an ever-watchful Prov”

**Signature / closing lines carrying a number** (1)

- `125`: `bl71` (signature) “SHOGHI”; `bl72` (content) “December 25, 1938”

### The Persian Mystics. Jalálu’d-dín Rúmí (`persian_mystics_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (2)

- `1`: `bl3g` (content) “TO A. T. K. THIS LITTLE BOOK OF EASTERN WISDOM IS LOVINGLY INSCRIBED”; `bl3i` (content) ““OUR JOURNEY IS TO THE ROSE-GARDEN OF UNION” JALÁLU’D-DÍN RÚMÍ.”; `bl5j` (header) “The Life and Work of Jalálu’d-Dín Rúmí”
- `1.38`: `bl5f` (content) “Put away the tale of love that travellers tell; Do thou serve God with”; `bl6w` (content) ““THIS IS LOVE” This is Love: to fly heavenward, To rend, every instant”

### مكاتيب عبدالبهاء جلد اول (`makatib_abd_v1_fa`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `137.1`: `blly` (content) “این مناجات را هر نفسی بکمال تضرّع و ابتهال بخواند سبب روح و ریحان قلب ”; `blm2` (content) “الهی الهی انّی أبسط اليک اکفّ التضرّع و التبتّل و الابتهال و اعفّر وجه”

**Opening invocations carrying a number** (3)

- `3.10`: `bl3o` “بسم الله الرحمن الرحیم”
- `3.33`: `blm9` “و قال محیی الدین بالباء ظهر الوجود و بالنقطة تميّز العابد من المعبود و النقطة للتمییز و هو وجود العب”
- `3.39`: `bl42` “و ایضا قال فی شرح القصیدة و هو باء بسم الله الرحمن الرحیم الّتی ظهرت الموجودات فیها و هی الالف المبس”

**Header numbers colliding with another block** (132)

- `1`: `bl2u` (header) “۱”; `bl2v` (header) “بسم الله الرحمن الرحیم”
- `2`: `bl33` (header) “۲”; `bl34` (header) “لوح الأفلاک”; `bl35` (header) “هو الله”
- `3`: `bl3i` (header) “۳”; `bl3j` (header) “تفسیر البسملة”; `bl3k` (header) “هو الله”
- `4`: `bl47` (header) “۴”; `bls0` (header) “تفسير الم غلبت الروم”; `bl48` (header) “هوالأبهی”
- `5`: `bl5d` (header) “۵”; `bl5f` (header) “هو الأبهی”
- … 127 more in the TSV

### Tahafut Al-Tahafut (The Incoherence of the Incoherence) (`ibn_rushd_s_tahafut_al_tahafut_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `3.1.115`: `blio` (content) “I say:”; `bliq` (lead-in) “Ghazali says:”; `blir` (content) “The second way is that the highest sphere has a definite measure of si”

**Opening invocations carrying a number** (1)

- `ii.1`: `bl4l` “In the Name of the Merciful and Compassionate God: and after Praise to God and Benediction upon all ”

**Header numbers colliding with another block** (3)

- `2.1`: `blbm` (header) “The Second Discussion”; `blbn` (header) “The Refutation of Their Theory of the Incorruptibility of the World an”
- `17.2`: `bl110` (content) “The subdivisions are seven: The first is medicine, whose end is the kn”; `bl11e` (header) “The First Discussion”
- `17.5`: `bl115` (content) “As to the first point, it is necessary to contest it, for on its negat”; `bl15h` (header) “The Fourth Discussion”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (418)

- `1.2.8`: `bl51` (lead-in) “Ghazali says:”; `bl52` (content) “There are two objections to this. The first objection is to say: why d”
- `1.2.9`: `bl53` (lead-in) “I say:”; `bl54` (content) “This argument is sophistical: although it is not allowable for him to ”
- `1.2.12`: `bl57` (lead-in) “Ghazali answers, on behalf of the philosophers:”; `bl58` (content) “The philosophers say: This is clearly impossible, for everything that ”
- `1.2.13`: `bl59` (lead-in) “I say:”; `bl5a` (content) “This is perfectly clear, except for one who denies one of the premisse”
- `1.2.14`: `bl5b` (lead-in) “Ghazali says:”; `bl5c` (content) “This kind of impossibility is found not only in the necessary and esse”
- … 413 more in the TSV

### Messages to the Bahá’í World postponed (`messages_to_the_baha_i_world_1950_1957_bahai_oceaneaa3dac48b2d9723140635f2b51a605a`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `21.10\_4`: `bluw` (content) “to them all, as well as to those who, as the fortunes of this fate-lad”; `blux` (content) “I direct my impassioned appeal to obey, as befits His warriors, the su”

**Header numbers colliding with another block** (85)

- `1`: `bl2y` (header) “— 1 —”; `bl2z` (header) “Review of World Progress of the Faith”
- `2`: `bl30` (header) “Cablegram, April 25, 1950”; `bl3q` (header) “— 2 —”; `bl3r` (header) “An Enterprise Transcending Any National Institution”
- `3`: `bl3s` (header) “July 7, 1950”; `bl3z` (header) “— 3 —”; `blut` (header) “Cablegram, December 16, 1950”
- `4`: `bl40` (header) “Opening Door to Pilgrimage”; `blsn` (struct) “”; `bl44` (header) “— 4 —”
- `5`: `bl45` (header) “Formation of First International Bahá’í Council”; `blso` (struct) “”; `bl49` (header) “— 5 —”
- … 80 more in the TSV

### The Promised Mahdi, Part I (`the_promised_mahdi_part_1_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1.19.333`: `bl23c` (content) “Note: After that Shaykh Saduq (r.a.) says: Also take note of the aged ”; `bl23e` (content) “Zahak, the man with two snakes.”

**Opening invocations carrying a number** (1)

- `1.6.175`: `blzi` ““He is the Mahdi, who will be in the last period of time and after whose rise there will be Judgment”

**Header numbers colliding with another block** (36)

- `1.6.1`: `blrr` (content) “أَحْمَدُ بْنُ مُحَمَّدِ بْنِ إِسْحَاقَ عَنْ إِسْمَاعِيلَ بْنِ إِبْرَاه”; `blwc` (header) “Chapter 1: His Advent in the Last Period of Time”
- `1.6.2`: `blrs` (content) “1 – Ghaibat Nomani: It is narrated from Ahmad bin Muhammad bin Ishaq f”; `blwk` (header) “Chapter 2: Mahdi Is from My Progeny and From the Progeny of Fatima”
- `1.6.3`: `blrt` (content) ““We the children of Abdul Muttalib are the chiefs of Paradise dwellers”; `blwn` (header) “Chapter 3: Mahdi Is a Leader of Paradise”
- `1.6.4`: `blru` (content) “Ghaibat Tusi narrates an identical tradition through Muhammad bin Ali ”; `blwp` (header) “Chapter 4: Allegiance to the Mahdi”
- `1.6.5`: `blrv` (content) “2 – Uyun Akhbar Reza: Through the chains of Tamimi, it is narrated fro”; `blwr` (header) “Chapter 5: People of the East Will Support the Mahdi”
- … 31 more in the TSV

### Hayat Al-Qulub Vol.3 (`hayat_al_qulub_vol_3_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2.43.43`: `bl2wr` (content) “Ninth Verse:”; `bl2wt` (content) “Gather together those who were unjust and their associates… (Surah Saf”

**Header numbers colliding with another block** (3)

- `1.2`: `bl3b` (header) “First Verse”; `bl3o` (header) “Second Verse”; `bl6d` (header) “Part 2: The Imam Should Be Infallible (Inerrant-Sinless) from All Sins”
- `1.3`: `bl6h` (header) “First Argument”; `bl6j` (header) “Second Argument”; `bl6m` (header) “Third Argument”; `bl6q` (header) “Fourth Argument”; `bl9g` (header) “Part 3: Imamate is Established through the Explicit Mention”
- `1.4`: `bl9k` (header) “First Argument”; `bl9m` (header) “Second Argument”; `bl9s` (header) “Third Argument”; `bl9z` (header) “Fourth Argument”; `bla3` (header) “Fifth Argument”; `bla8` (header) “Sixth Argument”; `blaa` (header) “Seventh Argument”; `blac` (header) “Eight Argument”; `blal` (header) “Verses That Mention the Appointment of the Imams (a.s.)”; `blcc` (header) “Part 4: It is Mandatory to Know the Imam of the Time”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (145)

- `1.3.33`: `blam` (lead-in) “The First Verse:”; `blan` (content) “The Lord of the universe asserts:”
- `1.3.47`: `blb1` (lead-in) “Another Verse is:”; `blb2` (content) “وَقَالُوا لَوْلَا نُزِّلَ هَذَا الْقُرْآنُ عَلَى رَجُلٍ مِنْ الْقَرْيَ”
- `1.3.55`: `blba` (lead-in) “The Second Verse:”; `blbb` (content) “وَرَبُّكَ يَخْلُقُ مَا يَشَاءُ وَيَخْتَارُ.”
- `2.5.2`: `blpi` (lead-in) “The First Verse:”; `blpj` (content) “The Lord Almighty says:”
- `2.5.37`: `blqi` (lead-in) “The Second Verse:”; `blqj` (content) “إِنَّ اللَّهَ اصْطَفَى آدَمَ وَنُوحًا وَآلَ إِبْرَاهِيمَ وَآلَ عِمْرَا”
- … 140 more in the TSV

### A History of Indian Philosophy Volume I (`history_of_indian_philosophy_volume_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl2z` (content) “निखिलमनुजचित्तं ज्ञानसूत्रैर्नवैर्य: स्रजमिव कुसुमानां कालरन्ध्रैर्विध”; `bl30` (content) “May He, who links the minds of all people, through the apertures of ti”; `bl3s` (header) “Chapter I Introductory”

**Header numbers colliding with another block** (27)

- `3`: `bl4a` (header) “The Vedas and Their Antiquity.”; `bl7r` (header) “Chapter III the Earlier Upanisads. (700 B.C.-600 B.C.)”
- `4`: `bl4d` (header) “The Place of the Vedas in the Hindu Mind.”; `bl7t` (header) “The Place of the Upanisads in Vedic Literature.”; `blcg` (header) “Chapter IV General Observations on the Systems of Indian Philosophy”
- `5`: `bl4g` (header) “Classification of the Vedic Literature.”; `bl7x` (header) “The Names of the Upanisads; Non-Brahmanic Influence.”; `blci` (header) “In What Sense Is a History of Indian Philosophy Possible?”; `bldq` (header) “Chapter V Buddhist Philosophy”
- `6`: `bl4j` (header) “The Samhitâs.”; `bl87` (header) “Brâhmanas and the Early Upanisads.”; `blcs` (header) “Growth of the Philosophic Literature.”; `bldt` (header) “The State of Philosophy in India before the Buddha.”; `blpp` (header) “Chapter VI The Jaina Philosophy”
- `7`: `bl4p` (header) “The Brâhmanas.”; `bl98` (header) “The Meaning of the Word Upanisad.”; `blcz` (header) “The Indian Systems of Philosophy.”; `ble5` (header) “Buddha: His Life.”; `blpr` (header) “The Origin of Jainism.”; `blv8` (header) “Chapter VII The Kapila and the Pātañjala Sāṃkhya (Yoga).”
- … 22 more in the TSV

### Chinese Literature (`chineseliterature_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `5.2.9`: `bl186` (content) ““Yes, at the mighty sky I gaze, And lo! the stars pursue their maze, A”; `bl1ie` (content) “PRINCESS. A long period has elapsed since I had to thank his Majesty f”

**Header numbers colliding with another block** (20)

- `1`: `bl33` (header) “WITH CRITICAL AND BIOGRAPHICAL SKETCHES”; `bl4d` (header) “THE ANALECTS of confucius”; `bl4g` (header) “PRONUNCIATION OF PROPER NAMES”; `bl4h` (content) “j, as in French. ng, commencing a word, like the same letters terminat”; `bl4s` (header) “On Learning — Miscellaneous Sayings:”
- `2.1`: `bl1lm` (struct) “”; `blte` (header) “BOOK I”
- `3.2`: `bl1l8` (struct) “”; `blwe` (header) “BOOK II”
- `5.7`: `bl1l9` (struct) “”; `bl1he` (content) “Enter Emperor Yuente, attended by Eunuchs and Women.”
- `1.1`: `bl4q` (header) “THE ANALECTS”; `bl4r` (header) “BOOK I”
- … 15 more in the TSV

### Sutra Collection (M, Part-1) (`sutra_collection_m_part_1_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `13.58`: `blq7` (content) “And the thought arose in the Venerable Ánanda: “If I were to allow the”; `bl1a9` (content) ““So, Ánanda, there is kamma that is incapable of good result and appea”

**Header numbers colliding with another block** (16)

- `2`: `bl2t` (header) “Point by point Classification”; `bl3g` (header) “Madhupindika Sutta”
- `3`: `bl3h` (header) “The Ball of Honey”; `bl4l` (header) “The Madhura Sutta”
- `4`: `bl4m` (header) “(Majjhima Nikâya, Sutta 84)”; `bl59` (header) “II.”; `bl5h` (header) “III.”; `bl5n` (header) “The Madhura Sutta”
- `5`: `bl5o` (header) “(Majjhima-Nikâya, No. 84.)”; `bl5r` (header) “I”; `bl62` (header) “II”; `bl69` (header) “III”; `bl6g` (header) “IV.”; `bl6n` (header) “V”; `bl70` (header) “The Magandiya Spell”; `bl72` (header) “Foreword:”
- `6`: `bl74` (header) “The Magandiya Spell”; `bl9t` (header) “Magga-vibhanga Sutta”; `bl9u` (header) “An Analysis of the Path”
- … 11 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `1.1`: `bl2u` (lead-in) “I heard thus:”; `bl2v` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- `9.1`: `bles` (lead-in) “Thus have I heard:”; `blet` (content) “Once the Blessed One dwelt at Rajagaha, on the hill called Vultures’ P”

### Japan Will Turn Ablaze! (`japan_will_turn_ablaze_baha_i_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `12.7`: `blp7` (content) “Shoghi Effendi’s cable to the first Convention of North East Asia:”; `blpi` (content) “Our beloved Guardian has instructed me to write you on his behalf and ”

**Header numbers colliding with another block** (15)

- `1`: `bl2v` (header) “Tablets of ‘Abdu’l-Bahá, Letters of Shoghi Effendi and the Universal H”; `bl10m` (content) ““Your name will forever remain associated with the rise of the Faith a”; `bl115` (header) “Chapter 1”; `bl3j` (header) “The Epoch of ‘Abdu’l-Bahá’s Ministry”
- `2`: `bl103` (header) “Part I”; `bl11q` (header) “Miss Agnes B. Alexander 1875–1971”; `bl3t` (header) “Tablets of ‘Abdu’l-Bahá to Miss Agnes Alexander”; `blxs` (header) “Chapter 2”
- `3`: `bl67` (header) “Dr. George J. Augur 1853–1927”; `bl69` (header) “Tablets of ‘Abdu’l-Bahá to Dr. George Augur”; `bl13k` (header) “Chapter 3”
- `4`: `bl6v` (header) “Mr. Kanichi Yamamoto 1879–1961”; `bl73` (header) “Tablets of ‘Abdu’l-Bahá to Mr. Kanichi Yamamoto”; `bl106` (header) “Chapter 4”
- `5`: `bl8m` (header) “Mr. Saichiro Fujita 1886–1976”; `bl8q` (header) “Tablets of ‘Abdu’l-Bahá to Mr. Saichiro Fujita”; `blx8` (header) “Chapter 5”
- … 10 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `8.1`: `bl10a` (lead-in) “By Miss Agnes B. Alexander”; `bldp` (content) “In the spring of 1912, in Tokyo, Viscount Shibusawa, an honored banker”

### Bahá’í Burial (`bahai_burial_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `3.3`: `bl4d` (content) ““although the friends are thus left free to follow their own inclinati”; `bl4g` (content) “The Universal House of Justice advises that the place of death may be ”

**Header numbers colliding with another block** (3)

- `1`: `bl30` (header) “Extracts From the Writings of Bahá’u’lláh:”; `bl31` (header) “— 1 —”
- `2`: `bl33` (source) “Bahá’u’lláh, from a Tablet — translated from the Arabic”; `bl37` (header) “— 2 —”; `bl3e` (header) “Extracts From Letters Written on Behalf of the Guardian:”
- `3`: `bl3a` (header) “— 3 —”; `bl47` (header) “Extracts From Letters Written on Behalf of the Universal House of Just”

**Source / citation lines carrying a number** (10)

- `1.3`: `bl35` (content) “Answer: The law applieth to transportation by land as well as by sea, ”; `bl36` (source) “Bahá’u’lláh, from a Tablet — translated from the Arabic”
- `2.2`: `bl39` (source) “Annotation of the Universal House of Justice, in “A Synopsis and Codif”; `bl3h` (source) “From a letter written on behalf of Shoghi Effendi, 10 January 1936 to ”; `bl3j` (content) “Both the Bahá’í marriage service and the Bahá’í funeral service are ex”
- `3.2`: `bl3c` (source) “Note of the Universal House of Justice, Synopsis and Codification of t”; `bl4a` (source) “From a letter written on behalf of the Universal House of Justice, 9 J”; `bl4c` (content) “You have asked whether it is permissible for the friends to chant a pr”
- `2.3`: `bl3k` (source) “From a letter written on behalf of Shoghi Effendi, 19 May 1936 to an i”; `bl3m` (content) “There is no objection whatsoever to non-Bahá’ís being present when the”
- `2.8`: `bl3r` (source) “From a letter written on behalf of Shoghi Effendi, 20 July 1946 to the”; `bl3t` (content) “The body may be conveyed by any means to a distance that can be covere”
- … 5 more in the TSV

### Revival of Religious Learnings Vol-III (`revival_of_religious_sciences_v_3_ocean_islam_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `7.68`: `blvx` (content) “But the snake salutes one who knows its charms.”; `blw1` (content) “We shall show here that poverty is better than wealth by some illustra”

**Header numbers colliding with another block** (11)

- `1`: `bl2t` (struct) “IHYA ULUM-ID-DIN”; `blru` (header) “THE BOOK OF DESTRUCTIVE EVILS”; `bl37` (header) “CHAPTER I: SOUL AND ITS ATTRIBUTES”
- `2`: `bl3b` (header) “WORDS-NAFS, RUH, QALB, AQL EXPLAINED”; `bl3r` (header) “ILLUSTRATIONS OF SECRET ARMIES OF SOUL”; `bl8o` (header) “CHAPTER II: GOOD CONDUCT”; `bloe` (header) “Part II”
- `3`: `bl8p` (header) “RIAZAT OR EFFORTS IN THE WAYS OF GOD”; `blao` (header) “SOME EXAMPLES OF GOOD CONDUCT”; `blbq` (header) “CHAPTER III: GREED FOR FOOD SEXUAL PASSION”
- `4`: `bldq` (header) “SIGNS OF TRUE HUNGER”; `blf5` (header) “SECTION 8: REWARDS OF OPPOSING PASSIONS”; `blff` (header) “CHAPTER IV: HARMS OF TONGUE”
- `3.51`: `bleu` (header) “SECTION 6: SEXUAL PASSION”; `blev` (content) “There are two benefits of sexual passion. (i) satisfaction of intercou”
- … 6 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `4.24`: `blgy` (lead-in) “luster of lightning.”; `blh2` (content) “The Prophet kept what he had in his hand and kissed the forehead of Ay”
- `4.25`: `blh6` (lead-in) “But he returns to-day with a painful heart.”; `blh9` (content) “The Prophet ordered for him 100 camels and asked him: Do you talk by p”

### Epistle to the Son of the Wolf (`epistle_to_the_son_of_the_wolf_bahai_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2`: `bl2z` (content) “Praise be to God, the Eternal that perisheth not, the Everlasting that”; `bl30` (content) “The light that is shed from the heaven of bounty, and the benediction ”

**Opening invocations carrying a number** (2)

- `1`: `blaf` “In the name of God, the One, the Incomparable, the All-Powerful, the All-Knowing, the All-Wise.”
- `258`: `bla4` “In the name of God, the Compassionate, the Merciful.”

**Header numbers colliding with another block** (1)

- `1`: `blag` (struct) “”; `blaf` (content) “In the name of God, the One, the Incomparable, the All-Powerful, the A”

### Avesta - Selections (`avesta_selections_ocean_zoroastrianism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl5x` (content) “Library of The World’s Best Literature Ancient and Modern”; `blz7` (content) “Avesta, or Zend-Avesta, an interesting monument of antiquity, is the B”; `bl13b` (header) “A Prayer For Knowledge”

**Header numbers colliding with another block** (9)

- `2`: `blz8` (content) “The story of the recovery of the Avesta, or rather the discovery of th”; `bl13k` (header) “The Angel of Divine Obedience”
- `3`: `blza` (content) “With the growth of our knowledge of the language of the sacred texts, ”; `bl13n` (header) “To the Fire”
- `4`: `blzb` (content) “Tradition is unanimous on one point at least: it is that the original ”; `bl13q` (header) “The Goddess of the Waters”
- `5`: `blzc` (content) “Fragmentary and disjointed as are the remnants of the Avesta, we are f”; `bl13t` (header) “Guardian Spirits”
- `6`: `blzd` (content) “Even these texts no single manuscript in our time contains complete. T”; `bl13w` (header) “An Ancient Sindbad”
- … 4 more in the TSV

### The Mahabharata 7 (`mahabharata_7_hindu_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `122.1`: `h4` (content) ““Sanjaya said, ‘Meanwhile, O king, Duhsasana rushed against the grands”; `h7` (content) ““Dhritarashtra said, ‘Were there, O Sanjaya, no mighty car-warriors in”

**Header numbers colliding with another block** (5)

- `1`: `blxj` (header) “Book 7: Drona Parva”; `2t` (header) “Section I”; `2u` (header) “(Dronabhisheka Parva)”
- `4`: `blxm` (struct) “”; `3c` (header) “Section IV”
- `32`: `6n` (header) “(Abhimanyu-badha Parva)”; `6u` (header) “Section XXXII”
- `122`: `h3` (header) “Section CXXII”; `h6` (header) “Section CXXII”
- `184.1`: `p5` (header) “(Drona-vadha Parva)”; `p6` (content) ““Sanjaya said,—‘Thus addressed by Vyasa, the heroic king Yudhishthira ”

**Source / citation lines carrying a number** (2)

- `85.1`: `cy` (source) “(Jayadratha-Vadha Parva)”; `cz` (content) ““Dhritarashtra said, ‘After Abhimanyu’s slaughter when the next day ca”
- `152.1`: `kt` (source) “(Ghatotkacha-badha Parva)”; `ku` (content) ““Sanjaya said,—‘That elephant force of thine, O king, swelling with mi”

### A Traveler’s Narrative (`abdu-l-baha-traveler-s-narrative-ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `122`: `6c` (content) ““‘It hath been known that God (glorious is His mention) is sanctified ”; `6d` (lead-in) “Finis.”; `6e` (content) ““But good deeds depend on this, that the Royal Person should himself l”

**Opening invocations carrying a number** (1)

- `121`: `6b` ““‘He is God, exalted is He.”

**Header numbers colliding with another block** (1)

- `1`: `2y` (header) “Written to Illustrate the Episode of the Báb”; `2z` (content) “Touching the individual known as the Báb and the true nature of this s”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `170`: `7r` (lead-in) “Finis.”; `7s` (content) “By these sentences a clue to the principles, ideas, line of conduct, b”

### Scroll of Wisdom (`pand_nameh_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2.26`: `bl3q` (lead-in) “Arthur N. Wollaston.”; `bl3r` (content) “Glen Hill, Walmer, May 6, 1906.”; `bl3t` (content) “In the Name of God, the Merciful and Compassionate!”

**Opening invocations carrying a number** (1)

- `2.26`: `bl3t` “In the Name of God, the Merciful and Compassionate!”

**Header numbers colliding with another block** (1)

- `1`: `bl77` (struct) “”; `bl2v` (header) “Editorial Note”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.2`: `bl2x` (lead-in) “L. CRANMER-BYNG. S. A. KAPADIA.”; `bl2y` (content) “The Orient Press, 4, Harcourt Buildings, Inner Temple, London.”

### The Secret of Divine Civilization (`abdu_l_baha_secret_of_divine_civilization_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2`: `2z` (content) “Praise and thanksgiving be unto Providence that out of all the realiti”; `30` (content) “This supreme emblem of God stands first in the order of creation and f”

**Opening invocations carrying a number** (1)

- `1`: `2y` “In the Name of God the Clement, the Merciful”

**Header numbers colliding with another block** (1)

- `1`: `2x` (header) “The Secret of Divine Civilization”; `2y` (content) “In the Name of God the Clement, the Merciful”

### The Kitáb-i-Aqdas (`kitab_i_aqdas_bahai_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2`: `bl30` (content) “The first duty prescribed by God for His servants is the recognition o”; `bl31` (content) “They whom God hath endued with insight will readily recognize that the”; `bl8b` (header) “Questions and Answers”

**Opening invocations carrying a number** (1)

- `1`: `bl2z` “In the name of Him Who is the Supreme Ruler over all that hath been and all that is to be.”

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (header) “The Most Holy Book”; `bl2z` (content) “In the name of Him Who is the Supreme Ruler over all that hath been an”

### Seleção dos Escritos de ‘Abd'u’l-bahá (`selecao_dos_escritos_de_abdu_l_baha_pt`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl2t` (content) ““Ele é - e para todo o sempre deve assim ser considerado - primeiro e ”; `bl3v` (header) “1”; `bl3w` (content) “Ó povos do mundo! O Sol da Verdade surgiu a fim de iluminar toda a Ter”

**Header numbers colliding with another block** (6)

- `2`: `bl3x` (content) “Diz a Abençoada Beleza: “Todos vós sois os frutos de uma só árvore, as”; `bl43` (header) “2”
- `3`: `bl3y` (content) “Por esta razão devem todos os seres humanos apoiar vigorosamente um ao”; `bl4p` (header) “3”
- `4`: `bl3z` (content) “Neste dia, é estimado no Limiar do Senhor quem oferece o cálice da fid”; `bl4u` (header) “4”
- `5`: `bl40` (content) “Ó vós, queridos amigos! O mundo está em guerra e a espécie humana está”; `bl5h` (header) “5”
- `6`: `bl41` (content) “A Fé da Abençoada Beleza convoca o gênero humano à segurança e ao amor”; `bl5m` (header) “6”
- … 1 more in the TSV

### Selections from the Writings of ‘Abdu’l-Bahá (`selections_from_the_writings_of_the_abdu_l_baha_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `70.5`: `1555425237250` (content) “The first is investigation of truth, The second, the oneness of mankin”; `1555425275073` (lead-in) “and so on and so forth. Strive that souls may attain unto the light of”; `is` (content) “The letter thou hast enclosed was perused. When man’s soul is rarified”

**Opening invocations carrying a number** (1)

- `237.2`: `1hq` “He is the All-Glorious!”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `206.10`: `1554992269841` (lead-in) “Unless ye must, Bruise not the serpent in the dust, How much less woun”; `19g` (content) “Let all your striving be for this, to become the source of life and im”
- `218.2`: `1554974369567` (lead-in) “In the Orient scatter perfumes, And shed splendors on the West. Carry ”; `1bl` (content) “One year after the ascension of Bahá’u’lláh, there came this verse fro”
- `221.5`: `1cr` (lead-in) “Until such time, however, as the friends establish perfect unity among”; `1cs` (content) “That soul which hath itself not come alive, Can it then hope another t”

### The Guide for The Perplexed (`a_guide_for_the_perplexed_judaism_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `i.1`: `bl9p` (content) “Moses Maimonides”; `bl9q` (signature) “R. Joseph Ibn Aknin”; `bl9s` (lead-in) “In the name of God, Lord of the Universe.”; `bl9t` (content) “To R. Joseph (may God protect him!), son of R. Jehudah (may his repose”

**Header numbers colliding with another block** (4)

- `1`: `bl3a` (header) “Preface to Volume One of the First Edition”; `bl3i` (header) “The Life of Moses Maimonides”; `bl4a` (header) “The Moreh Nebuchim Literature”; `bl9r` (header) “[Letter of the Author to His Pupil, R. Joseph Ibn aknin.]”; `bl9v` (header) “[Prefatory remarks.]”; `blai` (header) “Directions for the Study of This Work.”; `blak` (header) “Introductory remarks. [On Method]”; `blb7` (header) “Part I”
- `3`: `bl7z` (header) “Part I.”; `bl8k` (header) “Part II.”; `bl95` (header) “Part III.”; `blxd` (header) “Part III”
- `1.1`: `blb8` (content) ““Open ye the gates, that the righteous nation which keepeth the truth ”; `blb9` (header) “Chapter I”
- `2.i.1`: `blnv` (content) “Twenty-five of the propositions which are employed in the proof for th”; `blnw` (header) “Proposition I.”

### Crisis and Victory (`crisis_and_victory_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `23.5`: `bl5n` (content) “…”; `bl5p` (content) “Let not, however, the invincible army of Bahá’u’lláh, who in the West,”

**Source / citation lines carrying a number** (3)

- `23.6`: `bl5o` (content) “In the conduct of this twofold crusade the valiant warriors struggling”; `bl5q` (source) “Shoghi Effendi, from a letter 25 December 1938 to the Bahá’ís of the U”
- `39.3`: `bl7f` (source) “On behalf of the Universal House of Justice, 18 October 1984 to the Na”; `bl7i` (source) “Shoghi Effendi, ‘Messages to America’, p. 51”; `bl7l` (content) “Say: Tribulation is a horizon unto My Revelation. The day star of grac”
- `71.2`: `blbb` (source) “The Universal House of Justice, Riḍván 1986 to the Bahá’ís of the Worl”; `blbe` (source) “Shoghi Effendi, ‘Messages to the Bahá’í World 1950-1957’, p. 123”

### Paris Talks (`abdu-l-baha-paris-talks_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `9.1`: `6m` (content) “An Indian said to ‘Abdu’l-Bahá: “My aim in life is to transmit as far ”; `6n` (content) “The Message of Krishna is the message of love. All God’s prophets have”

**Header numbers colliding with another block** (1)

- `1`: `2w` (header) “Part I”; `2x` (header) “1”; `ms` (header) “40”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (8)

- `40.41`: `nz` (lead-in) “Monsieur Bleck thanked ‘Abdu’l-Bahá, and he replied:”; `o0` (content) ““I am very grateful to you for the kind sentiments which you have just”
- `55.1`: `vh` (lead-in) ““Should Prayer take the form of action?””; `vi` (content) “‘Abdu’l-Bahá: “Yes: In the Bahá’í Cause arts, sciences and all crafts ”
- `55.2`: `vj` (lead-in) ““What is the purpose of our lives?””; `vk` (content) “‘Abdu’l-Bahá: “To acquire virtues. We come from the earth; why were we”
- `56.1`: `vo` (lead-in) ““What is evil?””; `vp` (content) “‘Abdu’l-Bahá: “Evil is imperfection. Sin is the state of man in the wo”
- `57.1`: `vt` (lead-in) ““Does the soul progress more through sorrow or through joy in this wor”; `vu` (content) “‘Abdu’l-Bahá: “The mind and spirit of man advance when he is tried by ”
- … 3 more in the TSV

### The Philosophy and Theology (`ibn_rushd_averroes_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1.1`: `bl2w` (lead-in) “Sir,”; `bl2x` (content) “It was at your feet that I first learned to appreciate historical and ”; `bl35` (content) “And after: Praise be to God for all His praiseworthy acts, and blessin”

**Header numbers colliding with another block** (3)

- `1`: `bl2v` (header) “Dedication to Dr. Azimuddin Ahmad”; `bl34` (header) “I: A Decisive Discourse on the Delineation of the Relation between Rel”
- `5`: `bl5b` (header) “Of the Unity of God”; `bl5d` (header) “On Divine Attributes”
- `6`: `bl5n` (header) “Of Divine Perfection”; `bl5v` (header) “Of Direction”; `bl66` (header) “Of the Actions of God”

### Issues Related to the Study of the Bahá'í Faith (`issues_related_to_the_study_of_the_baha_i_faith_oc7169d422fc6c75c3a64bc1c50c1bb7cc`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl2s` (lead-in) “The Universal House of Justice Department of the Secretariat 7 April 1”; `bl2v` (lead-in) “To all National Spiritual Assemblies Dear Bahá’í Friends,”; `bl2x` (content) “Issues Related to the Study of the Bahá’í Faith”; `bl3i` (header) “— 1 —”; `bl3j` (content) “10 December 1992”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (10)

- `0.12`: `bl3c` (lead-in) “Extracts from letters written on behalf of the Universal House of Just”; `bl3d` (content) “A compilation prepared by the National Spiritual Assembly of Canada an”
- `2.1`: `bl45` (lead-in) “5 October 1993”; `bl46` (content) “With regard to the current policy of advance review, all Bahá’ís, what”
- `3.1`: `bl4d` (lead-in) “5 October 1993”; `bl4e` (content) “You may be confident that the House of Justice is sympathetic to the n”
- `4.1`: `bl4i` (lead-in) “19 October 1993”; `bl4j` (content) “The House of Justice suggests that the issues raised in your letter mi”
- `5.1`: `bl54` (lead-in) “19 May 1995”; `bl55` (content) “The opportunity which electronic communication technology provides for”
- … 5 more in the TSV

### Qabbalah: Writings of Solomon The Philosophical Writings of Solomon Ben Yehudah Ibn Gebirol (`qabbalah_writings_of_solomon_ibn_gebirol_judaism_oe99e8ee3898c494b58a7a1dcabf8e138`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `3.45`: `blln` (content) “Woe on account of this; woe upon the time when Hagar gave birth to Yis”; `bl3f5` (content) “‘For YHVH has a slaughter in Bots-rah.’””

**Header numbers colliding with another block** (1)

- `1`: `bl3d` (header) “The Philosophical Writings of Solomon Ben Yehudah Ibn Gebirol, or Avic”; `bla0` (header) “I. Ibn Gebriol's Life and Writing”

**Source / citation lines carrying a number** (1)

- `20.68`: `bl2cs` (source) “(First published in “The Keystone,” Freemason Newspaper, Philadelphia,”; `bl2cu` (content) “AN ANCIENT LODGE OF INITIATES”; `bl2cv` (source) “FROM THE QABBALAH”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `i.1`: `bl4v` (lead-in) ““God hath spoken once; two-fold is what I heard.””; `bl4w` (content) “THE following pages are devoted to a short account of the life and wri”
- `24.1`: `bl2g8` (header) “CHAPTER I. A Description of the Unkown Deity Who is in the Darkness”; `bl2ga` (lead-in) “To Timothy:”; `bl2gb` (content) “SECTION I. Triad above all substance, super-divine and above the Good,”

### The Dawn-Breakers (`dawn_breakers_temporary_copy_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `3.37`: `ap` (content) “Sa‘íd-i-Hindí, Mullá Maḥmúd-i-Ḵhu’í, Mullá Jalíl-i-Urúmí, Mullá Aḥmad”; `ar` (content) “These all, with the single exception of Ṭáhirih, attained the presence”

**Header numbers colliding with another block** (1)

- `1`: `2t` (header) “Nabíl’s Narrative of the Early Days of the Bahá’í Revelation”; `2z` (header) “Shoghi Effendi”; `69` (header) “CHAPTER I”

**Source / citation lines carrying a number** (1)

- `i.70`: `1549570548149` (source) “(Qurays̱h, ‘Abd-i-Manáf, Hás̱him, ‘Abdu’s̱h-S̱hams, ‘Abdu’l-Muṭṭálib, ”; `5h` (content) “Umayyad Caliphs, 661–749 A.D. ‘Abbásid Caliphs, 749–1258 A.D Fáṭimite ”

### Jerusalem Volume 2 (`jerusalem_volume_2_bahai_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1.70`: `bl1ch` (content) ““He fears not God, who spares not man.””; `bl8d` (content) “The perceptions of the internal sense are of themselves seldom so palp”

**Header numbers colliding with another block** (1)

- `1`: `bl1c4` (header) “A Treatise on Ecclesiastical Authority and Judaism”; `bl33` (header) “Section I”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `1.21`: `bl4s` (lead-in) “The Origin of Compulsory Rights, and the Validity of Covenants amongst”; `bl4t` (content) “I know I risk becoming too speculative for many a reader. But is not e”
- `3.21.2`: `bls5` (lead-in) “A PRAYER FOR THE JEWS.”; `bls6` (content) ““Almighty and Eternal God! I pray to thee, for the welfare of a scatte”
- `3.24.10`: `blty` (lead-in) “Isaiah Iviii.”; `bltz` (content) “The prophet Micah talks in the same strain: “Wherewith shall I come be”
- `3.27.1`: `blu9` (lead-in) “צדיקים אף במיתתם קרויים חיים”; `blwr` (content) ““The just are deemed still to exist though they be dead.” — Talmud.”

### Visparad (`avesta_visperad_ocean_zoroastrianism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `2.11`: `bl6l` (content) “[pg 340] And in this Zaothra with this Baresman, I desire to worship t”; `bl3j` (content) “And in this Zaothra with this Baresman, I desire to approach the Gâtha”

**Header numbers colliding with another block** (1)

- `4`: `bl7x` (header) “BEGINNING OF THE HAOMA OFFERING; ROLL-CALL OF THE PRIEST.”; `bl4e` (header) “VISPARAD IV (SP. V).”

### Bahá’í Funds and Contributions (`bahai_funds_ocean_compilation_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `13.2`: `bl82` (content) “In cases, however, when a friend or sympathizer of the Faith eagerly i”; `bl48` (content) “True, we cannot fail to realize at the present stage of our work the e”

**Source / citation lines carrying a number** (1)

- `13.3`: `bl83` (content) “From this apparent divorce between Bahá’í and humanitarian activities ”; `bl49` (source) “Shoghi Effendi, from a letter 25 October 1929 to the Bahá’ís of the Un”

### Sahih Muslim (Book 26-32) (`sahih_muslim_books26to32_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1.4.3`: `bl3b` (content) “Ibn ‘Umar reported Allah’s Messenger (may peace be upon him) as saying”; `bl3d` (content) “This Hadith has been narrated on the authority of Ibn ‘Umar through an”

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (header) “Book 26: On Salutations and Greetings”; `bl2u` (header) “Chapter 1: The Rider Should First Greet the Pedestrian and the Small N”

### Buddhacarita (`life_of_buddha_ocean_buddhism_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1:18`: `3f` (content) “‘This people, being hard to be roused to wonder in their souls, cannot”; `3g` (content) “Then falling from the host of beings in the Tushita heaven and illumin”

**Header numbers colliding with another block** (1)

- `1`: `2x` (header) “Book I.”; `5l` (header) “Book II.”; `78` (header) “Book III.”; `93` (header) “Book IV.”; `c1` (header) “Book V.”; `ej` (header) “Book VI.”; `gi` (header) “Book VII.”; `i7` (header) “Book VIII.”; `kp` (header) “Book IX.”; `mt` (header) “Book X.”; `o1` (header) “Book XI.”; `q5` (header) “Book XII.”; `ti` (header) “Book XIII.”; `vl` (header) “Book XIV.”; `y6` (header) “Book XV.”; `11n` (header) “Book XVI.”; `15g` (header) “Book XVII.”

### Sahih Muslim (Book  1) (`sahih_al_muslim_vol_1_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `6.2`: `bl3y` (content) “A person said (to ‘Abdullah b. Umar the narrator): Which of the two pr”; `bl40` (content) “It is narrated on the authority of (‘Abdullah) son of ‘Umar, that the ”

### Sahih Muslim (Book 19-25) (`sahihmuslim_books19to25_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1.25.2`: `bl19b` (content) “When he hid finished the reading of the letter, noise and confused cla”; `bl7x` (content) “This Hadith has been narrated on the authority of Ibn Shihab with the ”

### Poems from the Divan of Hafiz (`divan_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl2w` (header) “[1897]”; `bl2y` (header) “To Hafiz of Shiraz”; `bl2z` (content) “Thus said the Poet: “When Death comes to you, All ye whose life-sand t”; `bl30` (content) “Songs of a cup once flushed rose-red with wine, Songs of a rose whose ”; `bl31` (content) “While thou wert singing, the soft summer wind That o’er Mosalla’s gard”; `bl32` (content) “Behold we laugh, we warm us at Love’s fire, We thirst and scarce dare ”; `bl54` (header) “The Poems”; `bl55` (header) “I”

### Ibn Sina, Abu 'Ali al-Husayn (980-1037) (`miscellaneous_islam_ocean_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1`: `bl46` (struct) “Ibn Sina, Abu 'Ali al-Husayn (980-1037)”; `bl2v` (content) “In metaphysics, Ibn Sina makes a distinction between essence and exist”; `bl2w` (content) “Reference has sometimes been made to Ibn Sina’s supposed mysticism, bu”; `bl36` (header) “Biography”

### The Sutta Nipata (`suttanipata_en`)

**Content-paragraph collisions (two or more content paragraphs share one number)** (1)

- `1041`: `15m` (content) “‘The Bhikkhu who abstains from sensual pleasures, O Metteyya,’—so said”; `15v` (content) “‘Having considered everything in the world, O Puṇṇaka,’—so said Bhagav”

### Tablets of ‘Abdu’l-Bahá ‘Abbás vol. 1-3 (`tablets_of_abdu_l_baha_abbas_v1_3_bahai_ocean_en`)

**Opening invocations carrying a number** (2)

- `i.14`: `bl3a` “HE IS GOD!”
- `i.30`: `bl3r` “HE IS GOD!”

**Header numbers colliding with another block** (749)

- `1`: `bl2u` (content) ““In reality thou art spiritually hungry and athirst for the Water of L”; `bl2v` (signature) “‘Abdu’l-Bahá ‘Abbás.”; `bl2w` (header) “Introduction”; `bl3x` (header) “— 1 —”
- `2`: `bl49` (header) “— 2 —”; `bl4a` (content) “O ye who are sincere! O ye who are attracted! O ye who are yearning! O”
- `3`: `bl4j` (header) “— 3 —”; `bl4k` (content) “O ye who are firm in the Covenant!”
- `4`: `bl4o` (header) “— 4 —”; `bl4p` (content) “O my God! O my God!”
- `7`: `bl58` (header) “— 7 —”; `bl59` (content) “O ye servants of the Threshold of God!”
- … 744 more in the TSV

**Source / citation lines carrying a number** (1)

- `695.3`: `bl35j` (source) “(Question: “Master, who art thou? Art thou the Christ?”)”; `bl35k` (content) “As to what thou asked concerning me: Verily, I say unto thee, that I a”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `i.4`: `bl2z` (lead-in) “March 21, 1908 To the Friends of God in the Light of Abhá, throughout ”; `bl30` (content) “Greeting: — For a number of years the House of Spirituality has been g”
- `695.5`: `bl35m` (lead-in) “Question: “When is the time of the millenium? Will I see it?”; `bl35n` (content) “Concerning the one thousand years as recorded in the Book: It signifie”
- `695.6`: `bl35o` (lead-in) “Question: “At the time of thy departure will there not be some great s”; `bl35p` (content) “As to the question of “after my departure” to the neighborhood of the ”
- `695.7`: `bl35q` (lead-in) “Question: “What did the vision of a paper signify in my dream?””; `bl35r` (content) “Concerning the appearance of a paper in thy dream, before thine eyes, ”

### The Qur'an (Rodwell) (`quran_ocean_islam_en`)

**Opening invocations carrying a number** (116)

- `2.2`: `bl59s` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM.”
- `3.2`: `blbc` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM. God! there is no god but He, the”
- `4.2`: `blh0` “In the Name of God, the Compassionate, the Merciful”
- `5.2`: `bllz` “In the Name of God, the Compassionate, the Merciful”
- `6.2`: `bloc` “In the Name of God, the Compassionate, the Merciful”
- `7.2`: `blt1` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM. SAD.1”
- `8.2`: `blyu` “In the Name of God, the Compassionate, the Merciful”
- `10.2`: `bl14r` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. RA.1 These are the signs of the wise ”
- `11.2`: `bl17w` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. RA.”
- `12.2`: `bl1bf` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. RA.”
- `13.2`: `bl1em` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM. RA.”
- `14.2`: `bl1fx` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. RA.”
- `15.26`: `bl1kc` “In the Name of God, the Compassionate, the Merciful”
- `15.82`: `bl1o0` “In the Name of God, the Compassionate, the Merciful”
- `18.2`: `bl1r7` “In the Name of God, the Compassionate, the Merciful”
- `18.42`: `bl1ud` “In the Name of God, the Compassionate, the Merciful KAF. HA. YA. AIN. SAD.”
- `18.73`: `bl1x7` “In the Name of God, the Compassionate, the Merciful TA. HA.”
- `18.108`: `bl212` “In the Name of God, the Compassionate, the Merciful”
- `18.141`: `bl24a` “In the Name of God, the Compassionate, the Merciful”
- `18.179`: `bl26k` “In the Name of God, the Compassionate, the Merciful”
- `18.209`: `bl29y` “In the Name of God, the Compassionate, the Merciful”
- `18.250`: `bl2bu` “In the Name of God, the Compassionate, the Merciful”
- `18.283`: `bl2e3` “In the Name of God, the Compassionate, the Merciful”
- `18.337`: `bl2kj` “In the Name of God, the Compassionate, the Merciful”
- `18.377`: `bl2na` “In the Name of God, the Compassionate, the Merciful”
- `18.422`: `bl2pu` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM.”
- `18.450`: `bl2rv` “In the Name of God, the Compassionate, the Merciful ELIF. LAM. MIM.”
- `31.2`: `bl2tn` “In the Name of God, the Compassionate, the Merciful”
- `32.2`: `bl2up` “In the Name of God, the Compassionate, the Merciful.”
- `33.2`: `bl2vn` “In the Name of God, the Compassionate, the Merciful”
- `34.2`: `bl2xs` “In the Name of God, the Compassionate, the Merciful”
- `35.2`: `bl2ze` “In the Name of God, the Compassionate, the Merciful”
- `36.2`: `bl30r` “In the Name of God, the Compassionate, the Merciful”
- `37.2`: `bl336` “In the Name of God, the Compassionate, the Merciful”
- `38.2`: `bl38c` “In the Name of God, the Compassionate, the Merciful”
- `39.2`: `bl3ax` “In the Name of God, the Compassionate, the Merciful”
- `40.2`: `bl3d4` “In the Name of God, the Compassionate, the Merciful”
- `40.69`: `bl3ez` “He is the Living One. No God is there but He. Call then upon Him and offer Him a pure worship. Prais”
- `41.2`: `bl3fl` “In the Name of God, the Compassionate, the Merciful”
- `42.2`: `bl3h7` “In the Name of God, the Compassionate, the Merciful”
- `43.2`: `bl3is` “In the Name of God, the Compassionate, the Merciful”
- `44.2`: `bl3ld` “In the Name of God, the Compassionate, the Merciful”
- `45.2`: `bl3n4` “In the Name of God, the Compassionate, the Merciful”
- `46.2`: `bl3o8` “In the Name of God, the Compassionate, the Merciful”
- `47.2`: `bl3pb` “In the Name of God, the Compassionate, the Merciful”
- `48.2`: `bl3qj` “In the Name of God, the Compassionate, the Merciful”
- `49.2`: `bl3rg` “In the Name of God, the Compassionate, the Merciful”
- `50.2`: `bl3s2` “In the Name of God, the Compassionate, the Merciful.”
- `51.2`: `bl3tf` “In the Name of God, the Compassionate, the Merciful”
- `52.2`: `bl3v7` “In the Name of God, the Compassionate, the Merciful”
- `53.2`: `bl3wo` “In the Name of God, the Compassionate, the Merciful”
- `54.2`: `bl3yl` “In the Name of God, the Compassionate, the Merciful”
- `55.2`: `bl408` “In the Name of God, the Compassionate, the Merciful”
- `55.18`: `bl40o` “He is the Lord of the East,”
- `55.19`: `bl40p` “He is the Lord of the West:”
- `56.2`: `bl42i` “In the name of God, the Compassionate, the Merciful”
- `57.2`: `bl45a` “In the Name of God, the Compassionate, the Merciful”
- `57.5`: `bl45d` “He is the first and the last; the Seen and the Hidden; and He knoweth all things!”
- `58.2`: `bl467` “In the Name of God, the Compassionate, the Merciful”
- `59.2`: `bl46x` “In the Name of God, the Compassionate, the Merciful”
- … 56 more in the TSV

**Header numbers colliding with another block** (4)

- `4`: `blba` (header) “SURA III. — THE FAMILY OF IMRAN [XCVII.]”; `blgy` (header) “SURA IV. — WOMEN [C.]”; `bl1ek` (header) “SURA XIII. — THUNDER [XC.]”; `bl1fv` (header) “SURA XIV. — ABRAHAM, ON WHOM BE PEACE [LXXVI.]”
- `5`: `bllx` (header) “SURA V. — THE TABLE [CXIV.]”; `bl1ka` (header) “SURA XVI. — THE BEE [LXXIII.]”; `bl1ny` (header) “SURA XVII. — THE NIGHT JOURNEY [LXVII.]”; `bl1r5` (header) “SURA XVIII. — THE CAVE [LXIX.]”; `bl1ub` (header) “SURA XIX. — MARY [LVIII.]”; `bl1x5` (header) “SURA XX.— TA. HA. [LV.]”; `bl210` (header) “SURA XXI. — THE PROPHETS [LXV.]”; `bl248` (header) “SURA XXII. — THE PILGRIMAGE [CVII.]”; `bl26i` (header) “SURA XXIII. — THE BELIEVERS [LXIV.]”
- `11`: `bl17u` (header) “SURA XI. — HOUD [LXXV.]”; `bl1bd` (header) “SURA XII. — JOSEPH, PEACE BE ON HIM [LXXVII.]”; `bl1hf` (header) “SURA XV. — HEDJR [LVII.]”
- `67`: `bl4ay` (header) “SURA LXVII. — THE KINGDOM [LXIII.]”; `bl4bw` (header) “SURA LXVIII. — THE PEN [XVII.]”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.1`: `bl2t` (lead-in) “MECCA.”; `bl2u` (content) “In the Name of God, the Compassionate, the Merciful PRAISE be to God, ”

### The Qur’ân (Palmer) (`quran_by_palmer_islam_ocean_en`)

**Opening invocations carrying a number** (114)

- `1.1`: `bl2v` “IN the name of the merciful and compassionate God.”
- `2.1`: `bl2z` “IN the name of the merciful and compassionate God.”
- `3.1`: `bl8m` “IN the name of the merciful and compassionate God.”
- `4.1`: `blbo` “IN the name of the merciful and compassionate God.”
- `5.1`: `blfh` “IN the name of the merciful and compassionate God.”
- `6.1`: `bli4` “IN the name of the merciful and compassionate God!”
- `6.4`: `bli7` “He is God in the heavens and the earth. He knows your secret conduct and your plain, and He knows wh”
- `7.1`: `bllr` “IN the name of the merciful and compassionate God.”
- `8.1`: `blod` “IN the name of the merciful and compassionate God.”
- `10.1`: `blsq` “IN the name of the merciful and compassionate God.”
- `12.1`: `blx0` “IN the name of the merciful and compassionate God.”
- `13.1`: `blzq` “IN the name of the merciful and compassionate God.”
- `14.1`: `bl10x` “IN the name of the merciful and compassionate God.”
- `15.1`: `bl11y` “IN the name of the merciful and compassionate God!”
- `16.1`: `bl13d` “IN the name of the merciful and compassionate God.”
- `17.1`: `bl16k` “IN the name of the merciful and compassionate God.”
- `18.1`: `bl198` “IN the name of the merciful and compassionate God.”
- `19.1`: `bl1b1` “IN the name of the merciful and compassionate God.”
- `20.1`: `bl1cg` “IN the name of the merciful and compassionate God.”
- `21.1`: `bl1ep` “IN the name of the merciful and compassionate God.”
- `22.1`: `bl1go` “IN the name of the merciful and compassionate God.”
- `23.1`: `bl1ig` “IN the name of the merciful and compassionate God.”
- `24.1`: `bl1k8` “IN the name of the merciful and compassionate God.”
- `25.1`: `bl1lk` “IN the name of the merciful and compassionate God.”
- `26.1`: `bl1mx` “IN the name of the merciful and compassionate God.”
- `27.1`: `bl1oh` “IN the name of the merciful and compassionate God.”
- `28.1`: `bl1pn` “IN the name of the merciful and compassionate God.”
- `28.49`: `bl1qz` “He is God, there is no god but He; to Him belongs praise, in the first and the last; and His is the ”
- `29.1`: `bl1rc` “IN the name of the merciful and compassionate God.”
- `30.1`: `bl1sr` “IN the name of the merciful and compassionate God.”
- `31.1`: `bl1u2` “IN the name of the merciful and compassionate God.”
- `32.1`: `bl1uv` “IN the name of the merciful and compassionate God.”
- `33.1`: `bl1vh` “IN the name of the merciful and compassionate God.”
- `34.1`: `bl1x9` “IN the name of the merciful and compassionate God.”
- `35.1`: `bl1ye` “IN the name of the merciful and compassionate God.”
- `36.1`: `bl1zc` “IN the name of the merciful and compassionate God.”
- `37.1`: `bl20a` “IN the name of the merciful and compassionate God.”
- `38.1`: `bl21b` “IN the name of the merciful and compassionate God.”
- `39.1`: `bl22c` “IN the name of the merciful and compassionate God.”
- `40.1`: `bl23q` “IN the name of the merciful and compassionate God.”
- `41.1`: `bl259` “IN the name of the merciful and compassionate God.”
- `42.1`: `bl266` “IN the name of the merciful and compassionate God.”
- `43.1`: `bl278` “IN the name of the merciful and compassionate God.”
- `44.1`: `bl28k` “IN the name of the merciful and compassionate God.”
- `45.1`: `bl293` “IN the name of the merciful and compassionate God.”
- `46.1`: `bl29s` “IN the name of the merciful and compassionate God.”
- `47.1`: `bl2am` “IN the name of the merciful and compassionate God.”
- `48.1`: `bl2bm` “IN the name of the merciful and compassionate God.”
- `49.1`: `bl2cc` “IN the name of the merciful and compassionate God.”
- `50.1`: `bl2cw` “IN the name of the merciful and compassionate God.”
- `51.1`: `bl2dw` “IN the name of the merciful and compassionate God.”
- `52.1`: `bl2f2` “IN the name of the merciful and compassionate God.”
- `53.1`: `bl2fy` “IN the name of the merciful and compassionate God.”
- `54.1`: `bl2gj` “IN the name of the merciful and compassionate God.”
- `55.1`: `bl2hq` “IN the name of the merciful and compassionate God.”
- `56.1`: `bl2jk` “IN the name of the merciful and compassionate God.”
- `57.1`: `bl2l0` “IN the name of the merciful and compassionate God.”
- `57.4`: `bl2l3` “He is the first and the last; and the outer and the inner; and He all things doth know!”
- `59.1`: `bl2mh` “IN the name of the merciful and compassionate God.”
- `60.1`: `bl2n4` “IN the name of the merciful and compassionate God.”
- … 54 more in the TSV

### مكاتيب عبدالبهاء الجزء الثالث (`makatib_abd_3_fa`)

**Opening invocations carrying a number** (86)

- `23.2`: `bl8h` “هو اللّه”
- `24.2`: `bl8m` “هو اللّه”
- `25.2`: `bl8r` “هو اللّه”
- `31.2`: `bl9k` “هو اللّه”
- `32.2`: `bl9o` “هو اللّه”
- `33.2`: `bl9r` “هو اللّه”
- `52.1`: `bld8` “هو اللّه”
- `57.1`: `ble1` “هو الابهی”
- `61.1`: `blem` “هو اللّه”
- `62.1`: `blex` “هو اللّه”
- `69.1`: `blfo` “هو اللّه”
- `71.1`: `blfw` “هو اللّه”
- `72.1`: `blfz` “هو اللّه”
- `73.1`: `blg3` “هو اللّه”
- `74.1`: `blg7` “هو اللّه”
- `75.1`: `blga` “هو اللّه”
- `76.1`: `blgd` “هو اللّه”
- `77.1`: `blgh` “هو اللّه”
- `78.1`: `blgl` “هو اللّه”
- `79.1`: `blgq` “هو اللّه”
- `81.1`: `blgx` “هو اللّه”
- `84.1`: `blh7` “هو اللّه”
- `89.1`: `blhv` “هو اللّه”
- `90.1`: `bli0` “هو اللّه”
- `92.1`: `bli5` “هو اللّه”
- `93.1`: `bli8` “هو اللّه”
- `94.2`: `blic` “هو اللّه”
- `96.2`: `blij` “هو اللّه”
- `100.1`: `blj1` “هو اللّه”
- `102.2`: `blj9` “هو اللّه”
- `104.2`: `blji` “هو اللّه”
- `108.2`: `blk1` “هو اللّه”
- `111.2`: `blkp` “هو اللّه”
- `114.2`: `bll5` “هو اللّه”
- `115.2`: `bll9` “هو اللّه”
- `124.2`: `blmg` “هو اللّه”
- `125.2`: `blml` “هو اللّه”
- `128.1`: `bln8` “هو اللّه”
- `129.2`: `blng` “هو اللّه”
- `131.2`: `blnn` “هو اللّه”
- `132.2`: `blnr` “هو اللّه”
- `135.1`: `bloe` “هو اللّه”
- `136.2`: `bloi` “هو اللّه”
- `137.1`: `blom` “هو اللّه”
- `139.2`: `bloy` “هو اللّه”
- `140.1`: `blp1` “هو اللّه”
- `144.1`: `blpu` “هو اللّه”
- `146.4`: `bl1nt` “البحر بحر علی ما کان فی القدم انّ الحوادث امواج و اشباح و ما الخلق فی التمثال الّا کثلجة و أنت هو ال”
- `156.1`: `bls3` “هو اللّه”
- `161.1`: `blt3` “هو اللّه”
- `162.1`: `blt7` “هو اللّه”
- `163.1`: `bltb` “هو اللّه”
- `166.1`: `bltn` “هو اللّه”
- `167.1`: `bltt` “هو اللّه”
- `168.1`: `blty` “هو اللّه”
- `169.1`: `blu2` “هو اللّه”
- `173.1`: `blw3` “هو اللّه”
- `177.2`: `blwm` “هو اللّه”
- `178.2`: `blwr` “هو اللّه”
- `178.4`: `bl1j9` “فهذا الّذی دعانی الی تحرير هذا المرسوم و اظهار ما هو مضمر فی الضمائر و القلوب.”
- … 26 more in the TSV

**Header numbers colliding with another block** (5)

- `1`: `bl2v` (header) “دوره اوّل الواح عمومی عالم”; `bl2w` (header) “لوح اوّل”
- `2`: `bl34` (header) “لوح دوّم”; `bl59` (header) “دوره دوم الواح عمومی امريکای شمالی و جنوبی”
- `7`: `bl46` (header) “لوح هفتم”; `bl77` (header) “دوره دوم الواح عمومی امريکای شمالی و جنوبی”
- `175`: `blw7` (header) “احبّای بغداد عليهم بهاء الله الابهی”; `blwb` (header) “جناب زائر آقا ميرزا الياس ميثاقيّه عليه بهاء اللّه الابهی”
- `177`: `blwg` (header) “بواسطه جناب حکيمباشی جناب ميرزا الياس کاشانی عليه بهاء اللّه الابهی”; `bl1j5` (header) “طهران بواسطه جناب امين”

### Bihar al-Anwaar Volume 8 (`bihar_al_anwaar_volume_8_islam_ocean_en`)

**Opening invocations carrying a number** (62)

- `1.1.11`: `bl3g` “مكتوب عليها ثالثة أسطر، االول: بسم اهلل الرمحن الرحيم. واآلخر: احلمدهلل رب العاملني. والثالث: الإله ”
- `1.1.75`: `bl6o` “قال: نعم النك صاحب لوائي يف اآلخرة، كما أنك صاحب لوائي يف الدنيا، وصاحب اللواء هو املتقدم.”
- `1.1.77`: `bl6q` “مث قال عليه السالم: يا علي كأين بك وقد دخلت اجلنة وبيدك لوائي وهو لواء احلمد حتته آدم فمن دونه.”
- `1.1.84`: `bl74` “فتبسم رسول اهلل صلى اهلل عليه وآله ضاحكا فقال: يا أعرايب ومل كثر االختالف فيه ؟ علي مين كرأسي من بدي”
- `2.1.7`: `bl84` “ومن كان يف هذه أعمى فهو يف اآلخرة أعمى وأضل سبيال 71 - 72.”
- `2.1.51`: `blal` “فلما خرجنا من عنده فقال لنا سليمان: هو واهلل اجلاهلية اجلهالء، ولكن ملا رأكم مددمت أعناقكم وفتحتم أع”
- `2.1.59`: `blb1` “أال فمن توالهم فهو مين ومعي وسيلقاين، أال ومن ظلمهم وأعان على ظلمهم وكذهبم فليس مين وال معي وأنامنه ”
- `2.1.87`: `blcr` “مث يرد علي املخدج برايته وهو إمام سبعني ألفا من اميت، فإذا أخذت بيده اسود وجهه، ورجفت قدماه، وخفقت أ”
- `3.1.43`: `blf8` “حوضنا مرتع، فيه مثعبان )مثقبان خ ل( ينصبان من اجلنة، أحدمها من تسنيم واآلخر من معني، على حافيته الزع”
- `3.1.117`: `bljl` “قال: فضربت بيدي إىل بالطه فشممته فإذا هو مسك، وإذا أنا بالقصور لبنة ذهب ولبنة فضة.”
- `4.1.27`: `bllx` “يوم ال يغين موىل عن موىل شيئا والهم ينصرون إال من رحم اهلل إنه هو العزيز الرحيم 40 - 42 .”
- `4.1.110`: `blpy` “مث قال: ما أحد من االولني واآلخرين إال وهو حمتاج إىل شفاعة حممد صلى اهلل عليه وآله يوم القيامة”
- `4.1.236`: `blvl` “قال: مث يؤتى بناقة من ياقوت أمحر وزمامها زبرجد أخضر حىت أركبها، مث آيت املقام احملمود حىت أقضي عليه ”
- `4.1.244`: `blvw` “قال: فيقوم الشيطان الذي أضل فرقة من الناس حىت زعموا أن عيسى هو اهلل وابن اهلل فيتبعونه إىل النار،”
- `4.1.382`: `bl12l` “واليت ال حيضرها من شيعة حممد أحد إال أضاءت فيها أنواره فسار فيها إىل جنات النعيم هو وإخوانه وأزواجه ”
- `4.1.384`: `bl12n` “وال حيضرها من أعداء حممد أحد إال غشيته ظلماهتا فتسري فيها إىل العذاب االليم هو وشركاؤه يف عقده ودينه”
- `4.1.458`: `bl16e` “فإنه إذا كان يوم القيامة مل يبق ملك مقرب وال نيب مرسل وال مؤمن ممتحن إال وهو حيتاج إليهما يف ذلك الي”
- `4.1.468`: `bl16v` “مث يأيت هو ومن معه عدد كثري وجم غفري و إن كانوا أقل عددا من خصمائه الذين هلم قبله الظالمات”
- `5.1.13`: `bl194` “فيكلفون املمر عليها فتحبسهم الرحم واالمانة، فإن جنوا منها حبستهم الصالة، فإن جنوا منها كان املنتهى إ”
- `5.1.77`: `bl1cb` “وأما الصراط يف اآلخرة فهو طريق املؤمنني إىل اجلنة الذي هو مستقيم، ال يعدلون عن اجلنة إىل النار وال إ”
- `6.1.7`: `bl1ct` “بلى من أسلم وجهه هلل وهو حمسن فله أجره عند ربه والخوف عليهم وال هم حيزنون 111 - 112.”
- `6.1.25`: `bl1de` “” وقال تعاىل ”: ومن يعمل من الصاحلات من ذكر أو انثى وهو مؤمن فاولئك يدخلون اجلنة وال يظلمون نقريا 12”
- `6.1.41`: `bl1dv` “وقال تعاىل ”: وعد اهلل املؤمنني واملؤمنات جنات جتري من حتتها االهنار خالدين فيها ومساكن طيبة يف جنات”
- `6.1.127`: `bl1g9` “خالدين فيها وعد اهلل حقا وهو العزيز احلكيم 8 - 9”
- `6.1.183`: `bl1hx` “وقهم السيئات ومن تق السيئات يومئذ فقد رمحته وذلك هو الفوز العظيم 8 - 9”
- `6.1.185`: `bl1hz` “” وقال تعاىل “: ومن عمل صاحلا من ذكر أو انثى وهو مؤمن فاولئك يدخلون اجلنة يرزقون فيها بغري حساب 40.”
- `6.1.209`: `bl1ip` “فضال من ربك ذلك هو الفوز العظيم 51 - 57.”
- `6.1.257`: `bl1k6` “إنا كنا من قبل ندعوه إنه هو الرب الرحيم 17 - 28.”
- `6.1.516`: `bl1te` “وقال علي بن إبراهيم يف قوله: ” سالم قوال من رب رحيم ” قال: السالم منه هو االمان.”
- `6.1.556`: `bl1v4` “وهو يوم اجلمعة، إن ليلها ليلة غراء ويومها يوم أزهر، فأكثروا فيها من التسبيح والتكبري والتهليل والثنا”
- `6.1.1077`: `bl2fh` “ومن كان منهم كاذبا جاءته مسوم النار ومحيمها وظلها الذي هو ثالث شعب ال ظليل وال يغين من اللهب فتحمله ”
- `6.1.1087`: `bl2fr` “مث قال: فوالذي بعثين باحلق نبيا إن من تعاطى بابا من اخلري يف هذا اليوم فقد تعلق بغصن من أغصان شجرة ط”
- `6.1.1125`: `bl2gv` “ومن شدد على معسر وهو يعلم إعساره فزاد غيظا وبالء فقد تعلق بغصن منه،”
- `6.1.1145`: `bl2hg` “ومن كان قبل ذلك عاقا هلما فلم يرضهما يف هذا اليوم وهو يقدر على ذلك فقد تعلق بغصن منه،”
- `6.1.1159`: `bl2hv` “مث اعاد رسول اهلل صلى اهلل عليه وآله بصره إىل السماء ينظر إليها مليا وهو يضحك ويستبشر، وإىل االرض ين”
- `6.1.1163`: `bl2i0` “قالوا: وما هو يا رسول اهلل فداك اآلباء واالمهات والبنون والبنات واالهلون والقرابات ؟”
- `6.1307`: `bl2k6` “فيأتيانك وأوداج احلسني تشخب دما وهو يقول: يا رب خذ يل اليوم حقي ممن ظلمين، فيغضب عند ذلك اجلليل ويغض”
- `6.1700`: `bl30a` “وإذا هو إسرتاح أقبلوا عليه يسائلونه ويقولون: ما فعل فالن وفالن ؟ فإن كان قد مات بكوا واسرتجعوا ويقول”
- `6.1764`: `bl32f` “مث تستقبله املالئكة فتقول: طبت فادخلها مع اخلالدين، فيدخل فإذا هو بسماطني من شجر أغصاهنا اللؤلؤ، وفر”
- `6.1886`: `bl377` “فيقول: عبادي ! أعطيتكم اجوركم ومل ألتكم من أعمالكم شيئا، وسألين هؤالء فأعطيتهم وهو فضلي أوتيه من أشا”
- `7.1.37`: `bl38e` “وقال تعاىل “ :ومن يرتدد منكم عن دينه فيمت وهو كافر فاولئك حبطت أعماهلم يف الدنيا واآلخرة و اولئك أصح”
- `7.1.181`: `bl3cf` “يتجرعه وال يكاد يسيغه ويأتيه املوت من كل مكان وما هو مبيت ومن ورائه عذاب غليظ 15 - 17“”
- `7.1.491`: `bl3l7` “وقال سبحانه ”: كمن هو خالد يف النار وسقوا ماء محيما فقطع أمعائهم 15.”
- `7.1.781`: `bl3tg` “فهذه حاهلم، وهو قول اهلل عزوجل: “ كلما أرادوا أن خيرجوا منها من غم اعيدوا فيها وذوقوا عذاب احلريق ” ”
- `7.1.893`: `bl3xx` “مث قال: وإهنم ليبكون حىت تسيل دموعهم على وجوههم جداول، مث ينقطع الدموع فيسيل الدماء حىت لو أن السفن ”
- `7.1.917`: `bl3yr` “ومعىن حول جهنم البحر احمليط بالدنيا يتحول نريانا، وهو قوله: ” وإذا البحار سجرت ” مث حيضرهم اهلل حول ”
- `7.1.970`: `bl40s` “فيكلفون املمر عليها فتحبسهم الرحم واالمانة، فإن جنوا منها حبستهم الصالة، فإن جنوا منها كان املنتهى إ”
- `7.1.1002`: `bl425` “قال: ويف ذلك اجلب صندوق من نار يتعوذ أهل تلك اجلب من حر ذلك الصندوق وهو التابوت، ويف ذلك التابوت ستة”
- `7.1.1006`: `bl429` “وأما الستة من اآلخرين فهو االول والثاين والثالث والرابع وصاحب اخلوارج وابن ملجم ” ومن شرغاسق إذا وقب”
- `7.1.1026`: `bl434` “فاملؤمنون يعرفون اولئك الكافرين بأمسائهم وصفاهتم، وهم على أصناف: منهم من هو بني أنياب أفاعيها متضغه،”
- `7.1.1028`: `bl436` “ومنهم من هو بني خماليب سباعها تعبث به وتفرتسه،”
- `7.1.1030`: `bl438` “ومنهم من هو حتت سياط زبانيتها وأعمدهتا ومرزباهتا يقع من أيديهم عليه تشدد يف عذابه وتعظم خزيه ونكاله،”
- `7.1.1032`: `bl43a` “ومنهم من هو يف حبار محيمها يغرق ويسحب فيها،”
- `7.1.1034`: `bl43c` “ومنهم من هو يف غسلينها وغساقها تزجره زبانيتها،”
- `8.1.83`: `bl4jn` “فإذا نظر أولياؤهم يف كتاهبم يقولون الخواهنم: “ هاؤم اقرؤا كتابيه إين ظننت أين مالق حسابيه فهو يف عيش”
- `9.1.27`: `bl4ku` “قال: ويشهق أهل النار شهقة لو كان أحد ميوت من شهيق ملاتوا، وهو قول اهلل عزوجل: ” وأنذرهم يوم احلسرة إ”
- `9.1.37`: `bl4le` “وهو قوله: ” وأنذرهم يوم احلسرة إذ قضي االمر وهم يف غفلة “ أي قضي على أهل اجلنة باخللود فيها، وقضي عل”
- `10.1.37`: `bl4o8` “ومنهم من يكون ذنوبه أقل وأخف فيطهر منها بالشدائد والنوائب من السالطني وغريهم، ومن اآلفات يف االبدان ”
- `10.1.49`: `bl4ol` “قال يف سورة الرمحن وهو قوله تعاىل: ” فيومئذ ال يسئل عن ذنبه منكم إنس وال جان“”
- `10.1.67`: `bl4pf` “فقال: مالك تسرتجع ؟ فقلت: ملا أمسع منك، فقال: ليس حيث تذهب إمنا أعىن اجلحود، إمنا هو اجلحود.”
- … 2 more in the TSV

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (struct) “Bihar al-Anwaar”; `bl30` (header) “(باب 18) (اللواء)”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `7.1.416`: `bl4w9` (lead-in) “and the extravagant, they are the inmates of the Fire [40:43]”; `bl3j1` (lead-in) “وقال ”: وحاق بآل فرعون سوء العذاب”; `bl3j2` (content) “And Said: and there befell with the people of Pharaoh, the most evil o”

### Bihar al-Anwaar Volume 6 (`bihar_al_anwaar_volume_6_islam_ocean_en`)

**Opening invocations carrying a number** (58)

- `19.119`: `bl7p` “فإذا كان الظن هو املردي كان ضد هو املنجي.”
- `19.125`: `bl80` “يا داود امسع مين ما أقول — واحلق أقول — من أتاين وهو مستحي من املعاصي اليت عصاين هبا غفرهتا له وأنسي”
- `20.3`: `blad` “وقال تعاىل ": وإذ قال موسى لقومه يا قوم إنكم ظلمتم أنفسكم باختاذكم العجل فتوبوا إىل بارئكم فاقتلوا أ”
- `20.53`: `blby` “وقال جل شأنه ": أمل يعلموا أن اهلل هو يقبل التو بة عن عباده ويأخذ الصدقات وإن اهلل هو التواب الرحيم ”
- `20.61`: `blc6` “وقال سبحانه " مث تاب عليهم ليتوبوا إن اهلل هو التواب الرحيم 118 .”
- `20.241`: `blk8` “فلم يزل يقول حنو هذا وهو يبكي وحيثو الرتاب على رأسه وقد أحاطت به السباع ! وصفت فوقه الطري ! وهم يبكو”
- `20.263`: `bll9` “قال كميل: فأصل االستغفار ما هو ؟ قال: الرجوع إىل التوبة من الذنب الذي استغفرت منه، وهي أول درجة العا”
- `20.293`: `blmv` “وأما الذنب الثالث فذنب سرته اهلل على عبده و رزقه التوبة فأصبح خاشعا من ذنبه، راجيا لربه فنحن له كما ”
- `20.351`: `blpx` “فقال الرجل: واهلل ما هو شئ آتيه برجلي إمنا هو مساع أمسعه باذين ! فقال له " أنت أما مسعت اهلل: " إن ا”
- `20.365`: `blqt` “فهذا أثر التوبة، وإذا رأيتم العبد على هذه الصورة فهو تائب ناصح لنفسه.”
- `20.399`: `blsj` “وال خري يف الدنيا إال لرجلني: رجل أذنب ذنوبا فهو يتداركها بالتوبة، ورجل يسارع يف اخلريات. وال يقل عم”
- `20.409`: `blt4` “’أستغفر اهلل الذي ال إله إال هو احلي القيوم‘”
- `20.429`: `blu7` “وقهم السيئات ومن تق السيئات يومئذ فقد رمحته وذلك هو الفوز العظيم "”
- `21.53`: `blyo` “قال العامل عليه السالم: أما استهزاء اهلل هبم يف الدنيا فهو إجراؤه إياهم على ظاهر أحكام املسلمني الظه”
- `22.33`: `bl10l` “فقال له الفقري " أكفرت بالذي خلقك من تراب مث من نطفة مث سواك رجال لكنا هو اهلل ريب ال اشرك بريب أحدا”
- `23.99`: `bl16j` “فإن قال: فلم امروا بالغسل من اجلنابة ومل يؤمروا بالغسل من اخلالء وهو أجنس من اجلنابة وأقذر ؟”
- `23.101`: `bl16l` “قيل: من أجل أن اجلنابة من نفس االنسان وهو شئ خيرج من مجيع جسده، واخلالء ليس هو من نفس االنسان إمنا ه”
- `23.109`: `bl16u` “قال مصنف هذا الكتاب: غلط الفضل وذلك الن االستنجاء به ليس بفرض، و إمنا هو سنة. رجعنا إىل كالم الفضل ا”
- `23.131`: `bl17n` “فإذا أقر هلل بالوحدانية وأقر للرسول بالرسالة فقد أقر جبملة االميان، الن أصل االميان إمنا هو االقرار ”
- `23.143`: `bl182` “قيل: الن التهليل هو إقرار هلل تعاىل بالتوحيد وخلع االنداد من دون اهلل، وهو أول االميان وأعظم التسبيح”
- `23.161`: `bl18o` “" رب العاملني " متجيد له وحتميد وإقرار بأنه هو اخلالق املالك ال غريه”
- `23.213`: `bl1ai` “قيل: النه ملا كان يف الدخول يف الصالة حترمي الكالم للمخلوقني و التوجه إىل اخلالق كان حتليلها كالم ام”
- `23.271`: `bl1cr` “ومنها أن االمام حيبسهم للخطبة وهم منتظرون للصالة، ومن انتظر الصالة فهو يف صالة يف حكم التمام.”
- `23.289`: `bl1dd` “وأما العيدين فإمنا هو يف السنة مرتني (5) وهو أعظم من اجلمعة والزحام فيه أكثر، والناس فيه أرغب، فإن ت”
- `23.315`: `bl1eb` “قيل: الن مثانية فراسخ هي مسري اجلمال والقوافل وهو السري الذي يسريه اجلمالون واملكارون.”
- `23.361`: `bl1fy` “قيل: الن هذه االشياء كلها ملبسة ريشا وصوفا وشعرا ووبرا وهذا كله ذكي وال ميوت، وإمنا مياس منه الشئ ال”
- `23.387`: `bl1gw` “قيل: النه صلى لعلة تغري أمر من االمور وهو الكسوف، فلما تغريت العلة تغري املعلول.”
- `23.397`: `bl1ha` “قيل: الن التكبري إمنا هو تعظيم هلل ومتجيد على ما هدى وعافا، كما قال اهلل عزوجل: " ولتكملوا العدة ولت”
- `23.427`: `bl1ih` “ومنها أن الصالة فيها عناء وتعب واشتغال االركان، وليس يف الصوم شئ من ذلك، وإمنا هو االمساك عن الطعام ”
- `23.439`: `bl1j0` “فإن قال: فإن مل يستطيع إذ ذاك فهو اآلن يستطيع.”
- `23.453`: `bl1jj` “قيل: أما اخلميس فإنه قال الصادق عليه السالم: " يعرض كل يس أعمال العباد إىل اهلل " فأحب أن يعرض عمل ا”
- `23.457`: `bl1jo` “قيل: النه إذا عرض عمل مثانية أيام والعبد صائم كان أشرف وأفضل من أن يعرض عمل يومني وهو صائم،”
- `23.467`: `bl1k0` “قيل: الن الفرض الذي فرضه اهلل عزوجل على اخللق هو شهر واحد فضوعف هذا الشهر يف الكفارة توكيدا وتغليظا ”
- `23.489`: `bl1ku` “أقول: ليس يف العلل قوله: وقال النيب صلى اهلل عليه واله إىل قوله: لن تؤمن هبذا، وهو موجود يف العيون، ”
- `23.650`: `bl1sa` “وعلة ضرب الزاين على جسده بأشد الضرب ملباشرته الزنا واستلذاذ اجلسد كله به فجعل الضرب عقوبة له وعربة ل”
- `23.698`: `bl1v1` “قال عليه السالم: العني شحمة وهو البياض والسواد، والنظر للروح، دليله أنك تنظر فيه فرتى صورتك يف وسطه،”
- `S2.4.5`: `bl234` “ولتجدهنم أحرص الناس على حيوة ومن الذين أشركوا يود أحدهم لو يعمر ألف سنة وما هو مبزحزحه من العذاب أن ”
- `S2.4.123`: `bl29m` “فهل أنت كائن كرجل قد ذاق املوت مث عاش بعده فسأل الرجعة فاسعف بطلبته فهو متأهب بنقل ما سره من ماله إى”
- `S2.4.137`: `bl2a9` “نبوؤهم أجداثهم ونأكل تراثهم، قد نسينا كل واعظ وواعظة، ورمينا بكل جائحة، وعجبت ملن نسي املوت وهو يرى ”
- `S2.6.45`: `bl2hz` “قال: كذلك هو على بعض الكافرين والفاجرين، أال ترون منهم من يعاين تلك الشدائد ؟ فذلكم الذي هو أشد من ه”
- `S2.6.47`: `bl2i2` “قيل: فما بالنا نرى كافرا يسهل عليه النزع فينطفئ وهو حيدث ويضحك ويتكلم، ويف املؤمنني أيضا من يكون كذل”
- `S2.6.49`: `bl2i5` “فقال: ما كان من راحة للمؤمن هناك فهو عاجل ثوابه، وما كان من شديدة فتمحيصه من ذنوبه لريد اآلخرة نقيا،”
- `S2.6.59`: `bl2ip` “فقال: على اخلبري سقطتم، هو أحد ثالثة امور يرد عليه: إما بشارة بنعيم االبد، وإما بشارة بعذاب االبد، و”
- `S2.6.101`: `bl2kz` “وسئل احلسن بن علي بن حممد عليه السالم عن املوت ما هو ؟ فقال: هو التصديق مبا ال يكون.”
- `S2.6.123`: `bl2me` “مث تال: " ومن ورائهم برزخ إىل يوم يبعثون " قال: هو القرب، وإن هلم فيه ملعيشة ضنكا، واهلل إن القرب لر”
- `S2.6.205`: `bl2qx` “فلم يزل املوت يبالغ يف جسده حىت خالط مسعه، فصار بني أهله ال ينطق بلسانه وال يسمع بسمعه، يردد طرفه با”
- `S2.7.23`: `bl2wm` “فعند ذلك يتناول ملك املوت روحه فيسلها كما يسل الشعرة من الدقيق، وإن كنتم ترون أنه يف شدة فليس هو يف ”
- `S2.7.165`: `bl33u` “قال سدير: من جدع اهلل أنفه، قال أبو عبد اهلل عليه السالم: فهو ذاك.”
- `S2.8.34`: `bl3es` “قال: يا صخر االمر بعدي ملن هو مين مبنزلة هارون من موسى،”
- `S2.8.48`: `bl3fj` “أن الذي خلق يف الرحم جنينا من ماء صاف، وركب فيه ضروبا خمتلفة من عروق وعصب وأسنان وشعر وعظام وغري ذلك”
- `S2.8.66`: `bl3gh` “وقال الصادق عليه السالم: يستبشرون واهلل يف اجلنة مبن مل يلحق هبم من خلفهم من املؤمنني يف الدنيا، ومث”
- `S2.8.160`: `bl3lp` “فيقول: اهلل ريب، وحممد نبيي، واالسالم ديين، فيقوالن: ثبتك اهلل فيما حتب وترضى، وهو قول اهلل: " يثبت ”
- `S2.8.162`: `bl3ls` “فيفسحان له يف قربه مد بصره، ويفتحان له بابا إىل اجلنة، ويقوالن له: من قرير العني نوم الشاب الناعم، و”
- `S2.8.218`: `bl3p7` “قال: فخرج فلقي عمر وهو ذعر، فقال له، مالك ؟ فقال: قال رسول اهلل صلى اهلل عليه واله: كذا وكذا، قال: ت”
- `S2.9.43`: `bl4fk` “قال: جتتمع عند صخرة بيت املقدس يف ليلة اجلمعة، وهو عرش اهلل االدىن منها يبسط اهلل االرض وإليها يطويه”
- `S2.9.77`: `bl4he` “وخري ماء على وجه االرض ماء زمزم، وشر ماء على و جه االرض ماء برهوت، وهو واد حبضرموت ترد عليه هام الكف”
- `S3.2.47`: `bl4vp` “ووفيت كل نفس ما عملت وهو أعلم مبا يفعلون 67 - 70 .”
- `S3.2.165`: `bl51e` “مث هو يفنيها بعد تكوينها ال لسأم دخل عليه يف تصريفها وتدبريها، وال لراحة واصلة إليه، وال لثقل شئ منه”

**Header numbers colliding with another block** (4)

- `1`: `bl2z` (struct) “تأليف العالمة فخر االمة المولى الشيخ محمد باقر المجلسيى”; `bl3s` (header) “)باب 19( )عفو اهلل تعالى وغفرانه وسعة رحمته ونعمه على العباد(”
- `2`: `bla9` (header) “(باب 20) (التوبة وأنواعها وشرائطها)”; `bl1ys` (header) “(باب 2) (عالمات الكبر وأن ما بين الستين إلى السبعين معترك المنايا) (وت”
- `6`: `bl1m1` (header) “(الفصل الثاني) (ما ورد من ذلك برواية ابن سنان)”; `bl1xi` (header) “(أبواب الموت) (وما يلحقه إلى وقت البعث والنشور)”; `bl1xl` (header) “(باب 1) (حكمة الموت وحقيقته، وما ينبغي أن يعبر عنه)”
- `16`: `bl4kp` (header) “(أبواب المعاد) (وما يتبعه ويتعلق به)”; `bl4kr` (header) “(باب 1) (أشراط الساعة، وقصة يأجوج ومأجوج)”

### Summa Theologica (`summa_theologica_pars_prima_secundae_treatise_on_la653b2090af2b5e21f611a288fab7c60`)

**Header numbers colliding with another block** (191)

- `1`: `1557594676479` (header) “TREATISE ON LAW (QQ. 90-108)”; `3t` (header) “QUESTION 90”; `3v` (content) “We have now to consider the extrinsic principles of acts. Now the extr”
- `2`: `3u` (header) “OF THE ESSENCE OF LAW (In Four Articles)”; `3w` (content) “Concerning law, we must consider: (1) Law itself in general; (2) its p”
- `3`: `3x` (content) “Under the first head there are four points of inquiry:”; `43` (header) “FIRST ARTICLE [I-II, Q. 90, Art. 1]”
- `4`: `3y` (content) “(1) Whether law is something pertaining to reason?”; `4e` (header) “SECOND ARTICLE [I-II, Q. 90, Art. 2]”
- `5`: `3z` (content) “(2) Concerning the end of law;”; `4q` (header) “THIRD ARTICLE [I-II, Q. 90, Art. 3]”
- … 186 more in the TSV

### This Decisive Hour (`this_decisive_hour_messages_to_america_1932_1946_b297e9a0235499a7665114820e0eb2017`)

**Header numbers colliding with another block** (164)

- `1`: `bltn` (struct) “”; `bl2w` (header) “1 -”
- `2`: `bl2y` (header) “26 February 1932”; `bl31` (header) “2 -”; `bl33` (header) “20 June 1932”
- `4`: `bl38` (header) “15 July 1932”; `bl3b` (header) “4 -”
- `5`: `bl3d` (header) “1 August 1932”; `bl3g` (header) “5 -”
- `6`: `bl3i` (header) “27 October 1932”; `bl3l` (header) “6 -”
- … 159 more in the TSV

### Deepening (`deepening_compilation_ocean_en`)

**Header numbers colliding with another block** (153)

- `1`: `bl32` (header) “— 1 —”; `bl33` (content) “Recite ye the verses of God every morn and eventide. Whoso faileth to ”
- `2`: `bl34` (source) “Bahá’u’lláh, ‘Kitáb-i-Aqdas’ #149”; `bl35` (header) “— 2 —”; `bl36` (content) “Were any man to taste the sweetness of the words which the lips of the”
- `3`: `bl37` (source) “Bahá’u’lláh, ‘Kitáb-i-Aqdas’ #3”; `bl38` (header) “— 3 —”; `bl39` (content) “Whoso hath inhaled the sweet fragrance of the All-Merciful, and recogn”
- `4`: `bl3a` (source) “Bahá’u’lláh, ‘Kitáb-i-Aqdas’ #7”; `bl3b` (header) “— 4 —”; `bl3c` (content) “Immerse yourselves in the ocean of My words, that ye may unravel its s”
- `5`: `bl3d` (source) “Bahá’u’lláh, ‘Kitáb-i-Aqdas’ #182”; `bl3e` (header) “— 5 —”; `bl3f` (content) “Peruse ye every day the verses revealed by God. Blessed is the man who”
- … 148 more in the TSV

**Source / citation lines carrying a number** (7)

- `62.3`: `blil` (content) “I pray that the divine blessings may descend upon you day by day, that”; `bl8k` (source) “‘Abdu’l-Bahá, ‘The Promulgation of Universal Peace’, p. 460”
- `103.3`: `blc7` (content) “In the Cause we cannot divorce the letter from the spirit of the words”; `blc8` (source) “On behalf of Shoghi Effendi to an individual believer, 16 February 193”
- `107.3`: `blj9` (content) “The task of the teachers is to produce such efficient servants for our”; `blco` (source) “On behalf of Shoghi Effendi to an individual believer, 18 October 1932”
- `116.3`: `bldf` (content) “The Guardian would, therefore, strongly urge you to get increasingly f”; `bldg` (source) “On behalf of Shoghi Effendi to an individual believer, 10 September 19”
- `119.3`: `bldp` (content) “In view of that Shoghi Effendi would urge you to persevere in your stu”; `bldq` (source) “On behalf of Shoghi Effendi to an individual believer, 5 May 1934”
- … 2 more in the TSV

### Bahá’í Prayers (`baha_i_prayers_bahai_ocean_en`)

**Opening invocations carrying a number** (14)

- `8.7`: `5x` “He is God! O God my God! Bestow upon me a pure heart, like unto a pearl.”
- `10.22`: `8s` “In the Name of thy Lord, the Creator, the Sovereign, the All-Sufficing, the Most Exalted, He Whose h”
- `13.5`: `af` “He is the Mighty, the Pardoner, the Compassionate!”
- `17.1`: `dm` “He is the Healer, the Sufficer, the Helper, the All-Forgiving, the All-Merciful.”
- `19.3`: `fp` “He is the Bestower, the Bounteous!”
- `19.6`: `ft` “He is God!”
- `23.18`: `ir` “In the Name of God, the Lord of overpowering majesty, the All-Compelling.”
- `24.4`: `ju` “He is the Gracious, the All-Bountiful!”
- `24.16`: `k9` “He is the prayer-hearing, prayer-answering God!”
- `24.46`: `lb` “He is God!”
- `29.19`: `rb` “He is God!”
- `32.1`: `bl1a8` “In the Name of God, the Most Ancient, the Most Great.”
- `33.2`: `bl1bs` “He is the Gracious, the Well-Beloved!”
- `38.1`: `v9` “He is God!”

**Header numbers colliding with another block** (6)

- `1`: `2u` (content) “Blessed is the spot, and the house, and the place, and the city, and t”; `2y` (header) “Obligatory Prayers”; `33` (header) “Short Obligatory Prayer”; `38` (header) “Medium Obligatory Prayer”
- `3`: `2w` (content) “Intone, O My servant, the verses of God that have been received by the”; `3o` (header) “Long Obligatory Prayer”
- `6`: `4m` (header) “Aid and Assistance”; `5b` (header) “Prayer For America”
- `29`: `o1` (header) “Revealed to the Bahá’ís of the United States and Canada”; `qh` (header) “Triumph of the Cause”
- `30`: `o9` (header) “Revealed to the Bahá’ís of the United States and Canada”; `rg` (header) “Unity”
- … 1 more in the TSV

**Signature / closing lines carrying a number** (83)

- `5.4`: `4p` (signature) “—Bahá’u’lláh”; `4t` (content) “Lauded be Thy Name, O Lord our God! Thou art in truth the Knower of th”
- `5.7`: `4s` (signature) “—Bahá’u’lláh”; `4w` (content) “Say: God is indeed the Maker of all things. He giveth sustenance in pl”
- `5.12`: `4x` (signature) “—The Báb”; `57` (content) “Remove not, O Lord, the festal board that hath been spread in Thy Name”
- `7.5`: `5h` (signature) “—Bahá’u’lláh”; `bl12w` (content) “Cause me, then, to turn wholly unto Thee, to put my whole trust in The”
- `7.9`: `5j` (signature) “—Bahá’u’lláh”; `bl13b` (content) “O Lord! Thou art the Remover of every anguish and the Dispeller of eve”
- … 78 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `2.1`: `34` (lead-in) “TO BE RECITED ONCE IN TWENTY-FOUR HOURS, AT NOON”; `35` (content) “I bear witness, O my God, that Thou hast created me to know Thee and t”
- `3.1`: `39` (lead-in) “TO BE RECITED DAILY, IN THE MORNING, AT NOON, AND IN THE EVENING”; `3a` (content) “Whoso wisheth to pray, let him wash his hands, and while he washeth, l”
- `4.1`: `3p` (lead-in) “TO BE RECITED ONCE IN TWENTY-FOUR HOURS”; `3q` (content) “Whoso wisheth to recite this prayer, let him stand up and turn unto Go”

### Bahá’í Sacred Writings (`baha_i_sacred_writings_en`)

**Opening invocations carrying a number** (1)

- `6.8.1`: `blih` “In the Name of God, the Exalted, the Most High!”

**Header numbers colliding with another block** (104)

- `1`: `bl2z` (header) “I. Selections from the Writings of Bahá’u’lláh”; `bl30` (header) “1 God and His Manifestations”; `bl1jt` (header) “— 1 —”; `bl1bl` (header) “Excerpts from the Tablets of the Divine Plan”
- `1.2`: `bl31` (header) “God’s Unknowable Essence”; `bl1jj` (header) “— 2 —”; `bl3c` (header) “The Relationship Between God and His Manifestations”; `bl3o` (header) “The Oneness of the Manifestations of God”; `bl43` (header) “The Purpose of God’s Manifestations”; `bl4e` (header) “Why the People Reject God’s Manifestation”; `bl4v` (header) “The Oneness of Religion”; `bl52` (header) “The Word of God”; `bl1jc` (content) “For Ṭáhirih had given him this letter and asked him to present it to t”
- `1.1`: `bl1ji` (header) “— 1 —”; `bluw` (content) “Mullá Ḥusayn and some of his disciples departed from Iraq, made for Pe”
- `1.3`: `bl1k2` (header) “— 3 —”; `bl5d` (header) “The Love of God”; `bl61` (header) “God’s Purpose for Humanity”; `bl66` (header) “Human Nature”; `bl6l` (header) “The Twin Duties”; `bl6t` (header) “The Bond of Human Beings with the Creator”; `bl76` (header) “Obstacles to Recognition”; `bl7j` (header) “The True Seeker”; `bl7r` (header) “The True Believer”
- `1.4`: `bl1k3` (header) “— 4 —”; `bl80` (header) “The Day of God”; `bl8f` (header) “The Promised One Has Come”; `bl8o` (header) “The Divine Physician”; `bl90` (header) “The Duty of Human Beings in This Day”; `bl9j` (header) “Episodes in the Life of Bahá’u’lláh”
- … 99 more in the TSV

### Dear Co-worker (Messages to the Benelux countries) (`messages_to_latin_america_baha_i_ocean_en`)

**Header numbers colliding with another block** (107)

- `1`: `bl2t` (header) “Messages from Shoghi Effendi to the Benelux countries”; `bl39` (header) “The Mail”; `blxx` (header) “1 -”; `bl42` (header) “14 April 1932 To Louise Drake Wright”
- `2`: `blxy` (header) “2 -”; `bl4c` (header) “30 July 1932 To Louise Drake Wright”
- `3`: `blxz` (header) “3 -”; `bl4o` (header) “15 August 1932 To Louise Drake Wright”
- `5`: `bly1` (header) “5 -”; `bl5d` (header) “28 March 1933 To Inez Greeven”
- `6`: `bly2` (header) “6 -”; `bl5q` (header) “12 April 1933 To Louise Drake Wright”
- … 102 more in the TSV

### مكاتيب حضرت عبدالبهاء  جلد ٢ (`makatib_i_hadrat_i_abdu_l_baha_jild_2_fa`)

**Header numbers colliding with another block** (105)

- `1.1`: `bl2t` (header) “بسم اللّه الرّحمن الرّحيم”; `bl2u` (content) “الحمد للّه الّذی قد حرّك أفلاك الذوات بحركة جذب صمدانيّته و قد موّج اب”
- `2.1`: `bl5h` (header) “هو الله”; `bl5i` (content) “ای بنده‌گان جمال ابهی روايت كنند كه شخص نحريری در اعصار ماضيه كه بصفت ”
- `3.1`: `bl5k` (header) “هو الله العزيز المحبوب”; `bl5l` (content) “بشير اشارات پر بشارات كه از مصر وفا عزم كوی جانان نموده در محفل دوستان”
- `4.1`: `bl5t` (header) “هو هو”; `bl5u` (content) “انشقاق قمر را معانی متعدّده است محصور معنی ظاهر نبوده از آنجمله مقصود ”
- `6.1`: `bl67` (header) “هو الله”; `bl68` (content) “ای بهمن از خدا بخواه كه چون ابر بهمن گوهر فشان گردی و چون صحن چمن گلشن”
- … 100 more in the TSV

### Citadel of Faith. Messages to America 1947-1957 (`citadel_of_faith_messages_to_america_1947_1957_en`)

**Header numbers colliding with another block** (83)

- `1`: `bltk` (struct) “”; `bl2x` (header) “– 1 –”
- `2`: `bl2y` (header) “Believers’ Generous Response to Temple Fund”; `bl32` (header) “– 2 –”
- `3`: `bl2z` (header) “January 20, 1947”; `bl33` (header) “Call to Fuller Participation”; `bl38` (header) “– 3 –”
- `4`: `bl34` (header) “January 30, 1947”; `bl3a` (header) “March 24, 1947”; `bl3d` (header) “– 4 –”; `bl3g` (header) “April 28, 1947”
- `5`: `bl3f` (header) “[MESSAGE TO 1947 CONVENTION]”; `bl3o` (header) “–5–”
- … 78 more in the TSV

### Messages to the Bahá’í World (`messages_to_the_bahai_world_new_edition_ocean_en`)

**Header numbers colliding with another block** (82)

- `2`: `bl2z` (header) “Review of World Progress of the Faith”; `bl3q` (header) “— 2 —”
- `3`: `bl30` (header) “Cablegram, April 25, 1950”; `bl3r` (header) “An Enterprise Transcending Any National Institution”; `bl3z` (header) “— 3 —”
- `4`: `bl3s` (header) “Cablegram, July 8, 1950”; `bl40` (header) “Opening Door to Pilgrimage”; `bl44` (header) “— 4 —”
- `5`: `blut` (header) “Cablegram, December 16, 1950”; `bl45` (header) “Formation of First International Bahá’í Council”; `bl49` (header) “— 5 —”
- `6`: `bl46` (header) “Cablegram, January 9, 1951”; `bl4a` (header) “Spiritual and Administrative World Center”; `bl4f` (header) “— 6 —”
- … 77 more in the TSV

### Arohanui (`arohanui_letters_to_new_zealand_baha_i_ocean_en`)

**Header numbers colliding with another block** (81)

- `1`: `blqj` (struct) “”; `blqk` (header) “1 -”; `bl31` (header) “June 22nd, 1923 To Margaret Stevenson”
- `2`: `blql` (header) “2 -”; `bl3e` (header) “May 8th, 1925 To Sarah Blundell”
- `4`: `blqn` (header) “4 -”; `bl48` (header) “May 21st, 1925 To Bertram Dewing”
- `5`: `blqo` (header) “5 -”; `bl4j` (header) “May 28th, 1925 To Margaret Stevenson”
- `6`: `blqp` (header) “6 -”; `bl51` (header) “November 4th, 1925 To Margaret Stevenson”
- … 76 more in the TSV

### Social Action (`social_action_ocean_en`)

**Header numbers colliding with another block** (76)

- `1.2`: `blkn` (header) “— 1 —”; `bl46` (header) “Collective Maturity and an Ever-Advancing Civilization”
- `1.3`: `blko` (header) “— 2 —”; `bll5` (header) “— 22 —”; `bl4w` (header) “Oneness and Justice”
- `1.4`: `blkq` (header) “— 3 —”; `bll6` (header) “— 23 —”; `bllg` (header) “— 32 —”; `bl5u` (header) “The Role of Knowledge”
- `1.5`: `blhb` (header) “— 4 —”; `bll7` (header) “— 24 —”; `bllh` (header) “— 33 —”; `bllw` (header) “— 47 —”
- `1.6`: `blkg` (header) “— 5 —”; `bll8` (header) “— 25 —”; `blli` (header) “— 34 —”; `bllx` (header) “— 48 —”
- … 71 more in the TSV

### The Cloud of Unknowing (`cloud_of_unknowing_christianity_en`)

**Header numbers colliding with another block** (75)

- `3`: `bl3v` (header) “Here Beginneth the Prayer on the Prologue”; `bl42` (header) “Of Four Degrees of Christian Men’s Living; and of the Course of His Ca”; `bl45` (header) “Here Beginneth the Second Chapter”; `blez` (header) “Chapter 3”
- `4`: `bl3x` (header) “Here Beginneth the Prologue”; `bl46` (header) “A Short Stirring to Meekness, and to the Work of This Book.”; `bl49` (header) “Here Beginneth the Third Chapter”; `blf2` (header) “Chapter 4”
- `2`: `bl41` (header) “Here Beginneth the First Chapter”; `bley` (header) “Chapter 2”
- `5`: `bl4a` (header) “How the Work of This Book Shall Be Wrought, and of the Worthiness of I”; `bl4e` (header) “Here Beginneth the Fourth Chapter”; `blf4` (header) “Chapter 5”
- `6`: `bl4f` (header) “Of the Shortness of This Word, and How It May Not Be Come to by Curios”; `bl4p` (header) “Here Beginneth the Fifth Chapter”; `blf6` (header) “Chapter 6”
- … 70 more in the TSV

### ألواح الخطّة الإلهيّة (`alwah_ul_khitta_al_ilahiya_new_ar`)

**Opening invocations carrying a number** (14)

- `2.3`: `bl3s` “هو الله”
- `3.3`: `bl43` “هو الله”
- `4.3`: `bl4c` “هو الله”
- `5.3`: `bl4m` “هو الله”
- `6.3`: `bl4u` “هو الله”
- `7.3`: `bl52` “هو الله”
- `8.2`: `bl5d` “هو الله”
- `9.2`: `bl5v` “هو الله”
- `11.3`: `bl6m` “هو الله”
- `12.3`: `bl6v` “هو الله”
- `13.3`: `bl79` “هو الله”
- `14.3`: `bl7p` “هو الله”
- `15.3`: `bl82` “هو الله”
- `16.3`: `bl8i` “هو الله”

**Header numbers colliding with another block** (2)

- `1`: `bl2t` (content) “الصّادرة من يراعة حضرة عبد البهاء”; `bl3n` (header) “المجموعة الأولى”
- `2`: `bl3k` (content) “ملاحظة إنّ البيانات والعبارات المطبوعة في هذه المجموعة بحروف عريضة هي ”; `bl3p` (header) “اللّوح الأوّل”

### Additional Tablets and Extracts from Tablets Revealed by Bahá’u’lláh (`additional_tablets_and_extracts_bahai_ocean_en`)

**Opening invocations carrying a number** (13)

- `1`: `blbl` “He is the All-Seeing from the Horizon of the Heaven of Knowledge.”
- `9`: `bl32` “In the name of Him Who is the Compassionate, the All-Bountiful!”
- `45`: `bl4f` “He is the Eternal.”
- `61`: `bl56` “He is God, exalted be He: Wisdom and utterance are His wont.”
- `106`: `bl7f` “He is the Healer, the Almighty, the All-Wise.”
- `115`: `bl7x` “He is the Glory of Glories.”
- `119`: `bl82` “He is the Peerless.”
- `122`: `bl86` “He is the Peerless, the Sanctified, the Most Glorious.”
- `127`: `bl8c` “He is the Peerless!”
- `142`: `bl91` “In the name of God, the Most Mighty, the Most Powerful!”
- `149`: `bl9c` “In the name of God, the All-Loving!”
- `159`: `bl9p` “He is God. Glorified be He; Grandeur and Might are His.”
- `167`: `bla3` “He is the All-Knowing, the All-Seeing.”

### I Ching (`i_ching_confucianism_ocean_en`)

**Header numbers colliding with another block** (64)

- `2`: `bl2x` (header) “The Judgment”; `bl30` (header) “The Image”; `bl33` (header) “The Lines”; `bl3p` (header) “K’un / the Receptive”
- `3`: `bl3s` (header) “The Judgment”; `bl3v` (header) “The Image”; `bl3y` (header) “The Lines”; `bl4k` (header) “Chun / Difficulty at the Beginning”
- `4`: `bl4n` (header) “The Judgment”; `bl4q` (header) “The Image”; `bl4v` (header) “The Lines”; `bl5e` (header) “Mêng / Youthful Folly”
- `5`: `bl5h` (header) “The Judgment”; `bl5k` (header) “The Image”; `bl5o` (header) “The Lines”; `bl67` (header) “Hsü / Waiting (Nourishment)”
- `6`: `bl6a` (header) “The Judgment”; `bl6d` (header) “The Image”; `bl6g` (header) “The Lines”; `bl70` (header) “Sung / Conflict”
- … 59 more in the TSV

### Dīghanikāya: Long Discourses (`digha_nikaya_the_long_discourses_of_the_buddha_oce34d6013d3e9976d7693ba158a056b8e3`)

**Header numbers colliding with another block** (61)

- `1`: `blfi` (header) “Translated”; `bl3c3` (struct) “”; `blfj` (content) “The Long Discourses (Dīgha Nikāya, abbreviated DN) is a collection of ”
- `g.1`: `blfm` (header) “Sīlakkhandha Vagga”; `blfn` (content) “The Chapter Containing the Section on Ethics (Sīlakkhandhavagga) is a ”
- `g.2`: `blfo` (content) “DN 1: The Prime Net Brahmajāla Sutta”; `blge` (header) “Mahā Vagga”
- `g.3`: `blfp` (content) “While others may praise or criticize the Buddha, they tend to focus on”; `blh0` (header) “Pāthika Vagga”
- `1:3.1.1`: `bljg` (content) “There are other principles — deep, hard to see, hard to understand, pe”; `blji` (header) “3.1.1. Eternalism”
- … 56 more in the TSV

### Living the Life (`living_the_life_bahai_ffa_en`)

**Header numbers colliding with another block** (56)

- `4`: `bl39` (source) “From a letter 30 October 1924 written by Shoghi Effendi to the Local S”; `bl3a` (header) “— 4 —”
- `5`: `bl3c` (source) “From a letter 20 November 1924 written on behalf of Shoghi Effendi to ”; `bl3d` (header) “— 5 —”
- `6`: `bl3f` (source) “From a letter 30 January 1925 written on behalf of Shoghi Effendi to a”; `bl3g` (header) “— 6 —”
- `7`: `bl3i` (source) “From a letter 14 February 1925 written on behalf of Shoghi Effendi to ”; `bl3j` (header) “— 7 —”
- `9`: `bl3r` (source) “From a letter 21 December 1927 written on behalf of Shoghi Effendi to ”; `bl3s` (header) “— 9 —”
- … 51 more in the TSV

### Sutra Collection (A, Part-1) (`budhist_sutra_part_a_ocean_buddhism_en`)

**Header numbers colliding with another block** (47)

- `1`: `bl2s` (content) “I, Ánanda, Live in the Fullness of Emptiness Empty of Empty Habits Not”; `bl2t` (header) “A Little Spell of Emptiness”; `bl44` (header) ““If the Bhikkhu Desires””
- `4`: `bl4r` (header) “The Discourse On In and Out Breathing”; `bl54` (header) “Aananjasappaayasuttam”
- `5`: `bl55` (header) “Suitability to Attain Imperturbability”; `bl5s` (header) “Abhasita Sutta”
- `6`: `bl5t` (header) “What Was Not Said”; `bl5w` (header) “Abhaya Raja Kumara Sutta”
- `7`: `bl5x` (header) “To Prince Abhaya”; `bl6u` (header) “Abhaya Sutta”
- … 42 more in the TSV

**Source / citation lines carrying a number** (2)

- `6.1`: `bl5y` (source) “(On Right Speech)”; `bl60` (content) “I have heard that on one occasion the Blessed One was staying near Raj”
- `44.1`: `bl134` (source) “(On Self, No Self, and Not-self)”; `bl136` (content) “Then the wanderer Vacchagotta went to the Blessed One and, on arrival,”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (25)

- `1.1`: `bl2v` (lead-in) “I hear tell:”; `bl2w` (content) “Once Upon A Time, The Lucky Man, Savatthi-Town, East-Park, The Palace ”
- `3.1`: `bl4s` (lead-in) “I heard thus:”; `bl4t` (content) “At one time the Blessed One lived in the Pubba monastery in the palace”
- `4.1`: `bl56` (lead-in) “I heard thus:”; `bl57` (content) “At one time the Blessed One was living in the Kuru country, in the ham”
- `8.1`: `bl7d` (lead-in) “I heard thus:”; `bl7e` (content) “At One time the Blessed One was living in the squirrels’ sanctuary in ”
- `11.1`: `bl87` (lead-in) “Thus have I heard:”; `bl88` (content) “On one occasion the Blessed One was living at Savatthi in Jeta’s Grove”
- … 20 more in the TSV

### Sutra Collection (N,O,P) (`sutra_collection_nop_ocean_buddhism_en`)

**Header numbers colliding with another block** (51)

- `2`: `bl2t` (header) “Not Yours”; `bl35` (header) “Nadi Sutta”
- `3`: `bl36` (header) “The River”; `bl3s` (header) “Nagara Sutta”
- `4`: `bl3t` (header) “The City”; `bl43` (header) “Nagaravindeyya Sutta”
- `5`: `bl44` (header) “The Discourse Delivered at Nagaravindika”; `bl4c` (header) “Nakhasikha Sutta”
- `6`: `bl4d` (header) “The Tip of the Fingernail”; `bl4z` (header) “Nakula Sutta”
- … 46 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (12)

- `4.1`: `bl45` (lead-in) “I heard thus:”; `bl46` (content) “At one time the Blessed One was touring the Kosala country with a larg”
- `9.1`: `bl6p` (lead-in) “I heard thus:”; `bl6q` (content) “At one time the Blessed One was living in a forest in Nalakapána in th”
- `10.1`: `bl74` (lead-in) “I heard thus:”; `bl75` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- `12.3`: `bldx` (lead-in) “The Buddha:”; `bldy` (content) “Those with children grieve because of their children. Those with cattl”
- `18.1`: `blhj` (lead-in) “I heard thus:”; `blhk` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- … 7 more in the TSV

### The Standard Prayer Book (`siddur_machzor_judaism_ocean_en`)

**Header numbers colliding with another block** (52)

- `4`: `bl5j` (header) “Numbers xxviii. 1-8.”; `bl5l` (header) “Leviticus i. 11.”; `bl5o` (header) “Numbers xxviii. 9, 10.”; `bl5r` (header) “Numbers xxviii. 11-15.”; `bl6r` (header) “1 Chron. xvi. 8-36.”; `bl6y` (header) “Psalm c.”; `bl72` (header) “Psalm xix.”; `bl74` (header) “Psalm xxxiv.”; `bl7s` (header) “Psalm xc.”; `bl7w` (header) “Psalm xci.”; `bl80` (header) “Psalm cxxxv.”; `bl83` (header) “Psalm cxxxvi.”; `bl8u` (header) “Psalm xxxiii.”; `bl8x` (header) “Psalm xcii.”; `bl90` (header) “Psalm xciii.”; `bl97` (header) “Psalm cxlv. A Psalm of Praise: of David.”; `bl9u` (header) “Psalm cxlvi.”; `bl9x` (header) “Psalm cxlvii.”; `bla0` (header) “Psalm cxlviii”; `bla3` (header) “Psalm cxlix.”; `bla5` (header) “Psalm cl.”; `blaa` (header) “1 Chron. xxix. 10-13.”; `blad` (header) “Nehemiah ix. 6-11.”; `blag` (header) “Exod. xiv. 30-xv. 18.”; `blba` (header) “Deut. vi. 4-9.”; `blbe` (header) “Deut. xi. 13-21.”; `blbi` (header) “Numbers xv. 37-41.”; `ble4` (header) “During the Ten Days of Penitence say: —”; `blg2` (header) “Psalm vi.”; `blgt` (header) “Order of Reading the Law”; `blhu` (header) “Psalm xxiv.”; `bli0` (header) “Psalm cxlv. A Psalm of Praise: of David”; `blio` (header) “Psalm xx.”
- `9`: `bl6f` (header) “Meditation Before Laying the Tephillin.”; `bl6i` (header) “On Placing the Tephillah on the Arm, Say: —”; `bl6k` (header) “On Placing the Tephillah on the Forehead, Say: —”; `bl6n` (header) “The Retsuah Is Placed Thrice Round the Middle Finger, and the Followin”
- `6`: `bl70` (header) “On Weekdays Continue "Let the Glory," etc.”; `bljw` (header) “Psalm xxiv.”; `blk0` (header) “(Psalm xlviii.)”; `blk5` (header) “(Psalm lxxxii.)”; `blka` (header) “(Psalm xciv.)”; `blkl` (header) “Psalm xciii.”
- `11`: `bl71` (header) “On Sabbaths and Holydays, and On Hoshana Rabba, the Following Psalms a”; `blpi` (header) “Psalm vi.”
- `26`: `bla7` (header) “The Last Verse is Repeated.”; `bla9` (header) “The Following to "Worship Thee," is Said Standing.”
- … 47 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `13.1.35`: `bl2o5` (lead-in) “the holy King.”; `blx7` (content) “Thou didst hallow the seventh day unto thy name, as the end of the cre”

### Scholarship (`scholarship_bahai_ocean_en`)

**Header numbers colliding with another block** (37)

- `1`: `bl32` (header) “THE STATION OF SCHOLARSHIP”; `bl33` (header) “1.1 Importance of Knowledge and Learning”; `bl34` (header) “From the Writings of Baha’u’llah”; `bl6b` (header) “— 1 —”
- `3`: `bl6h` (header) “From the Writings and Utterances of ‘Abdu’l-Bahá”; `bl69` (header) “— 3 —”
- `6`: `bl6v` (header) “From a Letter Written on Behalf of Shoghi Effendi”; `bl6q` (header) “— 6 —”
- `7`: `bl6s` (header) “1.2 Characteristics of the “Truly Learned””; `bl6r` (header) “From the Writings of Bahá’u’lláh”; `bl6j` (header) “— 7 —”
- `11`: `bl3d` (header) “From the Writings of ‘Abdu’l-Bahá”; `blcq` (header) “— 11 —”; `bl3g` (header) “From Letters Written on Behalf of Shoghi Effendi”
- … 32 more in the TSV

**Source / citation lines carrying a number** (6)

- `14.2`: `bl77` (source) “Bahá’u’lláh, ‘The Kitáb-i-Aqdas’ #173, p. 82”; `bl7n` (content) “The House of Justice advises you not to attempt to define too narrowly”
- `47.2`: `bl8b` (source) “‘Gleanings from the Writings of Bahá’u’lláh’, section CLIV”; `bl9t` (content) “Baha’u’llah has said that learning can be the veil between the soul of”
- `54.2`: `bl4f` (source) “‘Abdu’l-Bahá, from a Tablet, translated from the Persian”; `blap` (content) “As regards your own studies: he would advise you not to devote too muc”
- `58.2`: `bl8t` (source) “From a letter 5 May 1934 written on behalf of Shoghi Effendi to an ind”; `blat` (content) “Dispute not with any one concerning the things of this world and its a”
- `68.2`: `bl4q` (source) “6 February 1973, ‘Messages from the Universal House of Justice, 1968-1”; `bl5r` (content) “The fact that the Faith, as the Guardian states, “enjoins upon its fol”
- … 1 more in the TSV

### Prayers of ‘Abdu’l-Bahá (`prayers_revealed_by_abdu_l_baha_bahai_ocean_en`)

**Opening invocations carrying a number** (8)

- `16`: `bl3i` “He is God.”
- `22`: `bl3r` “He is God.”
- `29`: `bl43` “He is the Most Holy, the Most Glorious.”
- `30`: `bl44` “In the name of God, the Compassionate, the Merciful! Praise be to God, the Lord of all worlds!”
- `35`: `bl4b` “He is God.”
- `38`: `bl4f` “He is the All-Glorious.”
- `42`: `bl4l` “He is the All-Glorious, the Most Effulgent.”
- `46`: `bl4s` “He is God.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1`: `bl2u` (lead-in) “He is God.”; `bl5m` (content) “O thou who circlest in adoration about the Spot round which circle the”

### Additional Prayers Revealed by Bahá’u’lláh (`additional-prayers-revealed-by-baha-u-llah_en`)

**Opening invocations carrying a number** (8)

- `10`: `bl4t` “He is God, exalted is He, the Lord of wisdom and utterance.”
- `13`: `bl4y` “He is the Almighty, the Self-Subsisting.”
- `19`: `bl58` “In the name of God, the Forgiver!”
- `24`: `bl5j` “He is the Ever-Abiding, the Almighty, the Most High.”
- `28`: `32` “In the Name of our Lord, the Most Holy, the Most Great, the Exalted, the Most Glorious!”
- `33`: `bl5p` “He is the Peerless!”
- `35`: `bl5q` “He is the All-Glorious!”
- `40`: `bl5r` “He is God, exalted is He, the Lord of might and grandeur!”

### Pahlavi Texts, Part IV (`pahlavi_texts_part_iv_zoroastrianism_ocean_en_en`)

**Opening invocations carrying a number** (1)

- `144.5.1`: `bl2au` “In the name and for the propitiation of the creator Aûharmazd these several commentaries (zand) are ”

**Header numbers colliding with another block** (34)

- `1`: `bl2ln` (header) “Contents of the Nasks”; `bl2m7` (header) “Dînkard Book VIII”; `bl4e` (header) “Chapter I”
- `18`: `bl9g` (header) “Nîkâdûm Nask”; `bl9r` (header) “Chapter XVIII”
- `19`: `bl9s` (header) “Nîkâdûm Nask”; `bla1` (header) “Chapter XIX”
- `20`: `bla2` (header) “Nîkâdûm Nask”; `blbw` (header) “Chapter XX”
- `21`: `blbx` (header) “Nîkâdûm Nask”; `blgl` (header) “Chapter XXI”
- … 29 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `144.9.2`: `bl2c2` (lead-in) “Pahl. Yas. XIX = Bakŏ I.”; `bl2c3` (content) “The beginning of the Ahunavair of the Bakân.”

### Directives from the Guardian (`directives_from_the_guardian_en`)

**Header numbers colliding with another block** (35)

- `1`: `bl2x` (header) “— 1 —”; `bl2y` (header) “Stories about ‘Abdu’l-Bahá”
- `2`: `bl31` (header) “— 2 —”; `bl32` (header) “Chief Objectives of ‘Abdu’l-Bahá’s Ministry”
- `3`: `bl34` (header) “— 3 —”; `bl35` (header) “Attitude Towards Administration (National Assembly’s Statement Approve”
- `4`: `bl37` (header) “— 4 —”; `bl38` (header) “Administration, Bahá’í — (Rules and Regulations)”
- `5`: `bl3a` (header) “— 5 —”; `bl3b` (header) “Administration (Study and Apply)”
- … 30 more in the TSV

### The Meaning of the Glorious Qur’án (Pickthall) (`the-qur-an_en`)

**Opening invocations carrying a number** (6)

- `1:1`: `31` “In the name of Allah, the Beneficent, the Merciful.”
- `6:18`: `pp` “He is the Omnipotent over His slaves, and He is the Wise, the Knower.”
- `6:61`: `qw` “He is the Omnipotent over His slaves. He sendeth guardians over you until, when death cometh unto on”
- `13:9`: `1fc` “He is the Knower of the Invisible and the Visible, the Great, the High Exalted.”
- `40:65`: `3ds` “He is the Living One. There is no God save Him. So pray unto Him, making religion pure for Him (only”
- `57:3`: `436` “He is the First and the Last, and the Outward and the Inward; and He is Knower of all things.”

### The Incoherence of the Philosophers (`incoherence_of_the_philosophers_islam_ocean_en`)

**Opening invocations carrying a number** (1)

- `vi.5`: `bl44` “In the Name of God, the Compassionate, the Merciful”

**Header numbers colliding with another block** (24)

- `v`: `bl3q` (header) “V”; `bl45` (header) “[The Religious Preface]”
- `vi.1`: `bl3z` (content) “The term tahāfut has been variously translated — for example, as destr”; `bl4e` (header) “[A First] Introduction”
- `vi.5`: `bl44` (content) “In the Name of God, the Compassionate, the Merciful”; `bl55` (header) “[Author’s Table of Contents]”
- `vii.2`: `bl47` (content) “(2) I have seen a group who, believing themselves in possession of a d”; `bl4j` (header) “[A Second] Introduction”
- `vii.3`: `bl48` (content) “(3) There is no basis for their unbelief other than traditional, conve”; `bl4v` (header) “[A Third] Introduction”
- … 19 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `1.1.1`: `bl6b` (lead-in) “On refuting their doctrine of the world’s past eternity”; `bl6c` (content) “(1) Explicating /their/ doctrine: Philosophers have disagreed among th”
- `1.3.19`: `bl94` (lead-in) “Another pattern [of argument the philosophers] have or rendering the p”; `bl95` (content) “(96) They say:”
- `2.1`: `blaf` (lead-in) “On refuting their statement on the post-eternity of the world, time, a”; `blag` (content) “(1) Let it be known that this question is a branch of the first. For, ”

### Sutra Collection (VY) (`sutra_collection_vy_ocean_buddhism_en`)

**Header numbers colliding with another block** (27)

- `2`: `bl2t` (header) “Sister Vajira”; `bl34` (header) “Vajjiya Sutta”
- `3`: `bl35` (header) “About Vajjiya”; `bl3j` (header) “The Vajrasamadhi Sutra”
- `4`: `bl1my` (header) “The Diamond-Absorption Sutra”; `bl3r` (header) “Chapter One - Prologue”; `bl41` (header) “Chapter Two - The Signless Dharma”; `bl52` (header) “Chapter Three - The Practice of Non-Creation”; `bl5n` (header) “Chapter Four - The Benediction of Self-Enlightenment”; `bl6k` (header) “Chapter Five - Accessing Reality”; `bl86` (header) “Chapter Six - True Nature of the Void”; `bl9e` (header) “Chapter Seven - The Tathagatagarbha (The Perpetual Store)”; `blc6` (header) “Chapter Eight - Concluding Summary”; `blfg` (header) “Epilogue”; `blfw` (header) “Valahaka Sutta”
- `5`: `blfx` (header) “Thunderheads”; `blg5` (header) “Vammika Sutta”
- `6`: `blg6` (header) “The Simile of the Ant Hill”; `blgf` (header) “Vanapattha Sutta”
- … 22 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (9)

- `5.1`: `blg7` (lead-in) “I heard thus:”; `blg8` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- `6.1`: `blgh` (lead-in) “I heard thus:”; `blgi` (content) “At one time the Blessed One lived in the monastery offered by Anathapi”
- `7.1`: `blgv` (lead-in) “Thus have I heard:”; `blgw` (content) “On one occasion the Blessed One was living near Savatthi at Jetavana a”
- `10.1`: `blk7` (lead-in) “I heard thus:”; `blk8` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- `11.1`: `bll5` (lead-in) “I heard thus:”; `bll6` (content) “At one time the Blessed One was living in the monastery offered by Ana”
- … 4 more in the TSV

### Uttaradhyayana (`uttaradhyayana_ocean_jainism_en`)

**Header numbers colliding with another block** (27)

- `1`: `bl1ii` (header) “PART II”; `bl2v` (header) “[pg 1] Uttarâdhyayana.”; `bl2w` (header) “FIRST LECTURE.”
- `2`: `bl2x` (header) “ON DISCIPLINE.”; `bl56` (header) “SECOND LECTURE.”; `bl57` (header) “ON TROUBLES”
- `4`: `bl8l` (header) “FOURTH LECTURE.”; `bl8m` (header) “IMPURITY.”
- `6`: `bl9a` (header) “DEATH AGAINST ONE’S WILL.”; `blah` (header) “SIXTH LECTURE.”
- `8`: `blbg` (header) “THE PARABLE OF THE RAM, ETC.”; `blcu` (header) “EIGHTH LECTURE.”
- … 22 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `36.4`: `bl1wv` (lead-in) “A. Things without life.”; `bl1ww` (content) “Things without life are 1. possessing form, 2. formless; the formless ”
- `36.33`: `bl1xp` (lead-in) “B. Living Beings.”; `bl1xq` (content) “I shall now, in due order, deliver the division of living beings. (48)”

### God Passes By (`god_passes_by_ocean_en`)

**Header numbers colliding with another block** (25)

- `2`: `3a` (header) “First Period - The Ministry of the Báb - 1844–1853”; `3g` (header) “Declaration of the Báb’s Mission”; `3l` (header) “Enrollment of the Letters of the Living”; `3p` (header) “The Báb’s pilgrimage to Mecca”; `3z` (header) “The Báb’s arrest and departure for Iṣfahán”; `41` (header) “The Báb’s sojourn in Iṣfahán”; `48` (header) “-Chapter II -”
- `3`: `blue` (header) “Chapter I -”; `blud` (header) “The Bab’s Captivity in Ádhirbayjan”; `4b` (header) “His incarceration in Máh-Kú and C̱hihríq”; `4h` (header) “His examination in Tabríz”; `4k` (header) “His Writings”; `4v` (header) “His Covenant”; `54` (header) “The conference of Badas̱ht”; `5e` (header) “Upheavals in Mázindarán, Nayríz and Zanján”
- `4`: `3d` (header) “The Birth of the Bábí Revelation”; `49` (header) “Significance of His captivity”; `5l` (header) “Highlights of the Mázindarán Upheaval”; `5p` (header) “Outstanding features of the Nayríz Upheaval”; `5s` (header) “Episodes associated with the Zanján Upheaval”; `5v` (header) “The Seven Martyrs of Ṭihrán”; `5z` (header) “The Execution of the Báb”
- `5`: `60` (header) “Events preceding His death”; `66` (header) “Circumstances attending His martyrdom”; `6e` (header) “Tributes paid to His memory”; `6h` (header) “Parallel between His mission and that of Jesus Christ”; `6k` (header) “Significance of His mission”; `6o` (header) “The Attempt on the Life of the S̱háh and its Consequences”
- `6`: `6r` (header) “Circumstances attending the attack on Náṣiri’d-Dín S̱háh”; `6v` (header) “Massacre of the Bábís in Ṭihrán”; `70` (header) “Role played by Bahá’u’lláh during the Báb’s ministry”; `75` (header) “His arrest and imprisonment in the Síyáh-C̱hál”; `77` (header) “Arrest and martyrdom of Ṭáhirih”; `7f` (header) “Execution of prominent disciples of the Báb”; `7k` (header) “Tributes paid to the heroism of the Bábís”; `7q` (header) “Fate of the persecutors of the Báb and His disciples”; `7v` (header) “Second Period - The Ministry of Bahá’u’lláh - 1853–1892”
- … 20 more in the TSV

### Sûtrakritâṅga (`sutrakrtanga_ocean_jainism_en`)

**Header numbers colliding with another block** (21)

- `2`: `bl2v` (header) “CALLED”; `bl2w` (header) “THE DOCTRINE”; `blyh` (header) “SECOND BOOK”
- `1.3`: `bl7n` (header) “CALLED”; `bl7o` (header) “THE DESTRUCTION OF KARMAN.”; `blbe` (header) “THIRD LECTURE,”
- `1.4`: `blbf` (header) “CALLED”; `blbg` (header) “THE KNOWLEDGE OF TROUBLES”; `blf2` (header) “FOURTH LECTURE”
- `1.5`: `blf3` (header) “CALLED”; `blf4` (header) “KNOWLEDGE OF WOMEN.”; `blhs` (header) “FIFTH LECTURE,”
- `1.4.4`: `blht` (header) “CALLED”; `blhu` (header) “DESCRIPTION OF THE HELLS.”
- … 16 more in the TSV

**Source / citation lines carrying a number** (1)

- `2.5.2.8`: `bl1f5` (content) “Gôsâla.”; `bl1f6` (source) “(‘As your Law makes it no sin for Mahâvîra to surround himself by a cr”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (10)

- `2.5.2.4`: `bl1f0` (lead-in) “Ârdraka.”; `bl1f1` (content) ““His past, present, and future lives agree with each other; for he is ”
- `2.5.2.9`: `bl1f7` (lead-in) “Ârdraka.”; `bl1f8` (content) ““Know this: those who use cold water, eat seeds, accept things especia”
- `2.5.2.12`: `bl1fb` (lead-in) “Gôsâla.”; `bl1fc` (content) “‘In making this statement you blame all philosophers alike!’”
- `2.5.2.13`: `bl1fd` (lead-in) “Ârdraka.”; `bl1fe` (content) ““Every philosopher praises his own doctrines and makes them known.” (1”
- `2.5.2.17`: `bl1fj` (lead-in) “Gôsâla.”; `bl1fk` (content) “‘Out of fear your Sramana will not stay in houses for travellers or in”
- … 5 more in the TSV

### The Power of Divine Assistance (`the_power_of_divine_assistance_bahai_ocean_en`)

**Header numbers colliding with another block** (17)

- `6`: `bl3g` (header) “— 6 —”; `bl3h` (content) “Great is the blessedness of him who hath in this Day cast away the thi”
- `7`: `bl3i` (source) “‘Tablets of Bahá’u’lláh Revealed after the Kitáb-i-Aqdas’, p. 48”; `bl3j` (header) “— 7 —”
- `12`: `bl3v` (header) “— 12 —”; `bl3x` (source) “Bahá’u’lláh, cited in Shoghi Effendi, ‘The Advent of Divine Justice’, ”
- `14`: `bl41` (header) “— 14 —”; `bl43` (source) “Bahá’u’lláh, cited in Shoghi Effendi ‘The World Order of Bahá’u’lláh’,”
- `34`: `bl60` (header) “— 34 —”; `bl62` (source) “‘Selections from the Writings of ‘Abdu’l-Bahá’ #209, p. 264”
- … 12 more in the TSV

**Source / citation lines carrying a number** (4)

- `17.3`: `bl4j` (content) “Say, the power of God is in the hearts of those who believe in the uni”; `bl4p` (source) “‘Selections from the Writings of the Báb’, p, p. 16466”
- `19.2`: `bl4s` (source) “‘Selections from the Writings of the Báb’, p. 171”; `bl4v` (source) “‘Selections from the Writings of the Báb’, p. 176”
- `41.2`: `bl6o` (source) “‘Tablets of ‘Abdu’l-Bahá ‘Abbás’, vol. 3, p. 508”; `bl6r` (source) “‘Tablets of ‘Abdu’l-Bahá ‘Abbás’, vol. 3, p. 591”
- `43.2`: `bl6u` (content) “When you call on the Mercy of God waiting to reinforce you, your stren”; `bl6z` (source) “‘Abdu’l-Bahá, cited in Shoghi Effendi, ‘Bahá’í Administration’, p. 123”

### The Promised Mahdi, Part II (`the_promised_mahdi_partii_islam_ocean_en`)

**Opening invocations carrying a number** (3)

- `5.3.1`: `blhp` “In the name of Allah, the Beneficent, the Merciful”
- `1.36.174`: `bl3wb` “In the name of Allah, the Beneficent, the Merciful.”
- `1.36.184`: `bl3wm` “In the Name of Allah, the Beneficent, the Merciful.”

**Header numbers colliding with another block** (6)

- `1.28`: `bl9m` (header) “Report of Ammar Sabati”; `bla7` (header) “Report of Ibrahim Kufi”; `bld6` (header) “Firm faith of the Shia”; `blfk` (header) “Remain steadfast on your faith”; `blfx` (header) “Chapter Twenty-Eight: Those who falsely claim meeting the Imam (a.s.) ”
- `1.30`: `blhm` (header) “Incidents of the Green Island and the White Sea”; `blho` (header) “Treatise of the Green Island and the White Sea — Report of Mazandarani”; `bllc` (header) “2- Amir Ishaq Astarabadi”; `bllh` (header) “3- Mirza Muhammad Astarabadi”; `blll` (header) “4- Incident of a man from Qashan”; `bllw` (header) “5- The deceptive pomegranate”; `blm5` (header) “Chapter Thirty: Signs of Reappearance”
- `1.31`: `blpu` (header) “Remoteness of Islam”; `blq0` (header) “Effect of the Uprising of Imam Zamana (a.s.) and its Signs”; `blqh` (header) “Sermon of Amirul Momineen (a.s.) and the conditions in the last period”; `blqt` (header) “Who is Dajjal?”; `blr7` (header) “Would Dajjal be a Jew?”; `blri` (header) “Opinion of Ahle Sunnat scholars about Dajjal”; `blru` (header) “Objections”; `bls9` (header) “Signs of the Uprising of the Qaim of Aale Muhammad (a.s.)”; `bly8` (header) “Amirul Momineen (a.s.) and Umar Ibne Saad”; `blz8` (header) “Report of Abu Basir about other signs of reappearance”; `blzz` (header) “Report of Abaya Rabi”; `bl10s` (header) “Report of Jabir Jofi and General Conditions in the Last period of time”; `bl13t` (header) “Rise of the Sufyani is inevitable”; `bl14t` (header) “Advent of Sufyani”; `bl187` (header) “Sufyani will cut them off like grass”; `bl1b4` (header) “Chapter Thirty-One: Reappearance of Imam Zamana (a.s.), its signs and ”
- `1.32`: `bl1j0` (header) ““Listen and obey.””; `bl1k1` (header) “Chapter Thirty-Two: Companions of Imam Zamana (a.s.)”
- `1.33`: `bl1xe` (header) “Flag of the Qaim is same as the flag of the Prophet”; `bl273` (header) “Supplication of Hazrat Hujjat (a.t.f.s.)”; `bl27b` (header) “Chapter Thirty-Three: What will happen at the time of the Reappearance”
- … 1 more in the TSV

### البيان العربي (`arabic_bayan_ar`)

**Opening invocations carrying a number** (2)

- `3.12`: `bl40` “ثمّ الواحد من بعد العشر ما نزل فيها في الآية الأولى ”بسم الله الأمنع الأقدس“ أنتم إلى ”حروف الواحد“ ”
- `9.19`: `bl7s` “ثمّ التّاسع من بعد العشر أنتم حين ما تزكّون حوت البحر والنّهر لتقولون ”بسم الله المهيمن القيّوم“ ثمّ”

**Header numbers colliding with another block** (11)

- `1`: `bl2s` (header) “الواحد الاول”; `bl2t` (header) “بسم الله الامنع الاقدس”
- `2`: `bl31` (header) “الواحد الثاني”; `bl32` (header) “بسم الله الامنع الاقدس”
- `3`: `bl3n` (header) “الواحد الثالث”; `bl3o` (header) “بسم الله الامنع الاقدس”
- `4`: `bl49` (header) “الواحد الرابع”; `bl4a` (header) “بسم الله الامنع الاقدس”
- `5`: `bl4u` (header) “الواحد الخامس”; `bl4v` (header) “يا الله بسم الله الامنع الاقدس”
- … 6 more in the TSV

### The Awakening of the Soul (`awakening_of_the_soul_en`)

**Header numbers colliding with another block** (20)

- `1`: `bl2y` (content) “Motto — “’Twas what it was, ’tis not to be expressed. Enquire no furth”; `bl5g` (header) “The Awakening of the Soul A Philosophical Romance”
- `3`: `bl30` (signature) “Ghazali.”; `bl5m` (header) “Hayy Ibn Yokdhan, Son of a Princess”; `bl7p` (header) “Hayy Makes Himself Clothes and Shoes of the Skins of Animals.”; `bl8d` (header) “The Fourth Septenary”
- `2`: `bl5i` (header) “Different Accounts of the Birth of Hayy Ibn Yokdhan.”; `bl7n` (header) “The Third Septenary”
- `4`: `bl5q` (header) “Hayy Is Exposed by His Mother”; `bl7u` (header) “Hayy Learns to Ride.”; `bl8f` (header) “Hayy Ponders over Heaven and Stars.”; `bl9z` (header) “Fift Septenary”
- `5`: `bl5u` (header) “Hayy Is Driven by the Tide to Another Island.”; `bl7z` (header) “Hayy Examines the Nature of Bodies.”; `bl8j` (header) “Hayy Finds That the Body of Heaven Is Finite.”; `bla1` (header) “Hayy Is Completely Taken up with the Contemplation of the Superior Int”; `blap` (header) “Seventh Septenary”
- … 15 more in the TSV

**Signature / closing lines carrying a number** (1)

- `ep.6`: `bldk` (content) “Praise be unto God alone.”; `bldl` (signature) “THE END.”

### The Gulistan of Sa’di (`gulistan_islam_ocean_en`)

**Header numbers colliding with another block** (21)

- `1`: `bl18r` (header) “Introductory”; `blzm` (header) “Chapter I The Manners Of Kings”
- `8.1`: `bl15v` (header) “Maxim 1”; `blsk` (content) “Property is for the comfort of life, not for the accumulation of wealt”
- `9`: `blsr` (header) “Maxim 2”; `bl15u` (header) “Maxim 3”; `bl15x` (header) “Maxim 4”; `bl15w` (header) “Maxim 5”; `bl15z` (header) “Maxim 6”; `bl15y` (header) “Maxim 7”; `bl168` (header) “Maxim 9”; `bl16b` (header) “Maxim 10”; `bl16c` (header) “Maxim 11”; `bl16g` (header) “Maxim 12”; `bl16j` (header) “Maxim 13”; `bl16l` (header) “Maxim 14”; `bluc` (header) “Maxim 15”; `bl16k` (header) “Maxim 16”; `bl16n` (header) “Maxim 17”; `bl16m` (header) “Maxim 18”; `bl16o` (header) “Maxim 19”; `bluq` (header) “Maxim 20”; `bl16r` (header) “Maxim 21”; `bluw` (header) “Maxim 22”; `bl16q` (header) “Maxim 23”; `bl16u` (header) “Maxim 24”; `blv6` (header) “Maxim 25”; `blv8` (header) “Maxim 26”; `bl16z` (header) “Maxim 27”; `bl16y` (header) “Maxim 28”; `bl170` (header) “Maxim 29”; `bl172` (header) “Maxim 30”; `bl174` (header) “Maxim 31”; `blvq` (header) “Maxim 32”; `bl177` (header) “Maxim 33”; `bl179` (header) “Maxim 34”; `bl17b` (header) “Maxim 35”; `bl178` (header) “Maxim 36”; `bl17a` (header) “Maxim 37”; `bl17d` (header) “Maxim 38”; `bl17c` (header) “Maxim 39”; `bl17f` (header) “Maxim 40”; `blwd` (header) “Maxim 41”; `blwf` (header) “Maxim 42”; `bl17e` (header) “Maxim 43”; `bl17h` (header) “Maxim 44”; `bl17g` (header) “Maxim 45”; `bl17j` (header) “Maxim 46”; `bl17l` (header) “Maxim 47”; `bl17k` (header) “Maxim 48”; `bl17n` (header) “Maxim 49”; `bl17m` (header) “Maxim 50”; `bl17o` (header) “Maxim 51”; `bl17r` (header) “Maxim 52”; `bl17q` (header) “Maxim 53”; `bl17t` (header) “Maxim 54”; `bl17v` (header) “Maxim 55”; `bl17u` (header) “Maxim 56”; `bl17x` (header) “Maxim 57”; `bl17w` (header) “Maxim 58”; `bl17z` (header) “Maxim 59”; `bl17y` (header) “Maxim 60”; `bl181` (header) “Maxim 61”; `bl180` (header) “Maxim 62”; `bl183` (header) “Maxim 63”; `bl182` (header) “Maxim 64”; `bl185` (header) “Maxim 65”; `bl184` (header) “Maxim 66”; `bl187` (header) “Maxim 67”; `bl186` (header) “Maxim 68”; `bl189` (header) “Maxim 69”; `bl18b` (header) “Maxim 70”; `bl18a` (header) “Maxim 71”; `bl18d` (header) “Maxim 72”; `bl18c` (header) “Maxim 73”; `bl18e` (header) “Maxim 74”; `blyl` (header) “Maxim 75”; `blyp` (header) “Maxim 76”; `bl18j` (header) “Maxim 77”; `bl18i` (header) “Maxim 78”; `bl18l` (header) “Maxim 79”; `bl18k` (header) “Maxim 80”; `bl18n` (header) “Maxim 81”; `bl18m` (header) “Maxim 82”; `bl18p` (header) “Conclusion of the Book”; `bl18f` (header) “-The End-”
- `8.8`: `blss` (content) “Two men took useless trouble and strove without any profit, when one o”; `bl160` (header) “Admonition 2”; `blt7` (header) “Admonition 3”; `bl163` (header) “Maxim 8”
- `8.9`: `blst` (content) “However much science thou mayest acquire Thou art ignorant when there ”; `bltb` (header) “Admonition 4”; `bl162` (header) “Admonition 5”; `bl164` (header) “Admonition 6”; `bl167` (header) “Admonition 7”; `bl166` (header) “Admonition 8”; `bl169` (header) “Admonition 9”
- … 16 more in the TSV

### Additional Prayers Revealed by ‘Abdu’l-Bahá (`additional-prayers-revealed-by-abdu-l-baha_en`)

**Opening invocations carrying a number** (4)

- `2`: `bl5f` “He is God.”
- `4`: `bl5j` “He is God.”
- `6`: `bl5n` “He is God.”
- `9`: `bl5s` “He is God!”

### Shri Guru Granth Sahib Volume 3 (`shri_guru_granth_sahib_volume_3_en`)

**Opening invocations carrying a number** (4)

- `1.44`: `blmb` “He is the One God, abiding within all. Through the Guru’s Teachings, He is revealed in the heart. On”
- `7.142`: `bl1rk` “He is the Giver of wealth, Dharmic faith, pleasure and liberation.”
- `10.589`: `bl2rt` “He is the Inner-knower, the Searcher of hearts, the Giver of souls; gazing upon Him, I am satisfied ”
- `10.590`: `bl2rs` “He is the One Universal Creator Lord, immaculate and fearless; He is permeating and pervading all th”

### The Analects (`theanalects_ocean_confucius_en`)

**Header numbers colliding with another block** (20)

- `3.2`: `bl1l8` (struct) “”; `bl6s` (content) “The Three Families were in the habit, during the Removal of the sacred”
- `5.7`: `bl1l9` (struct) “”; `bl8y` (content) ““Good principles are making no progress,” once exclaimed the Master. “”
- `1`: `bl4r` (header) “BOOK I”; `bl4s` (header) “On Learning — Miscellaneous Sayings:”
- `3`: `bl5t` (header) “Good Government — Filial Piety — The Superior Man”; `bl6p` (header) “BOOK III”
- `4`: `bl6q` (header) “Abuse of Proprieties in Ceremonial and Music”; `bl7s` (header) “BOOK IV”
- … 15 more in the TSV

### Vendīdād (`avesta_vendidad_zoroastrianism_ocean_en`)

**Header numbers colliding with another block** (17)

- `3`: `bl40` (header) “Yima (Jamshēd).”; `bl4u` (header) “II.”; `bl5s` (header) “Fargard III.”
- `4`: `bl42` (header) “I.”; `bl5t` (header) “The Earth.”; `bl5v` (header) “[pg 22] I.”; `bl65` (header) “II.”; `bl6g` (header) “III.”; `bl78` (header) “IV.”; `bl7n` (header) “Fargard IV.”
- `5`: `bl7o` (header) “Contracts and Outrages.”; `bl7s` (header) “II a.”; `bl7v` (header) “II b.”; `bl7y` (header) “II c.”; `bl8a` (header) “II d.”; `bl8n` (header) “III a.”; `bla0` (header) “II e”; `bla3` (header) “III b.”; `blak` (header) “Fargard V.”
- `6`: `bl7q` (header) “[pg 34] I.”; `blam` (header) “I a.”; `blar` (header) “I b.”; `blav` (header) “II a.”; `blay` (header) “II b.”; `blb8` (header) “IV.”; `blbf` (header) “V”; `blbo` (header) “VI.”; `blc7` (header) “VII.”; `blce` (header) “VIII.”; `blcy` (header) “Fargard VI.”
- `7`: `blcz` (header) “I.”; `blda` (header) “II.”; `bldp` (header) “III.”; `ble6` (header) “IV.”; `ble9` (header) “V.”; `blej` (header) “Fargard VII.”
- … 12 more in the TSV

### Prayer and Devotional Life (`prayer_and_devotional_life_ocean_en`)

**Header numbers colliding with another block** (17)

- `2`: `bl9y` (header) “— 1 —”; `bl3q` (header) “Communion with God”
- `3`: `bl9z` (header) “— 2 —”; `blal` (header) “— 15 —”; `bl4m` (header) “The Spirit and Form of Prayer”
- `4`: `bla0` (header) “— 3 —”; `blam` (header) “— 16 —”; `blb0` (header) “— 30 —”; `bl5b` (header) “The Role of Meditation”
- `5`: `blaa` (header) “— 4 —”; `blan` (header) “— 17 —”; `blb1` (header) “— 31 —”; `blbc` (header) “— 42 —”; `bl62` (header) “Prayer, Meditation, and Action”
- `6`: `blab` (header) “— 5 —”; `blao` (header) “— 18 —”; `blb2` (header) “— 32 —”; `blbd` (header) “— 43 —”; `blbi` (header) “— 48 —”; `bl6j` (header) “Obligatory Prayers”
- … 12 more in the TSV

### Ḥuqúqu’lláh — The Right of God (`uququ_llah_the_right_of_god_ocean_en`)

**Header numbers colliding with another block** (17)

- `1`: `bl2w` (content) “April 2007 Amended August 2009”; `bl2u` (header) “Foundations of the Law of Ḥuqúqu’lláh”; `bl2y` (header) “Extracts from the Writings of Bahá’u’lláh”; `blct` (header) “— 1 —”
- `22`: `bl4k` (header) “Extracts from the Writings Of ‘Abdu’l-Bahá”; `bl4f` (header) “— 22 —”
- `26`: `bl53` (header) “Extract from a Letter Written on Behalf of Shoghi Effendi”; `bl5i` (header) “— 26 —”
- `27`: `bl57` (header) “Extracts from Letters Written by and on Behalf of the Universal House ”; `bl5n` (header) “— 27 —”
- `32`: `bl6t` (header) “Application of the Law of Ḥuqúqu’lláh”; `bl5j` (header) “Extracts from the Writings of Bahá’u’lláh”; `bl87` (header) “— 32 —”
- … 12 more in the TSV

### The Li Ki Part I (`li_ki_part_i_en`)

**Header numbers colliding with another block** (16)

- `1`: `bl3b` (content) “A Collection of Treatises on the Rules of Propriety or Ceremonial Usag”; `blc3` (header) “Book I. Khü Lî. Summary of the Rules of Propriety”
- `3`: `bl39` (header) “Three Different Lî King, or Ritual Books, Acknowledged in China. The R”; `blyq` (header) “Book III. The Royal Regulations”; `bl16j` (header) “Part II”
- `5`: `bl4w` (header) “Significance of the Chinese Character Called Lî. Meaning of the Title ”; `bl1h0` (header) “Book V. The Questions of Zang-Dze”
- `7`: `bl5r` (header) “Brief Notices of the Different Books Which Make up the Collection.”; `bl19h` (header) “Part II”; `bl1pk` (header) “Book VII. The, Lî Yun Or Ceremonial Usages; Their Origin, Development,”
- `8`: `bl5s` (header) “Book I. Khü Lî”; `bl1ag` (header) “Part III”; `bl1t7` (header) “Book VIII. The Lî Khî Or Rites in the Formation of Character”
- … 11 more in the TSV

### Shri Guru Granth Sahib Volume 1 (`shri_guru_granth_sahib_volume_1_en`)

**Opening invocations carrying a number** (2)

- `7.1342`: `bl2j5` “He is the Support of the breath of life; He is my Wealth. Abiding within my heart, He inspires me to”
- `7.1368`: `bl2jw` “He is the Master of the masterless, Merciful to the meek, All-powerful, the Support of His Saints. |”

**Header numbers colliding with another block** (6)

- `2`: `bl2u` (header) “Section 01 — Jup — Part 001”; `bl4a` (header) “Shri Guru Granth Sahib: so Dar”
- `3`: `bl2z` (header) “Section 01 — Jup — Part 002”; `bl4n` (header) “Shri Guru Granth Sahib: So Purakh”
- `4`: `bl37` (header) “Section 01 — Jup — Part 003”; `bl55` (header) “Shri Guru Granth Sahib: Sohila”
- `5`: `bl3g` (header) “Section 01 — Jup — Part 004”; `bl5u` (header) “Shri Guru Granth Sahib: Siree Raag”
- `6`: `bl3m` (header) “Section 01 — Jup — Part 005”; `blvj` (header) “Shri Guru Granth Sahib: Raag Maajh”
- … 1 more in the TSV

### RESPOSTAS A ALGUMAS PERGUNTAS (`respostas_a_algumas_perguntas_pt`)

**Header numbers colliding with another block** (14)

- `1`: `bl3r` (header) “´ABDU´L-BAHÁ”; `bl3s` (content) “´Abdu´l-Bahá, filho mais velho do Profeta Fundador da Fé Bahá´í Mundia”; `blys` (header) “Parte I”; `bl51` (header) “A Influência Dos Profetas Na Evolução Da Humanidade”; `bl52` (header) “I Toda a Natureza É Governada Por Uma Lei Universal”
- `2`: `bl3t` (content) “Bahá´u´lláh nomeara a ´Abdu´l-Bahá Intérprete de Seus ensinamentos e E”; `bl59` (header) “II Evidências E Provas Da Existência De Deus”
- `3`: `bl3u` (content) “´Abdu´l-Bahá almoçou na casa do Tesoureiro dos Estados Unidos, foi con”; `bl5k` (header) “III a Necessidade De Um Educador”
- `4`: `bl3v` (content) “Ao regressar para Sua residência em Haifa, ´Abdu´l-Bahá cuidou dos múl”; `bl65` (header) “IV Abraão”
- `5`: `bl3w` (content) “Em volta da mesa hospitaleira de ´Abdu´l-Bahá reuniam-se representante”; `bl6c` (header) “V Moisés”
- … 9 more in the TSV

### Sutra Collection (L) (`sutra_collection_l_ocean_buddhism_en`)

**Header numbers colliding with another block** (13)

- `2`: `bl3a` (header) “The Quail Simile”; `bl4i` (header) “Lakkhana Sutta”
- `3`: `bl4j` (header) ““The Marks of a Great Man””; `bl83` (header) “The Lankavatara Sutra”
- `4`: `blzh` (header) “Dream World {A Commentary}”; `bl85` (header) “Chapter I: Discrimination”; `bl8t` (header) “Chapter II: False-Imaginations and Knowledge of Appearances”; `bl9o` (header) “Chapter III: Right Knowledge or Knowledge of Relations”; `bla7` (header) “Perfect Knowledge or Knowledge of Reality”; `blam` (header) “Chapter V: The Mind System”; `blb9` (header) “Chapter VI: Transcendental Intelligence”; `blbq` (header) “Chapter VII: Self-Realization”; `blci` (header) “Chapter VIII: The Attainment of Self-Realization”; `blcz` (header) “Chapter IX: The Fruit of Self-Realization”; `bldj` (header) “Chapter X: Discipleship: Lineage of the Arhats”; `bldw` (header) “Chapter XI: Bodhisattva-Hood and Its Stages”; `bled` (header) “Chapter XII: Tathágata-Hood, Which is Noble Wisdom”; `blf5` (header) “Chapter XIII: Nirvana”; `blfp` (header) “Introduction to the Kevaddha Sutta”
- `5`: `blga` (header) “The Three Wonders And The Gods”; `blic` (header) “The Lekha Sutta”
- `7`: `blik` (header) “Prologue”; `bliq` (header) “Chapter One: Eliminating All Doubts”; `bljp` (header) “Chapter Two: Deciding the Cause”; `blkn` (header) “Chapter Three: Clarifying the Final Meaning”; `blmb` (header) “Chapter Four: Entering the One Vehicle Path”; `blmm` (header) “Epilogue”; `blmr` (header) “The Great Discourse on the Lion’s Roar”
- … 8 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `3.1`: `bl87` (lead-in) “Thus have I heard:”; `bl88` (content) “The Blessed One once appeared in the Castle of Lanka, which is on the ”
- `14.1`: `blw8` (lead-in) “I heard thus:”; `blw9` (content) “At one time the Blessed One was living in the monastery offered by Ana”

### “By the Fig and the Olive” ‘Abdu’l-Bahá’s Commentary in Ottoman Turkish on the Qur’ánic Sura 95 (`by_fig_and_olive_abdu_l_baha_s_commentary_sura_95_ca44c9552f2257275814069351152859`)

**Opening invocations carrying a number** (2)

- `2`: `bl2u` “In the name of God, Most Gracious, Most Merciful”
- `4.1`: `bl4c` “He is God!”

**Header numbers colliding with another block** (3)

- `1`: `bl2t` (content) “Sura 95, Tín (the Fig)”; `bl38` (header) “The Islamic Context”
- `2`: `bl2u` (content) “In the name of God, Most Gracious, Most Merciful”; `bl3u` (header) “Biblical Background”
- `3`: `bl2v` (content) “By the Fig and the Olive, 2. And the Mount of Sinai, 3. And this City ”; `bl3y` (header) “‘Abdu’l-Bahá’s Commentary on Sura 95”

### Hymns of the Samaveda (`samaveda_hinduism_ocean_en`)

**Header numbers colliding with another block** (13)

- `1`: `bl2u` (header) “Book I”; `bl2v` (header) “Chapter I”; `bl2w` (content) “Om. Glory to the Samaveda! To Lord Ganesa glory! Om.”
- `1.2`: `bl37` (header) “Chapter II”; `bl38` (header) “DECADE I Agni”
- `12`: `bl3i` (header) “Book II”; `blir` (header) “Book VI”; `blis` (header) “Chapter I”
- `2.2`: `bl3u` (header) “Chapter II”; `bl3v` (header) “DECADE I Indra and Others”
- `3.2`: `bl4g` (header) “Chapter II”; `bl4h` (header) “DECADE I Indra”
- … 8 more in the TSV

### The Qur’an Commentary of Sayyid ‘Alí Muhammad, the Báb: Doctoral Dissertation (`the_qur_an_commentary_of_sayyid_ali_muhammad_the_b9786d3192fbeba2c78776b3f284cf841`)

**Header numbers colliding with another block** (13)

- `b.3`: `bl4z` (header) “Al-Sáfí”; `bl58` (header) “Al-Burhán”; `bl67` (header) “Núr Al-Thaqalayn”; `bl6a` (header) “Anwár”; `bl75` (header) “Background 3 - The Shaykhí School”
- `b.4`: `bl7g` (header) “Shaykhí Teachings”; `bl7i` (header) “The Perfect Shí’a, the Fourth Support”; `bl7p` (header) “‘Álam Al-Mithál”; `bl81` (header) “Background 4 - Tasawwuf”
- `b.7`: `bl8o` (header) “Other Tafásír”; `bl8w` (header) “Major Tafásír”
- `2`: `bla4` (header) “B. L. 5277”; `bla6` (header) “B. N. 6610”; `bla8` (header) “B. N. 5805”; `blab` (header) “Manuscripts Consulted for This Study”; `blss` (header) “Part II”
- `1.2`: `blal` (header) “Absolute Walaya”; `blas` (header) “True Walaya”; `blca` (header) “Walaya of the First, Second, and Third”; `ble2` (header) “Conclusion”; `blep` (header) “Chapter 2: Hierarchies - 1 (Tetrads)”
- … 8 more in the TSV

### Rig Veda. Book 10 (`rigveda_10_hindu_ocean_en`)

**Header numbers colliding with another block** (12)

- `1`: `bl1q2` (struct) “”; `bl2s` (header) “HYMN I. Agni.”
- `2`: `bl31` (header) “HYMN II. Agni.”; `blqk` (content) “The Son of Aṅgirases, meeting the cattle, as Bhaga, brought in Aryaman”
- `3`: `bl3a` (header) “HYMN III. Agni.”; `blql` (content) “Bṛhaspati, having won them from the mountains, strewed down, like barl”
- `4`: `bl3j` (header) “HYMN IV. Agni.”; `blqm` (content) “As the Sun dews with meath the seat of Order, and casts a flaming mete”
- `5`: `bl3s` (header) “HYMN V. Agni.”; `blqn` (content) “Forth from mid air with light he dravc the darkness, as the gale blows”
- … 7 more in the TSV

### Bahá’í World Faith (‘Abdu’l-Bahá section) (`baha_i_world_faith_en`)

**Opening invocations carrying a number** (1)

- `38.1`: `ble7` “He is the All-Glorious.”

**Header numbers colliding with another block** (7)

- `1`: `bluq` (struct) “”; `bl3h` (header) “MANKIND IS IN DANGER”
- `2`: `blum` (struct) “”; `bl3n` (header) “I HAVE COME WITH THIS MISSION”
- `20`: `bl9g` (header) “CHAPTER SEVEN: SOUL, MIND AND SPIRIT”; `bl9h` (header) “THE ORIGIN OF MAN”
- `38`: `ble5` (header) “CHAPTER EIGHT: THE LOOM OF REALITY”; `ble6` (header) “HIS DEATHLESS SPLENDOR”
- `102`: `blko` (header) “UNDERSTANDING THE MYSTERIES”; `blkr` (header) “REINCARNATION”
- … 2 more in the TSV

### The Mahabharata 3 (`mahabharata_3_hinduism_ocean_en`)

**Header numbers colliding with another block** (11)

- `1`: `bl1bq` (header) “Book 3: Vana Parva”; `bl2t` (header) “Section I”
- `2`: `bl1bt` (header) “(Aranyaka Parva)”; `bl35` (header) “Section II”
- `13`: `bl5c` (header) “(Arjunabhigamana Parva)”; `bl5n` (header) “Section XIII”
- `39`: `bl8f` (header) “(Kairata Parva)”; `bl8l` (header) “Section XXXIX”
- `43`: `bl96` (header) “(Indralokagamana Parva)”; `bl9c` (header) “Section XLIII”
- … 6 more in the TSV

### The Mahabharata 2 (`mahabharata_2_hinduism_ocean_en`)

**Header numbers colliding with another block** (11)

- `1`: `blhf` (header) “Book 2: Sabha Parva”; `bl2t` (header) “Section I”
- `1.1`: `blhh` (struct) “”; `bl2v` (content) “Om! After having bowed down to Narayana, and Nara, the most exalted ma”
- `2`: `bl2u` (header) “(Sabhakriya Parva)”; `bl32` (header) “Section II”
- `6`: `bl3d` (header) “(Lokapala Sabhakhayana Parva)”; `bl3n` (header) “Section VI”
- `15`: `bl4p` (header) “(Rajasuyarambha Parva)”; `bl4s` (header) “Section XV”
- … 6 more in the TSV

### Hayat Al-Qulub Vol.2 (`hayat_al_qulub_vol_2_islam_ocean_en`)

**Opening invocations carrying a number** (1)

- `23.4.57`: `bl4s0` ““In the Name of Allah, the Beneficent, the Merciful. I swear by time that most surely man is in loss”

**Header numbers colliding with another block** (5)

- `2.5`: `blv0` (header) “Prophet’s Honorable Names and the Description of His Finger Ring, Arms”; `blv1` (header) “Description of Prophet’s Honorable Names”
- `2.7`: `blxh` (header) “Description of Prophet’s Finger-Ring, Clothes, Conveyance and Other Be”; `blxw` (header) “Meaning of ‘Yateem’ ‘Zaall’ and ‘Aail’”
- `3.9`: `bl1hu` (header) “Miracles Similar to All Prophets Were Shown by the Holy Prophet (S)”; `bl1vf` (header) “Miracles Related to the Celestial World”; `bl1wk` (header) “Miracles Manifested in Terrestrial Objects”; `bl20d` (header) “Miracles Manifested in Children and Animals”; `bl239` (header) “Miracles of Raising the Dead, Talking to Them, Healing the Sick Etc.”; `bl27h` (header) “Miracles Averting the Harm of Enemies”; `bl2a4` (header) “Miracles of Prophet against Demons and Jinns”; `bl2c5` (header) “The Prophet (S) Reports about the Unseen”
- `22.2`: `bl4m9` (header) “Part Two: Deputation of Amirul Momineen (a.s.) to Yemen”; `bl4mc` (header) “Amr Bin Shas Complains about Amirul Momineen (a.s.)”
- `22.3`: `bl4mh` (header) “The Prophet Prays for Imam Ali (a.s.)”; `bl4mp` (header) “Part Three: Arrival of Arab Delegations and Events That Occurred till ”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `8.1.71`: `bl3d9` (lead-in) “بَلِ اللَّهُ مَوْلَاكُمْ ۖ وَهُوَ خَيْرُ النَّاصِرِينَ”; `bl3da` (content) ““Nay! Allah is your Patron and He is the best of the helpers.””

### Avicenna: His Life and Works (`avicenna_his_life_and_works_islam_ocean_en`)

**Header numbers colliding with another block** (9)

- `1`: `bl35` (header) “Introduction”; `bl8r` (header) “Chapter I Persia in the Tenth Century”; `bl8t` (content) “THE age of Avicenna differed from that of Kindī and Fārābī. When the U”
- `2`: `bl8u` (content) “Decline had set in over the ‘Abbāsid Caliphate; and the weakening of c”; `blax` (header) “Chapter II Life and Works of Avicenna”
- `3`: `bl8v` (content) “The first to establish their authority, preserving only a nominal alle”; `blck` (header) “Chapter III Problems of Logic”
- `4`: `bl8z` (content) “During this period there was a revolt against the Caliph in Ṭabaristān”; `bldq` (header) “Chapter IV Problems of Metaphysics”
- `5`: `bl90` (content) “It was left to a humble coppersmith to revive the true spirit of indep”; `blf4` (header) “Chapter V Problems of Psychology”
- … 4 more in the TSV

**Signature / closing lines carrying a number** (1)

- `P.5`: `bl33` (signature) “S. M. Afnan”; `bl34` (content) “Pembroke College, Cambridge, July 1956”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `2.16`: `blbd` (lead-in) “And great once I became, no more would Egypt have me, And when my valu”; `blbe` (content) “Here ends the autobiographical note dictated to Jūzjānī. The life-long”

### Shri Guru Granth Sahib Volume 2 (`shri_guru_granth_sahib_volume_2_en`)

**Opening invocations carrying a number** (2)

- `1.354`: `blt8` “He is the true banker, who gathers the wealth of the Lord within his own home. With this wealth, the”
- `1.526`: `blyc` “He is the Creator, the Cause of causes, the Searcher of hearts. Nanak’s Lord and Master celebrates i”

### Some Answered Questions (`some-answered-questions-prod-version_en`)

**Header numbers colliding with another block** (9)

- `1`: `38` (header) “Author’s Preface to the First Edition”; `3h` (header) “— 1 —”
- `3`: `1542623939734` (header) “On the Influence of the Prophets in the Evolution of Humanity”; `42` (header) “— 3 —”
- `5`: `4o` (header) “Abraham”; `4w` (header) “— 5 —”
- `16`: `1542879348670` (header) “Some Christian Subjects”; `aj` (header) “— 16 —”
- `17`: `ak` (header) “Intelligible Realities and their Expression Through Sensible Forms”; `aw` (header) “— 17 —”
- … 4 more in the TSV

### Additional Tablets, Extracts and Talks (`abdu_l_baha_additional_tablets_extracts_and_talks_430a4c77afa01f6eb5e4f2c4028e655d`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (33)

- `15.1`: `67` (lead-in) “He is God!”; `68` (content) “O thou dear handmaid of God!”
- `19.2`: `71` (lead-in) “He is God!”; `72` (content) “O loved ones of ‘Abdu’l-Bahá!”
- `39.1`: `bl9n` (lead-in) “He is God.”; `bl9o` (content) “O thou Divine youth! Thou hast ever been present in my mind, and at al”
- `40.1`: `bl9r` (lead-in) “He is God.”; `bl9s` (content) “O thou who art attracted to the Beauty of God! On this blessed day, th”
- `41.1`: `bl9y` (lead-in) “He is God.”; `bl9z` (content) “O true friend! Thou art ever before mine eyes, and dearly cherished; b”
- … 28 more in the TSV

### The Institution of the Mashriqu’l-Adhkár (`the_institution_of_the_mashriqu_l_adhkar_ocean_en`)

**Header numbers colliding with another block** (8)

- `1`: `bl2x` (content) “September 2017”; `bl4j` (header) “— 1 —”
- `s.6`: `bl4k` (header) “A Compilation of Extracts from the Writings of Bahá’u’lláh And ‘Abdu’l”; `bl4n` (header) “From the Writings of Bahá’u’lláh”
- `8`: `bl55` (header) “From the Writings Of ‘Abdu’l-Bahá”; `bl9h` (header) “— 8 —”
- `37`: `bl71` (header) “From the Writings of Shoghi Effendi”; `blce` (header) “— 37 —”
- `44`: `bl7h` (header) “From Letters Written on Behalf of Shoghi Effendi”; `blcm` (header) “— 44 —”
- … 3 more in the TSV

### Peace (`peace_compilation_bahai_ocean_en`)

**Header numbers colliding with another block** (8)

- `1`: `bl2s` (header) “Extracts From the Writings of Bahá’u’lláh”; `bl2t` (header) “— 1 —”
- `17`: `bl4c` (header) “Extracts from the Utterances of Bahá’u’lláh”; `bl4d` (header) “— 17 —”
- `18`: `bl4g` (header) “Extracts from the Writings of ‘Abdu’l-Bahá”; `bl4h` (header) “— 18 —”
- `27`: `bl5q` (header) “Extracts from the Utterances of ‘Abdu’l-Bahá”; `bl5r` (header) “— 27 —”
- `46`: `bl7v` (header) “— 46 —”; `bl7z` (header) “Extracts from the Writings of Shoghi Effendi”
- … 3 more in the TSV

### Pahlavi Texts, Part III (`pahlavi_texts_part_iii_zoroastrianism_ocean_en_en`)

**Opening invocations carrying a number** (1)

- `3.i.1`: `bl1g0` “In the name of Hôrmazd, the lord, the greatest and wise, the all-ruling, all knowing, and almighty.”

**Header numbers colliding with another block** (3)

- `i.4`: `bl264` (header) “Abbreviations Used in This Volume”; `bl1fz` (header) “Introduction”
- `1.1`: `bl50` (content) “THROUGH the name and power and assistance of the creator Aûharmazd, th”; `bl51` (header) “Chapter I”
- `1.34`: `bl21o` (struct) “”; `blgz` (header) “Chapter XXXIV”

### Statement to the Special U.N. Committee on Palestine, 1947 (`special_un_committee_on_palestine_1947_bahai_ocean11ae336bb52626b3cf292e0e8c2e4461`)

**Header numbers colliding with another block** (8)

- `3`: `bl3v` (struct) “”; `bl34` (content) “Though sprung from Shí‘ah Islám, and regarded, in the early stages of ”
- `5`: `bl3w` (struct) “”; `bl37` (content) “The aim of Bahá’u’lláh, the Prophet of this new and great age which hu”
- `7`: `bl3x` (struct) “”; `bl3a` (content) “The Bahá’í Faith upholds the unity of God, recognizes the unity of His”
- `8`: `bl3y` (struct) “”; `bl3c` (content) “The Bahá’í Faith revolves around three central Figures, the first of w”
- `9`: `bl3z` (struct) “”; `bl3e` (content) “Mírzá Ḥusayn-‘Alí, surnamed Bahá’u’lláh (the Glory of God), a native o”
- … 3 more in the TSV

### A Treatise On Jainism (`treatise_on_jainism_janaism_ocean_en`)

**Header numbers colliding with another block** (7)

- `1.1`: `bl2x` (header) “The Jain Religion”; `bl2y` (content) “The religion which enjoins adoration and worship of Jinas or the relig”
- `2.1`: `bl3s` (header) “The Theory of Karma (Law of Causation)”; `bl3u` (content) “Everyone in this world desires happiness and dislikes misery, but we f”
- `3.1`: `bl75` (header) “The Six Dravyas (Substances)”; `bl76` (content) “We now look at the Six Dravyas, or fundamental substances, their attri”
- `4.1`: `bl8x` (header) “The Seven Tatvas (Principles)”; `bl8y` (content) “The Tatvas or the Principles are seven:”
- `5.1`: `ble9` (header) “The Fourteen Gunasthanas (SPIRITUAL STAGES)”; `bleb` (content) “According to Jain Philosophy there are 14 Spiritual Stages (Gunasthana”
- … 2 more in the TSV

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `2.1.69`: `bl5q` (lead-in) “Vaikrjyika - The fluid body of hellish and celestial beings which they”; `bl5r` (lead-in) “Aharaka - Assimilative, the spiritual man like emanation from the head”; `bl5s` (lead-in) “Taijasa - Electric body of mundane souls which always accompanies the ”; `bl5t` (content) “Karmana - Karmic body found in all mundane souls.”
- `2.1.71`: `bl5w` (lead-in) “Vaikriyika - fluid”; `bl5x` (content) “Aharaka - assimilative”

### Days of Remembrance (`days_of_remembrance_ocean_en`)

**Header numbers colliding with another block** (7)

- `5`: `1551373470093` (header) “-5-”; `4j` (header) “Riḍván”
- `24`: `1551370226119` (header) “-24-”; `bu` (content) “It is the Festival of Riḍván, the vernal season wherein the Beauty of ”; `1551370297719` (header) “-25-”
- `28`: `1551375847288` (header) “-28-”; `ek` (header) “Ascension of Bahá’u’lláh”
- `33`: `1551380145103` (header) “-33-”; `gn` (header) “Martyrdom of the Báb”
- `37`: `1551381075060` (header) “-37-”; `hp` (content) “O Salmán! Say: O people! Tread ye in the path of the one true God and ”; `1551381825331` (header) “-38-”
- … 2 more in the TSV

### The Gospel of Buddha (`gospel_of_buddha_en`)

**Header numbers colliding with another block** (7)

- `4`: `bl73` (header) “Prince Siddhattha Becomes Buddha”; `bl75` (header) “IV. The Bodhisatta’s Birth”
- `15`: `ble6` (header) “The Foundation of the Kingdom of Righteousness”; `ble8` (header) “XV. Upaka”
- `30`: `blnk` (header) “Consolidation of the Buddha’s Religion”; `blnm` (header) “XXX. Jīvaka, the Physician”
- `50`: `blxa` (header) “The Teacher”; `bl107` (header) “L. Guard the Six Quarters”
- `62`: `bl185` (header) “Parables and Stories”; `bl187` (header) “LXII. Parables”
- … 2 more in the TSV

### The Yoga Sutras of Patanjali (`yoga_sutras_of_patanjali_gutenberg_hinduism_ocean_40d450a643f725b9e4e909c3d70dfe6e`)

**Opening invocations carrying a number** (1)

- `1.52`: `bl4s` “He is the Teacher of all who have gone before, since he is not limited by Time.”

**Header numbers colliding with another block** (2)

- `1`: `bl2v` (header) “An Interpretation by”; `bl3c` (header) “BOOK I”
- `1.1`: `bljg` (struct) “”; `bl3d` (content) “Here follows Instruction in Union.”

### The Improvement of Human Reason (`the_improvement_of_human_reason_islam_ocean_en`)

**Opening invocations carrying a number** (1)

- `i.1`: `bl48` “In the Name of the most Merciful God.”

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (header) “Exhibited in the Life of Hai Ebn Yokdhan”; `bl3h` (content) “To the Reverend”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `1.1`: `bl3i` (lead-in) “Mr. Edward Pococke,”; `bl3j` (lead-in) “Rector of”; `bl3k` (lead-in) “MINAL, in Wiltshire.”; `bl9z` (lead-in) “Reverend SIR,”; `bl3l` (content) “Hai Ebn Yokdhan returns to you again, in a Dress different from that w”
- `1.3`: `bla0` (lead-in) “I am,”; `bla1` (lead-in) “SIR,”; `bla2` (content) “Your most humble Servant,”

### Centres of Bahá’í Learning (`centres_of_bahai_learning_bahai_ocean_en`)

**Header numbers colliding with another block** (4)

- `14`: `bl4u` (header) “Administration”; `bl4v` (header) “— 14 —”
- `41`: `bl7s` (source) “From a letter 22 November 1941 written on behalf of Shoghi Effendi to ”; `bl7t` (header) “— 41 —”
- `42`: `bl7v` (source) “From a letter 5 June 1947 written by Shoghi Effendi to the Bahá’ís of ”; `bl7y` (header) “— 42 —”
- `45`: `bl88` (source) “From a circular letter 14 May 1964 written by the Universal House of J”; `bl89` (header) “— 45 —”

**Source / citation lines carrying a number** (2)

- `21.3`: `bl5m` (content) “I certainly advise you to concentrate next year on “The Dawn-Breakers””; `bl5n` (source) “From a letter 25 September 1933 written on behalf of Shoghi Effendi to”
- `45.2`: `bl8c` (content) “The subjects taught usually consist of Bahá’í History, Laws and Teachi”; `bl8d` (source) “Prepared for inclusion with a letter 24 December 1964 written by the U”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `34.3`: `bl75` (lead-in) “[Postscript in the handwriting of Shoghi Effendi:]”; `bl76` (content) “I wish to urge the necessity of concentrating, at your next summer ses”

### The Promulgation of Universal Peace (`promulgation_of_universal_peace_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `2v` (content) “© Bahá’í International Community”; `2y` (header) “1”

**Source / citation lines carrying a number** (5)

- `39.3`: `gc` (source) “(To the Friends)”; `gd` (content) “I am going away, but you must arise to serve the Word of God. Your hea”
- `69.8`: `sr` (source) “(To the children in the Sunday School)”; `ss` (content) “I am glad to see these bright, radiant children. God willing, all of t”
- `70.3`: `t4` (source) “(Afterward, speaking of numbers)”; `t5` (content) “Such suppositions regarding lucky or unlucky numbers are purely imagin”
- `75.4`: `v3` (source) “(To people coming in)”; `v4` (content) “Welcome! Welcome! You are very welcome!”
- `75.5`: `v5` (source) “(The church bells begin to ring)”; `v6` (content) “I was not feeling very well this morning, or I would have gone to chur”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `15.4`: `8l` (lead-in) “Prayer in Persian”; `8m` (content) “It is my hope that the supplication I have offered to the Kingdom of A”

### Rig Veda. Book 4 (`rig_veda_4_hinduism_ocean_en`)

**Opening invocations carrying a number** (1)

- `8.4`: `bl6a` “He is the Herald: well-informed, he doth his errand to and fro, Knowing the deep recess of heaven.”

**Header numbers colliding with another block** (1)

- `1`: `blmh` (struct) “”; `bl2s` (header) “HYMN I. Agni.”

### Buddhist Prayers (`buddhist_prayers_buddhism_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `2t` (header) “An Invocation of Metta / Compassion”; `2u` (content) “As we all gather here today in friendship and community, taking a mome”; `31` (header) “Praise to Buddha Shakyamuni”; `3b` (header) “The Buddha’s Words on Kindness (Metta Sutta)”; `3f` (header) “Golden Chain Prayer”; `3l` (header) “Meal Time Prayer”; `3q` (header) “Tibetan Buddhist Mealtime Prayer”; `3u` (header) “Traditional Buddhist Prayer”

**Signature / closing lines carrying a number** (5)

- `7`: `30` (signature) “Thilini Ariyachandra”; `32` (content) “O Blessed One, Shakyamuni Buddha Precious treasury of compassion, Best”
- `15`: `3a` (signature) “Author Unknown”; `3c` (content) “This is what should be done By one who is skilled in goodness, And who”
- `19`: `3e` (signature) “Author Unknown”; `3i` (content) “We will think pure and beautiful thoughts, say pure and beautiful word”
- `21`: `3k` (signature) “Buddha”; `3m` (content) “This food is the gift of the whole universe, Each morsel is a sacrific”
- `25`: `3p` (signature) “Author Unknown”; `3s` (content) “To the precious Buddha, unsurpassable Teacher, to the precious Dharma,”

### Commentary on the Surah of the Sun (`commentary_on_the_surah_of_the_sun_bahai_ocean_en`)

**Opening invocations carrying a number** (1)

- `1`: `bl34` “In the Name of God, the Merciful, the Compassionate”

**Source / citation lines carrying a number** (1)

- `1`: `bl33` (source) “(Revised 4 April 1994)”; `bl34` (content) “In the Name of God, the Merciful, the Compassionate”

### The Rosenberg Tablet (`the_rosenberg_tablet_bahai_ocean_en`)

**Opening invocations carrying a number** (1)

- `1`: `bl2z` “He is God! O thou dear handmaid of God!”

**Header numbers colliding with another block** (1)

- `1`: `bl2y` (header) “1906”; `bl2z` (content) “He is God! O thou dear handmaid of God!”

### Psalms (`psalms-ot_en`)

**Opening invocations carrying a number** (1)

- `105:7`: `1j7` “He is the LORD our God: his judgments are in all the earth.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `55:20`: `sh` (lead-in) “Selah. Because they have no changes, therefore they fear not God.”; `si` (content) “He hath put forth his hands against such as be at peace with him: he h”
- `142:4`: `242` (lead-in) “In the way wherein I walked have they privily laid a snare for me.”; `243` (content) “I looked on my right hand, and beheld, but there was no man that would”

### The Bustan of Saadi (`the_bustan_of_sadi_islam_ocean_en`)

**Opening invocations carrying a number** (1)

- `p.1.1`: `bl3y` “In the name of Him Who created and sustains the world, the Sage Who endowed tongue with speech.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `n.2`: `bl2z` (lead-in) “L. CRANMER-BYNG. S. A. KAPADIA.”; `bl30` (content) “Northbrook Society, 21 Cromwell Road, Kensington, S.W.”

### 2 Samuel (`9-samuel-2-ot_en`)

**Opening invocations carrying a number** (1)

- `22:51`: `im` “He is the tower of salvation for his king: and sheweth mercy to his anointed, unto David, and to his”

### Job (`job-ot_en_en`)

**Opening invocations carrying a number** (1)

- `40:19`: `nx` “He is the chief of the ways of God: he that made him can make his sword to approach unto him.”

### The Mahabharata 6 (`mahabharata_6_hindu_ocean_en`)

**Header numbers colliding with another block** (5)

- `1`: `bljd` (header) “Book 6: Bhishma Parva”; `2t` (header) “Section I”
- `1.1`: `bljc` (struct) “”; `2v` (content) “OM! HAVING BOWED down to Narayana, and Nara, the most exalted of male ”
- `2`: `2u` (header) “(Jamvu-khanda Nirmana Parva)”; `30` (header) “Section II”
- `12`: `4k` (header) “(Bhumi Parva)”; `4s` (header) “Section XII”
- `26`: `6i` (header) “(Bhagavad Gita Chapter I)”; `6r` (header) “Section XXVI”

### Feast (`feast_bahai_compilation_ocean_en`)

**Header numbers colliding with another block** (4)

- `10`: `bl42` (header) “— 10 —”; `bl43` (content) “As to the Nineteen Day Feast, it rejoiceth mind and heart. If this fea”
- `11`: `bl44` (source) “‘Selections from the Writings of ‘Abdu’l-Bahá’ . #51, p. 91”; `bl45` (header) “— 11 —”
- `13`: `bl4b` (header) “— 13 —”; `bl4c` (content) “Vigorous steps must be taken to establish the Nineteen Day reception t”
- `14`: `bl4d` (source) “‘Abdu’l-Bahá, from a Tablet to an individual believer — translated fro”; `bl4e` (header) “— 14 —”

**Source / citation lines carrying a number** (1)

- `20.6`: `bl5h` (source) “Statement of the National Spiritual Assembly of the United States and ”; `bl5i` (source) “On behalf of Shoghi Effendi, 6 September 1933 to the National Spiritua”

### Rig Veda. Book 3 (`rigveda_3_hinduism_ocean_en`)

**Opening invocations carrying a number** (1)

- `13.3`: `bl7f` “He is the Sage who guides these men, Leader of sacred rites is he. Him your own Agni, serve ye well,”

### 1 Chronicles (`38-chronicles-1-ot_en`)

**Opening invocations carrying a number** (1)

- `16:14`: `ef` “He is the LORD our God; his judgments are in all the earth.”

### Deuteronomy (`deuteronomy-ot_en`)

**Opening invocations carrying a number** (1)

- `32:4`: `l4` “He is the Rock, his work is perfect: for all his ways are judgment: a God of truth and without iniqu”

### Sura LV. The Merciful (`sura_lv_the_merciful_quran_ocean_en`)

**Opening invocations carrying a number** (1)

- `55:17`: `bl40o` “He is the Lord of the East, He is the Lord of the West: 55:18 Which then of the bounties of your Lor”

### To Set the World in Order: Building and Preserving Strong Marriages (`to_set_the_world_in_order_ocean_en`)

**Header numbers colliding with another block** (5)

- `2`: `bl5x` (header) “— 1 —”; `blby` (header) “— 2 —”
- `13`: `bl41` (header) “Creating Families That Illuminate the World”; `blcf` (header) “— 13 —”
- `31`: `bl55` (header) “The Ideal Milieu for Learning the Principles of Consultation”; `blcx` (header) “— 31 —”
- `40`: `bl66` (header) “Addressing Challenges”; `bldc` (header) “— 40 —”
- `93`: `blas` (header) “Prayers”; `blet` (header) “— 93 —”

### Divrei Yamim A (Book of I Chronicles) (`hebrewbible_1_chronicles_judaism_ocean_en`)

**Opening invocations carrying a number** (1)

- `16:14`: `bldv` “He is the LORD our God; His judgments are in all the earth.”

### Tehillim (Psalms) (`ketuvim_jps_1917_hallel_psalms_en`)

**Opening invocations carrying a number** (1)

- `105:7`: `bl1hx` “He is the LORD our God; His judgments are in all the earth.”

### Eyov (Book of Job) (`ketuvim_jps_1917_iyov_job_en_en`)

**Opening invocations carrying a number** (1)

- `40:19`: `blw6` “He is the beginning of the ways of God; He only that made him can make His sword to approach unto hi”

### ‘Abdu’l-Bahá’s Commentary on the Quránic Verses concerning the Overthrow of the Byzantines: The Stages of the Soul (`abdu_l_baha_s_commentary_qur_anic_verses_overthrow10fed145a1e79efbad132092d6fc1f31`)

**Opening invocations carrying a number** (1)

- `2.1`: `bl3t` “He is the All-Glorious!”

### The Seven Valleys and the Four Valleys (`the_seven_valleys_and_the_four_valleys_bahai_ocean57d037872745fcdc2d5688ad19afa952`)

**Opening invocations carrying a number** (1)

- `1.2`: `bl2u` “IN THE NAME OF GOD, THE MERCIFUL, THE COMPASSIONATE!”

### Additional Taoist Texts (`additional_taoist_texts_en`)

**Header numbers colliding with another block** (4)

- `2`: `bl35` (header) “Text”; `bl4p` (header) “The T‘ai Hsi Ching”
- `3`: `bl4t` (header) “Text”; `bl5a` (header) “The Hsin Yin Ching”
- `4`: `bl5d` (header) “Text”; `bl5i` (header) “The Ta T‘ung Ching”
- `7`: `bl5u` (header) “Text”; `bl60` (header) “A Chapter from the Hung Lieh Chuan, By Huai-Nan Tsze, Prince of Kuang ”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `9.4`: `bl7d` (lead-in) “How to Read the Foregoing Essay.”; `bl7e` (content) “This essay, which deals with the recompenses and retributions insepara”
- `9.10`: `bl7k` (lead-in) “Certain Wonderful Verifications of the Above.”; `bl7l` (content) “When Wang Yuen, a native of Ch‘ien-tang, was still a child, he met wit”

### Original Hebrew of a Portion of Ecclesiasticus (`original_hebrew_of_ecclesiasticus_judaism_ffa_en`)

**Header numbers colliding with another block** (4)

- `2`: `bl2w` (content) “What the general interest reader will find at the core of this otherwi”; `bl4t` (header) “Ben Sira's Proverbs Preserved In Talmudic And Rabbinic Literature”
- `3`: `bl2x` (content) “Production notes: there is much in this document which would be very d”; `bl5z` (header) “XI.”; `bl64` (header) “XII.”; `bl68` (header) “XIII.”; `bl6b` (header) “XIV.”; `bl6e` (header) “XV.”; `bl6h` (header) “XVI.”; `bl6k` (header) “XVII.”; `bl6n` (header) “XVIII.”; `bl6r` (header) “XIX.”; `bl6u` (header) “XX.”; `bl6y` (header) “XXI.”; `bl71` (header) “XXII.”; `bl75` (header) “XXIII.”; `bl7c` (header) “XXV.”; `bl7f` (header) “XXVI.”; `bl7i` (header) “XXVII.”; `bl7m` (header) “XXVIII.”; `bl7p` (header) “XXIX.”; `bl7s` (header) “XXX.”; `bl7v` (header) “XXXI.”; `bl7y` (header) “XXXII.”; `bl81` (header) “XXXIII.”; `bl84` (header) “XXXIV.”; `bl89` (header) “XXXV.”; `bl8c` (header) “XXXVI.”; `bl8i` (header) “XXXVII.”; `bl8n` (header) “XXXVIII.”; `bl8q` (header) “XXXIX.”; `bl8t` (header) “XL.”; `bl8w` (header) “XLI.”; `bl90` (header) “XLII.”; `bl94` (header) “XLIII.”; `bl97` (header) “XLIV.”; `bl9b` (header) “XLV.”; `bl9e` (header) “XLVI.”; `bl9h` (header) “XLVII.”; `bl9k` (header) “XLVIII.”; `bl9n` (header) “XLIX.”; `bl9q` (header) “L.”; `bl9t` (header) “LI.”; `bl9w` (header) “LII.”; `bl9z` (header) “LIII.”; `bla4` (header) “LIV.”; `bla9` (header) “I.V.”; `blac` (header) “LVI.”; `blaf` (header) “LVII.”; `blai` (header) “LVIII.”; `blal` (header) “LIX.”; `blao` (header) “LX.”; `blar` (header) “LXI.”; `blau` (header) “LXII.”; `blay` (header) “LXIII.”; `blb1` (header) “LXIV.”; `blb4` (header) “LXV.”; `blb7` (header) “LXVI.”; `blba` (header) “LXVII.”; `blbe` (header) “LXVIII.”; `blbh` (header) “LXIX.”; `blbm` (header) “LXX.”; `blbp` (header) “LXXI.”; `blbt` (header) “LXXII.”; `bldj` (header) “LXXIV.”; `bldm` (header) “LXXV.”; `bldp` (header) “LXXVI.”; `blds` (header) “LXXVII.”; `bldv` (header) “LXXVIII.”; `bldy` (header) “LXXIX.”; `ble1` (header) “Ecclesiasticus”
- `4`: `bl4u` (header) “I.”; `bl55` (header) “II.”; `bl58` (header) “III.”; `bl5b` (header) “IV.”; `bl5e` (header) “V.”; `bl5h` (header) “VI.”; `bl5m` (header) “VII.”; `ble4` (header) “XXXIX.”; `blew` (header) “XL.”; `blfx` (header) “XLI.”; `blgu` (header) “XLII.”; `blht` (header) “XLIII.”; `blix` (header) “Praise of the Patriarchs”
- `5`: `bl5p` (header) “VIII.”; `bl5s` (header) “IX.”; `bl5v` (header) “X.”; `bliy` (header) “XLIV.”; `blju` (header) “XLV.”; `bllb` (header) “XLVI.”; `blma` (header) “XLVII.”; `blne` (header) “XLVIII.”; `blof` (header) “XLIX.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `1`: `bl2u` (lead-in) “Every bird dwelleth according to his kind, and (so doth) man according”; `bl2v` (content) “This is a scholarly monograph from the late 19th century on one of the”; `bl2y` (header) “Preface”; `bl38` (header) “A List of Works Used”
- `2.1`: `bl4v` (lead-in) “Sir. 3, 21.”; `bl4w` (lead-in) “a.”; `bl4x` (content) “Seadyah in ‏ס״ הגלוי‎ (ed. Harkavy), p. 178, 1. 18, quotes as an extra”

### 2500 Adages of Imam Ali (`adages_islam_ocean_en`)

**Header numbers colliding with another block** (1)

- `3`: `bl3c` (header) “Eloquence:”; `bl3j` (header) “Eloquence of the imam; Adages as an Example”; `bl3q` (header) “Testimonies about the Eloquence of the Imam:”; `blyr` (header) “Adages of Imam Ali (Puh) in Manners of Speech and Silence”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (13)

- `b.1`: `bl30` (lead-in) “In the name of Allah, the Beneficent, the Merciful.”; `bl31` (lead-in) “To”; `bl32` (content) “To the garden of wisdom that had grown up and flooded, and flooded, to”
- `c.9`: `bl3k` (lead-in) “The facts that affected his adages:”; `bl3l` (content) “Maybe one of the most obvious things that affected the adages of the i”
- `1.1`: `bl3w` (lead-in) “The prince of believers (puh) said:”; `bl3x` (content) “Satisfaction is an infinite money.”
- `2.1`: `blwy` (lead-in) “The prince of believers (puh) said:”; `blwz` (content) “The most devilish of brothers for whom formality must be set.”
- `3.1`: `blys` (lead-in) “The prince of believers (puh) said:”; `blyt` (content) “Do not speak to the people about everything you hear, this is enough a”
- … 8 more in the TSV

### The Mahabharata 5 (`mahabharata_5_hindu_ocean_en`)

**Header numbers colliding with another block** (4)

- `1`: `blt8` (header) “Book 5: Udyoga Parva”; `blsh` (header) “Section I”
- `41`: `bl8d` (header) “Section XLI”; `bl8e` (header) “(Sanat-sujata Parva)”
- `72`: `bld4` (header) “Section LXXII”; `bld5` (header) “(Bhagwat Yana Parva)”
- `161`: `blo2` (header) “Section CLXI”; `blo3` (source) “(Uluka Dutagamana Parva)”

### The Mahabharata 15 (`mahabharata_15_hindu_ocean_en`)

**Header numbers colliding with another block** (4)

- `1`: `1557201774714` (header) “BOOK 15: Asramavasika Parva”; `bl81` (struct) “”; `2t` (header) “[pg 1]SECTION I”
- `2`: `2u` (header) “(Asramavasa Parva)”; `2z` (header) “SECTION II”
- `30`: `66` (header) “(Putradarsana Parva)”; `6b` (header) “SECTION XXX”
- `38`: `77` (header) “(Naradagamana Parva)”; `7e` (header) “SECTION XXXVIII”

### Bahá’í Meetings (`bahai_meetings_ocean_en`)

**Header numbers colliding with another block** (4)

- `2`: `bl5f` (header) “— 1 —”; `bl5g` (header) “— 2 —”; `bl5i` (header) “— 4 —”; `bl36` (header) “From the Writings and Utterances of ‘Abdu’l-Bahá”
- `3`: `bl5h` (header) “— 3 —”; `bl5j` (header) “— 5 —”; `bl5k` (header) “— 6 —”; `bl5l` (header) “— 7 —”; `bl5m` (header) “— 8 —”; `bl5n` (header) “— 9 —”; `bl5o` (header) “— 10 —”; `bl3n` (header) “— 11 —”; `bl5p` (header) “— 12 —”; `bl5q` (header) “— 13 —”; `bl3t` (header) “— 14 —”; `bl5r` (header) “— 15 —”; `bl3x` (header) “— 16 —”; `bl3z` (header) “— 17 —”; `bl5s` (header) “— 18 —”; `bl5t` (header) “— 19 —”; `bl48` (header) “— 20 —”; `bl4a` (header) “— 21 —”; `bl5u` (header) “— 22 —”; `bl5v` (header) “— 23 —”; `bl5w` (header) “— 24 —”; `bl5x` (header) “— 25 —”; `bl5y` (header) “— 26 —”; `bl4t` (header) “From the Writings of Shoghi Effendi”
- `4`: `bl5z` (header) “— 27 —”; `bl4w` (header) “From Letters Written on Behalf of Shoghi Effendi to Individual Believe”
- `5`: `bl61` (header) “— 28 —”; `bl62` (header) “— 29 —”; `bl63` (header) “— 30 —”; `bl64` (header) “— 31 —”; `bl65` (header) “— 32 —”

### Stories of the Prophets (`al_anbiya_islam_ocean_en`)

**Header numbers colliding with another block** (4)

- `19`: `bl189` (header) “Elisha’s Mission”; `bl18e` (header) “Prophet Shammil (Samuel)”
- `20`: `bl18f` (header) “The State of the Israelites after Joshua”; `bl19g` (header) “Prophet Dawud (David)”
- `22.2`: `bl1dj` (header) “Isaiah and Hezekiah”; `bl1dm` (header) “Allah Grants More Life to Hezekiah”
- `29`: `bl1h7` (header) “Allah Declares He Has No Son”; `bl1lw` (header) “Prophet Muhammad”

### The Li Ki Part II (`sacred_books_of_china_part_iv_li_ki_en`)

**Header numbers colliding with another block** (4)

- `18`: `blgj` (header) “Book XVIII. Ȝâ Kî or Miscellaneous Records”; `blgm` (header) “Part I”
- `19`: `blhj` (header) “Part II”; `blli` (header) “Book XIX. Sang Tâ Kî or the Greater Record of Mourning Rites”
- `21`: `blir` (header) “Part I”; `blpr` (header) “Book XXI. Kî Î or the Meaning of Sacrifices”
- `22`: `blk8` (header) “Part II”; `blru` (header) “Book XXII. Kî Thung or a Summary Account of Sacrifices”

### Selected Aphorisms And Other Texts (`selected_aphorisms_and_other_texts_of_al_farabi_is1b91d18247d10de64e348918356a2bc0`)

**Header numbers colliding with another block** (4)

- `1`: `bl39` (content) “For Charles “Chick” Evans Jr., Roland F. “Mac” McGuigan, and Thomas Du”; `bl3q` (header) “Selected Aphorisms”
- `4`: `bl5a` (header) “[23] Selected aphorisms that comprise the roots of many of the sayings”; `blp4` (header) “The Harmonization of the Two Opinions of the Two Sages: Plato the Divi”
- `2.3`: `bl1t2` (header) “Enumeration of the Sciences”; `blio` (header) “[102] Chapter Five: On Political Science, The Science of Jurisprudence”
- `4.3`: `blqd` (header) “The Harmonization of the Two Opinions of the Two Sages: Plato the Divi”; `blqe` (header) “[Introduction: What the People of Our Time Claim]”

### Messages to America (`messages_to_america_new_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2v` (content) ““As the end of the First Century of the Bahá’í Era approaches, as the ”; `bl2w` (header) “Nabíl’s Narrative”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (11)

- `6.1`: `bl3c` (lead-in) “Message to 1933 Convention”; `bl3d` (content) “Entire Bahá’í world stirred with expectations to witness results of Am”
- `8.1`: `bl3j` (lead-in) “Message to 1934 Convention”; `bl3k` (content) “American believers’ inspired leadership steadily unfolding to Bahá’ís ”
- `10.1`: `bl3q` (lead-in) “Message to 1935 Convention”; `bl3r` (content) “Heartily reciprocate sentiments conveyed in your message. Appeal to as”
- `15.1`: `bl46` (lead-in) “Message to 1936 Convention”; `bl47` (content) “Convey to American believers abiding gratitude efforts unitedly exerte”
- `21.1`: `bl4q` (lead-in) “Message to 1937 Convention”; `bl4r` (content) “Dual gift providentially conferred upon American Bahá’í community inve”
- … 6 more in the TSV

### Taittriyaka Upanishad (`taittriyaka_upanishad_ocean_en`)

**Header numbers colliding with another block** (3)

- `1`: `2t` (header) “First Vallī,”; `2v` (header) “First Anuvāka.”
- `2`: `2u` (header) “Or, the Chapter on Śīkshā (Pronunciation).”; `4u` (header) “Second Vallī,”
- `3`: `4v` (header) “Or, the Chapter on Ananda (Bliss).”; `6n` (header) “Third Vallī,”

### The Mahabharata 9 (`mahabharata_9_hindu_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `blca` (header) “Book 9: Shalya Parva”; `blcc` (struct) “”; `2s` (header) “Section 1”

**Source / citation lines carrying a number** (2)

- `29.1`: `5t` (source) “(Hrada-pravesa Parva)”; `5u` (content) ““Sanjaya said, ‘After this, the followers of Subala’s son, O monarch, ”
- `32.1`: `6g` (source) “(Gada-yuddha Parva)”; `6h` (content) ““Dhritarashtra said, ‘Thus admonished (by his foes), how, indeed, did ”

### Guidelines for Teaching (`guidelines_for_teaching_bahai_compilation_ocean_en`)

**Header numbers colliding with another block** (3)

- `76`: `bl9w` (header) “— 76 —”; `bl9x` (content) “As we have such wonderful prayers and meditations in our writings, the”
- `77`: `bl9y` (source) “From a letter 4 February 1950 written on behalf of Shoghi Effendi to a”; `bl9z` (header) “— 77 —”
- `84`: `blak` (header) “— 84 —”; `blal` (content) “These people, finding the Bahá’ís sincerely lacking in either prejudic”

### The Importance of Obligatory Prayer and Fasting (`the_importance_of_obligatory_prayer_and_fasting_en`)

**Header numbers colliding with another block** (3)

- `1`: `bl2v` (content) “The Universal House of Justice, in reviewing the further applicability”; `bl2y` (header) “From the Writings of Bahá’u’lláh”
- `2`: `bl2w` (content) “This present selection of newly authorized translations has been drawn”; `bl3k` (header) “From the Writings of ‘Abdu’l-Bahá”
- `3`: `bl2x` (content) “May 2000”; `bl4d` (header) “Prayers by Bahá’u’lláh for the Fast”

### Heaven and Hell (`heaven_and_hell_christianity_ocean_en`)

**Header numbers colliding with another block** (3)

- `16`: `bl6o` (header) “XV. Light and Heat in Heaven”; `bl73` (header) “XVI. The Four Quarters in Heaven”
- `22.9`: `bllz` (struct) “”; `bl8v` (content) “The primary and veriest cause of this is that the Lord is present with”
- `45.12`: `blmm` (struct) “”; `blg9` (content) “That in respect to his interiors man is a spirit there are further evi”

### Kabbalah Neerav (`kabbalah_neerav_ocean_en`)

**Header numbers colliding with another block** (3)

- `3.2`: `blb9` (header) “The Time of Study”; `blbk` (header) “Part III, Chapter 2”
- `3.3`: `blbl` (header) “The Manner of Study”; `blc5` (header) “Part III, Chapter 3”
- `3.4`: `blc6` (header) “From Whom Shall [the Student] Learn?”; `blcg` (header) “Part III, Chapter 4”

### The Shu King or Book of Historical Documents (`sacred_books_of_china_the_shu_king_en`)

**Header numbers colliding with another block** (3)

- `1`: `bl2w` (content) “All the pieces and stanzas in it illustrating the religious views and ”; `bl54` (header) “Part I The Book of Thang”; `bl7t` (header) “Section 1”; `blbj` (header) “Section 1”; `blcb` (header) “Section 1”; `bld0` (header) “Section 1”; `blee` (header) “Section 1”
- `2`: `bl5m` (header) “Part II The Books of Yü”; `bl8x` (header) “Section 2”; `blbn` (header) “Section 2”; `blci` (header) “Section 2”; `bld6` (header) “Section 2”; `blel` (header) “Section 2”
- `3`: `bl7m` (header) “Part III The Books of Hsiâ”; `blbt` (header) “Section 3”; `blcp` (header) “Section 3”; `bldc` (header) “Section 3”; `bleq` (header) “Section 3”

### Songs of Kabîr (`songs_of_kabir_hinduism_ocean_en`)

**Header numbers colliding with another block** (3)

- `1`: `2t` (header) “I”; `2u` (header) “I. 13. Mo Ko Kahân Dhûnro Bande”; `2v` (content) “O SERVANT, where dost thou seek Me? Lo! I am beside thee. I am neither”; `blej` (header) “I. 16. Santan Jât Na Pûcho Nirguniyân”; `31` (header) “III”; `35` (header) “IV”; `blem` (header) “I. 57. Sâdho Bhâî, Jîval Hî Karo Âs’â”; `39` (header) “V”; `3d` (header) “VI”; `3j` (header) “VII”; `blet` (header) “I. 85. Sâdho, Brahm Alakh Lakhâyâ”; `3p` (header) “VIII”; `3t` (header) “IX”; `3x` (header) “X”; `41` (header) “XI”; `42` (header) “I. 131. Nis’ Din Khelat Rahî Sakhiyân Sang”; `45` (header) “XII”; `46` (header) “II. 24. Hamsâ, Kaho Purâtan Vât”; `4a` (header) “XIII”
- `2`: `2x` (header) “II”; `2z` (content) “It is needless to ask of a saint the caste to which he belongs; For th”; `3a` (header) “I. 63. Avadhû, Mâyâ Tajî Na Jây”; `blep` (header) “I. 83. Candâ jhalkai yahi ghat mâhîn”; `bley` (header) “I. 101. Is Ghat Antar Bâg Bagîce”; `blfb` (header) “I. 121. Tohi Mori Lagan Lagâye Re Phakîr Wâ”; `4b` (header) “II. 37. Angadhiyâ Devâ”; `4e` (header) “XIV”; `4l` (header) “II. 57. Jânh Khelat Vasant Riturâj”; `4o` (header) “XVI”; `4p` (header) “II. 59. Jânh, Cet Acet Khambh Dôû”; `4s` (header) “XVII”; `4t` (header) “II. 61. Grah Candra Tapan Jot Varat Hai”; `54` (header) “XVIII”; `55` (header) “II. 77. Maddh Âkas’ Âp Jahân Baithe”; `58` (header) “XIX”; `59` (header) “II. 20. Paramâtam Guru Nikat Virâjatn”; `5c` (header) “XX”; `5d` (header) “II. 22. Man Tu Pâr Utar Kânh Jaiho”; `5g` (header) “XXI”; `5h` (header) “II. 33. Ghar Ghar Dîpak Barai”; `5l` (header) “XXII”; `5m` (header) “II. 38. Sâdho, so Satgur Mohi Bhâwai”; `5p` (header) “XXIII”; `5q` (header) “II. 40. Tinwir Sâñjh Kâ Gahirâ Âwai”; `5t` (header) “XXIV”; `5u` (header) “II. 48. Jis Se Rahani Apâr Jagat Men”; `5x` (header) “XXV”; `5y` (header) “II. 45. Hari Ne Apnâ Âp Chipâyâ”; `61` (header) “XXVI”; `62` (header) “II. 75. Ônkâr Siwae Kôî Sirjai”; `65` (header) “XXVII”; `66` (header) “II. 81. Satgur Sôî Dayâ Kar Dînhâ”; `69` (header) “XXVIII”; `6a` (header) “II. 85. Nirgun Âge Sargun Nâcai”; `6d` (header) “XXIX”; `6e` (header) “II. 87. Kabîr Kab Se Bhaye Vairâgî”; `6j` (header) “II. 95. Yâ Tarvar Men Ek Pakherû”; `6m` (header) “XXXI”; `6n` (header) “II. 100. Nis‘ Din Sâlai Ghâw”; `6q` (header) “XXXII”; `6r` (header) “II. 103. Nâco Re Mero Man, Matta Hoy”; `6u` (header) “XXXIII”; `6v` (header) “II. 105. Man Mast Huâ Tab Kyon Bole”; `6y` (header) “XXXIV”; `6z` (header) “II. 110. Mohi Tohi Lâgî Kaise Chute”; `72` (header) “XXXV”; `73` (header) “II. 113. Vâlam, Âwo Hamâre Geh Re”; `76` (header) “XXXVI”; `77` (header) “II. 126. Jâg Piyârî, Ab Kân Sowai”; `7a` (header) “XXXVII”; `7b` (header) “I. 36. Sûr Parkâs’, Tanh Rain Kahân Pâïye”; `7f` (header) “XXXVIII”; `7j` (header) “XXXIX”; `7k` (header) “I. 59. Sâdho, Yah Tan Thâth Tanvure Ka”; `7n` (header) “XL”; `7o` (header) “I. 65. Avadhû Bhûle Ko Ghar Lâwe”; `7r` (header) “XLI”; `7s` (header) “I. 76. Santo, Sahaj Samâdh Bhalî”; `7w` (header) “XLII”; `7x` (header) “I. 79. Tîrath Men to Sab Pânî Hai”; `80` (header) “XLIII”; `84` (header) “XLIV”; `85` (header) “I. 93. Gagan Math Gaib Nisân Gade”; `88` (header) “XLV”; `89` (header) “I. 97. Sâdho, Ko Hai Kânh Se Âyo”; `8c` (header) “XLVI”; `8d` (header) “I. 98. Sâdho, Sahajai Kâyâ S’odho”; `8g` (header) “XLVII”; `8h` (header) “I. 102. Tarvar Ek MûL Vin Thâdâ”; `8k` (header) “XLVIII”; `8l` (header) “I. 107. Calat Mansâ Acal Kînhî”; `8o` (header) “XLIX”; `8p` (header) “I. 105. Jo Dîsai, so to Hai Nâhîn”; `8s` (header) “L”; `8t` (header) “I. 126. Muralî Bajat Akhand Sadâye”; `8w` (header) “LI”; `8x` (header) “I. 129. Sakhiyo, Ham Hûn Bhâî Vâlamâs’î”; `90` (header) “LII”; `91` (header) “I. 130. Sâîn Vin Dard Kareje Hoy”; `94` (header) “LIII”; `95` (header) “I. 122. Kaum Muralî S’abd S’un Ânand Bhayo”; `98` (header) “LIV”; `99` (header) “I. 112. S’untâ Nahî Dhun Kî Khabar”; `9c` (header) “LV”; `9d` (header) “I. 73. Bhakti Kâ Mârag Jhînâ Re”; `9g` (header) “LVI”; `9h` (header) “I. 68. BhâI Kôî Satguru Sant Kahâwaî”; `9k` (header) “LVII”; `9l` (header) “I. 66. Sâdho, S’abd Sâdhnâ Kîjai”; `9p` (header) “LVIII”; `9q` (header) “I. 63. Pîle PyâLâ, Ho MatwâLâ”; `9t` (header) “LIX”; `9u` (header) “I. 52. Khasm Na Cînhai Bâwari”; `9x` (header) “LX”; `9y` (header) “I. 56. Sukh Sindh Kî Sair Kâ”; `a1` (header) “LXI”; `a5` (header) “LXII”; `a6` (header) “I. 35. Satî Ko Kaun S’ikhâwtâ Hai”; `a9` (header) “LXIII”; `aa` (header) “I. 39. Are Man, Dhîraj Kâhe Na Dharai”; `ad` (header) “LXIV”; `ae` (header) “I. 117. Sâîn Se Lagan Kathin Hai, Bhâî”; `ah` (header) “LXV”; `ai` (header) “I. 22. Jab Main BhûLâ, Re Bhâî”; `al` (header) “LXVI”; `am` (header) “I. 20. Man Na Rangâye”; `ap` (header) “LXVII”; `aq` (header) “I. 9. Nâ Jâne Sâhab Kaisâ Hai”; `at` (header) “LXVIII”; `au` (header) “III. 102. Ham Se Rahâ Na Jây”; `ax` (header) “LXIX”; `ay` (header) “III. 2. Jo Khodâ Masjid Vasat Hai”; `b1` (header) “LXX”; `b2` (header) “III. 9. S’îL Santosh Sadâ Samadrishti”; `b5` (header) “LXXI”; `b6` (header) “III. 13. Sâdh Sangat Pîtam”; `b9` (header) “LXXII”; `ba` (header) “III. 26. Tor Hîrâ Hirâilwâ Kîcad Men”; `bd` (header) “LXXIII”; `be` (header) “III. 26. Âyau Din Gaune Kâ Ho”; `bh` (header) “LXXIV”; `bi` (header) “III. 30. Are Dil, Prem Nagar Kä Ant Na Pâyâ”; `bl` (header) “LXXV”; `bm` (header) “III. 55. Ved Kahe Sargun Ke Âge”; `bp` (header) “LXXVI”; `bq` (header) “III. 48. Tû Surat Nain Nihâr”; `bv` (header) “LXXVII”; `bw` (header) “III. 60. Cal Hamsâ Wâ Des’ Jahân”; `bz` (header) “LXXVIII”; `c0` (header) “III. 63. Kahain Kabîr, S’uno Ho Sâdho”; `c3` (header) “LXXIX”; `c4` (header) “III. 66. Nâ Main Dharmî Nahîn Adharmî”; `c7` (header) “LXXX”; `cb` (header) “LXXXI”; `cc` (header) “III. 74. Pratham Ek Jo Âpai Âp”; `cf` (header) “LXXXII”; `cg` (header) “III. 76. Kahain Kabîr VICâr Ke”; `cj` (header) “LXXXIII”; `ck` (header) “III. 84. Jhî Jhî Jantar Bâjai”; `cn` (header) “LXXXIV”; `co` (header) “III. 89. Mor Phakîrwâ Mângi Jây”; `cr` (header) “LXXXV”; `cw` (header) “LXXXVI”; `cx` (header) “III. 96. JîV Mahal Men S’IV Pahunwâ”; `d0` (header) “LXXXVII”; `d1` (header) “I. 71. Gagan Ghatâ Ghaharânî, Sâdho”; `d4` (header) “LXXXVIII”; `d5` (header) “III. 118. Âj Din Ke Main Jaun Balihârî”; `d8` (header) “LXXXIX”; `d9` (header) “I. 100. KôI S’untâ Hai Jñânî Râg Gagan Men”; `dc` (header) “XC”; `dd` (header) “I. 108. Main Kâ Se Bûjhaun”; `dg` (header) “XCI”; `dh` (header) “III. 12. Samskirit Bhâshâ Padhi Lînhâ”; `dk` (header) “XCII”; `dl` (header) “III. 110. Carkhâ Calai Surat Virahin Kâ”; `do` (header) “XCIII”; `dp` (header) “III. 111. Kotîn Bhânu Candra Târâgan”; `ds` (header) “XCIV”; `dt` (header) “I. 92. Avadhû Begam Des’ Hamârâ”; `dx` (header) “XCV”; `e1` (header) “XCVI”; `e2` (header) “I. 75. Samajh Dekh Man Mît Piyarwâ”; `e5` (header) “XCVII”; `e6` (header) “II. 90. Sâhab Ham Men, Sâhab Tum Men”; `e9` (header) “XCVIII”; `ea` (header) “II. 98. Ritu Phâgun Niyarânî”; `ed` (header) “XCIX”; `ee` (header) “II. 111. Nârad, Pyâr so Antar Nâhî”; `eh` (header) “C”
- `3`: `blek` (header) “I. 57. Sâdho Bhâî, Jîval Hî Karo Âs’â”; `33` (content) “O FRIEND! hope for Him whilst you live, know whilst you live, understa”; `4f` (header) “II. 56. Dariyâ Kî Lahar Dariyâo Hai Jî”; `7g` (header) “I. 50. Bhram Kâ TâLâ Lagâ Mahal Re”; `a2` (header) “I. 48. Sukh Sâgar Men Âîke”; `c8` (header) “III. 69. Satta Nâm Hai Sab Ten Nyârâ”; `cs` (header) “III. 90. Naihar Se Jiyarâ Phât Re”; `ei` (header) “II. 122. Kôî Prem Kî Peng Jhulâo Re”

### The Ethics (`the_ethics_spinoza_ocean_judaism_en`)

**Header numbers colliding with another block** (3)

- `1`: `blxx` (header) “(Ethica Ordine Geometrico Demonstrata)”; `bl2x` (header) “Part I: Concerning God”
- `3.1`: `bldy` (content) “Most writers on the emotions and on human conduct seem to be treating ”; `ble0` (header) “Definitions”
- `3.2`: `bldz` (content) “I do not forget, that the illustrious Descartes, though he believed, t”; `ble5` (header) “Postulates”

### The Mahabharata 11 (`mahabharata_11_hindu_ocean_en`)

**Header numbers colliding with another block** (2)

- `1`: `bl63` (header) “Book 11: Stri Parva”; `bl65` (struct) “”; `2s` (header) “Section 1”; `2t` (header) “Jalapradanika-parva”
- `16`: `4m` (header) “Section 16”; `4n` (header) “Stri-vilapa-parva”

### The Mahabharata 14 (`mahabharata_14_hindu_ocean_en`)

**Header numbers colliding with another block** (2)

- `1`: `blgm` (header) “Book 14: Aswamedha Parva”; `blgo` (struct) “”; `2t` (header) “Section I”
- `17`: `5y` (header) “(Anugita Parva)”; `66` (header) “Section XVII”

### Bahá’í Education (`bahai_education_bahai_ocean_en`)

**Source / citation lines carrying a number** (2)

- `a`: `bl2z` (content) “The newly born babe of that Day excels the wisest and most venerable m”; `bl30` (source) “The Báb, quoted in ‘The Dawn-Breakers: Nabíl’s Narrative of the Early ”
- `2.73.4`: `blcl` (content) “This is what bringeth joy to the heart of ‘Abdu’l-Bahá, cheer and peac”; `blcm` (source) “‘Abdu’l-Bahá, from a Tablet — translated from the Persian”

### Cultural Diversity in the Age of Maturity (`cultural_diversity_in_the_age_of_maturity_bahai_oc2420aa5bec9cdd33e3cc4f85438b734b`)

**Header numbers colliding with another block** (2)

- `20`: `bl53` (header) “— 20 —”; `bl54` (content) “…change is a necessary quality and an essential attribute of this worl”
- `21`: `bl55` (source) “‘Abdu’l-Bahá, cited in “Messages from the Universal House of Justice, ”; `bl56` (header) “— 21 —”

### Excellence in All Things (`excellence_in_all_things_bahai_compilation_ocean_eec37e97a93bd0732649e9012049867ee`)

**Header numbers colliding with another block** (2)

- `43`: `bl6t` (header) “— 43 —”; `bl6u` (content) “If we could perceive the true reality of things we would see that the ”
- `44`: `bl6v` (source) “On behalf of Shoghi Effendi, 5 April 1942 to an individual believer”; `bl6w` (header) “— 44 —”

### Health and Healing (`health_and_healing_bahai_compilation_ocean_en`)

**Header numbers colliding with another block** (2)

- `27`: `bl5o` (header) “— 27 —”; `bl5p` (content) “It is incumbent upon everyone to seek medical treatment and to follow ”
- `28`: `bl5q` (source) “‘Selections from the Writings of ‘Abdu’l-Bahá’ #136, p. 156”; `bl5r` (header) “— 28 —”

### Opposition (`opposition_bahai_compilation_ocean_en`)

**Header numbers colliding with another block** (2)

- `36`: `bl6d` (header) “— 36 —”; `bl6e` (content) “We have every reason to hope and believe that in the future many of th”
- `37`: `bl6f` (source) “From a letter written on behalf of Shoghi Effendi 6 July 1942 to a gro”; `bl6g` (header) “— 37 —”

### The Importance of Prayer, Meditation and the Devotional Attitude (`prayer_meditation_and_the_devotional_attitude_baha6cc9efb4fb5e8323effff4c4fb388976`)

**Header numbers colliding with another block** (1)

- `1`: `bl9c` (struct) “© Bahá’í International Community”; `bl30` (header) “Extracts From the Writings of Bahá’u’lláh”; `bl31` (header) “— 1 —”

**Source / citation lines carrying a number** (1)

- `12.2`: `bl45` (source) “‘Selections from the Writings of the Báb’, p. 94”; `bl47` (content) “The reason why privacy hath been enjoined in moments of devotion is th”

### Preserving Bahá’í Marriages (`preserving_bahai_marriages_bahai_ocean_en`)

**Header numbers colliding with another block** (2)

- `15`: `bl4j` (header) “— 15 —”; `bl4k` (content) “The Bahá’í Teachings do not only encourage marital life, considering i”
- `16`: `bl4l` (source) “15 April 1939 written on behalf of Shoghi Effendi to an individual bel”; `bl4m` (header) “— 16 —”

### Doctrine and Covenants (`doctrine_and_covenants_christianity_ocean_en`)

**Header numbers colliding with another block** (2)

- `2`: `bl2v` (header) “WITH SOME ADDITIONS BY HIS SUCCESSORS IN THE PRESIDENCY OF THE CHURCH”; `blbu` (header) “Words of Moroni to Joseph Smith, Manchester, New York, September 21, 1”
- `3`: `blao` (header) “Revelation through Joseph Smith, Hiram, Ohio, November 1, 1831. Histor”; `blbx` (header) “Revelation to Joseph Smith, Harmony, Pennsylvania, July 1828. History ”

### The Mahabharata 10 (`mahabharata_10_hindu_ocean_en`)

**Header numbers colliding with another block** (2)

- `1`: `bl7m` (header) “Book 10: Sauptika Parva”; `bl2s` (header) “Section 1”
- `1.1`: `bl7o` (struct) “”; `bl2t` (content) “Om! Having bowed down unto Narayana, and Nara the most exalted of male”

### The Mahabharata 4 (`mahabharata_4_hindu_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `blhk` (header) “Book 4: Virata Parva”; `bl2t` (header) “Section I”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (4)

- `1.1`: `bl2u` (lead-in) “Pandava-Pravesa Parva”; `bl2v` (content) “[pg 1] OM! Having bowed down to Narayana, and Nara, the most exalted o”
- `13.1`: `bl58` (lead-in) “Samayapalana Parva”; `bldy` (content) ““Janamejaya said, ‘While living thus disguised in the city of the Mats”
- `14.1`: `bl5d` (lead-in) “Kichaka-badha Parva”; `bl5e` (content) ““Vaisampayana said, ‘Living in such disguise, those mighty warriors, t”
- `26.1`: `bl76` (lead-in) “Go-harana Parva”; `bl77` (content) “[pg 49] “Vaisampayana said, ‘Having listened to these words of his spi”

### Arem 09.2023 (`arem_sprint_159_audio_import_2_en`)

**Header numbers colliding with another block** (2)

- `1`: `bl8t` (struct) “”; `bl32` (header) “EM NOME DE DEUS, O CLEMENTE, O MISERICORDIOSO”
- `i`: `bl2x` (header) “Introdução”; `bl2y` (content) “Tratado de ‘Abdu’l-Bahá sobre “modernização” iraniana. Geralmente, em ”

### A Proclamação de BAHÁ´U´LLÁH  AOS REIS E LÍDERES DO MUNDO (`a_proclamacao_de_baha_u_llah_pt`)

**Header numbers colliding with another block** (2)

- `1`: `bl2v` (content) ““O tempo preordenado para os povos e raças da terra é agora chegado.” ”; `bl3j` (header) “ADVERTÊNCIAS AOS REIS E GOVERNANTES DO MUNDO COLETIVAMENTE”
- `2`: `bl38` (content) ““Só desejamos o bem do mundo e a felicidade das nações; não obstante, ”; `bl48` (header) “NAPOLEÃO III”

### Aitareya-Āraṇyaka (`aitareya_ara_yaka_ocean_en`)

**Header numbers colliding with another block** (2)

- `1:2`: `4x` (header) “Second Adhyāya.”; `f3` (header) “Second Adhyāya.”
- `3:1`: `l3` (header) “[pg 247] Third āRanyaka.”; `l4` (header) “First Adhyāya.”

### Bahá‘u’lláh as fulfilment of the theophanic promise in the Sermons of Imam ‘Alí ibn Abí Ṭálib (`sermons_of_imam_ali_islam_ocean_en`)

**Header numbers colliding with another block** (2)

- `1`: `bl9b` (struct) “”; `bl9c` (struct) “”
- `5`: `bl5d` (header) “Translation of the Sermon of the Gulf”; `bl6k` (header) “[pg 104]Translation of the “Sermon of Iftikhár””

### The Alchemy Of Happiness (`the_alchemy_of_happiness_islam_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2v` (content) ““Knowledge of a part is better than ignorance of the whole.” (Abu’l Fe”; `bl36` (header) “Chapter I: The Knowledge of Self”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (3)

- `7.20`: `bl6r` (lead-in) “Regarding the Observances of Marriage”; `bl6s` (content) “Marriage is a religious institution, and should be treated in a religi”
- `8.12`: `bl7e` (lead-in) “The Vision of God”; `bl7f` (content) “All Moslems profess to believe that the Vision of God is the summit of”
- `8.22`: `bl7p` (lead-in) “The Signs of the Love of God”; `bl7q` (content) “Many claim to love God, but each should examine himself as to the genu”

### Mencius (`mencius_confucius_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2s` (header) “Book 1”; `bl2t` (header) “Part 1: King HûI of Liang”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (2)

- `7.6.1`: `bliu` (lead-in) “The importance to a ruler of securing the esteem and submission of the”; `bliv` (content) “Mencius said, ‘The administration of government is not difficult; — it”
- `8.4.1`: `blmg` (lead-in) “Prompt action is necessary at the right time.”; `blmh` (content) “Mencius said, ‘When scholars are put to death without any crime, the g”

### Buddha, Krishna, Zoroaster and Related Subjects (`buddha_krishna_zoroaster_and_related_subjects_bahaacbeb81f0f09b1cf7593df29248d5f4b`)

**Header numbers colliding with another block** (1)

- `6.1`: `bl3l` (header) “— 6 —”; `bl3m` (content) “…The real teaching of Buddha is the same as the teaching of Jesus Chri”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `9.2`: `bl40` (lead-in) “…”; `bl41` (content) “To His Dispensation the sacred books of the followers of Zoroaster had”

### ‘Abdu’l-Bahá in London (`abdu_l_baha_in_london_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `blhy` (struct) “”; `bl2v` (header) “1”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `4.5`: `bl59` (lead-in) “Reprinted by kind permission, from the Christian Commonwealth Oct. 4th”; `bl5a` (content) “AT the invitation of Mrs. Thornburgh-Cropper about four hundred and si”

### Autobiography of a Yogi (`autobiography_of_a_yogi_en`)

**Header numbers colliding with another block** (1)

- `2`: `bl3i` (content) “PARAMHANSA YOGANANDA October 28, 1945 Encinitas, California”; `bl5y` (header) “Chapter 2 My Mother’s Death and the Mystic Amulet”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `38.37`: `bl22i` (lead-in) “LUTHER BURBANK”; `bl22j` (lead-in) “SANTA ROSA, CALIFORNIA”; `bl22k` (lead-in) “U.S.A.”; `bl22l` (lead-in) “December 22, 1924”; `bl22m` (content) “I have examined the Yogoda system of Swami Yogananda and in my opinion”

### Jerusalem: A Treatise On Ecclesiastical Authority And Judaism (`jerusalem_volume_1_judaism_ocean_en`)

**Signature / closing lines carrying a number** (1)

- `5.2`: `bll9` (signature) “David Friedlander.”; `blla` (content) “Sir, The wise moderation with which you express yourself in your lette”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `7.24`: `bl14c` (lead-in) ““Now look here, upon this picture, and on this;””; `bl14d` (content) “The German Jews, generally, were of one and the same character. With t”

### Light of the World (`light_of_the_world_baha_i_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl31` (header) “1 He is the All-Glorious.”; `bl33` (content) “O friends! How blessed, how favoured, how fortunate are ye to have bee”; `bl34` (header) “2 He is God.”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `56.10`: `blem` (lead-in) “O slumbering one, wrapt in mire and clay, Awake, do thou awake!”; `bleo` (lead-in) “O drunken one, so dazed and gone astray, Clear thy mind, clear thou th”; `bleq` (lead-in) “The world is filled with sweetest musk; the eyes are brightened with H”; `blet` (lead-in) “Now is the time for sacrifice; here waft the breaths of Paradise; secr”; `blew` (content) “The sweetly singing mystic bird, upon a verdant cypress bough, imparte”

### The Promised Day is Come (`the_promised_day_is_come_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `blbn` (struct) “”; `bl2y` (content) “Friends and fellow-heirs of the Kingdom of Bahá’u’lláh: [pg 3]”; `blbw` (header) “This Judgment of God”; `blc0` (header) “What Response to His Call?”; `blbs` (header) “Features of This Moving Drama”; `blbu` (header) “A World Receded from Him”; `blbx` (header) “Recipients of the Message”; `blc1` (header) “Tablets to the Kings”; `blby` (header) “The Most Great Law Revealed”; `blbz` (header) “Revealed to the Pope”; `blc4` (header) “Let the Oppressor Desist”; `blc5` (header) “God’s Vicar on Earth”; `blca` (header) “Humiliation Immediate and Complete”; `blc2` (header) “The Rise of Bolshevism”; `blc3` (header) “End of the Holy Roman Empire”; `blc8` (header) “What of Turkey and Persia?”; `blc9` (header) “The Doom of Imperial Turkey”; `blc6` (header) “Divine Retribution on the Qájár Dynasty”; `blc7` (header) “The Decline in the Fortunes of Royalty”; `blcc` (header) “Recognition of Kingship”; `blcd` (header) “The Crumbling of Religious Orthodoxy”; `blce` (header) “Words Addressed to Muslim Ecclesiastics”; `blcb` (header) “The Falling Fortunes of S̱hí‘ih Islám”; `blcg` (header) “The Collapse of the Caliphate”; `blch` (header) “A Warning Unto All Nations”; `blci` (header) “His Messages to Christian Leaders”; `blcf` (header) “Christian Nations against Christian Nations”; `blcj` (header) “The Continuity of Revelation”; `blco` (header) “The Three False Gods”; `blck` (header) “The Weakened Pillars of Religion”; `blcl` (header) “The Great Age to Come”; `blcm` (header) “Religion and Social Evolution”; `blcn` (header) “The Wider, Inclusive Loyalty”; `blct` (header) “World Commonwealth”

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `305`: `blbr` (signature) “Shoghi”; `blbq` (lead-in) “To the beloved of God and the handmaids of the Merciful throughout the”; `blbp` (content) “Haifa, Palestine”

### Bel and the Dragon (`bel_and_the_dragon_deuterocanocical_christianity_o218cf85c97f89bac5055430ad2efd9be`)

**Header numbers colliding with another block** (1)

- `1`: `bl2s` (header) “Chapter 1”; `bl2t` (content) “And king Astyages was gathered to his fathers, and Cyrus of Persia rec”

### Prayer of Azariah (`prayer_of_azariah_deuterocanonical_christianity_ocaf1dfe08bd2d8430deec1ad6a7872004`)

**Header numbers colliding with another block** (1)

- `1`: `bl2s` (header) “Chapter 1”; `bl2t` (content) “And they walked in the midst of the fire, praising God, and blessing t”

### Mundaka-Upanishad (`mundaka_upanishad_ocean_en`)

**Header numbers colliding with another block** (1)

- `1:3`: `3k` (header) “Second Muṇḍaka.”; `3l` (header) “First Khaṇḍa.”

### The Mahabharata 17 (`mahabharata_17_hindu_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl40` (header) “BOOK 17: Mahaprasthanika Parva”; `bl45` (struct) “”; `bl46` (header) “Section 1”

### The Mahabharata 18 (`mahabharata_18_hindu_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl5e` (header) “Book 18: Svargarohanika Parva”; `bl5c` (struct) “”; `2s` (header) “Section 1”

### The Mahabharata 8 (`mahabharata_8_hindu_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl1lo` (header) “Book 8: Karna Parva”; `blem` (struct) “”; `bl1hf` (header) “Section I”

### A Chaste and Holy Life (`a_chaste_and_holy_life_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `2`: `bl8q` (header) “A Chaste and Holy Life”; `bl35` (header) “— 2 —”

### Family Life (`family_life_bahai_compilation_ocean_en`)

**Source / citation lines carrying a number** (1)

- `99.13`: `blck` (source) “‘Abdu’l-Bahá, ‘The Promulgation of Universal Peace’, p. 135”; `blcl` (content) “In the Tablet of the World, Bahá’u’lláh Himself has envisaged that wom”

### Music (`music_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `5`: `bl3d` (source) “Bahá’u’lláh, “Kitáb-i-Aqdas” — Provisional translation from Arabic”; `bl3g` (header) “— 5 —”

### Prohibition of Intoxicating Drinks (`prohibition_of_intoxicating_drinks_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl6p` (struct) “Compilation”; `bl32` (header) “— 1 —”

### The Nineteen Day Feast (`the_nineteen_day_feast_bahai_compilation_ocean_en`)

**Source / citation lines carrying a number** (1)

- `20.6`: `bl5f` (source) “Statement of the National Spiritual Assembly of the United States and ”; `bl5g` (source) “On behalf of Shoghi Effendi, 6 September 1933 to the National Spiritua”

### The Sanctity and Nature of Bahá’í Elections (`the_sanctity_and_nature_of_bahai_elections_bahai_cf8591a44573db188858eceea36b50f7d`)

**Source / citation lines carrying a number** (1)

- `27.3`: `bl72` (content) “It is only in this way that a believer can develop a true social consc”; `bl5r` (source) “4 February 1935, written on behalf of Shoghi Effendi to an individual ”

### Nyayish (`nyayish_zoroastrianism_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2s` (content) “[pg 346] [pg 347] [pg 348] [pg 349]”; `bl2u` (header) “I. Khōrshēḍ Nyāyiś.”

### Rig Veda. Book 5 (`rig_veda_5_ocean_hinduism_en`)

**Header numbers colliding with another block** (1)

- `1`: `blrv` (struct) “”; `bl2s` (header) “HYMN I. Agni”

### Rig Veda. Book 6 (`rig_veda_6_ocean_hindu_en`)

**Header numbers colliding with another block** (1)

- `1`: `blsb` (struct) “”; `bl2s` (header) “HYMN I. Agni.”

### Rig Veda. Book 7 (`rigveda_7_ocean_hinduism_no_audio_en`)

**Header numbers colliding with another block** (1)

- `1`: `blw0` (struct) “”; `bl2s` (header) “Hymn I. Agni.”

### Arem book (`arem_sprint_162_alt_tag_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (content) “THE COCK AND THE FOX Fable, Page”; `bl2y` (header) “Milo Winter”

### Torah - Vayikra (Leviticus) (`torah_vayikra_judaism_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `blr3` (struct) “וַיִּקְרָא”; `blr5` (header) “Vayikra - Chapter 1”

### The Will and Testament of ‘Abdu’l-Bahá (`abdu-l-baha-the-will-and-testament_en`)

**Header numbers colliding with another block** (1)

- `3`: `3x` (header) “He Is God”; `4d` (header) “Part Three”; `4f` (header) “He Is the Witness, the All-Sufficing”

### آيات الهی  جلد اوّل (`ayat_i_ilahi_jild_1_fa`)

**Header numbers colliding with another block** (1)

- `1`: `bl36` (header) “اوّل شهر البهاء - ٢١ مارس”; `bl3vo` (content) “حقّ شاهد و مظاهر اسماء و صفاتش گواه که مقصود از ارتفاع ندا و کلمهٔ علي”

### The Doctrine of the Mean (`doctrine_of_the_mean_confucian_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl89` (content) “[Editor's Note: Forgive the brevity, but this book is short.]”; `bl2s` (header) “Chapter 1.”

### Haggadah for Pesach (`haggada_for_pesach_judaism_ocean_en`)

**Header numbers colliding with another block** (1)

- `4`: `bla5` (header) “Said on the 14th of Nissan after Mincha (Afternoon Prayer)”; `bla8` (header) “Blessings for Candle Lighting on Erev Pesach & Pesach”

### Jaina Sutras Part II (`jaina_sutras_part_ii_en`)

**Header numbers colliding with another block** (1)

- `2.17`: `bl1yh` (header) “Second Book”; `bl1yj` (header) “First Lecture, Called The Lotus”

### الكلمات المكنونة (`kalamat_maknuneh_arabic_ar`)

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (header) “هُوَ البَهِيُّ الأَبْهى”; `bl2u` (content) “هذا ما نُزِّلَ مِنْ جَبَرُوتِ العِزَّةِ بِلِسانِ القُدْرَةِ وَالْقُوَّ”; `bl2v` (header) “يَا ابْنَ الرُّوحِ”

### The Kitáb-i-Íqán (`kitab-i-iqan-prod-version_en`)

**Header numbers colliding with another block** (1)

- `2`: `33` (content) “The essence of these words is this: they that tread the path of faith,”; `b7` (header) “END”

### مكاتيب عبدالبهاء جلد چهارم (`makatib_i_hadrat_i_abdu_l_baha_jild_4_fa`)

**Header numbers colliding with another block** (1)

- `95`: `bldq` (header) “جواب نامه دويم مجلس لاهای مسيو درسلهويس کميته محترمه اجرائيه صلح عمومی”; `bldr` (header) “هُواللّه”

### مکاتيب عبدالبهآء جلد پنجم (`makatib_i_hadrat_i_abdu_l_baha_jild_5_fa`)

**Header numbers colliding with another block** (1)

- `1`: `bl2u` (content) “مؤسّسه ملّی مطبوعات امری ١٣٢ بديع”; `bl2x` (header) “اللّه ابهی”

### مكاتيب عبدالبهاء جلد هشتم (`makatib_i_hadrat_i_abdu_l_baha_jild_8_fa`)

**Header numbers colliding with another block** (1)

- `304`: `bljy` (header) “هُو الأبهی”; `bljz` (content) “يا من انجذب بنفحات اللّه، آنچه مرقوم نموده بوديد بکمال اشتياق قرائت گر”

### مناجاة (`munajat_ar`)

**Header numbers colliding with another block** (1)

- `1`: `bl33` (content) “مَجْمُوعَةُ أذكارٍ وَأدْعِيَةٍ مِنْ آثارِ حضرة بهاءالله”; `bl36` (header) “(1)”

### نداء رب الجنود (`neda_rabul_jonood_fa`)

**Header numbers colliding with another block** (1)

- `1`: `bl9b` (content) “هذه سورة الهيكل قد جعلها الله مرآت أسمآئه بين السّموات والأرض وجعلها آ”; `bl2u` (header) “هو الأبدع الأبهی”

### The Hsiao King or Classic of Filial Piety (`sacred_books_of_china_hsiao_king_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2w` (content) “All the pieces and stanzas in it illustrating the religious views and ”; `bl6r` (header) “The Hsiâo King”

### The Shih King or Book of Poetry (`sacred_books_of_china_the_shih_king_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2w` (content) “All the pieces and stanzas in it illustrating the religious views and ”; `bl4y` (header) “Odes of the Temple and the Altar”

### Salaman and Absal (`salaman_and_absal_islam_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2u` (header) “An Allegory”; `blc5` (struct) “by Edward Fitzgerald”; `blc7` (struct) “”; `blc8` (struct) “”; `bl4u` (header) “I. Prologue”

### Selected Religious Poems (`selected_religious_poems_of_solomon_ibn_gabirol_ju73debe30d5673d28a1980af775f26eb3`)

**Header numbers colliding with another block** (1)

- `50.1`: `blk4` (content) “May this my prayer aid mankind The path of right and worth to find; Th”; `blk5` (header) “I”

### The Shorter Sukhâvatî-vyûha (`short_sukhavativyuha_sutra_amitabha_sutra_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `2v` (header) “ADORATION TO THE OMNISCIENT!”; `2w` (content) “Thus it was heard by me: At one time the Blessed (Bhagavat, i.e. Buddh”

### Tablets to the Hague (`tablets_to_the_hague_new_editon_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2u` (header) “First Tablet to The Hague”; `bl2v` (header) “17 December 1919”; `bl4b` (header) “Second Tablet to The Hague”

### Taoist Prayers (`taoist_prayers_ocean_taoism_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl2t` (content) “Prayers inspired by those who practice the religious or philosophical ”; `bl2u` (header) “Disciples of Life”

### The World Religion : Letter of June 1933 to the High Commissioner of Palestine (`the_baha_i_faith_the_world_religion_bahai_ocean_en`)

**Header numbers colliding with another block** (1)

- `1`: `bl38` (struct) “”; `bl2x` (header) “The World Religion”; `bl2y` (header) “A Summary of Its Aims, Teachings and History”

### Sahih Muslim (Book  8) (`sahih_muslim_book_8_islam_ocean_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `25.17`: `bld1` (lead-in) “A hadith like this is narrated on the authority of Hammam, Sa’id, Bish”; `bld3` (content) “Umm Salama (Allah be pleased with her), the wife of Allah’s Apostle (m”

### The Chicago-Prashnottar (`chicago_prashnottar_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `i.14`: `bl46` (lead-in) “Chicago U.S.A. June 12th 1893.”; `bl47` (lead-in) “My dear Sir,”; `bl48` (content) “I am desired by the Rev, Dr. Barrows to make an immediate acknowledgme”

### Constitution of Medina (Dustur al-Medinah) (`dustur_al_madinah_ocean_islam_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1`: `bl2t` (header) “622 C.E.”; `bl2u` (lead-in) “In the name of God the Compassionate, the Merciful.”; `bl2v` (content) “(1) This is a document from Muhammad the prophet (governing the relati”

### Musings of a Chinese Mystic (`musings_of_a_chinese_mystic_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.17`: `bl3b` (lead-in) “PEACEFUL OLD AGE”; `bl3c` (content) “Chuang Tzŭ said: “Tao gives me this toil in manhood, this repose in ol”

### Pahlavi Texts, Part V (`pahlavi_texts_part_v_zoroastrian_ocean_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `i.152`: `bl7a` (lead-in) “E. W. WEST.”; `bl7b` (lead-in) “April, 1897”; `blrz` (content) “Abbreviations Used In This Volume”

### Religious Affections (`religious_affections_christianity_ocean_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `1.1`: `bl3d` (lead-in) “1 Peter 1:8: Whom having not seen, ye love; in whom, though now ye see”; `bllj` (content) “In these words, the apostle represents the state of the minds of the C”

### The Quest of the Historical Jesus (`the_quest_of_the_historical_jesus_christianity_oce83bb301c8a36bcb6197faef1b1498ba8`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `p.7`: `bl1a9` (lead-in) “F. C. Burkitt.”; `bl1a8` (content) “Cambridge, 1910.”

### Writings of Imam Ja'afar as-Sadiq (`writings_of_imam_ja_afar_as_sadiq_islam_ocean_en`)

**Lead-ins sharing their paragraph's number (salutation, invocation, hadith reference + chain)** (1)

- `3.8`: `bl34` (lead-in) “The Answer of the Imam (as)”; `bl35` (content) “The answer of the Imam (as) was among the most important political cer”

