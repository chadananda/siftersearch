#!/usr/bin/env python3
"""
Gazetteer-based Religious Entity Extraction — Stage 2 replacement

Uses Aho-Corasick multi-pattern matching for O(n) text scanning.
Processes millions of paragraphs in minutes on CPU (vs GLiNER's days).

Merges results into existing content_objects rows from spaCy Stage 1.

Usage:
    python scripts/run-gazetteer.py                  # process all with content_objects
    python scripts/run-gazetteer.py --dry-run         # count matches only
    python scripts/run-gazetteer.py --doc-id 123      # single document
"""

import argparse
import json
import os
import sqlite3
import time
from multiprocessing import Pool, cpu_count
from pathlib import Path

import ahocorasick

# ─── Config ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sifter.db"
STATE_FILE = PROJECT_ROOT / "tmp" / "ner-state.json"
BATCH_SIZE = 5000

# ─── Gazetteer Dictionaries ──────────────────────────────────────────────────
# Category → list of (term, canonical_name) tuples
# Terms are case-insensitive matched. Canonical name is stored.

RELIGIOUS_FIGURES = {
    "people": [
        # ── Bahá'í ──
        ("Bahá'u'lláh", "Bahá'u'lláh"), ("Baha'u'llah", "Bahá'u'lláh"),
        ("Bahaullah", "Bahá'u'lláh"), ("Blessed Beauty", "Bahá'u'lláh"),
        ("Blessed Perfection", "Bahá'u'lláh"),
        ("The Báb", "The Báb"), ("the Bab", "The Báb"), ("Siyyid Ali-Muhammad", "The Báb"),
        ("'Abdu'l-Bahá", "'Abdu'l-Bahá"), ("Abdu'l-Baha", "'Abdu'l-Bahá"),
        ("Abdul-Baha", "'Abdu'l-Bahá"), ("the Master", "'Abdu'l-Bahá"),
        ("Shoghi Effendi", "Shoghi Effendi"), ("the Guardian", "Shoghi Effendi"),
        ("Bahíyyih Khánum", "Bahíyyih Khánum"), ("Greatest Holy Leaf", "Bahíyyih Khánum"),
        ("Táhirih", "Táhirih"), ("Tahirih", "Táhirih"),
        ("Mullá Husayn", "Mullá Husayn"), ("Mulla Husayn", "Mullá Husayn"),
        ("Quddús", "Quddús"), ("Quddus", "Quddús"),
        ("Hájí Mírzá Aqásí", "Hájí Mírzá Aqásí"),
        ("Mírzá Yahyá", "Mírzá Yahyá"), ("Subh-i-Azal", "Mírzá Yahyá"),
        ("Navváb", "Navváb"), ("Khadíjih Bagum", "Khadíjih Bagum"),
        # ── Christianity ──
        ("Jesus Christ", "Jesus Christ"), ("Jesus of Nazareth", "Jesus Christ"),
        ("the Messiah", "Jesus Christ"),
        ("Virgin Mary", "Mary"), ("Mother Mary", "Mary"),
        ("Saint Paul", "Paul the Apostle"), ("Apostle Paul", "Paul the Apostle"),
        ("Saint Peter", "Peter the Apostle"), ("Simon Peter", "Peter the Apostle"),
        ("Saint Augustine", "Saint Augustine"), ("Augustine of Hippo", "Saint Augustine"),
        ("Saint Thomas Aquinas", "Thomas Aquinas"), ("Thomas Aquinas", "Thomas Aquinas"),
        ("Martin Luther", "Martin Luther"),
        ("John Calvin", "John Calvin"),
        ("Saint Francis", "Saint Francis of Assisi"), ("Francis of Assisi", "Saint Francis of Assisi"),
        ("Saint Teresa", "Saint Teresa of Ávila"),
        ("John Wesley", "John Wesley"),
        ("Dietrich Bonhoeffer", "Dietrich Bonhoeffer"),
        # ── Islam ──
        ("Prophet Muhammad", "Muhammad"), ("Prophet Mohammed", "Muhammad"),
        ("the Prophet", "Muhammad"), ("Muhammad (PBUH)", "Muhammad"),
        ("Imam Ali", "Imam Ali"), ("Ali ibn Abi Talib", "Imam Ali"),
        ("Imam Husayn", "Imam Husayn"), ("Imam Hussein", "Imam Husayn"),
        ("Imam Husain", "Imam Husayn"),
        ("Fatimah", "Fatimah"), ("Fátimih", "Fatimah"),
        ("Khadijah", "Khadijah"), ("Khadíjih", "Khadijah"),
        ("Abu Bakr", "Abu Bakr"), ("Abú Bakr", "Abu Bakr"),
        ("Umar", "Umar ibn al-Khattab"), ("Omar", "Umar ibn al-Khattab"),
        ("Uthman", "Uthman ibn Affan"),
        ("Rumi", "Rumi"), ("Jalal al-Din Rumi", "Rumi"), ("Mawlana", "Rumi"),
        ("Al-Ghazali", "Al-Ghazali"), ("Ghazálí", "Al-Ghazali"),
        ("Ibn Arabi", "Ibn Arabi"), ("Ibn 'Arabí", "Ibn Arabi"),
        ("Saladin", "Saladin"), ("Saláh ad-Dín", "Saladin"),
        # ── Judaism ──
        ("Moses", "Moses"), ("Moshe Rabbenu", "Moses"),
        ("Abraham", "Abraham"), ("Abram", "Abraham"),
        ("King David", "King David"), ("King Solomon", "King Solomon"),
        ("Elijah", "Elijah"), ("Isaiah", "Isaiah"), ("Jeremiah", "Jeremiah"),
        ("Rabbi Akiva", "Rabbi Akiva"), ("Maimonides", "Maimonides"),
        ("Rambam", "Maimonides"), ("Rashi", "Rashi"),
        ("Hillel", "Hillel"), ("Shammai", "Shammai"),
        # ── Hinduism ──
        ("Krishna", "Krishna"), ("Lord Krishna", "Krishna"), ("Shri Krishna", "Krishna"),
        ("Rama", "Rama"), ("Lord Rama", "Rama"), ("Shri Rama", "Rama"),
        ("Shiva", "Shiva"), ("Lord Shiva", "Shiva"), ("Mahadeva", "Shiva"),
        ("Vishnu", "Vishnu"), ("Lord Vishnu", "Vishnu"),
        ("Brahma", "Brahma"), ("Lord Brahma", "Brahma"),
        ("Ganesha", "Ganesha"), ("Ganesh", "Ganesha"),
        ("Hanuman", "Hanuman"), ("Lakshmi", "Lakshmi"), ("Saraswati", "Saraswati"),
        ("Durga", "Durga"), ("Kali", "Kali"), ("Parvati", "Parvati"),
        ("Swami Vivekananda", "Swami Vivekananda"),
        ("Sri Ramakrishna", "Sri Ramakrishna"), ("Ramakrishna", "Sri Ramakrishna"),
        ("Shankaracharya", "Adi Shankaracharya"), ("Adi Shankara", "Adi Shankaracharya"),
        ("Ramanuja", "Ramanuja"), ("Madhva", "Madhva"),
        ("Patanjali", "Patanjali"),
        # ── Buddhism ──
        ("Shakyamuni", "Shakyamuni Buddha"), ("Siddhartha Gautama", "Shakyamuni Buddha"),
        ("Gautama Buddha", "Shakyamuni Buddha"), ("the Buddha", "Shakyamuni Buddha"),
        ("Lord Buddha", "Shakyamuni Buddha"),
        ("Avalokiteshvara", "Avalokiteshvara"), ("Guanyin", "Avalokiteshvara"),
        ("Dalai Lama", "Dalai Lama"), ("Thich Nhat Hanh", "Thich Nhat Hanh"),
        ("Nagarjuna", "Nagarjuna"), ("Padmasambhava", "Padmasambhava"),
        ("Milarepa", "Milarepa"), ("Bodhidharma", "Bodhidharma"),
        ("Dogen", "Dōgen Zenji"), ("Dōgen", "Dōgen Zenji"),
        # ── Sikhism ──
        ("Guru Nanak", "Guru Nanak"), ("Guru Gobind Singh", "Guru Gobind Singh"),
        ("Guru Arjan", "Guru Arjan"), ("Guru Tegh Bahadur", "Guru Tegh Bahadur"),
        ("Guru Angad", "Guru Angad"), ("Guru Amar Das", "Guru Amar Das"),
        ("Guru Ram Das", "Guru Ram Das"), ("Guru Hargobind", "Guru Hargobind"),
        ("Guru Har Rai", "Guru Har Rai"), ("Guru Har Krishan", "Guru Har Krishan"),
        # ── Zoroastrianism ──
        ("Zarathustra", "Zarathustra"), ("Zoroaster", "Zarathustra"),
        ("Ahura Mazda", "Ahura Mazda"), ("Angra Mainyu", "Angra Mainyu"),
        # ── Jainism ──
        ("Mahavira", "Mahavira"), ("Lord Mahavira", "Mahavira"),
        ("Rishabhanatha", "Rishabhanatha"), ("Parshvanatha", "Parshvanatha"),
        # ── Indigenous / Other ──
        ("Confucius", "Confucius"), ("Lao Tzu", "Lao Tzu"), ("Laozi", "Lao Tzu"),
        ("Mencius", "Mencius"), ("Zhuangzi", "Zhuangzi"),
    ]
}

SACRED_TEXTS = {
    "documents": [
        # ── Bahá'í ──
        ("Kitáb-i-Aqdas", "Kitáb-i-Aqdas"), ("Most Holy Book", "Kitáb-i-Aqdas"),
        ("Kitáb-i-Íqán", "Kitáb-i-Íqán"), ("Book of Certitude", "Kitáb-i-Íqán"),
        ("Hidden Words", "Hidden Words"), ("Seven Valleys", "Seven Valleys"),
        ("Four Valleys", "Four Valleys"), ("Gems of Divine Mysteries", "Gems of Divine Mysteries"),
        ("Gleanings from the Writings", "Gleanings"),
        ("Tablets of Bahá'u'lláh", "Tablets of Bahá'u'lláh"),
        ("Summons of the Lord of Hosts", "Summons of the Lord of Hosts"),
        ("Epistle to the Son of the Wolf", "Epistle to the Son of the Wolf"),
        ("Tablet of Ahmad", "Tablet of Ahmad"), ("Fire Tablet", "Fire Tablet"),
        ("Tablet of Carmel", "Tablet of Carmel"),
        ("Tablet of the Holy Mariner", "Tablet of the Holy Mariner"),
        ("Lawh-i-Hikmat", "Lawh-i-Hikmat"),
        ("Some Answered Questions", "Some Answered Questions"),
        ("Secret of Divine Civilization", "Secret of Divine Civilization"),
        ("Will and Testament", "Will and Testament"),
        ("Selections from the Writings of the Báb", "Selections from the Writings of the Báb"),
        ("Bayán", "Bayán"), ("Persian Bayán", "Persian Bayán"), ("Arabic Bayán", "Arabic Bayán"),
        ("God Passes By", "God Passes By"), ("Dawn-Breakers", "Dawn-Breakers"),
        ("Advent of Divine Justice", "Advent of Divine Justice"),
        ("World Order of Bahá'u'lláh", "World Order of Bahá'u'lláh"),
        ("Promised Day Is Come", "Promised Day Is Come"),
        # ── Christianity ──
        ("Holy Bible", "Bible"), ("Old Testament", "Old Testament"),
        ("New Testament", "New Testament"), ("Book of Genesis", "Genesis"),
        ("Book of Exodus", "Exodus"), ("Book of Psalms", "Psalms"),
        ("Book of Proverbs", "Proverbs"), ("Book of Isaiah", "Isaiah"),
        ("Book of Revelation", "Revelation"), ("Book of Daniel", "Daniel"),
        ("Gospel of Matthew", "Gospel of Matthew"), ("Gospel of Mark", "Gospel of Mark"),
        ("Gospel of Luke", "Gospel of Luke"), ("Gospel of John", "Gospel of John"),
        ("Acts of the Apostles", "Acts"), ("Epistle to the Romans", "Romans"),
        ("Song of Solomon", "Song of Solomon"), ("Ecclesiastes", "Ecclesiastes"),
        # ── Islam ──
        ("Holy Quran", "Quran"), ("the Qur'an", "Quran"), ("the Quran", "Quran"),
        ("the Koran", "Quran"), ("Qur'án", "Quran"),
        ("Sahih al-Bukhari", "Sahih al-Bukhari"), ("Sahih Muslim", "Sahih Muslim"),
        ("Sunan Abu Dawud", "Sunan Abu Dawud"), ("Hadith", "Hadith"),
        ("Nahjul Balagha", "Nahjul Balagha"), ("Nahj al-Balagha", "Nahjul Balagha"),
        # ── Judaism ──
        ("the Torah", "Torah"), ("the Talmud", "Talmud"),
        ("Mishnah", "Mishnah"), ("Gemara", "Gemara"),
        ("Zohar", "Zohar"), ("Midrash", "Midrash"),
        ("Tanakh", "Tanakh"), ("Kabbalah", "Kabbalah"),
        ("Shulchan Aruch", "Shulchan Aruch"),
        # ── Hinduism ──
        ("Bhagavad Gita", "Bhagavad Gita"), ("Bhagavad-Gita", "Bhagavad Gita"),
        ("the Vedas", "Vedas"), ("Rig Veda", "Rig Veda"), ("Rigveda", "Rig Veda"),
        ("Upanishads", "Upanishads"), ("Mahabharata", "Mahabharata"),
        ("Ramayana", "Ramayana"), ("Puranas", "Puranas"),
        ("Yoga Sutras", "Yoga Sutras"), ("Dhammapada", "Dhammapada"),
        ("Atharva Veda", "Atharva Veda"), ("Sama Veda", "Sama Veda"),
        ("Yajur Veda", "Yajur Veda"),
        # ── Buddhism ──
        ("Tripitaka", "Tripitaka"), ("Pali Canon", "Pali Canon"),
        ("Heart Sutra", "Heart Sutra"), ("Diamond Sutra", "Diamond Sutra"),
        ("Lotus Sutra", "Lotus Sutra"), ("Tibetan Book of the Dead", "Bardo Thodol"),
        ("Bardo Thodol", "Bardo Thodol"),
        ("Sutta Pitaka", "Sutta Pitaka"), ("Vinaya Pitaka", "Vinaya Pitaka"),
        # ── Sikhism ──
        ("Guru Granth Sahib", "Guru Granth Sahib"), ("Adi Granth", "Guru Granth Sahib"),
        ("Dasam Granth", "Dasam Granth"), ("Japji Sahib", "Japji Sahib"),
        ("Rehras Sahib", "Rehras Sahib"), ("Sukhmani Sahib", "Sukhmani Sahib"),
        # ── Zoroastrianism ──
        ("Avesta", "Avesta"), ("Gathas", "Gathas"), ("Yasna", "Yasna"),
        ("Vendidad", "Vendidad"),
        # ── Other ──
        ("Tao Te Ching", "Tao Te Ching"), ("Dao De Jing", "Tao Te Ching"),
        ("Analects", "Analects"), ("I Ching", "I Ching"),
        ("Book of Changes", "I Ching"),
    ]
}

RELIGIOUS_CONCEPTS = {
    "concepts": [
        # ── Bahá'í ──
        ("Progressive Revelation", "Progressive Revelation"),
        ("Manifestation of God", "Manifestation of God"),
        ("Manifestations of God", "Manifestation of God"),
        ("Lesser Peace", "Lesser Peace"), ("Most Great Peace", "Most Great Peace"),
        ("covenant-breaking", "Covenant-breaking"),
        ("Administrative Order", "Administrative Order"),
        ("Universal House of Justice", "Universal House of Justice"),
        ("Spiritual Assembly", "Spiritual Assembly"),
        ("Local Spiritual Assembly", "Local Spiritual Assembly"),
        ("National Spiritual Assembly", "National Spiritual Assembly"),
        ("Nineteen Day Feast", "Nineteen Day Feast"),
        ("Mashriqu'l-Adhkár", "Mashriqu'l-Adhkár"),
        ("independent investigation of truth", "Independent Investigation of Truth"),
        ("elimination of prejudice", "Elimination of Prejudice"),
        ("oneness of humanity", "Oneness of Humanity"),
        ("unity of God", "Unity of God"), ("oneness of God", "Unity of God"),
        ("oneness of religion", "Oneness of Religion"),
        ("unity of religion", "Oneness of Religion"),
        ("equality of men and women", "Equality of Men and Women"),
        ("harmony of science and religion", "Harmony of Science and Religion"),
        ("universal education", "Universal Education"),
        ("universal auxiliary language", "Universal Auxiliary Language"),
        ("consultation", "Consultation"),
        ("Bahá'í Faith", "Bahá'í Faith"), ("Baha'i Faith", "Bahá'í Faith"),
        ("Bahá'í community", "Bahá'í Community"),
        ("Dispensation", "Dispensation"),
        ("Heroic Age", "Heroic Age"), ("Formative Age", "Formative Age"),
        ("Golden Age", "Golden Age"),
        # ── Christianity ──
        ("Holy Trinity", "Trinity"), ("the Trinity", "Trinity"),
        ("original sin", "Original Sin"), ("salvation", "Salvation"),
        ("grace", "Grace"), ("baptism", "Baptism"), ("communion", "Communion"),
        ("Eucharist", "Eucharist"), ("resurrection", "Resurrection"),
        ("Second Coming", "Second Coming"), ("Kingdom of God", "Kingdom of God"),
        ("Kingdom of Heaven", "Kingdom of Heaven"), ("Holy Spirit", "Holy Spirit"),
        ("Holy Ghost", "Holy Spirit"),
        ("Sermon on the Mount", "Sermon on the Mount"),
        ("Great Commission", "Great Commission"),
        ("Beatitudes", "Beatitudes"),
        # ── Islam ──
        ("Five Pillars", "Five Pillars of Islam"),
        ("shahada", "Shahada"), ("Shaháda", "Shahada"),
        ("salat", "Salat"), ("salah", "Salat"),
        ("zakat", "Zakat"), ("sawm", "Sawm"),
        ("hajj", "Hajj"), ("umrah", "Umrah"),
        ("jihad", "Jihad"), ("sharia", "Sharia"), ("Sharí'ah", "Sharia"),
        ("fatwa", "Fatwa"), ("imam", "Imam"), ("caliph", "Caliph"),
        ("caliphate", "Caliphate"), ("ummah", "Ummah"),
        ("Sunni", "Sunni Islam"), ("Shi'a", "Shia Islam"), ("Shia", "Shia Islam"),
        ("Sufi", "Sufism"), ("Sufism", "Sufism"), ("tasawwuf", "Sufism"),
        # ── Judaism ──
        ("Shabbat", "Shabbat"), ("Sabbath", "Shabbat"),
        ("kosher", "Kosher"), ("mitzvah", "Mitzvah"), ("mitzvot", "Mitzvah"),
        ("Torah study", "Torah Study"), ("Passover", "Passover"),
        ("Yom Kippur", "Yom Kippur"), ("Rosh Hashanah", "Rosh Hashanah"),
        ("Hanukkah", "Hanukkah"), ("Sukkot", "Sukkot"),
        ("bar mitzvah", "Bar Mitzvah"), ("bat mitzvah", "Bat Mitzvah"),
        ("Hasidic", "Hasidism"), ("Hasidism", "Hasidism"),
        ("Orthodox Judaism", "Orthodox Judaism"),
        ("Reform Judaism", "Reform Judaism"),
        # ── Hinduism ──
        ("dharma", "Dharma"), ("karma", "Karma"), ("samsara", "Samsara"),
        ("moksha", "Moksha"), ("nirvana", "Nirvana"), ("atman", "Atman"),
        ("Brahman", "Brahman"), ("maya", "Maya"), ("yoga", "Yoga"),
        ("bhakti", "Bhakti"), ("mantra", "Mantra"), ("puja", "Puja"),
        ("ahimsa", "Ahimsa"), ("reincarnation", "Reincarnation"),
        ("chakra", "Chakra"), ("kundalini", "Kundalini"),
        ("Vedanta", "Vedanta"), ("Advaita", "Advaita Vedanta"),
        # ── Buddhism ──
        ("Four Noble Truths", "Four Noble Truths"),
        ("Noble Eightfold Path", "Noble Eightfold Path"),
        ("Eightfold Path", "Noble Eightfold Path"),
        ("bodhisattva", "Bodhisattva"), ("enlightenment", "Enlightenment"),
        ("sangha", "Sangha"), ("dharma", "Dharma"),
        ("Theravada", "Theravada"), ("Mahayana", "Mahayana"),
        ("Vajrayana", "Vajrayana"), ("Zen", "Zen Buddhism"),
        ("meditation", "Meditation"), ("mindfulness", "Mindfulness"),
        ("dependent origination", "Dependent Origination"),
        ("impermanence", "Impermanence"), ("emptiness", "Emptiness"),
        ("Buddha-nature", "Buddha-nature"),
        # ── Sikhism ──
        ("Khalsa", "Khalsa"), ("Five Ks", "Five Ks"),
        ("Waheguru", "Waheguru"), ("Gurdwara", "Gurdwara"),
        ("langar", "Langar"), ("Ardas", "Ardas"),
        ("Naam Simran", "Naam Simran"),
        # ── Zoroastrianism ──
        ("Amesha Spentas", "Amesha Spentas"), ("Asha", "Asha"),
        ("Druj", "Druj"), ("Fravashi", "Fravashi"),
    ]
}

HOLY_PLACES = {
    "places": [
        # ── Bahá'í ──
        ("Bahá'í World Centre", "Bahá'í World Centre"),
        ("Mount Carmel", "Mount Carmel"), ("Haifa", "Haifa"),
        ("Acre", "Acre"), ("Akká", "Acre"), ("'Akká", "Acre"),
        ("Bahjí", "Bahjí"), ("Bahji", "Bahjí"),
        ("Shrine of Bahá'u'lláh", "Shrine of Bahá'u'lláh"),
        ("Shrine of the Báb", "Shrine of the Báb"),
        ("Ridván Garden", "Ridván Garden"), ("Mazra'ih", "Mazra'ih"),
        ("House of the Báb", "House of the Báb"),
        ("Síyáh-Chál", "Síyáh-Chál"),
        # ── Christianity ──
        ("Bethlehem", "Bethlehem"), ("Nazareth", "Nazareth"),
        ("Jerusalem", "Jerusalem"), ("Calvary", "Calvary"), ("Golgotha", "Calvary"),
        ("Garden of Gethsemane", "Garden of Gethsemane"),
        ("Church of the Holy Sepulchre", "Church of the Holy Sepulchre"),
        ("Vatican", "Vatican"), ("St. Peter's Basilica", "St. Peter's Basilica"),
        # ── Islam ──
        ("Mecca", "Mecca"), ("Makkah", "Mecca"),
        ("Medina", "Medina"), ("Madinah", "Medina"),
        ("Al-Aqsa Mosque", "Al-Aqsa Mosque"),
        ("Dome of the Rock", "Dome of the Rock"),
        ("Kaaba", "Kaaba"), ("Ka'bah", "Kaaba"),
        ("Masjid al-Haram", "Masjid al-Haram"),
        # ── Judaism ──
        ("Western Wall", "Western Wall"), ("Wailing Wall", "Western Wall"),
        ("Temple Mount", "Temple Mount"), ("Mount Sinai", "Mount Sinai"),
        ("Mount Zion", "Mount Zion"),
        # ── Hinduism ──
        ("Varanasi", "Varanasi"), ("Benares", "Varanasi"),
        ("Ganges", "Ganges"), ("Rishikesh", "Rishikesh"),
        ("Tirupati", "Tirupati"), ("Ayodhya", "Ayodhya"),
        # ── Buddhism ──
        ("Bodh Gaya", "Bodh Gaya"), ("Lumbini", "Lumbini"),
        ("Sarnath", "Sarnath"), ("Kushinagar", "Kushinagar"),
        # ── Sikhism ──
        ("Golden Temple", "Golden Temple"), ("Harmandir Sahib", "Golden Temple"),
        ("Amritsar", "Amritsar"),
    ]
}

EVENTS = {
    "events": [
        # ── Bahá'í ──
        ("Ridván", "Ridván"), ("Declaration of the Báb", "Declaration of the Báb"),
        ("Ascension of Bahá'u'lláh", "Ascension of Bahá'u'lláh"),
        ("Martyrdom of the Báb", "Martyrdom of the Báb"),
        ("Naw-Rúz", "Naw-Rúz"), ("Nawruz", "Naw-Rúz"),
        ("Ayyám-i-Há", "Ayyám-i-Há"), ("Nineteen Day Fast", "Nineteen Day Fast"),
        ("Day of the Covenant", "Day of the Covenant"),
        # ── Christianity ──
        ("Crucifixion", "Crucifixion"), ("Easter", "Easter"),
        ("Christmas", "Christmas"), ("Pentecost", "Pentecost"),
        ("Ascension", "Ascension"), ("Last Supper", "Last Supper"),
        ("Transfiguration", "Transfiguration"), ("Epiphany", "Epiphany"),
        # ── Islam ──
        ("Ramadan", "Ramadan"), ("Eid al-Fitr", "Eid al-Fitr"),
        ("Eid al-Adha", "Eid al-Adha"), ("Laylat al-Qadr", "Laylat al-Qadr"),
        ("Isra and Mi'raj", "Isra and Mi'raj"), ("Mawlid", "Mawlid"),
        # ── Judaism ──
        ("Exodus", "Exodus"), ("Shavuot", "Shavuot"),
        ("Purim", "Purim"), ("Simchat Torah", "Simchat Torah"),
        # ── Buddhism ──
        ("Vesak", "Vesak"), ("Bodhi Day", "Bodhi Day"),
        # ── Sikhism ──
        ("Vaisakhi", "Vaisakhi"), ("Bandi Chhor Divas", "Bandi Chhor Divas"),
        ("Gurpurab", "Gurpurab"),
    ]
}

ALL_GAZETTEERS = {**RELIGIOUS_FIGURES, **SACRED_TEXTS, **RELIGIOUS_CONCEPTS, **HOLY_PLACES, **EVENTS}

# ─── Build Aho-Corasick automaton ─────────────────────────────────────────────

def build_automaton():
    """Build case-insensitive Aho-Corasick automaton from all gazetteers."""
    A = ahocorasick.Automaton()
    idx = 0
    for category, entries in ALL_GAZETTEERS.items():
        for term, canonical in entries:
            # Store lowercase key, but keep canonical and category
            A.add_word(term.lower(), (idx, category, canonical))
            idx += 1
    A.make_automaton()
    return A

# ─── Worker process ───────────────────────────────────────────────────────────

_automaton = None

def init_worker():
    """Build automaton in each worker."""
    global _automaton
    _automaton = build_automaton()

def extract_batch(texts_with_ids):
    """Extract religious entities from a batch using Aho-Corasick."""
    global _automaton
    results = []
    for para_id, doc_id, text in texts_with_ids:
        text_lower = text.lower()
        entities = {}
        seen = set()
        for end_idx, (_, category, canonical) in _automaton.iter(text_lower):
            key = (category, canonical)
            if key not in seen:
                seen.add(key)
                if category not in entities:
                    entities[category] = set()
                entities[category].add(canonical)
        result = {
            cat: [{"name": n} for n in sorted(names)]
            for cat, names in entities.items()
        }
        results.append((para_id, doc_id, result))
    return results

# ─── Database operations ─────────────────────────────────────────────────────

def get_paragraphs_with_objects(db_path, doc_id=None):
    """Get paragraphs that have content_objects (from spaCy Stage 1)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    query = """
        SELECT c.id, c.doc_id, c.text
        FROM content c
        JOIN content_objects co ON co.content_id = c.id AND co.object_pipeline_version = 'v1-ner'
        WHERE c.deleted_at IS NULL AND LENGTH(c.text) > 20
    """
    params = []
    if doc_id:
        query += " AND c.doc_id = ?"
        params.append(doc_id)
    query += " ORDER BY c.doc_id, c.paragraph_index"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [(r["id"], r["doc_id"], r["text"]) for r in rows]

def get_all_paragraphs(db_path, doc_id=None):
    """Get all eligible paragraphs (for standalone mode without spaCy)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    query = """
        SELECT c.id, c.doc_id, c.text
        FROM content c
        WHERE c.deleted_at IS NULL AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= 6000
    """
    params = []
    if doc_id:
        query += " AND c.doc_id = ?"
        params.append(doc_id)
    query += " ORDER BY c.doc_id, c.paragraph_index"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [(r["id"], r["doc_id"], r["text"]) for r in rows]

def merge_into_content_objects(db_path, gazetteer_results):
    """Merge gazetteer entities into existing content_objects rows."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")

    updated = 0
    inserted = 0

    for para_id, doc_id, gaz_entities in gazetteer_results:
        # Check if row exists
        row = conn.execute(
            "SELECT people_json, places_json, documents_json, events_json, concepts_json FROM content_objects WHERE content_id = ? AND object_pipeline_version = 'v1-ner'",
            [para_id]
        ).fetchone()

        if row:
            # Merge with existing spaCy results
            merged = {}
            for i, cat in enumerate(["people", "places", "documents", "events", "concepts"]):
                existing = set()
                try:
                    for ent in json.loads(row[i] or "[]"):
                        if isinstance(ent, dict) and "name" in ent:
                            existing.add(ent["name"])
                except (json.JSONDecodeError, TypeError):
                    pass
                for ent in gaz_entities.get(cat, []):
                    existing.add(ent["name"])
                merged[cat] = sorted(existing)

            rendered = ", ".join(
                name
                for cat in ["people", "places", "concepts", "events", "documents"]
                for name in merged.get(cat, [])
            )

            conn.execute("""
                UPDATE content_objects SET
                    people_json = ?, places_json = ?, documents_json = ?,
                    events_json = ?, concepts_json = ?, rendered = ?,
                    object_pipeline_version = 'v1-ner+gaz'
                WHERE content_id = ? AND object_pipeline_version = 'v1-ner'
            """, [
                json.dumps([{"name": n} for n in merged["people"]]),
                json.dumps([{"name": n} for n in merged["places"]]),
                json.dumps([{"name": n} for n in merged["documents"]]),
                json.dumps([{"name": n} for n in merged["events"]]),
                json.dumps([{"name": n} for n in merged["concepts"]]),
                rendered, para_id
            ])
            updated += 1
        else:
            # Insert new row (no spaCy data for this paragraph)
            rendered = ", ".join(
                ent["name"]
                for cat in ["people", "places", "concepts", "events", "documents"]
                for ent in gaz_entities.get(cat, [])
            )
            if not rendered:
                continue

            conn.execute("""
                INSERT OR IGNORE INTO content_objects
                    (content_id, doc_id, people_json, places_json, documents_json,
                     events_json, concepts_json, relations_json, rendered, object_pipeline_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 'v1-gaz')
            """, [
                para_id, doc_id,
                json.dumps(gaz_entities.get("people", [])),
                json.dumps(gaz_entities.get("places", [])),
                json.dumps(gaz_entities.get("documents", [])),
                json.dumps(gaz_entities.get("events", [])),
                json.dumps(gaz_entities.get("concepts", [])),
                rendered
            ])
            inserted += 1

    conn.commit()
    conn.close()
    return updated, inserted

# ─── Main ────────────────────────────────────────────────────────────────────

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def main():
    parser = argparse.ArgumentParser(description="Gazetteer Religious Entity Extraction")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=max(1, cpu_count() - 4))
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--doc-id", type=int)
    parser.add_argument("--standalone", action="store_true",
                       help="Process all paragraphs, not just those with content_objects")
    args = parser.parse_args()

    print("=== Gazetteer Religious Entity Extraction ===")
    print(f"Workers: {args.workers}, Batch size: {args.batch_size}")

    # Count terms in gazetteer
    total_terms = sum(len(entries) for entries in ALL_GAZETTEERS.values())
    print(f"Gazetteer: {total_terms} terms across {len(ALL_GAZETTEERS)} categories")

    # Get work
    if args.standalone:
        paragraphs = get_all_paragraphs(str(DB_PATH), doc_id=args.doc_id)
    else:
        paragraphs = get_paragraphs_with_objects(str(DB_PATH), doc_id=args.doc_id)
        if not paragraphs:
            print("No content_objects rows found. Use --standalone to process all paragraphs.")
            paragraphs = get_all_paragraphs(str(DB_PATH), doc_id=args.doc_id)
            print(f"Falling back to standalone mode: {len(paragraphs):,} paragraphs")

    print(f"Paragraphs to process: {len(paragraphs):,}")

    if args.dry_run or len(paragraphs) == 0:
        return

    # Update state file
    stats = {
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stage": "gazetteer",
        "processed": 0,
        "total": len(paragraphs),
        "entities_found": 0,
        "errors": 0,
        "rate": 0,
        "percent": 0,
    }
    STATE_FILE.parent.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(stats, indent=2))

    start_time = time.time()
    batches = list(chunk_list(paragraphs, args.batch_size))
    print(f"Batches: {len(batches)}\n")

    # Process with multiprocessing
    all_results = []
    with Pool(args.workers, initializer=init_worker) as pool:
        for i, batch_results in enumerate(pool.imap(extract_batch, batches)):
            all_results.extend(batch_results)
            stats["processed"] += len(batch_results)

            entities_in_batch = sum(
                sum(len(v) for v in ents.values())
                for _, _, ents in batch_results
            )
            stats["entities_found"] += entities_in_batch

            elapsed = time.time() - start_time
            stats["rate"] = int(stats["processed"] / (elapsed / 60)) if elapsed > 0 else 0
            stats["percent"] = round((stats["processed"] / stats["total"]) * 100, 1)

            if (i + 1) % 20 == 0 or i == len(batches) - 1:
                print(f"  Batch {i+1}/{len(batches)}: {stats['processed']:,} / {stats['total']:,} ({stats['percent']}%) ~{stats['rate']:,}/min")
                STATE_FILE.write_text(json.dumps(stats, indent=2))

    extract_time = time.time() - start_time
    print(f"\nExtraction done: {stats['entities_found']:,} entities in {extract_time:.1f}s")

    # Store results
    stats["stage"] = "storing"
    STATE_FILE.write_text(json.dumps(stats, indent=2))
    print("Storing results...")

    total_updated = 0
    total_inserted = 0
    for chunk in chunk_list(all_results, 10000):
        u, i = merge_into_content_objects(str(DB_PATH), chunk)
        total_updated += u
        total_inserted += i

    total_time = time.time() - start_time
    stats["stage"] = "complete"
    stats["percent"] = 100
    STATE_FILE.write_text(json.dumps(stats, indent=2))

    print(f"\n=== Summary ===")
    print(f"Paragraphs:  {len(paragraphs):,}")
    print(f"Entities:    {stats['entities_found']:,}")
    print(f"Updated:     {total_updated:,} (merged with spaCy)")
    print(f"Inserted:    {total_inserted:,} (new rows)")
    print(f"Time:        {total_time:.1f}s ({total_time/60:.1f}min)")
    print(f"Rate:        {len(paragraphs) / (total_time/60):.0f} paragraphs/min")

if __name__ == "__main__":
    main()
