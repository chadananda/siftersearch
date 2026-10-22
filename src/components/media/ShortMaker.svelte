<script>
  // MAKE A SHORT (moment and clip pages): render a vertical video of this excerpt with the media pipeline's short
  // renderer, show it inline, and hand it to the visitor's apps — Web Share with the file on phones (YouTube, Instagram,
  // TikTok, WhatsApp), Download elsewhere — with the post text (link back to the full talk) and .srt captions.
  // API (media agent): GET /api/media/shorts/templates · POST /api/media/shorts { slug, start_ms, end_ms, template } →
  // { id } · GET /api/media/shorts/:id → { status: queued|rendering|done|error, progress, url, srt_url, poster, error }.
  // Hidden entirely until the templates endpoint answers.
  import { onMount } from 'svelte';
  import { media } from '../../lib/api.js';
  import { shortPostText } from '../../lib/share.js';

  let { slug, startMs, endMs, text = '', speaker = '', title = '', year = null, talkUrl = '', pageUrl = '' } = $props();
  let templates = $state([]), open = $state(false), template = $state(null);
  let job = $state(null), status = $state(''), progress = $state(0), video = $state(null), error = $state('');
  let canShareFiles = $state(false), copied = $state(false), sharing = $state(false);
  const post = $derived(shortPostText({ text, speaker, title, year, talkUrl }));
  const api = (p) => media.href(`/api/media/shorts${p}`);

  onMount(async () => {
    try {
      const r = await fetch(api('/templates'), { headers: { Accept: 'application/json' } });
      if (r.ok) { const d = await r.json(); templates = d.templates || d || []; template = templates[0]?.id ?? null; }
    } catch { /* not available: the button stays hidden */ }
    try { canShareFiles = !!navigator.canShare?.({ files: [new File([new Blob()], 'x.mp4', { type: 'video/mp4' })] }); } catch { canShareFiles = false; }
  });

  async function render() {
    error = ''; video = null; progress = 0; status = 'queued';
    try {
      const r = await fetch(api(''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, start_ms: startMs, end_ms: endMs, template }) });
      if (!r.ok) throw new Error(`could not start (${r.status})`);
      job = (await r.json()).id;
      for (let i = 0; i < 240; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const s = await (await fetch(api(`/${encodeURIComponent(job)}`))).json();
        status = s.status; progress = Number(s.progress) || progress;
        if (s.status === 'done') { video = s; return; }
        if (s.status === 'error') throw new Error(s.error || 'the render failed');
      }
      throw new Error('the render is taking too long — try again in a minute');
    } catch (e) { error = e.message; status = ''; }
  }

  async function shareVideo() {
    sharing = true;
    try {
      const blob = await (await fetch(media.href(video.url))).blob();
      const file = new File([blob], `${slug}-${Math.round(startMs / 1000)}s.mp4`, { type: 'video/mp4' });
      await navigator.share({ files: [file], text: post, url: talkUrl });
    } catch { /* cancelled */ } finally { sharing = false; }
  }
  async function copyPost() { try { await navigator.clipboard.writeText(post); copied = true; setTimeout(() => (copied = false), 2200); } catch { window.prompt('Copy the post text', post); } }
</script>

{#if templates.length}
  <section class="short mt-6" aria-label="Make a video short">
    {#if !open}
      <button type="button" class="make" onclick={() => (open = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="m10.5 9 4 3-4 3z" fill="currentColor"/></svg>
        Make a short — a vertical video of this excerpt to post
      </button>
    {:else}
      <div class="panel">
        <p class="font-dial text-sm font-bold uppercase tracking-[0.22em] text-radio-brass-bright">Make a short</p>
        <div class="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
          {#each templates as t (t.id)}
            <button type="button" role="radio" aria-checked={template === t.id} class="tpl" class:on={template === t.id} onclick={() => (template = t.id)}>
              {#if t.preview}<img src={media.href(t.preview)} alt="" width="54" height="96" loading="lazy" />{/if}<span>{t.name || t.id}</span>
            </button>
          {/each}
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="go" onclick={render} disabled={!!status && status !== 'done'}>{video ? 'Render again' : 'Render the video'}</button>
          {#if status && status !== 'done'}
            <span class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)} aria-label="Rendering"><i style={`transform:scaleX(${Math.max(0.04, progress)})`}></i></span>
            <span class="text-sm text-radio-on-dark opacity-80" aria-live="polite">{status === 'queued' ? 'Waiting for the studio…' : `Rendering… ${Math.round(progress * 100)}%`}</span>
          {/if}
        </div>
        {#if error}<p class="mt-3 text-sm font-semibold text-radio-amber" role="alert">{error}</p>{/if}
        {#if video}
          <div class="mt-5 grid gap-5 sm:grid-cols-[auto_1fr]">
            <!-- svelte-ignore a11y_media_has_caption — captions are offered as .srt; the words are on the page above -->
            <video class="vid" src={media.href(video.url)} poster={video.poster ? media.href(video.poster) : undefined} controls playsinline preload="metadata"></video>
            <div class="flex flex-col gap-3">
              {#if canShareFiles}
                <button type="button" class="go" onclick={shareVideo} disabled={sharing}>{sharing ? 'Opening…' : 'Share video — YouTube, Instagram, TikTok, WhatsApp…'}</button>
              {/if}
              <a class="go alt" href={media.href(video.url)} download={`${slug}-${Math.round(startMs / 1000)}s.mp4`}>Download the video (MP4)</a>
              <button type="button" class="go alt" onclick={copyPost}>{copied ? 'Post text copied' : 'Copy post text (with the link to the full talk)'}</button>
              {#if video.srt_url}<a class="go alt" href={media.href(video.srt_url)} download={`${slug}-${Math.round(startMs / 1000)}s.srt`}>Download captions (.srt) for YouTube</a>{/if}
              <details class="tips">
                <summary>How to post it</summary>
                <p><strong>YouTube Shorts:</strong> in the YouTube app, + → Short → upload this video (under 3 minutes, vertical). Paste the post text in the description; add the .srt under Subtitles in YouTube Studio.</p>
                <p><strong>Instagram Reels:</strong> + → Reel → choose the video; paste the post text as the caption (links are not clickable in captions — put the talk link in your bio or a story).</p>
                <p><strong>TikTok:</strong> + → Upload → the video; paste the post text as the caption.</p>
                <p>Every post carries the link back to <a href={talkUrl}>the full talk at this moment</a>{pageUrl ? ' and this page' : ''}.</p>
              </details>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .make, .go { display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem; min-height: 2.75rem; padding: 0.5rem 1.1rem; border-radius: 9999px; font-weight: 600; text-align: center; }
  .make { color: var(--radio-on-dark); box-shadow: inset 0 0 0 1.5px var(--radio-brass); }
  .make svg { width: 1.2rem; height: 1.2rem; }
  .make:hover { color: var(--radio-amber); background: var(--radio-walnut-deep); }
  .panel { padding: 1.1rem 1.2rem; border-radius: 1rem; background: var(--radio-walnut-deep); color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--radio-brass) 45%, transparent); }
  .tpl { display: inline-flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 0.45rem; border-radius: 0.7rem; font-size: 0.85rem; color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .tpl img { border-radius: 0.4rem; object-fit: cover; }
  .tpl.on { box-shadow: inset 0 0 0 2px var(--radio-amber), 0 0 0 4px var(--radio-glow); }
  .go { background: var(--radio-amber); color: var(--radio-walnut-deep); }
  .go:disabled { opacity: 0.6; }
  .go.alt { background: transparent; color: var(--radio-on-dark); box-shadow: inset 0 0 0 1px var(--radio-brass); }
  .go.alt:hover { color: var(--radio-amber); }
  .prog { position: relative; width: 10rem; height: 0.5rem; border-radius: 9999px; overflow: hidden; background: color-mix(in srgb, var(--radio-on-dark) 18%, transparent); }
  .prog i { position: absolute; inset: 0; background: var(--radio-amber); transform-origin: left; transition: transform 0.4s; }
  .vid { width: min(15rem, 100%); aspect-ratio: 9 / 16; border-radius: 0.9rem; background: #000; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
  .tips summary { cursor: pointer; font-weight: 600; text-decoration: underline; text-decoration-color: var(--radio-brass); text-underline-offset: 3px; }
  .tips p { margin-top: 0.5rem; font-size: 0.9rem; line-height: 1.5; opacity: 0.9; }
  .tips a { text-decoration: underline; text-decoration-color: var(--radio-brass); }
  .make:focus-visible, .go:focus-visible, .tpl:focus-visible, .tips summary:focus-visible, .tips a:focus-visible { outline: 3px solid var(--radio-amber); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .prog i { transition: none; } }
</style>
