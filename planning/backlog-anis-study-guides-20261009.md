# Backlog — Anís study guides for any book

**Requested:** Chad, 2026-10-09. **Status:** not started. (Related open item: Liliane's request for an ‘Irfán study-guide
capability.)

## The request
Anís can take **any book** and provide **part-by-part study notes** — explaining names, people, places, concepts, tablets,
allusions — pitched at **the reader's actual level** (never repeating what this reader would find obvious).
- The notes can later be **saved to the user's OceanLibrary account, attached to the book**.
- Anís can prepare a **printed study version** of a portion of the book and **email it** to the user.
- Anís **remembers previous work and continues where he left off**.
- **What the notes contain is negotiated in chat** ("less history, more on the Arabic terms", "skip the people I know")
  and **remembered for next time**.

## What it draws on (already built or in progress)
- **Who is speaking / quoted** in each paragraph (content.authors — reader + window classifier) — a study note can say
  "this paragraph is Shoghi Effendi quoting Bahá’u’lláh's Tablet to the Sháh".
- **Disambiguation notes** (content.context: who each name/epithet refers to, place, era) and the **entity graph**
  (people, events, who-met-whom) for "who is this person".
- **Tablet metadata** (tablet_meta, /api/documents/:id/about) for "which Tablet is this" and the **Partial Inventory**
  pairing for originals.
- **Concepts** (concept claims / lexicon) and **CTAI.info** (term renderings, original Arabic/Persian words).
- **Heading paths** (block_attrs.path: chapter › section) to define the "parts" of a book.
- **Range links** (api/lib/ocean-range.js) so each note links to exactly the passage it explains on OceanLibrary.

## Design notes
- **Parts:** the book's own structure (chapters / sections from the heading path); for unstructured books, Anís proposes
  a division and the reader can change it.
- **Reader level, per person:** a reader profile kept with the user's Anís history (D1) — stated level, languages, what
  they've said they know, and a running **"already explained to this reader"** list (people, terms, Tablets), so a name
  explained in chapter 2 is not explained again in chapter 7, and across books.
- **Negotiated contents:** the reader's preferences ("more on terms, less on history", "include the original words",
  "no more than five notes a page") are stored as a small study preferences record and applied to every later part.
- **Continue where we left off:** per user × book: the last part covered, open questions, notes produced.
- **Printed version, emailed:** the text of the portion with numbered notes (footnotes or margin notes), as HTML + PDF
  through the existing Anís mail pipeline (SES, `worker/mail/*`); the text itself comes from OceanLibrary (licensing:
  only books whose text may be redistributed this way — check per collection).
- **Save to OceanLibrary account:** needs an OceanLibrary (ILM) API for user notes attached to a book/paragraph — ask the
  Solvve team (same conversation as the publication API). Until then, notes live in the Anís history and can be emailed.
- **Accuracy:** every factual note carries its source (a range link to the passage or entity record it rests on); no
  note from the model's memory alone (standing rule: verify, don't speculate).

## Open questions
1. First book(s) to pilot — Liliane's ‘Irfán study (Kitáb-i-Íqán?) or a history (The Dawn-Breakers)?
2. How is the reader's level first established — a short conversation, or a few sample notes the reader reacts to?
3. Which books may be emailed as printed study versions (rights)?
4. OceanLibrary notes API: does ILM already store user notes / highlights per book that we can write to?

## Done when
A reader can say "help me study The Dawn-Breakers", get chapter-by-chapter notes at their level with links to each
passage, adjust what the notes cover in chat, receive a printable version of a chapter by email, and come back days later
to continue with the next chapter — with nothing they already know explained twice.
