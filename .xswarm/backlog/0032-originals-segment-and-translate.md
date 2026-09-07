---
id: "0032"
title: Segment original-language documents and give each paragraph a translation
state: ready
priority: P1
size: XL
depends_on: ["0031"]
acceptance:
  - text: original-language documents are segmented into paragraphs of comparable granularity to the English corpus
  - text: segmentation is deterministic and stable — re-running does not renumber existing paragraphs
  - text: every original paragraph carries translation_text plus a translation_authority that names its provenance
  - text: a machine translation is never storable in a way that reads as an authoritative rendering
  - text: concept extraction and HyPE record which text they were derived from (original, authoritative translation, or machine translation)
  - text: alignment against existing authoritative translations runs BEFORE any machine translation is paid for
---

## Goal
Chad, 2026-09-06: "With original language documents, we should figure out how to
segment into reasonable paragraphs and then perhaps provide a translation field
for each. That would make all our documents fully searchable. All would have
concept extraction and hype generated as well."

The population is large: production holds **17,285 Persian and 7,699 Arabic
documents** (`corpus-status.mjs`). At the corpus-wide average of ~42 paragraphs
per document that is on the order of **1M paragraphs** — the largest single unit
of work in the project.

## 1. Order matters, and it is most of the cost
Many of those 25,000 originals ALREADY have an authoritative English rendering
somewhere in the corpus — that is precisely what 0026/0029 are about. Machine
translating them would be paying to reproduce work Shoghi Effendi already did,
and producing a worse text than the one we hold.

So: **align first, machine-translate only the residue.** Alignment is
deterministic and effectively free; translation is the expensive step. Doing
these in the wrong order is the difference between translating 1M paragraphs and
translating whatever is left after the authoritative renderings are attached.

## 2. Authority marking is load-bearing, not metadata
`translationAuthorityFor()` already distinguishes `shoghi-effendi` from
`committee` from provisional, and the code says why: a Guardian rendering "is an
authoritative interpretive act fixing WHICH SENSE of a polysemous original is
operative", which a committee text is not and a machine translation certainly is
not. That is a string and not a boolean for exactly this reason.

A machine translation stored so that downstream cannot tell it apart is the
worst outcome available here — worse than not having it. Concept extraction run
over a machine rendering of Bahá'u'lláh would yield concept claims that look
identical to claims derived from the authoritative English, and nothing
afterwards could separate them. **Every derived artefact — concepts, HyPE,
embeddings — must record which text it came from.**

## 3. Segmentation must be stable, or it invalidates alignment
`align_ref` stores a pair index. Re-segmenting a document renumbers its
paragraphs and silently invalidates every alignment already attached to it. So
segmentation cannot be a heuristic that drifts when the code changes.

Persian and Arabic texts in the corpus will not all carry usable paragraph
markers, and the granularity has to be comparable to the English side or
alignment cannot match. `docs.auto_segmented` already exists — establish what it
currently means before adding a second mechanism beside it.

## Open question for Chad
Whether a machine translation is wanted at all for scripture, or only for
secondary material. There is a real argument that a provisional machine
rendering of the Writings should never be stored, however well labelled, because
labels get dropped as data moves. Search coverage would then come from
cross-lingual embeddings on the original rather than from a translation field.
