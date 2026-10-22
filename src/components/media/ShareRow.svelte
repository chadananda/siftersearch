<script>
  // Share a page: copy link, X, Facebook, WhatsApp, email (+ the device's own share sheet where there is one). Plain links,
  // no SDKs. `tone`: 'light' on paper/dial, 'dark' on walnut. Deps: src/lib/share.js.
  import { onMount } from 'svelte';
  import { shareLinks } from '../../lib/share.js';

  let { url, text = '', title = '', tone = 'light', compact = false } = $props();
  const links = $derived(shareLinks(url, text));
  let copied = $state(false), native = $state(false);
  onMount(() => { native = typeof navigator !== 'undefined' && !!navigator.share; });

  async function copy() {
    try { await navigator.clipboard.writeText(url); copied = true; setTimeout(() => (copied = false), 2200); } catch { window.prompt('Copy this link', url); }
  }
  const nativeShare = () => navigator.share?.({ title, text, url }).catch(() => {});
  const ICON = {
    x: 'M17.7 3H21l-7.2 8.2L22.3 21h-6.6l-5.2-6.8L4.5 21H1.2l7.7-8.8L.8 3h6.8l4.7 6.2zm-1.2 16h1.8L6.6 4.9H4.7z',
    facebook: 'M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.6C11.3 2 10 3.6 10 6.1V8H8v3h2v11h4V11h2.7l.4-3z',
    whatsapp: 'M12 2a10 10 0 0 0-8.6 15l-1.4 5 5.2-1.4A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.3-.3.6-.3.7-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z',
    email: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4 7.3V17h16V7.3z',
  };
</script>

<div class={`share ${tone}`} class:compact role="group" aria-label="Share">
  <button type="button" class="s-btn copy" onclick={copy} aria-live="polite">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
    <span>{copied ? 'Link copied' : 'Copy link'}</span>
  </button>
  <a class="s-btn" href={links.x} target="_blank" rel="noopener" aria-label="Share on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON.x} /></svg></a>
  <a class="s-btn" href={links.facebook} target="_blank" rel="noopener" aria-label="Share on Facebook"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON.facebook} /></svg></a>
  <a class="s-btn" href={links.whatsapp} target="_blank" rel="noopener" aria-label="Share on WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON.whatsapp} /></svg></a>
  <a class="s-btn" href={links.email} aria-label="Share by email"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON.email} /></svg></a>
  {#if native}
    <button type="button" class="s-btn" onclick={nativeShare} aria-label="More ways to share">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg>
    </button>
  {/if}
</div>

<style>
  .share { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .s-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; min-width: 2.5rem; height: 2.5rem; padding: 0 0.65rem; border-radius: 9999px;
    font: 700 0.9rem/1 'Big Shoulders Display', 'Shoulders Fallback', system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; transition: background 0.2s, color 0.2s, transform 0.2s; }
  .s-btn svg { width: 1.05rem; height: 1.05rem; }
  .s-btn:hover { transform: translateY(-1px); }
  .s-btn:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  .light .s-btn { color: var(--radio-ink); box-shadow: inset 0 0 0 1px var(--radio-line); background: var(--radio-paper); }
  .light .s-btn:hover { color: var(--radio-amber); box-shadow: inset 0 0 0 1.5px var(--radio-amber); }
  .dark .s-btn { color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .dark .s-btn:hover { color: var(--radio-amber); background: var(--radio-walnut-deep); }
  .compact .s-btn { height: 2.25rem; min-width: 2.25rem; }
  @media (prefers-reduced-motion: reduce) { .s-btn, .s-btn:hover { transition: none; transform: none; } }
</style>
