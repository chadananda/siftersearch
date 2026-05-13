# Topic Relevance Schema

Pre-tagging strategy for interfaith corpus passages. Goal: shift relevance
filtering from keyword-match guesswork at search time to authoritative
topic labels applied once by AI over the corpus. Faster queries, better
precision, testable quality.

---

## Why upfront tagging beats search-time filtering

Search time is the wrong place to determine relevance:
- Embedding distance is a proxy for *topical similarity*, not *direct answerability*
- A passage about "compassion" ranks high for "mercy" but may not answer "why does God allow suffering?"
- Cross-religion contamination (Qur'an in the Judaism slot) is undetectable without labels
- Testing is impossible without ground truth

With topic tags stored on the paragraph:
- Filter at query time: `topic_tags CONTAINS "theodicy"` before scoring
- Boost: high-authority passages with matching topic get weighted up
- Test: check tag coverage for a query, flag mismatch immediately
- Improve incrementally: add tags for new topic areas without rebuilding the index

---

## Tagging scope and priority

**Phase 1 — High-authority primary texts** (run first, covers most Jafar queries):
- Bahá'í: Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi (authority ≥ 8)
- OceanLibrary scripture: Qur'an, four Gospels, Psalms/Torah/Isaiah, Dhammapada
- **Lights of Guidance** (see §5 below) — exhaustive Q&A, directly maps to Jafar questions

**Phase 2 — Secondary primary texts:**
- Remaining OceanLibrary books (authority 7-8)
- HyPE questions (already cover the "what does this answer?" angle)

**Phase 3 — Commentary and supplemental** (deferred; lower ROI):
- Authority 5-6 docs, bahai-library.com, Sefaria texts

Estimated volume for Phase 1: ~200K paragraphs. At 20 paragraphs/call
with Haiku 3.5 batch API, ~10K calls, ~$40-60, completable in 2-3 days.

---

## Topic taxonomy

### Primary topics (one per paragraph, required)

| Tag | Covers |
|-----|--------|
| `theodicy` | Why God allows suffering, evil, pain, tragedy |
| `tests-trials` | Purpose of hardship, adversity, calamity, tests of faith |
| `afterlife` | Soul survival, heaven, hell, judgment, resurrection |
| `prayer` | Obligatory prayer, supplication, worship forms, meditation |
| `soul-spirit` | Nature of the soul, inner life, spiritual reality vs. material |
| `mysticism` | Stations of the path, nearness to God, heart, love |
| `ethics` | Truthfulness, honesty, trustworthiness, moral conduct |
| `justice` | Divine justice, social justice, fairness, equity |
| `mercy-compassion` | Forgiveness, clemency, lovingkindness, pardon |
| `free-will` | Predestination, human agency, divine will, moral choice |
| `revelation` | Prophets, Manifestations, sacred texts, Word of God |
| `progressive-revelation` | Relationship between religions, fulfilled prophecy, covenant |
| `science-reason` | Harmony of science and religion, knowledge, education |
| `unity` | Oneness of humanity, interfaith harmony, racial unity |
| `equality` | Gender equality, social justice, economic equity |
| `authority` | Religious leadership, infallibility, clergy, guidance |
| `law-practice` | Religious law, fasting, pilgrimage, marriage, prohibitions |
| `eschatology` | Day of God, return of Christ, millennium, signs of times |
| `social-order` | Governance, world peace, economics, politics, civilization |
| `death-grief` | Dying, bereavement, consolation, mourning, loss |
| `love` | Love of God, love for humanity, spiritual love |
| `scripture-study` | Meaning of sacred text, interpretation, study approach |
| `creation` | Origin of the universe, nature, God as creator |
| `sin-redemption` | Sin, guilt, atonement, redemption, spiritual failure |
| `community` | Gathering, fellowship, service, religious community |

### Secondary topics (up to 3, optional)

Secondary tags pull from the same taxonomy. A passage about the purpose
of prayer in times of suffering would carry:
- primary: `prayer`
- secondary: `tests-trials`, `soul-spirit`

### Question-type tags (what question does this passage answer?)

A separate dimension from topical subject matter:

| Tag | Typical question form |
|-----|----------------------|
| `why-god-allows-X` | "Why does God allow…?" "If God loves us, why…?" |
| `what-is-X` | Definitional — "What is the soul?" "What is prayer?" |
| `how-to-X` | Practical — "How do I pray?" "How do I forgive?" |
| `does-X-exist` | Existence questions — "Is there an afterlife?" |
| `what-does-scripture-say` | User wants the text directly |
| `compare-religions` | Cross-tradition comparison of a concept |
| `is-X-forbidden` | Law/conduct — "Is X allowed?" |
| `when-will-X-happen` | Eschatological questions |

---

## Storage schema

```sql
-- New column on content table (migration 59)
ALTER TABLE content ADD COLUMN topic_tags TEXT;      -- JSON array: ["theodicy","tests-trials"]
ALTER TABLE content ADD COLUMN question_types TEXT;  -- JSON array: ["why-god-allows-X","compare-religions"]
ALTER TABLE content ADD COLUMN topic_tagged_at TEXT; -- ISO timestamp of last AI tagging

-- Index for fast topic filtering at search time
CREATE INDEX IF NOT EXISTS idx_content_topic_tags
  ON content(doc_id)
  WHERE topic_tags IS NOT NULL;
```

Meilisearch sync: add `topic_tags` and `question_types` as filterable + searchable
attributes. This lets hybrid search boost topically-matched passages.

---

## Lights of Guidance

**What it is:** "Lights of Guidance: A Bahá'í Reference File" compiled by Helen
Hornby (1983, revised 1994). ~2,000 authenticated quotations from the writings of
Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi, and the Universal House of Justice,
organized by topic and answering specific doctrinal questions that Bahá'ís asked.

**Why it matters for search:**
- The chapter headings ARE the question taxonomy — each chapter is literally a question type
  (e.g. "Nature and Purpose of Prayer", "Tests and Difficulties", "Death and the Afterlife")
- Each quotation was selected precisely because it answers that question
- When Jafar gets a theodicy question, Lights of Guidance passages are among the best
  answers available — more direct than the original tablet text that requires interpretation

**Current status in DB:**
- Local copy: doc ID 8680, "Lights of Guidance: A Bahá'í Reference File" by Helen Hornby,
  collection "Compilations", no source_site (local only)
- OceanLibrary copy: doc ID 20804 — **misattributed as Bahá'u'lláh**, needs correction
- Authority: currently inherits Compilations-level (~6-7), should be **8**

**Fixes needed:**
1. Add TITLE_AUTHORITY pattern in `api/lib/authority.js`:
   ```javascript
   { pattern: /^lights\s+of\s+guidance/i, authority: 8 },
   ```
2. Fix OceanLibrary doc 20804 author attribution (should be "Helen Hornby (compiler)" not "Bahá'u'lláh")
3. Tag all Lights of Guidance paragraphs with topic_tags matching chapter headings —
   this is the highest-ROI starting point since the taxonomy is already there

**Lights of Guidance chapter → topic_tag mapping:**
```
"Nature and Purpose of Prayer"     → prayer, soul-spirit
"Tests, Difficulties and Suffering" → tests-trials, theodicy
"Death, the Afterlife and the Soul" → afterlife, soul-spirit, death-grief
"Obligatory Prayer"                 → prayer, law-practice
"Fasting"                           → law-practice
"Marriage and Family Life"          → law-practice, community, equality
"Administration"                    → authority, community
"Teaching the Faith"                → revelation, community
"Service"                           → ethics, love, community
"Scholarship and the Arts"          → science-reason, scripture-study
"Race Unity"                        → unity, equality
"Spiritual Development"             → mysticism, soul-spirit, ethics
"Firmness in the Covenant"          → authority, revelation
"Prejudice"                         → unity, equality, ethics
"World Peace"                       → social-order, unity
"Backbiting and Criticism"          → ethics, community
"Truthfulness"                      → ethics
```

---

## Search quality test suite

### Format

```json
{
  "id": "theodicy-001",
  "query": "Why does God allow suffering?",
  "intent": "theodicy",
  "required_topics": ["theodicy", "tests-trials"],
  "secondary_topics": ["soul-spirit", "love", "free-will"],
  "forbidden_topics": ["law-practice", "social-order", "scripture-study"],
  "required_religions": ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"],
  "disallowed_religion_cross_contamination": true,
  "min_authority": 7,
  "notes": "Passage should address PURPOSE of suffering, not just fact of suffering"
}
```

### Starter test cases

```json
[
  {
    "id": "theodicy-001",
    "query": "Why does God allow suffering if he is loving?",
    "intent": "theodicy",
    "required_topics": ["theodicy", "tests-trials"],
    "forbidden_topics": ["law-practice", "social-order", "prayer"],
    "required_religions": ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"],
    "notes": "Must show purpose, not just acknowledge suffering exists"
  },
  {
    "id": "theodicy-002",
    "query": "What is the purpose of suffering in religion?",
    "intent": "theodicy",
    "required_topics": ["theodicy", "tests-trials"],
    "required_religions": ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"]
  },
  {
    "id": "prayer-001",
    "query": "Why should I pray if God already knows everything?",
    "intent": "prayer",
    "required_topics": ["prayer", "soul-spirit"],
    "forbidden_topics": ["law-practice", "social-order"],
    "required_religions": ["Christian", "Islam", "Judaism", "Baha'i"]
  },
  {
    "id": "afterlife-001",
    "query": "Do all religions believe in life after death?",
    "intent": "afterlife",
    "required_topics": ["afterlife", "soul-spirit"],
    "required_religions": ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"]
  },
  {
    "id": "freewill-001",
    "query": "If God knows everything, do we have free will?",
    "intent": "free-will",
    "required_topics": ["free-will", "theodicy"],
    "required_religions": ["Christian", "Islam", "Judaism", "Baha'i"]
  },
  {
    "id": "mercy-001",
    "query": "What do the scriptures say about mercy and compassion?",
    "intent": "mercy-compassion",
    "required_topics": ["mercy-compassion", "ethics"],
    "required_religions": ["Christian", "Islam", "Judaism", "Buddhist", "Baha'i"]
  },
  {
    "id": "forgiveness-001",
    "query": "How should I forgive someone who has wronged me?",
    "intent": "ethics",
    "required_topics": ["mercy-compassion", "ethics"],
    "required_religions": ["Christian", "Islam", "Judaism", "Baha'i"]
  },
  {
    "id": "soul-001",
    "query": "What is the soul? Is it immortal?",
    "intent": "soul-spirit",
    "required_topics": ["soul-spirit", "afterlife"],
    "required_religions": ["Christian", "Islam", "Judaism", "Baha'i"]
  },
  {
    "id": "unity-001",
    "query": "Why does God allow different religions to exist?",
    "intent": "progressive-revelation",
    "required_topics": ["progressive-revelation", "unity"],
    "required_religions": ["Christian", "Islam", "Baha'i"]
  },
  {
    "id": "love-enemies-001",
    "query": "What do the scriptures say about loving enemies?",
    "intent": "ethics",
    "required_topics": ["ethics", "love", "mercy-compassion"],
    "required_religions": ["Christian", "Islam", "Judaism", "Baha'i"]
  }
]
```

### Test runner logic (pseudo-code)

```javascript
async function testSearchQuality(testCase) {
  const results = await search(testCase.query, { limit: 10 });
  
  // 1. Religion coverage
  const religions = new Set(results.map(r => r.religion));
  const missingReligions = testCase.required_religions.filter(r => !religions.has(r));
  
  // 2. Topic relevance
  const topicScores = results.map(r => {
    const tags = r.topic_tags || [];
    const hasRequired = testCase.required_topics.some(t => tags.includes(t));
    const hasForbidden = (testCase.forbidden_topics || []).some(t => tags.includes(t));
    return { relevant: hasRequired, contaminated: hasForbidden };
  });
  
  // 3. Cross-religion contamination
  // e.g. Islam paragraph in Judaism slot
  
  return {
    passed: missingReligions.length === 0 && topicScores.every(s => s.relevant && !s.contaminated),
    missingReligions,
    irrelevantResults: topicScores.filter(s => !s.relevant).length,
    contaminatedResults: topicScores.filter(s => s.contaminated).length
  };
}
```

---

## Implementation sequence

1. **Immediate (authority fix):** Add `lights-of-guidance` to TITLE_AUTHORITY in `authority.js` → `authority: 8`
2. **This week (schema):** Migration 59 — add `topic_tags`, `question_types`, `topic_tagged_at` to `content` table; sync to Meilisearch as filterable
3. **This week (seed tests):** Write `tests/search/topic-relevance.test.json` with the cases above; write runner script
4. **Days 1-3 (tagging Phase 1):** Batch-tag Lights of Guidance paragraphs first (chapter headings are the taxonomy), then Bahá'í primary, then OceanLibrary scripture
5. **Days 4-7 (tagging Phase 2):** Remaining high-authority docs
6. **After tagging:** Enable topic filter in Jafar search — for each query, classify intent → required_topics → `topic_tags IN (?)` filter on Meilisearch
7. **Ongoing:** Run test suite against live API; monitor for topic-mismatch rate

---

## Open questions

- **Tagging model:** Haiku 3.5 for batch cost; Sonnet for borderline cases?
- **Granularity:** Should a 50-word paragraph get the same tags as a 300-word one? Probably yes — tag the *content*, not the length.
- **Tag language:** English only, or also tag Arabic/Farsi/Hebrew texts? Probably English tags derived from the translation.
- **Topic drift:** Some passages cover 4-5 topics. Cap secondary tags at 3 to avoid over-tagging diluting filter precision.
- **HyPE integration:** HyPE questions already encode "what question does this answer?" — topic_tags on the paragraph would complement, not replace, HyPE.
