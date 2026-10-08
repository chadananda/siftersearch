# Continuous strategy audit — design (draft 2026-10-07)

Chad, 2026-10-07: *"a mechanism by which we continuously audit and optimize search strategies — and audit user
interaction to build new search strategies as new types of interaction call for them. I just don't want to do it inline.
A constant audit of interactions asking 'was the strategy correct or optimal?' 'does this suggest a new search
strategy?'. We should do this regularly for the first thousand or so days."*

## The loop

```
live interactions ──(logged, nothing slowed)──► nightly audit ──► weekly digest ──► Chad decides ──► changes
   Anís turns, searches,                         a slow, careful       misroutes, unmet       new strategy,     tested by the
   SourceHunt, API calls                          model reads each      needs, data gaps,      routing fix,      batteries, then
                                                  interaction           proposals              data fix          live
```

Nothing runs inline. A live answer stays fast; the careful thinking happens overnight, where a slow model is fine.

## What is audited (already logged)

Each Anís turn records the message, the triage (kind, stance), the strategy chosen, how many passages came back, the
format, the output check, timings, and the reply. Searches have `search_log`; SourceHunt has its audit log; every
System-1 decision is in `calls.db`. 334 user turns so far (2026-04 → 2026-10).

## The auditor's questions (per interaction)

Typed wherever possible, so verdicts can be counted and trended:

| question | answer |
|---|---|
| Was the chosen strategy right? | right · acceptable · wrong (→ which strategy from the catalogue) |
| Was it the *best* one? | yes · a better one exists (which) |
| Did the evidence answer the question? | fully · partly · no — and why (missing text, wrong tradition filter, ranking, routing) |
| Was the format right? | yes · another format (which) |
| Was anything wrong in the reply? | misquote, wrong attribution, wrong authority level, overreach (each with the passage) |
| Does this suggest a new strategy or project? | no · yes → a short description of the unmet need and the route it would take |
| Does it reveal a data gap? | missing work, bad OCR, missing original, wrong metadata — with ids |

## Aggregation (weekly)

- **Misroutes** counted by (wanted → chosen) strategy, with examples — the confusion matrix from real use.
- **Unmet needs** clustered: proposals that describe the same need are grouped, counted, and ranked by how often they recur
  and how much a strategy would help. A cluster that recurs becomes a candidate strategy with its example interactions.
- **Data gaps** turned into a work list (hollow documents, OCR, missing originals).
- **Trend lines**: right-strategy rate, evidence-answered rate, misquote rate — week over week, for the 1,000 days.

## What feeds back

1. **Routing battery** — audited interactions, once Chad (or a second check) confirms the verdict, become new routing
   cases. The battery grows from real use instead of guesses.
2. **Training data** — verified strategy decisions are labelled examples for Clef and Laya (Jev's replacement).
3. **The strategy catalogue** — recurring unmet needs become proposals on the Search Strategy page; Chad decides.
4. **Data fixes** — the gap list.

## Guardrails

- **Audit the auditor.** Chad spot-checks a few verdicts each week; agreement is tracked. An auditor that disagrees with
  Chad is retuned before its verdicts feed anything.
- **Never auto-change routing or strategies.** The audit proposes; the batteries test; Chad approves.
- **Privacy and placement.** Interactions are personal. Under the architecture rule they live on Cloudflare (D1); the
  auditor reads sanitized transcripts (the PII sanitizer exists and is verified) and stores only verdicts and anonymous
  examples. Until the D1 move, v1 runs on the existing logs on tower.
- **Budget.** A monthly cap. While volume is small (hundreds of turns a week) every interaction is audited; later a
  stratified sample (every misroute signal + low-confidence decisions + a random slice). Batch pricing for the slow model.

## Phases

1. **v1 (now)**: nightly script over the existing logs → verdicts table → weekly digest page on the docs site. Audit the
   334 past turns first as the baseline.
2. **v2**: verdicts feed the routing battery (after confirmation) and the Clef/Laya training export.
3. **v3**: on Cloudflare, reading D1 when Anís moves there.

## Decisions for Chad

- Monthly budget for the auditor model.
- Digest: a docs page only, or also an email each week?
- Who confirms verdicts before they become battery cases — Chad, or a second model with Chad spot-checking?
