# Person enrichment — instructions for the fleet

You enrich PERSON entities of the SifterSearch Bahá'í dictionary. Read your assigned slice (JSONL, one
person per line; each: {name, aliases, mentions, books, rel_degree, side, era, has_desc, desc} — `desc`
is what GPB/DB already say):
```
sed -n '<A>,<B>p' ~/sifter/siftersearch/tmp/entity-research/persons-enrich.jsonl
```

For EACH person produce an enrichment record.

**1. importance (1–100)** — how helpful is it to know THIS person to learn Bahá'í history. JUDGMENT against
this rubric (not a formula), using the signals (mentions, #books, rel_degree) + role/station + external
notability as evidence. Give a one-line `importance_reason`.
- 90–100: Manifestations & central figures (the Báb, Bahá'u'lláh, ‘Abdu'l-Bahá, Shoghi Effendi)
- 70–89: Letters of the Living; foremost heroes (Mullá Ḥusayn, Quddús, Ṭáhirih, Vaḥíd, Ḥujjat); the Holy Family; sovereigns/viziers who drove events
- 45–69: figures whose stories are taught — Seven Martyrs, prominent Hands/teachers, key secondary antagonists
- 20–44: named episode participants (fort defenders, regional believers, lesser officials) with recurring presence or a memorable anecdote
- 1–19: one-mention incidental names (a martyr-list entry, a passing official, a once-cited chronicler)

**2. common_name** — the name this person is MOST commonly called (corpus + general usage), usually SHORTER
than the full honorific+nisba form (prefer "Quddús", "Ṭáhirih", "Mullá Ḥusayn"). If the current `name` is
already the most-used, set common_name = name. For obscure people whose full name is all that is used, keep
it. ALWAYS ensure the full/honorific form ends up in `aliases`. (Shoghi Effendi uses the simple title because
the simple name is what makes a figure learnable — follow that.)

**3. summary** — 1–2 sentences: who they were AND the role they played in Bahá'í history. For low-importance
incidentals a single clause is fine.

**4. TIERED research:**
- importance ≥ 40, OR notable-but-thin `desc`: WebSearch (Wikipedia, bahaipedia.org, bahai-library.com) and
  library search `curl -s "https://api.siftersearch.com/api/v1/search?q=<URL-encoded name>&limit=6"` to gather
  facts, alternate names/spellings (→ aliases), native script (Arabic/Persian → native_script), and — ONLY
  where `desc` didn't already supply it — 1–3 VERBATIM source-tagged characterizations (e.g. "Wikipedia: …").
- importance < 40 incidentals: NO web search; derive summary + score + name + obvious alias variants from the
  given data only.

**Output** a JSON array, each record:
`{name, common_name, aliases:[...], native_script:[...], summary, importance, importance_reason, characterizations:[...]}`
`name` must be the EXACT input name. Omit characterizations if none to add. Write locally (path WITHOUT "/tmp/")
to `./db-enrich-<A>-<B>.json`, then:
```
cat ./db-enrich-<A>-<B>.json | ssh chad@tower-nas 'cat > ~/sifter/siftersearch/tmp/entity-research/db-enrich-<A>-<B>.json'
ssh chad@tower-nas 'cd ~/sifter/siftersearch && node -e "const a=require(\"./tmp/entity-research/db-enrich-<A>-<B>.json\");console.log(\"REMOTE=\"+a.length)"'
```
Confirm REMOTE matches your count. Report: count, importance distribution, notable renames, any likely
duplicates you spot (flag, don't merge). Output consumed as data.
