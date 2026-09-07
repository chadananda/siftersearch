`sifter.db` here is a LOCAL DEV SUBSET, not the library.

It holds a few thousand documents; production holds ~158,000 across 12 traditions
and 6.6M paragraphs. Never survey it to answer questions about the corpus — doing
so has produced confident, wrong conclusions about ingestion health, language
coverage and whether original-language texts exist.

For anything authoritative: `node scripts/corpus-status.mjs`
