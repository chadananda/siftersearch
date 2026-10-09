# Backlog — Anís in any language (internationalization)

**Requested:** Chad, 2026-10-09. **Status:** not started.

## The request
Users can converse with Anís in any language. Anís still **quotes in the original language** of the passage, but gives
its **explanations and translations in the user's language**.

> "that means we have to be careful with templating." — every fixed string Anís sends is a template that must follow
> the user's language too, not only the model's free text.

## What this means
- **Detect the conversation language** per message (the user may switch), and keep it on the session / mail thread.
- **Quotes stay verbatim** in the language they were written or published in — never machine-retranslated into the
  user's language as if they were the text (standing rule: never retranslate a translated text; prefer an existing
  published translation/twin; Shoghi Effendi's renderings are authoritative English). Where the library holds a
  published translation in the user's language, offer it, labelled with its translator/authority.
- **Explanations, framing, summaries** in the user's language.
- **A translation Anís makes itself** is labelled as such (provisional, not authoritative), in the user's language,
  beside the original — CTAI.info for term-level renderings (concordance), never presented as the published text.
- **Citations / links** unchanged (OceanLibrary range links, paragraph links); link labels translated.

## Templating — everything fixed must be localised
Fixed strings live in several places today; each needs a per-language form (and a fallback to English that is logged):
- `api/lib/anis/canned.js` — `CANNED` replies, `NOTHING_FOUND`, `ANIS_SELF` ("an experimental AI research assistant
  with my own email address…"), `selfFor`.
- `api/lib/anis/formats.js` — `FORMATS` answer shapes (labels, headings the model fills).
- `api/lib/anis/ctai-term.js` — term-study table/chart labels ("renderings", "passages"), `termFormatHow` tokens.
- Mail (Cloudflare Worker, `worker/mail/*`, D1 `mail_templates`): `welcome`, `support_welcome`, `support_reply`
  templates (migrations 0006/0009), the signature block ("AI Research Assistant for Ocean 2.0"), the pause footer and
  RFC 8058 unsubscribe page (`/_mail/pause`), the review page, the daily digest (internal — English is fine).
- Web component / chat UI strings (buttons, placeholders, errors) — the host site's locale vs the user's language.
- Charts and tables in email (`worker/mail/letter.js` chart titles/units).
Rule of thumb: **no user-facing literal in code** — a message catalogue keyed by id, `{{placeholders}}` filled after
translation (so names, numbers, links are never translated or reordered by accident), right-to-left layout for
fa/ar/he/ur in HTML mail and the widget.

## Open questions
1. Which languages first? (Persian and Arabic readers of the originals; Spanish, French, German, Portuguese, Russian?)
2. Catalogue translations: human-reviewed per language, or model-drafted then reviewed by a native speaker?
3. Search in the user's language: translate the query to English for retrieval, or embed cross-lingually? (Corpus-wide
   cross-lingual vector search measured weak on 09-30 — 5% — so query translation is the safer first step.)
4. Mail: detect from the incoming letter, or a stored preference once known?
5. Audit: the nightly strategy audit should record the conversation language and flag fallbacks to English.

## Done when
- A conversation in, e.g., Spanish gets Spanish explanations with quotes in their original language (English for
  OceanLibrary texts, Persian/Arabic originals where cited) plus any published Spanish translation, labelled.
- Every fixed string (canned, formats, term study, mail templates, signature, footer, pause page, widget) comes from a
  catalogue in the user's language, with an English fallback that is logged.
- RTL languages render correctly in the widget and HTML mail.
