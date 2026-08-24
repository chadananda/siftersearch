# Periodic Audit Checklist

Every entry here exists because something went wrong once and nothing was watching. The rule that
produced this file: **an invariant without a detector is a wish.**

Run the automated subset any time:

```bash
node scripts/audit-invariants.mjs            # all automated checks, exits 1 on violation
node scripts/audit-invariants.mjs --json     # machine-readable
```

Checks marked **AUTO** run in that script. Checks marked **MANUAL** still need a human to run the query —
each one is a candidate for promotion to AUTO, and promoting one is always worth the hour.

Cadence: **weekly** for the automated run, **monthly** for a pass over the manual entries. After any
pipeline change that touches entities, documents, or the writer, run the automated set immediately.

---

## How to add an entry

When an incident is found, add it here *in the same commit as the fix*, with:

1. **Invariant** — the property that must hold, stated so it can be tested.
2. **Incident** — the date and what it actually cost, so nobody deletes the check as noise.
3. **Check** — the exact query or endpoint.
4. **Expected** — the value that means healthy.

If the check can be expressed as a query, add it to `scripts/audit-invariants.mjs` too. A check nobody
runs is the failure mode this file exists to prevent.

---

## Entity layer

### 1. No merged entity is served as live — **AUTO**

- **Invariant:** exactly one definition of "merged" exists (`api/lib/entity-live.js`), and no row satisfies
  one form of it while failing the other.
- **Incident (2026-08-24):** `applyMerge` marked duplicates by appending `⟨merged→N⟩` to `canonical_name`;
  every API reader tested `last_assessed_version` instead. **6,668 hollow entities** (6,666 persons) were
  served as live people with corrupted names for months. Person counts were overstated by a third —
  26,026 reported vs 19,360 real. Found only because an external client asked for enumeration.
- **Check:** `GET /api/admin/entities/merge-divergence`
- **Expected:** `servedButMerged: 0`

### 2. Live entities have unique natural keys — **AUTO**

- **Invariant:** `(canonical_name, entity_type, COALESCE(religion,''))` identifies at most one live entity.
  This is the durable key external consumers use to survive renumbering, so a collision breaks their
  re-resolution.
- **Note:** SQLite's `UNIQUE(canonical_name, entity_type, religion)` does **not** enforce this, because
  NULLs compare distinct and 16,318 rows have `religion IS NULL`. The constraint is not the guarantee.
- **Check:** `GET /api/admin/entities/key-collisions`
- **Expected:** `collisions: 0`

### 3. Entity ids are never reused — **MANUAL**

- **Invariant:** `graph_entities.id` is AUTOINCREMENT, so ids are burned, never recycled. A rebuild that
  renumbers is legitimate, but consumers must be able to *detect* it.
- **Incident:** ids currently run 1,247,551 → 1,302,536 over only ~52,765 live rows — proof a wholesale
  renumber already happened at least once, silently.
- **Check:** `GET /api/v1/graph/version` — compare `minId` and `generation` against the last recorded value.
- **Expected:** `minId` unchanged since the previous audit; if it moved, a renumber occurred and every
  external consumer must re-resolve by natural key.

### 4. Disambiguation has one owner — **MANUAL**

- **Invariant:** "disambiguated" is defined once, in `api/lib/pipeline/disambiguation.js`.
- **Incident (2026-08-13):** five drifting definitions across the codebase. Same class of failure as #1,
  eleven days earlier — which is why #1's check exists at all.
- **Check:** `grep -rn "context IS NOT NULL\|context_model" api/ scripts/ | grep -v pipeline/disambiguation.js`
- **Expected:** no hit that re-implements the predicate rather than importing it.

### 5. Stage completion is never inferred from yield — **MANUAL**

- **Invariant:** a stage is done because it *processed* the item and stamped it, never because it produced
  output. A paragraph naming nobody is still extracted.
- **Incident (2026-08-17):** extraction was the one stage with no version stamp; 53 books graded `done`
  with zero cast, and a 710-book note-version storm followed.
- **Check:** `GET /api/admin/grounding/unstampable` and the `doneNoCast` figure in the roadmap.
- **Expected:** `doneNoCast` books genuinely extracted and yielded nobody — spot-check three against
  `GET /api/admin/grounding/why/:docId`.

---

## Plan / corpus

### 6. Plan ids point at the canonical copy, not an empty duplicate — **MANUAL**

- **Invariant:** every id in `api/lib/integration-phases.js` resolves to the copy that actually holds prose.
- **Incident (2026-08-23):** plan entries pointed at empty duplicates (6555 → real copy 12511,
  15342 → 14870). "Plan exhausted" masked it entirely.
- **Check:** `GET /api/admin/grounding/exhaustion` → inspect `detail.husks`; resolve each by `file_path`
  and title, **not** by semantic search.
- **Expected:** `husks: 0`, or every husk explained.

### 7. Ingestion drops nothing — **MANUAL**

- **Invariant:** paragraph count in the DB matches the source file's block count.
- **Incidents:** hash-based data loss (2026-06-02); list-items and footnotes silently dropped (2026-06-16);
  a dedupe pass soft-deleted 155 canonical docs (2026-06-09).
- **Check:** sample five recently-ingested docs; compare `COUNT(*) FROM content WHERE doc_id=?` against the
  source markdown's block count.
- **Expected:** equal, or the difference fully explained by intentional filtering.

---

## Writer / performance

### 8. No unbounded aggregate runs on a fixed cadence — **MANUAL**

- **Invariant:** anything on a timer has a bounded working set. The single writer is the scarcest resource
  in the system.
- **Incidents (2026-08-13, 2026-08-22):** a 61-second synchronous UPDATE froze the writer and cost a night
  of grounding. The 08-22 freeze was *many* 3-second queries — invisible to a per-statement threshold.
- **Check:** `GET /api/admin/server/slow-queries`; rank by **cumulative** time, not worst-case.
- **Expected:** no query family whose total time dominates; `EXPLAIN QUERY PLAN` before adding any index.

### 9. Writer keep-alive is configured — **MANUAL**

- **Invariant:** `keepAliveTimeout` on the writer exceeds undici's socket reuse window.
- **Incident (2026-08-13):** Node's 5s default vs undici socket reuse produced "other side closed" errors
  that **no health probe can detect** — the probe opens a fresh socket every time.
- **Check:** confirm `keepAliveTimeout` is set explicitly in the writer's server setup.
- **Expected:** set, and greater than the client's reuse window.

---

## Publication safety

### 10. The PII sanitizer fails closed — **AUTO** (covered by tests)

- **Invariant:** if sanitization throws, publication refuses; it never emits the un-redacted original.
- **Incident (2026-08-17):** `routes/content.js` published the unredacted text on sanitizer failure —
  the exact opposite of the comment above it. Seven PII categories were also leaking.
- **Check:** `tests/api/publish-sanitizer-failclosed.test.js` and `tests/api/pii-sanitizer-recall.test.js`.
- **Expected:** green. These are a floor, not a guarantee — they catch every category that was *measured*.
