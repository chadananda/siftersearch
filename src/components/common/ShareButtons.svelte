<script>
  // Reusable share buttons.
  // Props:
  //   url         — canonical share URL (required)
  //   title       — pre-filled tweet/post title
  //   description — longer text for email/WhatsApp body
  //   quote       — optional highlighted quote text (for per-quote sharing)
  //   compact     — true → icon-only row (for per-quote use)
  //   dropdown    — true → single share button that opens a dropdown menu
  //   subreddits  — array of subreddits to offer

  let {
    url = '',
    title = 'SifterSearch Deep Research',
    description = '',
    quote = '',
    compact = false,
    dropdown = false,
    subreddits = ['r/religion', 'r/spirituality', 'r/philosophy', 'r/bahai', 'r/islam', 'r/Christianity', 'r/Judaism', 'r/Buddhism'],
  } = $props();

  let copied = $state(false);
  let showReddit = $state(false);
  let showMenu = $state(false);

  const enc = encodeURIComponent;
  const shareText = quote
    ? `"${quote.slice(0, 200)}" — via SifterSearch`
    : (description ? description.slice(0, 200) : title);

  const links = {
    twitter: `https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(shareText)}`,
    whatsapp: `https://wa.me/?text=${enc(shareText + ' ' + url)}`,
    email: `mailto:?subject=${enc(title)}&body=${enc(shareText + '\n\n' + url)}`,
  };

  function redditUrl(sub) {
    return `https://reddit.com/r/${sub.replace(/^r\//, '')}/submit?url=${enc(url)}&title=${enc(title)}`;
  }

  async function copyLink() {
    const text = quote ? `${shareText}\n${url}` : url;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {}
  }

  function openShare(href) {
    window.open(href, '_blank', 'width=600,height=480,noopener');
  }
</script>

{#if dropdown}
  <!-- Single share button → dropdown menu -->
  <div class="share-dropdown-wrapper">
    <button class="share-toggle" onclick={() => (showMenu = !showMenu)} title="Share" aria-label="Share" aria-expanded={showMenu}>
      <!-- Classic share icon: connected dots -->
      <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
      <span>Share</span>
    </button>
    {#if showMenu}
      <div class="share-menu">
        <button class="menu-item copy-item" onclick={() => { copyLink(); showMenu = false; }}>
          {#if copied}
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            <span>Copied!</span>
          {:else}
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
            <span>Copy link</span>
          {/if}
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" onclick={() => { openShare(links.twitter); showMenu = false; }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>X / Twitter</span>
        </button>
        <button class="menu-item" onclick={() => { openShare(links.facebook); showMenu = false; }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>Facebook</span>
        </button>
        <button class="menu-item" onclick={() => { openShare(links.whatsapp); showMenu = false; }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span>WhatsApp</span>
        </button>
        <div class="menu-divider"></div>
        <div class="menu-section-label">Reddit</div>
        {#each subreddits.slice(0, 5) as sub}
          <a href={redditUrl(sub)} target="_blank" rel="noopener" class="menu-item" onclick={() => (showMenu = false)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
            <span>{sub}</span>
          </a>
        {/each}
        <div class="menu-divider"></div>
        <a href={links.email} class="menu-item" onclick={() => (showMenu = false)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          <span>Email</span>
        </a>
      </div>
    {/if}
  </div>
{:else}
  <!-- Horizontal row: full button set -->
  <div class="share-row" class:compact>
    {#if !compact}
      <span class="share-label">Share</span>
    {/if}

    <button class="share-btn copy-btn" onclick={copyLink} title="Copy link" aria-label="Copy link">
      {#if copied}
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        {#if !compact}<span>Copied!</span>{/if}
      {:else}
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
        {#if !compact}<span>Copy link</span>{/if}
      {/if}
    </button>

    <button class="share-btn twitter-btn" onclick={() => openShare(links.twitter)} title="Share on X" aria-label="Share on X">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      {#if !compact}<span>X</span>{/if}
    </button>

    <button class="share-btn facebook-btn" onclick={() => openShare(links.facebook)} title="Share on Facebook" aria-label="Share on Facebook">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      {#if !compact}<span>Facebook</span>{/if}
    </button>

    <button class="share-btn whatsapp-btn" onclick={() => openShare(links.whatsapp)} title="Share on WhatsApp" aria-label="Share on WhatsApp">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      {#if !compact}<span>WhatsApp</span>{/if}
    </button>

    <div class="reddit-wrapper">
      <button class="share-btn reddit-btn" onclick={() => (showReddit = !showReddit)} title="Share on Reddit" aria-label="Share on Reddit">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
        {#if !compact}<span>Reddit</span>{/if}
      </button>
      {#if showReddit}
        <div class="reddit-popover">
          {#each subreddits as sub}
            <a href={redditUrl(sub)} target="_blank" rel="noopener" class="reddit-sub">{sub}</a>
          {/each}
        </div>
      {/if}
    </div>

    <a href={links.email} class="share-btn email-btn" title="Share via Email" aria-label="Share via Email">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
      {#if !compact}<span>Email</span>{/if}
    </a>
  </div>
{/if}

<style>
  /* Dropdown mode: single share button */
  .share-dropdown-wrapper { position: relative; display: inline-block; }
  .share-toggle { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.55rem; border-radius: 5px; font-size: 0.72rem; font-weight: 500; cursor: pointer; border: 1px solid var(--border-subtle); background: var(--surface-0); color: var(--text-muted); transition: background 0.12s, color 0.12s, border-color 0.12s; white-space: nowrap; }
  .share-toggle:hover { background: var(--surface-2); color: var(--text-primary); border-color: var(--border); }
  .share-menu { position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 200; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 0.35rem; display: flex; flex-direction: column; gap: 0.1rem; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
  .menu-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.6rem; border-radius: 4px; font-size: 0.78rem; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background 0.1s, color 0.1s; }
  .menu-item:hover { background: var(--surface-3); color: var(--text-primary); }
  .copy-item:hover { color: var(--success); }
  .menu-divider { height: 1px; background: var(--border-subtle); margin: 0.2rem 0.4rem; }
  .menu-section-label { font-size: 0.63rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 0.2rem 0.6rem 0; }

  /* Horizontal row */
  .share-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .share-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-right: 0.25rem; }
  .share-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 500; cursor: pointer; border: 1px solid var(--border-subtle); background: var(--surface-1); color: var(--text-secondary); transition: background 0.15s, color 0.15s, border-color 0.15s; text-decoration: none; white-space: nowrap; }
  .share-btn:hover { background: var(--surface-2); color: var(--text-primary); border-color: var(--border); }
  .compact .share-btn { padding: 0.25rem 0.4rem; }
  .copy-btn:hover { color: var(--success); border-color: var(--success); }
  .twitter-btn:hover { color: #000; background: #e7e7e7; }
  .facebook-btn:hover { color: #1877f2; border-color: #1877f2; }
  .whatsapp-btn:hover { color: #25d366; border-color: #25d366; }
  .reddit-btn:hover { color: #ff4500; border-color: #ff4500; }
  .reddit-wrapper { position: relative; }
  .reddit-popover { position: absolute; top: calc(100% + 6px); left: 0; z-index: 200; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
  .reddit-sub { padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; color: var(--text-secondary); text-decoration: none; transition: background 0.1s; }
  .reddit-sub:hover { background: var(--surface-3); color: #ff4500; }
</style>
