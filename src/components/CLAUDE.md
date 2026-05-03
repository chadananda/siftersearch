# src/components — Svelte 5 components

Components use runes (`$state`, `$derived`, `$effect`) and modern event
syntax (`onclick`, `{#snippet}` over slots).

## Top-level UI shells (root)
- `ChatInterface.svelte` — Jafar chat UI. Streaming SSE, message rendering, search hits, citations. **Mega-file (5,371 lines) — split deferred.**
- `AcquisitionList.svelte` — admin doc-acquisition triage list.
- `MetadataEditor.svelte` — doc metadata edit form.
- `GraphExplorer.svelte` — graph visualization.
- `GraphSummary.svelte` — graph metrics.
- `AudioPlayer.svelte` — TTS playback for narrated paragraphs.
- `AuthModal.svelte` — sign-in / sign-up modal.
- `ApiKeyManager.svelte` — API key issue / revoke UI (paid tier).
- `ProfilePage.svelte`, `SettingsPage.svelte`, `SupportPage.svelte` — user account.
- `ContributeForm.svelte`, `ReferralDashboard.svelte`, `TierBadge.svelte` — community + monetization.
- `LiquidBackground.svelte`, `ReligionIcon.svelte`, `ThemeToggle.svelte` — visual elements.
- `TranslationView.svelte` — paired-language paragraph display.
- `VersionChecker.svelte` — banner for stale-cache warning.

## Subdirectories
- `admin/` — admin UI (DocumentEditor, dashboards, ingestion controls).
- `library/` — public library browse + reader (`DocumentPresentation.svelte` mega-file, 3,314 lines — split deferred).
- `forum/` — forum post + comment UI.
- `common/` — small shared components.
- `print/` — print-friendly layouts.

## Conventions
- Tailwind classes only — semantic tokens like `bg-surface-1`, `text-primary`. No arbitrary `[var(...)]`.
- Components import the API client from `src/lib/api.js` — never call backend URLs directly.
- For SSR-friendly state, use `$state.frozen()` + `$derived` patterns.
