---
id: "0040"
title: Anis tool reachability — the data is there; test whether Anis reaches it
state: ready
priority: P0
size: M
acceptance:
  - text: an actual Anis conversation is tested, not the endpoints beneath it
  - text: "who wrote the Kitáb-i-Íqán" is answered from library enumeration
  - text: works resolve by every common designation, not only their English title
  - text: an entity lookup never returns a confident WRONG match for a near-miss query
---

## What was measured, 2026-09-07 — and what was NOT
Chad: "Anis has access to search, library enumeration and entity tools. Why
would it refuse to use tools? Besides it has indexed many passages about the date
and authorship of the Iqan, including in God Passes By."

He is right, and an earlier note in this repo claiming "provenance questions are
weak, don't promise factual recall" was **wrong and dangerous** — it measured ONE
endpoint (raw passage search) and generalised to the whole system.

**Tool 1 — library enumeration: ANSWERS IT.**

    id=20810  The Kitáb-i-Íqán            author: Bahá'u'lláh
    id=15176  The Book of Íqán            author: Bahá'u'lláh

**Tool 2 — entity: the work is indexed under ONE designation.**

    "Book of Certitude"  → 1 hit, correct (type=work)
    "Kitab-i-Iqan"       → 0
    "Íqán"               → 0
    "Iqan"               → 1 hit — "Iqani", a PERSON. A confident WRONG match.

**Tool 3 — search: good on natural queries, poor on keyword-stuffed ones.** A
query of "Kitab-i-Iqan revealed Baghdad 1862 Book of Certitude" returned a
Buddhist Udana passage.

**NOT TESTED: Anis itself.** No conversation was held. Whether Anis reaches the
data depends on tool selection and prompting, and that cannot be inferred from
endpoint tests. That is this item's first job.

## Three defects this exposes
1. **Works need designations too.** 0038 treats this as a person problem. A work
   has a Persian title, an English title, a common short form and an
   anglicisation, and only one is indexed.
2. **A near-miss returns a wrong entity confidently.** "Iqan" → "Iqani" (person)
   is worse than zero results, because a chatbot will use it.
3. **`year=0` on documents.** Dates are absent from metadata entirely, so every
   date question must be answered from passages.

## Why P0
Anis is the product being shipped. If it cannot answer authorship — which the
library already knows — the failure is in the layer above the data, and that is
the cheapest possible fix. Test the conversation before changing anything beneath it.
