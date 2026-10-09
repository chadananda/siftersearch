# Backlog — voice interface for the Anís plugin (exploration)

**Requested:** Chad, 2026-10-09 — "I want to explore this." **Status:** exploration, not committed to a design.

## The idea
Talk to Anís in the web-component plugin: speak a question, hear the answer — on any host site (OceanLibrary,
oceanoflights.org, …), with text still shown beside it.

## What to explore
1. **Listening (speech → text)**
   - Browser Web Speech API: free and instant, but uneven across browsers and sends audio to the browser vendor.
   - Server-side: Whisper-class model (Cloudflare Workers AI runs Whisper inside our Worker — no new vendor), streaming
     partial transcripts. Handles accents and many languages (ties to the any-language request,
     backlog-anis-any-language-20261009.md).
   - Names and terms: Persian/Arabic names and Bahá’í terms (Bahá’u’lláh, Riḍván, Ḥuqúqu’lláh) are where generic speech
     recognition fails — a term list / prompt bias from our lexicon and gazetteer.
2. **Speaking (text → speech)**
   - Anís's own explanations: a natural TTS voice (Workers AI / an external voice), streamed sentence by sentence so the
     first words play within about a second (the 1 s budget, project_who_met_whom_and_1s_budget).
   - **Quotes in a real human voice where one exists:** OceanLibrary books are narrated (`data-audio="1"` on their
     paragraphs) — a quoted passage could play the published recording of exactly that passage instead of a synthetic
     voice reading scripture. Needs the audio URL per block (ilm id is now stored: content.block_attrs.ilm_id) and range
     timing if only part of a paragraph is quoted.
   - Pronunciation of transliterated names and Arabic/Persian originals (SSML / phoneme hints, or play the original
     only from a human recording).
   - Existing `api/services/audio.js` (document → TTS with caching) is a starting point for caching spoken answers.
3. **Conversation feel**
   - Push-to-talk vs hands-free (barge-in: the user interrupts while Anís speaks).
   - What is read aloud vs only shown: citations, links and tables stay on screen; the spoken answer is shorter.
   - Mobile: microphone permission prompts, background audio, Bluetooth.
4. **Cost and privacy** — audio stays in our Worker where possible; no audio stored without consent (the existing
   identity/consent model, project_companion_identity_consent).

## A first experiment
Push-to-talk in the plugin → Workers AI Whisper transcript → normal Anís answer → spoken by a streamed TTS voice, with
any quote that has an OceanLibrary recording played from the recording. Measure: time to first audio, recognition of
Bahá’í names on a fixed list of spoken test questions, and how often a quote has a human recording.

## Open questions
- Which voice(s) for Anís — one consistent persona voice per language?
- Should quotes always be the human recording when available, even mid-answer?
- Host-site control: can a site turn voice off, or choose the voice?
