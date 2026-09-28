# Concept index at library scale — kernel catalogue + System-1 sweep (design, 2026-09-28)

Chad: *"make an exhaustive catalog of ideas from [the kernel books] and then sweep through everything else using
system-1 paragraph by paragraph … a fast index of concepts across the entire library … then fill in over a couple
months with slow follow-up … develop a library of conceptual hype questions around the core books and use jev to
select hype questions that match a paragraph … some kind of indexed fetch for matching."*

## The shape: slow and careful ONCE, fast and cheap EVERYWHERE

| layer | done by | size | cost |
|---|---|---|---|
| 1. Kernel catalogue of ideas | slow path (this session + existing concept claims) | ~3–5k ideas | session time |
| 2. Question library per idea | slow path, once | ~20–40k canonical questions | once |
| 3. Shortlist per paragraph | exact vector similarity over stored embeddings + term hits | 280k paragraphs × 5k ideas | ~minutes of CPU, $0 |
| 4. Verify + grade | Jev, one call per paragraph | 280k calls (fewer after dedup) | Jev only |
| 5. Questions per paragraph | Jev picks from the matched ideas' questions | same call or one more | Jev only |
| 6. Follow-up over months | review of flags, novelty queue, catalogue growth | continuous | small |

## 1. The kernel catalogue — ideas, not terms

Kernels, each authoritative in its own register: the Kitáb-i-Íqán (Bahá'u'lláh — interpretation of scripture,
progressive revelation, the Manifestation), Some Answered Questions (‘Abdu'l-Bahá — metaphysics, the soul, prophecy,
evolution, free will), God Passes By (Shoghi Effendi — the history as interpreted: covenant, administrative order,
the ages of the Faith). Later: the Hidden Words, Gleanings, the Aqdas, The World Order of Bahá'u'lláh.

An **idea** = one teaching, stated in one line, with:
- its **terms**: English renderings AND original-script terms and roots (a concept is not 1:1 with a word — insáf vs
  ‘adl both gloss "justice"; memory: feedback_concept_identity_beyond_spelling);
- its **exemplars**: the kernel paragraphs that state it (proof-anchored — the existing concept claims already carry
  verbatim proof spans: 19,039 claims, Íqán 3,523, GPB 3,753);
- its **senses**: a symbol with several authorized meanings keeps them ALL as siblings (the clouds, the sun, the
  stars — symbolic works carry many meanings at once; never pick one);
- a **place in a hierarchy**: domain → theme → idea, so a paragraph can match at the right grain and search can widen.

Built from what exists: cluster the kernel's concept claims by meaning (their semantic keys + embeddings) into
candidate ideas, then curate — merge, split, name, add missing — here, where judgement is free. The Íqán first
(~290 paragraphs, 3,523 claims): a few hundred ideas.

## 3. The indexed fetch — a shortlist without any model call

Classification needs a short list; the library needs thousands of ideas. The fetch:
- **Vectors.** Every paragraph already has a text-embedding-3-large vector stored in the database (the search index
  keeps only 1-bit quantized copies, too lossy for this). Embed each idea once (statement + terms + exemplar
  sentences — pennies). Then exact cosine, all paragraphs × all ideas, is a matrix multiply: minutes on the server's
  80 cores, no model spend, reproducible. Top ~12 ideas per paragraph.
- **Terms.** Add every idea whose original-script root or rendering literally occurs in the paragraph (keyword hits
  catch a symbol inside narrative that embeddings blur). Union, capped at ~16.
- Cross-lingual comes free: the embeddings are multilingual, and the original-script terms match Persian and Arabic
  paragraphs directly.

## 4. Verification and grading — Jev, one call per paragraph

One Jev call per paragraph, one question per shortlisted idea. A `choice`, not yes/no, because the RELATION matters
for ranking:
- **explains** — the paragraph teaches or expounds the idea (ranks first for "what does X mean");
- **applies** — uses or illustrates it;
- **mentions** — touches it in passing;
- **no**.

Multi-label: a paragraph can explain several ideas; sibling senses of a symbol are separate questions, so a passage
can carry more than one meaning at once. Each answer keeps its confidence; the index stores all of it.

Cost control:
- **dedupe first** — the same paragraph appears in several editions and compilations (normalized_hash); judge each
  text once;
- **shortlist floor** — skip ideas below a similarity floor measured on gold;
- **skip non-prose** — index lines, tables and bibliographies (the paragraph router, jev-system1.md §4).

## 5. The question library — canonical HyPE (this is also how HyPE becomes cheap)

For each idea, the slow path writes a handful of canonical questions people actually ask ("What does the Íqán mean by
the clouds that hide the Son of Man?", "Why do the people of every age reject the new Messenger?"). A paragraph matched
to an idea is then offered that idea's questions, and Jev picks the ones this paragraph ANSWERS — no per-paragraph
generation. Gains over today's generated HyPE:
- **one phrasing across the library** — a user's question lands on a canonical question that points at every
  paragraph answering it, ranked by authority: a question → many-answers index;
- **cost** — generation runs over ~30k questions once, not over 280k paragraphs (today's HyPE is output-heavy; the
  reasoning tax once emptied 69% of a book's questions);
- generated HyPE stays for the long tail the library does not cover.

## 5b. The inverted index — questions and ideas point at MANY paragraphs

Today's HyPE is paragraph-keyed: each generated question is a row pointing at the ONE paragraph it came from, so "what
does the Íqán mean by the clouds?" exists as dozens of near-duplicates, each attached to one paragraph, and concept-aware
only in the ~10 books with concept claims. The inverse is the model to build — three node types, two edge tables:

- **idea** (catalogue) ──< **idea_paragraph** (idea, paragraph, relation explains|applies|mentions, confidence,
  matcher version) >── **paragraph**
- **question** (canonical, per idea, embedded) ──< **question_paragraph** (question, paragraph, confidence) >── paragraph
- question → idea: each canonical question belongs to one idea (a question can be shared by sibling senses).

Query time: user question → nearest canonical questions (a ~30k-row index: exact search in milliseconds) → their
answer lists, ranked by relation, authority and confidence; the idea gives the wider "explains" list when the question
is broad. Generated per-paragraph HyPE stays as the fallback for questions the library does not cover — and its hits are
a source of NEW canonical questions (the novelty queue for questions).

Cheap HyPE: generation happens once per idea (~30k questions), not once per paragraph (280k × several); Jev selects per
paragraph from the matched ideas' questions (~$0.04 per million input tokens).

## 6. The slow follow-up (months)

- **Calibrate before sweeping.** The 19k proof-gated concept claims are gold positives (paragraph P states idea C);
  random pairs give negatives. Measure precision and recall of shortlist + Jev at each threshold; set the thresholds
  from data, as with identity today.
- **Review queue.** Low-confidence "explains", and disagreement between vector rank and Jev, sampled for review here.
- **Novelty queue.** A Jev question per paragraph: "does this state a significant idea NOT in the list?" → the slow
  path proposes new ideas → the catalogue grows → only the new ideas are swept (one column of the matrix, cheap).
- **Versioning.** Each match row carries catalogue version, idea id and matcher version; improving an idea re-sweeps
  only its column.

## What it gives search and Anís

- A **concept facet**: filter or boost by idea; "explains" paragraphs rank above "mentions".
- **Zero-LLM concept search**: query → idea (vector + Jev) → the paragraphs that explain it, kernel and authoritative
  texts first, then commentary and other traditions.
- **Cross-tradition comparison**: the same idea's explains-list across religions, the ground truth the comparative
  questions need.

## Build order (each step measured before the next)

1. **Íqán catalogue** from its 3,523 claims → curated ideas with terms, exemplars, senses. Embed.
2. **Gold calibration**: shortlist recall (are the true ideas in the top 12?) and Jev precision per threshold, using the
   SAQ and GPB claims as held-out gold.
3. **Pilot sweep** of one non-kernel book that discusses Íqán themes (e.g. Gate of the Heart) → review a sample.
4. **Question library** for the Íqán ideas; A/B against generated HyPE on the search type battery.
5. **Library sweep** with dedup and budget checks; novelty queue on.

## On ingest — indexed the day a text arrives

Every new paragraph already gets its embedding at ingest. Run it through the shortlist and one Jev call immediately:
concept links and canonical questions exist the moment the text lands, before any slow extraction reaches it (Chad,
2026-09-28). The monthly cycle then refines; ingest never waits for it.

## Economics and cadence

Jev: $42 per billion input tokens, output free → a full library pass (~280k paragraphs × ~1.5k tokens) ≈ $15–25;
a new idea or question needs only its own column. Chad (2026-09-28): a few hundred dollars a month — a MONTHLY cycle:
the slow path grows the catalogue and question library from new and kernel texts; Jev re-links the whole library; every
link carries catalogue + matcher versions, so each pass replaces the last and a bad month is undone by the next.
