<!-- "Rate this talk" chip + modal (Chad 11-03): signed-in listeners leave a 1-5 score, a comment and the best start point.
     Signed out → AuthModal first. Data loads only when the dialog opens (no SSR, no layout shift). Deps: api.js media.feedback/saveFeedback. -->
<script>
  import { getAuthState, initAuth } from '../../lib/auth.svelte.js';
  import { media } from '../../lib/api.js';
  import { parseClock, formatClock } from '../../lib/talk-feedback.js';
  import AuthModal from '../AuthModal.svelte';

  /** slug: the talk; duration: seconds; getCurrent(): the player's position (recording time); onpreview(t): play from t */
  let { slug, duration = 0, getCurrent = () => 0, onpreview = () => {} } = $props();

  const COMMENT_MAX = 4000;
  const auth = getAuthState();
  let dlg = $state(null);
  let authOpen = $state(false);
  let shown = $state(false);   // the dialog body renders only while open (nothing in the SSR HTML)
  let loading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let notice = $state('');
  let data = $state(null);
  let score = $state(0);
  let comment = $state('');
  let startText = $state('');

  const startS = $derived(parseClock(startText));
  const startBad = $derived(startText.trim() !== '' && (startS == null || (duration > 0 && startS > duration)));
  const others = $derived((data?.entries || []).filter((e) => !e.mine));

  async function load() {
    loading = true; error = '';
    try {
      data = await media.feedback(slug);
      const m = data?.mine;
      if (m) { score = m.score || 0; comment = m.comment || ''; startText = m.suggested_start_s != null ? formatClock(m.suggested_start_s) : ''; }
    } catch (e) {
      error = e?.data?.message || 'Could not load the feedback. Try again in a moment.';
    } finally { loading = false; }
  }

  function showDialog() {
    notice = ''; error = ''; shown = true;
    dlg?.showModal();
    load();
  }

  async function open() {
    if (!auth.isAuthenticated) await initAuth().catch(() => {});   // the refresh cookie may hold a session nobody has checked yet
    if (auth.isAuthenticated) showDialog();
    else authOpen = true;
  }

  const afterAuth = () => { if (auth.isAuthenticated) showDialog(); };
  const close = () => dlg?.close();

  function useCurrent() { startText = formatClock(getCurrent()); }
  function preview() { if (startS != null && !startBad) { close(); onpreview(startS); } }

  async function save(ev) {
    ev.preventDefault();
    if (startBad) { error = 'The start point is not a time inside this talk (use m:ss or h:mm:ss).'; return; }
    if (!score && !comment.trim() && startS == null) { error = 'Add a score, a comment or a start point.'; return; }
    saving = true; error = ''; notice = '';
    try {
      data = await media.saveFeedback(slug, { score: score || null, comment: comment.trim() || null, suggested_start_s: startS });
      notice = 'Thank you. Your feedback is saved.';
    } catch (e) {
      error = e?.status === 401 ? 'Please sign in again to save.' : (e?.data?.message || 'Could not save. Try again in a moment.');
    } finally { saving = false; }
  }

  const when = (unix) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const stars = (n) => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
</script>

<button type="button" class="chip" onclick={open} aria-haspopup="dialog">
  <svg class="h-4 w-4 text-radio-amber" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>
  <span>Rate this talk</span>
</button>

<AuthModal bind:isOpen={authOpen} onClose={afterAuth} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions — backdrop click; Escape is native to <dialog> -->
<dialog bind:this={dlg} class="fb bg-radio-paper text-radio-ink" aria-labelledby="fb-title" onclose={() => (shown = false)} onclick={(e) => { if (e.target === dlg) close(); }}>
  {#if shown}
  <div class="p-5 sm:p-6">
    <div class="flex items-start justify-between gap-4">
      <h2 id="fb-title" class="text-lg font-semibold">Rate this talk</h2>
      <button type="button" class="x text-radio-ink-soft hover:text-radio-amber" onclick={close} aria-label="Close">✕</button>
    </div>

    <p class="mt-1 text-sm text-radio-ink-soft" aria-live="polite">
      {#if loading && !data}Loading…
      {:else if data?.scored}Average {data.average} of 5 from {data.scored} {data.scored === 1 ? 'score' : 'scores'}{data.count > data.scored ? `, ${data.count} responses` : ''}.
      {:else if data}No scores yet. Yours can be the first.{/if}
    </p>

    <form class="mt-4 space-y-5" onsubmit={save}>
      <fieldset>
        <legend class="text-sm font-medium">Your score</legend>
        <div class="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Score from 1 to 5">
          {#each [1, 2, 3, 4, 5] as n (n)}
            <button type="button" role="radio" aria-checked={score === n} aria-label={`${n} of 5`}
              class="star {n <= score ? 'text-radio-amber' : 'text-radio-ink-soft'}" onclick={() => (score = score === n ? 0 : n)}>{n <= score ? '★' : '☆'}</button>
          {/each}
          {#if score}<span class="ml-2 text-sm text-radio-ink-soft">{score} of 5</span>{/if}
        </div>
      </fieldset>

      <div>
        <label for="fb-comment" class="text-sm font-medium">Comment</label>
        <textarea id="fb-comment" bind:value={comment} maxlength={COMMENT_MAX} rows="4"
          class="field mt-1 w-full bg-radio-room text-radio-ink" placeholder="What did you think? Anything wrong with the recording?"></textarea>
        <p class="text-right text-xs text-radio-ink-soft">{comment.length} / {COMMENT_MAX}</p>
      </div>

      <div>
        <label for="fb-start" class="text-sm font-medium">Best start point</label>
        <p class="text-xs text-radio-ink-soft">Many recordings begin with tuning, chatter or silence. Where does the talk really start?</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <input id="fb-start" type="text" inputmode="numeric" bind:value={startText} placeholder="m:ss" aria-invalid={startBad}
            class="field w-28 bg-radio-room text-radio-ink {startBad ? 'bad' : ''}" />
          <button type="button" class="btn" onclick={useCurrent}>Use current position</button>
          <button type="button" class="btn" onclick={preview} disabled={startS == null || startBad}>Preview from here</button>
        </div>
        {#if startBad}<p class="mt-1 text-xs text-radio-needle">Use m:ss or h:mm:ss, within {formatClock(duration)}.</p>{/if}
        {#if data?.starts?.count}<p class="mt-1 text-xs text-radio-ink-soft">Listeners suggest {formatClock(data.starts.median)} (median of {data.starts.count}).</p>{/if}
      </div>

      {#if error}<p class="text-sm text-radio-needle" role="alert">{error}</p>{/if}
      {#if notice}<p class="text-sm text-radio-ink" role="status">{notice}</p>{/if}

      <div class="flex justify-end gap-2">
        <button type="button" class="btn" onclick={close}>Close</button>
        <button type="submit" class="btn primary bg-radio-walnut text-radio-on-dark" disabled={saving || startBad}>{saving ? 'Saving…' : data?.mine ? 'Update' : 'Save'}</button>
      </div>
    </form>

    {#if others.length}
      <h3 class="mt-6 text-sm font-semibold">What listeners said</h3>
      <ul class="mt-2 space-y-3">
        {#each others as e, i (i)}
          <li class="entry border-radio-line">
            <div class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-medium">{e.name}</span>
              <span class="text-xs text-radio-ink-soft">{when(e.updated_at)}</span>
              {#if e.score}<span class="text-radio-amber" aria-label={`${e.score} of 5`}>{stars(e.score)}</span>{/if}
              {#if e.suggested_start_s != null}
                <button type="button" class="link text-xs text-radio-ink-soft hover:text-radio-amber" onclick={() => { close(); onpreview(e.suggested_start_s); }}>start at {formatClock(e.suggested_start_s)}</button>
              {/if}
            </div>
            {#if e.comment}<p class="mt-1 whitespace-pre-line text-sm">{e.comment}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {/if}
</dialog>

<style>
  .chip { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.5rem; padding: 0.4rem 0.9rem; border-radius: 0.7rem; color: var(--radio-on-dark);
    box-shadow: inset 0 0 0 1px var(--radio-brass); transition: background 0.2s; cursor: pointer; }
  .chip:hover { background: var(--radio-walnut-deep); color: var(--radio-amber); }
  .chip:focus-visible, .btn:focus-visible, .star:focus-visible, .x:focus-visible, .link:focus-visible, .field:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .fb { width: min(36rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; border-radius: 1rem; box-shadow: inset 0 0 0 1px var(--radio-line), 0 20px 60px rgb(0 0 0 / 0.35); overflow-y: auto; }
  .fb::backdrop { background: rgb(0 0 0 / 0.55); }
  .star { font-size: 1.75rem; line-height: 1; padding: 0.15rem; border-radius: 0.3rem; cursor: pointer; }
  .field { padding: 0.45rem 0.6rem; border-radius: 0.5rem; box-shadow: inset 0 0 0 1px var(--radio-line); }
  .field.bad { box-shadow: inset 0 0 0 2px var(--radio-needle); }
  .btn { min-height: 2.25rem; padding: 0.35rem 0.8rem; border-radius: 0.55rem; font-size: 0.875rem; box-shadow: inset 0 0 0 1px var(--radio-brass); cursor: pointer; }
  .btn:hover:not(:disabled) { color: var(--radio-amber); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { box-shadow: none; }
  .entry { border-top-width: 1px; border-top-style: dashed; padding-top: 0.75rem; }
  .x { font-size: 1.1rem; padding: 0.2rem 0.4rem; border-radius: 0.3rem; cursor: pointer; }
  .link { text-decoration: underline; cursor: pointer; }
</style>
