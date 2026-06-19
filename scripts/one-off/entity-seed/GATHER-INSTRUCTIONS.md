# Dawn-Breakers entity gather — instructions for resolve-against-seed agents

You extract every named entity from an assigned paragraph range of **The Dawn-Breakers**
(doc_id 21308) and RESOLVE each against the existing GPB entity seed, then write JSON to the server.

## Read your inputs (read-only)
```
cat ~/sifter/siftersearch/tmp/entity-research/seed-roster.txt
cd ~/sifter/siftersearch && sqlite3 -separator '@@@' data/sifter.db "SELECT paragraph_index, text FROM content WHERE doc_id=21308 AND paragraph_index BETWEEN <A> AND <B> AND deleted_at IS NULL ORDER BY paragraph_index;"
```
The roster lists the EXACT canonical names already known from God Passes By (GPB), with display aliases in «…».

## Extract
Identify every PERSON, PLACE, WORK (book/tablet/text), and GROUP (sect, dynasty, office, family-collective)
named or clearly referred to. **People are the priority type** — be thorough on persons; still capture others.

For EACH entity decide: is it already in the roster?
- **Transliteration varies dramatically** — match by sound/identity, NOT exact glyphs.
  Ḥusayn=Husayn, Sádiq=Sadiq=Ṣádiq, ‘=’=' (ayn/hamza), Páshá=Pasha, S̱h=Sh, ḵh=kh, Qá=Ka. Leaving off a
  nisba or title is NOT a different person. "Fatḥ-‘Alí S̱háh" == roster "Fatḥ-'Alí Sháh Qájár".
- A name shown as an ALIAS in the roster «…» resolves to that roster canonical (e.g. "the Master" → "‘Abbás Effendi, ‘Abdu’l-Bahá"; "Bábu'l-Báb" → "Mullá Ḥusayn-i-Bushrú'í").

### If the entity IS in the roster  (is_new: false)
- `canonical_name`: the EXACT roster canonical_name (copy verbatim, including diacritics).
- `entity_type`, `is_new`: false
- `db_statements`: **[] empty** — we already have GPB material; do NOT pile on excerpts.
- `mention_idxs`: the paragraph_index values where it appears.

### If the entity is NOT in the roster  (is_new: true — genuinely new to the corpus)
- `canonical_name`: the FULLEST proper NAME ONLY — honorifics + given name + nisba/epithet that is part of
  the name (e.g. "Mírzá Abu'l-Qásim, the Qá'im-Maqám"). **NO parenthetical glosses** — never
  "(by ‘Abdu’l-Bahá)", "(birthplace of X)", "(English physician)". Descriptive info goes in db_statements only.
- `entity_type`: person|place|work|group
- `side`: "Bábí" | "Bahá'í" | ""  (Bábí = the Báb's dispensation; antagonists/officials/clergy/pre-Bábí = ""; "" if unsure)
- `is_new`: true
- `db_statements`: 1–2 SHORT verbatim excerpts that identify who/what this is. Keep it light.
  Do NOT insert pronoun-bracket [name] disambiguation — that is a separate later pass.
- `mention_idxs`: paragraph_index values.

One entity per person (the fullest name), even if they appear under several titles — never split. No invented
facts; statements must be verbatim from the paragraphs. When a name could be two different people (namesakes),
use the surrounding context to resolve; if it matches a roster entity's context, resolve to it, else mark new.

## Write the result
Build a JSON array of all entity objects. Write to a LOCAL file first (path must NOT contain "/tmp/"),
e.g. `./db-gather-<A>-<B>.json`. Then copy to the server and confirm the count:
```
cat ./db-gather-<A>-<B>.json | ssh chad@tower-nas 'cat > ~/sifter/siftersearch/tmp/entity-research/db-gather-<A>-<B>.json'
ssh chad@tower-nas 'cd ~/sifter/siftersearch && node -e "const a=require(\"./tmp/entity-research/db-gather-<A>-<B>.json\");console.log(\"REMOTE_COUNT=\"+a.length+\" new=\"+a.filter(x=>x.is_new).length)"'
```
Confirm REMOTE_COUNT matches your array length.

## Return (consumed as data — concise + factual)
Total entities; is_new vs resolved counts; the list of NEW canonical names (with type); any ambiguous resolution calls.
