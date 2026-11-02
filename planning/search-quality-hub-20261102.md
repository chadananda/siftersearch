# Search quality hub: one question registry, one runner, one gate (Chad 11-02)

> "We need a central place for improving search results. This seems to be trending towards spaghetti. I had asked you
> long ago to … survey all the most likely questions people ask of an interfaith library. Those questions are the basis
> for our hype extraction." · "do not make me the testing bottleneck."

## Today (the spaghetti, counted 11-02)
12 fixture files with 12 schemas, about 15 scorers:
ocean-fixtures 516 · search-fixtures 52 · search-type-fixtures 83 · crosslingual 819 cases · anis-wording 98 · routing 45 ·
bio-search 20 · library 10 · concept-senses 4 · answer-decisions 6 · seeker-battery 32 · tests/chat scenarios.
- The "survey" is seeker-battery.json: 32 Google-keyword questions, with nothing per tradition. HyPE v15 was tuned on it.
- None of these files knows the others exist. Chad's feedback lands in whichever file the session happened to be touching.

## The hub
1. **Survey → families** (`planning/question-survey-interfaith-20261102.{md,json}`, in progress): about 60–120 question
   families (universal, per tradition ×12, cross-tradition, source/quotation, original-language, practical, scholarly,
   social), each with evidence and real wordings. This is the taxonomy everything else is labelled with.
2. **Registry** `tests/quality/questions/` holds every test question in one schema:
   `{id, text, family, type (router), traditions[], lang, origin: survey|log|seo|seed|chad|perplexity-miss|regression,
   expect: {docs[], text_contains[], author, original_lang, max_rank}, wordings[] (frozen variants), layers: [search, hype, anis]}`.
   - The 12 files are imported once, keeping their ids. Old files become read-only and are deleted when their scorers read the registry.
   - Wordings are generated per seed (natural question, paraphrase, misspelling/transliteration, original-language,
     cross-tradition) and frozen.
   - Comparative versions of every universal/practical family (Chad 11-02: "since this is interfaith"): "what do Islam
     and Christianity say about X", "X in the Bible vs the Qur'an", "do all religions teach X". `expect` holds one
     target per tradition named. The result passes only when EVERY side is represented, and each side is scored separately. Each wording inherits the seed's `expect`, so nothing needs a hand label. Haiku; cost estimated first.
3. **One runner** `tests/quality/run.mjs --layer search|hype|anis [--family …] [--sample N] [--tag …]`. It writes
   per-question results to `reports/` and appends to one history.
4. **One gate** `tests/quality/search-gate.mjs` compares two runs. Flipped questions are re-checked once to separate noise; exit 0 means ship, 1 means roll back.
   Every engine, index or prompt change runs it. I decide the result and report the verdict only.
5. **HyPE closes the loop:** every `hype_relevant` family must be answerable by HyPE questions in seeker words. The
   hype-layer run scores the registry's family wordings against the hype collection, which replaces score-seeker.py's 32.
6. **Feedback intake:** anything Chad flags (an email, a chat turn, a comment) becomes one registry entry
   (`origin: chad`) through one command. A miss stays a test forever.
7. **One page:** pass rate by family × tradition × layer, the trend, and the latest regressions (admin page, cached SSR plus live refresh).

## Order
a) Gate (being built, needed for the qdrant-main cutover) → b) survey lands → c) registry + importers → d) wordings →
e) runner reads the registry, old scorers retire → f) HyPE coverage check → g) intake + page.
