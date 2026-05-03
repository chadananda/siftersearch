# api/lib/constants — Shared enums + lookups

Single source of truth for arrays/maps that would otherwise be inlined
in multiple files (drift risk). One file per concern.

- `languages.js` — `AI_SEGMENTED_LANGUAGES` (ar, fa, he, ur), `RTL_LANGUAGES`, helpers `isAiSegmentedLanguage`, `isRtlLanguage`. Used by both ingester.js and segmenter.js.

## Future (deferred from refactor)

- `religions.js` — canonical religion list aligned with the DB column. Currently held inline in `api/agents/agent-librarian.js` with different conventions (Hinduism vs Hindu, Christianity vs Christian) — extracting requires aligning librarian validation with DB convention and is a behavior change worth its own focused PR.
- `mime.js` — content-type strings. Marginal value (most uses are conventional one-offs).
