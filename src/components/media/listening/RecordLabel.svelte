<script>
  // A speaker's round label: their portrait (face-centred square through the image service, never a 16:9 crop) or, when
  // there is none, a generated record label — initials over an era-tinted pattern hashed from the name (never a grey tile).
  import { portraitSquare, labelPattern, initials, eraVar } from '../../../lib/media-listing.js';

  let { name = '', photo = null, year = null, size = 96, eager = false, alt = '' } = $props();
  const pic = $derived(photo ? portraitSquare(photo, size) : null);
  const pat = $derived(labelPattern(name));
  const tint = $derived(eraVar(year));
  const uid = $derived(`rl-${pat.rot}-${pat.rays}-${size}`);
</script>

{#if pic}
  <img src={pic.src} srcset={pic.srcset} width={size} height={size} {alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
    fetchpriority={eager ? 'high' : 'auto'} class="block h-full w-full rounded-full object-cover" />
{:else}
  <svg viewBox="0 0 100 100" class="block h-full w-full" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : 'true'}>
    <defs>
      <radialGradient id={`${uid}-g`} cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color={tint} stop-opacity="0.75" />
        <stop offset="100%" stop-color={tint} stop-opacity="1" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill={`url(#${uid}-g)`} />
    <g transform={`rotate(${pat.rot} 50 50)`} stroke="var(--radio-on-dark)" fill="none" opacity="0.28">
      {#if pat.style === 'sunburst'}
        {#each Array(pat.rays) as _, i}
          <line x1="50" y1="50" x2={50 + 50 * Math.cos((i / pat.rays) * Math.PI * 2)} y2={50 + 50 * Math.sin((i / pat.rays) * Math.PI * 2)} stroke-width="0.8" />
        {/each}
      {:else if pat.style === 'rings'}
        {#each Array(pat.rings + 4) as _, i}
          <circle cx="50" cy="50" r={22 + i * pat.gap * 1.6} stroke-width="0.7" />
        {/each}
      {:else}
        {#each Array(7) as _, i}
          <polyline points={`0,${18 + i * 11} 25,${12 + i * 11} 50,${18 + i * 11} 75,${12 + i * 11} 100,${18 + i * 11}`} stroke-width="0.9" />
        {/each}
      {/if}
    </g>
    <circle cx="50" cy="50" r="27" fill="var(--radio-paper)" opacity="0.92" />
    <circle cx="50" cy="50" r="27" fill="none" stroke={tint} stroke-width="1.2" />
    <text x="50" y="51" text-anchor="middle" dominant-baseline="middle" font-family="Gloock, Georgia, serif" font-size="22" fill={tint}>{initials(name)}</text>
    <circle cx="50" cy="50" r="2.2" fill="var(--radio-groove)" opacity="0.6" />
  </svg>
{/if}
